import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInContext, runInNewContext } from "node:vm";
import { JSDOM } from "jsdom";

const sourceRoot = resolve(process.env.PWAT_TEST_SOURCE_DIR || ".");
export const source = (path) => readFileSync(resolve(sourceRoot, path), "utf8");
export const settle = () => new Promise((resolve) => setImmediate(resolve));

export function createStorage(stored = {}) {
  const data = structuredClone({ settings: {}, messageCache: [], ...stored });
  const listeners = new Set();
  const messageListeners = [];
  const writes = [];
  const chrome = {
    storage: {
      local: {
        async get(keys, callback) {
          const names = typeof keys === "string" ? [keys] : keys;
          const values = structuredClone(Object.fromEntries(names.map((key) => [key, data[key]])));
          callback?.(values);
          return values;
        },
        async set(values) {
          const changes = {};
          for (const [key, value] of Object.entries(values)) {
            if (JSON.stringify(data[key]) === JSON.stringify(value)) continue;
            changes[key] = { oldValue: structuredClone(data[key]), newValue: structuredClone(value) };
            data[key] = structuredClone(value);
          }
          writes.push(structuredClone(values));
          if (Object.keys(changes).length) {
            queueMicrotask(() => listeners.forEach((listener) => listener(changes, "local")));
          }
        }
      },
      onChanged: {
        addListener(listener) { listeners.add(listener); },
        removeListener(listener) { listeners.delete(listener); }
      }
    },
    runtime: {
      onInstalled: { addListener() {} },
      onMessage: { addListener(listener) { messageListeners.push(listener); } },
      async sendMessage(message) {
        return new Promise((resolve, reject) => {
          for (const listener of messageListeners) {
            if (listener(structuredClone(message), {}, resolve) === true) return;
          }
          reject(new Error(`No handler for ${message.type}`));
        });
      }
    }
  };
  runInNewContext(source("src/background.js"), { chrome, console, setTimeout, clearTimeout });
  return { data, chrome, writes };
}

export async function createPage(t, { html = "", stored = {}, storage = createStorage(stored), popup = false } = {}) {
  const dom = new JSDOM(popup ? source("src/popup.html") : `<!doctype html><style>${source("src/content.css")}</style><body><div id="main">${html}</div></body>`, {
    url: "https://web.whatsapp.com/",
    runScripts: "outside-only"
  });
  const { window } = dom;
  let nextTimer = 0;
  const timers = new Map();
  window.setTimeout = (callback, delay) => {
    const id = ++nextTimer;
    timers.set(id, { callback, delay });
    return id;
  };
  window.clearTimeout = (id) => timers.delete(id);
  window.requestAnimationFrame = (callback) => window.setTimeout(callback, 16);
  window.cancelAnimationFrame = window.clearTimeout;
  window.chrome = storage.chrome;
  window.__PWAT_DISABLE_AUTO_INIT__ = true;
  const context = dom.getInternalVMContext();
  runInContext(source(popup ? "src/popup.js" : "src/content.js"), context);
  if (!popup) await window.__PrivateWATools.init();
  await settle();
  t.after(() => {
    if (!popup) runInContext("dispose()", context);
    window.close();
  });
  return {
    window,
    document: window.document,
    api: window.__PrivateWATools,
    storage,
    timers,
    evaluate: (code) => runInContext(code, context),
    async flush(delay = Infinity) {
      for (const [id, timer] of [...timers]) {
        if (timer.delay > delay || !timers.has(id)) continue;
        timers.delete(id);
        await timer.callback();
      }
      await settle();
    }
  };
}

export function message(id, text = "Original text") {
  return `<div data-id="${id}" class="message-in"><div class="fixture-bubble"><span class="selectable-text">${text}</span></div></div>`;
}
