from types import SimpleNamespace

from desktop_pet.pet.action_rules import (
    EAT_DURATION_MS,
    PLAY_DURATION_MS,
    SLEEP_DURATION_MS,
)
from desktop_pet.pet.behavior_state_machine import BehaviorState
from desktop_pet.pet.pet_state import PetState
from desktop_pet.pet.pet_controller import (
    ActionSource,
    PetAction,
    PetActionRequest,
    PetController,
)


class RecordingSignal:
    def __init__(self):
        self.callbacks = []

    def connect(self, callback):
        self.callbacks.append(callback)

    def emit(self, *args):
        for callback in tuple(self.callbacks):
            callback(*args)


class RecordingBehavior:
    def __init__(self, animation=None):
        self.calls = []
        self.animation = animation
        self.is_care_locked = False
        self.is_sick = False
        self.is_treating = False
        self.treating_result = True
        self.temporary_finished = RecordingSignal()
        self.state = BehaviorState.IDLE

    @property
    def current_animation(self):
        return self.animation.state

    def play_temporary(self, *args):
        self.calls.append(("play_temporary", *args))
        if self.animation is not None:
            self.animation.state = args[0]

    def play_manual_temporary(self, animation, *, reset_inactivity=False):
        self.calls.append(("play_manual_temporary", animation, reset_inactivity))
        self.state = BehaviorState.TEMPORARY
        self.animation.state = animation
        return True

    def set_manual_frame(self, frame_index):
        self.calls.append(("set_manual_frame", frame_index))

    def update_manual_temporary_animation(self, animation):
        self.calls.append(("update_manual_temporary_animation", animation))
        if self.animation is not None:
            self.animation.state = animation

    def register_interaction(self):
        self.calls.append(("register_interaction",))

    def finish_temporary(self):
        self._finish_temporary(completed=False)

    def complete_temporary(self):
        self._finish_temporary(completed=True)

    def _finish_temporary(self, *, completed):
        finished = self.animation.state
        call = "complete_temporary" if completed else "finish_temporary"
        self.calls.append((call,))
        self.animation.state = "idle"
        self.state = BehaviorState.IDLE
        self.temporary_finished.emit(finished, completed)

    def update_temporary_animation(self, animation):
        self.calls.append(("update_temporary_animation", animation))
        if self.animation is not None:
            self.animation.state = animation

    def update_need_animation(self, animation):
        self.calls.append(("update_need_animation", animation))

    def start_treating(self):
        self.calls.append(("start_treating",))
        return self.treating_result

    def complete_treatment(self):
        self.calls.append(("complete_treatment",))


class RecordingDecay:
    def __init__(self):
        self.calls = []

    def commit_manual_change(self, old_satiety):
        self.calls.append(("commit_manual_change", old_satiety))

def make_controller(state=None):
    state = state or PetState()
    animation = SimpleNamespace(state="idle")
    behavior = RecordingBehavior(animation)
    decay = RecordingDecay()
    controller = PetController(state, behavior, decay)
    events = []
    controller.status_requested.connect(
        lambda *values: events.append(("show_status", *values))
    )
    controller.position_save_requested.connect(
        lambda: events.append(("save_position",))
    )
    controller.care_hint_changed.connect(
        lambda hint: events.append(("care_hint", hint))
    )
    controller.care_hint_requested.connect(
        lambda: events.append(("show_care_hint",))
    )
    return controller, behavior, decay, events


def test_feed_applies_values_only_after_the_animation_completes():
    controller, behavior, decay, events = make_controller(
        PetState(satiety=80, mood=80, energy=80)
    )

    result = controller.request(PetActionRequest(PetAction.FEED))

    assert result.accepted
    assert (controller.state.satiety, controller.state.mood, controller.state.energy) == (80, 80, 80)
    assert events == [("show_status", 80, 80, 80)]
    assert behavior.calls == [("play_temporary", "eat", EAT_DURATION_MS)]
    assert decay.calls == []

    behavior.complete_temporary()

    assert (controller.state.satiety, controller.state.mood, controller.state.energy) == (95, 80, 82)
    assert events[-1] == ("show_status", 95, 80, 82)
    assert decay.calls == [("commit_manual_change", 80)]
    assert behavior.calls[-2:] == [
        ("complete_temporary",),
        ("play_temporary", "settlement"),
    ]


