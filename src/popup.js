const DEFAULT_SETTINGS = {
  copyButtons: true,
  restoreDeleted: true,
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

init();

async function init() {
  const stored = await chrome.storage.local.get("settings");
  const settings = normalizeSettings(stored.settings);

  document.querySelectorAll("[data-setting]").forEach((input) => {
    input.checked = Boolean(settings[input.dataset.setting]);
    input.addEventListener("change", async () => {
      settings[input.dataset.setting] = input.checked;
      if (input.dataset.setting === "localPins") settings.localPinsOptedIn = true;
      if (input.dataset.setting === "disableReadReceipts") settings.readReceiptsOptedIn = true;
      await chrome.storage.local.set({ settings });
    });
  });

  document.getElementById("clear-cache").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      const response = await chrome.runtime.sendMessage({ type: "PWAT_CLEAR_MESSAGE_CACHE" });
      if (!response?.ok) throw new Error(response?.error || "Could not clear the cache");
      button.textContent = "Message cache cleared";
    } catch (_error) {
      button.textContent = "Could not clear cache. Try again.";
    } finally {
      button.disabled = false;
    }
  });
}

function normalizeSettings(storedSettings = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...storedSettings };
  if (!settings.localPinsOptedIn) settings.localPins = false;
  // Blocking read receipts stops WhatsApp marking chats as read on every linked
  // device, including the phone, so it stays off until the user turns it on.
  if (!settings.readReceiptsOptedIn) settings.disableReadReceipts = false;
  return settings;
}
