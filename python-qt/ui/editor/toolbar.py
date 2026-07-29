"""
影游工坊 - 编辑器顶部工具栏
返回 / 预览 / 保存 / 导出 / 添加节点 / 撤销重做 / 问题面板 / 设置
对应 TypeScript 版本 src/components/Toolbar.tsx
"""
from __future__ import annotations

from PySide6.QtCore import Signal, Qt
from PySide6.QtWidgets import (
    QWidget, QHBoxLayout, QPushButton, QMenu, QToolButton,
    QDialog, QVBoxLayout, QTextEdit, QDialogButtonBox, QLabel,
    QFileDialog, QMessageBox,
)

from stores.project_store import project_store
from services.compiler import compiler
from services.linter import lint_project
from services import file_service
from models.types import NODE_TYPE_LABELS


# ===== 主题配色（与 launcher / main_window 保持一致）=====
DARK_BG = "#1e1e2e"
PANEL_BG = "#252535"
ACCENT = "#3b82f6"
ACCENT_HOVER = "#2563eb"
ACCENT_PRESSED = "#1d4ed8"
SECONDARY = "#374151"
SECONDARY_HOVER = "#4b5563"
TEXT_COLOR = "#e0e0e0"
SUBTEXT_COLOR = "#9ca3af"
DIVIDER_COLOR = "#2d2d3f"


TOOLBAR_QSS = f"""
QWidget#Toolbar {{
    background-color: {PANEL_BG};
    border-bottom: 1px solid {DIVIDER_COLOR};
}}
QPushButton, QToolButton {{
    background-color: {SECONDARY};
    color: {TEXT_COLOR};
    border: none;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 13px;
}}
QPushButton:hover, QToolButton:hover {{
    background-color: {SECONDARY_HOVER};
}}
QPushButton:pressed, QToolButton:pressed {{
    background-color: {DIVIDER_COLOR};
}}
QPushButton:disabled, QToolButton:disabled {{
    background-color: #2a2a3a;
    color: #6b7280;
}}
QPushButton#primaryButton {{
    background-color: {ACCENT};
    color: #ffffff;
    font-weight: 600;
}}
QPushButton#primaryButton:hover {{
    background-color: {ACCENT_HOVER};
}}
QPushButton#primaryButton:pressed {{
    background-color: {ACCENT_PRESSED};
}}
QPushButton#iconButton, QToolButton#iconButton {{
    background-color: transparent;
    padding: 6px 10px;
}}
QPushButton#iconButton:hover, QToolButton#iconButton:hover {{
    background-color: {SECONDARY_HOVER};
}}
QPushButton#iconButton:checked {{
    background-color: {ACCENT};
    color: #ffffff;
}}
QToolButton::menu-indicator {{
    subcontrol-origin: padding;
    subcontrol-position: right center;
    right: 4px;
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
QDialog {{
    background-color: {DARK_BG};
}}
QLabel {{
    color: {TEXT_COLOR};
    background: transparent;
}}
QTextEdit {{
    background-color: {DARK_BG};
    color: {TEXT_COLOR};
    border: 1px solid {DIVIDER_COLOR};
    border-radius: 6px;
    font-family: "Consolas", "Courier New", "Monospace";
    font-size: 12px;
    padding: 4px;
}}
"""


# 添加节点菜单顺序（与需求一致：背景/立绘/对话/音频/选项/视频/跳转/变量）
_ADD_NODE_ORDER = [
    "background",
    "sprite",
    "dialogue",
    "audio",
    "choice",
    "video",
    "jump_label",
    "variable_op",
]


