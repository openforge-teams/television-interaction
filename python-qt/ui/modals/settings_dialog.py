"""
影游工坊 - 项目设置对话框
编辑项目元数据：名称、作者、分辨率、字体、主题色、Ren'Py 版本
对应 TypeScript 版本 src/components/Modals/SettingsModal.tsx
"""
from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QFormLayout, QLineEdit, QComboBox,
    QPushButton, QDialogButtonBox, QColorDialog, QLabel,
    QSpinBox, QGroupBox,
)

from stores.project_store import project_store
from models.types import RESOLUTION_PRESETS, FONT_PRESETS


# ===== 主题配色 =====
DARK_BG = "#1e1e2e"
PANEL_BG = "#252535"
INPUT_BG = "#1a1a26"
ACCENT = "#3b82f6"
ACCENT_HOVER = "#2563eb"
SECONDARY = "#374151"
SECONDARY_HOVER = "#4b5563"
TEXT_COLOR = "#e0e0e0"
SUBTEXT_COLOR = "#9ca3af"
DIVIDER_COLOR = "#2d2d3f"


SETTINGS_QSS = f"""
QDialog {{
    background-color: {DARK_BG};
}}
QLabel {{
    color: {TEXT_COLOR};
    background: transparent;
    font-size: 12px;
}}
QGroupBox {{
    color: {TEXT_COLOR};
    background-color: {PANEL_BG};
    border: 1px solid {DIVIDER_COLOR};
    border-radius: 6px;
    margin-top: 10px;
    padding-top: 8px;
    font-size: 12px;
}}
QGroupBox::title {{
    subcontrol-origin: margin;
    subcontrol-position: top left;
    left: 8px;
    padding: 0 4px;
    color: {SUBTEXT_COLOR};
}}
QLineEdit, QComboBox {{
    background-color: {INPUT_BG};
    color: {TEXT_COLOR};
    border: 1px solid {DIVIDER_COLOR};
    border-radius: 4px;
    padding: 5px 8px;
    font-size: 12px;
}}
QLineEdit:focus, QComboBox:focus {{
    border: 1px solid {ACCENT};
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
QSpinBox {{
    background-color: {INPUT_BG};
    color: {TEXT_COLOR};
    border: 1px solid {DIVIDER_COLOR};
    border-radius: 4px;
    padding: 4px 6px;
}}
QSpinBox:focus {{
    border: 1px solid {ACCENT};
}}
QPushButton {{
    background-color: {SECONDARY};
    color: {TEXT_COLOR};
    border: none;
    border-radius: 4px;
    padding: 6px 12px;
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
"""


