"""Exercise Task grouping, completion, duration, and persistence through Qt."""
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
view.show()
bridge = DiaryBridge()
today = date.today().isoformat()
tomorrow = (date.today() + timedelta(days=1)).isoformat()
day_task = bridge.addTask({"title": "Day work", "date": today, "period": "day", "category": "work"})
night_task = bridge.addTask({"title": "Night learning", "date": today, "period": "night", "category": "learning"})
bridge.addTask({"title": "No date", "date": "", "period": "day", "category": None})
bridge.addTask({"title": "Future", "date": tomorrow, "period": "night", "category": "personal"})
channel = QWebChannel(page)
channel.registerObject("diaryBridge", bridge)
page.setWebChannel(channel)
web = root / "src/desktop_pet/web"
assets = QUrl.fromLocalFile(str(root / "assets/web") + "/").toString()
html = (web / "index.html").read_text(encoding="utf-8")
html = html.replace("../../../assets/web/font/fonts.css", assets + "font/fonts.css")
html = html.replace("./assets/Head.png", assets + "Head.png").replace("./assets/", assets + "svg/")


def finish(error=None):
    print(json.dumps({"ok": error is None, "error": error}, ensure_ascii=False))
    app.exit(1 if error else 0)


def check_initial(result):
    if result != "ok":
        finish(result)
        return
    page.runJavaScript(r"""(() => {
      const day = document.querySelector('.tp-period-group[data-period="day"]');
      const night = document.querySelector('.tp-period-group[data-period="night"]');
      if (!day || !night || day.querySelectorAll('.tp-row').length !== 1 || night.querySelectorAll('.tp-row').length !== 1) return 'period grouping';
      if (day.querySelector('.tp-duration-button').textContent !== '45m' || night.querySelector('.tp-duration-button').textContent !== '30m') return 'duration defaults';
      if (document.querySelector('[data-task-view="today"] span').textContent !== '2') return 'Today count';
      document.querySelector('[data-task-view="upcoming"]').click();
      if (document.querySelectorAll('#task-page-list .tp-row').length !== 1) return 'Upcoming filtering';
      document.querySelector('[data-task-view="all"]').click();
      if (document.querySelectorAll('#task-page-list .tp-row').length !== 4) return 'All filtering';
      document.querySelector('[data-task-view="today"]').click();
      const button = document.querySelector('.tp-period-group[data-period="day"] .tp-duration-button');
      button.click();
      const option = [...document.querySelectorAll('.tp-duration-menu button')].find(item => item.textContent.includes('2h'));
      if (!option) return 'duration menu';
      option.click();
      return 'ok';
    })()""", after_duration_click)


def after_duration_click(result):
    if result != "ok":
        finish(result)
        return
    QTimer.singleShot(250, check_duration)


def check_duration():
    if bridge.task_store.list_tasks()[0]["duration_minutes"] != 120:
        finish("duration not persisted")
        return
    page.runJavaScript(r"""(() => {
      const day = document.querySelector('.tp-period-group[data-period="day"]');
      if (day.querySelector('.tp-duration-button').textContent !== '2h') return 'duration row did not update';
      day.querySelector('.tp-checkbox').click();
      return 'ok';
    })()""", after_completion_click)


def after_completion_click(result):
    if result != "ok":
        finish(result)
        return
    QTimer.singleShot(300, check_completion)


def check_completion():
    page.runJavaScript(r"""(() => {
      const day = document.querySelector('.tp-period-group[data-period="day"]');
      if (day.querySelectorAll('.tp-row').length !== 1 || !day.querySelector('.tp-row').classList.contains('is-completed')) return 'completed row disappeared';
      if (day.querySelector('.tp-period-count').textContent !== '1/1') return 'period progress count';
      if (day.querySelector('.tp-period-fill').style.width !== '100%') return 'period progress width';
      document.querySelector('[data-task-view="completed"]').click();
      if (document.querySelectorAll('#task-page-list .tp-row').length !== 1) return 'Completed filtering';
      document.querySelector('[data-task-view="today"]').click();
      document.querySelector('.tp-period-group[data-period="night"] .tp-period-more').click();
      const markAll = [...document.querySelectorAll('.tp-floating-menu button')].find(button => button.textContent === 'Mark all completed');
      if (!markAll) return 'group menu';
      markAll.click();
      return 'ok';
    })()""", after_mark_all)


def after_mark_all(result):
    if result != "ok":
        finish(result)
    else:
        QTimer.singleShot(300, check_mark_all)


def check_mark_all():
    if not all(task["completed"] for task in bridge.task_store.list_tasks()[:2]):
        finish("completion not persisted")
    else:
        page.runJavaScript(r"""(() => {
          const night = document.querySelector('.tp-period-group[data-period="night"]');
          if (night.querySelectorAll('.tp-row').length !== 1 || night.querySelector('.tp-period-count').textContent !== '1/1') return 'mark all changed group';
          document.querySelector('.tp-period-group[data-period="day"] .tp-period-more').click();
          const options = [...document.querySelectorAll('.tp-floating-menu button')];
          if (options.map(button => button.textContent).join('|') !== 'Mark all completed|Delete all') return 'group menu options';
          options[1].click();
          return 'ok';
        })()""", after_delete_all)


def after_delete_all(result):
    if result != "ok":
        finish(result)
    else:
        QTimer.singleShot(300, check_delete_all)


def check_delete_all():
    tasks = bridge.task_store.list_tasks()
    ids = {task["id"] for task in tasks}
    if len(tasks) != 3 or day_task["id"] in ids or night_task["id"] not in ids:
        finish("Delete all removed wrong tasks")
        return
    page.runJavaScript(r"""(() => {
      const day = document.querySelector('.tp-period-group[data-period="day"]');
      const night = document.querySelector('.tp-period-group[data-period="night"]');
      if (day.querySelector('.tp-row') || night.querySelectorAll('.tp-row').length !== 1) return 'Delete all view';
      night.querySelector('.tp-period-more').click();
      const deleteAll = [...document.querySelectorAll('.tp-floating-menu button')].find(button => button.textContent === 'Delete all');
      if (!deleteAll) return 'Delete all option missing';
      deleteAll.click();
      return 'ok';
    })()""", after_delete_last_today_task)


def after_delete_last_today_task(result):
    if result != "ok":
        finish(result)
    else:
        QTimer.singleShot(300, check_empty_today)


def check_empty_today():
    page.runJavaScript(r"""(() => {
      const section = document.querySelector('#task-page-list').closest('.tp-section');
      if (!section.classList.contains('is-empty-today')) return 'empty Today state missing';
      if (section.querySelectorAll('.tp-period-group').length) return 'empty period groups still visible';
      if (section.querySelectorAll('.tp-empty-state').length !== 1) return 'empty state count';
      return 'ok';
    })()""", lambda result: finish(None if result == "ok" else result))


def wait_ready():
    page.runJavaScript("Boolean(window.diaryApp && document.querySelector('.tp-period-group[data-period=day] .tp-row'))", lambda ready: page.runJavaScript("document.querySelector('.nav-item[data-page=task]').click(); 'ok'", check_initial) if ready else QTimer.singleShot(100, wait_ready))


page.loadFinished.connect(lambda ok: wait_ready() if ok else finish("HTML load failed"))
view.setHtml(html, QUrl.fromLocalFile(str(web) + "/"))
QTimer.singleShot(15000, lambda: finish("timeout"))
sys.exit(app.exec())
