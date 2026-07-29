"""
影游工坊 - 左侧面板（素材库 / 角色管理 / 变量管理）
QTabWidget 三标签页，深色主题，支持拖拽素材到时间轴
对应 TypeScript 版本 src/components/LeftPanel.tsx
"""
from __future__ import annotations

import uuid

from PySide6.QtWidgets import (
    QTabWidget, QWidget, QVBoxLayout, QHBoxLayout, QPushButton,
    QListWidget, QListWidgetItem, QFileDialog, QMessageBox, QMenu,
    QLabel, QInputDialog, QComboBox, QColorDialog, QLineEdit,
    QDialog, QFormLayout, QDialogButtonBox, QTextEdit,
)
from PySide6.QtCore import Qt, Signal, QMimeData, QSize
from PySide6.QtGui import QDrag, QColor, QPixmap

from stores.project_store import project_store
from services import file_service
from models.types import CharacterDef, VariableDef


# ===== 主题配色（与 launcher / main_window / toolbar 保持一致）=====
DARK_BG = "#1e1e2e"
PANEL_BG = "#252535"
ACCENT = "#3b82f6"
ACCENT_HOVER = "#2563eb"
SECONDARY = "#374151"
SECONDARY_HOVER = "#4b5563"
TEXT_COLOR = "#e0e0e0"
SUBTEXT_COLOR = "#9ca3af"
DIVIDER_COLOR = "#2d2d3f"

# 素材类型中文标签
ASSET_TYPE_LABELS = {
    "background": "背景",
    "sprite": "立绘",
    "video": "视频",
    "bgm": "背景音乐",
    "sfx": "音效",
    "voice": "语音",
}

# 素材类型配色（用于图标色块）
ASSET_TYPE_COLORS = {
    "background": "#3b82f6",
    "sprite": "#10b981",
    "video": "#8b5cf6",
    "bgm": "#f59e0b",
    "sfx": "#ef4444",
    "voice": "#ec4899",
}

# 变量类型中文标签
VARIABLE_TYPE_LABELS = {
    "integer": "整数",
    "float": "浮点",
    "string": "字符串",
    "boolean": "布尔",
}

# 拖拽素材的 MIME 类型（时间轴据此识别素材拖入）
ASSET_MIME_TYPE = "application/x-yingyou-asset-id"


LEFT_PANEL_QSS = f"""
QTabWidget::pane {{
    border: none;
    background-color: {DARK_BG};
}}
QTabBar::tab {{
    background-color: {PANEL_BG};
    color: {SUBTEXT_COLOR};
    padding: 8px 14px;
    border: none;
    margin-right: 2px;
    font-size: 12px;
}}
QTabBar::tab:selected {{
    background-color: {ACCENT};
    color: #ffffff;
}}
QTabBar::tab:hover:!selected {{
    background-color: {SECONDARY_HOVER};
    color: {TEXT_COLOR};
}}
QPushButton {{
    background-color: {SECONDARY};
    color: {TEXT_COLOR};
    border: none;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 12px;
}}
QPushButton:hover {{
    background-color: {SECONDARY_HOVER};
}}
QPushButton:pressed {{
    background-color: {DIVIDER_COLOR};
}}
QPushButton#primaryButton {{
    background-color: {ACCENT};
    color: #ffffff;
    font-weight: 600;
}}
QPushButton#primaryButton:hover {{
    background-color: {ACCENT_HOVER};
}}
QListWidget {{
    background-color: {PANEL_BG};
    border: 1px solid {DIVIDER_COLOR};
    border-radius: 6px;
    color: {TEXT_COLOR};
    padding: 4px;
    outline: none;
}}
QListWidget::item {{
    border-radius: 4px;
    margin: 1px 0;
}}
QListWidget::item:hover {{
    background-color: #2f2f44;
}}
QListWidget::item:selected {{
    background-color: {ACCENT};
    color: #ffffff;
}}
QComboBox {{
    background-color: {SECONDARY};
    color: {TEXT_COLOR};
    border: none;
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 12px;
    min-width: 90px;
}}
QComboBox:hover {{
    background-color: {SECONDARY_HOVER};
}}
QComboBox::drop-down {{
    border: none;
    width: 18px;
}}
QComboBox QAbstractItemView {{
    background-color: {PANEL_BG};
    color: {TEXT_COLOR};
    selection-background-color: {ACCENT};
    selection-color: #ffffff;
    border: 1px solid {DIVIDER_COLOR};
    border-radius: 4px;
    outline: none;
}}
QLabel {{
    color: {TEXT_COLOR};
    background: transparent;
}}
QLineEdit, QTextEdit {{
    background-color: {DARK_BG};
    color: {TEXT_COLOR};
    border: 1px solid {DIVIDER_COLOR};
    border-radius: 4px;
    padding: 4px 6px;
}}
QDialog {{
    background-color: {DARK_BG};
}}
QMenu {{
    background-color: {PANEL_BG};
    color: {TEXT_COLOR};
    border: 1px solid {DIVIDER_COLOR};
    border-radius: 6px;
    padding: 4px;
}}
QMenu::item {{
    padding: 6px 28px 6px 16px;
    border-radius: 4px;
}}
QMenu::item:selected {{
    background-color: {ACCENT};
    color: #ffffff;
}}
"""


