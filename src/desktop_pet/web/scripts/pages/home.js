import { dom } from "../dom.js";
import { renderCalendar } from "./calendar.js";
import { calendarMoodColors, getDayPeriod, moodColors, state, toDateText } from "../state.js";

// 首页模块：只负责首页日期和问候语。
const shortWeekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const weekdays = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday",
];
const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** 更新左侧栏显示的当天日期。 */
export function updateCurrentTime() {
  const today = new Date();
  if (dom.todayNumber) dom.todayNumber.textContent = String(today.getDate());
  if (dom.todayLabel) dom.todayLabel.textContent = `${shortWeekdays[today.getDay()]}·${months[today.getMonth()]}`;
}

/** 根据当前星期更新侧栏底部一周的过去、今天和未来状态。 */
export function updateWeekStrip() {
  // JavaScript 的星期从 Sunday=0 开始，界面则从 Monday=0 开始。
  const todayIndex = (new Date().getDay() + 6) % 7;

  dom.weekDays.forEach((day, index) => {
    day.classList.remove("is-past", "is-today", "is-future");

    if (index < todayIndex) {
      day.classList.add("is-past");
    } else if (index === todayIndex) {
      day.classList.add("is-today");
      day.setAttribute("aria-current", "date");
    } else {
      day.classList.add("is-future");
    }

    if (index !== todayIndex) day.removeAttribute("aria-current");
  });
}

/** 更新首页顶部问候语。 */
export function updateHomeHeader() {
  const today = new Date();
  const period = getDayPeriod(today.getHours());

  if (dom.homeGreeting) dom.homeGreeting.textContent = `Good ${period}, Mey.`;
  if (dom.homeDateLine) dom.homeDateLine.textContent = `${weekdays[today.getDay()]}, ${months[today.getMonth()]} ${today.getDate()} · A good day to check in with yourself.`;
}

// 首页中的心情模块：负责心情按钮、提示文字和首页迷你日历。
const monthNames = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
];

const moodDetails = Object.freeze({
  Stress: "Tense & Under Pressure",
  Low: "Low Energy",
  Anxious: "Uneasy & Restless",
  Steady: "Grounded & Calm",
  Light: "Relaxed & At Ease",
  Inspired: "Ready to Create",
  Grateful: "Thankful & Appreciative",
});

const mainMoodDetails = Object.freeze({
  ...moodDetails,
  Low: "Drained & Low Energy",
  Inspired: "Energized & Creative",
});

const moodIconFiles = Object.freeze({
  Stress: "stress.svg",
  Low: "low.svg",
  Anxious: "anxious.svg",
  Steady: "steady.svg",
  Light: "light.svg",
  Inspired: "inspired.svg",
  Grateful: "greatfull.svg",
});

function applyMoodDisplay(element, mood) {
  if (!element) return;
  const color = moodColors[mood];
  element.classList.toggle("has-mood", Boolean(color));
  if (color) {
    element.style.setProperty("--display-mood-color", color);
  } else {
    element.style.removeProperty("--display-mood-color");
  }
}

export function renderMoodDisplays() {
  const diaryMood = state.recordedMoods[toDateText(state.currentDate)];
  const todayMood = state.recordedMoods[toDateText(new Date())];

  if (dom.diaryMoodLabel) dom.diaryMoodLabel.hidden = !diaryMood;
  if (dom.diaryMoodPill) dom.diaryMoodPill.hidden = !diaryMood;
  if (dom.diaryMoodText) dom.diaryMoodText.textContent = diaryMood || "";
  const diaryMoodIcon = dom.diaryMoodPill?.querySelector("img");
  if (diaryMoodIcon) {
    diaryMoodIcon.hidden = !diaryMood;
    if (diaryMood) {
      diaryMoodIcon.src = `${document.body.dataset.svgBase}moodcard/${moodIconFiles[diaryMood]}`;
    }
  }
  applyMoodDisplay(dom.diaryMoodPill, diaryMood);

  if (dom.snapshotMoodName) dom.snapshotMoodName.textContent = todayMood || "Not set";
  if (dom.snapshotMoodDetail) {
    dom.snapshotMoodDetail.textContent = moodDetails[todayMood] || "No check-in yet";
  }
  if (dom.snapshotMoodDot) {
    dom.snapshotMoodDot.hidden = !todayMood;
    if (todayMood) {
      dom.snapshotMoodDot.style.setProperty(
        "--mood-icon",
        `url("${document.body.dataset.svgBase}moodcard/${moodIconFiles[todayMood]}")`,
      );
    }
  }
  applyMoodDisplay(dom.snapshotMoodDot, todayMood);
}

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
  const todayText = toDateText(new Date());
  const isToday = state.selectedMiniDate === todayText;
  const [, month, day] = state.selectedMiniDate.split("-").map(Number);
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][Math.min(day % 10, 4)] || "th";
  if (dom.homeMoodTitle) dom.homeMoodTitle.textContent = isToday ? "HOW ARE YOU FEELING TODAY?" : `${months[month - 1]} ${day}${suffix} Mood:`;
  if (dom.homeMoodName) dom.homeMoodName.textContent = selectedMood || "Not set";
  if (dom.homeMoodDetail) {
    dom.homeMoodDetail.textContent = mainMoodDetails[selectedMood] || "No check-in yet";
  }
  if (dom.homeMoodIcon) dom.homeMoodIcon.hidden = !selectedMood;
  dom.moodButtons.forEach((button) => {
    button.classList.toggle("selected", button.dataset.mood === selectedMood);
    if (button.dataset.mood === selectedMood && dom.homeMoodIcon) {
      const icon = button.querySelector(".mood-icon");
      const displayColor = typeof getComputedStyle === "function" ? getComputedStyle(button).color : moodColors[selectedMood];
      dom.homeMoodIcon.style.setProperty("--mood-icon", icon.style.getPropertyValue("--mood-icon"));
      dom.homeMoodIcon.style.background = displayColor;
      if (dom.homeMoodName) dom.homeMoodName.style.color = isToday ? "" : displayColor;
    }
  });
  if (!selectedMood && dom.homeMoodName) dom.homeMoodName.style.color = "";
}

