import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Modal, Button, Progress, Tag, Space, Tooltip, Spin } from 'antd';
import {
  LeftOutlined,
  RightOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  ExclamationCircleFilled,
  PlayCircleOutlined,
  PauseCircleOutlined,
  StepForwardOutlined,
  StepBackwardOutlined,
  FullscreenOutlined,
} from '@ant-design/icons';
import * as api from '../services/api';
import type { ExecutionDetail, ExecutionStepRecord } from '../types';
import './ReplayViewer.css';

interface Props {
  executionId: number | null;
  visible: boolean;
  onClose: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  tap: '👆 点击',
  long_press: '👇 长按',
  swipe: '👉 滑动',
  input_text: '⌨️ 输入',
  clear_input: '🧹 清空',
  assert_exists: '✅ 断言存在',
  assert_text: '📝 断言文本',
  wait: '⏳ 等待',
  screenshot: '📷 截图',
  back: '↩️ 返回',
};

const statusIcon = (status: string, size = 16) => {
  switch (status) {
    case 'passed':
      return <CheckCircleFilled style={{ color: '#52c41a', fontSize: size }} />;
    case 'failed':
      return <CloseCircleFilled style={{ color: '#ff4d4f', fontSize: size }} />;
    case 'error':
      return <ExclamationCircleFilled style={{ color: '#faad14', fontSize: size }} />;
    default:
      return null;
  }
};

