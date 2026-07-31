import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button, Select, Space, message, Modal, Form, Input, InputNumber } from 'antd';
import { SaveOutlined, CodeOutlined, PlusOutlined, DeleteOutlined, ClearOutlined } from '@ant-design/icons';
import { useStore } from '../stores/useStore';
import ActionNode from './ActionNode';
import ExecutionPanel from './ExecutionPanel';
import type { ActionType, StepParams } from '../types';
import './BlockCanvas.css';

const nodeTypes = { actionNode: ActionNode };

const ACTION_OPTIONS: { label: string; value: ActionType; icon: string }[] = [
  { label: '点击', value: 'tap', icon: '👆' },
  { label: '长按', value: 'long_press', icon: '👇' },
  { label: '滑动', value: 'swipe', icon: '👉' },
  { label: '输入文本', value: 'input_text', icon: '⌨️' },
  { label: '清空输入', value: 'clear_input', icon: '🧹' },
  { label: '断言存在', value: 'assert_exists', icon: '✅' },
  { label: '断言文本', value: 'assert_text', icon: '📝' },
  { label: '等待', value: 'wait', icon: '⏳' },
  { label: '截图', value: 'screenshot', icon: '📷' },
  { label: '返回', value: 'back', icon: '↩️' },
];

let nodeId = 0;
const getId = () => `step_${++nodeId}`;

