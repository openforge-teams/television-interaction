"""
影游工坊 - 编译器服务
将项目数据编译为 Ren'Py .rpy 脚本
对应 TypeScript 版本 src/services/compiler.ts 的完整 Python 移植
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Optional

from models.types import (
    ProjectData, Scene, CompileResult, CompileIssue,
    BackgroundNode, SpriteNode, DialogueNode, VideoNode,
    AudioNode, ChoiceNode, JumpLabelNode, VariableOpNode,
    VariableEffect, CharacterDef, VariableDef, TransitionType,
)
from services.topological_sort import topological_sort

INDENT = "    "
UUID_PATTERN = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE,
)


class Compiler:
    """Ren'Py 脚本编译器"""

    def __init__(self):
        self.issues: list[CompileIssue] = []
        self.asset_map: dict[str, any] = {}
        self.variable_names: set[str] = set()
        self.character_ids: set[str] = set()
        self.scene_labels: set[str] = set()
        self.scene_id_to_name: dict[str, str] = {}
        self.inner_labels: set[str] = set()

    def compile_project(self, project: ProjectData) -> CompileResult:
        """编译整个项目"""
        self.issues = []
        self.inner_labels = set()
        self.scene_labels = set()
        self.scene_id_to_name = {}
        self.asset_map = {a.id: a for a in project.assets}
        self.variable_names = {v.name for v in project.variables}
        self.character_ids = {c.id for c in project.characters}

        # 收集所有场景 label 名，并建立 ID->name 映射
        for scene in project.scenes.values():
            self.scene_labels.add(self._sanitize_label(scene.name))
            self.scene_id_to_name[scene.id] = scene.name
        # start 是游戏入口 label，始终有效
        self.scene_labels.add("start")

        # 预先收集所有场景中所有内部 label 定义
        for scene in project.scenes.values():
            for node in scene.nodes:
                if node.type == "jump_label" and getattr(node, "sub_type", "") == "label":
                    name = self._sanitize_label(getattr(node, "label_name", None) or "label_1")
                    self.inner_labels.add(name)

        # 拓扑排序
        sort_result = topological_sort(project)
        if sort_result.has_cycle:
            self.issues.append(CompileIssue(
                severity="warning",
                message=f"检测到场景间可能存在循环跳转: {', '.join(sort_result.cycle_scenes)}",
            ))

        rpy = ""

        # 文件头注释
        rpy += "# ============================================================\n"
        rpy += "# 由影游工坊自动生成\n"
        rpy += f"# 项目: {project.meta.name}\n"
        rpy += f"# 作者: {project.meta.author or '未知'}\n"
        rpy += f"# 生成时间: {datetime.now(timezone.utc).isoformat()}\n"
        rpy += "# ============================================================\n\n"

        # 1. 生成 image 声明
        rpy += self._generate_image_declarations(project)

        # 2. 生成角色 define 声明
        rpy += self._generate_character_declarations(project.characters)

        # 3. 生成变量初始化 (default)
        rpy += self._generate_variable_defaults(project.variables)

        # 4. 生成游戏入口
        rpy += "\n# ===== 游戏入口 =====\n"
        first_scene_name = self._sanitize_label(sort_result.sorted[0].name) if sort_result.sorted else ""
        if first_scene_name == "start":
            rpy += "# 游戏从 start 场景开始\n"
        elif sort_result.sorted:
            rpy += "label start:\n"
            rpy += f"{INDENT}jump {first_scene_name}\n"
        else:
            rpy += "label start:\n"
            rpy += f"{INDENT}# 暂无内容\n"
            rpy += f"{INDENT}return\n"

        # 5. 生成各场景脚本
        for i, scene in enumerate(sort_result.sorted):
            is_last = (i == len(sort_result.sorted) - 1)
            rpy += self._compile_scene(scene, is_last)

        # 生成其他文件
        options_rpy = self._generate_options_rpy(project)
        variables_rpy = self._generate_variables_rpy(project.variables)
        screens_rpy = self._generate_screens_rpy(project)

        return CompileResult(
            script_rpy=rpy,
            options_rpy=options_rpy,
            variables_rpy=variables_rpy,
            screens_rpy=screens_rpy,
            issues=self.issues,
        )

    def _compile_scene(self, scene: Scene, is_last: bool = False) -> str:
        """编译单个场景为 label"""
        label_name = self._sanitize_label(scene.name)
        code = f"\n# ===== 场景: {scene.name} =====\n"
        code += f"label {label_name}:\n"

        # 按 position 排序节点
        sorted_nodes = sorted(scene.nodes, key=lambda n: (n.position, n.track_index))

        for node in sorted_nodes:
            code += self._compile_node(node, scene.id)

        if is_last:
            code += f"{INDENT}return\n"

        return code

    def _compile_node(self, node, scene_id: str) -> str:
        """编译单个节点"""
        match node.type:
            case "background":
                return self._compile_background(node, scene_id)
            case "sprite":
                return self._compile_sprite(node, scene_id)
            case "dialogue":
                return self._compile_dialogue(node, scene_id)
            case "video":
                return self._compile_video(node, scene_id)
            case "audio":
                return self._compile_audio(node, scene_id)
            case "choice":
                return self._compile_choice(node, scene_id)
            case "jump_label":
                return self._compile_jump_label(node, scene_id)
            case "variable_op":
                return self._compile_variable_op(node, scene_id)
            case _:
                self.issues.append(CompileIssue(
                    severity="error",
                    message=f"未知节点类型: {node.type}",
                    node_id=node.id,
                    scene_id=scene_id,
                ))
                return ""

    # ===== 各节点类型编译 =====

    def _compile_background(self, node: BackgroundNode, scene_id: str) -> str:
        asset = self.asset_map.get(node.asset_id)
        if not asset:
            self.issues.append(CompileIssue(
                severity="error",
                message=f"背景素材不存在: {node.asset_id}",
                node_id=node.id,
                scene_id=scene_id,
            ))
            return f"{INDENT}# [错误: 背景素材缺失]\n"
        image_name = f"bg_{self._sanitize_name(asset.file_name)}"
        code = f"{INDENT}scene {image_name}\n"
        if node.transition != "none":
            code += f"{INDENT}with {self._format_transition(node.transition, node.transition_duration)}\n"
        return code

    def _compile_sprite(self, node: SpriteNode, scene_id: str) -> str:
        if not node.character_id:
            self.issues.append(CompileIssue(
                severity="warning",
                message="立绘节点未指定角色",
                node_id=node.id,
                scene_id=scene_id,
            ))
            return f"{INDENT}# [警告: 立绘节点未指定角色]\n"
        if node.character_id not in self.character_ids:
            self.issues.append(CompileIssue(
                severity="warning",
                message=f"角色未定义: {node.character_id}，生成的 show 语句可能无效",
                node_id=node.id,
                scene_id=scene_id,
            ))
        if node.visible:
            code = f"{INDENT}show {node.character_id}"
            if node.emotion:
                code += f" {node.emotion}"
            code += f" at {self._map_position(node.screen_position)}"
            if node.zorder:
                code += f" zorder {node.zorder}"
            code += "\n"
            if node.enter_effect != "none":
                code += f"{INDENT}with {self._map_enter_effect(node.enter_effect)}\n"
            return code
        else:
            return f"{INDENT}hide {node.character_id}\n"

    def _compile_dialogue(self, node: DialogueNode, scene_id: str) -> str:
        escaped_text = self._escape_string(node.text)
        code = ""
        if node.speaker_id:
            code += f'{INDENT}{node.speaker_id} "{escaped_text}"\n'
        else:
            code += f'{INDENT}"{escaped_text}"\n'
        # 语音
        if node.voice_asset_id:
            voice_asset = self.asset_map.get(node.voice_asset_id)
            if voice_asset:
                escaped_voice = self._escape_string(voice_asset.file_name)
                code = f'{INDENT}voice "audio/{escaped_voice}"\n' + code
        # 自动推进
        if node.auto_advance:
            code += f"{INDENT}$ renpy.pause({node.auto_advance_delay})\n"
        return code

    def _compile_video(self, node: VideoNode, scene_id: str) -> str:
        asset = self.asset_map.get(node.asset_id)
        if not asset:
            self.issues.append(CompileIssue(
                severity="error",
                message=f"视频素材不存在: {node.asset_id}",
                node_id=node.id,
                scene_id=scene_id,
            ))
            return f"{INDENT}# [错误: 视频素材缺失]\n"
        escaped_file_name = self._escape_string(asset.file_name)
        code = f'{INDENT}$ renpy.movie_cutscene("video/{escaped_file_name}")\n'
        return code

    def _compile_audio(self, node: AudioNode, scene_id: str) -> str:
        asset = self.asset_map.get(node.asset_id)
        needs_asset = node.action == "play"
        if not asset and needs_asset:
            self.issues.append(CompileIssue(
                severity="error",
                message=f"音频素材不存在: {node.asset_id}",
                node_id=node.id,
                scene_id=scene_id,
            ))
            return f"{INDENT}# [错误: 音频素材缺失]\n"
        file_name = self._escape_string(asset.file_name) if asset else ""
        if node.action == "play":
            if node.audio_type == "bgm":
                code = f'{INDENT}play music "audio/{file_name}"'
                if node.fade_in > 0:
                    code += f" fadein {node.fade_in}"
                code += "\n"
                return code
            elif node.audio_type == "voice":
                code = f'{INDENT}play voice "audio/{file_name}"'
                if node.fade_in > 0:
                    code += f" fadein {node.fade_in}"
                code += "\n"
                return code
            else:
                code = f'{INDENT}play sound "audio/{file_name}"'
                if node.fade_in > 0:
                    code += f" fadein {node.fade_in}"
                code += "\n"
                return code
        elif node.action == "stop":
            if node.audio_type == "bgm":
                code = f"{INDENT}stop music"
                if node.fade_out > 0:
                    code += f" fadeout {node.fade_out}"
                code += "\n"
                return code
            elif node.audio_type == "voice":
                code = f"{INDENT}stop voice"
                if node.fade_out > 0:
                    code += f" fadeout {node.fade_out}"
                code += "\n"
                return code
            else:
                code = f"{INDENT}stop sound"
                if node.fade_out > 0:
                    code += f" fadeout {node.fade_out}"
                code += "\n"
                return code
        elif node.action == "pause":
            channel = "music" if node.audio_type == "bgm" else node.audio_type
            return f"{INDENT}$ renpy.music.pause(channel='{channel}')\n"
        elif node.action == "resume":
            channel = "music" if node.audio_type == "bgm" else node.audio_type
            return f"{INDENT}$ renpy.music.resume(channel='{channel}')\n"
        return ""

    def _resolve_jump_target(self, target_id_or_name: str) -> str:
        """将场景 UUID 解析为可跳转的 label 名"""
        if UUID_PATTERN.match(target_id_or_name) and target_id_or_name in self.scene_id_to_name:
            return self._sanitize_label(self.scene_id_to_name[target_id_or_name])
        return self._sanitize_label(target_id_or_name)

    def _validate_jump_target(self, target_id_or_name: str, node_id: str, scene_id: str):
        """校验跳转目标是否存在"""
        label = self._resolve_jump_target(target_id_or_name)
        if label not in self.scene_labels and label not in self.inner_labels:
            self.issues.append(CompileIssue(
                severity="warning",
                message=f'跳转目标 "{target_id_or_name}" (label: {label}) 可能不存在',
                node_id=node_id,
                scene_id=scene_id,
            ))

    def _compile_choice(self, node: ChoiceNode, scene_id: str) -> str:
        code = f"{INDENT}menu:\n"
        for choice in node.choices:
            escaped_text = self._escape_string(choice.text)

            # 校验跳转目标
            if choice.target_scene_id:
                self._validate_jump_target(choice.target_scene_id, node.id, scene_id)

            # 条件选项使用 Ren'Py 行内 if 语法
            if choice.condition and choice.condition.strip():
                code += f'{INDENT}{INDENT}"{escaped_text}" if {choice.condition.strip()}:\n'
            else:
                code += f'{INDENT}{INDENT}"{escaped_text}":\n'

            code += self._compile_choice_effects(
                choice.variable_effects, node.id, scene_id, 3
            )

            if choice.target_scene_id:
                target_label = self._resolve_jump_target(choice.target_scene_id)
                code += f"{INDENT * 3}jump {target_label}\n"
            else:
                self.issues.append(CompileIssue(
                    severity="warning",
                    message=f"选项「{choice.text}」未指定跳转目标，执行后将退出菜单",
                    node_id=node.id,
                    scene_id=scene_id,
                ))
        return code

    def _compile_choice_effects(
        self, effects: list[VariableEffect] | None,
        node_id: str, scene_id: str, depth: int,
    ) -> str:
        code = ""
        for effect in (effects or []):
            if effect.variable_name not in self.variable_names:
                self.issues.append(CompileIssue(
                    severity="error",
                    message=f"变量未定义: {effect.variable_name}",
                    node_id=node_id,
                    scene_id=scene_id,
                ))
            # 检查除零
            if effect.operation == "divide" and self._to_number(effect.value) == 0:
                self.issues.append(CompileIssue(
                    severity="error",
                    message=f"除零错误: 变量 {effect.variable_name} 除以零",
                    node_id=node_id,
                    scene_id=scene_id,
                ))
                continue
            code += f"{INDENT * depth}$ {effect.variable_name} {self._op_to_symbol(effect.operation)} {self._format_value(effect.value)}\n"
        return code

    def _compile_jump_label(self, node: JumpLabelNode, scene_id: str) -> str:
        if node.sub_type == "label":
            label_name = self._sanitize_label(node.label_name or "label_1")
            # 内部 label 必须在第 0 列（Ren'Py 语法要求）
            return f"\nlabel {label_name}:\n"
        elif node.sub_type == "jump":
            if not node.target_label or not node.target_label.strip():
                self.issues.append(CompileIssue(
                    severity="warning",
                    message="跳转节点未指定目标，将跳转到 start",
                    node_id=node.id,
                    scene_id=scene_id,
                ))
                return f"{INDENT}jump start\n"
            self._validate_jump_target(node.target_label, node.id, scene_id)
            resolved_label = self._resolve_jump_target(node.target_label)
            return f"{INDENT}jump {resolved_label}\n"
        elif node.sub_type == "return":
            return f"{INDENT}return\n"
        return ""

    def _compile_variable_op(self, node: VariableOpNode, scene_id: str) -> str:
        if node.variable_name not in self.variable_names:
            self.issues.append(CompileIssue(
                severity="error",
                message=f"变量未定义: {node.variable_name}",
                node_id=node.id,
                scene_id=scene_id,
            ))
        # 检查除零
        if node.operation == "divide" and self._to_number(node.value) == 0:
            self.issues.append(CompileIssue(
                severity="error",
                message=f"除零错误: 变量 {node.variable_name} 除以零",
                node_id=node.id,
                scene_id=scene_id,
            ))
            return f"{INDENT}# [错误: 除零操作]\n"
        return f"{INDENT}$ {node.variable_name} {self._op_to_symbol(node.operation)} {self._format_value(node.value)}\n"

    # ===== 辅助生成方法 =====

    def _generate_image_declarations(self, project: ProjectData) -> str:
        code = "# ===== 图片声明 =====\n"
        declared_names: set[str] = set()
        for asset in project.assets:
            escaped_file_name = self._escape_string(asset.file_name)
            if asset.type == "background":
                name = f"bg_{self._sanitize_name(asset.file_name)}"
                if name in declared_names:
                    self.issues.append(CompileIssue(
                        severity="warning",
                        message=f"图片声明名冲突: {name} (素材: {asset.file_name})",
                    ))
                    continue
                declared_names.add(name)
                code += f'image {name} = "images/{escaped_file_name}"\n'
            elif asset.type == "sprite":
                if asset.character_id and asset.emotion:
                    name = f"{asset.character_id} {asset.emotion}"
                    if name in declared_names:
                        self.issues.append(CompileIssue(
                            severity="warning",
                            message=f"图片声明名冲突: {name} (素材: {asset.file_name})",
                        ))
                        continue
                    declared_names.add(name)
                    code += f'image {name} = "images/{escaped_file_name}"\n'
                elif asset.character_id:
                    name = asset.character_id
                    if name in declared_names:
                        self.issues.append(CompileIssue(
                            severity="warning",
                            message=f"图片声明名冲突: {name} (素材: {asset.file_name})",
                        ))
                        continue
                    declared_names.add(name)
                    code += f'image {name} = "images/{escaped_file_name}"\n'
                else:
                    name = f"sprite_{self._sanitize_name(asset.file_name)}"
                    if name in declared_names:
                        self.issues.append(CompileIssue(
                            severity="warning",
                            message=f"图片声明名冲突: {name} (素材: {asset.file_name})",
                        ))
                        continue
                    declared_names.add(name)
                    code += f'image {name} = "images/{escaped_file_name}"\n'
        return code + "\n"

    def _generate_character_declarations(self, characters: list[CharacterDef]) -> str:
        code = "# ===== 角色声明 =====\n"
        for char in characters:
            escaped_name = self._escape_string(char.display_name)
            escaped_color = self._escape_string(char.color)
            code += f'define {char.id} = Character("{escaped_name}", color="{escaped_color}")\n'
        return code + "\n"

    def _generate_variable_defaults(self, variables: list[VariableDef]) -> str:
        code = "# ===== 变量初始化 =====\n"
        for v in variables:
            code += f"default {v.name} = {self._format_default(v)}\n"
        return code + "\n"

    def _generate_options_rpy(self, project: ProjectData) -> str:
        meta = project.meta
        return (
            f'# options.rpy - 由影游工坊生成\n'
            f'define config.name = "{self._escape_string(meta.name)}"\n'
            f'define config.version = "1.0"\n'
            f'define config.developer = True\n'
            f'define config.screen_width = {meta.resolution.width}\n'
            f'define config.screen_height = {meta.resolution.height}\n'
            f'define gui.text_font = "{meta.default_font}"\n'
            f'define gui.text_size = 22\n'
            f'define gui.name_text_color = "{meta.theme_color}"\n'
        )

    def _generate_variables_rpy(self, _variables: list[VariableDef]) -> str:
        return (
            "# variables.rpy - 由影游工坊生成\n"
            "# 变量初始值已在 script.rpy 中通过 default 声明\n"
            "# 可在此文件添加自定义 Python 函数和常量\n"
        )

    def _generate_screens_rpy(self, _project: ProjectData) -> str:
        return (
            "# screens.rpy - 由影游工坊生成\n"
            "# 自定义界面（MVP 使用默认界面，可扩展）\n"
            "screen say(who, what):\n"
            '    style_prefix "say"\n'
            "    window:\n"
            '        id "window"\n'
            '        text what id "what"\n'
            "        if who:\n"
            '            text who id "who"\n'
        )

    # ===== 映射辅助 =====

    def _format_transition(self, t: str, duration: float) -> str:
        match t:
            case "none":
                return "None"
            case "dissolve":
                return f"Dissolve({duration})"
            case "fade":
                return f"Fade({duration}, 0, {duration})"
            case "pushright":
                return "pushright"
            case "wipeleft":
                return "wipeleft"
            case _:
                return f"Dissolve({duration})"

    def _map_position(self, pos: str) -> str:
        mapping = {
            "left": "left", "center": "center",
            "right": "right", "truecenter": "truecenter",
        }
        return mapping.get(pos, "center")

    def _map_enter_effect(self, effect: str) -> str:
        mapping = {
            "none": "None", "easein": "easeinleft", "easeout": "easeoutleft",
            "moveinleft": "moveinleft", "moveinright": "moveinright",
        }
        return mapping.get(effect, "None")

    def _op_to_symbol(self, op: str) -> str:
        mapping = {
            "set": "=", "add": "+=", "subtract": "-=",
            "multiply": "*=", "divide": "/=",
        }
        return mapping.get(op, "=")

    def _format_default(self, v: VariableDef) -> str:
        match v.type:
            case "integer" | "float":
                return str(v.initial_value)
            case "string":
                return f'"{self._escape_string(str(v.initial_value))}"'
            case "boolean":
                return "True" if v.initial_value else "False"
            case _:
                return "None"

    def _format_value(self, value) -> str:
        if isinstance(value, str):
            return f'"{self._escape_string(value)}"'
        if isinstance(value, bool):
            return "True" if value else "False"
        return str(value)

    def _escape_string(self, s: str) -> str:
        if not s:
            return ""
        return s.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")

    def _sanitize_name(self, file_name: str) -> str:
        # 移除扩展名，替换非法字符
        base = re.sub(r'\.[^.]+$', '', file_name)
        return re.sub(r'[^a-zA-Z0-9_]', '_', base)

    def _sanitize_label(self, name: str) -> str:
        result = re.sub(r'[^a-zA-Z0-9_\u4e00-\u9fa5]', '_', name).lower()
        return result or "unnamed"

    @staticmethod
    def _to_number(value) -> float:
        """安全地将值转换为数字用于除零检查"""
        try:
            return float(value)
        except (ValueError, TypeError):
            return float('inf')  # 非数字不触发除零检查


# 导出单例
compiler = Compiler()
