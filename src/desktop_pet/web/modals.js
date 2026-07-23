import { dom } from "./dom.js";
import { state } from "./state.js";

// 弹窗模块：只控制弹窗显示、隐藏及其关联的待处理日期。

export function showFutureDateMessage() {
  dom.futureModal.classList.add("visible");
}

export function hideFutureDateMessage() {
  dom.futureModal.classList.remove("visible");
}

export function showUnsavedModal(dateText) {
  state.pendingDateText = dateText;
  dom.unsavedModal.classList.add("visible");
}

export function hideUnsavedModal() {
  state.pendingDateText = null;
  dom.unsavedModal.classList.remove("visible");
}
