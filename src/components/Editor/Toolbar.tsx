/**
 * 顶部工具栏 - 对应文档 4.1
 * 预览/保存/导出/添加分镜/撤销/重做/设置/问题面板
 */
import { useState, useRef, useEffect } from 'react';
import { Icon } from '@/components/ui';
import { useProjectStore, useUndoRedo } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { toast } from '@/stores/toastStore';
import { compiler } from '@/services/compiler';
import { lintProject } from '@/services/linter';
import { saveProject, startPreview } from '@/services/fileService';
import type { SceneNode } from '@/types';

interface ToolbarProps {
  onBackToLauncher: () => void;
}

const NODE_TYPES: { type: SceneNode['type']; label: string; icon: string }[] = [
  { type: 'background', label: '背景', icon: 'image' },
  { type: 'sprite', label: '立绘', icon: 'user' },
  { type: 'dialogue', label: '对话', icon: 'edit' },
  { type: 'audio', label: '音频', icon: 'music' },
  { type: 'choice', label: '选项', icon: 'chevron_down' },
  { type: 'video', label: '视频', icon: 'video' },
  { type: 'jump_label', label: '跳转', icon: 'chevron_right' },
  { type: 'variable_op', label: '变量', icon: 'variable' },
];

export function Toolbar({ onBackToLauncher }: ToolbarProps) {
  const data = useProjectStore((s) => s.data);
  const addNode = useProjectStore((s) => s.addNode);
  const markClean = useProjectStore((s) => s.markClean);
  const toggleLeftPanel = useUIStore((s) => s.toggleLeftPanel);
  const setShowSettingsModal = useUIStore((s) => s.setShowSettingsModal);
  const setShowExportModal = useUIStore((s) => s.setShowExportModal);
  const setShowProblemsPanel = useUIStore((s) => s.setShowProblemsPanel);
  const setPreviewing = useUIStore((s) => s.setPreviewing);
  const { undo, redo, canUndo, canRedo } = useUndoRedo();

  const currentSceneId = data.meta.currentSceneId;

  const handleAddNode = (type: SceneNode['type']) => {
    if (!currentSceneId) {
      toast.warning('请先选择一个场景');
      return;
    }
    addNode(currentSceneId, type);
    toast.success(`已添加${NODE_TYPES.find((n) => n.type === type)?.label}节点`);
  };

  const handleSave = async () => {
    try {
      await saveProject(data);
      markClean();
      toast.success('项目已保存');
    } catch (e) {
      toast.error('保存失败: ' + (e as Error).message);
    }
  };

  const handlePreview = async () => {
    const issues = lintProject(data);
    const errors = issues.filter((i) => i.severity === 'error');
    if (errors.length > 0) {
      toast.warning(`有 ${errors.length} 个错误，预览可能不正常`);
      setShowProblemsPanel(true);
    }

    try {
      setPreviewing(true);
      const result = compiler.compileProject(data);
      await startPreview(
        data,
        result.scriptRpy,
        result.optionsRpy,
        result.variablesRpy,
        result.screensRpy
      );
      toast.success('预览已启动');
    } catch (e) {
      toast.error('预览失败: ' + (e as Error).message);
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div className="h-12 flex items-center px-3 gap-1 border-b border-surface-700 bg-surface-800 flex-shrink-0">
      {/* 返回 */}
      <button className="btn-ghost" onClick={onBackToLauncher} title="返回启动器">
        <Icon name="chevron_left" size={18} />
      </button>

      <div className="w-px h-6 bg-surface-600 mx-1" />

      {/* 预览 */}
      <button className="btn-primary" onClick={handlePreview} title="预览">
        <Icon name="play" size={16} /> 预览
      </button>

      {/* 保存 */}
      <button className="btn-secondary" onClick={handleSave} title="保存 (Ctrl+S)">
        <Icon name="save" size={16} /> 保存
      </button>

      {/* 导出 */}
      <button className="btn-secondary" onClick={() => setShowExportModal(true)} title="导出">
        <Icon name="export" size={16} /> 导出
      </button>

      <div className="w-px h-6 bg-surface-600 mx-1" />

      {/* 添加分镜节点 - 下拉 */}
      <AddNodeDropdown onAddNode={handleAddNode} />

      <div className="w-px h-6 bg-surface-600 mx-1" />

      {/* 撤销/重做 */}
      <button
        className="btn-ghost"
        onClick={() => undo()}
        disabled={!canUndo}
        title="撤销 (Ctrl+Z)"
      >
        <Icon name="undo" size={18} />
      </button>
      <button
        className="btn-ghost"
        onClick={() => redo()}
        disabled={!canRedo}
        title="重做 (Ctrl+Y)"
      >
        <Icon name="redo" size={18} />
      </button>

      <div className="flex-1" />

      {/* 问题面板 */}
      <button
        className="btn-ghost"
        onClick={() => setShowProblemsPanel(!useUIStore.getState().showProblemsPanel)}
        title="问题面板"
      >
        <Icon name="warn" size={18} />
      </button>

      {/* 设置 */}
      <button
        className="btn-ghost"
        onClick={() => setShowSettingsModal(true)}
        title="项目设置"
      >
        <Icon name="settings" size={18} />
      </button>

      {/* 折叠左侧面板 */}
      <button
        className="btn-ghost"
        onClick={toggleLeftPanel}
        title="折叠/展开左侧面板"
      >
        <Icon name="chevron_left" size={18} />
      </button>
    </div>
  );
}

// ===== 添加节点下拉菜单（点击触发，外部点击/Escape 关闭） =====
function AddNodeDropdown({ onAddNode }: { onAddNode: (type: SceneNode['type']) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        className="btn-secondary"
        title="添加分镜"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="add" size={16} /> 添加节点
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-surface-700 border border-surface-600 rounded-lg shadow-xl py-1 w-36">
          {NODE_TYPES.map((n) => (
            <button
              key={n.type}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-200 hover:bg-surface-600"
              onClick={() => {
                onAddNode(n.type);
                setOpen(false);
              }}
            >
              <Icon name={n.icon} size={16} />
              {n.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
