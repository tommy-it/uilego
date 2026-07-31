# UI 积木 - 轻量级 UI 自动化测试编排系统 PRD

> 版本：v1.0\
> 更新日期：2026-07-27\
> 状态：评审中

***

## 一、产品概述

### 1.1 产品定位

一款**轻量级、可视化、低代码**的 UI 自动化测试编排系统。用户通过上传 UI 截图或元素描述文件，系统借助多模态 LLM 自动识别页面元素，用户以"搭积木"拖拽方式编排测试步骤，最终一键生成可执行的 Python（pytest）自动化测试脚本。

### 1.2 产品名称

**UI 积木（UIBlock）**

### 1.3 目标用户

| 角色       | 场景                  |
| -------- | ------------------- |
| QA 测试工程师 | 快速构建回归测试用例，减少手写脚本成本 |
| 开发工程师    | 冒烟测试、CI/CD 集成       |
| 测试管理者    | 可视化查看/维护测试用例        |
| 非技术人员    | 通过拖拽完成简单 UI 验证      |

### 1.4 核心价值

* **低门槛**：无需编程基础即可编排测试流程

* **高效率**：AI 识别元素 + 拖拽编排，分钟级生成脚本

* **可维护**：元素与逻辑分离，页面变更只需更新元素库

* **标准化**：输出标准 pytest 脚本，无缝接入 CI/CD

* **无锁定**：引擎可插拔，不绑定任何单一框架

### 1.5 成功指标（North Star）

> 用户从上传截图到生成可运行 pytest 脚本 ≤ **10 分钟**

***

## 二、竞品分析

### 2.1 对标产品

| 产品                     | 类型         | 核心能力                            | 与本产品重合度 |
| ---------------------- | ---------- | ------------------------------- | ------- |
| **Airtest (网易)**       | 开源框架 + IDE | 截图图像识别、Poco UI 树、录制回放、Python 脚本 | ⭐⭐⭐⭐⭐   |
| **Katalon Studio**     | 商业平台       | 录制 + 关键字驱动 + 拖拽编排、对象库、CI 集成     | ⭐⭐⭐⭐    |
| **Testim (Tricentis)** | 商业 SaaS    | AI 智能定位、拖拽编排、自动维护/自愈            | ⭐⭐⭐⭐    |
| **mabl**               | 商业 SaaS    | 低代码、AI 自愈、可视化流程                 | ⭐⭐⭐     |
| **Midscene.js**        | 开源框架       | 多模态 LLM 视觉驱动、自然语言操作、全平台         | ⭐⭐⭐⭐    |
| **RunnerGo**           | 国产开源       | 拖拉拽编排、接口+性能+UI                  | ⭐⭐⭐     |
| **Appium Inspector**   | 开源工具       | 元素识别导出 XML/JSON                 | ⭐⭐      |

### 2.2 差异化定位

| 维度    | Airtest        | Katalon     | Midscene | **UI 积木（本产品）**     |
| ----- | -------------- | ----------- | -------- | ---------------- |
| 使用方式  | 写代码/录制         | 录制+关键字      | 写代码/YAML | **零代码拖拽**        |
| 元素管理  | 截图硬编码          | 对象库         | 无（自然语言）  | **可视化元素库+版本管理**  |
| 编排方式  | 线性脚本           | 表格/流程       | 线性脚本     | **积木画布+分支/循环**   |
| AI 能力 | 图像CV           | 有限          | 多模态LLM   | **多模态LLM（可插拔）**  |
| 目标用户  | 开发者            | QA/开发       | 开发者      | **QA/非技术人员**     |
| 输出    | 私有脚本           | 私有格式        | 运行时执行    | **标准 pytest 项目** |
| 平台    | Android/iOS/游戏 | Web/App/API | 全平台      | **全平台**          |

### 2.3 核心壁垒

1. **可视化积木编排**（前端交互体验）
2. **统一元素管理**（数据层，元素与逻辑分离）
3. **多引擎适配**（LLM / CV / 结构化，可插拔）
4. **标准代码输出**（pytest，无厂商锁定）

***

## 三、技术决策

### 3.1 核心决策

