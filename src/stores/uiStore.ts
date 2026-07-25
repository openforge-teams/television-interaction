/**
 * UI Store - 管理编辑器界面状态（选中、面板开关等）
 */
import { create } from 'zustand';

export type AssetFilter = 'all' | 'background' | 'sprite' | 'video' | 'bgm' | 'sfx' | 'voice';
export type LeftPanelTab = 'assets' | 'characters' | 'variables';

interface UIStoreState {
  // 选中状态
  selectedNodeId: string | null;
  selectedAssetId: string | null;
  selectedCharacterId: string | null;

  // 面板
  leftPanelCollapsed: boolean;
  leftPanelTab: LeftPanelTab;
  assetFilter: AssetFilter;
  assetSearch: string;

  // 模态框
  showNewProjectModal: boolean;
  showVariableModal: boolean;
  showCharacterModal: boolean;
  showSettingsModal: boolean;
  showExportModal: boolean;
  showProblemsPanel: boolean;

  // 预览/导出状态
  isPreviewing: boolean;
  isExporting: boolean;
  exportProgress: number;

  // 操作方法
  selectNode: (id: string | null) => void;
  selectAsset: (id: string | null) => void;
  selectCharacter: (id: string | null) => void;
  toggleLeftPanel: () => void;
  setLeftPanelTab: (tab: LeftPanelTab) => void;
  setAssetFilter: (filter: AssetFilter) => void;
  setAssetSearch: (q: string) => void;
  setShowNewProjectModal: (v: boolean) => void;
  setShowVariableModal: (v: boolean) => void;
  setShowCharacterModal: (v: boolean) => void;
  setShowSettingsModal: (v: boolean) => void;
  setShowExportModal: (v: boolean) => void;
  setShowProblemsPanel: (v: boolean) => void;
  setPreviewing: (v: boolean) => void;
  setExporting: (v: boolean) => void;
  setExportProgress: (v: number) => void;
}

export const useUIStore = create<UIStoreState>((set) => ({
  selectedNodeId: null,
  selectedAssetId: null,
  selectedCharacterId: null,

  leftPanelCollapsed: false,
  leftPanelTab: 'assets',
  assetFilter: 'all',
  assetSearch: '',

  showNewProjectModal: false,
  showVariableModal: false,
  showCharacterModal: false,
  showSettingsModal: false,
  showExportModal: false,
  showProblemsPanel: false,

  isPreviewing: false,
  isExporting: false,
  exportProgress: 0,

  selectNode: (id) => set({ selectedNodeId: id }),
  selectAsset: (id) => set({ selectedAssetId: id }),
  selectCharacter: (id) => set({ selectedCharacterId: id }),
  toggleLeftPanel: () => set((s) => ({ leftPanelCollapsed: !s.leftPanelCollapsed })),
  setLeftPanelTab: (tab) => set({ leftPanelTab: tab }),
  setAssetFilter: (filter) => set({ assetFilter: filter }),
  setAssetSearch: (q) => set({ assetSearch: q }),
  setShowNewProjectModal: (v) => set({ showNewProjectModal: v }),
  setShowVariableModal: (v) => set({ showVariableModal: v }),
  setShowCharacterModal: (v) => set({ showCharacterModal: v }),
  setShowSettingsModal: (v) => set({ showSettingsModal: v }),
  setShowExportModal: (v) => set({ showExportModal: v }),
  setShowProblemsPanel: (v) => set({ showProblemsPanel: v }),
  setPreviewing: (v) => set({ isPreviewing: v }),
  setExporting: (v) => set({ isExporting: v }),
  setExportProgress: (v) => set({ exportProgress: v }),
}));
