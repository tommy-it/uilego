import asyncio
import base64
import os
import re
import tempfile
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
import json
from ..database import get_db
from ..models import Element, Page, Project
from ..schemas import ElementCreate, ElementUpdate, ElementOut
from ..services.adb_executor import ADBExecutor

router = APIRouter(tags=["elements"])


def element_to_out(el: Element) -> dict:
    return {
        "id": el.id,
        "page_id": el.page_id,
        "name": el.name,
        "type": el.type,
        "bbox": el.bbox,
        "locator_type": el.locator_type,
        "locator_value": el.locator_value,
        "locators": el.locators,
        "description": el.description,
        "group": el.group_name,
        "source": el.source,
        "created_at": el.created_at,
    }


def _build_element(page_id: int, data: ElementCreate) -> Element:
    """构造 Element ORM 对象，处理多定位器"""
    # 将多定位器列表转为 JSON
    locators_json = json.dumps(
        [{"type": loc.type, "value": loc.value} for loc in data.locators if loc.value],
        ensure_ascii=False,
    )
    # 兼容旧字段：主定位器取第一个非空定位器，或默认的 coordinate
    primary = None
    for loc in data.locators:
        if loc.value:
            primary = loc
            break
    locator_type = primary.type if primary else data.locator_type
    locator_value = primary.value if primary else data.locator_value

    return Element(
        page_id=page_id,
        name=data.name,
        type=data.type,
        bbox_x=data.bbox.x,
        bbox_y=data.bbox.y,
        bbox_width=data.bbox.width,
        bbox_height=data.bbox.height,
        locator_type=locator_type,
        locator_value=locator_value,
        locators_json=locators_json,
        description=data.description,
        group_name=data.group,
        source=data.source,
    )


@router.get("/api/pages/{page_id}/elements", response_model=List[ElementOut])
def list_elements(page_id: int, db: Session = Depends(get_db)):
    elements = db.query(Element).filter(Element.page_id == page_id).all()
    return [element_to_out(e) for e in elements]


@router.post("/api/pages/{page_id}/elements", response_model=ElementOut)
def create_element(page_id: int, data: ElementCreate, db: Session = Depends(get_db)):
    el = _build_element(page_id, data)
    db.add(el)
    db.commit()
    db.refresh(el)
    return element_to_out(el)


@router.post("/api/pages/{page_id}/elements/batch", response_model=List[ElementOut])
def batch_create_elements(page_id: int, data: List[ElementCreate], db: Session = Depends(get_db)):
    results = []
    for item in data:
        el = _build_element(page_id, item)
        db.add(el)
        results.append(el)
    db.commit()
    for el in results:
        db.refresh(el)
    return [element_to_out(e) for e in results]


@router.put("/api/elements/{element_id}", response_model=ElementOut)
def update_element(element_id: int, data: ElementUpdate, db: Session = Depends(get_db)):
    el = db.query(Element).get(element_id)
    if not el:
        raise HTTPException(404, "Element not found")
    if data.name is not None:
        el.name = data.name
    if data.type is not None:
        el.type = data.type
    if data.bbox is not None:
        el.bbox_x = data.bbox.x
        el.bbox_y = data.bbox.y
        el.bbox_width = data.bbox.width
        el.bbox_height = data.bbox.height
    if data.locator_type is not None:
        el.locator_type = data.locator_type
    if data.locator_value is not None:
        el.locator_value = data.locator_value
    if data.locators is not None:
        el.locators_json = json.dumps(
            [{"type": loc.type, "value": loc.value} for loc in data.locators if loc.value],
            ensure_ascii=False,
        )
    if data.description is not None:
        el.description = data.description
    if data.group is not None:
        el.group_name = data.group
    db.commit()
    db.refresh(el)
    return element_to_out(el)


@router.delete("/api/elements/{element_id}")
def delete_element(element_id: int, db: Session = Depends(get_db)):
    el = db.query(Element).get(element_id)
    if not el:
        raise HTTPException(404, "Element not found")
    db.delete(el)
    db.commit()
    return {"ok": True}