| 决策项   | 选择                               | 理由                     |
| ----- | -------------------------------- | ---------------------- |
| 目标平台  | **通用**（Web / Android / iOS / 桌面） | 统一抽象层适配多端              |
| 元素定位  | **双模式**：图像定位 + 结构化定位             | 图像兜底无标注元素，结构化保证精确度     |
| AI 引擎 | **多模态 LLM**，插件化架构                | 不绑定单一框架，Midscene 为可选插件 |
| 脚本输出  | **标准 pytest**                    | 无锁定，可直接接入 CI/CD        |

### 3.2 引擎无关架构（三级降级）

```
┌────────────────────────────────────────────────────────────┐
│                    UI 积木系统                                │
│                                                            │
│   积木编排 → 统一动作协议 → 脚本生成器                        │
│                    │                                       │
│                    ▼                                       │
│         ┌─────────────────────┐                            │
│         │   AI Engine 抽象层   │  ← 统一接口                │
│         │  (Engine Interface) │                            │
│         └────────┬────────────┘                            │
│                  │                                         │
│     ┌────────────┼────────────┬──────────────┐            │
│     ▼            ▼            ▼              ▼            │
│ ┌────────┐ ┌─────────┐ ┌─────────┐  ┌───────────┐       │
│ │直接 LLM │ │Midscene │ │ Airtest │  │ Appium/   │       │
│ │API 调用 │ │(可选)    │ │(图像CV) │  │ ADB 结构  │       │
│ └────────┘ └─────────┘ └─────────┘  └───────────┘       │
│                                                          │
│         ┌─────────────────────────────┐                  │
│         │  Level 0: 纯人工标注模式     │  ← 零依赖兜底     │
│         │  (无需任何 AI / 网络)        │                  │
│         └─────────────────────────────┘                  │
└────────────────────────────────────────────────────────────┘
```

**三级降级策略：**

| 级别          | 模式        | 依赖                     | 说明                     |
| ----------- | --------- | ---------------------- | ---------------------- |
| Level 3     | LLM 智能识别  | 多模态 LLM API            | 上传截图自动识别全部元素           |
| Level 2     | CV 辅助识别   | OpenCV / PaddleOCR（本地） | 离线图像识别，无需网络            |
| Level 1     | 结构化导入     | 无                      | 导入 XML/JSON/HTML 元素文件  |
| **Level 0** | **纯人工标注** | **无（零依赖）**             | **用户在截图上手动框选、命名、定义元素** |

> 无论用户有无 LLM、有无网络、有无设备，**Level 0 保证系统始终可用**。

### 3.3 双模式定位策略

| 模式               | 适用场景                            | 生成代码示例                                            |
| ---------------- | ------------------------------- | ------------------------------------------------- |
| **图像定位（LLM 视觉）** | 无 resource-id、canvas、游戏 UI、图标按钮 | `ai.aiAct("点击右上角的搜索图标")`                          |
| **结构化定位**        | 有明确 xpath/id 的 Web/App 元素       | `driver.find_element(By.ID, "btn_login").click()` |
| **混合模式（推荐）**     | 优先结构化，失败时 fallback 到视觉          | 生成 try/except 双路径代码                               |

### 3.4 支持的 LLM 模型

| 模型                  | 用途              | 部署方式      |
| ------------------- | --------------- | --------- |
| Qwen-VL / UI-TARS   | 元素识别 + 视觉定位（推荐） | 自部署 / API |
| GPT-4o / Gemini 2.5 | 页面理解 + 脚本生成     | API       |
| 本地小模型               | 轻量分类（按钮/输入框/图片） | 本地推理      |

### 3.5 技术栈

| 层      | 选型                                             |
| ------ | ---------------------------------------------- |
| 前端     | React + Vite + ReactFlow（积木画布）+ Ant Design     |
| 后端     | Python FastAPI                                 |
| AI 识别  | 多模态 LLM API（默认）/ Midscene SDK（可选）/ OpenCV（可选）  |
| 元素文件解析 | lxml（XML）+ BeautifulSoup（HTML）+ json           |
| 脚本生成   | Jinja2 模板引擎                                    |
| 存储     | SQLite（MVP）→ PostgreSQL（生产）                    |
| 执行引擎   | pytest + Appium / Playwright / ADB / pyautogui |

***

## 四、功能模块

### 4.1 元素采集模块

