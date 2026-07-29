"""
影游工坊 - Lint 服务
编译前校验，对应 TypeScript 版本 src/services/linter.ts
"""
from __future__ import annotations

import re
from typing import Optional

from models.types import (
    ProjectData, LintIssue, VariableDef, CharacterDef,
)
from services.topological_sort import topological_sort, sanitize_label


def _resolve_jump_target(target_id_or_name: str, scene_id_to_name: dict[str, str]) -> str:
    """将 UUID 或场景名解析为 label 名（与 compiler 保持一致）"""
    uuid_pattern = re.compile(
        r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
        re.IGNORECASE,
    )
    if uuid_pattern.match(target_id_or_name) and target_id_or_name in scene_id_to_name:
        return sanitize_label(scene_id_to_name[target_id_or_name])
    return sanitize_label(target_id_or_name)


def _validate_condition(expr: str) -> bool:
    """简单条件表达式校验"""
    trimmed = expr.strip()
    if not trimmed:
        return True
    operators = ['>=', '<=', '==', '!=', '>', '<']
    has_operator = any(op in trimmed for op in operators)
    if not has_operator:
        # 可能是布尔变量直接判断
        return bool(re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', trimmed)) or trimmed in ['True', 'False']
    return bool(re.match(r'^[a-zA-Z_0-9\s"\'+\-*/().><=!]+$', trimmed))


def _extract_variable_names(expr: str) -> list[str]:
    """从条件表达式中提取变量名"""
    tokens = re.findall(r'[a-zA-Z_][a-zA-Z0-9_]*', expr)
    keywords = {'True', 'False', 'and', 'or', 'not'}
    return [t for t in tokens if t not in keywords]


def lint_project(project: ProjectData) -> list[LintIssue]:
    """对整个项目进行 Lint 检查"""
    issues: list[LintIssue] = []

    variable_names = {v.name for v in project.variables}
    asset_ids = {a.id for a in project.assets}
    character_ids = {c.id for c in project.characters}
    scene_ids = set(project.scenes.keys())

    # 收集所有合法 label
    valid_labels: set[str] = set()
    scene_id_to_name: dict[str, str] = {}
    for scene in project.scenes.values():
        valid_labels.add(sanitize_label(scene.name))
        scene_id_to_name[scene.id] = scene.name
    valid_labels.add("start")

    # 收集内部 label
    for scene in project.scenes.values():
        for node in scene.nodes:
            if node.type == "jump_label" and getattr(node, "sub_type", "") == "label":
                label_name = getattr(node, "label_name", None) or "label_1"
                valid_labels.add(sanitize_label(label_name))

    # 死循环检测
    sort_result = topological_sort(project)
    if sort_result.has_cycle:
        issues.append(LintIssue(
            severity="warning",
            message=f"检测到场景间可能存在循环跳转（死循环风险）: {', '.join(sort_result.cycle_scenes)}",
        ))

    # 场景数限制
    scene_count = len(project.scenes)
    if scene_count > 200:
        issues.append(LintIssue(
            severity="warning",
            message=f"场景数 {scene_count} 超过 MVP 限制 200",
        ))

    # 变量数限制
    if len(project.variables) > 100:
        issues.append(LintIssue(
            severity="warning",
            message=f"变量数 {len(project.variables)} 超过 MVP 限制 100",
        ))

    # 遍历所有场景节点
    ctx = {
        "variable_names": variable_names,
        "asset_ids": asset_ids,
        "character_ids": character_ids,
        "scene_ids": scene_ids,
        "valid_labels": valid_labels,
        "scene_id_to_name": scene_id_to_name,
        "issues": issues,
    }

    for scene in project.scenes.values():
        if len(scene.nodes) > 500:
            issues.append(LintIssue(
                severity="warning",
                message=f"场景「{scene.name}」节点数 {len(scene.nodes)} 超过 MVP 限制 500",
                scene_id=scene.id,
            ))
        for node in scene.nodes:
            _lint_node(node, scene.id, ctx)

    # 校验变量名合法性
    for v in project.variables:
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', v.name):
            issues.append(LintIssue(
                severity="error",
                message=f"变量名「{v.name}」不合法（须字母开头，仅含字母数字下划线）",
            ))

    # 校验角色 ID 合法性
    for c in project.characters:
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', c.id):
            issues.append(LintIssue(
                severity="error",
                message=f"角色 ID「{c.id}」不合法（须字母开头，仅含字母数字下划线）",
            ))

    return issues


def _lint_node(node, scene_id: str, ctx: dict):
    issues = ctx["issues"]

    match node.type:
        case "background" | "video":
            asset_id = getattr(node, "asset_id", "")
            if asset_id and asset_id not in ctx["asset_ids"]:
                issues.append(LintIssue(
                    severity="error",
                    message=f"素材引用不存在: {asset_id}",
                    node_id=node.id,
                    scene_id=scene_id,
                    field="assetId",
                ))

        case "sprite":
            char_id = getattr(node, "character_id", "")
            if char_id and char_id not in ctx["character_ids"]:
                issues.append(LintIssue(
                    severity="error",
                    message=f"角色引用不存在: {char_id}",
                    node_id=node.id,
                    scene_id=scene_id,
                    field="characterId",
                ))

        case "audio":
            action = getattr(node, "action", "play")
            asset_id = getattr(node, "asset_id", "")
            if action == "play" and asset_id and asset_id not in ctx["asset_ids"]:
                issues.append(LintIssue(
                    severity="error",
                    message=f"音频素材引用不存在: {asset_id}",
                    node_id=node.id,
                    scene_id=scene_id,
                    field="assetId",
                ))

        case "dialogue":
            voice_id = getattr(node, "voice_asset_id", None)
            if voice_id and voice_id not in ctx["asset_ids"]:
                issues.append(LintIssue(
                    severity="warning",
                    message=f"语音素材引用不存在: {voice_id}",
                    node_id=node.id,
                    scene_id=scene_id,
                    field="voiceAssetId",
                ))
            if not node.text.strip():
                issues.append(LintIssue(
                    severity="warning",
                    message="对话内容为空",
                    node_id=node.id,
                    scene_id=scene_id,
                    field="text",
                ))

        case "choice":
            for choice in (getattr(node, "choices", None) or []):
                target_id = getattr(choice, "target_scene_id", "")
                if target_id:
                    resolved = _resolve_jump_target(target_id, ctx["scene_id_to_name"])
                    if resolved not in ctx["valid_labels"]:
                        issues.append(LintIssue(
                            severity="error",
                            message=f"选项「{choice.text}」跳转目标不存在: {target_id}",
                            node_id=node.id,
                            scene_id=scene_id,
                            field="targetSceneId",
                        ))
                # 条件表达式校验
                condition = getattr(choice, "condition", "")
                if condition and condition.strip():
                    if not _validate_condition(condition):
                        issues.append(LintIssue(
                            severity="error",
                            message=f"选项「{choice.text}」条件表达式语法错误: {condition}",
                            node_id=node.id,
                            scene_id=scene_id,
                            field="condition",
                        ))
                    vars_in_cond = _extract_variable_names(condition)
                    for vn in vars_in_cond:
                        if vn not in ctx["variable_names"] and vn not in ["True", "False", "true", "false"]:
                            issues.append(LintIssue(
                                severity="error",
                                message=f"选项条件中引用了未定义的变量: {vn}",
                                node_id=node.id,
                                scene_id=scene_id,
                                field="condition",
                            ))
                # 变量效果校验
                for effect in (getattr(choice, "variable_effects", None) or []):
                    if effect.variable_name not in ctx["variable_names"]:
                        issues.append(LintIssue(
                            severity="error",
                            message=f"变量效果引用了未定义的变量: {effect.variable_name}",
                            node_id=node.id,
                            scene_id=scene_id,
                            field="variableEffects",
                        ))
                    if effect.operation == "divide":
                        try:
                            if float(effect.value) == 0:
                                issues.append(LintIssue(
                                    severity="error",
                                    message=f"变量「{effect.variable_name}」除以零",
                                    node_id=node.id,
                                    scene_id=scene_id,
                                    field="variableEffects",
                                ))
                        except (ValueError, TypeError):
                            pass

        case "variable_op":
            var_name = getattr(node, "variable_name", "")
            if var_name and var_name not in ctx["variable_names"]:
                issues.append(LintIssue(
                    severity="error",
                    message=f"变量操作引用了未定义的变量: {var_name}",
                    node_id=node.id,
                    scene_id=scene_id,
                    field="variableName",
                ))
            if node.operation == "divide":
                try:
                    if float(node.value) == 0:
                        issues.append(LintIssue(
                            severity="error",
                            message=f"变量「{var_name}」除以零",
                            node_id=node.id,
                            scene_id=scene_id,
                        ))
                except (ValueError, TypeError):
                    pass

        case "jump_label":
            if getattr(node, "sub_type", "") == "jump":
                target = getattr(node, "target_label", "")
                if not target or not target.strip():
                    issues.append(LintIssue(
                        severity="warning",
                        message="跳转节点未指定目标，将跳转到 start",
                        node_id=node.id,
                        scene_id=scene_id,
                        field="targetLabel",
                    ))
                else:
                    resolved = _resolve_jump_target(target, ctx["scene_id_to_name"])
                    if resolved not in ctx["valid_labels"]:
                        issues.append(LintIssue(
                            severity="warning",
                            message=f"跳转目标可能不存在: {target}",
                            node_id=node.id,
                            scene_id=scene_id,
                            field="targetLabel",
                        ))
