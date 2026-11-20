import { dom } from "../dom.js";
import { calendarMoodColors, moodColors, isFutureDate, state, toDateText } from "../state.js";
import { moodBackground, moodPalette } from "../mood-palette.js";
import { RICH_TEXT_PREFIX, DIARY_COLORS, applyDiaryColor, applyDiaryCommand, cleanDiaryHtml, countDiaryWords } from "./diary-rich-text.js";

let onDateRequested = null;
let selectedDate = toDateText(new Date());
const moods = ["Stress", "Steady", "Low", "Light", "Grateful", "Anxious", "Inspired"];
const svgBase = () => document.body.dataset.svgBase || "./assets/";
let recapDates = [];
let recapIndex = 0;
let recapRequest = 0;
let recapMoving = false;
let recapNoteValue = "";
let recapNoteEditing = false;
let detailRequest = 0;
let detailDate = "";
let detailSnapshot = { title: "", body: "" };
let detailEditing = false;
let moodMenu = null;
let moodMenuTrigger = null;

function closeMoodMenu() {
  if (moodMenu) moodMenu.hidden = true;
  moodMenuTrigger?.setAttribute("aria-expanded", "false");
  moodMenuTrigger = null;
}

function showMoodMenu(trigger) {
  if (moodMenuTrigger === trigger) { closeMoodMenu(); return; }
  closeMoodMenu();
  moodMenuTrigger = trigger;
  trigger.setAttribute("aria-expanded", "true");
  const current = state.recordedMoods[trigger.id === "calendar-detail-mood" ? detailDate : selectedDate];
  moodMenu.querySelectorAll("[data-mood]").forEach(button => button.setAttribute("aria-checked", String(button.dataset.mood === current)));
  moodMenu.hidden = false;
  const rect = trigger.getBoundingClientRect();
  moodMenu.style.left = `${Math.min(rect.left, window.innerWidth - moodMenu.offsetWidth - 8)}px`;
  moodMenu.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - moodMenu.offsetHeight - 8)}px`;
}

function updateDetailMood() {
  const mood = state.recordedMoods[detailDate];
  const moodRow = document.querySelector("#calendar-detail-mood");
  moodRow.style.setProperty("--detail-mood-color", moodColors[mood] || "#727272");
  moodRow.style.setProperty("--detail-mood-bg", moodBackground(mood) || "#f2f2f7");
  moodRow.style.setProperty("--detail-mood-icon", moodPalette[mood] ? `url("${svgBase()}moodcard/${moodPalette[mood].svg}")` : "none");
  document.querySelector("#calendar-detail-mood-name").textContent = mood || "Not set";
}

function detailFields() {
  return { title: document.querySelector("#calendar-detail-title"), body: document.querySelector("#calendar-detail-body") };
}

function updateDetailCount() {
  const { title, body } = detailFields();
  const count = countDiaryWords(`${title.textContent}\n${body.innerText}`);
  document.querySelector("#calendar-detail-count").textContent = `${count} ${count === 1 ? "word" : "words"}`;
}

function setDetailEditing(editing) {
  detailEditing = editing;
  document.querySelector("#calendar-detail-page").classList.toggle("is-editing", editing);
  const { title, body } = detailFields();
  title.contentEditable = String(editing);
  body.contentEditable = String(editing);
  document.querySelector("#calendar-detail-save").hidden = !editing;
  document.querySelector("#calendar-detail-cancel").hidden = !editing;
}

function closeDiaryDetail() {
  ++detailRequest;
  setDetailEditing(false);
  document.querySelector("#calendar-detail-menu").hidden = true;
  document.querySelector("#calendar-detail-colors").hidden = true;
  document.querySelector("#calendar-detail-page").hidden = true;
  document.querySelector("#calendar").classList.remove("is-detail");
}

function showDetailEntry(entry) {
  const { title, body } = detailFields();
  const container = document.createElement("div");
  container.innerHTML = cleanDiaryHtml(entry?.html);
  const first = container.firstElementChild;
  const heading = first?.matches("h1,h2,h3") ? first : null;
  title.textContent = heading?.textContent.trim() || "";
  heading?.remove();
  if (container.innerHTML.trim()) body.innerHTML = container.innerHTML;
  else body.textContent = heading ? "" : String(entry?.text || "");
  detailSnapshot = { title: title.textContent, body: body.innerHTML };
  setDetailEditing(false);
  updateDetailCount();
}

function openDiaryDetail() {
  detailDate = selectedDate;
  const date = new Date(`${detailDate}T12:00:00`);
  document.querySelector("#calendar-detail-date").textContent = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(date);
  document.querySelector("#calendar-detail-year").textContent = String(date.getFullYear());
  updateDetailMood();
  showDetailEntry(null);
  document.querySelector("#calendar-detail-page").hidden = false;
  document.querySelector("#calendar").classList.add("is-detail");
  document.querySelector("#calendar").scrollTop = 0;
  const request = ++detailRequest;
  if (!isFutureDate(detailDate)) state.diaryBridge?.peekEntryByDate?.(detailDate, entry => {
    if (request === detailRequest) showDetailEntry(entry);
  });
}

function saveDiaryDetail() {
  if (!detailEditing || !state.diaryBridge?.saveEntryByDate) return;
  const { title, body } = detailFields();
  const savingDate = detailDate;
  const heading = document.createElement("h1");
  heading.textContent = title.textContent.trim();
  const bodyHtml = cleanDiaryHtml(body.innerHTML);
  const plainText = [heading.textContent, body.innerText].filter(Boolean).join("\n");
  const payload = RICH_TEXT_PREFIX + JSON.stringify({
    text: plainText,
    html: `${heading.textContent ? heading.outerHTML : ""}${bodyHtml}`,
  });
  document.querySelector("#calendar-detail-save").disabled = true;
  state.diaryBridge.saveEntryByDate(savingDate, payload, result => {
    document.querySelector("#calendar-detail-save").disabled = false;
    if (!result || result.ok === false || result.date !== savingDate) { window.alert("Could not save this entry."); return; }
    if (plainText.trim()) state.recordedDates.add(savingDate);
    else state.recordedDates.delete(savingDate);
    if (savingDate === detailDate && !document.querySelector("#calendar-detail-page").hidden) showDetailEntry({ html: `${heading.textContent ? heading.outerHTML : ""}${bodyHtml}`, text: plainText });
    window.dispatchEvent(new CustomEvent("calendar:diary-entry-changed", { detail: { date: savingDate, entry: result } }));
    renderCalendar();
  });
}

async function moveRecap(direction, fromX = 0) {
  const next = recapIndex + direction;
  const card = document.querySelector(".calendar-recap-card");
  if (recapMoving) return;
  if (next < 0 || next >= recapDates.length) {
    card.animate?.([{ transform: `translateX(${fromX}px)` }, { transform: "translateX(0)" }], { duration: 180, easing: "ease-out" });
    card.style.transform = "";
    return;
  }
  recapMoving = true;
  ++recapRequest;
  const distance = direction > 0 ? -340 : 340;
  if (card.animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    await card.animate([{ transform: `translateX(${fromX}px)`, opacity: 1 }, { transform: `translateX(${distance}px)`, opacity: 0 }], { duration: 180, easing: "ease-in", fill: "forwards" }).finished;
  }
  card.style.transform = "";
  if (document.querySelector("#calendar-recap-backdrop").hidden) { card.getAnimations().forEach(animation => animation.cancel()); recapMoving = false; return; }
  recapIndex = next;
  renderRecap();
  card.getAnimations().forEach(animation => animation.cancel());
  if (card.animate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    await card.animate([{ transform: `translateX(${-distance}px)`, opacity: 0 }, { transform: "translateX(0)", opacity: 1 }], { duration: 220, easing: "cubic-bezier(.22,1,.36,1)" }).finished;
  }
  recapMoving = false;
}

function setRecapNoteEditing(editing) {
  recapNoteEditing = editing;
  const card = document.querySelector("#calendar-recap-note-card");
  const input = document.querySelector("#calendar-recap-note-input");
  card.classList.toggle("is-editing", editing);
  document.querySelector("#calendar-recap-note").hidden = editing;
  input.hidden = !editing;
  card.querySelector(".calendar-recap-note-actions").hidden = !editing;
  if (editing) { input.value = recapNoteValue; input.focus(); input.select(); }
}

function renderRecap() {
  const dateText = recapDates[recapIndex];
  if (!dateText) return;
  setRecapNoteEditing(false);
  recapNoteValue = "";
  const date = new Date(`${dateText}T12:00:00`);
  document.querySelector("#calendar-recap-date").textContent = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
  const mood = state.recordedMoods[dateText];
  const moodRow = document.querySelector("#calendar-recap-mood");
  moodRow.hidden = !mood;
  moodRow.style.setProperty("--recap-mood-color", moodColors[mood] || "#727272");
  moodRow.style.setProperty("--recap-mood-bg", moodBackground(mood) || "#f2f2f7");
  moodRow.style.setProperty("--recap-mood-icon", moodPalette[mood] ? `url("${svgBase()}moodcard/${moodPalette[mood].svg}")` : "none");
  document.querySelector("#calendar-recap-mood-name").textContent = mood || "";
  document.querySelector("#calendar-recap-prev").disabled = recapIndex === 0;
  document.querySelector("#calendar-recap-next").disabled = recapIndex === recapDates.length - 1;
  const dots = document.querySelector("#calendar-recap-dots");
  dots.replaceChildren();
  for (let offset = -1; offset <= 1; offset++) {
    const dot = document.createElement("span");
    dot.className = `calendar-recap-dot${offset === 0 ? " is-current" : ""}`;
    dot.style.visibility = recapDates[recapIndex + offset] ? "visible" : "hidden";
    dots.append(dot);
  }
  const note = document.querySelector("#calendar-recap-note");
  note.textContent = "";
  const request = ++recapRequest;
  state.diaryBridge?.getMoodNoteByDate?.(dateText, value => {
    if (request !== recapRequest || document.querySelector("#calendar-recap-backdrop").hidden) return;
    recapNoteValue = String(value || "");
    if (!recapNoteEditing) note.textContent = recapNoteValue || "No note for this day";
  });
}

function openRecap() {
  if (isFutureDate(selectedDate)) return;
  const backdrop = document.querySelector("#calendar-recap-backdrop");
  const show = dates => {
    recapDates = [...new Set([...(Array.isArray(dates) ? dates : []), selectedDate])].filter(date => date <= toDateText(new Date())).sort();
    recapIndex = recapDates.indexOf(selectedDate);
    backdrop.hidden = false;
    renderRecap();
    document.querySelector("#calendar-recap-next").focus();
  };
  if (state.diaryBridge?.getMoodNoteDates) state.diaryBridge.getMoodNoteDates(show);
  else show([selectedDate]);
}

function renderSelectedDay() {
  const date = new Date(`${selectedDate}T12:00:00`);
  const mood = state.recordedMoods[selectedDate];
  const label = document.querySelector("#calendar-selected-label");
  if (label) label.textContent = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(date);
  const moodRow = document.querySelector("#calendar-selected-mood");
  const moodName = document.querySelector("#calendar-selected-mood-name");
  const moodIcon = moodRow?.querySelector(".calendar-side-mood-icon");
  if (moodName) moodName.textContent = mood || "Not set";
  moodRow?.style.setProperty("--selected-mood-color", moodColors[mood] || "#727272");
  if (moodIcon) {
    moodIcon.style.setProperty("--selected-mood-bg", moodBackground(mood) || "#f2f2f7");
    moodIcon.style.setProperty("--selected-mood-icon", moodPalette[mood] ? `url("${svgBase()}moodcard/${moodPalette[mood].svg}")` : "none");
  }
  const note = document.querySelector("#calendar-selected-note");
  if (note) { note.textContent = ""; note.hidden = true; }
  if (!isFutureDate(selectedDate)) state.diaryBridge?.getMoodNoteByDate?.(selectedDate, value => {
    if (!note || selectedDate !== toDateText(date)) return;
    note.textContent = String(value || "").trim();
    note.hidden = !note.textContent;
  });
  const preview = document.querySelector("#calendar-diary-preview");
  const showEmptyDiary = () => {
    if (!preview) return;
    preview.textContent = "No entries for this day";
    preview.classList.add("is-empty");
  };
  showEmptyDiary();
  if (!isFutureDate(selectedDate)) state.diaryBridge?.peekEntryByDate?.(selectedDate, entry => {
    if (!preview || selectedDate !== toDateText(date)) return;
    preview.replaceChildren();
    const content = document.createElement("div");
    content.innerHTML = String(entry?.html || "");
    const firstBlock = content.firstElementChild;
    const titleText = firstBlock?.matches("h1,h2,h3") ? firstBlock.textContent.trim() : "";
    if (titleText) firstBlock.remove();
    const summaryText = titleText ? content.textContent.trim() : String(entry?.text || "").trim();
    if (!titleText && !summaryText) { showEmptyDiary(); return; }
    preview.classList.remove("is-empty");
    if (titleText) { const title = document.createElement("strong"); title.textContent = titleText; preview.append(title); }
    if (summaryText) { const summary = document.createElement("span"); summary.className = "calendar-diary-summary"; summary.textContent = summaryText; preview.append(summary); }
  });
  document.querySelector("#calendar-add-entry")?.toggleAttribute("disabled", isFutureDate(selectedDate) || state.recordedDates.has(selectedDate));
  for (const id of ["calendar-edit-entry", "calendar-view-diary"]) document.querySelector(`#${id}`)?.toggleAttribute("disabled", isFutureDate(selectedDate) || !state.recordedDates.has(selectedDate));
}