@router.post("/api/elements/{element_id}/locate")
async def locate_element(element_id: int, db: Session = Depends(get_db)):
    """
    测试元素定位：在真机上查找元素并返回截图 + 位置信息
    点一次执行一次，返回当前屏幕状态下的定位结果
    """
    el = db.query(Element).get(element_id)
    if not el:
        raise HTTPException(404, "Element not found")

    # 通过 element → page → project 获取设备信息
    page = db.query(Page).filter(Page.id == el.page_id).first()
    if not page:
        raise HTTPException(400, "元素所属页面不存在")
    project = db.query(Project).filter(Project.id == page.project_id).first()
    if not project:
        raise HTTPException(400, "页面所属项目不存在")

    device_id = project.device_name or None
    adb = ADBExecutor(device_id=device_id)

    # 构建定位器列表
    locators = el.locators or [{"type": el.locator_type, "value": el.locator_value}]
    locators = [loc for loc in locators if loc.get("value")]
    if not locators:
        raise HTTPException(400, "元素没有配置定位器")

    # 1. dump UI 层级
    root = await adb.dump_ui(force=True)

    # 2. 尝试用每个定位器查找
    found = None
    matched_locator = None
    scroll_count = 0  # 记录滚动次数

    def try_find(r):
        for loc in locators:
            lt, lv = loc["type"], loc["value"]
            if lt == "coordinate":
                from ..services.adb_executor import _parse_coordinate_value
                try:
                    x, y = _parse_coordinate_value(lv)
                    return {"center": (x, y), "bounds": None}, {"type": "coordinate", "value": lv}
                except ValueError:
                    continue
            if r:
                result = adb.find_element(r, lt, lv)
                if result:
                    return result, {"type": lt, "value": lv}
        return None, None

    found, matched_locator = try_find(root)

    # 2.1 没找到时自动滚动查找（最多滚动 4 次）
    if not found:
        for i in range(4):
            await adb.swipe("up", 0.5)  # 内容向下滚
            await asyncio.sleep(0.8)
            root = await adb.dump_ui(force=True)
            found, matched_locator = try_find(root)
            scroll_count += 1
            if found:
                break

    # 2.2 向下没找到，回滚再试
    if not found and scroll_count > 0:
        for i in range(scroll_count + 3):  # 多滚几次确保回到顶部
            await adb.swipe("down", 0.5)
            await asyncio.sleep(0.3)
        for i in range(3):
            await adb.swipe("up", 0.5)
            await asyncio.sleep(0.8)
            root = await adb.dump_ui(force=True)
            found, matched_locator = try_find(root)
            if found:
                break

    # 2.5 查找坐标处的 UI 节点属性（帮助用户确定正确的定位器）
    node_at_point = None
    nearby_nodes = []  # 附近所有有意义的节点
    center_point = found.get("center") if found else None
    if root and center_point:
        cx, cy = center_point
        best_contain = None
        best_contain_score = float("inf")
        for node in root.iter("node"):
            b = adb._parse_bounds(node.get("bounds", ""))
            if not b:
                continue
            text = node.get("text", "")
            rid = node.get("resource-id", "")
            desc = node.get("content-desc", "")
            cls = node.get("class", "")
            is_clickable = node.get("clickable", "false") == "true"
            node_info = {
                "text": text,
                "resource_id": rid,
                "content_desc": desc,
                "class": cls.split(".")[-1],
                "clickable": is_clickable,
                "bounds": list(b),
            }
            ncx = (b[0] + b[2]) / 2
            ncy = (b[1] + b[3]) / 2
            dist = abs(ncx - cx) + abs(ncy - cy)
            # 精确包含该坐标
            if b[0] <= cx <= b[2] and b[1] <= cy <= b[3]:
                area = (b[2] - b[0]) * (b[3] - b[1])
                has_semantic = bool(text or rid or desc)
                score = area - (100000 if has_semantic else 0) - (50000 if is_clickable else 0)
                if score < best_contain_score:
                    best_contain_score = score
                    best_contain = node_info
            # 收集附近的节点（500px 内，有语义或可点击）
            if dist < 500 and (text or rid or desc or is_clickable):
                nearby_nodes.append({**node_info, "distance": round(dist)})
        node_at_point = best_contain
        # 按距离排序，取最近的 5 个
        nearby_nodes.sort(key=lambda n: n["distance"])
        nearby_nodes = nearby_nodes[:5]

    # 3. 截图
    screenshot_b64 = None
    screen_w, screen_h = 1080, 2400  # 默认值
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        screenshot_path = tmp.name
    rc_out, rc = await adb.screenshot(screenshot_path)
    if rc == 0:
        try:
            with open(screenshot_path, "rb") as f:
                screenshot_b64 = base64.b64encode(f.read()).decode("utf-8")
        except Exception:
            pass
    # 获取屏幕尺寸
    size_out, _ = await adb._run(["shell", "wm", "size"])
    m = re.search(r'(\d+)x(\d+)', size_out)
    if m:
        screen_w, screen_h = int(m.group(1)), int(m.group(2))
    try:
        os.unlink(screenshot_path)
    except Exception:
        pass

    # 4. 返回结果
    if found:
        bounds = found.get("bounds")
        center = found.get("center")
        # 坐标定位时 bounds 可能为空，从 center 合成一个小方框
        if not bounds and center:
            cx, cy = center
            box_half = 40  # 半宽/半高 40px
            bounds = [
                max(0, cx - box_half),
                max(0, cy - box_half),
                cx + box_half,
                cy + box_half,
            ]
        return {
            "found": True,
            "matched_locator": matched_locator,
            "bounds": list(bounds) if bounds else None,
            "center": list(center) if center else None,
            "text": found.get("text", ""),
            "resource_id": found.get("resource_id", ""),
            "class": found.get("class", ""),
            "clickable": found.get("clickable", False),
            "screenshot": screenshot_b64,
            "device": device_id or "默认设备",
            "screen_width": screen_w,
            "screen_height": screen_h,
            "node_at_point": node_at_point,
            "nearby_nodes": nearby_nodes,
            "scrolled_to_find": scroll_count > 0,  # 是否滚动后才找到
        }
    else:
        return {
            "found": False,
            "locators_tried": locators,
            "screenshot": screenshot_b64,
            "device": device_id or "默认设备",
            "message": "已尝试滚动屏幕查找，但未找到该元素。请确认 App 页面和定位器配置",
            "screen_width": screen_w,
            "screen_height": screen_h,
        }


