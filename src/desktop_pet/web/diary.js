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

function updateWordCount() {
  const text = dom.diaryEditor.value.trim();
  const count = text ? text.split(/\s+/).length : 0;
  if (dom.diaryWordCount) dom.diaryWordCount.textContent = `${count} ${count === 1 ? "word" : "words"}`;
}

function formatDiaryDate(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function updateRecentEntries() {
  dom.diaryRecentCards.forEach((card) => {
    const date = new Date(state.currentDate);
    date.setDate(date.getDate() + Number(card.dataset.offset || 0));
    card.dataset.date = toDateText(date);
    const title = card.querySelector("strong");
    if (title) title.textContent = formatDiaryDate(date);
  });
}

function showEntry(entry) {
  state.currentDate = new Date(`${entry.date}T00:00:00`);
  dom.diaryTitle.textContent = formatDiaryDate(state.currentDate);
  if (dom.diaryYear) dom.diaryYear.textContent = state.currentDate.getFullYear();
  dom.diaryEditor.value = entry.text || "";
  setStatus(entry.updated_at ? "Auto saved" : "Not saved yet");
  updateWordCount();
  updateRecentEntries();
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
    updateWordCount();
    if (state.diaryBridge) state.diaryBridge.notifyTyping(dom.diaryEditor.value);
  });

  dom.saveButton.addEventListener("click", () => saveCurrentEntry());
  dom.discardButton.addEventListener("click", () => discardCurrentEntry());

  dom.diaryRecentCards.forEach((card) => {
    card.addEventListener("click", () => requestOpenDate(card.dataset.date));
  });

  dom.previousEntryButton?.addEventListener("click", () => {
    const previousDate = new Date(state.currentDate);
    previousDate.setDate(previousDate.getDate() - 1);
    requestOpenDate(toDateText(previousDate));
  });

  dom.diaryExpandButton?.addEventListener("click", () => {
    dom.app?.classList.toggle("diary-editor-expanded");
  });

  dom.diaryToolbarButtons.forEach((button) => {
    button.addEventListener("click", () => applyEditorCommand(button.dataset.editorCommand));
  });

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

function applyEditorCommand(command) {
  const editor = dom.diaryEditor;
  const start = editor.selectionStart;
  const end = editor.selectionEnd;
  const selected = editor.value.slice(start, end);
  const lineStart = editor.value.lastIndexOf("\n", start - 1) + 1;

  if (command === "undo" || command === "redo") {
    document.execCommand(command);
    editor.focus();
    return;
  }

  const wrappers = {
    bold: ["**", "**"],
    italic: ["*", "*"],
    underline: ["__", "__"],
    link: ["[", "](https://)"],
  };

  if (wrappers[command]) {
    const [before, after] = wrappers[command];
    editor.setRangeText(`${before}${selected}${after}`, start, end, "select");
  } else if (command === "h1" || command === "h2") {
    editor.setRangeText(command === "h1" ? "# " : "## ", lineStart, lineStart, "end");
  } else if (command === "bullet" || command === "number") {
    editor.setRangeText(command === "bullet" ? "- " : "1. ", lineStart, lineStart, "end");
  } else if (command === "rule") {
    editor.setRangeText("\n---\n", start, end, "end");
  }

  editor.dispatchEvent(new Event("input", { bubbles: true }));
  editor.focus();
}
