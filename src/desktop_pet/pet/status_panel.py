from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QPainter, QPixmap
from PySide6.QtWidgets import QLabel, QVBoxLayout, QWidget

from ..paths import ASSETS_DIR


class ImageProgressBar(QWidget):
    """使用项目图片绘制的进度条，按数值裁剪内容图而不拉伸纹理。"""

    WIDTH = 180
    HEIGHT = 38
    FILL_X = 6
    FILL_Y = 6
    FILL_WIDTH = 168
    FILL_HEIGHT = 27

    def __init__(self, fill_image: str, title: str, parent=None):
        super().__init__(parent)
        self._value = 0
        self._title = title
        self.setFixedSize(self.WIDTH, self.HEIGHT)

        image_dir = ASSETS_DIR / "images" / "ui"
        self._background = self._load_scaled(
            image_dir / "bar.png",
            self.WIDTH,
            self.HEIGHT,
        )
        self._fill = self._load_scaled(
            image_dir / fill_image,
            self.FILL_WIDTH,
            self.FILL_HEIGHT,
        )

    @staticmethod
    def _load_scaled(path, width: int, height: int) -> QPixmap:
        pixmap = QPixmap(str(path))
        if pixmap.isNull():
            return pixmap

        return pixmap.scaled(
            width,
            height,
            Qt.AspectRatioMode.IgnoreAspectRatio,
            Qt.TransformationMode.SmoothTransformation,
        )

    def setValue(self, value: int) -> None:
        """保持与原 QProgressBar 相同的调用方式。"""
        normalized_value = max(0, min(100, int(value)))
        if normalized_value == self._value:
            return

        self._value = normalized_value
        self.update()

    def paintEvent(self, event) -> None:
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform)

        if not self._background.isNull():
            painter.drawPixmap(0, 0, self._background)

        visible_width = round(self.FILL_WIDTH * self._value / 100)
        if visible_width > 0 and not self._fill.isNull():
            painter.save()
            painter.setClipRect(
                self.FILL_X,
                self.FILL_Y,
                visible_width,
                self.FILL_HEIGHT,
            )
            painter.drawPixmap(self.FILL_X, self.FILL_Y, self._fill)
            painter.restore()

        painter.setPen(Qt.GlobalColor.black)
        font = painter.font()
        font.setPixelSize(11)
        font.setBold(True)
        painter.setFont(font)
        painter.drawText(
            self.rect(),
            Qt.AlignmentFlag.AlignCenter,
            f"{self._title} {self._value}%",
        )


class StatusPanel(QWidget):
    PANEL_WIDTH = 220
    BAR_SPACING = 4
    PANEL_HEIGHT = ImageProgressBar.HEIGHT * 2 + BAR_SPACING
    # 三种云朵的显示尺寸。尺寸保持原图比例，同时限制在桌宠窗口宽度内。
    CLOUD_SIZES = {
        "s": (105, 70),
        "m": (140, 76),
        "l": (190, 64),
    }
    # 文字区域比图片稍窄，避免文字碰到云朵边框。
    CLOUD_TEXT_WIDTHS = {
        "s": 78,
        "m": 112,
        "l": 160,
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
        self.hunger_bar = ImageProgressBar(
            "red.png",
            "饱食度",
            self.bars_panel,
        )
        self.mood_bar = ImageProgressBar(
            "blue.png",
            "心情值",
            self.bars_panel,
        )

        layout = QVBoxLayout(self.bars_panel)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(self.BAR_SPACING)
        layout.setAlignment(Qt.AlignmentFlag.AlignHCenter)
        layout.addWidget(self.hunger_bar)
        layout.addWidget(self.mood_bar)
        self.bars_panel.setFixedHeight(self.PANEL_HEIGHT)

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
