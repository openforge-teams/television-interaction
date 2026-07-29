"""
影游工坊 - 编辑器主布局
顶部工具栏 + 左/中/右三栏水平分割 + 底部时间轴（场景导航 + 时间轴）
对应 TypeScript 版本 src/components/Editor.tsx
"""
from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QWidget, QVBoxLayout, QSplitter, QHBoxLayout, QLabel,
)

from stores.project_store import project_store
from ui.editor.toolbar import Toolbar

# 兄弟组件可能尚未实现，采用受保护导入（与 main_window.py 中的做法一致）。
# 缺失时回退到占位部件，保证编辑器可独立运行；组件实现后自动生效。
try:
    from ui.editor.left_panel import LeftPanel
except Exception:  # noqa: BLE001
    LeftPanel = None  # type: ignore[assignment]

try:
    from ui.editor.canvas_preview import CanvasPreview
except Exception:  # noqa: BLE001
    CanvasPreview = None  # type: ignore[assignment]

try:
    from ui.editor.inspector import Inspector
except Exception:  # noqa: BLE001
    Inspector = None  # type: ignore[assignment]

try:
    from ui.editor.scene_navigator import SceneNavigator
except Exception:  # noqa: BLE001
    SceneNavigator = None  # type: ignore[assignment]

try:
    from ui.editor.timeline import Timeline
except Exception:  # noqa: BLE001
    Timeline = None  # type: ignore[assignment]


# ===== 主题配色（与 launcher / main_window 保持一致）=====
DARK_BG = "#1e1e2e"
PANEL_BG = "#252535"
ACCENT = "#3b82f6"
TEXT_COLOR = "#e0e0e0"
SUBTEXT_COLOR = "#9ca3af"
DIVIDER_COLOR = "#2d2d3f"


EDITOR_QSS = f"""
QWidget#EditorWidget {{
    background-color: {DARK_BG};
}}
QSplitter::handle {{
    background-color: {DIVIDER_COLOR};
}}
QSplitter::handle:horizontal {{
    width: 2px;
}}
QSplitter::handle:vertical {{
    height: 2px;
}}
QLabel#placeholderLabel {{
    color: {SUBTEXT_COLOR};
    font-size: 13px;
    background: transparent;
}}
"""


class _Placeholder(QWidget):
    """兄弟组件缺失时的占位部件"""

    def __init__(self, title: str, parent=None):
        super().__init__(parent)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setAlignment(Qt.AlignCenter)
        lbl = QLabel(title)
        lbl.setObjectName("placeholderLabel")
        lbl.setAlignment(Qt.AlignCenter)
        layout.addWidget(lbl)


