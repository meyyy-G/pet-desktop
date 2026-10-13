import base64
import json
from pathlib import Path

from desktop_pet.diary import diary_bridge
from desktop_pet.diary.diary_store import DiaryStore


PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg=="
)


def test_image_picker_copies_png_into_journal(tmp_path, monkeypatch):
    source = tmp_path / "photo.png"
    source.write_bytes(PNG_1PX)
    journal = tmp_path / "journal"
    monkeypatch.setattr(diary_bridge, "JOURNAL_DIR", journal)
    monkeypatch.setattr(
        diary_bridge.QFileDialog, "getOpenFileName",
        lambda *_args: (str(source), "Images"),
    )

    result = diary_bridge.DiaryBridge().chooseDiaryImage()

    assert result["ok"]
    assert result["name"].endswith(".png")
    assert (journal / "images" / result["name"]).read_bytes() == PNG_1PX
    assert result["url"].startswith("file:///")


def test_image_only_entry_remains_recorded(tmp_path):
    store = DiaryStore()
    store.diary_dir = tmp_path
    date = "2026-10-09"
    entry_path = tmp_path / "2026" / "10" / f"{date}.json"
    entry_path.parent.mkdir(parents=True)
    entry_path.write_text(
        json.dumps({"date": date, "text": "", "html": '<img data-diary-image="00000000-0000-0000-0000-000000000000.png">'}),
        encoding="utf-8",
    )

    assert date in store.recorded_dates()
