import assert from "node:assert/strict";
import test from "node:test";
import { createPage, createStorage, settle, source } from "./helpers.mjs";

test("hiding one navigation button leaves its parent and other controls visible", async (t) => {
  const page = await createPage(t, {
    html: '<nav><button aria-label="Status">Status</button><button aria-label="Chats">Chats</button><button aria-label="Settings">Settings</button></nav>',
    stored: { settings: { hideStatus: true } }
  });
  assert.equal(page.window.getComputedStyle(page.document.querySelector('[aria-label="Status"]')).display, "none");
  assert.notEqual(page.window.getComputedStyle(page.document.querySelector("nav")).display, "none");
  assert.notEqual(page.window.getComputedStyle(page.document.querySelector('[aria-label="Chats"]')).display, "none");
});

test("icon-only hide controls remove the entire interactive button", async (t) => {
  const options = { hideStatus: "status-outline", hideChannels: "newsletter-outline", hideCommunities: "community-outline", hideMetaAi: "meta-ai", hideEmojis: "smiley", hideGifs: "gif", hideStickers: "sticker" };
  for (const [setting, icon] of Object.entries(options)) {
    const page = await createPage(t, {
      html: `<nav><button id="target"><span><span data-icon="${icon}"></span></span></button><button id="keep">Chats</button></nav>`,
      stored: { settings: { [setting]: true } }
    });
    assert.equal(page.window.getComputedStyle(page.document.getElementById("target")).display, "none", setting);
    assert.notEqual(page.window.getComputedStyle(page.document.querySelector("nav")).display, "none", setting);
    assert.notEqual(page.window.getComputedStyle(page.document.getElementById("keep")).display, "none", setting);
  }
});

test("button hiding leaves message links and unrelated media tabs intact", async (t) => {
  const page = await createPage(t, {
    html: '<div data-id="link"><a id="message-link" href="https://example.com/status/report">Status report</a></div><button id="picker" aria-label="Emojis, GIFs, Stickers">Open picker</button><button role="tab" aria-label="GIF">GIF</button><button role="tab" aria-label="Emoji">Emoji</button>',
    stored: { settings: { hideStatus: true, hideGifs: true, hideEmojis: false, hideStickers: false } }
  });
  assert.notEqual(page.window.getComputedStyle(page.document.getElementById("message-link")).display, "none");
  assert.notEqual(page.window.getComputedStyle(page.document.getElementById("picker")).display, "none");
  assert.equal(page.window.getComputedStyle(page.document.querySelector('[aria-label="GIF"]')).display, "none");
  assert.notEqual(page.window.getComputedStyle(page.document.querySelector('[aria-label="Emoji"]')).display, "none");
});

test("recovered text obeys the open-chat privacy blur", async (t) => {
  const page = await createPage(t, {
    html: '<div data-id="deleted"><span>This message was deleted</span></div>',
    stored: { settings: { blurMessages: true }, messageCache: [{ id: "deleted", text: "Private saved text" }] }
  });
  assert.equal(page.window.getComputedStyle(page.document.querySelector(".pwat-deleted-text")).filter, "blur(5px)");
});

test("turning off the read-receipt guard restores actual page visibility and focus", async (t) => {
  const page = await createPage(t);
  page.evaluate(`
    let nativeHidden = true;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => nativeHidden });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => nativeHidden ? "hidden" : "visible" });
    document.hasFocus = () => !nativeHidden;
  `);
  page.evaluate(source("src/read-receipt-guard.js"));
  const toggle = (enabled) => page.window.dispatchEvent(new page.window.MessageEvent("message", {
    source: page.window,
    data: { type: "PWAT_SET_READ_RECEIPT_GUARD", enabled }
  }));
  toggle(false);
  assert.equal(page.document.hidden, true);
  assert.equal(page.document.visibilityState, "hidden");
  page.evaluate("nativeHidden = false");
  assert.equal(page.document.hidden, false);
  assert.equal(page.document.visibilityState, "visible");
  assert.equal(page.document.hasFocus(), true);
  toggle(true);
  assert.equal(page.document.hidden, true);
  assert.equal(page.document.hasFocus(), false);
});

test("read-receipt blocking stays off for users who never opted in", async (t) => {
  // Older builds shipped this on by default, which left chats unread on every
  // linked device, phone included. A stored true must not survive the upgrade.
  const page = await createPage(t, { stored: { settings: { disableReadReceipts: true } } });
  assert.equal(page.api.state.settings.disableReadReceipts, false);
  assert.equal(page.api.normalizeSettings({ disableReadReceipts: true }).disableReadReceipts, false);
  assert.equal(page.window.localStorage.getItem("pwatReadReceiptGuardOptIn"), "false");
});

test("read-receipt blocking is honoured once the user opts in", async (t) => {
  const page = await createPage(t, { stored: { settings: { disableReadReceipts: true, readReceiptsOptedIn: true } } });
  assert.equal(page.api.state.settings.disableReadReceipts, true);
  assert.equal(page.api.normalizeSettings({ disableReadReceipts: true, readReceiptsOptedIn: true }).disableReadReceipts, true);
  assert.equal(page.window.localStorage.getItem("pwatReadReceiptGuardOptIn"), "true");
});

