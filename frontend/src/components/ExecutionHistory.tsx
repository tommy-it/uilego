import React, { useEffect, useState, useCallback } from 'react';
import { Modal, Table, Tag, Button, Popconfirm, message, Space } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  DeleteOutlined,
  HistoryOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import * as api from '../services/api';
import type { ExecutionRecord } from '../types';
import { useStore } from '../stores/useStore';
import ReplayViewer from './ReplayViewer';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const statusTag = (status: string) => {
  switch (status) {
    case 'passed':
      return <Tag icon={<CheckCircleOutlined />} color="success">通过</Tag>;
    case 'failed':
      return <Tag icon={<CloseCircleOutlined />} color="error">失败</Tag>;
    case 'running':
      return <Tag color="processing">执行中</Tag>;
    default:
      return <Tag>{status}</Tag>;
  }
};

const ExecutionHistory: React.FC<Props> = ({ visible, onClose }) => {
  const currentProject = useStore((s) => s.currentProject);
  const projectId = currentProject?.id ?? null;
  const [records, setRecords] = useState<ExecutionRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [replayId, setReplayId] = useState<number | null>(null);

  const fetchRecords = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await api.getExecutions(projectId, page, 20);
      setRecords(res.data.items);
      setTotal(res.data.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [projectId, page]);

  useEffect(() => {
    if (visible) fetchRecords();
  }, [visible, fetchRecords]);

  const handleDelete = async (id: number) => {
    try {
      await api.deleteExecution(id);
      message.success('已删除');
      fetchRecords();
    } catch {
      message.error('删除失败');
    }
  };

  const columns: ColumnsType<ExecutionRecord> = [
    {
      title: '来源',
      dataIndex: 'source_name',
      key: 'source_name',
      ellipsis: true,
      render: (name: string, r) => (
        <span>
          <Tag style={{ fontSize: 11 }}>{r.source_type === 'testcase' ? '用例' : '页面'}</Tag>
          {name}
        </span>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (s: string) => statusTag(s),
    },
    {
      title: '步骤',
      key: 'steps',
      width: 100,
      render: (_, r) => (
        <span style={{ fontSize: 12 }}>
          <span style={{ color: '#52c41a' }}>{r.passed_count}</span>
          {' / '}
          <span style={{ color: r.failed_count > 0 ? '#ff4d4f' : '#999' }}>{r.failed_count}</span>
          {' / '}
          <span style={{ color: '#999' }}>{r.total_steps}</span>
        </span>
      ),
    },
    {
      title: '耗时',
      dataIndex: 'duration',
      key: 'duration',
      width: 80,
      render: (d: number) => `${d.toFixed(1)}s`,
    },
    {
      title: '设备',
      dataIndex: 'device_id',
      key: 'device_id',
      width: 120,
      ellipsis: true,
      render: (d: string) => d || '-',
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      render: (t: string) => {
        const d = new Date(t);
        return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, r) => (
        <Space size={4}>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => setReplayId(r.id)}
          >
            回放
          </Button>
          <Popconfirm
            title="确定删除此执行记录？"
            onConfirm={() => handleDelete(r.id)}
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Modal
        title={<span><HistoryOutlined /> 执行历史</span>}
        open={visible}
        onCancel={onClose}
        footer={null}
        width={850}
        destroyOnClose
      >
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#999', fontSize: 12 }}>共 {total} 条执行记录</span>
          <Button size="small" icon={<ReloadOutlined />} onClick={fetchRecords} loading={loading}>
            刷新
          </Button>
        </div>
        <Table
          dataSource={records}
          columns={columns}
          rowKey="id"
          size="small"
          loading={loading}
          pagination={{
            current: page,
            pageSize: 20,
            total,
            onChange: (p) => setPage(p),
            showSizeChanger: false,
          }}
        />
      </Modal>

      <ReplayViewer
        executionId={replayId}
        visible={replayId !== null}
        onClose={() => setReplayId(null)}
      />
    </>
  );
};

export default ExecutionHistory;
