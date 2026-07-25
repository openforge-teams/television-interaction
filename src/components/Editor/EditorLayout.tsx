/**
 * 主编辑器布局 - 对应文档 4.1
 * 顶部工具栏 + 左侧面板 + 时间轴 + 画布预览 + 属性检查器
 */
import { Toolbar } from './Toolbar';
import { LeftPanel } from '../LeftPanel/LeftPanel';
import { SceneNavigator } from '../Timeline/SceneNavigator';
import { Timeline } from '../Timeline/Timeline';
import { CanvasPreview } from '../Canvas/CanvasPreview';
import { Inspector } from '../Inspector/Inspector';
import { ProblemsPanel } from '../Inspector/ProblemsPanel';
import { ExportModal } from '../Modals/ExportModal';
import { VariableModal } from '../Modals/VariableModal';
import { CharacterModal } from '../Modals/CharacterModal';
import { useUIStore } from '@/stores/uiStore';

interface EditorLayoutProps {
  onBackToLauncher: () => void;
}

export function EditorLayout({ onBackToLauncher }: EditorLayoutProps) {
  const leftPanelCollapsed = useUIStore((s) => s.leftPanelCollapsed);
  const showProblemsPanel = useUIStore((s) => s.showProblemsPanel);

  return (
    <div className="h-full w-full flex flex-col bg-surface-900 overflow-hidden">
      {/* 顶部工具栏 */}
      <Toolbar onBackToLauncher={onBackToLauncher} />

      {/* 主体区域 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 左侧面板 */}
        {!leftPanelCollapsed && (
          <div className="w-[260px] flex-shrink-0 border-r border-surface-700 bg-surface-800 flex flex-col">
            <LeftPanel />
          </div>
        )}

        {/* 中间编辑区 */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 场景导航栏 */}
          <SceneNavigator />

          {/* 时间轴 */}
          <div className="flex-1 overflow-hidden min-h-0">
            <Timeline />
          </div>

          {/* 画布预览 */}
          <div className="h-[400px] flex-shrink-0 border-t border-surface-700 bg-surface-950">
            <CanvasPreview />
          </div>
        </div>
      </div>

      {/* 底部属性检查器 + 问题面板 */}
      <div className="h-[200px] flex-shrink-0 border-t border-surface-700 bg-surface-800 flex">
        <div className="flex-1 overflow-hidden">
          <Inspector />
        </div>
        {showProblemsPanel && (
          <div className="w-[360px] flex-shrink-0 border-l border-surface-700 overflow-hidden">
            <ProblemsPanel />
          </div>
        )}
      </div>

      {/* 弹窗 */}
      <ExportModal />
      <VariableModal />
      <CharacterModal />
    </div>
  );
}