# ============ UI Inspector API ============

def _xml_node_to_dict(node, adb) -> dict:
    """将 XML 节点转换为 JSON（含所有属性和子节点）"""
    bounds = adb._parse_bounds(node.get("bounds", ""))
    result = {
        "tag": node.tag,
        "text": node.get("text", ""),
        "resource_id": node.get("resource-id", ""),
        "content_desc": node.get("content-desc", ""),
        "class": node.get("class", ""),
        "package": node.get("package", ""),
        "bounds": list(bounds) if bounds else None,
        "clickable": node.get("clickable", "false") == "true",
        "scrollable": node.get("scrollable", "false") == "true",
        "checkable": node.get("checkable", "false") == "true",
        "checked": node.get("checked", "false") == "true",
        "enabled": node.get("enabled", "true") == "true",
        "focused": node.get("focused", "false") == "true",
        "selected": node.get("selected", "false") == "true",
        "long_clickable": node.get("long-clickable", "false") == "true",
        "index": int(node.get("index", "0")),
        "children": [],
    }
    for child in node:
        result["children"].append(_xml_node_to_dict(child, adb))
    return result


def _flatten_tree(node_dict, parent_id=None, node_id=0) -> tuple:
    """将嵌套树平铺为列表，每个节点带 parent_id 和唯一 id"""
    flat = []
    node_dict["_id"] = node_id
    node_dict["_parent_id"] = parent_id
    # 移除 children 避免重复
    children = node_dict.pop("children", [])
    flat.append(node_dict)
    for child in children:
        node_id += 1
        sub_flat, node_id = _flatten_tree(child, parent_id=node_dict["_id"], node_id=node_id)
        flat.extend(sub_flat)
    return flat, node_id


@router.post("/api/device/inspect")
async def inspect_device(project_id: int, db: Session = Depends(get_db)):
    """UI Inspector: dump 完整 UI 树 + 截图，用于元素属性查看"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "项目不存在")

    device_id = project.device_name or None
    adb = ADBExecutor(device_id=device_id)

    # 1. dump UI 树
    root = await adb.dump_ui(force=True)
    if root is None:
        raise HTTPException(500, "UI dump 失败，请检查设备连接")

    # 2. 截图
    screenshot_b64 = None
    screenshot_path = "/sdcard/inspect_screenshot.png"
    out, rc = await adb._run(["shell", "screencap", "-p", screenshot_path])
    if rc == 0:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            local_path = tmp.name
        out2, rc2 = await adb._run(["pull", screenshot_path, local_path])
        if rc2 == 0:
            with open(local_path, "rb") as f:
                screenshot_b64 = base64.b64encode(f.read()).decode("utf-8")
        try:
            os.unlink(local_path)
            await adb._run(["shell", "rm", screenshot_path])
        except Exception:
            pass

    # 3. 获取屏幕尺寸
    screen_w, screen_h = 1080, 2340
    size_out, _ = await adb._run(["shell", "wm", "size"])
    m = re.search(r'(\d+)x(\d+)', size_out)
    if m:
        screen_w, screen_h = int(m.group(1)), int(m.group(2))

    # 4. 将 UI 树转换为层级 JSON
    tree_dict = _xml_node_to_dict(root, adb)
    flat_list, _ = _flatten_tree(tree_dict)

    return {
        "device": device_id or "默认设备",
        "screen_width": screen_w,
        "screen_height": screen_h,
        "screenshot": screenshot_b64,
        "nodes": flat_list,
        "total_nodes": len(flat_list),
    }


@router.post("/api/device/tap")
async def tap_device(project_id: int, x: int, y: int, db: Session = Depends(get_db)):
    """点击设备指定坐标"""
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "项目不存在")

    device_id = project.device_name or None
    adb = ADBExecutor(device_id=device_id)

    out, rc = await adb._run(["shell", "input", "tap", str(x), str(y)])
    if rc != 0:
        raise HTTPException(500, f"点击失败: {out}")
    return {"success": True, "x": x, "y": y}
