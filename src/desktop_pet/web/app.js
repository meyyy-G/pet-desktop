// Web 端总入口：这个文件不实现具体业务，只组装各个模块。
// 使用时需要通过 <script type="module" src=".../web/app.js"></script> 加载。

import { state } from "./state.js";
import { connectDiaryBridge } from "./qt-bridge.js";
import { bindNavigationEvents } from "./navigation.js";
import { updateCurrentTime, updateHomeHeader } from "./home.js";
import { bindCalendarEvents, renderCalendar } from "./calendar.js";
import {
  bindDiaryEvents,
  discardCurrentEntry,
  loadRecordedDates,
  loadTodayEntry,
  requestOpenDate,
  saveCurrentEntry,
} from "./diary.js";
import {
  bindMoodEvents,
  loadRecordedMoods,
  renderMiniCalendar,
} from "./mood.js";

// 先注册所有页面事件。日历通过回调通知日记模块，避免两个模块互相导入。
bindNavigationEvents();
bindCalendarEvents(requestOpenDate);
bindDiaryEvents();
bindMoodEvents();

// 把 Web 内部页面切换转发给 Python，让桌宠动画跟随当前页面。
window.addEventListener("diary:page-changed", (event) => {
  if (!state.diaryBridge) return;
  state.diaryBridge.notifyPageChanged(event.detail.pageName);
});

// 保留旧 app.js 暴露给 Python 的网页 API，防止未来 Python 调用方式变化。
window.diaryApp = {
  hasUnsavedChanges() {
    return state.hasUnsavedChanges;
  },
  saveCurrentEntry() {
    saveCurrentEntry();
    return true;
  },
  discardCurrentEntry() {
    discardCurrentEntry();
    return true;
  },
};

// Qt WebChannel 连接成功后，按照原 app.js 的顺序初始化数据和界面。
connectDiaryBridge((bridge) => {
  state.diaryBridge = bridge;

  // WebChannel 连接前可能还没有发生页面点击，主动报告当前活动页面。
  const activePage = document.querySelector(".page.active");
  state.diaryBridge.notifyPageChanged(activePage?.id || "home");

  updateCurrentTime();
  updateHomeHeader();
  renderMiniCalendar();
  loadRecordedMoods();
  loadTodayEntry();
  loadRecordedDates();
  renderCalendar();
});
