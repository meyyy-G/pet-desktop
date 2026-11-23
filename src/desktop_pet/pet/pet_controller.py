from dataclasses import dataclass, field
from enum import Enum
import time
from typing import Mapping

from PySide6.QtCore import QObject, Signal

from .action_rules import (
    EAT_DURATION_MS,
    FEED_EFFECT,
    PLAY_DURATION_MS,
    PLAY_EFFECT,
    SLEEP_DURATION_MS,
    SLEEP_MAX_ENERGY,
    PetStateEffect,
)
from .behavior_state_machine import BehaviorState, PetBehaviorStateMachine
from .need_rules import resolve_need_animation
from .pet_state import PetState
from .state_decay import PetStateDecay


class PetAction(Enum):
    FEED = "feed"
    PLAY = "play"
    SLEEP = "sleep"
    SHOW_STATUS = "show_status"
    CARRY_STARTED = "carry_started"
    CARRY_FINISHED = "carry_finished"
    TREAT = "treat"
    OPEN_DIARY = "open_diary"
    DIARY_TYPING = "diary_typing"
    DIARY_PAGE_CHANGED = "diary_page_changed"
    DIARY_CLOSED = "diary_closed"
    HOVER_MOVED = "hover_moved"
    HOVER_FINISHED = "hover_finished"


class ActionSource(Enum):
    USER = "user"
    SYSTEM = "system"
    AI = "ai"


