import json
import os
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from ..database import get_db, SessionLocal
from ..models import Page, PageStep, Element, Project
from ..schemas import PageOut, PageCreate, PageUpdate, PageStepCreate, PageStepOut
from ..services.adb_executor import run_steps_via_adb

router = APIRouter(tags=["pages"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def page_to_out(page: Page) -> dict:
    return {
        "id": page.id,
        "project_id": page.project_id,
        "parent_id": page.parent_id,
        "name": page.name,
        "is_folder": page.is_folder or 0,
        "screenshot_path": page.screenshot_path or "",
        "screenshot_url": f"/uploads/{os.path.basename(page.screenshot_path)}" if page.screenshot_path else "",
        "sort_order": page.sort_order or 0,
        "created_at": page.created_at,
    }


@router.get("/api/projects/{project_id}/pages", response_model=List[PageOut])
def list_pages(project_id: int, db: Session = Depends(get_db)):
    pages = db.query(Page).filter(Page.project_id == project_id).order_by(
        Page.sort_order.asc(), Page.created_at.asc()
    ).all()
    return [page_to_out(p) for p in pages]


@router.post("/api/projects/{project_id}/pages/upload", response_model=PageOut)
async def upload_page(
    project_id: int,
    file: UploadFile = File(...),
    name: str = Form(""),
    parent_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
):
    ext = os.path.splitext(file.filename or "")[1] or ".png"
    filename = f"{uuid.uuid4().hex}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    page = Page(
        project_id=project_id,
        parent_id=parent_id,
        name=name or file.filename or "未命名页面",
        screenshot_path=filepath,
        is_folder=0,
    )
    db.add(page)
    db.commit()
    db.refresh(page)
    return page_to_out(page)


@router.post("/api/projects/{project_id}/pages", response_model=PageOut)
def create_page(project_id: int, data: PageCreate, db: Session = Depends(get_db)):
    """创建目录或页面"""
    page = Page(
        project_id=project_id,
        parent_id=data.parent_id,
        name=data.name,
        is_folder=data.is_folder,
    )
    db.add(page)
    db.commit()
    db.refresh(page)
    return page_to_out(page)


@router.put("/api/pages/{page_id}", response_model=PageOut)
def update_page(page_id: int, data: PageUpdate, db: Session = Depends(get_db)):
    """重命名 / 移动到不同目录 / 修改排序"""
    page = db.query(Page).get(page_id)
    if not page:
        raise HTTPException(404, "Page not found")
    if data.name is not None:
        page.name = data.name
    if data.parent_id is not None:
        # 防止将目录移动到自己内部
        if data.parent_id == page_id:
            raise HTTPException(400, "不能将目录移动到自己内部")
        page.parent_id = data.parent_id if data.parent_id > 0 else None
    if data.sort_order is not None:
        page.sort_order = data.sort_order
    db.commit()
    db.refresh(page)
    return page_to_out(page)


@router.delete("/api/pages/{page_id}")
def delete_page(page_id: int, db: Session = Depends(get_db)):
    page = db.query(Page).get(page_id)
    if not page:
        raise HTTPException(404, "Page not found")
    # 清理 TestCasePage 引用
    from ..models import TestCasePage
    db.query(TestCasePage).filter(TestCasePage.page_id == page_id).delete()
    db.delete(page)
    db.commit()
    return {"ok": True}


# ============ 页面步骤 CRUD ============

def _page_step_to_out(step: PageStep) -> dict:
    return {
        "id": step.id,
        "page_id": step.page_id,
        "order": step.order,
        "action_type": step.action_type,
        "target_element_id": step.target_element_id,
        "target_element_name": step.target_element.name if step.target_element else None,
        "params": step.params,
    }


@router.get("/api/pages/{page_id}/steps", response_model=List[PageStepOut])
def list_page_steps(page_id: int, db: Session = Depends(get_db)):
    """获取某页面的所有步骤"""
    steps = db.query(PageStep).filter(
        PageStep.page_id == page_id
    ).order_by(PageStep.order).all()
    return [_page_step_to_out(s) for s in steps]


@router.put("/api/pages/{page_id}/steps", response_model=List[PageStepOut])
def save_page_steps(page_id: int, steps: List[PageStepCreate], db: Session = Depends(get_db)):
    """保存（全量替换）某页面的步骤"""
    page = db.query(Page).get(page_id)
    if not page:
        raise HTTPException(404, "Page not found")

    # 删除旧步骤
    db.query(PageStep).filter(PageStep.page_id == page_id).delete()
    db.flush()

    results = []
    for i, s in enumerate(steps):
        # 校验元素归属
        if s.target_element_id:
            el = db.query(Element).get(s.target_element_id)
            if el and el.page_id != page_id:
                raise HTTPException(400, f"元素 '{el.name}' 不属于页面 '{page.name}'")

        step = PageStep(
            page_id=page_id,
            order=s.order if s.order else i,
            action_type=s.action_type,
            target_element_id=s.target_element_id,
            params_json=json.dumps(s.params, ensure_ascii=False),
        )
        db.add(step)
        results.append(step)

    db.commit()
    for step in results:
        db.refresh(step)
    return [_page_step_to_out(s) for s in results]


# ============ 页面级执行 (WebSocket) ============

@router.websocket("/api/pages/{page_id}/run")
async def run_page(websocket: WebSocket, page_id: int, mode: str = "adb", device: str = ""):
    """WebSocket：直接运行某页面的步骤"""
    await websocket.accept()
    db = SessionLocal()

    try:
        page = db.query(Page).get(page_id)
        if not page:
            await websocket.send_json({"level": "error", "message": "Page not found"})
            await websocket.close()
            return

        steps = db.query(PageStep).filter(
            PageStep.page_id == page_id
        ).order_by(PageStep.order).all()

        if not steps:
            await websocket.send_json({"level": "error", "message": "该页面没有步骤"})
            await websocket.close()
            return

        # 获取关联元素
        element_ids = [s.target_element_id for s in steps if s.target_element_id]
        elements = db.query(Element).filter(Element.id.in_(element_ids)).all() if element_ids else []
        element_map = {e.id: e for e in elements}

        # 获取项目配置
        project = db.query(Project).get(page.project_id)

        if mode == "adb":
            adb_element_map = {}
            for eid, el in element_map.items():
                locators = el.locators if hasattr(el, 'locators') and el.locators else []
                if not locators and el.locator_type and el.locator_value:
                    locators = [{"type": el.locator_type, "value": el.locator_value}]
                adb_element_map[eid] = {
                    "name": el.name, "locators": locators,
                    "bbox": {"x": el.bbox_x, "y": el.bbox_y, "w": el.bbox_width, "h": el.bbox_height},
                }

            step_dicts = [
                {"action_type": s.action_type, "target_element_id": s.target_element_id, "params": s.params}
                for s in steps
            ]

            device_id = device or getattr(project, "device_name", None) or ""
            await run_steps_via_adb(step_dicts, adb_element_map, websocket, device_id=device_id)
        else:
            await websocket.send_json({"level": "error", "message": "页面级执行仅支持 ADB 直连模式"})
            await websocket.close()

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"level": "error", "message": f"执行异常: {str(e)}"})
        except Exception:
            pass
    finally:
        db.close()
