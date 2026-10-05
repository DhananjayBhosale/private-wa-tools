chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({
    installedAt: new Date().toISOString(),
    privacyModel: "local-only"
  });
});

const OFFSCREEN_DOCUMENT_PATH = "src/offscreen.html";
let offscreenCreatePromise = null;
const MESSAGE_CACHE_LIMIT = 2000;
const MESSAGE_TEXT_LIMIT = 4000;
const MESSAGE_CACHE_CHAR_BUDGET = 1500000;
let cacheOperation = Promise.resolve();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PWAT_CACHE_MESSAGES" || message?.type === "PWAT_CLEAR_MESSAGE_CACHE") {
    // One writer prevents two WhatsApp tabs from replacing each other's cache.
    const operation = cacheOperation.then(() => updateMessageCache(message));
    cacheOperation = operation.catch(() => {});
    operation.then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === "PWAT_COPY_TEXT") {
    copyTextInOffscreen(message.text)
      .then(() => {
        chrome.storage.local.set({ lastClipboardWrite: { ok: true, at: new Date().toISOString() } });
        sendResponse({ ok: true });
      })
      .catch((error) => {
        chrome.storage.local.set({ lastClipboardWrite: { ok: false, error: error.message, at: new Date().toISOString() } });
        sendResponse({ ok: false, error: error.message });
      });
    return true;
  }

  if (message?.type !== "PWAT_DIAGNOSTICS") return false;

  chrome.storage.local.get(["settings", "pinnedChats", "messageCache", "privacyModel"], (stored) => {
    sendResponse({
      ok: true,
      privacyModel: stored.privacyModel || "local-only",
      settingsKeys: Object.keys(stored.settings || {}),
      pinnedChatsCount: Array.isArray(stored.pinnedChats) ? stored.pinnedChats.length : 0,
      messageCacheCount: Array.isArray(stored.messageCache) ? stored.messageCache.length : 0
    });
  });

  return true;
});

async function updateMessageCache(message) {
  const stored = await chrome.storage.local.get(["messageCache", "messageCacheGeneration"]);
  const generation = stored.messageCacheGeneration || 0;
  if (message.type === "PWAT_CLEAR_MESSAGE_CACHE") {
    await chrome.storage.local.set({ messageCache: [], messageCacheGeneration: generation + 1 });
    return { generation: generation + 1 };
  }
  // A queued write from before Clear must never bring old messages back.
  if (message.generation !== generation) return { generation, reset: true };

  const cache = new Map();
  for (const entries of [stored.messageCache, message.entries]) {
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (typeof entry?.id !== "string" || !entry.id || entry.id.startsWith("pre:")) continue;
      if (typeof entry.text !== "string" || !entry.text) continue;
      const text = entry.text.length > MESSAGE_TEXT_LIMIT ? `${entry.text.slice(0, MESSAGE_TEXT_LIMIT - 1)}\u2026` : entry.text;
      cache.set(entry.id, text);
    }
  }
  let characters = [...cache.values()].reduce((total, text) => total + text.length, 0);
  for (const [id, text] of cache) {
    if (cache.size <= MESSAGE_CACHE_LIMIT && characters <= MESSAGE_CACHE_CHAR_BUDGET) break;
    cache.delete(id);
    characters -= text.length;
  }
  const entries = [...cache].map(([id, text]) => ({ id, text }));
  try {
    await chrome.storage.local.set({ messageCache: entries });
  } catch (error) {
    if (!/quota/i.test(String(error?.message || error))) throw error;
    await chrome.storage.local.set({ messageCache: entries.slice(Math.ceil(entries.length / 2)) });
  }
  return { generation };
}

async function copyTextInOffscreen(text) {
  if (!text) throw new Error("Nothing to copy");
  await ensureOffscreenDocument();
  const response = await chrome.runtime.sendMessage({ type: "PWAT_OFFSCREEN_COPY_TEXT", text });
  if (!response?.ok) throw new Error(response?.error || "Clipboard write failed");
}

async function ensureOffscreenDocument() {
  if (await hasOffscreenDocument()) return;
  if (!offscreenCreatePromise) {
    offscreenCreatePromise = chrome.offscreen.createDocument({
      url: OFFSCREEN_DOCUMENT_PATH,
      reasons: [chrome.offscreen.Reason.CLIPBOARD],
      justification: "Copy selected WhatsApp message text from the extension."
    }).catch(async (error) => {
      if (await hasOffscreenDocument()) return;
      throw error;
    }).finally(() => {
      offscreenCreatePromise = null;
    });
  }
  await offscreenCreatePromise;
}

async function hasOffscreenDocument() {
  if (chrome.runtime.getContexts) {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH)]
    });
    return contexts.length > 0;
  }

  if (chrome.offscreen.hasDocument) {
    return chrome.offscreen.hasDocument();
  }

  return false;
}
