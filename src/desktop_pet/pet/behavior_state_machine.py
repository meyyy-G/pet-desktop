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
    TEMPORARY = "temporary"


class PetBehaviorStateMachine(QObject):
    """统一管理无互动行为和临时动作，避免多个逻辑争抢动画。"""

    state_changed = Signal(str)

    # 无互动 10/20/30 分钟后依次进入坐下、打哈欠和躺下状态。
    SITTING_AFTER_MS = 10 * 60 * 1000
    GAPING_AFTER_MS = 20 * 60 * 1000
    LAYDOWN_AFTER_MS = 30 * 60 * 1000
    INACTIVITY_CHECK_MS = 250

    def __init__(self, animation: PetAnimation, parent=None):
        super().__init__(parent)
        self.animation = animation
        self.state = BehaviorState.IDLE

        self._inactivity_clock = QElapsedTimer()
        self._inactivity_clock.start()
        self._played_inactivity_gaping = False
        self._pending_natural_gaping = False
        self._need_animation: str | None = None

        # 整个无互动系统只使用这一个周期 Timer。
        self.inactivity_timer = QTimer(self)
        self.inactivity_timer.setInterval(self.INACTIVITY_CHECK_MS)
        self.inactivity_timer.timeout.connect(self.update_inactivity)
        self.inactivity_timer.start()

        # 临时动作有独立的结束计时，不参与计算无互动时间。
        self.temporary_timer = QTimer(self)
        self.temporary_timer.setSingleShot(True)
        self.temporary_timer.timeout.connect(self.finish_temporary)

        self.animation.state_finished.connect(self._handle_animation_finished)
        self._resume_current_state()

    @property
    def inactivity_ms(self) -> int:
        return max(0, self._inactivity_clock.elapsed())

    def register_interaction(self) -> None:
        """点击或开始拖拽时调用：取消当前动作并重新开始无互动计时。"""
        self.temporary_timer.stop()
        self._pending_natural_gaping = False
        self._played_inactivity_gaping = False
        self._inactivity_clock.restart()
        self._resume_current_state()

    def play_temporary(
        self,
        animation_state: str,
        duration_ms: int | None = None,
    ) -> None:
        """播放临时动画；有时长时自动结束，无时长时等待外部结束。"""
        self.temporary_timer.stop()
        self._transition(BehaviorState.TEMPORARY, animation_state)

        if duration_ms is not None:
            self.temporary_timer.start(duration_ms)

    def update_temporary_animation(self, animation_state: str) -> None:
        """临时流程内部切换动画，例如日记的进入、等待和打字阶段。"""
        if self.state is not BehaviorState.TEMPORARY:
            self.play_temporary(animation_state)
            return

        self.animation.set_state(animation_state)

    def finish_temporary(self) -> None:
        """临时动作结束后回到 Idle，并从零重新计算无互动时间。"""
        if self.state is not BehaviorState.TEMPORARY:
            return

        self.temporary_timer.stop()
        should_play_pending_gaping = self._pending_natural_gaping
        self._pending_natural_gaping = False
        self._played_inactivity_gaping = False
        self._inactivity_clock.restart()

        if self._need_animation is not None:
            self._transition(BehaviorState.NEED, self._need_animation)
            return

        self._transition(BehaviorState.IDLE, "idle")

        if should_play_pending_gaping:
            self._start_gaping(from_inactivity=False)

    def update_need_animation(self, animation_state: str | None) -> None:
        """Update the body need animation without interrupting temporary actions."""
        self._need_animation = animation_state

        if self.state is BehaviorState.TEMPORARY:
            return

        if animation_state is not None:
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
        ):
            return

        elapsed = self.inactivity_ms if elapsed_ms is None else elapsed_ms

        self._apply_natural_behavior(elapsed)

    def _resume_current_state(self) -> None:
        if self._need_animation is not None:
            self._transition(BehaviorState.NEED, self._need_animation)
        else:
            self._transition(BehaviorState.IDLE, "idle")

    def _resume_natural_behavior(self) -> None:
        self._apply_natural_behavior(self.inactivity_ms)

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
