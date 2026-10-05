const DEFAULT_SETTINGS = {
  copyButtons: true,
  restoreDeleted: false,
  recoveryOptedIn: false,
  blurContactNames: false,
  blurContactPhotos: false,
  blurRecentMessages: false,
  blurChatList: false,
  blurMessages: false,
  hideStatus: false,
  hideChannels: false,
  hideCommunities: false,
  hideMetaAi: false,
  hideEmojis: false,
  hideGifs: false,
  hideStickers: false,
  disableReadReceipts: false,
  readReceiptsOptedIn: false,
  localPinsOptedIn: false,
  localPins: false
};

const CHAT_ROW_SELECTOR = '[role="grid"] [role="row"], [aria-label="Chat list"] [role="row"], [data-testid="cell-frame-container"]';
const CHAT_LIST_SELECTOR = '[aria-label="Chat list"], [data-testid="chat-list"], #pane-side, [data-testid="cell-frame-container"]';
const MESSAGE_CACHE_LIMIT = 2000;
const MESSAGE_TEXT_LIMIT = 4000;
const MESSAGE_CACHE_CHAR_BUDGET = 1500000;
const BUTTON_SIZE = 30;
const BUTTON_GAP = 6;
const HIDE_DELAY_MS = 140;
const MESSAGE_SELECTOR = "div[data-id], .message-in, .message-out";
const RESTORE_UI_SELECTOR = ".pwat-deleted-restore, .pwat-deleted-empty";
const OWN_UI_SELECTOR = `${RESTORE_UI_SELECTOR}, .pwat-copy-button`;
const RECALL_ICON_SELECTOR = [
  "[data-icon='recalled']",
  "[data-icon='msg-dblcheck-recalled']",
  "[data-icon='msg-recalled']",
  "[data-icon='revoked']",
  "[data-icon='status-deleted']",
  "[data-testid='recalled']"
].join(", ");

const state = {
  settings: { ...DEFAULT_SETTINGS },
  messageCache: new Map(),
  pendingMessages: new Map(),
  cacheGeneration: 0,
  clearedNodes: new WeakSet(),
  observedMessages: new WeakMap(),
  pinnedChats: new Set(),
  lastChatAction: null,
  observer: null,
  disposed: false,
  initialized: false
};

// The floating copy button lives on document.body, outside WhatsApp's React
// tree, so React re-renders of a message row can never detach or hide it.
const overlay = {
  button: null,
  activeNode: null,
  hideTimer: null,
  frame: null,
  resetTimer: null
};

const deletedTextPatterns = [
  "this message was deleted",
  "you deleted this message",
  "this message has been deleted",
  "message was deleted"
];

let initialStorageChanges = {};

if (typeof window !== "undefined" && !window.__PWAT_DISABLE_AUTO_INIT__) {
  window.__PWAT_CONTENT_DISPOSE__?.();
  window.__PWAT_CONTENT_DISPOSE__ = dispose;
  window.addEventListener("error", handleWindowError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);
  init().catch((error) => {
    if (!isExtensionContextInvalidated(error)) throw error;
  });
}

async function init() {
  if (state.initialized) return;
  state.initialized = true;

  document.querySelectorAll(".pwat-copy-button, .pwat-deleted-restore, .pwat-deleted-empty").forEach((el) => el.remove());

  // Listen before reading: a popup can clear the cache while this read is in
  // flight. Apply those changes to the snapshot before displaying any recovery.
  chrome.storage.onChanged.addListener(handleSettingsChanged);
  const stored = await chrome.storage.local.get(["settings", "pinnedChats", "messageCache", "messageCacheGeneration"]);
  if (state.disposed) return;
  for (const [key, change] of Object.entries(initialStorageChanges)) stored[key] = change.newValue;
  initialStorageChanges = null;
  state.settings = normalizeSettings(stored.settings);
  state.pinnedChats = new Set(stored.pinnedChats || []);

  state.cacheGeneration = stored.messageCacheGeneration || 0;
  loadMessageCache(stored.messageCache);

  applySettingsClasses();
  syncReadReceiptGuard();
  observePointer();
  observePinActions();
  window.addEventListener("pagehide", flushMessageCache);
  scanDocument();

  state.observer = new MutationObserver(handleMutations);
  state.observer.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ["data-id", "data-icon", "data-testid"]
  });
}

/* -------------------------------------------------------------------------- */
/* settings                                                                    */
/* -------------------------------------------------------------------------- */

function handleSettingsChanged(changes, area) {
  if (state.disposed || area !== "local") return;
  if (initialStorageChanges) {
    Object.assign(initialStorageChanges, changes);
    return;
  }
  if (changes.messageCacheGeneration) {
    resetMessageCache(changes.messageCacheGeneration.newValue || 0);
  } else if (changes.messageCache) {
    loadMessageCache(changes.messageCache.newValue);
    scanMessages(false);
  }
  if (changes.settings) {
    state.settings = normalizeSettings(changes.settings.newValue);
    applySettingsClasses();
    syncReadReceiptGuard();
    if (!state.settings.copyButtons) hideCopyButton();
    if (!state.settings.restoreDeleted) {
      flushMessageCache();
      document.querySelectorAll(RESTORE_UI_SELECTOR).forEach((el) => el.remove());
      if (overlay.activeNode && isDeletedMessage(overlay.activeNode)) hideCopyButton();
    }
    scanDocument();
  }
  if (changes.pinnedChats) {
    state.pinnedChats = new Set(changes.pinnedChats.newValue || []);
    scanDocument();
  }
}

