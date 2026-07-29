"""
影游工坊 - 主窗口
菜单栏 / 快捷键 / 状态栏，中央部件为 EditorWidget
对应 TypeScript 版本 src/App.tsx（主框架部分）
"""
from __future__ import annotations

import sys

from PySide6.QtCore import Qt
from PySide6.QtGui import QAction, QKeySequence
from PySide6.QtWidgets import (
    QMainWindow, QWidget, QVBoxLayout, QLabel, QFileDialog,
    QMessageBox, QInputDialog, QDialog, QApplication,
)

from ui.launcher import Launcher
from stores.project_store import project_store
from services import file_service

# EditorWidget 在 ui/editor/editor_widget.py 中实现。
# 该模块可能尚未创建，故做受保护导入：缺失时回退到占位部件，保证窗口可运行。
try:
    from ui.editor.editor_widget import EditorWidget  # noqa: F401
    _HAS_EDITOR_WIDGET = True
except Exception:  # ImportError / 模块内部错误
    EditorWidget = None  # type: ignore[assignment]
    _HAS_EDITOR_WIDGET = False


# ===== 主题配色 =====
DARK_BG = "#1e1e2e"
PANEL_BG = "#252535"
ACCENT = "#3b82f6"
TEXT_COLOR = "#e0e0e0"
SUBTEXT_COLOR = "#9ca3af"
DIVIDER_COLOR = "#2d2d3f"


MAIN_QSS = f"""
QMainWindow, QWidget {{
    background-color: {DARK_BG};
    color: {TEXT_COLOR};
}}
QMenuBar {{
    background-color: {PANEL_BG};
    color: {TEXT_COLOR};
    border-bottom: 1px solid {DIVIDER_COLOR};
    padding: 2px;
    spacing: 2px;
}}
QMenuBar::item {{
    background: transparent;
    padding: 6px 12px;
    border-radius: 4px;
}}
QMenuBar::item:selected {{
    background-color: {ACCENT};
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
}}
QMenu::item:disabled {{
    color: #6b7280;
}}
QMenu::separator {{
    height: 1px;
    background: {DIVIDER_COLOR};
    margin: 4px 8px;
}}
QStatusBar {{
    background-color: {PANEL_BG};
    color: {SUBTEXT_COLOR};
    border-top: 1px solid {DIVIDER_COLOR};
}}
QStatusBar::item {{
    border: none;
}}
QStatusBar QLabel {{
    color: {SUBTEXT_COLOR};
}}
QLabel {{
    color: {TEXT_COLOR};
    background: transparent;
}}
QToolTip {{
    background-color: {PANEL_BG};
    color: {TEXT_COLOR};
    border: 1px solid {DIVIDER_COLOR};
    padding: 4px 8px;
}}
"""


