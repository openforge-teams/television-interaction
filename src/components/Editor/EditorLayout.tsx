/**
 * 主编辑器布局 - 对应文档 4.1
 * 顶部工具栏 + 左侧面板 + 画布预览 + 时间轴 + 属性检查器
 * 布局：画布在上（flex-1），时间轴在下（固定高度可折叠），属性检查器在底部
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
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* 左侧面板 */}
        {!leftPanelCollapsed && (
          <div className="w-[260px] flex-shrink-0 border-r border-surface-700 bg-surface-800 flex flex-col">
            <LeftPanel />
          </div>
        )}

        {/* 中间编辑区：画布（上）+ 时间轴（下） */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {/* 场景导航栏 */}
          <SceneNavigator />

          {/* 画布预览 - 占据上方主要空间 */}
          <div className="flex-1 min-h-0 overflow-hidden bg-surface-950">
            <CanvasPreview />
          </div>

          {/* 时间轴 - 固定高度，可滚动 */}
          <div className="h-[220px] flex-shrink-0 border-t-2 border-surface-700 bg-surface-900 overflow-hidden">
            <Timeline />
          </div>
        </div>

        {/* 右侧属性检查器 */}
        <div className="w-[280px] flex-shrink-0 border-l border-surface-700 bg-surface-800 overflow-hidden flex flex-col">
          <Inspector />
          {showProblemsPanel && (
            <div className="h-[200px] flex-shrink-0 border-t border-surface-700 overflow-hidden">
              <ProblemsPanel />
            </div>
          )}
        </div>
      </div>

      {/* 弹窗 */}
      <ExportModal />
      <VariableModal />
      <CharacterModal />
    </div>
  );
}