function syncMiniCalendarSelection() {
  dom.miniCalendarGrid.querySelectorAll("button[data-date]").forEach((button) => {
    const selected = button.dataset.date === state.selectedMiniDate;
    button.classList.toggle("mini-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
    if (selected) {
      button.style.backgroundColor = "var(--text-primary)";
      button.style.color = "#fff";
      button.style.borderColor = "var(--text-primary)";
    } else {
      button.style.removeProperty("background-color");
      button.style.removeProperty("color");
      button.style.removeProperty("border-color");
    }
  });
}

function animateMiniMoodSelection() {
  for (const element of [dom.homeMoodTitle, dom.homeMoodName, dom.homeMoodDetail, dom.homeMoodIcon]) {
    if (!element || element.hidden || !element.animate) continue;
    element.getAnimations().forEach(animation => animation.cancel());
    element.animate([
      { opacity: 0.55, transform: "translateY(3px)" },
      { opacity: 1, transform: "translateY(0)" },
    ], { duration: 300, easing: "ease-out" });
  }
}

export function renderMiniCalendar() {
  if (!dom.miniCalendarGrid) return;

  const today = new Date();
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  if (state.miniVisibleMonth.getTime() !== currentMonth.getTime()) {
    state.miniVisibleMonth = currentMonth;
    state.miniCalendarPage = Math.floor((currentMonth.getDay() + today.getDate() - 1) / 28);
    state.selectedMiniDate = toDateText(today);
  }
  const year = state.miniVisibleMonth.getFullYear();
  const month = state.miniVisibleMonth.getMonth();
  const todayText = toDateText(today);

  dom.miniCalendarGrid.innerHTML = "";
  const startOffset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const pageCount = Math.ceil((startOffset + daysInMonth) / 28);
  state.miniCalendarPage = Math.max(0, Math.min(state.miniCalendarPage || 0, pageCount - 1));
  const pageStart = state.miniCalendarPage * 28;
  dom.miniCalendarGrid.setAttribute("aria-label", `${months[month]} ${year}, page ${state.miniCalendarPage + 1} of ${pageCount}`);
  if (dom.miniPrevMonthButton) {
    dom.miniPrevMonthButton.disabled = state.miniCalendarPage === 0;
    dom.miniPrevMonthButton.setAttribute("aria-label", "Previous page of current month");
    dom.miniPrevMonthButton.querySelector("img").style.opacity = dom.miniPrevMonthButton.disabled ? "0.32" : "";
  }
  if (dom.miniNextMonthButton) {
    dom.miniNextMonthButton.disabled = state.miniCalendarPage === pageCount - 1;
    dom.miniNextMonthButton.setAttribute("aria-label", "Next page of current month");
    dom.miniNextMonthButton.querySelector("img").style.opacity = dom.miniNextMonthButton.disabled ? "0.32" : "";
  }

  for (let index = pageStart; index < pageStart + 28; index += 1) {
    const day = index - startOffset + 1;
    if (day < 1 || day > daysInMonth) {
      const outsideCell = document.createElement("span");
      outsideCell.className = "mini-outside";
      outsideCell.textContent = String(new Date(year, month, day).getDate());
      outsideCell.style.border = "none";
      dom.miniCalendarGrid.appendChild(outsideCell);
      continue;
    }
    const dateText = toDateText(new Date(year, month, day));
    const dayCell = document.createElement("button");
    dayCell.textContent = String(day);
    dayCell.dataset.date = dateText;

    dayCell.addEventListener("click", () => {
      state.selectedMiniDate = dateText;
      syncMiniCalendarSelection();
      updateMoodButtonState();
      animateMiniMoodSelection();
    });

    const mood = state.recordedMoods[dateText];
    if (mood && calendarMoodColors[mood]) {
      dayCell.style.setProperty("--mood-color", calendarMoodColors[mood]);
      dayCell.classList.add(dateText === todayText ? "mood-today" : "mood-history");
    }

    if (dateText === todayText) dayCell.classList.add("today");
    dom.miniCalendarGrid.appendChild(dayCell);
  }

  syncMiniCalendarSelection();
  updateMoodButtonState();
  renderMoodDisplays();
}

export function loadRecordedMoods() {
  if (!state.diaryBridge) return;
  state.diaryBridge.getRecordedMoods((moods) => {
    state.recordedMoods = moods || {};
    renderMiniCalendar();
    renderCalendar();
  });
}

// 注册心情按钮的提示和保存事件。
export function bindMoodEvents() {
  dom.miniPrevMonthButton?.addEventListener("click", () => {
    if (state.miniCalendarPage > 0) {
      state.miniCalendarPage -= 1;
      renderMiniCalendar();
    }
  });

  dom.miniNextMonthButton?.addEventListener("click", () => {
    const month = state.miniVisibleMonth;
    const pageCount = Math.ceil((month.getDay() + new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()) / 28);
    if (state.miniCalendarPage + 1 < pageCount) {
      state.miniCalendarPage += 1;
      renderMiniCalendar();
    }
  });

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
        renderCalendar();
      });
    });
  });
}
