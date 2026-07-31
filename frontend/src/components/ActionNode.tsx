import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

const actionColors: Record<string, string> = {
  tap: '#1890ff',
  long_press: '#722ed1',
  swipe: '#13c2c2',
  input_text: '#52c41a',
  clear_input: '#faad14',
  assert_exists: '#52c41a',
  assert_text: '#389e0d',
  wait: '#8c8c8c',
  screenshot: '#eb2f96',
  back: '#f5222d',
};

const ActionNode: React.FC<NodeProps> = ({ data }) => {
  const actionType = (data.action_type as string) || 'tap';
  const color = actionColors[actionType] || '#1890ff';
  const targetName = (data.target_element_name as string) || '';
  const elementMissing = data.target_element_id && !targetName;

  return (
    <div
      className="action-node"
      style={{ borderLeftColor: color, ...(elementMissing ? { borderColor: '#ff4d4f', boxShadow: '0 0 6px rgba(255,77,79,0.3)' } : {}) }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="action-node-header" style={{ background: color }}>
        {data.label as string}
      </div>
      <div className="action-node-body">
        {elementMissing ? (
          <span className="target-tag empty" style={{ color: '#ff4d4f', fontWeight: 600 }}>
            ⚠️ 元素已删除，请重新选择
          </span>
        ) : targetName ? (
          <span className="target-tag">🎯 {targetName}</span>
        ) : (
          <span className="target-tag empty">双击配置参数</span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

export default memo(ActionNode);