function normalizeSettings(storedSettings = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...storedSettings };
  if (!settings.localPinsOptedIn) settings.localPins = false;
  // Blocking read receipts stops WhatsApp marking chats as read on every linked
  // device, including the phone, so it stays off until the user turns it on.
  if (!settings.readReceiptsOptedIn) settings.disableReadReceipts = false;
  // Saving message text needs the user's explicit opt-in, shown next to the switch.
  if (!settings.recoveryOptedIn) settings.restoreDeleted = false;
  return settings;
}

function applySettingsClasses() {
  const body = document.body;
  if (!body) return;
  body.classList.toggle("pwat-blur-contact-names", Boolean(state.settings.blurContactNames || state.settings.blurChatList));
  body.classList.toggle("pwat-blur-contact-photos", Boolean(state.settings.blurContactPhotos));
  body.classList.toggle("pwat-blur-recent-messages", Boolean(state.settings.blurRecentMessages || state.settings.blurChatList));
  body.classList.toggle("pwat-blur-chat-list", Boolean(state.settings.blurChatList));
  body.classList.toggle("pwat-blur-messages", Boolean(state.settings.blurMessages));
  body.classList.toggle("pwat-hide-status", Boolean(state.settings.hideStatus));
  body.classList.toggle("pwat-hide-channels", Boolean(state.settings.hideChannels));
  body.classList.toggle("pwat-hide-communities", Boolean(state.settings.hideCommunities));
  body.classList.toggle("pwat-hide-meta-ai", Boolean(state.settings.hideMetaAi));
  body.classList.toggle("pwat-hide-emojis", Boolean(state.settings.hideEmojis));
  body.classList.toggle("pwat-hide-gifs", Boolean(state.settings.hideGifs));
  body.classList.toggle("pwat-hide-stickers", Boolean(state.settings.hideStickers));
}

function syncReadReceiptGuard() {
  const enabled = Boolean(state.settings.disableReadReceipts);
  try {
    localStorage.setItem("pwatReadReceiptGuardOptIn", String(enabled));
    localStorage.removeItem("pwatDisableReadReceipts");
  } catch (_error) {
    // Storage can be unavailable in unusual browser modes; the extension still runs.
  }
  window.postMessage({ type: "PWAT_SET_READ_RECEIPT_GUARD", enabled }, window.location.origin);
}

/* -------------------------------------------------------------------------- */
/* scanning                                                                    */
/* -------------------------------------------------------------------------- */

// Chrome throttles timers in background tabs, but MutationObserver still fires.
// Cache newly rendered messages straight away so a message that is deleted
// moments after it arrives is already saved.
function handleMutations(records) {
  if (state.disposed) return;
  let messagesChanged = false;
  let pageChanged = false;
  for (const record of records) {
    const target = record.target instanceof Element ? record.target : record.target.parentElement;
    if (target?.closest(OWN_UI_SELECTOR)) continue;
    const changedNodes = [...record.addedNodes, ...record.removedNodes];
    if (record.type === "childList" && changedNodes.length && changedNodes.every((node) => node instanceof Element && node.matches(OWN_UI_SELECTOR))) {
      // Reinsert recovery UI removed by WhatsApp, without observing our own
      // insertions as new message content or continually re-caching cleared text.
      if (record.removedNodes.length) scheduleScan();
      continue;
    }
    pageChanged = true;
    let message = target?.closest(MESSAGE_SELECTOR);
    while (message) {
      state.clearedNodes.delete(message);
      messagesChanged = true;
      message = message.parentElement?.closest(MESSAGE_SELECTOR);
    }
    if (changedNodes.some((node) => node instanceof Element && (node.matches(MESSAGE_SELECTOR) || node.querySelector(MESSAGE_SELECTOR)))) {
      messagesChanged = true;
    }
  }
  if (state.settings.restoreDeleted && messagesChanged) scanMessages();
  if (pageChanged) scheduleScan();
}

let scanTimer = null;
function scheduleScan() {
  if (state.disposed || scanTimer) return;
  scanTimer = window.setTimeout(() => {
    scanTimer = null;
    scanDocument();
  }, 120);
}

function scanDocument() {
  if (state.disposed) return;
  if (state.settings.restoreDeleted || state.settings.copyButtons) scanMessages();
  if (state.settings.localPins) {
    scanChatRows();
  } else {
    cleanupChatRows();
  }
  if (overlay.activeNode && !overlay.activeNode.isConnected) hideCopyButton();
}

