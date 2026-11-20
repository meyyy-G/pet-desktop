from pathlib import Path
from shutil import copyfile
from hashlib import sha256
from uuid import uuid4

from PySide6.QtCore import QObject, QDate, QUrl, Signal, Slot
from PySide6.QtGui import QImageReader
from PySide6.QtWidgets import QFileDialog

from ..paths import CONFIG_DIR, JOURNAL_DIR
from ..settings import SettingsStore

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
    def getProfile(self):
        settings = SettingsStore.load()
        avatar = CONFIG_DIR / "avatars" / Path(settings.avatar_file).name
        avatar_url = QUrl.fromLocalFile(str(avatar.resolve())).toString() if settings.avatar_file and avatar.is_file() else ""
        return {"ok": True, "data": {"displayName": settings.display_name, "avatarUrl": avatar_url}}

    @Slot(str, result="QVariant")
    def saveProfile(self, display_name):
        name = display_name.strip()
        if not name or len(name) > 32:
            return {"ok": False, "error": "Enter a name with 1 to 32 characters."}
        try:
            settings = SettingsStore.load()
            settings.display_name = name
            SettingsStore.save(settings)
        except OSError:
            return {"ok": False, "error": "Could not save your name. Please try again."}
        return {"ok": True, "data": {"displayName": name}}

    @Slot(result="QVariant")
    def chooseProfileAvatar(self):
        filename, _filter = QFileDialog.getOpenFileName(
            None, "Choose a profile photo", "", "Images (*.png *.jpg *.jpeg)",
        )
        if not filename:
            return {"ok": False, "cancelled": True}
        source = Path(filename)
        formats = {".png": b"png", ".jpg": b"jpeg", ".jpeg": b"jpeg"}
        try:
            if source.suffix.lower() not in formats or source.stat().st_size > 10 * 1024 * 1024:
                raise ValueError("Choose a PNG or JPG/JPEG image under 10 MB.")
            reader = QImageReader(str(source))
            if not reader.canRead() or bytes(reader.format()).lower() != formats[source.suffix.lower()]:
                raise ValueError("This file is not a supported image.")
            destination_dir = CONFIG_DIR / "avatars"
            destination_dir.mkdir(parents=True, exist_ok=True)
            digest = sha256(source.read_bytes()).hexdigest()[:24]
            destination = destination_dir / f"{digest}{source.suffix.lower()}"
            if not destination.exists():
                copyfile(source, destination)
            settings = SettingsStore.load()
            settings.avatar_file = destination.name
            SettingsStore.save(settings)
            return {"ok": True, "data": {"avatarUrl": QUrl.fromLocalFile(str(destination.resolve())).toString()}}
        except (OSError, ValueError) as error:
            return {"ok": False, "error": str(error)}

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

    @Slot(str, str, result="QVariant")
    def updateChatMessage(self, message_id, content):
        return self._chat_result(self.saved_chat_store.update_message, message_id, content)

    @Slot(str, result="QVariant")
    def requestChatReply(self, user_message_id):
        # Reply transport boundary: a model provider can replace this later.
        # Never persist a placeholder or invent an assistant response here.
        return {"ok": False, "error": "AI is not connected yet. Retry after a provider is configured."}

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
    def getSavedChatDates(self):
        return self._chat_result(self.saved_chat_store.saved_dates)

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
            "entry_time": entry.entry_time,
            "mood": self.mood_store.recorded_moods().get(date_text, ""),
            "has_content": has_content,
        }

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
            "entry_time": entry.entry_time,
        }

    @Slot(str, result="QVariant")
    def peekEntryByDate(self, date_text):
        date = QDate.fromString(date_text, "yyyy-MM-dd")
        if not date.isValid() or date > QDate.currentDate():
            return {}
        entry = self.store.load_entry(date_text)
        return {
            "date": entry.date,
            "text": entry.text,
            "updated_at": entry.updated_at,
            "html": entry.html,
            "entry_time": entry.entry_time,
        }

    @Slot(str, result="QVariant")
    def deleteEntryByDate(self, date_text):
        date = QDate.fromString(date_text, "yyyy-MM-dd")
        if not date.isValid() or date > QDate.currentDate():
            return {"ok": False}
        try:
            deleted = self.store.delete_entry(date_text)
        except (OSError, ValueError):
            return {"ok": False}
        if deleted and date_text == self._date_text(self.current_date):
            self.current_text = ""
            self.has_unsaved_changes = False
        return {"ok": True, "deleted": deleted}

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
            "entry_time": entry.entry_time,
        }

    @Slot(str, str, str, result="QVariant")
    def saveEntryWithTime(self, date_text, text, entry_time):
        date = QDate.fromString(date_text, "yyyy-MM-dd")
        if not date.isValid() or date > QDate.currentDate():
            return {"ok": False}
        try:
            entry = self.store.save_entry(date_text, text, entry_time)
        except (OSError, ValueError, TypeError):
            return {"ok": False}
        self.current_date = date
        self.current_text = entry.text
        self.has_unsaved_changes = False
        return {
            "date": entry.date,
            "text": entry.text,
            "updated_at": entry.updated_at,
            "html": entry.html,
            "entry_time": entry.entry_time,
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

    @Slot(result="QVariant")
    def getMoodNoteDates(self):
        return self.mood_store.note_dates()

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
