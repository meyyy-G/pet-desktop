from datetime import datetime, timedelta

from PySide6.QtCore import QObject, QTimer, Signal

from .pet_state import PetState
from .pet_state_store import (
    SATIETY_DROP_AMOUNT,
    SATIETY_DROP_INTERVAL,
    PetStateStore,
    PetStateTimes,
    utc_now,
)


class PetStateDecay(QObject):
    """用一个 Timer 管理运行期间三个宠物属性的自然下降。"""

    values_changed = Signal(int, int, int)

    CHECK_INTERVAL_MS = 10_000
    MOOD_DROP_INTERVAL = timedelta(minutes=30)
    MOOD_DROP_AMOUNT = 6
    ENERGY_DROP_INTERVAL = timedelta(minutes=45)
    ENERGY_DROP_AMOUNT = 6

    def __init__(
        self,
        state: PetState,
        times: PetStateTimes,
        store: PetStateStore,
        parent=None,
    ):
        super().__init__(parent)
        self.state = state
        self.times = times
        self.store = store

        self.timer = QTimer(self)
        self.timer.setInterval(self.CHECK_INTERVAL_MS)
        self.timer.timeout.connect(self.check_now)
        self.timer.start()

    def register_interaction(self, now: datetime | None = None) -> None:
        """保留现有调用接口；互动不再影响属性自然衰减。"""

    def commit_manual_change(self, old_satiety: int) -> None:
        """喂食、玩耍等操作修改数值后发出最新值并保存。"""
        self.values_changed.emit(
            self.state.satiety,
            self.state.mood,
            self.state.energy,
        )
        self.save()

    def check_now(self, now: datetime | None = None) -> None:
        now = now or utc_now()
        old_satiety = self.state.satiety
        old_mood = self.state.mood
        old_energy = self.state.energy

        satiety_elapsed = max(
            timedelta(0),
            now - self.times.last_satiety_update,
        )
        satiety_drop_count = int(satiety_elapsed // SATIETY_DROP_INTERVAL)
        if satiety_drop_count > 0:
            self.state.satiety = max(
                0,
                self.state.satiety
                - satiety_drop_count * SATIETY_DROP_AMOUNT,
            )
            self.times.last_satiety_update += (
                satiety_drop_count * SATIETY_DROP_INTERVAL
            )

        mood_elapsed = max(timedelta(0), now - self.times.last_mood_update)
        mood_drop_count = int(mood_elapsed // self.MOOD_DROP_INTERVAL)
        if mood_drop_count > 0:
            self.state.mood = max(
                0,
                self.state.mood - mood_drop_count * self.MOOD_DROP_AMOUNT,
            )
            self.times.last_mood_update += (
                mood_drop_count * self.MOOD_DROP_INTERVAL
            )

        energy_elapsed = max(
            timedelta(0),
            now - self.times.last_energy_update,
        )
        energy_drop_count = int(
            energy_elapsed // self.ENERGY_DROP_INTERVAL
        )
        if energy_drop_count > 0:
            self.state.energy = max(
                0,
                self.state.energy
                - energy_drop_count * self.ENERGY_DROP_AMOUNT,
            )
            self.times.last_energy_update += (
                energy_drop_count * self.ENERGY_DROP_INTERVAL
            )

        values_unchanged = (
            self.state.satiety == old_satiety
            and self.state.mood == old_mood
            and self.state.energy == old_energy
        )
        if values_unchanged:
            if satiety_drop_count or mood_drop_count or energy_drop_count:
                self.save()
            return

        self.values_changed.emit(
            self.state.satiety,
            self.state.mood,
            self.state.energy,
        )
        self.save()

    def save(self) -> None:
        self.store.save(self.state, self.times)