function scanMessages(cacheMessages = true) {
  queryMessageNodes().forEach((node) => {
    const id = getMessageId(node);
    const deleted = isDeletedMessage(node);
    if (!deleted || !state.settings.restoreDeleted || !id) {
      node.querySelectorAll(RESTORE_UI_SELECTOR).forEach((el) => el.remove());
    }
    if (!id || !state.settings.restoreDeleted) return;
    const text = deleted || !cacheMessages || state.clearedNodes.has(node) ? "" : extractMessageText(node);

    if (text && !isUnavailablePlaceholder(text)) {
      const capped = text.length > MESSAGE_TEXT_LIMIT ? `${text.slice(0, MESSAGE_TEXT_LIMIT - 1)}\u2026` : text;
      const cached = state.messageCache.get(id);
      const observed = state.observedMessages.get(node);
      const changed = observed?.id !== id || observed.text !== capped;
      state.observedMessages.set(node, { id, text: capped });
      const preview = capped.replace(/(?:\.{3}|\u2026)\s*$/, "").trimEnd();
      const isShorterPreview = cached?.length > capped.length && preview && cached.startsWith(preview) && findReadMoreControl(node);
      // Another tab may have saved a newer edit. A rescan of unchanged local
      // markup must not write the older text back over that shared cache entry.
      if (changed && cached !== capped && !isShorterPreview) {
        state.messageCache.set(id, capped);
        state.pendingMessages.set(id, capped);
        trimMessageCache();
        persistMessageCacheSoon();
      }
    }

    if (deleted && state.settings.restoreDeleted) restoreDeletedMessage(node, id);
  });
}

function queryMessageNodes() {
  const panel = getMessagePanel();
  if (!panel) return [];

  const byDataId = getOutermostMatches("div[data-id]", panel).filter((node) => !node.closest(CHAT_LIST_SELECTOR));
  if (byDataId.length) return byDataId;

  return getOutermostMatches(".message-in, .message-out", panel).filter((node) => !node.closest(CHAT_LIST_SELECTOR));
}

function getMessagePanel() {
  const selectors = [
    "#main",
    "[aria-label='Message list']",
    "[data-testid='conversation-panel-messages']",
    "[data-testid='conversation-panel-body']"
  ];
  for (const selector of selectors) {
    const panel = document.querySelector(selector);
    if (panel) return panel;
  }
  return document.body;
}

function getOutermostMatches(selector, root) {
  const matches = [...root.querySelectorAll(selector)].filter((node) => node instanceof HTMLElement);
  return matches.filter((node) => !matches.some((other) => other !== node && other.contains(node)));
}

// Only use WhatsApp's message key. Sender/time metadata can collide across
// chats and disappears on recall; a row index is also unsafe after scrolling.
function getMessageId(node) {
  const dataId = node.getAttribute("data-id");
  return dataId || null;
}

/* -------------------------------------------------------------------------- */
/* message text                                                                */
/* -------------------------------------------------------------------------- */

function extractMessageText(node) {
  const parts = [...node.querySelectorAll(".selectable-text, span[dir='ltr'], span[dir='auto']")]
    .filter((element) => element instanceof HTMLElement)
    .filter((element) => !isIgnoredTextHost(element, node))
    .map((element) => {
      const text = getTextWithLineBreaks(element);
      // In a real message body, "Edited", "Read" or "12:34" is valid text.
      // Apply metadata-word filtering only to less specific fallback spans.
      return element.matches(".selectable-text") || isCopyableMessageText(text) ? text : "";
    })
    .filter(Boolean);

  if (parts.length) return dedupeNestedParts(parts).join("\n");

  const clone = node.cloneNode(true);
  clone.querySelectorAll(`${OWN_UI_SELECTOR}, .pwat-deleted-label, [data-testid='msg-meta'], [data-icon], [aria-hidden='true'], svg`).forEach((el) => el.remove());
  const fallback = getTextWithLineBreaks(clone);
  return isCopyableMessageText(fallback) ? fallback : "";
}

function isIgnoredTextHost(element, messageNode) {
  if (element.closest(`${OWN_UI_SELECTOR}, .pwat-deleted-label, [data-testid='msg-meta']`)) return true;

  let current = element;
  while (current && current !== messageNode) {
    if (current.matches?.("button, [role='button']")) {
      const label = (current.getAttribute("aria-label") || "").toLowerCase();
      if (/react|forward|reply|more|menu|message options|context/.test(label)) return true;
      if (current.querySelector("[data-icon]")) return true;
    }
    current = current.parentElement;
  }
  return false;
}

// Nested spans yield the same text twice; keep the longest variant of each.
function dedupeNestedParts(parts) {
  const unique = [...new Set(parts)];
  return unique.filter((part) => !unique.some((other) => other !== part && other.includes(part)));
}

function getTextWithLineBreaks(element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
      if (node.nodeName === "BR" || node.nodeName === "IMG") return NodeFilter.FILTER_ACCEPT;
      if (node.nodeName === "DIV" || node.nodeName === "P") return NodeFilter.FILTER_ACCEPT;
      return NodeFilter.FILTER_SKIP;
    }
  });

  let result = "";
  let lastWasBlock = false;

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent;
      lastWasBlock = false;
    } else if (node.nodeName === "BR") {
      result += "\n";
      lastWasBlock = false;
    } else if (node.nodeName === "IMG") {
      // WhatsApp renders emoji as <img alt="🙂">.
      result += node.getAttribute("alt") || "";
      lastWasBlock = false;
    } else if (!lastWasBlock && result.length > 0) {
      result += "\n";
      lastWasBlock = true;
    }
  }

  return normalizeMessageText(result);
}

