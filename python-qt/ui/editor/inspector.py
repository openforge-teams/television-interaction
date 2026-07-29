"""
影游工坊 - 属性检查器
可滚动面板，根据选中节点类型显示不同的属性编辑表单。
属性变更通过 project_store.update_node() 写回。
对应 TypeScript 版本 src/components/Inspector/Inspector.tsx
"""
from __future__ import annotations

import copy
import uuid
from typing import Optional

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QFormLayout, QLabel, QLineEdit, QComboBox,
    QSpinBox, QDoubleSpinBox, QCheckBox, QTextEdit, QPushButton,
    QScrollArea, QGroupBox, QHBoxLayout, QColorDialog,
)
from PySide6.QtCore import Qt, Signal, QTimer
from PySide6.QtGui import QColor

from stores.project_store import project_store
from models.types import NODE_TYPE_LABELS, VAR_OPS, TextStyle, ChoiceItem, VariableEffect


# ===== 主题配色（与 editor_widget / left_panel 保持一致）=====
DARK_BG = "#1e1e2e"
PANEL_BG = "#252535"
INPUT_BG = "#1a1a26"
ACCENT = "#3b82f6"
ACCENT_HOVER = "#2563eb"
SECONDARY = "#374151"
SECONDARY_HOVER = "#4b5563"
DANGER = "#ef4444"
DANGER_HOVER = "#dc2626"
TEXT_COLOR = "#e0e0e0"
SUBTEXT_COLOR = "#9ca3af"
DIVIDER_COLOR = "#2d2d3f"


# ===== 各类下拉选项的中文标签映射 =====
TRANSITION_LABELS = {
    "none": "无", "dissolve": "溶解", "fade": "淡入淡出",
    "pushright": "右推", "wipeleft": "左擦",
}
POSITION_LABELS = {
    "left": "左", "center": "中", "right": "右", "truecenter": "正中",
}
ENTER_LABELS = {
    "none": "无", "easein": "缓入", "easeout": "缓出",
    "moveinleft": "左移入", "moveinright": "右移入",
}
AUDIO_TYPE_LABELS = {"bgm": "背景音乐", "sfx": "音效", "voice": "语音"}
AUDIO_ACTION_LABELS = {
    "play": "播放", "stop": "停止", "pause": "暂停", "resume": "恢复",
}
VIDEO_PLAY_MODE_LABELS = {
    "play_and_pause": "播放并暂停", "play_and_wait": "播放并等待", "loop": "循环",
}
LAYOUT_LABELS = {"vertical": "垂直", "horizontal": "水平"}
JUMP_SUBTYPE_LABELS = {"label": "标签", "jump": "跳转"}
VAR_OP_LABELS = {
    "set": "赋值 (=)", "add": "加 (+)", "subtract": "减 (-)",
    "multiply": "乘 (*)", "divide": "除 (/)",
}
VAR_TYPE_LABELS = {
    "integer": "整数", "float": "浮点", "string": "字符串", "boolean": "布尔",
}


