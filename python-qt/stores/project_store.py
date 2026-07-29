"""
影游工坊 - 项目状态管理
使用 Qt 信号机制实现响应式状态管理，含撤销/重做
对应 TypeScript 版本 src/stores/projectStore.ts
"""
from __future__ import annotations

import json
import copy
from datetime import datetime, timezone
from typing import Optional

from PySide6.QtCore import QObject, Signal

from models.types import (
    ProjectData, ProjectMeta, Scene, SceneNode,
    CharacterDef, VariableDef, AssetEntry,
    ChoiceNode, JumpLabelNode, DialogueNode,
)
from models.factory import (
    create_empty_project_data, create_scene, create_node_by_type,
    create_node_from_asset, get_default_track_for_type,
)


class ProjectStore(QObject):
    """项目管理器 - 单例模式，通过 Qt 信号通知 UI 更新"""

    # ===== 信号 =====
    data_changed = Signal()  # 数据变更（用于触发画布/时间轴刷新）
    scene_changed = Signal(str)  # 指定场景变更
    meta_changed = Signal()  # 元数据变更
    asset_changed = Signal()  # 素材列表变更
    character_changed = Signal()  # 角色列表变更
    variable_changed = Signal()  # 变量列表变更
    undo_redo_changed = Signal()  # 撤销/重做状态变更
    dirty_changed = Signal(bool)  # 脏标记变更

    def __init__(self):
        super().__init__()
        self._data: ProjectData = create_empty_project_data("未命名项目")
        self._is_dirty: bool = False
        self._undo_stack: list[str] = []
        self._redo_stack: list[str] = []
        self._max_undo: int = 50

    @property
    def data(self) -> ProjectData:
        return self._data

    @property
    def is_dirty(self) -> bool:
        return self._is_dirty

    @property
    def can_undo(self) -> bool:
        return len(self._undo_stack) > 0

    @property
    def can_redo(self) -> bool:
        return len(self._redo_stack) > 0

    # ===== 内部方法 =====

    def _snapshot(self):
        """保存当前状态到撤销栈"""
        snapshot = json.dumps(self._data, default=lambda o: o.__dict__ if hasattr(o, '__dict__') else str(o))
        self._undo_stack.append(snapshot)
        if len(self._undo_stack) > self._max_undo:
            self._undo_stack.pop(0)
        self._redo_stack.clear()
        self.undo_redo_changed.emit()

    def _set_data(self, data: ProjectData, dirty: bool = True):
        """设置数据并通知"""
        self._data = data
        if dirty != self._is_dirty:
            self._is_dirty = dirty
            self.dirty_changed.emit(dirty)
        self.data_changed.emit()

    def _set_dirty(self, dirty: bool = True):
        if dirty != self._is_dirty:
            self._is_dirty = dirty
            self.dirty_changed.emit(dirty)

    def _now(self) -> str:
        return datetime.now(timezone.utc).isoformat()

    # ===== 项目级操作 =====

    def load_project(self, data: ProjectData):
        """加载项目"""
        self._undo_stack.clear()
        self._redo_stack.clear()
        self._data = data
        self._is_dirty = False
        self.data_changed.emit()
        self.undo_redo_changed.emit()
        self.dirty_changed.emit(False)

    def new_project(self, name: str):
        """新建项目"""
        self._undo_stack.clear()
        self._redo_stack.clear()
        self._data = create_empty_project_data(name)
        self._is_dirty = False
        self.data_changed.emit()
        self.undo_redo_changed.emit()
        self.dirty_changed.emit(False)

    def update_meta(self, partial: dict):
        """更新项目元数据"""
        self._snapshot()
        for k, v in partial.items():
            if k == "resolution":
                self._data.meta.resolution.width = v.get("width", self._data.meta.resolution.width)
                self._data.meta.resolution.height = v.get("height", self._data.meta.resolution.height)
            elif hasattr(self._data.meta, k):
                setattr(self._data.meta, k, v)
        self._data.meta.last_modified = self._now()
        self._set_dirty(True)
        self.meta_changed.emit()

    def mark_clean(self):
        self._set_dirty(False)

    # ===== 场景操作 =====

    def add_scene(self, name: str = None) -> str:
        """添加场景，返回场景 ID"""
        self._snapshot()
        scene = create_scene(name or f"场景 {len(self._data.meta.scene_order) + 1}")
        self._data.scenes[scene.id] = scene
        self._data.meta.scene_order.append(scene.id)
        self._data.meta.current_scene_id = scene.id
        self._data.meta.last_modified = self._now()
        self._set_dirty(True)
        self.data_changed.emit()
        return scene.id

    def delete_scene(self, scene_id: str):
        """删除场景，并清理其他场景中对它的引用"""
        self._snapshot()
        if scene_id in self._data.scenes:
            deleted_name = self._data.scenes[scene_id].name
            del self._data.scenes[scene_id]
            self._data.meta.scene_order = [s for s in self._data.meta.scene_order if s != scene_id]
            if self._data.meta.current_scene_id == scene_id:
                self._data.meta.current_scene_id = self._data.meta.scene_order[0] if self._data.meta.scene_order else None

            # 清理其他场景中 ChoiceItem 的 targetSceneId 引用
            for scene in self._data.scenes.values():
                for node in scene.nodes:
                    if node.type == "choice":
                        for choice in node.choices:
                            if choice.target_scene_id == scene_id:
                                choice.target_scene_id = ""
                    if node.type == "jump_label" and node.sub_type == "jump":
                        if node.target_label == deleted_name or node.target_label == scene_id:
                            node.target_label = ""

            self._data.meta.last_modified = self._now()
            self._set_dirty(True)
            self.data_changed.emit()

    def rename_scene(self, scene_id: str, name: str):
        self._snapshot()
        scene = self._data.scenes.get(scene_id)
        if scene:
            scene.name = name
            self._data.meta.last_modified = self._now()
            self._set_dirty(True)
            self.data_changed.emit()

    def reorder_scenes(self, new_order: list[str]):
        self._snapshot()
        self._data.meta.scene_order = new_order
        self._data.meta.last_modified = self._now()
        self._set_dirty(True)
        self.data_changed.emit()

    def set_current_scene(self, scene_id: str):
        self._data.meta.current_scene_id = scene_id
        self.data_changed.emit()

    def get_current_scene(self) -> Optional[Scene]:
        sid = self._data.meta.current_scene_id
        return self._data.scenes.get(sid) if sid else None

    # ===== 节点操作 =====

    def add_node(self, scene_id: str, node_type: str, position: int = None) -> str:
        """添加节点，返回节点 ID"""
        self._snapshot()
        scene = self._data.scenes.get(scene_id)
        if not scene:
            return ""
        track_index = get_default_track_for_type(node_type)
        nodes_in_track = [n for n in scene.nodes if n.track_index == track_index]
        pos = position if position is not None else len(nodes_in_track)
        node = create_node_by_type(node_type, pos)
        # 移动同轨道中 position >= pos 的节点
        for n in scene.nodes:
            if n.track_index == track_index and n.position >= pos:
                n.position += 1
        # 插入到正确位置
        scene.nodes.insert(pos, node)
        self._data.meta.last_modified = self._now()
        self._set_dirty(True)
        self.scene_changed.emit(scene_id)
        return node.id

    def add_node_from_asset(self, scene_id: str, asset_id: str, track_index: int = None, position: int = None) -> str:
        """从素材创建节点"""
        self._snapshot()
        scene = self._data.scenes.get(scene_id)
        if not scene:
            return ""
        asset = next((a for a in self._data.assets if a.id == asset_id), None)
        if not asset:
            return ""
        # 确定目标轨道
        if track_index is not None:
            target_track = track_index
        else:
            asset_node_type = {
                "background": "background", "sprite": "sprite", "video": "video",
                "bgm": "audio", "sfx": "audio", "voice": "audio",
            }.get(asset.type, asset.type)
            target_track = get_default_track_for_type(asset_node_type)

        nodes_in_track = [n for n in scene.nodes if n.track_index == target_track]
        pos = position if position is not None else len(nodes_in_track)
        node = create_node_from_asset(asset, pos)
        node.track_index = target_track
        # 移动同轨道中 position >= pos 的节点
        for n in scene.nodes:
            if n.track_index == target_track and n.position >= pos:
                n.position += 1
        scene.nodes.insert(pos, node)
        self._data.meta.last_modified = self._now()
        self._set_dirty(True)
        self.scene_changed.emit(scene_id)
        return node.id

    def delete_node(self, scene_id: str, node_id: str):
        self._snapshot()
        scene = self._data.scenes.get(scene_id)
        if not scene:
            return
        target = next((n for n in scene.nodes if n.id == node_id), None)
        if not target:
            return
        scene.nodes = [n for n in scene.nodes if n.id != node_id]
        # 调整同轨道后续节点位置
        for n in scene.nodes:
            if n.track_index == target.track_index and n.position > target.position:
                n.position -= 1
        self._data.meta.last_modified = self._now()
        self._set_dirty(True)
        self.scene_changed.emit(scene_id)

    def update_node(self, scene_id: str, node_id: str, partial: dict):
        """更新节点属性"""
        self._snapshot()
        scene = self._data.scenes.get(scene_id)
        if not scene:
            return
        for n in scene.nodes:
            if n.id == node_id:
                for k, v in partial.items():
                    if hasattr(n, k):
                        setattr(n, k, v)
                break
        self._data.meta.last_modified = self._now()
        self._set_dirty(True)
        self.scene_changed.emit(scene_id)

    def move_node(self, scene_id: str, node_id: str, new_track: int, new_position: int):
        """移动节点到新轨道/位置"""
        self._snapshot()
        scene = self._data.scenes.get(scene_id)
        if not scene:
            return
        node = next((n for n in scene.nodes if n.id == node_id), None)
        if not node:
            return
        old_track = node.track_index
        old_pos = node.position

        if old_track == new_track:
            # 同轨道移动
            for n in scene.nodes:
                if n.id == node_id:
                    continue
                if n.track_index != old_track:
                    continue
                if old_pos < new_position:
                    if old_pos < n.position <= new_position:
                        n.position -= 1
                elif old_pos > new_position:
                    if new_position <= n.position < old_pos:
                        n.position += 1
        else:
            # 跨轨道移动
            for n in scene.nodes:
                if n.id == node_id:
                    continue
                if n.track_index == old_track and n.position > old_pos:
                    n.position -= 1
                if n.track_index == new_track and n.position >= new_position:
                    n.position += 1

        node.track_index = new_track
        node.position = new_position
        self._data.meta.last_modified = self._now()
        self._set_dirty(True)
        self.scene_changed.emit(scene_id)

    # ===== 素材操作 =====

    def add_asset(self, asset: AssetEntry):
        self._data.assets.append(asset)
        self._data.meta.last_modified = self._now()
        self._set_dirty(True)
        self.asset_changed.emit()

    def update_asset(self, asset_id: str, partial: dict):
        for a in self._data.assets:
            if a.id == asset_id:
                for k, v in partial.items():
                    if hasattr(a, k):
                        setattr(a, k, v)
                break
        self._data.meta.last_modified = self._now()
        self._set_dirty(True)
        self.asset_changed.emit()

    def delete_asset(self, asset_id: str):
        """删除素材，并清理所有引用该素材的节点"""
        self._snapshot()
        from services.file_service import delete_asset_file
        # 删除本地文件
        asset = next((a for a in self._data.assets if a.id == asset_id), None)
        if asset:
            delete_asset_file(asset_id, asset.file_name)

        # 从素材列表中移除
        self._data.assets = [a for a in self._data.assets if a.id != asset_id]

        # 清理所有场景中引用该素材的节点
        for scene in self._data.scenes.values():
            scene.nodes = [
                n for n in scene.nodes
                if not (
                    (hasattr(n, "asset_id") and n.asset_id == asset_id)
                    or (hasattr(n, "voice_asset_id") and n.voice_asset_id == asset_id)
                )
            ]

        self._data.meta.last_modified = self._now()
        self._set_dirty(True)
        self.asset_changed.emit()
        self.data_changed.emit()

    # ===== 角色操作 =====

    def add_character(self, char: CharacterDef):
        self._data.characters.append(char)
        self._data.meta.last_modified = self._now()
        self._set_dirty(True)
        self.character_changed.emit()

    def update_character(self, char_id: str, partial: dict):
        for c in self._data.characters:
            if c.id == char_id:
                for k, v in partial.items():
                    if hasattr(c, k):
                        setattr(c, k, v)
                break
        self._data.meta.last_modified = self._now()
        self._set_dirty(True)
        self.character_changed.emit()

    def delete_character(self, char_id: str):
        """删除角色，并清理关联引用"""
        self._snapshot()
        self._data.characters = [c for c in self._data.characters if c.id != char_id]
        # 清理场景中引用该角色的节点
        for scene in self._data.scenes.values():
            scene.nodes = [
                n for n in scene.nodes
                if not (
                    (hasattr(n, "character_id") and n.character_id == char_id)
                    or (hasattr(n, "speaker_id") and n.speaker_id == char_id)
                )
            ]
        # 清理素材中的 characterId
        for a in self._data.assets:
            if a.character_id == char_id:
                a.character_id = None
        self._data.meta.last_modified = self._now()
        self._set_dirty(True)
        self.character_changed.emit()
        self.data_changed.emit()

    # ===== 变量操作 =====

    def add_variable(self, var: VariableDef):
        self._data.variables.append(var)
        self._data.meta.last_modified = self._now()
        self._set_dirty(True)
        self.variable_changed.emit()

    def update_variable(self, name: str, partial: dict):
        for v in self._data.variables:
            if v.name == name:
                for k, val in partial.items():
                    if hasattr(v, k):
                        setattr(v, k, val)
                break
        self._data.meta.last_modified = self._now()
        self._set_dirty(True)
        self.variable_changed.emit()

    def delete_variable(self, name: str):
        """删除变量，并清理关联引用"""
        self._snapshot()
        self._data.variables = [v for v in self._data.variables if v.name != name]
        # 清理场景中引用该变量的节点
        for scene in self._data.scenes.values():
            new_nodes = []
            for n in scene.nodes:
                if n.type == "variable_op" and n.variable_name == name:
                    continue  # 删除引用该变量的 variable_op 节点
                if n.type == "choice":
                    for choice in n.choices:
                        if choice.variable_effects:
                            choice.variable_effects = [e for e in choice.variable_effects if e.variable_name != name]
                new_nodes.append(n)
            scene.nodes = new_nodes
        self._data.meta.last_modified = self._now()
        self._set_dirty(True)
        self.variable_changed.emit()
        self.data_changed.emit()

    # ===== 撤销/重做 =====

    def undo(self):
        if not self._undo_stack:
            return
        # 保存当前状态到 redo 栈
        current = json.dumps(self._data, default=lambda o: o.__dict__ if hasattr(o, '__dict__') else str(o))
        self._redo_stack.append(current)
        # 恢复上一个状态
        snapshot = self._undo_stack.pop()
        from services.file_service import deserialize_project
        self._data = deserialize_project(snapshot)
        self._set_dirty(True)
        self.data_changed.emit()
        self.undo_redo_changed.emit()

    def redo(self):
        if not self._redo_stack:
            return
        current = json.dumps(self._data, default=lambda o: o.__dict__ if hasattr(o, '__dict__') else str(o))
        self._undo_stack.append(current)
        snapshot = self._redo_stack.pop()
        from services.file_service import deserialize_project
        self._data = deserialize_project(snapshot)
        self._set_dirty(True)
        self.data_changed.emit()
        self.undo_redo_changed.emit()


# 全局单例
project_store = ProjectStore()