class EditorWidget(QWidget):
    """编辑器中央容器

    垂直布局：
      顶部工具栏（Toolbar）
      主体（垂直分割器）
        ├─ 中间水平分割器：左侧面板 / 画布 / 右侧检查器
        └─ 底部时间轴：场景导航 + 时间轴

    通过 ``project_store`` 的信号驱动各子组件刷新。
    """

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setObjectName("EditorWidget")
        self.setStyleSheet(EDITOR_QSS)

        # 子组件引用
        self.toolbar: Toolbar = None
        self.left_panel = None
        self.canvas = None
        self.inspector = None
        self.scene_navigator = None
        self.timeline = None

        self._build_ui()
        self._connect_store()
        self._refresh_all()

    # ===== UI 构建 =====

    def _build_ui(self):
        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # 顶部工具栏
        self.toolbar = Toolbar(self)
        root.addWidget(self.toolbar)

        # 主体：垂直分割（中间三栏 + 底部时间轴），可拖拽调整高度
        body = QSplitter(Qt.Vertical)
        body.setHandleWidth(2)
        body.setChildrenCollapsible(False)

        # 中间水平分割器：左侧面板 / 画布 / 右侧检查器
        center = QSplitter(Qt.Horizontal)
        center.setHandleWidth(2)
        center.setChildrenCollapsible(False)

        self.left_panel = self._create_left_panel()
        self.canvas = self._create_canvas()
        self.inspector = self._create_inspector()

        center.addWidget(self.left_panel)
        center.addWidget(self.canvas)
        center.addWidget(self.inspector)
        # 分割比例：左面板 250px、画布自适应、检查器 300px
        center.setSizes([250, 600, 300])
        center.setStretchFactor(0, 0)  # 左面板不随窗口拉伸
        center.setStretchFactor(1, 1)  # 画布自适应
        center.setStretchFactor(2, 0)  # 检查器不随窗口拉伸
        self.left_panel.setMinimumWidth(180)
        self.inspector.setMinimumWidth(220)

        body.addWidget(center)

        # 底部时间轴：场景导航 + 时间轴
        bottom = self._create_bottom_panel()
        body.addWidget(bottom)
        body.setSizes([560, 240])
        body.setStretchFactor(0, 1)
        body.setStretchFactor(1, 0)
        bottom.setMinimumHeight(160)

        root.addWidget(body, 1)

    # ===== 子组件创建（带占位回退）=====

    def _create_left_panel(self):
        if LeftPanel is not None:
            try:
                return LeftPanel(self)
            except Exception as e:  # noqa: BLE001
                print(f"[EditorWidget] LeftPanel 实例化失败：{e}")
        return _Placeholder("左侧面板\n（LeftPanel 尚未实现）", self)

    def _create_canvas(self):
        if CanvasPreview is not None:
            try:
                return CanvasPreview(self)
            except Exception as e:  # noqa: BLE001
                print(f"[EditorWidget] CanvasPreview 实例化失败：{e}")
        return _Placeholder("画布预览\n（CanvasPreview 尚未实现）", self)

    def _create_inspector(self):
        if Inspector is not None:
            try:
                return Inspector(self)
            except Exception as e:  # noqa: BLE001
                print(f"[EditorWidget] Inspector 实例化失败：{e}")
        return _Placeholder("属性检查器\n（Inspector 尚未实现）", self)

    def _create_bottom_panel(self) -> QWidget:
        """底部时间轴区域：标题栏 + 场景导航 + 时间轴"""
        panel = QWidget()
        panel.setStyleSheet(f"background-color: {PANEL_BG};")

        v = QVBoxLayout(panel)
        v.setContentsMargins(0, 0, 0, 0)
        v.setSpacing(0)

        # 标题栏（水平布局）
        header = QWidget()
        header.setFixedHeight(26)
        header.setStyleSheet(
            f"background-color: {PANEL_BG}; border-top: 1px solid {DIVIDER_COLOR};"
        )
        h = QHBoxLayout(header)
        h.setContentsMargins(10, 0, 10, 0)
        title = QLabel("时间轴")
        title.setStyleSheet(
            f"color: {SUBTEXT_COLOR}; font-size: 12px; background: transparent;"
        )
        h.addWidget(title)
        h.addStretch(1)
        v.addWidget(header)

        # 场景导航
        self.scene_navigator = self._create_scene_navigator()
        v.addWidget(self.scene_navigator)

        # 时间轴
        self.timeline = self._create_timeline()
        v.addWidget(self.timeline, 1)

        return panel

    def _create_scene_navigator(self):
        if SceneNavigator is not None:
            try:
                return SceneNavigator(self)
            except Exception as e:  # noqa: BLE001
                print(f"[EditorWidget] SceneNavigator 实例化失败：{e}")
        ph = _Placeholder("场景导航（SceneNavigator 尚未实现）", self)
        ph.setFixedHeight(40)
        return ph

    def _create_timeline(self):
        if Timeline is not None:
            try:
                return Timeline(self)
            except Exception as e:  # noqa: BLE001
                print(f"[EditorWidget] Timeline 实例化失败：{e}")
        return _Placeholder("时间轴\n（Timeline 尚未实现）", self)

    # ===== 信号连接：project_store -> 各子组件更新方法 =====

    def _connect_store(self):
        ps = project_store
        # 数据变更：刷新画布 / 时间轴 / 场景导航 / 检查器
        ps.data_changed.connect(self._refresh_views)
        # 指定场景变更：刷新画布与时间轴（携带场景 ID）
        ps.scene_changed.connect(self._on_scene_changed)
        # 元数据变更：刷新场景导航
        ps.meta_changed.connect(self._refresh_scene_navigator)
        # 素材 / 角色 / 变量变更：刷新左侧面板
        ps.asset_changed.connect(self._refresh_left_panel)
        ps.character_changed.connect(self._refresh_left_panel)
        ps.variable_changed.connect(self._refresh_left_panel)

        # 工具栏：添加节点后自动选中新节点
        self.toolbar.node_added.connect(self._on_node_added)
        # 工具栏：设置按钮 -> 打开设置对话框
        self.toolbar.settings_requested.connect(self._on_settings)
        # 工具栏：问题面板切换 -> 打开问题面板对话框
        self.toolbar.problems_toggled.connect(self._on_problems_toggled)

    # ===== 刷新方法 =====

    def _refresh_all(self):
        """初始刷新所有视图"""
        self._refresh_views()
        self._refresh_left_panel()

    def _refresh_views(self):
        """刷新画布 / 时间轴 / 场景导航 / 检查器"""
        self._safe_call(self.canvas, "refresh")
        self._safe_call(self.timeline, "refresh")
        self._safe_call(self.scene_navigator, "refresh")
        self._safe_call(self.inspector, "refresh")

    def _on_scene_changed(self, scene_id: str):
        """指定场景变更：刷新画布与时间轴"""
        self._safe_call(self.canvas, "set_scene", scene_id)
        self._safe_call(self.timeline, "set_scene", scene_id)
        self._safe_call(self.inspector, "refresh")

    def _refresh_scene_navigator(self):
        self._safe_call(self.scene_navigator, "refresh")

    def _refresh_left_panel(self):
        self._safe_call(self.left_panel, "refresh")

    def _on_node_added(self, scene_id: str, node_id: str):
        """工具栏添加节点后，自动选中新节点"""
        self._safe_call(self.canvas, "select_node", scene_id, node_id)
        self._safe_call(self.timeline, "select_node", scene_id, node_id)
        self._safe_call(self.inspector, "set_node", scene_id, node_id)

    # ===== 对话框处理 =====

    def _on_settings(self):
        """打开项目设置对话框"""
        try:
            from ui.modals.settings_dialog import SettingsDialog
            dlg = SettingsDialog(self)
            dlg.exec()
        except Exception as e:
            print(f"[EditorWidget] 设置对话框打开失败：{e}")

    def _on_problems_toggled(self, visible: bool):
        """切换问题面板：打开问题面板对话框"""
        if not visible:
            return
        try:
            from ui.modals.problems_dialog import ProblemsDialog
            dlg = ProblemsDialog(self)
            dlg.problem_activated.connect(self._on_problem_activated)
            dlg.exec()
        except Exception as e:
            print(f"[EditorWidget] 问题面板对话框打开失败：{e}")
        finally:
            # 对话框关闭后重置工具栏按钮状态
            self.toolbar.set_problems_visible(False)

    def _on_problem_activated(self, scene_id: str, node_id: str):
        """双击问题项时跳转到对应节点"""
        project_store.set_current_scene(scene_id)
        self._safe_call(self.canvas, "select_node", scene_id, node_id)
        self._safe_call(self.timeline, "select_node", scene_id, node_id)
        self._safe_call(self.inspector, "set_node", scene_id, node_id)

    @staticmethod
    def _safe_call(widget, method_name: str, *args):
        """安全调用部件方法；方法不存在时静默跳过（兼容占位部件）

        各子组件实现以下约定方法即可被自动驱动：
        - LeftPanel.refresh()
        - CanvasPreview.refresh() / set_scene(scene_id) / select_node(scene_id, node_id)
        - Timeline.refresh() / set_scene(scene_id) / select_node(scene_id, node_id)
        - SceneNavigator.refresh()
        - Inspector.refresh() / set_node(scene_id, node_id)
        """
        method = getattr(widget, method_name, None)
        if callable(method):
            method(*args)
