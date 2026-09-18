import { dom } from "../dom.js";


function getTimeLabel() {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date()).replace(" ", "");
}

function createMessage(text, role) {
  const message = document.createElement("article");
  message.className = `chat-message chat-message-${role}`;

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
  time.textContent = getTimeLabel();
  textRow.append(content);
  if (role === "assistant") {
    const bookmark = document.createElement("span");
    bookmark.className = "chat-bookmark";
    const icon = document.createElement("img");
    icon.src = `${document.body.dataset.svgBase}chat/bookmark.svg`;
    icon.alt = "Bookmark";
    bookmark.append(icon);
    textRow.append(bookmark);
  }
  body.append(textRow, time);
  message.append(body);
  return message;
}

function appendMessage(text, role) {
  dom.chatMessageList.append(createMessage(text, role));
  dom.chatMessageList.scrollTop = dom.chatMessageList.scrollHeight;
}

function resizeInput() {
  dom.chatSendButton.disabled = !dom.chatInput.value.trim();
}

function sendMessage() {
  const text = dom.chatInput.value.trim();
  if (!text) return;

  appendMessage(text, "user");
  dom.chatInput.value = "";
  resizeInput();

  window.setTimeout(() => {
    appendMessage("I’m listening. Take your time — what part of that feels most important to you right now?", "assistant");
  }, 350);
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