| 功能                 | 描述                                                               | 优先级    |
| ------------------ | ---------------------------------------------------------------- | ------ |
| **纯人工标注（Level 0）** | 上传截图后，用户手动框选区域 → 命名 → 选类型 → 填定位信息，**零 AI 依赖**                    | **P0** |
| 截图上传 + AI 识别       | 支持 PNG/JPG/WEBP，上传后 LLM 自动识别 UI 元素                               | P0     |
| 元素文件导入             | 支持 XML（Android layout / iOS XIB）、JSON（Appium inspector）、HTML DOM | P1     |
| 批量导入               | 多页面/多截图批量上传，自动建立页面层级关系                                           | P1     |
| 识别结果预览             | 以标注框（Bounding Box）在截图上高亮显示识别到的元素                                 | P0     |
| 元素属性提取             | 自动提取：类型、文本、坐标区域、层级关系、定位建议                                        | P0     |
| AI 识别 + 人工校正       | AI 识别后用户可修改/删除/补充元素                                              | P0     |

#### 纯人工标注模式详细设计（Level 0）

**适用场景：** 无 LLM API、无网络、无设备连接、或用户只想快速手动定义几个元素。

**交互流程：**

```
上传截图 → 进入标注模式 → 鼠标框选区域 → 弹出属性面板 → 填写信息 → 保存
                ↑                                              │
                └──────────── 继续框选下一个元素 ←──────────────┘
```

**标注画布功能：**

| 功能   | 描述                                                             |
| ---- | -------------------------------------------------------------- |
| 矩形框选 | 鼠标拖拽画出元素区域（Bounding Box）                                       |
| 元素命名 | 框选后弹出输入框，填写元素名称（如"登录按钮"）                                       |
| 类型选择 | 下拉选择：button / input / image / text / icon / list\_item / other |
| 定位方式 | 手动填写：xpath / resource-id / text / 坐标（自动填入框选坐标）/ 自然语言描述         |
| 编辑框选 | 拖动/缩放已有标注框，调整位置                                                |
| 删除标注 | 选中后 Delete 键删除                                                 |
| 标注列表 | 右侧面板列出当前页面所有已标注元素                                              |
| 放大镜  | 截图支持缩放，精确框选小元素                                                 |
| 快捷键  | N=新建框选, Delete=删除, Esc=取消, Ctrl+S=保存                           |

**生成的元素数据结构（与 AI 识别完全一致）：**

```json
{
  "name": "登录按钮",
  "type": "button",
  "bbox": {"x": 120, "y": 580, "width": 200, "height": 48},
  "locator_type": "id",
  "locator_value": "com.example.app:id/btn_login",
  "description": "页面底部的蓝色登录按钮",
  "source": "manual"  // 标记来源：manual | ai | import
}
```

> **关键设计：人工标注的元素与 AI 识别的元素数据结构完全一致，后续积木编排、脚本生成流程无任何差异。**

### 4.2 元素管理模块

| 功能       | 描述                                    | 优先级 |
| -------- | ------------------------------------- | --- |
| 元素列表     | 表格展示所有已识别元素，支持搜索/筛选/排序                | P0  |
| 元素编辑     | 修改名称、定位方式（xpath/id/text/坐标/自然语言描述）、分组 | P0  |
| 元素分组     | 按页面/模块/功能分组管理                         | P0  |
| 元素版本     | 支持快照版本，页面迭代时可对比差异                     | P2  |
| 保存 & 持久化 | 编辑后实时保存，支持导出 JSON/YAML 元素库            | P0  |

### 4.3 动作定义模块

| 动作类型             | 参数                      | 优先级 |
| ---------------- | ----------------------- | --- |
| 点击（Tap/Click）    | 目标元素、点击次数、长按时长          | P0  |
| 滑动（Swipe/Scroll） | 方向、距离比例、速度、目标元素         | P0  |
| 输入（Input）        | 目标输入框、输入文本、是否清空         | P0  |
| 断言（Assert）       | 目标元素、断言类型（存在/文本/属性）、期望值 | P0  |
| 等待（Wait）         | 类型（固定/元素出现/消失）、超时时间     | P0  |
| 截图（Screenshot）   | 保存路径、是否附加到报告            | P1  |
| 条件分支（If/Else）    | 条件表达式、满足/不满足时的子流程       | P1  |
| 循环（Loop）         | 循环次数/条件、子流程             | P1  |
| 返回（Back）         | 系统返回操作                  | P1  |
| 异常处理（Try/Catch）  | 失败重试次数、异常截图、fallback 流程 | P1  |
| 自定义脚本            | 嵌入自定义 Python 代码片段       | P2  |

