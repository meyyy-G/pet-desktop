import { dom } from "../dom.js";
import { state } from "../state.js";

let ready = false;
let sending = false;
const greeting = document.querySelector('.chat-message-assistant p')?.textContent || "I’m here whenever you’re ready.";
let statusTimer = null;
let statusClearTimer = null;

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
  const { content: text, role } = record;
  const message = document.createElement("article");
  message.className = `chat-message chat-message-${role}`;
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
    let pending = false;
    bookmark.addEventListener("click", async () => {
      if (pending) return;
      pending = true;
      bookmark.setAttribute("aria-busy", "true");
      try {
        const wasSaved = record.saved;
        const snippet = await callBridge(wasSaved ? "unsaveChatMessage" : "saveChatMessage", record.id);
        record.saved = !wasSaved;
        bookmark.classList.toggle("is-saved", record.saved);
        bookmark.setAttribute("aria-label", record.saved ? "Remove from diary" : "Save to today's diary");
        showStatus(record.saved
          ? "Saved to today's diary"
          : "Removed from today's diary");
        window.dispatchEvent(new CustomEvent("chat:snippet-changed", {
          detail: { ...snippet, saved: record.saved },
        }));
      } catch (error) { showError(error); }
      finally { pending = false; bookmark.removeAttribute("aria-busy"); }
    });
    textRow.append(bookmark);
  }
  body.append(textRow, time);
  message.append(body);
  return message;
}

function appendMessage(record) {
  dom.chatMessageList.append(createMessage(record));
  dom.chatMessageList.scrollTop = dom.chatMessageList.scrollHeight;
}

function resizeInput() {
  dom.chatSendButton.disabled = !ready || sending || !dom.chatInput.value.trim();
}

async function sendMessage() {
  const text = dom.chatInput.value.trim();
  if (!text || !ready || sending) return;
  sending = true;
  resizeInput();
  try {
    appendMessage(await callBridge("addChatMessage", "user", text));
    if (dom.chatInput.value.trim() === text) dom.chatInput.value = "";
    await new Promise(resolve => window.setTimeout(resolve, 350));
    appendMessage(await callBridge("addChatMessage", "assistant", "I’m listening. Take your time — what part of that feels most important to you right now?"));
  } catch (error) { showError(error); }
  finally { sending = false; resizeInput(); }
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
