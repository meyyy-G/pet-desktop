import { dom } from "../dom.js";
import { state } from "../state.js";
import { getDisplayName } from "./profile.js";

let ready = false;
let sending = false;
const greeting = document.querySelector('.chat-message-assistant p')?.textContent || "I’m here whenever you’re ready.";
const formatGreeting = () => greeting.replace("Mey.", `${getDisplayName()}.`);
window.addEventListener("user:profile-changed", () => {
  if (!ready) {
    const initial = document.querySelector('.chat-message-assistant p');
    if (initial) initial.textContent = formatGreeting();
  }
  document.querySelectorAll('.chat-message-assistant[data-default-greeting="true"] .chat-message-text p').forEach(element => {
    element.textContent = formatGreeting();
  });
});
let statusTimer = null;
let statusClearTimer = null;
const pendingSaves = new Set();

function showStatus(text) {
  const status = document.querySelector('#chat-save-status');
  if (!status) return;
  window.clearTimeout(statusTimer);
  window.clearTimeout(statusClearTimer);
  status.textContent = text;
  status.classList.add('is-visible');
  statusTimer = window.setTimeout(() => {
    status.classList.remove('is-visible');
    statusClearTimer = window.setTimeout(() => { status.textContent = ''; }, 250);
  }, 3000);
}

function callBridge(method, ...args) {
  return new Promise((resolve, reject) => {
    if (!state.diaryBridge?.[method]) return reject(new Error("Chat is still loading. Please try again."));
    state.diaryBridge[method](...args, result => result?.ok ? resolve(result.data) : reject(new Error(result?.error || "Could not save. Please try again.")));
  });
}

function showError(error) {
  showStatus(error?.message || "Could not save. Please try again.");
}

async function toggleSavedMessage(record, bookmark = null) {
  if (pendingSaves.has(record.id)) return;
  pendingSaves.add(record.id);
  bookmark?.setAttribute("aria-busy", "true");
  try {
    const wasSaved = Boolean(record.saved);
    const snippet = await callBridge(wasSaved ? "unsaveChatMessage" : "saveChatMessage", record.id);
    record.saved = !wasSaved;
    if (bookmark) {
      bookmark.classList.toggle("is-saved", record.saved);
      const label = record.saved ? "Remove from diary" : "Save to today's diary";
      bookmark.setAttribute("aria-label", label);
      bookmark.title = label;
    }
    showStatus(record.saved ? "Saved to today's diary" : "Removed from today's diary");
    window.dispatchEvent(new CustomEvent("chat:snippet-changed", {
      detail: { ...snippet, saved: record.saved },
    }));
  } catch (error) {
    showError(error);
  } finally {
    pendingSaves.delete(record.id);
    bookmark?.removeAttribute("aria-busy");
  }
}

function editUserMessage(record, message) {
  const body = message.querySelector(".chat-message-body");
  if (body.classList.contains("is-editing")) return;
  const row = body.querySelector(".chat-message-text");
  const content = row.querySelector("p");
  const editor = document.createElement("textarea");
  editor.className = "chat-message-editor";
  editor.value = record.content;
  editor.rows = Math.max(2, record.content.split("\n").length);
  editor.setAttribute("aria-label", "Edit your message");
  const actions = document.createElement("div");
  actions.className = "chat-message-edit-actions";
  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "Save";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  actions.append(save, cancel);
  const finish = () => {
    editor.remove();
    actions.remove();
    content.hidden = false;
    body.classList.remove("is-editing");
  };
  const saveEdit = async () => {
    if (save.disabled) return;
    if (!editor.value.trim()) return showStatus("Message cannot be empty.");
    save.disabled = true;
    cancel.disabled = true;
    try {
      const updated = await callBridge("updateChatMessage", record.id, editor.value);
      record.content = updated.content;
      record.saved = updated.saved;
      content.textContent = updated.content;
      finish();
      if (updated.saved_date) {
        window.dispatchEvent(new CustomEvent("chat:snippet-changed", {
          detail: { date: updated.saved_date, saved: true },
        }));
      }
    } catch (error) {
      showError(error);
      save.disabled = false;
      cancel.disabled = false;
    }
  };
  save.addEventListener("click", saveEdit);
  cancel.addEventListener("click", finish);
  editor.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); if (!cancel.disabled) finish(); }
    else if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); saveEdit(); }
  });
  body.classList.add("is-editing");
  content.hidden = true;
  row.append(editor);
  body.insertBefore(actions, body.querySelector(".chat-message-meta") || body.querySelector("time"));
  editor.focus();
  editor.setSelectionRange(editor.value.length, editor.value.length);
}