### 4.4 可视化编排模块（搭积木核心）

| 功能             | 描述                      | 优先级 |
| -------------- | ----------------------- | --- |
| 画布（Canvas）     | 中央拖拽区域，流程图/积木块形式展示测试步骤  | P0  |
| 积木块拖拽          | 左侧动作面板 → 拖入画布，自动串联为执行序列 | P0  |
| 元素绑定           | 将元素库中的元素拖拽绑定到动作积木上      | P0  |
| 连线编排           | 支持顺序、并行、条件分支的连线         | P1  |
| 步骤参数配置         | 点击积木块弹出右侧参数面板           | P0  |
| 实时预览           | 编排完成后预览生成的脚本结构          | P0  |
| 模板库            | 常用场景模板（登录、列表翻页、表单填写）    | P1  |
| 撤销/重做          | Ctrl+Z / Ctrl+Y         | P0  |
| 子流程复用          | 一组积木保存为子流程，其他用例中引用      | P2  |
| 单步调试 / Dry Run | 逐步验证编排逻辑正确性             | P2  |

### 4.5 脚本生成模块

| 功能           | 描述                                                | 优先级 |
| ------------ | ------------------------------------------------- | --- |
| 生成 pytest 脚本 | 标准结构：conftest.py + test\_\*.py                    | P0  |
| 多框架输出        | pytest（默认）、unittest、Appium+pytest、Selenium+pytest | P1  |
| 代码风格配置       | Page Object 模式 / 线性脚本模式                           | P1  |
| 参数化          | @pytest.mark.parametrize + Excel/CSV 数据源          | P1  |
| 一键下载         | 生成 .zip 完整可运行项目                                   | P0  |
| 在线预览         | 页面内代码高亮显示，支持复制                                    | P0  |
| 增量更新         | 修改积木后重新生成，仅更新变化部分                                 | P2  |

### 4.6 执行与报告模块（扩展）

| 功能       | 描述                               | 优先级 |
| -------- | -------------------------------- | --- |
| 在线执行     | 连接真机/模拟器/浏览器远程执行                 | P2  |
| 执行日志     | 实时显示步骤日志与截图                      | P2  |
| 测试报告     | Allure / HTML 报告，含通过率、耗时、失败截图    | P2  |
| CI/CD 集成 | CLI 工具或 API，接入 Jenkins/GitLab CI | P2  |

***

## 五、系统架构

### 5.1 整体架构

```
┌─────────────────────────────────────────────────────────┐
│                   前端 (React + Vite)                     │
│  ┌──────────┐ ┌──────────────┐ ┌────────────────────┐  │
│  │ 元素管理  │ │ 积木画布      │ │ 脚本预览/下载      │  │
│  │ 页面     │ │ (ReactFlow)  │ │ (Monaco Editor)   │  │
│  └──────────┘ └──────────────┘ └────────────────────┘  │
└─────────────────────────┬───────────────────────────────┘
                          │ REST / WebSocket
┌─────────────────────────┴───────────────────────────────┐
│                  后端 (Python FastAPI)                    │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ 元素识别服务  │  │ 编排引擎      │  │ 脚本生成器    │  │
│  │ (AI Engine)  │  │ (DAG 解析)   │  │ (Jinja2)    │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ 项目管理     │  │ 执行调度      │  │ 文件存储      │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────┐
│                    存储层                                 │
│     SQLite / PostgreSQL  +  文件存储 (Local / OSS)       │
└─────────────────────────────────────────────────────────┘
```

### 5.2 AI 引擎抽象层

