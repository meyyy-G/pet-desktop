from dataclasses import dataclass


@dataclass(frozen=True)
class PetStateEffect:
    satiety: int = 0
    mood: int = 0
    energy: int = 0


FEED_EFFECT = PetStateEffect(satiety=15, energy=2)
PLAY_EFFECT = PetStateEffect(satiety=-3, mood=10, energy=-5)

EAT_DURATION_MS = 30_000
PLAY_DURATION_MS = 30_000
SLEEP_DURATION_MS = 30 * 60 * 1_000
SLEEP_MAX_ENERGY = 30

