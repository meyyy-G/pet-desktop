from PySide6.QtCore import QUrl, Signal
from PySide6.QtGui import QIcon
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtWebEngineCore import QWebEngineSettings
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QMessageBox, QVBoxLayout, QWidget

from ..paths import JOURNAL_ICON_FILE, WEB_ASSETS_DIR, WEB_DIR
from .diary_bridge import DiaryBridge


class DiaryWindow(QWidget):
    typing_triggered = Signal()
    page_changed = Signal(str)
    diary_closed = Signal()

    @staticmethod
    def minimum_size_for_page(page_name: str) -> tuple[int, int]:
        # Home and Task keep their fixed Figma compositions, with the summary collapsed.
        return (1050, 720) if page_name in {"home", "task"} else (720, 480)

    def _set_page_minimum(self, page_name: str) -> None:
        self.setMinimumSize(*self.minimum_size_for_page(page_name))

    def __init__(self):
        super().__init__()

        self.setWindowTitle("今日手帐")
        self.setWindowIcon(QIcon(str(JOURNAL_ICON_FILE)))
        # Start with the confirmed 1280 x 720 presentation window when possible.
        available_geometry = self.screen().availableGeometry()
        default_width = min(1280, available_geometry.width())
        default_height = min(720, available_geometry.height())
        self._set_page_minimum("home")
        self.resize(default_width, default_height)
        self.move(
            available_geometry.x() + (available_geometry.width() - default_width) // 2,
            available_geometry.y() + (available_geometry.height() - default_height) // 2,
        )

        self.web_view = QWebEngineView(self)
        self.web_view.settings().setAttribute(
            QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls,
            True,
        )

        self.bridge = DiaryBridge()
        self.bridge.typing_triggered.connect(self.typing_triggered.emit)
        self.bridge.page_changed.connect(self._set_page_minimum)
        self.bridge.page_changed.connect(self.page_changed.emit)

        self.channel = QWebChannel(self)
        self.channel.registerObject("diaryBridge", self.bridge)
        self.web_view.page().setWebChannel(self.channel)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.web_view)

        # 正式加载独立的 Web 页面和拆分后的 JavaScript 模块。
        html_path = WEB_DIR / "index.html"
        html = html_path.read_text(encoding="utf-8")

        # Web code remains in src/desktop_pet/web while all visual assets live
        # under the single project-level assets directory. Resolve those image
        # URLs at runtime so the same layout works from source and PyInstaller.
        asset_base_url = QUrl.fromLocalFile(
            str(WEB_ASSETS_DIR.resolve()) + "/"
        ).toString()
        # Resolve fonts first: their source path also contains "./assets/",
        # which the generic SVG replacement below would otherwise corrupt.
        html = html.replace(
            "../../../assets/web/font/fonts.css",
            f"{asset_base_url}font/fonts.css",
        )
        html = html.replace(
            "./assets/Head.png",
            f"{asset_base_url}Head.png",
        )
        html = html.replace("./assets/", f"{asset_base_url}svg/")

        web_base_url = QUrl.fromLocalFile(str(WEB_DIR.resolve()) + "/")
        self.web_view.setHtml(html, web_base_url)

    def _save_from_web(self):
        self.bridge.saveTodayEntry(self.bridge.current_text)

    def _discard_from_web(self):
        self.bridge.discardTodayEntry()
    
    def closeEvent(self, event):
        if not self.bridge.has_unsaved_changes:
            self.diary_closed.emit()
            event.accept()
            return

        result = QMessageBox.question(
            self,
            "保存手帐",
            "当前内容还没有保存，要先保存吗？",
            QMessageBox.StandardButton.Save
            | QMessageBox.StandardButton.Discard
            | QMessageBox.StandardButton.Cancel,
            QMessageBox.StandardButton.Save,
        )

        if result == QMessageBox.StandardButton.Save:
            self._save_from_web()
            self.diary_closed.emit()
            event.accept()
            return

        if result == QMessageBox.StandardButton.Discard:
            self._discard_from_web()
            self.diary_closed.emit()
            event.accept()
            return

        event.ignore()
