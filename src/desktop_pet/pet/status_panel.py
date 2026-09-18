from PySide6.QtCore import Qt, QTimer, Signal
from PySide6.QtGui import QPainter, QPixmap
from PySide6.QtWidgets import QLabel, QVBoxLayout, QWidget

from ..paths import ASSETS_DIR


class ImageProgressBar(QWidget):
    """使用图片纹理绘制宠物需求进度条。"""

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

        image_dir = ASSETS_DIR / "animations" / "cat_panel"
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
    BAR_COUNT = 3
    PANEL_HEIGHT = (
        ImageProgressBar.HEIGHT * BAR_COUNT
        + BAR_SPACING * (BAR_COUNT - 1)
    )
    AUTO_HIDE_MS = 3000
    DEFAULT_ENERGY = 100

    def __init__(self, parent: QWidget):
        super().__init__(parent)

        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setFixedHeight(self.top_space)
        self.hide()

        self.bars_panel = QWidget(self)
        self.bars_panel.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.bars_panel.setFixedWidth(self.PANEL_WIDTH)

        self._setup_bars()

        self.hide_timer = QTimer(self)
        self.hide_timer.setSingleShot(True)
        self.hide_timer.timeout.connect(self.hide)

    @property
    def top_space(self) -> int:
        return self.PANEL_HEIGHT

    def _setup_bars(self) -> None:
        self.satiety_bar = ImageProgressBar(
            "healthbar.png",
            "饱食度",
            self.bars_panel,
        )
        self.mood_bar = ImageProgressBar(
            "moodbar.png",
            "心情值",
            self.bars_panel,
        )
        self.energy_bar = ImageProgressBar(
            "energybar.png",
            "精力值",
            self.bars_panel,
        )

        layout = QVBoxLayout(self.bars_panel)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(self.BAR_SPACING)
        layout.setAlignment(Qt.AlignmentFlag.AlignHCenter)
        layout.addWidget(self.satiety_bar)
        layout.addWidget(self.mood_bar)
        layout.addWidget(self.energy_bar)
        self.bars_panel.setFixedHeight(self.PANEL_HEIGHT)

    def update_position(
        self,
        window_width: int,
        pet_x: int,
        panel_y: int = 0,
    ) -> None:
        self.setGeometry(0, panel_y, window_width, self.top_space)

        bars_x = (window_width - self.PANEL_WIDTH) // 2
        self.bars_panel.move(bars_x, 0)

    def show_status(
        self,
        satiety: int,
        mood: int,
        energy: int = DEFAULT_ENERGY,
    ) -> None:
        self.satiety_bar.setValue(satiety)
        self.mood_bar.setValue(mood)
        self.energy_bar.setValue(energy)

        self.show()
        self.raise_()
        self.hide_timer.start(self.AUTO_HIDE_MS)


