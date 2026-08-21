import { dom } from "./dom.js";
import { state } from "./state.js";
import { isFutureDate, toDateText } from "./date-utils.js";
import { moodColors } from "./mood-colors.js";

// Calendar 页面日期点击后的统一回调，由 diary 模块提供。
let onDateRequested = null;

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

    const mood = state.recordedMoods[dateText];
    if (mood && moodColors[mood]) {
      button.style.setProperty("--mood-color", moodColors[mood]);
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

  const renderedCellCount = startOffset + daysInMonth;
  for (let index = renderedCellCount; index < 42; index += 1) {
    const emptyCell = document.createElement("div");
    emptyCell.className = "calendar-day empty";
    dom.calendarGrid.appendChild(emptyCell);
  }
}

// 注册月份切换按钮和日期点击回调。
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

  dom.todayCalendarButton?.addEventListener("click", () => {
    const today = new Date();
    state.visibleMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    renderCalendar();
  });
}
