import assert from "node:assert/strict";
import test from "node:test";
import { createPage, message, settle } from "./helpers.mjs";

test("normal copy keeps text, line breaks and emoji without metadata", async (t) => {
  const page = await createPage(t, { html: message("copy", 'First line<br>Second line <img alt="🙂">') });
  const metadata = page.document.createElement("span");
  metadata.dataset.testid = "msg-meta";
  metadata.textContent = "12:34";
  page.document.querySelector(".fixture-bubble").append(metadata);
  let copied;
  Object.defineProperty(page.window.navigator, "clipboard", { value: { async writeText(text) { copied = text; } } });
  const messageText = page.api.extractMessageText(page.document.querySelector("[data-id]"));
  await page.api.copyTextToClipboard(messageText);
  assert.equal(copied, "First line\nSecond line 🙂");
});

test("copy falls back to selection without changing the user's selection", async (t) => {
  const page = await createPage(t, { html: message("selection") });
  Object.defineProperty(page.window.navigator, "clipboard", { value: { async writeText() { throw new Error("Clipboard unavailable"); } } });
  const textNode = page.document.querySelector(".selectable-text").firstChild;
  const range = page.document.createRange();
  range.setStart(textNode, 0);
  range.setEnd(textNode, 8);
  page.document.getSelection().addRange(range);
  let copied;
  page.document.execCommand = () => {
    copied = page.document.activeElement.value;
    return true;
  };
  await page.api.copyTextToClipboard("Fallback text");
  assert.equal(copied, "Fallback text");
  assert.equal(page.document.getSelection().toString(), "Original");
  assert.equal(page.document.querySelector("textarea"), null);
});

test("read-more expansion still completes before copying text", async (t) => {
  const page = await createPage(t, { html: message("long", "Collapsed...") });
  const button = page.document.createElement("button");
  button.textContent = "Read more";
  const node = page.document.querySelector("[data-id]");
  node.append(button);
  button.addEventListener("click", () => {
    node.querySelector(".selectable-text").textContent = "Complete expanded message";
    button.remove();
  });
  const expansion = page.evaluate('expandReadMoreInMessage(document.querySelector("[data-id]"))');
  await settle();
  await page.flush(500);
  await expansion;
  assert.equal(page.api.extractMessageText(node), "Complete expanded message");
});

test("stored hide settings and local pin opt-in are preserved", async (t) => {
  const page = await createPage(t);
  const settings = page.api.normalizeSettings({ hideStatus: false, hideChannels: true, hideMetaAi: false, localPins: true });
  assert.equal(settings.hideStatus, false);
  assert.equal(settings.hideChannels, true);
  assert.equal(settings.hideMetaAi, false);
  assert.equal(settings.localPins, false);
  assert.equal(page.api.normalizeSettings({ localPins: true, localPinsOptedIn: true }).localPins, true);
});

test("short message bodies are not mistaken for timestamp or read-status metadata", async (t) => {
  const page = await createPage(t);
  for (const text of ["Edited", "Read", "12:34"]) {
    page.document.getElementById("main").innerHTML = message("short", text);
    assert.equal(page.api.extractMessageText(page.document.querySelector("[data-id]")), text);
  }
});
