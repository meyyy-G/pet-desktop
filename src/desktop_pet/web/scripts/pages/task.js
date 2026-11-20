import { dom } from "../dom.js";
import { state, toDateText } from "../state.js";
import { createTaskDatePicker } from "./task-date-picker.js";

const taskState = {
  tasks: [],
  view: "all",
  filters: { categories: [], priorities: [], status: "all" },
  sortMode: "time-asc",
  menu: null,
  menuTrigger: null,
};
let homeTaskPeriod = "all";
let openTaskEditDialog = null;
const collapsedTaskSections = { all: false, today: false, upcoming: false, completed: false, secondary: false };

const labels = { work: "Work", design: "Design", personal: "Personal", learning: "Learning", low: "Low", medium: "Medium", high: "High" };
const formatShortDate = dateText => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${dateText}T00:00:00`));

function bridgeCall(method, args = [], callback = () => {}) {
  const fn = state.diaryBridge?.[method];
  if (!fn) return;
  fn(...args, callback);
}

function closeMenu() {
  taskState.menuTrigger?.setAttribute("aria-expanded", "false");
  taskState.menu?.remove();
  taskState.menu = null;
  taskState.menuTrigger = null;
}

function positionMenu(menu, button) {
  document.body.appendChild(menu);
  const rect = button.getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.min(rect.bottom + 6, window.innerHeight - menu.offsetHeight - 8)}px`;
  taskState.menu = menu;
  taskState.menuTrigger = button;
  button.setAttribute("aria-expanded", "true");
}

function menuButton(text, detail, action, dot = null, icon = null, selected = false, closeOnSelect = true) {
  const button = document.createElement("button");
  button.type = "button";
  if (icon) {
    const image = document.createElement("img");
    image.className = "tp-menu-option-icon";
    image.src = icon;
    image.alt = "";
    button.appendChild(image);
  }
  if (dot) {
    const marker = document.createElement("i");
    marker.className = "tp-dot";
    marker.dataset[dot.kind] = dot.value;
    button.appendChild(marker);
  }
  const label = document.createElement("span");
  label.textContent = text;
  button.appendChild(label);
  if (detail) { const small = document.createElement("small"); small.textContent = detail; button.appendChild(small); }
  if (selected) { const check = document.createElement("span"); check.className = "tp-menu-check"; check.textContent = "✓"; button.appendChild(check); }
  button.addEventListener("click", () => { if (closeOnSelect) closeMenu(); action(button); });
  return button;
}

function openMoveMenu(task, trigger) {
  closeMenu();
  const menu = document.createElement("div");
  menu.className = "tp-floating-menu tp-task-move-menu";
  menu.setAttribute("role", "menu");
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  menu.append(
    menuButton("Today", "", () => updateTask(task.id, { date: toDateText(today) })),
    menuButton("Tomorrow", "", () => updateTask(task.id, { date: toDateText(tomorrow) })),
  );
  const dateLabel = document.createElement("div");
  dateLabel.className = "tp-menu-heading";
  dateLabel.textContent = "Choose a date";
  menu.append(dateLabel, createTaskDatePicker(() => task.date, value => { closeMenu(); updateTask(task.id, { date: value }); }));
  positionMenu(menu, trigger);
}

function openTaskMenu(task, trigger) {
  if (taskState.menuTrigger === trigger) { closeMenu(); return; }
  closeMenu();
  const menu = document.createElement("div");
  menu.className = "tp-floating-menu tp-task-actions-menu";
  menu.setAttribute("role", "menu");
  menu.append(
    menuButton("Edit", "", () => openTaskEditDialog?.(task)),
    menuButton(task.completed ? "Mark as incomplete" : "Mark as completed", "", () => updateTask(task.id, { completed: !task.completed })),
    menuButton("Move to", "›", () => openMoveMenu(task, trigger)),
  );
  const divider = document.createElement("div");
  divider.className = "tp-menu-divider";
  menu.appendChild(divider);
  const remove = menuButton("Delete", "", () => deleteTask(task.id));
  remove.classList.add("tp-menu-delete");
  menu.appendChild(remove);
  positionMenu(menu, trigger);
}