# ============================================================
# 辅助控件
# ============================================================

class _TypeIconLabel(QLabel):
    """素材类型图标色块（显示类型首字符）"""

    def __init__(self, asset_type: str, parent=None):
        super().__init__(parent)
        color = ASSET_TYPE_COLORS.get(asset_type, "#6b7280")
        label = ASSET_TYPE_LABELS.get(asset_type, asset_type)
        self.setFixedSize(28, 28)
        self.setAlignment(Qt.AlignCenter)
        self.setText(label[0] if label else "?")
        self.setStyleSheet(
            f"background-color: {color}; color: #ffffff;"
            f"border-radius: 4px; font-size: 13px; font-weight: 700;"
        )


class _ColorBlockLabel(QLabel):
    """角色颜色色块"""

    def __init__(self, color: str, parent=None):
        super().__init__(parent)
        self.setFixedSize(16, 16)
        self.setStyleSheet(
            f"background-color: {color}; border-radius: 3px;"
            f"border: 1px solid {DIVIDER_COLOR};"
        )


# ============================================================
# 素材列表（支持拖拽）
# ============================================================

class AssetListWidget(QListWidget):
    """素材列表，支持拖拽素材项到时间轴

    拖拽时将素材 ID 写入 mime data（类型 ``application/x-yingyou-asset-id``），
    时间轴可在 ``dragEnterEvent`` / ``dropEvent`` 中读取并据此创建节点。
    """

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setSelectionMode(QListWidget.SingleSelection)
        self.setContextMenuPolicy(Qt.CustomContextMenu)
        # 鼠标按下起点与对应项，用于判断是否触发拖拽
        self._press_pos = None
        self._press_item: QListWidgetItem | None = None

    # -- 拖拽实现 --

    def mousePressEvent(self, event):
        super().mousePressEvent(event)
        if event.button() == Qt.LeftButton:
            self._press_pos = event.position().toPoint()
            self._press_item = self.itemAt(self._press_pos)
        else:
            self._press_pos = None
            self._press_item = None

    def mouseMoveEvent(self, event):
        if (
            self._press_pos is not None
            and self._press_item is not None
            and (event.buttons() & Qt.LeftButton)
        ):
            moved = (event.position().toPoint() - self._press_pos).manhattanLength()
            if moved >= 10:  # 超过拖拽阈值
                asset_id = self._press_item.data(Qt.UserRole)
                if asset_id:
                    self._start_drag(asset_id)
                    self._press_pos = None
                    self._press_item = None
                    return
        super().mouseMoveEvent(event)

    def _start_drag(self, asset_id: str):
        drag = QDrag(self)
        mime = QMimeData()
        mime.setData(ASSET_MIME_TYPE, asset_id.encode("utf-8"))
        mime.setText(asset_id)
        drag.setMimeData(mime)
        # 拖拽预览 pixmap
        pix = QPixmap(80, 24)
        pix.fill(QColor(ACCENT))
        drag.setPixmap(pix)
        drag.exec(Qt.CopyAction)


# ============================================================
# 素材库标签页
# ============================================================

