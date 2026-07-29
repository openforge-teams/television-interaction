"""
影游工坊 - 场景导航器
水平排列的场景标签页，支持切换 / 新增 / 重命名 / 删除 / 拖拽排序
对应 TypeScript 版本 src/components/Timeline/SceneNavigator.tsx
"""
from __future__ import annotations

from typing import Optional

from PySide6.QtWidgets import (
    QWidget, QHBoxLayout, QPushButton, QMenu, QInputDialog, QMessageBox,
    QLabel,
)
from PySide6.QtCore import Qt, Signal, QMimeData, QPoint
from PySide6.QtGui import QDrag, QPixmap, QColor

from stores.project_store import project_store


# ===== 主题配色（与 editor_widget / toolbar 保持一致）=====
PANEL_BG = "#252535"
ACCENT = "#3b82f6"
ACCENT_HOVER = "#2563eb"
SECONDARY = "#374151"
SECONDARY_HOVER = "#4b5563"
TEXT_COLOR = "#e0e0e0"
SUBTEXT_COLOR = "#9ca3af"
DIVIDER_COLOR = "#2d2d3f"

# 拖拽场景的 MIME 类型（内部用于排序）
SCENE_MIME_TYPE = "application/x-yingyou-scene-id"


NAV_QSS = f"""
QWidget#SceneNavigator {{
    background-color: {PANEL_BG};
    border-top: 1px solid {DIVIDER_COLOR};
    border-bottom: 1px solid {DIVIDER_COLOR};
}}
QPushButton#addButton {{
    background-color: transparent;
    color: {SUBTEXT_COLOR};
    border: 1px dashed {DIVIDER_COLOR};
    border-radius: 6px;
    padding: 0px 10px;
    font-size: 16px;
    font-weight: 700;
}}
QPushButton#addButton:hover {{
    color: {TEXT_COLOR};
    border-color: {ACCENT};
    background-color: {SECONDARY};
}}
QLabel#arrowLabel {{
    color: {SUBTEXT_COLOR};
    font-size: 12px;
    background: transparent;
}}
QLabel#emptyLabel {{
    color: {SUBTEXT_COLOR};
    font-size: 12px;
    background: transparent;
}}
"""


def _scene_button_style(active: bool) -> str:
    """场景按钮样式：当前场景高亮"""
    bg = ACCENT if active else SECONDARY
    hover = ACCENT_HOVER if active else SECONDARY_HOVER
    fg = "#ffffff" if active else TEXT_COLOR
    weight = "font-weight: 600;" if active else ""
    return (
        f"QPushButton {{"
        f" background-color: {bg};"
        f" color: {fg};"
        f" border: none;"
        f" border-radius: 6px;"
        f" padding: 6px 14px;"
        f" font-size: 12px;"
        f" {weight}"
        f"}}"
        f"QPushButton:hover {{ background-color: {hover}; }}"
    )


class SceneButton(QPushButton):
    """场景按钮，支持拖拽重新排序"""

    def __init__(self, scene_id: str, name: str, parent=None):
        super().__init__(name, parent)
        self.scene_id = scene_id
        self.setCursor(Qt.PointingHandCursor)
        self._press_pos: Optional[QPoint] = None
        self._dragged: bool = False

    # -- 拖拽实现 --

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self._press_pos = event.position().toPoint()
            self._dragged = False
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):
        if (
            self._press_pos is not None
            and (event.buttons() & Qt.LeftButton)
        ):
            moved = (event.position().toPoint() - self._press_pos).manhattanLength()
            if moved >= 10:
                self._start_drag()
                self._press_pos = None
                return
        super().mouseMoveEvent(event)

    def _start_drag(self):
        self._dragged = True
        drag = QDrag(self)
        mime = QMimeData()
        mime.setData(SCENE_MIME_TYPE, self.scene_id.encode("utf-8"))
        mime.setText(self.scene_id)
        drag.setMimeData(mime)
        pix = QPixmap(80, 24)
        pix.fill(QColor(ACCENT))
        drag.setPixmap(pix)
        drag.exec(Qt.MoveAction)


