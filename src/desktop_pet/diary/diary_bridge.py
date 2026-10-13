from pathlib import Path
from shutil import copyfile
from uuid import uuid4

from PySide6.QtCore import QObject, QDate, QUrl, Signal, Slot
from PySide6.QtGui import QImageReader
from PySide6.QtWidgets import QFileDialog

from ..paths import JOURNAL_DIR

from .diary_store import DiaryStore
from .mood_store import MoodStore
from .task_store import TaskStore
from .saved_chat_store import SavedChatStore

class DiaryBridge(QObject):
    typing_triggered = Signal()
    page_changed = Signal(str)

    def __init__(self):
        super().__init__()

        self.store = DiaryStore()
        self.current_date = QDate.currentDate()
        self.has_unsaved_changes = False
        self.current_text = ""
        self.current_page = "home"

        self.mood_store = MoodStore()
        self.task_store = TaskStore()
        self.saved_chat_store = SavedChatStore()

    def _chat_result(self, operation, *args):
        try:
            return {"ok": True, "data": operation(*args)}
        except (OSError, ValueError, KeyError, TypeError):
            return {"ok": False, "error": "Could not read or save chat data. Please try again."}

    @Slot(result="QVariant")
    def chooseDiaryImage(self):
        filename, _filter = QFileDialog.getOpenFileName(
            None, "Choose a diary photo", "",
            "Images (*.png *.jpg *.jpeg *.webp)",
        )
        if not filename:
            return {"ok": False, "cancelled": True}
        source = Path(filename)
        suffix = source.suffix.lower()
        formats = {".png": b"png", ".jpg": b"jpeg", ".jpeg": b"jpeg", ".webp": b"webp"}
        try:
            if suffix not in formats or source.stat().st_size > 10 * 1024 * 1024:
                raise ValueError("Choose a PNG, JPG/JPEG, or WebP image under 10 MB.")
            reader = QImageReader(str(source))
            if not reader.canRead() or bytes(reader.format()).lower() != formats[suffix]:
                raise ValueError("This file is not a supported image.")
            destination_dir = JOURNAL_DIR / "images"
            destination_dir.mkdir(parents=True, exist_ok=True)
            name = f"{uuid4()}{suffix}"
            destination = destination_dir / name
            copyfile(source, destination)
            return {"ok": True, "name": name, "url": QUrl.fromLocalFile(str(destination.resolve())).toString()}
        except (OSError, ValueError) as error:
            return {"ok": False, "error": str(error)}

    @Slot(result="QVariant")
    def getChatMessages(self):
        return self._chat_result(self.saved_chat_store.messages)

    @Slot(str, str, result="QVariant")
    def addChatMessage(self, role, content):
        return self._chat_result(self.saved_chat_store.add_message, role, content)

    @Slot(str, result="QVariant")
    def saveChatMessage(self, message_id):
        return self._chat_result(self.saved_chat_store.save_message, message_id)

    @Slot(str, result="QVariant")
    def unsaveChatMessage(self, message_id):
        return self._chat_result(self.saved_chat_store.unsave_message, message_id)

    @Slot(str, result="QVariant")
    def getSavedChatByDate(self, date):
        return self._chat_result(self.saved_chat_store.snippets_by_date, date)

    @Slot(result="QVariant")
    def getTodayEntry(self):
        date_text = self._date_text(QDate.currentDate())
        return self.loadEntryByDate(date_text)
    
    @Slot(str, result="QVariant")
    def saveTodayEntry(self, text):
        date_text = self._date_text(self.current_date)
        return self.saveEntryByDate(date_text, text)
    
    @Slot(result="QVariant")
    def discardTodayEntry(self):
        entry = self.getTodayEntry()
        self.has_unsaved_changes = False
        return entry
    
    @Slot(result="QVariant")
    def getRecordedDates(self):
        return sorted(self.store.recorded_dates())

    @Slot(result="QVariant")
    def getRecentEntries(self):
        today = self._date_text(QDate.currentDate())
        dates = sorted((date for date in self.store.recorded_dates() if date < today), reverse=True)[:3]
        moods = self.mood_store.recorded_moods()
        return [{"date": entry.date, "text": entry.text, "html": entry.html,
                 "updated_at": entry.updated_at, "mood": moods.get(entry.date, "")}
                for entry in (self.store.load_entry(date) for date in dates)]

    @Slot(str, result="QVariant")
    def getHistoricalEntryByDate(self, date_text):
        date = QDate.fromString(date_text, "yyyy-MM-dd")
        if not date.isValid() or date >= QDate.currentDate():
            return {}
        entry = self.store.load_entry(date_text)
        has_content = bool(entry.text.strip() or 'data-diary-image=' in entry.html)
        return {
            "date": entry.date, "text": entry.text, "html": entry.html,
            "updated_at": entry.updated_at,
            "mood": self.mood_store.recorded_moods().get(date_text, ""),
            "has_content": has_content,
        }

    @Slot(str, str, result="QVariant")
    def saveRecentEntryByDate(self, date_text, text):
        entry = self.store.save_entry(date_text, text)
        return {"date": entry.date, "text": entry.text,
                "html": entry.html, "updated_at": entry.updated_at}

    @Slot(str)
    def notifyTyping(self, text):
        self.current_text = text
        self.has_unsaved_changes = True
        self.typing_triggered.emit()

    @Slot(str)
    def notifyPageChanged(self, page_name):
        self.current_page = page_name
        self.page_changed.emit(page_name)

    def _date_text(self, date):
        return date.toString("yyyy-MM-dd")
    
    @Slot(str, result="QVariant")
    def loadEntryByDate(self, date_text):
        self.current_date = QDate.fromString(date_text, "yyyy-MM-dd")
        entry = self.store.load_entry(date_text)

        self.current_text = entry.text
        self.has_unsaved_changes = False

        return {
            "date": entry.date,
            "text": entry.text,
            "updated_at": entry.updated_at,
            "html": entry.html,
        }

    @Slot(str, str, result="QVariant")
    def saveEntryByDate(self, date_text, text):
        self.current_date = QDate.fromString(date_text, "yyyy-MM-dd")
        try:
            entry = self.store.save_entry(date_text, text)
        except (OSError, ValueError, TypeError):
            return {"ok": False}

        self.current_text = entry.text
        self.has_unsaved_changes = False

        return {
            "date": entry.date,
            "text": entry.text,
            "updated_at": entry.updated_at,
            "html": entry.html,
        }
    
    @Slot(str, str, result="QVariant")
    def saveMoodByDate(self, date, mood):
        entry = self.mood_store.save_mood(date, mood)
        return {
            "date": entry.date,
            "mood": entry.mood,
    }


    @Slot(result="QVariant")
    def getRecordedMoods(self):
        return self.mood_store.recorded_moods()

    @Slot(str, result=str)
    def getMoodNoteByDate(self, date):
        return self.mood_store.note_by_date(date)

    @Slot(str, str, result=str)
    def saveMoodNoteByDate(self, date, note):
        return self.mood_store.save_note(date, note)

    @Slot(result="QVariant")
    def getTasks(self):
        return self.task_store.list_tasks()

    @Slot("QVariant", result="QVariant")
    def addTask(self, values):
        return self.task_store.add_task(dict(values or {}))

    @Slot(str, "QVariant", result="QVariant")
    def updateTask(self, task_id, changes):
        return self.task_store.update_task(task_id, dict(changes or {})) or {}

    @Slot(str, bool, result="QVariant")
    def setTaskCompleted(self, task_id, completed):
        return self.task_store.update_task(task_id, {"completed": completed}) or {}

    @Slot(str, result=bool)
    def deleteTask(self, task_id):
        return self.task_store.delete_task(task_id)
