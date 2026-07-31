import React, { useEffect, useRef, useState } from 'react';
import { Button, Tag, Space, Typography, Progress, Segmented, Tooltip } from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  ClearOutlined,
  ThunderboltOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import { useStore } from '../stores/useStore';
import './ExecutionPanel.css';

const { Text } = Typography;

interface LogEntry {
  level: string;
  message: string;
  ts: string;
}

interface ExecResult {
  return_code: number;
  passed: number;
  failed: number;
  error: number;
  duration: number;
}

type RunStatus = 'idle' | 'running' | 'passed' | 'failed';

interface Props {
  testcaseId: number | null;
}

const levelColors: Record<string, string> = {
  success: '#52c41a',
  error: '#ff4d4f',
  warning: '#faad14',
  system: '#8c8c8c',
  info: '#d4d4d4',
  done: '#1890ff',
};

const ExecutionPanel: React.FC<Props> = ({ testcaseId }) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<RunStatus>('idle');
  const [result, setResult] = useState<ExecResult | null>(null);
  const [execMode, setExecMode] = useState<string>('adb');
  const wsRef = useRef<WebSocket | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const currentProject = useStore((s) => s.currentProject);
  const editMode = useStore((s) => s.editMode);
  const currentPage = useStore((s) => s.currentPage);

  // 是否可以运行
  const canRun = editMode === 'page' ? !!currentPage : !!testcaseId;

  // 自动滚动到底部
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // 组件卸载时关闭 WebSocket
  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  const startRun = () => {
    setLogs([]);
    setResult(null);
    setStatus('running');

    const deviceName = currentProject?.device_name || '';
    const params = new URLSearchParams({ mode: execMode });
    if (deviceName) params.set('device', deviceName);

    let wsUrl: string;
    if (editMode === 'page' && currentPage) {
      wsUrl = `ws://localhost:8000/api/pages/${currentPage.id}/run?${params}`;
    } else if (testcaseId) {
      wsUrl = `ws://localhost:8000/api/testcases/${testcaseId}/run?${params}`;
    } else {
      setStatus('idle');
      return;
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.level === 'done') {
        const res = JSON.parse(data.message) as ExecResult;
        setResult(res);
        setStatus(res.return_code === 0 ? 'passed' : 'failed');
        ws.close();
      } else {
        setLogs((prev) => [...prev, data]);
      }
    };

    ws.onerror = () => {
      setStatus('failed');
      setLogs((prev) => [...prev, { level: 'error', message: 'WebSocket 连接失败', ts: '' }]);
    };

    ws.onclose = () => {
      setStatus((s) => (s === 'running' ? 'failed' : s));
    };
  };

  const stopRun = () => {
    wsRef.current?.close();
    setStatus('idle');
  };

  const statusTag = () => {
    switch (status) {
      case 'running':
        return <Tag icon={<LoadingOutlined />} color="processing">执行中</Tag>;
      case 'passed':
        return <Tag icon={<CheckCircleOutlined />} color="success">通过</Tag>;
      case 'failed':
        return <Tag icon={<CloseCircleOutlined />} color="error">失败</Tag>;
      default:
        return <Tag color="default">待执行</Tag>;
    }
  };

  return (
    <div className="execution-panel">
      <div className="execution-header">
        <Space>
          <Text strong>🧪 实时执行</Text>
          {statusTag()}
          {result && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              通过 {result.passed} / 失败 {result.failed} / 错误 {result.error} · {result.duration.toFixed(2)}s
            </Text>
          )}
        </Space>
        <Space>
          <Segmented
            size="small"
            value={execMode}
            onChange={(v) => setExecMode(v as string)}
            options={[
              {
                label: (
                  <Tooltip title="⚡ 跳过 Appium，直接 ADB 执行，速度快 5-10 倍">
                    <span><ThunderboltOutlined /> ADB 直连</span>
                  </Tooltip>
                ),
                value: 'adb',
              },
              {
                label: (
                  <Tooltip title="完整 Appium 执行，支持更多操作类型">
                    <span><ApiOutlined /> Appium</span>
                  </Tooltip>
                ),
                value: 'appium',
              },
            ]}
          />
          <Button
            size="small"
            icon={<ClearOutlined />}
            onClick={() => { setLogs([]); setResult(null); setStatus('idle'); }}
          >
            清空
          </Button>
          {status === 'running' ? (
            <Button size="small" danger icon={<StopOutlined />} onClick={stopRun}>
              停止
            </Button>
          ) : (
            <Button
              size="small"
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={startRun}
              disabled={!canRun}
            >
              运行
            </Button>
          )}
        </Space>
      </div>

      {/* 结果统计条 */}
      {result && (
        <div className="execution-summary">
          <Progress
            percent={result.return_code === 0 ? 100 : Math.round((result.passed / Math.max(1, result.passed + result.failed + result.error)) * 100)}
            status={result.return_code === 0 ? 'success' : 'exception'}
            size="small"
            strokeColor={result.return_code === 0 ? '#52c41a' : '#ff4d4f'}
          />
        </div>
      )}

      {/* 日志区域 */}
      <div className="execution-logs">
        {logs.length === 0 ? (
          <div className="execution-empty">
            {canRun
              ? `点击「运行」开始执行${editMode === 'page' ? `页面「${currentPage?.name}」` : ''}（${execMode === 'adb' ? 'ADB 直连' : 'Appium'}）`
              : editMode === 'page' ? '请先选择一个页面' : '请先选择测试用例'}
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="log-line" style={{ color: levelColors[log.level] || '#d4d4d4' }}>
              <span className="log-prefix">{log.level === 'success' ? '✓' : log.level === 'error' ? '✗' : '›'}</span>
              {log.message}
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
};

export default ExecutionPanel;