function renderOverview(year, month, daysInMonth) {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
  const count = [...state.recordedDates].filter(date => date.startsWith(prefix)).length;
  document.querySelector("#calendar-entry-count").textContent = String(count);
  document.querySelector("#calendar-recorded-days").textContent = String(count);
  const counts = Object.fromEntries(moods.map(mood => [mood, 0]));
  for (const [date, mood] of Object.entries(state.recordedMoods)) if (date.startsWith(prefix) && mood in counts) counts[mood]++;
  const bar = document.querySelector("#calendar-mood-bar");
  const breakdown = document.querySelector("#calendar-mood-breakdown");
  bar.replaceChildren(); breakdown.replaceChildren();
  const recordedMoods = moods.filter(mood => counts[mood]).sort((a, b) => counts[b] - counts[a]);
  for (const mood of recordedMoods) {
    const percentage = counts[mood] / daysInMonth * 100;
    const segment = document.createElement("span"); segment.style.width = `${percentage}%`; segment.style.background = moodColors[mood]; bar.append(segment);
    const item = document.createElement("span"); item.style.setProperty("--mood-color", moodColors[mood]);
    const dot = document.createElement("i");
    item.title = mood;
    item.setAttribute("aria-label", `${mood} ${Math.round(percentage)}%`);
    item.append(dot, document.createTextNode(`${Math.round(percentage)}%`));
    breakdown.append(item);
  }
}

