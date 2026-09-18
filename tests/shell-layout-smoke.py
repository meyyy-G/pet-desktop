"""Offscreen WebEngine layout checks. No Bridge or user data is used."""
import argparse
import json
import os
import sys
from pathlib import Path

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
os.environ.setdefault("QTWEBENGINE_CHROMIUM_FLAGS", "--disable-gpu")
os.environ.setdefault("QT_QUICK_BACKEND", "software")
os.environ.setdefault("QT_OPENGL", "software")

from PySide6.QtCore import QTimer, QUrl
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile, QWebEngineSettings
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QApplication

parser = argparse.ArgumentParser()
parser.add_argument("--pages", default="home,diary,chat,calendar,task")
parser.add_argument("--screenshots", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "src"))
from desktop_pet.diary.diary_window import DiaryWindow

web = root / "src/desktop_pet/web"
app = QApplication([sys.argv[0]])
view = QWebEngineView()
profile = QWebEngineProfile(view)  # An unnamed profile is off the record.
page = QWebEnginePage(profile, view)
page.loadingChanged.connect(lambda info: print(info.errorString()) if info.errorCode() else None)
view.setPage(page)
view.settings().setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)
view.resize(1280, 720)
view.show()
failures = []
completed = 0
sizes = [(1280, 720), (1920, 1080), (1440, 900), (1200, 720),
         (1199, 720), (1024, 768), (900, 600), (720, 480)]
cases = [(name, w, h, False) for name in args.pages.split(",") for w, h in sizes]
if "diary" in args.pages.split(","):
    cases += [("diary", 1280, 720, True), ("diary", 720, 480, True),
              ("diary", 1920, 1080, True), ("diary", 900, 600, False)]

