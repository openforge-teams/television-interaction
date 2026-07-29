"""
影游工坊 - 文件服务
项目导入/导出、素材管理、持久化存储
对应 TypeScript 版本 src/services/fileService.ts
"""
from __future__ import annotations

import json
import os
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from models.types import ProjectData, ProjectMeta, AssetEntry, Resolution
from models.factory import create_empty_project_data
from services.compiler import compiler


# 存储目录
APP_DIR = Path.home() / ".yingyou-workshop"
PROJECTS_DIR = APP_DIR / "projects"
ASSETS_DIR = APP_DIR / "assets"
RECENT_FILE = APP_DIR / "recent.json"


def ensure_dirs():
    """确保存储目录存在"""
    APP_DIR.mkdir(parents=True, exist_ok=True)
    PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)


def get_asset_path(asset_id: str, file_name: str) -> Path:
    """获取素材文件的本地存储路径"""
    ensure_dirs()
    dot_idx = file_name.rfind(".")
    ext = file_name[dot_idx:] if dot_idx > 0 else ""
    return ASSETS_DIR / f"{asset_id}{ext}"


def import_asset_files(file_paths: list[str], force_type: str = None) -> list[AssetEntry]:
    """导入素材文件到本地存储"""
    ensure_dirs()
    from models.types import FORMAT_TO_TYPE
    import uuid

    results: list[AssetEntry] = []
    for fpath in file_paths:
        path = Path(fpath)
        if not path.exists():
            continue

        ext = path.suffix.lstrip(".").lower()
        asset_type = force_type or FORMAT_TO_TYPE.get(ext, "background")
        asset_id = str(uuid.uuid4())
        file_name = path.name

        # 复制文件到存储目录
        dest = get_asset_path(asset_id, file_name)
        shutil.copy2(str(path), str(dest))

        # 获取文件大小
        file_size = path.stat().st_size

        asset = AssetEntry(
            id=asset_id,
            file_name=file_name,
            relative_path=f"assets/{asset_id}{path.suffix}",
            type=asset_type,
            format=ext,
            file_size=file_size,
            imported_at=datetime.now(timezone.utc).isoformat(),
        )
        results.append(asset)

    return results


def save_project(data: ProjectData) -> str:
    """保存项目到本地存储，返回项目文件路径"""
    ensure_dirs()
    project_path = PROJECTS_DIR / f"{_safe_name(data.meta.name)}.yypkg.json"

    # 更新修改时间
    data.meta.last_modified = datetime.now(timezone.utc).isoformat()

    # 序列化项目数据
    project_json = serialize_project(data)
    project_path.write_text(project_json, encoding="utf-8")

    # 更新最近项目列表
    _add_recent_project(data.meta.name, str(project_path))

    return str(project_path)


def load_project(project_path: str) -> Optional[ProjectData]:
    """从本地存储加载项目"""
    path = Path(project_path)
    if not path.exists():
        return None
    try:
        json_str = path.read_text(encoding="utf-8")
        data = deserialize_project(json_str)
        return data
    except Exception as e:
        print(f"加载项目失败: {e}")
        return None


def export_project_package(
    data: ProjectData,
    script_rpy: str = "",
    options_rpy: str = "",
    variables_rpy: str = "",
    screens_rpy: str = "",
    output_path: str = None,
) -> str:
    """导出项目为 ZIP 文件"""
    if output_path is None:
        output_path = str(Path.cwd() / f"{_safe_name(data.meta.name)}.zip")

    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as zf:
        # 1. 项目数据
        zf.writestr("project.json", serialize_project(data))

        # 2. Ren'Py 脚本（放在 game/ 目录下）
        if script_rpy:
            zf.writestr("game/script.rpy", script_rpy)
        if options_rpy:
            zf.writestr("game/options.rpy", options_rpy)
        if variables_rpy:
            zf.writestr("game/variables.rpy", variables_rpy)
        if screens_rpy:
            zf.writestr("game/screens.rpy", screens_rpy)

        # 3. 素材文件
        for asset in data.assets:
            src = get_asset_path(asset.id, asset.file_name)
            if src.exists():
                dot_idx = asset.file_name.rfind(".")
                ext = asset.file_name[dot_idx:] if dot_idx > 0 else ""
                zf.write(str(src), f"assets/{asset.id}{ext}")

    return output_path


