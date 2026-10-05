import assert from "node:assert/strict";
import test from "node:test";
import { createPage, createStorage, message, settle } from "./helpers.mjs";

test("restores and copies saved text after the entire bubble is replaced", async (t) => {
  const page = await createPage(t, { html: message("message-1", "Saved text<br>with 🙂") });
  const node = page.document.querySelector("[data-id]");
  node.innerHTML = '<div><span data-icon="recalled"></span><span>This message was deleted</span></div>';
  await settle();
  await page.flush(120);
  assert.equal(node.querySelector(".pwat-deleted-text")?.textContent, "Saved text\nwith 🙂");
  assert.equal(node.querySelector(".pwat-deleted-restore").parentElement, node.firstElementChild);
  assert.equal(page.evaluate('getCopyableTextFor(document.querySelector("[data-id]"))'), "Saved text\nwith 🙂");
  node.querySelector(".pwat-deleted-restore").remove();
  await settle();
  await page.flush(120);
  assert.equal(node.querySelectorAll(".pwat-deleted-restore").length, 1);
});

test("caches text inserted into an existing empty row before any timer runs", async (t) => {
  const page = await createPage(t, { html: '<div data-id="later"><div class="fixture-bubble"></div></div>' });
  const bubble = page.document.querySelector(".fixture-bubble");
  bubble.innerHTML = '<span class="selectable-text">Arrived later</span>';
  await settle();
  assert.equal(page.api.state.messageCache.get("later"), "Arrived later");
  bubble.innerHTML = "<span>This message was deleted</span>";
  await settle();
  assert.equal(bubble.parentElement.querySelector(".pwat-deleted-text")?.textContent, "Arrived later");
});

test("captures character changes and newly assigned message ids immediately", async (t) => {
  const page = await createPage(t, { html: message("edited", "Before edit") + '<div class="message-in"><span class="selectable-text">New message</span></div>' });
  const node = page.document.querySelector("[data-id]");
  node.querySelector("span").firstChild.data = "After edit";
  const newNode = page.document.querySelectorAll(".message-in")[1];
  newNode.setAttribute("data-id", "assigned-later");
  await settle();
  assert.equal(page.api.state.messageCache.get("edited"), "After edit");
  assert.equal(page.api.state.messageCache.get("assigned-later"), "New message");
});

test("ordinary messages, quotes, and decryption placeholders are not deletions", async (t) => {
  const page = await createPage(t);
  for (const html of [
    message("mention", "Why this message was deleted?"),
    message("split", "You said<br>this message was deleted<br>yesterday"),
    message("waiting", "Waiting for this message. This may take a while."),
    '<div data-id="quoted"><div data-testid="quoted-message"><span data-icon="recalled"></span>This message was deleted</div><span class="selectable-text">Here is my reply</span></div>',
    '<div data-id="action"><button><span data-icon="msg-delete"></span>Delete</button><span class="selectable-text">Still here</span></div>'
  ]) {
    page.document.getElementById("main").innerHTML = html;
    const node = page.document.querySelector("[data-id]");
    assert.equal(page.api.isDeletedMessage(node), false, html);
  }
});

test("a waiting placeholder never overwrites a previously saved message", async (t) => {
  const page = await createPage(t, { html: message("pending") });
  const node = page.document.querySelector("[data-id]");
  node.querySelector("span").textContent = "Waiting for this message. This may take a while.";
  page.api.scanDocument();
  assert.equal(node.querySelector(".pwat-deleted-restore"), null);
  assert.equal(page.api.state.messageCache.get("pending"), "Original text");
});

test("restore disabled means no message caching and no copying old recovered text", async (t) => {
  const page = await createPage(t, {
    html: message("current") + message("deleted", "This message was deleted"),
    stored: { settings: { copyButtons: true, restoreDeleted: false }, messageCache: [{ id: "deleted", text: "Old saved text" }] }
  });
  assert.equal(page.api.state.messageCache.has("current"), false);
  assert.equal(page.evaluate('getCopyableTextFor(document.querySelectorAll("[data-id]")[1])'), "");
  assert.equal(page.document.querySelector(".pwat-deleted-restore"), null);
});

