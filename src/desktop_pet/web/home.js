import { dom } from "./dom.js";
import { getDayPeriod } from "./date-utils.js";

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
  dom.todayNumber.textContent = String(today.getDate());
  dom.todayLabel.textContent = `${shortWeekdays[today.getDay()]}·${months[today.getMonth()]}`;
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

  dom.homeGreeting.textContent = `Good ${period},Mey.`;
  dom.homeDateLine.textContent = `${weekdays[today.getDay()]}, ${months[today.getMonth()]} ${today.getDate()} · A good day to check in with yourself.`;
}
