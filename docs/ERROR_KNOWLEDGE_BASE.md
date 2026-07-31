# UI 积木 - 错误码知识库

> 版本：v1.0 | 更新日期：2026-07-27

本文档收录 UI 自动化执行过程中常见错误的分类、原因和解决方案。
错误分类逻辑已内置于 `backend/app/services/executor.py` 的 `ERROR_PATTERNS` 中。

---

## 元素定位类

### element_not_found - 找不到页面元素
**错误标识：** `NoSuchElementError` / `NoSuchElementException`
**常见原因：**
- 元素定位器（id/xpath/text）填写错误
- 页面尚未加载完成，元素还不存在
- 应用版本更新，resource-id 或文本发生变化
- 元素被隐藏或覆盖

**解决方案：**
1. 在「元素管理」中检查定位器是否正确
2. 使用多定位器 fallback（系统自动尝试备用定位器）
3. 在步骤前加「等待」操作确保页面加载
4. 重新标注元素，获取最新的 resource-id

---

### timeout - 等待元素超时
**错误标识：** `TimeoutException`
**常见原因：**
- 网络慢导致页面加载延迟
- 元素确实不存在但等待时间用尽
- 页面跳转动画未完成

**解决方案：**
1. 增加默认等待时间（当前 10 秒）
2. 在操作步骤前显式添加「等待」步骤
3. 确认前置步骤（如点击按钮）已成功执行

---

### stale_element - 元素引用失效
**错误标识：** `stale element reference`
**常见原因：**
- 页面刷新或跳转后，之前获取的元素引用失效
- DOM 结构发生变化

**解决方案：**
1. 在操作前重新定位元素
2. 在步骤间加适当等待

---

### invalid_locator - 定位器格式错误
**错误标识：** `InvalidSelectorError`
**常见原因：**
- XPath 语法错误
- 特殊字符未转义

**解决方案：**
1. 检查 XPath 语法（可用 Appium Inspector 验证）
2. 使用更简单的定位方式（如 id 或 text）

---

## 设备连接类

### no_device - 未检测到设备
**错误标识：** `Could not find a connected Android device`
**常见原因：**
- 未启动模拟器
- 真机未开启 USB 调试
- USB 线松动

**解决方案：**
1. 启动模拟器：Android Studio → AVD Manager → 启动
2. 真机：设置 → 开发者选项 → 开启 USB 调试
3. 验证：终端运行 `adb devices` 确认设备在线

---

### device_disconnected - 设备连接断开
**错误标识：** `Could not proxy`
**常见原因：**
- USB 连接中断
- 模拟器被关闭
- adb 服务异常

**解决方案：**
1. 检查 USB 连接
2. 重启模拟器
3. 终端运行 `adb kill-server && adb start-server` 重启 adb

---

## Appium 服务类

### connection_refused - 无法连接 Appium
**错误标识：** `Connection refused`
**常见原因：**
- Appium 服务未启动
- 项目配置中的 Appium 地址错误
- 端口被占用

**解决方案：**
1. 启动 Appium：终端运行 `appium`
2. 检查项目「运行配置」中的 Appium 地址（默认 `http://localhost:4723`）
3. 检查端口占用：`lsof -i :4723`

---

### invalid_endpoint - Appium 接口地址错误
**错误标识：** `UnknownCommandError`
**常见原因：**
- Appium 2.x 默认 base-path 是 `/`
- Appium 1.x 默认 base-path 是 `/wd/hub`
- 项目配置中的地址与实际 Appium 版本不匹配

**解决方案：**
1. 确认 Appium 版本：`appium --version`
2. Appium 2.x → 地址填 `http://localhost:4723`
3. Appium 1.x → 地址填 `http://localhost:4723/wd/hub`

---

### appium_server - Appium 驱动异常
**错误标识：** `UiAutomator2 server`
**常见原因：**
- UiAutomator2 驱动版本不兼容
- 设备 Android 版本过高或过低

**解决方案：**
1. 更新驱动：`appium driver update uiautomator2`
2. 检查 Appium 与设备 Android 版本的兼容性

---

## 应用类

### app_not_found - 无法启动目标应用
**错误标识：** `Cannot start the`
**常见原因：**
- appPackage 填写错误
- appActivity 填写错误
- 应用未安装到设备

**解决方案：**
1. 获取正确的包名和 Activity：
   ```bash
   # 打开目标应用后执行
   adb shell dumpsys window | grep mCurrentFocus
   ```
2. 在项目「运行配置」中更新 appPackage 和 appActivity
3. 确认应用已安装：`adb shell pm list packages | grep 包名`

---

### permission_denied - 权限被拒绝
**错误标识：** `SecurityError`
**常见原因：**
- 应用运行时弹出权限请求（如存储、位置权限）
- Appium 无权限操作系统设置

**解决方案：**
1. 在项目 Appium 配置中开启 `autoGrantPermissions: true`
2. 或在测试步骤中手动添加「点击允许」的操作

---

## 定位器类型规范

| 类型 | 含义 | 值格式 | 示例 |
|------|------|--------|------|
| `coordinate` | 坐标定位 | `(x, y)` 中心坐标 | `(540, 1200)` |
| `id` | Resource ID | `包名:id/名称` | `com.app:id/btn_login` |
| `text` | 文本内容 | 真实文字 | `登录`、`确定` |
| `accessibility_id` | 无障碍 ID | contentDescription 值 | `btn_login` |
| `xpath` | XPath 表达式 | XML 路径 | `//android.widget.Button[@text="登录"]` |

**⚠️ 规范提示：**
- `text` 类型的值**必须是真实文字**，不能是坐标 `(x, y)`
- `coordinate` 类型由系统自动计算（bbox 中心点），一般不需要手动修改
- 建议每个元素至少配置 2 个定位器，主定位器失败时自动用备用

---

## 多定位器 Fallback 机制

系统支持每个元素配置最多 **5 个定位器**，按优先级排序：

```
定位器 1 (主) → 失败 → 定位器 2 (备用) → 失败 → ... → 定位器 5 → 全部失败 → 报错
```

生成的代码结构：
```python
# [按钮名] 多定位器 fallback 链
el = None
try:
    el = wait.until(EC.presence_of_element_located(AppiumBy.ID, "com.app:id/btn"))
    print('✅ [按钮名] 主定位器(id)成功')
except Exception:
    print('⚠️ [按钮名] 定位器(id)失败，尝试备用...')
    try:
        el = wait.until(EC.presence_of_element_located(AppiumBy.XPATH, "//*[@text='按钮文字']"))
        print('✅ [按钮名] 备用定位器(text)成功')
    except Exception:
        el = None
if el is None:
    raise Exception('❌ [按钮名] 所有定位器均失败')
```
