"""
影游工坊 - 启动器对话框
新建 / 导入 / 打开最近项目
对应 TypeScript 版本 src/components/Launcher.tsx
"""
from __future__ import annotations

from datetime import datetime

from PySide6.QtCore import Qt, QSize
from PySide6.QtWidgets import (
    QDialog, QVBoxLayout, QHBoxLayout, QLabel, QPushButton,
    QListWidget, QListWidgetItem, QInputDialog, QFileDialog,
    QMessageBox, QFrame, QSizePolicy,
)

from stores.project_store import project_store
from services import file_service


# ===== 主题配色 =====
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


LAUNCHER_QSS = f"""
QDialog {{
    background-color: {DARK_BG};
}}
QLabel {{
    color: {TEXT_COLOR};
    background: transparent;
}}
#titleLabel {{
    font-size: 30px;
    font-weight: 700;
    color: #ffffff;
    padding: 4px 0 0 0;
}}
#subtitleLabel {{
    font-size: 13px;
    color: {SUBTEXT_COLOR};
}}
QPushButton {{
    background-color: {ACCENT};
    color: #ffffff;
    border: none;
    border-radius: 6px;
    padding: 11px 16px;
    font-size: 14px;
    font-weight: 600;
}}
QPushButton:hover {{
    background-color: {ACCENT_HOVER};
}}
QPushButton:pressed {{
    background-color: {ACCENT_PRESSED};
}}
QPushButton#secondaryButton {{
    background-color: {SECONDARY};
}}
QPushButton#secondaryButton:hover {{
    background-color: {SECONDARY_HOVER};
}}
QPushButton:disabled {{
    background-color: #2a2a3a;
    color: #6b7280;
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
    padding: 10px 12px;
    border-radius: 4px;
    margin: 2px 0;
}}
QListWidget::item:hover {{
    background-color: #2f2f44;
}}
QListWidget::item:selected {{
    background-color: {ACCENT};
    color: #ffffff;
}}
QFrame#divider {{
    background-color: {DIVIDER_COLOR};
    max-height: 1px;
    min-height: 1px;
    border: none;
}}
QInputDialog QDialog, QFileDialog QDialog, QMessageBox QDialog {{
    background-color: {DARK_BG};
}}
"""


def _format_time(iso_str: str) -> str:
    """将 ISO 8601 时间字符串格式化为可读的本地时间"""
    if not iso_str:
        return "未知时间"
    try:
        dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
        return dt.astimezone().strftime("%Y-%m-%d %H:%M")
    except Exception:
        return iso_str


class Launcher(QDialog):
    """启动器对话框：新建 / 导入 / 打开最近项目

    成功创建或加载项目后调用 ``self.accept()`` 关闭对话框；
    若用户取消（关闭窗口 / 拒绝），则返回 ``Rejected``，由调用方决定退出。
    """

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("影游工坊 - 启动器")
        self.setFixedSize(480, 560)
        self.setStyleSheet(LAUNCHER_QSS)

        self._build_ui()
        self._refresh_recent()

    # ===== UI 构建 =====

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(32, 28, 32, 24)
        layout.setSpacing(14)

        # 标题区
        title = QLabel("影游工坊")
        title.setObjectName("titleLabel")
        title.setAlignment(Qt.AlignCenter)
        layout.addWidget(title)

        subtitle = QLabel("零代码可视化视觉小说编辑器")
        subtitle.setObjectName("subtitleLabel")
        subtitle.setAlignment(Qt.AlignCenter)
        layout.addWidget(subtitle)

        # 分割线
        divider = QFrame()
        divider.setObjectName("divider")
        divider.setFrameShape(QFrame.NoFrame)
        layout.addWidget(divider)

        # 操作按钮
        btn_row = QHBoxLayout()
        btn_row.setSpacing(10)

        self.new_btn = QPushButton("新建项目")
        self.new_btn.setCursor(Qt.PointingHandCursor)
        self.new_btn.clicked.connect(self._on_new_project)
        btn_row.addWidget(self.new_btn)

        self.import_btn = QPushButton("导入项目")
        self.import_btn.setObjectName("secondaryButton")
        self.import_btn.setCursor(Qt.PointingHandCursor)
        self.import_btn.clicked.connect(self._on_import_project)
        btn_row.addWidget(self.import_btn)

        layout.addLayout(btn_row)

        # 最近项目
        recent_label = QLabel("最近项目")
        recent_label.setStyleSheet(
            f"color: {SUBTEXT_COLOR}; font-size: 12px; padding-top: 4px;"
        )
        layout.addWidget(recent_label)

        self.recent_list = QListWidget()
        self.recent_list.setCursor(Qt.PointingHandCursor)
        # itemActivated 兼容双击与回车，避免单击误触
        self.recent_list.itemActivated.connect(self._on_recent_activated)
        size_policy = self.recent_list.sizePolicy()
        size_policy.setVerticalPolicy(QSizePolicy.Expanding)
        self.recent_list.setSizePolicy(size_policy)
        layout.addWidget(self.recent_list, 1)

    def _refresh_recent(self):
        """刷新最近项目列表"""
        self.recent_list.clear()
        projects = file_service.get_recent_projects()
        if not projects:
            empty = QListWidgetItem("暂无最近项目")
            empty.setFlags(Qt.NoItemFlags)
            self.recent_list.addItem(empty)
            return

        for p in projects:
            name = p.get("name", "未命名项目")
            modified = _format_time(p.get("last_modified", ""))
            text = f"{name}\n修改时间：{modified}"
            item = QListWidgetItem(text)
            item.setData(Qt.UserRole, p.get("path", ""))
            self.recent_list.addItem(item)

    # ===== 操作处理 =====

    def _on_new_project(self):
        """新建项目：弹出输入框，调用 project_store.new_project"""
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
        self.accept()

    def _on_import_project(self):
        """导入项目：选择 .yypkg.json 或 .zip 文件后加载"""
        path, _ = QFileDialog.getOpenFileName(
            self, "导入项目", "",
            "项目文件 (*.yypkg.json *.zip);;"
            "YYPKG 项目 (*.yypkg.json);;"
            "ZIP 压缩包 (*.zip)",
        )
        if not path:
            return
        self._load_from_path(path, allow_zip_import=True)

    def _on_recent_activated(self, item: QListWidgetItem):
        """双击/回车打开最近项目"""
        path = item.data(Qt.UserRole)
        if not path:
            return
        self._load_from_path(path, allow_zip_import=False)

    def _load_from_path(self, path: str, allow_zip_import: bool):
        """根据路径加载项目并写入 store

        - ``allow_zip_import=True`` 且为 .zip 时调用 ``import_project_package``
        - 其余情况（.yypkg.json / 最近项目）调用 ``load_project``
        """
        data = None
        if allow_zip_import and path.lower().endswith(".zip"):
            data = file_service.import_project_package(path)
        else:
            data = file_service.load_project(path)

        if data is None:
            QMessageBox.critical(self, "加载失败", f"无法加载项目文件：\n{path}")
            return

        # 将数据写入全局 store，供主窗口读取
        project_store.load_project(data)
        self.accept()
