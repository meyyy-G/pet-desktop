import { dom } from "./dom.js";
import { state } from "./state.js";
import { toDateText } from "./date-utils.js";
import { showPage } from "./navigation.js";
import { renderCalendar } from "./calendar.js";
import {
  hideFutureDateMessage,
  hideUnsavedModal,
  showUnsavedModal,
} from "./modals.js";

// 日记模块：负责日记读取、编辑、保存、放弃和未保存确认流程。

function setStatus(text) {
  dom.saveStatus.textContent = text;
}

function showEntry(entry) {
  state.currentDate = new Date(`${entry.date}T00:00:00`);
  dom.diaryTitle.textContent = entry.date;
  dom.diaryEditor.value = entry.text || "";
  setStatus(entry.updated_at ? `Last saved ${entry.updated_at}` : "No record yet");
  state.hasUnsavedChanges = false;
  renderCalendar();
}

export function loadEntryByDate(dateText, openDiaryPage = true) {
  if (!state.diaryBridge) return;

  state.diaryBridge.loadEntryByDate(dateText, (entry) => {
    showEntry(entry);
    if (openDiaryPage) showPage("diary");
  });
}

export function loadTodayEntry() {
  loadEntryByDate(toDateText(new Date()), false);
}

export function saveCurrentEntry(callback) {
  if (!state.diaryBridge) return;

  state.diaryBridge.saveEntryByDate(
    toDateText(state.currentDate),
    dom.diaryEditor.value,
    (entry) => {
      showEntry(entry);
      loadRecordedDates();
      if (callback) callback();
    },
  );
}

export function loadRecordedDates() {
  if (!state.diaryBridge) return;

  state.diaryBridge.getRecordedDates((dates) => {
    state.recordedDates = new Set(dates || []);
    renderCalendar();
  });
}

export function discardCurrentEntry(callback) {
  if (!state.diaryBridge) return;

  state.diaryBridge.discardTodayEntry((entry) => {
    showEntry(entry);
    if (callback) callback();
  });
}

export function requestOpenDate(dateText) {
  if (dateText === toDateText(state.currentDate) || !state.hasUnsavedChanges) {
    loadEntryByDate(dateText);
    return;
  }
  showUnsavedModal(dateText);
}

/** 集中注册日记区域和两个弹窗的按钮事件。 */
export function bindDiaryEvents() {
  dom.diaryEditor.addEventListener("input", () => {
    state.hasUnsavedChanges = true;
    setStatus("Not saved yet");
    if (state.diaryBridge) state.diaryBridge.notifyTyping(dom.diaryEditor.value);
  });

  dom.saveButton.addEventListener("click", () => saveCurrentEntry());
  dom.discardButton.addEventListener("click", () => discardCurrentEntry());

  dom.modalSaveButton.addEventListener("click", () => {
    const targetDateText = state.pendingDateText;
    saveCurrentEntry(() => {
      hideUnsavedModal();
      loadEntryByDate(targetDateText);
    });
  });

  dom.modalDiscardButton.addEventListener("click", () => {
    const targetDateText = state.pendingDateText;
    discardCurrentEntry(() => {
      hideUnsavedModal();
      loadEntryByDate(targetDateText);
    });
  });

  dom.modalCancelButton.addEventListener("click", hideUnsavedModal);
  dom.futureOkButton.addEventListener("click", hideFutureDateMessage);
}
