/**
 * 角色管理 - 对应文档第三章
 * 角色列表显示 displayName、颜色色块、立绘数量
 * 添加角色 / 选中角色 / 删除角色
 */
import { Icon, EmptyState } from '@/components/ui';
import { useProjectStore } from '@/stores/projectStore';
import { useUIStore } from '@/stores/uiStore';
import { toast } from '@/stores/toastStore';

export function CharacterManager() {
  const characters = useProjectStore((s) => s.data.characters);
  const assets = useProjectStore((s) => s.data.assets);
  const deleteCharacter = useProjectStore((s) => s.deleteCharacter);

  const selectedCharacterId = useUIStore((s) => s.selectedCharacterId);
  const selectCharacter = useUIStore((s) => s.selectCharacter);
  const setShowCharacterModal = useUIStore((s) => s.setShowCharacterModal);

  // 计算每个角色关联的立绘数量
  const getSpriteCount = (charId: string) =>
    assets.filter((a) => a.type === 'sprite' && a.characterId === charId).length;

  const handleDelete = (charId: string, displayName: string) => {
    deleteCharacter(charId);
    if (selectedCharacterId === charId) selectCharacter(null);
    toast.success(`已删除角色: ${displayName}`);
  };

  return (
    <div className="h-full flex flex-col">
      {/* 顶部：添加角色按钮 */}
      <div className="p-2 border-b border-surface-700 flex-shrink-0">
        <button
          className="btn-primary w-full !py-1.5 !text-xs"
          onClick={() => setShowCharacterModal(true)}
        >
          <Icon name="add" size={14} /> 添加角色
        </button>
      </div>

      {/* 角色列表 */}
      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        {characters.length === 0 ? (
          <EmptyState icon="user" title="暂无角色" hint="点击上方按钮添加角色" />
        ) : (
          <div className="space-y-1">
            {characters.map((char) => {
              const spriteCount = getSpriteCount(char.id);
              const isSelected = selectedCharacterId === char.id;
              return (
                <div
                  key={char.id}
                  className={`group flex items-center gap-2 rounded-md px-2 py-2 cursor-pointer transition-colors border ${
                    isSelected
                      ? 'bg-brand-900/30 border-brand-500'
                      : 'hover:bg-surface-700 border-transparent'
                  }`}
                  onClick={() => selectCharacter(char.id)}
                >
                  {/* 颜色色块 */}
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0 border border-surface-600"
                    style={{ backgroundColor: char.color }}
                    title={char.color}
                  />
                  {/* 角色信息 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-surface-100 truncate">
                      {char.displayName}
                    </p>
                    <p className="text-2xs text-surface-500 truncate">
                      {char.id} · {spriteCount} 张立绘
                    </p>
                  </div>
                  {/* 删除按钮 */}
                  <button
                    className="opacity-0 group-hover:opacity-100 text-surface-500 hover:text-red-400 transition-opacity p-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(char.id, char.displayName);
                    }}
                    title="删除角色"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
