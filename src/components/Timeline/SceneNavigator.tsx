/**
 * 场景导航栏 - 位于时间轴上方
 * 水平排列所有场景卡片，支持切换/添加/重命名/删除/拖拽排序
 * 卡片之间用 → 字符可视化连接
 */
import { useState, useEffect } from 'react';
import { Icon, Modal } from '@/components/ui';
import { useProjectStore } from '@/stores/projectStore';
import { toast } from '@/stores/toastStore';

interface ContextMenuState {
  sceneId: string;
  x: number;
  y: number;
}

export function SceneNavigator() {
  const sceneOrder = useProjectStore((s) => s.data.meta.sceneOrder);
  const scenes = useProjectStore((s) => s.data.scenes);
  const currentSceneId = useProjectStore((s) => s.data.meta.currentSceneId);
  const setCurrentScene = useProjectStore((s) => s.setCurrentScene);
  const addScene = useProjectStore((s) => s.addScene);
  const renameScene = useProjectStore((s) => s.renameScene);
  const deleteScene = useProjectStore((s) => s.deleteScene);
  const reorderScenes = useProjectStore((s) => s.reorderScenes);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // 点击空白处关闭右键菜单
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
    };
  }, [menu]);

  const handleAddScene = () => {
    addScene();
    toast.success('已添加新场景');
  };

  const handleContextMenu = (e: React.MouseEvent, sceneId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ sceneId, x: e.clientX, y: e.clientY });
  };

  const handleStartRename = (sceneId: string) => {
    const scene = scenes[sceneId];
    setRenamingId(sceneId);
    setRenameValue(scene?.name ?? '');
  };

  const handleConfirmRename = () => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      toast.warning('场景名称不能为空');
      return;
    }
    renameScene(renamingId, trimmed);
    setRenamingId(null);
    toast.success('场景已重命名');
  };

  const handleDeleteScene = (sceneId: string) => {
    if (sceneOrder.length <= 1) {
      toast.warning('至少需要保留一个场景');
      return;
    }
    deleteScene(sceneId);
    toast.success('场景已删除');
  };

  // ===== HTML5 拖拽排序 =====
  const handleDragStart = (e: React.DragEvent, sceneId: string) => {
    setDraggingId(sceneId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', sceneId);
  };

  const handleDragOver = (e: React.DragEvent, sceneId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverId !== sceneId) setDragOverId(sceneId);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = draggingId;
    if (!sourceId || sourceId === targetId) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }
    const newOrder = [...sceneOrder];
    const fromIdx = newOrder.indexOf(sourceId);
    const toIdx = newOrder.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) {
      setDraggingId(null);
      setDragOverId(null);
      return;
    }
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, sourceId);
    reorderScenes(newOrder);
    setDraggingId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverId(null);
  };

  return (
    <div className="flex items-center gap-1 px-3 py-2 border-b border-surface-700 bg-surface-800 overflow-x-auto flex-shrink-0">
      {sceneOrder.map((sceneId, idx) => {
        const scene = scenes[sceneId];
        if (!scene) return null;
        const isActive = sceneId === currentSceneId;
        const isDragging = sceneId === draggingId;
        const isDragOver = sceneId === dragOverId && sceneId !== draggingId;
        return (
          <div key={sceneId} className="flex items-center">
            {idx > 0 && (
              <span className="text-surface-500 mx-0.5 select-none" aria-hidden="true">
                →
              </span>
            )}
            <div
              draggable
              onDragStart={(e) => handleDragStart(e, sceneId)}
              onDragOver={(e) => handleDragOver(e, sceneId)}
              onDrop={(e) => handleDrop(e, sceneId)}
              onDragEnd={handleDragEnd}
              onContextMenu={(e) => handleContextMenu(e, sceneId)}
              onClick={() => setCurrentScene(sceneId)}
              className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-md cursor-pointer border whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-brand-600 border-brand-400 text-white'
                  : 'bg-surface-700 border-surface-600 text-surface-200 hover:bg-surface-600'
              } ${isDragging ? 'opacity-40' : ''} ${
                isDragOver ? 'ring-2 ring-brand-300' : ''
              }`}
              title={`${scene.name}（右键打开菜单）`}
            >
              <span
                className="w-1 h-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: scene.color ?? '#3b82f6' }}
              />
              <span className="text-xs font-medium">{scene.name}</span>
              <span className="text-2xs text-surface-400">#{idx + 1}</span>
            </div>
          </div>
        );
      })}

      {/* 添加场景按钮 */}
      <button
        type="button"
        className="flex items-center gap-1 px-3 py-1.5 rounded-md border border-dashed border-surface-600 text-surface-300 hover:bg-surface-700 hover:text-white transition-colors ml-1 flex-shrink-0"
        onClick={handleAddScene}
        title="添加场景"
      >
        <Icon name="add" size={16} />
        <span className="text-xs">添加场景</span>
      </button>

      {/* 右键上下文菜单 */}
      {menu && (
        <div
          className="fixed z-50 min-w-[120px] bg-surface-700 border border-surface-600 rounded-md shadow-xl py-1"
          style={{ left: menu.x, top: menu.y }}
          onClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-200 hover:bg-surface-600 text-left"
            onClick={() => {
              handleStartRename(menu.sceneId);
              setMenu(null);
            }}
          >
            <Icon name="edit" size={14} /> 重命名
          </button>
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-300 hover:bg-surface-600 text-left"
            onClick={() => {
              handleDeleteScene(menu.sceneId);
              setMenu(null);
            }}
          >
            <Icon name="trash" size={14} /> 删除
          </button>
        </div>
      )}

      {/* 重命名弹窗 */}
      <Modal
        open={renamingId !== null}
        onClose={() => setRenamingId(null)}
        title="重命名场景"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => setRenamingId(null)}>
              取消
            </button>
            <button type="button" className="btn-primary" onClick={handleConfirmRename}>
              确定
            </button>
          </>
        }
      >
        <label className="label" htmlFor="scene-rename-input">
          场景名称
        </label>
        <input
          id="scene-rename-input"
          autoFocus
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirmRename();
            if (e.key === 'Escape') setRenamingId(null);
          }}
          className="input w-full"
          placeholder="请输入场景名称"
        />
      </Modal>
    </div>
  );
}
