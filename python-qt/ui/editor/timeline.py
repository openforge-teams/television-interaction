"""
影游工坊 - 多轨道时间轴
QScrollArea 包裹 6 条轨道，每条轨道一行，显示节点卡片；
支持拖拽素材入轨、节点拖拽重排、点击选中、Delete 删除。
对应 TypeScript 版本 src/components/Timeline/Timeline.tsx
"""
from __future__ import annotations

from typing import Optional

from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QPushButton, QScrollArea,
    QLabel, QFrame,
)
from PySide6.QtCore import Qt, Signal, QSize, QMimeData, QPoint
from PySide6.QtGui import QDrag, QPixmap, QColor

from stores.project_store import project_store
from models.types import TRACKS, NODE_TYPE_LABELS
from models.factory import can_asset_drop_on_track, ASSET_TO_NODE_TYPE


# ===== 主题配色（与 editor_widget / left_panel 保持一致）=====
DARK_BG = "#1e1e2e"
PANEL_BG = "#252535"
TRACK_BG = "#22222e"
ACCENT = "#3b82f6"
ACCENT_HOVER = "#2563eb"
SECONDARY = "#374151"
SECONDARY_HOVER = "#4b5563"
TEXT_COLOR = "#e0e0e0"
SUBTEXT_COLOR = "#9ca3af"
DIVIDER_COLOR = "#2d2d3f"
HIGHLIGHT = "#fbbf24"
DROP_HIGHLIGHT = "#22d3ee"

# 拖拽 MIME 类型（与 left_panel 保持一致）
ASSET_MIME_TYPE = "application/x-yingyou-asset-id"
NODE_MIME_TYPE = "application/x-yingyou-node-id"

# 节点类型配色（卡片左侧色条）
NODE_TYPE_COLORS = {
    "background": "#3b82f6",
    "sprite": "#10b981",
    "dialogue": "#f59e0b",
    "video": "#8b5cf6",
    "audio": "#ef4444",
    "choice": "#ec4899",
    "jump_label": "#6366f1",
    "variable_op": "#14b8a6",
}


TIMELINE_QSS = f"""
QWidget#TimelineRoot {{
    background-color: {PANEL_BG};
}}
QScrollArea {{
    background-color: {PANEL_BG};
    border: none;
}}
QLabel#trackLabel {{
    background-color: {TRACK_BG};
    color: {SUBTEXT_COLOR};
    font-size: 11px;
    border: none;
    border-right: 1px solid {DIVIDER_COLOR};
}}
QLabel#emptyHint {{
    color: {SUBTEXT_COLOR};
    font-size: 12px;
    background: transparent;
}}
QPushButton#addNodeBtn {{
    background-color: transparent;
    color: {SUBTEXT_COLOR};
    border: 1px dashed {DIVIDER_COLOR};
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 11px;
}}
QPushButton#addNodeBtn:hover {{
    color: {TEXT_COLOR};
    border-color: {ACCENT};
    background-color: {SECONDARY};
}}
"""


def _node_card_style(node_type: str, selected: bool) -> str:
    """节点卡片样式"""
    color = NODE_TYPE_COLORS.get(node_type, "#6b7280")
    if selected:
        bg = ACCENT
        fg = "#ffffff"
        border = HIGHLIGHT
        hover_bg = ACCENT_HOVER
    else:
        bg = "#2a2a3a"
        fg = TEXT_COLOR
        border = DIVIDER_COLOR
        hover_bg = SECONDARY_HOVER
    return (
        f"QPushButton {{"
        f" background-color: {bg};"
        f" color: {fg};"
        f" border: 1px solid {border};"
        f" border-left: 3px solid {color};"
        f" border-radius: 4px;"
        f" padding: 4px 10px;"
        f" font-size: 11px;"
        f" text-align: left;"
        f"}}"
        f"QPushButton:hover {{ background-color: {hover_bg}; }}"
    )


