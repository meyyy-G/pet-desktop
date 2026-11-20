from types import SimpleNamespace

from PySide6.QtCore import QDate

from desktop_pet.diary.diary_bridge import DiaryBridge


def test_historical_entry_load_is_read_only_and_requires_content():
    bridge = DiaryBridge()
    yesterday = QDate.currentDate().addDays(-1).toString("yyyy-MM-dd")
    bridge.current_date = QDate.currentDate()
    bridge.current_text = "Unsaved today"
    bridge.has_unsaved_changes = True
    entry = SimpleNamespace(date=yesterday, text="", html="", updated_at="")
    bridge.store = SimpleNamespace(load_entry=lambda _date: entry)
    bridge.mood_store = SimpleNamespace(recorded_moods=lambda: {yesterday: "Steady"})

    mood_only = bridge.getHistoricalEntryByDate(yesterday)
    assert mood_only["mood"] == "Steady"
    assert mood_only["has_content"] is False
    entry.text = "Past diary"
    assert bridge.getHistoricalEntryByDate(yesterday)["has_content"] is True
    assert bridge.getHistoricalEntryByDate(QDate.currentDate().toString("yyyy-MM-dd")) == {}
    assert bridge.current_text == "Unsaved today"
    assert bridge.has_unsaved_changes is True
    assert bridge.current_date == QDate.currentDate()
