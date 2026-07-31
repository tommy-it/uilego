"""pytest 脚本生成器 - 根据编排步骤生成标准 pytest 代码"""
from datetime import datetime
from typing import Optional, List, Dict
from ..models import TestCase, TestStep, Element


def _get_locator_code(locator_type: str, locator_value: str) -> str:
    """根据定位方式和值生成定位代码"""
    if locator_type == "id":
        return f'(AppiumBy.ID, "{locator_value}")'
    elif locator_type == "xpath":
        return f'(AppiumBy.XPATH, "{locator_value}")'
    elif locator_type == "text":
        return f'(AppiumBy.XPATH, "//*[@text=\'{locator_value}\']")'
    elif locator_type == "accessibility_id":
        return f'(AppiumBy.ACCESSIBILITY_ID, "{locator_value}")'
    elif locator_type == "coordinate":
        return None  # 坐标定位用 tap 方式
    elif locator_type == "natural_language":
        return None  # 自然语言用 AI 方式
    return f'(AppiumBy.ID, "{locator_value}")'


def _get_center(element: Element) -> tuple:
    """获取元素中心坐标"""
    cx = element.bbox_x + element.bbox_width // 2
    cy = element.bbox_y + element.bbox_height // 2
    return cx, cy


def _get_locators_for_element(element: Element) -> List[dict]:
    """获取元素的定位器列表（兼容新旧数据）"""
    locators = []
    # 优先使用多定位器
    if hasattr(element, 'locators') and element.locators:
        locators = element.locators
    elif element.locator_type and element.locator_value:
        locators = [{"type": element.locator_type, "value": element.locator_value}]
    return locators


def _generate_find_element_code(element: Element, action_desc: str) -> List[str]:
    """生成带 fallback 的元素查找代码，返回代码行列表"""
    locators = _get_locators_for_element(element)
    lines = []

    if not locators:
        lines.append(f"        # ⚠️ [{element.name}] 没有配置任何定位器")
        return lines

    # 过滤掉坐标类型（单独处理）
    standard_locators = [(loc["type"], loc["value"]) for loc in locators if _get_locator_code(loc["type"], loc["value"])]
    coord_locators = [loc for loc in locators if loc["type"] == "coordinate"]

    # 只有 1 个标准定位器：简单代码
    if len(standard_locators) == 1 and not coord_locators:
        lt, lv = standard_locators[0]
        code = _get_locator_code(lt, lv)
        lines.append(f"        el = wait.until(EC.presence_of_element_located{code})")
        return lines

    # 只有坐标定位器
    if not standard_locators and coord_locators:
        cx, cy = _get_center(element)
        lines.append(f"        # 坐标定位: ({cx}, {cy})")
        lines.append(f"        el = None  # 坐标元素")
        lines.append(f"        _tap_coord = ({cx}, {cy})")
        return lines

    # 多个定位器：生成 fallback 循环
    lines.append(f"        # [{element.name}] 多定位器 fallback")
    lines.append(f"        el = None")
    lines.append(f"        _locators_chain = [")
    for loc in locators:
        code = _get_locator_code(loc["type"], loc["value"])
        if code:
            lines.append(f"            {code},")
    lines.append(f"        ]")
    lines.append(f"        for _loc in _locators_chain:")
    lines.append(f"            try:")
    lines.append(f"                el = wait.until(EC.presence_of_element_located(_loc))")
    lines.append(f"                break")
    lines.append(f"            except Exception:")
    lines.append(f"                el = None")

    # 坐标 fallback
    if coord_locators:
        cx, cy = _get_center(element)
        lines.append(f"        if el is None:")
        lines.append(f"            _tap_coord = ({cx}, {cy})")

    # 最终校验
    lines.append(f"        if el is None and '_tap_coord' not in dir():")
    lines.append(f"            raise Exception('❌ [{element.name}] 所有定位器均失败，请检查元素配置')")

    return lines


