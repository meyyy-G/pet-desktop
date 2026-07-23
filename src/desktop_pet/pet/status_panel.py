from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QPixmap
from PySide6.QtWidgets import QLabel, QProgressBar, QVBoxLayout, QWidget

from ..paths import ASSETS_DIR


class StatusPanel(QWidget):
    PANEL_WIDTH = 220
    PANEL_HEIGHT = 44
    # 三种云朵的显示尺寸。尺寸保持原图比例，同时限制在桌宠窗口宽度内。
    CLOUD_SIZES = {
        "s": (120, 80),
        "m": (160, 86),
        "l": (220, 74),
    }
    # 文字区域比图片稍窄，避免文字碰到云朵边框。
    CLOUD_TEXT_WIDTHS = {
        "s": 92,
        "m": 132,
        "l": 190,
    }
    CLOUD_MAX_HEIGHT = max(height for _, height in CLOUD_SIZES.values())
    CLOUD_GAP = 10
    CLOUD_OVERLAP = 8
    AUTO_HIDE_MS = 3000

    def __init__(self, parent: QWidget):
        super().__init__(parent)

        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setFixedHeight(self.top_space)
        self.hide()

        self.bars_panel = QWidget(self)
        self.bars_panel.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.bars_panel.setFixedWidth(self.PANEL_WIDTH)

        self.cloud_label = QLabel(self)
        self.cloud_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._cloud_variant = ""
        self._window_width = self.PANEL_WIDTH

        self._setup_cloud()
        self._setup_bars()

        self.hide_timer = QTimer(self)
        self.hide_timer.setSingleShot(True)
        self.hide_timer.timeout.connect(self.hide)

    @property
    def top_space(self) -> int:
        return self.PANEL_HEIGHT + self.CLOUD_GAP + self.CLOUD_MAX_HEIGHT - self.CLOUD_OVERLAP

    def _setup_cloud(self) -> None:
        self.message_label = QLabel("喵", self.cloud_label)
        self.message_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.message_label.setStyleSheet("""
            QLabel {
                color: #3a2f2a;
                background: transparent;
                font-size: 13px;
                font-weight: 600;
            }
        """)
        self._apply_cloud_variant("s")

    def _select_cloud_variant(self, message: str) -> str:
        """根据文字的真实显示宽度选择小、中、大云朵。"""
        text_width = self.message_label.fontMetrics().horizontalAdvance(message)
        if text_width <= self.CLOUD_TEXT_WIDTHS["s"]:
            return "s"
        if text_width <= self.CLOUD_TEXT_WIDTHS["m"]:
            return "m"
        return "l"

    def _apply_cloud_variant(self, variant: str) -> None:
        """切换云朵图片和尺寸，并重新安排内部文字区域。"""
        if variant == self._cloud_variant:
            return

        cloud_width, cloud_height = self.CLOUD_SIZES[variant]
        cloud_path = ASSETS_DIR / "images" / "ui" / f"{variant}.png"
        cloud_pixmap = QPixmap(str(cloud_path))

        self.cloud_label.setFixedSize(cloud_width, cloud_height)
        if cloud_pixmap.isNull():
            self.cloud_label.clear()
        else:
            self.cloud_label.setPixmap(
                cloud_pixmap.scaled(
                    cloud_width,
                    cloud_height,
                    Qt.AspectRatioMode.KeepAspectRatio,
                    Qt.TransformationMode.SmoothTransformation,
                )
            )

        text_width = self.CLOUD_TEXT_WIDTHS[variant]
        text_x = (cloud_width - text_width) // 2
        # 文字放在云朵主体的上半部，给底部的小尾巴留出空间。
        self.message_label.setGeometry(text_x, 10, text_width, max(28, cloud_height - 32))
        self._cloud_variant = variant
        self._position_cloud()

    def _setup_bars(self) -> None:
        self.hunger_bar = QProgressBar(self.bars_panel)
        self.hunger_bar.setFixedHeight(18)
        self.hunger_bar.setRange(0, 100)
        self.hunger_bar.setTextVisible(True)
        self.hunger_bar.setFormat("饱食度 %p%")
        self.hunger_bar.setStyleSheet("""
            QProgressBar {
                height: 14px;
                border: 1px solid rgba(120, 92, 70, 160);
                border-radius: 5px;
                background: rgba(255, 255, 255, 190);
                color: #3a2f2a;
                font-size: 12px;
            }
            QProgressBar::chunk {
                border-radius: 5px;
                background: #f0a15f;
            }
        """)

        self.mood_bar = QProgressBar(self.bars_panel)
        self.mood_bar.setFixedHeight(18)
        self.mood_bar.setRange(0, 100)
        self.mood_bar.setTextVisible(True)
        self.mood_bar.setFormat("Mood %p%")
        self.mood_bar.setStyleSheet("""
            QProgressBar {
                height: 14px;
                border: 1px solid rgba(120, 92, 70, 160);
                border-radius: 5px;
                background: rgba(255, 255, 255, 190);
                color: #3a2f2a;
                font-size: 12px;
            }
            QProgressBar::chunk {
                border-radius: 5px;
                background: #f3c84f;
            }
        """)

        layout = QVBoxLayout(self.bars_panel)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(8)
        layout.addWidget(self.hunger_bar)
        layout.addWidget(self.mood_bar)

    def update_position(self, window_width: int, pet_x: int) -> None:
        self._window_width = window_width
        self.setGeometry(0, 0, window_width, self.top_space)

        bars_x = (window_width - self.PANEL_WIDTH) // 2
        self.bars_panel.move(bars_x, 0)

        self._position_cloud()

    def _position_cloud(self) -> None:
        """让不同宽度的云朵始终在桌宠窗口中水平居中、底部对齐。"""
        cloud_x = max(0, (self._window_width - self.cloud_label.width()) // 2)
        cloud_y = (
            self.PANEL_HEIGHT
            + self.CLOUD_GAP
            + self.CLOUD_MAX_HEIGHT
            - self.cloud_label.height()
        )
        self.cloud_label.move(cloud_x, cloud_y)

    def show_status(self, message: str, hunger: int, mood: int) -> None:
        variant = self._select_cloud_variant(message)
        self._apply_cloud_variant(variant)

        # 最大云朵仍放不下时使用省略号，保证文字不会溢出边框。
        available_width = self.CLOUD_TEXT_WIDTHS[variant]
        visible_message = self.message_label.fontMetrics().elidedText(
            message,
            Qt.TextElideMode.ElideRight,
            available_width,
        )
        self.message_label.setText(visible_message)
        self.hunger_bar.setValue(hunger)
        self.mood_bar.setValue(mood)

        self.show()
        self.raise_()
        self.cloud_label.raise_()
        self.hide_timer.start(self.AUTO_HIDE_MS)
