import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from ..paths import PET_STATE_FILE
from .pet_state import PetState


SATIETY_DROP_INTERVAL = timedelta(minutes=10)
SATIETY_DROP_AMOUNT = 2


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class PetStateTimes:
    last_satiety_update: datetime
    last_mood_update: datetime
    last_energy_update: datetime


@dataclass
class LoadedPetState:
    state: PetState
    times: PetStateTimes


class PetStateStore:
    """负责 JSON 数据持久化；三个需求值离线期间保持不变。"""

    def __init__(self, path: Path = PET_STATE_FILE):
        self.path = path

    def load(self, now: datetime | None = None) -> LoadedPetState:
        now = self._as_utc(now or utc_now())
        defaults = LoadedPetState(
            state=PetState(),
            times=PetStateTimes(now, now, now),
        )

        if not self.path.exists():
            return defaults

        try:
            with self.path.open("r", encoding="utf-8") as file:
                data = json.load(file)
        except (OSError, json.JSONDecodeError, TypeError):
            return defaults

        state = PetState(
            satiety=self._clamp_value(data.get("satiety", 80)),
            mood=self._clamp_value(data.get("mood", 80)),
            energy=self._clamp_value(data.get("energy", 80)),
        )
        # 三个需求值离线期间都不下降；启动时从当前时刻重新计时。
        times = PetStateTimes(
            last_satiety_update=now,
            last_mood_update=now,
            last_energy_update=now,
        )

        return LoadedPetState(
            state=state,
            times=times,
        )

    def save(self, state: PetState, times: PetStateTimes) -> None:
        data = {
            "satiety": self._clamp_value(state.satiety),
            "mood": self._clamp_value(state.mood),
            "energy": self._clamp_value(state.energy),
            "last_satiety_update": self._as_utc(
                times.last_satiety_update
            ).isoformat(),
            "last_mood_update": self._as_utc(
                times.last_mood_update
            ).isoformat(),
            "last_energy_update": self._as_utc(
                times.last_energy_update
            ).isoformat(),
        }
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("w", encoding="utf-8") as file:
            json.dump(data, file, ensure_ascii=False, indent=2)

    @staticmethod
    def _clamp_value(value) -> int:
        try:
            return max(0, min(100, int(value)))
        except (TypeError, ValueError):
            return 80

    @staticmethod
    def _as_utc(value: datetime) -> datetime:
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