function filteredTasks(view = taskState.view) {
  const today = toDateText(new Date());
  const open = taskState.tasks.filter(task => !task.completed);
  const base = view === "completed" ? taskState.tasks.filter(task => task.completed)
    : view === "today" ? taskState.tasks.filter(task => task.date === today)
    : view === "upcoming" ? open.filter(task => task.date > today)
    : taskState.tasks;
  const { categories, priorities, status } = taskState.filters;
  return base.filter(task =>
    (!categories.length || categories.includes(task.category)) &&
    (!priorities.length || priorities.includes(task.priority)) &&
    (status === "all" || task.completed === (status === "completed"))
  );
}

function formatDuration(minutes) {
  const value = Number(minutes) || 15;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return hours ? `${hours}h${rest ? ` ${rest}m` : ""}` : `${rest}m`;
}

function openDurationMenu(trigger, currentMinutes, onChoose) {
  if (taskState.menuTrigger === trigger) { closeMenu(); return; }
  closeMenu();
  const menu = document.createElement("div"); menu.className = "tp-floating-menu tp-duration-menu"; menu.setAttribute("role", "menu");
  const heading = document.createElement("div"); heading.className = "tp-menu-heading"; heading.textContent = "Focus duration"; menu.appendChild(heading);
  for (const minutes of [15, 30, 45, 60, 120]) {
    const option = menuButton(formatDuration(minutes), "", () => onChoose(minutes), null, null, minutes === currentMinutes);
    option.classList.toggle("is-selected", minutes === currentMinutes);
    menu.appendChild(option);
  }
  const divider = document.createElement("div"); divider.className = "tp-menu-divider"; menu.appendChild(divider);
  menu.appendChild(menuButton("Custom...", "", () => openCustomDuration(trigger, currentMinutes, onChoose)));
  positionMenu(menu, trigger);
}

function openCustomDuration(trigger, currentMinutes, onChoose) {
  closeMenu();
  const menu = document.createElement("div"); menu.className = "tp-floating-menu tp-custom-duration";
  const label = document.createElement("label"); label.textContent = "Minutes";
  const input = document.createElement("input"); input.type = "number"; input.min = "1"; input.max = "1440"; input.value = String(currentMinutes || 15);
  label.appendChild(input);
  const apply = document.createElement("button"); apply.type = "button"; apply.textContent = "Apply";
  apply.addEventListener("click", () => { const value = Number(input.value); if (Number.isInteger(value) && value >= 1 && value <= 1440) { closeMenu(); onChoose(value); } else input.reportValidity(); });
  input.addEventListener("keydown", event => { if (event.key === "Enter") apply.click(); });
  menu.append(label, apply); positionMenu(menu, trigger); input.focus(); input.select();
}

