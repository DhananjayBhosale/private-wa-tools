import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const files = [
  "manifest.json",
  "src/background.js",
  "src/content.js",
  "src/content.css",
  "src/read-receipt-guard.js",
  "src/popup.js",
  "src/popup.html",
  "src/popup.css",
  "src/offscreen.js",
  "src/offscreen.html"
];

const forbidden = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /\bsendBeacon\b/,
  /\bimportScripts\s*\(/,
  /https?:\/\/(?!web\.whatsapp\.com\/\*)/
];

let failed = false;

for (const file of files) {
  const content = readFileSync(resolve(file), "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(content)) {
      console.error(`Forbidden network/remote-code pattern in ${file}: ${pattern}`);
      failed = true;
    }
  }
}

if (failed) process.exit(1);
console.log("offline-audit ok");
