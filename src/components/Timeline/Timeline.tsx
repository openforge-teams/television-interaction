/**
 * 时间轴主体 - 对应文档第四章
 * 6 条轨道（背景/立绘/对话/音频/选项/跳转标签）水平排列分镜卡片
 * 支持轨道内拖拽排序（dnd-kit）+ 素材从素材库拖入轨道（HTML5 DnD）
 */
import { useState } from 'react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { EmptyState } from '@/components/ui';
import { TRACKS } from '@/types';
import type { SceneNode, TrackDef, AssetType } from '@/types';
import { canAssetDropOnTrack, ASSET_TO_NODE_TYPE } from '@/types/factory';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { toast } from '@/stores/toastStore';
import { TimelineCard } from './TimelineCard';

export function Timeline() {
  const currentSceneId = useProjectStore((s) => s.data.meta.currentSceneId);
  const scene = useProjectStore((s) =>
    currentSceneId ? s.data.scenes[currentSceneId] : undefined
  );
  const reorderNodes = useProjectStore((s) => s.reorderNodes);
  const deleteNode = useProjectStore((s) => s.deleteNode);
  const addNodeFromAsset = useProjectStore((s) => s.addNodeFromAsset);
  const selectedNodeId = useUIStore((s) => s.selectedNodeId);
  const selectNode = useUIStore((s) => s.selectNode);

  if (!scene) {
    return (
      <div className="h-full flex items-center justify-center bg-surface-900">
        <EmptyState icon="folder" title="未选择场景" hint="请在上方场景导航栏选择或新建一个场景" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-surface-900">
      <div className="min-w-max">
        {TRACKS.map((track) => (
          <TrackRow
            key={track.index}
            track={track}
            nodes={scene.nodes
              .filter((n) => n.trackIndex === track.index)
              .sort((a, b) => a.position - b.position)}
            sceneId={scene.id}
            selectedNodeId={selectedNodeId}
            onSelectNode={selectNode}
            onDeleteNode={deleteNode}
            onReorder={reorderNodes}
            onDropAsset={(assetId, trackIndex) => {
              const nodeId = addNodeFromAsset(scene.id, assetId, trackIndex);
              if (nodeId) {
                selectNode(nodeId);
                toast.success('已从素材创建节点');
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ===== 单条轨道 =====
interface TrackRowProps {
  track: TrackDef;
  nodes: SceneNode[];
  sceneId: string;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
  onDeleteNode: (sceneId: string, nodeId: string) => void;
  onReorder: (sceneId: string, trackIndex: number, newOrder: string[]) => void;
  onDropAsset: (assetId: string, trackIndex: number) => void;
}

function TrackRow({
  track,
  nodes,
  sceneId,
  selectedNodeId,
  onSelectNode,
  onDeleteNode,
  onReorder,
  onDropAsset,
}: TrackRowProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const [isDragOver, setIsDragOver] = useState(false);
  const [canDrop, setCanDrop] = useState(false);

  const nodeIds = nodes.map((n) => n.id);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = nodeIds.indexOf(String(active.id));
    const newIndex = nodeIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(nodeIds, oldIndex, newIndex);
    onReorder(sceneId, track.index, newOrder);
  };

  // ===== HTML5 拖放：接收素材库拖入的素材 =====
  const handleDragOver = (e: React.DragEvent) => {
    const assetType = e.dataTransfer.types.includes('application/x-asset-type');
    if (!assetType) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragEnter = (e: React.DragEvent) => {
    // dataTransfer.getData 在 dragenter 时可能为空，用 types 判断
    if (!e.dataTransfer.types.includes('application/x-asset-id')) return;
    e.preventDefault();
    // 用 types 检查无法获取具体值，所以用 acceptedTypes 做保守判断
    // 实际类型验证在 drop 时进行
    setIsDragOver(true);
    // 这里无法获取 assetType 值（浏览器安全限制），所以先设为 true
    // 在 drop 时再做精确验证
    setCanDrop(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // 只在离开整个容器时才清除状态
    const relatedTarget = e.relatedTarget as Node | null;
    const currentTarget = e.currentTarget as Node;
    if (relatedTarget && currentTarget.contains(relatedTarget)) return;
    setIsDragOver(false);
    setCanDrop(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    setCanDrop(false);

    const assetId = e.dataTransfer.getData('application/x-asset-id');
    const assetTypeStr = e.dataTransfer.getData('application/x-asset-type');
    if (!assetId) return;

    // 验证素材类型是否匹配轨道
    const assetType = assetTypeStr as AssetType;
    if (!canAssetDropOnTrack(assetType, track.acceptedTypes)) {
      const expectedNode = ASSET_TO_NODE_TYPE[assetType];
      toast.warning(`该素材类型（${assetType}）不适用于「${track.name}」轨道，请拖入${track.acceptedTypes.join('/')}类型素材`);
      return;
    }

    onDropAsset(assetId, track.index);
  };

  // 拖放高亮样式
  const dropZoneClass = isDragOver
    ? canDrop
      ? 'bg-brand-600/10 border-brand-400 border-solid'
      : 'bg-red-600/10 border-red-400 border-solid'
    : '';

  return (
    <div className="flex items-stretch border-b border-surface-700 last:border-b-0">
      {/* 轨道名称（sticky 固定在左侧） */}
      <div className="w-20 flex-shrink-0 sticky left-0 z-10 bg-surface-800 border-r border-surface-700 flex flex-col items-center justify-center px-1 py-2">
        <span className="text-xs font-medium text-surface-200 text-center leading-tight">
          {track.name}
        </span>
        <span className="text-2xs text-surface-500 mt-0.5">
          {nodes.length}/{track.maxConcurrent === Infinity ? '∞' : track.maxConcurrent}
        </span>
      </div>

      {/* 卡片区域 - 支持素材拖放 */}
      <div
        className={`flex items-center gap-2 px-2 py-2 min-h-[72px] flex-1 transition-colors ${dropZoneClass}`}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {nodes.length === 0 ? (
          <div className={`flex items-center justify-center w-40 h-14 border border-dashed rounded-md text-2xs ${
            isDragOver && canDrop
              ? 'border-brand-400 text-brand-300 bg-brand-600/10'
              : 'border-surface-600 text-surface-500'
          }`}>
            拖入或添加{track.name}节点
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={nodeIds} strategy={horizontalListSortingStrategy}>
              {nodes.map((node) => (
                <TimelineCard
                  key={node.id}
                  node={node}
                  isSelected={node.id === selectedNodeId}
                  onSelect={() => onSelectNode(node.id)}
                  onDelete={() => onDeleteNode(sceneId, node.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
}

/**
 * 数组元素移动工具：把 from 处元素移动到 to 处。
 */
function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
