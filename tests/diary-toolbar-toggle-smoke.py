"""Exercise Diary toolbar toggles in Qt WebEngine."""
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
channel = QWebChannel(page)
channel.registerObject("diaryBridge", bridge)
page.setWebChannel(channel)
web = root / "src/desktop_pet/web"
assets = QUrl.fromLocalFile(str(root / "assets/web") + "/").toString()
html = (web / "index.html").read_text(encoding="utf-8")
html = html.replace("../../../assets/web/font/fonts.css", assets + "font/fonts.css")
html = html.replace("./assets/Head.png", assets + "Head.png").replace("./assets/", assets + "svg/")


def finish(error=None):
    print(json.dumps({"ok": not error, "error": error}))
    app.exit(1 if error else 0)


def evaluate():
    script = r"""(() => { try {
      const editor = document.querySelector('#diary-editor');
      if (!editor || !document.querySelector('.nav-item[data-page="diary"]')) return 'wait';
      document.querySelector('.nav-item[data-page="diary"]').click();
      const check = (target, button, selected = false) => {
        target.textContent = 'Alpha beta';
        target.dispatchEvent(new Event('input', {bubbles: true}));
        target.focus();
        const range = document.createRange();
        range.setStart(target.firstChild, selected ? 0 : target.firstChild.length);
        if (selected) range.setEnd(target.firstChild, 5);
        else range.collapse(true);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        const click = () => {
          button.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, cancelable: true}));
          button.click();
        };
        click();
        const first = button.getAttribute('aria-pressed');
        click();
        const second = button.getAttribute('aria-pressed');
        if (!selected && ['bold', 'italic', 'underline'].includes(button.dataset.editorCommand || button.dataset.recentCommand)) {
          document.execCommand('insertText', false, 'Z');
        }
        return {first, second, html: target.innerHTML};
      };
      const results = {};
      for (const command of ['bold', 'italic', 'underline', 'bullet', 'number']) {
        const button = document.querySelector('.diary-writing-area [data-editor-command="' + command + '"]');
        results['main-' + command] = check(editor, button);
      }
      results['main-selected-bold'] = check(editor, document.querySelector('.diary-writing-area [data-editor-command="bold"]'), true);
      const dialog = document.querySelector('#diary-recent-dialog');
      dialog.hidden = false;
      const recentEditor = document.querySelector('#diary-recent-dialog-editor');
      results['modal-bold'] = check(recentEditor, document.querySelector('.diary-recent-toolbar [data-recent-command="bold"]'));
      return JSON.stringify(results);
    } catch (error) { return String(error.stack || error); } })()"""
    page.runJavaScript(script, checked)


def checked(result):
    if result == "wait":
        QTimer.singleShot(100, evaluate)
    elif not isinstance(result, str) or not result.startswith("{"):
        finish(f"Unexpected result: {result!r}")
    else:
        states = json.loads(result)
        if any(state["first"] != "true" or state["second"] != "false" for state in states.values()):
            finish(states)
        elif any(
            tag in states[key]["html"].lower()
            for key in ("main-bold", "main-selected-bold", "modal-bold")
            for tag in ("<b>", "<strong>")
        ) or any(
            tag in states[key]["html"].lower()
            for key, tag in (("main-italic", "<i>"), ("main-underline", "<u>"),
                             ("main-bullet", "<ul>"), ("main-number", "<ol>"))
        ):
            finish(states)
        else:
            finish()


page.loadFinished.connect(lambda ok: QTimer.singleShot(350, evaluate) if ok else finish("HTML load failed"))
view.show()
view.setHtml(html, QUrl.fromLocalFile(str(web) + "/"))
QTimer.singleShot(15000, lambda: finish("Timed out"))
sys.exit(app.exec())
