import json
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db, SessionLocal
from ..models import TestCase, TestStep, Element, Project, PageStep, TestCasePage, Page
from ..schemas import TestCaseCreate, TestCaseUpdate, TestCaseOut, StepCreate, StepOut, \
    TestCasePagesUpdate, TestCasePageOut
from ..services.generator import generate_pytest_script
from ..services.executor import run_pytest_scripts
from ..services.adb_executor import run_steps_via_adb

router = APIRouter(tags=["testcases"])


def step_to_out(step: TestStep) -> dict:
    return {
        "id": step.id,
        "testcase_id": step.testcase_id,
        "order": step.order,
        "action_type": step.action_type,
        "target_element_id": step.target_element_id,
        "target_element_name": step.target_element.name if step.target_element else None,
        "params": step.params,
    }


@router.get("/api/projects/{project_id}/testcases", response_model=List[TestCaseOut])
def list_testcases(project_id: int, db: Session = Depends(get_db)):
    return db.query(TestCase).filter(TestCase.project_id == project_id).all()


@router.post("/api/projects/{project_id}/testcases", response_model=TestCaseOut)
def create_testcase(project_id: int, data: TestCaseCreate, db: Session = Depends(get_db)):
    tc = TestCase(project_id=project_id, name=data.name, description=data.description)
    db.add(tc)
    db.commit()
    db.refresh(tc)
    return tc


@router.get("/api/testcases/{testcase_id}", response_model=TestCaseOut)
def get_testcase(testcase_id: int, db: Session = Depends(get_db)):
    tc = db.query(TestCase).get(testcase_id)
    if not tc:
        raise HTTPException(404, "TestCase not found")
    return tc


@router.get("/api/testcases/{testcase_id}/steps", response_model=List[StepOut])
def list_steps(testcase_id: int, db: Session = Depends(get_db)):
    steps = db.query(TestStep).filter(
        TestStep.testcase_id == testcase_id
    ).order_by(TestStep.order).all()
    return [step_to_out(s) for s in steps]


@router.delete("/api/testcases/{testcase_id}")
def delete_testcase(testcase_id: int, db: Session = Depends(get_db)):
    tc = db.query(TestCase).get(testcase_id)
    if not tc:
        raise HTTPException(404, "TestCase not found")
    db.delete(tc)
    db.commit()
    return {"ok": True}


@router.put("/api/testcases/{testcase_id}", response_model=TestCaseOut)
def update_testcase(testcase_id: int, data: TestCaseUpdate, db: Session = Depends(get_db)):
    tc = db.query(TestCase).get(testcase_id)
    if not tc:
        raise HTTPException(404, "TestCase not found")
    if data.name is not None:
        tc.name = data.name
    if data.description is not None:
        tc.description = data.description
    db.commit()
    db.refresh(tc)
    return tc