export function renderCalendar() {
  if (!dom.calendarGrid || !dom.calendarTitle) return;
  const year = state.visibleMonth.getFullYear(), month = state.visibleMonth.getMonth();
  dom.calendarTitle.textContent = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(year, month, 1));
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = new Date(year, month, 1).getDay();
  const cellCount = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  dom.calendarGrid.style.setProperty("--calendar-weeks", cellCount / 7);
  dom.calendarGrid.setAttribute("aria-label", dom.calendarTitle.textContent);
  dom.calendarGrid.replaceChildren();
  for (let index = 0; index < cellCount; index++) {
    const day = index - startOffset + 1;
    const dateText = toDateText(new Date(year, month, day));
    const inMonth = day >= 1 && day <= daysInMonth;
    const button = document.createElement("button"); button.type = "button"; button.className = "calendar-day";
    button.dataset.date = dateText;
    const number = document.createElement("span"); number.className = "calendar-day-number"; number.textContent = String(new Date(year, month, day).getDate()); button.append(number);
    if (!inMonth) button.classList.add("outside");
    if (dateText === selectedDate) button.classList.add("selected");
    if (dateText === toDateText(new Date())) button.classList.add("today");
    const mood = state.recordedMoods[dateText];
    const hasDiary = state.recordedDates.has(dateText);
    if (hasDiary || (mood && calendarMoodColors[mood])) {
      const markers = document.createElement("span");
      markers.className = "calendar-day-markers";
      if (hasDiary) {
        const diaryMarker = document.createElement("span");
        diaryMarker.className = "calendar-diary-marker";
        diaryMarker.setAttribute("aria-label", "Diary entry");
        markers.append(diaryMarker);
      }
      if (mood && calendarMoodColors[mood]) {
        button.style.setProperty("--mood-color", calendarMoodColors[mood]);
        const moodMarker = document.createElement("span");
        moodMarker.className = "calendar-day-marker";
        markers.append(moodMarker);
      }
      button.append(markers);
    }
    if (state.savedChatDates.has(dateText)) {
      const marker = document.createElement("img"); marker.className = "calendar-chat-marker"; marker.src = `${svgBase()}chat/bookmark.svg`; marker.alt = "Saved Chat"; button.append(marker);
    }
    if (isFutureDate(dateText)) { button.classList.add("future"); button.disabled = true; }
    else button.addEventListener("click", () => {
      selectedDate = dateText;
      if (!inMonth) state.visibleMonth = new Date(year, month, day);
      renderCalendar();
    });
    dom.calendarGrid.append(button);
    if (!isFutureDate(dateText)) state.diaryBridge?.getMoodNoteByDate?.(dateText, note => {
      if (!button.isConnected || !String(note || "").trim()) return;
      const preview = document.createElement("span"); preview.className = "calendar-day-preview"; preview.textContent = String(note).trim(); button.insertBefore(preview, button.querySelector(".calendar-day-markers, .calendar-chat-marker"));
    });
  }
  renderSelectedDay(); renderOverview(year, month, daysInMonth);
  if (detailDate && !document.querySelector("#calendar-detail-page").hidden) updateDetailMood();
}

