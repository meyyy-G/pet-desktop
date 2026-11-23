import pytest

from desktop_pet.pet.action_rules import FEED_EFFECT, PLAY_EFFECT, PetStateEffect
from desktop_pet.pet.need_rules import (
    highest_need_severity,
    resolve_need_animation,
    resolve_persistent_hint,
    resolve_transient_hint,
)
from desktop_pet.pet.pet_state import PetState
from desktop_pet.pet.animation import PetAnimation


def test_feed_clamps_values():
    state = PetState(satiety=90, mood=40, energy=99)

    state.apply(FEED_EFFECT)

    assert (state.satiety, state.mood, state.energy) == (100, 40, 100)


def test_play_changes_all_values_when_needs_are_above_the_limit():
    state = PetState(satiety=21, mood=95, energy=21)

    state.apply(PLAY_EFFECT)

    assert (state.satiety, state.mood, state.energy) == (18, 100, 16)


@pytest.mark.parametrize("satiety, energy", [(20, 80), (80, 20), (0, 0)])
def test_play_eligibility_requires_satiety_and_energy_above_twenty(satiety, energy):
    state = PetState(satiety=satiety, mood=30, energy=energy)

    assert not state.can_play()


def test_effect_application_clamps_all_values():
    state = PetState(satiety=1, mood=99, energy=95)

    state.apply(PetStateEffect(energy=12))
    assert (state.satiety, state.mood, state.energy) == (1, 99, 100)

    state.apply(PLAY_EFFECT)
    assert (state.satiety, state.mood, state.energy) == (0, 100, 95)


@pytest.mark.parametrize(
    "values, expected",
    [
        ((51, 51, 51), None),
        ((50, 80, 80), "upset"),
        ((80, 80, 50), "sleepy"),
        ((80, 50, 80), "upset"),
        ((25, 80, 80), "angry"),
        ((80, 80, 25), "sleepy"),
        ((80, 25, 80), "cry"),
        ((15, 80, 80), "sick"),
        ((80, 80, 15), "sleep"),
        ((80, 15, 80), "sick"),
    ],
)
def test_need_animation_thresholds_are_characterized(values, expected):
    assert resolve_need_animation(*values) == expected


def test_need_resolution_prefers_severity_then_satiety_energy_mood_order():
    assert resolve_need_animation(25, 25, 25) == "angry"
    assert resolve_need_animation(25, 15, 15) == "sleep"
    assert highest_need_severity(25, 15, 50) == 15


def test_thought_bubble_rules_keep_their_existing_mapping():
    assert resolve_persistent_hint(40, 80, 80) == "hungry"
    assert resolve_persistent_hint(25, 25, 25) == "upset"
    assert resolve_persistent_hint(80, 80, 25) == "sleep"
    assert resolve_persistent_hint(80, 80, 80) is None
    assert resolve_transient_hint((76, 80, 80), (75, 80, 80)) == "hungry"
    assert resolve_transient_hint((80, 80, 51), (80, 80, 50)) == "sleep"


def test_settlement_animation_uses_the_complete_shy_sequence_once():
    assert PetAnimation.FRAME_PATTERN["settlement"] == (
        "interactive_rect/shy",
        "shy_rect_",
        12,
    )
    assert "settlement" in PetAnimation.ONE_SHOT_STATES


def test_idle_animation_uses_the_tuned_preview_interval():
    assert PetAnimation.STATE_INTERVALS["idle"] == 360


def test_hover_animation_uses_all_new_mouse_interaction_frames():
    assert PetAnimation.FRAME_PATTERN["hover"] == (
        "interactive_rect/Hover",
        "Hover_",
        16,
    )
    assert "hover" not in PetAnimation.ONE_SHOT_STATES
    assert "hover_exit" in PetAnimation.ONE_SHOT_STATES
    assert PetAnimation.STATE_INTERVALS["hover_exit"] == 220

