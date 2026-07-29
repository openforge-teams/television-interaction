"""
影游工坊 - 节点工厂
对应 TypeScript 版本 src/types/factory.ts
"""
from __future__ import annotations

import uuid
from typing import Any

from .types import (
    BackgroundNode, SpriteNode, DialogueNode, VideoNode,
    AudioNode, ChoiceNode, JumpLabelNode, VariableOpNode,
    Scene, AssetEntry, ProjectMeta, ProjectData,
    TextStyle, ButtonStyle, ChoiceItem,
    RESOLUTION_PRESETS,
)


def _uuid() -> str:
    return str(uuid.uuid4())


def create_background_node(position: int, asset_id: str = "") -> BackgroundNode:
    return BackgroundNode(
        id=_uuid(),
        type="background",
        track_index=0,
        position=position,
        asset_id=asset_id,
        transition="dissolve",
        transition_duration=1.0,
        wait_for_transition=True,
    )


def create_sprite_node(position: int, character_id: str = "", emotion: str = "") -> SpriteNode:
    return SpriteNode(
        id=_uuid(),
        type="sprite",
        track_index=1,
        position=position,
        character_id=character_id,
        emotion=emotion,
        screen_position="center",
        enter_effect="easein",
        exit_effect="fadeout",
        zorder=1,
        visible=True,
    )


def create_dialogue_node(position: int, speaker_id: str | None = None) -> DialogueNode:
    return DialogueNode(
        id=_uuid(),
        type="dialogue",
        track_index=2,
        position=position,
        speaker_id=speaker_id,
        text="",
        text_style=TextStyle(),
        typewriter_speed=0,
        auto_advance=False,
        auto_advance_delay=3,
    )


def create_video_node(position: int, asset_id: str = "") -> VideoNode:
    return VideoNode(
        id=_uuid(),
        type="video",
        track_index=0,
        position=position,
        asset_id=asset_id,
        play_mode="play_and_pause",
        show_choices_overlay=False,
        skip_allowed=True,
        volume=100,
    )


def create_audio_node(position: int, asset_id: str = "", audio_type: str = "bgm") -> AudioNode:
    return AudioNode(
        id=_uuid(),
        type="audio",
        track_index=3,
        position=position,
        asset_id=asset_id,
        audio_type=audio_type,
        loop=(audio_type == "bgm"),
        volume=80,
        fade_in=0,
        fade_out=0,
        action="play",
    )


def create_choice_node(position: int) -> ChoiceNode:
    return ChoiceNode(
        id=_uuid(),
        type="choice",
        track_index=4,
        position=position,
        choices=[ChoiceItem(id=_uuid(), text="选项 1", target_scene_id="", condition="", variable_effects=[])],
        layout="vertical",
        button_style=ButtonStyle(),
    )


def create_jump_label_node(position: int, sub_type: str = "label") -> JumpLabelNode:
    node = JumpLabelNode(
        id=_uuid(),
        type="jump_label",
        track_index=5,
        position=position,
        sub_type=sub_type,
    )
    if sub_type == "label":
        node.label_name = "label_1"
    if sub_type == "jump":
        node.target_label = ""
    return node


def create_variable_op_node(position: int) -> VariableOpNode:
    return VariableOpNode(
        id=_uuid(),
        type="variable_op",
        track_index=5,
        position=position,
        variable_name="",
        operation="set",
        value=0,
    )


NODE_FACTORIES = {
    "background": create_background_node,
    "sprite": create_sprite_node,
    "dialogue": create_dialogue_node,
    "video": create_video_node,
    "audio": create_audio_node,
    "choice": create_choice_node,
    "jump_label": create_jump_label_node,
    "variable_op": create_variable_op_node,
}


def create_node_by_type(node_type: str, position: int):
    factory = NODE_FACTORIES.get(node_type)
    if factory is None:
        raise ValueError(f"未知节点类型: {node_type}")
    return factory(position)


# 素材类型→节点类型映射
ASSET_TO_NODE_TYPE = {
    "background": "background",
    "sprite": "sprite",
    "video": "video",
    "bgm": "audio",
    "sfx": "audio",
    "voice": "audio",
}


def can_asset_drop_on_track(asset_type: str, accepted_types: list[str]) -> bool:
    node_type = ASSET_TO_NODE_TYPE.get(asset_type)
    return node_type in accepted_types if node_type else False


def create_node_from_asset(asset: AssetEntry, position: int):
    """从素材创建节点（拖拽素材到轨道时使用）"""
    match asset.type:
        case "background":
            return create_background_node(position, asset.id)
        case "sprite":
            return create_sprite_node(position, asset.character_id or "", asset.emotion or "")
        case "video":
            return create_video_node(position, asset.id)
        case "bgm":
            return create_audio_node(position, asset.id, "bgm")
        case "sfx":
            return create_audio_node(position, asset.id, "sfx")
        case "voice":
            return create_audio_node(position, asset.id, "voice")
        case _:
            raise ValueError(f"无法从素材类型创建节点: {asset.type}")


def create_scene(name: str) -> Scene:
    return Scene(id=_uuid(), name=name, nodes=[], color="#3b82f6")


def create_default_project_meta(name: str) -> ProjectMeta:
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    return ProjectMeta(
        version="1.0",
        name=name,
        author="",
        resolution={"width": 1280, "height": 720},  # type: ignore
        default_font="Noto Sans SC",
        theme_color="#3366CC",
        created_time=now,
        last_modified=now,
        renpy_version="8.2.3",
        scene_order=[],
        current_scene_id=None,
    )


def create_empty_project_data(name: str) -> ProjectData:
    start_scene = create_scene("start")
    meta = create_default_project_meta(name)
    meta.scene_order = [start_scene.id]
    meta.current_scene_id = start_scene.id
    # Fix resolution to be a Resolution object
    from .types import Resolution
    meta.resolution = Resolution(width=1280, height=720)
    return ProjectData(
        meta=meta,
        scenes={start_scene.id: start_scene},
        assets=[],
        characters=[],
        variables=[],
    )


def get_default_track_for_type(node_type: str) -> int:
    """根据节点类型获取默认轨道索引"""
    match node_type:
        case "background" | "video":
            return 0
        case "sprite":
            return 1
        case "dialogue":
            return 2
        case "audio":
            return 3
        case "choice":
            return 4
        case "jump_label" | "variable_op":
            return 5
        case _:
            return 0