class AssetTab(QWidget):
    """素材库标签页：导入 / 过滤 / 列表 / 右键删除 / 拖拽到时间轴"""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._build_ui()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(8, 8, 8, 8)
        layout.setSpacing(6)

        # 顶部工具栏：导入素材 + 类型过滤
        top = QHBoxLayout()
        top.setSpacing(6)

        self.import_btn = QPushButton("＋ 导入素材")
        self.import_btn.setObjectName("primaryButton")
        self.import_btn.setCursor(Qt.PointingHandCursor)
        self.import_btn.clicked.connect(self._on_import)
        top.addWidget(self.import_btn)

        top.addStretch(1)

        self.filter_combo = QComboBox()
        self.filter_combo.addItem("全部类型", "")
        for atype in ["background", "sprite", "video", "bgm", "sfx", "voice"]:
            self.filter_combo.addItem(ASSET_TYPE_LABELS[atype], atype)
        self.filter_combo.currentIndexChanged.connect(self._on_filter_changed)
        top.addWidget(self.filter_combo)

        layout.addLayout(top)

        # 素材列表
        self.list_widget = AssetListWidget()
        self.list_widget.customContextMenuRequested.connect(self._on_context_menu)
        layout.addWidget(self.list_widget, 1)

        # 底部统计
        self.count_label = QLabel("")
        self.count_label.setStyleSheet(f"color: {SUBTEXT_COLOR}; font-size: 11px;")
        layout.addWidget(self.count_label)

    # -- 事件处理 --

    def _on_filter_changed(self):
        self.refresh()

    def _on_import(self):
        file_filter = (
            "所有支持的素材 (*.png *.jpg *.jpeg *.mp4 *.webm *.ogg *.mp3 *.wav);;"
            "图片 (*.png *.jpg *.jpeg);;"
            "视频 (*.mp4 *.webm);;"
            "音频 (*.ogg *.mp3 *.wav);;"
            "所有文件 (*.*)"
        )
        paths, _ = QFileDialog.getOpenFileNames(self, "导入素材", "", file_filter)
        if not paths:
            return

        # 类型过滤下拉决定 force_type（"全部类型" -> None -> 自动推断）
        force_type = self.filter_combo.currentData() or None
        try:
            assets = file_service.import_asset_files(paths, force_type)
        except Exception as e:  # noqa: BLE001
            QMessageBox.critical(self, "导入失败", f"导入素材时出错：\n{e}")
            return

        if not assets:
            QMessageBox.warning(self, "提示", "未导入任何素材，请检查文件格式是否支持。")
            return

        for asset in assets:
            project_store.add_asset(asset)

        QMessageBox.information(self, "导入成功", f"已导入 {len(assets)} 个素材。")

    def _on_context_menu(self, pos):
        item = self.list_widget.itemAt(pos)
        if not item:
            return
        asset_id = item.data(Qt.UserRole)
        if not asset_id:
            return
        menu = QMenu(self.list_widget)
        act_del = menu.addAction("删除素材")
        action = menu.exec(self.list_widget.viewport().mapToGlobal(pos))
        if action == act_del:
            self._delete_asset(asset_id)

    def _delete_asset(self, asset_id: str):
        asset = next((a for a in project_store.data.assets if a.id == asset_id), None)
        if not asset:
            return
        reply = QMessageBox.question(
            self, "删除素材",
            f"确定删除素材「{asset.file_name}」吗？\n引用该素材的节点也会被一并移除。",
            QMessageBox.Yes | QMessageBox.No, QMessageBox.No,
        )
        if reply == QMessageBox.Yes:
            project_store.delete_asset(asset_id)

    # -- 刷新 --

    def refresh(self):
        """从 project_store 更新素材列表"""
        self.list_widget.clear()
        filter_type = self.filter_combo.currentData() if hasattr(self, "filter_combo") else ""

        all_assets = project_store.data.assets
        if filter_type:
            assets = [a for a in all_assets if a.type == filter_type]
        else:
            assets = list(all_assets)

        for asset in assets:
            self._add_asset_item(asset)

        total = len(all_assets)
        shown = len(assets)
        if filter_type:
            self.count_label.setText(f"显示 {shown} / 共 {total} 个素材")
        else:
            self.count_label.setText(f"共 {total} 个素材")

    def _add_asset_item(self, asset):
        item = QListWidgetItem()
        item.setData(Qt.UserRole, asset.id)

        widget = QWidget()
        widget.setStyleSheet("background: transparent;")
        h = QHBoxLayout(widget)
        h.setContentsMargins(6, 4, 6, 4)
        h.setSpacing(8)

        # 类型图标
        icon = _TypeIconLabel(asset.type)
        h.addWidget(icon)

        # 文件名 + 类型标签
        col = QVBoxLayout()
        col.setSpacing(0)
        name_lbl = QLabel(asset.file_name)
        name_lbl.setStyleSheet(
            f"color: {TEXT_COLOR}; font-size: 12px; background: transparent;"
        )
        col.addWidget(name_lbl)
        type_tag = QLabel(
            f"{ASSET_TYPE_LABELS.get(asset.type, asset.type)} · {asset.format.upper()}"
        )
        type_tag.setStyleSheet(
            f"color: {SUBTEXT_COLOR}; font-size: 10px; background: transparent;"
        )
        col.addWidget(type_tag)
        h.addLayout(col, 1)

        item.setSizeHint(QSize(100, 48))
        self.list_widget.addItem(item)
        self.list_widget.setItemWidget(item, widget)


