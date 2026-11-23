from PySide6.QtCore import QCoreApplication, QObject, Signal

from desktop_pet.pet.behavior_state_machine import BehaviorState, PetBehaviorStateMachine


class FakeAnimation(QObject):
    state_finished = Signal(str)

    def __init__(self):
        super().__init__()
        self.state = "idle"
        self.history = []

    def set_state(self, state, *, manual=False):
        self.state = state
        self.history.append((state, manual))

    def set_manual_frame(self, frame_index):
        self.history.append(("frame", frame_index))


def make_behavior():
    QCoreApplication.instance() or QCoreApplication([])
    animation = FakeAnimation()
    behavior = PetBehaviorStateMachine(animation)
    behavior.inactivity_timer.stop()
    return behavior, animation


def stop_timers(behavior):
    behavior.inactivity_timer.stop()
    behavior.temporary_timer.stop()
    behavior.treatment_timer.stop()


def test_natural_behavior_thresholds_are_characterized():
    behavior, animation = make_behavior()
    behavior.update_inactivity(behavior.SITTING_AFTER_MS)
    assert (behavior.state, animation.state) == (BehaviorState.SITTING, "sitting")

    behavior.update_inactivity(behavior.GAPING_AFTER_MS)
    assert (behavior.state, animation.state) == (BehaviorState.GAPING, "gaping")

    animation.state_finished.emit("gaping")
    assert (behavior.state, animation.state) == (BehaviorState.IDLE, "idle")

    behavior.update_inactivity(behavior.LAYDOWN_AFTER_MS)
    assert (behavior.state, animation.state) == (BehaviorState.LAYDOWN, "laydown")
    stop_timers(behavior)


def test_need_does_not_interrupt_temporary_but_is_restored_after_it():
    behavior, animation = make_behavior()
    behavior.play_temporary("eat", 2500)

    behavior.update_need_animation("upset")

    assert (behavior.state, animation.state) == (BehaviorState.TEMPORARY, "eat")
    behavior.finish_temporary()
    assert (behavior.state, animation.state) == (BehaviorState.NEED, "upset")
    stop_timers(behavior)


def test_temporary_finish_reports_completion_separately_from_interruption():
    behavior, _animation = make_behavior()
    outcomes = []
    behavior.temporary_finished.connect(
        lambda animation, completed: outcomes.append((animation, completed))
    )

    behavior.play_temporary("eat", 30_000)
    behavior.finish_temporary()
    behavior.play_temporary("play", 30_000)
    behavior.complete_temporary()

    assert outcomes == [("eat", False), ("play", True)]
    stop_timers(behavior)


def test_sick_interrupts_normal_temporary_and_locks_non_carry_actions():
    behavior, animation = make_behavior()
    behavior.play_temporary("play", 2500)

    behavior.update_need_animation("sick")

    assert behavior.is_sick
    assert (behavior.state, animation.state) == (BehaviorState.SICK, "sick")
    assert behavior.play_temporary("touch", 1800) is False
    assert behavior.play_temporary("carry") is True
    assert (behavior.state, animation.state) == (BehaviorState.TEMPORARY, "carry")

    behavior.finish_temporary()
    assert (behavior.state, animation.state) == (BehaviorState.SICK, "sick")
    stop_timers(behavior)


def test_treatment_can_only_start_from_sick_and_completion_returns_to_idle():
    behavior, animation = make_behavior()
    assert behavior.start_treating() is False

    behavior.update_need_animation("sick")
    assert behavior.start_treating() is True
    assert behavior.is_treating
    assert (behavior.state, animation.state) == (BehaviorState.TREATING, "treating")

    behavior.complete_treatment()
    assert not behavior.is_care_locked
    assert (behavior.state, animation.state) == (BehaviorState.IDLE, "idle")
    stop_timers(behavior)



