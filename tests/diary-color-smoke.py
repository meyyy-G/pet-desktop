"""Exercise Diary color editing through the real Qt WebChannel and local JSON store."""
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
old_date = (date.today() - timedelta(days=1)).isoformat()
bridge.store.save_entry(old_date, "Old diary\nSecond line")
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
    script = r"""(() => {
      const editor = document.querySelector('#diary-editor');
      const popover = document.querySelector('#diary-color-popover');
      const picker = document.querySelector('.diary-color-button');
      if (!editor || !window.qt || !document.querySelector('.nav-item[data-page="diary"]')) return 'wait';
      document.querySelector('.nav-item[data-page="diary"]').click();
      if (STAGE === 0) {
        editor.textContent = 'Alpha beta gamma';
        editor.dispatchEvent(new Event('input', {bubbles: true}));
        const range = document.createRange();
        range.setStart(editor.firstChild, 6); range.setEnd(editor.firstChild, 10);
        const selection = window.getSelection();
        selection.removeAllRanges(); selection.addRange(range);
        picker.click();
        if (popover.hidden || picker.getAttribute('aria-expanded') !== 'true') return 'popover did not open';
        const swatches = [...popover.querySelectorAll('[data-diary-color]')];
        if (swatches.length !== 8 || swatches.some(button => {
          const rect = button.getBoundingClientRect();
          return rect.width !== 24 || rect.height !== 24 || getComputedStyle(button).backgroundColor === 'rgba(0, 0, 0, 0)';
        })) return 'swatches are missing color or 24px size';
        popover.querySelector('[data-diary-color="#e45a59"]').click();
        if (!popover.hidden || (!editor.innerHTML.includes('e45a59') && !editor.innerHTML.includes('228, 90, 89'))) return 'selected text not red: ' + editor.innerHTML;
        if (!document.querySelector('#save-status').textContent.includes('Not saved')) return 'color did not mark dirty';
        if (!document.querySelector('#diary-word-count').textContent.includes('3 words')) return 'word count changed';
        return 'selected';
      }
      if (STAGE === 1) {
        const range = document.createRange();
        range.selectNodeContents(editor); range.collapse(false);
        const selection = window.getSelection();
        selection.removeAllRanges(); selection.addRange(range);
        picker.click();
        popover.querySelector('[data-diary-color="#4c86d8"]').click();
        document.execCommand('insertText', false, 'Z');
        if (!editor.innerHTML.includes('4c86d8') && !editor.innerHTML.includes('76, 134, 216')) return 'caret typing not blue: ' + editor.innerHTML;
        picker.click();
        document.querySelector('.diary-header').dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));
        if (!popover.hidden) return 'outside click failed';
        picker.click();
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
        if (!popover.hidden) return 'Escape failed';
        document.querySelector('#save-button').click();
        return 'typed';
      }
      if (STAGE === 3) {
        if (!editor.innerHTML.includes('228, 90, 89') || !editor.innerHTML.includes('76, 134, 216')) return 'colors missing after reload: ' + editor.innerHTML;
        document.querySelector('#previous-entry-button').click();
        return 'reloaded';
      }
      if (STAGE === 4) {
        if (!editor.innerText.includes('Old diary') || !editor.innerText.includes('Second line')) return 'old entry missing: ' + editor.innerText;
        if (editor.innerHTML.includes('&lt;')) return 'old entry escaped incorrectly';
        const range = document.createRange();
        range.setStart(editor.firstChild, 0); range.setEnd(editor.firstChild, 3);
        const selection = window.getSelection();
        selection.removeAllRanges(); selection.addRange(range);
        document.querySelector('[data-editor-command="bold"]').click();
        if (!editor.querySelector('b, strong')) return 'bold command failed';
        document.execCommand('undo');
        if (editor.querySelector('b, strong')) return 'undo command failed';
        document.execCommand('redo');
        if (!editor.querySelector('b, strong')) return 'redo command failed';
        document.querySelector('.diary-expand-button').click();
        if (!document.querySelector('.app-shell').classList.contains('diary-editor-expanded')) return 'expand failed';
        return 'old';
      }
      return 'wait';
    })()""".replace("STAGE", str(stage))
    view.page().runJavaScript(script, checked)


def checked(result):
    global stage
    if result == "wait":
        QTimer.singleShot(100, evaluate)
    elif result == "selected":
        stage = 1
        QTimer.singleShot(100, evaluate)
    elif result == "typed":
        stage = 2
        QTimer.singleShot(400, check_saved)
    elif result == "reloaded":
        stage = 4
        QTimer.singleShot(250, evaluate)
    elif result == "old":
        finish()
    else:
        finish(result or "Page script unavailable")


def check_saved():
    global stage
    entry = bridge.store.load_entry(date.today().isoformat())
    if not all(color in entry.html for color in ("228, 90, 89", "76, 134, 216")):
        return finish("Colors missing from stored JSON: " + repr(entry.html) + " text=" + repr(entry.text))
    if entry.text != "Alpha beta gammaZ":
        return finish("Plain text changed: " + repr(entry.text))
    stage = 3
    view.setHtml(html, QUrl.fromLocalFile(str(web) + "/"))


page.loadFinished.connect(lambda ok: QTimer.singleShot(350, evaluate) if ok else finish("HTML load failed"))
view.show()
view.setHtml(html, QUrl.fromLocalFile(str(web) + "/"))
QTimer.singleShot(20000, lambda: finish("Timed out"))
sys.exit(app.exec())
