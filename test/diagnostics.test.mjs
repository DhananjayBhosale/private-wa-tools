import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { source } from "./helpers.mjs";

const SENSITIVE = ["Priya Sharma", "9876543210", "secret plan", "example.com/private", "3EB0ABCDEF123456", "919876543210"];

function page(secondRow) {
  const dom = new JSDOM(`<body><div id="main">
    <div data-id="true_919876543210@c.us_3EB0ABCDEF123456"><div class="bubble">
      <span class="selectable-text" dir="ltr">Meet Priya Sharma at 9876543210, secret plan</span>
      <a href="https://example.com/private">link</a>
      <button aria-label="Message Priya Sharma"></button>
    </div></div>
    <div data-id="false_919876543210@c.us_3EB0ZZZZ00001111">${secondRow}</div>
  </div></body>`, { runScripts: "outside-only" });
  return dom;
}

const run = (dom) => dom.window.eval(source("docs/recovery-snapshot.js"));
const normal = '<div class="bubble"><span class="selectable-text" title="Priya Sharma">Call me on 9876543210</span></div>';
const deleted = '<div class="bubble"><span data-icon="recalled"></span><span class="x1">This message was deleted</span><span title="Priya Sharma"></span></div>';

test("the snapshot keeps structure but removes text, names, numbers, links and ids", () => {
  const output = run(page(deleted));
  for (const secret of SENSITIVE) assert.ok(!output.includes(secret), `leaked: ${secret}`);
  const report = JSON.parse(output);
  assert.equal(report.deletedRows.length, 1);
  assert.match(output, /"data-icon":"recalled"/);
  assert.match(output, /This message was deleted/);
  assert.match(report.deletedRows[0].idShape, /^[Aa9_@.]+$/, "id shape must hold no real characters");
  assert.ok(report.normalRowExample, "a normal row is included for comparison");
});

test("a message keeps the same tag before and after it is deleted", () => {
  const before = JSON.parse(run(page(normal)));
  const after = JSON.parse(run(page(deleted)));
  assert.equal(before.deletedRows.length, 0);
  assert.ok(before.recentRowIds.includes(after.deletedRows[0].id), "the hashed id lets two runs be matched");
});

test("the snapshot asks for an open chat instead of failing", () => {
  const dom = new JSDOM("<body></body>", { runScripts: "outside-only" });
  assert.match(run(dom), /Open a chat first/);
});
