"""ADB 直连执行引擎 - 跳过 Appium，直接通过 adb shell 执行操作

性能优势：
- 无需 Appium Driver 初始化（省去 10-30s）
- 直接 ADB 命令（50-100ms vs Appium HTTP 200-500ms）
- uiautomator dump 获取 UI 层级用于元素定位
"""
import asyncio
import json
import os
import re
import shutil
import tempfile
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import List, Dict, Optional, Tuple


class ADBExecutor:
    """ADB 直连执行器：基于 uiautomator dump + adb shell input"""

    def __init__(self, device_id: str = None, adb_path: str = None):
        self.device_id = device_id
        self.adb = adb_path or shutil.which("adb") or "adb"
        self._dump_cache = None
        self._dump_cache_time = 0
        self.DUMP_CACHE_TTL = 2  # 秒：UI dump 缓存有效期

    def _adb_cmd(self) -> List[str]:
        """构建 adb 命令前缀"""
        cmd = [self.adb]
        if self.device_id:
            cmd.extend(["-s", self.device_id])
        return cmd

    async def _run(self, args: List[str], timeout: int = 15) -> Tuple[str, int]:
        """异步执行命令，返回 (stdout, returncode)"""
        cmd = self._adb_cmd() + args
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
            return stdout.decode("utf-8", errors="replace").strip(), proc.returncode
        except asyncio.TimeoutError:
            proc.kill()
            return "命令超时", -1

    # ============ UI 层级解析 ============

    async def dump_ui(self, force: bool = False) -> Optional[ET.Element]:
        """获取当前页面的 UI 层级树 (uiautomator dump)"""
        now = datetime.now().timestamp()
        if not force and self._dump_cache and (now - self._dump_cache_time) < self.DUMP_CACHE_TTL:
            return self._dump_cache

        # dump 到设备临时文件
        remote_path = "/sdcard/window_dump.xml"
        output, rc = await self._run(["shell", "uiautomator", "dump", remote_path])
        if rc != 0:
            return None

        # 拉取到本地
        with tempfile.NamedTemporaryFile(suffix=".xml", delete=False) as tmp:
            local_path = tmp.name

        try:
            output, rc = await self._run(["pull", remote_path, local_path])
            if rc != 0:
                return None

            # XML 解析（标准库 XMLParser 默认不解析外部实体）
            tree = ET.parse(local_path)
            root = tree.getroot()
            self._dump_cache = root
            self._dump_cache_time = datetime.now().timestamp()
            return root
        except Exception:
            return None
        finally:
            try:
                os.unlink(local_path)
            except Exception:
                pass

    def find_element(self, root: ET.Element, locator_type: str, locator_value: str) -> Optional[Dict]:
        """在 UI 树中查找元素，返回 {bounds, text, resource_id, ...}"""
        if root is None:
            return None

        for node in root.iter("node"):
            matched = False
            if locator_type == "id":
                # resource-id 匹配（可能带包名前缀）
                rid = node.get("resource-id", "")
                matched = (rid == locator_value or rid.endswith("/" + locator_value.split("/")[-1]))
            elif locator_type == "text":
                matched = (node.get("text", "") == locator_value)
            elif locator_type == "accessibility_id":
                matched = (node.get("content-desc", "") == locator_value)
            elif locator_type == "xpath":
                # XPath 支持有限，尝试 class + text 组合
                pass  # 暂不支持完整 XPath

            if matched:
                bounds = self._parse_bounds(node.get("bounds", ""))
                if bounds:
                    return {
                        "bounds": bounds,
                        "center": ((bounds[0] + bounds[2]) // 2, (bounds[1] + bounds[3]) // 2),
                        "text": node.get("text", ""),
                        "resource_id": node.get("resource-id", ""),
                        "class": node.get("class", ""),
                        "clickable": node.get("clickable", "false") == "true",
                    }
        return None

    def find_element_multi(self, root: ET.Element, locators: List[dict]) -> Optional[Dict]:
        """多定位器 fallback 查找"""
        for loc in locators:
            lt, lv = loc["type"], loc["value"]
            if lt == "coordinate":
                # 坐标直接返回
                try:
                    center = _parse_coordinate_value(lv)
                    return {"center": center, "bounds": None, "text": "", "source": "coordinate"}
                except ValueError:
                    continue
            result = self.find_element(root, lt, lv)
            if result:
                return result
        return None

    @staticmethod
    def _parse_bounds(bounds_str: str) -> Optional[Tuple[int, int, int, int]]:
        """解析 bounds 字符串 "[0,100][1080,200]" → (0, 100, 1080, 200)"""
        m = re.findall(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', bounds_str)
        if m:
            return int(m[0][0]), int(m[0][1]), int(m[0][2]), int(m[0][3])
        return None

    # ============ 操作执行 ============

    async def tap(self, x: int, y: int) -> Tuple[str, int]:
        """点击坐标"""
        return await self._run(["shell", "input", "tap", str(x), str(y)])

    async def long_press(self, x: int, y: int, duration_ms: int = 2000) -> Tuple[str, int]:
        """长按"""
        return await self._run(["shell", "input", "swipe", str(x), str(y), str(x), str(y), str(duration_ms)])

    async def swipe(self, direction: str = "up", distance: float = 0.5) -> Tuple[str, int]:
        """滑动"""
        # 获取屏幕尺寸
        output, _ = await self._run(["shell", "wm", "size"])
        m = re.search(r'(\d+)x(\d+)', output)
        if not m:
            return "无法获取屏幕尺寸", -1
        w, h = int(m.group(1)), int(m.group(2))

        cx, cy = w // 2, h // 2
        d = int(min(w, h) * distance)

        if direction == "up":
            x1, y1, x2, y2 = cx, int(h * 0.7), cx, int(h * 0.7) - d
        elif direction == "down":
            x1, y1, x2, y2 = cx, int(h * 0.3), cx, int(h * 0.3) + d
        elif direction == "left":
            x1, y1, x2, y2 = int(w * 0.7), cy, int(w * 0.7) - d, cy
        elif direction == "right":
            x1, y1, x2, y2 = int(w * 0.3), cy, int(w * 0.3) + d, cy
        else:
            return f"未知方向: {direction}", -1

        return await self._run(["shell", "input", "swipe", str(x1), str(y1), str(x2), str(y2), "300"])

    async def input_text(self, text: str) -> Tuple[str, int]:
        """输入文本（ADB 不支持中文，中文用 ADBKeyboard 或 broadcast）"""
        # 检查是否包含非 ASCII 字符
        if any(ord(c) > 127 for c in text):
            # 使用 am broadcast 方式输入中文
            return await self._run([
                "shell", "am", "broadcast",
                "-a", "ADB_INPUT_TEXT",
                "--es", "msg", text,
            ])
        else:
            # 转义空格和特殊字符
            escaped = text.replace(" ", "%s").replace("&", "\\&")
            return await self._run(["shell", "input", "text", escaped])

    async def clear_text(self) -> Tuple[str, int]:
        """清空当前输入框"""
        return await self._run(["shell", "input", "keyevent", "KEYCODE_MOVE_END",
                                "&&", "shell", "input", "keyevent", "--longpress",
                                "KEYCODE_DEL"])

    async def back(self) -> Tuple[str, int]:
        """返回"""
        return await self._run(["shell", "input", "keyevent", "KEYCODE_BACK"])

    async def screenshot(self, local_path: str) -> Tuple[str, int]:
        """截图"""
        remote = "/sdcard/screen.png"
        await self._run(["shell", "screencap", "-p", remote])
        return await self._run(["pull", remote, local_path])

    async def get_current_app(self) -> Tuple[str, str]:
        """获取当前前台 App 的包名和 Activity"""
        output, _ = await self._run(["shell", "dumpsys", "window", "windows"])
        for line in output.split("\n"):
            if "mCurrentFocus" in line:
                m = re.search(r'([a-zA-Z][\w.]*)/([a-zA-Z][\w.$]*)', line)
                if m:
                    return m.group(1), m.group(2)
        return "", ""

    async def start_app(self, package: str, activity: str) -> Tuple[str, int]:
        """启动应用"""
        return await self._run([
            "shell", "am", "start", "-n", f"{package}/{activity}",
            "-W",  # 等待启动完成
        ])


# ============ 批量步骤执行器 ============

async def run_steps_via_adb(
    steps: List[dict],
    element_map: Dict[int, dict],
    websocket,
    device_id: str = None,
) -> dict:
    """
    通过 ADB 直连执行步骤列表（不经过 Appium）

    steps: [{"action_type": "tap", "target_element_id": 1, "params": {}}, ...]
    element_map: {1: {"name": "按钮", "locators": [{"type": "text", "value": "登录"}]}}
    """
    adb = ADBExecutor(device_id=device_id)
    result = {"passed": 0, "failed": 0, "error": 0, "duration": 0, "logs": []}
    start_time = datetime.now()

    async def log(level: str, msg: str):
        result["logs"].append(msg)
        try:
            await websocket.send_json({"level": level, "message": msg, "ts": datetime.now().isoformat()})
        except Exception:
            pass

    await log("system", "⚡ ADB 直连模式 - 跳过 Appium，直接执行")
    await log("system", f"📱 设备: {device_id or '默认设备'}")
    await log("system", "─" * 50)

    # 预检查：验证所有元素都存在
    needs_element_actions = ["tap", "long_press", "swipe", "input_text", "clear_input", "assert_exists", "assert_text"]
    missing = []
    for i, step in enumerate(steps):
        action = step["action_type"]
        if action not in needs_element_actions:
            continue
        el_id = step.get("target_element_id")
        if not el_id or el_id not in element_map:
            missing.append((i + 1, action, el_id))
    if missing:
        for idx, act, eid in missing:
            await log("error", f"❌ Step {idx}: {act} — 元素ID={eid} 已删除或不存在，请先在编排中补充完整")
        await log("error", f"\n⛔ 执行中止: {len(missing)} 个步骤缺少元素，请修复后重试")
        # 发送 done 信号让前端断开
        try:
            await websocket.send_json({"level": "done", "message": json.dumps({
                "return_code": 1,
                "passed": 0,
                "failed": len(missing),
                "error": 0,
                "duration": 0,
            })})
        except Exception:
            pass
        return {"passed": 0, "failed": len(missing), "error": 0, "duration": 0, "return_code": 1}

    for i, step in enumerate(steps):
        action = step["action_type"]
        params = step.get("params", {})
        el_id = step.get("target_element_id")
        el_data = element_map.get(el_id) if el_id else None
        el_name = el_data.get("name", "未命名") if el_data else "无元素"

        await log("info", f"\n▶ Step {i + 1}: {action} [{el_name}]")

        try:
            if action == "tap":
                coord = await _resolve_element(adb, el_data)
                if coord:
                    x, y = coord
                    output, rc = await adb.tap(x, y)
                    await log("success" if rc == 0 else "error",
                              f"  点击 ({x}, {y}) {'✓' if rc == 0 else '✗'}")
                else:
                    await log("error", f"  ❌ 找不到元素 [{el_name}]")
                    result["failed"] += 1
                    continue

            elif action == "long_press":
                coord = await _resolve_element(adb, el_data)
                if coord:
                    x, y = coord
                    duration = int(params.get("duration", 2) * 1000)
                    output, rc = await adb.long_press(x, y, duration)
                    await log("success" if rc == 0 else "error",
                              f"  长按 ({x}, {y}) {duration}ms")
                else:
                    await log("error", f"  ❌ 找不到元素 [{el_name}]")
                    result["failed"] += 1
                    continue

            elif action == "swipe":
                direction = params.get("direction", "up")
                distance = params.get("distance", 0.5)
                output, rc = await adb.swipe(direction, distance)
                await log("success" if rc == 0 else "error",
                          f"  滑动 {direction} (距离 {distance})")

            elif action == "input_text":
                # 先点击输入框
                coord = await _resolve_element(adb, el_data)
                if coord:
                    x, y = coord
                    await adb.tap(x, y)
                    await asyncio.sleep(0.3)  # 等输入法弹出

                text = params.get("text", "")
                output, rc = await adb.input_text(text)
                await log("success" if rc == 0 else "error",
                          f"  输入: \"{text}\"")

            elif action == "clear_input":
                output, rc = await adb.clear_text()
                await log("success" if rc == 0 else "error", "  清空输入")

            elif action == "assert_exists":
                root = await adb.dump_ui(force=True)
                if el_data:
                    found = adb.find_element_multi(root, el_data.get("locators", []))
                    if found:
                        await log("success", f"  ✓ 元素存在 [{el_name}]")
                    else:
                        await log("error", f"  ✗ 元素不存在 [{el_name}]")
                        result["failed"] += 1
                        continue

            elif action == "assert_text":
                expected = params.get("text", params.get("expected_value", ""))
                root = await adb.dump_ui(force=True)
                # 在整个 UI 树中搜索文本
                found_text = False
                if root:
                    for node in root.iter("node"):
                        if expected in node.get("text", ""):
                            found_text = True
                            break
                if found_text:
                    await log("success", f"  ✓ 找到文本: \"{expected}\"")
                else:
                    await log("error", f"  ✗ 未找到文本: \"{expected}\"")
                    result["failed"] += 1
                    continue

            elif action == "wait":
                timeout = params.get("timeout", 3)
                await asyncio.sleep(timeout)
                await log("info", f"  等待 {timeout}s")

            elif action == "screenshot":
                path = os.path.join(tempfile.gettempdir(), f"step_{i + 1}.png")
                await adb.screenshot(path)
                await log("info", f"  📷 截图: {path}")

            elif action == "back":
                output, rc = await adb.back()
                await log("success" if rc == 0 else "error", "  ← 返回")

            else:
                await log("warning", f"  ⚠️ 不支持的操作: {action}")

            result["passed"] += 1

        except Exception as e:
            await log("error", f"  ❌ 异常: {str(e)}")
            result["error"] += 1

        # 步骤间隔
        await asyncio.sleep(0.3)

    result["duration"] = (datetime.now() - start_time).total_seconds()

    await log("system", "─" * 50)
    total = result["passed"] + result["failed"] + result["error"]
    if result["failed"] == 0 and result["error"] == 0:
        await log("success",
                  f"✅ 全部通过 | {result['passed']}/{total} | 耗时: {result['duration']:.1f}s")
    else:
        await log("error",
                  f"❌ 通过: {result['passed']} | 失败: {result['failed']} | "
                  f"错误: {result['error']} | 耗时: {result['duration']:.1f}s")

    # 发送 done 状态
    try:
        await websocket.send_json({"level": "done", "message": json.dumps({
            "return_code": 0 if result["failed"] == 0 and result["error"] == 0 else 1,
            "passed": result["passed"],
            "failed": result["failed"],
            "error": result["error"],
            "duration": result["duration"],
        })})
    except Exception:
        pass

    return result


def _parse_coordinate_value(val) -> Tuple[int, int]:
    """解析坐标值，支持多种格式：
    - '(972, 2196)' — Python 元组字符串
    - '[972, 2196]' — JSON 数组
    - (972, 2196) — 元组/列表
    """
    if isinstance(val, (list, tuple)):
        return int(val[0]), int(val[1])
    if isinstance(val, str):
        # 尝试 JSON 解析
        try:
            coords = json.loads(val)
            return int(coords[0]), int(coords[1])
        except (json.JSONDecodeError, ValueError):
            pass
        # 尝试解析 Python 元组字符串 "(972, 2196)"
        m = re.search(r'\(?\s*(\d+)\s*,\s*(\d+)\s*\)?', val)
        if m:
            return int(m.group(1)), int(m.group(2))
    raise ValueError(f"无法解析坐标: {val}")


async def _resolve_element(adb: ADBExecutor, el_data: Optional[dict]) -> Optional[Tuple[int, int]]:
    """解析元素坐标"""
    if not el_data:
        return None

    locators = el_data.get("locators", [])

    # 检查是否有坐标定位
    for loc in locators:
        if loc["type"] == "coordinate":
            try:
                return _parse_coordinate_value(loc["value"])
            except ValueError:
                continue

    # 通过 uiautomator dump 查找
    root = await adb.dump_ui()
    if root:
        found = adb.find_element_multi(root, locators)
        if found and "center" in found:
            return found["center"]

    return None
