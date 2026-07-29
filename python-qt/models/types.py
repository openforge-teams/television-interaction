"""
影游工坊 - 核心数据模型与类型定义
对应 TypeScript 版本 src/types/index.ts 的完整 Python 移植
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Union, Any
from enum import Enum


# ============================================================
# 项目元数据
# ============================================================

@dataclass
class Resolution:
    width: int = 1280
    height: int = 720


@dataclass
class ProjectMeta:
    version: str = "1.0"
    name: str = ""
    author: str = ""
    resolution: Resolution = field(default_factory=Resolution)
    default_font: str = "Noto Sans SC"
    theme_color: str = "#3366CC"
    created_time: str = ""
    last_modified: str = ""
    renpy_version: str = "8.2.3"
    scene_order: list[str] = field(default_factory=list)
    current_scene_id: Optional[str] = None


# ============================================================
# 素材库
# ============================================================

class AssetType(str, Enum):
    BACKGROUND = "background"
    SPRITE = "sprite"
    VIDEO = "video"
    BGM = "bgm"
    SFX = "sfx"
    VOICE = "voice"


# 素材格式白名单
ASSET_FORMATS = {
    "background": ["png", "jpg", "jpeg"],
    "sprite": ["png", "jpg", "jpeg"],
    "video": ["mp4", "webm"],
    "bgm": ["ogg", "mp3", "wav"],
    "sfx": ["ogg", "mp3", "wav"],
    "voice": ["ogg", "mp3", "wav"],
}

# 素材格式→类型映射
FORMAT_TO_TYPE = {}
for atype, fmts in ASSET_FORMATS.items():
    for f in fmts:
        FORMAT_TO_TYPE[f] = atype


@dataclass
class AssetEntry:
    id: str
    file_name: str
    relative_path: str = ""
    type: str = "background"
    format: str = "png"
    file_size: int = 0
    resolution: Optional[Resolution] = None
    duration: Optional[float] = None
    character_id: Optional[str] = None
    emotion: Optional[str] = None
    tags: list[str] = field(default_factory=list)
    thumbnail_path: str = ""
    md5: Optional[str] = None
    imported_at: str = ""


# ============================================================
# 角色管理
# ============================================================

@dataclass
class CharacterDef:
    id: str
    display_name: str = ""
    color: str = "#ffffff"
    voice_prefix: str = ""
    default_emotion: str = ""
    emotions: dict[str, str] = field(default_factory=dict)


# ============================================================
# 变量系统
# ============================================================

class VariableType(str, Enum):
    INTEGER = "integer"
    FLOAT = "float"
    STRING = "string"
    BOOLEAN = "boolean"


class VariableOperation(str, Enum):
    SET = "set"
    ADD = "add"
    SUBTRACT = "subtract"
    MULTIPLY = "multiply"
    DIVIDE = "divide"


@dataclass
class VariableDef:
    name: str
    type: str = "integer"
    initial_value: Union[int, float, str, bool] = 0
    description: str = ""


@dataclass
class VariableEffect:
    variable_name: str = ""
    operation: str = "set"
    value: Union[int, float, str, bool] = 0


# ============================================================
# 分镜节点（核心）
# ============================================================

class NodeType(str, Enum):
    BACKGROUND = "background"
    SPRITE = "sprite"
    DIALOGUE = "dialogue"
    VIDEO = "video"
    AUDIO = "audio"
    CHOICE = "choice"
    JUMP_LABEL = "jump_label"
    VARIABLE_OP = "variable_op"


class TransitionType(str, Enum):
    NONE = "none"
    DISSOLVE = "dissolve"
    FADE = "fade"
    PUSHRIGHT = "pushright"
    WIPELEFT = "wipeleft"


class SpritePosition(str, Enum):
    LEFT = "left"
    CENTER = "center"
    RIGHT = "right"
    TRUECENTER = "truecenter"


class EnterEffect(str, Enum):
    NONE = "none"
    EASEIN = "easein"
    EASEOUT = "easeout"
    MOVEINLEFT = "moveinleft"
    MOVEINRIGHT = "moveinright"


class ExitEffect(str, Enum):
    NONE = "none"
    FADEOUT = "fadeout"
    SLIDEOUT = "slideout"


@dataclass
class TextStyle:
    font_size: int = 22
    font_color: str = "#ffffff"
    alignment: str = "left"


@dataclass
class ButtonStyle:
    background_color: str = "#1e293b"
    text_color: str = "#ffffff"
    hover_background_color: str = "#334155"
    border_radius: int = 8
    font_size: int = 18


@dataclass
class ChoiceItem:
    id: str
    text: str = ""
    target_scene_id: str = ""
    condition: str = ""
    variable_effects: list[VariableEffect] = field(default_factory=list)


@dataclass
class BaseNode:
    """通用分镜节点基类"""
    id: str
    type: str
    track_index: int = 0
    position: int = 0
    label: Optional[str] = None


@dataclass
class BackgroundNode(BaseNode):
    type: str = "background"
    track_index: int = 0
    asset_id: str = ""
    transition: str = "dissolve"
    transition_duration: float = 1.0
    wait_for_transition: bool = True


@dataclass
class SpriteNode(BaseNode):
    type: str = "sprite"
    track_index: int = 1
    character_id: str = ""
    emotion: str = ""
    screen_position: str = "center"
    enter_effect: str = "easein"
    exit_effect: str = "fadeout"
    zorder: int = 1
    visible: bool = True
    transform: Optional[str] = None


@dataclass
class DialogueNode(BaseNode):
    type: str = "dialogue"
    track_index: int = 2
    speaker_id: Optional[str] = None
    text: str = ""
    text_style: TextStyle = field(default_factory=TextStyle)
    voice_asset_id: Optional[str] = None
    typewriter_speed: int = 0
    auto_advance: bool = False
    auto_advance_delay: float = 3


@dataclass
class VideoNode(BaseNode):
    type: str = "video"
    track_index: int = 0
    asset_id: str = ""
    play_mode: str = "play_and_pause"
    show_choices_overlay: bool = False
    skip_allowed: bool = True
    volume: int = 100


@dataclass
class AudioNode(BaseNode):
    type: str = "audio"
    track_index: int = 3
    asset_id: str = ""
    audio_type: str = "bgm"
    loop: bool = True
    volume: int = 80
    fade_in: float = 0
    fade_out: float = 0
    action: str = "play"


@dataclass
class ChoiceNode(BaseNode):
    type: str = "choice"
    track_index: int = 4
    choices: list[ChoiceItem] = field(default_factory=list)
    layout: str = "vertical"
    button_style: ButtonStyle = field(default_factory=ButtonStyle)


@dataclass
class JumpLabelNode(BaseNode):
    type: str = "jump_label"
    track_index: int = 5
    sub_type: str = "label"
    target_label: Optional[str] = None
    label_name: Optional[str] = None


@dataclass
class VariableOpNode(BaseNode):
    type: str = "variable_op"
    track_index: int = 5
    variable_name: str = ""
    operation: str = "set"
    value: Union[int, float, str, bool] = 0


# SceneNode 联合类型 - 在 Python 中用 Union 或直接用基类
SceneNode = Union[
    BackgroundNode, SpriteNode, DialogueNode, VideoNode,
    AudioNode, ChoiceNode, JumpLabelNode, VariableOpNode,
]


# ============================================================
# 场景定义
# ============================================================

@dataclass
class Scene:
    id: str
    name: str
    nodes: list[Any] = field(default_factory=list)
    color: str = "#3b82f6"


# ============================================================
# 轨道定义
# ============================================================

@dataclass
class TrackDef:
    index: int
    name: str
    max_concurrent: int
    accepted_types: list[str]


TRACKS: list[TrackDef] = [
    TrackDef(0, "背景/视频", 1, ["background", "video"]),
    TrackDef(1, "立绘", 3, ["sprite"]),
    TrackDef(2, "对话", 1, ["dialogue"]),
    TrackDef(3, "音频", 3, ["audio"]),
    TrackDef(4, "选项", 1, ["choice"]),
    TrackDef(5, "跳转/标签", float('inf'), ["jump_label", "variable_op"]),
]


# ============================================================
# 完整项目数据
# ============================================================

@dataclass
class ProjectData:
    meta: ProjectMeta = field(default_factory=ProjectMeta)
    scenes: dict[str, Scene] = field(default_factory=dict)
    assets: list[AssetEntry] = field(default_factory=list)
    characters: list[CharacterDef] = field(default_factory=list)
    variables: list[VariableDef] = field(default_factory=list)


# ============================================================
# 编译器结果
# ============================================================

@dataclass
class CompileIssue:
    severity: str  # 'error' or 'warning'
    message: str
    node_id: Optional[str] = None
    scene_id: Optional[str] = None


@dataclass
class CompileResult:
    script_rpy: str = ""
    options_rpy: str = ""
    variables_rpy: str = ""
    screens_rpy: str = ""
    issues: list[CompileIssue] = field(default_factory=list)


@dataclass
class LintIssue:
    severity: str  # 'error' or 'warning'
    message: str
    node_id: Optional[str] = None
    scene_id: Optional[str] = None
    field: Optional[str] = None


# ============================================================
# 预设
# ============================================================

RESOLUTION_PRESETS = [
    {"label": "960x540", "width": 960, "height": 540},
    {"label": "1280x720", "width": 1280, "height": 720},
    {"label": "1920x1080", "width": 1920, "height": 1080},
]

FONT_PRESETS = [
    "Noto Sans SC",
    "Source Han Sans CN",
    "Microsoft YaHei",
    "SimHei",
    "WenQuanYi Micro Hei",
]


def get_asset_type_from_format(fmt: str) -> Optional[str]:
    """根据文件扩展名推断素材类型"""
    f = fmt.lower()
    return FORMAT_TO_TYPE.get(f)


# 节点类型中文映射
NODE_TYPE_LABELS = {
    "background": "背景",
    "sprite": "立绘",
    "dialogue": "对话",
    "video": "视频",
    "audio": "音频",
    "choice": "选项",
    "jump_label": "跳转/标签",
    "variable_op": "变量",
}

# 变量操作符映射
VAR_OPS = ["set", "add", "subtract", "multiply", "divide"]
