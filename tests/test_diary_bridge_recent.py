from types import SimpleNamespace

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