test("message keys never fall back to a sender and minute shared by other chats", async (t) => {
  const page = await createPage(t, { html: '<div class="message-in"><span data-pre-plain-text="[12:00, 12/9/2026] Alex: " class="selectable-text">Private text</span></div>' });
  assert.equal(page.api.getMessageId(page.document.querySelector(".message-in")), null);
  assert.equal(page.api.state.messageCache.size, 0);
});

test("reused rows remove stale recovered content before caching a new message", async (t) => {
  const page = await createPage(t, { html: message("old") });
  const node = page.document.querySelector("[data-id]");
  node.querySelector(".selectable-text").textContent = "This message was deleted";
  page.api.scanDocument();
  node.setAttribute("data-id", "new");
  node.querySelector(".selectable-text").textContent = "New text";
  page.api.scanDocument();
  assert.equal(node.querySelector(".pwat-deleted-restore"), null);
  assert.equal(page.api.state.messageCache.get("new"), "New text");
});

test("clearing the cache removes recovered text and pending writes in open tabs", async (t) => {
  const storage = createStorage();
  const page = await createPage(t, { storage, html: message("saved") });
  const node = page.document.querySelector("[data-id]");
  node.querySelector("span").textContent = "This message was deleted";
  page.api.scanDocument();
  const popup = await createPage(t, { storage, popup: true });
  popup.document.getElementById("clear-cache").click();
  await settle();
  assert.equal(page.api.state.messageCache.size, 0);
  assert.equal(node.querySelector(".pwat-deleted-restore"), null);
  await page.flush();
  assert.deepEqual(storage.data.messageCache, []);
});

test("two open tabs persist their messages without overwriting each other", async (t) => {
  const storage = createStorage();
  const first = await createPage(t, { storage, html: message("first", "First tab text") });
  const second = await createPage(t, { storage, html: message("second", "Second tab text") });
  await Promise.all([first.flush(), second.flush()]);
  assert.deepEqual(storage.data.messageCache.map(({ id }) => id).sort(), ["first", "second"]);
  const reloaded = await createPage(t, { storage, html: message("first", "This message was deleted") });
  assert.equal(reloaded.document.querySelector(".pwat-deleted-text")?.textContent, "First tab text");
});

test("stored message text is rendered as text, never executable HTML", async (t) => {
  const text = '<img src=x onerror="alert(1)">';
  const page = await createPage(t, { html: message("unsafe", "This message was deleted"), stored: { messageCache: [{ id: "unsafe", text }] } });
  assert.equal(page.document.querySelector(".pwat-deleted-text").textContent, text);
  assert.equal(page.document.querySelector(".pwat-deleted-restore img"), null);
});

test("plain deleted placeholders tolerate an unlabelled timestamp", async (t) => {
  const page = await createPage(t, { html: '<div data-id="plain"><div><span>This message was deleted</span><span>12:34</span></div></div>', stored: { messageCache: [{ id: "plain", text: "Saved before deletion" }] } });
  assert.equal(page.document.querySelector(".pwat-deleted-text")?.textContent, "Saved before deletion");
});

test("cleared messages are not re-saved on unrelated rescans but new text is saved", async (t) => {
  const page = await createPage(t, { html: '<div data-id="visible"><div class="message-in"><span class="selectable-text">Original text</span></div></div>' });
  await page.storage.chrome.runtime.sendMessage({ type: "PWAT_CLEAR_MESSAGE_CACHE" });
  await settle();
  page.api.scanDocument();
  await page.flush();
  assert.equal(page.api.state.messageCache.size, 0);
  assert.deepEqual(page.storage.data.messageCache, []);
  page.document.querySelector(".selectable-text").textContent = "New edit after clearing";
  await settle();
  await page.flush();
  assert.equal(page.storage.data.messageCache[0]?.text, "New edit after clearing");
});

test("a cache write queued before Clear cannot restore old data afterwards", async (t) => {
  const storage = createStorage();
  const oldWrite = { type: "PWAT_CACHE_MESSAGES", generation: 0, entries: [{ id: "old", text: "Old message" }] };
  await storage.chrome.runtime.sendMessage({ type: "PWAT_CLEAR_MESSAGE_CACHE" });
  const response = await storage.chrome.runtime.sendMessage(oldWrite);
  assert.equal(response.reset, true);
  assert.deepEqual(storage.data.messageCache, []);
  await storage.chrome.runtime.sendMessage({ ...oldWrite, generation: 1, entries: [{ id: "new", text: "New message" }] });
  assert.deepEqual(storage.data.messageCache, [{ id: "new", text: "New message" }]);
});

