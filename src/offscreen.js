chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "PWAT_OFFSCREEN_COPY_TEXT") return false;

  copyText(message.text)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function copyText(text) {
  if (!text) throw new Error("Nothing to copy");

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch (_error) {
    // Fall through to execCommand for Chrome versions that restrict async clipboard in offscreen documents.
  }

  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.cssText = "height:1px;left:0;opacity:0;position:fixed;top:0;width:1px;";
  document.body.appendChild(input);

  input.focus();
  input.select();
  input.setSelectionRange(0, input.value.length);

  try {
    if (!document.execCommand("copy")) throw new Error("Clipboard write failed");
  } finally {
    input.remove();
  }
}
