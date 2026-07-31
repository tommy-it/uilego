"""pytest 脚本执行器 - 在临时目录运行 pytest 并实时输出"""
import os
import sys
import subprocess
import tempfile
import shutil
import asyncio
import json
import re
from typing import List, Dict, Optional, Tuple
from datetime import datetime


class ExecutionResult:
    def __init__(self):
        self.return_code: Optional[int] = None
        self.passed: int = 0
        self.failed: int = 0
        self.error: int = 0
        self.duration: float = 0
        self.logs: List[str] = []


# ============ 错误分类映射表 ============
# key: 错误关键字/正则  value: (错误类别, 友好提示, 解决建议)
ERROR_PATTERNS: List[Tuple[str, str, str, str]] = [
    # (匹配关键字, 错误类别, 友好提示, 解决建议)
    (
        "NoSuchElementError",
        "element_not_found",
        "找不到页面元素",
        "请检查：1) 元素定位器是否正确  2) 页面是否已加载完成  3) 元素的 resource-id 或文本是否变化",
    ),
    (
        "NoSuchElementException",
        "element_not_found",
        "找不到页面元素",
        "元素在当前页面不存在或定位方式有误，请在「元素管理」中检查定位器",
    ),
    (
        "TimeoutException",
        "timeout",
        "等待元素超时",
        "元素加载过慢，可尝试：1) 增加等待时间  2) 在步骤前加「等待」操作  3) 检查页面跳转是否完成",
    ),
    (
        "Could not proxy",
        "device_disconnected",
        "设备连接已断开",
        "请检查：1) USB 线是否连接  2) 模拟器是否运行  3) 运行 adb devices 确认设备在线",
    ),
    (
        "Could not find a connected Android device",
        "no_device",
        "未检测到 Android 设备",
        "请启动模拟器或连接真机，然后重试。模拟器：Android Studio → AVD Manager → 启动",
    ),
    (
        "Cannot start the",
        "app_not_found",
        "无法启动目标应用",
        "请检查项目运行配置中的应用包名（appPackage）和启动Activity是否正确",
    ),
    (
        "UiAutomator2 server",
        "appium_server",
        "Appium 服务异常",
        "Appium UiAutomator2 驱动异常，尝试：1) 重启 Appium 服务  2) 检查 Appium 版本兼容性",
    ),
    (
        "Connection refused",
        "connection_refused",
        "无法连接 Appium 服务",
        "Appium 服务未启动或地址错误。请检查：1) Appium 服务是否运行  2) 项目配置中的 Appium 地址是否正确",
    ),
    (
        "UnknownCommandError",
        "invalid_endpoint",
        "Appium 接口地址错误",
        "Appium 2.x 默认 base-path 是 /，如果是 1.x 版本需要改为 /wd/hub。请在项目运行配置中修改 Appium 地址",
    ),
    (
        "stale element reference",
        "stale_element",
        "元素引用已失效",
        "页面已刷新或跳转，之前获取的元素失效。建议：在操作前加「等待」，或重新定位元素",
    ),
    (
        "InvalidSelectorError",
        "invalid_locator",
        "定位器格式错误",
        "请检查 XPath 或其他定位器的语法是否正确。可用 Appium Inspector 验证",
    ),
    (
        "SecurityError",
        "permission_denied",
        "权限被拒绝",
        "应用可能需要授予权限。可在 Appium 配置中开启 autoGrantPermissions: true",
    ),
]


def _classify_error(logs: List[str]) -> List[Dict[str, str]]:
    """分析日志，提取错误分类和友好提示"""
    errors = []
    seen_categories = set()
    full_text = "\n".join(logs)

    for keyword, category, friendly_msg, suggestion in ERROR_PATTERNS:
        if keyword.lower() in full_text.lower() and category not in seen_categories:
            seen_categories.add(category)
            errors.append({
                "category": category,
                "message": friendly_msg,
                "suggestion": suggestion,
            })

    return errors


