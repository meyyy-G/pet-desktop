import { dom } from "../dom.js";
import { state, toDateText } from "../state.js";

const taskState = {
  tasks: [],
  view: "today",
  quickDate: toDateText(new Date()),
  calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  quickPeriod: "day",
  quickPriority: "medium",
  quickPriorityChosen: false,
  quickCategory: null,
  menu: null,
  menuTrigger: null,
};

const labels = { work: "Work", personal: "Personal", learning: "Learning", low: "Low", medium: "Medium", high: "High" };
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
  for (const button of [dom.taskDateSelect, dom.taskPrioritySelect]) button?.setAttribute("aria-expanded", "false");
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

function periodIcon(period) {
  const icon = document.createElement("i");
  icon.className = "tp-period-icon";
  icon.dataset.period = period;
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

function updateMenuCheck(menu, kind, value) {
  for (const button of menu.querySelectorAll("button")) {
    const marker = button.querySelector(`.tp-dot[data-${kind}]`);
    if (!marker) continue;
    button.querySelector(".tp-menu-check")?.remove();
    if (marker.dataset[kind] !== value) continue;
    const check = document.createElement("span");
    check.className = "tp-menu-check";
    check.textContent = "✓";
    button.appendChild(check);
  }
}

function openChoiceMenu(trigger, choices) {
  closeMenu();
  const menu = document.createElement("div");
  menu.className = "tp-floating-menu";
  menu.setAttribute("role", "menu");
  choices.forEach(choice => menu.appendChild(menuButton(...choice)));
  positionMenu(menu, trigger);
}

function openTaskMenu(task, row, trigger, compact) {
  const choices = [];
  if (compact) choices.push(["Edit", "", () => { const input = row.querySelector(".task-description"); input.focus(); input.select(); }]);
  choices.push(["Delete", "", () => deleteTask(task.id)]);
  openChoiceMenu(trigger, choices);
}

function updateTodayGroupProgress(period) {
  const group = dom.taskPageList?.querySelector(`.tp-period-group[data-period="${period}"]`);
  if (!group) return;
  const tasks = taskState.tasks.filter(task => task.date === toDateText(new Date()) && task.period === period);
  const completed = tasks.filter(task => task.completed).length;
  group.querySelector(".tp-period-fill").style.width = `${tasks.length ? completed / tasks.length * 100 : 0}%`;
  group.querySelector(".tp-period-count").textContent = `${completed}/${tasks.length}`;
  for (const task of tasks) {
    const row = [...group.querySelectorAll(".tp-row")].find(item => item.dataset.taskId === task.id);
    if (!row) continue;
    row.classList.toggle("is-completed", task.completed);
    const checkbox = row.querySelector(".tp-checkbox");
    checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label", task.completed ? "Mark task incomplete" : "Mark task completed");
  }
}

function markPeriodCompleted(period) {
  closeMenu();
  const tasks = taskState.tasks.filter(task => task.date === toDateText(new Date()) && task.period === period && !task.completed);
  const next = index => {
    if (index >= tasks.length) {
      updateTodayGroupProgress(period);
      renderHome(taskState.tasks);
      renderRightSidebar();
      const completedTab = [...dom.taskTabs].find(tab => tab.dataset.taskView === "completed");
      if (completedTab) { const count = taskState.tasks.filter(task => task.completed).length; completedTab.querySelector("span").textContent = count ? String(count) : ""; }
      return;
    }
    bridgeCall("setTaskCompleted", [tasks[index].id, true], updated => {
      const position = taskState.tasks.findIndex(task => task.id === updated?.id);
      if (position >= 0) taskState.tasks[position] = updated;
      next(index + 1);
    });
  };
  next(0);
}

function deletePeriodTasks(period) {
  closeMenu();
  const tasks = taskState.tasks.filter(task => task.date === toDateText(new Date()) && task.period === period);
  const next = index => {
    if (index >= tasks.length) { renderAll(); return; }
    bridgeCall("deleteTask", [tasks[index].id], removed => {
      if (removed) taskState.tasks = taskState.tasks.filter(task => task.id !== tasks[index].id);
      next(index + 1);
    });
  };
  next(0);
}

function openPeriodMenu(period, trigger) {
  if (taskState.menuTrigger === trigger) { closeMenu(); return; }
  openChoiceMenu(trigger, [
    ["Mark all completed", "", () => markPeriodCompleted(period)],
    ["Delete all", "", () => deletePeriodTasks(period)],
  ]);
}

function openDateMenu() {
  if (taskState.menu && taskState.menuTrigger === dom.taskDateSelect) {
    closeMenu();
    return;
  }
  closeMenu();
  const menu = document.createElement("div");
  menu.className = "tp-floating-menu tp-calendar-menu";
  menu.setAttribute("role", "menu");
  const calendarIcon = `${document.body.dataset.svgBase}task/calendar-add.svg`;
  const today = toDateText(new Date());
  const todayButton = menuButton("Today", formatShortDate(today), () => setQuickDate(today), null, calendarIcon);
  todayButton.classList.add("tp-calendar-today");
  const noDateButton = menuButton("No date", "", () => setQuickDate(""));
  noDateButton.classList.add("tp-calendar-no-date");
  menu.append(todayButton, noDateButton);
  const divider = document.createElement("div"); divider.className = "tp-menu-divider"; menu.appendChild(divider);
  const header = document.createElement("div"); header.className = "tp-calendar-heading";
  const monthLabel = document.createElement("span");
  const previous = document.createElement("button"); previous.type = "button"; previous.textContent = "‹"; previous.setAttribute("aria-label", "Previous month");
  const next = document.createElement("button"); next.type = "button"; next.textContent = "›"; next.setAttribute("aria-label", "Next month");
  previous.addEventListener("click", () => { taskState.calendarMonth = new Date(taskState.calendarMonth.getFullYear(), taskState.calendarMonth.getMonth() - 1, 1); renderDateGrid(); });
  next.addEventListener("click", () => { taskState.calendarMonth = new Date(taskState.calendarMonth.getFullYear(), taskState.calendarMonth.getMonth() + 1, 1); renderDateGrid(); });
  header.append(monthLabel, previous, next);
  const weekdayRow = document.createElement("div"); weekdayRow.className = "tp-calendar-weekdays";
  for (const day of ["M", "T", "W", "T", "F", "S", "S"]) { const item = document.createElement("span"); item.textContent = day; weekdayRow.appendChild(item); }
  const grid = document.createElement("div"); grid.className = "tp-calendar-grid";
  menu.append(header, weekdayRow, grid);
  function renderDateGrid() {
    const month = taskState.calendarMonth;
    monthLabel.textContent = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(month);
    grid.replaceChildren();
    const offset = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7;
    for (let index = 0; index < offset; index += 1) grid.appendChild(document.createElement("span"));
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= days; day += 1) {
      const date = toDateText(new Date(month.getFullYear(), month.getMonth(), day));
      const button = document.createElement("button"); button.type = "button"; button.textContent = String(day);
      button.classList.toggle("is-selected", date === taskState.quickDate);
      button.classList.toggle("is-today", date === today);
      button.setAttribute("aria-label", date);
      button.addEventListener("click", () => { setQuickDate(date); closeMenu(); });
      grid.appendChild(button);
    }
  }
  renderDateGrid();
  positionMenu(menu, dom.taskDateSelect);
}

