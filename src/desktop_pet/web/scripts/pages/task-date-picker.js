import { toDateText } from "../state.js";

export function createTaskDatePicker(getDate, onSelect) {
  const picker = document.createElement("div");
  picker.className = "diary-add-entry-picker diary-add-entry-calendar task-date-picker";
  picker.setAttribute("role", "dialog");
  picker.setAttribute("aria-label", "Choose task date");
  const header = document.createElement("div");
  header.className = "diary-add-entry-calendar-head";
  const previous = document.createElement("button");
  previous.type = "button";
  previous.textContent = "‹";
  previous.setAttribute("aria-label", "Previous month");
  const label = document.createElement("strong");
  const next = document.createElement("button");
  next.type = "button";
  next.textContent = "›";
  next.setAttribute("aria-label", "Next month");
  header.append(previous, label, next);
  const days = document.createElement("div");
  days.className = "diary-add-entry-calendar-days";
  picker.append(header, days);
  const selected = getDate();
  let month = selected ? new Date(`${selected}T12:00:00`) : new Date();

  function render() {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    label.textContent = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });
    days.replaceChildren();
    for (const weekday of ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]) {
      const cell = document.createElement("span");
      cell.className = "diary-add-entry-weekday";
      cell.textContent = weekday;
      days.appendChild(cell);
    }
    const firstDay = new Date(year, monthIndex, 1).getDay();
    for (let index = 0; index < firstDay; index += 1) days.appendChild(document.createElement("span"));
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    for (let day = 1; day <= lastDay; day += 1) {
      const value = toDateText(new Date(year, monthIndex, day));
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = String(day);
      button.setAttribute("aria-label", new Date(year, monthIndex, day).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }));
      button.setAttribute("aria-pressed", String(value === getDate()));
      button.addEventListener("click", () => onSelect(value));
      days.appendChild(button);
    }
  }
  previous.addEventListener("click", () => { month = new Date(month.getFullYear(), month.getMonth() - 1, 1); render(); });
  next.addEventListener("click", () => { month = new Date(month.getFullYear(), month.getMonth() + 1, 1); render(); });
  render();
  return picker;
}
