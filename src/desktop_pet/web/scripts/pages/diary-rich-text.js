// Keep the existing two-argument Qt save call. The store unwraps this envelope
// into plain `text` and optional `html` fields in the diary JSON file.
export const RICH_TEXT_PREFIX = "\u001fpet-diary-rich-v1:";

export const DIARY_COLORS = Object.freeze([
  "#161412", "#7b7575", "#e45a59", "#e98b43",
  "#d6ad27", "#4e9a66", "#4c86d8", "#a272c3",
]);
export const DIARY_FONTS = Object.freeze(["Inter", "Geom", "Jost"]);

const allowedTags = new Set(["B", "STRONG", "I", "EM", "U", "H1", "H2", "P", "DIV", "BR", "UL", "OL", "LI", "SPAN", "FONT", "A", "IMG"]);
const discardedTags = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "SVG", "MATH", "FORM", "INPUT", "BUTTON"]);

export function allowedDiaryColor(value) {
  const color = String(value || "").trim().toLowerCase();
  if (DIARY_COLORS.includes(color)) return color;
  const match = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(color);
  if (!match || match.slice(1).some(part => Number(part) > 255)) return "";
  const hex = `#${match.slice(1).map(part => Number(part).toString(16).padStart(2, "0")).join("")}`;
  return DIARY_COLORS.includes(hex) ? hex : "";
}

function cleanNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
  if (node.nodeType !== Node.ELEMENT_NODE || discardedTags.has(node.tagName)) return document.createDocumentFragment();

  const fragment = document.createDocumentFragment();
  if (!allowedTags.has(node.tagName)) {
    for (const child of node.childNodes) fragment.append(cleanNode(child));
    return fragment;
  }

  const tag = node.tagName === "FONT" ? "span" : node.tagName.toLowerCase();
  const element = document.createElement(tag);
  if (tag === "img") {
    const src = node.getAttribute("src") || "";
    const name = node.getAttribute("data-diary-image") || "";
    if (!/^[a-f0-9-]{36}\.(?:png|jpg|jpeg|webp)$/i.test(name) || !/^file:\/\/\/.*\/journal\/images\/[a-f0-9-]{36}\.(?:png|jpg|jpeg|webp)$/i.test(src) || !src.endsWith(name)) return fragment;
    element.src = src;
    element.dataset.diaryImage = name;
    element.alt = node.getAttribute("alt")?.slice(0, 120) || "Diary photo";
    return element;
  }
  const color = allowedDiaryColor(node.style?.color || (node.tagName === "FONT" ? node.getAttribute("color") : ""));
  if (color) element.style.color = color;
  const font = DIARY_FONTS.find(value => value.toLowerCase() === String(node.style?.fontFamily || (node.tagName === "FONT" ? node.getAttribute("face") : "") || "").replaceAll(/["']/g, "").trim().toLowerCase());
  if (font) element.style.fontFamily = font;
  if (tag === "a") {
    const href = node.getAttribute("href") || "";
    if (/^https?:\/\//i.test(href)) element.setAttribute("href", href);
  }
  for (const child of node.childNodes) element.append(cleanNode(child));
  return element;
}

export function cleanDiaryHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html || "");
  const safe = document.createElement("div");
  for (const child of template.content.childNodes) safe.append(cleanNode(child));
  return safe.innerHTML;
}

export function diaryPlainText(editor) {
  return editor.innerText.replace(/\r/g, "");
}

export function diaryPayload(editor) {
  return RICH_TEXT_PREFIX + JSON.stringify({
    text: diaryPlainText(editor),
    html: cleanDiaryHtml(editor.innerHTML),
  });
}

export function showDiaryContent(editor, entry) {
  const html = cleanDiaryHtml(entry.html);
  if (html) editor.innerHTML = html;
  else editor.textContent = entry.text || "";
  updateDiaryPlaceholder(editor);
}

export function updateDiaryPlaceholder(editor) {
  editor.classList.toggle("is-empty", editor.textContent.length === 0 && !editor.querySelector("img[data-diary-image]"));
}

export function applyDiaryCommand(editor, command) {
  const commands = {
    undo: "undo", redo: "redo", bold: "bold", italic: "italic", underline: "underline",
    bullet: "insertUnorderedList", number: "insertOrderedList",
  };
  if (commands[command]) return document.execCommand(commands[command], false);
  if (command === "p" || command === "h1" || command === "h2") return document.execCommand("formatBlock", false, command);
  if (command === "rule") return document.execCommand("insertText", false, "\n---\n");
  return false;
}

export function applyDiaryColor(color) {
  if (!DIARY_COLORS.includes(color)) return false;
  return document.execCommand("foreColor", false, color);
}

export function applyDiaryFont(font) {
  if (!DIARY_FONTS.includes(font)) return false;
  return document.execCommand("fontName", false, font);
}

export function insertDiaryImage(editor, image) {
  if (!/^[a-f0-9-]{36}\.(?:png|jpg|jpeg|webp)$/i.test(image?.name || "") || !/^file:\/\/\/.*\/journal\/images\/[a-f0-9-]{36}\.(?:png|jpg|jpeg|webp)$/i.test(image?.url || "") || !image.url.endsWith(image.name)) return false;
  const selection = window.getSelection();
  if (!selection?.rangeCount || !editor.contains(selection.anchorNode)) return false;
  const range = selection.getRangeAt(0);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  const inserted = document.execCommand("insertHTML", false, `<img src="${image.url}" data-diary-image="${image.name}" alt="Diary photo">`);
  if (!inserted) return false;
  editor.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}