function taskRow(task, compact = false) {
  const row = document.createElement("div");
  row.className = compact ? "task-row" : "tp-row";
  row.dataset.taskId = task.id;
  const main = document.createElement("div");
  main.className = compact ? "" : "tp-row-main";
  const label = document.createElement("label");
  label.className = compact ? "" : "tp-status";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = compact ? "task-checkbox" : "tp-checkbox";
  checkbox.checked = task.completed;
  checkbox.setAttribute("aria-label", task.completed ? "Mark task incomplete" : "Mark task completed");
  const icon = document.createElement("img"); icon.src = `${document.body.dataset.svgBase}task/tick-circle.svg`; icon.alt = "";
  if (compact) { const visual = document.createElement("span"); visual.className = "task-checkbox-visual"; visual.appendChild(icon); label.append(checkbox, visual); }
  else label.append(checkbox, icon);
  const info = document.createElement("div"); info.className = compact ? "task-copy" : "tp-info";
  const title = document.createElement(compact ? "input" : "span");
  title.className = compact ? "task-description" : "tp-name";
  if (compact) { title.value = task.title; title.maxLength = 60; title.setAttribute("aria-label", "Task description"); }
  else title.textContent = task.title;
  const meta = document.createElement(compact ? "span" : "div"); meta.className = compact ? "task-meta" : "tp-labels";
  const category = document.createElement("span"); const categoryDot = document.createElement("i"); categoryDot.className = compact ? "tag-dot" : "tp-dot"; categoryDot.dataset.category = task.category;
  if (compact) {
    const categoryLabel = document.createElement("span"); categoryLabel.className = "task-label"; categoryLabel.append(categoryDot, document.createTextNode(labels[task.category]));
    const priorityLabel = document.createElement("span"); priorityLabel.className = "task-label";
    const priorityDot = document.createElement("i"); priorityDot.className = "tag-dot"; priorityDot.dataset.priority = task.priority;
    priorityLabel.append(priorityDot, document.createTextNode(labels[task.priority]));
    if (task.category) meta.appendChild(categoryLabel);
    meta.appendChild(priorityLabel);
  }
  else { category.append(categoryDot, document.createTextNode(labels[task.category])); const priority = document.createElement("span"); const priorityDot = document.createElement("i"); priorityDot.className = "tp-dot"; priorityDot.dataset.priority = task.priority; priority.append(priorityDot, document.createTextNode(labels[task.priority])); if (task.category) meta.appendChild(category); meta.appendChild(priority); }
  info.append(title, meta);
  const actions = document.createElement("div"); actions.className = compact ? "" : "tp-row-actions";
  const date = document.createElement("span"); date.className = "tp-date";
  if (!compact) {
    const timeIcon = document.createElement("img"); timeIcon.className = "tp-time-icon"; timeIcon.src = `${document.body.dataset.svgBase}task/${/^([12][0-9]):/.test(task.time || "") && Number(task.time.slice(0, 2)) >= 12 ? "clock2" : "clock1"}.svg`; timeIcon.alt = "";
    const durationButton = document.createElement("button"); durationButton.type = "button"; durationButton.className = "tp-duration-button";
    durationButton.setAttribute("aria-label", `Focus duration ${formatDuration(task.duration_minutes)} for ${task.title}`);
    durationButton.setAttribute("aria-haspopup", "menu"); durationButton.setAttribute("aria-expanded", "false");
    durationButton.append(timeIcon, document.createTextNode(formatDuration(task.duration_minutes)));
    durationButton.addEventListener("click", () => openDurationMenu(durationButton, task.duration_minutes, minutes => updateTask(task.id, { duration_minutes: minutes })));
    date.appendChild(durationButton);
    if (taskState.view !== "today" && task.date !== toDateText(new Date())) {
      const dateLabel = document.createElement("small"); dateLabel.className = "tp-row-date-label";
      dateLabel.textContent = task.date ? task.date === toDateText(new Date()) ? "Today" : formatShortDate(task.date) : "No date";
      date.appendChild(dateLabel);
    }
  }
  const remove = document.createElement("button"); remove.type = "button"; remove.className = compact ? "task-delete-button" : "tp-delete"; remove.setAttribute("aria-label", `More options for ${task.title}`); remove.setAttribute("aria-haspopup", "menu"); remove.setAttribute("aria-expanded", "false");
  const more = document.createElement("img"); more.src = `${document.body.dataset.svgBase}buttons/dots.svg`; more.alt = ""; remove.appendChild(more);
  remove.addEventListener("click", () => openTaskMenu(task, remove));
  if (compact) row.append(label, info, remove); else { main.append(label, info); actions.append(date, remove); row.append(main, actions); }
  checkbox.addEventListener("change", () => completeTask(task, checkbox.checked, row));
  if (compact) title.addEventListener("change", () => updateTask(task.id, { title: title.value.trim() }));
  if (task.completed) row.classList.add("is-completed");
  return row;
}

function emptyState() {
  const empty = document.createElement("div"); empty.className = "tp-empty-state";
  empty.innerHTML = `<img src="${document.body.dataset.svgBase}task/receipt-add.svg" alt=""><strong>No Task yet</strong><small>add something small to started</small>`;
  return empty;
}

