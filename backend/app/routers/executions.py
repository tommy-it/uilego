"""执行记录 API — 查看历史执行记录和回放数据"""
import json
import os
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from ..database import get_db
from ..models import ExecutionRecord, ExecutionStepRecord
from ..schemas import ExecutionRecordOut, ExecutionStepRecordOut, ExecutionDetailOut

router = APIRouter(tags=["executions"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")


def _step_to_out(s: ExecutionStepRecord) -> ExecutionStepRecordOut:
    """将步骤记录转换为输出，包含截图 URL"""
    screenshot_url = None
    if s.screenshot_path and os.path.exists(s.screenshot_path):
        screenshot_url = f"/uploads/{os.path.basename(s.screenshot_path)}"

    return ExecutionStepRecordOut(
        id=s.id,
        step_order=s.step_order,
        action_type=s.action_type,
        element_name=s.element_name,
        element_id=s.element_id,
        params=json.loads(s.params_json) if s.params_json else {},
        status=s.status,
        log_message=s.log_message,
        screenshot_url=screenshot_url,
        duration=s.duration,
    )


@router.get("/api/projects/{project_id}/executions")
def list_executions(
    project_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    source_type: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """获取项目的执行记录列表（分页）"""
    query = db.query(ExecutionRecord).filter(
        ExecutionRecord.project_id == project_id
    )
    if source_type:
        query = query.filter(ExecutionRecord.source_type == source_type)

    total = query.count()
    records = query.order_by(ExecutionRecord.created_at.desc())\
                   .offset((page - 1) * page_size)\
                   .limit(page_size).all()

    return {
        "total": total,
        "items": [ExecutionRecordOut.model_validate(r) for r in records],
    }


@router.get("/api/executions/{execution_id}")
def get_execution_detail(execution_id: int, db: Session = Depends(get_db)):
    """获取执行详情 + 所有步骤记录（含截图 URL）"""
    record = db.query(ExecutionRecord).get(execution_id)
    if not record:
        raise HTTPException(404, "Execution record not found")

    steps = db.query(ExecutionStepRecord).filter(
        ExecutionStepRecord.execution_id == execution_id
    ).order_by(ExecutionStepRecord.step_order).all()

    return ExecutionDetailOut(
        record=ExecutionRecordOut.model_validate(record),
        steps=[_step_to_out(s) for s in steps],
    )


@router.delete("/api/executions/{execution_id}")
def delete_execution(execution_id: int, db: Session = Depends(get_db)):
    """删除执行记录（同时清理截图文件）"""
    record = db.query(ExecutionRecord).get(execution_id)
    if not record:
        raise HTTPException(404, "Execution record not found")

    # 清理截图文件
    steps = db.query(ExecutionStepRecord).filter(
        ExecutionStepRecord.execution_id == execution_id
    ).all()
    for s in steps:
        if s.screenshot_path and os.path.exists(s.screenshot_path):
            try:
                os.unlink(s.screenshot_path)
            except Exception:
                pass

    db.delete(record)
    db.commit()
    return {"ok": True}
