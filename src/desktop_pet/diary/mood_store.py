import json
from dataclasses import dataclass
from pathlib import Path

from ..paths import DATA_DIR


@dataclass
class MoodEntry:
    date: str
    mood: str = ""


class MoodStore:
    def __init__(self):
        self.mood_dir = DATA_DIR / "moods"

    def save_mood(self, date: str, mood: str) -> MoodEntry:
        entry = MoodEntry(date=date, mood=mood)

        path = self._mood_path(date)
        path.parent.mkdir(parents=True, exist_ok=True)

        data = {
            "date": entry.date,
            "mood": entry.mood,
        }

        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        return entry

    def recorded_moods(self) -> dict[str, str]:
        moods = {}

        if not self.mood_dir.exists():
            return moods

        for path in self.mood_dir.glob("*/*/*.json"):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                continue

            date = data.get("date", path.stem)
            mood = data.get("mood", "")

            if mood:
                moods[date] = mood

        return moods

    def _mood_path(self, date: str) -> Path:
        year, month, _ = date.split("-")
        return self.mood_dir / year / month / f"{date}.json"
