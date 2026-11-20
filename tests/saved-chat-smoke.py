"""Exercise real WebChannel persistence with an isolated temporary data directory."""
import json
import os
import sys
import tempfile
from pathlib import Path

temporary = tempfile.TemporaryDirectory()
os.environ["DESKTOP_PET_DATA_DIR"] = temporary.name
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
os.environ.setdefault("QTWEBENGINE_CHROMIUM_FLAGS", "--disable-gpu")
from PySide6.QtCore import QTimer, QUrl
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QApplication

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "src"))
from desktop_pet.diary.diary_bridge import DiaryBridge

app = QApplication([])
view = QWebEngineView()
view.resize(1280, 720)
bridge = DiaryBridge()
for date in ("2026-01-01", "2026-01-02", "2026-01-03"):
    bridge.store.save_entry(date, "Layout fixture")
bridge.mood_store.save_mood(bridge.getTodayEntry()["date"], "Light")
user = bridge.saved_chat_store.add_message("user", "My question")
reply = bridge.saved_chat_store.add_message("assistant", "An independently saved reply")
channel = QWebChannel(view.page())
channel.registerObject("diaryBridge", bridge)
view.page().setWebChannel(channel)
web = root / "src/desktop_pet/web"
assets = QUrl.fromLocalFile(str(root / "assets/web") + "/").toString()
html = (web / "index.html").read_text(encoding="utf-8")
html = html.replace("../../../assets/web/font/fonts.css", assets + "font/fonts.css")
html = html.replace("./assets/Head.png", assets + "Head.png").replace("./assets/", assets + "svg/")
stage = 0

def finish(error=None):
    print(json.dumps({"ok": not error, "error": error}))
    app.exit(1 if error else 0)

def check():
    script = """(() => {
      const button = document.querySelector('.chat-message-assistant button.chat-bookmark');
      const area = document.querySelector('#diary-saved-chat');
      if (!button) return 'wait';
      const userActions = document.querySelector('.chat-message-user .chat-user-actions');
      if (!userActions) return 'user actions missing';
      if (STAGE === 5) {
        document.querySelector('.nav-item[data-page="chat"]').click();
        const actions = document.querySelectorAll('.chat-message-user .chat-user-action');
        if (actions.length !== 3) return 'wrong user actions';
        if ([...actions].map(item => item.getAttribute('aria-label')).join(',') !== "Copy,Save to today's diary,Edit") return 'wrong action labels';
        if ([...actions].some(item => getComputedStyle(item).visibility !== 'hidden')) return 'actions not initially hidden';
        if (document.querySelector('.chat-user-menu')) return 'old context menu remains';
        actions[1].click();
        return 'user-save-clicked';
      }
      if (STAGE === 6) {
        document.querySelector('.nav-item[data-page="diary"]').click();
        if (area.hidden || !area.textContent.includes('My question')) return 'wait';
        document.querySelector('.nav-item[data-page="chat"]').click();
        const actions = document.querySelectorAll('.chat-message-user .chat-user-action');
        if (!actions[1].classList.contains('is-saved') || getComputedStyle(actions[1]).visibility !== 'visible') return 'saved bookmark not persistent';
        if (getComputedStyle(actions[0]).visibility !== 'hidden' || getComputedStyle(actions[2]).visibility !== 'hidden') return 'copy/edit still visible';
        actions[2].click();
        const editor = document.querySelector('.chat-message-user .chat-message-editor');
        if (!editor) return 'user editor missing';
        editor.value = 'My updated question';
        document.querySelector('.chat-message-user .chat-message-edit-actions button').click();
        return 'user-edit-clicked';
      }
      if (STAGE === 7) {
        if (document.querySelector('.chat-message-user .chat-message-editor')) return 'wait';
        if (document.querySelector('.chat-message-user .chat-message-text p').textContent !== 'My updated question') return 'edited text not shown';
        return 'user-edited';
      }
      if (STAGE === 0) {
        if (button.classList.contains('is-saved')) return 'premature save';
        if (getComputedStyle(button).opacity !== '0') return 'bookmark not initially hidden';
        button.click(); button.click();
        return 'clicked';
      }
      if (STAGE === 3 || STAGE === 4) {
        if (button.classList.contains('is-saved')) return 'wait';
        document.querySelector('.nav-item[data-page="diary"]').click();
        if (!area.hidden || document.querySelector('#diary-saved-chat-items').textContent) return 'wait';
        return 'unsaved';
      }
      if (!button.classList.contains('is-saved') || area.hidden) return 'wait';
      document.querySelector('.nav-item[data-page="diary"]').click();
      const bounds = area.getBoundingClientRect();
      if (bounds.height < 60) return 'saved area collapsed: ' + bounds.height;
      if (!area.textContent.includes('An independently saved reply')) return 'missing content';
      if (document.querySelector('#diary-editor').innerText.includes('An independently saved reply')) return 'diary body changed';
      return 'saved';
    })()""".replace("STAGE", str(stage))
    view.page().runJavaScript(script, checked)

def checked(result):
    global stage
    if result == "wait":
        QTimer.singleShot(100, check)
    elif result == "clicked":
        stage = 1
        QTimer.singleShot(250, check)
    elif result == "saved":
        if len(bridge.saved_chat_store._read()["snippets"]) != 1:
            return finish("Duplicate snippet")
        if stage == 1:
            stage = 2
            view.setHtml(html, QUrl.fromLocalFile(str(web) + "/"))
        else:
            stage = 3
            view.page().runJavaScript("document.querySelector('.chat-message-assistant button.chat-bookmark').click()")
            QTimer.singleShot(250, check)
    elif result == "unsaved":
        if bridge.saved_chat_store._read()["snippets"]:
            return finish("Snippet still persisted after unsave")
        if stage == 3:
            stage = 4
            view.setHtml(html, QUrl.fromLocalFile(str(web) + "/"))
        else:
            stage = 5
            QTimer.singleShot(100, check)
    elif result == "user-save-clicked":
        stage = 6
        QTimer.singleShot(250, check)
    elif result == "user-edit-clicked":
        stage = 7
        QTimer.singleShot(250, check)
    elif result == "user-edited":
        snippets = bridge.saved_chat_store._read()["snippets"]
        if len(snippets) != 1 or snippets[0]["role"] != "user" or snippets[0]["content"] != "My updated question":
            return finish("Edited user bookmark was not persisted")
        if bridge.saved_chat_store.messages()[0]["content"] != "My updated question":
            return finish("Edited user message was not persisted")
        finish()
    else:
        finish(result or "Page script unavailable")

view.page().loadFinished.connect(lambda ok: QTimer.singleShot(300, check) if ok else finish("HTML load failed"))
view.show()
view.setHtml(html, QUrl.fromLocalFile(str(web) + "/"))
QTimer.singleShot(20000, lambda: finish("Timed out"))
sys.exit(app.exec())
