from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ============ Project ============
class ProjectCreate(BaseModel):
    name: str
    description: str = ""
    platform: str = "android"
    appium_url: str = "http://localhost:4723"
    device_name: str = "emulator-5554"
    app_package: str = "com.example.app"
    app_activity: str = ".MainActivity"

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    platform: Optional[str] = None
    appium_url: Optional[str] = None
    device_name: Optional[str] = None
    app_package: Optional[str] = None
    app_activity: Optional[str] = None

class ProjectOut(BaseModel):
    id: int
    name: str
    description: str
    platform: str
    appium_url: str
    device_name: str
    app_package: str
    app_activity: str
    created_at: datetime
    class Config:
        from_attributes = True


# ============ Page ============
class PageCreate(BaseModel):
    name: str
    is_folder: int = 0  # 0=页面, 1=目录
    parent_id: Optional[int] = None

class PageUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[int] = None
    sort_order: Optional[int] = None

class PageOut(BaseModel):
    id: int
    project_id: int
    parent_id: Optional[int] = None
    name: str
    is_folder: int = 0
    screenshot_path: str
    screenshot_url: str = ""
    sort_order: int = 0
    created_at: datetime
    class Config:
        from_attributes = True


# ============ Element ============
class BBoxSchema(BaseModel):
    x: int = 0
    y: int = 0
    width: int = 0
    height: int = 0

class LocatorItem(BaseModel):
    type: str  # id, xpath, text, coordinate, accessibility_id, natural_language
    value: str

class ElementCreate(BaseModel):
    name: str
    type: str = "other"
    bbox: BBoxSchema = BBoxSchema()
    locator_type: str = "coordinate"
    locator_value: str = ""
    locators: List[LocatorItem] = []
    description: str = ""
    group: str = ""
    source: str = "manual"

class ElementUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    bbox: Optional[BBoxSchema] = None
    locator_type: Optional[str] = None
    locator_value: Optional[str] = None
    locators: Optional[List[LocatorItem]] = None
    description: Optional[str] = None
    group: Optional[str] = None

class ElementOut(BaseModel):
    id: int
    page_id: int
    name: str
    type: str
    bbox: dict
    locator_type: str
    locator_value: str
    locators: list = []
    description: str
    group: str
    source: str
    created_at: datetime
    class Config:
        from_attributes = True


# ============ TestCase ============
class TestCaseCreate(BaseModel):
    name: str
    description: str = ""

class TestCaseUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class TestCaseOut(BaseModel):
    id: int
    project_id: int
    name: str
    description: str
    created_at: datetime
    class Config:
        from_attributes = True


# ============ TestStep ============
class StepCreate(BaseModel):
    order: int = 0
    action_type: str
    target_element_id: Optional[int] = None
    params: dict = {}

class StepOut(BaseModel):
    id: int
    testcase_id: int
    order: int
    action_type: str
    target_element_id: Optional[int]
    target_element_name: Optional[str] = None
    params: dict
    class Config:
        from_attributes = True


# ============ Script ============
class GenerateRequest(BaseModel):
    framework: str = "pytest"

class ScriptOut(BaseModel):
    filename: str
    content: str


# ============ PageStep ============
class PageStepCreate(BaseModel):
    order: int = 0
    action_type: str
    target_element_id: Optional[int] = None
    params: dict = {}

class PageStepOut(BaseModel):
    id: int
    page_id: int
    order: int
    action_type: str
    target_element_id: Optional[int]
    target_element_name: Optional[str] = None
    params: dict
    class Config:
        from_attributes = True


# ============ TestCasePage ============
class TestCasePagesUpdate(BaseModel):
    page_ids: List[int]

class TestCasePageOut(BaseModel):
    id: int
    page_id: int
    page_name: Optional[str] = None
    order: int
    step_count: int = 0
    class Config:
        from_attributes = True


# ============ Execution Records ============
class ExecutionRecordOut(BaseModel):
    id: int
    source_type: str
    source_id: int
    source_name: str
    project_id: Optional[int] = None
    status: str
    total_steps: int
    passed_count: int
    failed_count: int
    error_count: int
    duration: float
    exec_mode: str
    device_id: str
    created_at: datetime
    class Config:
        from_attributes = True


class ExecutionStepRecordOut(BaseModel):
    id: int
    step_order: int
    action_type: str
    element_name: str
    element_id: Optional[int] = None
    params: dict
    status: str
    log_message: str
    screenshot_url: Optional[str] = None
    duration: float
    class Config:
        from_attributes = True


class ExecutionDetailOut(BaseModel):
    record: ExecutionRecordOut
    steps: List[ExecutionStepRecordOut]