class NodeCard(QPushButton):
    """节点卡片：显示节点类型中文标签 + 序号，可点击选中、拖拽重排"""

    def __init__(self, node_id: str, scene_id: str, track_index: int,
                 position: int, node_type: str, text: str, parent=None):
        super().__init__(text, parent)
        self.node_id = node_id
        self.scene_id = scene_id
        self.track_index = track_index
        self.position = position
        self.node_type = node_type
        self._selected = False
        self.setCursor(Qt.PointingHandCursor)
        self.setAcceptDrops(False)
        self._press_pos: Optional[QPoint] = None
        self._dragged = False
        self._apply_style()

    def set_selected(self, selected: bool):
        self._selected = selected
        self._apply_style()

    def _apply_style(self):
        self.setStyleSheet(_node_card_style(self.node_type, self._selected))

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
            if moved >= 8:
                self._start_drag()
                self._press_pos = None
                return
        super().mouseMoveEvent(event)

    def _start_drag(self):
        self._dragged = True
        drag = QDrag(self)
        mime = QMimeData()
        mime.setData(NODE_MIME_TYPE, self.node_id.encode("utf-8"))
        mime.setText(self.node_id)
        drag.setMimeData(mime)
        pix = QPixmap(60, 22)
        pix.fill(QColor(NODE_TYPE_COLORS.get(self.node_type, "#6b7280")))
        drag.setPixmap(pix)
        drag.exec(Qt.MoveAction)

    def keyPressEvent(self, event):
        # 卡片持有焦点时也响应 Delete
        if event.key() == Qt.Key_Delete:
            tl = self._find_timeline()
            if tl is not None:
                tl.delete_selected()
                return
        super().keyPressEvent(event)

    def _find_timeline(self):
        p = self.parent()
        while p is not None:
            if isinstance(p, Timeline):
                return p
            p = p.parent()
        return None


class TrackArea(QWidget):
    """轨道右侧区域：容纳节点卡片，接受素材 / 节点拖放"""

    def __init__(self, track_index: int, accepted_types: list, timeline, parent=None):
        super().__init__(parent)
        self.track_index = track_index
        self.accepted_types = accepted_types
        self._timeline = timeline
        self.setAcceptDrops(True)
        self.setMinimumHeight(40)

        self._layout = QHBoxLayout(self)
        self._layout.setContentsMargins(6, 4, 6, 4)
        self._layout.setSpacing(6)
        self._cards: list[NodeCard] = []

        self._drop_highlight = False

    # -- 卡片管理 --

    def clear_cards(self):
        for card in self._cards:
            card.setParent(None)
            card.deleteLater()
        self._cards.clear()
        # 移除可能残留的占位 / stretch
        while self._layout.count():
            item = self._layout.takeAt(0)
            w = item.widget()
            if w is not None:
                w.deleteLater()

    def add_card(self, card: NodeCard):
        self._cards.append(card)
        self._layout.addWidget(card)

    def finish(self):
        """卡片添加完毕：尾部加弹性占位，使卡片左对齐"""
        self._layout.addStretch(1)
        if not self._cards:
            hint = QLabel("（空轨道，可拖入素材）")
            hint.setObjectName("emptyHint")
            self._layout.addWidget(hint)
            self._layout.addStretch(1)

    # -- 拖放 --

    def dragEnterEvent(self, event):
        mime = event.mimeData()
        if mime.hasFormat(NODE_MIME_TYPE):
            event.acceptProposedAction()
            self._set_drop_highlight(True)
        elif mime.hasFormat(ASSET_MIME_TYPE):
            asset_id = bytes(mime.data(ASSET_MIME_TYPE)).decode("utf-8")
            asset = next((a for a in project_store.data.assets if a.id == asset_id), None)
            if asset and can_asset_drop_on_track(asset.type, self.accepted_types):
                event.acceptProposedAction()
                self._set_drop_highlight(True)
            else:
                event.ignore()
        else:
            event.ignore()

    def dragMoveEvent(self, event):
        if event.mimeData().hasFormat(NODE_MIME_TYPE) or event.mimeData().hasFormat(ASSET_MIME_TYPE):
            event.acceptProposedAction()
        else:
            event.ignore()

    def dragLeaveEvent(self, event):
        self._set_drop_highlight(False)
        super().dragLeaveEvent(event)

    def dropEvent(self, event):
        self._set_drop_highlight(False)
        mime = event.mimeData()
        scene_id = self._timeline.current_scene_id
        if not scene_id:
            event.ignore()
            return

        if mime.hasFormat(ASSET_MIME_TYPE):
            asset_id = bytes(mime.data(ASSET_MIME_TYPE)).decode("utf-8")
            asset = next((a for a in project_store.data.assets if a.id == asset_id), None)
            if asset and can_asset_drop_on_track(asset.type, self.accepted_types):
                pos = self._insertion_index_at(event.position().toPoint())
                project_store.add_node_from_asset(scene_id, asset_id, self.track_index, pos)
                event.acceptProposedAction()
            else:
                event.ignore()
        elif mime.hasFormat(NODE_MIME_TYPE):
            node_id = bytes(mime.data(NODE_MIME_TYPE)).decode("utf-8")
            pos = self._insertion_index_at(event.position().toPoint(), exclude_id=node_id)
            project_store.move_node(scene_id, node_id, self.track_index, pos)
            event.acceptProposedAction()
        else:
            event.ignore()

    def _insertion_index_at(self, pos: QPoint, exclude_id: str = None) -> int:
        """根据落点计算插入位置（基于卡片中心 x）"""
        cards = [c for c in self._cards if exclude_id is None or c.node_id != exclude_id]
        for i, card in enumerate(cards):
            rect = card.geometry()
            if pos.x() < rect.center().x():
                return i
        return len(cards)

    def _set_drop_highlight(self, on: bool):
        if on == self._drop_highlight:
            return
        self._drop_highlight = on
        if on:
            self.setStyleSheet(
                f"TrackArea {{ background-color: rgba(34, 211, 238, 0.12);"
                f" border: 1px dashed {DROP_HIGHLIGHT}; border-radius: 4px; }}"
            )
        else:
            self.setStyleSheet("")


