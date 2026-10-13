import pytest

from desktop_pet.diary.diary_bridge import DiaryBridge
from desktop_pet.diary.diary_store import DiaryStore
from desktop_pet.diary.mood_store import MoodStore


def test_mood_notes_share_journal_file_without_changing_diary_or_mood(tmp_path):
    date = "2026-10-08"
    diary = DiaryStore()
    diary.diary_dir = tmp_path
    moods = MoodStore()
    moods.mood_dir = tmp_path
    diary.save_entry(date, "Diary body")
    moods.save_mood(date, "Steady")

    bridge = DiaryBridge()
    bridge.mood_store = moods
    assert bridge.saveMoodNoteByDate(date, "  Quiet morning  ") == "Quiet morning"
    assert bridge.getMoodNoteByDate(date) == "Quiet morning"
    assert diary.load_entry(date).text == "Diary body"
    assert moods.recorded_moods()[date] == "Steady"

    assert bridge.saveMoodNoteByDate(date, "") == ""
    assert bridge.getMoodNoteByDate(date) == ""
    assert diary.load_entry(date).text == "Diary body"
    assert moods.recorded_moods()[date] == "Steady"


def test_mood_note_is_limited_to_25_characters(tmp_path):
    moods = MoodStore()
    moods.mood_dir = tmp_path
    with pytest.raises(ValueError):
        moods.save_note("2026-10-08", "x" * 26)
