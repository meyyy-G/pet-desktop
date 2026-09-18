import { dom } from "../dom.js";
import { calendarMoodColors, isFutureDate, state, toDateText } from "../state.js";

// Calendar 页面日期点击后的统一回调，由 diary 模块提供。
let onDateRequested = null;
const cellsPerPage = 35;

function pageCount(date) {
  return Math.ceil((new Date(date.getFullYear(), date.getMonth(), 1).getDay()
    + new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()) / cellsPerPage);
}

export function renderCalendar() {
  if (!dom.calendarGrid || !dom.calendarTitle) return;

  dom.calendarGrid.innerHTML = "";
  const year = state.visibleMonth.getFullYear();
  const month = state.visibleMonth.getMonth();
  dom.calendarTitle.textContent = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month, 1));

  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay.getDay();
  state.calendarPage = Math.max(0, Math.min(state.calendarPage || 0, pageCount(firstDay) - 1));
  const pageStart = state.calendarPage * cellsPerPage;
  dom.calendarGrid.setAttribute("aria-label", `${dom.calendarTitle.textContent}, page ${state.calendarPage + 1} of ${pageCount(firstDay)}`);

  for (let index = pageStart; index < pageStart + cellsPerPage; index += 1) {
    const day = index - startOffset + 1;
    if (day < 1 || day > daysInMonth) {
      const outsideCell = document.createElement("div");
      outsideCell.className = "calendar-day outside";
      outsideCell.textContent = String(new Date(year, month, day).getDate());
      dom.calendarGrid.appendChild(outsideCell);
      continue;
    }
    const dateText = toDateText(new Date(year, month, day));
    const button = document.createElement("button");
    button.className = "calendar-day";
    button.textContent = String(day);

    const mood = state.recordedMoods[dateText];
    if (mood && calendarMoodColors[mood]) {
      button.style.setProperty("--mood-color", calendarMoodColors[mood]);
      button.classList.add("mood-recorded");
    }

    if (dateText === toDateText(state.currentDate)) button.classList.add("selected");
    if (state.recordedDates.has(dateText)) button.classList.add("recorded");

    if (isFutureDate(dateText)) {
      button.classList.add("future");
      button.disabled = true;
    } else {
      button.addEventListener("click", () => {
        if (onDateRequested) onDateRequested(dateText);
      });
    }

    dom.calendarGrid.appendChild(button);
  }

}

// 注册月份切换按钮和日期点击回调。
export function bindCalendarEvents(dateRequestedHandler) {
  onDateRequested = dateRequestedHandler;

  dom.prevMonthButton?.addEventListener("click", () => {
    if (state.calendarPage > 0) {
      state.calendarPage -= 1;
    } else {
    state.visibleMonth = new Date(
      state.visibleMonth.getFullYear(),
      state.visibleMonth.getMonth() - 1,
      1,
    );
    state.calendarPage = pageCount(state.visibleMonth) - 1;
    }
    renderCalendar();
  });

  dom.nextMonthButton?.addEventListener("click", () => {
    if (state.calendarPage + 1 < pageCount(state.visibleMonth)) {
      state.calendarPage += 1;
    } else {
    state.visibleMonth = new Date(
      state.visibleMonth.getFullYear(),
      state.visibleMonth.getMonth() + 1,
      1,
    );
    state.calendarPage = 0;
    }
    renderCalendar();
  });

  dom.todayCalendarButton?.addEventListener("click", () => {
    const today = new Date();
    state.visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    state.calendarPage = Math.floor((state.visibleMonth.getDay() + today.getDate() - 1) / cellsPerPage);
    renderCalendar();
  });
}