async function copyMessageText(content) {
  try {
    await navigator.clipboard.writeText(content);
  } catch {
    const temporary = document.createElement("textarea");
    temporary.value = content;
    temporary.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.append(temporary);
    temporary.select();
    const copied = document.execCommand("copy");
    temporary.remove();
    if (!copied) {
      showStatus("Copy failed.");
      return false;
    }
  }
  showStatus("Copied.");
  return true;
}

function createUserAction(label, asset) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "chat-user-action";
  button.setAttribute("aria-label", label);
  button.title = label;
  const icon = document.createElement("img");
  icon.src = `${document.body.dataset.svgBase}chat/${asset}`;
  icon.alt = "";
  button.append(icon);
  return button;
}

export async function loadChat() {
  try {
    const messages = await callBridge("getChatMessages");
    if (!messages.length) messages.push(await callBridge("addChatMessage", "assistant", greeting));
    dom.chatMessageList.replaceChildren(...messages.map(createMessage));
    ready = true;
    resizeInput();
  } catch (error) { showError(error); }
}

function getTimeLabel(createdAt) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(createdAt)).replace(" ", "");
}

function createMessage(record) {
  const { role } = record;
  const defaultGreeting = role === "assistant" && (record.content === greeting || record.content === greeting.replace("Mey.", "Emma."));
  const text = defaultGreeting ? formatGreeting() : record.content;
  const message = document.createElement("article");
  message.className = `chat-message chat-message-${role}`;
  if (defaultGreeting) message.dataset.defaultGreeting = "true";
  message.dataset.messageId = record.id;

  if (role === "assistant") {
    const icon = document.createElement("img");
    icon.src = `${document.body.dataset.svgBase}chat/heart-circle.svg`;
    icon.alt = "";
    icon.className = "chat-avatar";
    message.append(icon);
  }

  const body = document.createElement("div");
  body.className = "chat-message-body";
  const textRow = document.createElement("div");
  textRow.className = "chat-message-text";
  const content = document.createElement("p");
  const time = document.createElement("time");
  content.textContent = text;
  time.textContent = getTimeLabel(record.created_at);
  textRow.append(content);
  if (role === "assistant") {
    const bookmark = document.createElement("button");
    bookmark.type = "button";
    bookmark.className = "chat-bookmark";
    bookmark.classList.toggle("is-saved", record.saved);
    bookmark.setAttribute("aria-label", record.saved ? "Remove from diary" : "Save to today's diary");
    const icon = document.createElement("img");
    icon.src = `${document.body.dataset.svgBase}chat/bookmark.svg`;
    icon.alt = "";
    icon.className = "chat-bookmark-default";
    const savedIcon = document.createElement("img");
    savedIcon.src = `${document.body.dataset.svgBase}chat/save-minus.svg`;
    savedIcon.alt = "";
    savedIcon.className = "chat-bookmark-saved";
    bookmark.append(icon, savedIcon);
    bookmark.addEventListener("click", () => toggleSavedMessage(record, bookmark));
    textRow.append(bookmark);
  }
  if (role === "user") {
    const meta = document.createElement("div");
    meta.className = "chat-message-meta";
    meta.append(time);
    body.append(textRow, meta);
  } else {
    body.append(textRow, time);
  }
  message.append(body);
  if (role === "user" && !String(record.id).startsWith("pending-")) {
    body.tabIndex = 0;
    const actions = document.createElement("div");
    actions.className = "chat-user-actions";
    actions.setAttribute("role", "group");
    actions.setAttribute("aria-label", "Message actions");
    const copy = createUserAction("Copy", "copy.svg");
    copy.classList.add("chat-user-copy");
    const copiedMark = document.createElement("span");
    copiedMark.className = "chat-copy-check";
    copiedMark.textContent = "✓";
    copiedMark.setAttribute("aria-hidden", "true");
    copy.append(copiedMark);
    const edit = createUserAction("Edit", "edit.svg");
    const bookmark = createUserAction(record.saved ? "Remove from diary" : "Save to today's diary", "bookmark.svg");
    bookmark.classList.add("chat-user-bookmark");
    bookmark.classList.toggle("is-saved", record.saved);
    const savedIcon = document.createElement("img");
    savedIcon.src = `${document.body.dataset.svgBase}chat/save-minus.svg`;
    savedIcon.alt = "";
    savedIcon.className = "chat-user-bookmark-saved";
    bookmark.append(savedIcon);
    let copyResetTimer = null;
    copy.addEventListener("click", async () => {
      if (!await copyMessageText(record.content)) return;
      window.clearTimeout(copyResetTimer);
      copy.classList.remove("is-copied");
      void copy.offsetWidth;
      copy.classList.add("is-copied");
      copy.setAttribute("aria-label", "Copied");
      copy.title = "Copied";
      copyResetTimer = window.setTimeout(() => {
        copy.classList.remove("is-copied");
        copy.setAttribute("aria-label", "Copy");
        copy.title = "Copy";
      }, 1500);
    });
    edit.addEventListener("click", () => editUserMessage(record, message));
    bookmark.addEventListener("click", () => toggleSavedMessage(record, bookmark));
    actions.append(copy, bookmark, edit);
    body.querySelector(".chat-message-meta").append(actions);
  }
  return message;
}

