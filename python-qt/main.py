#!/usr/bin/env python3
"""
影游工坊 - Python Qt 版本入口文件
零代码可视化视觉小说编辑器 (Shadow Game Workshop)

基于 PySide6 构建，可将项目编译导出为 Ren'Py 脚本包。

启动流程：
  1. 初始化 QApplication
  2. 显示启动器对话框（新建 / 导入 / 打开最近项目）
  3. 用户选择项目后进入编辑器主窗口
  4. 用户取消则退出应用

运行方式：
  cd python-qt
  python main.py
"""
from __future__ import annotations

import os
import sys


# ============================================================
# 路径设置：确保当前目录在 sys.path 中，使包内相对导入生效
# ============================================================
# main.py 所在目录即为项目根目录（python-qt/）
_PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
if _PROJECT_DIR not in sys.path:
    sys.path.insert(0, _PROJECT_DIR)


def main():
    """应用入口"""
    from PySide6.QtWidgets import QApplication
    from PySide6.QtGui import QFont
    from ui.main_window import MainWindow

    app = QApplication(sys.argv)
    app.setApplicationName("影游工坊")
    app.setApplicationDisplayName("影游工坊")
    app.setOrganizationName("YingYouWorkshop")

    # 设置默认字体（确保中文显示正常）
    font = QFont()
    # 优先使用系统中文字体
    for family in ("Noto Sans CJK SC", "Microsoft YaHei", "PingFang SC",
                   "WenQuanYi Micro Hei", "Source Han Sans CN", "SimHei"):
        if font.exactMatch() or family in QFont().families():
            font.setFamily(family)
            break
    font.setPointSize(10)
    app.setFont(font)

    # 创建主窗口并启动
    window = MainWindow()
    if not window.startup():
        # 用户在启动器中取消，退出应用
        app.quit()
        return 0

    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