INSPECTOR_QSS = f"""
QWidget#Inspector {{
    background-color: {PANEL_BG};
}}
QLabel {{
    color: {TEXT_COLOR};
    background: transparent;
    font-size: 12px;
}}
QLabel#headerTitle {{
    color: {TEXT_COLOR};
    font-size: 13px;
    font-weight: 600;
}}
QLabel#headerType {{
    color: {SUBTEXT_COLOR};
    font-size: 12px;
}}
QLabel#emptyHint {{
    color: {SUBTEXT_COLOR};
    font-size: 13px;
}}
QLabel#infoLabel {{
    color: {SUBTEXT_COLOR};
    font-size: 12px;
}}
QGroupBox {{
    color: {TEXT_COLOR};
    background-color: {DARK_BG};
    border: 1px solid {DIVIDER_COLOR};
    border-radius: 6px;
    margin-top: 10px;
    padding-top: 6px;
    font-size: 12px;
}}
QGroupBox::title {{
    subcontrol-origin: margin;
    subcontrol-position: top left;
    left: 8px;
    padding: 0 4px;
    color: {SUBTEXT_COLOR};
}}
QLineEdit, QTextEdit {{
    background-color: {INPUT_BG};
    color: {TEXT_COLOR};
    border: 1px solid {DIVIDER_COLOR};
    border-radius: 4px;
    padding: 4px 6px;
    selection-background-color: {ACCENT};
}}
QLineEdit:focus, QTextEdit:focus {{
    border: 1px solid {ACCENT};
}}
QComboBox {{
    background-color: {INPUT_BG};
    color: {TEXT_COLOR};
    border: 1px solid {DIVIDER_COLOR};
    border-radius: 4px;
    padding: 3px 8px;
    min-height: 20px;
}}
QComboBox:hover {{
    border: 1px solid {SECONDARY_HOVER};
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
    outline: none;
}}
QSpinBox, QDoubleSpinBox {{
    background-color: {INPUT_BG};
    color: {TEXT_COLOR};
    border: 1px solid {DIVIDER_COLOR};
    border-radius: 4px;
    padding: 3px 6px;
}}
QSpinBox:focus, QDoubleSpinBox:focus {{
    border: 1px solid {ACCENT};
}}
QCheckBox {{
    color: {TEXT_COLOR};
    spacing: 6px;
}}
QPushButton {{
    background-color: {SECONDARY};
    color: {TEXT_COLOR};
    border: none;
    border-radius: 4px;
    padding: 5px 10px;
    font-size: 12px;
}}
QPushButton:hover {{
    background-color: {SECONDARY_HOVER};
}}
QPushButton#primaryButton {{
    background-color: {ACCENT};
    color: #ffffff;
    font-weight: 600;
}}
QPushButton#primaryButton:hover {{
    background-color: {ACCENT_HOVER};
}}
QPushButton#dangerButton {{
    background-color: transparent;
    color: {DANGER};
    border: 1px solid {DANGER};
}}
QPushButton#dangerButton:hover {{
    background-color: {DANGER};
    color: #ffffff;
}}
QScrollArea {{
    background-color: {PANEL_BG};
    border: none;
}}
"""


class _CommitTextEdit(QTextEdit):
    """多行文本框：在失去焦点或 Ctrl+Enter 时提交变更（避免每次按键都写回 store）"""

    committed = Signal()

    def focusOutEvent(self, event):
        super().focusOutEvent(event)
        self.committed.emit()

    def keyPressEvent(self, event):
        if event.key() in (Qt.Key.Key_Return, Qt.Key.Key_Enter) and (
            event.modifiers() & Qt.KeyboardModifier.ControlModifier
        ):
            self.committed.emit()
            return
        super().keyPressEvent(event)