test("persistent cache trims old entries and bounds text length and total size", async () => {
  const storage = createStorage();
  const entries = Array.from({ length: 2100 }, (_, index) => ({ id: `msg-${index}`, text: "x".repeat(5000) }));
  await storage.chrome.runtime.sendMessage({ type: "PWAT_CACHE_MESSAGES", generation: 0, entries });
  assert.ok(storage.data.messageCache.length <= 2000);
  assert.ok(storage.data.messageCache.every(({ text }) => text.length <= 4000));
  assert.ok(storage.data.messageCache.reduce((sum, { text }) => sum + text.length, 0) <= 1500000);
  assert.equal(storage.data.messageCache.at(-1).id, "msg-2099");
});

test("page exit flushes messages without waiting for a debounce timer", async (t) => {
  const page = await createPage(t, { html: message("before-exit") });
  page.window.dispatchEvent(new page.window.Event("pagehide"));
  await settle();
  assert.equal(page.storage.data.messageCache[0]?.id, "before-exit");
});

test("clearing while a tab loads cannot render a stale saved copy", async (t) => {
  const storage = createStorage({ messageCache: [{ id: "startup", text: "Cleared private text" }] });
  const get = storage.chrome.storage.local.get;
  storage.chrome.storage.local.get = async (keys, callback) => {
    const snapshot = await get(keys, callback);
    if (Array.isArray(keys) && keys.includes("settings")) {
      await storage.chrome.runtime.sendMessage({ type: "PWAT_CLEAR_MESSAGE_CACHE" });
    }
    return snapshot;
  };
  const page = await createPage(t, { storage, html: message("startup", "This message was deleted") });
  assert.equal(page.api.state.messageCache.size, 0);
  assert.equal(page.document.querySelector(".pwat-deleted-restore"), null);
  assert.equal(page.document.querySelector(".pwat-deleted-empty")?.textContent, "No saved copy");
});

test("message list items are cached without treating chat previews as messages", async (t) => {
  const page = await createPage(t, { html: '<div role="listitem">' + message("list-message") + '</div><section aria-label="Chat list"><div role="listitem" data-id="chat-preview"><span class="selectable-text">Chat preview</span></div></section>' });
  const node = page.document.querySelector('[data-id="list-message"]');
  assert.equal(page.api.state.messageCache.get("list-message"), "Original text");
  assert.equal(page.api.state.messageCache.has("chat-preview"), false);
  node.querySelector(".selectable-text").textContent = "This message was deleted";
  await settle();
  assert.equal(node.querySelector(".pwat-deleted-text")?.textContent, "Original text");
});

test("a collapsed read-more preview cannot replace previously saved complete text", async (t) => {
  const fullText = "A long message with the entire original body already observed";
  const page = await createPage(t, { html: message("long-recovery", fullText) });
  const bubble = page.document.querySelector(".fixture-bubble");
  bubble.innerHTML = '<span class="selectable-text">A long message...</span><button>Read more</button>';
  await settle();
  assert.equal(page.api.state.messageCache.get("long-recovery"), fullText);
  bubble.innerHTML = "<span>This message was deleted</span>";
  await settle();
  assert.equal(bubble.querySelector(".pwat-deleted-text")?.textContent, fullText);
});

test("a real shorter edit replaces old text instead of restoring an outdated version", async (t) => {
  const page = await createPage(t, { html: message("shorter-edit", "A much longer earlier version") });
  const body = page.document.querySelector(".selectable-text");
  body.textContent = "Edited";
  await settle();
  assert.equal(page.api.state.messageCache.get("shorter-edit"), "Edited");
  body.textContent = "This message was deleted";
  await settle();
  assert.equal(page.document.querySelector(".pwat-deleted-text")?.textContent, "Edited");
});

test("a generic block icon beside normal text is not a deleted message", async (t) => {
  const page = await createPage(t, { html: message("block-icon", "A normal message") });
  const bubble = page.document.querySelector(".fixture-bubble");
  bubble.insertAdjacentHTML("afterbegin", '<span data-icon="block-outline"></span>');
  await settle();
  const node = page.document.querySelector("[data-id]");
  assert.equal(page.api.isDeletedMessage(node), false);
  assert.equal(node.querySelector(".pwat-deleted-restore"), null);
});