function renderQuickPeriod() {
  document.querySelector(".tp-period-select")?.setAttribute("data-selected-period", taskState.quickPeriod);
  document.querySelectorAll("[data-quick-period]").forEach(button => {
    button.setAttribute("aria-pressed", String(button.dataset.quickPeriod === taskState.quickPeriod));
  });
}

function renderQuickPriority() {
  const button = dom.taskPrioritySelect;
  if (!button) return;
  const dot = button.querySelector(".tp-priority-selected-dot");
  const placeholderIcon = button.querySelector(".tp-priority-placeholder-icon");
  const label = button.querySelector("span");
  if (dot) dot.dataset.priority = taskState.quickPriority;
  dot?.toggleAttribute("hidden", !taskState.quickPriorityChosen);
  placeholderIcon?.toggleAttribute("hidden", taskState.quickPriorityChosen);
  if (taskState.quickPriorityChosen) button.dataset.selectedPriority = taskState.quickPriority;
  else delete button.dataset.selectedPriority;
  if (label) label.textContent = taskState.quickPriorityChosen ? labels[taskState.quickPriority] : "Priority";
}

function openPriorityMenu() {
  if (taskState.menu && taskState.menuTrigger === dom.taskPrioritySelect) {
    closeMenu();
    return;
  }
  closeMenu();
  const menu = document.createElement("div");
  menu.className = "tp-floating-menu tp-priority-category-menu";
  menu.setAttribute("role", "menu");
  const priorityHeading = document.createElement("div"); priorityHeading.className = "tp-menu-heading"; priorityHeading.textContent = "PRIORITY";
  menu.appendChild(priorityHeading);
  for (const value of ["low", "medium", "high"]) {
    menu.appendChild(menuButton(labels[value], "", () => {
      if (taskState.quickPriorityChosen && taskState.quickPriority === value) {
        taskState.quickPriority = "medium";
        taskState.quickPriorityChosen = false;
        renderQuickPriority();
        updateMenuCheck(menu, "priority", null);
        return;
      }
      taskState.quickPriority = value;
      taskState.quickPriorityChosen = true;
      renderQuickPriority();
      updateMenuCheck(menu, "priority", value);
    }, { kind: "priority", value }, null, taskState.quickPriorityChosen && taskState.quickPriority === value, false));
  }
  const divider = document.createElement("div"); divider.className = "tp-menu-divider"; menu.appendChild(divider);
  const categoryHeading = document.createElement("div"); categoryHeading.className = "tp-menu-heading"; categoryHeading.textContent = "CATEGORY";
  menu.appendChild(categoryHeading);
  for (const value of ["work", "personal", "learning"]) {
    menu.appendChild(menuButton(labels[value], "", () => {
      taskState.quickCategory = taskState.quickCategory === value ? null : value;
      updateMenuCheck(menu, "category", taskState.quickCategory);
    }, { kind: "category", value }, null, taskState.quickCategory === value, false));
  }
  positionMenu(menu, dom.taskPrioritySelect);
}