function renderHome(tasks) {
  if (!dom.taskItems) return;
  dom.taskItems.querySelectorAll(".task-row, .home-task-period, .home-task-period-list").forEach(element => element.remove());
  const today = toDateText(new Date());
  const todayTasks = tasks.filter(task => task.date === today).sort(sortTasks);
  for (const button of document.querySelectorAll("[data-home-task-period]")) {
    const period = button.dataset.homeTaskPeriod;
    const count = period === "all" ? todayTasks.length : todayTasks.filter(task => period === "completed" ? task.completed : !task.completed).length;
    const countLabel = button.querySelector("span");
    if (countLabel) countLabel.textContent = String(count);
    button.classList.toggle("is-active", period === homeTaskPeriod);
    button.setAttribute("aria-selected", String(period === homeTaskPeriod));
  }
  const visible = homeTaskPeriod === "all" ? todayTasks : todayTasks.filter(task => homeTaskPeriod === "completed" ? task.completed : !task.completed);
  dom.taskItems.append(...visible.map(task => taskRow(task, true)));
  const hasTasks = Boolean(dom.taskItems.querySelector(".task-row"));
  dom.taskItems.classList.toggle("has-tasks", hasTasks);
  if (dom.taskEmptyState) dom.taskEmptyState.hidden = hasTasks;
}

function renderHomeSidebar(tasks) {
  const today = toDateText(new Date());
  const todayTasks = tasks.filter(task => task.date === today);
  const completed = todayTasks.filter(task => task.completed).length;
  const percentage = todayTasks.length ? Math.round(completed / todayTasks.length * 100) : 0;
  const progress = document.querySelector("#home-summary-progress");
  const fill = document.querySelector("#home-summary-progress-fill");
  if (progress) progress.textContent = `${percentage}%`;
  if (fill) fill.style.width = `${percentage}%`;
  const upcoming = document.querySelector("#home-summary-upcoming");
  if (!upcoming) return;
  const due = tasks.filter(task => !task.completed && task.date >= today && task.title.trim()).sort(sortTasks).slice(0, 3);
  upcoming.classList.toggle("is-empty", due.length === 0);
  if (due.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No upcoming tasks";
    upcoming.replaceChildren(empty);
    return;
  }
  upcoming.replaceChildren(...due.map(task => {
    const row = document.createElement("p");
    const dot = document.createElement("i");
    dot.dataset.category = task.category;
    const title = document.createElement("span");
    title.textContent = task.title;
    const arrow = document.createElement("img");
    arrow.src = `${document.body.dataset.svgBase}buttons/arrow-right4.svg`;
    arrow.alt = "";
    row.append(dot, title, arrow);
    return row;
  }));
}

function sortTasks(a, b) { return `${a.date} ${a.time || "99:99"} ${a.created_at}`.localeCompare(`${b.date} ${b.time || "99:99"} ${b.created_at}`); }

function sortVisibleTasks(a, b) {
  if (taskState.sortMode === "priority-high" || taskState.sortMode === "priority-low") {
    const rank = { high: 3, medium: 2, low: 1 };
    const difference = (rank[a.priority] || 0) - (rank[b.priority] || 0);
    if (difference) return taskState.sortMode === "priority-high" ? -difference : difference;
  }
  const timeOrder = sortTasks(a, b);
  return taskState.sortMode === "time-desc" ? -timeOrder : timeOrder;
}

