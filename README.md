# UI 积木（UIBlock）- UI 自动化测试编排系统

轻量级、可视化、低代码的 UI 自动化测试编排系统。上传截图 → 人工/AI 标注元素 → 拖拽积木编排 → 一键生成 pytest 脚本 → 实时执行。

## 快速启动

### 环境要求

- Node.js ≥ 18
- Python ≥ 3.9
- pytest、Appium-Python-Client（执行测试用）

### 1. 启动后端（端口 8000）

```bash
cd backend

# 首次运行需安装依赖
pip3 install -r requirements.txt
pip3 install 'uvicorn[standard]'   # WebSocket 支持
pip3 install pytest Appium-Python-Client   # 执行测试用

# 启动
uvicorn app.main:app --reload --port 8000
```

验证：访问 http://localhost:8000/api/health 或 http://localhost:8000/docs（Swagger 文档）

### 2. 启动前端（端口 5173）

```bash
cd frontend

# 首次运行需安装依赖
npm install

# 启动
npm run dev
```

浏览器打开：**http://localhost:5173**

## 使用流程

1. **新建项目**：左侧面板 → 「+」→ 填写名称、选择平台（Android/iOS/Web/Desktop）
2. **上传截图**：「页面」区域 → 「上传截图」
3. **标注元素**：「元素标注」Tab → 「开始标注」→ 鼠标框选元素区域 → 填写名称/类型/定位 → 保存标注
4. **管理元素**：「元素管理」Tab → 编辑/删除元素
5. **积木编排**：「积木编排」Tab → 新建测试用例 → 选择动作 → 「添加积木」→ 双击积木配置参数/绑定元素
6. **生成脚本**：「生成脚本」→ 预览 pytest 代码
7. **实时执行**：执行面板 → 「运行」→ 实时查看 pytest 日志与结果

## 项目结构

```
PIC-AUTO/
├── PRD.md                    # 产品需求文档
├── frontend/                 # React + Vite + ReactFlow + Ant Design
│   └── src/
│       ├── types/            # 类型定义
│       ├── services/api.ts   # API 服务层
│       ├── stores/           # Zustand 状态管理
│       ├── components/       # 标注画布/元素面板/积木画布/执行面板
│       └── pages/            # 主编辑器页面
└── backend/                  # FastAPI + SQLAlchemy + SQLite
    └── app/
        ├── main.py           # 应用入口
        ├── models.py         # 数据模型
        ├── schemas.py        # Pydantic 校验
        ├── routers/          # 项目/页面/元素/用例 API + WebSocket
        └── services/         # pytest 脚本生成器 + 执行器
```

## 核心 API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/projects | 创建项目 |
| POST | /api/projects/{id}/pages/upload | 上传截图 |
| POST | /api/pages/{id}/elements/batch | 批量保存元素 |
| PUT | /api/testcases/{id}/steps | 保存编排步骤 |
| POST | /api/testcases/{id}/generate | 生成 pytest 脚本 |
| WS | /api/testcases/{id}/run | 实时执行（WebSocket 日志流） |

完整文档：http://localhost:8000/docs

## 注意事项

- 生成的脚本基于 Appium，执行前需启动 Appium Server 并连接设备/模拟器
- 若本机未装 Appium，执行会报错属正常现象，脚本本身可下载后在任意环境运行
- 数据存储于 `backend/uiblock.db`（SQLite），上传的截图存于 `backend/uploads/`

## 多定位器备用机制

每个元素支持配置最多 **5 个定位器**（按优先级排列），主定位器失败时自动尝试备用：

| 类型 | 含义 | 值格式 | 示例 |
|------|------|--------|------|
| `coordinate` | 坐标 | `(x, y)` 中心点 | `(540, 1200)` |
| `id` | Resource ID | `包名:id/名称` | `com.app:id/btn_login` |
| `text` | 文本内容 | **真实文字** | `登录`、`确定` |
| `accessibility_id` | 无障碍 ID | contentDescription | `btn_login` |
| `xpath` | XPath | XML 路径 | `//android.widget.Button` |

> ⚠️ `text` 类型的值必须是真实文字，不能填坐标。系统会自动校验。

## 错误处理与知识库

执行失败时，系统会自动分析错误日志并给出**友好的中文提示**（而非原始堆栈）：

```
❌ 执行失败，错误分析：
  🔍 找不到页面元素
  💡 请检查：1) 元素定位器是否正确  2) 页面是否已加载完成  3) resource-id 是否变化
```

详细错误码文档：[docs/ERROR_KNOWLEDGE_BASE.md](docs/ERROR_KNOWLEDGE_BASE.md)
