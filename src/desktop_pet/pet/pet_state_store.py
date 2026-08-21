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
    satiety_before_offline_decay: int


class PetStateStore:
    """负责JSON 数据持久化及离线结算。"""

    def __init__(self, path: Path = PET_STATE_FILE):
        self.path = path

    def load(self, now: datetime | None = None) -> LoadedPetState:
        now = self._as_utc(now or utc_now())
        defaults = LoadedPetState(
            state=PetState(),
            times=PetStateTimes(now, now, now),
            satiety_before_offline_decay=80,
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
        last_satiety_update = self._parse_time(
            data.get("last_satiety_update"),
            now,
        )
        last_satiety_update = min(last_satiety_update, now)
        # 心情值和精力值离线期间不下降；启动时从当前时刻重新计时。
        times = PetStateTimes(
            last_satiety_update=last_satiety_update,
            last_mood_update=now,
            last_energy_update=now,
        )

        old_satiety = state.satiety
        elapsed = max(timedelta(0), now - last_satiety_update)
        drop_count = int(elapsed // SATIETY_DROP_INTERVAL)
        if drop_count > 0:
            state.satiety = max(
                0,
                state.satiety - drop_count * SATIETY_DROP_AMOUNT,
            )
            times.last_satiety_update = (
                last_satiety_update + drop_count * SATIETY_DROP_INTERVAL
            )

        return LoadedPetState(
            state=state,
            times=times,
            satiety_before_offline_decay=old_satiety,
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
    def _parse_time(value, fallback: datetime) -> datetime:
        if not isinstance(value, str):
            return fallback
        try:
            return PetStateStore._as_utc(datetime.fromisoformat(value))
        except ValueError:
            return fallback

    @staticmethod
    def _as_utc(value: datetime) -> datetime:
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