function syncTaskSectionToggle(section, collapsed, label, animate = false) {
  if (!section) return;
  const frame = section.querySelector(".tp-list-frame");
  const toggle = section.querySelector(".tp-section-toggle");
  toggle.setAttribute("aria-expanded", String(!collapsed));
  toggle.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${label} tasks`);
  toggle.querySelector("img").src = `${document.body.dataset.svgBase}buttons/${collapsed ? "arrow-right4" : "arrow-down4"}.svg`;
  if (!animate || !frame?.animate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    section._taskSectionMotion?.cancel();
    section._taskSectionMotion = null;
    if (frame) frame.style.overflow = "";
    delete section.dataset.animating;
    section.classList.toggle("is-collapsed", collapsed);
    return;
  }
  if (!collapsed) section.classList.remove("is-collapsed");
  const fullHeight = frame.offsetHeight;
  const paddingBottom = getComputedStyle(frame).paddingBottom;
  frame.style.overflow = "hidden";
  section.dataset.animating = "true";
  const expanded = { height: `${fullHeight}px`, paddingBottom };
  const folded = { height: "0px", paddingBottom: "0px" };
  const motion = frame.animate(collapsed ? [expanded, folded] : [folded, expanded], { duration: 260, easing: "cubic-bezier(.22, 1, .36, 1)" });
  section._taskSectionMotion = motion;
  motion.onfinish = () => {
    if (section._taskSectionMotion !== motion) return;
    section.classList.toggle("is-collapsed", collapsed);
    frame.style.overflow = "";
    delete section.dataset.animating;
    section._taskSectionMotion = null;
  };
}

function renderTaskPage() {
  if (!dom.taskPageList) return;
  const tasks = filteredTasks().sort(sortVisibleTasks);
  const isToday = taskState.view === "today";
  const isAll = taskState.view === "all";
  const today = toDateText(new Date());
  if (!isAll && dom.taskSecondarySection) dom.taskSecondarySection.hidden = true;
  if (isAll) {
    const current = tasks.filter(task => !task.date || task.date <= today);
    const upcoming = tasks.filter(task => task.date > today);
    dom.taskPageList.replaceChildren(...(current.length ? current.map(task => taskRow(task)) : [emptyState()]));
    const secondary = document.querySelector("#task-secondary-list");
    secondary?.replaceChildren(...upcoming.map(task => taskRow(task)));
    if (dom.taskSecondarySection) dom.taskSecondarySection.hidden = upcoming.length === 0;
  } else {
    dom.taskPageList.replaceChildren(...(tasks.length ? tasks.map(task => taskRow(task)) : [emptyState()]));
    if (dom.taskSecondarySection) dom.taskSecondarySection.hidden = true;
  }
  dom.taskPageList.closest(".tp-section")?.classList.toggle("is-empty-today", isToday && !tasks.length);
  const heading = isAll || isToday ? "Today" : taskState.view === "upcoming" ? "Upcoming" : "Completed";
  dom.taskViewHeading.textContent = heading;
  dom.taskViewCount.textContent = String(isAll ? tasks.filter(task => !task.date || task.date <= today).length : tasks.length);
  syncTaskSectionToggle(document.querySelector("#task-view-section"), collapsedTaskSections[taskState.view], heading);
  syncTaskSectionToggle(dom.taskSecondarySection, collapsedTaskSections.secondary, "Upcoming");
  const sectionIcon = dom.taskPageList.closest(".tp-section")?.querySelector(".tp-section-icon");
  if (sectionIcon) sectionIcon.src = `${document.body.dataset.svgBase}task/${taskState.view === "upcoming" ? "sand-timer" : taskState.view === "completed" ? "task-square" : "day"}.svg`;
  dom.taskPageList.setAttribute("aria-label", `${heading} task list`);
  dom.taskTabs.forEach(tab => tab.classList.toggle("tp-tab-current", tab.dataset.taskView === taskState.view));
  const counts = Object.fromEntries(["all", "today", "upcoming", "completed"].map(view => [view, filteredTasks(view).length]));
  dom.taskTabs.forEach(tab => { const count = counts[tab.dataset.taskView]; tab.querySelector("span").textContent = count > 0 ? String(count) : ""; });
}

function renderTaskSidebar(tasks) {
  const today = toDateText(new Date());
  const due = document.querySelector("#task-summary-due");
  if (due) {
    const next = tasks.filter(task => !task.completed && task.date >= today).sort(sortTasks).slice(0, 2);
    due.replaceChildren(...next.map(task => {
      const row = document.createElement("div");
      const dot = document.createElement("i"); dot.className = "tp-dot"; dot.dataset.category = task.category || "work";
      const label = document.createElement("span"); label.textContent = task.title;
      row.append(dot, label);
      return row;
    }));
  }
  const categories = document.querySelector("#task-summary-categories");
  if (categories) categories.replaceChildren(...["work", "design", "personal", "learning"].map(category => {
    const row = document.createElement("span");
    const dot = document.createElement("i"); dot.className = "tp-dot"; dot.dataset.category = category;
    const name = document.createElement("span"); name.textContent = labels[category];
    const count = document.createElement("span"); count.textContent = String(tasks.filter(task => task.category === category).length);
    row.append(dot, name, count);
    return row;
  }));
}

function renderAll() { renderHome(taskState.tasks); renderTaskPage(); renderHomeSidebar(taskState.tasks); renderTaskSidebar(taskState.tasks); }

export function loadTasks() {
  bridgeCall("getTasks", [], tasks => { taskState.tasks = Array.isArray(tasks) ? tasks : []; renderAll(); });
}

function addTask(values, onAdded = null, onFailed = null) { bridgeCall("addTask", [values], task => { if (task?.id) taskState.tasks.push(task); renderAll(); if (task?.id) onAdded?.(task); else onFailed?.(); }); }
function updateTask(id, changes, onUpdated = null, onFailed = null) { bridgeCall("updateTask", [id, changes], updated => { const index = taskState.tasks.findIndex(task => task.id === id); if (index >= 0 && updated?.id) taskState.tasks[index] = updated; renderAll(); if (updated?.id) onUpdated?.(updated); else onFailed?.(); }); }
function deleteTask(id) { bridgeCall("deleteTask", [id], removed => { if (removed) taskState.tasks = taskState.tasks.filter(task => task.id !== id); renderAll(); }); }

function completeTask(task, completed, row) {
  row.classList.toggle("is-completed", completed);
  row.classList.add("is-completing");
  bridgeCall("setTaskCompleted", [task.id, completed], updated => {
    const index = taskState.tasks.findIndex(item => item.id === task.id);
    if (index >= 0 && updated?.id) taskState.tasks[index] = updated;
    if (taskState.view === "today" || taskState.view === "all") {
      row.classList.remove("is-completing");
      renderHome(taskState.tasks);
      renderHomeSidebar(taskState.tasks);
      renderTaskPage();
      renderTaskSidebar(taskState.tasks);
      const completedTab = [...dom.taskTabs].find(tab => tab.dataset.taskView === "completed");
      if (completedTab) { const count = taskState.tasks.filter(item => item.completed).length; completedTab.querySelector("span").textContent = count ? String(count) : ""; }
      return;
    }
    setTimeout(() => { row.classList.add("is-leaving"); setTimeout(renderAll, 220); }, 600);
  });
}

function bindAddTaskDialog() {
  const backdrop = document.querySelector("#task-add-backdrop");
  const form = document.querySelector("#task-add-form");
  const title = document.querySelector("#task-add-name");
  const date = document.querySelector("#task-add-date");
  const dateLabel = document.querySelector("#task-add-date-label");
  const dateTrigger = document.querySelector("#task-add-date-trigger");
  const duration = document.querySelector("#task-add-duration");
  const durationLabel = document.querySelector("#task-add-duration-label");
  const durationTrigger = document.querySelector("#task-add-duration-trigger");
  const feedback = document.querySelector("#task-add-feedback");
  const submit = document.querySelector("#task-add-submit");
  const dialogTitle = document.querySelector("#task-add-title");
  let editingTask = null;
  let category = null;
  let priority = null;
  let calendar = null;
  const setDateLabel = () => {
    dateLabel.textContent = date.value ? new Intl.DateTimeFormat("en-US", { weekday: "short", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${date.value}T12:00:00`)) : "Choose a date";
  };
  const closeCalendar = () => { calendar?.remove(); calendar = null; dateTrigger.setAttribute("aria-expanded", "false"); };
  const close = () => { closeCalendar(); closeMenu(); backdrop.hidden = true; feedback.hidden = true; submit.disabled = false; document.querySelector("#task-header-add")?.focus(); };
  const open = (task = null) => {
    form.reset();
    editingTask = task;
    dialogTitle.textContent = task ? "Edit Task" : "Add Task";
    submit.textContent = task ? "Save" : "Add";
    category = task?.category || null;
    priority = task?.priority || null;
    for (const choice of form.querySelectorAll("[data-task-add-category],[data-task-add-priority]")) choice.setAttribute("aria-pressed", String(choice.dataset.taskAddCategory === category || choice.dataset.taskAddPriority === priority));
    title.value = task?.title || "";
    date.value = task?.date || toDateText(new Date());
    duration.value = task ? String(task.duration_minutes) : "45";
    durationLabel.textContent = formatDuration(Number(duration.value));
    setDateLabel();
    feedback.hidden = true;
    backdrop.hidden = false;
    title.focus();
  };
  openTaskEditDialog = task => open(task);
  document.querySelector("#task-header-add")?.addEventListener("click", () => open());
  dateTrigger.addEventListener("click", () => {
    if (calendar) { closeCalendar(); return; }
    closeMenu();
    calendar = createTaskDatePicker(() => date.value, value => { date.value = value; setDateLabel(); closeCalendar(); });
    calendar.classList.add("task-add-calendar-popover");
    document.body.appendChild(calendar);
    const triggerRect = dateTrigger.getBoundingClientRect();
    const pickerWidth = calendar.offsetWidth;
    const pickerHeight = calendar.offsetHeight;
    const left = Math.max(8, Math.min(triggerRect.left + (triggerRect.width - pickerWidth) / 2, window.innerWidth - pickerWidth - 8));
    const top = Math.max(8, triggerRect.top - pickerHeight - 8);
    calendar.style.left = `${left}px`;
    calendar.style.top = `${top}px`;
    dateTrigger.setAttribute("aria-expanded", "true");
  });
  durationTrigger.addEventListener("click", () => {
    closeCalendar();
    openDurationMenu(durationTrigger, Number(duration.value), minutes => { duration.value = String(minutes); durationLabel.textContent = formatDuration(minutes); });
  });
  document.addEventListener("pointerdown", event => {
    if (calendar && !calendar.contains(event.target) && !dateTrigger.contains(event.target)) closeCalendar();
  });
  window.addEventListener("resize", closeCalendar);
  for (const choice of form.querySelectorAll("[data-task-add-category],[data-task-add-priority]")) {
    choice.addEventListener("click", () => {
      const key = choice.dataset.taskAddCategory ? "taskAddCategory" : "taskAddPriority";
      const value = choice.dataset[key];
      if (key === "taskAddCategory") category = value;
      else priority = value;
      form.querySelectorAll(`[data-${key === "taskAddCategory" ? "task-add-category" : "task-add-priority"}]`).forEach(button => button.setAttribute("aria-pressed", String(button === choice)));
      feedback.hidden = true;
    });
  }
  document.querySelector("#task-add-close")?.addEventListener("click", close);
  document.querySelector("#task-add-cancel")?.addEventListener("click", close);
  backdrop.addEventListener("pointerdown", event => { if (event.target === backdrop) close(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !backdrop.hidden) { event.preventDefault(); close(); } });
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!title.value.trim()) {
      feedback.textContent = "Please enter a task title.";
      feedback.hidden = false;
      title.focus();
      return;
    }
    if (!category || !priority) {
      feedback.textContent = !category ? "Please choose a tag." : "Please choose a priority.";
      feedback.hidden = false;
      return;
    }
    if (!state.diaryBridge?.[editingTask ? "updateTask" : "addTask"]) { feedback.textContent = "Tasks are still loading. Please try again."; feedback.hidden = false; return; }
    submit.disabled = true;
    const values = { title: title.value.trim(), date: date.value, category, priority, duration_minutes: Number(duration.value) };
    const failed = () => {
      submit.disabled = false;
      feedback.textContent = "Could not save the task. Please try again.";
      feedback.hidden = false;
    };
    if (editingTask) updateTask(editingTask.id, values, close, failed);
    else addTask({ ...values, time: "", completed: false }, close, failed);
  });
}

