import { dom } from "../dom.js";
import { state, toDateText } from "../state.js";
import { moodColors } from "../mood-palette.js";
import { showPage } from "../navigation.js";
import { renderCalendar } from "./calendar.js";
import { renderMoodDisplays } from "./home.js";
import { DIARY_COLORS, DIARY_FONTS, allowedDiaryColor, diaryPayload, diaryPlainText, countDiaryWords, showDiaryContent, updateDiaryPlaceholder, applyDiaryCommand, applyDiaryColor, applyDiaryFont, insertDiaryImage } from "./diary-rich-text.js";
import { bindDiaryAddEntry } from "./diary-add-entry.js";

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
  for (const id of ["#diary-visual-save", "#diary-visual-cancel"]) {
    const button = document.querySelector(id);
    if (button) button.hidden = !editing;
  }
}

function leaveMainEditingIfOutside(target) {
  if (dom.diaryMainActions?.hidden) return;
  if (dom.diaryEditor.contains(target) || target?.closest?.(".diary-writing-area .diary-toolbar, .diary-focus-control, #diary-color-popover, #diary-main-actions")) return;
  setMainEditing(false);
  if (!state.hasUnsavedChanges) setStatus(mainSavedStatus);
}

function updateWordCount() {
  const count = countDiaryWords(diaryPlainText(dom.diaryEditor));
  const label = `${count} ${count === 1 ? "word" : "words"}`;
  if (dom.diaryWordCount) dom.diaryWordCount.textContent = label;
  const toolbarCount = document.querySelector("#diary-toolbar-count");
  if (toolbarCount) toolbarCount.textContent = label;
}

let timelineOffset = 0;
let timelineRequestId = 0;
let suppressTimelineClick = false;
const timelinePreviewCache = new Map();
const timelinePreviewPending = new Map();
function timelineDateAt(index) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + index - 3 + timelineOffset);
  return date;
}
function centerTimelineOn(dateText) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  timelineOffset = Math.round((new Date(`${dateText}T00:00:00`) - today) / 86400000);
}
function timelineStep() {
  const tiles = document.querySelectorAll("#diary-timeline-days .diary-timeline-day");
  return tiles.length > 1 ? tiles[1].getBoundingClientRect().left - tiles[0].getBoundingClientRect().left : 120;
}
function renderDiaryTimeline() {
  const strip = document.querySelector("#diary-timeline-days");
  if (!strip) return;
  strip.replaceChildren();
  const track = document.querySelector(".diary-timeline-track");
  track?.replaceChildren();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let index = 0; index < 7; index += 1) {
    const date = timelineDateAt(index);
    const dateText = toDateText(date);
    const isSelected = index === 3;
    const isCommitted = dateText === toDateText(state.currentDate);
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "diary-timeline-day";
    tile.dataset.date = dateText;
    if (isSelected) tile.classList.add("is-selected");
    if (isSelected && !isCommitted) tile.classList.add("is-preview");
    if (dateText > toDateText(today)) tile.classList.add("is-future");
    tile.setAttribute("aria-label", date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }));
    tile.setAttribute("aria-pressed", String(isSelected && isCommitted));
    tile.addEventListener("click", () => {
      if (suppressTimelineClick) return;
      if (dateText > toDateText(new Date())) return showFutureDateMessage();
      openTimelineDate(dateText);
    });
    const weekday = document.createElement("span");
    weekday.className = "diary-timeline-weekday";
    weekday.textContent = date.toLocaleDateString("en-US", { weekday: "short" });
    const day = document.createElement("strong");
    day.textContent = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const preview = document.createElement("span");
    preview.className = "diary-timeline-preview";
    preview.textContent = dateText > toDateText(today) ? "" : "+ New entry";
    const dot = document.createElement("i");
    dot.className = "diary-timeline-dot";
    tile.append(weekday, day, preview, dot);
    strip.append(tile);
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "diary-timeline-marker";
    marker.dataset.date = dateText;
    marker.setAttribute("aria-label", `Open diary for ${tile.getAttribute("aria-label")}`);
    if (isSelected) marker.classList.add("is-selected");
    if (dateText > toDateText(today)) marker.disabled = true;
    marker.addEventListener("click", () => {
      if (!suppressTimelineClick) openTimelineDate(dateText);
    });
    track?.append(marker);
    if (dateText === toDateText(state.currentDate)) {
      const text = diaryPlainText(dom.diaryEditor).trim();
      if (text) preview.textContent = text;
    } else if (dateText <= toDateText(today) && state.diaryBridge?.peekEntryByDate) {
      if (timelinePreviewCache.has(dateText)) {
        preview.textContent = timelinePreviewCache.get(dateText) || "+ New entry";
      } else if (timelinePreviewPending.has(dateText)) {
        timelinePreviewPending.get(dateText).push(preview);
      } else {
        timelinePreviewPending.set(dateText, [preview]);
        state.diaryBridge.peekEntryByDate(dateText, entry => {
          const text = String(entry?.text || "").trim();
          timelinePreviewCache.set(dateText, text);
          for (const pendingPreview of timelinePreviewPending.get(dateText) || []) {
            if (pendingPreview.isConnected) pendingPreview.textContent = text || "+ New entry";
          }
          timelinePreviewPending.delete(dateText);
        });
      }
    }
    const mood = state.recordedMoods?.[dateText];
    if (mood) {
      const color = moodColors[mood] || "#bfbfbf";
      tile.style.setProperty("--timeline-dot", color);
      marker.style.setProperty("--timeline-dot", color);
    }
  }
}