test("known recall icons still support non-English deleted placeholders", async (t) => {
  const page = await createPage(t, { html: message("translated") });
  const bubble = page.document.querySelector(".fixture-bubble");
  bubble.innerHTML = '<span data-icon="recalled"></span><span>यह मैसेज हटा दिया गया</span>';
  await settle();
  assert.equal(bubble.querySelector(".pwat-deleted-text")?.textContent, "Original text");
});

test("toggling recovery off and on stops collection and restores the latest enabled text", async (t) => {
  const page = await createPage(t, { html: message("toggle") });
  const body = page.document.querySelector(".selectable-text");
  await page.storage.chrome.storage.local.set({ settings: { restoreDeleted: false } });
  body.textContent = "Changed while disabled";
  await settle();
  assert.equal(page.api.state.messageCache.get("toggle"), "Original text");
  assert.equal(page.document.querySelector(".pwat-deleted-restore"), null);
  await page.storage.chrome.storage.local.set({ settings: { restoreDeleted: true } });
  await settle();
  assert.equal(page.api.state.messageCache.get("toggle"), "Changed while disabled");
  body.textContent = "This message was deleted";
  await settle();
  assert.equal(page.document.querySelector(".pwat-deleted-text")?.textContent, "Changed while disabled");
});

test("a failed cache clear reports failure and preserves saved text", async (t) => {
  const storage = createStorage({ messageCache: [{ id: "kept", text: "Keep on failure" }] });
  const set = storage.chrome.storage.local.set;
  storage.chrome.storage.local.set = async (values) => {
    if ("messageCacheGeneration" in values) throw new Error("Storage unavailable");
    return set(values);
  };
  const popup = await createPage(t, { storage, popup: true });
  const button = popup.document.getElementById("clear-cache");
  button.click();
  await settle();
  assert.equal(button.disabled, false);
  assert.match(button.textContent, /Could not clear/);
  assert.deepEqual(storage.data.messageCache, [{ id: "kept", text: "Keep on failure" }]);
});

test("quota handling drops oldest entries once and keeps the background writer usable", async () => {
  const storage = createStorage({ messageCache: [{ id: "old", text: "Old text" }] });
  const set = storage.chrome.storage.local.set;
  let attempts = 0;
  storage.chrome.storage.local.set = async (values) => {
    if (++attempts === 1) throw new Error("QUOTA_BYTES quota exceeded");
    return set(values);
  };
  const response = await storage.chrome.runtime.sendMessage({ type: "PWAT_CACHE_MESSAGES", generation: 0, entries: [{ id: "new", text: "New text" }] });
  assert.equal(response.ok, true);
  assert.equal(attempts, 2);
  assert.deepEqual(storage.data.messageCache, [{ id: "new", text: "New text" }]);
  assert.equal((await storage.chrome.runtime.sendMessage({ type: "PWAT_CLEAR_MESSAGE_CACHE" })).ok, true);
});

test("an unchanged message in another tab cannot overwrite a newer saved edit", async (t) => {
  const storage = createStorage();
  const first = await createPage(t, { storage, html: message("shared-edit", "Old text") });
  const second = await createPage(t, { storage, html: message("shared-edit", "Old text") });
  await Promise.all([first.flush(), second.flush()]);
  first.document.querySelector(".selectable-text").textContent = "Latest edited text";
  await settle();
  await first.flush();
  const writesBeforeRescan = storage.writes.length;
  second.api.scanDocument();
  await second.flush();
  assert.equal(storage.data.messageCache[0]?.text, "Latest edited text");
  assert.equal(storage.writes.length, writesBeforeRescan);
  second.document.querySelector(".selectable-text").textContent = "This message was deleted";
  await settle();
  assert.equal(second.document.querySelector(".pwat-deleted-text")?.textContent, "Latest edited text");
  // A subsequent real edit, including one back to the original wording, still saves.
  first.document.querySelector(".selectable-text").textContent = "Old text";
  await settle();
  await first.flush();
  assert.equal(storage.data.messageCache[0]?.text, "Old text");
});
