from pathlib import Path

from PySide6.QtCore import QUrl, Signal
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtWebEngineCore import QWebEngineSettings
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QMessageBox, QVBoxLayout, QWidget

from .diary_bridge import DiaryBridge


class DiaryWindow(QWidget):
    typing_triggered = Signal()
    page_changed = Signal(str)
    diary_closed = Signal()

    def __init__(self):
        super().__init__()

        self.setWindowTitle("今日手帐")
        self.resize(1440, 800)
        self.setMinimumSize(1100, 700)

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
        html_path = Path(__file__).resolve().parent.parent / "web" / "index.html"
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