const ReplayViewer: React.FC<Props> = ({ executionId, visible, onClose }) => {
  const [detail, setDetail] = useState<ExecutionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [autoPlaying, setAutoPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(2000); // ms per step
  const [fullscreen, setFullscreen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDetail = useCallback(async () => {
    if (!executionId) return;
    setLoading(true);
    try {
      const res = await api.getExecutionDetail(executionId);
      setDetail(res.data);
      setCurrentStep(0);
    } catch {
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [executionId]);

  useEffect(() => {
    if (visible && executionId) fetchDetail();
  }, [visible, executionId, fetchDetail]);

  // Auto-play logic
  useEffect(() => {
    if (autoPlaying && detail && detail.steps.length > 0) {
      timerRef.current = setInterval(() => {
        setCurrentStep((prev) => {
          if (prev >= detail.steps.length - 1) {
            setAutoPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, playSpeed);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoPlaying, playSpeed, detail]);

  // Keyboard navigation
  useEffect(() => {
    if (!visible || !detail) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setCurrentStep((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        setCurrentStep((prev) => Math.min((detail.steps.length || 1) - 1, prev + 1));
      } else if (e.key === ' ') {
        e.preventDefault();
        setAutoPlaying((prev) => !prev);
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, detail, onClose]);

  const step = detail?.steps[currentStep] as ExecutionStepRecord | undefined;
  const totalSteps = detail?.steps.length || 0;
  const progress = totalSteps > 0 ? Math.round(((currentStep + 1) / totalSteps) * 100) : 0;

  const screenshotUrl = step?.screenshot_url
    ? `http://localhost:8000${step.screenshot_url}`
    : null;

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      width={fullscreen ? '100vw' : 1100}
      style={fullscreen ? { top: 0, padding: 0, maxWidth: '100vw' } : {}}
      bodyStyle={{ padding: 0, height: fullscreen ? '100vh' : '80vh', overflow: 'hidden' }}
      className="replay-modal"
      title={
        detail ? (
          <div className="replay-title">
            <span className="replay-title-text">
              执行回放: {detail.record.source_name}
            </span>
            {detail.record.status === 'passed' ? (
              <Tag color="success">通过</Tag>
            ) : (
              <Tag color="error">失败</Tag>
            )}
            <span className="replay-title-meta">
              {detail.record.duration.toFixed(1)}s · {totalSteps} 步
            </span>
          </div>
        ) : '加载中...'
      }
    >
      {loading || !detail ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
          <Spin size="large" tip="加载执行记录..." />
        </div>
      ) : (
        <div className="replay-container">
          {/* 进度条 */}
          <div className="replay-progress">
            <Progress
              percent={progress}
              status={detail.record.status === 'passed' ? 'success' : 'exception'}
              showInfo={false}
              size="small"
            />
            <span className="replay-progress-text">
              Step {currentStep + 1} / {totalSteps}
            </span>
          </div>

          {/* 控制栏 */}
          <div className="replay-controls">
            <Space>
              <Tooltip title="上一步 (←)">
                <Button
                  icon={<StepBackwardOutlined />}
                  disabled={currentStep <= 0}
                  onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
                  size="small"
                />
              </Tooltip>
              <Tooltip title={autoPlaying ? '暂停 (空格)' : '自动播放 (空格)'}>
                <Button
                  icon={autoPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                  type={autoPlaying ? 'primary' : 'default'}
                  onClick={() => setAutoPlaying((p) => !p)}
                  size="small"
                />
              </Tooltip>
              <Tooltip title="下一步 (→)">
                <Button
                  icon={<StepForwardOutlined />}
                  disabled={currentStep >= totalSteps - 1}
                  onClick={() => setCurrentStep((s) => Math.min(totalSteps - 1, s + 1))}
                  size="small"
                />
              </Tooltip>
              <Space size={2}>
                {[1500, 2000, 3000].map((ms) => (
                  <Button
                    key={ms}
                    size="small"
                    type={playSpeed === ms ? 'primary' : 'text'}
                    onClick={() => setPlaySpeed(ms)}
                    style={{ fontSize: 11, padding: '0 6px' }}
                  >
                    {ms === 1500 ? '1x' : ms === 2000 ? '2x' : '3x'}
                  </Button>
                ))}
              </Space>
            </Space>
            <Button
              size="small"
              icon={<FullscreenOutlined />}
              onClick={() => setFullscreen((f) => !f)}
            />
          </div>

          {/* 主内容区 */}
          <div className="replay-content">
            {/* 左侧步骤列表 */}
            <div className="replay-steps">
              {detail.steps.map((s, idx) => (
                <div
                  key={s.id}
                  className={`replay-step-item ${idx === currentStep ? 'active' : ''} ${s.status}`}
                  onClick={() => setCurrentStep(idx)}
                >
                  <span className="replay-step-icon">{statusIcon(s.status, 14)}</span>
                  <span className="replay-step-order">{s.step_order}</span>
                  <span className="replay-step-label">
                    {ACTION_LABELS[s.action_type] || s.action_type}
                    {s.element_name && (
                      <span className="replay-step-element">[{s.element_name}]</span>
                    )}
                  </span>
                </div>
              ))}
            </div>

            {/* 右侧截图 + 详情 */}
            <div className="replay-detail">
              {/* 截图 */}
              <div className="replay-screenshot">
                {screenshotUrl ? (
                  <img
                    src={screenshotUrl}
                    alt={`Step ${currentStep + 1}`}
                    className="replay-screenshot-img"
                  />
                ) : (
                  <div className="replay-screenshot-empty">
                    无截图
                  </div>
                )}
              </div>

              {/* 步骤详情 */}
              {step && (
                <div className="replay-step-detail">
                  <div className="replay-detail-row">
                    <span className="replay-detail-label">操作</span>
                    <span>{ACTION_LABELS[step.action_type] || step.action_type}</span>
                  </div>
                  {step.element_name && (
                    <div className="replay-detail-row">
                      <span className="replay-detail-label">元素</span>
                      <span>{step.element_name}</span>
                    </div>
                  )}
                  {Object.keys(step.params).length > 0 && (
                    <div className="replay-detail-row">
                      <span className="replay-detail-label">参数</span>
                      <code className="replay-detail-params">
                        {JSON.stringify(step.params)}
                      </code>
                    </div>
                  )}
                  <div className="replay-detail-row">
                    <span className="replay-detail-label">状态</span>
                    <span>{statusIcon(step.status)} {step.status}</span>
                  </div>
                  <div className="replay-detail-row">
                    <span className="replay-detail-label">耗时</span>
                    <span>{step.duration.toFixed(2)}s</span>
                  </div>
                  {step.log_message && (
                    <div className="replay-detail-log">
                      <span className="replay-detail-label">日志</span>
                      <pre>{step.log_message}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default ReplayViewer;