class Toolbar(QWidget):
    """编辑器顶部工具栏

    通过 ``Signal`` 向外通知：
    - ``back_clicked``：请求返回启动器
    - ``node_added(scene_id, node_id)``：新节点已添加，请求选中新节点
    - ``problems_toggled(visible)``：切换问题面板显示
    - ``settings_requested``：请求打开设置对话框
    """

    # ===== 信号 =====
    back_clicked = Signal()           # 返回启动器
    node_added = Signal(str, str)     # (scene_id, node_id) 新节点已添加，请求选中
    problems_toggled = Signal(bool)   # 切换问题面板显示
    settings_requested = Signal()     # 打开设置对话框

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("Toolbar")
        self.setFixedHeight(48)
        self.setStyleSheet(TOOLBAR_QSS)

        self._problems_visible = False

        self._build_ui()
        self._connect_store()
        self._refresh_undo_redo()

    # ===== UI 构建 =====

    def _build_ui(self):
        layout = QHBoxLayout(self)
        layout.setContentsMargins(8, 0, 8, 0)
        layout.setSpacing(6)

        # 返回启动器
        self.back_btn = QPushButton("←")
        self.back_btn.setObjectName("iconButton")
        self.back_btn.setToolTip("返回启动器")
        self.back_btn.setFixedWidth(36)
        self.back_btn.setCursor(Qt.PointingHandCursor)
        self.back_btn.clicked.connect(self.back_clicked)
        layout.addWidget(self.back_btn)

        # 预览：Lint 检查 + 编译 + 弹出预览窗口
        self.preview_btn = QPushButton("▶ 预览")
        self.preview_btn.setObjectName("primaryButton")
        self.preview_btn.setCursor(Qt.PointingHandCursor)
        self.preview_btn.setToolTip("检查并编译项目，预览生成的 Ren'Py 脚本")
        self.preview_btn.clicked.connect(self._on_preview)
        layout.addWidget(self.preview_btn)

        # 保存
        self.save_btn = QPushButton("💾 保存")
        self.save_btn.setCursor(Qt.PointingHandCursor)
        self.save_btn.setToolTip("保存项目")
        self.save_btn.clicked.connect(self._on_save)
        layout.addWidget(self.save_btn)

        # 导出
        self.export_btn = QPushButton("📤 导出")
        self.export_btn.setCursor(Qt.PointingHandCursor)
        self.export_btn.setToolTip("导出项目包")
        self.export_btn.clicked.connect(self._on_export)
        layout.addWidget(self.export_btn)

        # 添加节点（下拉菜单）
        self.add_node_btn = QToolButton()
        self.add_node_btn.setText("＋ 添加节点")
        self.add_node_btn.setToolButtonStyle(Qt.ToolButtonTextOnly)
        self.add_node_btn.setPopupMode(QToolButton.InstantPopup)
        self.add_node_btn.setCursor(Qt.PointingHandCursor)
        self.add_node_btn.setToolTip("添加分镜节点")
        self.add_node_btn.setMenu(self._build_add_node_menu())
        layout.addWidget(self.add_node_btn)

        # 撤销
        self.undo_btn = QPushButton("↶ 撤销")
        self.undo_btn.setObjectName("iconButton")
        self.undo_btn.setCursor(Qt.PointingHandCursor)
        self.undo_btn.setToolTip("撤销 (Ctrl+Z)")
        self.undo_btn.clicked.connect(project_store.undo)
        layout.addWidget(self.undo_btn)

        # 重做
        self.redo_btn = QPushButton("↷ 重做")
        self.redo_btn.setObjectName("iconButton")
        self.redo_btn.setCursor(Qt.PointingHandCursor)
        self.redo_btn.setToolTip("重做 (Ctrl+Y)")
        self.redo_btn.clicked.connect(project_store.redo)
        layout.addWidget(self.redo_btn)

        # 弹性间距
        layout.addStretch(1)

        # 问题面板
        self.problems_btn = QPushButton("⚠")
        self.problems_btn.setObjectName("iconButton")
        self.problems_btn.setCheckable(True)
        self.problems_btn.setFixedWidth(36)
        self.problems_btn.setCursor(Qt.PointingHandCursor)
        self.problems_btn.setToolTip("显示/隐藏问题面板")
        self.problems_btn.clicked.connect(self._on_toggle_problems)
        layout.addWidget(self.problems_btn)

        # 设置
        self.settings_btn = QPushButton("⚙")
        self.settings_btn.setObjectName("iconButton")
        self.settings_btn.setFixedWidth(36)
        self.settings_btn.setCursor(Qt.PointingHandCursor)
        self.settings_btn.setToolTip("设置")
        self.settings_btn.clicked.connect(self.settings_requested)
        layout.addWidget(self.settings_btn)

    def _build_add_node_menu(self) -> QMenu:
        """构建添加节点下拉菜单"""
        menu = QMenu(self)
        for node_type in _ADD_NODE_ORDER:
            label = NODE_TYPE_LABELS.get(node_type, node_type)
            action = menu.addAction(label)
            action.triggered.connect(
                lambda checked=False, t=node_type: self._on_add_node(t)
            )
        return menu

    # ===== 信号连接 =====

    def _connect_store(self):
        project_store.undo_redo_changed.connect(self._refresh_undo_redo)
        project_store.data_changed.connect(self._refresh_undo_redo)

    def _refresh_undo_redo(self):
        """根据 store 状态刷新撤销/重做按钮可用性"""
        self.undo_btn.setEnabled(project_store.can_undo)
        self.redo_btn.setEnabled(project_store.can_redo)

    # ===== 操作处理 =====

    def _on_add_node(self, node_type: str):
        """添加节点并自动选中新节点"""
        scene = project_store.get_current_scene()
        if scene is None:
            QMessageBox.warning(self, "提示", "当前没有可用的场景，请先创建场景。")
            return
        node_id = project_store.add_node(scene.id, node_type)
        if node_id:
            # 添加节点后自动选中新节点（由 EditorWidget 接收并通知画布/时间轴/检查器）
            self.node_added.emit(scene.id, node_id)

    def _on_preview(self):
        """Lint 检查 + 编译项目，弹出预览窗口显示生成的脚本"""
        data = project_store.data

        # 1. Lint 检查
        try:
            lint_issues = lint_project(data)
        except Exception as e:  # noqa: BLE001
            lint_issues = []
            print(f"[Toolbar] Lint 检查失败: {e}")

        # 2. 编译项目
        try:
            compile_result = compiler.compile_project(data)
        except Exception as e:  # noqa: BLE001
            QMessageBox.critical(self, "编译失败", f"编译项目时出错：\n{e}")
            return

        # 3. 弹出预览窗口
        dlg = _PreviewDialog(lint_issues, compile_result, self)
        dlg.exec()

    def _on_save(self):
        """保存项目：调用 file_service.save_project"""
        try:
            file_service.save_project(project_store.data)
            project_store.mark_clean()
        except Exception as e:  # noqa: BLE001
            QMessageBox.critical(self, "保存失败", f"保存项目时出错：\n{e}")

    def _on_export(self):
        """导出项目包：打开导出对话框（含编译预览 + ZIP 导出）"""
        try:
            from ui.modals.export_dialog import ExportDialog
            dlg = ExportDialog(self)
            dlg.exec()
        except Exception as e:  # noqa: BLE001
            QMessageBox.critical(self, "导出失败", f"打开导出对话框时出错：\n{e}")

    def _on_toggle_problems(self):
        """切换问题面板显示"""
        self._problems_visible = self.problems_btn.isChecked()
        self.problems_toggled.emit(self._problems_visible)

    # ===== 公共接口 =====

    def set_problems_visible(self, visible: bool):
        """外部同步问题面板按钮的选中状态（不触发信号）"""
        self._problems_visible = visible
        self.problems_btn.blockSignals(True)
        self.problems_btn.setChecked(visible)
        self.problems_btn.blockSignals(False)