def test_interrupted_feed_does_not_apply_or_save_its_effect():
    controller, behavior, decay, events = make_controller(PetState())
    controller.feed()

    behavior.finish_temporary()

    assert controller.state == PetState()
    assert events == [("show_status", 80, 80, 80)]
    assert decay.calls == []


def test_feed_is_rejected_while_an_eating_action_is_active():
    controller, behavior, decay, _events = make_controller(PetState())
    controller.feed()

    result = controller.feed()

    assert not result.accepted and result.reason == "already_eating"
    assert behavior.calls == [("play_temporary", "eat", EAT_DURATION_MS)]
    assert decay.calls == []


def test_play_applies_values_only_after_the_animation_completes():
    controller, behavior, decay, _events = make_controller(PetState())

    controller.play()

    assert controller.state == PetState()
    assert behavior.calls == [("play_temporary", "play", PLAY_DURATION_MS)]
    assert decay.calls == []

    behavior.complete_temporary()

    assert (controller.state.satiety, controller.state.mood, controller.state.energy) == (77, 90, 75)
    assert decay.calls == [("commit_manual_change", 80)]
    assert behavior.calls[-1] == ("play_temporary", "settlement")


def test_ai_source_uses_the_same_guarded_action_entry_point():
    controller, behavior, _decay, _events = make_controller(PetState())

    result = controller.request(PetActionRequest(
        PetAction.FEED,
        source=ActionSource.AI,
    ))

    assert result.accepted
    assert behavior.calls == [("play_temporary", "eat", EAT_DURATION_MS)]


def test_play_rejection_only_shows_status():
    controller, behavior, decay, events = make_controller(
        PetState(satiety=20, mood=80, energy=80)
    )

    result = controller.play()

    assert not result.accepted and result.reason == "insufficient_needs"
    assert events == [("show_status", 20, 80, 80)]
    assert behavior.calls == []
    assert decay.calls == []


def test_sleep_starts_without_immediate_value_changes():
    controller, behavior, decay, _events = make_controller(PetState())

    controller.sleep()

    assert controller.state == PetState()
    assert behavior.calls == [
        ("play_temporary", "sleeping", SLEEP_DURATION_MS)
    ]
    assert decay.calls == []


def test_single_click_only_saves_position_and_shows_status():
    controller, behavior, decay, events = make_controller(PetState())

    controller.show_status()

    assert events == [("save_position",), ("show_status", 80, 80, 80)]
    assert behavior.calls == []
    assert decay.calls == []


def test_mouse_stroking_caps_fast_movement_to_one_frame_per_event():
    controller, behavior, decay, _events = make_controller(PetState())

    result = controller.hover_moved(200)

    assert result.accepted
    assert behavior.calls == [
        ("play_manual_temporary", "hover", False),
        ("set_manual_frame", 4),
        ("set_manual_frame", 5),
    ]
    assert decay.calls == []

    controller.finish_hover()
    assert behavior.calls[-1] == (
        "update_temporary_animation",
        "hover_exit",
    )

    controller.animation_finished("hover_exit")
    assert behavior.calls[-1] == ("finish_temporary",)


def test_mouse_stroking_loops_only_through_frames_five_to_thirteen():
    controller, behavior, _decay, _events = make_controller(PetState())

    for _ in range(16):
        controller.hover_moved(controller.HOVER_PIXELS_PER_FRAME)

    frames = [call[1] for call in behavior.calls if call[0] == "set_manual_frame"]
    assert frames[:10] == list(range(4, 13)) + [4]
    assert set(frames) == set(range(4, 13))


def test_mouse_stroking_does_not_interrupt_busy_behavior():
    controller, behavior, _decay, _events = make_controller(PetState())
    behavior.state = BehaviorState.TEMPORARY
    behavior.animation.state = "eat"

    result = controller.hover_moved(20)

    assert not result.accepted and result.reason == "behavior_busy"
    assert behavior.calls == []