# ============================================================
# 角色编辑对话框
# ============================================================

class CharacterEditDialog(QDialog):
    """角色编辑 / 新建对话框"""

    def __init__(self, character: CharacterDef | None = None, parent=None):
        super().__init__(parent)
        self.setWindowTitle("编辑角色" if character else "添加角色")
        self.resize(360, 280)
        self.setStyleSheet(LEFT_PANEL_QSS)

        self._character = character
        self._color = "#ffffff"
        self._build_ui()
        if character:
            self._load(character)

    def _build_ui(self):
        layout = QVBoxLayout(self)
        form = QFormLayout()
        form.setSpacing(8)

        self.id_edit = QLineEdit()
        self.id_edit.setPlaceholderText("留空则自动生成")
        form.addRow("角色 ID：", self.id_edit)

        self.name_edit = QLineEdit()
        self.name_edit.setPlaceholderText("显示名")
        form.addRow("显示名：", self.name_edit)

        self.color_btn = QPushButton("选择颜色")
        self.color_btn.clicked.connect(self._pick_color)
        form.addRow("颜色：", self.color_btn)

        self.voice_edit = QLineEdit()
        self.voice_edit.setPlaceholderText("语音文件前缀（可选）")
        form.addRow("语音前缀：", self.voice_edit)

        self.emotion_edit = QLineEdit()
        self.emotion_edit.setPlaceholderText("默认表情（可选）")
        form.addRow("默认表情：", self.emotion_edit)

        layout.addLayout(form)

        btns = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        btns.button(QDialogButtonBox.Ok).setText("确定")
        btns.button(QDialogButtonBox.Cancel).setText("取消")
        btns.accepted.connect(self.accept)
        btns.rejected.connect(self.reject)
        layout.addWidget(btns)

    def _pick_color(self):
        color = QColorDialog.getColor(QColor(self._color), self, "选择角色颜色")
        if color.isValid():
            self._color = color.name()
            self._update_color_btn()

    def _update_color_btn(self):
        self.color_btn.setText(f"选择颜色  ({self._color})")

    def _load(self, c: CharacterDef):
        self.id_edit.setText(c.id)
        self.id_edit.setEnabled(False)  # 编辑时不允许修改 ID
        self.name_edit.setText(c.display_name)
        self._color = c.color or "#ffffff"
        self.voice_edit.setText(c.voice_prefix)
        self.emotion_edit.setText(c.default_emotion)
        self._update_color_btn()

    def get_values(self) -> dict:
        cid = self.id_edit.text().strip() or str(uuid.uuid4())
        return {
            "id": cid,
            "display_name": self.name_edit.text().strip(),
            "color": self._color,
            "voice_prefix": self.voice_edit.text().strip(),
            "default_emotion": self.emotion_edit.text().strip(),
        }


# ============================================================
# 角色管理标签页
# ============================================================