def import_project_package(file_path: str) -> Optional[ProjectData]:
    """从 ZIP 文件导入项目"""
    try:
        with zipfile.ZipFile(file_path, "r") as zf:
            # 读取项目数据
            project_json = zf.read("project.json").decode("utf-8")
            data = deserialize_project(project_json)

            if not data.meta or not data.scenes:
                raise ValueError("项目数据结构不完整")

            # 恢复素材文件
            for asset in data.assets:
                dot_idx = asset.file_name.rfind(".")
                ext = asset.file_name[dot_idx:] if dot_idx > 0 else ""
                zip_entry = f"assets/{asset.id}{ext}"
                try:
                    file_data = zf.read(zip_entry)
                    dest = get_asset_path(asset.id, asset.file_name)
                    dest.write_bytes(file_data)
                except KeyError:
                    pass  # 素材文件不存在，跳过

            return data
    except Exception as e:
        print(f"导入项目失败: {e}")
        return None


def get_recent_projects() -> list[dict]:
    """获取最近项目列表"""
    if not RECENT_FILE.exists():
        return []
    try:
        return json.loads(RECENT_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def _add_recent_project(name: str, path: str):
    """添加到最近项目列表"""
    projects = get_recent_projects()
    # 移除已存在的同名项目
    projects = [p for p in projects if p.get("path") != path]
    projects.insert(0, {
        "name": name,
        "path": path,
        "last_modified": datetime.now(timezone.utc).isoformat(),
    })
    # 限制为 20 个
    projects = projects[:20]
    RECENT_FILE.write_text(json.dumps(projects, ensure_ascii=False, indent=2), encoding="utf-8")


def delete_asset_file(asset_id: str, file_name: str):
    """删除素材文件"""
    path = get_asset_path(asset_id, file_name)
    if path.exists():
        path.unlink()


def _safe_name(name: str) -> str:
    """将项目名转换为安全的文件名"""
    import re
    safe = re.sub(r'[^\w\-]', '_', name)
    return safe or "unnamed"


def serialize_project(data: ProjectData) -> str:
    """将项目数据序列化为 JSON"""
    return json.dumps(data, default=_dataclass_to_dict, ensure_ascii=False, indent=2)


def _dataclass_to_dict(obj):
    """dataclass 转 dict 的 JSON 序列化辅助"""
    from dataclasses import asdict, is_dataclass
    if is_dataclass(obj) and not isinstance(obj, type):
        d = asdict(obj)
        return d
    if isinstance(obj, Resolution):
        return {"width": obj.width, "height": obj.height}
    raise TypeError(f"Object of type {type(obj).__name__} is not serializable")


def deserialize_project(json_str: str) -> ProjectData:
    """从 JSON 反序列化项目数据"""
    raw = json.loads(json_str)

    # 解析 meta
    meta_raw = raw.get("meta", {})
    res_raw = meta_raw.get("resolution", {})
    meta = ProjectMeta(
        version=meta_raw.get("version", "1.0"),
        name=meta_raw.get("name", ""),
        author=meta_raw.get("author", ""),
        resolution=Resolution(
            width=res_raw.get("width", 1280),
            height=res_raw.get("height", 720),
        ),
        default_font=meta_raw.get("default_font", "Noto Sans SC"),
        theme_color=meta_raw.get("theme_color", "#3366CC"),
        created_time=meta_raw.get("created_time", ""),
        last_modified=meta_raw.get("last_modified", ""),
        renpy_version=meta_raw.get("renpy_version", "8.2.3"),
        scene_order=meta_raw.get("scene_order", []),
        current_scene_id=meta_raw.get("current_scene_id"),
    )

    # 解析 assets
    from models.types import AssetEntry
    assets = []
    for a in raw.get("assets", []):
        res = a.get("resolution")
        assets.append(AssetEntry(
            id=a["id"],
            file_name=a.get("file_name", ""),
            relative_path=a.get("relative_path", ""),
            type=a.get("type", "background"),
            format=a.get("format", "png"),
            file_size=a.get("file_size", 0),
            resolution=Resolution(width=res["width"], height=res["height"]) if res else None,
            duration=a.get("duration"),
            character_id=a.get("character_id"),
            emotion=a.get("emotion"),
            tags=a.get("tags", []),
            thumbnail_path=a.get("thumbnail_path", ""),
            md5=a.get("md5"),
            imported_at=a.get("imported_at", ""),
        ))

    # 解析 characters
    from models.types import CharacterDef
    characters = [CharacterDef(**c) for c in raw.get("characters", [])]

    # 解析 variables
    from models.types import VariableDef
    variables = [VariableDef(**v) for v in raw.get("variables", [])]

    # 解析 scenes（包含节点）
    from models.types import (
        Scene, BackgroundNode, SpriteNode, DialogueNode, VideoNode,
        AudioNode, ChoiceNode, JumpLabelNode, VariableOpNode,
        ChoiceItem, VariableEffect, TextStyle, ButtonStyle,
    )
    import uuid

    scenes = {}
    for sid, sraw in raw.get("scenes", {}).items():
        nodes = []
        for nraw in sraw.get("nodes", []):
            ntype = nraw.get("type")
            if ntype == "background":
                nodes.append(BackgroundNode(**_filter_fields(nraw, BackgroundNode)))
            elif ntype == "sprite":
                nodes.append(SpriteNode(**_filter_fields(nraw, SpriteNode)))
            elif ntype == "dialogue":
                ts_raw = nraw.get("text_style", {})
                nraw["text_style"] = TextStyle(**ts_raw) if isinstance(ts_raw, dict) else TextStyle()
                nodes.append(DialogueNode(**_filter_fields(nraw, DialogueNode)))
            elif ntype == "video":
                nodes.append(VideoNode(**_filter_fields(nraw, VideoNode)))
            elif ntype == "audio":
                nodes.append(AudioNode(**_filter_fields(nraw, AudioNode)))
            elif ntype == "choice":
                choices_raw = nraw.get("choices", [])
                choices = []
                for craw in choices_raw:
                    effects_raw = craw.get("variable_effects", [])
                    effects = [VariableEffect(**e) for e in effects_raw]
                    choices.append(ChoiceItem(
                        id=craw.get("id", str(uuid.uuid4())),
                        text=craw.get("text", ""),
                        target_scene_id=craw.get("target_scene_id", ""),
                        condition=craw.get("condition", ""),
                        variable_effects=effects,
                    ))
                nraw["choices"] = choices
                bs_raw = nraw.get("button_style", {})
                nraw["button_style"] = ButtonStyle(**bs_raw) if isinstance(bs_raw, dict) else ButtonStyle()
                nodes.append(ChoiceNode(**_filter_fields(nraw, ChoiceNode)))
            elif ntype == "jump_label":
                nodes.append(JumpLabelNode(**_filter_fields(nraw, JumpLabelNode)))
            elif ntype == "variable_op":
                nodes.append(VariableOpNode(**_filter_fields(nraw, VariableOpNode)))

        scenes[sid] = Scene(
            id=sraw.get("id", sid),
            name=sraw.get("name", ""),
            nodes=nodes,
            color=sraw.get("color", "#3b82f6"),
        )

    return ProjectData(
        meta=meta,
        scenes=scenes,
        assets=assets,
        characters=characters,
        variables=variables,
    )


def _filter_fields(raw: dict, cls) -> dict:
    """过滤 dict 中不属于 dataclass 的字段"""
    from dataclasses import fields
    valid_names = {f.name for f in fields(cls)}
    return {k: v for k, v in raw.items() if k in valid_names}
