import { spawn } from "node:child_process";

const port = process.env.PWAT_TEST_SERVER_PORT || "18765";
const server = spawn("python3", ["-m", "http.server", port, "--bind", "127.0.0.1"], {
  stdio: ["ignore", "ignore", "pipe"]
});

try {
  await waitForServer();
  const test = spawn("node", ["scripts/run-tests.mjs"], {
    stdio: "inherit",
    env: { ...process.env, PWAT_TEST_SERVER_PORT: port }
  });
  const code = await new Promise((resolve) => test.on("exit", resolve));
  process.exitCode = code ?? 1;
} finally {
  server.kill("SIGKILL");
}

async function waitForServer() {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/test/fixture.html`);
      if (response.ok) return;
    } catch (_error) {
      await delay(100);
    }
  }
  throw new Error("Test server did not start");
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
