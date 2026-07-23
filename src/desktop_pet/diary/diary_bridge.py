from PySide6.QtCore import QObject, QDate, Signal, Slot

from .diary_store import DiaryStore
from .mood_store import MoodStore

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
        }

    @Slot(str, str, result="QVariant")
    def saveEntryByDate(self, date_text, text):
        self.current_date = QDate.fromString(date_text, "yyyy-MM-dd")
        entry = self.store.save_entry(date_text, text)

        self.current_text = entry.text
        self.has_unsaved_changes = False

        return {
            "date": entry.date,
            "text": entry.text,
            "updated_at": entry.updated_at,
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
