import { create } from 'zustand';
import type {
  Project,
  Page,
  UIElement,
  TestCase,
  TestStep,
  PageStep,
  TestCasePageRef,
  AnnotationRect,
  ActionType,
  StepParams,
} from '../types';
import * as api from '../services/api';

interface AppState {
  // 项目
  projects: Project[];
  currentProject: Project | null;
  // 页面
  pages: Page[];
  currentPage: Page | null;
  // 元素
  elements: UIElement[];
  // 标注
  annotations: AnnotationRect[];
  isAnnotating: boolean;
  // 编辑模式
  editMode: 'page' | 'testcase';
  // 页面步骤
  currentPageSteps: PageStep[];
  // 测试用例
  testCases: TestCase[];
  currentTestCase: TestCase | null;
  currentSteps: TestStep[];
  testCasePageRefs: TestCasePageRef[];
  // 脚本
  generatedScript: string;
  // 加载状态
  loading: boolean;

  // Actions
  fetchProjects: () => Promise<void>;
  createProject: (name: string, platform: string) => Promise<void>;
  selectProject: (project: Project) => Promise<void>;
  updateProject: (id: number, data: Partial<Project>) => Promise<void>;
  deleteProject: (id: number) => Promise<void>;
  fetchPages: (projectId: number) => Promise<void>;
  uploadScreenshot: (file: File, name: string, parentId?: number | null) => Promise<void>;
  selectPage: (page: Page) => Promise<void>;
  deletePage: (id: number) => Promise<void>;
  createFolder: (name: string, parentId?: number | null) => Promise<void>;
  updatePage: (id: number, data: { name?: string; parent_id?: number | null }) => Promise<void>;
  movePage: (id: number, parentId: number | null) => Promise<void>;
  fetchElements: (pageId: number) => Promise<void>;
  // 标注
  setAnnotating: (v: boolean) => void;
  addAnnotation: (rect: AnnotationRect) => void;
  updateAnnotation: (id: string, data: Partial<AnnotationRect>) => void;
  removeAnnotation: (id: string) => void;
  clearAnnotations: () => void;
  saveAnnotations: () => Promise<void>;
  // 元素编辑
  updateElement: (id: number, data: Partial<UIElement>) => Promise<void>;
  deleteElement: (id: number) => Promise<void>;
  // 测试用例
  fetchTestCases: (projectId: number) => Promise<void>;
  createTestCase: (name: string) => Promise<void>;
  selectTestCase: (tc: TestCase) => Promise<void>;
  updateTestCase: (id: number, data: Partial<TestCase>) => Promise<void>;
  deleteTestCase: (id: number) => Promise<void>;
  saveSteps: (steps: Array<{ action_type: ActionType; target_element_id: number | null; params: StepParams }>) => Promise<void>;
  // 页面步骤
  fetchPageSteps: (pageId: number) => Promise<void>;
  savePageSteps: (steps: Array<{ action_type: ActionType; target_element_id: number | null; params: StepParams }>) => Promise<void>;
  // 用例页面链
  setTestCasePages: (pageIds: number[]) => Promise<void>;
  fetchTestCasePages: (testcaseId: number) => Promise<void>;
  // 编辑模式
  setEditMode: (mode: 'page' | 'testcase') => void;
  // 脚本
  generateScript: () => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  projects: [],
  currentProject: null,
  pages: [],
  currentPage: null,
  elements: [],
  annotations: [],
  isAnnotating: false,
  editMode: 'page',
  currentPageSteps: [],
  testCases: [],
  currentTestCase: null,
  currentSteps: [],
  testCasePageRefs: [],
  generatedScript: '',
  loading: false,

  fetchProjects: async () => {
    const res = await api.getProjects();
    set({ projects: res.data });
  },

  createProject: async (name, platform) => {
    await api.createProject({ name, platform: platform as Project['platform'] });
    await get().fetchProjects();
  },

  selectProject: async (project) => {
    set({ currentProject: project, currentPage: null, elements: [], annotations: [] });
    await get().fetchPages(project.id);
    await get().fetchTestCases(project.id);
  },

  updateProject: async (id, data) => {
    const res = await api.updateProject(id, data);
    set((s) => ({
      projects: s.projects.map((p) => (p.id === id ? res.data : p)),
      currentProject: s.currentProject?.id === id ? res.data : s.currentProject,
    }));
  },

  deleteProject: async (id) => {
    await api.deleteProject(id);
    const s = get();
    set({
      projects: s.projects.filter((p) => p.id !== id),
      currentProject: s.currentProject?.id === id ? null : s.currentProject,
      pages: s.currentProject?.id === id ? [] : s.pages,
      testCases: s.currentProject?.id === id ? [] : s.testCases,
      currentPage: s.currentProject?.id === id ? null : s.currentPage,
      currentTestCase: s.currentProject?.id === id ? null : s.currentTestCase,
    });
    if (s.currentProject?.id !== id) await get().fetchProjects();
  },

  fetchPages: async (projectId) => {
    const res = await api.getPages(projectId);
    set({ pages: res.data });
  },

  uploadScreenshot: async (file, name, parentId) => {
    const project = get().currentProject;
    if (!project) return;
    await api.uploadScreenshot(project.id, file, name, parentId);
    await get().fetchPages(project.id);
  },