function normalizeMessageText(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isCopyableMessageText(text) {
  if (!text) return false;
  if (/^\d{1,2}:\d{2}(\s?[ap]m)?$/i.test(text)) return false;
  if (/^(delivered|read|edited|forwarded)$/i.test(text)) return false;
  if (/^ic-[a-z0-9-]+$/i.test(text)) return false;
  if (/^(react|forward|forward media|reply|more|message options|copy this message|copied)$/i.test(text)) return false;
  return true;
}

/* -------------------------------------------------------------------------- */
/* deleted messages                                                            */
/* -------------------------------------------------------------------------- */

function isDeletedPlaceholder(text) {
  if (!text) return false;
  const normalized = String(text).toLowerCase().replace(/[.\u2026]+$/, "").replace(/\s+/g, " ").trim();
  return deletedTextPatterns.includes(normalized);
}

function isDeletedMessage(node) {
  const clone = node.cloneNode(true);
  clone.querySelectorAll(`${OWN_UI_SELECTOR}, [data-testid='msg-meta'], [data-testid='quoted-message'], [data-testid='quoted-msg'], button, [role='button']`).forEach((el) => el.remove());
  if (clone.querySelector(RECALL_ICON_SELECTOR)) return true;
  // Compare the complete body, not each text node: a quoted phrase or a short
  // sentence mentioning deletion is still an ordinary message.
  clone.querySelectorAll("[data-icon], [aria-hidden='true'], svg").forEach((el) => el.remove());
  clone.querySelectorAll("span").forEach((el) => {
    if (!el.children.length && !isCopyableMessageText(el.textContent.trim())) el.remove();
  });
  return isDeletedPlaceholder(getTextWithLineBreaks(clone));
}

function isUnavailablePlaceholder(text) {
  return /^(waiting for this message(?:\.|\u2026|$)|message is no longer available[.\u2026]*$)/i.test(text);
}

function restoreDeletedMessage(node, id) {
  const cached = state.messageCache.get(id);
  const existing = node.querySelector(".pwat-deleted-restore");

  if (!cached) {
    existing?.remove();
    markMissingCopy(node);
    return;
  }
  node.querySelector(".pwat-deleted-empty")?.remove();
  if (existing?.dataset.pwatText === cached) return;
  existing?.remove();

  const restore = document.createElement("div");
  restore.className = "pwat-deleted-restore";
  restore.dataset.pwatText = cached;

  const label = document.createElement("span");
  label.className = "pwat-deleted-label";
  label.textContent = "Recovered locally";

  const body = document.createElement("span");
  body.className = "pwat-deleted-text";
  body.textContent = cached;

  restore.append(label, body);
  findRestoreHost(node).appendChild(restore);
}

function findRestoreHost(node) {
  // Recalled bubbles often lose .selectable-text and data-pre-plain-text.
  // Use their placeholder/icon as the anchor so recovery stays in the bubble.
  const anchor = [...node.querySelectorAll("span")].find((el) =>
    !el.closest(RESTORE_UI_SELECTOR) && isDeletedPlaceholder(getTextWithLineBreaks(el))
  ) || node.querySelector(RECALL_ICON_SELECTOR);
  return findBubble(node, anchor) || anchor?.closest("div") || node;
}

// Without this note a detected deletion with no cached copy looks identical to
// the extension not noticing the deletion at all.
function markMissingCopy(node) {
  if (node.querySelector(".pwat-deleted-empty")) return;

  const note = document.createElement("span");
  note.className = "pwat-deleted-empty";
  note.textContent = "No saved copy";
  note.title = "No local text was saved for this message, or its saved copy was cleared or expired";
  findRestoreHost(node).appendChild(note);
}

/* -------------------------------------------------------------------------- */
/* floating copy button                                                        */
/* -------------------------------------------------------------------------- */

function observePointer() {
  document.addEventListener("pointerover", handlePointerOver, true);
  document.addEventListener("pointerleave", handlePointerLeave, true);
  document.addEventListener("focusin", handleMessageFocus, true);
  window.addEventListener("scroll", handleViewportChange, true);
  window.addEventListener("resize", handleViewportChange, true);
}

function handlePointerOver(event) {
  if (state.disposed || !state.settings.copyButtons) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  if (target.closest(".pwat-copy-button")) {
    cancelHide();
    return;
  }

  const node = findMessageNode(target);
  if (!node) {
    scheduleHide();
    return;
  }

  cancelHide();
  showCopyButtonFor(node);
}

// Keyboard users reach messages through WhatsApp's focusable rows.
function handleMessageFocus(event) {
  if (state.disposed || !state.settings.copyButtons) return;
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  if (target.closest(".pwat-copy-button")) {
    cancelHide();
    return;
  }

  const node = findMessageNode(target);
  if (!node) return;
  cancelHide();
  showCopyButtonFor(node);
}

function handlePointerLeave(event) {
  if (event.target === document || event.target === document.documentElement) scheduleHide();
}

function handleViewportChange() {
  if (!overlay.activeNode) return;
  if (overlay.frame) return;
  overlay.frame = requestAnimationFrame(() => {
    overlay.frame = null;
    if (!overlay.activeNode) return;
    if (!overlay.activeNode.isConnected) {
      hideCopyButton();
      return;
    }
    positionCopyButton(overlay.activeNode);
  });
}

function findMessageNode(target) {
  if (target.closest(CHAT_LIST_SELECTOR)) return null;
  const panel = getMessagePanel();
  const node = target.closest("div[data-id], .message-in, .message-out");
  if (!node || !panel.contains(node)) return null;
  // Prefer the outermost message wrapper so the bubble geometry stays stable.
  const outer = node.parentElement?.closest("div[data-id], .message-in, .message-out");
  return outer && panel.contains(outer) ? outer : node;
}

function ensureCopyButton() {
  if (overlay.button?.isConnected) return overlay.button;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "pwat-copy-button";
  button.setAttribute("aria-label", "Copy this message");
  button.title = "Copy this message";
  button.innerHTML = [
    '<svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">',
    '<path d="M8 7a3 3 0 0 1 3-3h7a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-1v-2h1a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-7a1 1 0 0 0-1 1v1H8V7Z"/>',
    '<path d="M6 9h7a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3Zm0 2a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1H6Z"/>',
    "</svg>"
  ].join("");
  button.addEventListener("click", handleCopyClick);
  button.addEventListener("mouseleave", scheduleHide);

  document.body.appendChild(button);
  overlay.button = button;
  return button;
}

function showCopyButtonFor(node) {
  if (!state.settings.copyButtons) return;
  if (!getCopyableTextFor(node)) {
    hideCopyButton();
    return;
  }

  const button = ensureCopyButton();
  overlay.activeNode = node;
  button.dataset.pwatMessageId = getMessageId(node) || "";
  if (!button.classList.contains("pwat-copy-button-copied") && !button.classList.contains("pwat-copy-button-failed")) {
    button.title = "Copy this message";
  }
  positionCopyButton(node);
  button.classList.add("pwat-copy-button-visible");

  // WhatsApp renders its own hover controls a frame or two after the pointer
  // enters a row, so re-measure to stay clear of them once they exist.
  schedulePositionRefresh(node);
}

function schedulePositionRefresh(node) {
  [120, 360].forEach((delay) => {
    window.setTimeout(() => {
      if (state.disposed || overlay.activeNode !== node || !node.isConnected) return;
      positionCopyButton(node);
    }, delay);
  });
}

function positionCopyButton(node) {
  const button = overlay.button;
  if (!button) return;

  const bubble = findBubble(node) || node;
  const rect = bubble.getBoundingClientRect();
  if (!rect.width && !rect.height) {
    hideCopyButton();
    return;
  }

  // Outer edge of the bubble: right of sent messages, left of received ones,
  // so the button never sits over the conversation.
  const outgoing = isOutgoingMessage(node, rect);
  const step = BUTTON_SIZE + BUTTON_GAP;
  let left = outgoing ? rect.right + BUTTON_GAP : rect.left - BUTTON_GAP - BUTTON_SIZE;

  // Slide further out past WhatsApp's own hover controls if any sit there.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!collidesWithNativeControl(node, bubble, left, rect)) break;
    left += outgoing ? step : -step;
  }

  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  if (left < 2 || left + BUTTON_SIZE > viewportWidth - 2) {
    // No room outside the bubble: tuck the button against its inner edge.
    left = outgoing ? rect.right - BUTTON_SIZE - BUTTON_GAP : rect.left + BUTTON_GAP;
  }

  const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  const centered = rect.top + (rect.height - BUTTON_SIZE) / 2;
  const top = clamp(centered, Math.max(2, rect.top), Math.min(viewportHeight - BUTTON_SIZE - 2, rect.bottom - BUTTON_SIZE));

  button.style.left = `${Math.round(clamp(left, 2, viewportWidth - BUTTON_SIZE - 2))}px`;
  button.style.top = `${Math.round(top)}px`;
}

