import React, { useState, useRef, useCallback } from 'react';
import { Modal, Button, Input, Tag, Space, Typography, Spin, message, Descriptions, Divider, Tooltip, Tree, Select } from 'antd';
import { ScanOutlined, PlusOutlined, ReloadOutlined, AimOutlined } from '@ant-design/icons';
import { useStore } from '../stores/useStore';
import * as api from '../services/api';
import type { UINode, InspectResult } from '../services/api';
import type { LocatorType, ElementType } from '../types';

const { Text } = Typography;
const { Search } = Input;

const LOCATOR_TYPE_LABELS: Record<string, string> = {
  coordinate: '坐标', id: 'ID', text: '文本', xpath: 'XPath',
  accessibility_id: '无障碍ID', natural_language: '自然语言',
};

const TYPE_GUESS: Record<string, ElementType> = {
  'android.widget.Button': 'button',
  'android.widget.EditText': 'input',
  'android.widget.ImageView': 'image',
  'android.widget.TextView': 'text',
  'android.widget.CheckBox': 'checkbox',
  'android.widget.Switch': 'checkbox',
  'android.widget.ListView': 'list_item',
  'android.widget.RecyclerView': 'list_item',
};

interface Props {
  open: boolean;
  onClose: () => void;
  pageId: number;
  projectId: number;
}

/** 根据节点属性生成最佳定位器 */
function getBestLocator(node: UINode): { type: LocatorType; value: string } | null {
  if (node.text) return { type: 'text', value: node.text };
  if (node.resource_id) return { type: 'id', value: node.resource_id };
  if (node.content_desc) return { type: 'accessibility_id', value: node.content_desc };
  return null;
}

/** 获取节点简短标签 */
function getNodeLabel(node: UINode): string {
  const cls = node.class.split('.').pop() || node.tag;
  const parts: string[] = [cls];
  if (node.text) parts.push(`"${node.text}"`);
  else if (node.resource_id) parts.push(`#${node.resource_id.split(':').pop()}`);
  else if (node.content_desc) parts.push(`[${node.content_desc}]`);
  if (node.clickable) parts.push('●');
  return parts.join(' ');
}