def test_box_cat_hides_then_wags_tail_from_mouse_movement():
    controller, behavior, _decay, _events = make_controller(PetState())
    controller.diary_visible = True
    behavior.state = BehaviorState.TEMPORARY
    behavior.animation.state = "diary_waiting"

    result = controller.hover_moved(20)

    assert result.accepted
    assert behavior.calls == [
        ("update_temporary_animation", "box_hover_enter"),
    ]

    controller.animation_finished("box_hover_enter")
    assert behavior.calls[-2:] == [
        ("update_manual_temporary_animation", "box_hover"),
        ("set_manual_frame", 0),
    ]

    controller.hover_moved(controller.HOVER_PIXELS_PER_FRAME)
    assert behavior.calls[-1] == ("set_manual_frame", 1)

    controller.finish_hover()
    assert behavior.calls[-1] == (
        "update_temporary_animation",
        "box_hover_exit",
    )

    controller.animation_finished("box_hover_exit")
    assert behavior.calls[-1] == (
        "update_temporary_animation",
        "diary_waiting",
    )


def test_box_cat_hover_does_not_replace_real_diary_typing():
    controller, behavior, _decay, _events = make_controller(PetState())
    controller.diary_visible = True
    controller.is_diary_page_active = True
    controller.has_started_typing = True
    behavior.state = BehaviorState.TEMPORARY
    behavior.animation.state = "diary_typing"

    result = controller.hover_moved(20)

    assert not result.accepted
    assert result.reason == "behavior_busy"
    assert behavior.calls == []


def test_single_click_while_sleeping_requests_confirmation_without_waking():
    controller, behavior, decay, events = make_controller(PetState())
    controller.sleep()
    behavior.calls.clear()
    decay.calls.clear()
    events.clear()
    confirmations = []
    controller.wake_confirmation_requested.connect(
        lambda: confirmations.append(True)
    )

    result = controller.show_status()

    assert not result.accepted
    assert result.reason == "wake_confirmation_required"
    assert confirmations == [True]
    assert behavior.current_animation == "sleeping"
    assert behavior.calls == []
    assert decay.calls == []
    assert events == [("save_position",)]


def test_feed_and_play_do_not_replace_an_active_sleep():
    controller, behavior, decay, _events = make_controller(PetState())
    controller.sleep()
    behavior.calls.clear()

    feed_result = controller.feed()
    play_result = controller.play()

    assert feed_result.reason == "sleeping"
    assert play_result.reason == "sleeping"
    assert behavior.current_animation == "sleeping"
    assert behavior.calls == []
    assert decay.calls == []


def test_confirmed_wake_finishes_sleep_and_shows_status():
    controller, behavior, decay, events = make_controller(PetState())
    controller.sleep()
    controller._sleep_started_at -= 5 * 60
    behavior.calls.clear()
    events.clear()

    result = controller.wake_sleeping()

    assert result.accepted
    assert behavior.calls == [("finish_temporary",)]
    assert controller.state == PetState(energy=85)
    assert events == [("show_status", 80, 80, 85)]
    assert decay.calls == [("commit_manual_change", 80)]
    assert all(call != ("play_temporary", "settlement") for call in behavior.calls)


def test_natural_sleep_completion_restores_thirty_energy():
    controller, behavior, decay, events = make_controller(
        PetState(energy=40)
    )
    controller.sleep()
    behavior.calls.clear()
    events.clear()

    behavior.complete_temporary()

    assert controller.state == PetState(energy=70)
    assert events == [("show_status", 80, 80, 70)]
    assert decay.calls == [("commit_manual_change", 80)]
    assert behavior.calls[-1] == ("play_temporary", "settlement")


def test_opening_diary_does_not_interrupt_sleep_and_resumes_diary_after_sleep():
    controller, behavior, _decay, _events = make_controller(PetState())
    controller.sleep()
    behavior.calls.clear()

    controller.open_diary("home")

    assert behavior.current_animation == "sleeping"
    assert behavior.calls == []

    behavior.complete_temporary()
    assert behavior.calls[-2:] == [
        ("complete_temporary",),
        ("play_temporary", "settlement"),
    ]

    controller.animation_finished("settlement")
    assert behavior.calls[-2:] == [
        ("finish_temporary",),
        ("play_temporary", "diary_waiting"),
    ]


def test_diary_activity_during_sleep_is_restored_after_sleep_completes():
    controller, behavior, _decay, _events = make_controller(PetState())
    controller.sleep()
    controller.open_diary("home")
    behavior.calls.clear()

    controller.diary_page_changed("diary")
    typing = controller.start_typing()

    assert typing.accepted and typing.reason == "deferred_until_wake"
    assert controller.has_started_typing
    assert behavior.current_animation == "sleeping"
    assert behavior.calls == []

    behavior.complete_temporary()
    controller.animation_finished("settlement")

    assert behavior.calls[-1] == ("play_temporary", "diary_typing")