test("ticking the popup control records the read-receipt opt-in", async (t) => {
  const storage = createStorage();
  const popup = await createPage(t, { storage, popup: true });
  const input = popup.document.querySelector('[data-setting="disableReadReceipts"]');
  assert.equal(input.checked, false);
  input.checked = true;
  input.dispatchEvent(new popup.window.Event("change"));
  await settle();
  assert.equal(storage.data.settings.readReceiptsOptedIn, true);
  assert.equal(storage.data.settings.disableReadReceipts, true);
});

test("a stale guard flag from the old default cannot arm the guard on load", async (t) => {
  const page = await createPage(t);
  page.window.localStorage.setItem("pwatDisableReadReceipts", "true");
  page.evaluate(`
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.hasFocus = () => true;
  `);
  page.evaluate(source("src/read-receipt-guard.js"));
  assert.equal(page.document.hidden, false);
  assert.equal(page.document.visibilityState, "visible");
  assert.equal(page.document.hasFocus(), true);
  assert.equal(page.window.localStorage.getItem("pwatDisableReadReceipts"), null);
});

test("opting out unhooks the guard instead of leaving it installed", async (t) => {
  const page = await createPage(t);
  page.evaluate(`
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.hasFocus = () => true;
  `);
  page.evaluate(source("src/read-receipt-guard.js"));
  const toggle = (enabled) => page.window.dispatchEvent(new page.window.MessageEvent("message", {
    source: page.window,
    data: { type: "PWAT_SET_READ_RECEIPT_GUARD", enabled }
  }));
  let focusSeen = 0;
  page.window.addEventListener("focus", () => { focusSeen += 1; });

  toggle(true);
  assert.equal(page.document.hidden, true);
  // Page code may hold on to this reference, so it must not change per read.
  assert.equal(page.document.hasFocus, page.document.hasFocus);
  assert.equal(page.document.hasFocus(), false);
  page.window.dispatchEvent(new page.window.Event("focus"));
  assert.equal(focusSeen, 0, "guard should swallow focus while armed");

  toggle(false);
  assert.equal(page.document.hidden, false);
  assert.equal(page.document.visibilityState, "visible");
  assert.equal(page.document.hasFocus(), true);
  page.window.dispatchEvent(new page.window.Event("focus"));
  assert.equal(focusSeen, 1, "focus events must reach the page again once opted out");
});

test("hiding a nav button also removes its leftover unread badge", async (t) => {
  // WhatsApp renders the badge as a sibling of the button inside a 40x40
  // wrapper, so hiding only the button left an orphan green dot in the rail.
  const navItem = (label, badge) => `
    <div class="item"><span><div class="wrap">
      <button aria-label="${label}"><span data-icon="${label.toLowerCase()}-outline"></span></button>
      <div class="badge"><span role="status">${badge}</span></div>
    </div></span></div>`;
  const page = await createPage(t, {
    html: `<header><div data-testid="navbar-primary-section">
      ${navItem("Chats", "3")}${navItem("Status", "")}${navItem("Channels", "2")}
    </div></header>`,
    stored: { settings: { hideStatus: true, hideChannels: true } }
  });
  const shown = (label) => {
    const button = page.document.querySelector(`[aria-label="${label}"]`);
    const badge = button.closest(".wrap").querySelector('[role="status"]');
    const hiddenByAncestor = (el) => {
      for (let node = el; node && node !== page.document.body; node = node.parentElement) {
        if (page.window.getComputedStyle(node).display === "none") return true;
      }
      return false;
    };
    return { button: !hiddenByAncestor(button), badge: !hiddenByAncestor(badge) };
  };
  assert.deepEqual(shown("Status"), { button: false, badge: false });
  assert.deepEqual(shown("Channels"), { button: false, badge: false });
  assert.deepEqual(shown("Chats"), { button: true, badge: true }, "an unhidden nav item keeps its badge");
  assert.notEqual(page.window.getComputedStyle(page.document.querySelector('[data-testid="navbar-primary-section"]')).display, "none", "the rail itself must survive");
});

test("the badge rule never swallows a header row that holds the search box", async (t) => {
  // A chat-list header can hold a labelled control next to the search input.
  // Only wrappers that actually contain a badge may collapse.
  const page = await createPage(t, {
    html: `<header>
      <div id="searchrow">
        <button aria-label="Ask Meta AI">ai</button>
        <input id="searchbox" aria-label="Search or start a new chat">
      </div>
      <div data-testid="navbar-primary-section">
        <div id="statusitem"><button aria-label="Status"></button><div><span role="status"></span></div></div>
      </div>
    </header>`,
    stored: { settings: { hideMetaAi: true, hideStatus: true } }
  });
  const display = (sel) => page.window.getComputedStyle(page.document.querySelector(sel)).display;
  assert.notEqual(display("#searchrow"), "none", "the search row must survive");
  assert.notEqual(display("#searchbox"), "none", "the search box must survive");
  assert.equal(display('[aria-label="Ask Meta AI"]'), "none", "the Meta AI control itself is still hidden");
  assert.equal(display("#statusitem"), "none", "a rail item with a badge still collapses");
});
