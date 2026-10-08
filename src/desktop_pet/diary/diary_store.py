import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from ..paths import JOURNAL_DIR

RICH_TEXT_PREFIX = "\x1fpet-diary-rich-v1:"

"""日记存档"""
@dataclass
class DiaryEntry:
    date: str
    text: str = ""
    updated_at: str = ""
    html: str = ""


class DiaryStore:
    def __init__(self):
        self.diary_dir = JOURNAL_DIR

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
            updated_at=data.get("updated_at",""),
            html=data.get("html", ""),
        )

    def save_entry(self,date: str,text: str) -> DiaryEntry:
        html = ""
        if text.startswith(RICH_TEXT_PREFIX):
            payload = json.loads(text[len(RICH_TEXT_PREFIX):])
            if not isinstance(payload, dict) or not isinstance(payload.get("text"), str) or not isinstance(payload.get("html"), str):
                raise ValueError("Invalid rich diary content")
            text, html = payload["text"], payload["html"]
        entry = DiaryEntry(
            date=date,
            text=text,
            updated_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            html=html,
        )

        path = self._entry_path(date)
        path.parent.mkdir(parents=True, exist_ok=True)#自动创建目录

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
            "text":entry.text,
            "updated_at": entry.updated_at,
        })
        if entry.html:
            data["html"] = entry.html
        else:
            data.pop("html", None)

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
        """生成文件路径 data/journal/2026/06/2026-06-10.json。"""
        year, month,_day = date.split("-")
        return self.diary_dir / year / month / f"{date}.json"