CHECK = r"""(() => {
  const errors = [];
  const expect = (ok, message) => { if (!ok) errors.push(message); };
  const shell = document.querySelector('.app-shell');
  const active = document.querySelector('.page.active');
  const main = document.querySelector('.main-content');
  const rect = el => el.getBoundingClientRect();
  const near = (a, b) => Math.abs(a - b) <= 1;
  expect(near(rect(shell).width, innerWidth) && near(rect(shell).height, innerHeight), 'shell does not fill viewport');
  expect(near(rect(active).width, rect(main).width) && near(rect(active).height, rect(main).height), 'active page does not fill main area');
  expect(document.documentElement.scrollWidth <= innerWidth + 1, 'document overflows horizontally');
  expect(document.documentElement.scrollHeight <= innerHeight + 1, 'document scrolls instead of page');
  const sidebar = document.querySelector('.sidebar');
  const right = document.querySelector('.right-sidebar');
  const rightVisible = getComputedStyle(right).display !== 'none';
  expect(rightVisible === (innerWidth >= (['home', 'task'].includes(active.id) ? 1280 : 1200) && active.id !== 'diary'), 'wrong summary visibility');
  expect(near(rect(main).right, rightVisible ? rect(right).left : innerWidth), 'unfilled strip beside main area');
  expect(near(rect(sidebar).height, innerHeight), 'navigation does not fill height');
  if (innerWidth < 1000) expect(rect(sidebar).width <= 80, 'navigation did not compact');
  if (['home', 'chat', 'task'].includes(active.id)) {
    const diary = document.querySelector('.diary-page');
    const previousPage = shell.dataset.activePage;
    shell.dataset.activePage = 'diary';
    diary.classList.add('active');
    const diaryLeft = rect(document.querySelector('.diary-header')).left;
    diary.classList.remove('active');
    shell.dataset.activePage = previousPage;
    const header = document.querySelector(active.id === 'home' ? '.home-header' : active.id === 'task' ? '.tp-header' : '.chat-header');
    expect(near(rect(header).left, diaryLeft), 'content left edge differs from Diary: ' + rect(header).left + ' vs ' + diaryLeft);
  }

  const expanded = shell.classList.contains('diary-editor-expanded');
  const area = document.querySelector('.diary-writing-area');
  const scope = expanded ? area : active;
  for (const el of [scope, ...scope.querySelectorAll('*')]) {
    if (!el.getClientRects().length) continue;
    const r = rect(el);
    if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
    const label = el.id || el.className || el.tagName;
    expect(r.left >= rect(main).left - 1 && r.right <= rect(main).right + 1, 'horizontal overflow: ' + label);
    if (el.tagName === 'TEXTAREA') continue;
    if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2) {
      const overflow = getComputedStyle(el).overflowX;
      expect(['auto', 'scroll'].includes(overflow), 'clipped horizontal content: ' + label);
    }
  }
  const scrollable = el => ['auto', 'scroll'].includes(getComputedStyle(el).overflowY);
  if (active.id === 'home') {
    expect(innerWidth >= 1050 && innerHeight >= 720, 'Home minimum window size was not enforced');
    const dimensions = ['.mood-card', '.mood-button', '.mood-button .mood-icon', '.task-card', '.task-row', '.mini-calendar-card', '#mini-calendar-grid > button', '.home-header h1'].map(selector => {
      const el = document.querySelector(selector);
      return [Math.round(rect(el).width), Math.round(rect(el).height), getComputedStyle(el).fontSize];
    });
    if (!window.homeComponentDimensions) window.homeComponentDimensions = dimensions;
    expect(JSON.stringify(dimensions) === JSON.stringify(window.homeComponentDimensions), 'Home components resized with the window');
    expect(active.scrollHeight <= active.clientHeight + 1, 'Home must fit on one screen');
    const tasks = document.querySelector('.task-card');
    const calendar = document.querySelector('.mini-calendar-card');
    expect(near(rect(tasks).top, rect(calendar).top) && near(rect(tasks).bottom, rect(calendar).bottom), 'Home cards must remain side by side and aligned');
    expect(rect(calendar).bottom <= innerHeight, 'Home calendar extends past viewport');
    const dates = [...document.querySelectorAll('#mini-calendar-grid > *')].filter(el => el.getClientRects().length);
    expect(dates.length === 28, 'Home calendar must show 28 cells');
    expect(new Set(dates.map(el => Math.round(rect(el).top))).size === 4, 'Home calendar must show exactly four rows');
    const miniGrid = document.querySelector('#mini-calendar-grid');
    const miniPrev = document.querySelector('#mini-prev-month-button');
    const miniNext = document.querySelector('#mini-next-month-button');
    const fullCalendarBefore = document.querySelector('#calendar-grid').innerHTML;
    const monthStart = new Date();
    monthStart.setDate(1);
    const month = monthStart.getMonth();
    const year = monthStart.getFullYear();
    const monthDays = new Date(year, month + 1, 0).getDate();
    const pageCount = Math.ceil((monthStart.getDay() + monthDays) / 28);
    const originalPage = Number((miniGrid.getAttribute('aria-label') || '').match(/page (\d+)/)?.[1] || 1) - 1;
    const verifyMiniPage = pageNumber => {
      const cells = [...miniGrid.children];
      expect(cells.length === 28, 'Mini Calendar did not render 28 cells');
      expect(miniPrev.disabled === (pageNumber === 0) && miniNext.disabled === (pageNumber === pageCount - 1), 'Mini Calendar arrows have wrong disabled state');
      cells.forEach((cell, index) => {
        const date = new Date(year, month, pageNumber * 28 + index - monthStart.getDay() + 1);
        const inMonth = date.getMonth() === month;
        expect(cell.textContent === String(date.getDate()), 'Mini Calendar date mismatch at cell ' + index);
        expect(inMonth ? cell.tagName === 'BUTTON' : cell.classList.contains('mini-outside'), 'Mini Calendar outside style mismatch at cell ' + index);
        if (!inMonth) expect(getComputedStyle(cell).borderTopWidth === '0px', 'Mini Calendar outside date has a circle at cell ' + index);
        if (inMonth && date.getDate() === new Date().getDate()) expect(cell.classList.contains('today'), 'Today marker missing');
      });
    };
    while (!miniPrev.disabled) miniPrev.click();
    verifyMiniPage(0);
    for (let pageNumber = 1; pageNumber < pageCount; pageNumber += 1) {
      miniNext.click();
      verifyMiniPage(pageNumber);
    }
    while (!miniPrev.disabled) miniPrev.click();
    for (let pageNumber = 0; pageNumber < originalPage; pageNumber += 1) miniNext.click();
    const originalSelectedCell = miniGrid.querySelector('button.mini-selected');
    const selectablePastDate = [...miniGrid.querySelectorAll('button:not(:disabled)')].find(cell => !cell.classList.contains('today'));
    if (selectablePastDate) {
      selectablePastDate.click();
      expect([...miniGrid.querySelectorAll('button.mini-selected')].some(cell => cell.textContent === selectablePastDate.textContent), 'Mini Calendar date selection stopped working');
      expect(selectablePastDate.style.backgroundColor === 'var(--text-primary)' && selectablePastDate.style.color === 'rgb(255, 255, 255)', 'selected date did not become black');
      expect(originalSelectedCell?.isConnected && originalSelectedCell.style.backgroundColor === '', 'previous date did not restore its original color');
      expect(getComputedStyle(selectablePastDate).transitionDuration.includes('0.3s'), 'date selection animation missing');
      expect(document.querySelector('#mood-title').textContent.includes('Mood:'), 'Mood Main did not show selected date');
      miniGrid.querySelector('button.today')?.click();
    }
    expect(document.querySelector('#calendar-grid').innerHTML === fullCalendarBefore, 'Mini Calendar paging changed Full Calendar');
    const upcoming = document.querySelector('.upcoming');
    expect(rect(upcoming).bottom <= rect(calendar).bottom - 8, 'Upcoming section clipped');
    const list = document.querySelector('#task-items');
    expect(rect(list).bottom <= rect(tasks).bottom, 'Home task list extends past its card');
  }
  if (active.id === 'task') {
    expect(innerWidth >= 1050 && innerHeight >= 720, 'Task minimum window size was not enforced');
    expect(active.scrollHeight <= active.clientHeight + 1, 'Task page scrolls');
    const lists = [...active.querySelectorAll('.tp-list')];
    expect(lists.length === 2 && lists.every(scrollable), 'Task lists cannot scroll');
    expect(lists.length === 2 && lists[0].scrollHeight > lists[0].clientHeight && lists[1].scrollHeight > lists[1].clientHeight, 'Task lists do not contain all rows');
    const dimensions = ['.tp-header h1', '.tp-tabs', '.tp-quick-add', '.tp-list-frame', '.tp-tomorrow', '.tp-row'].map(selector => {
      const el = active.querySelector(selector);
      return [Math.round(rect(el).width), Math.round(rect(el).height), getComputedStyle(el).fontSize];
    });
    if (!window.taskComponentDimensions) window.taskComponentDimensions = dimensions;
    expect(JSON.stringify(dimensions) === JSON.stringify(window.taskComponentDimensions), 'Task components resized with the window');
    expect(rect(active.querySelector('.tp-tomorrow')).bottom <= innerHeight + 1, 'Task content extends past viewport: ' + rect(active.querySelector('.tp-tomorrow')).bottom + ' vs ' + innerHeight);
  }
  if (active.scrollHeight > active.clientHeight + 1 && !expanded) {
    expect(scrollable(active), 'page content is clipped vertically');
    active.scrollTop = active.scrollHeight;
    expect(active.scrollTop > 0, 'page cannot scroll to its bottom');
    active.scrollTop = 0;
  }
  if (active.id === 'chat') {
    const input = document.querySelector('#chat-input');
    const send = document.querySelector('#chat-send-button');
    const list = document.querySelector('#chat-message-list');
    expect(rect(input).bottom <= innerHeight && rect(send).bottom <= innerHeight, 'chat composer outside viewport');
    expect(rect(list).height >= 80 && rect(list).bottom <= rect(input).top + 1, 'chat message area unusable');
    expect(scrollable(list), 'chat messages cannot scroll');
  }
  if (active.id === 'diary') {
    const editor = document.querySelector('#diary-editor');
    expect(rect(editor).height >= 60, 'diary editor too short');
    expect(scrollable(editor), 'diary text cannot scroll');
    if (expanded) {
      expect(near(rect(area).width, rect(main).width) && near(rect(area).height, innerHeight), 'expanded editor retained old dimensions');
      expect(near(rect(area).top, 0), 'expanded editor scrolled offscreen');
    }
  }
  if (active.id === 'calendar') {
    expect(document.querySelectorAll('#calendar-grid > *').length === 35, 'calendar module did not render dates');
    const last = document.querySelector('#calendar-grid > :last-child');
    expect(rect(last).bottom <= rect(document.querySelector('.calendar-panel')).bottom + 1, 'calendar last row clipped');
  }
  for (const img of scope.querySelectorAll('img')) {
    if (img.getClientRects().length) expect(img.complete && img.naturalWidth > 0, 'missing image: ' + img.getAttribute('src'));
  }
  return JSON.stringify({errors: [...new Set(errors)], page: active.id, size: [innerWidth, innerHeight], expanded});
})()"""