function bindTimelineDragging() {
  const strip = document.querySelector("#diary-timeline-days");
  const track = document.querySelector(".diary-timeline-track");
  if (!strip || !track) return;
  let cardDrag = null;
  strip.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    cardDrag = { id: event.pointerId, x: event.clientX, moved: false };
  });
  strip.addEventListener("pointermove", event => {
    if (!cardDrag || event.pointerId !== cardDrag.id) return;
    let dx = event.clientX - cardDrag.x;
    if (Math.abs(dx) > 5 && !cardDrag.moved) {
      cardDrag.moved = true;
      strip.setPointerCapture(event.pointerId);
    }
    if (!cardDrag.moved) return;
    const step = timelineStep();
    const passed = Math.round(dx / step);
    if (passed) {
      timelineOffset -= passed;
      cardDrag.x += passed * step;
      renderDiaryTimeline();
      dx = event.clientX - cardDrag.x;
    }
    strip.classList.add("is-dragging");
    for (const tile of strip.children) tile.style.transform = `translateX(${dx}px)`;
  });
  const finishCards = event => {
    if (!cardDrag || event.pointerId !== cardDrag.id) return;
    const dx = event.clientX - cardDrag.x;
    if (cardDrag.moved) {
      suppressTimelineClick = true;
      timelineOffset -= Math.round(dx / timelineStep());
      renderDiaryTimeline();
      const date = toDateText(timelineDateAt(3));
      if (date <= toDateText(new Date())) openTimelineDate(date);
      else showFutureDateMessage();
      setTimeout(() => { suppressTimelineClick = false; }, 0);
    }
    strip.classList.remove("is-dragging");
    cardDrag = null;
  };
  strip.addEventListener("pointerup", finishCards);
  strip.addEventListener("pointercancel", finishCards);

  let handleDrag = null;
  let edgeTimer = null;
  track.addEventListener("pointerdown", event => {
    if (event.button !== 0 || !event.target.closest(".diary-timeline-marker.is-selected")) return;
    handleDrag = { id: event.pointerId, x: event.clientX, moved: false };
  });
  track.addEventListener("pointermove", event => {
    if (!handleDrag || event.pointerId !== handleDrag.id) return;
    if (Math.abs(event.clientX - handleDrag.x) > 5 && !handleDrag.moved) {
      handleDrag.moved = true;
      track.setPointerCapture(event.pointerId);
    }
    if (!handleDrag.moved) return;
    let dx = event.clientX - handleDrag.x;
    const step = timelineStep();
    const passed = Math.round(dx / step);
    if (passed) {
      timelineOffset -= passed;
      handleDrag.x += passed * step;
      renderDiaryTimeline();
      dx = event.clientX - handleDrag.x;
    }
    track.classList.add("is-dragging");
    for (const tile of strip.children) tile.style.transform = `translateX(${dx}px)`;
    const bounds = track.getBoundingClientRect();
    const direction = event.clientX < bounds.left + 40 ? -1 : event.clientX > bounds.right - 40 ? 1 : 0;
    clearInterval(edgeTimer);
    edgeTimer = null;
    if (direction) {
      edgeTimer = setInterval(() => {
        timelineOffset += direction * 7;
        renderDiaryTimeline();
      }, 230);
    }
  });
  const finishHandle = event => {
    if (!handleDrag || event.pointerId !== handleDrag.id) return;
    clearInterval(edgeTimer);
    edgeTimer = null;
    if (handleDrag.moved) {
      suppressTimelineClick = true;
      timelineOffset -= Math.round((event.clientX - handleDrag.x) / timelineStep());
      renderDiaryTimeline();
      const date = toDateText(timelineDateAt(3));
      if (date <= toDateText(new Date())) openTimelineDate(date);
      else showFutureDateMessage();
      setTimeout(() => { suppressTimelineClick = false; }, 0);
    }
    track.classList.remove("is-dragging");
    handleDrag = null;
  };
  track.addEventListener("pointerup", finishHandle);
  track.addEventListener("pointercancel", finishHandle);
}

