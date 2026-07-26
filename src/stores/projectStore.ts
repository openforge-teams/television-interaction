/**
 * 主项目 Store - 管理项目所有数据，含撤销/重做
 */
import { create } from 'zustand';
import { useStore } from 'zustand';
import { temporal } from 'zundo';
import type {
  ProjectData,
  ProjectMeta,
  Scene,
  SceneNode,
  CharacterDef,
  VariableDef,
  AssetEntry,
} from '@/types';
import {
  createEmptyProjectData,
  createScene,
  createNodeByType,
  createNodeFromAsset,
} from '@/types/factory';

interface ProjectStoreState {
  // 数据
  data: ProjectData;
  isDirty: boolean;

  // 项目级操作
  loadProject: (data: ProjectData) => void;
  newProject: (name: string) => void;
  updateMeta: (partial: Partial<ProjectMeta>) => void;
  markClean: () => void;

  // 场景操作
  addScene: (name?: string) => string;
  deleteScene: (sceneId: string) => void;
  renameScene: (sceneId: string, name: string) => void;
  reorderScenes: (newOrder: string[]) => void;
  setCurrentScene: (sceneId: string) => void;
  getScene: (sceneId: string) => Scene | undefined;
  getCurrentScene: () => Scene | undefined;

  // 节点操作
  addNode: (sceneId: string, nodeType: SceneNode['type'], position?: number) => string;
  addNodeFromAsset: (sceneId: string, assetId: string, trackIndex?: number, position?: number) => string;
  deleteNode: (sceneId: string, nodeId: string) => void;
  updateNode: (sceneId: string, nodeId: string, partial: Partial<SceneNode>) => void;
  moveNode: (sceneId: string, nodeId: string, newTrack: number, newPosition: number) => void;
  reorderNodes: (sceneId: string, trackIndex: number, newOrder: string[]) => void;

  // 素材操作
  addAsset: (asset: AssetEntry) => void;
  updateAsset: (assetId: string, partial: Partial<AssetEntry>) => void;
  deleteAsset: (assetId: string) => void;
  getAsset: (assetId: string) => AssetEntry | undefined;

  // 角色操作
  addCharacter: (char: CharacterDef) => void;
  updateCharacter: (charId: string, partial: Partial<CharacterDef>) => void;
  deleteCharacter: (charId: string) => void;
  getCharacter: (charId: string) => CharacterDef | undefined;

  // 变量操作
  addVariable: (v: VariableDef) => void;
  updateVariable: (name: string, partial: Partial<VariableDef>) => void;
  deleteVariable: (name: string) => void;

  // 获取完整项目数据（编译器用）
  getProjectData: () => ProjectData;
}