def test_closing_diary_during_sleep_does_not_wake_or_settle_sleep():
    controller, behavior, decay, _events = make_controller(PetState())
    controller.sleep()
    controller.open_diary("home")
    behavior.calls.clear()

    result = controller.close_diary()

    assert result.accepted
    assert not controller.diary_visible
    assert controller.is_sleeping
    assert behavior.current_animation == "sleeping"
    assert behavior.calls == []
    assert decay.calls == []


def test_care_lock_blocks_normal_interactions_and_replays_hint():
    controller, behavior, _decay, events = make_controller(PetState())
    behavior.is_care_locked = True

    result = controller.feed()

    assert not result.accepted and result.reason == "care_locked"
    assert controller.state == PetState()
    assert events == [("show_care_hint",)]
    assert behavior.calls == []


def test_single_click_during_care_still_shows_status_and_care_hint():
    controller, behavior, decay, events = make_controller(PetState())
    behavior.is_care_locked = True

    result = controller.show_status()

    assert not result.accepted and result.reason == "care_locked"
    assert events == [
        ("save_position",),
        ("show_status", 80, 80, 80),
        ("show_care_hint",),
    ]
    assert behavior.calls == []
    assert decay.calls == []


def test_treatment_completion_restores_all_values_to_seventy_five():
    controller, behavior, decay, events = make_controller(
        PetState(satiety=5, mood=10, energy=15)
    )
    behavior.is_treating = True

    controller.complete_treatment()

    assert (controller.state.satiety, controller.state.mood, controller.state.energy) == (75, 75, 75)
    assert behavior.calls == [("complete_treatment",)]
    assert events == [("care_hint", None)]
    assert decay.calls == [("commit_manual_change", 75)]


def test_carry_registers_interaction_and_landing_without_diary_finishes_temporary():
    controller, behavior, decay, events = make_controller()

    controller.start_carry()
    controller.finish_landing()

    assert behavior.calls == [
        ("register_interaction",),
        ("play_temporary", "carry"),
        ("finish_temporary",),
    ]
    assert decay.calls == []
    assert events == [("save_position",)]


def test_carry_restores_diary_typing_when_the_diary_is_open():
    controller, behavior, _decay, _events = make_controller()
    controller.diary_visible = True
    controller.is_diary_page_active = True
    controller.has_started_typing = True

    controller._restore_after_carry()

    assert behavior.calls == [("update_temporary_animation", "diary_typing")]


def test_diary_open_animation_queues_typing_then_enters_typing():
    controller, behavior, _decay, _events = make_controller()
    controller.open_diary("diary")
    behavior.calls.clear()

    queued = controller.start_typing()
    assert queued.reason == "queued"
    assert controller.typing_requested_during_open is True
    assert behavior.calls == []

    controller.animation_finished("diary_open_enter")
    assert behavior.calls[-1] == ("update_temporary_animation", "diary_open_exit")

    controller.animation_finished("diary_open_exit")
    assert behavior.calls[-2:] == [
        ("update_temporary_animation", "diary_waiting"),
        ("update_temporary_animation", "diary_typing_enter"),
    ]
    assert controller.has_started_typing is True
    assert controller.typing_requested_during_open is False


def test_leaving_diary_while_typing_plays_exit_then_waits():
    controller, behavior, _decay, _events = make_controller()
    controller.diary_visible = True
    controller.is_diary_page_active = True
    controller.has_started_typing = True
    behavior.animation.state = "diary_typing"

    controller.diary_page_changed("home")
    assert behavior.calls == [("update_temporary_animation", "diary_typing_exit")]

    controller.animation_finished("diary_typing_exit")
    assert behavior.calls[-1] == ("update_temporary_animation", "diary_waiting")


def test_closing_diary_clears_context_and_finishes_temporary():
    controller, behavior, _decay, _events = make_controller()
    controller.diary_visible = True
    controller.is_diary_page_active = True
    controller.has_started_typing = True
    controller.typing_requested_during_open = True

    controller.request(PetActionRequest(
        PetAction.DIARY_CLOSED,
        source=ActionSource.SYSTEM,
    ))

    assert not controller.diary_visible
    assert not controller.is_diary_page_active
    assert not controller.has_started_typing
    assert not controller.typing_requested_during_open
    assert behavior.calls == [("finish_temporary",)]
