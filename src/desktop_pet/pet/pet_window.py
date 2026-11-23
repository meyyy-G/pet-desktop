import math

from PySide6.QtCore import QEvent, Qt, QTimer
from PySide6.QtGui import QAction, QCloseEvent, QMouseEvent
from PySide6.QtWidgets import QApplication, QLabel, QMenu, QMessageBox, QWidget

from .animation import PetAnimation
from .behavior_state_machine import PetBehaviorStateMachine
from .pet_controller import PetAction, PetActionRequest, PetController
from .pet_physics import PetPhysics
from .pet_state_store import PetStateStore
from .state_decay import PetStateDecay
from ..settings import SettingsStore
from .status_panel import PetNeedIndicator, StatusPanel
from ..diary.diary_window import DiaryWindow


class PetWindow(QWidget):
    def __init__(self):
        super().__init__()

        self.settings = SettingsStore.load()
        self.state_store = PetStateStore()
        loaded_state = self.state_store.load()
        self.state = loaded_state.state
        self.diary_window = None

        self._layout_window_width: int | None = None
        self._layout_pet_x: int | None = None

        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setWindowTitle("My Pet")
        self._apply_window_flags()

        self.pet_label = QLabel(self)
        self.pet_label.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.pet_label.setMouseTracking(True)
        self.pet_label.setCursor(Qt.CursorShape.OpenHandCursor)
        self.pet_label.installEventFilter(self)
        self.setMouseTracking(True)
        self._hover_last_global = None

        self.status_panel = StatusPanel(self)
        self.need_indicator = PetNeedIndicator(self)
        self.need_indicator.visibility_changed.connect(
            self._update_overlay_positions
        )
        self.need_indicator.initialize(
            self.state.satiety,
            self.state.mood,
            self.state.energy,
        )

        self.animation = PetAnimation(self.settings.scale, self)
        self.animation.frame_changed.connect(self._show_frame)
        self.animation.start()
        self.behavior = PetBehaviorStateMachine(self.animation, self)
        self.state_decay = PetStateDecay(
            self.state,
            loaded_state.times,
            self.state_store,
            self,
        )
        self.state_decay.values_changed.connect(
            self.need_indicator.update_values
        )
        self.controller = PetController(
            self.state,
            self.behavior,
            self.state_decay,
            self,
        )
        self.controller.status_requested.connect(self.status_panel.show_status)
        self.controller.care_hint_changed.connect(self.need_indicator.set_care_hint)
        self.controller.care_hint_requested.connect(self.need_indicator.show_care_hint)
        self.controller.position_save_requested.connect(self._save_position)
        self.controller.wake_confirmation_requested.connect(
            self._confirm_wake_sleeping
        )
        self.state_decay.values_changed.connect(self.controller.update_need_values)
        self.behavior.treatment_due.connect(self.controller.complete_treatment)
        self.animation.state_finished.connect(self.controller.animation_finished)
        self.controller.update_need_values(
            self.state.satiety,
            self.state.mood,
            self.state.energy,
        )
        self.state_decay.save()

        self.physics = PetPhysics(self, self)
        self.physics.clicked.connect(
            lambda: self.controller.request(
                PetActionRequest(PetAction.SHOW_STATUS)
            )
        )
        self.physics.drag_started.connect(
            lambda: self.controller.request(PetActionRequest(PetAction.CARRY_STARTED))
        )
        self.physics.landed.connect(
            lambda: self.controller.request(PetActionRequest(PetAction.CARRY_FINISHED))
        )

        self.move(self.settings.x, self.settings.y)
        QTimer.singleShot(0, self._move_inside_available_screen)

    def _apply_window_flags(self) -> None:
        flags = Qt.WindowType.FramelessWindowHint | Qt.WindowType.Tool

        if self.settings.always_on_top:
            flags |= Qt.WindowType.WindowStaysOnTopHint

        self.setWindowFlags(flags)

    def _show_frame(self, pixmap) -> None:
        indicator_space = (
            self.need_indicator.SIZE - self.need_indicator.PET_OVERLAP
        )
        top_space = self.status_panel.top_space + indicator_space

        window_width = max(pixmap.width(), self.status_panel.PANEL_WIDTH)
        window_height = pixmap.height() + top_space
        self.resize(window_width, window_height)

        pet_x = (window_width - pixmap.width()) // 2
        pet_y = top_space
        self._layout_window_width = window_width
        self._layout_pet_x = pet_x

        self.pet_label.setPixmap(pixmap)
        self.pet_label.resize(pixmap.size())
        self.pet_label.move(pet_x, pet_y)

        self._update_overlay_positions()

    def _move_inside_available_screen(self) -> None:
        """Ensure a saved/default position cannot leave the pet off-screen."""
        app = QApplication.instance()
        if app is None:
            return

        screen = app.screenAt(self.frameGeometry().center()) or app.primaryScreen()
        if screen is None:
            return

        available = screen.availableGeometry()
        x = max(
            available.left(),
            min(self.x(), available.right() - self.width() + 1),
        )
        y = max(
            available.top(),
            min(self.y(), available.bottom() - self.height() + 1),
        )
        self.move(x, y)

    def _update_overlay_positions(self, visible: bool | None = None) -> None:
        if self._layout_window_width is None or self._layout_pet_x is None:
            return

        indicator_space = (
            self.need_indicator.SIZE - self.need_indicator.PET_OVERLAP
        )
        panel_y = 0 if not self.need_indicator.isHidden() else indicator_space
        self.status_panel.update_position(
            self._layout_window_width,
            self._layout_pet_x,
            panel_y,
        )

        window_width = self._layout_window_width
        pet_x = self._layout_pet_x
        indicator_x = max(
            0,
            min(
                window_width - self.need_indicator.width(),
                pet_x + self.need_indicator.PET_X_OFFSET,
            ),
        )
        self.need_indicator.move(
            indicator_x,
            self.status_panel.top_space,
        )
        self.need_indicator.raise_()

    def mousePressEvent(self, event: QMouseEvent) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            self.physics.press(event)

        super().mousePressEvent(event)

    def eventFilter(self, watched, event) -> bool:
        if watched is self.pet_label:
            if event.type() == QEvent.Type.MouseButtonPress:
                self._finish_hover_interaction()
                self.pet_label.setCursor(Qt.CursorShape.ClosedHandCursor)
            elif event.type() == QEvent.Type.MouseButtonRelease:
                self.pet_label.setCursor(Qt.CursorShape.OpenHandCursor)
            elif event.type() == QEvent.Type.MouseMove:
                if event.buttons() != Qt.MouseButton.NoButton:
                    self._finish_hover_interaction()
                elif self._point_hits_pet(event.position().toPoint()):
                    current = event.globalPosition()
                    if self._hover_last_global is not None:
                        distance = math.hypot(
                            current.x() - self._hover_last_global.x(),
                            current.y() - self._hover_last_global.y(),
                        )
                        self.controller.request(PetActionRequest(
                            PetAction.HOVER_MOVED,
                            payload={"distance": distance},
                        ))
                    self._hover_last_global = current
                else:
                    self._finish_hover_interaction()
            elif event.type() == QEvent.Type.Leave:
                self._finish_hover_interaction()
        return super().eventFilter(watched, event)

    def _point_hits_pet(self, point) -> bool:
        pixmap = self.pet_label.pixmap()
        if pixmap is None or pixmap.isNull():
            return False
        if not (0 <= point.x() < pixmap.width() and 0 <= point.y() < pixmap.height()):
            return False
        return pixmap.toImage().pixelColor(point).alpha() > 16

    def _finish_hover_interaction(self) -> None:
        self._hover_last_global = None
        self.controller.request(PetActionRequest(PetAction.HOVER_FINISHED))

    def mouseMoveEvent(self, event: QMouseEvent) -> None:
        if event.buttons() & Qt.MouseButton.LeftButton:
            self.physics.move(event)
            event.accept()
            return

        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event: QMouseEvent) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            self.physics.release(event)
            event.accept()
            return

        super().mouseReleaseEvent(event)

    def mouseDoubleClickEvent(self, event: QMouseEvent) -> None:
        if event.button() == Qt.MouseButton.LeftButton:
            if not self.controller.interaction_allowed():
                event.accept()
                return

            self.physics.handle_double_click()
            if not self.controller.is_sleeping:
                self.controller.register_interaction()
            self._open_diary_window()
            event.accept()
            return

        super().mouseDoubleClickEvent(event)

    def contextMenuEvent(self, event) -> None:
        menu = QMenu(self)

        self._add_action(menu,"打开今日手帐", self._open_diary_window)

        menu.addSeparator()

        self._add_action(menu, "喂小猫", self._feed)
        self._add_action(menu, "陪小猫玩", self._play)
        self._add_action(menu, "让小猫睡觉", self._sleep)

        if self.behavior.is_sick:
            self._add_action(menu, "治疗", self._treat)

        menu.addSeparator()

        top_action = QAction("窗口置顶", self)
        top_action.setCheckable(True)
        top_action.setChecked(self.settings.always_on_top)
        top_action.triggered.connect(self._toggle_always_on_top)
        menu.addAction(top_action)

        menu.addSeparator()
        self._add_action(menu, "退出", self._quit_app)
        menu.exec(event.globalPos())

    def _quit_app(self) -> None:
        if self.diary_window is not None and self.diary_window.isVisible():
            closed = self.diary_window.close()

            # 用户点击 Cancel，停止退出
            if not closed:
                return

        self._save_position()
        self.state_decay.save()

        app = QApplication.instance()
        if app is not None:
            app.quit()

    def closeEvent(self, event: QCloseEvent) -> None:
        self._save_position()
        self.state_decay.save()
        super().closeEvent(event)

    def _add_action(self, menu: QMenu, text: str, callback) -> None:
        action = QAction(text, self)
        action.triggered.connect(callback)
        menu.addAction(action)

    def _feed(self) -> None:
        self.controller.request(PetActionRequest(PetAction.FEED))

    def _play(self) -> None:
        self.controller.request(PetActionRequest(PetAction.PLAY))

    def _sleep(self) -> None:
        self.controller.request(PetActionRequest(PetAction.SLEEP))

    def _treat(self) -> None:
        self.controller.request(PetActionRequest(PetAction.TREAT))

    def _confirm_wake_sleeping(self) -> None:
        result = QMessageBox.question(
            self,
            "唤醒小猫",
            "小猫正在睡觉，要现在唤醒它吗？",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
            QMessageBox.StandardButton.No,
        )
        if result == QMessageBox.StandardButton.Yes:
            self.controller.wake_sleeping()

    def _toggle_always_on_top(self, enabled: bool) -> None:
        self.settings.always_on_top = enabled
        self._save_position()
        self._apply_window_flags()
        self.show()

    def _save_position(self) -> None:
        self.settings.x = self.x()
        self.settings.y = self.y()
        profile = SettingsStore.load()
        self.settings.display_name = profile.display_name
        self.settings.avatar_file = profile.avatar_file
        SettingsStore.save(self.settings)

    def _open_diary_window(self) -> None:
        if self.diary_window is None:
            self.diary_window = DiaryWindow()

            self.diary_window.typing_triggered.connect(
                self._start_typing_animation
            )
            self.diary_window.page_changed.connect(
                self._handle_diary_page_changed
            )
            self.diary_window.diary_closed.connect(
                self._finish_diary_animation
            )

        self.controller.request(PetActionRequest(
            PetAction.OPEN_DIARY,
            payload={"page": self.diary_window.bridge.current_page},
        ))

        self.diary_window.show()
        self.diary_window.raise_()
        self.diary_window.activateWindow()

    def _start_typing_animation(self) -> None:
        self.controller.request(PetActionRequest(PetAction.DIARY_TYPING))

    def _finish_diary_animation(self) -> None:
        self.controller.request(PetActionRequest(PetAction.DIARY_CLOSED))

    def _handle_diary_page_changed(self, page_name: str) -> None:
        self.controller.request(PetActionRequest(
            PetAction.DIARY_PAGE_CHANGED,
            payload={"page": page_name},
        ))