class SettingsDialog(QDialog):
    """项目设置对话框

    编辑项目元数据并写回 ``project_store``。
    修改分辨率/字体/主题色等会触发电机数据刷新信号。
    """

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("项目设置")
        self.resize(440, 520)
        self.setStyleSheet(SETTINGS_QSS)

        self._theme_color = project_store.data.meta.theme_color or "#3366CC"

        self._build_ui()
        self._load_values()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(10)

        # ---- 基本信息 ----
        info_group = QGroupBox("基本信息")
        info_form = QFormLayout(info_group)
        info_form.setSpacing(8)

        self.name_edit = QLineEdit()
        self.name_edit.setPlaceholderText("项目名称")
        info_form.addRow("项目名称：", self.name_edit)

        self.author_edit = QLineEdit()
        self.author_edit.setPlaceholderText("作者")
        info_form.addRow("作者：", self.author_edit)

        self.renpy_combo = QComboBox()
        self.renpy_combo.addItems(["8.2.3", "8.1.0", "8.0.0", "7.7.0"])
        info_form.addRow("Ren'Py 版本：", self.renpy_combo)

        layout.addWidget(info_group)

        # ---- 显示设置 ----
        display_group = QGroupBox("显示设置")
        display_form = QFormLayout(display_group)
        display_form.setSpacing(8)

        # 分辨率预设
        self.resolution_combo = QComboBox()
        for preset in RESOLUTION_PRESETS:
            label = preset["label"]
            self.resolution_combo.addItem(label, preset)
        self.resolution_combo.addItem("自定义", None)
        self.resolution_combo.currentIndexChanged.connect(self._on_resolution_preset_changed)
        display_form.addRow("分辨率预设：", self.resolution_combo)

        # 自定义分辨率
        res_row_layout = QVBoxLayout()
        res_row_layout.setSpacing(4)

        self.width_spin = QSpinBox()
        self.width_spin.setRange(320, 3840)
        self.width_spin.setSuffix(" px")

        self.height_spin = QSpinBox()
        self.height_spin.setRange(240, 2160)
        self.height_spin.setSuffix(" px")

        res_row = QHBoxLayout()
        res_row.setSpacing(8)
        res_row.addWidget(QLabel("宽："))
        res_row.addWidget(self.width_spin)
        res_row.addWidget(QLabel("高："))
        res_row.addWidget(self.height_spin)
        display_form.addRow("分辨率：", res_row)

        # 默认字体
        self.font_combo = QComboBox()
        self.font_combo.setEditable(True)
        self.font_combo.addItems(FONT_PRESETS)
        display_form.addRow("默认字体：", self.font_combo)

        # 主题色
        self.color_btn = QPushButton("选择颜色")
        self.color_btn.clicked.connect(self._pick_color)
        display_form.addRow("主题色：", self.color_btn)

        layout.addWidget(display_group)

        # ---- 按钮 ----
        btns = QDialogButtonBox(
            QDialogButtonBox.Ok | QDialogButtonBox.Cancel
        )
        btns.button(QDialogButtonBox.Ok).setText("保存")
        btns.button(QDialogButtonBox.Ok).setObjectName("primaryButton")
        btns.button(QDialogButtonBox.Cancel).setText("取消")
        btns.accepted.connect(self._on_save)
        btns.rejected.connect(self.reject)
        layout.addWidget(btns)

    def _load_values(self):
        meta = project_store.data.meta
        self.name_edit.setText(meta.name)
        self.author_edit.setText(meta.author)

        # Ren'Py 版本
        idx = self.renpy_combo.findText(meta.renpy_version)
        if idx >= 0:
            self.renpy_combo.setCurrentIndex(idx)

        # 分辨率
        w, h = meta.resolution.width, meta.resolution.height
        self.width_spin.setValue(w)
        self.height_spin.setValue(h)
        matched = False
        for i in range(self.resolution_combo.count() - 1):
            preset = self.resolution_combo.itemData(i)
            if preset and preset["width"] == w and preset["height"] == h:
                self.resolution_combo.setCurrentIndex(i)
                matched = True
                break
        if not matched:
            self.resolution_combo.setCurrentIndex(self.resolution_combo.count() - 1)

        # 字体
        idx = self.font_combo.findText(meta.default_font)
        if idx >= 0:
            self.font_combo.setCurrentIndex(idx)
        else:
            self.font_combo.setEditText(meta.default_font)

        self._update_color_btn()

    def _on_resolution_preset_changed(self):
        """选择预设分辨率时自动填入宽高"""
        data = self.resolution_combo.currentData()
        if data:
            self.width_spin.setValue(data["width"])
            self.height_spin.setValue(data["height"])

    def _pick_color(self):
        color = QColorDialog.getColor(
            QColor(self._theme_color), self, "选择主题色"
        )
        if color.isValid():
            self._theme_color = color.name()
            self._update_color_btn()

    def _update_color_btn(self):
        c = self._theme_color
        # 计算文字对比色
        try:
            clean = c.lstrip("#")
            if len(clean) == 3:
                clean = "".join(ch * 2 for ch in clean)
            r, g, b = int(clean[0:2], 16), int(clean[2:4], 16), int(clean[4:6], 16)
            lum = 0.299 * r + 0.587 * g + 0.114 * b
            fg = "#000000" if lum > 140 else "#ffffff"
        except Exception:
            fg = "#ffffff"

        self.color_btn.setText(f"  {c}  ")
        self.color_btn.setStyleSheet(
            f"QPushButton {{"
            f" background-color: {c};"
            f" color: {fg};"
            f" border: 1px solid {DIVIDER_COLOR};"
            f" border-radius: 4px;"
            f" padding: 6px 12px;"
            f" font-size: 12px;"
            f"}}"
        )

    def _on_save(self):
        """保存设置到 project_store"""
        name = self.name_edit.text().strip()
        if not name:
            from PySide6.QtWidgets import QMessageBox
            QMessageBox.warning(self, "提示", "项目名称不能为空。")
            return

        partial = {
            "name": name,
            "author": self.author_edit.text().strip(),
            "renpy_version": self.renpy_combo.currentText(),
            "resolution": {
                "width": self.width_spin.value(),
                "height": self.height_spin.value(),
            },
            "default_font": self.font_combo.currentText().strip(),
            "theme_color": self._theme_color,
        }
        project_store.update_meta(partial)
        self.accept()
