"""
影游工坊 - 导出对话框
编译项目并导出为 ZIP 包（含 Ren'Py 脚本 + 素材文件）
对应 TypeScript 版本 src/components/Modals/ExportModal.tsx
"""
from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QFileDialog, QTextEdit, QProgressBar, QGroupBox,
    QDialogButtonBox, QMessageBox, QCheckBox,
)

from stores.project_store import project_store
from services.compiler import compiler
from services.linter import lint_project
from services import file_service


# ===== 主题配色 =====
DARK_BG = "#1e1e2e"
PANEL_BG = "#252535"
INPUT_BG = "#1a1a26"
ACCENT = "#3b82f6"
ACCENT_HOVER = "#2563eb"
SECONDARY = "#374151"
SECONDARY_HOVER = "#4b5563"
DANGER = "#ef4444"
SUCCESS = "#10b981"
TEXT_COLOR = "#e0e0e0"
SUBTEXT_COLOR = "#9ca3af"
DIVIDER_COLOR = "#2d2d3f"


EXPORT_QSS = f"""
QDialog {{
    background-color: {DARK_BG};
}}
QLabel {{
    color: {TEXT_COLOR};
    background: transparent;
    font-size: 12px;
}}
QLabel#summaryLabel {{
    font-size: 13px;
    font-weight: 600;
}}
QLabel#errorLabel {{
    color: {DANGER};
    font-size: 12px;
}}
QLabel#warnLabel {{
    color: #f59e0b;
    font-size: 12px;
}}
QLabel#successLabel {{
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
    padding: 8px 16px;
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
QPushButton#primaryButton:disabled {{
    background-color: #2a2a3a;
    color: #6b7280;
}}
QProgressBar {{
    background-color: {INPUT_BG};
    border: 1px solid {DIVIDER_COLOR};
    border-radius: 4px;
    text-align: center;
    color: {TEXT_COLOR};
    font-size: 11px;
    height: 20px;
}}
QProgressBar::chunk {{
    background-color: {ACCENT};
    border-radius: 3px;
}}
QCheckBox {{
    color: {TEXT_COLOR};
    spacing: 6px;
}}
"""