class SceneNavigator(QWidget):
    """场景导航器

    水平布局显示场景标签页，每个场景一个按钮，当前场景高亮；
    右侧「+」按钮添加新场景；场景按钮右键菜单支持重命名 / 删除；
    场景之间显示「→」表示顺序；支持拖拽按钮重新排序。

    公共接口：
    - ``refresh()``：从 ``project_store`` 同步场景列表与当前场景
    """

    # 选中场景时发出（scene_id）
    scene_selected = Signal(str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("SceneNavigator")
        self.setAcceptDrops(True)
        self.setStyleSheet(NAV_QSS)
        self.setFixedHeight(44)

        self._container = QWidget(self)
        self._container.setStyleSheet("background: transparent;")
        self._layout = QHBoxLayout(self._container)
        self._layout.setContentsMargins(8, 0, 8, 0)
        self._layout.setSpacing(4)

        outer = QHBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)
        outer.addWidget(self._container)

        # 场景按钮引用（顺序与 scene_order 一致，仅含已存在的场景）
        self._buttons: list[SceneButton] = []

        self.refresh()

    # ============================================================
    # 公共接口
    # ============================================================

    def refresh(self):
        """从 project_store 更新场景标签页"""
        # 清空既有控件
        while self._layout.count():
            item = self._layout.takeAt(0)
            w = item.widget()
            if w is not None:
                w.deleteLater()
        self._buttons.clear()

        meta = project_store.data.meta
        scene_order = list(meta.scene_order)
        current_id = meta.current_scene_id

        if not scene_order:
            empty = QLabel("（暂无场景，点击 + 新建）")
            empty.setObjectName("emptyLabel")
            self._layout.addWidget(empty)
        else:
            for i, sid in enumerate(scene_order):
                scene = project_store.data.scenes.get(sid)
                if scene is None:
                    continue
                btn = SceneButton(sid, scene.name or "未命名场景", self._container)
                btn.setStyleSheet(_scene_button_style(sid == current_id))
                btn.setToolTip(f"切换到场景「{scene.name}」（拖拽可排序）")
                btn.clicked.connect(
                    lambda checked=False, b=btn, s=sid: self._on_click(b, s)
                )
                btn.setContextMenuPolicy(Qt.CustomContextMenu)
                btn.customContextMenuRequested.connect(
                    lambda pos, b=btn, s=sid: self._on_context_menu(b, s, pos)
                )
                self._layout.addWidget(btn)
                self._buttons.append(btn)

                # 场景间箭头
                if i < len(scene_order) - 1:
                    arrow = QLabel("→")
                    arrow.setObjectName("arrowLabel")
                    self._layout.addWidget(arrow)

        self._layout.addStretch(1)

        # 添加场景按钮
        add_btn = QPushButton("＋")
        add_btn.setObjectName("addButton")
        add_btn.setToolTip("添加新场景")
        add_btn.setCursor(Qt.PointingHandCursor)
        add_btn.setFixedWidth(34)
        add_btn.clicked.connect(self._on_add_scene)
        self._layout.addWidget(add_btn)

    # ============================================================
    # 事件处理
    # ============================================================

    def _on_click(self, btn: SceneButton, scene_id: str):
        """点击场景按钮：切换当前场景（拖拽后的释放不触发切换）"""
        if getattr(btn, "_dragged", False):
            btn._dragged = False
            return
        project_store.set_current_scene(scene_id)
        self.scene_selected.emit(scene_id)

    def _on_add_scene(self):
        """添加新场景"""
        project_store.add_scene()

    def _on_context_menu(self, btn: SceneButton, scene_id: str, pos):
        """场景按钮右键菜单：重命名 / 删除"""
        menu = QMenu(self)
        act_rename = menu.addAction("重命名场景")
        menu.addSeparator()
        act_delete = menu.addAction("删除场景")
        action = menu.exec(btn.mapToGlobal(pos))
        if action == act_rename:
            self._rename_scene(scene_id)
        elif action == act_delete:
            self._delete_scene(scene_id)

    def _rename_scene(self, scene_id: str):
        scene = project_store.data.scenes.get(scene_id)
        if scene is None:
            return
        name, ok = QInputDialog.getText(
            self, "重命名场景", "场景名称：", text=scene.name or "",
        )
        if not ok:
            return
        name = name.strip()
        if not name:
            QMessageBox.warning(self, "提示", "场景名称不能为空。")
            return
        project_store.rename_scene(scene_id, name)

    def _delete_scene(self, scene_id: str):
        if len(project_store.data.scenes) <= 1:
            QMessageBox.warning(self, "提示", "至少需要保留一个场景，无法删除。")
            return
        scene = project_store.data.scenes.get(scene_id)
        name = scene.name if scene else scene_id
        reply = QMessageBox.question(
            self, "删除场景",
            f"确定删除场景「{name}」吗？\n场景中的所有节点都会被一并移除。",
            QMessageBox.Yes | QMessageBox.No, QMessageBox.No,
        )
        if reply == QMessageBox.Yes:
            project_store.delete_scene(scene_id)

    # ============================================================
    # 拖拽排序
    # ============================================================

    def dragEnterEvent(self, event):
        if event.mimeData().hasFormat(SCENE_MIME_TYPE):
            event.acceptProposedAction()
        else:
            event.ignore()

    def dragMoveEvent(self, event):
        if event.mimeData().hasFormat(SCENE_MIME_TYPE):
            event.acceptProposedAction()
        else:
            event.ignore()

    def dropEvent(self, event):
        mime = event.mimeData()
        if not mime.hasFormat(SCENE_MIME_TYPE):
            event.ignore()
            return
        dragged_id = bytes(mime.data(SCENE_MIME_TYPE)).decode("utf-8")
        # 计算插入位置（相对容器坐标）
        pos = self._container.mapFrom(self, event.position().toPoint())
        target_index = self._target_index_at(pos)
        self._reorder(dragged_id, target_index)
        event.acceptProposedAction()

    def _target_index_at(self, pos: QPoint) -> int:
        """根据落点位置计算插入索引（在 scene_order 中的位置）"""
        for i, btn in enumerate(self._buttons):
            rect = btn.geometry()
            if rect.contains(pos):
                # 落在按钮左半区 -> 插到该按钮之前；右半区 -> 之后
                return i if pos.x() < rect.center().x() else i + 1
        # 未落在任何按钮上：靠左归 0，靠右归末尾
        if pos.x() <= 0:
            return 0
        return len(self._buttons)

    def _reorder(self, dragged_id: str, target_index: int):
        order = [s for s in project_store.data.meta.scene_order if s != dragged_id]
        target_index = max(0, min(target_index, len(order)))
        order.insert(target_index, dragged_id)
        project_store.reorder_scenes(order)