function setQuickDate(value) {
  taskState.quickDate = value;
  if (value) { const selected = new Date(`${value}T00:00:00`); taskState.calendarMonth = new Date(selected.getFullYear(), selected.getMonth(), 1); }
  const text = !value ? "No date" : value === toDateText(new Date()) ? "Today" : formatShortDate(value);
  dom.taskDateSelect.querySelector("span").textContent = text;
}

function filteredTasks() {
  const today = toDateText(new Date());
  if (taskState.view === "completed") return taskState.tasks.filter(task => task.completed);
  const open = taskState.tasks.filter(task => !task.completed);
  if (taskState.view === "today") return taskState.tasks.filter(task => task.date === today);
  if (taskState.view === "upcoming") return open.filter(task => task.date > today);
  return open;
}

function formatDuration(minutes) {
  const value = Number(minutes) || 15;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return hours ? `${hours}h${rest ? ` ${rest}m` : ""}` : `${rest}m`;
}

function openDurationMenu(task, trigger) {
  if (taskState.menuTrigger === trigger) { closeMenu(); return; }
  closeMenu();
  const menu = document.createElement("div"); menu.className = "tp-floating-menu tp-duration-menu"; menu.setAttribute("role", "menu");
  const heading = document.createElement("div"); heading.className = "tp-menu-heading"; heading.textContent = "Focus duration"; menu.appendChild(heading);
  for (const minutes of [15, 30, 45, 60, 120]) {
    const option = menuButton(formatDuration(minutes), "", () => { updateTask(task.id, { duration_minutes: minutes }); closeMenu(); }, null, null, minutes === task.duration_minutes);
    option.classList.toggle("is-selected", minutes === task.duration_minutes);
    menu.appendChild(option);
  }
  const divider = document.createElement("div"); divider.className = "tp-menu-divider"; menu.appendChild(divider);
  menu.appendChild(menuButton("Custom...", "", () => openCustomDuration(task, trigger)));
  positionMenu(menu, trigger);
}

