"""Exercise Calendar history routing through the Diary timeline and main editor."""
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
os.environ.setdefault("QT_QUICK_BACKEND", "software")
os.environ.setdefault("QT_OPENGL", "software")
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
past = (date.today() - timedelta(days=4)).isoformat()
mood_only = (date.today() - timedelta(days=5)).isoformat()
future = (date.today() + timedelta(days=1)).isoformat()
bridge.store.save_entry(today, "Today's entry")
bridge.store.save_entry(past, "Past entry")
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
      const shell = document.querySelector('.app-shell');
      const editor = document.querySelector('#diary-editor');
      const selectDate = value => {
        const target = new Date(value + 'T00:00:00');
        const month = target.toLocaleDateString('en-US', {month: 'long', year: 'numeric'});
        for (let tries = 0; document.querySelector('#calendar-title').textContent !== month && tries < 4; tries++)
          document.querySelector('#prev-month-button').click();
        if (document.querySelector('#calendar-title').textContent !== month) return false;
        const button = document.querySelector('#calendar-grid [data-date="' + value + '"]');
        if (!button) return false;
        button.click();
        return true;
      };
      if (STAGE === 0) {
        if (!editor.innerText.includes("Today's entry")) return 'wait';
        document.querySelector('.nav-item[data-page="calendar"]').click();
        return selectDate('PAST') ? 'opened-past' : 'past date missing';
      }
      if (STAGE === 1) {
        if (shell.dataset.activePage !== 'diary' || editor.innerText !== 'Past entry') return 'wait';
        if (document.querySelector('#diary-recent-dialog')) return 'old dialog still exists';
        if (!document.querySelector('#diary-timeline-days .is-selected[data-date="PAST"]')) return 'timeline did not select past date';
        editor.textContent = 'Edited past';
        editor.dispatchEvent(new Event('input', {bubbles: true}));
        document.querySelector('#diary-visual-save').click();
        return 'saved-past';
      }
      if (STAGE === 2) {
        document.querySelector('#diary-header-today').click();
        return 'opened-today';
      }
      if (STAGE === 3) {
        if (shell.dataset.activePage !== 'diary' || editor.innerText !== "Today's entry") return 'wait';
        document.querySelector('.nav-item[data-page="calendar"]').click();
        return selectDate('MOOD_ONLY') ? 'checked-mood' : 'mood-only date missing';
      }
      if (STAGE === 4) {
        if (shell.dataset.activePage !== 'calendar') return 'mood-only date opened Diary';
        document.querySelector('#today-calendar-button').click();
        let button = document.querySelector('#calendar-grid [data-date="FUTURE"]');
        if (!button) document.querySelector('#next-month-button').click();
        button = document.querySelector('#calendar-grid [data-date="FUTURE"]');
        return button?.disabled ? 'done' : 'future date was editable';
      }
      return 'wait';
    } catch (error) { return String(error.stack || error); } })()"""
    script = script.replace("STAGE", str(stage)).replace("PAST", past).replace("MOOD_ONLY", mood_only).replace("FUTURE", future)
    page.runJavaScript(script, checked)

def checked(result):
    global stage
    expected = ["opened-past", "saved-past", "opened-today", "checked-mood", "done"]
    if result == "wait":
        QTimer.singleShot(100, evaluate)
    elif result != expected[stage]:
        finish(result or "Page script unavailable")
    elif stage == 4:
        finish()
    else:
        stage += 1
        if stage == 2:
            QTimer.singleShot(500, verify_saved)
        else:
            QTimer.singleShot(200, evaluate)

def verify_saved():
    if bridge.store.load_entry(past).text != "Edited past":
        finish("Historical edit did not persist")
    else:
        evaluate()

page.loadFinished.connect(lambda ok: QTimer.singleShot(350, evaluate) if ok else finish("HTML load failed"))
view.show()
view.setHtml(html, QUrl.fromLocalFile(str(web) + "/"))
QTimer.singleShot(20000, lambda: finish("Timed out"))
sys.exit(app.exec())