  selectPage: async (page) => {
    set({ currentPage: page, annotations: [], editMode: 'page', currentTestCase: null, testCasePageRefs: [] });
    await get().fetchElements(page.id);
    await get().fetchPageSteps(page.id);
  },

  deletePage: async (id) => {
    await api.deletePage(id);
    const project = get().currentProject;
    set((s) => ({
      pages: s.pages.filter((p) => p.id !== id),
      currentPage: s.currentPage?.id === id ? null : s.currentPage,
      elements: s.currentPage?.id === id ? [] : s.elements,
    }));
    if (project) await get().fetchPages(project.id);
  },

  createFolder: async (name, parentId) => {
    const project = get().currentProject;
    if (!project) return;
    await api.createFolder(project.id, { name, parent_id: parentId });
    await get().fetchPages(project.id);
  },

  updatePage: async (id, data) => {
    await api.updatePage(id, data);
    const project = get().currentProject;
    if (project) await get().fetchPages(project.id);
  },

  movePage: async (id, parentId) => {
    await api.updatePage(id, { parent_id: parentId });
    const project = get().currentProject;
    if (project) await get().fetchPages(project.id);
  },

  fetchElements: async (pageId) => {
    const res = await api.getElements(pageId);
    set({ elements: res.data });
  },

  // 标注
  setAnnotating: (v) => set({ isAnnotating: v }),

  addAnnotation: (rect) =>
    set((s) => ({ annotations: [...s.annotations, rect] })),

  updateAnnotation: (id, data) =>
    set((s) => ({
      annotations: s.annotations.map((a) =>
        a.id === id ? { ...a, ...data } : a
      ),
    })),

  removeAnnotation: (id) =>
    set((s) => ({ annotations: s.annotations.filter((a) => a.id !== id) })),

  clearAnnotations: () => set({ annotations: [] }),

  saveAnnotations: async () => {
    const { currentPage, annotations, fetchElements } = get();
    if (!currentPage || annotations.length === 0) return;
    const elements = annotations.map((a) => ({
      name: a.name,
      type: a.type,
      bbox: a.bbox,
      locator_type: a.locator_type,
      locator_value: a.locator_value,
      locators: a.locators,
      description: a.description,
      source: 'manual' as const,
    }));
    await api.batchCreateElements(currentPage.id, elements);
    set({ annotations: [] });
    await fetchElements(currentPage.id);
  },

  // 元素编辑
  updateElement: async (id, data) => {
    await api.updateElement(id, data);
    const page = get().currentPage;
    if (page) await get().fetchElements(page.id);
  },

  deleteElement: async (id) => {
    await api.deleteElement(id);
    const page = get().currentPage;
    if (page) await get().fetchElements(page.id);
  },

  // 测试用例
  fetchTestCases: async (projectId) => {
    const res = await api.getTestCases(projectId);
    set({ testCases: res.data });
  },

  createTestCase: async (name) => {
    const project = get().currentProject;
    if (!project) return;
    await api.createTestCase(project.id, { name });
    await get().fetchTestCases(project.id);
  },

  selectTestCase: async (tc) => {
    set({ currentTestCase: tc, generatedScript: '', editMode: 'testcase' });
    const stepsRes = await api.getSteps(tc.id);
    set({ currentSteps: stepsRes.data });
  },

  updateTestCase: async (id, data) => {
    const res = await api.updateTestCase(id, data);
    set((s) => ({
      testCases: s.testCases.map((tc) => (tc.id === id ? res.data : tc)),
      currentTestCase: s.currentTestCase?.id === id ? res.data : s.currentTestCase,
    }));
  },

  deleteTestCase: async (id) => {
    await api.deleteTestCase(id);
    set((s) => ({
      testCases: s.testCases.filter((tc) => tc.id !== id),
      currentTestCase: s.currentTestCase?.id === id ? null : s.currentTestCase,
      currentSteps: s.currentTestCase?.id === id ? [] : s.currentSteps,
      testCasePageRefs: s.currentTestCase?.id === id ? [] : s.testCasePageRefs,
    }));
  },

  saveSteps: async (steps) => {
    const tc = get().currentTestCase;
    if (!tc) return;
    const res = await api.saveSteps(tc.id, steps);
    set({ currentSteps: res.data });
  },

  // 页面步骤
  fetchPageSteps: async (pageId) => {
    const res = await api.getPageSteps(pageId);
    set({ currentPageSteps: res.data });
  },

  savePageSteps: async (steps) => {
    const page = get().currentPage;
    if (!page) return;
    const res = await api.savePageSteps(page.id, steps);
    set({ currentPageSteps: res.data });
  },

  // 用例页面链
  fetchTestCasePages: async (testcaseId) => {
    const res = await api.getTestCasePages(testcaseId);
    set({ testCasePageRefs: res.data });
  },

  setTestCasePages: async (pageIds) => {
    const tc = get().currentTestCase;
    if (!tc) return;
    const res = await api.setTestCasePages(tc.id, pageIds);
    set({ testCasePageRefs: res.data });
  },

  setEditMode: (mode) => {
    set({ editMode: mode });
  },

  // 脚本
  generateScript: async () => {
    const tc = get().currentTestCase;
    if (!tc) return;
    set({ loading: true });
    try {
      const res = await api.generateScript(tc.id);
      const content = res.data.map((f) => `# === ${f.filename} ===\n${f.content}`).join('\n\n');
      set({ generatedScript: content });
    } finally {
      set({ loading: false });
    }
  },
}));
