import React, { useState, useMemo } from 'react';
import { Button, Select, Space, Typography, Empty, Badge, Tooltip, Popconfirm, message } from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  SaveOutlined,
  LinkOutlined,
  FileOutlined,
} from '@ant-design/icons';
import { useStore } from '../stores/useStore';
import './PageChainEditor.css';

const { Text, Title } = Typography;

const PageChainEditor: React.FC = () => {
  const {
    pages,
    currentTestCase,
    testCasePageRefs,
    setTestCasePages,
  } = useStore();

  // 本地编辑中的页面 ID 列表（未保存前可自由修改）
  const [localPageIds, setLocalPageIds] = useState<number[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);

  // 用例切换时初始化
  React.useEffect(() => {
    if (currentTestCase) {
      setLocalPageIds(testCasePageRefs.map((r) => r.page_id));
      setInitialized(true);
    }
  }, [currentTestCase?.id, testCasePageRefs]);

  // 可选页面（非目录）
  const availablePages = useMemo(() => {
    return pages.filter((p) => !p.is_folder);
  }, [pages]);

  // 尚未添加的页面
  const remainingPages = useMemo(() => {
    return availablePages.filter((p) => !localPageIds.includes(p.id));
  }, [availablePages, localPageIds]);

  // 根据 ID 获取 page 对象
  const getPagesInOrder = () => {
    return localPageIds
      .map((id) => {
        const page = availablePages.find((p) => p.id === id);
        const ref = testCasePageRefs.find((r) => r.page_id === id);
        return page ? { ...page, stepCount: ref?.step_count || 0 } : null;
      })
      .filter(Boolean);
  };

  const addPage = (pageId: number) => {
    setLocalPageIds((prev) => [...prev, pageId]);
  };

  const removePage = (index: number) => {
    setLocalPageIds((prev) => prev.filter((_, i) => i !== index));
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    setLocalPageIds((prev) => {
      const arr = [...prev];
      [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
      return arr;
    });
  };

  const moveDown = (index: number) => {
    setLocalPageIds((prev) => {
      if (index >= prev.length - 1) return prev;
      const arr = [...prev];
      [arr[index], arr[index + 1]] = [arr[index + 1], arr[index]];
      return arr;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setTestCasePages(localPageIds);
      message.success('页面链已保存');
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const isDirty = useMemo(() => {
    const savedIds = testCasePageRefs.map((r) => r.page_id);
    if (savedIds.length !== localPageIds.length) return true;
    return savedIds.some((id, i) => id !== localPageIds[i]);
  }, [testCasePageRefs, localPageIds]);

  if (!currentTestCase) {
    return (
      <div className="page-chain-editor">
        <Empty description="请先选择一个测试用例" />
      </div>
    );
  }

  const orderedPages = getPagesInOrder();

  return (
    <div className="page-chain-editor">
      <div className="page-chain-header">
        <Space>
          <LinkOutlined />
          <Text strong>页面编排流程</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            — {currentTestCase.name}
          </Text>
        </Space>
        <Space>
          <Select
            placeholder="+ 添加页面"
            style={{ width: 200 }}
            value={undefined}
            onChange={(val) => addPage(val)}
            options={remainingPages.map((p) => ({
              label: p.name,
              value: p.id,
            }))}
            notFoundContent={<Text type="secondary">没有更多可添加的页面</Text>}
            showSearch
            filterOption={(input, option) =>
              (option?.label as string)?.toLowerCase().includes(input.toLowerCase())
            }
            suffixIcon={<PlusOutlined />}
          />
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving}
            disabled={!isDirty}
          >
            保存流程
          </Button>
        </Space>
      </div>

      <div className="page-chain-desc">
        <Text type="secondary" style={{ fontSize: 12 }}>
          按顺序串联页面步骤，执行时依次运行每个页面的步骤编排
          {isDirty && <Badge status="warning" text="有未保存的修改" style={{ marginLeft: 8 }} />}
        </Text>
      </div>

      {orderedPages.length === 0 ? (
        <div className="page-chain-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <span>
                还没有添加页面，请通过上方下拉框添加页面到测试流程中
              </span>
            }
          />
        </div>
      ) : (
        <div className="page-chain-list">
          {orderedPages.map((page: any, index: number) => (
            <div
              key={`${page.id}-${index}`}
              className="page-chain-card"
            >
              {/* 序号 */}
              <div className="page-chain-order">{index + 1}</div>

              {/* 页面信息 */}
              <div className="page-chain-info">
                <div className="page-chain-name">
                  <FileOutlined style={{ marginRight: 6, color: '#8c8c8c' }} />
                  {page.name}
                </div>
                <div className="page-chain-meta">
                  <Badge
                    count={page.stepCount}
                    showZero
                    overflowCount={999}
                    style={{
                      backgroundColor: page.stepCount > 0 ? '#1890ff' : '#d9d9d9',
                    }}
                  />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {page.stepCount > 0 ? '个步骤' : '暂无步骤'}
                  </Text>
                </div>
              </div>

              {/* 连接线 */}
              {index < orderedPages.length - 1 && (
                <div className="page-chain-connector">
                  <div className="connector-line" />
                  <span className="connector-arrow">▼</span>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="page-chain-actions">
                <Tooltip title="上移">
                  <Button
                    size="small"
                    type="text"
                    icon={<ArrowUpOutlined />}
                    disabled={index === 0}
                    onClick={() => moveUp(index)}
                  />
                </Tooltip>
                <Tooltip title="下移">
                  <Button
                    size="small"
                    type="text"
                    icon={<ArrowDownOutlined />}
                    disabled={index === orderedPages.length - 1}
                    onClick={() => moveDown(index)}
                  />
                </Tooltip>
                <Popconfirm
                  title={`移除「${page.name}」？`}
                  onConfirm={() => removePage(index)}
                >
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                  />
                </Popconfirm>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 底部统计 */}
      {orderedPages.length > 0 && (
        <div className="page-chain-footer">
          <Text type="secondary" style={{ fontSize: 12 }}>
            共 {orderedPages.length} 个页面 · 总计{' '}
            {orderedPages.reduce((sum: number, p: any) => sum + p.stepCount, 0)} 个步骤
          </Text>
        </div>
      )}
    </div>
  );
};

export default PageChainEditor;
