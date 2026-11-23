from dataclasses import dataclass

from .action_rules import PetStateEffect


@dataclass
class PetState:
    """桌宠的可保存数值状态。"""

    satiety: int = 80
    mood: int = 80
    energy: int = 80

    def apply(self, effect: PetStateEffect) -> None:
        self.satiety = self._clamp(self.satiety + effect.satiety)
        self.mood = self._clamp(self.mood + effect.mood)
        self.energy = self._clamp(self.energy + effect.energy)

    def can_play(self) -> bool:
        return self.satiety > 20 and self.energy > 20

    @staticmethod
    def _clamp(value: int) -> int:
        return max(0, min(100, value))