function openTimelineDate(dateText) {
  if (!state.diaryBridge?.loadEntryByDate || dateText > toDateText(new Date())) return;
  if (dateText === toDateText(state.currentDate)) {
    centerTimelineOn(dateText);
    renderDiaryTimeline();
    return showPage("diary");
  }
  const request = ++timelineRequestId;
  const load = () => state.diaryBridge.loadEntryByDate(dateText, entry => {
    if (request !== timelineRequestId || entry?.date !== dateText) return;
    centerTimelineOn(dateText);
    showEntry(entry);
    showPage("diary");
  });
  if (state.hasUnsavedChanges) saveCurrentEntry(() => {
    if (request === timelineRequestId) load();
  });
  else load();
}

function formatDiaryDate(date) {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

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
  toolbar.querySelectorAll("[data-editor-command]").forEach(button => {
    const command = button.dataset.editorCommand;
    if (commandMap[command]) button.setAttribute("aria-pressed", String(document.queryCommandState(commandMap[command])));
    if (command === "undo" || command === "redo") button.disabled = !document.queryCommandEnabled(command);
  });
  const block = String(document.queryCommandValue("formatBlock") || "p").replace(/[<>]/g, "").toLowerCase();
  toolbar.querySelector(".diary-format-menu summary > span").textContent = ["h1", "h2", "h3"].includes(block) ? block.toUpperCase() : "paragraph";
  toolbar.querySelectorAll(".diary-format-options button").forEach(button => {
    const command = button.dataset.editorCommand;
    button.setAttribute("aria-pressed", String(command === (["h1", "h2", "h3"].includes(block) ? block : "p")));
  });
  toolbar.querySelector(".diary-heading-menu summary")?.setAttribute("aria-pressed", String(["h1", "h2", "h3"].includes(block)));
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

function closeColorPopover(keepSelected = false) {
  const popover = document.querySelector("#diary-color-popover");
  popover.hidden = true;
  const button = document.querySelector(".diary-color-button");
  button.setAttribute("aria-expanded", "false");
  if (!keepSelected) button.setAttribute("aria-pressed", "false");
}

function setSelectedColor(color) {
  currentDiaryColor = color;
  for (const button of document.querySelectorAll("#diary-color-popover [data-diary-color]")) {
    button.setAttribute("aria-pressed", String(button.dataset.diaryColor === color));
  }
  document.querySelector(".diary-color-button .diary-color-icon").style.color = color;
}

function toggleColorPopover() {
  const popover = document.querySelector("#diary-color-popover");
  const button = document.querySelector(".diary-color-button");
  if (button.getAttribute("aria-pressed") === "true") return closeColorPopover();
  if (selectionInEditor()) {
    const range = window.getSelection().getRangeAt(0);
    editorSelection = range.cloneRange();
    if (!range.collapsed) {
      const element = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
      const color = allowedDiaryColor(getComputedStyle(element).color);
      if (color) setSelectedColor(color);
    }
  }
  const anchor = button.getBoundingClientRect();
  popover.hidden = false;
  const bounds = popover.getBoundingClientRect();
  const gap = 10;
  const roomBelow = innerHeight - anchor.bottom - gap;
  const top = roomBelow >= bounds.height || roomBelow >= anchor.top - gap
    ? anchor.bottom + gap
    : anchor.top - bounds.height - gap;
  popover.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - bounds.width - 8))}px`;
  popover.style.top = `${Math.max(8, Math.min(top, innerHeight - bounds.height - 8))}px`;
  button.setAttribute("aria-expanded", "true");
  button.setAttribute("aria-pressed", "true");
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

function createSavedChatArticle(snippet) {
  const article = document.createElement("article");
  const role = document.createElement("small");
  role.className = "chat-snippet-role";
  role.textContent = snippet.role === "user" ? "You" : "Companion";
  const content = document.createElement("p");
  content.textContent = snippet.content;
  const time = document.createElement("time");
  time.dateTime = snippet.created_at;
  time.textContent = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(snippet.created_at)).replace(/\s/g, "");
  article.append(role, content, time);
  return article;
}


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
    items.replaceChildren(...result.data.map(createSavedChatArticle));
    section.hidden = result.data.length === 0;
  });
}

function showEntry(entry) {
  resetMainSave();
  state.currentDate = new Date(`${entry.date}T00:00:00`);
  dom.diaryTitle.textContent = formatDiaryDate(state.currentDate);
  if (dom.diaryYear) dom.diaryYear.textContent = state.currentDate.getFullYear();
  const entryTime = document.querySelector("#diary-entry-time");
  if (entryTime) {
    const updated = entry.updated_at ? new Date(entry.updated_at) : new Date();
    const [hour, minute] = (entry.entry_time || "").split(":").map(Number);
    const chosenTime = entry.entry_time && Number.isInteger(hour) && Number.isInteger(minute) ? new Date(2000, 0, 1, hour, minute) : null;
    const displayTime = chosenTime || updated;
    const time = Number.isNaN(displayTime.getTime()) ? "" : ` · ${displayTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    entryTime.textContent = `${state.currentDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}${time}`;
  }
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
  renderDiaryTimeline();
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
    timelinePreviewCache.clear();
    renderCalendar();
    renderDiaryTimeline();
  });
}