function openCustomDuration(task, trigger) {
  closeMenu();
  const menu = document.createElement("div"); menu.className = "tp-floating-menu tp-custom-duration";
  const label = document.createElement("label"); label.textContent = "Minutes";
  const input = document.createElement("input"); input.type = "number"; input.min = "1"; input.max = "1440"; input.value = String(task.duration_minutes || 15);
  label.appendChild(input);
  const apply = document.createElement("button"); apply.type = "button"; apply.textContent = "Apply";
  apply.addEventListener("click", () => { const value = Number(input.value); if (Number.isInteger(value) && value >= 1 && value <= 1440) { updateTask(task.id, { duration_minutes: value }); closeMenu(); } else input.reportValidity(); });
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
    const timeIcon = document.createElement("img"); timeIcon.className = "tp-time-icon"; timeIcon.src = `${document.body.dataset.svgBase}task/timer-start.svg`; timeIcon.alt = "";
    const durationButton = document.createElement("button"); durationButton.type = "button"; durationButton.className = "tp-duration-button";
    durationButton.setAttribute("aria-label", `Focus duration ${formatDuration(task.duration_minutes)} for ${task.title}`);
    durationButton.setAttribute("aria-haspopup", "menu"); durationButton.setAttribute("aria-expanded", "false");
    durationButton.append(timeIcon, document.createTextNode(formatDuration(task.duration_minutes)));
    durationButton.addEventListener("click", () => openDurationMenu(task, durationButton));
    date.appendChild(durationButton);
    if (taskState.view !== "today") {
      const dateLabel = document.createElement("small"); dateLabel.className = "tp-row-date-label";
      dateLabel.textContent = task.date ? task.date === toDateText(new Date()) ? "Today" : formatShortDate(task.date) : "No date";
      date.appendChild(dateLabel);
    }
  }
  const remove = document.createElement("button"); remove.type = "button"; remove.className = compact ? "task-delete-button" : "tp-delete"; remove.setAttribute("aria-label", `Delete ${task.title}`);
  const more = document.createElement("img"); more.src = `${document.body.dataset.svgBase}task/3-dots-more.svg`; more.alt = ""; remove.appendChild(more);
  remove.addEventListener("click", () => openTaskMenu(task, row, remove, compact));
  if (compact) row.append(label, info, remove); else { main.append(label, info); actions.append(date, remove); row.append(main, actions); }
  checkbox.addEventListener("change", () => completeTask(task, checkbox.checked, row));
  if (compact) title.addEventListener("change", () => updateTask(task.id, { title: title.value.trim() }));
  if (task.completed) row.classList.add("is-completed");
  return row;
}

function emptyState() {
  const empty = document.createElement("div"); empty.className = "tp-empty-state";
  empty.innerHTML = `<img src="${document.body.dataset.svgBase}Segmented Control/receipt-add.svg" alt=""><strong>No Task yet</strong><small>add something small to started</small>`;
  return empty;
}

