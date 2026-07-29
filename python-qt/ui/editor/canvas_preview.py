"""
影游工坊 - 画布预览
QGraphicsView + QGraphicsScene 作为游戏画面预览
渲染当前场景中节点的累积状态（背景 / 立绘 / 对话 / 选项）
对应 TypeScript 版本 src/components/CanvasPreview.tsx
"""
from __future__ import annotations

from typing import Optional

from PySide6.QtWidgets import (
    QGraphicsView, QGraphicsScene, QGraphicsPixmapItem,
    QGraphicsRectItem, QGraphicsTextItem, QFrame,
)
from PySide6.QtCore import Qt, QRectF, QSizeF
from PySide6.QtGui import QPixmap, QColor, QBrush, QPen, QFont, QPainter

from stores.project_store import project_store
from services import file_service
from models.types import TRACKS, NODE_TYPE_LABELS


# ===== 主题配色（与 editor_widget / toolbar 保持一致）=====
DARK_BG = "#1e1e2e"
PANEL_BG = "#252535"
ACCENT = "#3b82f6"
TEXT_COLOR = "#e0e0e0"
SUBTEXT_COLOR = "#9ca3af"
DIVIDER_COLOR = "#2d2d3f"
HIGHLIGHT = "#fbbf24"

# 立绘位置 -> 场景 X 坐标比例
_SPRITE_X_RATIO = {
    "left": 0.25,
    "center": 0.50,
    "right": 0.75,
    "truecenter": 0.50,
}


