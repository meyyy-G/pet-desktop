// Web entry point: wires the migrated business modules to the new page.
import { state } from "./state.js";
import { applyMoodPaletteToControls } from "./mood-palette.js";
import { connectDiaryBridge } from "./qt-bridge.js";
import { bindNavigationEvents } from "./navigation.js";
import { bindProfileEvents, loadProfileFromBridge } from "./pages/profile.js";
import {
  bindMoodEvents,
  bindHomeHeaderEvents,
  loadRecordedMoods,
  renderMiniCalendar,
  updateCurrentTime,
  updateHomeHeader,
  updateWeekStrip,
} from "./pages/home.js";
import { bindCalendarEvents, loadSavedChatDates, renderCalendar } from "./pages/calendar.js";
import { bindTaskEvents, loadTasks } from "./pages/task.js";
import { bindChatEvents, loadChat } from "./pages/chat.js";
import {
  bindDiaryEvents,
  discardCurrentEntry,
  loadRecordedDates,
  loadTodayEntry,
  requestOpenDate,
  saveCurrentEntry,
} from "./pages/diary.js";

applyMoodPaletteToControls();
bindNavigationEvents();
bindProfileEvents();
bindCalendarEvents(requestOpenDate);
bindDiaryEvents();
bindMoodEvents();
bindHomeHeaderEvents();
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
window.addEventListener("user:profile-changed", updateHomeHeader);

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
  loadProfileFromBridge(bridge);
  const activePage = document.querySelector(".page.active");
  state.diaryBridge.notifyPageChanged(activePage?.id || "home");
  updateCurrentTime();
  updateWeekStrip();
  updateHomeHeader();
  renderMiniCalendar();
  loadRecordedMoods();
  loadTasks();
  loadChat();
  loadSavedChatDates();
  if (document.querySelector("#diary-editor")) loadTodayEntry();
  loadRecordedDates();
  renderCalendar();
});
