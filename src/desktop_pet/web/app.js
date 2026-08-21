// Web 总入口：只负责组装模块，不实现具体业务。
import { state } from "./state.js";
import { connectDiaryBridge } from "./qt-bridge.js";
import { bindNavigationEvents } from "./navigation.js";
import { updateCurrentTime, updateHomeHeader, updateWeekStrip } from "./home.js";
import { bindCalendarEvents, renderCalendar } from "./calendar.js";
import { bindTaskEvents } from "./task.js";
import { bindChatEvents } from "./chat.js";
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

bindNavigationEvents();
bindCalendarEvents(requestOpenDate);
bindDiaryEvents();
bindMoodEvents();
bindTaskEvents();
bindChatEvents();

// 将 Web 内部页面切换通知给 Python，让桌宠动画同步当前页面。
window.addEventListener("diary:page-changed", (event) => {
  if (!state.diaryBridge) return;
  state.diaryBridge.notifyPageChanged(event.detail.pageName);
});

// 保留供 Python 调用的页面 API。
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

connectDiaryBridge((bridge) => {
  state.diaryBridge = bridge;

  const activePage = document.querySelector(".page.active");
  state.diaryBridge.notifyPageChanged(activePage?.id || "home");

  updateCurrentTime();
  updateWeekStrip();
  updateHomeHeader();
  renderMiniCalendar();
  loadRecordedMoods();
  loadTodayEntry();
  loadRecordedDates();
  renderCalendar();
});