def _generate_step_code(step: TestStep, element: Optional[Element], index: int) -> List[str]:
    """生成单个步骤的代码行"""
    lines = []
    action = step.action_type
    params = step.params
    el_name = element.name if element else "未知元素"

    lines.append(f"        # Step {index + 1}: {action} [{el_name}]")

    if action == "tap":
        if element:
            lines.extend(_generate_find_element_code(element, "tap"))
            lines.append(f"        if el:")
            lines.append(f"            el.click()")
            lines.append(f"        elif '_tap_coord' in dir():")
            lines.append(f"            driver.tap([_tap_coord])")
        else:
            lines.append(f"        # TODO: 未绑定目标元素")

    elif action == "long_press":
        duration = params.get("duration", 2)
        if element:
            lines.extend(_generate_find_element_code(element, "long_press"))
            lines.append(f"        if el:")
            lines.append(f"            TouchAction(driver).long_press(el, duration={int(duration * 1000)}).release().perform()")
            lines.append(f"        elif '_tap_coord' in dir():")
            lines.append(f"            driver.tap([_tap_coord], {int(duration * 1000)})")

    elif action == "swipe":
        direction = params.get("direction", "up")
        distance = params.get("distance", 0.5)
        lines.append(f"        size = driver.get_window_size()")
        if direction == "up":
            lines.append(f"        start_x, start_y = size['width'] // 2, int(size['height'] * 0.8)")
            lines.append(f"        end_x, end_y = size['width'] // 2, int(size['height'] * (0.8 - {distance}))")
        elif direction == "down":
            lines.append(f"        start_x, start_y = size['width'] // 2, int(size['height'] * 0.2)")
            lines.append(f"        end_x, end_y = size['width'] // 2, int(size['height'] * (0.2 + {distance}))")
        elif direction == "left":
            lines.append(f"        start_x, start_y = int(size['width'] * 0.8), size['height'] // 2")
            lines.append(f"        end_x, end_y = int(size['width'] * (0.8 - {distance})), size['height'] // 2")
        elif direction == "right":
            lines.append(f"        start_x, start_y = int(size['width'] * 0.2), size['height'] // 2")
            lines.append(f"        end_x, end_y = int(size['width'] * (0.2 + {distance})), size['height'] // 2")
        lines.append(f"        driver.swipe(start_x, start_y, end_x, end_y, 800)")

    elif action == "input_text":
        text = params.get("text", "")
        if element:
            lines.extend(_generate_find_element_code(element, "input_text"))
            lines.append(f"        if el:")
            lines.append(f"            el.clear()")
            lines.append(f"            el.send_keys(\"{text}\")")
            lines.append(f"        elif '_tap_coord' in dir():")
            lines.append(f"            driver.tap([_tap_coord])")
            lines.append(f"            driver.press_keycode(67)  # clear")
            lines.append(f"            # TODO: input text '{text}' via coordinate")

    elif action == "clear_input":
        if element:
            lines.extend(_generate_find_element_code(element, "clear_input"))
            lines.append(f"        if el:")
            lines.append(f"            el.clear()")

    elif action == "assert_exists":
        if element:
            lines.extend(_generate_find_element_code(element, "assert_exists"))
            lines.append(f"        if el:")
            lines.append(f"            assert el.is_displayed(), \"{el_name} 未显示\"")
            lines.append(f"        else:")
            lines.append(f"            raise AssertionError(\"❌ [{el_name}] 所有定位器均失败，元素不存在\")")

    elif action == "assert_text":
        expected = params.get("text", params.get("expected_value", ""))
        if element:
            lines.extend(_generate_find_element_code(element, "assert_text"))
            lines.append(f"        if el:")
            lines.append(f"            assert \"{expected}\" in el.text, f\"期望文本 '{expected}'，实际: {{el.text}}\"")

    elif action == "wait":
        timeout = params.get("timeout", 3)
        lines.append(f"        time.sleep({timeout})")

    elif action == "screenshot":
        lines.append(f"        driver.save_screenshot('step_{index + 1}.png')")

    elif action == "back":
        lines.append(f"        driver.back()")

    else:
        lines.append(f"        # TODO: unsupported action '{action}'")

    lines.append("")
    return lines


