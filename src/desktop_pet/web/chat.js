import { dom } from "./dom.js";


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
    icon.src = "./assets/heart-circle.svg";
    icon.alt = "";
    message.append(icon);
  }

  const body = document.createElement("div");
  const content = document.createElement("p");
  const time = document.createElement("time");
  content.textContent = text;
  time.textContent = getTimeLabel();
  body.append(content, time);
  message.append(body);
  return message;
}

function appendMessage(text, role) {
  dom.chatMessageList.append(createMessage(text, role));
  dom.chatMessageList.scrollTop = dom.chatMessageList.scrollHeight;
}

function resizeInput() {
  dom.chatInput.style.height = "60px";
  dom.chatInput.style.height = `${Math.min(130, Math.max(60, dom.chatInput.scrollHeight))}px`;
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