@dataclass(frozen=True)
class PetActionRequest:
    action: PetAction
    source: ActionSource = ActionSource.USER
    payload: Mapping[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class ActionResult:
    accepted: bool
    reason: str = ""


class PetController(QObject):
    """Coordinate semantic pet actions without owning any QWidget."""

    status_requested = Signal(int, int, int)
    care_hint_changed = Signal(object)
    care_hint_requested = Signal()
    position_save_requested = Signal()
    wake_confirmation_requested = Signal()

    HOVER_PIXELS_PER_FRAME = 16.0
    HOVER_MAX_EVENT_DISTANCE = 20.0
    HOVER_FIRST_FRAME = 4
    HOVER_LAST_FRAME = 12

    def __init__(
        self,
        state: PetState,
        behavior: PetBehaviorStateMachine,
        state_decay: PetStateDecay,
        parent=None,
    ):
        super().__init__(parent)
        self.state = state
        self.behavior = behavior
        self.state_decay = state_decay

        self.diary_visible = False
        self.is_diary_page_active = False
        self.has_started_typing = False
        self.typing_requested_during_open = False
        self._sleeping_active = False
        self._sleep_started_at: float | None = None
        self._pending_effect = None
        self._hover_active = False
        self._hover_distance = 0.0
        self._hover_frame = self.HOVER_FIRST_FRAME
        self.behavior.temporary_finished.connect(self._temporary_finished)

    def request(self, request: PetActionRequest) -> ActionResult:
        handlers = {
            PetAction.FEED: self.feed,
            PetAction.PLAY: self.play,
            PetAction.SLEEP: self.sleep,
            PetAction.SHOW_STATUS: self.show_status,
            PetAction.CARRY_STARTED: self.start_carry,
            PetAction.CARRY_FINISHED: self.finish_landing,
            PetAction.TREAT: self.treat,
            PetAction.OPEN_DIARY: lambda: self.open_diary(
                str(request.payload.get("page", "home"))
            ),
            PetAction.DIARY_TYPING: self.start_typing,
            PetAction.DIARY_PAGE_CHANGED: lambda: self.diary_page_changed(
                str(request.payload.get("page", ""))
            ),
            PetAction.DIARY_CLOSED: self.close_diary,
            PetAction.HOVER_MOVED: lambda: self.hover_moved(
                float(request.payload.get("distance", 0.0))
            ),
            PetAction.HOVER_FINISHED: self.finish_hover,
        }
        return handlers[request.action]()

    @property
    def is_sleeping(self) -> bool:
        return (
            self._sleeping_active
            and self.behavior.current_animation == "sleeping"
        )

    def feed(self) -> ActionResult:
        if self._care_interaction_blocked():
            return ActionResult(False, "care_locked")
        if self.is_sleeping:
            return ActionResult(False, "sleeping")
        if (
            self._pending_effect is not None
            and self._pending_effect[0] == "eat"
            and self.behavior.current_animation == "eat"
        ):
            return ActionResult(False, "already_eating")
        self.finish_hover()
        self._show_status()
        self._pending_effect = ("eat", FEED_EFFECT, self.state.satiety)
        self.behavior.play_temporary("eat", EAT_DURATION_MS)
        return ActionResult(True)

    def play(self) -> ActionResult:
        if self._care_interaction_blocked():
            return ActionResult(False, "care_locked")
        if self.is_sleeping:
            return ActionResult(False, "sleeping")
        if not self.state.can_play():
            self._show_status()
            return ActionResult(False, "insufficient_needs")
        self.finish_hover()
        self._show_status()
        self._pending_effect = ("play", PLAY_EFFECT, self.state.satiety)
        self.behavior.play_temporary("play", PLAY_DURATION_MS)
        return ActionResult(True)

    def sleep(self) -> ActionResult:
        if self._care_interaction_blocked():
            return ActionResult(False, "care_locked")
        if self.is_sleeping:
            return ActionResult(False, "already_sleeping")
        self.finish_hover()
        self._pending_effect = None
        self._show_status()
        self._sleeping_active = True
        self._sleep_started_at = time.monotonic()
        self.behavior.play_temporary("sleeping", SLEEP_DURATION_MS)
        return ActionResult(True)

    def show_status(self) -> ActionResult:
        self.position_save_requested.emit()
        if self.is_sleeping:
            self.wake_confirmation_requested.emit()
            return ActionResult(False, "wake_confirmation_required")
        self._show_status()
        if self._care_interaction_blocked():
            return ActionResult(False, "care_locked")
        return ActionResult(True)

    def start_carry(self) -> ActionResult:
        self.finish_hover()
        if self.is_sleeping:
            self._settle_sleep(completed=False, resume_diary=False)
        self._pending_effect = None
        self.register_interaction()
        self.behavior.play_temporary("carry")
        return ActionResult(True)

    def finish_landing(self) -> ActionResult:
        self._restore_after_carry()
        self.position_save_requested.emit()
        return ActionResult(True)

    def treat(self) -> ActionResult:
        if not self.behavior.start_treating():
            return ActionResult(False, "not_sick")
        self.care_hint_changed.emit("treating")
        return ActionResult(True)

    def complete_treatment(self) -> None:
        if not self.behavior.is_treating:
            return
        self.state.satiety = 75
        self.state.mood = 75
        self.state.energy = 75
        self.behavior.complete_treatment()
        self.care_hint_changed.emit(None)
        self.state_decay.commit_manual_change(self.state.satiety)

    def update_need_values(self, satiety: int, mood: int, energy: int) -> None:
        was_sleeping = self.is_sleeping
        self.behavior.update_need_animation(
            resolve_need_animation(satiety, mood, energy)
        )
        if self._pending_effect is not None:
            animation, _effect, _old_satiety = self._pending_effect
            if self.behavior.current_animation != animation:
                self._pending_effect = None
        if was_sleeping and self.behavior.current_animation != "sleeping":
            self._settle_sleep(completed=False, resume_diary=False)
        if self.behavior.is_sick:
            self._reset_hover_tracking()
            self.care_hint_changed.emit("sick")

    def register_interaction(self) -> None:
        self._pending_effect = None
        self.behavior.register_interaction()

    def interaction_allowed(self) -> bool:
        return not self._care_interaction_blocked()

    def open_diary(self, current_page: str) -> ActionResult:
        self.finish_hover()
        self.diary_visible = True
        self.is_diary_page_active = current_page == "diary"
        self.has_started_typing = False
        self.typing_requested_during_open = False
        if not self.is_sleeping:
            self._pending_effect = None
            self.behavior.play_temporary("diary_open_enter")
        return ActionResult(True)

    def hover_moved(self, distance: float) -> ActionResult:
        if distance <= 0:
            return ActionResult(False, "no_movement")
        if not self._hover_active:
            if self.behavior.state not in {
                BehaviorState.IDLE,
                BehaviorState.SITTING,
                BehaviorState.LAYDOWN,
            }:
                return ActionResult(False, "behavior_busy")
            if not self.behavior.play_manual_temporary(
                "hover",
                reset_inactivity=False,
            ):
                return ActionResult(False, "behavior_busy")
            self._hover_active = True
            self._hover_distance = 0.0
            self._hover_frame = self.HOVER_FIRST_FRAME
            self.behavior.set_manual_frame(self._hover_frame)

        self._hover_distance += min(distance, self.HOVER_MAX_EVENT_DISTANCE)
        if self._hover_distance >= self.HOVER_PIXELS_PER_FRAME:
            self._hover_distance -= self.HOVER_PIXELS_PER_FRAME
            self._hover_frame += 1
            if self._hover_frame > self.HOVER_LAST_FRAME:
                self._hover_frame = self.HOVER_FIRST_FRAME
            self.behavior.set_manual_frame(self._hover_frame)
        return ActionResult(True)

    def finish_hover(self) -> ActionResult:
        if not self._hover_active:
            return ActionResult(False, "not_hovering")
        self._reset_hover_tracking()
        if (
            self.behavior.state is BehaviorState.TEMPORARY
            and self.behavior.current_animation == "hover"
        ):
            self.behavior.update_temporary_animation("hover_exit")
        return ActionResult(True)

    def wake_sleeping(self) -> ActionResult:
        if not self.is_sleeping:
            return ActionResult(False, "not_sleeping")
        self.behavior.finish_temporary()
        return ActionResult(True)

    def start_typing(self) -> ActionResult:
        if not self.is_diary_page_active:
            return ActionResult(False, "not_diary_page")
        if self.has_started_typing:
            return ActionResult(False, "already_typing")
        if self.behavior.current_animation in (
            "diary_open_enter",
            "diary_open_exit",
        ):
            self.typing_requested_during_open = True
            return ActionResult(True, "queued")
        self.has_started_typing = True
        self.behavior.update_temporary_animation("diary_typing_enter")
        return ActionResult(True)

    def close_diary(self) -> ActionResult:
        self.diary_visible = False
        self.is_diary_page_active = False
        self.has_started_typing = False
        self.typing_requested_during_open = False
        self.behavior.finish_temporary()
        return ActionResult(True)

    def diary_page_changed(self, page_name: str) -> ActionResult:
        is_diary_page = page_name == "diary"
        if is_diary_page:
            self.is_diary_page_active = True
            self.has_started_typing = False
            if self.behavior.current_animation not in (
                "diary_open_enter",
                "diary_open_exit",
            ):
                self.behavior.update_temporary_animation("diary_waiting")
            return ActionResult(True)

        was_typing = self.is_diary_page_active and self.has_started_typing
        was_in_typing_animation = self.behavior.current_animation in (
            "diary_typing_enter",
            "diary_typing",
        )
        self.is_diary_page_active = False
        self.has_started_typing = False
        self.typing_requested_during_open = False
        if self.behavior.current_animation in (
            "diary_open_enter",
            "diary_open_exit",
        ):
            return ActionResult(True)
        if was_typing or was_in_typing_animation:
            self.behavior.update_temporary_animation("diary_typing_exit")
        elif self.diary_visible:
            self.behavior.update_temporary_animation("diary_waiting")
        return ActionResult(True)

    def animation_finished(self, animation_state: str) -> None:
        if animation_state == "hover_exit":
            self.behavior.finish_temporary()
            return
        if animation_state == "settlement":
            self.behavior.finish_temporary()
            self._resume_diary_companion()
            return
        if animation_state == "diary_open_enter":
            if self.diary_visible:
                self.behavior.update_temporary_animation("diary_open_exit")
            else:
                self.behavior.finish_temporary()
            return
        if animation_state == "diary_open_exit":
            if not self.diary_visible:
                self.behavior.finish_temporary()
                return
            self.behavior.update_temporary_animation("diary_waiting")
            if self.is_diary_page_active and self.typing_requested_during_open:
                self.typing_requested_during_open = False
                self.start_typing()
            return
        if animation_state == "diary_typing_enter":
            if (
                self.diary_visible
                and self.is_diary_page_active
                and self.has_started_typing
            ):
                self.behavior.update_temporary_animation("diary_typing")
            else:
                self.behavior.update_temporary_animation("diary_waiting")
            return
        if animation_state == "diary_typing_exit":
            if self.diary_visible:
                self.behavior.update_temporary_animation("diary_waiting")
            else:
                self.behavior.finish_temporary()

    def _restore_after_carry(self) -> None:
        if not self.diary_visible:
            self.behavior.finish_temporary()
            return
        if self.is_diary_page_active and self.has_started_typing:
            self.behavior.update_temporary_animation("diary_typing")
            return
        self.behavior.update_temporary_animation("diary_waiting")
        if self.is_diary_page_active and self.typing_requested_during_open:
            self.typing_requested_during_open = False
            self.start_typing()

    def _care_interaction_blocked(self) -> bool:
        if not self.behavior.is_care_locked:
            return False
        self.care_hint_requested.emit()
        return True

    def _show_status(self) -> None:
        self.status_requested.emit(
            self.state.satiety,
            self.state.mood,
            self.state.energy,
        )

    def _temporary_finished(
        self,
        animation_state: str,
        completed: bool,
    ) -> None:
        if self._pending_effect is not None:
            pending_animation, effect, old_satiety = self._pending_effect
            if pending_animation == animation_state:
                self._pending_effect = None
                if completed:
                    self.state.apply(effect)
                    self._show_status()
                    self.state_decay.commit_manual_change(old_satiety)
                    self._play_settlement_animation()
        if animation_state != "sleeping":
            return
        self._settle_sleep(completed=completed, resume_diary=True)

    def _settle_sleep(self, *, completed: bool, resume_diary: bool) -> None:
        if not self._sleeping_active:
            return
        elapsed_minutes = 0
        if self._sleep_started_at is not None:
            elapsed_seconds = max(0.0, time.monotonic() - self._sleep_started_at)
            elapsed_minutes = int(elapsed_seconds // 60)
        recovered_energy = (
            SLEEP_MAX_ENERGY
            if completed
            else min(SLEEP_MAX_ENERGY, elapsed_minutes)
        )
        self._sleeping_active = False
        self._sleep_started_at = None
        if recovered_energy:
            old_satiety = self.state.satiety
            self.state.apply(PetStateEffect(energy=recovered_energy))
            self.state_decay.commit_manual_change(old_satiety)
        self._show_status()
        if completed:
            self._play_settlement_animation()
        elif resume_diary:
            self._resume_diary_companion()

    def _play_settlement_animation(self) -> None:
        self._reset_hover_tracking()
        self.behavior.play_temporary("settlement")

    def _resume_diary_companion(self) -> None:
        if not self.diary_visible:
            return
        if self.is_diary_page_active and self.has_started_typing:
            self.behavior.play_temporary("diary_typing")
        else:
            self.behavior.play_temporary("diary_waiting")

    def _reset_hover_tracking(self) -> None:
        self._hover_active = False
        self._hover_distance = 0.0
        self._hover_frame = self.HOVER_FIRST_FRAME