class ExportDialog(QDialog):
    """导出对话框

    流程：
    1. 显示 Lint 检查结果与编译结果摘要
    2. 用户选择导出路径
    3. 编译生成 Ren'Py 脚本并打包为 ZIP
    """

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("导出项目")
        self.resize(600, 560)
        self.setStyleSheet(EXPORT_QSS)

        self._lint_issues = []
        self._compile_result = None
        self._has_errors = False

        self._build_ui()
        self._run_checks()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(10)

        # 标题
        title = QLabel("导出项目为 Ren'Py 脚本包")
        title.setStyleSheet(f"font-size: 14px; font-weight: 600; color: {TEXT_COLOR};")
        layout.addWidget(title)

        # 进度条
        self.progress = QProgressBar()
        self.progress.setVisible(False)
        layout.addWidget(self.progress)

        # 检查结果摘要
        self.summary_label = QLabel("正在检查...")
        self.summary_label.setObjectName("summaryLabel")
        layout.addWidget(self.summary_label)

        # 问题详情
        issues_group = QGroupBox("检查详情")
        issues_layout = QVBoxLayout(issues_group)
        self.issues_view = QTextEdit()
        self.issues_view.setReadOnly(True)
        self.issues_view.setMaximumHeight(180)
        issues_layout.addWidget(self.issues_view)
        layout.addWidget(issues_group)

        # 脚本预览
        script_group = QGroupBox("生成的 script.rpy 预览")
        script_layout = QVBoxLayout(script_group)
        self.script_view = QTextEdit()
        self.script_view.setReadOnly(True)
        script_layout.addWidget(self.script_view)
        layout.addWidget(script_group, 1)

        # 底部按钮
        btn_row = QHBoxLayout()

        self.copy_btn = QPushButton("复制脚本")
        self.copy_btn.clicked.connect(self._on_copy_script)
        btn_row.addWidget(self.copy_btn)

        btn_row.addStretch(1)

        self.export_btn = QPushButton("📤 导出 ZIP")
        self.export_btn.setObjectName("primaryButton")
        self.export_btn.clicked.connect(self._on_export)
        btn_row.addWidget(self.export_btn)

        close_btn = QPushButton("关闭")
        close_btn.clicked.connect(self.reject)
        btn_row.addWidget(close_btn)

        layout.addLayout(btn_row)

    def _run_checks(self):
        """执行 Lint 检查和编译"""
        data = project_store.data

        # Lint
        try:
            self._lint_issues = lint_project(data)
        except Exception as e:
            self._lint_issues = []

        # 编译
        try:
            self._compile_result = compiler.compile_project(data)
        except Exception as e:
            self._compile_result = None
            self.summary_label.setText(f"编译失败：{e}")
            self.summary_label.setStyleSheet(f"color: {DANGER}; font-size: 13px; font-weight: 600;")
            self.export_btn.setEnabled(False)
            return

        # 统计
        lint_err = sum(1 for i in self._lint_issues if i.severity == "error")
        lint_warn = sum(1 for i in self._lint_issues if i.severity == "warning")
        cmp_err = sum(1 for i in self._compile_result.issues if i.severity == "error")
        cmp_warn = sum(1 for i in self._compile_result.issues if i.severity == "warning")
        total_err = lint_err + cmp_err
        total_warn = lint_warn + cmp_warn
        self._has_errors = total_err > 0

        # 摘要
        if self._has_errors:
            self.summary_label.setText(
                f"⚠ 发现 {total_err} 个错误 / {total_warn} 个警告 — 建议修复错误后再导出"
            )
            self.summary_label.setStyleSheet(
                f"color: {DANGER}; font-size: 13px; font-weight: 600;"
            )
        else:
            self.summary_label.setText(
                f"✓ 检查通过 — {total_warn} 个警告（可忽略）"
            )
            self.summary_label.setStyleSheet(
                f"color: {SUCCESS}; font-size: 13px; font-weight: 600;"
            )

        # 问题详情
        lines = []
        for i in self._lint_issues:
            icon = "✕" if i.severity == "error" else "⚠"
            lines.append(f"[Lint] {icon} [{i.severity}] {i.message}")
        for i in self._compile_result.issues:
            icon = "✕" if i.severity == "error" else "⚠"
            lines.append(f"[编译] {icon} [{i.severity}] {i.message}")
        self.issues_view.setPlainText("\n".join(lines) if lines else "（未发现问题）")

        # 脚本预览
        self.script_view.setPlainText(
            self._compile_result.script_rpy or "# （无脚本内容）"
        )

        # 有错误时仍允许导出（但标记警告）
        self.export_btn.setEnabled(True)
        if self._has_errors:
            self.export_btn.setText("⚠ 强制导出 ZIP")

    def _on_copy_script(self):
        """复制脚本到剪贴板"""
        if self._compile_result and self._compile_result.script_rpy:
            from PySide6.QtWidgets import QApplication
            clipboard = QApplication.clipboard()
            clipboard.setText(self._compile_result.script_rpy)
            self.copy_btn.setText("✓ 已复制")
        else:
            self.copy_btn.setText("无内容可复制")

    def _on_export(self):
        """导出为 ZIP"""
        if self._has_errors:
            reply = QMessageBox.warning(
                self, "确认导出",
                "项目存在错误，导出的脚本可能无法正常运行。\n确定要继续导出吗？",
                QMessageBox.Yes | QMessageBox.No, QMessageBox.No,
            )
            if reply != QMessageBox.Yes:
                return

        data = project_store.data
        default_name = f"{data.meta.name or '未命名项目'}.zip"
        path, _ = QFileDialog.getSaveFileName(
            self, "选择导出路径", default_name, "ZIP 压缩包 (*.zip)",
        )
        if not path:
            return

        # 进度提示
        self.progress.setVisible(True)
        self.progress.setRange(0, 0)  # 不确定进度
        self.export_btn.setEnabled(False)

        try:
            script_rpy = self._compile_result.script_rpy if self._compile_result else ""
            options_rpy = self._compile_result.options_rpy if self._compile_result else ""
            variables_rpy = self._compile_result.variables_rpy if self._compile_result else ""
            screens_rpy = self._compile_result.screens_rpy if self._compile_result else ""

            output = file_service.export_project_package(
                data,
                script_rpy=script_rpy,
                options_rpy=options_rpy,
                variables_rpy=variables_rpy,
                screens_rpy=screens_rpy,
                output_path=path,
            )

            self.progress.setVisible(False)
            self.export_btn.setEnabled(True)

            success_label = QLabel(f"✓ 导出成功！\n{output}")
            success_label.setObjectName("successLabel")
            QMessageBox.information(self, "导出成功", f"项目已导出到：\n{output}")

        except Exception as e:
            self.progress.setVisible(False)
            self.export_btn.setEnabled(True)
            QMessageBox.critical(self, "导出失败", f"导出项目时出错：\n{e}")