function collidesWithNativeControl(node, bubble, left, bubbleRect) {
  const candidate = { left, right: left + BUTTON_SIZE, top: bubbleRect.top, bottom: bubbleRect.bottom };
  const controls = [...node.querySelectorAll("button, [role='button']")]
    .filter((element) => element instanceof HTMLElement)
    .filter((element) => !bubble.contains(element) || element.getAttribute("data-js-context-icon") === "true")
    .filter((element) => element.offsetParent !== null || element.getBoundingClientRect().width > 0);

  return controls.some((element) => {
    const rect = element.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    return rect.left < candidate.right && rect.right > candidate.left && rect.top < candidate.bottom && rect.bottom > candidate.top;
  });
}

// The bubble is the innermost wrapper around the text that is narrower than the
// full row; WhatsApp gives it a solid background, so prefer that signal.
function findBubble(node, anchor = node.querySelector(".selectable-text, [data-pre-plain-text], img, video, canvas")) {
  if (!anchor) return null;

  const rowWidth = node.getBoundingClientRect().width || 0;
  let fallback = null;
  let element = anchor instanceof HTMLElement ? anchor : anchor.parentElement;

  while (element && element !== node.parentElement) {
    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && (!rowWidth || rect.width <= rowWidth * 0.95)) {
      if (hasSolidBackground(element)) return element;
      fallback = element;
    }
    element = element.parentElement;
  }
  return fallback;
}