@router.put("/api/testcases/{testcase_id}/steps", response_model=List[StepOut])
def save_steps(testcase_id: int, steps: List[StepCreate], db: Session = Depends(get_db)):
    tc = db.query(TestCase).get(testcase_id)
    if not tc:
        raise HTTPException(404, "TestCase not found")

    # 删除旧步骤，重新创建
    db.query(TestStep).filter(TestStep.testcase_id == testcase_id).delete()
    db.flush()

    results = []
    for i, s in enumerate(steps):
        step = TestStep(
            testcase_id=testcase_id,
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
    return [step_to_out(s) for s in results]


@router.post("/api/testcases/{testcase_id}/generate")
def generate_script(testcase_id: int, db: Session = Depends(get_db)):
    tc = db.query(TestCase).get(testcase_id)
    if not tc:
        raise HTTPException(404, "TestCase not found")

    steps = db.query(TestStep).filter(
        TestStep.testcase_id == testcase_id
    ).order_by(TestStep.order).all()

    if not steps:
        raise HTTPException(400, "No steps defined")

    # 获取所有关联的元素
    element_ids = [s.target_element_id for s in steps if s.target_element_id]
    elements = db.query(Element).filter(Element.id.in_(element_ids)).all() if element_ids else []
    element_map = {e.id: e for e in elements}

    # 获取项目配置（Appium 连接参数）
    project = db.query(Project).get(tc.project_id)

    scripts = generate_pytest_script(tc, steps, element_map, project=project)
    return scripts


# ============ 测试用例页面链管理 ============

@router.get("/api/testcases/{testcase_id}/pages", response_model=List[TestCasePageOut])
def get_testcase_pages(testcase_id: int, db: Session = Depends(get_db)):
    """获取测试用例的页面链"""
    refs = db.query(TestCasePage).filter(
        TestCasePage.testcase_id == testcase_id
    ).order_by(TestCasePage.order).all()

    result = []
    for ref in refs:
        page = db.query(Page).get(ref.page_id)
        step_count = db.query(PageStep).filter(PageStep.page_id == ref.page_id).count() if page else 0
        result.append({
            "id": ref.id,
            "page_id": ref.page_id,
            "page_name": page.name if page else "已删除",
            "order": ref.order,
            "step_count": step_count,
        })
    return result


@router.put("/api/testcases/{testcase_id}/pages", response_model=List[TestCasePageOut])
def set_testcase_pages(testcase_id: int, data: TestCasePagesUpdate, db: Session = Depends(get_db)):
    """设置测试用例的页面链（有序 page_id 列表）"""
    tc = db.query(TestCase).get(testcase_id)
    if not tc:
        raise HTTPException(404, "TestCase not found")

    # 清空旧关联
    db.query(TestCasePage).filter(TestCasePage.testcase_id == testcase_id).delete()
    db.flush()

    # 创建新关联
    for i, page_id in enumerate(data.page_ids):
        page = db.query(Page).get(page_id)
        if not page:
            raise HTTPException(400, f"Page {page_id} not found")
        ref = TestCasePage(testcase_id=testcase_id, page_id=page_id, order=i)
        db.add(ref)

    db.commit()

    # 返回结果
    refs = db.query(TestCasePage).filter(
        TestCasePage.testcase_id == testcase_id
    ).order_by(TestCasePage.order).all()

    result = []
    for ref in refs:
        page = db.query(Page).get(ref.page_id)
        step_count = db.query(PageStep).filter(PageStep.page_id == ref.page_id).count() if page else 0
        result.append({
            "id": ref.id,
            "page_id": ref.page_id,
            "page_name": page.name if page else "已删除",
            "order": ref.order,
            "step_count": step_count,
        })
    return result


def _get_expanded_steps(testcase_id: int, db: Session):
    """从页面链展开所有步骤"""
    refs = db.query(TestCasePage).filter(
        TestCasePage.testcase_id == testcase_id
    ).order_by(TestCasePage.order).all()

    all_steps = []
    page_boundaries = []
    offset = 0
    for ref in refs:
        page = db.query(Page).get(ref.page_id)
        steps = db.query(PageStep).filter(
            PageStep.page_id == ref.page_id
        ).order_by(PageStep.order).all()
        page_boundaries.append({
            "page_name": page.name if page else "unknown",
            "start_step": offset,
            "end_step": offset + len(steps),
        })
        all_steps.extend(steps)
        offset += len(steps)

    return all_steps, page_boundaries


@router.websocket("/api/testcases/{testcase_id}/run")
async def run_testcase(websocket: WebSocket, testcase_id: int, mode: str = "appium", device: str = ""):
    """WebSocket 端点：实时执行测试并推送日志

    Query params:
      - mode: "appium" (默认，完整 Appium) 或 "adb" (ADB 直连，快速模式)
      - device: 设备 ID（ADB 模式使用）
    """
    await websocket.accept()

    db = SessionLocal()
    try:
        tc = db.query(TestCase).get(testcase_id)
        if not tc:
            await websocket.send_json({"level": "error", "message": "TestCase not found"})
            await websocket.close()
            return

        # 优先从页面链展开步骤，否则回退到旧 TestStep
        page_refs = db.query(TestCasePage).filter(
            TestCasePage.testcase_id == testcase_id
        ).order_by(TestCasePage.order).all()

        if page_refs:
            # 新架构：从页面链展开
            steps, page_boundaries = _get_expanded_steps(testcase_id, db)
        else:
            # 旧架构：直接读 TestStep
            steps = db.query(TestStep).filter(
                TestStep.testcase_id == testcase_id
            ).order_by(TestStep.order).all()
            page_boundaries = []

        if not steps:
            await websocket.send_json({"level": "error", "message": "没有步骤可执行。请先在页面中添加步骤，或在用例中关联页面。"})
            await websocket.close()
            return

        # 获取关联元素
        element_ids = [s.target_element_id for s in steps if s.target_element_id]
        elements = db.query(Element).filter(Element.id.in_(element_ids)).all() if element_ids else []
        element_map = {e.id: e for e in elements}

        # 获取项目配置（Appium 连接参数）
        project = db.query(Project).get(tc.project_id)

        if mode == "adb":
            # ===== ADB 直连模式 =====
            # 转换元素数据为 dict 格式
            adb_element_map = {}
            for eid, el in element_map.items():
                locators = el.locators if hasattr(el, 'locators') and el.locators else []
                if not locators and el.locator_type and el.locator_value:
                    locators = [{"type": el.locator_type, "value": el.locator_value}]
                adb_element_map[eid] = {
                    "name": el.name,
                    "locators": locators,
                    "bbox": {"x": el.bbox_x, "y": el.bbox_y, "w": el.bbox_width, "h": el.bbox_height},
                }

            # 转换步骤为 dict 格式
            step_dicts = [
                {
                    "action_type": s.action_type,
                    "target_element_id": s.target_element_id,
                    "params": s.params,
                }
                for s in steps
            ]

            device_id = device or getattr(project, "device_name", None) or ""
            await run_steps_via_adb(step_dicts, adb_element_map, websocket, device_id=device_id)
        else:
            # ===== Appium 模式（原有逻辑）=====
            scripts = generate_pytest_script(tc, steps, element_map, project=project)
            await run_pytest_scripts(scripts, websocket)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"level": "error", "message": f"执行异常: {str(e)}"})
        except Exception:
            pass
    finally:
        db.close()
