import subprocess
import re
import shutil
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from ..database import get_db
from ..models import Project
from ..schemas import ProjectCreate, ProjectUpdate, ProjectOut

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=List[ProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return db.query(Project).order_by(Project.created_at.desc()).all()


@router.post("", response_model=ProjectOut)
def create_project(data: ProjectCreate, db: Session = Depends(get_db)):
    project = Project(
        name=data.name,
        description=data.description,
        platform=data.platform,
        appium_url=data.appium_url,
        device_name=data.device_name,
        app_package=data.app_package,
        app_activity=data.app_activity,
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.put("/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, data: ProjectUpdate, db: Session = Depends(get_db)):
    project = db.query(Project).get(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    for field in ["name", "description", "platform", "appium_url", "device_name", "app_package", "app_activity"]:
        value = getattr(data, field)
        if value is not None:
            setattr(project, field, value)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    project = db.query(Project).get(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    db.delete(project)
    db.commit()
    return {"ok": True}


# ============ 设备管理 ============

class DeviceInfo(BaseModel):
    id: str           # 设备标识（序列号/UDID）
    name: str         # 显示名称
    platform: str     # android / ios
    status: str       # online / offline / unauthorized
    model: str = ""   # 设备型号


@router.get("/devices/list")
def list_devices(platform: str = Query("android", regex="^(android|ios|all)$")):
    """获取已连接的设备列表"""
    devices: List[dict] = []

    # ---- Android 设备 ----
    if platform in ("android", "all"):
        devices.extend(_detect_android_devices())

    # ---- iOS 设备 ----
    if platform in ("ios", "all"):
        devices.extend(_detect_ios_devices())

    return devices


def _detect_android_devices() -> List[dict]:
    """通过 adb devices 获取 Android 设备"""
    devices = []
    adb = shutil.which("adb")
    if not adb:
        return devices

    try:
        result = subprocess.run(
            [adb, "devices", "-l"],
            capture_output=True, text=True, timeout=10,
        )
        for line in result.stdout.strip().split("\n")[1:]:  # 跳过 header
            line = line.strip()
            if not line:
                continue
            parts = line.split()
            if len(parts) < 2:
                continue
            device_id = parts[0]
            status_raw = parts[1]
            # 解析状态
            status = "online" if status_raw == "device" else status_raw
            # 解析型号 (model:XXX)
            model = ""
            for p in parts[2:]:
                if p.startswith("model:"):
                    model = p.split(":", 1)[1].replace("_", " ")
                elif p.startswith("product:"):
                    if not model:
                        model = p.split(":", 1)[1].replace("_", " ")

            devices.append({
                "id": device_id,
                "name": model or device_id,
                "platform": "android",
                "status": status,
                "model": model,
            })
    except Exception:
        pass

    return devices


def _detect_ios_devices() -> List[dict]:
    """通过 idevice_id 或 xcrun 获取 iOS 设备"""
    devices = []

    # 方法1: 真机 — idevice_id
    idevice = shutil.which("idevice_id")
    if idevice:
        try:
            result = subprocess.run(
                [idevice, "-l"],
                capture_output=True, text=True, timeout=10,
            )
            for line in result.stdout.strip().split("\n"):
                udid = line.strip()
                if udid:
                    # 尝试获取设备名
                    name = udid
                    idevice_name = shutil.which("ideviceinfo")
                    if idevice_name:
                        try:
                            nr = subprocess.run(
                                [idevice_name, "-u", udid, "-k", "DeviceName"],
                                capture_output=True, text=True, timeout=5,
                            )
                            if nr.stdout.strip():
                                name = nr.stdout.strip()
                        except Exception:
                            pass
                    devices.append({
                        "id": udid,
                        "name": name,
                        "platform": "ios",
                        "status": "online",
                        "model": "iPhone",
                    })
        except Exception:
            pass

    # 方法2: 模拟器 — xcrun simctl
    xcrun = shutil.which("xcrun")
    if xcrun:
        try:
            result = subprocess.run(
                [xcrun, "simctl", "list", "devices", "booted", "-j"],
                capture_output=True, text=True, timeout=10,
            )
            import json as _json
            data = _json.loads(result.stdout)
            for runtime, sims in data.get("devices", {}).items():
                # 提取 iOS 版本号
                ios_ver = runtime.split(".")[-1] if "." in runtime else runtime
                for sim in sims:
                    if sim.get("state") == "Booted":
                        devices.append({
                            "id": sim["udid"],
                            "name": f"{sim['name']} (iOS {ios_ver})",
                            "platform": "ios",
                            "status": "online",
                            "model": sim.get("name", "Simulator"),
                        })
        except Exception:
            pass

    return devices


@router.get("/{project_id}/detect-app")
def detect_current_app(project_id: int, device: str = None):
    """通过 ADB 获取当前打开的 App 包名和 Activity（支持指定设备）"""
    adb = shutil.which("adb")
    if not adb:
        raise HTTPException(500, "未找到 adb 命令")

    try:
        adb_cmd = [adb]
        if device:
            adb_cmd.extend(["-s", device])

        # dumpsys window windows 查找 mCurrentFocus
        result = subprocess.run(
            adb_cmd + ["shell", "dumpsys", "window", "windows"],
            capture_output=True, text=True, timeout=10,
        )
        output = ""
        for line in result.stdout.split("\n"):
            if "mCurrentFocus" in line or "mFocusedApp" in line:
                output = line.strip()
                break

        if not output:
            # 备选: activity activities
            result = subprocess.run(
                adb_cmd + ["shell", "dumpsys", "activity", "activities"],
                capture_output=True, text=True, timeout=10,
            )
            for line in result.stdout.split("\n"):
                if "ResumedActivity" in line or "mResumedActivity" in line:
                    output = line.strip()
                    break

        if not output:
            raise HTTPException(400, "无法检测到当前 App，请确保目标 App 已打开在前台")

        # 解析
        package = ""
        activity = ""
        match = re.search(r'([a-zA-Z][\w.]*)/([a-zA-Z][\w.$]*)', output)
        if match:
            package = match.group(1)
            activity = match.group(2)
            if activity.startswith(package) and not activity.startswith("."):
                rel = activity[len(package):]
                if rel and not rel.startswith("."):
                    activity = "." + rel

        if not package:
            raise HTTPException(400, "无法解析 App 信息")

        return {"app_package": package, "app_activity": activity, "raw": output}

    except subprocess.TimeoutExpired:
        raise HTTPException(408, "ADB 命令超时")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"检测失败: {str(e)}")
