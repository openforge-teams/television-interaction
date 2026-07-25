/**
 * 左侧面板容器 - 对应文档 4.1
 * 顶部 3 个标签页切换：素材库 / 角色 / 变量
 * 根据 useUIStore 的 leftPanelTab 显示对应内容
 */
import { useUIStore, type LeftPanelTab } from '@/stores/uiStore';
import { Icon } from '@/components/ui';
import { AssetLibrary } from './AssetLibrary';
import { CharacterManager } from './CharacterManager';
import { VariableManager } from './VariableManager';

const TABS: { id: LeftPanelTab; label: string; icon: string }[] = [
  { id: 'assets', label: '素材库', icon: 'image' },
  { id: 'characters', label: '角色', icon: 'user' },
  { id: 'variables', label: '变量', icon: 'variable' },
];

export function LeftPanel() {
  const leftPanelTab = useUIStore((s) => s.leftPanelTab);
  const setLeftPanelTab = useUIStore((s) => s.setLeftPanelTab);

  return (
    <div className="h-full flex flex-col">
      {/* 标签页切换 */}
      <div className="flex border-b border-surface-700 flex-shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors border-b-2 ${
              leftPanelTab === tab.id
                ? 'text-brand-400 border-brand-500 bg-surface-700/50'
                : 'text-surface-400 border-transparent hover:text-surface-200 hover:bg-surface-700/30'
            }`}
            onClick={() => setLeftPanelTab(tab.id)}
          >
            <Icon name={tab.icon} size={14} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-hidden min-h-0">
        {leftPanelTab === 'assets' && <AssetLibrary />}
        {leftPanelTab === 'characters' && <CharacterManager />}
        {leftPanelTab === 'variables' && <VariableManager />}
      </div>
    </div>
  );
}
