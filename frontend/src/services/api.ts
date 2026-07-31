import axios from 'axios';
import type {
  Project,
  Page,
  UIElement,
  TestCase,
  TestStep,
  PageStep,
  TestCasePageRef,
  GeneratedScript,
} from '../types';

const api = axios.create({
  baseURL: 'http://localhost:8000/api',
  timeout: 30000,
});

// ============ Projects ============
export const getProjects = () => api.get<Project[]>('/projects');
export const createProject = (data: Partial<Project>) =>
  api.post<Project>('/projects', data);
export const updateProject = (id: number, data: Partial<Project>) =>
  api.put<Project>(`/projects/${id}`, data);
export const deleteProject = (id: number) => api.delete(`/projects/${id}`);
export const detectApp = (projectId: number, device?: string) =>
  api.get<{ app_package: string; app_activity: string; raw: string }>(
    `/projects/${projectId}/detect-app${device ? `?device=${device}` : ''}`
  );

// ============ Devices ============
export interface DeviceInfo {
  id: string;
  name: string;
  platform: 'android' | 'ios';
  status: string;
  model: string;
}
export const listDevices = (platform: string = 'all') =>
  api.get<DeviceInfo[]>(`/projects/devices/list?platform=${platform}`);

// ============ Pages ============
export const getPages = (projectId: number) =>
  api.get<Page[]>(`/projects/${projectId}/pages`);

export const uploadScreenshot = (projectId: number, file: File, name: string, parentId?: number | null) => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', name);
  if (parentId != null) formData.append('parent_id', String(parentId));
  return api.post<Page>(`/projects/${projectId}/pages/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const createFolder = (projectId: number, data: { name: string; parent_id?: number | null }) =>
  api.post<Page>(`/projects/${projectId}/pages`, { ...data, is_folder: 1 });

export const updatePage = (id: number, data: { name?: string; parent_id?: number | null; sort_order?: number }) =>
  api.put<Page>(`/pages/${id}`, data);

export const deletePage = (id: number) => api.delete(`/pages/${id}`);

// ============ Page Steps (页面级步骤) ============
export const getPageSteps = (pageId: number) =>
  api.get<PageStep[]>(`/pages/${pageId}/steps`);

export const savePageSteps = (pageId: number, steps: Partial<PageStep>[]) =>
  api.put<PageStep[]>(`/pages/${pageId}/steps`, steps);

// ============ Elements ============
export const getElements = (pageId: number) =>
  api.get<UIElement[]>(`/pages/${pageId}/elements`);

export const createElement = (pageId: number, data: Partial<UIElement>) =>
  api.post<UIElement>(`/pages/${pageId}/elements`, data);

export const updateElement = (id: number, data: Partial<UIElement>) =>
  api.put<UIElement>(`/elements/${id}`, data);

export const deleteElement = (id: number) => api.delete(`/elements/${id}`);

// 测试元素定位（在真机上查找并返回截图）
export interface UINodeInfo {
  text: string;
  resource_id: string;
  content_desc: string;
  class: string;
  clickable: boolean;
  bounds: [number, number, number, number];
  distance?: number;
}

export interface LocateResult {
  found: boolean;
  matched_locator?: { type: string; value: string };
  bounds?: [number, number, number, number];
  center?: [number, number];
  text?: string;
  resource_id?: string;
  class?: string;
  clickable?: boolean;
  screenshot?: string; // base64
  device?: string;
  screen_width?: number;
  screen_height?: number;
  locators_tried?: { type: string; value: string }[];
  message?: string;
  node_at_point?: UINodeInfo;
  nearby_nodes?: UINodeInfo[];
}
export const locateElement = (elementId: number) =>
  api.post<LocateResult>(`/elements/${elementId}/locate`);

export const batchCreateElements = (pageId: number, elements: Partial<UIElement>[]) =>
  api.post<UIElement[]>(`/pages/${pageId}/elements/batch`, elements);

// ============ Test Cases ============
export const getTestCases = (projectId: number) =>
  api.get<TestCase[]>(`/projects/${projectId}/testcases`);

export const createTestCase = (projectId: number, data: Partial<TestCase>) =>
  api.post<TestCase>(`/projects/${projectId}/testcases`, data);

export const getTestCase = (id: number) => api.get<TestCase>(`/testcases/${id}`);

export const updateTestCase = (id: number, data: Partial<TestCase>) =>
  api.put<TestCase>(`/testcases/${id}`, data);

export const deleteTestCase = (id: number) => api.delete(`/testcases/${id}`);

// ============ Steps ============
export const getSteps = (testcaseId: number) =>
  api.get<TestStep[]>(`/testcases/${testcaseId}/steps`);

export const saveSteps = (testcaseId: number, steps: Partial<TestStep>[]) =>
  api.put<TestStep[]>(`/testcases/${testcaseId}/steps`, steps);

// ============ TestCase Page Refs (用例页面链) ============
export const getTestCasePages = (testcaseId: number) =>
  api.get<TestCasePageRef[]>(`/testcases/${testcaseId}/pages`);

export const setTestCasePages = (testcaseId: number, pageIds: number[]) =>
  api.put<TestCasePageRef[]>(`/testcases/${testcaseId}/pages`, { page_ids: pageIds });

// ============ Script Generation ============
export const generateScript = (testcaseId: number, framework: string = 'pytest') =>
  api.post<GeneratedScript[]>(`/testcases/${testcaseId}/generate`, { framework });

export const downloadScript = (testcaseId: number) =>
  api.get(`/testcases/${testcaseId}/download`, { responseType: 'blob' });

// ============ UI Inspector ============
export interface UINode {
  _id: number;
  _parent_id: number | null;
  tag: string;
  text: string;
  resource_id: string;
  content_desc: string;
  class: string;
  package: string;
  bounds: [number, number, number, number] | null;
  clickable: boolean;
  scrollable: boolean;
  checkable: boolean;
  checked: boolean;
  enabled: boolean;
  focused: boolean;
  selected: boolean;
  long_clickable: boolean;
  index: number;
}

export interface InspectResult {
  device: string;
  screen_width: number;
  screen_height: number;
  screenshot: string;
  nodes: UINode[];
  total_nodes: number;
}

export const inspectDevice = (projectId: number) =>
  api.post<InspectResult>(`/device/inspect?project_id=${projectId}`);

export const tapDevice = (projectId: number, x: number, y: number) =>
  api.post(`/device/tap?project_id=${projectId}&x=${x}&y=${y}`);

export default api;