class MainWindow(QMainWindow):
    """影游工坊主窗口"""

    def __init__(self):
        super().__init__()
        self.setWindowTitle("影游工坊")
        self.resize(1280, 800)
        self.setMinimumSize(960, 640)
        self.setStyleSheet(MAIN_QSS)

        self.editor: EditorWidget = None
        self._undo_action: QAction = None
        self._redo_action: QAction = None
        self._status_label: QLabel = None

        self._build_menu()
        self._build_statusbar()
        self._connect_store()
        self._refresh_status()
        self._refresh_undo_redo()

    # ===== 启动流程 =====

    def startup(self) -> bool:
        """启动流程：先显示启动器，用户选择/创建项目后进入编辑器。

        返回 True 表示成功进入编辑器；
        返回 False 表示用户取消（应退出应用）。
        """
        launcher = Launcher(self)
        if launcher.exec() != QDialog.Accepted:
            return False
        self._build_editor()
        self._refresh_status()
        self.show()
        return True

    # ===== 中央部件 =====

    def _build_editor(self):
        """创建编辑器中央部件。

        EditorWidget 在 ``ui/editor/editor_widget.py`` 中实现；
        若该模块尚未实现，则使用占位部件保证窗口仍可运行。
        """
        if EditorWidget is not None:
            try:
                self.editor = EditorWidget()
            except Exception as e:
                print(f"[MainWindow] EditorWidget 实例化失败，使用占位部件：{e}")
                self.editor = self._placeholder_editor()
        else:
            self.editor = self._placeholder_editor()
        self.setCentralWidget(self.editor)

    def _placeholder_editor(self) -> QWidget:
        """EditorWidget 缺失时的占位中央部件"""
        w = QWidget()
        layout = QVBoxLayout(w)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setAlignment(Qt.AlignCenter)
        tip = QLabel(
            f"当前项目：{project_store.data.meta.name or '未命名项目'}\n\n"
            "（编辑器组件 EditorWidget 尚未实现）"
        )
        tip.setAlignment(Qt.AlignCenter)
        tip.setStyleSheet(
            f"color: {SUBTEXT_COLOR}; font-size: 15px; background-color: {DARK_BG};"
        )
        layout.addWidget(tip)
        return w

    # ===== 菜单栏 =====

    def _build_menu(self):
        menubar = self.menuBar()

        # ---- 文件菜单 ----
        file_menu = menubar.addMenu("文件(&F)")

        new_action = QAction("新建项目(&N)", self)
        new_action.setShortcut(QKeySequence.New)
        new_action.triggered.connect(self._on_new_project)
        file_menu.addAction(new_action)

        open_action = QAction("打开项目(&O)", self)
        open_action.setShortcut(QKeySequence.Open)
        open_action.triggered.connect(self._on_open_project)
        file_menu.addAction(open_action)

        file_menu.addSeparator()

        save_action = QAction("保存项目(&S)", self)
        save_action.setShortcut(QKeySequence.Save)  # Ctrl+S
        save_action.triggered.connect(self._on_save_project)
        file_menu.addAction(save_action)

        export_action = QAction("导出项目包(&E)", self)
        export_action.triggered.connect(self._on_export_project)
        file_menu.addAction(export_action)

        file_menu.addSeparator()

        exit_action = QAction("退出(&Q)", self)
        exit_action.setShortcut(QKeySequence.Quit)
        exit_action.triggered.connect(self.close)
        file_menu.addAction(exit_action)

        # ---- 编辑菜单 ----
        edit_menu = menubar.addMenu("编辑(&E)")

        self._undo_action = QAction("撤销(&U)", self)
        self._undo_action.setShortcut(QKeySequence.Undo)  # Ctrl+Z
        self._undo_action.triggered.connect(self._on_undo)
        edit_menu.addAction(self._undo_action)

        self._redo_action = QAction("重做(&R)", self)
        self._redo_action.setShortcut(QKeySequence.Redo)  # Ctrl+Y（平台默认）
        self._redo_action.triggered.connect(self._on_redo)
        edit_menu.addAction(self._redo_action)

        # ---- 帮助菜单 ----
        help_menu = menubar.addMenu("帮助(&H)")
        about_action = QAction("关于(&A)", self)
        about_action.triggered.connect(self._on_about)
        help_menu.addAction(about_action)

    # ===== 状态栏 =====

    def _build_statusbar(self):
        self._status_label = QLabel("")
        self._status_label.setStyleSheet(f"color: {SUBTEXT_COLOR}; padding: 0 8px;")
        self.statusBar().addPermanentWidget(self._status_label)
        self.statusBar().setSizeGripEnabled(True)

    # ===== 信号连接 =====

    def _connect_store(self):
        project_store.dirty_changed.connect(self._refresh_status)
        project_store.data_changed.connect(self._refresh_status)
        project_store.meta_changed.connect(self._refresh_status)
        project_store.undo_redo_changed.connect(self._refresh_undo_redo)

    # ===== 状态刷新 =====

    def _refresh_status(self):
        name = project_store.data.meta.name or "未命名项目"
        state = "未保存" if project_store.is_dirty else "已保存"
        self._status_label.setText(f"  {name}  |  {state}  ")

    def _refresh_undo_redo(self):
        if self._undo_action is not None:
            self._undo_action.setEnabled(project_store.can_undo)
        if self._redo_action is not None:
            self._redo_action.setEnabled(project_store.can_redo)

    # ===== 文件操作 =====

    def _on_new_project(self):
        """菜单：新建项目"""
        name, ok = QInputDialog.getText(
            self, "新建项目", "请输入项目名称：", text="未命名项目",
        )
        if not ok:
            return
        name = name.strip()
        if not name:
            QMessageBox.warning(self, "提示", "项目名称不能为空。")
            return
        project_store.new_project(name)
        self.statusBar().showMessage("已新建项目", 3000)

    def _on_open_project(self):
        """菜单：打开项目（.yypkg.json 或 .zip）"""
        path, _ = QFileDialog.getOpenFileName(
            self, "打开项目", "",
            "项目文件 (*.yypkg.json *.zip);;"
            "YYPKG 项目 (*.yypkg.json);;"
            "ZIP 压缩包 (*.zip)",
        )
        if not path:
            return
        if path.lower().endswith(".zip"):
            data = file_service.import_project_package(path)
        else:
            data = file_service.load_project(path)
        if data is None:
            QMessageBox.critical(self, "加载失败", f"无法加载项目文件：\n{path}")
            return
        project_store.load_project(data)
        self.statusBar().showMessage("已加载项目", 3000)

    def _on_save_project(self):
        """菜单：保存项目（Ctrl+S）"""
        try:
            path = file_service.save_project(project_store.data)
            project_store.mark_clean()
            self.statusBar().showMessage(f"已保存到：{path}", 4000)
        except Exception as e:
            QMessageBox.critical(self, "保存失败", f"保存项目时出错：\n{e}")

    def _on_export_project(self):
        """菜单：导出项目为 ZIP 包（含 Ren'Py 脚本）"""
        data = project_store.data
        default_name = f"{data.meta.name or '未命名项目'}.zip"
        path, _ = QFileDialog.getSaveFileName(
            self, "导出项目包", default_name, "ZIP 压缩包 (*.zip)",
        )
        if not path:
            return
        try:
            # 编译生成 Ren'Py 脚本
            script_rpy = options_rpy = variables_rpy = screens_rpy = ""
            issues_text = ""
            try:
                from services.compiler import compiler
                result = compiler.compile_project(data)
                script_rpy = result.script_rpy
                options_rpy = result.options_rpy
                variables_rpy = result.variables_rpy
                screens_rpy = result.screens_rpy
                if result.issues:
                    issues_text = "\n\n编译提示：\n" + "\n".join(
                        f"  [{i.severity}] {i.message}" for i in result.issues
                    )
            except Exception as ce:
                issues_text = f"\n\n编译脚本失败（仅导出项目数据）：{ce}"

            output = file_service.export_project_package(
                data,
                script_rpy=script_rpy,
                options_rpy=options_rpy,
                variables_rpy=variables_rpy,
                screens_rpy=screens_rpy,
                output_path=path,
            )
            self.statusBar().showMessage(f"已导出到：{output}", 5000)
            QMessageBox.information(self, "导出成功", f"项目已导出到：\n{output}{issues_text}")
        except Exception as e:
            QMessageBox.critical(self, "导出失败", f"导出项目时出错：\n{e}")

    # ===== 撤销 / 重做 =====

    def _on_undo(self):
        """Ctrl+Z"""
        project_store.undo()

    def _on_redo(self):
        """Ctrl+Y"""
        project_store.redo()

    # ===== 帮助 =====

    def _on_about(self):
        QMessageBox.about(
            self,
            "关于 影游工坊",
            "<h3>影游工坊</h3>"
            "<p>零代码可视化视觉小说编辑器</p>"
            "<p>基于 PySide6 构建，可将项目编译导出为 Ren'Py 脚本包。</p>",
        )

    # ===== 窗口关闭 =====

    def closeEvent(self, event):
        """关闭前若有未保存修改，提示用户确认"""
        if project_store.is_dirty:
            reply = QMessageBox.question(
                self, "确认退出",
                "当前项目有未保存的修改，是否在退出前保存？",
                QMessageBox.Save | QMessageBox.Discard | QMessageBox.Cancel,
                QMessageBox.Save,
            )
            if reply == QMessageBox.Save:
                try:
                    file_service.save_project(project_store.data)
                    project_store.mark_clean()
                except Exception as e:
                    QMessageBox.critical(self, "保存失败", f"保存项目时出错：\n{e}")
                    event.ignore()
                    return
            elif reply == QMessageBox.Cancel:
                event.ignore()
                return
        super().closeEvent(event)


def main():
    """应用入口"""
    app = QApplication(sys.argv)
    app.setApplicationName("影游工坊")
    window = MainWindow()
    if not window.startup():
        # 用户在启动器取消，退出应用
        app.quit()
        return
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
