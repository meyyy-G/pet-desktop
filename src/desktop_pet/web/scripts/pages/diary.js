import { dom } from "../dom.js";
import { state, toDateText } from "../state.js";
import { showPage } from "../navigation.js";
import { renderCalendar } from "./calendar.js";
import { renderMoodDisplays } from "./home.js";
import { DIARY_COLORS, DIARY_FONTS, allowedDiaryColor, diaryPayload, diaryPlainText, showDiaryContent, updateDiaryPlaceholder, applyDiaryCommand, applyDiaryColor, applyDiaryFont, insertDiaryImage } from "./diary-rich-text.js";

// 弹窗模块：只控制弹窗显示、隐藏及其关联的待处理日期。

function showFutureDateMessage() {
  dom.futureModal.classList.add("visible");
}

function hideFutureDateMessage() {
  dom.futureModal.classList.remove("visible");
}

// 日记模块：负责日记读取、编辑、保存、放弃和未保存确认流程。

function setStatus(text) {
  dom.saveStatus.textContent = text;
  if (dom.diarySaveIndicator) {
    const hasContent = Boolean(diaryPlainText(dom.diaryEditor).trim() || dom.diaryEditor.querySelector("img[data-diary-image]"));
    dom.diarySaveIndicator.hidden = !text || !hasContent;
  }
}

const AUTO_SAVE_DELAY = 700;
const SAVE_TIMEOUT = 10000;
let mainSavedStatus = "";
let autoSaveTimer = null;
let saveWatchdog = null;
let saveGeneration = 0;
let editVersion = 0;
let saveInFlight = false;
let manualSaveRequested = false;
let manualSaveCallback = null;

function resetMainSave() {
  clearTimeout(autoSaveTimer);
  clearTimeout(saveWatchdog);
  autoSaveTimer = null;
  saveWatchdog = null;
  saveGeneration += 1;
  editVersion += 1;
  saveInFlight = false;
  manualSaveRequested = false;
  manualSaveCallback = null;
}

function scheduleAutoSave(delay = AUTO_SAVE_DELAY) {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null;
    persistMainEntry();
  }, delay);
}

function finishManualSave() {
  if (!manualSaveRequested) return;
  const callback = manualSaveCallback;
  manualSaveRequested = false;
  manualSaveCallback = null;
  setMainEditing(false);
  if (callback) callback();
}

function persistMainEntry() {
  if (saveInFlight || !state.hasUnsavedChanges) return;
  if (!state.diaryBridge?.saveEntryByDate) {
    setStatus("Save failed");
    manualSaveRequested = false;
    manualSaveCallback = null;
    return;
  }
  const date = toDateText(state.currentDate);
  const version = editVersion;
  const generation = ++saveGeneration;
  const payload = diaryPayload(dom.diaryEditor);
  saveInFlight = true;
  let settled = false;
  let watchdog = null;
  const finish = entry => {
    if (settled) return;
    settled = true;
    clearTimeout(watchdog);
    if (saveWatchdog === watchdog) saveWatchdog = null;
    if (generation !== saveGeneration) return;
    saveInFlight = false;
    if (version !== editVersion) {
      scheduleAutoSave(0);
      return;
    }
    if (!entry || entry.ok === false || entry.date !== date) {
      setStatus("Save failed");
      manualSaveRequested = false;
      manualSaveCallback = null;
      return;
    }
    state.hasUnsavedChanges = false;
    mainSavedStatus = diaryPlainText(dom.diaryEditor).trim() || dom.diaryEditor.querySelector("img[data-diary-image]") ? "Saved" : "";
    setStatus(mainSavedStatus);
    loadRecordedDates();
    finishManualSave();
  };
  watchdog = setTimeout(() => finish(null), SAVE_TIMEOUT);
  saveWatchdog = watchdog;
  try {
    state.diaryBridge.saveEntryByDate(date, payload, finish);
  } catch {
    finish(null);
  }
}

function setMainEditing(editing) {
  if (dom.diaryMainActions) dom.diaryMainActions.hidden = !editing;
}

function leaveMainEditingIfOutside(target) {
  if (dom.diaryMainActions?.hidden) return;
  if (dom.diaryEditor.contains(target) || target?.closest?.(".diary-writing-area .diary-toolbar, #diary-color-popover, #diary-main-actions")) return;
  setMainEditing(false);
  if (!state.hasUnsavedChanges) setStatus(mainSavedStatus);
}

