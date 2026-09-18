import { dom } from "../dom.js";

const storageKey = "journal-task-list-v2";

function getTaskRows() {
  return [...(dom.taskItems?.querySelectorAll(".task-row") || [])];
}

function createTaskRow({ id, text = "", completed = false, category }) {
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
  const checkboxIcon = document.createElement("img");
  checkboxIcon.src = `${document.body.dataset.svgBase}task/tick-circle.svg`;
  checkboxIcon.alt = "";
  checkboxVisual.appendChild(checkboxIcon);
  label.append(checkbox, checkboxVisual);

  const copy = document.createElement("div");
  copy.className = "task-copy";
  const description = document.createElement("input");
  description.className = "task-description";
  description.value = text;
  description.placeholder = "Add description...";
  description.maxLength = 60;
  description.setAttribute("aria-label", "Task description");
  const metadata = document.createElement("span");
  const categoryDot = document.createElement("i");
  categoryDot.className = "tag-dot";
  // Old saved rows lack category; recover the original sample categories by ID.
  const fallbackCategory = id === "figma-design" ? "design" : id === "resting" ? "personal" : "work";
  categoryDot.dataset.category = ["design", "work", "personal", "learning"].includes(category) ? category : fallbackCategory;
  metadata.append(categoryDot, document.createTextNode("Today"));
  copy.append(description, metadata);

  const deleteButton = document.createElement("button");
  deleteButton.className = "task-delete-button";
  deleteButton.type = "button";
  const moreIcon = document.createElement("img");
  moreIcon.src = `${document.body.dataset.svgBase}task/3-dots-more.svg`;
  moreIcon.alt = "";
  deleteButton.appendChild(moreIcon);
  deleteButton.setAttribute("aria-label", "Task menu");
  deleteButton.setAttribute("aria-haspopup", "menu");
  deleteButton.setAttribute("aria-expanded", "false");

  row.append(label, copy, deleteButton);
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
    category: row.querySelector(".tag-dot")?.dataset.category || "work",
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
  if (!dom.taskItems) return;
  const savedTasks = readTasks();
  if (savedTasks && dom.taskItems) {
    dom.taskItems.replaceChildren();
    savedTasks.forEach(createTaskRow);
  }

  const menu = document.createElement("div");
  menu.className = "home-task-menu";
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  menu.innerHTML = '<button type="button" role="menuitem" data-action="edit">编辑</button><button type="button" role="menuitem" data-action="delete">删除</button>';
  document.body.appendChild(menu);
  let menuTrigger = null;
  function closeMenu(restoreFocus = false) {
    const trigger = menuTrigger;
    menu.hidden = true;
    menuTrigger = null;
    trigger?.setAttribute("aria-expanded", "false");
    if (restoreFocus) trigger?.focus();
  }
  dom.taskItems.querySelectorAll(".task-delete-button").forEach((button) => {
    button.setAttribute("aria-label", "Task menu");
    button.setAttribute("aria-haspopup", "menu");
    button.setAttribute("aria-expanded", "false");
  });
  menu.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    const row = menuTrigger?.closest(".task-row");
    if (!action || !row) return;
    closeMenu();
    if (action === "edit") {
      const input = row.querySelector(".task-description");
      input.focus();
      input.select();
    } else if (action === "delete") {
      const next = row.nextElementSibling || row.previousElementSibling;
      row.remove();
      updateTaskProgress();
      saveTasks();
      (next?.querySelector(".task-delete-button") || dom.taskAddButton)?.focus();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!menu.contains(event.target) && !menuTrigger?.contains(event.target)) closeMenu();
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu(true);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const items = [...menu.querySelectorAll("button")];
      const step = event.key === "ArrowDown" ? 1 : -1;
      items[(items.indexOf(document.activeElement) + step + items.length) % items.length].focus();
    } else if (event.key === "Tab") {
      closeMenu(true);
    }
  });
  window.addEventListener("resize", () => closeMenu());
  window.addEventListener("scroll", () => closeMenu(), true);
  window.addEventListener("diary:page-changed", () => closeMenu());

  dom.taskAddButton?.addEventListener("click", () => {
    closeMenu();
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
    const button = event.target.closest(".task-delete-button");
    if (!button) return;
    const wasOpen = menuTrigger === button;
    closeMenu();
    if (wasOpen) return;
    menuTrigger = button;
    button.setAttribute("aria-expanded", "true");
    menu.hidden = false;
    const rect = button.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(rect.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8)) + "px";
    menu.style.top = Math.max(8, rect.bottom + menu.offsetHeight + 8 <= window.innerHeight ? rect.bottom + 4 : rect.top - menu.offsetHeight - 4) + "px";
    menu.querySelector("button").focus();
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
