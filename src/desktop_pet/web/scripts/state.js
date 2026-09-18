// 日期工具模块：这里只放不依赖页面元素、不修改全局状态的纯函数。
// 纯函数容易理解，也方便以后单独写测试。

/** 把 Date 转换成 Python 存储层使用的 yyyy-MM-dd 格式。 */
export function toDateText(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

/** 判断一个 yyyy-MM-dd 日期是否晚于今天。 */
export function isFutureDate(dateText) {
  return dateText > toDateText(new Date());
}

/** 根据小时返回首页问候语使用的时间段。 */
export function getDayPeriod(hour) {
  if (hour >= 0 && hour < 5) return "midnight";
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 14) return "noon";
  if (hour >= 14 && hour < 18) return "afternoon";
  return "evening";
}

// Mood 卡片和摘要配色；日历使用独立的 calendarMoodColors。
export const moodColors = Object.freeze({
  Stress: "#b7adad",
  Low: "#1471da",
  Anxious: "#ff383c",
  Steady: "#8fb994",
  Light: "#dab6b4",
  Inspired: "#cb30e0",
  Grateful: "#ffcc00",
});

// Home 小日历背景与 Calendar 日期圆点共享的 Figma 色卡。
export const calendarMoodColors = Object.freeze({
  Low: "#9EBEF1",
  Steady: "#CFF7D3",
  Light: "#FEE9E7",
  Grateful: "#FFE8A3",
  Anxious: "#FCB3AD",
  Stress: "#B3B3B3",
  Inspired: "#FAE1FA",
});

// 状态模块：集中保存会在运行过程中变化的数据。
// 导出同一个对象后，各功能模块看到的始终是同一份状态。
const today = new Date();

export const state = {
  // Qt WebChannel 连接成功后才会赋值。
  diaryBridge: null,

  hasUnsavedChanges: false,
  currentDate: today,
  visibleMonth: new Date(today.getFullYear(), today.getMonth(), 1),
  calendarPage: Math.floor((new Date(today.getFullYear(), today.getMonth(), 1).getDay() + today.getDate() - 1) / 35),
  miniVisibleMonth: new Date(today.getFullYear(), today.getMonth(), 1),
  miniCalendarPage: Math.floor((new Date(today.getFullYear(), today.getMonth(), 1).getDay() + today.getDate() - 1) / 28),
  pendingDateText: null,
  recordedDates: new Set(),
  recordedMoods: {},
  selectedMiniDate: toDateText(new Date()),
};