class _PreviewDialog(QDialog):
    """预览窗口：显示 Lint / 编译问题与生成的 Ren'Py 脚本"""

    def __init__(self, lint_issues, compile_result, parent=None):
        super().__init__(parent)
        self.setWindowTitle("预览 - Ren'Py 脚本")
        self.resize(780, 620)
        self.setStyleSheet(TOOLBAR_QSS)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 12, 12, 12)
        layout.setSpacing(8)

        # 问题摘要
        lint_err = sum(1 for i in lint_issues if i.severity == "error")
        lint_warn = sum(1 for i in lint_issues if i.severity == "warning")
        cmp_err = sum(1 for i in compile_result.issues if i.severity == "error")
        cmp_warn = sum(1 for i in compile_result.issues if i.severity == "warning")
        summary = QLabel(
            f"Lint 检查：{lint_err} 错误 / {lint_warn} 警告    "
            f"编译：{cmp_err} 错误 / {cmp_warn} 警告"
        )
        summary.setStyleSheet(f"color: {SUBTEXT_COLOR}; font-size: 12px;")
        layout.addWidget(summary)

        # 问题明细
        lines = []
        for i in lint_issues:
            lines.append(f"[Lint][{i.severity}] {i.message}")
        for i in compile_result.issues:
            lines.append(f"[编译][{i.severity}] {i.message}")
        issues_text = "\n".join(lines) if lines else "（未发现问题）"

        issues_view = QTextEdit()
        issues_view.setReadOnly(True)
        issues_view.setPlainText(issues_text)
        issues_view.setMaximumHeight(150)
        layout.addWidget(issues_view)

        # 脚本标题
        script_title = QLabel("生成的 script.rpy：")
        script_title.setStyleSheet(f"color: {SUBTEXT_COLOR}; font-size: 12px;")
        layout.addWidget(script_title)

        # 脚本内容
        script_view = QTextEdit()
        script_view.setReadOnly(True)
        script_view.setPlainText(compile_result.script_rpy or "# （无脚本内容）")
        layout.addWidget(script_view, 1)

        # 关闭按钮
        btns = QDialogButtonBox(QDialogButtonBox.Close)
        btns.button(QDialogButtonBox.Close).setText("关闭")
        btns.rejected.connect(self.reject)
        layout.addWidget(btns)
