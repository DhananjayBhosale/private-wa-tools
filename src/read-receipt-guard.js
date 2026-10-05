(() => {
  // Renamed key: older builds turned this guard on by default, so a stale
  // "true" under the previous name must never arm the guard again.
  const STORAGE_KEY = "pwatReadReceiptGuardOptIn";
  const LEGACY_STORAGE_KEY = "pwatDisableReadReceipts";

  let enabled = false;
  try {
    enabled = localStorage.getItem(STORAGE_KEY) === "true";
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch (_error) {
    // The settings message can still enable the guard if page storage is blocked.
  }
  let patched = false;
  const nativeHasFocus = document.hasFocus.bind(document);

  function nativeGetter(property, fallback) {
    let target = document;
    while (target) {
      const descriptor = Object.getOwnPropertyDescriptor(target, property);
      if (descriptor) return descriptor.get ? descriptor.get.bind(document) : () => descriptor.value;
      target = Object.getPrototypeOf(target);
    }
    return fallback;
  }

  const hidden = nativeGetter("hidden", () => false);
  const visibility = nativeGetter("visibilityState", () => hidden() ? "hidden" : "visible");
  const webkitHidden = nativeGetter("webkitHidden", hidden);
  const webkitVisibility = nativeGetter("webkitVisibilityState", visibility);

  function blockEvent(event) {
    if (!enabled) return;
    event.stopImmediatePropagation();
  }

  // One stable function, not a fresh closure per read: page code may hold or
  // compare document.hasFocus, and an identity that changes on every access is
  // observably different from the real thing.
  const guardedHasFocus = () => !enabled && nativeHasFocus();

  const patchedProperties = ["hidden", "visibilityState", "webkitHidden", "webkitVisibilityState", "hasFocus"];
  const originalDescriptors = new Map();

  function define(property, getter) {
    if (!originalDescriptors.has(property)) {
      originalDescriptors.set(property, Object.getOwnPropertyDescriptor(document, property) || null);
    }
    try {
      Object.defineProperty(document, property, { configurable: true, get: getter });
    } catch (_error) {
      // Some browser builds may not allow redefining these fields.
    }
  }

  function patchVisibility() {
    if (patched) return;
    patched = true;

    define("hidden", () => enabled || hidden());
    define("visibilityState", () => (enabled ? "hidden" : visibility()));
    define("webkitHidden", () => enabled || webkitHidden());
    define("webkitVisibilityState", () => (enabled ? "hidden" : webkitVisibility()));
    define("hasFocus", () => guardedHasFocus);

    window.addEventListener("focus", blockEvent, true);
    window.addEventListener("blur", blockEvent, true);
    document.addEventListener("visibilitychange", blockEvent, true);
  }

  // Turning the guard off must hand the page back exactly as it was found, not
  // just flip a flag behind accessors that stay installed for the page's life.
  function unpatchVisibility() {
    if (!patched) return;
    patched = false;

    for (const property of patchedProperties) {
      const descriptor = originalDescriptors.get(property);
      try {
        if (descriptor) {
          Object.defineProperty(document, property, descriptor);
        } else {
          delete document[property];
        }
      } catch (_error) {
        // Leave the accessor in place; it already reports the real value.
      }
    }
    originalDescriptors.clear();

    window.removeEventListener("focus", blockEvent, true);
    window.removeEventListener("blur", blockEvent, true);
    document.removeEventListener("visibilitychange", blockEvent, true);
  }

  function setEnabled(nextEnabled) {
    enabled = Boolean(nextEnabled);
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch (_error) {
      // Keep the in-memory setting working without page storage.
    }
    if (enabled) {
      patchVisibility();
    } else {
      unpatchVisibility();
    }
    window.__PWAT_READ_RECEIPT_GUARD__ = {
      enabled,
      patched
    };
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== "PWAT_SET_READ_RECEIPT_GUARD") return;
    setEnabled(event.data.enabled);
  });

  if (enabled) patchVisibility();
  setEnabled(enabled);
})();