class CharacterTab(QWidget):
    """角色管理标签页：添加 / 列表 / 双击编辑 / 右键删除"""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._build_ui()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(8, 8, 8, 8)
        layout.setSpacing(6)

        top = QHBoxLayout()
        self.add_btn = QPushButton("＋ 添加角色")
        self.add_btn.setObjectName("primaryButton")
        self.add_btn.setCursor(Qt.PointingHandCursor)
        self.add_btn.clicked.connect(self._on_add)
        top.addWidget(self.add_btn)
        top.addStretch(1)
        layout.addLayout(top)

        self.list_widget = QListWidget()
        self.list_widget.customContextMenuRequested.connect(self._on_context_menu)
        self.list_widget.itemDoubleClicked.connect(self._on_edit)
        layout.addWidget(self.list_widget, 1)

    def _on_add(self):
        dlg = CharacterEditDialog(parent=self)
        if dlg.exec() != QDialog.Accepted:
            return
        values = dlg.get_values()
        # 检查 ID 重复
        if any(c.id == values["id"] for c in project_store.data.characters):
            QMessageBox.warning(self, "提示", f"角色 ID「{values['id']}」已存在。")
            return
        char = CharacterDef(
            id=values["id"],
            display_name=values["display_name"],
            color=values["color"],
            voice_prefix=values["voice_prefix"],
            default_emotion=values["default_emotion"],
        )
        project_store.add_character(char)

    def _on_edit(self, item: QListWidgetItem):
        char_id = item.data(Qt.UserRole)
        char = next((c for c in project_store.data.characters if c.id == char_id), None)
        if not char:
            return
        dlg = CharacterEditDialog(character=char, parent=self)
        if dlg.exec() != QDialog.Accepted:
            return
        values = dlg.get_values()
        project_store.update_character(char.id, {
            "display_name": values["display_name"],
            "color": values["color"],
            "voice_prefix": values["voice_prefix"],
            "default_emotion": values["default_emotion"],
        })

    def _on_context_menu(self, pos):
        item = self.list_widget.itemAt(pos)
        if not item:
            return
        char_id = item.data(Qt.UserRole)
        menu = QMenu(self.list_widget)
        act_edit = menu.addAction("编辑角色")
        menu.addSeparator()
        act_del = menu.addAction("删除角色")
        action = menu.exec(self.list_widget.viewport().mapToGlobal(pos))
        if action == act_edit:
            self._on_edit(item)
        elif action == act_del:
            self._delete_character(char_id)

    def _delete_character(self, char_id: str):
        char = next((c for c in project_store.data.characters if c.id == char_id), None)
        if not char:
            return
        reply = QMessageBox.question(
            self, "删除角色",
            f"确定删除角色「{char.display_name or char.id}」吗？\n引用该角色的节点也会被移除。",
            QMessageBox.Yes | QMessageBox.No, QMessageBox.No,
        )
        if reply == QMessageBox.Yes:
            project_store.delete_character(char_id)

    def refresh(self):
        """从 project_store 更新角色列表"""
        self.list_widget.clear()
        for char in project_store.data.characters:
            self._add_char_item(char)

    def _add_char_item(self, char: CharacterDef):
        item = QListWidgetItem()
        item.setData(Qt.UserRole, char.id)

        widget = QWidget()
        widget.setStyleSheet("background: transparent;")
        h = QHBoxLayout(widget)
        h.setContentsMargins(6, 4, 6, 4)
        h.setSpacing(8)

        # 颜色色块
        block = _ColorBlockLabel(char.color or "#ffffff")
        h.addWidget(block)

        # 显示名 + ID
        col = QVBoxLayout()
        col.setSpacing(0)
        name_lbl = QLabel(char.display_name or "(未命名)")
        name_lbl.setStyleSheet(
            f"color: {TEXT_COLOR}; font-size: 12px; background: transparent;"
        )
        col.addWidget(name_lbl)
        id_lbl = QLabel(char.id)
        id_lbl.setStyleSheet(
            f"color: {SUBTEXT_COLOR}; font-size: 10px; background: transparent;"
        )
        col.addWidget(id_lbl)
        h.addLayout(col, 1)

        item.setSizeHint(QSize(100, 48))
        self.list_widget.addItem(item)
        self.list_widget.setItemWidget(item, widget)


# ============================================================
# 变量编辑对话框
# ============================================================

