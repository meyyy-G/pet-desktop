// Web entry point: wires the migrated business modules to the new page.
import { state } from "./state.js";
import { connectDiaryBridge } from "./qt-bridge.js";
import { bindNavigationEvents } from "./navigation.js";
import {
  bindMoodEvents,
  loadRecordedMoods,
  renderMiniCalendar,
  updateCurrentTime,
  updateHomeHeader,
  updateWeekStrip,
} from "./pages/home.js";
import { bindCalendarEvents, renderCalendar } from "./pages/calendar.js";
import { bindTaskEvents } from "./pages/task.js";
import { bindChatEvents } from "./pages/chat.js";
import {
  bindDiaryEvents,
  discardCurrentEntry,
  loadRecordedDates,
  loadTodayEntry,
  requestOpenDate,
  saveCurrentEntry,
} from "./pages/diary.js";

bindNavigationEvents();
bindCalendarEvents(requestOpenDate);
bindDiaryEvents();
bindMoodEvents();
bindTaskEvents();
bindChatEvents();

// Render the shell immediately as well as after Qt connects. This keeps the
// Home page complete in a normal browser preview without changing WebChannel.
updateCurrentTime();
updateWeekStrip();
updateHomeHeader();
renderMiniCalendar();
renderCalendar();

window.addEventListener("diary:page-changed", (event) => {
  if (!state.diaryBridge) return;
  state.diaryBridge.notifyPageChanged(event.detail.pageName);
});

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
  if (document.querySelector("#diary-editor")) loadTodayEntry();
  loadRecordedDates();
  renderCalendar();
});
