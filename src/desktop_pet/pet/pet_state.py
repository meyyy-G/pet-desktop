from dataclasses import dataclass


@dataclass
class PetState:
    """桌宠的可保存数值状态。"""

    satiety: int = 80
    mood: int = 80
    energy: int = 80
    current_animation: str = "idle"

    def feed(self) -> None:
        self.satiety = min(100, self.satiety + 15)
        self.energy = min(100, self.energy + 2)
        self.current_animation = "eat"

    def can_play(self) -> bool:
        return self.satiety > 20 and self.energy > 20

    def play(self) -> None:
        if not self.can_play():
            return

        self.mood = min(100, self.mood + 12)
        self.satiety = max(0, self.satiety - 3)
        self.energy = max(0, self.energy - 3)
        self.current_animation = "play"

    def sleep(self) -> None:
        self.satiety = max(0, self.satiety - 2)
        self.energy = min(100, self.energy + 12)
        self.current_animation = "sleeping"

    def touch(self) -> None:
        self.mood = min(100, self.mood + 2)
        self.current_animation = "touch"