class VariableEditDialog(QDialog):
    """变量编辑 / 新建对话框"""

    def __init__(
        self,
        variable: VariableDef | None = None,
        existing_names: list[str] | None = None,
        parent=None,
    ):
        super().__init__(parent)
        self.setWindowTitle("编辑变量" if variable else "添加变量")
        self.resize(380, 280)
        self.setStyleSheet(LEFT_PANEL_QSS)

        self._variable = variable
        self._existing_names = set(existing_names or [])
        if variable:
            self._existing_names.discard(variable.name)  # 编辑自身时不算重复

        self._build_ui()
        if variable:
            self._load(variable)

    def _build_ui(self):
        layout = QVBoxLayout(self)
        form = QFormLayout()
        form.setSpacing(8)

        self.name_edit = QLineEdit()
        self.name_edit.setPlaceholderText("变量名（英文标识符）")
        form.addRow("名称：", self.name_edit)

        self.type_combo = QComboBox()
        for t in ["integer", "float", "string", "boolean"]:
            self.type_combo.addItem(VARIABLE_TYPE_LABELS[t], t)
        self.type_combo.currentIndexChanged.connect(self._on_type_changed)
        form.addRow("类型：", self.type_combo)

        self.value_edit = QLineEdit()
        self.value_edit.setPlaceholderText("0")
        form.addRow("初始值：", self.value_edit)

        self.desc_edit = QTextEdit()
        self.desc_edit.setPlaceholderText("描述（可选）")
        self.desc_edit.setMaximumHeight(60)
        form.addRow("描述：", self.desc_edit)

        layout.addLayout(form)

        btns = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        btns.button(QDialogButtonBox.Ok).setText("确定")
        btns.button(QDialogButtonBox.Cancel).setText("取消")
        btns.accepted.connect(self.accept)
        btns.rejected.connect(self.reject)
        layout.addWidget(btns)

    def _on_type_changed(self):
        hints = {
            "integer": "0",
            "float": "0.0",
            "string": "文本",
            "boolean": "true / false",
        }
        vtype = self.type_combo.currentData()
        self.value_edit.setPlaceholderText(hints.get(vtype, ""))

    def _load(self, v: VariableDef):
        self.name_edit.setText(v.name)
        self.name_edit.setEnabled(False)  # 编辑时不允许修改名称
        idx = self.type_combo.findData(v.type)
        if idx >= 0:
            self.type_combo.setCurrentIndex(idx)
        self.value_edit.setText(str(v.initial_value))
        self.desc_edit.setPlainText(v.description)

    def get_values(self) -> dict:
        vtype = self.type_combo.currentData()
        raw = self.value_edit.text().strip()
        try:
            if vtype == "integer":
                value: int | float | str | bool = int(raw) if raw else 0
            elif vtype == "float":
                value = float(raw) if raw else 0.0
            elif vtype == "boolean":
                value = raw.lower() in ("true", "1", "yes", "是")
            else:
                value = raw
        except (ValueError, TypeError):
            value = 0 if vtype == "integer" else (0.0 if vtype == "float" else raw)
        return {
            "name": self.name_edit.text().strip(),
            "type": vtype,
            "initial_value": value,
            "description": self.desc_edit.toPlainText().strip(),
        }

    def accept(self):
        name = self.name_edit.text().strip()
        if not name:
            QMessageBox.warning(self, "提示", "变量名不能为空。")
            return
        # 合法标识符校验
        if not name.replace("_", "").isalnum() or name[0].isdigit():
            QMessageBox.warning(
                self, "提示",
                "变量名需为合法标识符（字母 / 数字 / 下划线，且不以数字开头）。",
            )
            return
        if name in self._existing_names:
            QMessageBox.warning(self, "提示", f"变量「{name}」已存在。")
            return
        super().accept()


# ============================================================
# 变量管理标签页
# ============================================================

