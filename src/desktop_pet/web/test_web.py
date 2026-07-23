r"""独立测试正式的 web/index.html。

运行方式（在项目根目录执行）：
    .venv\Scripts\python.exe src\desktop_pet\web\test_web.py

这个启动器和正式程序加载同一个 web/index.html，用于单独调试 Web 页面。
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from PySide6.QtCore import QTimer, QUrl
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineSettings
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QApplication


# web/test_web.py -> desktop_pet -> src；把 src 加入模块搜索路径。
WEB_DIR = Path(__file__).resolve().parent
SRC_DIR = WEB_DIR.parents[1]
INDEX_FILE = WEB_DIR / "index.html"

if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from desktop_pet.diary.diary_bridge import DiaryBridge  # noqa: E402


class TestWebPage(QWebEnginePage):
    """把网页 Console 消息打印到终端，方便发现 JavaScript 错误。"""

    def javaScriptConsoleMessage(
        self,
        level: QWebEnginePage.JavaScriptConsoleMessageLevel,
        message: str,
        line_number: int,
        source_id: str,
    ) -> None:
        level_name = getattr(level, "name", str(level))
        source_name = Path(source_id).name if source_id else "unknown"
        print(f"[JavaScript {level_name}] {source_name}:{line_number} {message}")


def main() -> int:
    app = QApplication(sys.argv)

    view = QWebEngineView()
    page = TestWebPage(view)
    view.setPage(page)
    view.setWindowTitle("Diary Web Modules Test")
    view.resize(1440, 800)

    # 允许本地 HTML 加载本地 JS、CSS 和图片。
    page.settings().setAttribute(
        QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls,
        True,
    )

    bridge = DiaryBridge()
    channel = QWebChannel(page)
    channel.registerObject("diaryBridge", bridge)
    page.setWebChannel(channel)

    page.loadFinished.connect(
        lambda success: print(
            "测试页面加载成功。" if success else "测试页面加载失败，请查看上方错误。"
        )
    )

    # 测试启动器与正式 DiaryWindow 加载完全相同的页面。
    page.load(QUrl.fromLocalFile(str(INDEX_FILE)))
    view.show()

    # 仅供自动检查使用；平时不设置这个环境变量，窗口会保持打开。
    auto_close_ms = int(os.environ.get("PET_WEB_TEST_AUTO_CLOSE_MS", "0"))
    if auto_close_ms > 0:
        QTimer.singleShot(auto_close_ms, app.quit)

    # 保持 Python 对象引用，避免 WebChannel 使用期间被垃圾回收。
    view._test_bridge = bridge
    view._test_channel = channel

    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
