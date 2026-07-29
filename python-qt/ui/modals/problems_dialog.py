"""
影游工坊 - 问题面板对话框
显示 Lint 检查和编译过程中的所有问题（错误/警告）
对应 TypeScript 版本 src/components/Modals/ProblemsPanel.tsx
"""
from __future__ import annotations

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QTextEdit, QGroupBox, QTableWidget, QTableWidgetItem,
    QHeaderView, QSplitter,
)

from stores.project_store import project_store
from services.compiler import compiler
from services.linter import lint_project


# ===== 主题配色 =====
DARK_BG = "#1e1e2e"
PANEL_BG = "#252535"
INPUT_BG = "#1a1a26"
ACCENT = "#3b82f6"
ACCENT_HOVER = "#2563eb"
SECONDARY = "#374151"
SECONDARY_HOVER = "#4b5563"
DANGER = "#ef4444"
WARN = "#f59e0b"
SUCCESS = "#10b981"
TEXT_COLOR = "#e0e0e0"
SUBTEXT_COLOR = "#9ca3af"
DIVIDER_COLOR = "#2d2d3f"


PROBLEMS_QSS = f"""
QDialog {{
    background-color: {DARK_BG};
}}
QLabel {{
    color: {TEXT_COLOR};
    background: transparent;
    font-size: 12px;
}}
QLabel#titleLabel {{
    font-size: 14px;
    font-weight: 600;
}}
QLabel#errorCount {{
    color: {DANGER};
    font-size: 12px;
    font-weight: 600;
}}
QLabel#warnCount {{
    color: {WARN};
    font-size: 12px;
    font-weight: 600;
}}
QLabel#okLabel {{
    color: {SUCCESS};
    font-size: 13px;
    font-weight: 600;
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
QTableWidget {{
    background-color: {INPUT_BG};
    color: {TEXT_COLOR};
    border: 1px solid {DIVIDER_COLOR};
    border-radius: 4px;
    gridline-color: {DIVIDER_COLOR};
    outline: none;
}}
QTableWidget::item {{
    padding: 4px 8px;
}}
QTableWidget::item:selected {{
    background-color: {ACCENT};
    color: #ffffff;
}}
QHeaderView::section {{
    background-color: {PANEL_BG};
    color: {SUBTEXT_COLOR};
    border: none;
    border-bottom: 1px solid {DIVIDER_COLOR};
    padding: 6px 8px;
    font-size: 11px;
    font-weight: 600;
}}
QTextEdit {{
    background-color: {INPUT_BG};
    color: {TEXT_COLOR};
    border: 1px solid {DIVIDER_COLOR};
    border-radius: 4px;
    font-family: "Consolas", "Courier New", "Monospace";
    font-size: 11px;
    padding: 4px;
}}
QPushButton {{
    background-color: {SECONDARY};
    color: {TEXT_COLOR};
    border: none;
    border-radius: 4px;
    padding: 6px 14px;
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


class ProblemsDialog(QDialog):
    """问题面板对话框

    显示 Lint 检查与编译过程中发现的所有问题。
    支持刷新重新检查、点击问题项查看详情。
    """

    # 选中问题时发出（scene_id, node_id），可由编辑器接收并跳转到对应节点
    problem_activated = Signal(str, str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("问题面板")
        self.resize(680, 500)
        self.setStyleSheet(PROBLEMS_QSS)

        self._lint_issues = []
        self._compile_issues = []

        self._build_ui()
        self._run_checks()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(14, 14, 14, 14)
        layout.setSpacing(10)

        # 标题栏
        header = QHBoxLayout()
        title = QLabel("问题检查")
        title.setObjectName("titleLabel")
        header.addWidget(title)
        header.addStretch(1)

        self.refresh_btn = QPushButton("🔄 刷新")
        self.refresh_btn.setObjectName("primaryButton")
        self.refresh_btn.clicked.connect(self._run_checks)
        header.addWidget(self.refresh_btn)

        close_btn = QPushButton("关闭")
        close_btn.clicked.connect(self.reject)
        header.addWidget(close_btn)

        layout.addLayout(header)

        # 摘要
        self.summary_label = QLabel("正在检查...")
        layout.addWidget(self.summary_label)

        # 问题表格
        table_group = QGroupBox("问题列表")
        table_layout = QVBoxLayout(table_group)

        self.table = QTableWidget()
        self.table.setColumnCount(4)
        self.table.setHorizontalHeaderLabels(["来源", "级别", "消息", "位置"])
        self.table.horizontalHeader().setSectionResizeMode(0, QHeaderView.Fixed)
        self.table.horizontalHeader().setSectionResizeMode(1, QHeaderView.Fixed)
        self.table.horizontalHeader().setSectionResizeMode(2, QHeaderView.Stretch)
        self.table.horizontalHeader().setSectionResizeMode(3, QHeaderView.Fixed)
        self.table.setColumnWidth(0, 60)
        self.table.setColumnWidth(1, 60)
        self.table.setColumnWidth(3, 140)
        self.table.setSelectionBehavior(QTableWidget.SelectRows)
        self.table.setSelectionMode(QTableWidget.SingleSelection)
        self.table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.table.cellDoubleClicked.connect(self._on_cell_double_clicked)
        table_layout.addWidget(self.table)

        layout.addWidget(table_group, 1)

    def _run_checks(self):
        """执行 Lint 和编译检查"""
        data = project_store.data

        # Lint
        try:
            self._lint_issues = lint_project(data)
        except Exception:
            self._lint_issues = []

        # 编译
        self._compile_issues = []
        try:
            result = compiler.compile_project(data)
            self._compile_issues = result.issues
        except Exception:
            pass

        # 统计
        total_err = sum(1 for i in self._lint_issues if i.severity == "error") + \
                    sum(1 for i in self._compile_issues if i.severity == "error")
        total_warn = sum(1 for i in self._lint_issues if i.severity == "warning") + \
                     sum(1 for i in self._compile_issues if i.severity == "warning")

        # 摘要
        if total_err == 0 and total_warn == 0:
            self.summary_label.setText("✓ 未发现任何问题")
            self.summary_label.setObjectName("okLabel")
        else:
            parts = []
            if total_err > 0:
                parts.append(f"{total_err} 个错误")
            if total_warn > 0:
                parts.append(f"{total_warn} 个警告")
            self.summary_label.setText("发现 " + " / ".join(parts))
            if total_err > 0:
                self.summary_label.setObjectName("errorCount")
            else:
                self.summary_label.setObjectName("warnCount")

        # 刷新样式
        self.summary_label.setStyleSheet("")  # 触发 QSS 重应用
        if total_err > 0:
            self.summary_label.setStyleSheet(f"color: {DANGER}; font-size: 13px; font-weight: 600;")
        elif total_warn > 0:
            self.summary_label.setStyleSheet(f"color: {WARN}; font-size: 13px; font-weight: 600;")
        else:
            self.summary_label.setStyleSheet(f"color: {SUCCESS}; font-size: 13px; font-weight: 600;")

        # 填充表格
        self._populate_table()

    def _populate_table(self):
        """填充问题表格"""
        all_issues = []

        for issue in self._lint_issues:
            location = ""
            if issue.scene_id:
                scene = project_store.data.scenes.get(issue.scene_id)
                scene_name = scene.name if scene else issue.scene_id[:8]
                location = f"场景: {scene_name}"
                if issue.node_id:
                    location += f" / 节点: {issue.node_id[:8]}"
            elif issue.field:
                location = f"字段: {issue.field}"
            all_issues.append(("Lint", issue, location))

        for issue in self._compile_issues:
            location = ""
            if issue.scene_id:
                scene = project_store.data.scenes.get(issue.scene_id)
                scene_name = scene.name if scene else issue.scene_id[:8]
                location = f"场景: {scene_name}"
                if issue.node_id:
                    location += f" / 节点: {issue.node_id[:8]}"
            all_issues.append(("编译", issue, location))

        self.table.setRowCount(len(all_issues))

        for row, (source, issue, location) in enumerate(all_issues):
            # 来源
            src_item = QTableWidgetItem(source)
            src_item.setTextAlignment(Qt.AlignCenter)
            self.table.setItem(row, 0, src_item)

            # 级别
            level_text = "错误" if issue.severity == "error" else "警告"
            level_item = QTableWidgetItem(level_text)
            level_item.setTextAlignment(Qt.AlignCenter)
            if issue.severity == "error":
                level_item.setForeground(Qt.red)
            else:
                level_item.setForeground(Qt.darkYellow)
            self.table.setItem(row, 1, level_item)

            # 消息
            msg_item = QTableWidgetItem(issue.message)
            self.table.setItem(row, 2, msg_item)

            # 位置
            loc_item = QTableWidgetItem(location)
            self.table.setItem(row, 3, loc_item)

    def _on_cell_double_clicked(self, row: int, _col: int):
        """双击问题项：通知编辑器跳转到对应节点"""
        if row < 0 or row >= len(self._lint_issues) + len(self._compile_issues):
            return

        all_issues = list(self._lint_issues) + list(self._compile_issues)
        issue = all_issues[row]
        if issue.scene_id and issue.node_id:
            self.problem_activated.emit(issue.scene_id, issue.node_id)