class PetNeedIndicator(QLabel):
    """独立显示宠物需求提示图，不参与 PetAnimation 状态切换。"""

    visibility_changed = Signal(bool)

    SIZE = 90
    PET_OVERLAP = 12
    PET_X_OFFSET = -5
    DISPLAY_MS = 10_000
    TRANSIENT_DISPLAY_MS = {
        "hungry": 30_000,
        "sleep": 30_000,
    }

    def __init__(self, parent: QWidget):
        super().__init__(parent)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.setFixedSize(self.SIZE, self.SIZE)

        self._values: tuple[int, int, int] | None = None
        self._current_hint: str | None = None
        self._is_persistent = False
        self._care_hint: str | None = None
        self._pixmaps = self._load_pixmaps()

        self.hide_timer = QTimer(self)
        self.hide_timer.setSingleShot(True)
        self.hide_timer.timeout.connect(self._finish_transient)
        self.hide()

    @property
    def current_hint(self) -> str | None:
        return self._current_hint

    @property
    def is_persistent(self) -> bool:
        return self._is_persistent

    def initialize(
        self,
        satiety: int,
        mood: int,
        energy: int,
    ) -> None:
        """使用当前存档值初始化需求提示状态。"""
        self._values = (satiety, mood, energy)
        self.update_values(satiety, mood, energy)

    def update_values(self, satiety: int, mood: int, energy: int) -> None:
        new_values = (satiety, mood, energy)
        old_values = self._values
        self._values = new_values

        if self._care_hint is not None:
            self._show_hint(self._care_hint, persistent=True)
            return

        persistent_hint = self._persistent_hint(*new_values)
        if persistent_hint is not None:
            self._show_hint(persistent_hint, persistent=True)
            return

        transient_hint = None
        if old_values is not None:
            transient_hint = self._transient_hint(old_values, new_values)

        if transient_hint is not None:
            self._show_hint(transient_hint, persistent=False)
            return

        if self._is_persistent:
            self._clear_hint()

    def set_care_hint(self, hint: str | None) -> None:
        """高优先级生病/治疗提示；设置后不被普通 Need 提示覆盖。"""
        self._care_hint = hint
        if hint is not None:
            self._show_hint(hint, persistent=True)
        elif self._values is not None:
            self.update_values(*self._values)

    def show_care_hint(self) -> None:
        """锁定期间点击小猫时，只重新显示当前状态提示。"""
        if self._care_hint is not None:
            self._show_hint(self._care_hint, persistent=True)

    @staticmethod
    def _persistent_hint(
        satiety: int,
        mood: int,
        energy: int,
    ) -> str | None:
        if satiety <= 15 or mood <= 15:
            return "sick"
        if satiety <= 25 and mood <= 25 and energy <= 25:
            return "upset"
        if satiety <= 25:
            return "angry"
        if satiety <= 50:
            return "hungry"
        if energy <= 25:
            return "sleep"
        if mood <= 50:
            return "upset"
        return None

    @staticmethod
    def _transient_hint(
        old_values: tuple[int, int, int],
        new_values: tuple[int, int, int],
    ) -> str | None:
        old_satiety, _, old_energy = old_values
        satiety, _, energy = new_values

        # 同一次更新只显示一个提示：hungry > sleep > upset。
        if old_satiety > 75 >= satiety:
            return "hungry"
        if old_energy > 50 >= energy:
            return "sleep"
        return None

    def _show_hint(self, hint: str, persistent: bool) -> None:
        pixmap = self._pixmaps.get(hint)
        if pixmap is None or pixmap.isNull():
            self._clear_hint()
            return

        was_hidden = self.isHidden()
        self._current_hint = hint
        self._is_persistent = persistent
        self.setPixmap(pixmap)
        self.show()
        self.raise_()
        if was_hidden:
            self.visibility_changed.emit(True)

        if persistent:
            self.hide_timer.stop()
        else:
            self.hide_timer.start(
                self.TRANSIENT_DISPLAY_MS.get(hint, self.DISPLAY_MS)
            )

    def _finish_transient(self) -> None:
        if self._values is None:
            self._clear_hint()
            return

        persistent_hint = self._persistent_hint(*self._values)
        if persistent_hint is None:
            self._clear_hint()
        else:
            self._show_hint(persistent_hint, persistent=True)

    def _clear_hint(self) -> None:
        was_visible = not self.isHidden()
        self.hide_timer.stop()
        self._current_hint = None
        self._is_persistent = False
        self.clear()
        self.hide()
        if was_visible:
            self.visibility_changed.emit(False)

    def _load_pixmaps(self) -> dict[str, QPixmap]:
        panel_dir = ASSETS_DIR / "animations" / "cat_thought"
        pixmaps = {}
        for hint in (
            "hungry",
            "angry",
            "sleep",
            "upset",
            "sick",
            "treating",
        ):
            pixmap = QPixmap(str(panel_dir / f"{hint}.png"))
            if not pixmap.isNull():
                pixmap = pixmap.scaled(
                    self.SIZE,
                    self.SIZE,
                    Qt.AspectRatioMode.KeepAspectRatio,
                    Qt.TransformationMode.SmoothTransformation,
                )
            pixmaps[hint] = pixmap
        return pixmaps