function hasSolidBackground(element) {
  const background = window.getComputedStyle(element).backgroundColor;
  if (!background || background === "transparent") return false;
  const alpha = background.match(/rgba?\([^)]*,\s*([\d.]+)\s*\)/);
  return alpha ? Number(alpha[1]) > 0.05 : true;
}

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function scheduleHide() {
  cancelHide();
  overlay.hideTimer = window.setTimeout(hideCopyButton, HIDE_DELAY_MS);
}

function cancelHide() {
  if (!overlay.hideTimer) return;
  window.clearTimeout(overlay.hideTimer);
  overlay.hideTimer = null;
}

function hideCopyButton() {
  cancelHide();
  overlay.activeNode = null;
  overlay.button?.classList.remove("pwat-copy-button-visible");
}

function getCopyableTextFor(node) {
  if (isDeletedMessage(node)) {
    if (!state.settings.restoreDeleted) return "";
    const id = getMessageId(node);
    return id ? state.messageCache.get(id) || "" : "";
  }
  return extractMessageText(node);
}

async function handleCopyClick(event) {
  event.preventDefault();
  event.stopPropagation();

  const button = overlay.button;
  const node = overlay.activeNode;
  if (!button || !node) return;

  try {
    await expandReadMoreInMessage(node);
    const text = getCopyableTextFor(node);
    await copyTextToClipboard(text);
    button.classList.remove("pwat-copy-button-failed");
    button.classList.add("pwat-copy-button-copied");
    button.title = "Copied";
  } catch (error) {
    button.classList.remove("pwat-copy-button-copied");
    button.classList.add("pwat-copy-button-failed");
    button.title = `Copy failed: ${error.message || "Unknown error"}`;
  }

  if (overlay.resetTimer) window.clearTimeout(overlay.resetTimer);
  const delay = button.classList.contains("pwat-copy-button-failed") ? 6000 : 900;
  overlay.resetTimer = window.setTimeout(() => {
    overlay.resetTimer = null;
    button.classList.remove("pwat-copy-button-copied", "pwat-copy-button-failed");
    button.title = "Copy this message";
  }, delay);
}

async function expandReadMoreInMessage(node) {
  const control = findReadMoreControl(node);
  if (!control) return;
  control.click();
  await waitForDomSettle(node, 500);
}

function findReadMoreControl(node) {
  return [...node.querySelectorAll("button, [role='button'], span[role='button'], span, a")]
    .filter((element) => element instanceof HTMLElement)
    .filter((element) => !element.closest("[data-testid='msg-meta'], .pwat-deleted-restore"))
    .find((element) => {
      const text = normalizeMessageText(element.textContent).toLowerCase();
      if (text !== "read more" && text !== "read more...") return false;
      return element.children.length === 0 || Boolean(element.querySelector("span:only-child"));
    }) || null;
}

function waitForDomSettle(node, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    let debounceTimer = null;

    const finish = () => {
      if (settled) return;
      settled = true;
      if (debounceTimer) window.clearTimeout(debounceTimer);
      window.clearTimeout(maxTimer);
      observer.disconnect();
      resolve();
    };

    const maxTimer = window.setTimeout(finish, timeoutMs);
    const observer = new MutationObserver(() => {
      if (settled) return;
      if (debounceTimer) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(finish, 80);
    });

    observer.observe(node, { childList: true, subtree: true, characterData: true });
  });
}

// Older WhatsApp builds tag rows with message-in/message-out and prefix data-id
// with true_/false_. Newer builds ship neither, so fall back to layout: a sent
// bubble hugs the right edge of its row, a received one hugs the left.
function isOutgoingMessage(node, bubbleRect) {
  if (node.classList.contains("message-out") || node.querySelector(".message-out") || node.closest(".message-out")) return true;
  if (node.classList.contains("message-in") || node.querySelector(".message-in") || node.closest(".message-in")) return false;

  const dataId = node.getAttribute("data-id") || "";
  if (dataId.startsWith("true_")) return true;
  if (dataId.startsWith("false_")) return false;

  const row = node.closest("[role='row']") || node;
  const rowRect = row.getBoundingClientRect();
  const rect = bubbleRect || node.getBoundingClientRect();
  if (!rowRect.width || !rect.width) return false;
  return rowRect.right - rect.right < rect.left - rowRect.left;
}

/* -------------------------------------------------------------------------- */
/* clipboard                                                                   */
/* -------------------------------------------------------------------------- */

