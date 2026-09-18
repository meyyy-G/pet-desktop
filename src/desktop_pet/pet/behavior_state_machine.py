from enum import Enum

from PySide6.QtCore import QElapsedTimer, QObject, QTimer, Signal

from .animation import PetAnimation


class BehaviorState(Enum):
    """
    决定现在应该播放什么动画
    """

    IDLE = "idle"
    SITTING = "sitting"
    GAPING = "gaping"
    LAYDOWN = "laydown"
    NEED = "need"
    RECOVERING = "recovering"
    TEMPORARY = "temporary"
    SICK = "sick"
    TREATING = "treating"


class PetBehaviorStateMachine(QObject):
    """统一管理无互动行为和临时动作，避免多个逻辑争抢动画。"""

    state_changed = Signal(str)
    treatment_due = Signal()

    # 无互动 10/20/30 分钟后依次进入坐下、打哈欠和躺下状态。
    SITTING_AFTER_MS = 10 * 60 * 1000
    GAPING_AFTER_MS = 20 * 60 * 1000
    LAYDOWN_AFTER_MS = 30 * 60 * 1000
    INACTIVITY_CHECK_MS = 250
    TOUCH_LAYDOWN_SITTING_MS = 20_000
    TREATMENT_DURATION_MS = 30 * 60 * 1000

    def __init__(self, animation: PetAnimation, parent=None):
        super().__init__(parent)
        self.animation = animation
        self.state = BehaviorState.IDLE

        self._inactivity_clock = QElapsedTimer()
        self._inactivity_clock.start()
        self._played_inactivity_gaping = False
        self._pending_natural_gaping = False
        self._need_animation: str | None = None
        self._temporary_resets_inactivity = True
        self._touch_recovery_target: BehaviorState | None = None
        self._recovery_target: BehaviorState | None = None
        self._care_state: BehaviorState | None = None

        # 整个无互动系统只使用这一个周期 Timer。
        self.inactivity_timer = QTimer(self)
        self.inactivity_timer.setInterval(self.INACTIVITY_CHECK_MS)
        self.inactivity_timer.timeout.connect(self.update_inactivity)
        self.inactivity_timer.start()

        # 临时动作有独立的结束计时，不参与计算无互动时间。
        self.temporary_timer = QTimer(self)
        self.temporary_timer.setSingleShot(True)
        self.temporary_timer.timeout.connect(self.finish_temporary)

        self.touch_recovery_timer = QTimer(self)
        self.touch_recovery_timer.setSingleShot(True)
        self.touch_recovery_timer.timeout.connect(
            self._finish_touch_recovery
        )

        self.treatment_timer = QTimer(self)
        self.treatment_timer.setSingleShot(True)
        self.treatment_timer.timeout.connect(self.treatment_due.emit)

        self.animation.state_finished.connect(self._handle_animation_finished)
        self._resume_current_state()

    @property
    def inactivity_ms(self) -> int:
        return max(0, self._inactivity_clock.elapsed())

    @property
    def is_care_locked(self) -> bool:
        return self._care_state in (
            BehaviorState.SICK,
            BehaviorState.TREATING,
        )

    @property
    def is_sick(self) -> bool:
        return self._care_state is BehaviorState.SICK

    @property
    def is_treating(self) -> bool:
        return self._care_state is BehaviorState.TREATING

    @property
    def care_animation(self) -> str | None:
        return self._care_state.value if self._care_state is not None else None

    def register_interaction(self) -> None:
        """点击或开始拖拽时调用：取消当前动作并重新开始无互动计时。"""
        self.temporary_timer.stop()
        self._pending_natural_gaping = False
        self._played_inactivity_gaping = False
        self._cancel_touch_recovery()
        self._inactivity_clock.restart()
        self._resume_current_state()

    def start_treating(self) -> bool:
        """只有真正处于 Sick 时才能开始一次30分钟治疗。"""
        if self._care_state is not BehaviorState.SICK:
            return False

        self.temporary_timer.stop()
        self._cancel_touch_recovery()
        self._care_state = BehaviorState.TREATING
        self._transition(BehaviorState.TREATING, "treating")
        self.treatment_timer.start(self.TREATMENT_DURATION_MS)
        return True

    def complete_treatment(self) -> None:
        """治疗数值恢复后退出锁定，并从 idle 重新计算无互动时间。"""
        if self._care_state is not BehaviorState.TREATING:
            return

        self.treatment_timer.stop()
        self.temporary_timer.stop()
        self._care_state = None
        self._need_animation = None
        self._pending_natural_gaping = False
        self._played_inactivity_gaping = False
        self._cancel_touch_recovery()
        self._inactivity_clock.restart()
        self._transition(BehaviorState.IDLE, "idle")

    def play_temporary(
        self,
        animation_state: str,
        duration_ms: int | None = None,
        *,
        reset_inactivity: bool = True,
        touch_recovery_target: BehaviorState | None = None,
    ) -> bool:
        """播放临时动画；有时长时自动结束，无时长时等待外部结束。"""
        if self.is_care_locked and animation_state != "carry":
            return False

        self.temporary_timer.stop()
        self._cancel_touch_recovery()
        self._temporary_resets_inactivity = reset_inactivity
        self._touch_recovery_target = touch_recovery_target
        self._transition(BehaviorState.TEMPORARY, animation_state)

        if duration_ms is not None:
            self.temporary_timer.start(duration_ms)
        return True

    def play_touch(self, duration_ms: int) -> None:
        """播放 Touch，保留无互动计时并记住开始前的自然姿势。"""
        target = self._natural_pose_for_elapsed(self.inactivity_ms)
        self.play_temporary(
            "touch",
            duration_ms,
            reset_inactivity=False,
            touch_recovery_target=target,
        )

    def update_temporary_animation(self, animation_state: str) -> None:
        """临时流程内部切换动画，例如日记的进入、等待和打字阶段。"""
        if self.is_care_locked:
            return

        if self.state is not BehaviorState.TEMPORARY:
            self.play_temporary(animation_state)
            return

        self.animation.set_state(animation_state)

    def finish_temporary(self) -> None:
        """结束临时动作，并按该动作的计时策略恢复后续状态。"""
        if self.state is not BehaviorState.TEMPORARY:
            return

        self.temporary_timer.stop()
        resets_inactivity = self._temporary_resets_inactivity
        touch_recovery_target = self._touch_recovery_target
        self._temporary_resets_inactivity = True
        self._touch_recovery_target = None
        should_play_pending_gaping = self._pending_natural_gaping
        self._pending_natural_gaping = False

        if resets_inactivity:
            self._played_inactivity_gaping = False
            self._inactivity_clock.restart()

        if self._care_state is not None:
            self._transition(self._care_state, self._care_state.value)
            return

        if self._need_animation is not None:
            self._transition(BehaviorState.NEED, self._need_animation)
            return

        if not resets_inactivity and touch_recovery_target is not None:
            self._start_touch_recovery(touch_recovery_target)
            return

        self._transition(BehaviorState.IDLE, "idle")

        if should_play_pending_gaping:
            self._start_gaping(from_inactivity=False)

    def update_need_animation(self, animation_state: str | None) -> None:
        """Update the body need animation without interrupting temporary actions."""
        self._need_animation = animation_state

        if animation_state == "sick" and self._care_state is None:
            self._care_state = BehaviorState.SICK
            if not (
                self.state is BehaviorState.TEMPORARY
                and self.animation.state == "carry"
            ):
                self.temporary_timer.stop()
                self._cancel_touch_recovery()
                self._transition(BehaviorState.SICK, "sick")
            return

        if self._care_state is not None:
            return

        if self.state is BehaviorState.TEMPORARY:
            return

        if animation_state is not None:
            self._cancel_touch_recovery()
            self._transition(BehaviorState.NEED, animation_state)
            return

        if self.state is BehaviorState.NEED:
            self._resume_natural_behavior()

    def notify_natural_state_drop(self) -> None:
        """状态值自然下降后调用；临时动画期间只合并为一次待播放请求。"""
        if self.state is BehaviorState.TEMPORARY:
            self._pending_natural_gaping = True
            return

        if self.state in (BehaviorState.GAPING, BehaviorState.NEED):
            return

        self._start_gaping(from_inactivity=False)

    def update_inactivity(self, elapsed_ms: int | None = None) -> None:
        """根据无互动时长更新姿态；可传入时间用于快速自动化测试。"""
        if self.state in (
            BehaviorState.TEMPORARY,
            BehaviorState.GAPING,
            BehaviorState.NEED,
            BehaviorState.RECOVERING,
            BehaviorState.SICK,
            BehaviorState.TREATING,
        ):
            return

        elapsed = self.inactivity_ms if elapsed_ms is None else elapsed_ms

        self._apply_natural_behavior(elapsed)

    def _resume_current_state(self) -> None:
        if self._care_state is not None:
            self._transition(self._care_state, self._care_state.value)
        elif self._need_animation is not None:
            self._transition(BehaviorState.NEED, self._need_animation)
        else:
            self._transition(BehaviorState.IDLE, "idle")

    def _resume_natural_behavior(self) -> None:
        self._apply_natural_behavior(self.inactivity_ms)

    def _natural_pose_for_elapsed(self, elapsed: int) -> BehaviorState:
        if elapsed >= self.LAYDOWN_AFTER_MS:
            return BehaviorState.LAYDOWN
        if elapsed >= self.SITTING_AFTER_MS:
            return BehaviorState.SITTING
        return BehaviorState.IDLE

    def _start_touch_recovery(self, target: BehaviorState) -> None:
        self._recovery_target = target

        if target is BehaviorState.IDLE:
            self._cancel_touch_recovery()
            self._transition(BehaviorState.IDLE, "idle")
            return

        if target is BehaviorState.SITTING:
            self._cancel_touch_recovery()
            self._transition(BehaviorState.SITTING, "sitting")
            return

        self._transition(BehaviorState.RECOVERING, "sitting")
        self.touch_recovery_timer.start(self.TOUCH_LAYDOWN_SITTING_MS)

    def _finish_touch_recovery(self) -> None:
        if self.state is not BehaviorState.RECOVERING:
            return

        if self._need_animation is not None:
            self._cancel_touch_recovery()
            self._transition(BehaviorState.NEED, self._need_animation)
            return

        self._cancel_touch_recovery()
        self._transition(BehaviorState.LAYDOWN, "laydown")

    def _cancel_touch_recovery(self) -> None:
        self.touch_recovery_timer.stop()
        self._recovery_target = None

    def _apply_natural_behavior(self, elapsed: int) -> None:

        if elapsed >= self.LAYDOWN_AFTER_MS:
            self._transition(BehaviorState.LAYDOWN, "laydown")
            return

        if (
            elapsed >= self.GAPING_AFTER_MS
            and not self._played_inactivity_gaping
        ):
            self._start_gaping(from_inactivity=True)
            return

        if elapsed >= self.SITTING_AFTER_MS:
            self._transition(BehaviorState.SITTING, "sitting")
            return

        self._transition(BehaviorState.IDLE, "idle")

    def _start_gaping(self, from_inactivity: bool) -> None:
        if self.state is BehaviorState.GAPING:
            return

        # 如果自然下降恰好发生在 20 秒之后，这次 gaping 同时算作
        # 20 秒里程碑，避免结束后立刻连续播放第二次。
        if from_inactivity or self.inactivity_ms >= self.GAPING_AFTER_MS:
            self._played_inactivity_gaping = True

        self._transition(BehaviorState.GAPING, "gaping")

    def _handle_animation_finished(self, animation_state: str) -> None:
        if animation_state != "gaping" or self.state is not BehaviorState.GAPING:
            return

        # 一次性 gaping 播完后，以“此刻”的无互动时间决定落点。
        elapsed = self.inactivity_ms
        if elapsed >= self.LAYDOWN_AFTER_MS:
            self._transition(BehaviorState.LAYDOWN, "laydown")
        elif elapsed >= self.SITTING_AFTER_MS:
            self._transition(BehaviorState.SITTING, "sitting")
        else:
            self._transition(BehaviorState.IDLE, "idle")

    def _transition(
        self,
        new_state: BehaviorState,
        animation_state: str,
    ) -> None:
        """只在状态或动画真正变化时切换，避免反复从第一帧播放。"""
        if self.state is new_state and self.animation.state == animation_state:
            return

        self.state = new_state
        self.animation.set_state(animation_state)
        self.state_changed.emit(new_state.value)
