"""
拓扑排序 - 对场景进行排序并检测循环依赖
基于场景间的跳转关系构建有向图，使用 Kahn 算法
对应 TypeScript 版本 src/services/topologicalSort.ts 的完整 Python 移植
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from models.types import ProjectData, Scene


def sanitize_label(name: str) -> str:
    """与编译器一致的 sanitizeLabel 实现"""
    return re.sub(r'[^a-zA-Z0-9_\u4e00-\u9fa5]', '_', name).lower() or 'unnamed'


@dataclass
class SortResult:
    """拓扑排序结果"""
    sorted: list[Scene]
    has_cycle: bool
    cycle_scenes: list[str]


def collect_edges(project: ProjectData) -> dict[str, set[str]]:
    """
    收集场景间的跳转关系
    场景 A 中如果有 jump/choice 指向场景 B，则存在边 A -> B
    """
    edges: dict[str, set[str]] = {}
    scene_ids = list(project.scenes.keys())
    for id_ in scene_ids:
        edges[id_] = set()

    for scene in project.scenes.values():
        for node in scene.nodes:
            node_type = getattr(node, 'type', None)
            if node_type == 'choice':
                choices = getattr(node, 'choices', None) or []
                for choice in choices:
                    target_scene_id = getattr(choice, 'target_scene_id', None)
                    if target_scene_id:
                        # 支持 UUID 和场景名两种匹配方式
                        target_scene = project.scenes.get(target_scene_id)
                        if target_scene is None:
                            target_scene = next(
                                (
                                    s for s in project.scenes.values()
                                    if sanitize_label(s.name) == sanitize_label(target_scene_id)
                                ),
                                None,
                            )
                        if target_scene is not None:
                            edges[scene.id].add(target_scene.id)
            # jump_label 节点的 target_label 如果指向场景名
            if (
                node_type == 'jump_label'
                and getattr(node, 'sub_type', None) == 'jump'
                and getattr(node, 'target_label', None)
            ):
                target_label = getattr(node, 'target_label')
                target = project.scenes.get(target_label)
                if target is None:
                    target = next(
                        (
                            s for s in project.scenes.values()
                            if sanitize_label(s.name) == sanitize_label(target_label)
                        ),
                        None,
                    )
                if target is not None:
                    edges[scene.id].add(target.id)
    return edges


def topological_sort(project: ProjectData) -> SortResult:
    """拓扑排序（Kahn 算法），同时保留 project.meta.scene_order 的相对顺序"""
    edges = collect_edges(project)
    scene_ids = list(project.scenes.keys())

    # 入度表
    in_degree: dict[str, int] = {id_: 0 for id_ in scene_ids}
    for targets in edges.values():
        for t in targets:
            in_degree[t] = in_degree.get(t, 0) + 1

    # 按 scene_order 的优先级取入度为 0 的节点
    order_index: dict[str, int] = {}
    for idx, id_ in enumerate(project.meta.scene_order):
        order_index[id_] = idx

    def order_key(id_: str) -> int:
        return order_index.get(id_, 999)

    queue = [id_ for id_ in scene_ids if in_degree.get(id_) == 0]
    queue.sort(key=order_key)

    sorted_scenes: list[Scene] = []
    visited: set[str] = set()

    while queue:
        id_ = queue.pop(0)  # 等价于 TS 的 queue.shift()
        if id_ in visited:
            continue
        visited.add(id_)
        sorted_scenes.append(project.scenes[id_])

        targets = edges.get(id_, set())
        next_zero: list[str] = []
        for t in targets:
            new_deg = in_degree.get(t, 0) - 1
            in_degree[t] = new_deg
            if new_deg == 0:
                next_zero.append(t)
        # 保持顺序
        next_zero.sort(key=order_key)
        queue.extend(next_zero)

    has_cycle = len(sorted_scenes) < len(scene_ids)
    cycle_scenes = [id_ for id_ in scene_ids if id_ not in visited] if has_cycle else []

    # 如果有环，把剩余场景也追加进去（不丢失数据）
    for id_ in cycle_scenes:
        sorted_scenes.append(project.scenes[id_])

    return SortResult(sorted=sorted_scenes, has_cycle=has_cycle, cycle_scenes=cycle_scenes)