export const useProjectStore = create<ProjectStoreState>()(
  temporal(
    (set, get) => ({
      data: createEmptyProjectData('未命名项目'),
      isDirty: false,

      loadProject: (data) => {
        // 加载项目时清除撤销/重做历史，防止跨项目撤销
        const temporal = useProjectStore.temporal.getState();
        temporal.clear();
        set({ data, isDirty: false });
        // set() 会产生一条历史记录，再次清除以确保完全干净
        temporal.clear();
      },

      newProject: (name) => {
        // 新建项目时清除撤销/重做历史，防止跨项目撤销
        const temporal = useProjectStore.temporal.getState();
        temporal.clear();
        set({ data: createEmptyProjectData(name), isDirty: false });
        // set() 会产生一条历史记录，再次清除以确保完全干净
        temporal.clear();
      },

      updateMeta: (partial) =>
        set((s) => ({
          data: {
            ...s.data,
            meta: {
              ...s.data.meta,
              ...partial,
              lastModified: new Date().toISOString(),
            },
          },
          isDirty: true,
        })),

      markClean: () => set({ isDirty: false }),

      addScene: (name) => {
        const scene = createScene(name || `场景 ${get().data.meta.sceneOrder.length + 1}`);
        set((s) => ({
          data: {
            ...s.data,
            meta: {
              ...s.data.meta,
              sceneOrder: [...s.data.meta.sceneOrder, scene.id],
              currentSceneId: scene.id,
              lastModified: new Date().toISOString(),
            },
            scenes: { ...s.data.scenes, [scene.id]: scene },
          },
          isDirty: true,
        }));
        return scene.id;
      },

      deleteScene: (sceneId) =>
        set((s) => {
          const scenes = { ...s.data.scenes };
          delete scenes[sceneId];
          const sceneOrder = s.data.meta.sceneOrder.filter((id) => id !== sceneId);
          const currentSceneId =
            s.data.meta.currentSceneId === sceneId
              ? sceneOrder[0] ?? null
              : s.data.meta.currentSceneId;
          return {
            data: {
              ...s.data,
              scenes,
              meta: {
                ...s.data.meta,
                sceneOrder,
                currentSceneId,
                lastModified: new Date().toISOString(),
              },
            },
            isDirty: true,
          };
        }),

      renameScene: (sceneId, name) =>
        set((s) => {
          const scene = s.data.scenes[sceneId];
          if (!scene) return s;
          return {
            data: {
              ...s.data,
              scenes: { ...s.data.scenes, [sceneId]: { ...scene, name } },
              meta: { ...s.data.meta, lastModified: new Date().toISOString() },
            },
            isDirty: true,
          };
        }),

      reorderScenes: (newOrder) =>
        set((s) => ({
          data: {
            ...s.data,
            meta: { ...s.data.meta, sceneOrder: newOrder, lastModified: new Date().toISOString() },
          },
          isDirty: true,
        })),

      setCurrentScene: (sceneId) =>
        set((s) => ({
          data: { ...s.data, meta: { ...s.data.meta, currentSceneId: sceneId } },
        })),

      getScene: (sceneId) => get().data.scenes[sceneId],
      getCurrentScene: () => {
        const { data } = get();
        const id = data.meta.currentSceneId;
        return id ? data.scenes[id] : undefined;
      },

      addNode: (sceneId, nodeType, position) => {
        const scene = get().data.scenes[sceneId];
        if (!scene) return '';
        const trackIndex = getDefaultTrackForType(nodeType);
        const nodesInTrack = scene.nodes.filter((n) => n.trackIndex === trackIndex);
        const pos = position ?? nodesInTrack.length;
        const node = createNodeByType(nodeType, pos);
        set((s) => {
          const sc = s.data.scenes[sceneId];
          if (!sc) return s;
          // 重新排列 position 大于等于 pos 的节点
          const updatedNodes = sc.nodes.map((n) =>
            n.trackIndex === trackIndex && n.position >= pos
              ? { ...n, position: n.position + 1 }
              : n
          );
          return {
            data: {
              ...s.data,
              scenes: {
                ...s.data.scenes,
                [sceneId]: { ...sc, nodes: [...updatedNodes, node] },
              },
              meta: { ...s.data.meta, lastModified: new Date().toISOString() },
            },
            isDirty: true,
          };
        });
        return node.id;
      },

      addNodeFromAsset: (sceneId, assetId, trackIndex, position) => {
        const scene = get().data.scenes[sceneId];
        if (!scene) return '';
        const asset = get().data.assets.find((a) => a.id === assetId);
        if (!asset) return '';
        const targetTrack = trackIndex ?? getDefaultTrackForType(
          asset.type === 'bgm' || asset.type === 'sfx' || asset.type === 'voice' ? 'audio' : asset.type
        );
        const nodesInTrack = scene.nodes.filter((n) => n.trackIndex === targetTrack);
        const pos = position ?? nodesInTrack.length;
        const node = createNodeFromAsset(asset, pos);
        // 确保 trackIndex 与目标轨道一致
        node.trackIndex = targetTrack;
        set((s) => {
          const sc = s.data.scenes[sceneId];
          if (!sc) return s;
          const updatedNodes = sc.nodes.map((n) =>
            n.trackIndex === targetTrack && n.position >= pos
              ? { ...n, position: n.position + 1 }
              : n
          );
          return {
            data: {
              ...s.data,
              scenes: {
                ...s.data.scenes,
                [sceneId]: { ...sc, nodes: [...updatedNodes, node] },
              },
              meta: { ...s.data.meta, lastModified: new Date().toISOString() },
            },
            isDirty: true,
          };
        });
        return node.id;
      },

      deleteNode: (sceneId, nodeId) =>
        set((s) => {
          const sc = s.data.scenes[sceneId];
          if (!sc) return s;
          const target = sc.nodes.find((n) => n.id === nodeId);
          if (!target) return s;
          const updatedNodes = sc.nodes
            .filter((n) => n.id !== nodeId)
            .map((n) =>
              n.trackIndex === target.trackIndex && n.position > target.position
                ? { ...n, position: n.position - 1 }
                : n
            );
          return {
            data: {
              ...s.data,
              scenes: { ...s.data.scenes, [sceneId]: { ...sc, nodes: updatedNodes } },
              meta: { ...s.data.meta, lastModified: new Date().toISOString() },
            },
            isDirty: true,
          };
        }),

      updateNode: (sceneId, nodeId, partial) =>
        set((s) => {
          const sc = s.data.scenes[sceneId];
          if (!sc) return s;
          const updatedNodes = sc.nodes.map((n) =>
            n.id === nodeId ? ({ ...n, ...partial } as SceneNode) : n
          );
          return {
            data: {
              ...s.data,
              scenes: { ...s.data.scenes, [sceneId]: { ...sc, nodes: updatedNodes } },
              meta: { ...s.data.meta, lastModified: new Date().toISOString() },
            },
            isDirty: true,
          };
        }),

      moveNode: (sceneId, nodeId, newTrack, newPosition) =>
        set((s) => {
          const sc = s.data.scenes[sceneId];
          if (!sc) return s;
          const node = sc.nodes.find((n) => n.id === nodeId);
          if (!node) return s;
          const oldTrack = node.trackIndex;
          const oldPos = node.position;

          let updatedNodes = sc.nodes.map((n) => {
            if (n.id === nodeId) return { ...n, trackIndex: newTrack, position: newPosition };
            return n;
          });

          // 修复旧轨道的 position
          updatedNodes = updatedNodes.map((n) => {
            if (n.id === nodeId) return n;
            if (n.trackIndex === oldTrack && n.position > oldPos) {
              return { ...n, position: n.position - 1 };
            }
            if (n.trackIndex === newTrack && n.position >= newPosition && n.id !== nodeId) {
              return { ...n, position: n.position + 1 };
            }
            return n;
          });

          return {
            data: {
              ...s.data,
              scenes: { ...s.data.scenes, [sceneId]: { ...sc, nodes: updatedNodes } },
              meta: { ...s.data.meta, lastModified: new Date().toISOString() },
            },
            isDirty: true,
          };
        }),

      reorderNodes: (sceneId, trackIndex, newOrder) =>
        set((s) => {
          const sc = s.data.scenes[sceneId];
          if (!sc) return s;
          const orderMap = new Map(newOrder.map((id, idx) => [id, idx]));
          const updatedNodes = sc.nodes.map((n) =>
            n.trackIndex === trackIndex && orderMap.has(n.id)
              ? { ...n, position: orderMap.get(n.id)! }
              : n
          );
          return {
            data: {
              ...s.data,
              scenes: { ...s.data.scenes, [sceneId]: { ...sc, nodes: updatedNodes } },
              meta: { ...s.data.meta, lastModified: new Date().toISOString() },
            },
            isDirty: true,
          };
        }),

      addAsset: (asset) =>
        set((s) => ({
          data: { ...s.data, assets: [...s.data.assets, asset] },
          isDirty: true,
        })),

      updateAsset: (assetId, partial) =>
        set((s) => ({
          data: {
            ...s.data,
            assets: s.data.assets.map((a) =>
              a.id === assetId ? { ...a, ...partial } : a
            ),
          },
          isDirty: true,
        })),

      deleteAsset: (assetId) =>
        set((s) => ({
          data: {
            ...s.data,
            assets: s.data.assets.filter((a) => a.id !== assetId),
          },
          isDirty: true,
        })),

      getAsset: (assetId) => get().data.assets.find((a) => a.id === assetId),

      addCharacter: (char) =>
        set((s) => ({
          data: { ...s.data, characters: [...s.data.characters, char] },
          isDirty: true,
        })),

      updateCharacter: (charId, partial) =>
        set((s) => ({
          data: {
            ...s.data,
            characters: s.data.characters.map((c) =>
              c.id === charId ? { ...c, ...partial } : c
            ),
          },
          isDirty: true,
        })),

      deleteCharacter: (charId) =>
        set((s) => ({
          data: {
            ...s.data,
            characters: s.data.characters.filter((c) => c.id !== charId),
          },
          isDirty: true,
        })),

      getCharacter: (charId) => get().data.characters.find((c) => c.id === charId),

      addVariable: (v) =>
        set((s) => ({
          data: { ...s.data, variables: [...s.data.variables, v] },
          isDirty: true,
        })),

      updateVariable: (name, partial) =>
        set((s) => ({
          data: {
            ...s.data,
            variables: s.data.variables.map((v) =>
              v.name === name ? { ...v, ...partial } : v
            ),
          },
          isDirty: true,
        })),

      deleteVariable: (name) =>
        set((s) => ({
          data: {
            ...s.data,
            variables: s.data.variables.filter((v) => v.name !== name),
          },
          isDirty: true,
        })),

      getProjectData: () => get().data,
    }),
    {
      // zundo 配置：限制历史步数为 50，排除非数据字段
      limit: 50,
      partialize: (state) => ({ data: state.data }),
      equality: (pastState, currentState) =>
        JSON.stringify(pastState.data) === JSON.stringify(currentState.data),
    }
  )
);

// 获取撤销/重做方法
export function useUndoRedo() {
  const temporalStore = useProjectStore.temporal;
  const undo = useStore(temporalStore, (s) => s.undo);
  const redo = useStore(temporalStore, (s) => s.redo);
  const pastStates = useStore(temporalStore, (s) => s.pastStates);
  const futureStates = useStore(temporalStore, (s) => s.futureStates);
  return {
    undo,
    redo,
    canUndo: pastStates.length > 0,
    canRedo: futureStates.length > 0,
  };
}

function getDefaultTrackForType(type: SceneNode['type']): number {
  switch (type) {
    case 'background':
    case 'video':
      return 0;
    case 'sprite':
      return 1;
    case 'dialogue':
      return 2;
    case 'audio':
      return 3;
    case 'choice':
      return 4;
    case 'jump_label':
    case 'variable_op':
      return 5;
    default:
      return 0;
  }
}