function bindTaskFilter() {
  const trigger = document.querySelector("#task-filter-trigger");
  const popover = document.querySelector("#task-filter-popover");
  if (!trigger || !popover) return;
  const restore = () => {
    const { categories, priorities, status } = taskState.filters;
    popover.querySelectorAll('input[name="category"]').forEach(input => { input.checked = categories.includes(input.value); });
    popover.querySelectorAll('input[name="priority"]').forEach(input => { input.checked = priorities.includes(input.value); });
    popover.querySelector(`input[name="status"][value="${status}"]`).checked = true;
  };
  const close = () => { popover.hidden = true; trigger.setAttribute("aria-expanded", "false"); trigger.focus(); };
  trigger.addEventListener("click", () => {
    if (!popover.hidden) { close(); return; }
    closeMenu();
    restore();
    popover.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    popover.querySelector("input")?.focus();
  });
  document.querySelector("#task-filter-cancel")?.addEventListener("click", close);
  document.querySelector("#task-filter-reset")?.addEventListener("click", () => {
    taskState.filters = { categories: [], priorities: [], status: "all" };
    restore();
    trigger.classList.remove("has-active-filter");
    renderTaskPage();
  });
  popover.addEventListener("submit", event => {
    event.preventDefault();
    taskState.filters = {
      categories: [...popover.querySelectorAll('input[name="category"]:checked')].map(input => input.value),
      priorities: [...popover.querySelectorAll('input[name="priority"]:checked')].map(input => input.value),
      status: popover.querySelector('input[name="status"]:checked')?.value || "all",
    };
    const { categories, priorities, status } = taskState.filters;
    trigger.classList.toggle("has-active-filter", Boolean(categories.length || priorities.length || status !== "all"));
    renderTaskPage();
    close();
  });
  document.addEventListener("pointerdown", event => {
    if (!popover.hidden && !popover.contains(event.target) && !trigger.contains(event.target)) close();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !popover.hidden) { event.preventDefault(); close(); }
  });
}

