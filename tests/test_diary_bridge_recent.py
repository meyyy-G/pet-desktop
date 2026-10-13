from types import SimpleNamespace

from PySide6.QtCore import QDate

from desktop_pet.diary.diary_bridge import DiaryBridge


def test_recent_entries_include_edit_time_and_mood():
    bridge = DiaryBridge()
    entries = {
        "2026-10-01": SimpleNamespace(date="2026-10-01", text="First", html="<p>First</p>", updated_at="2026-10-01 09:00:00"),
        "2026-10-02": SimpleNamespace(date="2026-10-02", text="Second", html="", updated_at="2026-10-02 10:00:00"),
    }
    bridge.store = SimpleNamespace(recorded_dates=lambda: set(entries), load_entry=entries.__getitem__)
    bridge.mood_store = SimpleNamespace(recorded_moods=lambda: {"2026-10-02": "Steady"})

    assert bridge.getRecentEntries() == [
        {"date": "2026-10-02", "text": "Second", "html": "", "updated_at": "2026-10-02 10:00:00", "mood": "Steady"},
        {"date": "2026-10-01", "text": "First", "html": "<p>First</p>", "updated_at": "2026-10-01 09:00:00", "mood": ""},
    ]


def test_recent_entries_exclude_today():
    bridge = DiaryBridge()
    today = QDate.currentDate().toString("yyyy-MM-dd")
    yesterday = QDate.currentDate().addDays(-1).toString("yyyy-MM-dd")
    entries = {
        today: SimpleNamespace(date=today, text="Today", html="", updated_at=""),
        yesterday: SimpleNamespace(date=yesterday, text="Yesterday", html="", updated_at=""),
    }
    bridge.store = SimpleNamespace(recorded_dates=lambda: set(entries), load_entry=entries.__getitem__)
    bridge.mood_store = SimpleNamespace(recorded_moods=lambda: {})

    assert [entry["date"] for entry in bridge.getRecentEntries()] == [yesterday]


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