async function copyTextToClipboard(text) {
  if (!text) throw new Error("Nothing to copy");

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch (_error) {
    // WhatsApp Web can reject async clipboard writes from content scripts.
  }

  // The extension's offscreen document holds the clipboardWrite permission and
  // does not depend on the page having user activation, so it is tried before
  // the in-page selection trick. document.execCommand("copy") can report true
  // while writing nothing, which would show "Copied" on an empty clipboard.
  if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
    try {
      const response = await chrome.runtime.sendMessage({ type: "PWAT_COPY_TEXT", text });
      if (response?.ok) return;
    } catch (error) {
      if (!isExtensionContextInvalidated(error)) throw error;
    }
  }

  if (copyTextWithSelection(text)) return;

  throw new Error("Clipboard write failed");
}

function copyTextWithSelection(text) {
  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.cssText = "height:1px;left:-9999px;opacity:0;position:fixed;top:0;width:1px;";
  document.body.appendChild(input);

  const selection = document.getSelection();
  const ranges = [];
  if (selection) {
    for (let index = 0; index < selection.rangeCount; index += 1) ranges.push(selection.getRangeAt(index));
  }

  input.focus({ preventScroll: true });
  input.select();
  input.setSelectionRange(0, input.value.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch (_error) {
    copied = false;
  } finally {
    input.remove();
    if (selection) {
      selection.removeAllRanges();
      ranges.forEach((range) => selection.addRange(range));
    }
  }
  return copied;
}

/* -------------------------------------------------------------------------- */
/* local pins                                                                  */
/* -------------------------------------------------------------------------- */

function scanChatRows() {
  let pinnedOrder = 0;
  getOutermostMatches(CHAT_ROW_SELECTOR, document).forEach((row) => {
    const chatId = getChatId(row);
    if (!chatId) return;

    row.classList.add("pwat-chat-row-host");
    const isPinned = state.pinnedChats.has(chatId);
    row.classList.toggle("pwat-pinned", isPinned);
    row.style.order = isPinned ? String(-1000 + pinnedOrder) : "";
    if (isPinned) {
      row.setAttribute("data-pwat-local-pin", "true");
      pinnedOrder += 1;
    } else {
      row.removeAttribute("data-pwat-local-pin");
    }
  });
}

function cleanupChatRows() {
  document.querySelectorAll(".pwat-chat-row-host").forEach((row) => {
    row.classList.remove("pwat-chat-row-host", "pwat-pinned");
    row.removeAttribute("data-pwat-local-pin");
    row.style.order = "";
  });
}

function getChatId(row) {
  const title = row.querySelector("span[title]")?.getAttribute("title")?.trim();
  return title || row.getAttribute("aria-label") || row.textContent.trim().slice(0, 120);
}

function observePinActions() {
  document.addEventListener("pointerdown", rememberChatAction, true);
  document.addEventListener("focusin", rememberChatAction, true);
  document.addEventListener("click", interceptPinAction, true);
}

function rememberChatAction(event) {
  const row = event.target instanceof Element ? event.target.closest?.(CHAT_ROW_SELECTOR) : null;
  if (!(row instanceof HTMLElement)) return;
  const chatId = getChatId(row);
  if (!chatId) return;
  state.lastChatAction = { chatId, at: Date.now() };
}

function interceptPinAction(event) {
  if (!state.settings.localPins) return;

  const action = getPinAction(event.target);
  if (!action) return;

  const row = action.element.closest?.(CHAT_ROW_SELECTOR);
  const chatId = row instanceof HTMLElement ? getChatId(row) : getRecentChatActionId();
  if (!chatId) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  setPinnedChat(chatId, action.intent === "pin");
}

function getPinAction(target) {
  if (!(target instanceof Element)) return null;
  const action = target.closest("button, [role='button'], [role='menuitem'], [aria-label]");
  if (!(action instanceof HTMLElement)) return null;
  if (action.classList.contains("pwat-copy-button")) return null;

  const label = (action.getAttribute("aria-label") || action.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (label === "pin" || label === "pin chat") return { intent: "pin", element: action };
  if (label === "unpin" || label === "unpin chat") return { intent: "unpin", element: action };
  return null;
}

function getRecentChatActionId() {
  if (!state.lastChatAction) return null;
  if (Date.now() - state.lastChatAction.at > 15000) return null;
  return state.lastChatAction.chatId;
}

async function setPinnedChat(chatId, pinned) {
  try {
    if (pinned) {
      state.pinnedChats.add(chatId);
    } else {
      state.pinnedChats.delete(chatId);
    }
    await chrome.storage.local.set({ pinnedChats: [...state.pinnedChats] });
    scanChatRows();
  } catch (error) {
    if (!isExtensionContextInvalidated(error)) throw error;
  }
}

/* -------------------------------------------------------------------------- */
/* persistence + lifecycle                                                     */
/* -------------------------------------------------------------------------- */

let persistTimer = null;
function persistMessageCacheSoon() {
  if (state.disposed || persistTimer) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    void persistMessageCache();
  }, 250);
}

function flushMessageCache() {
  if (persistTimer) window.clearTimeout(persistTimer);
  persistTimer = null;
  void persistMessageCache();
}