function updateWordCount() {
  const text = diaryPlainText(dom.diaryEditor).trim();
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

let recentEntryTrigger = null;
let recentMood = "";
let recentSavedMood = "";
let recentDirty = false;
let recentSelection = null;
let recentRequestId = 0;

function recentEditor() { return document.querySelector("#diary-recent-dialog-editor"); }

function selectedFont(editor) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) return "Inter";
  const commandFont = String(document.queryCommandValue("fontName") || "").replaceAll(/["']/g, "").split(",")[0].trim();
  if (DIARY_FONTS.includes(commandFont)) return commandFont;
  const node = selection.anchorNode.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode.parentElement;
  const family = getComputedStyle(node).fontFamily.replaceAll(/["']/g, "").split(",")[0].trim();
  return DIARY_FONTS.includes(family) ? family : "Inter";
}

function entryFont(editor) {
  const first = editor.querySelector("[style*='font-family']");
  const family = first?.style.fontFamily.replaceAll(/["']/g, "").trim();
  return DIARY_FONTS.includes(family) ? family : "Inter";
}

function syncToolbar(editor, toolbar) {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) return;
  toolbar.querySelector(".diary-font-menu summary > span").textContent = selectedFont(editor);
  const font = selectedFont(editor);
  toolbar.querySelectorAll("[data-diary-font]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.diaryFont === font)));
  const commandMap = { bold: "bold", italic: "italic", underline: "underline", bullet: "insertUnorderedList", number: "insertOrderedList" };
  toolbar.querySelectorAll("[data-editor-command], [data-recent-command]").forEach(button => {
    const command = button.dataset.editorCommand || button.dataset.recentCommand;
    if (commandMap[command]) button.setAttribute("aria-pressed", String(document.queryCommandState(commandMap[command])));
    if (command === "undo" || command === "redo") button.disabled = !document.queryCommandEnabled(command);
  });
  const block = String(document.queryCommandValue("formatBlock") || "p").replace(/[<>]/g, "").toLowerCase();
  toolbar.querySelector(".diary-format-menu summary > span").textContent = block === "h1" || block === "h2" ? block.toUpperCase() : "paragraph";
  toolbar.querySelectorAll(".diary-format-options button").forEach(button => {
    const command = button.dataset.editorCommand || button.dataset.recentCommand;
    button.setAttribute("aria-pressed", String(command === (block === "h1" || block === "h2" ? block : "p")));
  });
}

function chooseAndInsertImage(editor, restoreSelection) {
  if (!state.diaryBridge?.chooseDiaryImage) return;
  state.diaryBridge.chooseDiaryImage(result => {
    if (result?.cancelled) return;
    if (!result?.ok) {
      window.alert(result?.error || "Could not open this image.");
      return;
    }
    restoreSelection();
    insertDiaryImage(editor, result);
  });
}

function renderRecentMood() {
  const row = document.querySelector("#diary-recent-dialog-moods");
  const buttons = [...row.querySelectorAll("[data-mood]")];
  buttons.forEach(button => {
    button.classList.toggle("is-selected", button.dataset.mood === recentMood);
    button.setAttribute("aria-pressed", String(button.dataset.mood === recentMood));
  });
  const before = new Map(buttons.map(button => [button, button.getBoundingClientRect()]));
  buttons.sort((a, b) => Number(b.dataset.mood === recentMood) - Number(a.dataset.mood === recentMood) || Number(a.dataset.moodOrder) - Number(b.dataset.moodOrder));
  buttons.forEach(button => row.append(button));
  buttons.forEach(button => {
    const old = before.get(button);
    const next = button.getBoundingClientRect();
    const dx = old.left - next.left;
    if (Math.abs(dx) > 1 && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      button.animate([{ transform: `translateX(${dx}px)` }, { transform: "translateX(0)" }], { duration: 280, easing: "ease-in-out" });
    }
  });
}

function setRecentEntry(entry) {
  document.querySelector("#diary-recent-dialog-title").textContent = formatDiaryDate(new Date(`${entry.date}T00:00:00`));
  showDiaryContent(recentEditor(), entry);
  recentSelection = null;
  recentMood = entry.mood || "";
  recentSavedMood = recentMood;
  recentDirty = false;
  renderRecentMood();
  document.querySelector(".diary-recent-toolbar .diary-font-menu summary > span").textContent = entryFont(recentEditor());
  const edited = entry.updated_at ? new Date(entry.updated_at.replace(" ", "T")) : null;
  document.querySelector("#diary-recent-dialog-edited").textContent = edited && !Number.isNaN(edited.getTime())
    ? `Last edited: ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(edited)}`
    : "Not edited yet";
}

function closeRecentEntry() {
  const dialog = document.querySelector("#diary-recent-dialog");
  if (dialog.hidden) return;
  recentRequestId += 1;
  dialog.hidden = true;
  dialog.classList.remove("is-expanded");
  document.querySelector("#diary-recent-color-popover").hidden = true;
  if (recentEntryTrigger?.isConnected) recentEntryTrigger.focus();
  else document.querySelector(`#calendar-grid [data-date="${dialog.dataset.date}"]`)?.focus();
  recentEntryTrigger = null;
}

function openHistoricalEntryByDate(dateText, trigger) {
  if (!state.diaryBridge?.getHistoricalEntryByDate) return;
  const request = ++recentRequestId;
  const sourcePage = dom.app?.dataset.activePage;
  state.diaryBridge.getHistoricalEntryByDate(dateText, entry => {
    if (request !== recentRequestId || sourcePage !== dom.app?.dataset.activePage || !entry?.has_content || entry.date !== dateText) return;
    recentEntryTrigger = trigger || document.activeElement;
    const dialog = document.querySelector("#diary-recent-dialog");
    dialog.dataset.date = entry.date;
    setRecentEntry(entry);
    dialog.hidden = false;
    document.querySelector("#diary-recent-dialog-close").focus();
  });
}

function updateRecentEntries() {
  if (!state.diaryBridge?.getRecentEntries) return;
  state.diaryBridge.getRecentEntries((entries) => {
    dom.diaryRecentCards.forEach((card, index) => {
      const entry = entries?.[index];
      card.hidden = !entry;
      if (!entry) return;
      card.dataset.date = entry.date;
      card.querySelector("strong").textContent = formatDiaryDate(new Date(`${entry.date}T00:00:00`));
      const text = String(entry.text || "").trim();
      const count = text ? text.split(/\s+/).length : 0;
      card.querySelector("small").textContent = `${count} ${count === 1 ? "word" : "words"}`;
      card.querySelector(".diary-recent-excerpt").textContent = text.replace(/\s+/g, " ");
    });
    dom.diaryRecent?.classList.toggle("is-visible", Boolean(entries?.length));
  });
}

let editorAnimation = null;
let editorPlaceholder = null;
let editorScrollTop = 0;
let editorSelection = null;
let currentDiaryColor = DIARY_COLORS[0];

function selectionInEditor() {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  return dom.diaryEditor.contains(range.startContainer) && dom.diaryEditor.contains(range.endContainer);
}

function restoreEditorSelection() {
  if (selectionInEditor()) {
    dom.diaryEditor.focus();
    return;
  }
  dom.diaryEditor.focus();
  if (editorSelection && dom.diaryEditor.contains(editorSelection.startContainer) && dom.diaryEditor.contains(editorSelection.endContainer)) {
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(editorSelection);
  } else {
    const range = document.createRange();
    range.selectNodeContents(dom.diaryEditor);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function closeColorPopover() {
  const popover = document.querySelector("#diary-color-popover");
  popover.hidden = true;
  document.querySelector(".diary-color-button").setAttribute("aria-expanded", "false");
}

function setSelectedColor(color) {
  currentDiaryColor = color;
  for (const button of document.querySelectorAll("#diary-color-popover [data-diary-color]")) {
    button.setAttribute("aria-pressed", String(button.dataset.diaryColor === color));
  }
  document.querySelector(".diary-color-icon").style.backgroundColor = color;
}

function toggleColorPopover() {
  const popover = document.querySelector("#diary-color-popover");
  if (!popover.hidden) return closeColorPopover();
  if (selectionInEditor()) {
    const range = window.getSelection().getRangeAt(0);
    editorSelection = range.cloneRange();
    if (!range.collapsed) {
      const element = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
      const color = allowedDiaryColor(getComputedStyle(element).color);
      if (color) setSelectedColor(color);
    }
  }
  const button = document.querySelector(".diary-color-button");
  const anchor = button.getBoundingClientRect();
  popover.hidden = false;
  const width = popover.getBoundingClientRect().width;
  popover.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - width - 8))}px`;
  popover.style.top = `${anchor.bottom + 10}px`;
  button.setAttribute("aria-expanded", "true");
}

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

let savedChatRequest = 0;

function loadSavedChat(dateText) {
  const section = document.querySelector("#diary-saved-chat");
  const items = document.querySelector("#diary-saved-chat-items");
  if (!section || !items) return;
  const request = ++savedChatRequest;
  section.hidden = true;
  items.replaceChildren();
  if (!state.diaryBridge?.getSavedChatByDate) return;
  state.diaryBridge.getSavedChatByDate(dateText, result => {
    if (request !== savedChatRequest || dateText !== toDateText(state.currentDate)) return;
    if (!result?.ok) {
      const error = document.createElement("p");
      error.textContent = "Could not load saved replies. Reopen this date to try again.";
      items.append(error);
      section.hidden = false;
      return;
    }
    document.querySelector("#diary-saved-chat-count").textContent = String(result.data.length);
    for (const snippet of result.data) {
      const article = document.createElement("article");
      const content = document.createElement("p");
      content.textContent = snippet.content;
      const time = document.createElement("time");
      time.dateTime = snippet.created_at;
      time.textContent = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(snippet.created_at)).replace(/\s/g, "");
      article.append(content, time);
      items.append(article);
    }
    section.hidden = result.data.length === 0;
  });
}

function showEntry(entry) {
  resetMainSave();
  state.currentDate = new Date(`${entry.date}T00:00:00`);
  dom.diaryTitle.textContent = formatDiaryDate(state.currentDate);
  if (dom.diaryYear) dom.diaryYear.textContent = state.currentDate.getFullYear();
  showDiaryContent(dom.diaryEditor, entry);
  editorSelection = null;
  document.querySelector(".diary-writing-area .diary-font-menu summary > span").textContent = entryFont(dom.diaryEditor);
  closeColorPopover();
  loadSavedChat(entry.date);
  mainSavedStatus = entry.updated_at ? "Saved" : "";
  setStatus(mainSavedStatus);
  updateWordCount();
  state.hasUnsavedChanges = false;
  setMainEditing(false);
  renderMoodDisplays();
  renderCalendar();
}

export function loadTodayEntry(openDiaryPage = false) {
  if (!state.diaryBridge) return;
  state.diaryBridge.loadEntryByDate(toDateText(new Date()), (entry) => {
    showEntry(entry);
    if (openDiaryPage) showPage("diary");
  });
}

export function saveCurrentEntry(callback) {
  manualSaveRequested = true;
  manualSaveCallback = callback || null;
  clearTimeout(autoSaveTimer);
  autoSaveTimer = null;
  if (!state.hasUnsavedChanges) {
    setStatus(mainSavedStatus);
    finishManualSave();
    return;
  }
  setStatus("Saving...");
  persistMainEntry();
}

export function loadRecordedDates() {
  if (!state.diaryBridge) return;

  state.diaryBridge.getRecordedDates((dates) => {
    state.recordedDates = new Set(dates || []);
    updateRecentEntries();
    renderCalendar();
  });
}

export function discardCurrentEntry(callback) {
  if (!state.diaryBridge) return;
  resetMainSave();
  state.diaryBridge.discardTodayEntry((entry) => {
    showEntry(entry);
    if (callback) callback();
  });
}

export function requestOpenDate(dateText, trigger) {
  const today = toDateText(new Date());
  if (dateText > today) return;
  if (dateText === today) {
    if (toDateText(state.currentDate) === today) showPage("diary");
    else loadTodayEntry(true);
    return;
  }
  openHistoricalEntryByDate(dateText, trigger);
}

/** 集中注册日记区域和两个弹窗的按钮事件。 */
export function bindDiaryEvents() {
  if (!dom.diaryEditor) return;
  document.addEventListener("pointerdown", event => leaveMainEditingIfOutside(event.target));
  document.addEventListener("focusin", event => leaveMainEditingIfOutside(event.target));
  window.addEventListener("chat:snippet-changed", event => {
    if (event.detail.date === toDateText(state.currentDate)) loadSavedChat(event.detail.date);
  });
  dom.diaryEditor.addEventListener("focus", () => {
    setMainEditing(true);
  });
  dom.diaryEditor.addEventListener("input", () => {
    updateDiaryPlaceholder(dom.diaryEditor);
    editVersion += 1;
    state.hasUnsavedChanges = true;
    setMainEditing(true);
    setStatus("Saving...");
    updateWordCount();
    if (state.diaryBridge) state.diaryBridge.notifyTyping(diaryPayload(dom.diaryEditor));
    scheduleAutoSave();
    syncToolbar(dom.diaryEditor, document.querySelector(".diary-writing-area .diary-toolbar"));
  });

  dom.diaryEditor.addEventListener("paste", event => {
    event.preventDefault();
    document.execCommand("insertText", false, event.clipboardData.getData("text/plain"));
  });

  document.addEventListener("selectionchange", () => {
    if (selectionInEditor()) {
      editorSelection = window.getSelection().getRangeAt(0).cloneRange();
      syncToolbar(dom.diaryEditor, document.querySelector(".diary-writing-area .diary-toolbar"));
    }
  });

  const colorButton = document.querySelector(".diary-color-button");
  const colorPopover = document.querySelector("#diary-color-popover");
  setSelectedColor(currentDiaryColor);
  colorButton.addEventListener("mousedown", event => {
    if (selectionInEditor()) editorSelection = window.getSelection().getRangeAt(0).cloneRange();
    event.preventDefault();
  });
  colorButton.addEventListener("click", toggleColorPopover);
  colorPopover.addEventListener("mousedown", event => event.preventDefault());
  colorPopover.addEventListener("click", event => {
    const button = event.target.closest("[data-diary-color]");
    if (!button) return;
    const color = button.dataset.diaryColor;
    restoreEditorSelection();
    const before = dom.diaryEditor.innerHTML;
    applyDiaryColor(color);
    setSelectedColor(color);
    if (dom.diaryEditor.innerHTML !== before) dom.diaryEditor.dispatchEvent(new Event("input", { bubbles: true }));
    closeColorPopover();
  });
  document.addEventListener("pointerdown", event => {
    if (!colorPopover.hidden && !colorPopover.contains(event.target) && !colorButton.contains(event.target)) closeColorPopover();
  });

  dom.saveButton.addEventListener("click", () => saveCurrentEntry());
  dom.discardButton.addEventListener("click", () => discardCurrentEntry());

  dom.diaryRecentCards.forEach((card) => {
    card.addEventListener("click", () => openHistoricalEntryByDate(card.dataset.date, card));
  });
  const recentDialog = document.querySelector("#diary-recent-dialog");
  const recentEditorElement = recentEditor();
  const recentMoodRow = document.querySelector("#diary-recent-dialog-moods");
  document.querySelectorAll("#home-mood-menu [data-mood]").forEach((source, index) => {
    const button = source.cloneNode(true);
    button.removeAttribute("role");
    button.dataset.moodOrder = String(index);
    button.addEventListener("click", () => {
      if (recentMood === button.dataset.mood) return;
      recentMood = button.dataset.mood;
      recentDirty = true;
      renderRecentMood();
    });
    recentMoodRow.append(button);
  });
  recentEditorElement.addEventListener("input", () => { recentDirty = true; });
  const recentToolbar = recentDialog.querySelector(".diary-recent-toolbar");
  recentEditorElement.addEventListener("keyup", () => syncToolbar(recentEditorElement, recentToolbar));
  recentEditorElement.addEventListener("mouseup", () => syncToolbar(recentEditorElement, recentToolbar));
  recentEditorElement.addEventListener("input", () => syncToolbar(recentEditorElement, recentToolbar));
  const restoreRecentSelection = () => {
    const selection = window.getSelection();
    if (selection?.rangeCount && recentEditorElement.contains(selection.anchorNode) && recentEditorElement.contains(selection.focusNode)) {
      recentEditorElement.focus();
      return;
    }
    recentEditorElement.focus();
    if (recentSelection && recentEditorElement.contains(recentSelection.startContainer) && recentEditorElement.contains(recentSelection.endContainer)) {
      selection.removeAllRanges();
      selection.addRange(recentSelection);
    }
  };
  recentToolbar.querySelector(".diary-font-menu summary").addEventListener("mousedown", event => {
    const selection = window.getSelection();
    if (selection?.rangeCount && recentEditorElement.contains(selection.anchorNode)) recentSelection = selection.getRangeAt(0).cloneRange();
    event.preventDefault();
  });
  recentToolbar.querySelectorAll("[data-diary-font]").forEach(button => {
    button.addEventListener("mousedown", event => event.preventDefault());
    button.addEventListener("click", () => {
      restoreRecentSelection();
      const before = recentEditorElement.innerHTML;
      applyDiaryFont(button.dataset.diaryFont);
      if (before !== recentEditorElement.innerHTML) recentDirty = true;
      button.closest(".diary-font-menu").open = false;
      syncToolbar(recentEditorElement, recentToolbar);
    });
  });
  recentToolbar.querySelector(".diary-format-menu summary").addEventListener("mousedown", event => {
    const selection = window.getSelection();
    if (selection?.rangeCount && recentEditorElement.contains(selection.anchorNode)) recentSelection = selection.getRangeAt(0).cloneRange();
    event.preventDefault();
  });
  recentToolbar.querySelectorAll("[data-recent-command]").forEach(button => {
    button.addEventListener("mousedown", event => {
      const selection = window.getSelection();
      if (selection?.rangeCount && recentEditorElement.contains(selection.anchorNode)) recentSelection = selection.getRangeAt(0).cloneRange();
      event.preventDefault();
    });
    button.addEventListener("click", () => {
      if (button.dataset.recentCommand === "link") {
        chooseAndInsertImage(recentEditorElement, restoreRecentSelection);
        return;
      }
      restoreRecentSelection();
      const before = recentEditorElement.innerHTML;
      applyDiaryCommand(recentEditorElement, button.dataset.recentCommand);
      const menu = button.closest(".diary-format-menu");
      if (menu) {
        menu.querySelector("summary > span").textContent = button.dataset.recentCommand === "p" ? "paragraph" : button.dataset.recentCommand.toUpperCase();
        menu.open = false;
      }
      if (before !== recentEditorElement.innerHTML) recentDirty = true;
      syncToolbar(recentEditorElement, recentToolbar);
    });
  });
  const recentColors = document.querySelector("#diary-recent-color-popover");
  document.querySelectorAll("#diary-color-popover [data-diary-color]").forEach(source => {
    const button = source.cloneNode(true);
    button.addEventListener("mousedown", event => event.preventDefault());
    button.addEventListener("click", () => {
      restoreRecentSelection();
      applyDiaryColor(button.dataset.diaryColor);
      recentDirty = true;
      recentColors.hidden = true;
    });
    recentColors.append(button);
  });
  recentToolbar.querySelector(".diary-recent-color").addEventListener("mousedown", event => {
    const selection = window.getSelection();
    if (selection?.rangeCount && recentEditorElement.contains(selection.anchorNode)) recentSelection = selection.getRangeAt(0).cloneRange();
    event.preventDefault();
  });
  recentToolbar.querySelector(".diary-recent-color").addEventListener("click", () => { recentColors.hidden = !recentColors.hidden; });
  document.querySelector("#diary-recent-expand").addEventListener("click", () => recentDialog.classList.toggle("is-expanded"));
  document.querySelector("#diary-recent-dialog-cancel").addEventListener("click", closeRecentEntry);
  document.querySelector("#diary-recent-dialog-save").addEventListener("click", () => {
    if (!recentDirty || !state.diaryBridge?.saveRecentEntryByDate) return closeRecentEntry();
    const date = recentDialog.dataset.date;
    const saveText = () => state.diaryBridge.saveRecentEntryByDate(date, diaryPayload(recentEditorElement), () => {
      loadRecordedDates();
      closeRecentEntry();
    });
    if (recentMood !== recentSavedMood) {
      state.diaryBridge.saveMoodByDate(date, recentMood, () => {
        state.recordedMoods[date] = recentMood;
        renderMoodDisplays();
        renderCalendar();
        saveText();
      });
    } else saveText();
  });
  const deleteConfirm = document.querySelector("#diary-recent-delete-confirm");
  document.querySelector("#diary-recent-dialog-trash").addEventListener("click", () => {
    deleteConfirm.hidden = false;
    document.querySelector("#diary-recent-delete-cancel").focus();
  });
  document.querySelector("#diary-recent-delete-cancel").addEventListener("click", () => { deleteConfirm.hidden = true; });
  document.querySelector("#diary-recent-delete-approve").addEventListener("click", () => {
    const date = recentDialog.dataset.date;
    state.diaryBridge.saveRecentEntryByDate(date, "", () => {
      deleteConfirm.hidden = true;
      closeRecentEntry();
      loadRecordedDates();
    });
  });
  document.querySelector("#diary-recent-dialog-close").addEventListener("click", closeRecentEntry);
  recentDialog.addEventListener("pointerdown", event => {
    if (event.target === recentDialog) closeRecentEntry();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !deleteConfirm.hidden) deleteConfirm.hidden = true;
    else if (event.key === "Escape" && !recentColors.hidden) recentColors.hidden = true;
    else if (event.key === "Escape" && !recentDialog.hidden) closeRecentEntry();
  });

  dom.previousEntryButton?.addEventListener("click", () => {
    showPage("calendar");
  });

  dom.diaryExpandButton?.addEventListener("click", () => {
    setEditorExpanded(!dom.app?.classList.contains("diary-editor-expanded"));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !colorPopover.hidden) {
      closeColorPopover();
      event.stopPropagation();
      return;
    }
    if (event.key === "Escape" && dom.app?.classList.contains("diary-editor-expanded")) {
      setEditorExpanded(false);
    }
  });

  window.addEventListener("resize", () => {
    // Pixel keyframes describe the old viewport; settle into the fluid CSS.
    if (editorAnimation) editorAnimation.finish();
  });

  dom.diaryToolbarButtons.forEach((button) => {
    button.addEventListener("mousedown", event => {
      if (selectionInEditor()) editorSelection = window.getSelection().getRangeAt(0).cloneRange();
      event.preventDefault();
    });
    button.addEventListener("click", () => {
      if (button.dataset.editorCommand === "link") {
        chooseAndInsertImage(dom.diaryEditor, restoreEditorSelection);
        return;
      }
      applyEditorCommand(button.dataset.editorCommand);
      const menu = button.closest(".diary-format-menu");
      if (menu) {
        menu.querySelector("summary > span").textContent = button.dataset.editorCommand === "p" ? "paragraph" : button.dataset.editorCommand.toUpperCase();
        menu.open = false;
      }
    });
  });

  const mainFontMenu = document.querySelector(".diary-writing-area .diary-font-menu");
  mainFontMenu.querySelector("summary").addEventListener("mousedown", event => {
    if (selectionInEditor()) editorSelection = window.getSelection().getRangeAt(0).cloneRange();
    event.preventDefault();
  });
  mainFontMenu.querySelectorAll("[data-diary-font]").forEach(button => {
    button.addEventListener("mousedown", event => event.preventDefault());
    button.addEventListener("click", () => {
      restoreEditorSelection();
      const before = dom.diaryEditor.innerHTML;
      applyDiaryFont(button.dataset.diaryFont);
      if (before !== dom.diaryEditor.innerHTML) dom.diaryEditor.dispatchEvent(new Event("input", { bubbles: true }));
      mainFontMenu.open = false;
      syncToolbar(dom.diaryEditor, document.querySelector(".diary-writing-area .diary-toolbar"));
    });
  });

  dom.futureOkButton.addEventListener("click", hideFutureDateMessage);
}

function applyEditorCommand(command) {
  if (selectionInEditor()) editorSelection = window.getSelection().getRangeAt(0).cloneRange();
  restoreEditorSelection();
  const before = dom.diaryEditor.innerHTML;
  applyDiaryCommand(dom.diaryEditor, command);
  if (dom.diaryEditor.innerHTML !== before) dom.diaryEditor.dispatchEvent(new Event("input", { bubbles: true }));
  syncToolbar(dom.diaryEditor, document.querySelector(".diary-writing-area .diary-toolbar"));
}