function renderHome(tasks) {
  if (!dom.taskItems) return;
  dom.taskItems.querySelectorAll(".task-row, .home-task-period, .home-task-period-list").forEach(element => element.remove());
  const today = toDateText(new Date());
  const todayTasks = tasks.filter(task => task.date === today);
  const openTasks = todayTasks.filter(task => !task.completed).sort(sortTasks);
  const periods = [
    { key: "day", label: "Day", icon: "Segmented Control/day.svg", tasks: openTasks.filter(task => task.period === "day") },
    { key: "night", label: "Night", icon: "Segmented Control/night.svg", tasks: openTasks.filter(task => task.period === "night") },
  ];
  for (const period of periods) {
    if (!openTasks.length) break;
    const periodAll = todayTasks.filter(task => task.period === period.key);
    const completed = periodAll.filter(task => task.completed).length;
    const total = periodAll.length;
    const heading = document.createElement("div");
    heading.className = "home-task-period";
    heading.dataset.period = period.key;
    const name = document.createElement("span");
    name.className = "home-task-period-name";
    const icon = document.createElement("img");
    icon.src = `${document.body.dataset.svgBase}${period.icon}`;
    icon.alt = "";
    name.append(icon, document.createTextNode(period.label));
    const progress = document.createElement("span");
    progress.className = "home-task-period-progress";
    const count = document.createElement("span");
    count.textContent = total ? `${completed}/${total}` : "0";
    const track = document.createElement("span");
    track.className = "home-task-progress-track";
    const fill = document.createElement("span");
    fill.className = "home-task-progress-fill";
    fill.style.setProperty("--task-progress", `${total ? completed / total * 100 : 0}%`);
    track.appendChild(fill);
    progress.append(count, track);
    heading.append(name, progress);
    const list = document.createElement("div");
    list.className = "home-task-period-list";
    list.dataset.period = period.key;
    list.append(...period.tasks.map(task => taskRow(task, true)));
    dom.taskItems.append(heading, list);
  }
  const hasTasks = Boolean(dom.taskItems.querySelector(".task-row"));
  dom.taskItems.classList.toggle("has-tasks", hasTasks);
  if (dom.taskEmptyState) dom.taskEmptyState.hidden = hasTasks;
}

function sortTasks(a, b) { return `${a.date} ${a.time || "99:99"} ${a.created_at}`.localeCompare(`${b.date} ${b.time || "99:99"} ${b.created_at}`); }

function renderTaskPage() {
  if (!dom.taskPageList) return;
  const tasks = filteredTasks().sort(sortTasks);
  const isToday = taskState.view === "today";
  if (isToday && tasks.length) {
    const groups = ["day", "night"].map(period => {
      const periodTasks = tasks.filter(task => task.period === period);
      const group = document.createElement("div"); group.className = "tp-period-group"; group.dataset.period = period;
      const header = document.createElement("div"); header.className = "tp-period-heading";
      const name = document.createElement("span"); name.className = "tp-period-name";
      name.append(periodIcon(period), document.createTextNode(period === "day" ? "Day" : "Night"));
      const progress = document.createElement("span"); progress.className = "tp-period-progress";
      const track = document.createElement("span"); track.className = "tp-period-track";
      const fill = document.createElement("span"); fill.className = "tp-period-fill";
      const periodAll = taskState.tasks.filter(task => task.date === toDateText(new Date()) && task.period === period);
      const completed = periodAll.filter(task => task.completed).length;
      fill.style.width = `${periodAll.length ? completed / periodAll.length * 100 : 0}%`;
      track.appendChild(fill);
      const count = document.createElement("span"); count.className = "tp-period-count"; count.textContent = `${completed}/${periodAll.length}`;
      const moreButton = document.createElement("button"); moreButton.type = "button"; moreButton.className = "tp-period-more"; moreButton.setAttribute("aria-label", `${period} task actions`); moreButton.setAttribute("aria-haspopup", "menu"); moreButton.setAttribute("aria-expanded", "false");
      const more = document.createElement("img"); more.src = `${document.body.dataset.svgBase}task/3-dots-more.svg`; more.alt = ""; moreButton.appendChild(more);
      moreButton.addEventListener("click", () => openPeriodMenu(period, moreButton));
      progress.append(track, count, moreButton); header.append(name, progress);
      const list = document.createElement("div"); list.className = "tp-period-list";
      list.append(...(periodTasks.length ? periodTasks.map(task => taskRow(task)) : [emptyState()]));
      group.append(header, list);
      return group;
    });
    dom.taskPageList.replaceChildren(...groups);
  } else {
    dom.taskPageList.replaceChildren(...(tasks.length ? tasks.map(task => taskRow(task)) : [emptyState()]));
  }
  const showPeriodGroups = isToday && tasks.length > 0;
  dom.taskPageList.classList.toggle("is-period-view", showPeriodGroups);
  dom.taskPageList.closest(".tp-list-frame")?.classList.toggle("is-period-view", showPeriodGroups);
  dom.taskPageList.closest(".tp-section")?.classList.toggle("is-period-view", showPeriodGroups);
  dom.taskPageList.closest(".tp-section")?.classList.toggle("is-empty-today", isToday && !tasks.length);
  const heading = taskState.view.toUpperCase();
  dom.taskViewHeading.textContent = heading;
  dom.taskViewCount.textContent = `· ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`;
  dom.taskPageList.setAttribute("aria-label", `${heading} task list`);
  dom.taskTabs.forEach(tab => tab.classList.toggle("tp-tab-current", tab.dataset.taskView === taskState.view));
  const today = toDateText(new Date());
  const counts = {
    today: taskState.tasks.filter(task => task.date === today).length,
    upcoming: taskState.tasks.filter(task => !task.completed && task.date > today).length,
    all: taskState.tasks.filter(task => !task.completed).length,
    completed: taskState.tasks.filter(task => task.completed).length,
  };
  dom.taskTabs.forEach(tab => { const count = counts[tab.dataset.taskView]; tab.querySelector("span").textContent = count > 0 ? String(count) : ""; });
  if (dom.taskSecondarySection) dom.taskSecondarySection.hidden = true;
}