class Timeline(QWidget):
    """多轨道时间轴

    6 条轨道（背景/视频、立绘、对话、音频、选项、跳转/标签），每条轨道一行：
    左侧显示轨道名称，右侧显示节点卡片。支持拖拽素材入轨、节点拖拽重排、
    点击卡片选中、Delete 键删除选中节点。

    公共接口：
    - ``refresh()``：从当前场景刷新轨道
    - ``set_scene(scene_id)``：切换到指定场景
    - ``select_node(node_id)`` / ``select_node(scene_id, node_id)``：选中节点
    - ``delete_selected()``：删除当前选中节点
    """

    # 选中节点时发出（scene_id, node_id）
    node_selected = Signal(str, str)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("TimelineRoot")
        self.setStyleSheet(TIMELINE_QSS)
        self.setFocusPolicy(Qt.StrongFocus)

        self._current_scene_id: Optional[str] = None
        self._selected_node_id: Optional[str] = None
        self._track_areas: dict[int, TrackArea] = {}

        self._build_ui()
        self.refresh()

    # ============================================================
    # UI 构建
    # ============================================================

    def _build_ui(self):
        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        scroll = QScrollArea(self)
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.Shape.NoFrame)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        scroll.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)

        container = QWidget()
        container.setStyleSheet(f"background-color: {PANEL_BG};")
        v = QVBoxLayout(container)
        v.setContentsMargins(0, 0, 0, 0)
        v.setSpacing(2)

        for track in TRACKS:
            v.addWidget(self._build_track_row(track))
        v.addStretch(1)

        scroll.setWidget(container)
        outer.addWidget(scroll)

    def _build_track_row(self, track) -> QFrame:
        row = QFrame()
        row.setStyleSheet(
            f"QFrame {{ background-color: {TRACK_BG};"
            f" border-bottom: 1px solid {DIVIDER_COLOR}; }}"
        )
        row.setMinimumHeight(44)

        h = QHBoxLayout(row)
        h.setContentsMargins(0, 0, 0, 0)
        h.setSpacing(0)

        label = QLabel(track.name)
        label.setObjectName("trackLabel")
        label.setFixedWidth(96)
        label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        label.setWordWrap(True)
        h.addWidget(label)

        area = TrackArea(track.index, list(track.accepted_types), self, row)
        h.addWidget(area, 1)
        self._track_areas[track.index] = area
        return row

    # ============================================================
    # 公共接口
    # ============================================================

    @property
    def current_scene_id(self) -> Optional[str]:
        return self._current_scene_id

    def refresh(self):
        """从当前场景刷新所有轨道"""
        scene = project_store.get_current_scene()
        new_id = scene.id if scene else None
        if new_id != self._current_scene_id:
            # 场景切换：清空选中
            self._selected_node_id = None
        self._current_scene_id = new_id
        self._rebuild_tracks()

    def set_scene(self, scene_id: str):
        """切换到指定场景并重建轨道"""
        if scene_id != self._current_scene_id:
            self._selected_node_id = None
        self._current_scene_id = scene_id
        self._rebuild_tracks()

    def select_node(self, *args):
        """选中节点

        兼容两种调用方式：
        - ``select_node(node_id)``：在当前场景中选中
        - ``select_node(scene_id, node_id)``：切换场景并选中
        """
        if len(args) >= 2:
            self._current_scene_id = args[0]
            self._selected_node_id = args[1]
        elif len(args) == 1:
            self._selected_node_id = args[0]
        else:
            return
        self._update_highlight()

    def delete_selected(self):
        """删除当前选中节点"""
        if not self._selected_node_id or not self._current_scene_id:
            return
        node_id = self._selected_node_id
        scene_id = self._current_scene_id
        # 删除前确认节点仍存在
        scene = project_store.data.scenes.get(scene_id)
        if not scene or not any(n.id == node_id for n in scene.nodes):
            self._selected_node_id = None
            return
        project_store.delete_node(scene_id, node_id)
        self._selected_node_id = None
        # 清除检查器 / 画布的选中状态（best-effort）
        self._sync_siblings(scene_id, None)

    # ============================================================
    # 渲染
    # ============================================================

    def _rebuild_tracks(self):
        scene = project_store.data.scenes.get(self._current_scene_id)
        for area in self._track_areas.values():
            area.clear_cards()

        if scene is None:
            for area in self._track_areas.values():
                area.finish()
            return

        for track in TRACKS:
            area = self._track_areas[track.index]
            nodes = sorted(
                [n for n in scene.nodes if n.track_index == track.index],
                key=lambda n: n.position,
            )
            for idx, node in enumerate(nodes):
                label = NODE_TYPE_LABELS.get(node.type, node.type)
                text = f"{label} {idx + 1}"
                card = NodeCard(
                    node.id, scene.id, track.index, node.position, node.type, text, area,
                )
                card.set_selected(node.id == self._selected_node_id)
                card.setToolTip(self._card_tooltip(node, idx + 1))
                card.clicked.connect(
                    lambda checked=False, sid=scene.id, nid=node.id: self._on_card_clicked(sid, nid)
                )
                area.add_card(card)
            area.finish()

    def _card_tooltip(self, node, seq: int) -> str:
        label = NODE_TYPE_LABELS.get(node.type, node.type)
        tip = f"{label} #{seq}\n节点 ID：{node.id}"
        if getattr(node, "asset_id", ""):
            asset = next((a for a in project_store.data.assets if a.id == node.asset_id), None)
            if asset:
                tip += f"\n素材：{asset.file_name}"
        if getattr(node, "text", ""):
            text = node.text.replace("\n", " ")
            tip += f"\n文本：{text[:30]}"
        return tip

    def _update_highlight(self):
        for area in self._track_areas.values():
            for card in area._cards:
                card.set_selected(card.node_id == self._selected_node_id)

    # ============================================================
    # 事件处理
    # ============================================================

    def _on_card_clicked(self, scene_id: str, node_id: str):
        """点击节点卡片：选中并高亮"""
        self._current_scene_id = scene_id
        self._selected_node_id = node_id
        self._update_highlight()
        self.node_selected.emit(scene_id, node_id)
        self._sync_siblings(scene_id, node_id)
        self.setFocus()

    def keyPressEvent(self, event):
        if event.key() == Qt.Key.Key_Delete:
            self.delete_selected()
        else:
            super().keyPressEvent(event)

    # ============================================================
    # 与兄弟组件同步选中状态（best-effort，不依赖 editor_widget 连线）
    # ============================================================

    def _sync_siblings(self, scene_id: str, node_id):
        """通知画布 / 检查器同步选中节点（若可访问）"""
        editor = self._find_editor()
        if editor is None:
            return
        canvas = getattr(editor, "canvas", None)
        if canvas is not None and hasattr(canvas, "select_node"):
            try:
                if node_id is None:
                    canvas.select_node(scene_id, None)
                else:
                    canvas.select_node(scene_id, node_id)
            except Exception:  # noqa: BLE001
                pass
        inspector = getattr(editor, "inspector", None)
        if inspector is not None:
            method = getattr(inspector, "set_node", None) or getattr(inspector, "select_node", None)
            if callable(method):
                try:
                    if node_id is None:
                        method(scene_id, None)
                    else:
                        method(scene_id, node_id)
                except Exception:  # noqa: BLE001
                    pass

    def _find_editor(self):
        """沿父链查找持有 canvas / inspector 属性的编辑器容器"""
        p = self.parent()
        while p is not None:
            if hasattr(p, "inspector") and hasattr(p, "canvas"):
                return p
            p = p.parent()
        return None
