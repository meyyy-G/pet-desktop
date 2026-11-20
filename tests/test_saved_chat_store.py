import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from desktop_pet.diary.saved_chat_store import SavedChatStore
from desktop_pet.diary.diary_bridge import DiaryBridge


class SavedChatTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "saved_chat.json"
        self.store = SavedChatStore(self.path)

    def test_reopen_restores_ids_content_and_saved_state(self):
        message = self.store.add_message("assistant", "Hello\n你好")
        snippet = self.store.save_message(message["id"])
        reopened = SavedChatStore(self.path)
        self.assertTrue(reopened.messages()[0]["saved"])
        self.assertEqual(reopened.messages()[0]["id"], message["id"])
        self.assertEqual(reopened.snippets_by_date(snippet["date"]), [snippet])
        self.assertEqual(snippet["content"], "Hello\n你好")

    def test_repeated_save_is_idempotent_even_on_another_day(self):
        message = self.store.add_message("assistant", "Reply")
        with patch("desktop_pet.diary.saved_chat_store.datetime") as clock:
            clock.now.return_value = datetime.fromisoformat("2026-09-24T15:26:00+08:00")
            first = self.store.save_message(message["id"])
        with patch("desktop_pet.diary.saved_chat_store.datetime") as clock:
            clock.now.return_value = datetime.fromisoformat("2026-09-25T16:02:00+08:00")
            second = self.store.save_message(message["id"])
        self.assertEqual(first, second)
        self.assertEqual(len(self.store.snippets_by_date(first["date"])), 1)
        self.assertEqual(self.store.snippets_by_date("2026-09-23"), [])
        self.assertEqual(self.store.snippets_by_date("2026-09-25"), [])

    def test_unsave_removes_snippet_and_restores_unsaved_state(self):
        message = self.store.add_message("assistant", "Reply")
        snippet = self.store.save_message(message["id"])
        removed = self.store.unsave_message(message["id"])
        self.assertEqual(removed, snippet)
        self.assertFalse(self.store.messages()[0]["saved"])
        self.assertEqual(self.store.snippets_by_date(snippet["date"]), [])

    def test_unknown_or_already_unsaved_message_cannot_be_unsaved(self):
        message = self.store.add_message("assistant", "Reply")
        for message_id in (message["id"], "missing"):
            with self.assertRaises(ValueError):
                self.store.unsave_message(message_id)

    def test_user_message_can_be_saved_and_restored_for_its_save_date(self):
        message = self.store.add_message("user", "Question")
        with patch("desktop_pet.diary.saved_chat_store.datetime") as clock:
            clock.now.return_value = datetime.fromisoformat("2026-09-24T15:26:00+08:00")
            snippet = self.store.save_message(message["id"])
        self.assertEqual(snippet["role"], "user")
        self.assertEqual(snippet["date"], "2026-09-24")
        self.assertTrue(SavedChatStore(self.path).messages()[0]["saved"])
        self.assertEqual(self.store.snippets_by_date("2026-09-24"), [snippet])
        self.assertEqual(self.store.saved_dates(), ["2026-09-24"])
        self.store.unsave_message(message["id"])
        self.assertFalse(self.store.messages()[0]["saved"])
        self.assertEqual(self.store.saved_dates(), [])

    def test_calendar_dates_include_both_roles_without_duplicates(self):
        user = self.store.add_message("user", "Question")
        assistant = self.store.add_message("assistant", "Reply")
        with patch("desktop_pet.diary.saved_chat_store.datetime") as clock:
            clock.now.return_value = datetime.fromisoformat("2026-09-24T15:26:00+08:00")
            self.store.save_message(user["id"])
            self.store.save_message(assistant["id"])
        self.assertEqual(self.store.saved_dates(), ["2026-09-24"])
        self.assertEqual({item["role"] for item in self.store.snippets_by_date("2026-09-24")}, {"user", "assistant"})

    def test_edit_saved_user_message_updates_original_and_snippet_without_moving_date(self):
        user = self.store.add_message("user", "Old text")
        with patch("desktop_pet.diary.saved_chat_store.datetime") as clock:
            clock.now.return_value = datetime.fromisoformat("2026-09-24T15:26:00+08:00")
            self.store.save_message(user["id"])
        updated = self.store.update_message(user["id"], "New text")
        self.assertEqual(updated["content"], "New text")
        self.assertEqual(updated["saved_date"], "2026-09-24")
        self.assertEqual(SavedChatStore(self.path).messages()[0]["content"], "New text")
        self.assertEqual(self.store.snippets_by_date("2026-09-24")[0]["content"], "New text")

    def test_edit_rejects_empty_or_assistant_message_without_changing_storage(self):
        assistant = self.store.add_message("assistant", "Reply")
        user = self.store.add_message("user", "Question")
        before = self.path.read_bytes()
        for message_id, content in ((assistant["id"], "Changed"), (user["id"], "  ")):
            with self.assertRaises(ValueError):
                self.store.update_message(message_id, content)
        self.assertEqual(self.path.read_bytes(), before)

    def test_failed_edit_write_keeps_message_and_saved_snippet_unchanged(self):
        user = self.store.add_message("user", "Original")
        self.store.save_message(user["id"])
        before = self.path.read_bytes()
        with patch("desktop_pet.diary.saved_chat_store.os.replace", side_effect=OSError("Disk error")):
            with self.assertRaises(OSError):
                self.store.update_message(user["id"], "Changed")
        self.assertEqual(self.path.read_bytes(), before)

    def test_unknown_message_cannot_be_saved(self):
        with self.assertRaises(ValueError):
            self.store.save_message("missing")

    def test_failed_write_does_not_mark_saved_or_overwrite_existing_data(self):
        message = self.store.add_message("assistant", "Reply")
        before = self.path.read_bytes()
        with patch("desktop_pet.diary.saved_chat_store.os.replace", side_effect=OSError("Disk error")):
            with self.assertRaises(OSError):
                self.store.save_message(message["id"])
        self.assertEqual(self.path.read_bytes(), before)
        self.assertFalse(self.store.messages()[0]["saved"])

    def test_failed_unsave_does_not_remove_existing_snippet(self):
        message = self.store.add_message("assistant", "Reply")
        snippet = self.store.save_message(message["id"])
        before = self.path.read_bytes()
        with patch("desktop_pet.diary.saved_chat_store.os.replace", side_effect=OSError("Disk error")):
            with self.assertRaises(OSError):
                self.store.unsave_message(message["id"])
        self.assertEqual(self.path.read_bytes(), before)
        self.assertTrue(self.store.messages()[0]["saved"])
        self.assertEqual(self.store.snippets_by_date(snippet["date"]), [snippet])

    def test_unconfigured_reply_does_not_persist_placeholder_or_fake_answer(self):
        bridge = DiaryBridge()
        bridge.saved_chat_store = self.store
        user = bridge.addChatMessage("user", "How was today?")["data"]
        result = bridge.requestChatReply(user["id"])
        self.assertFalse(result["ok"])
        self.assertEqual(self.store.messages(), [user])


if __name__ == "__main__":
    unittest.main()
