import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button, Form, Input, Select, Space, message, Divider, Typography, Popconfirm, Tooltip } from 'antd';
import {
  PlusOutlined,
  SaveOutlined,
  DeleteOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  AimOutlined,
  ClearOutlined,
  EditOutlined,
  DragOutlined,
  ExpandOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { useStore } from '../stores/useStore';
import type { AnnotationRect, ElementType, LocatorType, BBox, LocatorItem } from '../types';
import './AnnotationCanvas.css';

const { Text } = Typography;

const ELEMENT_TYPES: ElementType[] = [
  'button', 'input', 'image', 'text', 'icon', 'checkbox', 'list_item', 'link', 'other',
];

const LOCATOR_FIELDS: { key: LocatorType; label: string; placeholder: string }[] = [
  { key: 'coordinate', label: '坐标（自动填充）', placeholder: '由框选区域自动计算' },
  { key: 'id', label: 'Resource ID', placeholder: '如 com.app:id/btn_login' },
  { key: 'text', label: '文本内容', placeholder: '如 登录、确定' },
  { key: 'accessibility_id', label: 'Accessibility ID', placeholder: '如 btn_login' },
  { key: 'xpath', label: 'XPath', placeholder: '如 //android.widget.Button[@text="登录"]' },
];

interface DrawState {
  isDrawing: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface DragState {
  isDragging: boolean;
  targetId: string;
  targetType: 'saved' | 'pending';
  startMouseX: number;
  startMouseY: number;
  startBBoxX: number;
  startBBoxY: number;
}

// 调整大小方向
type ResizeDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

interface ResizeState {
  isResizing: boolean;
  targetId: string;
  targetType: 'saved' | 'pending';
  dir: ResizeDir;
  startMouseX: number;
  startMouseY: number;
  startBBox: BBox;
}

interface EditTarget {
  type: 'saved' | 'pending';
  id: string;
}

const AnnotationCanvas: React.FC = () => {
  const {
    currentPage,
    elements,
    annotations,
    isAnnotating,
    setAnnotating,
    addAnnotation,
    updateAnnotation,
    removeAnnotation,
    clearAnnotations,
    saveAnnotations,
    updateElement,
    deleteElement,
  } = useStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [draw, setDraw] = useState<DrawState>({
    isDrawing: false, startX: 0, startY: 0, currentX: 0, currentY: 0,
  });
  const [drag, setDrag] = useState<DragState>({
    isDragging: false, targetId: '', targetType: 'saved',
    startMouseX: 0, startMouseY: 0, startBBoxX: 0, startBBoxY: 0,
  });
  const [resize, setResize] = useState<ResizeState>({
    isResizing: false, targetId: '', targetType: 'saved', dir: 'se',
    startMouseX: 0, startMouseY: 0, startBBox: { x: 0, y: 0, width: 0, height: 0 },
  });
  // resize 过程中的实时视觉 bbox（用于已保存元素）
  const [resizeVisualBBox, setResizeVisualBBox] = useState<BBox | null>(null);
  // drag 过程中的实时视觉位置（用于已保存元素）
  const [dragVisualPos, setDragVisualPos] = useState<{ x: number; y: number } | null>(null);
  const [scale, setScale] = useState(1);

  // 新建标注：右侧面板
  const [pendingBBox, setPendingBBox] = useState<BBox | null>(null);
  const [form] = Form.useForm();

  // 编辑弹窗
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm] = Form.useForm();

  // 选中态
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  // ========== 缩放控制 ==========
  const zoomToFit = useCallback(() => {
    const wrapper = wrapperRef.current;
    const img = imgRef.current;
    if (!wrapper || !img) return;
    const wrapperW = wrapper.clientWidth - 32;
    const wrapperH = wrapper.clientHeight - 32;
    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;
    if (imgW === 0 || imgH === 0) return;
    const fitScale = Math.min(wrapperW / imgW, wrapperH / imgH, 1);
    setScale(Math.round(fitScale * 100) / 100);
  }, []);

  const zoomTo100 = useCallback(() => { setScale(1); }, []);

  // 页面切换时自动适配
  useEffect(() => {
    if (!currentPage) return;
    const img = new Image();
    img.src = `http://localhost:8000${currentPage.screenshot_url}`;
    img.onload = () => { setTimeout(() => zoomToFit(), 100); };
  }, [currentPage?.id]);

  const getRelativePos = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (e.clientX - rect.left) / scale,
      y: (e.clientY - rect.top) / scale,
    };
  }, [scale]);

  // ========== 框选新建 ==========
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isAnnotating && !resize.isResizing && !drag.isDragging) {
      const pos = getRelativePos(e);
      setDraw({ isDrawing: true, startX: pos.x, startY: pos.y, currentX: pos.x, currentY: pos.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // 调整大小
    if (resize.isResizing) {
      const pos = getRelativePos(e);
      const dx = Math.round(pos.x - resize.startMouseX);
      const dy = Math.round(pos.y - resize.startMouseY);
      const sb = resize.startBBox;
      let newX = sb.x, newY = sb.y, newW = sb.width, newH = sb.height;
      const dir = resize.dir;

      if (dir.includes('w')) { newX = sb.x + dx; newW = sb.width - dx; }
      if (dir.includes('e')) { newW = sb.width + dx; }
      if (dir.includes('n')) { newY = sb.y + dy; newH = sb.height - dy; }
      if (dir.includes('s')) { newH = sb.height + dy; }

      // 最小尺寸
      if (newW < 10) { newW = 10; if (dir.includes('w')) newX = sb.x + sb.width - 10; }
      if (newH < 10) { newH = 10; if (dir.includes('n')) newY = sb.y + sb.height - 10; }

      const newBBox = { x: newX, y: newY, width: newW, height: newH };
      if (resize.targetType === 'pending') {
        const ann = annotations.find((a) => a.id === resize.targetId);
        if (ann) updateAnnotation(ann.id, { bbox: newBBox });
      } else {
        // 已保存元素：更新视觉状态
        setResizeVisualBBox(newBBox);
      }
      return;
    }

    if (draw.isDrawing) {
      const pos = getRelativePos(e);
      setDraw((d) => ({ ...d, currentX: pos.x, currentY: pos.y }));
      return;
    }
    if (drag.isDragging) {
      const pos = getRelativePos(e);
      const dx = Math.round(pos.x - drag.startMouseX);
      const dy = Math.round(pos.y - drag.startMouseY);
      const newX = Math.max(0, drag.startBBoxX + dx);
      const newY = Math.max(0, drag.startBBoxY + dy);

      if (drag.targetType === 'pending') {
        const ann = annotations.find((a) => a.id === drag.targetId);
        if (ann) updateAnnotation(ann.id, { bbox: { ...ann.bbox, x: newX, y: newY } });
      } else {
        // 已保存元素：更新视觉位置
        setDragVisualPos({ x: newX, y: newY });
      }
    }
  };

  const handleMouseUp = () => {
    if (draw.isDrawing) {
      const bbox: BBox = {
        x: Math.round(Math.min(draw.startX, draw.currentX)),
        y: Math.round(Math.min(draw.startY, draw.currentY)),
        width: Math.round(Math.abs(draw.currentX - draw.startX)),
        height: Math.round(Math.abs(draw.currentY - draw.startY)),
      };
      setDraw((d) => ({ ...d, isDrawing: false }));
      if (bbox.width < 5 || bbox.height < 5) return;
      setPendingBBox(bbox);
      const cx = Math.round(bbox.x + bbox.width / 2);
      const cy = Math.round(bbox.y + bbox.height / 2);
      form.setFieldsValue({
        type: 'button',
        locator_coordinate: `(${cx}, ${cy})`,
      });
      return;
    }
    if (resize.isResizing) {
      // 调整大小结束 — 如果是已保存元素，同步到后端
      if (resize.targetType === 'saved' && resizeVisualBBox) {
        const el = elements.find((e) => String(e.id) === resize.targetId);
        if (el) {
          updateElement(el.id, { bbox: resizeVisualBBox }).then(() => {
            message.success(`元素「${el.name}」尺寸已更新`);
          });
        }
      }
      setResizeVisualBBox(null);
      setResize((r) => ({ ...r, isResizing: false }));
      return;
    }
    if (drag.isDragging) {
      if (drag.targetType === 'saved' && dragVisualPos) {
        const el = elements.find((e) => String(e.id) === drag.targetId);
        if (el) {
          updateElement(el.id, { bbox: { ...el.bbox, x: dragVisualPos.x, y: dragVisualPos.y } });
        }
      }
      setDragVisualPos(null);
      setDrag((d) => ({ ...d, isDragging: false }));
    }
  };

  // 面板提交新建标注
  const handlePanelOk = async () => {
    try {
      const values = await form.validateFields();
      const locators: LocatorItem[] = LOCATOR_FIELDS
        .map((f) => ({ type: f.key, value: (values[`locator_${f.key}`] || '').trim() }))
        .filter((loc) => loc.value.length > 0);

      const textLoc = locators.find((l) => l.type === 'text');
      if (textLoc && /^\(\d+,\s*\d+\)$/.test(textLoc.value)) {
        message.error('文本定位器必须填真实文字，不能是坐标！');
        return;
      }

      const primary = locators[0] || { type: 'coordinate' as LocatorType, value: '' };
      const rect: AnnotationRect = {
        id: `ann_${Date.now()}`,
        bbox: pendingBBox!,
        name: values.name,
        type: values.type,
        locator_type: primary.type,
        locator_value: primary.value,
        locators,
        description: values.description || '',
      };
      addAnnotation(rect);
      setPendingBBox(null);
      form.resetFields();
      message.success(`已添加元素: ${rect.name}（${locators.length} 个定位器）`);
    } catch {
      // validation failed
    }
  };

  const handlePanelCancel = () => {
    setPendingBBox(null);
    form.resetFields();
  };

  const handleSave = async () => {
    await saveAnnotations();
    message.success('所有标注已保存');
    setAnnotating(false);
  };

  // ========== 元素交互 ==========
  const handleBoxClick = (e: React.MouseEvent, type: 'saved' | 'pending', id: string | number) => {
    e.stopPropagation();
    setSelectedKey(`${type}_${id}`);
  };

  const handleBoxMouseDown = (e: React.MouseEvent, type: 'saved' | 'pending', id: string | number, bbox: BBox) => {
    if (isAnnotating) return;
    if (resize.isResizing) return;
    e.stopPropagation();
    const pos = getRelativePos(e);
    setSelectedKey(`${type}_${id}`);
    setDrag({
      isDragging: true,
      targetId: String(id),
      targetType: type,
      startMouseX: pos.x,
      startMouseY: pos.y,
      startBBoxX: bbox.x,
      startBBoxY: bbox.y,
    });
  };

  // 调整大小开始
  const handleResizeMouseDown = (e: React.MouseEvent, type: 'saved' | 'pending', id: string | number, bbox: BBox, dir: ResizeDir) => {
    e.stopPropagation();
    e.preventDefault();
    const pos = getRelativePos(e);
    setResize({
      isResizing: true,
      targetId: String(id),
      targetType: type,
      dir,
      startMouseX: pos.x,
      startMouseY: pos.y,
      startBBox: bbox,
    });
  };

  const handleDragEnd = useCallback(async (type: 'saved' | 'pending', id: string, newBBox: BBox) => {
    if (type === 'saved') {
      const el = elements.find((e) => String(e.id) === id);
      if (el) {
        await updateElement(el.id, { bbox: newBBox });
        message.success(`元素「${el.name}」位置已更新`);
      }
    }
  }, [elements, updateElement]);

  // 编辑弹窗
  const openEditModal = (type: 'saved' | 'pending', id: string | number) => {
    if (type === 'saved') {
      const el = elements.find((e) => e.id === id);
      if (!el) return;
      editForm.setFieldsValue({
        name: el.name,
        type: el.type,
        description: el.description,
        ...Object.fromEntries(
          (el.locators || []).map((loc: LocatorItem) => [`locator_${loc.type}`, loc.value])
        ),
      });
      setEditTarget({ type: 'saved', id: String(id) });
    } else {
      const ann = annotations.find((a) => a.id === id);
      if (!ann) return;
      editForm.setFieldsValue({
        name: ann.name,
        type: ann.type,
        description: ann.description,
        ...Object.fromEntries(
          (ann.locators || []).map((loc: LocatorItem) => [`locator_${loc.type}`, loc.value])
        ),
      });
      setEditTarget({ type: 'pending', id: String(id) });
    }
    setEditModalOpen(true);
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    try {
      const values = await editForm.validateFields();
      const locators: LocatorItem[] = LOCATOR_FIELDS
        .map((f) => ({ type: f.key, value: (values[`locator_${f.key}`] || '').trim() }))
        .filter((loc) => loc.value.length > 0);

      const textLoc = locators.find((l) => l.type === 'text');
      if (textLoc && /^\(\d+,\s*\d+\)$/.test(textLoc.value)) {
        message.error('文本定位器必须填真实文字，不能是坐标！');
        return;
      }

      const primary = locators[0] || { type: 'coordinate' as LocatorType, value: '' };

      if (editTarget.type === 'saved') {
        await updateElement(Number(editTarget.id), {
          name: values.name,
          type: values.type,
          description: values.description || '',
          locator_type: primary.type,
          locator_value: primary.value,
          locators,
        });
        message.success('元素已更新');
      } else {
        const ann = annotations.find((a) => a.id === editTarget.id);
        if (ann) {
          updateAnnotation(ann.id, {
            name: values.name,
            type: values.type,
            description: values.description || '',
            locator_type: primary.type,
            locator_value: primary.value,
            locators,
          });
          message.success('标注已更新');
        }
      }
      setEditModalOpen(false);
      setEditTarget(null);
    } catch {
      // validation failed
    }
  };

  const handleDeleteSaved = async (id: number, name: string) => {
    await deleteElement(id);
    setSelectedKey(null);
    message.success(`元素「${name}」已删除`);
  };

  const handleDeletePending = (id: string) => {
    removeAnnotation(id);
    setSelectedKey(null);
    message.info('标注已移除');
  };

  const handleCanvasClick = () => {
    if (!draw.isDrawing && !drag.isDragging && !resize.isResizing) {
      setSelectedKey(null);
    }
  };

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!selectedKey) return;
      const [type, id] = selectedKey.split('_');
      if (type === 'pending') handleDeletePending(id);
    }
  }, [selectedKey]);

  if (!currentPage) {
    return (
      <div className="annotation-empty">
        <p>请先选择一个页面（上传截图）</p>
      </div>
    );
  }

  const screenshotUrl = `http://localhost:8000${currentPage.screenshot_url}`;

  // 渲染调整大小控制点
  const renderResizeHandles = (type: 'saved' | 'pending', id: string | number, bbox: BBox) => {
    const key = `${type}_${id}`;
    if (selectedKey !== key) return null;
    const dirs: { dir: ResizeDir; style: React.CSSProperties }[] = [
      { dir: 'nw', style: { top: -5, left: -5, cursor: 'nw-resize' } },
      { dir: 'n', style: { top: -5, left: '50%', marginLeft: -4, cursor: 'n-resize' } },
      { dir: 'ne', style: { top: -5, right: -5, cursor: 'ne-resize' } },
      { dir: 'e', style: { top: '50%', marginTop: -4, right: -5, cursor: 'e-resize' } },
      { dir: 'se', style: { bottom: -5, right: -5, cursor: 'se-resize' } },
      { dir: 's', style: { bottom: -5, left: '50%', marginLeft: -4, cursor: 's-resize' } },
      { dir: 'sw', style: { bottom: -5, left: -5, cursor: 'sw-resize' } },
      { dir: 'w', style: { top: '50%', marginTop: -4, left: -5, cursor: 'w-resize' } },
    ];
    return dirs.map(({ dir, style }) => (
      <div
        key={dir}
        className="resize-handle"
        style={style}
        onMouseDown={(e) => handleResizeMouseDown(e, type, id, bbox, dir)}
      />
    ));
  };

  const renderBoxActions = (type: 'saved' | 'pending', id: string | number, name: string) => {
    const key = `${type}_${id}`;
    if (selectedKey !== key) return null;
    return (
      <div className="box-actions">
        <Tooltip title="编辑属性">
          <Button size="small" type="text" icon={<EditOutlined />} className="box-action-btn"
            onClick={(e) => { e.stopPropagation(); openEditModal(type, id); }} />
        </Tooltip>
        {type === 'saved' ? (
          <Popconfirm title={`删除元素「${name}」？`}
            onConfirm={(e) => { e?.stopPropagation(); handleDeleteSaved(Number(id), name); }}
            onCancel={(e) => e?.stopPropagation()}>
            <Tooltip title="删除">
              <Button size="small" type="text" danger icon={<DeleteOutlined />} className="box-action-btn"
                onClick={(e) => e.stopPropagation()} />
            </Tooltip>
          </Popconfirm>
        ) : (
          <Tooltip title="移除">
            <Button size="small" type="text" danger icon={<DeleteOutlined />} className="box-action-btn"
              onClick={(e) => { e.stopPropagation(); handleDeletePending(String(id)); }} />
          </Tooltip>
        )}
      </div>
    );
  };

  return (
    <div className="annotation-container">
      {/* 工具栏 */}
      <div className="annotation-toolbar">
        <Space>
          <Button type={isAnnotating ? 'primary' : 'default'} icon={<PlusOutlined />}
            onClick={() => setAnnotating(!isAnnotating)}>
            {isAnnotating ? '标注中...' : '开始标注'}
          </Button>
          <Button icon={<SaveOutlined />} onClick={handleSave} disabled={annotations.length === 0}>
            保存标注 ({annotations.length})
          </Button>
          {annotations.length > 0 && (
            <Button icon={<ClearOutlined />} danger
              onClick={() => { clearAnnotations(); setSelectedKey(null); message.info('已清空所有未保存标注'); }}>
              清空
            </Button>
          )}
          <Divider type="vertical" />
          <Tooltip title="缩小">
            <Button icon={<ZoomOutOutlined />} onClick={() => setScale((s) => Math.max(0.1, +(s - 0.1).toFixed(1)))} />
          </Tooltip>
          <span style={{ minWidth: 44, textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
          <Tooltip title="放大">
            <Button icon={<ZoomInOutlined />} onClick={() => setScale((s) => Math.min(5, +(s + 0.1).toFixed(1)))} />
          </Tooltip>
          <Tooltip title="1:1 原始大小">
            <Button size="small" onClick={zoomTo100} style={{ fontSize: 12, fontWeight: 600 }}>1:1</Button>
          </Tooltip>
          <Tooltip title="适配窗口">
            <Button icon={<ExpandOutlined />} onClick={zoomToFit} />
          </Tooltip>
        </Space>
        <span className="annotation-hint">
          {isAnnotating ? '🖱️ 拖拽框选元素区域' : '✋ 点击元素选中 · 拖拽移动 · 拖拽角点调整大小 · 双击编辑 · Delete 删除'}
        </span>
      </div>

      {/* 主体：画布 + 右侧面板 */}
      <div className="annotation-body">
        <div ref={wrapperRef} className="annotation-canvas-wrapper" tabIndex={0} onKeyDown={handleKeyDown}>
          <div
            ref={containerRef}
            className={`annotation-canvas ${isAnnotating ? 'crosshair' : 'select-mode'} ${resize.isResizing ? 'resizing' : ''}`}
            style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              handleMouseUp();
              if (drag.isDragging) {
                const target = drag.targetType === 'saved'
                  ? elements.find((e) => String(e.id) === drag.targetId)
                  : annotations.find((a) => a.id === drag.targetId);
                if (target) handleDragEnd(drag.targetType, drag.targetId, target.bbox);
                setDrag((d) => ({ ...d, isDragging: false }));
              }
            }}
            onClick={handleCanvasClick}
          >
            <img ref={imgRef} src={screenshotUrl} alt="screenshot" draggable={false} />

            {/* 已保存的元素框 */}
            {elements.map((el) => {
              const key = `saved_${el.id}`;
              const isSelected = selectedKey === key;
              // resize 过程中使用实时 bbox，否则用 store 中的
              const isResizingThis = resize.isResizing && resize.targetId === String(el.id) && resize.targetType === 'saved';
              const isDraggingThis = drag.isDragging && drag.targetId === String(el.id) && drag.targetType === 'saved';
              let bbox = el.bbox;
              if (isResizingThis && resizeVisualBBox) bbox = resizeVisualBBox;
              else if (isDraggingThis && dragVisualPos) bbox = { ...el.bbox, x: dragVisualPos.x, y: dragVisualPos.y };
              return (
                <div key={`el_${el.id}`} data-id={el.id}
                  className={`element-box saved ${isSelected ? 'selected' : ''} ${drag.isDragging && drag.targetId === String(el.id) ? 'dragging' : ''}`}
                  style={{ left: bbox.x, top: bbox.y, width: bbox.width, height: bbox.height }}
                  onClick={(e) => handleBoxClick(e, 'saved', el.id)}
                  onMouseDown={(e) => handleBoxMouseDown(e, 'saved', el.id, el.bbox)}
                  onDoubleClick={(e) => { e.stopPropagation(); openEditModal('saved', el.id); }}>
                  <span className="box-label">
                    {isSelected && <DragOutlined style={{ marginRight: 4 }} />}
                    {el.name}
                  </span>
                  {renderBoxActions('saved', el.id, el.name)}
                  {renderResizeHandles('saved', el.id, bbox)}
                </div>
              );
            })}

            {/* 待保存的标注框 */}
            {annotations.map((ann) => {
              const key = `pending_${ann.id}`;
              const isSelected = selectedKey === key;
              return (
                <div key={ann.id} data-id={ann.id}
                  className={`element-box pending ${isSelected ? 'selected' : ''} ${drag.isDragging && drag.targetId === ann.id ? 'dragging' : ''}`}
                  style={{ left: ann.bbox.x, top: ann.bbox.y, width: ann.bbox.width, height: ann.bbox.height }}
                  onClick={(e) => handleBoxClick(e, 'pending', ann.id)}
                  onMouseDown={(e) => handleBoxMouseDown(e, 'pending', ann.id, ann.bbox)}
                  onDoubleClick={(e) => { e.stopPropagation(); openEditModal('pending', ann.id); }}>
                  <span className="box-label">
                    {isSelected && <DragOutlined style={{ marginRight: 4 }} />}
                    {ann.name}
                  </span>
                  {renderBoxActions('pending', ann.id, ann.name)}
                  {renderResizeHandles('pending', ann.id, ann.bbox)}
                </div>
              );
            })}

            {/* 正在绘制的框 */}
            {draw.isDrawing && (
              <div className="element-box drawing"
                style={{
                  left: Math.min(draw.startX, draw.currentX),
                  top: Math.min(draw.startY, draw.currentY),
                  width: Math.abs(draw.currentX - draw.startX),
                  height: Math.abs(draw.currentY - draw.startY),
                }} />
            )}
          </div>
        </div>

        {/* 右侧新建标注面板 */}
        {pendingBBox && (
          <div className="annotation-side-panel">
            <div className="panel-header">
              <Text strong>新建元素标注</Text>
              <Button type="text" size="small" icon={<CloseOutlined />} onClick={handlePanelCancel} />
            </div>
            <div className="panel-bbox-info">
              <Text type="secondary" style={{ fontSize: 11 }}>
                区域: ({pendingBBox.x}, {pendingBBox.y}) {pendingBBox.width}×{pendingBBox.height}
              </Text>
            </div>
            <Form form={form} layout="vertical" size="small" className="panel-form">
              <Form.Item name="name" label="元素名称" rules={[{ required: true, message: '请输入名称' }]}>
                <Input placeholder="如：登录按钮" />
              </Form.Item>
              <Form.Item name="type" label="元素类型" initialValue="button">
                <Select options={ELEMENT_TYPES.map((t) => ({ label: t, value: t }))} />
              </Form.Item>
              <Divider orientation="left" style={{ fontSize: 12, margin: '8px 0' }}>
                <AimOutlined /> 定位方式
              </Divider>
              {LOCATOR_FIELDS.map((f) => (
                <Form.Item key={f.key} name={`locator_${f.key}`}
                  label={<Text style={{ fontSize: 12 }}>{f.label}</Text>}
                  style={{ marginBottom: 6 }}>
                  <Input placeholder={f.placeholder} disabled={f.key === 'coordinate'} style={{ fontSize: 12 }} />
                </Form.Item>
              ))}
              <Form.Item name="description" label="描述" style={{ marginBottom: 8 }}>
                <Input.TextArea placeholder="可选" rows={2} />
              </Form.Item>
              <div className="panel-actions">
                <Button type="primary" onClick={handlePanelOk} block>确认添加</Button>
                <Button onClick={handlePanelCancel} block style={{ marginTop: 6 }}>取消</Button>
              </div>
            </Form>
          </div>
        )}
      </div>

      {/* 编辑元素属性弹窗 */}
      <div className="edit-modal-overlay" style={{ display: editModalOpen ? 'flex' : 'none' }}>
        <div className="edit-modal">
          <div className="edit-modal-header">
            <Text strong>编辑元素：{editTarget?.type === 'saved' ? elements.find(e => String(e.id) === editTarget?.id)?.name || '' : annotations.find(a => a.id === editTarget?.id)?.name || ''}</Text>
            <Button type="text" size="small" icon={<CloseOutlined />} onClick={() => { setEditModalOpen(false); setEditTarget(null); }} />
          </div>
          <Form form={editForm} layout="vertical" size="small" className="panel-form">
            <Form.Item name="name" label="元素名称" rules={[{ required: true, message: '请输入名称' }]}>
              <Input placeholder="如：登录按钮" />
            </Form.Item>
            <Form.Item name="type" label="元素类型">
              <Select options={ELEMENT_TYPES.map((t) => ({ label: t, value: t }))} />
            </Form.Item>
            <Divider orientation="left" style={{ fontSize: 12, margin: '8px 0' }}>
              <AimOutlined /> 定位方式
            </Divider>
            {LOCATOR_FIELDS.map((f) => (
              <Form.Item key={f.key} name={`locator_${f.key}`}
                label={<Text style={{ fontSize: 12 }}>{f.label}</Text>}
                style={{ marginBottom: 6 }}>
                <Input placeholder={f.placeholder} disabled={f.key === 'coordinate'} style={{ fontSize: 12 }} />
              </Form.Item>
            ))}
            <Form.Item name="description" label="描述" style={{ marginBottom: 8 }}>
              <Input.TextArea placeholder="可选" rows={2} />
            </Form.Item>
            <div className="panel-actions">
              <Button type="primary" onClick={handleEditSave} block>保存修改</Button>
              <Button onClick={() => { setEditModalOpen(false); setEditTarget(null); }} block style={{ marginTop: 6 }}>取消</Button>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
};

export default AnnotationCanvas;
