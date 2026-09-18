from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QAction, QCloseEvent, QMouseEvent
from PySide6.QtWidgets import QApplication, QLabel, QMenu, QWidget

from .animation import PetAnimation
from .behavior_state_machine import BehaviorState, PetBehaviorStateMachine
from .pet_physics import PetPhysics
from .pet_state_store import PetStateStore
from .state_decay import PetStateDecay
from ..settings import SettingsStore
from .status_panel import PetNeedIndicator, StatusPanel
from .need_rules import resolve_need_animation
from ..diary.diary_window import DiaryWindow


class PetWindow(QWidget):
    def __init__(self):
        super().__init__()

        self.settings = SettingsStore.load()
        self.state_store = PetStateStore()
        loaded_state = self.state_store.load()
        self.state = loaded_state.state
        self.diary_window = None

        self.woke_from_sleep_on_press = False
        self.is_diary_page_active = False
        self.has_started_typing = False
        self.typing_requested_during_open = False
        self._layout_window_width: int | None = None
        self._layout_pet_x: int | None = None

        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setWindowTitle("My Pet")
        self._apply_window_flags()

        self.pet_label = QLabel(self)
        self.pet_label.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)

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
        self.animation.state_finished.connect(self._handle_animation_finished)
        self.animation.start()
        self.behavior = PetBehaviorStateMachine(self.animation, self)
        self.behavior.update_need_animation(
            resolve_need_animation(
                self.state.satiety,
                self.state.mood,
                self.state.energy,
            )
        )
        if self.behavior.is_sick:
            self.need_indicator.set_care_hint("sick")
        self.behavior.treatment_due.connect(self._complete_treatment)

        self.state_decay = PetStateDecay(
            self.state,
            loaded_state.times,
            self.state_store,
            self,
        )
        self.state_decay.values_changed.connect(
            self.need_indicator.update_values
        )
        self.state_decay.values_changed.connect(
            self._update_need_animation
        )
        self.state_decay.save()

        self.physics = PetPhysics(self, self)
        self.physics.clicked.connect(self._touch_cat)
        self.physics.drag_started.connect(self._start_carry)
        self.physics.landed.connect(self._finish_landing)

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
            self.woke_from_sleep_on_press = (
                self.behavior.state is BehaviorState.TEMPORARY
                and self.animation.state == "sleeping"
            )

            if self.woke_from_sleep_on_press:
                self._register_interaction()
                self.state.current_animation = "idle"
                self._show_status()

            self.physics.press(event)

        super().mousePressEvent(event)

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
            if self._care_interaction_blocked():
                event.accept()
                return

            self.physics.handle_double_click()
            self._register_interaction()
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
        if self._care_interaction_blocked():
            return

        old_satiety = self.state.satiety
        self.state.feed()
        self._show_status()
        self._play_temporary(self.state.current_animation)
        self.state_decay.commit_manual_change(old_satiety)

    def _play(self) -> None:
        if self._care_interaction_blocked():
            return

        if not self.state.can_play():
            self._show_status()
            return

        old_satiety = self.state.satiety
        self.state.play()
        self._show_status()
        self._play_temporary(self.state.current_animation)
        self.state_decay.commit_manual_change(old_satiety)

    def _sleep(self) -> None:
        if self._care_interaction_blocked():
            return

        old_satiety = self.state.satiety
        self.state.sleep()
        self._show_status()
        self.behavior.play_temporary("sleeping")
        self.state_decay.commit_manual_change(old_satiety)

    def _touch_cat(self) -> None:
        self._save_position()

        if self._care_interaction_blocked():
            self.woke_from_sleep_on_press = False
            return

        if self.woke_from_sleep_on_press:
            self.woke_from_sleep_on_press = False
            return

        old_satiety = self.state.satiety
        self.state.touch()
        self._show_status()
        self.behavior.play_touch(1800)
        self.state_decay.commit_manual_change(old_satiety)

    def _start_carry(self) -> None:
        self.woke_from_sleep_on_press = False
        self._register_interaction()
        self.state.current_animation = "idle"
        self.behavior.play_temporary("carry")

    def _finish_landing(self) -> None:
        self._restore_after_carry()
        self._save_position()

    def _restore_after_carry(self) -> None:
        """拖拽结束后，根据日记窗口上下文恢复正确动画。"""
        diary_is_open = (
            self.diary_window is not None
            and self.diary_window.isVisible()
        )

        if not diary_is_open:
            self.behavior.finish_temporary()
            return

        if self.is_diary_page_active and self.has_started_typing:
            self.behavior.update_temporary_animation("diary_typing")
            return

        self.behavior.update_temporary_animation("diary_waiting")

        # 拖拽打断日记打开动画时，继续执行期间排队的首次输入请求。
        if (
            self.is_diary_page_active
            and self.typing_requested_during_open
        ):
            self.typing_requested_during_open = False
            self._start_typing_animation()

    def _show_status(self) -> None:
        self.status_panel.show_status(
            satiety=self.state.satiety,
            mood=self.state.mood,
            energy=self.state.energy,
        )

    def _update_need_animation(
        self,
        satiety: int,
        mood: int,
        energy: int,
    ) -> None:
        need_animation = resolve_need_animation(satiety, mood, energy)
        self.behavior.update_need_animation(need_animation)
        if self.behavior.is_sick:
            self.need_indicator.set_care_hint("sick")

    def _care_interaction_blocked(self) -> bool:
        """统一拦截 Sick/Treating 期间除 Carry 外的普通互动。"""
        if not self.behavior.is_care_locked:
            return False

        self.need_indicator.show_care_hint()
        return True

    def _treat(self) -> None:
        if not self.behavior.start_treating():
            return

        self.need_indicator.set_care_hint("treating")

    def _complete_treatment(self) -> None:
        if not self.behavior.is_treating:
            return

        self.state.satiety = 75
        self.state.mood = 75
        self.state.energy = 75
        self.state.current_animation = "idle"
        self.behavior.complete_treatment()
        self.need_indicator.set_care_hint(None)
        self.state_decay.commit_manual_change(self.state.satiety)

    def _register_interaction(self) -> None:
        """点击或拖拽重置行为无互动时间；数值衰减不受影响。"""
        self.behavior.register_interaction()
        self.state_decay.register_interaction()

    def _play_temporary(self, state: str, duration_ms: int = 2500) -> None:
        self.behavior.play_temporary(state, duration_ms)

    def _toggle_always_on_top(self, enabled: bool) -> None:
        self.settings.always_on_top = enabled
        self._save_position()
        self._apply_window_flags()
        self.show()

    def _save_position(self) -> None:
        self.settings.x = self.x()
        self.settings.y = self.y()
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

        self.is_diary_page_active = (
            self.diary_window.bridge.current_page == "diary"
        )
        self.has_started_typing = False
        self.typing_requested_during_open = False
        self.behavior.play_temporary("diary_open_enter")

        self.diary_window.show()
        self.diary_window.raise_()
        self.diary_window.activateWindow()

    def _start_typing_animation(self) -> None:
        if not self.is_diary_page_active:
            return

        if self.has_started_typing:
            return

        if self.animation.state in ("diary_open_enter", "diary_open_exit"):
            self.typing_requested_during_open = True
            return

        self.has_started_typing = True
        self.behavior.update_temporary_animation("diary_typing_enter")

    def _finish_diary_animation(self) -> None:
        self.is_diary_page_active = False
        self.has_started_typing = False
        self.typing_requested_during_open = False
        self.behavior.finish_temporary()

    def _handle_diary_page_changed(self, page_name: str) -> None:
        is_diary_page = page_name == "diary"

        if is_diary_page:
            self.is_diary_page_active = True
            self.has_started_typing = False
            if self.animation.state not in (
                "diary_open_enter",
                "diary_open_exit",
            ):
                self.behavior.update_temporary_animation("diary_waiting")
            return

        was_typing = self.is_diary_page_active and self.has_started_typing
        was_in_typing_animation = self.animation.state in (
            "diary_typing_enter",
            "diary_typing",
        )

        self.is_diary_page_active = False
        self.has_started_typing = False
        self.typing_requested_during_open = False

        if self.animation.state in ("diary_open_enter", "diary_open_exit"):
            return

        if was_typing or was_in_typing_animation:
            self.behavior.update_temporary_animation("diary_typing_exit")
        elif self.diary_window is not None and self.diary_window.isVisible():
            self.behavior.update_temporary_animation("diary_waiting")

    def _handle_animation_finished(self, state: str) -> None:
        if state == "diary_open_enter":
            if self.diary_window is not None and self.diary_window.isVisible():
                self.behavior.update_temporary_animation("diary_open_exit")
            else:
                self.behavior.finish_temporary()
            return

        if state == "diary_open_exit":
            if self.diary_window is None or not self.diary_window.isVisible():
                self.behavior.finish_temporary()
                return

            self.behavior.update_temporary_animation("diary_waiting")

            if self.is_diary_page_active and self.typing_requested_during_open:
                self.typing_requested_during_open = False
                self._start_typing_animation()
            return

        if state == "diary_typing_enter":
            if (
                self.diary_window is not None
                and self.diary_window.isVisible()
                and self.is_diary_page_active
                and self.has_started_typing
            ):
                self.behavior.update_temporary_animation("diary_typing")
            else:
                self.behavior.update_temporary_animation("diary_waiting")

            return

        if state == "diary_typing_exit":
            if self.diary_window is not None and self.diary_window.isVisible():
                self.behavior.update_temporary_animation("diary_waiting")
            else:
                self.behavior.finish_temporary()
            return
