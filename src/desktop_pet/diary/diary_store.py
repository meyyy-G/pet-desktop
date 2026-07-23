import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from ..paths import DATA_DIR

"""日记存档"""
@dataclass
class DiaryEntry:
    date: str
    text: str = ""
    updated_at: str = ""


class DiaryStore:
    def __init__(self):
        self.diary_dir = DATA_DIR / "diary"

    def load_entry(self, date: str) -> DiaryEntry:
        path = self._entry_path(date)

        if not path.exists():
            return DiaryEntry(date=date)

        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return DiaryEntry(date=date)

        return DiaryEntry(
            date=data.get("date",date),
            text=data.get("text",""),
            updated_at=data.get("updated_at","")
        )

    def save_entry(self,date: str,text: str) -> DiaryEntry:
        entry = DiaryEntry(
            date=date,
            text=text,
            updated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        )

        path = self._entry_path(date)
        path.parent.mkdir(parents=True, exist_ok=True)#自动创建目录

        data = {
            "date": entry.date,
            "text":entry.text,
            "updated_at": entry.updated_at,
        }

        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        return entry

    def recorded_dates(self) -> set[str]:
        recorded = set()

        if not self.diary_dir.exists():
            return recorded

        for path in self.diary_dir.glob("*/*/*.json"):
            try:
                data = json.loads(path.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError):
                continue

            date = data.get("date", path.stem)
            text = data.get("text", "")

            if text.strip():
                recorded.add(date)

        return recorded

    def _entry_path(self, date: str) -> Path:
        """生成文件路径data/diary/2026/06/2026-06-10.json"""
        year, month,_day = date.split("-")
        return self.diary_dir / year / month / f"{date}.json"
