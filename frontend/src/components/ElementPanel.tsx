import React, { useState } from 'react';
import { Table, Button, Tag, Popconfirm, Input, Select, Space, Typography, Tooltip, Modal, message, Spin, Descriptions, Divider, Alert } from 'antd';
import { EditOutlined, DeleteOutlined, SaveOutlined, AimOutlined, CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined, ThunderboltOutlined, BulbOutlined, ScanOutlined } from '@ant-design/icons';
import { useStore } from '../stores/useStore';
import * as api from '../services/api';
import type { UIElement, ElementType, LocatorType, LocatorItem } from '../types';
import UIInspector from './UIInspector';

const { Text } = Typography;

const typeColors: Record<string, string> = {
  button: 'blue',
  input: 'green',
  image: 'purple',
  text: 'default',
  icon: 'orange',
  checkbox: 'cyan',
  list_item: 'magenta',
  link: 'geekblue',
  other: 'default',
};

const LOCATOR_TYPE_LABELS: Record<string, string> = {
  coordinate: '坐标',
  id: 'ID',
  text: '文本',
  xpath: 'XPath',
  accessibility_id: '无障碍ID',
  natural_language: '自然语言',
};

const ElementPanel: React.FC = () => {
  const { elements, updateElement, deleteElement, currentProject, currentPage } = useStore();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState<Partial<UIElement>>({});
  // 定位测试状态
  const [locating, setLocating] = useState<number | null>(null);
  const [locateResult, setLocateResult] = useState<api.LocateResult | null>(null);
  const [locateModalOpen, setLocateModalOpen] = useState(false);
  const [locateElementId, setLocateElementId] = useState<number | null>(null);
  const [autoFixing, setAutoFixing] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  // 根据节点信息生成最佳定位器
  const getBestLocator = (node: api.UINodeInfo): { type: string; value: string } | null => {
    if (node.text) return { type: 'text', value: node.text };
    if (node.resource_id) return { type: 'id', value: node.resource_id };
    if (node.content_desc) return { type: 'accessibility_id', value: node.content_desc };
    if (node.clickable) {
      const [l, t, r, b] = node.bounds;
      return { type: 'xpath', value: `//${node.class}[@clickable="true" and @bounds="[${l},${t}][${r},${b}]"]` };
    }
    return null;
  };

  // 智能修复：自动把所有坐标定位替换成最佳语义定位
  const handleAutoFix = async () => {
    const coordElements = elements.filter(
      el => el.locator_type === 'coordinate' || (el.locators && el.locators.some(l => l.type === 'coordinate'))
    );
    if (coordElements.length === 0) {
      message.info('没有坐标定位的元素需要修复');
      return;
    }
    setAutoFixing(true);
    let fixed = 0;
    let failed = 0;
    for (const el of coordElements) {
      try {
        const res = await api.locateElement(el.id);
        const data = res.data;
        if (!data.found) { failed++; continue; }
        // 从 nearby_nodes 中找最佳定位器
        const nodes = data.nearby_nodes || [];
        // 优先找 clickable + text 的节点
        const clickableText = nodes.find(n => n.clickable && n.text);
        const clickableId = nodes.find(n => n.clickable && n.resource_id);
        const clickableDesc = nodes.find(n => n.clickable && n.content_desc);
        const anyText = nodes.find(n => n.text);
        const anyId = nodes.find(n => n.resource_id);
        const best = clickableText || clickableId || clickableDesc || anyText || anyId;
        if (!best) { failed++; continue; }
        const loc = getBestLocator(best);
        if (!loc) { failed++; continue; }
        await updateElement(el.id, {
          locator_type: loc.type as any,
          locator_value: loc.value,
          locators: [{ type: loc.type as any, value: loc.value }],
        });
        fixed++;
      } catch {
        failed++;
      }
    }
    setAutoFixing(false);
    if (fixed > 0) message.success(`智能修复完成: ${fixed} 个元素已更新${failed > 0 ? `, ${failed} 个失败` : ''}`);
    else message.warning(`修复完成: 未能找到合适的语义定位器，请手动切换`);
  };

  const startEdit = (record: UIElement) => {
    setEditingId(record.id);
    setEditData({
      name: record.name,
      type: record.type,
      locator_type: record.locator_type,
      locator_value: record.locator_value,
      locators: record.locators || [],
    });
  };

  const saveEdit = async () => {
    if (editingId) {
      const data = { ...editData };
      // 同步 locators 数组
      if (data.locator_type && data.locator_value) {
        data.locators = [{ type: data.locator_type as any, value: data.locator_value }];
      }
      await updateElement(editingId, data);
      setEditingId(null);
    }
  };

  // 测试定位
  const handleLocate = async (elementId: number) => {
    setLocating(elementId);
    setLocateElementId(elementId);
    setLocateModalOpen(true);
    setLocateResult(null);
    try {
      const res = await api.locateElement(elementId);
      setLocateResult(res.data);
      if (res.data.found) {
        message.success('元素定位成功');
      } else {
        message.warning(res.data.message || '未找到元素');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || '定位测试失败';
      message.error(msg);
      setLocateResult({ found: false, message: msg });
    } finally {
      setLocating(null);
    }
  };

  // 一键应用定位器
  const handleApplyLocator = async (locatorType: string, locatorValue: string) => {
    if (!locateElementId) return;
    await updateElement(locateElementId, {
      locator_type: locatorType as any,
      locator_value: locatorValue,
      locators: [{ type: locatorType as any, value: locatorValue }],
    });
    message.success(`已应用定位器: ${LOCATOR_TYPE_LABELS[locatorType] || locatorType} = ${locatorValue}`);
    setLocateModalOpen(false);
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 120,
      render: (text: string, record: UIElement) =>
        editingId === record.id ? (
          <Input
            size="small"
            value={editData.name}
            onChange={(e) => setEditData({ ...editData, name: e.target.value })}
          />
        ) : (
          <Text strong>{text}</Text>
        ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
      render: (type: ElementType, record: UIElement) =>
        editingId === record.id ? (
          <Select
            size="small"
            value={editData.type}
            onChange={(v) => setEditData({ ...editData, type: v })}
            style={{ width: 90 }}
            options={[
              { value: 'button', label: 'button' },
              { value: 'input', label: 'input' },
              { value: 'text', label: 'text' },
              { value: 'image', label: 'image' },
              { value: 'icon', label: 'icon' },
              { value: 'checkbox', label: 'checkbox' },
              { value: 'list_item', label: 'list_item' },
              { value: 'link', label: 'link' },
              { value: 'other', label: 'other' },
            ]}
          />
        ) : (
          <Tag color={typeColors[type]}>{type}</Tag>
        ),
    },
    {
      title: '定位器',
      key: 'locators',
      width: 280,
      render: (_: unknown, record: UIElement) => {
        if (editingId === record.id) {
          return (
            <Space size={4} style={{ width: '100%' }}>
              <Select
                size="small"
                value={editData.locator_type}
                onChange={(v) => setEditData({ ...editData, locator_type: v })}
                style={{ width: 90 }}
                options={Object.entries(LOCATOR_TYPE_LABELS).map(([k, v]) => ({ value: k, label: v }))}
              />
              <Input
                size="small"
                value={editData.locator_value}
                onChange={(e) => setEditData({ ...editData, locator_value: e.target.value })}
                style={{ flex: 1 }}
                placeholder="定位器值"
              />
            </Space>
          );
        }
        const locators = record.locators || [{ type: record.locator_type, value: record.locator_value }];
        return (
          <Space direction="vertical" size={2} style={{ width: '100%' }}>
            {locators.map((loc, idx) => (
              <Tooltip key={idx} title={`${loc.type}: ${loc.value}`}>
                <Tag color={idx === 0 ? 'blue' : 'default'} style={{ fontSize: 11 }}>
                  {LOCATOR_TYPE_LABELS[loc.type] || loc.type}: {loc.value.length > 20 ? loc.value.slice(0, 20) + '…' : loc.value}
                </Tag>
              </Tooltip>
            ))}
            {locators.length === 0 && <Text type="secondary" style={{ fontSize: 11 }}>无定位器</Text>}
          </Space>
        );
      },
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 60,
      render: (source: string) => (
        <Tag color={source === 'manual' ? 'orange' : source === 'ai' ? 'blue' : 'green'}>
          {source === 'manual' ? '手动' : source === 'ai' ? 'AI' : '导入'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 70,
      render: (_: unknown, record: UIElement) => (
        <Space size={4}>
          <Tooltip title="测试定位">
            <Button
              size="small"
              type="link"
              icon={<AimOutlined />}
              loading={locating === record.id}
              onClick={() => handleLocate(record.id)}
            />
          </Tooltip>
          {editingId === record.id ? (
            <Button size="small" type="link" icon={<SaveOutlined />} onClick={saveEdit} />
          ) : (
            <Button size="small" type="link" icon={<EditOutlined />} onClick={() => startEdit(record)} />
          )}
          <Popconfirm title="确认删除?" onConfirm={() => deleteElement(record.id)}>
            <Button size="small" type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '0 8px' }}>
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text strong>元素列表 ({elements.length})</Text>
        <Space size={4}>
          <Tooltip title="打开 UI 检查器，查看设备 UI 层级并添加元素">
            <Button
              size="small"
              icon={<ScanOutlined />}
              onClick={() => setInspectorOpen(true)}
            >
              UI检查
            </Button>
          </Tooltip>
          <Tooltip title="自动将坐标定位替换为 text/id 等语义定位">
            <Button
              size="small"
              type="primary"
              ghost
              icon={<BulbOutlined />}
              loading={autoFixing}
              onClick={handleAutoFix}
            >
              智能修复
            </Button>
          </Tooltip>
        </Space>
      </div>
      <Table
        dataSource={elements}
        columns={columns}
        rowKey="id"
        size="small"
        pagination={false}
        scroll={{ y: 'calc(100vh - 300px)' }}
      />

      {/* 定位测试弹窗 */}
      <Modal
        title={
          <Space>
            <AimOutlined />
            <span>元素定位测试</span>
            {locateResult && (
              locateResult.found
                ? <Tag icon={<CheckCircleOutlined />} color="success">已找到</Tag>
                : <Tag icon={<CloseCircleOutlined />} color="error">未找到</Tag>
            )}
          </Space>
        }
        open={locateModalOpen}
        onCancel={() => setLocateModalOpen(false)}
        footer={[
          <Button
            key="retry"
            icon={<ReloadOutlined />}
            loading={!!locating}
            onClick={() => { if (locateElementId) handleLocate(locateElementId); }}
            disabled={!locateResult || !!locating}
          >
            重新定位
          </Button>,
          <Button key="close" type="primary" onClick={() => setLocateModalOpen(false)}>关闭</Button>,
        ]}
        width={600}
      >
        {locating && !locateResult ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16, color: '#666' }}>正在设备上进行定位…</div>
          </div>
        ) : locateResult ? (
          <div>
            {/* 截图 + 高亮框 */}
            {locateResult.screenshot ? (
              <div style={{ position: 'relative', width: '100%', marginBottom: 12, lineHeight: 0 }}>
                <img
                  src={`data:image/png;base64,${locateResult.screenshot}`}
                  alt="设备截图"
                  style={{ width: '100%', borderRadius: 6, display: 'block' }}
                />
                {/* 高亮框：优先显示 nearby_nodes 中 clickable 的，否则 node_at_point，否则坐标合成 */}
                {locateResult.found && (() => {
                  const sw = locateResult.screen_width || 1080;
                  const sh = locateResult.screen_height || 2400;
                  // 优先找 clickable 节点
                  const clickableNode = locateResult.nearby_nodes?.find(n => n.clickable);
                  const b = clickableNode?.bounds || locateResult.node_at_point?.bounds || locateResult.bounds;
                  if (!b) return null;
                  const [l, t, r, bt] = b;
                  return (
                    <div
                      style={{
                        position: 'absolute',
                        left: `${(l / sw) * 100}%`,
                        top: `${(t / sh) * 100}%`,
                        width: `${((r - l) / sw) * 100}%`,
                        height: `${((bt - t) / sh) * 100}%`,
                        border: '3px solid #ff4d4f',
                        borderRadius: 4,
                        boxShadow: '0 0 8px rgba(255, 77, 79, 0.5)',
                        pointerEvents: 'none',
                        animation: 'pulse-border 1.5s ease-in-out infinite',
                        zIndex: 10,
                      }}
                    />
                  );
                })()}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: 20, color: '#999' }}>截图获取失败</div>
            )}

            {/* 定位详情 */}
            <Descriptions size="small" column={2} bordered>
              <Descriptions.Item label="设备">
                {locateResult.device}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                {locateResult.found ? '✅ 找到' : '❌ 未找到'}
              </Descriptions.Item>
              {locateResult.found && (
                <>
                  <Descriptions.Item label="当前定位器">
                    <Tag color={locateResult.matched_locator?.type === 'coordinate' ? 'orange' : 'blue'}>
                      {locateResult.matched_locator?.type}: {locateResult.matched_locator?.value}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="坐标">
                    {locateResult.center ? `(${locateResult.center[0]}, ${locateResult.center[1]})` : '—'}
                  </Descriptions.Item>
                </>
              )}
              {!locateResult.found && locateResult.locators_tried && (
                <Descriptions.Item label="已尝试的定位器" span={2}>
                  {locateResult.locators_tried.map((loc, i) => (
                    <Tag key={i} color="red" style={{ marginBottom: 4 }}>
                      {loc.type}: {loc.value}
                    </Tag>
                  ))}
                </Descriptions.Item>
              )}
            </Descriptions>

            {/* 附近 UI 节点列表 — 帮助用户确定正确定位器 */}
            {locateResult.nearby_nodes && locateResult.nearby_nodes.length > 0 && (
              <>
                <Divider style={{ margin: '12px 0 8px' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>📍 附近的 UI 节点（按距离排序）</Text>
                </Divider>
                <Space direction="vertical" style={{ width: '100%' }} size={8}>
                  {locateResult.nearby_nodes.map((node, idx) => {
                    const locator = getBestLocator(node);
                    return (
                      <div key={idx} style={{
                        padding: '8px 12px',
                        background: node.clickable ? '#fff7e6' : '#fafafa',
                        border: '1px solid #f0f0f0',
                        borderRadius: 6,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}>
                        <Space direction="vertical" size={2} style={{ flex: 1 }}>
                          <Space size={8} wrap>
                            <Tag color={node.clickable ? 'orange' : 'default'}>
                              {node.class}
                            </Tag>
                            {node.clickable && <Tag color="red">clickable</Tag>}
                            {node.text && <Tag color="green">text: {node.text}</Tag>}
                            {node.resource_id && <Tag color="blue">id: {node.resource_id.split(':').pop()}</Tag>}
                            {node.content_desc && <Tag color="purple">desc: {node.content_desc}</Tag>}
                          </Space>
                          <Text type="secondary" style={{ fontSize: 11 }}>
                            bounds: [{node.bounds.join(', ')}] | 距离: {node.distance}px
                          </Text>
                        </Space>
                        {locator && (
                          <Button
                            type="primary"
                            size="small"
                            icon={<ThunderboltOutlined />}
                            onClick={() => handleApplyLocator(locator.type, locator.value)}
                          >
                            应用 {LOCATOR_TYPE_LABELS[locator.type] || locator.type}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </Space>
                <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
                  💡 建议优先使用 <b>text</b> 或 <b>resource-id</b> 定位，避免坐标定位。橙色背景 = 可点击节点
                </div>
              </>
            )}
            {!locateResult.found && locateResult.message && (
              <div style={{ marginTop: 8, color: '#ff4d4f', fontSize: 13 }}>
                💡 {locateResult.message}
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      {/* UI 检查器 */}
      {currentProject && currentPage && (
        <UIInspector
          open={inspectorOpen}
          onClose={() => setInspectorOpen(false)}
          pageId={currentPage.id}
          projectId={currentProject.id}
        />
      )}
    </div>
  );
};

export default ElementPanel;