class VariableTab(QWidget):
    """变量管理标签页：添加 / 列表 / 双击编辑 / 右键删除"""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._build_ui()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(8, 8, 8, 8)
        layout.setSpacing(6)

        top = QHBoxLayout()
        self.add_btn = QPushButton("＋ 添加变量")
        self.add_btn.setObjectName("primaryButton")
        self.add_btn.setCursor(Qt.PointingHandCursor)
        self.add_btn.clicked.connect(self._on_add)
        top.addWidget(self.add_btn)
        top.addStretch(1)
        layout.addLayout(top)

        self.list_widget = QListWidget()
        self.list_widget.customContextMenuRequested.connect(self._on_context_menu)
        self.list_widget.itemDoubleClicked.connect(self._on_edit)
        layout.addWidget(self.list_widget, 1)

    def _on_add(self):
        existing = [v.name for v in project_store.data.variables]
        dlg = VariableEditDialog(existing_names=existing, parent=self)
        if dlg.exec() != QDialog.Accepted:
            return
        values = dlg.get_values()
        var = VariableDef(
            name=values["name"],
            type=values["type"],
            initial_value=values["initial_value"],
            description=values["description"],
        )
        project_store.add_variable(var)

    def _on_edit(self, item: QListWidgetItem):
        name = item.data(Qt.UserRole)
        var = next((v for v in project_store.data.variables if v.name == name), None)
        if not var:
            return
        existing = [v.name for v in project_store.data.variables]
        dlg = VariableEditDialog(variable=var, existing_names=existing, parent=self)
        if dlg.exec() != QDialog.Accepted:
            return
        values = dlg.get_values()
        project_store.update_variable(var.name, {
            "type": values["type"],
            "initial_value": values["initial_value"],
            "description": values["description"],
        })

    def _on_context_menu(self, pos):
        item = self.list_widget.itemAt(pos)
        if not item:
            return
        name = item.data(Qt.UserRole)
        menu = QMenu(self.list_widget)
        act_edit = menu.addAction("编辑变量")
        menu.addSeparator()
        act_del = menu.addAction("删除变量")
        action = menu.exec(self.list_widget.viewport().mapToGlobal(pos))
        if action == act_edit:
            self._on_edit(item)
        elif action == act_del:
            self._delete_variable(name)

    def _delete_variable(self, name: str):
        reply = QMessageBox.question(
            self, "删除变量",
            f"确定删除变量「{name}」吗？\n引用该变量的节点也会被移除。",
            QMessageBox.Yes | QMessageBox.No, QMessageBox.No,
        )
        if reply == QMessageBox.Yes:
            project_store.delete_variable(name)

    def refresh(self):
        """从 project_store 更新变量列表"""
        self.list_widget.clear()
        for var in project_store.data.variables:
            self._add_var_item(var)

    def _add_var_item(self, var: VariableDef):
        item = QListWidgetItem()
        item.setData(Qt.UserRole, var.name)

        widget = QWidget()
        widget.setStyleSheet("background: transparent;")
        h = QHBoxLayout(widget)
        h.setContentsMargins(6, 4, 6, 4)
        h.setSpacing(8)

        col = QVBoxLayout()
        col.setSpacing(0)
        name_lbl = QLabel(var.name)
        name_lbl.setStyleSheet(
            f"color: {TEXT_COLOR}; font-size: 12px; background: transparent;"
        )
        col.addWidget(name_lbl)
        vtype = VARIABLE_TYPE_LABELS.get(var.type, var.type)
        detail = QLabel(f"{vtype}  =  {var.initial_value}")
        detail.setStyleSheet(
            f"color: {SUBTEXT_COLOR}; font-size: 10px; background: transparent;"
        )
        col.addWidget(detail)
        h.addLayout(col, 1)

        if var.description:
            desc = QLabel(var.description)
            desc.setStyleSheet(
                f"color: {SUBTEXT_COLOR}; font-size: 10px; background: transparent;"
            )
            desc.setWordWrap(True)
            h.addWidget(desc, 1)

        item.setSizeHint(QSize(100, 48))
        self.list_widget.addItem(item)
        self.list_widget.setItemWidget(item, widget)


# ============================================================
# 左侧面板（QTabWidget）
# ============================================================

class LeftPanel(QTabWidget):
    """左侧面板：素材库 / 角色管理 / 变量管理 三标签页

    通过 ``refresh()`` 从 ``project_store`` 同步数据；由 ``EditorWidget``
    连接 store 信号后自动驱动刷新。
    """

    # 可选信号：选中素材时通知外部（拖拽到时间轴时不触发）
    asset_activated = Signal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setStyleSheet(LEFT_PANEL_QSS)
        self.setDocumentMode(True)

        self.asset_tab = AssetTab()
        self.char_tab = CharacterTab()
        self.var_tab = VariableTab()

        self.addTab(self.asset_tab, "素材库")
        self.addTab(self.char_tab, "角色管理")
        self.addTab(self.var_tab, "变量管理")

        self.refresh()

    def refresh(self):
        """从 project_store 刷新所有标签页"""
        self.asset_tab.refresh()
        self.char_tab.refresh()
        self.var_tab.refresh()
