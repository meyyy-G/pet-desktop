import { state } from "../state.js";

const storageKey = "pet-desktop-profile-name";
let displayName = "Mey";
let browserAvatarUrl = "";
const defaultAvatarUrl = document.querySelector("[data-profile-avatar]")?.src || "";

export function getDisplayName() {
  return displayName;
}

function renderDisplayName() {
  document.querySelectorAll("[data-user-name]").forEach(element => { element.textContent = displayName; });
  const input = document.querySelector("#profile-display-name");
  if (input && document.activeElement !== input) input.value = displayName;
  window.dispatchEvent(new CustomEvent("user:profile-changed", { detail: { displayName } }));
}

function renderAvatar(url) {
  document.querySelectorAll("[data-profile-avatar]").forEach(image => {
    image.src = url || defaultAvatarUrl;
    image.classList.toggle("has-photo", Boolean(url));
  });
}

function closeMenu() {
  const menu = document.querySelector("#profile-menu");
  const trigger = document.querySelector("#profile-trigger");
  if (!menu || !trigger) return;
  menu.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
}

function openMenu() {
  const menu = document.querySelector("#profile-menu");
  const trigger = document.querySelector("#profile-trigger");
  if (!menu || !trigger) return;
  const rect = trigger.getBoundingClientRect();
  menu.hidden = false;
  const menuWidth = menu.getBoundingClientRect().width;
  const rightSide = rect.right + 12;
  menu.style.left = `${rightSide + menuWidth <= window.innerWidth - 8 ? rightSide : Math.max(8, window.innerWidth - menuWidth - 8)}px`;
  menu.style.top = `${Math.max(8, Math.min(rect.top, window.innerHeight - menu.offsetHeight - 8))}px`;
  trigger.setAttribute("aria-expanded", "true");
  menu.querySelector("#profile-menu-profile")?.focus();
}

function closeProfileDialog() {
  const dialog = document.querySelector("#profile-dialog");
  if (!dialog || dialog.hidden) return;
  dialog.hidden = true;
  document.querySelector("#profile-trigger")?.focus();
}

function openProfileDialog() {
  const dialog = document.querySelector("#profile-dialog");
  dialog.hidden = false;
  document.querySelector("#profile-display-name").value = displayName;
  document.querySelector("#profile-status").textContent = "";
  document.querySelector("#profile-display-name").focus();
}

export function loadProfileFromBridge(bridge) {
  bridge.getProfile(result => {
    if (!result?.ok || typeof result.data?.displayName !== "string") return;
    displayName = result.data.displayName.trim() || "Mey";
    renderDisplayName();
    renderAvatar(result.data.avatarUrl || "");
  });
}

export function bindProfileEvents() {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (stored?.trim()) displayName = stored.trim().slice(0, 32);
  } catch { /* Local storage may be unavailable in an embedded preview. */ }
  renderDisplayName();

  const trigger = document.querySelector("#profile-trigger");
  const menu = document.querySelector("#profile-menu");
  trigger?.addEventListener("click", event => {
    event.stopPropagation();
    if (menu.hidden) openMenu(); else closeMenu();
  });
  menu?.addEventListener("click", event => event.stopPropagation());
  document.addEventListener("click", closeMenu);
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || menu?.hidden) return;
    closeMenu();
    trigger?.focus();
  });
  document.querySelector("#profile-menu-profile")?.addEventListener("click", () => {
    closeMenu();
    openProfileDialog();
  });
  document.querySelector("#profile-close")?.addEventListener("click", closeProfileDialog);
  document.querySelector("#profile-cancel")?.addEventListener("click", closeProfileDialog);
  document.querySelector("#profile-dialog")?.addEventListener("click", event => {
    if (event.target === event.currentTarget) closeProfileDialog();
  });
  document.querySelector("#profile-dialog")?.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); closeProfileDialog(); return; }
    if (event.key !== "Tab") return;
    const controls = [...event.currentTarget.querySelectorAll("button:not(:disabled), input:not(:disabled):not([hidden])")];
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  document.querySelector("#profile-avatar-upload")?.addEventListener("click", () => {
    const status = document.querySelector("#profile-status");
    if (state.diaryBridge?.chooseProfileAvatar) {
      state.diaryBridge.chooseProfileAvatar(result => {
        if (result?.ok && result.data?.avatarUrl) { renderAvatar(result.data.avatarUrl); status.textContent = "Photo saved"; }
        else if (!result?.cancelled) status.textContent = result?.error || "Could not save the photo.";
      });
      return;
    }
    document.querySelector("#profile-avatar-file")?.click();
  });
  document.querySelector("#profile-avatar-file")?.addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const status = document.querySelector("#profile-status");
    if (!/\.(png|jpe?g)$/i.test(file.name) || !["image/png", "image/jpeg"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      status.textContent = "Choose a PNG or JPG/JPEG image under 10 MB.";
      return;
    }
    if (browserAvatarUrl) URL.revokeObjectURL(browserAvatarUrl);
    browserAvatarUrl = URL.createObjectURL(file);
    renderAvatar(browserAvatarUrl);
    status.textContent = "Photo preview (saved in desktop app only)";
  });
  document.querySelector("#profile-form")?.addEventListener("submit", event => {
    event.preventDefault();
    const value = document.querySelector("#profile-display-name").value.trim();
    if (!value) return;
    const status = document.querySelector("#profile-status");
    const saveButton = document.querySelector('#profile-form button[type="submit"]');
    if (state.diaryBridge?.saveProfile) {
      status.textContent = "Saving...";
      saveButton.disabled = true;
      state.diaryBridge.saveProfile(value, result => {
        saveButton.disabled = false;
        if (!result?.ok) { status.textContent = result?.error || "Could not save your name."; return; }
        displayName = result.data.displayName;
        renderDisplayName();
        closeProfileDialog();
      });
      return;
    }
    displayName = value;
    try { window.localStorage.setItem(storageKey, value); status.textContent = "Saved"; }
    catch { status.textContent = "Saved for this session"; }
    renderDisplayName();
    closeProfileDialog();
  });
}