```python
# 统一引擎接口 - 所有引擎必须实现
class AIEngine(ABC):
    """AI 引擎抽象基类"""

    @abstractmethod
    def recognize_elements(self, screenshot: bytes) -> list[Element]:
        """识别截图中的 UI 元素"""
        ...

    @abstractmethod
    def locate_element(self, screenshot: bytes, description: str) -> BBox:
        """根据自然语言描述定位元素坐标"""
        ...

    @abstractmethod
    def generate_action_code(self, step: Step) -> str:
        """生成单步动作代码"""
        ...

# 实现 1：纯 LLM API（默认，零外部依赖）
class LLMEngine(AIEngine): ...

# 实现 2：Midscene（可选插件）
class MidsceneEngine(AIEngine): ...

# 实现 3：Airtest 图像识别（可选插件）
class AirtestEngine(AIEngine): ...

# 实现 4：结构化解析（Appium/ADB/Playwright）
class StructuredEngine(AIEngine): ...
```

### 5.3 无 Midscene 时的替代方案

| 能力    | 替代方案                                           | 说明                      |
| ----- | ---------------------------------------------- | ----------------------- |
| 元素识别  | 直接调用多模态 LLM API                                | 截图→base64→LLM→返回元素 JSON |
| 图像定位  | OpenCV 模板匹配 + PaddleOCR                        | 本地运行，无需外部框架             |
| 结构化定位 | Appium / ADB uiautomator dump / Playwright DOM | 获取 UI 树 XML             |
| 动作执行  | Appium / ADB / Playwright / pyautogui          | 标准自动化驱动                 |
| 脚本生成  | 纯 pytest + appium/selenium 代码                  | 不依赖任何 AI 框架             |

***

## 六、核心用户流程

### 6.1 主流程（多路径）

```
路径 A（有 LLM）：
上传截图 → AI自动识别 → 人工校验/补充 → 保存元素库

路径 B（无 LLM，有元素文件）：
导入 XML/JSON → 自动解析元素 → 人工校验 → 保存元素库

路径 C（纯人工，零依赖）：
上传截图 → 手动框选标注 → 填写属性 → 保存元素库

────────────── 以下流程完全一致 ──────────────

创建测试用例 → 拖拽积木编排步骤 → 绑定元素+配置参数 → 预览
                                                    ↓
                              生成 pytest 脚本 → 下载/在线执行 → 查看报告
```

### 6.2 典型用户故事

**故事 1：登录流程测试**

> 作为 QA，我上传 App 登录页截图，系统识别出用户名框、密码框、登录按钮。
> 我拖入"点击→输入→点击→输入→点击→断言"6 个积木，绑定对应元素，
> 一键生成 pytest 脚本，下载后直接运行通过。

**故事 2：列表滑动验证**

> 作为 QA，我需要验证商品列表可以正常滑动加载。
> 我上传列表页截图，编排"断言元素存在→滑动→等待→断言新元素出现"，
> 生成带循环的 pytest 脚本。

**故事 3：多页面表单填写**

> 作为 QA，我有一个 3 步表单（基本信息→地址→支付）。
> 我分别上传 3 张截图，建立 3 个页面的元素组，
> 编排跨页面流程，生成 Page Object 模式的 pytest 项目。

***

## 七、数据模型

### 7.1 核心实体

```
Project (项目)
 ├── id, name, description, platform, created_at
 │
 ├── Page (页面)
 │    ├── id, project_id, name, screenshot_path
 │    │
 │    └── Element (元素)
 │         ├── id, page_id, name, type (button/input/image/text/list)
 │         ├── locator_type (xpath/id/text/coordinate/natural_language)
 │         ├── locator_value, bbox (x, y, w, h)
 │         ├── description, group, version
 │         └── created_at, updated_at
 │
 ├── TestCase (测试用例)
 │    ├── id, project_id, name, description
 │    │
 │    └── Step (步骤/积木)
 │         ├── id, testcase_id, order, action_type
 │         ├── target_element_id, params (JSON)
 │         ├── children (子流程), condition
 │         └── created_at, updated_at
 │
 ├── Script (生成脚本)
 │    ├── id, testcase_id, version, framework
 │    ├── code_content, file_structure (JSON)
 │    └── generated_at
 │
 └── Engine Config (引擎配置)
      ├── id, project_id, engine_type
      ├── model_name, api_key_ref, endpoint
      └── fallback_engine
```

### 7.2 元素类型枚举

