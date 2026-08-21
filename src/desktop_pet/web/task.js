import { dom } from "./dom.js";

const storageKey = "journal-task-list-v2";

function getTaskRows() {
  return [...(dom.taskItems?.querySelectorAll(".task-row") || [])];
}

function createTaskRow({ id, text = "", completed = false }) {
  const row = document.createElement("div");
  row.className = "task-row";
  row.dataset.taskId = id;

  const label = document.createElement("label");
  const checkbox = document.createElement("input");
  checkbox.className = "task-checkbox";
  checkbox.type = "checkbox";
  checkbox.checked = completed;
  const checkboxVisual = document.createElement("span");
  checkboxVisual.className = "task-checkbox-visual";
  label.append(checkbox, checkboxVisual);

  const description = document.createElement("input");
  description.className = "task-description";
  description.value = text;
  description.placeholder = "Add description...";
  description.maxLength = 60;
  description.setAttribute("aria-label", "Task description");

  const deleteButton = document.createElement("button");
  deleteButton.className = "task-delete-button";
  deleteButton.type = "button";
  deleteButton.textContent = "×";
  deleteButton.setAttribute("aria-label", "Delete task");

  row.append(label, description, deleteButton);
  dom.taskItems?.appendChild(row);
  return row;
}

function readTasks() {
  try {
    const tasks = JSON.parse(localStorage.getItem(storageKey) || "null");
    return Array.isArray(tasks) ? tasks : null;
  } catch {
    return null;
  }
}

function saveTasks() {
  const tasks = getTaskRows().map((row) => ({
    id: row.dataset.taskId,
    text: row.querySelector(".task-description").value,
    completed: row.querySelector(".task-checkbox").checked,
  }));

  try {
    localStorage.setItem(storageKey, JSON.stringify(tasks));
  } catch {
    // 禁用本地存储时，当前会话内的交互仍然可用。
  }
}

function updateRightTaskList(rows, completedCount, percentage) {
  if (dom.rightTaskCount) dom.rightTaskCount.textContent = `${completedCount}/${rows.length} task`;
  if (dom.rightTaskProgressText) dom.rightTaskProgressText.textContent = `${percentage}%`;
  if (dom.rightTaskProgressFill) dom.rightTaskProgressFill.style.width = `${percentage}%`;
  if (!dom.rightTaskList) return;

  dom.rightTaskList.replaceChildren();
  rows
    .filter((row) => row.querySelector(".task-description").value.trim())
    .slice(0, 3)
    .forEach((row) => {
      const item = document.createElement("li");
      item.dataset.taskId = row.dataset.taskId;
      item.textContent = row.querySelector(".task-description").value.trim();
      item.classList.toggle("completed", row.querySelector(".task-checkbox").checked);
      item.title = "Click to toggle task";
      dom.rightTaskList.appendChild(item);
    });
}

export function updateTaskProgress() {
  const rows = getTaskRows();
  const completedCount = rows.filter((row) => row.querySelector(".task-checkbox").checked).length;
  const percentage = rows.length ? Math.round((completedCount / rows.length) * 100) : 0;

  rows.forEach((row) => {
    row.classList.toggle("is-completed", row.querySelector(".task-checkbox").checked);
  });

  if (dom.taskProgressText) dom.taskProgressText.textContent = `${percentage}%`;
  if (dom.taskProgressFill) dom.taskProgressFill.style.width = `${percentage}%`;
  if (dom.taskProgressBar) dom.taskProgressBar.setAttribute("aria-valuenow", String(percentage));
  updateRightTaskList(rows, completedCount, percentage);
}

export function bindTaskEvents() {
  const savedTasks = readTasks();
  if (savedTasks) {
    dom.taskItems.replaceChildren();
    savedTasks.forEach(createTaskRow);
  }

  dom.taskAddButton?.addEventListener("click", () => {
    const row = createTaskRow({ id: `task-${Date.now()}` });
    updateTaskProgress();
    saveTasks();
    row.querySelector(".task-description").focus();
  });

  dom.taskItems?.addEventListener("change", (event) => {
    if (!event.target.matches(".task-checkbox")) return;
    updateTaskProgress();
    saveTasks();
  });

  dom.taskItems?.addEventListener("input", (event) => {
    if (!event.target.matches(".task-description")) return;
    updateTaskProgress();
    saveTasks();
  });

  dom.taskItems?.addEventListener("click", (event) => {
    const deleteButton = event.target.closest(".task-delete-button");
    if (!deleteButton) return;
    deleteButton.closest(".task-row")?.remove();
    updateTaskProgress();
    saveTasks();
  });

  dom.rightTaskList?.addEventListener("click", (event) => {
    const item = event.target.closest("li[data-task-id]");
    if (!item) return;
    const row = getTaskRows().find((taskRow) => taskRow.dataset.taskId === item.dataset.taskId);
    const checkbox = row?.querySelector(".task-checkbox");
    if (!checkbox) return;
    checkbox.checked = !checkbox.checked;
    updateTaskProgress();
    saveTasks();
  });

  updateTaskProgress();
}