function bindTaskSort() {
  const trigger = document.querySelector("#task-sort-trigger");
  if (!trigger) return;
  trigger.addEventListener("click", () => {
    if (taskState.menuTrigger === trigger) { closeMenu(); return; }
    closeMenu();
    const filter = document.querySelector("#task-filter-popover");
    if (filter) filter.hidden = true;
    document.querySelector("#task-filter-trigger")?.setAttribute("aria-expanded", "false");
    const menu = document.createElement("div");
    menu.className = "tp-floating-menu tp-sort-menu";
    menu.setAttribute("role", "menu");
    for (const [mode, label] of [
      ["time-asc", "Time: earliest first"],
      ["time-desc", "Time: latest first"],
      ["priority-high", "Priority: high first"],
      ["priority-low", "Priority: low first"],
    ]) {
      menu.appendChild(menuButton(label, "", () => {
        taskState.sortMode = mode;
        renderTaskPage();
      }, null, null, taskState.sortMode === mode));
    }
    positionMenu(menu, trigger);
  });
}

export function bindTaskEvents() {
  bindAddTaskDialog();
  bindTaskFilter();
  bindTaskSort();
  document.querySelectorAll("[data-task-section-toggle]").forEach(toggle => toggle.addEventListener("click", () => {
    if (toggle.closest(".tp-section")?.dataset.animating) return;
    const key = toggle.dataset.taskSectionToggle === "secondary" ? "secondary" : taskState.view;
    collapsedTaskSections[key] = !collapsedTaskSections[key];
    const label = key === "secondary" ? "Upcoming" : document.querySelector("#task-view-heading")?.textContent || "Task";
    syncTaskSectionToggle(toggle.closest(".tp-section"), collapsedTaskSections[key], label, true);
  }));
  document.querySelectorAll("[data-home-task-period]").forEach(button => button.addEventListener("click", () => {
    homeTaskPeriod = button.dataset.homeTaskPeriod;
    renderHome(taskState.tasks);
  }));
  dom.taskTabs.forEach(tab => tab.addEventListener("click", () => { taskState.view = tab.dataset.taskView; renderTaskPage(); }));
  document.addEventListener("pointerdown", event => { if (taskState.menu && !taskState.menu.contains(event.target) && !event.target.closest("#task-sort-trigger")) closeMenu(); });
  window.addEventListener("resize", closeMenu);
  renderAll();
}
