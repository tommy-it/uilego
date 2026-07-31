import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  Layout, Menu, Button, Upload, Modal, Input, Select, List, Space, Typography, message, Form,
  Popconfirm, Tooltip, Tree, Tabs,
} from 'antd';
import {
  ProjectOutlined, FileImageOutlined, ExperimentOutlined,
  UploadOutlined, PlusOutlined, AppstoreOutlined, SettingOutlined,
  EditOutlined, DeleteOutlined, FolderOutlined, FolderAddOutlined, FileOutlined,
  AimOutlined, ReloadOutlined, LoadingOutlined,
} from '@ant-design/icons';
import type { TreeDataNode, TreeProps } from 'antd';
import { useStore } from '../stores/useStore';
import * as api from '../services/api';
import AnnotationCanvas from '../components/AnnotationCanvas';
import ElementPanel from '../components/ElementPanel';
import BlockCanvas from '../components/BlockCanvas';
import type { Project, Page } from '../types';

const { Sider, Content } = Layout;
const { Title, Text } = Typography;

type TabKey = 'annotate' | 'elements' | 'blocks';

const EditorPage: React.FC = () => {
  const {
    projects, currentProject, pages, currentPage, testCases, currentTestCase,
    fetchProjects, createProject, selectProject, updateProject, deleteProject,
    uploadScreenshot, selectPage, deletePage, createFolder, updatePage, movePage,
    createTestCase, selectTestCase, updateTestCase, deleteTestCase,
  } = useStore();

  const [activeTab, setActiveTab] = useState<TabKey>('annotate');
  const [projectModal, setProjectModal] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectPlatform, setProjectPlatform] = useState('android');
  const [tcModal, setTcModal] = useState(false);
  const [tcName, setTcName] = useState('');
  const [configModal, setConfigModal] = useState(false);
  const [configForm] = Form.useForm();
  // 重命名弹窗
  const [renameModal, setRenameModal] = useState<{ type: 'project' | 'page' | 'testcase'; id: number; name: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  // 新建目录弹窗
  const [folderModal, setFolderModal] = useState<{ parentId: number | null } | null>(null);
  const [folderName, setFolderName] = useState('');
  // 上传目标目录
  const [uploadTargetFolder, setUploadTargetFolder] = useState<number | null>(null);
  // 目录上传文件输入 ref
  const folderUploadRef = useRef<HTMLInputElement>(null);
  const [folderUploadTarget, setFolderUploadTarget] = useState<number | null>(null);

  const triggerFolderUpload = (folderId: number) => {
    setFolderUploadTarget(folderId);
    setTimeout(() => folderUploadRef.current?.click(), 0);
  };

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreateProject = async () => {
    if (!projectName.trim()) return;
    await createProject(projectName, projectPlatform);
    setProjectModal(false);
    setProjectName('');
    message.success('项目创建成功');
  };

  const handleUpload = async (file: File, parentId?: number | null) => {
    const name = file.name.replace(/\.[^.]+$/, '');
    await uploadScreenshot(file, name, parentId !== undefined ? parentId : uploadTargetFolder);
    setUploadTargetFolder(null);
    message.success('截图上传成功');
    return false;
  };

  const handleCreateTestCase = async () => {
    if (!tcName.trim()) return;
    await createTestCase(tcName);
    setTcModal(false);
    setTcName('');
    message.success('测试用例创建成功');
  };

  const handleCreateFolder = async () => {
    if (!folderName.trim() || !folderModal) return;
    await createFolder(folderName.trim(), folderModal.parentId);
    setFolderModal(null);
    setFolderName('');
    message.success('目录创建成功');
  };

  const APP_PRESETS = [
    { label: 'Android 设置', package: 'com.android.settings', activity: '.Settings' },
    { label: 'Lazada', package: 'com.lazada.android', activity: 'com.lazada.activities.EnterActivity' },
    { label: 'Shopee', package: 'com.shopee.app', activity: 'com.shopee.app.home.HomeActivity_' },
    { label: '淘宝', package: 'com.taobao.taobao', activity: 'com.taobao.tao.welcome.Welcome' },
    { label: '微信', package: 'com.tencent.mm', activity: '.ui.LauncherUI' },
  ];

  const applyPreset = (preset: { package: string; activity: string }) => {
    configForm.setFieldsValue({
      app_package: preset.package,
      app_activity: preset.activity,
    });
  };

  const openConfig = () => {
    if (!currentProject) return;
    configForm.setFieldsValue({
      appium_url: currentProject.appium_url,
      device_name: currentProject.device_name,
      app_package: currentProject.app_package,
      app_activity: currentProject.app_activity,
    });
    setConfigModal(true);
  };

  const handleSaveConfig = async () => {
    if (!currentProject) return;
    const values = await configForm.validateFields();
    await updateProject(currentProject.id, values);
    // 更新本地项目列表
    await fetchProjects();
    setConfigModal(false);
    message.success('运行配置已保存');
  };

  const [detecting, setDetecting] = useState(false);
  // 设备管理状态
  const [devicePlatform, setDevicePlatform] = useState<string>('android');
  const [devices, setDevices] = useState<api.DeviceInfo[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);

  const handleRefreshDevices = async () => {
    setDevicesLoading(true);
    try {
      const res = await api.listDevices(devicePlatform);
      setDevices(res.data);
      if (res.data.length === 0) {
        message.info('未发现已连接的设备');
      } else {
        message.success(`发现 ${res.data.length} 台设备`);
      }
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '扫描设备失败');
    } finally {
      setDevicesLoading(false);
    }
  };

  const handleDetectApp = async () => {
    if (!currentProject) return;
    setDetecting(true);
    try {
      const deviceName = selectedDeviceIds[0] || configForm.getFieldValue('device_name') || '';
      const res = await api.detectApp(currentProject.id, deviceName);
      configForm.setFieldsValue({
        app_package: res.data.app_package,
        app_activity: res.data.app_activity,
      });
      message.success(`检测到: ${res.data.app_package}`);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || '检测失败，请确保设备已连接且 App 在前台';
      message.error(msg);
    } finally {
      setDetecting(false);
    }
  };

  // 打开重命名弹窗
  const openRename = (type: 'project' | 'page' | 'testcase', id: number, name: string) => {
    setRenameModal({ type, id, name });
    setRenameValue(name);
  };

  // 确认重命名
  const handleRename = async () => {
    if (!renameModal || !renameValue.trim()) return;
    const { type, id } = renameModal;
    if (type === 'project') {
      await updateProject(id, { name: renameValue.trim() });
    } else if (type === 'testcase') {
      await updateTestCase(id, { name: renameValue.trim() });
    } else if (type === 'page') {
      await updatePage(id, { name: renameValue.trim() });
    }
    setRenameModal(null);
    message.success('重命名成功');
  };

  // 删除确认
  const handleDeleteProject = async (id: number) => {
    await deleteProject(id);
    message.success('项目已删除');
  };

  const handleDeletePage = async (id: number) => {
    await deletePage(id);
    message.success('页面已删除');
  };

  const handleDeleteTestCase = async (id: number) => {
    await deleteTestCase(id);
    message.success('用例已删除');
  };

  // ========== 页面树构建 ==========
  const pageTreeData: TreeDataNode[] = useMemo(() => {
    const buildTree = (parentId: number | null): TreeDataNode[] => {
      return pages
        .filter((p) => p.parent_id === parentId)
        .sort((a, b) => (a.sort_order - b.sort_order) || (a.id - b.id))
        .map((page) => {
          const isFolder = page.is_folder === 1;
          const key = `${isFolder ? 'folder' : 'page'}-${page.id}`;
          const thumbUrl = !isFolder && page.screenshot_url
            ? `http://localhost:8000${page.screenshot_url}`
            : '';
          return {
            key,
            title: (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, width: '100%' }}>
                {isFolder ? (
                  <FolderOutlined style={{ color: '#faad14', fontSize: 14, flexShrink: 0 }} />
                ) : thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt={page.name}
                    style={{
                      width: 18,
                      height: 32,
                      minWidth: 18,
                      maxWidth: 18,
                      minHeight: 32,
                      maxHeight: 32,
                      objectFit: 'cover',
                      borderRadius: 2,
                      border: '1px solid #d9d9d9',
                      flexShrink: 0,
                      display: 'inline-block',
                      background: '#f5f5f5',
                    }}
                  />
                ) : (
                  <FileOutlined style={{ color: '#8c8c8c', fontSize: 14, flexShrink: 0 }} />
                )}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{page.name}</span>
                <span className="page-tree-actions">
                  <Tooltip title="重命名">
                    <Button size="small" type="text" icon={<EditOutlined />}
                      onClick={(e) => { e.stopPropagation(); openRename('page', page.id, page.name); }}
                    />
                  </Tooltip>
                  <Popconfirm title={`删除「${page.name}」？`} onConfirm={(e) => { e?.stopPropagation(); handleDeletePage(page.id); }} onCancel={(e) => e?.stopPropagation()}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
                  </Popconfirm>
                  {isFolder && (
                    <>
                      <Tooltip title="新建子目录">
                        <Button size="small" type="text" icon={<FolderAddOutlined />}
                          onClick={(e) => { e.stopPropagation(); setFolderModal({ parentId: page.id }); setFolderName(''); }}
                        />
                      </Tooltip>
                      <Tooltip title="上传到此目录">
                        <Button size="small" type="text" icon={<UploadOutlined />}
                          onClick={(e) => { e.stopPropagation(); e.preventDefault(); triggerFolderUpload(page.id); }}
                        />
                      </Tooltip>
                    </>
                  )}
                </span>
              </span>
            ),
            icon: undefined,
            isLeaf: !isFolder,
            children: isFolder ? buildTree(page.id) : undefined,
          };
        });
    };
    return buildTree(null);
  }, [pages]);

  // 树拖拽回调
  const onDropPage: TreeProps['onDrop'] = async (info) => {
    const dropKey = info.node.key as string;
    const dragKey = info.dragNode.key as string;
    const dropPos = info.node.pos.split('-');
    const dropPosition = info.dropPosition - Number(dropPos[dropPos.length - 1]);

    // 解析拖拽的页面 id
    const dragId = Number(dragKey.split('-')[1]);
    if (!dragId) return;

    // 计算目标 parent_id
    let targetParentId: number | null = null;
    if (!info.dropToGap) {
      // 拖到目录节点上 → 成为子项
      if (dropKey.startsWith('folder-')) {
        targetParentId = Number(dropKey.split('-')[1]);
      }
    } else if (dropPosition === 0) {
      // 拖到第一个位置
      if (dropKey.startsWith('folder-')) {
        targetParentId = Number(dropKey.split('-')[1]);
      }
    } else {
      // 拖到某个节点后面 → 同级
      const dropPage = pages.find((p) => Number(dropKey.split('-')[1]) === p.id);
      targetParentId = dropPage?.parent_id ?? null;
    }

    await movePage(dragId, targetParentId);
    message.success('已移动');
  };

  return (
    <Layout style={{ height: '100vh' }}>
      {/* 左侧导航 */}
      <Sider width={260} theme="light" style={{ borderRight: '1px solid #f0f0f0', overflow: 'auto' }}>
        <div style={{ padding: 16 }}>
          <Title level={4} style={{ margin: 0 }}>🧱 UI 积木</Title>
          <Text type="secondary">UI 自动化测试编排</Text>
        </div>

        {/* 项目列表 */}
        <div style={{ padding: '0 12px', marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text strong><ProjectOutlined /> 项目</Text>
            <Space size={4}>
              {currentProject && (
                <Button size="small" icon={<SettingOutlined />} onClick={openConfig} title="运行配置" />
              )}
              <Button size="small" icon={<PlusOutlined />} onClick={() => setProjectModal(true)} />
            </Space>
          </div>
          <List
            size="small"
            dataSource={projects}
            renderItem={(p: Project) => (
              <List.Item
                style={{
                  cursor: 'pointer',
                  background: currentProject?.id === p.id ? '#e6f7ff' : 'transparent',
                  padding: '4px 8px',
                  borderRadius: 4,
                }}
                onClick={() => selectProject(p)}
                actions={[
                  <Tooltip title="重命名" key="edit">
                    <Button
                      size="small" type="text" icon={<EditOutlined />}
                      onClick={(e) => { e.stopPropagation(); openRename('project', p.id, p.name); }}
                    />
                  </Tooltip>,
                  <Popconfirm
                    key="del"
                    title={`确定删除项目「${p.name}」？`}
                    description="删除后不可恢复，关联的页面、元素、用例也会一并删除"
                    onConfirm={(e) => { e?.stopPropagation(); handleDeleteProject(p.id); }}
                    onCancel={(e) => e?.stopPropagation()}
                  >
                    <Button
                      size="small" type="text" danger icon={<DeleteOutlined />}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Popconfirm>,
                ]}
              >
                <div>
                  <Text>{p.name}</Text>
                  <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>{p.platform}</Text>
                  {currentProject?.id === p.id && p.app_package && (
                    <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 1 }}>
                      📦 {p.app_package}
                    </div>
                  )}
                </div>
              </List.Item>
            )}
          />
        </div>

        {/* 页面目录树 */}
        {currentProject && (
          <div style={{ padding: '0 12px', marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text strong><FileImageOutlined /> 页面</Text>
              <Space size={4}>
                <Tooltip title="新建目录">
                  <Button size="small" icon={<FolderAddOutlined />}
                    onClick={() => { setFolderModal({ parentId: null }); setFolderName(''); }}
                  />
                </Tooltip>
                <Upload beforeUpload={(f) => { handleUpload(f, null); }} showUploadList={false} accept="image/*">
                  <Tooltip title="上传截图到根目录">
                    <Button size="small" icon={<UploadOutlined />} />
                  </Tooltip>
                </Upload>
              </Space>
            </div>
            {pageTreeData.length > 0 ? (
              <Tree
                draggable
                blockNode
                treeData={pageTreeData}
                defaultExpandAll
                selectedKeys={currentPage ? [`page-${currentPage.id}`] : []}
                onSelect={(keys) => {
                  if (keys.length === 0) return;
                  const key = keys[0] as string;
                  if (key.startsWith('page-')) {
                    const pageId = Number(key.split('-')[1]);
                    const page = pages.find((p) => p.id === pageId);
                    if (page) { selectPage(page); }
                  }
                }}
                onDrop={onDropPage}
                style={{ fontSize: 13 }}
              />
            ) : (
              <Text type="secondary" style={{ fontSize: 12, padding: '4px 0', display: 'block' }}>
                暂无页面，点击上传截图或新建目录
              </Text>
            )}
          </div>
        )}

        {/* 目录上传隐藏文件选择器 */}
        <input
          ref={folderUploadRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && folderUploadTarget !== null) {
              handleUpload(file, folderUploadTarget);
            }
            e.target.value = '';
          }}
        />

        {/* 测试用例 */}
        {currentProject && (
          <div style={{ padding: '0 12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text strong><ExperimentOutlined /> 测试用例</Text>
              <Button size="small" icon={<PlusOutlined />} onClick={() => setTcModal(true)} />
            </div>
            <List
              size="small"
              dataSource={testCases}
              renderItem={(tc) => (
                <List.Item
                  style={{
                    cursor: 'pointer',
                    background: currentTestCase?.id === tc.id ? '#e6f7ff' : 'transparent',
                    padding: '4px 8px',
                    borderRadius: 4,
                  }}
                  onClick={() => { selectTestCase(tc); setActiveTab('blocks'); }}
                  actions={[
                    <Tooltip title="重命名" key="edit">
                      <Button
                        size="small" type="text" icon={<EditOutlined />}
                        onClick={(e) => { e.stopPropagation(); openRename('testcase', tc.id, tc.name); }}
                      />
                    </Tooltip>,
                    <Popconfirm
                      key="del"
                      title={`确定删除用例「${tc.name}」？`}
                      description="用例关联的步骤也会被删除"
                      onConfirm={(e) => { e?.stopPropagation(); handleDeleteTestCase(tc.id); }}
                      onCancel={(e) => e?.stopPropagation()}
                    >
                      <Button
                        size="small" type="text" danger icon={<DeleteOutlined />}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </Popconfirm>,
                  ]}
                >
                  <Text>{tc.name}</Text>
                </List.Item>
              )}
            />
          </div>
        )}
      </Sider>

      {/* 主内容区 */}
      <Layout>
        {/* Tab 切换 */}
        <div style={{ background: '#fff', borderBottom: '1px solid #f0f0f0' }}>
          <Menu
            mode="horizontal"
            selectedKeys={[activeTab]}
            onClick={({ key }) => setActiveTab(key as TabKey)}
            items={[
              { key: 'annotate', icon: <FileImageOutlined />, label: '元素标注' },
              { key: 'elements', icon: <AppstoreOutlined />, label: '元素管理' },
              { key: 'blocks', icon: <ExperimentOutlined />, label: '积木编排' },
            ]}
          />
        </div>

        <Content style={{ overflow: 'hidden' }}>
          {activeTab === 'annotate' && <AnnotationCanvas />}
          {activeTab === 'elements' && <ElementPanel />}
          {activeTab === 'blocks' && <BlockCanvas />}
        </Content>
      </Layout>

      {/* 新建项目弹窗 */}
      <Modal
        title="新建项目"
        open={projectModal}
        onOk={handleCreateProject}
        onCancel={() => setProjectModal(false)}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Input placeholder="项目名称" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
          <Select
            style={{ width: '100%' }}
            value={projectPlatform}
            onChange={setProjectPlatform}
            options={[
              { label: 'Android', value: 'android' },
              { label: 'iOS', value: 'ios' },
              { label: 'Web', value: 'web' },
              { label: 'Desktop', value: 'desktop' },
            ]}
          />
        </Space>
      </Modal>

      {/* 新建测试用例弹窗 */}
      <Modal
        title="新建测试用例"
        open={tcModal}
        onOk={handleCreateTestCase}
        onCancel={() => setTcModal(false)}
      >
        <Input placeholder="用例名称，如：登录流程测试" value={tcName} onChange={(e) => setTcName(e.target.value)} />
      </Modal>

      {/* 运行配置弹窗 */}
      <Modal
        title="运行配置"
        open={configModal}
        onOk={handleSaveConfig}
        onCancel={() => setConfigModal(false)}
        okText="保存配置"
        width={560}
      >
        <Tabs defaultActiveKey="devices" items={[
          {
            key: 'devices',
            label: '📱 设备管理',
            children: (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Space>
                    <Select
                      value={devicePlatform}
                      onChange={(v) => { setDevicePlatform(v); setDevices([]); }}
                      style={{ width: 120 }}
                      options={[
                        { label: '🤖 Android', value: 'android' },
                        { label: '🍎 iOS', value: 'ios' },
                        { label: '全部', value: 'all' },
                      ]}
                    />
                  </Space>
                  <Button
                    icon={devicesLoading ? <LoadingOutlined /> : <ReloadOutlined />}
                    loading={devicesLoading}
                    onClick={handleRefreshDevices}
                  >
                    扫描设备
                  </Button>
                </div>
                {devices.length > 0 ? (
                  <div style={{ border: '1px solid #f0f0f0', borderRadius: 6, overflow: 'hidden' }}>
                    {devices.map((d) => {
                      const isSelected = selectedDeviceIds.includes(d.id);
                      return (
                        <div
                          key={d.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '8px 12px',
                            borderBottom: '1px solid #f5f5f5',
                            background: isSelected ? '#e6f7ff' : '#fff',
                            cursor: 'pointer',
                          }}
                          onClick={() => {
                            const ids = isSelected
                              ? selectedDeviceIds.filter(x => x !== d.id)
                              : [...selectedDeviceIds, d.id];
                            setSelectedDeviceIds(ids);
                            // 自动填入第一个选中设备
                            if (!isSelected && ids.length === 1) {
                              configForm.setFieldsValue({ device_name: d.id });
                            }
                          }}
                        >
                          <input type="checkbox" checked={isSelected} readOnly />
                          <span style={{ fontSize: 16 }}>{d.platform === 'ios' ? '🍎' : '🤖'}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 500 }}>{d.name}</div>
                            <div style={{ fontSize: 11, color: '#999' }}>{d.id}</div>
                          </div>
                          <span style={{
                            fontSize: 11,
                            color: d.status === 'online' ? '#52c41a' : '#ff4d4f',
                            fontWeight: 500,
                          }}>
                            {d.status === 'online' ? '● 在线' : `● ${d.status}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>
                    {devicesLoading ? '正在扫描...' : '点击「扫描设备」查看已连接设备'}
                  </div>
                )}
                {selectedDeviceIds.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                    已选 {selectedDeviceIds.length} 台设备：{selectedDeviceIds.join(', ')}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'app',
            label: '📦 应用配置',
            children: (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>快捷切换：</Text>
                  <Space wrap style={{ marginTop: 4 }}>
                    {APP_PRESETS.map((p) => (
                      <Button key={p.package} size="small" type="dashed"
                        onClick={() => applyPreset(p)}>
                        {p.label}
                      </Button>
                    ))}
                    <Button size="small" type="primary" ghost loading={detecting}
                      icon={<AimOutlined />} onClick={handleDetectApp}>
                      🎯 检测当前 App
                    </Button>
                  </Space>
                </div>
                <Form form={configForm} layout="vertical">
                  <Form.Item name="appium_url" label="Appium Server 地址"
                    rules={[{ required: true, message: '请输入 Appium 地址' }]}>
                    <Input placeholder="http://localhost:4723" />
                  </Form.Item>
                  <Form.Item name="device_name" label="设备名称（deviceName）"
                    rules={[{ required: true, message: '请输入设备名' }]}>
                    <Input placeholder="emulator-5554 或真机序列号（可从设备列表自动填入）" />
                  </Form.Item>
                  <Form.Item name="app_package" label="应用包名（appPackage）"
                    rules={[{ required: true, message: '请输入应用包名' }]}>
                    <Input placeholder="com.example.app" />
                  </Form.Item>
                  <Form.Item name="app_activity" label="启动 Activity（appActivity）"
                    rules={[{ required: true, message: '请输入 Activity' }]}>
                    <Input placeholder=".MainActivity" />
                  </Form.Item>
                </Form>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  💡 提示：打开目标 App → 点击「检测当前 App」自动填入包名和 Activity
                </Text>
              </div>
            ),
          },
        ]} />
      </Modal>

      {/* 重命名弹窗 */}
      <Modal
        title={
          renameModal?.type === 'project' ? '重命名项目' :
          renameModal?.type === 'page' ? '重命名页面/目录' :
          renameModal?.type === 'testcase' ? '重命名用例' : '重命名'
        }
        open={!!renameModal}
        onOk={handleRename}
        onCancel={() => setRenameModal(null)}
        okText="保存"
        cancelText="取消"
      >
        <Input
          placeholder="输入新名称"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onPressEnter={handleRename}
          autoFocus
        />
      </Modal>

      {/* 新建目录弹窗 */}
      <Modal
        title={folderModal?.parentId ? '新建子目录' : '新建目录'}
        open={!!folderModal}
        onOk={handleCreateFolder}
        onCancel={() => setFolderModal(null)}
        okText="创建"
        cancelText="取消"
      >
        <Input
          placeholder="目录名称，如：登录页面、首页截图"
          value={folderName}
          onChange={(e) => setFolderName(e.target.value)}
          onPressEnter={handleCreateFolder}
          autoFocus
        />
      </Modal>
    </Layout>
  );
};

export default EditorPage;
