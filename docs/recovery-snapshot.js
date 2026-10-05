// Private WA Tools: deleted-message snapshot.
// Paste into the DevTools console on web.whatsapp.com with the chat open.
// It records page STRUCTURE only. Message text, names, numbers, links and ids
// are removed before anything is shown. Read the output before you share it.
(() => {
  // Texts written by WhatsApp itself are kept as they are. If your WhatsApp is
  // not in English, add the "deleted message" text from your language here.
  const PLACEHOLDERS = [
    "this message was deleted",
    "you deleted this message",
    "this message has been deleted",
    "waiting for this message. this may take a while."
  ];
  const RECALL_ICON = /recall|revoke|delete|block/i;
  const MAX_NODES = 150;
  const MAX_DEPTH = 14;

  const clean = (text) => String(text).toLowerCase().replace(/\s+/g, " ").replace(/[.…]+$/, "").trim();
  const placeholders = PLACEHOLDERS.map(clean);
  // One-way tag, so two runs can be compared without revealing the real id.
  const hash = (value) => {
    let h = 2166136261;
    for (const ch of String(value)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return (h >>> 0).toString(16);
  };
  const shape = (value) => String(value).replace(/[A-Z]/g, "A").replace(/[a-z]/g, "a").replace(/[0-9]/g, "9").slice(0, 48);
  const token = (value) => (/^[\w-]{1,40}$/.test(value) && !/\d{5,}/.test(value) ? value : shape(value));
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").replace(/\s+/g, " ").trim();
  const redact = (text) => (placeholders.includes(clean(text)) ? text : `[${text.length} chars]`);

  const describe = (el, depth, budget) => {
    if (budget.left <= 0) return { truncated: true };
    budget.left -= 1;
    const node = { tag: el.tagName.toLowerCase() };
    const cls = (el.getAttribute("class") || "").trim();
    if (cls) node.class = cls;
    for (const name of ["role", "dir", "aria-hidden", "data-icon", "data-testid"]) {
      const value = el.getAttribute(name);
      if (value !== null) node[name] = token(value);
    }
    for (const name of ["aria-label", "title", "alt", "href", "src"]) {
      const value = el.getAttribute(name);
      if (value) node[name] = `[${value.length} chars]`;
    }
    const text = ownText(el);
    if (text) node.text = redact(text);
    if (depth < MAX_DEPTH && el.children.length) node.children = [...el.children].map((child) => describe(child, depth + 1, budget));
    return node;
  };

  const main = document.querySelector("#main");
  if (!main) return "Open a chat first, then run this again.";

  const rows = [...main.querySelectorAll("div[data-id]")].filter((row) => !row.parentElement.closest("div[data-id]"));
  const looksDeleted = (row) =>
    [...row.querySelectorAll("[data-icon]")].some((icon) => RECALL_ICON.test(icon.getAttribute("data-icon") || "")) ||
    placeholders.some((p) => clean(row.textContent || "").includes(p));
  const entry = (row) => ({
    id: hash(row.getAttribute("data-id")),
    idShape: shape(row.getAttribute("data-id")),
    tree: describe(row, 0, { left: MAX_NODES })
  });
  const example = [...rows].reverse().find((row) => !looksDeleted(row) && row.querySelector(".selectable-text"));

  const report = {
    capturedAt: new Date().toISOString(),
    browser: navigator.userAgent,
    whatsappVersion: (() => { try { return window.Debug?.VERSION ?? null; } catch (_error) { return null; } })(),
    language: document.documentElement.lang || null,
    extensionClasses: [...document.body.classList].filter((name) => name.startsWith("pwat-")),
    rowCount: rows.length,
    recentRowIds: rows.slice(-30).map((row) => hash(row.getAttribute("data-id"))),
    deletedRows: rows.filter(looksDeleted).map(entry),
    normalRowExample: example ? entry(example) : null
  };
  const json = JSON.stringify(report);
  if (typeof copy === "function") copy(json);
  return json;
})()
