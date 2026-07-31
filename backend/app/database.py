import os
import shutil
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

# 数据库路径：优先读环境变量 BLOCKTEST_DB，默认使用 uiblock.db
DB_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_NAME = os.environ.get("BLOCKTEST_DB", "uiblock.db")
DB_PATH = os.path.join(DB_DIR, DB_NAME)

# 如果当前数据库不存在，尝试从旧库迁移（按优先级查找）
_OLD_DB_NAMES = ["blocktest.db"]
if not os.path.exists(DB_PATH):
    for old_name in _OLD_DB_NAMES:
        old_path = os.path.join(DB_DIR, old_name)
        if os.path.exists(old_path):
            shutil.copy2(old_path, DB_PATH)
            print(f"📦 已从旧数据库迁移: {old_name} → {DB_NAME}")
            break

SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