```
button | input | image | text | checkbox | radio | 
switch | list_item | tab | icon | link | textarea | other
```

### 7.3 动作类型枚举

```
tap | long_press | swipe | input_text | clear_input |
assert_exists | assert_text | assert_attr | wait | 
screenshot | back | if_else | loop | try_catch | custom_script
```

***

## 八、生成脚本示例

### 8.1 纯 Appium + pytest（无 AI 框架依赖）

```python
# test_login.py - 由「UI 积木」自动生成
import pytest
from appium import webdriver
from appium.webdriver.common.appiumby import AppiumBy
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


@pytest.fixture
def driver():
    """初始化 Appium Driver"""
    caps = {
        "platformName": "Android",
        "deviceName": "emulator-5554",
        "appPackage": "com.example.app",
        "appActivity": ".MainActivity",
    }
    driver = webdriver.Remote("http://localhost:4723/wd/hub", caps)
    yield driver
    driver.quit()


class TestLogin:
    """登录流程测试 - 自动生成于 2026-07-27"""

    def test_login_success(self, driver):
        wait = WebDriverWait(driver, 10)

        # Step 1: 点击 [用户名输入框]
        el = wait.until(EC.presence_of_element_located(
            (AppiumBy.ID, "com.example.app:id/et_username")))
        el.click()

        # Step 2: 输入用户名
        el.send_keys("testuser")

        # Step 3: 点击 [密码输入框]
        driver.find_element(AppiumBy.ID, "com.example.app:id/et_password").click()

        # Step 4: 输入密码
        driver.find_element(AppiumBy.ID, "com.example.app:id/et_password").send_keys("123456")

        # Step 5: 点击 [登录按钮]
        driver.find_element(AppiumBy.ID, "com.example.app:id/btn_login").click()

        # Step 6: 断言登录成功
        welcome = wait.until(EC.presence_of_element_located(
            (AppiumBy.ID, "com.example.app:id/tv_welcome")))
        assert welcome.is_displayed(), "登录成功页面未显示"
```

### 8.2 Midscene + pytest（可选，需安装 midscene）

```python
# test_login_midscene.py - 由「UI 积木」自动生成（Midscene 模式）
import pytest
from midscene import Agent


@pytest.fixture
def ai(device):
    """初始化 Midscene AI Agent"""
    return Agent(device)


class TestLogin:
    """登录流程测试 - Midscene 视觉驱动"""

    def test_login_success(self, ai):
        # Step 1: 点击用户名输入框
        ai.aiAct("点击用户名输入框")

        # Step 2: 输入用户名
        ai.aiAct("在用户名输入框中输入 'testuser'")

        # Step 3: 点击密码输入框
        ai.aiAct("点击密码输入框")

        # Step 4: 输入密码
        ai.aiAct("在密码输入框中输入 '123456'")

        # Step 5: 点击登录按钮
        ai.aiAct("点击登录按钮")

        # Step 6: 断言登录成功
        ai.aiAssert("页面显示欢迎信息或首页内容")
```

### 8.3 混合模式（结构化优先，图像兜底）

```python
# test_login_hybrid.py - 由「UI 积木」自动生成（混合模式）
import pytest
from appium import webdriver
from appium.webdriver.common.appiumby import AppiumBy


class TestLogin:
    """登录流程测试 - 混合定位模式"""

    def test_login_success(self, driver, ai_fallback):
        # Step 5: 点击 [登录按钮]（结构化优先，图像兜底）
        try:
            driver.find_element(AppiumBy.ID, "btn_login").click()
        except Exception:
            ai_fallback.aiAct("点击登录按钮")
```

***

## 九、非功能性需求

| 维度    | 要求                                        |
| ----- | ----------------------------------------- |
| 性能    | 单张截图元素识别 ≤ 5s；脚本生成 ≤ 2s                   |
| 识别准确率 | LLM 元素识别准确率 ≥ 85%，支持人工校正                  |
| 兼容性   | Web（Chrome/Firefox/Safari）、Android、iOS、桌面 |
| 可扩展   | 动作类型、定位方式、AI 引擎、生成模板均支持插件扩展               |
| 安全    | 项目数据隔离，API Key 加密存储，支持私有化部署               |
| 易用性   | 新用户 10 分钟内完成首个用例编排                        |
| 并发    | 支持多用户同时编辑不同项目                             |

