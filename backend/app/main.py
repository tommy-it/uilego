import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text, inspect
from .database import engine, Base
from .routers import projects, pages, elements, testcases

# 创建数据库表
Base.metadata.create_all(bind=engine)


def _migrate_db():
    """轻量迁移：给已有表补充缺失的列（SQLite 不支持 ALTER COLUMN，仅支持 ADD COLUMN）"""
    migrations = {
        "projects": [
            ("appium_url", "VARCHAR(300) DEFAULT 'http://localhost:4723'"),
            ("device_name", "VARCHAR(200) DEFAULT 'emulator-5554'"),
            ("app_package", "VARCHAR(300) DEFAULT 'com.example.app'"),
            ("app_activity", "VARCHAR(300) DEFAULT '.MainActivity'"),
        ],
        "elements": [
            ("locators_json", "TEXT DEFAULT '[]'"),
        ],
        "pages": [
            ("parent_id", "INTEGER"),
            ("is_folder", "INTEGER DEFAULT 0"),
            ("sort_order", "INTEGER DEFAULT 0"),
        ],
    }
    inspector = inspect(engine)
    with engine.connect() as conn:
        for table, columns in migrations.items():
            if not inspector.has_table(table):
                continue
            existing = {c["name"] for c in inspector.get_columns(table)}
            for col_name, col_def in columns:
                if col_name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}"))
        conn.commit()


_migrate_db()

app = FastAPI(title="UI 积木 - UI自动化测试编排系统", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 静态文件（上传的截图）
upload_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(upload_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")

# 注册路由
app.include_router(projects.router)
app.include_router(pages.router)
app.include_router(elements.router)
app.include_router(testcases.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "message": "UI 积木系统运行中"}
