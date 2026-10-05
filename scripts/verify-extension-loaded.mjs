import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const extensionPath = resolve(".");
const profileDir = mkdtempSync(`${tmpdir()}/pwat-extension-profile-`);
const port = 9232;
let chrome;

try {
  chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profileDir}`,
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    `--remote-debugging-port=${port}`,
    "https://web.whatsapp.com"
  ], { stdio: ["ignore", "ignore", "pipe"] });

  const browser = await waitForBrowser();
  const cdp = await connectCdp(browser.webSocketDebuggerUrl);
  const targets = await waitForExtensionTarget(cdp);
  const extensionTargets = targets.filter((target) => target.url?.startsWith("chrome-extension://"));

  if (extensionTargets.length === 0) {
    throw new Error("No chrome-extension target found after loading unpacked extension");
  }

  console.log("extension-load ok");
  for (const target of extensionTargets) {
    console.log(`${target.type} ${target.url}`);
  }

  await cdp.close();
} finally {
  if (chrome && !chrome.killed) chrome.kill("SIGKILL");
  await delay(250);
  rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

async function waitForBrowser() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return await response.json();
    } catch (_error) {
      await delay(100);
    }
  }
  throw new Error("Chrome DevTools browser endpoint was not available");
}

async function waitForExtensionTarget(cdp) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const result = await cdp.send("Target.getTargets");
    if (result.targetInfos.some((target) => target.url?.startsWith("chrome-extension://"))) {
      return result.targetInfos;
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for unpacked extension target");
}

function connectCdp(url) {
  const socket = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const callbacks = pending.get(message.id);
    if (!callbacks) return;
    pending.delete(message.id);
    if (message.error) {
      callbacks.reject(new Error(message.error.message));
    } else {
      callbacks.resolve(message.result);
    }
  });

  return new Promise((resolveConnection, reject) => {
    socket.addEventListener("open", () => {
      resolveConnection({
        send(method, params = {}) {
          const id = nextId;
          nextId += 1;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((resolve, rejectCommand) => {
            pending.set(id, { resolve, reject: rejectCommand });
          });
        },
        close() {
          socket.close();
        }
      });
    });
    socket.addEventListener("error", reject);
  });
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
