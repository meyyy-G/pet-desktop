import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from desktop_pet.diary.saved_chat_store import SavedChatStore


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

    def test_user_and_unknown_messages_cannot_be_saved(self):
        message = self.store.add_message("user", "Question")
        for message_id in (message["id"], "missing"):
            with self.assertRaises(ValueError):
                self.store.save_message(message_id)
        self.assertFalse(self.store.messages()[0]["saved"])

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


if __name__ == "__main__":
    unittest.main()
