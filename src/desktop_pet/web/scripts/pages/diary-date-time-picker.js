import { toDateText } from "../state.js";

const wheelRowHeight = 40;
const pad = number => String(number).padStart(2, "0");

export function bindDiaryDateTimePicker({ dateInput, timeInput, onDateChange }) {
  const dateTrigger = document.querySelector("#diary-add-entry-date-trigger");
  const timeTrigger = document.querySelector("#diary-add-entry-time-trigger");
  const calendar = document.querySelector("#diary-add-entry-calendar");
  const timePicker = document.querySelector("#diary-add-entry-time-picker");
  const days = document.querySelector("#diary-add-entry-calendar-days");
  const monthLabel = document.querySelector("#diary-add-entry-month");
  const prevMonth = document.querySelector("#diary-add-entry-prev-month");
  const nextMonth = document.querySelector("#diary-add-entry-next-month");
  const columns = Object.fromEntries([...timePicker.querySelectorAll("[data-time-part]")].map(column => [column.dataset.timePart, column]));
  const choices = { hour: Array.from({ length: 12 }, (_, index) => pad(index + 1)), minute: Array.from({ length: 60 }, (_, index) => pad(index)), period: ["AM", "PM"] };
  let visibleMonth = new Date();
  let wheelValue = { hour: "12", minute: "00", period: "AM" };

  function closePickers() {
    calendar.hidden = true;
    timePicker.hidden = true;
    dateTrigger.setAttribute("aria-expanded", "false");
    timeTrigger.setAttribute("aria-expanded", "false");
  }

  function renderCalendar() {
    const year = visibleMonth.getFullYear();
    const month = visibleMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const lastDay = new Date(year, month + 1, 0).getDate();
    monthLabel.textContent = visibleMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    nextMonth.disabled = new Date(year, month + 1, 1) > new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    days.replaceChildren();
    for (const weekday of ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]) {
      const label = document.createElement("span");
      label.className = "diary-add-entry-weekday";
      label.textContent = weekday;
      days.append(label);
    }
    for (let i = 0; i < firstDay; i += 1) days.append(document.createElement("span"));
    for (let day = 1; day <= lastDay; day += 1) {
      const value = toDateText(new Date(year, month, day));
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = String(day);
      button.dataset.date = value;
      button.disabled = value > toDateText(new Date());
      button.setAttribute("aria-pressed", String(value === dateInput.value));
      button.setAttribute("aria-label", new Date(year, month, day).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }));
      button.addEventListener("click", () => {
        dateInput.value = value;
        closePickers();
        onDateChange();
      });
      days.append(button);
    }
  }

  function setTimeFromInput() {
    const [hour24, minute] = (timeInput.value || "00:00").split(":").map(Number);
    wheelValue = { hour: pad(hour24 % 12 || 12), minute: pad(minute || 0), period: hour24 >= 12 ? "PM" : "AM" };
    for (const [part, column] of Object.entries(columns)) {
      const index = choices[part].indexOf(wheelValue[part]);
      column.scrollTop = index * wheelRowHeight;
      updateWheelState(column, part);
    }
  }

  function updateWheelState(column, part) {
    column.querySelectorAll("button").forEach(button => button.setAttribute("aria-selected", String(button.dataset.value === wheelValue[part])));
  }

  function selectTime(part, value, scroll = true) {
    wheelValue[part] = value;
    const hour12 = Number(wheelValue.hour);
    const hour24 = hour12 % 12 + (wheelValue.period === "PM" ? 12 : 0);
    timeInput.value = `${pad(hour24)}:${wheelValue.minute}`;
    timeInput.dispatchEvent(new Event("change", { bubbles: true }));
    const column = columns[part];
    updateWheelState(column, part);
    if (scroll) column.scrollTo({ top: choices[part].indexOf(value) * wheelRowHeight, behavior: "smooth" });
  }

  for (const [part, column] of Object.entries(columns)) {
    const spacer = document.createElement("span");
    spacer.className = "diary-add-entry-wheel-spacer";
    column.append(spacer);
    for (const value of choices[part]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = value;
      button.dataset.value = value;
      button.addEventListener("click", () => selectTime(part, value));
      column.append(button);
    }
    column.append(spacer.cloneNode());
    let drag = null;
    column.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      drag = { id: event.pointerId, y: event.clientY, top: column.scrollTop, moved: false };
    });
    column.addEventListener("pointermove", event => {
      if (!drag || event.pointerId !== drag.id) return;
      if (Math.abs(event.clientY - drag.y) > 4 && !drag.moved) {
        drag.moved = true;
        column.setPointerCapture(event.pointerId);
      }
      if (drag.moved) column.scrollTop = drag.top - (event.clientY - drag.y);
    });
    column.addEventListener("pointerup", event => {
      if (!drag || event.pointerId !== drag.id) return;
      if (drag.moved) {
        const index = Math.max(0, Math.min(choices[part].length - 1, Math.round(column.scrollTop / wheelRowHeight)));
        selectTime(part, choices[part][index]);
        // A drag release should not activate the button that happened to be under the pointer.
        const suppressClick = click => { click.preventDefault(); click.stopPropagation(); };
        column.addEventListener("click", suppressClick, { capture: true, once: true });
        setTimeout(() => column.removeEventListener("click", suppressClick, true), 100);
      }
      drag = null;
    });
    column.addEventListener("pointercancel", () => { drag = null; });
    column.addEventListener("wheel", event => {
      event.preventDefault();
      const index = choices[part].indexOf(wheelValue[part]);
      selectTime(part, choices[part][Math.max(0, Math.min(choices[part].length - 1, index + Math.sign(event.deltaY)))]);
    }, { passive: false });
  }

  dateTrigger.addEventListener("click", () => {
    const opening = calendar.hidden;
    closePickers();
    if (!opening) return;
    visibleMonth = new Date(`${dateInput.value}T00:00:00`);
    renderCalendar();
    calendar.hidden = false;
    dateTrigger.setAttribute("aria-expanded", "true");
  });
  timeTrigger.addEventListener("click", () => {
    const opening = timePicker.hidden;
    closePickers();
    if (!opening) return;
    timePicker.hidden = false;
    timeTrigger.setAttribute("aria-expanded", "true");
    setTimeFromInput();
  });
  prevMonth.addEventListener("click", () => { visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1); renderCalendar(); });
  nextMonth.addEventListener("click", () => { visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1); renderCalendar(); });
  document.addEventListener("pointerdown", event => {
    if (!event.target.closest(".diary-add-entry-option")) closePickers();
  });
  return { closePickers };
}
