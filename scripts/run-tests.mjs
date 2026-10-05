import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const chromePath = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const profileDir = mkdtempSync(`${tmpdir()}/pwat-chrome-profile-`);
const port = 9231;
const fixturePort = process.env.PWAT_TEST_SERVER_PORT || "18765";
const fixtureUrl = `http://127.0.0.1:${fixturePort}/test/fixture.html`;

let chrome;

try {
  chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${port}`,
    fixtureUrl
  ], { stdio: ["ignore", "ignore", "pipe"] });

  let stderr = "";
  chrome.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const page = await waitForPage();
  const cdp = await connectCdp(page.webSocketDebuggerUrl);
  const expression = `
    new Promise((resolve) => {
      const started = Date.now();
      const timer = setInterval(() => {
        const text = document.getElementById("test-results")?.textContent || "";
        if (text.trim()) {
          clearInterval(timer);
          resolve(text);
        }
        if (Date.now() - started > 8000) {
          clearInterval(timer);
          resolve(JSON.stringify({ passed: false, results: [{ name: "fixture timeout", passed: false }] }));
        }
      }, 100);
    })
  `;

  const evaluated = await evaluateWithRetry(cdp, expression);
  const result = JSON.parse(evaluated.result.value);

  for (const item of result.results) {
    console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}`);
  }

  if (!result.passed) process.exitCode = 1;
  await cdp.close();
} finally {
  if (chrome && !chrome.killed) chrome.kill("SIGKILL");
  await delay(250);
  rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

async function waitForPage() {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const pages = await response.json();
      const page = pages.find((entry) => entry.type === "page");
      if (page?.webSocketDebuggerUrl) return page;
    } catch (_error) {
      await delay(100);
    }
  }
  throw new Error("Chrome DevTools page was not available");
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

async function evaluateWithRetry(cdp, expression) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await cdp.send("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true
      });
    } catch (error) {
      lastError = error;
      if (!String(error.message || error).includes("Execution context was destroyed")) {
        throw error;
      }
      await delay(300);
    }
  }
  throw lastError;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
