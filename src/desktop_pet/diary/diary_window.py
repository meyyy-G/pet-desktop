from PySide6.QtCore import QUrl, Signal
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtWebEngineCore import QWebEngineSettings
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QMessageBox, QVBoxLayout, QWidget

from ..paths import WEB_DIR
from .diary_bridge import DiaryBridge


class DiaryWindow(QWidget):
    typing_triggered = Signal()
    page_changed = Signal(str)
    diary_closed = Signal()

    def __init__(self):
        super().__init__()

        self.setWindowTitle("今日手帐")
        # 默认以较小的普通窗口启动；用户最大化后由系统窗口和 Web 布局共同填满屏幕。
        available_geometry = self.screen().availableGeometry()
        default_width = min(1200, available_geometry.width())
        default_height = min(820, available_geometry.height())
        self.setMinimumSize(960, 700)
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
        self.bridge.page_changed.connect(self.page_changed.emit)

        self.channel = QWebChannel(self)
        self.channel.registerObject("diaryBridge", self.bridge)
        self.web_view.page().setWebChannel(self.channel)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(self.web_view)

        # 正式加载独立的 Web 页面和拆分后的 JavaScript 模块。
        html_path = WEB_DIR / "index.html"
        self.web_view.load(QUrl.fromLocalFile(str(html_path)))

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
