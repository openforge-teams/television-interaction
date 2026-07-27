/**
 * 拓扑排序 - 对场景进行排序并检测循环依赖
 * 基于场景间的跳转关系构建有向图，使用 Kahn 算法
 */
import type { ProjectData, Scene, SceneNode } from '@/types';

/** 与编译器一致的 sanitizeLabel 实现 */
function sanitizeLabel(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '_').toLowerCase() || 'unnamed';
}

interface SortResult {
  sorted: Scene[];
  hasCycle: boolean;
  cycleScenes: string[];
}

/**
 * 收集场景间的跳转关系
 * 场景 A 中如果有 jump/choice 指向场景 B，则存在边 A -> B
 */
function collectEdges(project: ProjectData): Map<string, Set<string>> {
  const edges = new Map<string, Set<string>>();
  const sceneIds = Object.keys(project.scenes);
  for (const id of sceneIds) {
    edges.set(id, new Set());
  }

  for (const scene of Object.values(project.scenes)) {
    for (const node of scene.nodes) {
      if (node.type === 'choice') {
        for (const choice of node.choices ?? []) {
          if (choice.targetSceneId) {
            // 支持 UUID 和场景名两种匹配方式
            const targetScene = project.scenes[choice.targetSceneId]
              || Object.values(project.scenes).find(
                (s) => sanitizeLabel(s.name) === sanitizeLabel(choice.targetSceneId)
              );
            if (targetScene) {
              edges.get(scene.id)!.add(targetScene.id);
            }
          }
        }
      }
      // jump_label 节点的 targetLabel 如果指向场景名
      if (node.type === 'jump_label' && node.subType === 'jump' && node.targetLabel) {
        const targetLabel = node.targetLabel as string;
        const target = project.scenes[targetLabel]
          || Object.values(project.scenes).find(
            (s) => sanitizeLabel(s.name) === sanitizeLabel(targetLabel)
          );
        if (target) {
          edges.get(scene.id)!.add(target.id);
        }
      }
    }
  }
  return edges;
}

/**
 * 拓扑排序（Kahn 算法），同时保留 project.meta.sceneOrder 的相对顺序
 */
export function topologicalSort(project: ProjectData): SortResult {
  const edges = collectEdges(project);
  const sceneIds = Object.keys(project.scenes);

  // 入度表
  const inDegree = new Map<string, number>();
  for (const id of sceneIds) inDegree.set(id, 0);
  for (const [, targets] of edges) {
    for (const t of targets) {
      inDegree.set(t, (inDegree.get(t) || 0) + 1);
    }
  }

  // 按 sceneOrder 的优先级取入度为 0 的节点
  const orderIndex = new Map<string, number>();
  project.meta.sceneOrder.forEach((id, idx) => orderIndex.set(id, idx));

  const queue = sceneIds
    .filter((id) => inDegree.get(id) === 0)
    .sort((a, b) => (orderIndex.get(a) ?? 999) - (orderIndex.get(b) ?? 999));

  const sorted: Scene[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    sorted.push(project.scenes[id]);

    const targets = edges.get(id) || new Set();
    const nextZero: string[] = [];
    for (const t of targets) {
      const newDeg = (inDegree.get(t) || 0) - 1;
      inDegree.set(t, newDeg);
      if (newDeg === 0) nextZero.push(t);
    }
    // 保持顺序
    nextZero.sort((a, b) => (orderIndex.get(a) ?? 999) - (orderIndex.get(b) ?? 999));
    queue.push(...nextZero);
  }

  const hasCycle = sorted.length < sceneIds.length;
  const cycleScenes = hasCycle ? sceneIds.filter((id) => !visited.has(id)) : [];

  // 如果有环，把剩余场景也追加进去（不丢失数据）
  for (const id of cycleScenes) {
    sorted.push(project.scenes[id]);
  }

  return { sorted, hasCycle, cycleScenes };
}