export function discardCurrentEntry(callback) {
  if (!state.diaryBridge?.loadEntryByDate) return;
  resetMainSave();
  state.diaryBridge.loadEntryByDate(toDateText(state.currentDate), (entry) => {
    showEntry(entry);
    if (callback) callback();
  });
}

export function requestOpenDate(dateText, trigger) {
  const today = toDateText(new Date());
  if (dateText > today) return;
  if (dateText === today) {
    openTimelineDate(dateText);
    return;
  }
  if (state.recordedDates.has(dateText) || state.savedChatDates.has(dateText)) {
    centerTimelineOn(dateText);
    openTimelineDate(dateText);
  }
}

/** Register Diary editor and Add Entry interactions. */
export function bindDiaryEvents() {
  if (!dom.diaryEditor) return;
  window.addEventListener("calendar:diary-entry-changed", event => {
    const date = event.detail?.date;
    if (!date || date !== toDateText(state.currentDate) || state.hasUnsavedChanges) return;
    if (event.detail.entry?.date === date) { showEntry(event.detail.entry); return; }
    state.diaryBridge?.peekEntryByDate?.(date, entry => {
      if (entry?.date === date && date === toDateText(state.currentDate) && !state.hasUnsavedChanges) showEntry(entry);
    });
  });
  renderDiaryTimeline();
  bindTimelineDragging();
  bindDiaryAddEntry({ afterSave: (date, entry) => {
    centerTimelineOn(date);
    showEntry(entry);
    loadRecordedDates();
  } });
  document.querySelector("#diary-header-today")?.addEventListener("click", () => {
    const today = toDateText(new Date());
    centerTimelineOn(today);
    renderDiaryTimeline();
    requestOpenDate(today);
  });
  const initialTime = document.querySelector("#diary-entry-time");
  if (initialTime && !initialTime.textContent) initialTime.textContent = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  document.querySelector("#diary-timeline-prev")?.addEventListener("click", () => { timelineOffset -= 7; renderDiaryTimeline(); });
  document.querySelector("#diary-timeline-next")?.addEventListener("click", () => { timelineOffset += 7; renderDiaryTimeline(); });
  document.querySelector(".diary-focus-control")?.addEventListener("click", event => {
    const button = event.currentTarget;
    const collapsed = document.querySelector(".diary-page")?.classList.toggle("is-timeline-collapsed");
    document.querySelector("#diary-timeline").inert = collapsed;
    button.setAttribute("aria-expanded", String(!collapsed));
    button.setAttribute("aria-label", collapsed ? "Show timeline" : "Hide timeline");
  });
  document.querySelector("#diary-visual-save")?.addEventListener("click", () => dom.saveButton.click());
  document.querySelector("#diary-visual-cancel")?.addEventListener("click", () => dom.discardButton.click());
  const moreMenu = document.querySelector(".diary-more-menu");
  const moreButton = moreMenu.querySelector(".diary-more-button");
  const moreOptions = moreMenu.querySelector(".diary-more-options");
  const closeMore = () => { moreOptions.hidden = true; moreButton.setAttribute("aria-expanded", "false"); };
  moreButton.addEventListener("click", () => {
    moreOptions.hidden = !moreOptions.hidden;
    moreButton.setAttribute("aria-expanded", String(!moreOptions.hidden));
  });
  document.addEventListener("pointerdown", event => { if (!moreMenu.contains(event.target)) closeMore(); });
  moreOptions.addEventListener("click", async event => {
    const action = event.target.closest("[data-diary-action]")?.dataset.diaryAction;
    if (!action) return;
    closeMore();
    if (action === "edit") { dom.diaryEditor.focus(); return; }
    if (action === "title") {
      dom.diaryEditor.focus();
      const first = dom.diaryEditor.firstChild;
      if (!first || !dom.diaryEditor.textContent.trim()) return;
      const range = document.createRange(); range.setStart(first, 0); range.collapse(true);
      const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
      editorSelection = range.cloneRange();
      applyEditorCommand("h1");
      return;
    }
    if (action === "share") {
      const text = diaryPlainText(dom.diaryEditor).trim();
      if (!text) return;
      try {
        if (navigator.share) await navigator.share({ text });
        else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); window.alert("Diary text copied to clipboard."); }
        else {
          const copy = document.createElement("textarea"); copy.value = text; copy.style.position = "fixed"; copy.style.opacity = "0";
          document.body.append(copy); copy.select();
          const copied = document.execCommand("copy"); copy.remove();
          if (!copied) throw new Error("Copy failed");
          window.alert("Diary text copied to clipboard.");
        }
      } catch (error) { if (error.name !== "AbortError") window.alert("Could not share this entry."); }
      return;
    }
    if (action === "delete" && window.confirm("Delete this diary entry? This cannot be undone.")) {
      const date = toDateText(state.currentDate);
      state.diaryBridge?.deleteEntryByDate?.(date, result => {
        if (!result?.ok) { window.alert("Could not delete this entry."); return; }
        resetMainSave();
        state.recordedDates.delete(date);
        state.diaryBridge.loadEntryByDate(date, entry => { showEntry(entry); loadRecordedDates(); });
      });
    }
  });
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
  document.body.append(colorPopover);
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
    closeColorPopover(true);
  });
  document.addEventListener("pointerdown", event => {
    if (!colorPopover.hidden && !colorPopover.contains(event.target) && !colorButton.contains(event.target)) closeColorPopover();
  });

  dom.saveButton.addEventListener("click", () => saveCurrentEntry());
  dom.discardButton.addEventListener("click", () => discardCurrentEntry());


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
      const menu = button.closest(".diary-format-menu, .diary-heading-menu");
      if (menu) {
        const label = menu.querySelector("summary > span");
        if (label) label.textContent = button.dataset.editorCommand === "p" ? "paragraph" : button.dataset.editorCommand.toUpperCase();
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
