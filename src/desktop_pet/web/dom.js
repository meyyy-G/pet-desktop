// DOM 模块：集中保存页面元素引用。
// 其他模块通过 dom.xxx 使用元素，不需要到处重复 querySelector。

export const dom = {
  app: document.querySelector(".app-v2"),
  navItems: document.querySelectorAll(".nav-item"),
  quickActions: document.querySelectorAll(".v2-quick-action[data-page]"),
  newTaskQuickAction: document.querySelector('.v2-quick-action[data-action="new-task"]'),
  pages: document.querySelectorAll(".page"),

  diaryTitle: document.querySelector("#diary-title"),
  diaryEditor: document.querySelector("#diary-editor"),
  saveStatus: document.querySelector("#save-status"),
  saveButton: document.querySelector("#save-button"),
  discardButton: document.querySelector("#discard-button"),
  diaryYear: document.querySelector("#diary-year"),
  diaryWordCount: document.querySelector("#diary-word-count"),
  diaryRecentCards: document.querySelectorAll(".diary-recent-card"),
  diaryToolbarButtons: document.querySelectorAll("[data-editor-command]"),
  diaryExpandButton: document.querySelector(".diary-expand-button"),
  previousEntryButton: document.querySelector("#previous-entry-button"),

  chatMessageList: document.querySelector("#chat-message-list"),
  chatComposeForm: document.querySelector("#chat-compose-form"),
  chatInput: document.querySelector("#chat-input"),
  chatSendButton: document.querySelector("#chat-send-button"),

  calendarTitle: document.querySelector("#calendar-title"),
  calendarGrid: document.querySelector("#calendar-grid"),
  prevMonthButton: document.querySelector("#prev-month-button"),
  nextMonthButton: document.querySelector("#next-month-button"),
  todayCalendarButton: document.querySelector("#today-calendar-button"),

  todayNumber: document.querySelector("#today-number"),
  todayLabel: document.querySelector("#today-label"),
  weekDays: document.querySelectorAll(".week-days span"),
  taskItems: document.querySelector("#task-items"),
  taskAddButton: document.querySelector("#task-add-button"),
  taskProgressText: document.querySelector("#task-progress-text"),
  taskProgressBar: document.querySelector("#task-progress-bar"),
  taskProgressFill: document.querySelector("#task-progress-fill"),
  rightTaskCount: document.querySelector("#right-task-count"),
  rightTaskProgressText: document.querySelector("#right-task-progress-text"),
  rightTaskProgressFill: document.querySelector("#right-task-progress-fill"),
  rightTaskList: document.querySelector("#right-task-list"),
  homeGreeting: document.querySelector("#home-greeting"),
  homeDateLine: document.querySelector("#home-date-line"),
  miniCalendarTitle: document.querySelector("#mini-calendar-title"),
  miniCalendarGrid: document.querySelector("#mini-calendar-grid"),
  miniPrevMonthButton: document.querySelector("#mini-prev-month-button"),
  miniNextMonthButton: document.querySelector("#mini-next-month-button"),

  unsavedModal: document.querySelector("#unsaved-modal"),
  modalSaveButton: document.querySelector("#modal-save-button"),
  modalDiscardButton: document.querySelector("#modal-discard-button"),
  modalCancelButton: document.querySelector("#modal-cancel-button"),

  futureModal: document.querySelector("#future-modal"),
  futureOkButton: document.querySelector("#future-ok-button"),

  moodButtons: document.querySelectorAll(".mood-button"),
  moodTooltip: document.querySelector("#mood-tooltip"),
};
