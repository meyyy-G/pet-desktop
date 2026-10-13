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
      if (STAGE !== 4) document.querySelector('.nav-item[data-page="diary"]').click();
      if (STAGE === 0) {
        editor.textContent = '';
        editor.dispatchEvent(new Event('input', {bubbles: true}));
        if (!editor.classList.contains('is-empty') || getComputedStyle(editor, '::before').content === 'none') return 'empty placeholder missing';
        editor.focus();
        if (getComputedStyle(editor, '::before').content !== 'none') return 'placeholder overlaps focused caret';
        editor.textContent = ' ';
        editor.dispatchEvent(new Event('input', {bubbles: true}));
        if (editor.classList.contains('is-empty')) return 'whitespace incorrectly treated as empty';
        editor.textContent = '';
        editor.dispatchEvent(new Event('input', {bubbles: true}));
        if (!editor.classList.contains('is-empty') || getComputedStyle(editor, '::before').content !== 'none') return 'placeholder returned while focused';
        editor.blur();
        if (getComputedStyle(editor, '::before').content === 'none') return 'placeholder did not return on blur';
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
        if (document.querySelector('#save-status').textContent !== 'Saving...') return 'color did not mark dirty';
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
        const target = new Date('OLD_DATE' + 'T00:00:00');
        const month = target.toLocaleDateString('en-US', {month: 'long', year: 'numeric'});
        for (let attempts = 0; document.querySelector('#calendar-title').textContent !== month && attempts < 3; attempts++) {
          document.querySelector('#prev-month-button').click();
        }
        if (document.querySelector('#calendar-title').textContent !== month) return 'calendar did not reach old entry month';
        const findDay = () => [...document.querySelectorAll('#calendar-grid button.calendar-day')]
          .find(button => Number(button.textContent) === target.getDate());
        let dayButton = findDay();
        if (!dayButton) {
          document.querySelector('#next-month-button').click();
          dayButton = findDay();
        }
        if (!dayButton) return 'old entry date not visible in calendar';
        dayButton.click();
        return 'reloaded';
      }
      if (STAGE === 4) {
        const modal = document.querySelector('#diary-recent-dialog');
        const oldEditor = document.querySelector('#diary-recent-dialog-editor');
        if (modal.hidden || document.querySelector('.app-shell').dataset.activePage !== 'calendar') return 'history did not stay on calendar: ' + JSON.stringify({hidden: modal.hidden, page: document.querySelector('.app-shell').dataset.activePage, title: document.querySelector('#diary-recent-dialog-title').textContent});
        if (!oldEditor.innerText.includes('Old diary') || !oldEditor.innerText.includes('Second line')) return 'old entry missing: ' + oldEditor.innerText;
        if (oldEditor.innerHTML.includes('&lt;')) return 'old entry escaped incorrectly';
        if (editor.innerText !== 'Alpha beta gammaZ') return 'today editor changed to history';
        const range = document.createRange();
        range.setStart(oldEditor.firstChild, 0); range.setEnd(oldEditor.firstChild, 3);
        const selection = window.getSelection();
        selection.removeAllRanges(); selection.addRange(range);
        document.querySelector('[data-recent-command="bold"]').click();
        if (!oldEditor.querySelector('b, strong')) return 'bold command failed';
        document.execCommand('undo');
        if (oldEditor.querySelector('b, strong')) return 'undo command failed';
        document.execCommand('redo');
        if (!oldEditor.querySelector('b, strong')) return 'redo command failed';
        document.querySelector('#diary-recent-expand').click();
        if (!modal.classList.contains('is-expanded')) return 'expand failed';
        return 'old';
      }
      return 'wait';
    })()""".replace("STAGE", str(stage)).replace("OLD_DATE", old_date)
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