***

## 十、MVP 范围（第一期）

### P0 - 必须交付

* [x] **纯人工标注模式**（上传截图 → 手动框选 → 命名/定位 → 保存，零依赖）

* [x] 截图上传 + LLM 元素识别（有 API 时自动启用）+ 识别结果可视化标注

* [x] AI 识别 + 人工校正（修改/删除/补充）

* [x] 元素编辑/分组/保存

* [x] 积木拖拽编排（顺序执行）

* [x] 基础动作：点击 / 滑动 / 输入 / 断言 / 等待

* [x] 生成 pytest 脚本 + 在线预览 + 下载

### P1 - 重要增强

* [ ] XML/JSON/HTML 元素文件导入

* [ ] 条件分支 / 循环 / 异常处理积木

* [ ] 模板库（登录、列表、表单）

* [ ] Page Object 模式输出

* [ ] 参数化（Excel/CSV 数据驱动）

* [ ] 操作录制（辅助生成积木）

### P2 - 远期规划

* [ ] 在线执行 + 实时日志

* [ ] Allure 测试报告

* [ ] CI/CD 集成（CLI / API）

* [ ] AI 自愈（元素变更自动修复定位）

* [ ] 多人协作 + 权限 + 评审

* [ ] 元素版本对比

***

## 十一、风险与依赖

| 风险           | 影响        | 缓解措施                              |
| ------------ | --------- | --------------------------------- |
| LLM API 不可用  | 无法自动识别    | **Level 0 纯人工标注始终可用**，系统不依赖任何外部服务 |
| LLM 识别准确率不稳定 | 用户体验差     | 人工校正兜底 + 多模型投票                    |
| LLM API 成本   | 大量截图识别费用高 | 本地小模型预分类 + 缓存 + 人工模式免费            |
| 多平台驱动兼容      | 生成脚本运行失败  | MVP 先聚焦 Android + Web             |
| 积木编排复杂度      | 前端交互难度大   | 参考 ReactFlow 成熟方案                 |
| 生成代码质量       | 用户不信任     | 提供代码模板 + 注释 + 最佳实践                |

***

## 十二、里程碑计划

| 阶段          | 时间       | 交付物                        |
| ----------- | -------- | -------------------------- |
| M1 - 原型验证   | 第 1-2 周  | 截图上传→LLM识别→元素列表（后端 API）    |
| M2 - 积木 MVP | 第 3-4 周  | ReactFlow 画布 + 基础拖拽编排      |
| M3 - 脚本生成   | 第 5-6 周  | Jinja2 模板 → pytest 输出 + 下载 |
| M4 - 体验优化   | 第 7-8 周  | 元素文件导入 + 模板库 + 参数化         |
| M5 - 扩展能力   | 第 9-12 周 | 在线执行 + 报告 + CI/CD          |

***

## 附录 A：API 接口概览

| 方法   | 路径                           | 说明         |
| ---- | ---------------------------- | ---------- |
| POST | /api/projects                | 创建项目       |
| POST | /api/pages/upload            | 上传截图/元素文件  |
| POST | /api/pages/{id}/recognize    | 触发 AI 元素识别 |
| GET  | /api/pages/{id}/elements     | 获取页面元素列表   |
| PUT  | /api/elements/{id}           | 编辑元素       |
| POST | /api/testcases               | 创建测试用例     |
| PUT  | /api/testcases/{id}/steps    | 保存编排步骤     |
| POST | /api/testcases/{id}/generate | 生成脚本       |
| GET  | /api/testcases/{id}/script   | 获取生成结果     |
| GET  | /api/testcases/{id}/download | 下载脚本包      |

***

## 附录 B：引擎配置示例

```yaml
# engine_config.yaml
engine:
  primary: llm          # 主引擎：llm | midscene | airtest
  fallback: structured  # 兜底引擎

llm:
  provider: qwen        # qwen | openai | gemini | local
  model: qwen-vl-max
  api_key: ${QWEN_API_KEY}
  endpoint: https://dashscope.aliyuncs.com/api/v1

midscene:  # 可选
  enabled: false
  model: UI-TARS

structured:
  android: adb
  ios: appium
  web: playwright
```