export function loadSavedChatDates() {
  if (!state.diaryBridge?.getSavedChatDates) return;
  state.diaryBridge.getSavedChatDates(result => {
    if (!result?.ok) return;
    state.savedChatDates = new Set(result.data || []);
    renderCalendar();
  });
}

export function bindCalendarEvents(dateRequestedHandler) {
  onDateRequested = dateRequestedHandler;
  moodMenu = document.querySelector("#home-mood-menu").cloneNode(true);
  moodMenu.id = "calendar-mood-menu";
  moodMenu.className = "calendar-choice-mood-menu";
  moodMenu.hidden = true;
  document.body.append(moodMenu);
  moodMenu.querySelectorAll("[data-mood]").forEach(button => {
    const mood = button.dataset.mood;
    button.style.setProperty("--mood-color", moodColors[mood]);
    button.style.setProperty("--mood-fill", moodBackground(mood));
    button.addEventListener("click", () => {
      const date = moodMenuTrigger?.id === "calendar-detail-mood" ? detailDate : selectedDate;
      if (!date || !state.diaryBridge?.saveMoodByDate) return;
      state.diaryBridge.saveMoodByDate(date, mood, () => {
        state.recordedMoods[date] = mood;
        closeMoodMenu();
        renderCalendar();
        if (date === detailDate) updateDetailMood();
        window.dispatchEvent(new CustomEvent("calendar:mood-changed", { detail: { date, mood } }));
      });
    });
  });
  for (const id of ["calendar-selected-mood", "calendar-detail-mood"]) {
    document.querySelector(`#${id}`).addEventListener("click", event => {
      event.stopPropagation();
      showMoodMenu(event.currentTarget);
    });
  }
  document.addEventListener("pointerdown", event => {
    if (!moodMenu.hidden && !moodMenu.contains(event.target) && event.target !== moodMenuTrigger) closeMoodMenu();
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !moodMenu.hidden) closeMoodMenu(); });
  const recapBackdrop = document.querySelector("#calendar-recap-backdrop");
  const closeRecap = () => { setRecapNoteEditing(false); recapBackdrop.hidden = true; ++recapRequest; document.querySelector("#calendar-recap-open").focus(); };
  document.querySelector("#calendar-recap-open")?.addEventListener("click", openRecap);
  const recapNoteCard = document.querySelector("#calendar-recap-note-card");
  const recapNoteInput = document.querySelector("#calendar-recap-note-input");
  recapNoteCard.addEventListener("pointerdown", event => event.stopPropagation());
  recapNoteCard.addEventListener("click", () => { if (!recapNoteEditing) setRecapNoteEditing(true); });
  recapNoteCard.addEventListener("keydown", event => {
    if (event.target !== recapNoteCard || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    setRecapNoteEditing(true);
  });
  const cancelRecapNote = () => setRecapNoteEditing(false);
  const saveRecapNote = () => {
    if (!recapNoteEditing || !state.diaryBridge?.saveMoodNoteByDate) return;
    const date = recapDates[recapIndex];
    const value = recapNoteInput.value.trim();
    const save = document.querySelector("#calendar-recap-note-save");
    save.disabled = true;
    state.diaryBridge.saveMoodNoteByDate(date, value, saved => {
      save.disabled = false;
      if (saved === undefined || saved === null) return;
      if (recapDates[recapIndex] === date && !recapBackdrop.hidden) {
        recapNoteValue = String(saved);
        document.querySelector("#calendar-recap-note").textContent = recapNoteValue || "No note for this day";
        setRecapNoteEditing(false);
      }
      renderCalendar();
      window.dispatchEvent(new CustomEvent("home:mood-note-changed", { detail: { date } }));
    });
  };
  document.querySelector("#calendar-recap-note-save").addEventListener("click", event => { event.stopPropagation(); saveRecapNote(); });
  document.querySelector("#calendar-recap-note-cancel").addEventListener("click", event => { event.stopPropagation(); cancelRecapNote(); });
  recapNoteInput.addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); saveRecapNote(); }
    if (event.key === "Escape") { event.stopPropagation(); cancelRecapNote(); }
  });
  document.querySelector("#calendar-diary-open")?.addEventListener("click", openDiaryDetail);
  document.querySelector("#calendar-detail-back")?.addEventListener("click", closeDiaryDetail);
  document.querySelector('.nav-item[data-page="calendar"]')?.addEventListener("click", closeDiaryDetail);
  const detailTitle = document.querySelector("#calendar-detail-title");
  const detailBody = document.querySelector("#calendar-detail-body");
  for (const field of [detailTitle, detailBody]) {
    field.addEventListener("input", updateDetailCount);
  }
  detailTitle.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    detailBody.focus();
  });
  detailTitle.addEventListener("paste", event => {
    const value = event.clipboardData?.getData("text/plain");
    if (value == null) return;
    event.preventDefault();
    document.execCommand("insertText", false, value.replace(/\s*\r?\n\s*/g, " "));
  });
  document.querySelector("#calendar-detail-edit")?.addEventListener("click", () => { setDetailEditing(true); detailBody.focus(); });
  document.querySelector("#calendar-detail-save")?.addEventListener("click", saveDiaryDetail);
  document.querySelector("#calendar-detail-cancel")?.addEventListener("click", () => {
    detailTitle.textContent = detailSnapshot.title;
    detailBody.innerHTML = detailSnapshot.body;
    setDetailEditing(false);
    updateDetailCount();
  });
  const detailMore = document.querySelector("#calendar-detail-more");
  const detailMenu = document.querySelector("#calendar-detail-menu");
  const closeDetailMenu = () => { detailMenu.hidden = true; detailMore.setAttribute("aria-expanded", "false"); };
  detailMore.addEventListener("click", () => { detailMenu.hidden = !detailMenu.hidden; detailMore.setAttribute("aria-expanded", String(!detailMenu.hidden)); });
  document.addEventListener("pointerdown", event => { if (!detailMore.parentElement.contains(event.target)) closeDetailMenu(); });
  detailMenu.addEventListener("click", async event => {
    const action = event.target.closest("[data-calendar-detail-action]")?.dataset.calendarDetailAction;
    if (!action) return;
    closeDetailMenu();
    if (action === "edit" || action === "title") { setDetailEditing(true); (action === "title" ? detailTitle : detailBody).focus(); return; }
    if (action === "share") {
      const text = [detailTitle.textContent, detailBody.innerText].filter(Boolean).join("\n").trim();
      if (text) try { await navigator.clipboard.writeText(text); } catch { window.alert("Could not share this entry."); }
      return;
    }
    if (action === "delete" && window.confirm("Delete this diary entry? This cannot be undone.")) {
      state.diaryBridge?.deleteEntryByDate?.(detailDate, result => {
        if (!result?.ok) { window.alert("Could not delete this entry."); return; }
        state.recordedDates.delete(detailDate);
        window.dispatchEvent(new CustomEvent("calendar:diary-entry-changed", { detail: { date: detailDate } }));
        closeDiaryDetail();
        renderCalendar();
      });
    }
  });
  const detailColors = document.querySelector("#calendar-detail-colors");
  for (const color of DIARY_COLORS) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.style.setProperty("--swatch-color", color);
    swatch.setAttribute("aria-label", color);
    swatch.addEventListener("click", () => { setDetailEditing(true); detailBody.focus(); applyDiaryColor(color); detailColors.hidden = true; });
    detailColors.append(swatch);
  }
  document.querySelector("#calendar-detail-color")?.addEventListener("click", () => { detailColors.hidden = !detailColors.hidden; });
  document.querySelector(".calendar-detail-toolbar")?.addEventListener("click", event => {
    const command = event.target.closest("[data-calendar-format]")?.dataset.calendarFormat;
    if (!command) return;
    setDetailEditing(true);
    if (command === "link") {
      const url = window.prompt("Enter a link URL");
      if (url && /^https?:\/\//i.test(url)) document.execCommand("createLink", false, url);
    } else applyDiaryCommand(detailBody, command);
    event.target.closest("details")?.removeAttribute("open");
    updateDetailCount();
  });
  document.querySelector("#calendar-recap-prev")?.addEventListener("click", () => moveRecap(-1));
  document.querySelector("#calendar-recap-next")?.addEventListener("click", () => moveRecap(1));
  const recapCard = recapBackdrop.querySelector(".calendar-recap-card");
  let dragStart = null;
  let dragPointer = null;
  let dragOffset = 0;
  recapCard.addEventListener("pointerdown", event => {
    if (recapMoving || (event.pointerType === "mouse" && event.button !== 0)) return;
    dragStart = event.clientX;
    dragPointer = event.pointerId;
    dragOffset = 0;
    recapCard.setPointerCapture(event.pointerId);
  });
  recapCard.addEventListener("pointermove", event => {
    if (dragStart === null || dragPointer !== event.pointerId || recapMoving) return;
    dragOffset = Math.max(-110, Math.min(110, event.clientX - dragStart));
    recapCard.style.transform = `translateX(${dragOffset}px)`;
  });
  recapCard.addEventListener("pointerup", event => {
    if (dragStart === null || dragPointer !== event.pointerId) return;
    const moved = event.clientX - dragStart;
    dragStart = null;
    dragPointer = null;
    if (Math.abs(moved) > 45) moveRecap(moved < 0 ? 1 : -1, dragOffset);
    else { recapCard.animate?.([{ transform: `translateX(${dragOffset}px)` }, { transform: "translateX(0)" }], { duration: 180, easing: "ease-out" }); recapCard.style.transform = ""; }
  });
  recapCard.addEventListener("pointercancel", () => { dragStart = null; dragPointer = null; recapCard.style.transform = ""; });
  let wheelOffset = 0;
  let wheelReset;
  recapCard.addEventListener("wheel", event => {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    event.preventDefault();
    wheelOffset += event.deltaX;
    clearTimeout(wheelReset);
    wheelReset = setTimeout(() => { wheelOffset = 0; }, 180);
    if (Math.abs(wheelOffset) < 45 || recapMoving) return;
    moveRecap(wheelOffset > 0 ? 1 : -1);
    wheelOffset = 0;
  }, { passive: false });
  recapBackdrop?.addEventListener("pointerdown", event => { if (event.target === recapBackdrop) closeRecap(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !recapBackdrop.hidden) { closeRecap(); event.stopPropagation(); } });
  window.addEventListener("chat:snippet-changed", loadSavedChatDates);
  dom.prevMonthButton?.addEventListener("click", () => { state.visibleMonth = new Date(state.visibleMonth.getFullYear(), state.visibleMonth.getMonth() - 1, 1); renderCalendar(); });
  dom.nextMonthButton?.addEventListener("click", () => { state.visibleMonth = new Date(state.visibleMonth.getFullYear(), state.visibleMonth.getMonth() + 1, 1); renderCalendar(); });
  dom.todayCalendarButton?.addEventListener("click", () => { const now = new Date(); state.visibleMonth = new Date(now.getFullYear(), now.getMonth(), 1); selectedDate = toDateText(now); renderCalendar(); });
  document.querySelector("#calendar-sidebar-toggle")?.addEventListener("click", event => {
    const layout = document.querySelector(".calendar-layout");
    const hidden = layout.classList.toggle("is-sidebar-hidden");
    event.currentTarget.setAttribute("aria-expanded", String(!hidden));
    event.currentTarget.setAttribute("aria-label", hidden ? "Show Calendar sidebar" : "Hide Calendar sidebar");
  });
  document.querySelector("#calendar-add-entry")?.addEventListener("click", () => {
    document.querySelector("#diary-header-add")?.click();
    document.dispatchEvent(new CustomEvent("calendar:add-entry-date", { detail: { date: selectedDate } }));
  });
  for (const id of ["calendar-edit-entry", "calendar-view-diary"]) document.querySelector(`#${id}`)?.addEventListener("click", () => onDateRequested?.(selectedDate));
}
