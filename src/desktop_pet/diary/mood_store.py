import json
from dataclasses import dataclass
from pathlib import Path

from ..paths import JOURNAL_DIR


@dataclass
class MoodEntry:
    date: str
    mood: str = ""


class MoodStore:
    def __init__(self):
        self.mood_dir = JOURNAL_DIR

    def save_mood(self, date: str, mood: str) -> MoodEntry:
        entry = MoodEntry(date=date, mood=mood)

        path = self._mood_path(date)
        path.parent.mkdir(parents=True, exist_ok=True)

        data = {}
        if path.exists():
            try:
                existing = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(existing, dict):
                    data.update(existing)
            except (json.JSONDecodeError, OSError):
                pass
        data.update({
            "date": entry.date,
            "mood": entry.mood,
        })

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

    def note_by_date(self, date: str) -> str:
        path = self._mood_path(date)
        if not path.exists():
            return ""
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return ""
        return str(data.get("mood_note", "")) if isinstance(data, dict) else ""

    def save_note(self, date: str, note: str) -> str:
        note = note.strip()
        if len(note) > 25:
            raise ValueError("Mood note must be 25 characters or fewer")
        path = self._mood_path(date)
        path.parent.mkdir(parents=True, exist_ok=True)
        data = {}
        if path.exists():
            data = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                raise ValueError("Invalid journal data")
        data["date"] = date
        if note:
            data["mood_note"] = note
        else:
            data.pop("mood_note", None)
        path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        return note

    def _mood_path(self, date: str) -> Path:
        year, month, _ = date.split("-")
        return self.mood_dir / year / month / f"{date}.json"
