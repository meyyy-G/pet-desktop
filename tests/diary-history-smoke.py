"""Exercise Calendar and Recent Entries history routing in real Qt WebEngine."""
import json
import os
import sys
import tempfile
from datetime import date, timedelta
from pathlib import Path

temporary = tempfile.TemporaryDirectory()
os.environ["DESKTOP_PET_DATA_DIR"] = temporary.name
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
os.environ.setdefault("QTWEBENGINE_CHROMIUM_FLAGS", "--disable-gpu")
from PySide6.QtCore import QTimer, QUrl
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile, QWebEngineSettings
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QApplication

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "src"))
from desktop_pet.diary.diary_bridge import DiaryBridge

app = QApplication([])
view = QWebEngineView()
profile = QWebEngineProfile(view)
page = QWebEnginePage(profile, view)
view.setPage(page)
view.settings().setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)
view.resize(1280, 720)
bridge = DiaryBridge()
today = date.today().isoformat()
past = [(date.today() - timedelta(days=days)).isoformat() for days in range(1, 5)]
mood_only = (date.today() - timedelta(days=5)).isoformat()
future = (date.today() + timedelta(days=1)).isoformat()
bridge.store.save_entry(today, "Today's entry")
for index, day in enumerate(past):
    bridge.store.save_entry(day, f"Past entry {index + 1}")
bridge.mood_store.save_mood(mood_only, "Steady")
channel = QWebChannel(page)
channel.registerObject("diaryBridge", bridge)
page.setWebChannel(channel)
web = root / "src/desktop_pet/web"
assets = QUrl.fromLocalFile(str(root / "assets/web") + "/").toString()
html = (web / "index.html").read_text(encoding="utf-8")
html = html.replace("../../../assets/web/font/fonts.css", assets + "font/fonts.css")
html = html.replace("./assets/Head.png", assets + "Head.png").replace("./assets/", assets + "svg/")
stage = 0


def finish(error=None):
    print(json.dumps({"ok": not error, "error": error}))
    app.exit(1 if error else 0)


def evaluate():
    script = r"""(() => { try {
      const dialog = document.querySelector('#diary-recent-dialog');
      const main = document.querySelector('#diary-editor');
      const editor = document.querySelector('#diary-recent-dialog-editor');
      const shell = document.querySelector('.app-shell');
      const cards = [...document.querySelectorAll('.diary-recent-card:not([hidden])')];
      const selectDate = value => {
        const target = new Date(value + 'T00:00:00');
        const month = target.toLocaleDateString('en-US', {month: 'long', year: 'numeric'});
        for (let tries = 0; document.querySelector('#calendar-title').textContent !== month && tries < 5; tries++) {
          document.querySelector('#prev-month-button').click();
        }
        if (document.querySelector('#calendar-title').textContent !== month) return 'month missing';
        const findDay = () => document.querySelector('#calendar-grid [data-date="' + value + '"]');
        let button = findDay();
        if (!button) {
          document.querySelector('#next-month-button').click();
          button = findDay();
        }
        if (!button) return 'date missing';
        button.click();
        return 'clicked';
      };
      if (STAGE === 0) {
        if (cards.length !== 3 || !main.innerText.includes("Today's entry")) return 'wait';
        if (cards.some(card => card.dataset.date === 'TODAY')) return 'today appeared in Recent Entries';
        document.querySelector('.nav-item[data-page="calendar"]').click();
        if (selectDate('PAST') !== 'clicked') return 'past date not found';
        return 'opened-past';
      }
      if (STAGE === 1) {
        if (dialog.hidden) return 'wait';
        if (shell.dataset.activePage !== 'calendar' || dialog.dataset.date !== 'PAST' ||
            editor.innerText !== 'Past entry 4' || main.innerText !== "Today's entry") return 'wrong historical entry or page';
        editor.textContent = 'Discard this edit';
        editor.dispatchEvent(new Event('input', {bubbles: true}));
        document.querySelector('#diary-recent-dialog-cancel').click();
        if (!dialog.hidden || shell.dataset.activePage !== 'calendar') return 'Cancel changed page';
        return 'cancelled';
      }
      if (STAGE === 2) {
        if (selectDate('PAST') !== 'clicked') return 'past date not found on reopen';
        return 'reopening';
      }
      if (STAGE === 3) {
        if (dialog.hidden) return 'wait';
        if (editor.innerText !== 'Past entry 4') return 'Cancel did not discard edit';
        editor.textContent = 'Saved historical edit';
        editor.dispatchEvent(new Event('input', {bubbles: true}));
        document.querySelector('#diary-recent-dialog-save').click();
        return 'saving';
      }
      if (STAGE === 4) {
        if (!dialog.hidden) return 'wait';
        if (shell.dataset.activePage !== 'calendar' || main.innerText !== "Today's entry") return 'Save changed today or page';
        document.querySelector('#today-calendar-button').click();
        if (selectDate('TODAY') !== 'clicked') return 'today not found';
        if (shell.dataset.activePage !== 'diary' || !dialog.hidden) return 'today did not open Diary directly';
        return 'today-opened';
      }
      if (STAGE === 5) {
        document.querySelector('.nav-item[data-page="calendar"]').click();
        if (selectDate('MOOD_ONLY') !== 'clicked') return 'mood-only date not found';
        return 'mood-clicked';
      }
      if (STAGE === 6) {
        if (!dialog.hidden || shell.dataset.activePage !== 'calendar') return 'mood-only date opened history';
        document.querySelector('#today-calendar-button').click();
        let futureButton = document.querySelector('#calendar-grid [data-date="FUTURE"]');
        if (!futureButton) {
          document.querySelector('#next-month-button').click();
          futureButton = document.querySelector('#calendar-grid [data-date="FUTURE"]');
        }
        if (!futureButton || !futureButton.disabled) return 'future date is editable';
        futureButton.click();
        if (!dialog.hidden || shell.dataset.activePage !== 'calendar') return 'future date opened history';
        document.querySelector('.nav-item[data-page="diary"]').click();
        cards[0].click();
        return 'recent-clicked';
      }
      if (STAGE === 7) {
        if (dialog.hidden) return 'wait';
        if (shell.dataset.activePage !== 'diary' || dialog.dataset.date !== cards[0].dataset.date) return 'Recent Entries opened wrong date';
        document.querySelector('#diary-recent-dialog-close').click();
        if (!dialog.hidden || shell.dataset.activePage !== 'diary') return 'close did not stay on Diary';
        return 'done';
      }
      return 'wait';
    } catch (error) { return String(error.stack || error); } })()"""
    script = script.replace("STAGE", str(stage)).replace("TODAY", today).replace("PAST", past[3]).replace("MOOD_ONLY", mood_only).replace("FUTURE", future)
    page.runJavaScript(script, checked)


def checked(result):
    global stage
    expected = ["opened-past", "cancelled", "reopening", "saving", "today-opened", "mood-clicked", "recent-clicked", "done"]
    if result == "wait":
        QTimer.singleShot(100, evaluate)
    elif result != expected[stage]:
        finish(result or "Page script unavailable")
    elif stage == 4 and bridge.store.load_entry(past[3]).text != "Saved historical edit":
        finish("Historical Save did not persist to the selected date")
    elif stage == 7:
        finish()
    else:
        stage += 1
        QTimer.singleShot(200, evaluate)


page.loadFinished.connect(lambda ok: QTimer.singleShot(350, evaluate) if ok else finish("HTML load failed"))
view.show()
view.setHtml(html, QUrl.fromLocalFile(str(web) + "/"))
QTimer.singleShot(20000, lambda: finish("Timed out"))
sys.exit(app.exec())
