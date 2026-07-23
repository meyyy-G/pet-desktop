import { dom } from "./dom.js";

// 导航模块：只负责左侧导航和页面显示切换。

export function showPage(pageName) {
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
    item.addEventListener("click", () => {
      showPage(item.dataset.page);
    });
  });
}
