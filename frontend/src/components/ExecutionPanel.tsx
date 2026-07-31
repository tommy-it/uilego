import React, { useEffect, useRef, useState } from 'react';
import { Tag, Space, Typography, Progress } from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  ClearOutlined,
  ThunderboltOutlined,
  ApiOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useStore } from '../stores/useStore';
import ReplayViewer from './ReplayViewer';
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
  const [executionId, setExecutionId] = useState<number | null>(null);
  const [showReplay, setShowReplay] = useState(false);
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
    setExecutionId(null);
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
        const res = JSON.parse(data.message) as ExecResult & { execution_id?: number };
        setResult(res);
        if (res.execution_id) setExecutionId(res.execution_id);
        setStatus(res.return_code === 0 ? 'passed' : 'failed');
        ws.close();
      } else if (data.level === 'screenshot') {
        // 截图消息不写入日志，由 ReplayViewer 使用
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
        return <Tag icon={<LoadingOutlined />} color="processing" style={{ background: '#111b26', border: '1px solid #153450', color: '#4096ff' }}>执行中</Tag>;
      case 'passed':
        return <Tag icon={<CheckCircleOutlined />} color="success" style={{ background: '#162312', border: '1px solid #274916', color: '#73d13d' }}>通过</Tag>;
      case 'failed':
        return <Tag icon={<CloseCircleOutlined />} color="error" style={{ background: '#2a1215', border: '1px solid #58181c', color: '#ff7875' }}>失败</Tag>;
      default:
        return <Tag style={{ background: '#303030', border: '1px solid #424242', color: '#aaa' }}>待执行</Tag>;
    }
  };

  return (
    <div className="execution-panel expanded">
      {/* 头部：标题 + 状态 */}
      <div className="execution-header" style={{ cursor: 'default' }}>
        <Space>
          <Text strong style={{ fontSize: 14 }}>🧪 实时执行</Text>
          {statusTag()}
        </Space>
      </div>

      {/* 控制栏 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: '#1f1f3a', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="exec-mode-switch">
          <button
            className={`exec-mode-btn ${execMode === 'adb' ? 'active' : ''}`}
            onClick={() => setExecMode('adb')}
          >
            <ThunderboltOutlined /> ADB 直连
          </button>
          <button
            className={`exec-mode-btn ${execMode === 'appium' ? 'active' : ''}`}
            onClick={() => setExecMode('appium')}
          >
            <ApiOutlined /> Appium
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <button className="exec-ctrl-btn" onClick={() => { setLogs([]); setResult(null); setStatus('idle'); }}>
          <ClearOutlined /> 清空
        </button>
        {status === 'running' ? (
          <button className="exec-ctrl-btn danger" onClick={stopRun}>
            <StopOutlined /> 停止
          </button>
        ) : (
          <button
            className="exec-ctrl-btn primary"
            onClick={startRun}
            disabled={!canRun}
          >
            <PlayCircleOutlined /> 运行
          </button>
        )}
      </div>

      {/* 结果统计 */}
      {result && (
        <div className="execution-summary">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: '#52c41a', fontSize: 12 }}>✓ {result.passed} 通过</span>
            <span style={{ color: '#ff4d4f', fontSize: 12 }}>✗ {result.failed} 失败</span>
            <span style={{ color: '#faad14', fontSize: 12 }}>⚠ {result.error} 错误</span>
            <span style={{ color: '#999', fontSize: 12 }}>{result.duration.toFixed(2)}s</span>
          </div>
          <Progress
            percent={result.return_code === 0 ? 100 : Math.round((result.passed / Math.max(1, result.passed + result.failed + result.error)) * 100)}
            status={result.return_code === 0 ? 'success' : 'exception'}
            size="small"
            strokeColor={result.return_code === 0 ? '#52c41a' : '#ff4d4f'}
            showInfo={false}
          />
          {executionId && (
            <button
              className="exec-ctrl-btn primary"
              style={{ marginTop: 8, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              onClick={() => setShowReplay(true)}
            >
              <EyeOutlined /> 查看回放
            </button>
          )}
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

      {/* 回放查看器 */}
      <ReplayViewer
        executionId={executionId}
        visible={showReplay}
        onClose={() => setShowReplay(false)}
      />
    </div>
  );
};

export default ExecutionPanel;
