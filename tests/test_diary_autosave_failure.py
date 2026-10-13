from desktop_pet.diary.diary_bridge import DiaryBridge


def test_diary_save_returns_failure_for_storage_error(monkeypatch):
    bridge = DiaryBridge()
    bridge.has_unsaved_changes = True

    def fail_save(*_args):
        raise OSError("disk unavailable")

    monkeypatch.setattr(bridge.store, "save_entry", fail_save)
    assert bridge.saveEntryByDate("2026-10-12", "draft") == {"ok": False}
    assert bridge.has_unsaved_changes is True