function cancelPendingMessageCache() {
  if (persistTimer) window.clearTimeout(persistTimer);
  persistTimer = null;
  state.pendingMessages.clear();
}

function resetMessageCache(generation) {
  state.cacheGeneration = generation;
  cancelPendingMessageCache();
  state.messageCache.clear();
  state.clearedNodes = new WeakSet(queryMessageNodes());
  state.observedMessages = new WeakMap();
  document.querySelectorAll(RESTORE_UI_SELECTOR).forEach((el) => el.remove());
  if (overlay.activeNode && isDeletedMessage(overlay.activeNode)) hideCopyButton();
  scanMessages(false);
}

function loadMessageCache(entries) {
  state.messageCache.clear();
  for (const item of Array.isArray(entries) ? entries : []) {
    if (typeof item?.id !== "string" || !item.id || item.id.startsWith("pre:")) continue;
    if (typeof item.text !== "string" || !item.text) continue;
    const text = item.text.length > MESSAGE_TEXT_LIMIT ? `${item.text.slice(0, MESSAGE_TEXT_LIMIT - 1)}\u2026` : item.text;
    state.messageCache.set(item.id, text);
  }
  for (const [id, text] of state.pendingMessages) state.messageCache.set(id, text);
  trimMessageCache();
}

// chrome.storage.local holds 10 MB without the unlimitedStorage permission, so
// the cache is trimmed by count and by characters, oldest entries first.
function trimMessageCache() {
  while (state.messageCache.size > MESSAGE_CACHE_LIMIT) {
    const oldest = state.messageCache.keys().next().value;
    state.messageCache.delete(oldest);
    state.pendingMessages.delete(oldest);
  }

  let characters = 0;
  for (const text of state.messageCache.values()) characters += text.length;
  while (characters > MESSAGE_CACHE_CHAR_BUDGET && state.messageCache.size > 1) {
    const oldest = state.messageCache.keys().next().value;
    characters -= state.messageCache.get(oldest).length;
    state.messageCache.delete(oldest);
    state.pendingMessages.delete(oldest);
  }
}

async function persistMessageCache() {
  if (state.disposed || !state.pendingMessages.size) return;
  const generation = state.cacheGeneration;
  const entries = [...state.pendingMessages].map(([id, text]) => ({ id, text }));
  try {
    const response = await chrome.runtime.sendMessage({ type: "PWAT_CACHE_MESSAGES", generation, entries });
    if (!response?.ok) throw new Error(response?.error || "Message cache write failed");
    if (state.disposed || state.cacheGeneration !== generation) return;
    if (response.reset) {
      resetMessageCache(response.generation);
      return;
    }
    for (const { id, text } of entries) {
      if (state.pendingMessages.get(id) === text) state.pendingMessages.delete(id);
    }
  } catch (error) {
    if (isExtensionContextInvalidated(error)) return;
    console.warn("Private WA Tools could not save the message cache:", error.message);
  }
}

function isExtensionContextInvalidated(error) {
  return /extension context invalidated/i.test(String(error?.message || error));
}

function handleWindowError(event) {
  if (!isExtensionContextInvalidated(event.error || event.message)) return;
  event.preventDefault();
}

function handleUnhandledRejection(event) {
  if (!isExtensionContextInvalidated(event.reason)) return;
  event.preventDefault();
}

function dispose() {
  state.disposed = true;
  state.observer?.disconnect();
  if (scanTimer) window.clearTimeout(scanTimer);
  if (persistTimer) window.clearTimeout(persistTimer);
  if (overlay.resetTimer) window.clearTimeout(overlay.resetTimer);
  cancelHide();

  overlay.button?.remove();
  overlay.button = null;
  overlay.activeNode = null;
  document.querySelectorAll(".pwat-copy-button, .pwat-deleted-restore, .pwat-deleted-empty").forEach((el) => el.remove());

  document.removeEventListener("pointerover", handlePointerOver, true);
  document.removeEventListener("pointerleave", handlePointerLeave, true);
  document.removeEventListener("focusin", handleMessageFocus, true);
  window.removeEventListener("scroll", handleViewportChange, true);
  window.removeEventListener("resize", handleViewportChange, true);
  window.removeEventListener("pagehide", flushMessageCache);
  document.removeEventListener("pointerdown", rememberChatAction, true);
  document.removeEventListener("focusin", rememberChatAction, true);
  document.removeEventListener("click", interceptPinAction, true);
  window.removeEventListener("error", handleWindowError);
  window.removeEventListener("unhandledrejection", handleUnhandledRejection);

  try {
    chrome.storage.onChanged.removeListener(handleSettingsChanged);
  } catch (error) {
    if (!isExtensionContextInvalidated(error)) throw error;
  }
}

window.__PrivateWATools = {
  DEFAULT_SETTINGS,
  state,
  overlay,
  init,
  scanDocument,
  extractMessageText,
  isDeletedPlaceholder,
  isDeletedMessage,
  copyTextToClipboard,
  normalizeSettings,
  showCopyButtonFor,
  hideCopyButton,
  findBubble,
  getMessageId
};
