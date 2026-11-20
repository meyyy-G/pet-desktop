import { state, toDateText } from "../state.js";
import { DIARY_COLORS, diaryPayload, diaryPlainText, countDiaryWords, showDiaryContent, updateDiaryPlaceholder, applyDiaryCommand, applyDiaryColor, insertDiaryImage } from "./diary-rich-text.js";
import { bindDiaryDateTimePicker } from "./diary-date-time-picker.js";

const moodNames = new Set(["Stress", "Low", "Anxious", "Steady", "Light", "Inspired", "Grateful"]);

export function bindDiaryAddEntry({ afterSave }) {
  const backdrop = document.querySelector("#diary-add-entry-modal");
  const card = backdrop.querySelector(".diary-add-entry-card");
  const editor = document.querySelector("#diary-add-entry-editor");
  const dateInput = document.querySelector("#diary-add-entry-date");
  const timeInput = document.querySelector("#diary-add-entry-time");
  const dateLabel = document.querySelector("#diary-add-entry-date-label");
  const timeLabel = document.querySelector("#diary-add-entry-time-label");
  const count = document.querySelector("#diary-add-entry-count");
  const saveButton = document.querySelector("#diary-add-entry-save");
  const cancelButton = document.querySelector("#diary-add-entry-cancel");
  const colors = document.querySelector("#diary-add-entry-colors");
  const colorButton = document.querySelector("#diary-add-entry-color");
  const { closePickers } = bindDiaryDateTimePicker({ dateInput, timeInput, onDateChange: () => { setEntryEditing(true); loadDate(); } });
  let chosenMood = "";
  let loadId = 0;
  let saving = false;
  let selection = null;
  let defaultTime = "";

  function setEntryEditing(editing) {
    saveButton.hidden = !editing;
    cancelButton.hidden = !editing;
  }

  function updateCount() {
    const words = countDiaryWords(diaryPlainText(editor));
    count.textContent = `${words} ${words === 1 ? "word" : "words"}`;
    updateDiaryPlaceholder(editor);
  }

  function showMood(mood) {
    chosenMood = moodNames.has(mood) ? mood : "";
    backdrop.querySelectorAll("[data-entry-mood]").forEach(button => {
      button.setAttribute("aria-pressed", String(button.dataset.entryMood === chosenMood));
    });
  }

  function showDate() {
    const date = new Date(`${dateInput.value}T00:00:00`);
    dateLabel.textContent = Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" });
  }

  function showTime() {
    const [hour, minute] = timeInput.value.split(":").map(Number);
    timeLabel.textContent = Number.isNaN(hour) ? "" : new Date(2000, 0, 1, hour, minute).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }

  function loadDate() {
    const date = dateInput.value;
    showDate();
    if (!date || date > toDateText(new Date()) || !state.diaryBridge?.peekEntryByDate) return;
    const request = ++loadId;
    state.diaryBridge.peekEntryByDate(date, entry => {
      if (request !== loadId || backdrop.hidden || entry?.date !== date) return;
      showDiaryContent(editor, entry);
      showMood(state.recordedMoods[date]);
      timeInput.value = entry.entry_time || defaultTime;
      showTime();
      updateCount();
    });
  }

  function cancelEditing() {
    if (saving) return;
    editor.blur();
    selection = null;
    colors.hidden = true;
    colorButton.setAttribute("aria-expanded", "false");
    closePickers();
    saveButton.textContent = "Save";
    setEntryEditing(false);
    loadDate();
  }

  function close() {
    if (saving) return;
    ++loadId;
    backdrop.hidden = true;
    card.classList.remove("is-maximized");
    colors.hidden = true;
    closePickers();
    setEntryEditing(false);
  }

  function restoreSelection() {
    editor.focus();
    if (!selection || !editor.contains(selection.startContainer) || !editor.contains(selection.endContainer)) return;
    const current = window.getSelection();
    current.removeAllRanges();
    current.addRange(selection);
  }

  document.querySelector("#diary-header-add")?.addEventListener("click", () => {
    if (!state.diaryBridge?.peekEntryByDate) return;
    const now = new Date();
    dateInput.max = toDateText(now);
    dateInput.value = toDateText(now);
    timeInput.value = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    defaultTime = timeInput.value;
    showTime();
    editor.replaceChildren();
    showMood("");
    backdrop.hidden = false;
    setEntryEditing(false);
    updateCount();
    loadDate();
  });
  document.addEventListener("calendar:add-entry-date", event => {
    if (backdrop.hidden || !event.detail?.date) return;
    dateInput.value = event.detail.date;
    loadDate();
  });
  document.addEventListener("calendar:add-entry-date", event => {
    if (backdrop.hidden || !event.detail?.date) return;
    dateInput.value = event.detail.date;
    loadDate();
  });
  document.querySelector("#diary-add-entry-close").addEventListener("click", close);
  backdrop.addEventListener("pointerdown", event => { if (event.target === backdrop) close(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !backdrop.hidden) { close(); event.stopPropagation(); } });
  document.querySelector("#diary-add-entry-maximize").addEventListener("click", () => card.classList.toggle("is-maximized"));
  timeInput.addEventListener("change", () => { showTime(); setEntryEditing(true); });
  editor.addEventListener("focus", () => setEntryEditing(true));
  editor.addEventListener("input", () => { updateCount(); setEntryEditing(true); });
  editor.addEventListener("paste", event => { event.preventDefault(); document.execCommand("insertText", false, event.clipboardData.getData("text/plain")); });
  document.addEventListener("selectionchange", () => {
    const current = window.getSelection();
    if (current?.rangeCount && editor.contains(current.anchorNode)) selection = current.getRangeAt(0).cloneRange();
  });
  backdrop.querySelectorAll("[data-entry-mood]").forEach(button => button.addEventListener("click", () => { showMood(chosenMood === button.dataset.entryMood ? "" : button.dataset.entryMood); setEntryEditing(true); }));
  backdrop.querySelectorAll("[data-entry-command]").forEach(button => {
    button.addEventListener("mousedown", event => event.preventDefault());
    button.addEventListener("click", () => {
      restoreSelection();
      if (button.dataset.entryCommand === "link") {
        state.diaryBridge?.chooseDiaryImage?.(result => {
          if (result?.ok) { restoreSelection(); insertDiaryImage(editor, result); updateCount(); }
          else if (!result?.cancelled) window.alert(result?.error || "Could not open this image.");
        });
      } else {
        applyDiaryCommand(editor, button.dataset.entryCommand);
        updateCount();
        setEntryEditing(true);
      }
      button.closest(".diary-heading-menu")?.removeAttribute("open");
    });
  });
  for (const color of DIARY_COLORS) {
    const button = document.createElement("button");
    button.type = "button";
    button.style.setProperty("--swatch-color", color);
    button.setAttribute("aria-label", color);
    button.addEventListener("mousedown", event => event.preventDefault());
    button.addEventListener("click", () => {
      restoreSelection();
      applyDiaryColor(color);
      colorButton.style.color = color;
      colors.hidden = true;
      colorButton.setAttribute("aria-expanded", "false");
    });
    colors.append(button);
  }
  colorButton.addEventListener("mousedown", event => event.preventDefault());
  colorButton.addEventListener("click", () => {
    colors.hidden = !colors.hidden;
    colorButton.setAttribute("aria-expanded", String(!colors.hidden));
  });
  cancelButton.addEventListener("click", cancelEditing);
  saveButton.addEventListener("click", () => {
    const date = dateInput.value;
    if (saving || !date || date > toDateText(new Date()) || !state.diaryBridge?.saveEntryByDate) return;
    saving = true;
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";
    const onSaved = entry => {
      saving = false;
      saveButton.disabled = false;
      saveButton.textContent = entry?.date === date ? "Save" : "Retry";
      if (entry?.date !== date) return;
      const finish = () => {
        close();
        afterSave(date, entry);
      };
      if (chosenMood && chosenMood !== state.recordedMoods[date] && state.diaryBridge.saveMoodByDate) {
        state.diaryBridge.saveMoodByDate(date, chosenMood, result => {
          if (result?.mood === chosenMood) state.recordedMoods[date] = chosenMood;
          finish();
        });
      } else finish();
    };
    if (state.diaryBridge.saveEntryWithTime) state.diaryBridge.saveEntryWithTime(date, diaryPayload(editor), timeInput.value, onSaved);
    else state.diaryBridge.saveEntryByDate(date, diaryPayload(editor), onSaved);
  });
}