function renderRightSidebar() {
  const today = toDateText(new Date());
  const todayTasks = taskState.tasks.filter(task => task.date === today);
  const completed = todayTasks.filter(task => task.completed).length;
  const percentage = todayTasks.length ? Math.round(completed / todayTasks.length * 100) : 0;
  if (dom.rightTaskProgressText) dom.rightTaskProgressText.textContent = `${percentage}%`;
  if (dom.rightTaskProgressFill) dom.rightTaskProgressFill.style.width = `${percentage}%`;
  if (dom.rightTaskCount) dom.rightTaskCount.textContent = `${completed}/${todayTasks.length} task`;
  if (dom.rightDueNext) {
    const due = taskState.tasks.filter(task => !task.completed && task.date >= today).sort(sortTasks).slice(0, 2);
    dom.rightDueNext.replaceChildren(...due.map(task => { const item = document.createElement("p"); item.className = "due-item"; const dot = document.createElement("i"); dot.className = "tag-dot"; dot.dataset.category = task.category; item.append(dot, document.createTextNode(task.title)); return item; }));
  }
}

function renderAll() { renderHome(taskState.tasks); renderTaskPage(); renderRightSidebar(); }

export function loadTasks() {
  bridgeCall("getTasks", [], tasks => { taskState.tasks = Array.isArray(tasks) ? tasks : []; renderAll(); });
}

function addTask(values, onAdded = null, onFailed = null) { bridgeCall("addTask", [values], task => { if (task?.id) taskState.tasks.push(task); renderAll(); if (task?.id) onAdded?.(task); else onFailed?.(); }); }
export function createHomeTask() {
  addTask(
    { title: "", date: toDateText(new Date()), time: "", period: "day", category: "work", priority: "medium", completed: false },
    task => dom.taskItems?.querySelector(`[data-task-id="${task.id}"] .task-description`)?.focus(),
  );
}
function updateTask(id, changes) { bridgeCall("updateTask", [id, changes], updated => { const index = taskState.tasks.findIndex(task => task.id === id); if (index >= 0 && updated?.id) taskState.tasks[index] = updated; renderAll(); }); }
function deleteTask(id) { bridgeCall("deleteTask", [id], removed => { if (removed) taskState.tasks = taskState.tasks.filter(task => task.id !== id); renderAll(); }); }