function appendMessage(record) {
  const message = createMessage(record);
  dom.chatMessageList.append(message);
  dom.chatMessageList.scrollTop = dom.chatMessageList.scrollHeight;
  return message;
}

function createReplyPlaceholder() {
  const message = document.createElement("article");
  message.className = "chat-message chat-message-assistant chat-reply-placeholder";
  message.dataset.replyState = "sending";
  message.setAttribute("role", "status");
  const icon = document.createElement("img");
  icon.src = `${document.body.dataset.svgBase}chat/heart-circle.svg`;
  icon.alt = "";
  icon.className = "chat-avatar";
  const body = document.createElement("div");
  body.className = "chat-message-body";
  const row = document.createElement("div");
  row.className = "chat-message-text";
  const content = document.createElement("p");
  content.textContent = "Thinking...";
  row.append(content);
  body.append(row);
  message.append(icon, body);
  dom.chatMessageList.append(message);
  dom.chatMessageList.scrollTop = dom.chatMessageList.scrollHeight;
  return message;
}

function setReplyFailed(message, error, userMessage) {
  message.dataset.replyState = "failed";
  const row = message.querySelector(".chat-message-text");
  row.querySelector("p").textContent = error?.message || "Reply failed. Please try again.";
  const retry = document.createElement("button");
  retry.type = "button";
  retry.className = "chat-retry-button";
  retry.textContent = "Retry";
  retry.addEventListener("click", () => requestReply(userMessage, message));
  row.append(retry);
}

async function requestReply(userMessage, placeholder) {
  if (sending) return;
  sending = true;
  placeholder.dataset.replyState = "sending";
  placeholder.querySelector("p").textContent = "Thinking...";
  placeholder.querySelector(".chat-retry-button")?.remove();
  resizeInput();
  try {
    const reply = await callBridge("requestChatReply", userMessage.id);
    const content = typeof reply === "string" ? reply.trim() : reply?.content?.trim();
    if (!content) throw new Error("No reply was returned. Please try again.");
    const saved = await callBridge("addChatMessage", "assistant", content);
    const message = createMessage(saved);
    message.dataset.replyState = "success";
    placeholder.replaceWith(message);
  } catch (error) {
    setReplyFailed(placeholder, error, userMessage);
  } finally {
    sending = false;
    resizeInput();
  }
}

function resizeInput() {
  dom.chatSendButton.disabled = !ready || sending || !dom.chatInput.value.trim();
}

async function sendMessage() {
  const text = dom.chatInput.value.trim();
  if (!text || !ready || sending) return;
  sending = true;
  resizeInput();
  const optimistic = appendMessage({
    id: `pending-${Date.now()}`,
    role: "user",
    content: text,
    created_at: new Date().toISOString(),
  });
  const placeholder = createReplyPlaceholder();
  dom.chatInput.value = "";
  try {
    const saved = await callBridge("addChatMessage", "user", text);
    optimistic.replaceWith(createMessage(saved));
    sending = false;
    await requestReply(saved, placeholder);
  } catch (error) {
    optimistic.remove();
    placeholder.remove();
    if (!dom.chatInput.value) dom.chatInput.value = text;
    showError(error);
  } finally {
    sending = false;
    resizeInput();
  }
}

export function bindChatEvents() {
  if (!dom.chatComposeForm || !dom.chatInput) return;

  dom.chatComposeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage();
  });

  dom.chatInput.addEventListener("input", resizeInput);
  dom.chatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  resizeInput();
}