class Inspector(QWidget):
    """属性检查器

    根据选中节点的类型显示对应的属性编辑表单，属性变更通过
    ``project_store.update_node()`` 写回。

    公共接口：
    - ``refresh()``：重新读取当前节点并刷新表单
    - ``set_node(scene_id, node_id)``：选中指定节点
    - ``select_node(scene_id, node_id)`` / ``select_node(node_id)``：选中节点（兼容两种签名）
    """

    # 选中节点时发出（scene_id, node_id）
    node_selected = Signal(str, str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("Inspector")
        self.setStyleSheet(INSPECTOR_QSS)

        self._scene_id: Optional[str] = None
        self._node_id: Optional[str] = None
        self._current_node = None
        self._current_type: Optional[str] = None
        self._building: bool = False

        self._builders = {
            "background": self._build_background,
            "sprite": self._build_sprite,
            "dialogue": self._build_dialogue,
            "video": self._build_video,
            "audio": self._build_audio,
            "choice": self._build_choice,
            "jump_label": self._build_jump_label,
            "variable_op": self._build_variable_op,
        }

        self._build_ui()
        self.refresh()

    # ============================================================
    # UI 构建
    # ============================================================

    def _build_ui(self):
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        # 顶部标题栏
        header = QWidget()
        header.setFixedHeight(36)
        header.setStyleSheet(
            f"background-color: {PANEL_BG}; border-bottom: 1px solid {DIVIDER_COLOR};"
        )
        h = QHBoxLayout(header)
        h.setContentsMargins(10, 0, 10, 0)
        title = QLabel("属性检查器")
        title.setObjectName("headerTitle")
        h.addWidget(title)
        h.addStretch(1)
        self.type_label = QLabel("—")
        self.type_label.setObjectName("headerType")
        h.addWidget(self.type_label)
        outer.addWidget(header)

        # 可滚动内容区
        self.scroll = QScrollArea()
        self.scroll.setWidgetResizable(True)
        self.scroll.setFrameShape(QScrollArea.Shape.NoFrame)
        self.scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)

        self._content = QWidget()
        self._content.setStyleSheet("background: transparent;")
        self._content_layout = QVBoxLayout(self._content)
        self._content_layout.setContentsMargins(8, 8, 8, 8)
        self._content_layout.setSpacing(8)

        self.scroll.setWidget(self._content)
        outer.addWidget(self.scroll, 1)

    # ============================================================
    # 公共接口
    # ============================================================

    def refresh(self):
        """重新读取当前节点并刷新表单

        - 若当前显示的节点对象未变（同一对象），则保持表单不动，避免打断输入；
        - 若节点对象变化（撤销/重做/加载/切换节点），则整体重建表单；
        - 若节点已被删除（找不到），则清空选中。
        """
        node = self._find_node()

        if node is None:
            # 节点不存在（被删除或未选中）-> 清空
            if self._current_node is not None:
                self._rebuild(None)
            return

        if (
            self._current_node is not None
            and node is self._current_node
            and node.type == self._current_type
        ):
            # 同一节点对象：保持表单，避免打断正在进行的输入
            return

        self._rebuild(node)

    def set_node(self, scene_id, node_id):
        """选中指定节点（node_id 为 None 时清空）"""
        if node_id is None:
            self._node_id = None
            self._scene_id = None
            self._rebuild(None)
            return
        if (
            scene_id == self._scene_id
            and node_id == self._node_id
            and self._current_node is not None
        ):
            return  # 已在显示该节点
        self._scene_id = scene_id
        self._node_id = node_id
        node = self._find_node()
        self._rebuild(node)
        if node is not None:
            self.node_selected.emit(scene_id, node_id)

    def select_node(self, *args):
        """选中节点，兼容 ``select_node(node_id)`` 与 ``select_node(scene_id, node_id)``"""
        if len(args) >= 2:
            self.set_node(args[0], args[1])
        elif len(args) == 1:
            if args[0] is None:
                self.set_node(None, None)
                return
            if args[0] == self._node_id and self._current_node is not None:
                return
            self._node_id = args[0]
            self._rebuild(self._find_node())
        # 无参数：忽略

    # ============================================================
    # 表单重建
    # ============================================================

    def _rebuild(self, node):
        self._building = True
        try:
            self._clear_content()
            self._current_node = node
            if node is None:
                self._current_type = None
                self.type_label.setText("—")
                self._show_empty()
                return
            self._current_type = node.type
            self.type_label.setText(NODE_TYPE_LABELS.get(node.type, node.type))
            builder = self._builders.get(node.type)
            if builder:
                builder(node)
            else:
                self._add_info(
                    f"暂不支持编辑「{NODE_TYPE_LABELS.get(node.type, node.type)}」类型节点"
                )
            self._content_layout.addStretch(1)
        finally:
            self._building = False

    def _rebuild_later(self):
        """延迟重建：避免在控件信号处理过程中删除控件本身"""
        QTimer.singleShot(0, self._rebuild_current)

    def _rebuild_current(self):
        self._rebuild(self._find_node())

    def _clear_content(self):
        while self._content_layout.count():
            item = self._content_layout.takeAt(0)
            w = item.widget()
            if w is not None:
                w.setParent(None)
                w.deleteLater()

    def _show_empty(self):
        lbl = QLabel("未选中任何节点")
        lbl.setObjectName("emptyHint")
        lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
        wrap = QWidget()
        wrap.setStyleSheet("background: transparent;")
        v = QVBoxLayout(wrap)
        v.setContentsMargins(0, 40, 0, 0)
        v.setAlignment(Qt.AlignmentFlag.AlignTop)
        v.addWidget(lbl, 0, Qt.AlignmentFlag.AlignHCenter)
        self._content_layout.addWidget(wrap, 1)

    def _add_info(self, text: str):
        lbl = QLabel(text)
        lbl.setObjectName("infoLabel")
        lbl.setWordWrap(True)
        self._content_layout.addWidget(lbl)

    def _add_widget(self, w):
        self._content_layout.addWidget(w)

    def _find_node(self):
        if not self._node_id:
            return None
        candidates = []
        if self._scene_id:
            s = project_store.data.scenes.get(self._scene_id)
            if s:
                candidates.append(s)
        cur = project_store.get_current_scene()
        if cur and (not candidates or cur.id != self._scene_id):
            candidates.append(cur)
        for s in candidates:
            n = next((x for x in s.nodes if x.id == self._node_id), None)
            if n:
                self._scene_id = s.id
                return n
        return None

    def _update(self, partial: dict):
        """写回节点属性"""
        if self._building:
            return
        if not self._scene_id or not self._node_id:
            return
        project_store.update_node(self._scene_id, self._node_id, partial)

    # ============================================================
    # 通用字段控件
    # ============================================================

    def _group(self, title: str):
        box = QGroupBox(title)
        form = QFormLayout(box)
        form.setSpacing(6)
        form.setContentsMargins(10, 12, 10, 10)
        return box, form

    def _field_text(self, form, label, node, field, placeholder=""):
        edit = QLineEdit()
        edit.setPlaceholderText(placeholder)
        edit.setText(str(getattr(node, field, "") or ""))

        def on_edit():
            if self._building:
                return
            self._update({field: edit.text()})

        edit.editingFinished.connect(on_edit)
        form.addRow(label, edit)
        return edit

    def _field_combo(self, form, label, node, field, options):
        """options: list[(显示文本, data)]"""
        combo = QComboBox()
        for lbl, data in options:
            combo.addItem(lbl, data)
        val = getattr(node, field, None)
        idx = combo.findData(val)
        if idx < 0 and val is not None:
            idx = combo.findData(str(val))
        if idx < 0:
            idx = 0
        combo.setCurrentIndex(idx)

        def on_changed(_i):
            if self._building:
                return
            self._update({field: combo.currentData()})

        combo.currentIndexChanged.connect(on_changed)
        form.addRow(label, combo)
        return combo

    def _field_asset(self, form, label, node, field, asset_types):
        combo = QComboBox()
        combo.addItem("（未选择）", "")
        for a in project_store.data.assets:
            if a.type in asset_types:
                combo.addItem(a.file_name, a.id)
        val = getattr(node, field, "") or ""
        idx = combo.findData(val)
        combo.setCurrentIndex(max(idx, 0))

        def on_changed(_i):
            if self._building:
                return
            self._update({field: combo.currentData()})

        combo.currentIndexChanged.connect(on_changed)
        form.addRow(label, combo)
        return combo

    def _field_spin(self, form, label, node, field, minimum=0, maximum=100,
                    step=1, suffix=""):
        spin = QSpinBox()
        spin.setRange(minimum, maximum)
        spin.setSingleStep(step)
        if suffix:
            spin.setSuffix(suffix)
        try:
            spin.setValue(int(getattr(node, field, 0) or 0))
        except (TypeError, ValueError):
            spin.setValue(0)

        def on_finished():
            if self._building:
                return
            self._update({field: spin.value()})

        spin.editingFinished.connect(on_finished)
        form.addRow(label, spin)
        return spin

    def _field_double(self, form, label, node, field, minimum=0.0, maximum=10.0,
                      step=0.1, decimals=2, suffix=""):
        spin = QDoubleSpinBox()
        spin.setRange(minimum, maximum)
        spin.setSingleStep(step)
        spin.setDecimals(decimals)
        if suffix:
            spin.setSuffix(suffix)
        try:
            spin.setValue(float(getattr(node, field, 0.0) or 0.0))
        except (TypeError, ValueError):
            spin.setValue(0.0)

        def on_finished():
            if self._building:
                return
            self._update({field: spin.value()})

        spin.editingFinished.connect(on_finished)
        form.addRow(label, spin)
        return spin

    def _field_check(self, form, label, node, field):
        chk = QCheckBox()
        chk.setChecked(bool(getattr(node, field, False)))

        def on_changed(_state):
            if self._building:
                return
            self._update({field: chk.isChecked()})

        chk.stateChanged.connect(on_changed)
        form.addRow(label, chk)
        return chk

    def _field_textedit(self, form, label, node, field):
        edit = _CommitTextEdit()
        edit.setPlainText(str(getattr(node, field, "") or ""))
        edit.setMinimumHeight(80)
        edit.setMaximumHeight(160)

        def on_commit():
            if self._building:
                return
            self._update({field: edit.toPlainText()})

        edit.committed.connect(on_commit)
        form.addRow(label, edit)
        return edit

    # -- 对话文本样式（嵌套 text_style） --

    def _update_text_style(self, node, **kwargs):
        ts = node.text_style
        new_ts = TextStyle(
            font_size=kwargs.get("font_size", ts.font_size),
            font_color=kwargs.get("font_color", ts.font_color),
            alignment=ts.alignment,
        )
        self._update({"text_style": new_ts})

    def _field_text_style_spin(self, form, label, node, key, mn, mx):
        spin = QSpinBox()
        spin.setRange(mn, mx)
        ts = node.text_style
        try:
            spin.setValue(int(getattr(ts, key, 22) or 22))
        except (TypeError, ValueError):
            spin.setValue(22)

        def on_finished():
            if self._building:
                return
            self._update_text_style(node, **{key: spin.value()})

        spin.editingFinished.connect(on_finished)
        form.addRow(label, spin)
        return spin

    def _field_text_style_color(self, form, label, node, key):
        btn = QPushButton()
        color = getattr(node.text_style, key, "#ffffff") or "#ffffff"
        self._style_color_btn(btn, color)

        def on_click():
            cur = getattr(node.text_style, key, "#ffffff") or "#ffffff"
            c = QColorDialog.getColor(QColor(cur), self, "选择颜色")
            if c.isValid():
                self._update_text_style(node, **{key: c.name()})
                self._style_color_btn(btn, c.name())

        btn.clicked.connect(on_click)
        form.addRow(label, btn)
        return btn

    def _style_color_btn(self, btn: QPushButton, color: str):
        btn.setText(color)
        btn.setStyleSheet(
            f"QPushButton {{ background-color: {color}; color: {self._contrast(color)};"
            f" border: 1px solid {DIVIDER_COLOR}; border-radius: 4px; padding: 4px 10px; }}"
        )

    @staticmethod
    def _contrast(hexcolor: str) -> str:
        try:
            c = hexcolor.lstrip("#")
            if len(c) == 3:
                c = "".join(ch * 2 for ch in c)
            r, g, b = int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            return "#000000" if lum > 140 else "#ffffff"
        except Exception:
            return "#ffffff"

    # ============================================================
    # 各节点类型表单
    # ============================================================

    def _build_background(self, node):
        box, form = self._group("背景节点")
        self._field_asset(form, "素材：", node, "asset_id", ["background"])
        self._field_combo(
            form, "过渡类型：", node, "transition",
            [(TRANSITION_LABELS[k], k) for k in
             ["none", "dissolve", "fade", "pushright", "wipeleft"]],
        )
        self._field_double(form, "过渡时长：", node, "transition_duration",
                           0.0, 10.0, 0.1, 2, " 秒")
        self._add_widget(box)

    def _build_sprite(self, node):
        box, form = self._group("立绘节点")
        char_opts = [("（无）", "")]
        for c in project_store.data.characters:
            char_opts.append((c.display_name or c.id, c.id))
        self._field_combo(form, "角色：", node, "character_id", char_opts)
        self._field_text(form, "表情：", node, "emotion", "表情标识")
        self._field_combo(
            form, "屏幕位置：", node, "screen_position",
            [(POSITION_LABELS[k], k) for k in
             ["left", "center", "right", "truecenter"]],
        )
        self._field_combo(
            form, "入场效果：", node, "enter_effect",
            [(ENTER_LABELS[k], k) for k in
             ["none", "easein", "easeout", "moveinleft", "moveinright"]],
        )
        self._field_spin(form, "层级：", node, "zorder", -100, 100, 1)
        self._field_check(form, "可见：", node, "visible")
        self._add_widget(box)

    def _build_dialogue(self, node):
        box, form = self._group("对话节点")

        # 说话者：旁白(None) + 角色
        speaker = QComboBox()
        speaker.addItem("旁白", "")
        for c in project_store.data.characters:
            speaker.addItem(c.display_name or c.id, c.id)
        idx = speaker.findData(node.speaker_id or "")
        speaker.setCurrentIndex(max(idx, 0))

        def on_speaker(_i):
            if self._building:
                return
            val = speaker.currentData()
            self._update({"speaker_id": val if val else None})

        speaker.currentIndexChanged.connect(on_speaker)
        form.addRow("说话者：", speaker)

        self._field_textedit(form, "对话文本：", node, "text")
        self._field_text_style_spin(form, "字号：", node, "font_size", 8, 72)
        self._field_text_style_color(form, "颜色：", node, "font_color")
        self._field_check(form, "自动推进：", node, "auto_advance")
        self._field_double(form, "延迟时间：", node, "auto_advance_delay",
                           0.0, 60.0, 0.5, 1, " 秒")
        self._add_widget(box)

    def _build_video(self, node):
        box, form = self._group("视频节点")
        self._field_asset(form, "素材：", node, "asset_id", ["video"])
        self._field_combo(
            form, "播放模式：", node, "play_mode",
            [(VIDEO_PLAY_MODE_LABELS[k], k) for k in
             ["play_and_pause", "play_and_wait", "loop"]],
        )
        self._field_spin(form, "音量：", node, "volume", 0, 100, 1, " %")
        self._add_widget(box)

    def _build_audio(self, node):
        box, form = self._group("音频节点")
        self._field_asset(form, "素材：", node, "asset_id", ["bgm", "sfx", "voice"])
        self._field_combo(
            form, "音频类型：", node, "audio_type",
            [(AUDIO_TYPE_LABELS[k], k) for k in ["bgm", "sfx", "voice"]],
        )
        self._field_combo(
            form, "动作：", node, "action",
            [(AUDIO_ACTION_LABELS[k], k) for k in
             ["play", "stop", "pause", "resume"]],
        )
        self._field_check(form, "循环：", node, "loop")
        self._field_spin(form, "音量：", node, "volume", 0, 100, 1, " %")
        self._field_double(form, "淡入：", node, "fade_in", 0.0, 30.0, 0.1, 2, " 秒")
        self._field_double(form, "淡出：", node, "fade_out", 0.0, 30.0, 0.1, 2, " 秒")
        self._add_widget(box)

    # -- 选项节点 --

    def _build_choice(self, node):
        box, form = self._group("选项节点")
        self._field_combo(
            form, "布局：", node, "layout",
            [(LAYOUT_LABELS[k], k) for k in ["vertical", "horizontal"]],
        )
        self._add_widget(box)

        choices_box = QGroupBox("选项列表")
        cl = QVBoxLayout(choices_box)
        cl.setSpacing(8)
        cl.setContentsMargins(10, 12, 10, 10)

        for i, choice in enumerate(node.choices):
            cl.addWidget(self._build_choice_item(node, choice, i))

        add_btn = QPushButton("＋ 添加选项")
        add_btn.setObjectName("primaryButton")
        add_btn.clicked.connect(lambda: self._add_choice(node))
        cl.addWidget(add_btn)
        self._add_widget(choices_box)

    def _build_choice_item(self, node, choice, index: int) -> QGroupBox:
        item = QGroupBox(f"选项 {index + 1}")
        form = QFormLayout(item)
        form.setSpacing(6)
        form.setContentsMargins(8, 10, 8, 8)

        # 选项文本
        text_edit = QLineEdit(choice.text or "")
        text_edit.setPlaceholderText("选项文本")

        def on_text():
            if self._building:
                return
            self._update_choice(node, choice.id, "text", text_edit.text())

        text_edit.editingFinished.connect(on_text)
        form.addRow("文本：", text_edit)

        # 跳转目标场景
        scene_combo = QComboBox()
        scene_combo.addItem("（继续当前场景）", "")
        for sid in project_store.data.meta.scene_order:
            s = project_store.data.scenes.get(sid)
            if s:
                scene_combo.addItem(s.name or sid, sid)
        idx = scene_combo.findData(choice.target_scene_id or "")
        scene_combo.setCurrentIndex(max(idx, 0))

        def on_scene(_i):
            if self._building:
                return
            self._update_choice(node, choice.id, "target_scene_id",
                                scene_combo.currentData())

        scene_combo.currentIndexChanged.connect(on_scene)
        form.addRow("跳转目标：", scene_combo)

        # 条件表达式
        cond_edit = QLineEdit(choice.condition or "")
        cond_edit.setPlaceholderText("条件表达式（可选）")

        def on_cond():
            if self._building:
                return
            self._update_choice(node, choice.id, "condition", cond_edit.text())

        cond_edit.editingFinished.connect(on_cond)
        form.addRow("条件：", cond_edit)

        # 变量效果列表
        form.addRow(QLabel("变量效果："))
        for ei, effect in enumerate(choice.variable_effects):
            form.addRow(self._build_effect_row(node, choice.id, ei, effect))

        add_eff = QPushButton("＋ 添加变量效果")
        add_eff.clicked.connect(lambda: self._add_effect(node, choice.id))
        form.addRow(add_eff)

        # 删除选项
        del_btn = QPushButton("删除此选项")
        del_btn.setObjectName("dangerButton")
        del_btn.clicked.connect(lambda: self._remove_choice(node, choice.id))
        form.addRow(del_btn)
        return item

    def _build_effect_row(self, node, choice_id: str, effect_index: int,
                          effect) -> QWidget:
        row = QWidget()
        row.setStyleSheet("background: transparent;")
        h = QHBoxLayout(row)
        h.setContentsMargins(0, 0, 0, 0)
        h.setSpacing(4)

        var_combo = QComboBox()
        var_combo.addItem("（无）", "")
        for v in project_store.data.variables:
            var_combo.addItem(v.name, v.name)
        var_combo.setCurrentIndex(max(var_combo.findData(effect.variable_name or ""), 0))

        def on_var(_i):
            if self._building:
                return
            self._update_effect(node, choice_id, effect_index,
                                "variable_name", var_combo.currentData())

        var_combo.currentIndexChanged.connect(on_var)

        op_combo = QComboBox()
        for op in VAR_OPS:
            op_combo.addItem(VAR_OP_LABELS.get(op, op), op)
        op_combo.setCurrentIndex(max(op_combo.findData(effect.operation or "set"), 0))

        def on_op(_i):
            if self._building:
                return
            self._update_effect(node, choice_id, effect_index,
                                "operation", op_combo.currentData())

        op_combo.currentIndexChanged.connect(on_op)

        val_edit = QLineEdit(str(effect.value if effect.value is not None else ""))
        val_edit.setPlaceholderText("值")

        def on_val():
            if self._building:
                return
            self._update_effect(node, choice_id, effect_index, "value", val_edit.text())

        val_edit.editingFinished.connect(on_val)

        rm_btn = QPushButton("✕")
        rm_btn.setFixedWidth(28)
        rm_btn.clicked.connect(
            lambda: self._remove_effect(node, choice_id, effect_index)
        )

        h.addWidget(var_combo, 2)
        h.addWidget(op_combo, 1)
        h.addWidget(val_edit, 2)
        h.addWidget(rm_btn)
        return row

    # -- 选项 / 变量效果的增删改（深拷贝后整体替换 choices） --

    def _update_choice(self, node, choice_id: str, field: str, value):
        new_choices = copy.deepcopy(node.choices)
        for c in new_choices:
            if c.id == choice_id:
                setattr(c, field, value)
                break
        self._update({"choices": new_choices})

    def _add_choice(self, node):
        new_choices = copy.deepcopy(node.choices)
        new_choices.append(
            ChoiceItem(id=str(uuid.uuid4()), text=f"选项 {len(new_choices) + 1}")
        )
        self._update({"choices": new_choices})
        self._rebuild_later()

    def _remove_choice(self, node, choice_id: str):
        new_choices = [copy.deepcopy(c) for c in node.choices if c.id != choice_id]
        self._update({"choices": new_choices})
        self._rebuild_later()

    def _update_effect(self, node, choice_id: str, effect_index: int,
                       field: str, value):
        new_choices = copy.deepcopy(node.choices)
        for c in new_choices:
            if c.id == choice_id:
                if 0 <= effect_index < len(c.variable_effects):
                    setattr(c.variable_effects[effect_index], field, value)
                break
        self._update({"choices": new_choices})

    def _add_effect(self, node, choice_id: str):
        new_choices = copy.deepcopy(node.choices)
        for c in new_choices:
            if c.id == choice_id:
                c.variable_effects.append(VariableEffect())
                break
        self._update({"choices": new_choices})
        self._rebuild_later()

    def _remove_effect(self, node, choice_id: str, effect_index: int):
        new_choices = copy.deepcopy(node.choices)
        for c in new_choices:
            if c.id == choice_id:
                c.variable_effects = [
                    e for i, e in enumerate(c.variable_effects) if i != effect_index
                ]
                break
        self._update({"choices": new_choices})
        self._rebuild_later()

    # -- 跳转 / 标签节点 --

    def _build_jump_label(self, node):
        box, form = self._group("跳转 / 标签节点")

        sub_combo = QComboBox()
        for k in ["label", "jump"]:
            sub_combo.addItem(JUMP_SUBTYPE_LABELS[k], k)
        sub_combo.setCurrentIndex(max(sub_combo.findData(node.sub_type or "label"), 0))

        def on_sub(_i):
            if self._building:
                return
            self._update({"sub_type": sub_combo.currentData()})
            self._rebuild_later()

        sub_combo.currentIndexChanged.connect(on_sub)
        form.addRow("子类型：", sub_combo)

        if node.sub_type == "jump":
            target_combo = QComboBox()
            target_combo.setEditable(True)
            for lbl in self._collect_labels():
                target_combo.addItem(lbl, lbl)
            cur = node.target_label or ""
            if cur and self._combo_find_text(target_combo, cur) < 0:
                target_combo.insertItem(0, cur, cur)
            target_combo.setCurrentIndex(max(self._combo_find_text(target_combo, cur), 0))
            target_combo.setCurrentText(cur)

            def on_target(_idx):
                if self._building:
                    return
                self._update({"target_label": target_combo.currentText().strip()})

            target_combo.activated.connect(on_target)
            le = target_combo.lineEdit()
            if le is not None:
                le.editingFinished.connect(on_target)
            form.addRow("目标标签：", target_combo)
        else:
            name_edit = QLineEdit(node.label_name or "")
            name_edit.setPlaceholderText("标签名（英文标识符）")

            def on_name():
                if self._building:
                    return
                self._update({"label_name": name_edit.text().strip()})

            name_edit.editingFinished.connect(on_name)
            form.addRow("标签名：", name_edit)

        self._add_widget(box)

    def _collect_labels(self) -> list[str]:
        labels: list[str] = []
        for scene in project_store.data.scenes.values():
            for n in scene.nodes:
                if n.type == "jump_label" and n.sub_type == "label" and n.label_name:
                    if n.label_name not in labels:
                        labels.append(n.label_name)
        return labels

    @staticmethod
    def _combo_find_text(combo: QComboBox, text: str) -> int:
        for i in range(combo.count()):
            if combo.itemText(i) == text:
                return i
        return -1

    # -- 变量操作节点 --

    def _build_variable_op(self, node):
        box, form = self._group("变量操作节点")

        var_combo = QComboBox()
        var_combo.addItem("（未选择）", "")
        for v in project_store.data.variables:
            var_combo.addItem(
                f"{v.name}（{VAR_TYPE_LABELS.get(v.type, v.type)}）", v.name
            )
        var_combo.setCurrentIndex(max(var_combo.findData(node.variable_name or ""), 0))

        def on_var(_i):
            if self._building:
                return
            self._update({"variable_name": var_combo.currentData()})
            self._rebuild_later()

        var_combo.currentIndexChanged.connect(on_var)
        form.addRow("变量：", var_combo)

        self._field_combo(
            form, "操作符：", node, "operation",
            [(VAR_OP_LABELS.get(op, op), op) for op in VAR_OPS],
        )

        self._build_var_value_field(form, node)
        self._add_widget(box)

    def _var_type(self, node) -> str:
        name = getattr(node, "variable_name", "")
        v = next((x for x in project_store.data.variables if x.name == name), None)
        return v.type if v else "string"

    def _build_var_value_field(self, form, node):
        vtype = self._var_type(node)
        val = node.value

        if vtype == "integer":
            spin = QSpinBox()
            spin.setRange(-999999, 999999)
            try:
                spin.setValue(int(val))
            except (TypeError, ValueError):
                spin.setValue(0)

            def on_finished():
                if self._building:
                    return
                self._update({"value": spin.value()})

            spin.editingFinished.connect(on_finished)
            form.addRow("值：", spin)

        elif vtype == "float":
            spin = QDoubleSpinBox()
            spin.setRange(-999999.0, 999999.0)
            spin.setDecimals(3)
            try:
                spin.setValue(float(val))
            except (TypeError, ValueError):
                spin.setValue(0.0)

            def on_finished():
                if self._building:
                    return
                self._update({"value": spin.value()})

            spin.editingFinished.connect(on_finished)
            form.addRow("值：", spin)

        elif vtype == "boolean":
            chk = QCheckBox()
            chk.setChecked(bool(val))

            def on_st(_s):
                if self._building:
                    return
                self._update({"value": chk.isChecked()})

            chk.stateChanged.connect(on_st)
            form.addRow("值：", chk)

        else:  # string 或未知
            edit = QLineEdit(str(val if val is not None else ""))

            def on_finished():
                if self._building:
                    return
                self._update({"value": edit.text()})

            edit.editingFinished.connect(on_finished)
            form.addRow("值：", edit)
