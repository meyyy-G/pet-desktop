import { dom } from "./dom.js";
import { state } from "./state.js";
import { isFutureDate, toDateText } from "./date-utils.js";

// 心情模块：负责心情按钮、提示文字和首页迷你日历。
const moodColors = {
  Stress: "#b54ad8",
  Low: "#7f7a7a",
  Anxious: "#d17b42",
  Steady: "#5f9569",
  Light: "#d39b9a",
  Inspired: "#4f7fc6",
  Grateful: "#b58a2c",
};
const monthNames = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

function showMoodTooltip(button) {
  if (!dom.moodTooltip || !button.dataset.tooltip) return;

  dom.moodTooltip.textContent = button.dataset.tooltip;
  dom.moodTooltip.classList.add("visible");
  const buttonRect = button.getBoundingClientRect();
  const tooltipRect = dom.moodTooltip.getBoundingClientRect();
  const pagePadding = 12;
  let left = buttonRect.left + buttonRect.width / 2 - tooltipRect.width / 2;
  let top = buttonRect.top - tooltipRect.height - 12;

  if (left < pagePadding) left = pagePadding;
  if (left + tooltipRect.width > window.innerWidth - pagePadding) {
    left = window.innerWidth - tooltipRect.width - pagePadding;
  }
  if (top < pagePadding) top = buttonRect.bottom + 12;

  dom.moodTooltip.style.left = `${left}px`;
  dom.moodTooltip.style.top = `${top}px`;
}

function hideMoodTooltip() {
  if (dom.moodTooltip) dom.moodTooltip.classList.remove("visible");
}

function updateMoodButtonState() {
  const selectedMood = state.recordedMoods[state.selectedMiniDate];
  dom.moodButtons.forEach((button) => {
    button.classList.toggle("selected", button.dataset.mood === selectedMood);
  });
}

export function renderMiniCalendar() {
  if (!dom.miniCalendarTitle || !dom.miniCalendarGrid) return;

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const todayText = toDateText(today);
  if (state.selectedMiniDate && isFutureDate(state.selectedMiniDate)) {
    state.selectedMiniDate = todayText;
  }

  dom.miniCalendarTitle.textContent = `${monthNames[month]} ${year}`;
  dom.miniCalendarGrid.innerHTML = "";
  const startOffset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let index = 0; index < startOffset; index += 1) {
    const emptyCell = document.createElement("span");
    emptyCell.className = "mini-empty";
    dom.miniCalendarGrid.appendChild(emptyCell);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dateText = toDateText(new Date(year, month, day));
    const dayCell = document.createElement("button");
    dayCell.textContent = String(day);

    if (isFutureDate(dateText)) {
      dayCell.classList.add("mini-future");
      dom.miniCalendarGrid.appendChild(dayCell);
      continue;
    }

    dayCell.addEventListener("click", () => {
      state.selectedMiniDate = dateText;
      renderMiniCalendar();
    });

    const mood = state.recordedMoods[dateText];
    if (dateText === state.selectedMiniDate) {
      dayCell.classList.add("mini-selected");
    } else if (mood && moodColors[mood]) {
      dayCell.style.setProperty("--mood-color", moodColors[mood]);
      dayCell.classList.add(dateText === todayText ? "mood-today" : "mood-history");
    } else if (dateText === todayText) {
      dayCell.classList.add("today");
    }
    dom.miniCalendarGrid.appendChild(dayCell);
  }

  updateMoodButtonState();
}

export function loadRecordedMoods() {
  if (!state.diaryBridge) return;
  state.diaryBridge.getRecordedMoods((moods) => {
    state.recordedMoods = moods || {};
    renderMiniCalendar();
  });
}

/** 注册心情按钮的提示和保存事件。 */
export function bindMoodEvents() {
  dom.moodButtons.forEach((button) => {
    button.addEventListener("mouseenter", () => showMoodTooltip(button));
    button.addEventListener("mouseleave", hideMoodTooltip);
    button.addEventListener("focus", () => showMoodTooltip(button));
    button.addEventListener("blur", hideMoodTooltip);
    button.addEventListener("click", () => {
      const mood = button.dataset.mood;
      const targetDateText = state.selectedMiniDate || toDateText(new Date());
      if (!mood || !state.diaryBridge) return;

      state.diaryBridge.saveMoodByDate(targetDateText, mood, () => {
        state.recordedMoods[targetDateText] = mood;
        renderMiniCalendar();
      });
    });
  });
}
