// DOM 模块：集中保存页面元素引用。
// 其他模块通过 dom.xxx 使用元素，不需要到处重复 querySelector。

export const dom = {
  navItems: document.querySelectorAll(".nav-item"),
  pages: document.querySelectorAll(".page"),

  diaryTitle: document.querySelector("#diary-title"),
  diaryEditor: document.querySelector("#diary-editor"),
  saveStatus: document.querySelector("#save-status"),
  saveButton: document.querySelector("#save-button"),
  discardButton: document.querySelector("#discard-button"),

  calendarTitle: document.querySelector("#calendar-title"),
  calendarGrid: document.querySelector("#calendar-grid"),
  prevMonthButton: document.querySelector("#prev-month-button"),
  nextMonthButton: document.querySelector("#next-month-button"),

  todayNumber: document.querySelector("#today-number"),
  todayLabel: document.querySelector("#today-label"),
  homeGreeting: document.querySelector("#home-greeting"),
  homeDateLine: document.querySelector("#home-date-line"),
  miniCalendarTitle: document.querySelector("#mini-calendar-title"),
  miniCalendarGrid: document.querySelector("#mini-calendar-grid"),

  unsavedModal: document.querySelector("#unsaved-modal"),
  modalSaveButton: document.querySelector("#modal-save-button"),
  modalDiscardButton: document.querySelector("#modal-discard-button"),
  modalCancelButton: document.querySelector("#modal-cancel-button"),

  futureModal: document.querySelector("#future-modal"),
  futureOkButton: document.querySelector("#future-ok-button"),

  moodButtons: document.querySelectorAll(".mood-button"),
  moodTooltip: document.querySelector("#mood-tooltip"),
};
