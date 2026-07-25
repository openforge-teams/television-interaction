/**
 * 分镜卡片组件 - 时间轴上的单个节点卡片
 * 使用 @dnd-kit/sortable 包装，支持拖拽排序
 * 根据节点类型显示不同图标与摘要
 */
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Icon } from '@/components/ui';
import { useProjectStore } from '@/stores/projectStore';
import type { SceneNode } from '@/types';

interface TimelineCardProps {
  node: SceneNode;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

/**
 * 根据节点类型与字段计算展示用的图标与摘要文本。
 * 资产/角色名通过 store 查找，找不到则给一个占位提示。
 */
function useNodeSummary(node: SceneNode): { icon: string; summary: string } {
  const assets = useProjectStore((s) => s.data.assets);
  const characters = useProjectStore((s) => s.data.characters);

  switch (node.type) {
    case 'background': {
      const asset = assets.find((a) => a.id === node.assetId);
      return {
        icon: 'image',
        summary: asset ? asset.fileName : node.assetId ? '（未找到素材）' : '（未设置素材）',
      };
    }
    case 'sprite': {
      const char = characters.find((c) => c.id === node.characterId);
      const name = char ? char.displayName : node.characterId ? '未知角色' : '未设置角色';
      const emotion = node.emotion || '默认';
      return { icon: 'user', summary: `${name} · ${emotion}` };
    }
    case 'dialogue': {
      const text = node.text.trim();
      return {
        icon: 'edit',
        summary: text ? (text.length > 20 ? text.slice(0, 20) + '…' : text) : '（空对话）',
      };
    }
    case 'audio': {
      const typeLabel = node.audioType === 'bgm' ? 'BGM' : node.audioType === 'sfx' ? '音效' : '语音';
      const actionLabel =
        node.action === 'play'
          ? '播放'
          : node.action === 'stop'
          ? '停止'
          : node.action === 'pause'
          ? '暂停'
          : '恢复';
      return { icon: 'music', summary: `${typeLabel} · ${actionLabel}` };
    }
    case 'choice': {
      return { icon: 'chevron_down', summary: `${node.choices.length} 个选项` };
    }
    case 'video': {
      const asset = assets.find((a) => a.id === node.assetId);
      return {
        icon: 'video',
        summary: asset ? asset.fileName : node.assetId ? '（未找到素材）' : '（未设置素材）',
      };
    }
    case 'jump_label': {
      if (node.subType === 'label') {
        return { icon: 'chevron_right', summary: `标签: ${node.labelName || '（未命名）'}` };
      }
      if (node.subType === 'jump') {
        return { icon: 'chevron_right', summary: `跳转: ${node.targetLabel || '（未设置）'}` };
      }
      return { icon: 'chevron_right', summary: '返回 (return)' };
    }
    case 'variable_op': {
      const opLabel: Record<string, string> = {
        set: '=',
        add: '+=',
        subtract: '-=',
        multiply: '*=',
        divide: '/=',
      };
      const op = opLabel[node.operation] ?? node.operation;
      const name = node.variableName || '（未设置变量）';
      return { icon: 'variable', summary: `${name} ${op} ${String(node.value)}` };
    }
    default: {
      // 穷尽性检查兜底
      return { icon: 'warn', summary: '未知节点' };
    }
  }
}

export function TimelineCard({ node, isSelected, onSelect, onDelete }: TimelineCardProps) {
  const { icon, summary } = useNodeSummary(node);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      className={`group relative flex flex-col justify-center w-40 h-14 px-2.5 py-1.5 rounded-md border cursor-pointer select-none transition-colors flex-shrink-0 ${
        isSelected
          ? 'bg-brand-600/20 border-brand-400 ring-1 ring-brand-400'
          : 'bg-surface-700 border-surface-600 hover:bg-surface-600'
      } ${isDragging ? 'z-10 shadow-lg' : ''}`}
      title={summary}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {/* 拖拽手柄：只有图标区域可触发拖拽 */}
        <span
          {...listeners}
          className="cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
          title="拖拽排序"
        >
          <Icon name={icon} size={14} className="text-brand-300" />
        </span>
        <span className="text-2xs uppercase text-surface-400 flex-shrink-0">{node.type}</span>
      </div>
      <div className="text-xs text-surface-100 truncate mt-0.5">{summary}</div>

      {/* 删除按钮：悬停显示，阻止拖拽事件 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-opacity"
        title="删除节点"
      >
        <Icon name="x" size={10} />
      </button>
    </div>
  );
}