const BlockCanvas: React.FC = () => {
  const {
    elements, currentTestCase, currentSteps, saveSteps, generateScript, generatedScript, loading,
    editMode, currentPageSteps, currentPage, savePageSteps,
  } = useStore();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [addAction, setAddAction] = useState<ActionType>('tap');
  const [configModal, setConfigModal] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [form] = Form.useForm();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // 当前编辑的步骤来源：页面和用例各自独立
  const activeSteps = editMode === 'page' ? currentPageSteps : currentSteps;
  const activeContext = editMode === 'page' ? currentPage : currentTestCase;

  // 切换上下文时，将已保存的步骤加载回画布
  useEffect(() => {
    if (!activeContext) {
      setNodes([]);
      setEdges([]);
      return;
    }
    const steps = activeSteps as Array<{ id: number; action_type: string; target_element_id: number | null; target_element_name?: string; params: any }>;
    const loadedNodes: Node[] = steps.map((step, idx) => {
      const action = ACTION_OPTIONS.find((a) => a.value === step.action_type);
      // 检查元素是否还存在
      const elementExists = step.target_element_id ? elements.some(e => e.id === step.target_element_id) : true;
      const displayName = elementExists
        ? (step.target_element_name || '')
        : ''; // 元素已删除，清空名称让 ActionNode 显示警告
      return {
        id: `step_${step.id}`,
        type: 'actionNode',
        position: { x: 250, y: idx * 120 + 50 },
        data: {
          action_type: step.action_type,
          label: action ? `${action.icon} ${action.label}` : step.action_type,
          target_element_id: step.target_element_id,
          target_element_name: displayName,
          params: step.params || {},
        },
      };
    });
    const loadedEdges: Edge[] = steps.slice(1).map((step, idx) => ({
      id: `e_load_${idx}`,
      source: `step_${steps[idx].id}`,
      target: `step_${step.id}`,
      animated: true,
    }));
    setNodes(loadedNodes);
    setEdges(loadedEdges);
    if (steps.length > 0) {
      nodeId = Math.max(nodeId, ...steps.map((s) => s.id));
    }
  }, [activeContext?.id, activeSteps, editMode, elements, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const addBlock = () => {
    const action = ACTION_OPTIONS.find((a) => a.value === addAction)!;
    const id = getId();
    const yPos = nodes.length * 120 + 50;
    const newNode: Node = {
      id,
      type: 'actionNode',
      position: { x: 250, y: yPos },
      data: {
        action_type: addAction,
        label: `${action.icon} ${action.label}`,
        target_element_id: null,
        target_element_name: '',
        params: {},
      },
    };
    setNodes((nds) => [...nds, newNode]);

    // 自动连线到上一个节点
    if (nodes.length > 0) {
      const lastNode = nodes[nodes.length - 1];
      setEdges((eds) => [
        ...eds,
        { id: `e_${lastNode.id}_${id}`, source: lastNode.id, target: id, animated: true },
      ]);
    }
  };

  const openConfig = (nodeId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const elId = node.data.target_element_id as number | null;
    // 如果元素已删除，清空选择值
    const elementExists = elId ? elements.some(e => e.id === elId) : false;
    form.setFieldsValue({
      target_element_id: elementExists ? elId : undefined,
      ...node.data.params,
    });
    setConfigModal(nodeId);
  };

  const saveConfig = async () => {
    if (!configModal) return;
    const values = await form.validateFields();
    const elementId = values.target_element_id;
    const element = elements.find((e) => e.id === elementId);
    const params: StepParams = { ...values };
    delete params.target_element_id;

    setNodes((nds) =>
      nds.map((n) =>
        n.id === configModal
          ? {
              ...n,
              data: {
                ...n.data,
                target_element_id: elementId || null,
                target_element_name: element?.name || '',
                params,
              },
            }
          : n
      )
    );
    setConfigModal(null);
    message.success('步骤配置已更新');
  };

  const handleSave = async () => {
    if (!activeContext) {
      message.warning(editMode === 'page' ? '请先选择一个页面' : '请先选择或创建测试用例');
      return;
    }
    // 检查是否有缺失元素
    const needsElementActions = ['tap', 'long_press', 'swipe', 'input_text', 'clear_input', 'assert_exists', 'assert_text'];
    const missingSteps = nodes.filter(n => {
      const actionType = n.data.action_type as string;
      if (!needsElementActions.includes(actionType)) return false;
      const elId = n.data.target_element_id as number | null;
      if (!elId) return true; // 未选择元素
      return !elements.some(e => e.id === elId); // 元素已删除
    });
    if (missingSteps.length > 0) {
      const names = missingSteps.map(n => n.data.label as string).join(', ');
      message.error(`以下步骤缺少元素，请双击补充完整后再保存: ${names}`);
      return;
    }
    const steps = nodes.map((n, idx) => ({
      order: idx,
      action_type: n.data.action_type as ActionType,
      target_element_id: (n.data.target_element_id as number) || null,
      params: (n.data.params as StepParams) || {},
    }));
    if (editMode === 'page') {
      await savePageSteps(steps);
    } else {
      await saveSteps(steps);
    }
    message.success('编排已保存');
  };

  const handleGenerate = async () => {
    await handleSave();
    await generateScript();
  };

  // 删除选中的积木
  const deleteSelectedBlock = () => {
    if (!selectedNodeId) {
      message.warning('请先点击选中一个积木');
      return;
    }
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
    message.success('积木已删除');
  };

  // 清空所有积木
  const clearAllBlocks = () => {
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    message.info('已清空所有积木');
  };

  const currentActionType = nodes.find((n) => n.id === configModal)?.data.action_type;
  const currentNodeElId = nodes.find((n) => n.id === configModal)?.data.target_element_id as number | null;
  const currentNodeElDeleted = currentNodeElId ? !elements.some(e => e.id === currentNodeElId) : false;
  const needsElement = currentActionType && currentActionType !== 'wait' && currentActionType !== 'back' && currentActionType !== 'screenshot';
  const needsText = currentActionType === 'input_text' || currentActionType === 'assert_text';

  return (
    <div className="block-canvas-container">
      {/* 工具栏 */}
      <div className="block-toolbar">
        <Space>
          <span style={{ fontSize: 13, color: '#666', fontWeight: 500 }}>
            {editMode === 'page'
              ? `📄 页面步骤: ${currentPage?.name || '—'}`
              : `🧪 用例编排: ${currentTestCase?.name || '—'}`}
          </span>
          <Select
            style={{ width: 130 }}
            value={addAction}
            onChange={setAddAction}
            options={ACTION_OPTIONS.map((a) => ({ label: `${a.icon} ${a.label}`, value: a.value }))}
          />
          <Button icon={<PlusOutlined />} onClick={addBlock}>
            添加积木
          </Button>
          <Button icon={<SaveOutlined />} onClick={handleSave}>
            保存编排
          </Button>
          <Button type="primary" icon={<CodeOutlined />} onClick={handleGenerate} loading={loading}>
            生成脚本
          </Button>
          <Button
            icon={<DeleteOutlined />}
            danger
            disabled={!selectedNodeId}
            onClick={deleteSelectedBlock}
          >
            删除选中
          </Button>
          {nodes.length > 0 && (
            <Button
              icon={<ClearOutlined />}
              danger
              onClick={clearAllBlocks}
            >
              清空全部
            </Button>
          )}
        </Space>
        <span className="block-count">
          {nodes.length} 个步骤{selectedNodeId && ` · 已选中: ${nodes.find(n => n.id === selectedNodeId)?.data.label}`}
        </span>
      </div>

      {/* ReactFlow 画布 */}
      <div className="block-flow" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={(_, node) => openConfig(node.id)}
          onSelectionChange={({ nodes: selected }) => {
            setSelectedNodeId(selected.length === 1 ? selected[0].id : null);
          }}
          nodeTypes={nodeTypes}
          fitView
          deleteKeyCode="Delete"
        >
          <Background />
          <Controls />
          <MiniMap />
        </ReactFlow>
      </div>

      {/* 脚本预览 */}
      {generatedScript && (
        <div className="script-preview">
          <div className="script-header">
            <span>生成的 pytest 脚本</span>
            <Button size="small" onClick={() => navigator.clipboard.writeText(generatedScript)}>
              复制
            </Button>
          </div>
          <pre className="script-code">{generatedScript}</pre>
        </div>
      )}

      {/* 实时执行面板 */}
      <ExecutionPanel testcaseId={currentTestCase?.id ?? null} />

      {/* 步骤配置弹窗 */}
      <Modal
        title="配置步骤参数"
        open={!!configModal}
        onOk={saveConfig}
        onCancel={() => setConfigModal(null)}
        okText="确认"
      >
        <Form form={form} layout="vertical">
          {needsElement && (
            <>
              {currentNodeElDeleted && (
                <div style={{ padding: '8px 12px', marginBottom: 12, background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 6, color: '#ff4d4f', fontSize: 13 }}>
                  ⚠️ 原元素（ID: {currentNodeElId}）已删除，请重新选择
                </div>
              )}
              <Form.Item name="target_element_id" label="目标元素" rules={[{ required: true, message: '请选择元素' }]}>
                <Select
                  placeholder="选择目标元素"
                options={elements.map((el) => ({ label: `${el.name} (${el.type})`, value: el.id }))}
                showSearch
                filterOption={(input, option) =>
                  (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
                }
              />
            </Form.Item>
            </>
          )}
          {needsText && (
            <Form.Item name="text" label={currentActionType === 'input_text' ? '输入文本' : '期望文本'}>
              <Input placeholder="输入内容" />
            </Form.Item>
          )}
          {currentActionType === 'swipe' && (
            <>
              <Form.Item name="direction" label="滑动方向" initialValue="up">
                <Select options={[
                  { label: '上', value: 'up' },
                  { label: '下', value: 'down' },
                  { label: '左', value: 'left' },
                  { label: '右', value: 'right' },
                ]} />
              </Form.Item>
              <Form.Item name="distance" label="滑动距离比例" initialValue={0.5}>
                <InputNumber min={0.1} max={1} step={0.1} />
              </Form.Item>
            </>
          )}
          {currentActionType === 'wait' && (
            <Form.Item name="timeout" label="等待时间(秒)" initialValue={3}>
              <InputNumber min={1} max={60} />
            </Form.Item>
          )}
          {currentActionType === 'long_press' && (
            <Form.Item name="duration" label="长按时长(秒)" initialValue={2}>
              <InputNumber min={0.5} max={10} step={0.5} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default BlockCanvas;
