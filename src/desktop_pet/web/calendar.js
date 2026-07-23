import { dom } from "./dom.js";
import { state } from "./state.js";
import { isFutureDate, toDateText } from "./date-utils.js";
import { showFutureDateMessage } from "./modals.js";

// 大日历模块：负责 Calendar 页面渲染和月份切换。
// 日期被点击后，通过回调交给 diary.js 决定是否打开。
let onDateRequested = null;

export function renderCalendar() {
  if (!dom.calendarGrid || !dom.calendarTitle) return;

  dom.calendarGrid.innerHTML = "";
  const year = state.visibleMonth.getFullYear();
  const month = state.visibleMonth.getMonth();
  dom.calendarTitle.textContent = `${year}-${String(month + 1).padStart(2, "0")}`;

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  for (let index = 0; index < startOffset; index += 1) {
    const emptyCell = document.createElement("div");
    emptyCell.className = "calendar-day empty";
    dom.calendarGrid.appendChild(emptyCell);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateText = toDateText(new Date(year, month, day));
    const button = document.createElement("button");
    button.className = "calendar-day";
    button.textContent = String(day);

    if (dateText === toDateText(state.currentDate)) button.classList.add("selected");
    if (state.recordedDates.has(dateText)) button.classList.add("recorded");
    if (isFutureDate(dateText)) button.classList.add("future");

    button.addEventListener("click", () => {
      if (isFutureDate(dateText)) {
        showFutureDateMessage();
        return;
      }
      if (onDateRequested) onDateRequested(dateText);
    });

    dom.calendarGrid.appendChild(button);
  }
}

/** 注册月份按钮，并保存日期点击回调。 */
export function bindCalendarEvents(dateRequestedHandler) {
  onDateRequested = dateRequestedHandler;

  dom.prevMonthButton.addEventListener("click", () => {
    state.visibleMonth = new Date(
      state.visibleMonth.getFullYear(),
      state.visibleMonth.getMonth() - 1,
      1,
    );
    renderCalendar();
  });

  dom.nextMonthButton.addEventListener("click", () => {
    state.visibleMonth = new Date(
      state.visibleMonth.getFullYear(),
      state.visibleMonth.getMonth() + 1,
      1,
    );
    renderCalendar();
  });
}