def finish():
    print(json.dumps({"checked": completed, "failures": failures}, ensure_ascii=True))
    app.exit(1 if failures else 0)


def checked(raw):
    global completed
    result = json.loads(raw) if raw else {"errors": ["No browser result"]}
    if result["errors"]:
        failures.append(result)
    completed += 1
    if args.screenshots and (result.get("size") in [[1280, 720], [1920, 1080], [720, 480]]):
        args.screenshots.mkdir(parents=True, exist_ok=True)
        name = f"{result['page']}-{result['size'][0]}x{result['size'][1]}{'-expanded' if result['expanded'] else ''}.png"
        view.grab().save(str(args.screenshots / name))
    run_next()


def run_next():
    if not cases:
        finish()
        return
    name, width, height, expanded = cases.pop(0)
    view.setMinimumSize(*DiaryWindow.minimum_size_for_page(name))
    view.resize(width, height)
    script = """(() => {
      document.querySelector('.nav-item[data-page=%s]').click();
      const button = document.querySelector('.diary-expand-button');
      if (document.querySelector('.app-shell').classList.contains('diary-editor-expanded') !== %s) button.click();
    })()""" % (json.dumps(name), str(expanded).lower())
    page.runJavaScript(script, lambda _: QTimer.singleShot(400, lambda: page.runJavaScript(CHECK, checked)))


def ready(value):
    if value:
        run_next()
    else:
        QTimer.singleShot(100, wait_ready)


def wait_ready():
    page.runJavaScript("Boolean(window.diaryApp && document.fonts.status === 'loaded' && document.querySelector('#calendar-grid').children.length)", ready)


html = (web / "index.html").read_text(encoding="utf-8")
assets = QUrl.fromLocalFile(str(root / "assets/web") + "/").toString()
html = html.replace("../../../assets/web/font/fonts.css", assets + "font/fonts.css")
html = html.replace("./assets/Head.png", assets + "Head.png")
html = html.replace("./assets/", assets + "svg/")
page.loadFinished.connect(lambda ok: wait_ready() if ok else QTimer.singleShot(500, lambda: (failures.append("HTML load failed: " + page.url().toString()), finish())))
view.setHtml(html, QUrl.fromLocalFile(str(web) + "/"))
QTimer.singleShot(60000, lambda: (failures.append("timeout"), finish()))
sys.exit(app.exec())