def generate_pytest_script(
    testcase: TestCase,
    steps: List[TestStep],
    element_map: Dict[int, Element],
    project=None,
) -> List[dict]:
    """生成完整的 pytest 脚本"""
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    # 生成合法的 Python 类名/函数名（中文转为拼音风格）
    safe_name = "".join(
        c if c.isascii() and (c.isalnum() or c == "_") else "_"
        for c in testcase.name.replace(" ", "_").replace("-", "_")
    ).strip("_") or "test_case"
    class_name = "Test" + "".join(w.capitalize() for w in safe_name.split("_") if w)
    func_name = "test_" + safe_name.lower()

    # 项目级 Appium 配置（无项目时使用默认值）
    appium_url = getattr(project, "appium_url", None) or "http://localhost:4723"
    device_name = getattr(project, "device_name", None) or "emulator-5554"
    app_package = getattr(project, "app_package", None) or "com.example.app"
    app_activity = getattr(project, "app_activity", None) or ".MainActivity"

    # 判断是否需要 time 和 TouchAction
    needs_time = any(s.action_type == "wait" for s in steps)
    needs_touch = any(s.action_type == "long_press" for s in steps)

    # 生成测试代码
    lines = []
    lines.append(f'"""')
    lines.append(f'{testcase.name}')
    lines.append(f'自动生成于 {now} - 由「UI 积木」UI自动化编排系统生成')
    lines.append(f'"""')
    lines.append(f"import pytest")
    if needs_time:
        lines.append(f"import time")
    lines.append(f"from appium import webdriver")
    lines.append(f"from appium.options.android import UiAutomator2Options")
    lines.append(f"from appium.webdriver.common.appiumby import AppiumBy")
    if needs_touch:
        lines.append(f"from appium.webdriver.common.touch_action import TouchAction")
    lines.append(f"from selenium.webdriver.support.ui import WebDriverWait")
    lines.append(f"from selenium.webdriver.support import expected_conditions as EC")
    lines.append("")
    lines.append("")
    lines.append("@pytest.fixture")
    lines.append("def driver():")
    lines.append('    """初始化 Appium Driver"""')
    lines.append("    options = UiAutomator2Options()")
    lines.append('    options.platform_name = "Android"')
    lines.append(f'    options.device_name = "{device_name}"')
    lines.append(f'    options.app_package = "{app_package}"')
    lines.append(f'    options.app_activity = "{app_activity}"')
    lines.append('    options.no_reset = True')
    lines.append(f'    drv = webdriver.Remote("{appium_url}", options=options)')
    lines.append("    yield drv")
    lines.append("    drv.quit()")
    lines.append("")
    lines.append("")
    lines.append(f"class {class_name}:")
    lines.append(f'    """{testcase.name}"""')
    lines.append("")
    lines.append(f"    def {func_name}(self, driver):")
    lines.append("        wait = WebDriverWait(driver, 10)")
    lines.append("")

    for i, step in enumerate(steps):
        element = element_map.get(step.target_element_id) if step.target_element_id else None
        step_lines = _generate_step_code(step, element, i)
        lines.extend(step_lines)

    # 生成 conftest.py
    conftest = '''"""conftest.py - pytest 配置文件"""
import pytest


def pytest_configure(config):
    """注册自定义标记"""
    config.addinivalue_line("markers", "smoke: 冒烟测试")
    config.addinivalue_line("markers", "regression: 回归测试")
'''

    test_content = "\n".join(lines)

    return [
        {"filename": f"test_{func_name[5:]}.py", "content": test_content},
        {"filename": "conftest.py", "content": conftest},
    ]