function completeTask(task, completed, row) {
  row.classList.toggle("is-completed", completed);
  row.classList.add("is-completing");
  bridgeCall("setTaskCompleted", [task.id, completed], updated => {
    const index = taskState.tasks.findIndex(item => item.id === task.id);
    if (index >= 0 && updated?.id) taskState.tasks[index] = updated;
    if (taskState.view === "today") {
      row.classList.remove("is-completing");
      updateTodayGroupProgress(task.period);
      renderHome(taskState.tasks);
      renderRightSidebar();
      const completedTab = [...dom.taskTabs].find(tab => tab.dataset.taskView === "completed");
      if (completedTab) { const count = taskState.tasks.filter(item => item.completed).length; completedTab.querySelector("span").textContent = count ? String(count) : ""; }
      return;
    }
    setTimeout(() => { row.classList.add("is-leaving"); setTimeout(renderAll, 220); }, 600);
  });
}

let quickAddPending = false;
let quickFeedbackTimer = null;
let quickSuccessTimer = null;

function clearQuickFeedback() {
  const feedback = document.querySelector("#task-quick-feedback");
  if (!feedback) return;
  window.clearTimeout(quickFeedbackTimer);
  feedback.classList.remove("is-visible");
  feedback.textContent = "";
}

function showQuickFeedback(message) {
  const feedback = document.querySelector("#task-quick-feedback");
  if (!feedback) return;
  window.clearTimeout(quickFeedbackTimer);
  feedback.textContent = message;
  feedback.classList.add("is-visible");
  quickFeedbackTimer = window.setTimeout(clearQuickFeedback, 3000);
}

function submitQuickTask() {
  if (quickAddPending) return;
  const title = dom.taskQuickTitle?.value.trim();
  if (!title) { showQuickFeedback("Please write a task first."); dom.taskQuickTitle?.focus(); return; }
  if (!taskState.quickPeriod) { showQuickFeedback("Please choose Day or Night."); return; }
  if (!taskState.quickPriorityChosen) { showQuickFeedback("Please choose a priority."); dom.taskPrioritySelect?.focus(); return; }
  if (!taskState.quickCategory) { showQuickFeedback("Please choose a category."); dom.taskPrioritySelect?.focus(); return; }
  if (!state.diaryBridge?.addTask) { showQuickFeedback("Tasks are still loading. Please try again."); return; }
  clearQuickFeedback();
  quickAddPending = true;
  dom.taskQuickAdd.disabled = true;
  addTask({ title, date: taskState.quickDate, time: "", period: taskState.quickPeriod, category: taskState.quickCategory, priority: taskState.quickPriority, completed: false }, () => {
    dom.taskQuickTitle.value = "";
    taskState.quickPriorityChosen = false;
    renderQuickPriority();
    dom.taskQuickAdd.classList.add("is-success");
    dom.taskQuickAdd.setAttribute("aria-label", "Task added");
    window.clearTimeout(quickSuccessTimer);
    quickSuccessTimer = window.setTimeout(() => {
      dom.taskQuickAdd.classList.remove("is-success");
      dom.taskQuickAdd.setAttribute("aria-label", "Add task");
      dom.taskQuickAdd.disabled = false;
      quickAddPending = false;
    }, 1200);
  }, () => {
    dom.taskQuickAdd.disabled = false;
    quickAddPending = false;
    showQuickFeedback("Could not add the task. Please try again.");
  });
}

export function bindTaskEvents() {
  document.querySelectorAll("[data-quick-period]").forEach(button => button.addEventListener("click", () => {
    taskState.quickPeriod = button.dataset.quickPeriod;
    renderQuickPeriod();
  }));
  dom.taskTabs.forEach(tab => tab.addEventListener("click", () => { taskState.view = tab.dataset.taskView; renderTaskPage(); }));
  dom.taskDateSelect?.addEventListener("click", openDateMenu);
  dom.taskPrioritySelect?.addEventListener("click", openPriorityMenu);
  dom.taskQuickAdd?.addEventListener("click", submitQuickTask);
  dom.taskQuickTitle?.addEventListener("input", clearQuickFeedback);
  dom.taskQuickTitle?.addEventListener("keydown", event => { if (event.key === "Enter") submitQuickTask(); });
  document.addEventListener("pointerdown", event => { if (taskState.menu && !taskState.menu.contains(event.target) && !event.target.closest("#task-date-select,#task-priority-select")) closeMenu(); });
  window.addEventListener("resize", closeMenu);
  renderAll();
}