async def run_pytest_scripts(
    scripts: List[Dict[str, str]],
    websocket,
    extra_args: Optional[List[str]] = None,
) -> ExecutionResult:
    """
    将生成的脚本写入临时目录，执行 pytest，并通过 WebSocket 实时推送输出。

    scripts: [{"filename": "test_xxx.py", "content": "..."}]
    websocket: FastAPI WebSocket 连接
    """
    result = ExecutionResult()
    exec_dir = tempfile.mkdtemp(prefix="uiblock_run_")

    try:
        # 1. 写入脚本文件
        await _ws_send(websocket, "system", f"📁 执行目录: {exec_dir}")
        for script in scripts:
            filepath = os.path.join(exec_dir, script["filename"])
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(script["content"])
            await _ws_send(websocket, "system", f"📄 写入: {script['filename']}")

        # 2. 写入 pytest.ini 配置
        pytest_ini = os.path.join(exec_dir, "pytest.ini")
        with open(pytest_ini, "w") as f:
            f.write("[pytest]\n")
            f.write("addopts = -v --tb=short --color=no\n")
            f.write("python_files = test_*.py\n")

        # 3. 构建 pytest 命令
        cmd = [sys.executable, "-m", "pytest", exec_dir, "-v", "--tb=short", "--color=no"]
        if extra_args:
            cmd.extend(extra_args)

        await _ws_send(websocket, "system", f"🚀 执行命令: {' '.join(cmd)}")
        await _ws_send(websocket, "system", "─" * 50)

        # 4. 异步执行 subprocess，实时读取输出
        start_time = datetime.now()
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=exec_dir,
            env={**os.environ, "PYTHONPATH": exec_dir},
        )

        # 实时读取输出
        async for line in process.stdout:
            text = line.decode("utf-8", errors="replace").rstrip("\n")
            result.logs.append(text)

            # 判断日志级别
            level = _classify_line(text)
            await _ws_send(websocket, level, text)

        await process.wait()
        result.return_code = process.returncode
        result.duration = (datetime.now() - start_time).total_seconds()

        # 5. 解析结果
        _parse_result(result)

        await _ws_send(websocket, "system", "─" * 50)
        if result.return_code == 0:
            await _ws_send(websocket, "success",
                           f"✅ 执行完成 | 通过: {result.passed} | 耗时: {result.duration:.2f}s")
        else:
            # 发送友好的错误摘要（替代原始堆栈）
            classified_errors = _classify_error(result.logs)
            if classified_errors:
                await _ws_send(websocket, "error", "❌ 执行失败，错误分析：")
                for err in classified_errors:
                    await _ws_send(websocket, "error",
                                   f"  🔍 {err['message']}")
                    await _ws_send(websocket, "info",
                                   f"  💡 {err['suggestion']}")
            await _ws_send(websocket, "error",
                           f"❌ 执行失败 | 通过: {result.passed} | 失败: {result.failed} | "
                           f"错误: {result.error} | 耗时: {result.duration:.2f}s")

        # 发送最终状态
        await _ws_send(websocket, "done", json.dumps({
            "return_code": result.return_code,
            "passed": result.passed,
            "failed": result.failed,
            "error": result.error,
            "duration": result.duration,
        }))

    except Exception as e:
        await _ws_send(websocket, "error", f"💥 执行异常: {str(e)}")
        await _ws_send(websocket, "done", json.dumps({
            "return_code": -1,
            "passed": 0,
            "failed": 0,
            "error": 1,
            "duration": 0,
        }))
    finally:
        # 清理临时目录（延迟清理，方便调试）
        try:
            shutil.rmtree(exec_dir, ignore_errors=True)
        except Exception:
            pass

    return result


async def _ws_send(websocket, level: str, message: str):
    """通过 WebSocket 发送消息"""
    try:
        await websocket.send_json({"level": level, "message": message, "ts": datetime.now().isoformat()})
    except Exception:
        pass


def _classify_line(line: str) -> str:
    """根据内容判断日志级别"""
    if "PASSED" in line:
        return "success"
    elif "FAILED" in line or "ERROR" in line or "ERRORS" in line:
        return "error"
    elif "WARNING" in line or "warning" in line:
        return "warning"
    elif line.startswith("=") or line.startswith("-"):
        return "system"
    elif "collected" in line or "test session starts" in line:
        return "system"
    return "info"


def _parse_result(result: ExecutionResult):
    """从日志中解析测试结果统计"""
    for line in result.logs:
        # 匹配 "1 passed" / "2 failed" / "1 error" 等
        if " passed" in line:
            import re
            m = re.search(r"(\d+) passed", line)
            if m:
                result.passed = int(m.group(1))
        if " failed" in line:
            import re
            m = re.search(r"(\d+) failed", line)
            if m:
                result.failed = int(m.group(1))
        if " error" in line:
            import re
            m = re.search(r"(\d+) error", line)
            if m:
                result.error = int(m.group(1))
