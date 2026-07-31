// 核心数据类型定义

export interface Project {
  id: number;
  name: string;
  description: string;
  platform: 'android' | 'ios' | 'web' | 'desktop';
  appium_url: string;
  device_name: string;
  app_package: string;
  app_activity: string;
  created_at: string;
}

export interface Page {
  id: number;
  project_id: number;
  parent_id: number | null;
  name: string;
  is_folder: number;  // 0=截图页面, 1=目录
  screenshot_path: string;
  screenshot_url: string;
  sort_order: number;
  created_at: string;
}

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ElementType =
  | 'button'
  | 'input'
  | 'image'
  | 'text'
  | 'icon'
  | 'checkbox'
  | 'list_item'
  | 'link'
  | 'other';

export type LocatorType =
  | 'id'
  | 'xpath'
  | 'text'
  | 'coordinate'
  | 'accessibility_id'
  | 'natural_language';

export type ElementSource = 'manual' | 'ai' | 'import';

// 多定位器（备用链，最多 5 个）
export interface LocatorItem {
  type: LocatorType;
  value: string;
}

export interface UIElement {
  id: number;
  page_id: number;
  name: string;
  type: ElementType;
  bbox: BBox;
  locator_type: LocatorType;
  locator_value: string;
  locators: LocatorItem[];
  description: string;
  group: string;
  source: ElementSource;
  created_at: string;
}

export type ActionType =
  | 'tap'
  | 'long_press'
  | 'swipe'
  | 'input_text'
  | 'clear_input'
  | 'assert_exists'
  | 'assert_text'
  | 'wait'
  | 'screenshot'
  | 'back';

export interface StepParams {
  click_count?: number;
  duration?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  distance?: number;
  text?: string;
  clear_first?: boolean;
  expected_value?: string;
  timeout?: number;
  [key: string]: unknown;
}

export interface TestStep {
  id: number;
  testcase_id: number;
  order: number;
  action_type: ActionType;
  target_element_id: number | null;
  target_element_name?: string;
  params: StepParams;
}

export interface PageStep {
  id: number;
  page_id: number;
  order: number;
  action_type: ActionType;
  target_element_id: number | null;
  target_element_name?: string;
  params: StepParams;
}

export interface TestCasePageRef {
  id: number;
  page_id: number;
  page_name?: string;
  order: number;
  step_count: number;
}

export interface TestCase {
  id: number;
  project_id: number;
  name: string;
  description: string;
  steps: TestStep[];
  page_refs?: TestCasePageRef[];
  created_at: string;
}

export interface GeneratedScript {
  filename: string;
  content: string;
}

// 标注临时状态（未保存到后端的框选）
export interface AnnotationRect {
  id: string;
  bbox: BBox;
  name: string;
  type: ElementType;
  locator_type: LocatorType;
  locator_value: string;
  locators: LocatorItem[];
  description: string;
}

// 积木节点数据
export interface BlockNodeData {
  action_type: ActionType;
  label: string;
  target_element_id: number | null;
  target_element_name: string;
  params: StepParams;
  [key: unknown]: unknown;
}

// ============ 执行记录 ============
export interface ExecutionRecord {
  id: number;
  source_type: 'testcase' | 'page';
  source_id: number;
  source_name: string;
  project_id: number;
  status: 'running' | 'passed' | 'failed' | 'error' | 'aborted';
  total_steps: number;
  passed_count: number;
  failed_count: number;
  error_count: number;
  duration: number;
  exec_mode: string;
  device_id: string;
  created_at: string;
}

export interface ExecutionStepRecord {
  id: number;
  step_order: number;
  action_type: ActionType;
  element_name: string;
  element_id: number | null;
  params: StepParams;
  status: 'passed' | 'failed' | 'error';
  log_message: string;
  screenshot_url: string | null;
  duration: number;
}

export interface ExecutionDetail {
  record: ExecutionRecord;
  steps: ExecutionStepRecord[];
}

export interface ExecutionListResponse {
  total: number;
  items: ExecutionRecord[];
}