const UIInspector: React.FC<Props> = ({ open, onClose, pageId, projectId }) => {
  const { fetchElements } = useStore();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<InspectResult | null>(null);
  const [selectedNode, setSelectedNode] = useState<UINode | null>(null);
  const [hoverNode, setHoverNode] = useState<UINode | null>(null);
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const imgRef = useRef<HTMLImageElement>(null);

  // 加载 UI 树
  const handleInspect = useCallback(async () => {
    setLoading(true);
    setSelectedNode(null);
    setHoverNode(null);
    try {
      const res = await api.inspectDevice(projectId);
      setData(res.data);
    } catch (err: any) {
      message.error(err?.response?.data?.detail || 'UI 检查失败');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // 截图点击 → 找到对应坐标处的最小节点
  const handleScreenshotClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!data || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const relY = (e.clientY - rect.top) / rect.height;
    const px = Math.round(relX * data.screen_width);
    const py = Math.round(relY * data.screen_height);

    // 找包含该坐标的最小节点（面积最小 = 最具体）
    let best: UINode | null = null;
    let bestArea = Infinity;
    for (const node of data.nodes) {
      if (!node.bounds) continue;
      const [l, t, r, b] = node.bounds;
      if (l <= px && px <= r && t <= py && py <= b) {
        const area = (r - l) * (b - t);
        // 优先选有语义信息的节点
        const hasSemantic = node.text || node.resource_id || node.content_desc;
        const score = area - (hasSemantic ? 1000000 : 0);
        if (score < bestArea) {
          bestArea = score;
          best = node;
        }
      }
    }
    if (best) setSelectedNode(best);
  }, [data]);

  // 节点列表（可搜索/过滤）
  const filteredNodes = data?.nodes.filter(n => {
    if (filterType === 'clickable' && !n.clickable) return false;
    if (filterType === 'semantic' && !n.text && !n.resource_id && !n.content_desc) return false;
    if (!searchText) return true;
    const s = searchText.toLowerCase();
    return (
      n.text.toLowerCase().includes(s) ||
      n.resource_id.toLowerCase().includes(s) ||
      n.content_desc.toLowerCase().includes(s) ||
      n.class.toLowerCase().includes(s)
    );
  }) || [];

  // 一键添加元素
  const handleAddElement = useCallback(async () => {
    if (!selectedNode) return;
    const locator = getBestLocator(selectedNode);
    if (!locator) {
      message.warning('该节点没有可用的语义定位器（text/id/desc），无法自动添加');
      return;
    }
    const cls = selectedNode.class.split('.').pop() || 'element';
    const name = selectedNode.text || selectedNode.resource_id.split(':').pop() || selectedNode.content_desc || cls;
    const elType = TYPE_GUESS[selectedNode.class] || (selectedNode.clickable ? 'button' : 'text');

    try {
      await api.createElement(pageId, {
        name,
        type: elType,
        locator_type: locator.type,
        locator_value: locator.value,
        locators: [{ type: locator.type, value: locator.value }],
        description: `${selectedNode.class}${selectedNode.clickable ? ' [clickable]' : ''}`,
        source: 'manual',
        bbox: selectedNode.bounds ? {
          x: selectedNode.bounds[0], y: selectedNode.bounds[1],
          w: selectedNode.bounds[2] - selectedNode.bounds[0],
          h: selectedNode.bounds[3] - selectedNode.bounds[1],
        } : undefined,
      });
      message.success(`已添加元素: ${name} (${LOCATOR_TYPE_LABELS[locator.type]}: ${locator.value})`);
      await fetchElements(pageId);
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '添加元素失败');
    }
  }, [selectedNode, pageId, fetchElements]);

  // 高亮框渲染
  const renderHighlight = (node: UINode, color: string, dashed?: boolean) => {
    if (!data || !node.bounds) return null;
    const sw = data.screen_width;
    const sh = data.screen_height;
    const [l, t, r, b] = node.bounds;
    return (
      <div key={`hl-${node._id}`} style={{
        position: 'absolute',
        left: `${(l / sw) * 100}%`, top: `${(t / sh) * 100}%`,
        width: `${((r - l) / sw) * 100}%`, height: `${((b - t) / sh) * 100}%`,
        border: `2px ${dashed ? 'dashed' : 'solid'} ${color}`,
        borderRadius: 3,
        pointerEvents: 'none',
        zIndex: 10,
        boxShadow: `0 0 6px ${color}40`,
      }} />
    );
  };

  return (
    <Modal
      title={<Space><ScanOutlined /> UI 检查器（uiautomator viewer）</Space>}
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="refresh" icon={<ReloadOutlined />} loading={loading} onClick={handleInspect}>
          刷新
        </Button>,
        <Button key="close" onClick={onClose}>关闭</Button>,
      ]}
      width="90vw"
      style={{ top: 20 }}
      styles={{ body: { padding: '0 16px 16px', maxHeight: 'calc(100vh - 160px)', overflow: 'auto' } }}
    >
      {!data ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Button type="primary" size="large" icon={<ScanOutlined />} loading={loading} onClick={handleInspect}>
            开始检查设备 UI
          </Button>
          <div style={{ marginTop: 12, color: '#999' }}>
            将 dump 当前设备 UI 层级 + 截图
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 12 }}>
          {/* 左：截图 */}
          <div style={{ flex: '0 0 40%', minWidth: 280 }}>
            <div
              style={{ position: 'relative', cursor: 'crosshair', lineHeight: 0 }}
              onClick={handleScreenshotClick}
            >
              {data.screenshot ? (
                <img
                  ref={imgRef}
                  src={`data:image/png;base64,${data.screenshot}`}
                  alt="device"
                  style={{ width: '100%', borderRadius: 6, display: 'block' }}
                />
              ) : (
                <div style={{ padding: 40, textAlign: 'center', background: '#f5f5f5', borderRadius: 6 }}>
                  截图获取失败
                </div>
              )}
              {/* 选中节点高亮 */}
              {selectedNode && renderHighlight(selectedNode, '#1677ff')}
              {/* hover 节点高亮 */}
              {hoverNode && hoverNode._id !== selectedNode?._id && renderHighlight(hoverNode, '#52c41a', true)}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, color: '#999', textAlign: 'center' }}>
              点击截图选择 UI 节点 | {data.screen_width}×{data.screen_height} | 共 {data.total_nodes} 个节点
            </div>
          </div>

          {/* 右：节点列表 + 属性 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            {/* 搜索 + 过滤 */}
            <Space style={{ width: '100%' }}>
              <Search
                placeholder="搜索 text / id / class..."
                size="small"
                allowClear
                style={{ width: 220 }}
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
              />
              <Select
                size="small"
                value={filterType}
                onChange={setFilterType}
                style={{ width: 130 }}
                options={[
                  { value: 'all', label: '全部节点' },
                  { value: 'clickable', label: '仅可点击' },
                  { value: 'semantic', label: '有语义属性' },
                ]}
              />
            </Space>

            {/* 节点列表 */}
            <div style={{
              flex: 1, overflow: 'auto', maxHeight: 340,
              border: '1px solid #f0f0f0', borderRadius: 6, padding: 4,
            }}>
              {filteredNodes.slice(0, 200).map(node => (
                <div
                  key={node._id}
                  style={{
                    padding: '4px 8px',
                    fontSize: 12,
                    cursor: 'pointer',
                    background: selectedNode?._id === node._id ? '#e6f4ff' : hoverNode?._id === node._id ? '#f6ffed' : 'transparent',
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  onClick={() => setSelectedNode(node)}
                  onMouseEnter={() => setHoverNode(node)}
                  onMouseLeave={() => setHoverNode(null)}
                >
                  {node.clickable && <Tag color="orange" style={{ margin: 0, fontSize: 10, lineHeight: '16px' }}>C</Tag>}
                  <Text ellipsis style={{ fontSize: 12, flex: 1 }}>{getNodeLabel(node)}</Text>
                </div>
              ))}
              {filteredNodes.length > 200 && (
                <Text type="secondary" style={{ fontSize: 11, padding: '4px 8px', display: 'block' }}>
                  还有 {filteredNodes.length - 200} 个节点未显示...
                </Text>
              )}
            </div>

            {/* 选中节点属性 */}
            {selectedNode && (
              <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text strong style={{ fontSize: 13 }}>
                    <AimOutlined /> 选中节点属性
                  </Text>
                  <Button
                    type="primary"
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={handleAddElement}
                    disabled={!getBestLocator(selectedNode)}
                  >
                    添加到元素列表
                  </Button>
                </div>
                <Descriptions size="small" column={2} bordered>
                  <Descriptions.Item label="class">
                    <Text code style={{ fontSize: 11 }}>{selectedNode.class}</Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Space size={4}>
                      {selectedNode.clickable && <Tag color="orange">clickable</Tag>}
                      {selectedNode.enabled && <Tag color="green">enabled</Tag>}
                      {selectedNode.scrollable && <Tag>scrollable</Tag>}
                      {selectedNode.selected && <Tag color="blue">selected</Tag>}
                    </Space>
                  </Descriptions.Item>
                  <Descriptions.Item label="text">
                    {selectedNode.text ? <Tag color="green">{selectedNode.text}</Tag> : <Text type="secondary">—</Text>}
                  </Descriptions.Item>
                  <Descriptions.Item label="resource-id">
                    {selectedNode.resource_id ? <Tag color="blue">{selectedNode.resource_id}</Tag> : <Text type="secondary">—</Text>}
                  </Descriptions.Item>
                  <Descriptions.Item label="content-desc">
                    {selectedNode.content_desc ? <Tag color="purple">{selectedNode.content_desc}</Tag> : <Text type="secondary">—</Text>}
                  </Descriptions.Item>
                  <Descriptions.Item label="bounds">
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {selectedNode.bounds ? `[${selectedNode.bounds.join(', ')}]` : '—'}
                    </Text>
                  </Descriptions.Item>
                </Descriptions>
                {(() => {
                  const loc = getBestLocator(selectedNode);
                  return loc ? (
                    <div style={{ marginTop: 8, padding: '6px 10px', background: '#f6ffed', borderRadius: 4, fontSize: 12 }}>
                      ✅ 推荐定位器：<Tag color="cyan">{LOCATOR_TYPE_LABELS[loc.type]}: {loc.value}</Tag>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8, padding: '6px 10px', background: '#fff2f0', borderRadius: 4, fontSize: 12 }}>
                      ⚠️ 该节点没有语义属性，不建议添加为元素
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};

export default UIInspector;
