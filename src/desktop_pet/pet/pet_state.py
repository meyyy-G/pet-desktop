from dataclasses import dataclass


@dataclass
class PetState:
    hunger: int = 80
    mood: int = 80
    current_animation: str = "idle"

    def feed(self) -> str:
        self.hunger = min(100, self.hunger + 15)
        self.mood = min(100, self.mood + 3)
        self.current_animation = "eat"
        return "喵，吃饱一点了。"

    def play(self) -> str:
        self.mood = min(100, self.mood + 12)
        self.hunger = max(0, self.hunger - 3)
        self.current_animation = "play"
        return "喵，开心。"

    def sleep(self) -> str:
        self.hunger = max(0, self.hunger - 2)
        self.mood = min(100, self.mood + 6)
        self.current_animation = "sleeping"
        return "喵，想睡一会儿。"

    def touch(self) -> str:
        self.mood = min(100, self.mood + 5)
        self.current_animation = "touch"
        return "喵"