class CanvasPreview(QGraphicsView):
    """画布预览：渲染当前场景的游戏画面快照

    渲染策略：将场景中所有节点按 ``position`` 排序后顺序处理，累积各轨道的
    最终状态——背景取最后一个背景/视频节点，立绘取各位置最后可见的立绘节点，
    对话取最后一个对话节点，选项取最后一个选项节点——最终合成一帧画面。

    公共接口：
    - ``refresh()``：从当前场景刷新画面
    - ``set_scene(scene_id)``：切换到指定场景
    - ``select_node(node_id)`` / ``select_node(scene_id, node_id)``：选中节点并高亮
    """

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setStyleSheet(
            f"QGraphicsView {{ background-color: {DARK_BG}; border: none; }}"
        )
        self.setRenderHint(QPainter.RenderHint.Antialiasing, True)
        self.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform, True)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.setVerticalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        self.setFrameShape(QFrame.Shape.NoFrame)
        self.setMinimumSize(320, 240)

        self._scene_graph = QGraphicsScene(self)
        self.setScene(self._scene_graph)

        self._current_scene_id: Optional[str] = None
        self._selected_node_id: Optional[str] = None
        # 节点 ID -> 渲染区域映射（用于高亮选中节点）
        self._node_rects: dict[str, QRectF] = {}

        self.refresh()

    # ============================================================
    # 公共接口
    # ============================================================

    def refresh(self):
        """从当前场景刷新画布"""
        scene = project_store.get_current_scene()
        if scene:
            self._current_scene_id = scene.id
        self._render()

    def set_scene(self, scene_id: str):
        """切换到指定场景并重新渲染"""
        self._current_scene_id = scene_id
        self._render()

    def select_node(self, *args):
        """选中节点

        兼容两种调用方式：
        - ``select_node(node_id)``：在当前场景中选中节点
        - ``select_node(scene_id, node_id)``：切换场景并选中节点
        """
        if len(args) >= 2:
            self._current_scene_id = args[0]
            self._selected_node_id = args[1]
        elif len(args) == 1:
            self._selected_node_id = args[0]
        else:
            return
        self._render()

    # ============================================================
    # 视图缩放
    # ============================================================

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self._fit_view()

    def _fit_view(self):
        """等比缩放场景以适应视图大小"""
        rect = self._scene_graph.sceneRect()
        if not rect.isNull() and rect.width() > 0 and rect.height() > 0:
            self.fitInView(rect, Qt.AspectRatioMode.KeepAspectRatio)

    # ============================================================
    # 渲染主流程
    # ============================================================

    def _render(self):
        self._scene_graph.clear()
        self._node_rects.clear()

        meta = project_store.data.meta
        w = meta.resolution.width
        h = meta.resolution.height
        self._scene_graph.setSceneRect(0, 0, w, h)
        self._scene_graph.setBackgroundBrush(QBrush(QColor(DARK_BG)))

        # 解析当前场景
        scene = None
        if self._current_scene_id:
            scene = project_store.data.scenes.get(self._current_scene_id)
        if scene is None:
            scene = project_store.get_current_scene()
            if scene:
                self._current_scene_id = scene.id

        if scene is None:
            self._render_empty(w, h)
            self._fit_view()
            return

        # 按 (position, track_index) 排序，保证确定性
        nodes = sorted(scene.nodes, key=lambda n: (n.position, n.track_index))

        # 累积状态
        last_bg = None          # 最后一个背景或视频节点
        active_sprites: dict[str, object] = {}  # position -> SpriteNode
        last_dialogue = None
        last_choice = None

        for node in nodes:
            ntype = node.type
            if ntype in ("background", "video"):
                last_bg = node
            elif ntype == "sprite":
                pos_key = getattr(node, "screen_position", "center")
                if getattr(node, "visible", True):
                    active_sprites[pos_key] = node
                else:
                    active_sprites.pop(pos_key, None)
            elif ntype == "dialogue":
                last_dialogue = node
            elif ntype == "choice":
                last_choice = node

        # 渲染顺序：背景 -> 立绘 -> 选项 -> 对话
        self._render_background(last_bg, w, h, meta.theme_color)
        for sprite in active_sprites.values():
            self._render_sprite(sprite, w, h)
        if last_choice:
            self._render_choice(last_choice, w, h, meta.default_font)
        if last_dialogue:
            self._render_dialogue(last_dialogue, w, h, meta.default_font)

        # 高亮选中节点
        self._highlight_selected()

        # 场景名称标注（左上角）
        self._render_scene_label(scene, w, h)

        self._fit_view()

    # ============================================================
    # 各节点类型渲染
    # ============================================================

    def _render_background(self, node, w: int, h: int, theme_color: str):
        """渲染背景节点：有素材图片则显示，否则用主题色填充"""
        if node is not None and getattr(node, "asset_id", ""):
            asset = self._find_asset(node.asset_id)
            if asset and asset.type != "video":
                path = file_service.get_asset_path(asset.id, asset.file_name)
                if path.exists():
                    pix = QPixmap(str(path))
                    if not pix.isNull():
                        scaled = pix.scaled(
                            w, h,
                            Qt.AspectRatioMode.KeepAspectRatioByExpanding,
                            Qt.TransformationMode.SmoothTransformation,
                        )
                        item = QGraphicsPixmapItem(scaled)
                        item.setPos(
                            (w - scaled.width()) / 2,
                            (h - scaled.height()) / 2,
                        )
                        item.setZValue(0)
                        self._scene_graph.addItem(item)
                        self._node_rects[node.id] = QRectF(0, 0, w, h)
                        return
            # 视频节点或素材缺失：显示深色占位
            if node.type == "video":
                self._fill_rect(0, 0, w, h, "#0d0d14", node_id=node.id)
                self._add_center_text("▶ 视频", w / 2, h / 2, SUBTEXT_COLOR, 24)
                return

        # 无背景节点：用主题色填充
        rect = QGraphicsRectItem(0, 0, w, h)
        rect.setBrush(QBrush(QColor(theme_color or "#3366CC")))
        rect.setPen(QPen(Qt.PenStyle.NoPen))
        rect.setZValue(0)
        self._scene_graph.addItem(rect)
        if node is not None:
            self._node_rects[node.id] = QRectF(0, 0, w, h)

    def _render_sprite(self, node, w: int, h: int):
        """渲染立绘节点：查找角色+表情对应素材，显示在对应位置"""
        character_id = getattr(node, "character_id", "")
        emotion = getattr(node, "emotion", "")
        asset = self._find_sprite_asset(character_id, emotion)
        if not asset:
            return

        path = file_service.get_asset_path(asset.id, asset.file_name)
        if not path.exists():
            return

        pix = QPixmap(str(path))
        if pix.isNull():
            return

        # 缩放到场景高度的 85%，底部对齐
        target_h = int(h * 0.85)
        scaled = pix.scaledToHeight(
            target_h, Qt.TransformationMode.SmoothTransformation
        )
        item = QGraphicsPixmapItem(scaled)
        pos_key = getattr(node, "screen_position", "center")
        cx_ratio = _SPRITE_X_RATIO.get(pos_key, 0.5)
        cx = w * cx_ratio
        item.setPos(cx - scaled.width() / 2, h - scaled.height())
        item.setZValue(getattr(node, "zorder", 1) + 1)
        self._scene_graph.addItem(item)
        self._node_rects[node.id] = QRectF(
            item.x(), item.y(), scaled.width(), scaled.height()
        )

    def _render_dialogue(self, node, w: int, h: int, font_family: str):
        """渲染对话节点：底部显示对话文本框（角色名 + 对话内容）"""
        box_h = int(h * 0.22)
        box_y = h - box_h
        box_x = int(w * 0.03)
        box_w = w - 2 * box_x

        # 对话框背景
        box = QGraphicsRectItem(box_x, box_y, box_w, box_h)
        box.setBrush(QBrush(QColor(0, 0, 0, 180)))
        box.setPen(QPen(QColor(ACCENT), 2))
        box.setZValue(20)
        self._scene_graph.addItem(box)

        # 角色名
        speaker_id = getattr(node, "speaker_id", None)
        speaker_name = self._get_character_name(speaker_id)
        if speaker_name:
            name_item = QGraphicsTextItem(speaker_name)
            name_font = QFont(font_family or "Noto Sans SC", 16)
            name_font.setBold(True)
            name_item.setFont(name_font)
            name_item.setDefaultTextColor(QColor(ACCENT))
            name_item.setPos(box_x + 16, box_y + 8)
            name_item.setZValue(21)
            self._scene_graph.addItem(name_item)

        # 对话内容
        text = getattr(node, "text", "") or ""
        text_item = QGraphicsTextItem(text)
        text_font = QFont(font_family or "Noto Sans SC", 14)
        text_item.setFont(text_font)
        text_color = getattr(getattr(node, "text_style", None), "font_color", TEXT_COLOR)
        text_item.setDefaultTextColor(QColor(text_color))
        text_item.setTextWidth(box_w - 32)
        text_y = box_y + 36 if speaker_name else box_y + 16
        text_item.setPos(box_x + 16, text_y)
        text_item.setZValue(21)
        self._scene_graph.addItem(text_item)

        self._node_rects[node.id] = QRectF(box_x, box_y, box_w, box_h)

    def _render_choice(self, node, w: int, h: int, font_family: str):
        """渲染选项节点：中间显示选项列表"""
        choices = getattr(node, "choices", [])
        if not choices:
            return

        btn_style = getattr(node, "button_style", None)
        bg_color = getattr(btn_style, "background_color", "#1e293b") if btn_style else "#1e293b"
        txt_color = getattr(btn_style, "text_color", "#ffffff") if btn_style else "#ffffff"
        font_size = getattr(btn_style, "font_size", 18) if btn_style else 18

        btn_w = int(w * 0.42)
        btn_h = 46
        spacing = 12
        total_h = len(choices) * btn_h + (len(choices) - 1) * spacing
        start_y = (h - total_h) / 2

        min_x = w
        max_x = 0
        min_y = h
        max_y = 0

        for i, choice in enumerate(choices):
            y = start_y + i * (btn_h + spacing)
            x = (w - btn_w) / 2

            rect = QGraphicsRectItem(x, y, btn_w, btn_h)
            rect.setBrush(QBrush(QColor(bg_color)))
            rect.setPen(QPen(QColor(ACCENT), 1))
            rect.setZValue(30)
            self._scene_graph.addItem(rect)

            text_item = QGraphicsTextItem(choice.text)
            f = QFont(font_family or "Noto Sans SC", font_size)
            text_item.setFont(f)
            text_item.setDefaultTextColor(QColor(txt_color))
            tw = text_item.boundingRect().width()
            th = text_item.boundingRect().height()
            text_item.setPos(x + (btn_w - tw) / 2, y + (btn_h - th) / 2)
            text_item.setZValue(31)
            self._scene_graph.addItem(text_item)

            min_x = min(min_x, x)
            max_x = max(max_x, x + btn_w)
            min_y = min(min_y, y)
            max_y = max(max_y, y + btn_h)

        self._node_rects[node.id] = QRectF(min_x, min_y, max_x - min_x, max_y - min_y)

    # ============================================================
    # 辅助渲染
    # ============================================================

    def _render_empty(self, w: int, h: int):
        """无场景时的空状态提示"""
        self._fill_rect(0, 0, w, h, DARK_BG)
        self._add_center_text("暂无场景", w / 2, h / 2, SUBTEXT_COLOR, 20)

    def _render_scene_label(self, scene, w: int, h: int):
        """左上角场景名称标注"""
        name = getattr(scene, "name", "") or "未命名场景"
        label = QGraphicsTextItem(f"场景：{name}")
        label.setFont(QFont("Noto Sans SC", 11))
        label.setDefaultTextColor(QColor(SUBTEXT_COLOR))
        label.setPos(10, 6)
        label.setZValue(50)
        self._scene_graph.addItem(label)

    def _highlight_selected(self):
        """高亮选中节点：绘制虚线边框"""
        if not self._selected_node_id:
            return
        rect = self._node_rects.get(self._selected_node_id)
        if rect is None:
            return
        pen = QPen(QColor(HIGHLIGHT), 3, Qt.PenStyle.DashLine)
        item = QGraphicsRectItem(rect)
        item.setPen(pen)
        item.setBrush(Qt.BrushStyle.NoBrush)
        item.setZValue(100)
        self._scene_graph.addItem(item)

    def _fill_rect(self, x, y, w, h, color: str, node_id: str | None = None):
        """填充矩形辅助"""
        rect = QGraphicsRectItem(x, y, w, h)
        rect.setBrush(QBrush(QColor(color)))
        rect.setPen(QPen(Qt.PenStyle.NoPen))
        self._scene_graph.addItem(rect)
        if node_id:
            self._node_rects[node_id] = QRectF(x, y, w, h)

    def _add_center_text(self, text: str, cx: float, cy: float, color: str, size: int):
        """居中文本辅助"""
        item = QGraphicsTextItem(text)
        item.setFont(QFont("Noto Sans SC", size))
        item.setDefaultTextColor(QColor(color))
        tw = item.boundingRect().width()
        th = item.boundingRect().height()
        item.setPos(cx - tw / 2, cy - th / 2)
        self._scene_graph.addItem(item)

    # ============================================================
    # 数据查找辅助
    # ============================================================

    def _find_asset(self, asset_id: str):
        """按 ID 查找素材"""
        return next(
            (a for a in project_store.data.assets if a.id == asset_id), None
        )

    def _find_sprite_asset(self, character_id: str, emotion: str):
        """查找角色 + 表情对应的立绘素材

        查找优先级：
        1. character_id + emotion 精确匹配
        2. character_id + 角色默认表情
        3. 该角色的任意立绘素材
        4. 无角色时返回任意立绘素材
        """
        assets = project_store.data.assets
        if not character_id:
            return next((a for a in assets if a.type == "sprite"), None)

        matches = [a for a in assets if a.type == "sprite" and a.character_id == character_id]
        if not matches:
            return None

        # 精确匹配表情
        if emotion:
            for a in matches:
                if a.emotion == emotion:
                    return a

        # 匹配角色默认表情
        char = next(
            (c for c in project_store.data.characters if c.id == character_id), None
        )
        if char and char.default_emotion:
            for a in matches:
                if a.emotion == char.default_emotion:
                    return a

        return matches[0]

    def _get_character_name(self, char_id: str | None) -> str:
        """获取角色显示名"""
        if not char_id:
            return ""
        char = next(
            (c for c in project_store.data.characters if c.id == char_id), None
        )
        if char:
            return char.display_name or char.id
        return char_id
