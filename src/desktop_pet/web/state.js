import { toDateText } from "./date-utils.js";

// 状态模块：集中保存会在运行过程中变化的数据。
// 导出同一个对象后，各功能模块看到的始终是同一份状态。
const today = new Date();

export const state = {
  // Qt WebChannel 连接成功后才会赋值。
  diaryBridge: null,

  hasUnsavedChanges: false,
  currentDate: today,
  visibleMonth: new Date(today.getFullYear(), today.getMonth(), 1),
  pendingDateText: null,
  recordedDates: new Set(),
  recordedMoods: {},
  selectedMiniDate: toDateText(new Date()),
};
