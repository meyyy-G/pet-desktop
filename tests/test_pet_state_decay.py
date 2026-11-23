from datetime import datetime, timedelta, timezone

from PySide6.QtCore import QCoreApplication

from desktop_pet.pet.pet_state import PetState
from desktop_pet.pet.pet_state_store import PetStateTimes
from desktop_pet.pet.state_decay import PetStateDecay


class RecordingStore:
    def __init__(self):
        self.saved = []

    def save(self, state, times):
        self.saved.append(
            (
                (state.satiety, state.mood, state.energy),
                (
                    times.last_satiety_update,
                    times.last_mood_update,
                    times.last_energy_update,
                ),
            )
        )


def make_decay(state, start):
    QCoreApplication.instance() or QCoreApplication([])
    store = RecordingStore()
    times = PetStateTimes(start, start, start)
    decay = PetStateDecay(state, times, store)
    decay.timer.stop()
    return decay, store


def test_decay_applies_every_complete_interval_and_emits_latest_values():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    state = PetState()
    decay, store = make_decay(state, start)
    emitted = []
    decay.values_changed.connect(lambda *values: emitted.append(values))

    decay.check_now(start + timedelta(minutes=30))

    assert (state.satiety, state.mood, state.energy) == (74, 74, 80)
    assert emitted == [(74, 74, 80)]
    assert store.saved[-1][0] == (74, 74, 80)


def test_decay_catches_up_multiple_intervals_without_dropping_below_zero():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    state = PetState(satiety=5, mood=5, energy=5)
    decay, _store = make_decay(state, start)

    decay.check_now(start + timedelta(hours=3))

    assert (state.satiety, state.mood, state.energy) == (0, 0, 0)


def test_decay_saves_elapsed_timestamps_even_when_values_are_already_zero():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    state = PetState(satiety=0, mood=0, energy=0)
    decay, store = make_decay(state, start)
    emitted = []
    decay.values_changed.connect(lambda *values: emitted.append(values))

    decay.check_now(start + timedelta(minutes=45))

    assert emitted == []
    assert len(store.saved) == 1
    assert decay.times.last_satiety_update == start + timedelta(minutes=40)
    assert decay.times.last_mood_update == start + timedelta(minutes=30)
    assert decay.times.last_energy_update == start + timedelta(minutes=45)


def test_manual_change_emits_and_saves_current_values():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    state = PetState(satiety=95, mood=82, energy=81)
    decay, store = make_decay(state, start)
    emitted = []
    decay.values_changed.connect(lambda *values: emitted.append(values))

    decay.commit_manual_change(old_satiety=80)

    assert emitted == [(95, 82, 81)]
    assert store.saved[-1][0] == (95, 82, 81)

