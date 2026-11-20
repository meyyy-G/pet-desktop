import { dom } from "./dom.js";

// 导航模块：只负责左侧导航和页面显示切换。

export function showPage(pageName) {
  const homeSidebar = document.querySelector(".home-right-sidebar");
  const taskSidebar = document.querySelector(".tp-sidebar");
  const focusCard = document.querySelector(".home-focus-card");
  const progressCard = document.querySelector(".home-progress-card");
  if (focusCard && progressCard && homeSidebar && taskSidebar) {
    if (pageName === "task") taskSidebar.prepend(focusCard, progressCard);
    else if (pageName === "home") {
      const upcomingCard = homeSidebar.querySelector(".home-upcoming-card");
      homeSidebar.insertBefore(focusCard, upcomingCard);
      homeSidebar.insertBefore(progressCard, upcomingCard);
    }
  }
  if (dom.app) dom.app.dataset.activePage = pageName;

  dom.navItems.forEach((item) => {
    item.classList.toggle("active", item.dataset.page === pageName);
  });

  dom.pages.forEach((page) => {
    page.classList.toggle("active", page.id === pageName);
  });

  // 所有页面切换（包括程序自动切换）都通过同一个事件通知入口模块。
  window.dispatchEvent(
    new CustomEvent("diary:page-changed", {
      detail: { pageName },
    }),
  );
}

/** 注册一次导航点击事件，由入口 app.js 调用。 */
export function bindNavigationEvents() {
  dom.navItems.forEach((item) => {
    item.title = item.textContent.trim();
    item.addEventListener("click", () => {
      showPage(item.dataset.page);
    });
  });

  dom.taskAddButton?.addEventListener("click", () => showPage("task"));
  document.querySelector("#home-empty-add-task")?.addEventListener("click", () => {
    showPage("task");
    document.querySelector("#task-header-add")?.click();
  });
}
