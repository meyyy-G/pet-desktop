import { dom } from "../dom.js";
import { state, toDateText } from "../state.js";
import { showPage } from "../navigation.js";
import { renderCalendar } from "./calendar.js";
import { renderMoodDisplays } from "./home.js";

// 弹窗模块：只控制弹窗显示、隐藏及其关联的待处理日期。

function showFutureDateMessage() {
  dom.futureModal.classList.add("visible");
}

function hideFutureDateMessage() {
  dom.futureModal.classList.remove("visible");
}

function showUnsavedModal(dateText) {
  state.pendingDateText = dateText;
  dom.unsavedModal.classList.add("visible");
}

function hideUnsavedModal() {
  state.pendingDateText = null;
  dom.unsavedModal.classList.remove("visible");
}

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

let editorAnimation = null;
let editorPlaceholder = null;
let editorScrollTop = 0;

function editorGeometry(area) {
  return { top: area.offsetTop, left: area.offsetLeft, width: area.offsetWidth, height: area.offsetHeight };
}

function rectKeyframe(rect) {
  return {
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
}

function setEditorExpanded(expanded) {
  const app = dom.app;
  const area = dom.diaryWritingArea;
  const button = dom.diaryExpandButton;
  if (!app || !area) return;
  if (editorAnimation) editorAnimation.finish();

  const currentlyExpanded = app.classList.contains("diary-editor-expanded");
  if (expanded === currentlyExpanded) return;

  const page = area.closest(".diary-page");
  if (expanded) {
    editorScrollTop = page.scrollTop;
    page.scrollTop = 0;
  }
  const startRect = editorGeometry(area);
  let endRect;

  if (expanded) {
    editorPlaceholder = document.createElement("div");
    editorPlaceholder.setAttribute("aria-hidden", "true");
    // Keep the normal layout responsive while the editor is an overlay.
    const style = getComputedStyle(area);
    editorPlaceholder.style.cssText = `width:100%;height:${startRect.height}px;flex:${style.flex};min-height:${style.minHeight};`;
    area.before(editorPlaceholder);
    app.classList.add("diary-editor-expanded");
    endRect = editorGeometry(area);
  } else {
    endRect = editorGeometry(editorPlaceholder);
  }

  const settle = () => {
    app.classList.toggle("diary-editor-expanded", expanded);
    if (!expanded) {
      editorPlaceholder?.remove();
      editorPlaceholder = null;
      page.scrollTop = editorScrollTop;
    }
    area.classList.remove("is-animating");
    button?.setAttribute("aria-expanded", String(expanded));
    button?.setAttribute("aria-label", expanded ? "Collapse editor" : "Expand editor");
  };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof area.animate !== "function") {
    settle();
    return;
  }

  area.classList.add("is-animating");
  editorAnimation = area.animate(
    [rectKeyframe(startRect), rectKeyframe(endRect)],
    {
      duration: 320,
      easing: "cubic-bezier(.22, 1, .36, 1)",
      fill: "both",
    },
  );

  const animation = editorAnimation;
  // Finish synchronously too, so repeated clicks cannot measure a stale effect.
  const finish = () => {
    if (editorAnimation !== animation) return;
    settle();
    animation.cancel();
    editorAnimation = null;
  };
  const nativeFinish = animation.finish.bind(animation);
  animation.finish = () => { nativeFinish(); finish(); };
  animation.addEventListener("finish", finish, { once: true });
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
  renderMoodDisplays();
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
  if (!dom.diaryEditor) return;
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
    setEditorExpanded(!dom.app?.classList.contains("diary-editor-expanded"));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && dom.app?.classList.contains("diary-editor-expanded")) {
      setEditorExpanded(false);
    }
  });

  window.addEventListener("resize", () => {
    // Pixel keyframes describe the old viewport; settle into the fluid CSS.
    if (editorAnimation) editorAnimation.finish();
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
