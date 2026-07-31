import json
from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    platform = Column(String(50), default="android")
    # Appium 连接配置
    appium_url = Column(String(300), default="http://localhost:4723")
    device_name = Column(String(200), default="emulator-5554")
    app_package = Column(String(300), default="com.example.app")
    app_activity = Column(String(300), default=".MainActivity")
    created_at = Column(DateTime, default=datetime.utcnow)

    pages = relationship("Page", back_populates="project", cascade="all, delete-orphan")
    testcases = relationship("TestCase", back_populates="project", cascade="all, delete-orphan")


class Page(Base):
    __tablename__ = "pages"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    parent_id = Column(Integer, ForeignKey("pages.id"), nullable=True)  # 父目录 id，null=根目录
    name = Column(String(200), nullable=False)
    is_folder = Column(Integer, default=0)  # 0=截图页面, 1=目录
    screenshot_path = Column(String(500), default="")
    sort_order = Column(Integer, default=0)  # 排序序号
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="pages")
    elements = relationship("Element", back_populates="page", cascade="all, delete-orphan")
    steps = relationship("PageStep", back_populates="page", cascade="all, delete-orphan",
                         order_by="PageStep.order")


class Element(Base):
    __tablename__ = "elements"

    id = Column(Integer, primary_key=True, index=True)
    page_id = Column(Integer, ForeignKey("pages.id"))
    name = Column(String(200), nullable=False)
    type = Column(String(50), default="other")
    bbox_x = Column(Integer, default=0)
    bbox_y = Column(Integer, default=0)
    bbox_width = Column(Integer, default=0)
    bbox_height = Column(Integer, default=0)
    locator_type = Column(String(50), default="coordinate")
    locator_value = Column(String(500), default="")
    # 多定位器备用链（JSON 数组，按优先级排序，最多 5 个）
    # 格式：[{"type": "coordinate", "value": "(cx, cy)"}, {"type": "id", "value": "com.app:id/xxx"}, ...]
    locators_json = Column(Text, default="[]")
    description = Column(Text, default="")
    group_name = Column(String(100), default="")
    source = Column(String(20), default="manual")
    created_at = Column(DateTime, default=datetime.utcnow)

    page = relationship("Page", back_populates="elements")

    @property
    def bbox(self):
        return {
            "x": self.bbox_x,
            "y": self.bbox_y,
            "width": self.bbox_width,
            "height": self.bbox_height,
        }

    @property
    def locators(self):
        """获取多定位器列表（兼容旧数据）"""
        try:
            locs = json.loads(self.locators_json) if self.locators_json else []
        except Exception:
            locs = []
        # 兼容旧数据：如果 locators 为空但有 locator_type/value，自动构造
        if not locs and self.locator_type and self.locator_value:
            locs = [{"type": self.locator_type, "value": self.locator_value}]
        return locs


class TestCase(Base):
    __tablename__ = "testcases"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.utcnow)

    project = relationship("Project", back_populates="testcases")
    steps = relationship("TestStep", back_populates="testcase", cascade="all, delete-orphan",
                         order_by="TestStep.order")
    page_refs = relationship("TestCasePage", back_populates="testcase",
                             cascade="all, delete-orphan",
                             order_by="TestCasePage.order")


class TestStep(Base):
    __tablename__ = "teststeps"

    id = Column(Integer, primary_key=True, index=True)
    testcase_id = Column(Integer, ForeignKey("testcases.id"))
    order = Column(Integer, default=0)
    action_type = Column(String(50), nullable=False)
    target_element_id = Column(Integer, ForeignKey("elements.id"), nullable=True)
    params_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow)

    testcase = relationship("TestCase", back_populates="steps")
    target_element = relationship("Element")

    @property
    def params(self):
        return json.loads(self.params_json) if self.params_json else {}

    @params.setter
    def params(self, value):
        self.params_json = json.dumps(value, ensure_ascii=False)


class PageStep(Base):
    """页面级步骤 — 每个页面独立的步骤编排（类似单元测试）"""
    __tablename__ = "pagesteps"

    id = Column(Integer, primary_key=True, index=True)
    page_id = Column(Integer, ForeignKey("pages.id"), nullable=False)
    order = Column(Integer, default=0)
    action_type = Column(String(50), nullable=False)
    target_element_id = Column(Integer, ForeignKey("elements.id"), nullable=True)
    params_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=datetime.utcnow)

    page = relationship("Page", back_populates="steps")
    target_element = relationship("Element")

    @property
    def params(self):
        return json.loads(self.params_json) if self.params_json else {}

    @params.setter
    def params(self, value):
        self.params_json = json.dumps(value, ensure_ascii=False)


class TestCasePage(Base):
    """测试用例 ↔ 页面 关联 — 按顺序串联多个页面的步骤流"""
    __tablename__ = "testcase_pages"

    id = Column(Integer, primary_key=True, index=True)
    testcase_id = Column(Integer, ForeignKey("testcases.id"), nullable=False)
    page_id = Column(Integer, ForeignKey("pages.id"), nullable=False)
    order = Column(Integer, default=0)

    testcase = relationship("TestCase", back_populates="page_refs")
    page = relationship("Page")
