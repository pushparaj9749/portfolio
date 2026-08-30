#!/usr/bin/env node
/* =========================================================
   tools/check-pages.mjs
   Static cross-reference audit of the shell, the pages and the CSS.

   It answers the three questions that break silently in a refactor:
     1. Does every element a tool's JS reaches for actually exist on its page?
     2. Does every class those pages emit have a rule in styles.css?
     3. Does every local URL on a page resolve to a real file?

   Run: node tools/check-pages.mjs   (exits 1 on any hard failure)
   ========================================================= */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APP = join(ROOT, "app");

const read = (p) => readFileSync(p, "utf8");
const exists = (p) => existsSync(p);

// The registry is a plain data module, so it can be imported directly — that is
// the point: the audit and the site read the same list and cannot drift apart.
const { TOOLS } = await import(join(ROOT, "app/js/core/tools.js"));

let failures = 0;
let warnings = 0;
const fail = (m) => { failures++; console.log(`  FAIL  ${m}`); };
const warn = (m) => { warnings++; console.log(`  warn  ${m}`); };
const ok = (m) => console.log(`  ok    ${m}`);

/* ---------- 1. ids a page must provide ---------- */
console.log("\n1 · DOM contract (selectors in JS → elements in HTML)");

/** Selectors used via $("#id"), $$("[data-x]") and getElementById, incl. template pieces. */
function selectorsOf(js) {
  const ids = new Set();
  const datas = new Set();
  // Three separate patterns instead of one alternation: an escaped-quote
  // alternation is exactly the kind of thing that silently stops matching.
  const found = [];
  for (const re of [/\$\$?\(\s*"([^"]*)"/g, /\$\$?\(\s*'([^']*)'/g, /\$\$?\(\s*`([^`]*)`/g]) {
    for (const m of js.matchAll(re)) found.push(m[1]);
  }
  for (const sel of found) {
    if (sel.includes("${")) continue; // dynamic selector — cannot be checked statically
    for (const part of sel.split(",")) {
      const p = part.trim();
      const dm = p.match(/^\[data-([a-z-]+)(?:=[^\]]*)?\]$/);
      if (dm) datas.add(dm[1]);
      // `#id` anywhere in the selector, incl. "#a .b" and "#x > panel"
      for (const inner of p.matchAll(/#([A-Za-z][\w-]*)/g)) ids.add(inner[1]);
    }
  }
  // Elements created by JS then queried later: `id: "foo"` inside el() or template strings.
  const created = new Set();
  for (const c of js.matchAll(/id="([\w-]+)"/g)) created.add(c[1]);
  for (const c of js.matchAll(/\bid:\s*"([\w-]+)"/g)) created.add(c[1]);
  return { ids: [...ids].filter((i) => !created.has(i)), datas: [...datas] };
}

for (const tool of TOOLS) {
  const isHub = tool.id === "images";
  const pagePath = isHub ? join(APP, "images/index.html") : join(APP, `tools/${tool.id}/index.html`);
  const jsPath = isHub ? join(APP, "js/images.js") : join(APP, `js/tools/${tool.id}.js`);
  if (!exists(pagePath)) { fail(`${tool.id}: page missing at ${pagePath.replace(ROOT + "/", "")}`); continue; }
  if (!exists(jsPath)) { fail(`${tool.id}: module missing at ${jsPath.replace(ROOT + "/", "")}`); continue; }
  const html = read(pagePath);
  const js = read(jsPath);
  const { ids, datas } = selectorsOf(js);
  const missing = ids.filter((id) => !new RegExp(`\\bid="${id}"`).test(html));
  const missingData = datas.filter((d) => !new RegExp(`data-${d}[=\\s>]`).test(html) && !new RegExp(`data-${d}[=\\s>]`).test(js));
  const shellIds = ["themeBtn", "privacyChip", "toasts"]; // built by the shell at runtime
  const realMissing = missing.filter((id) => !shellIds.includes(id));
  if (realMissing.length) fail(`${tool.id}: JS reaches for #${realMissing.join(", #")} — not in the page`);
  else if (missingData.length) warn(`${tool.id}: no [data-${missingData.join("], [data-")}] hooks found`);
  else ok(`${tool.id.padEnd(6)} ${String(ids.length).padStart(3)} ids + ${datas.length} data-hooks resolved`);
}

/* ---------- 2. classes emitted vs classes styled ---------- */
console.log("\n2 · CSS coverage (classes used → rules in styles.css)");
const css = read(join(APP, "styles.css"));
const styled = new Set([...css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]));

// shared UI vocabulary that legitimately has no rule of its own
// behaviour-only hooks: styled by JS (transform) or intentionally bare modifiers
const ALLOW_UNSTYLED = new Set(["is-on", "mono", "dim", "accent", "magnetic"]);
const perToolMissing = new Map();
for (const tool of TOOLS) {
  const isHub = tool.id === "images";
  const pagePath = isHub ? join(APP, "images/index.html") : join(APP, `tools/${tool.id}/index.html`);
  const jsPath = isHub ? join(APP, "js/images.js") : join(APP, `js/tools/${tool.id}.js`);
  const text = read(pagePath) + (exists(jsPath) ? read(jsPath) : "");
  // Drop ${…} interpolations and inline style/attr noise first, otherwise
  // fragments of expressions get mistaken for class names.
  const clean = text.replace(/\$\{[^{}]*\}/g, " ").replace(/class="([^"]*)"/g, (all, g) => `class="${g}"`);
  const used = new Set();
  const addAll = (raw) => {
    for (const c of raw.replace(/\$\{[^{}]*\}/g, " ").split(/[\s"',]+/)) if (/^-?[_a-zA-Z][\w-]*$/.test(c)) used.add(c);
  };
  for (const m of clean.matchAll(/class(?:List)?\s*(?:=|\.add\(|\.remove\(|\.toggle\()\s*"([^"]*)"/g)) addAll(m[1]);
  for (const m of clean.matchAll(/class="([^"]*)"/g)) addAll(m[1]);
  const miss = [...used].filter((c) => !styled.has(c) && !ALLOW_UNSTYLED.has(c));
  if (miss.length) perToolMissing.set(tool.id, miss);
}
if (perToolMissing.size === 0) ok("every emitted class has a rule");
for (const [id, miss] of perToolMissing) warn(`${id}: unstyled → ${miss.join(", ")}`);

/* ---------- 3. local URLs resolve ---------- */
console.log("\n3 · Asset references");
const pages = [join(APP, "index.html"), join(APP, "images/index.html"), ...TOOLS.filter((t) => t.id !== "images").map((t) => join(APP, `tools/${t.id}/index.html`))];
for (const page of pages) {
  const html = read(page);
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).concat([...html.matchAll(/content="((?:\.\.\/|\.\/)[^"]+)"/g)].map((m) => m[1]));
  const broken = refs.filter((r) => !/^(https?:|mailto:|#|data:)/.test(r) && !exists(resolve(dirname(page), r)));
  if (broken.length) fail(`${page.replace(ROOT + "/", "")}: broken → ${broken.join(", ")}`);
}
if (failures === 0) ok(`all ${pages.length} pages resolve their local assets`);

/* ---------- 4. shell/boot wiring ---------- */
console.log("\n4 · Boot wiring");
for (const tool of TOOLS) {
  const isHub = tool.id === "images";
  const jsPath = isHub ? join(APP, "js/images.js") : join(APP, `js/tools/${tool.id}.js`);
  const js = read(jsPath);
  const callsShell = isHub ? /bootTool\(\)/.test(js) : /shell\.bootTool\(\)|bootTool\(\)/.test(js);
  const page = isHub ? join(APP, "images/index.html") : join(APP, `tools/${tool.id}/index.html`);
  const html = read(page);
  const tag = new RegExp(`<script[^>]*type="module"[^>]*src="([^"]+)"`).exec(html);
  if (!callsShell) fail(`${tool.id}: never calls bootTool() — no theme, no nav, no privacy chip`);
  else if (!tag) fail(`${tool.id}: page has no module script tag`);
  else if (!resolve(dirname(page), tag[1]).endsWith(jsPath)) fail(`${tool.id}: page loads ${tag[1]}, expected ${jsPath.replace(ROOT + "/", "")}`);
  else ok(`${tool.id.padEnd(6)} boots through the shell`);
}

/* ---------- 5. service-worker shell list is current ---------- */
console.log("\n5 · Offline shell completeness");
const sw = read(join(APP, "sw.js"));
const listed = new Set([...sw.matchAll(/"((?:\.\/)?[^"]+?\.(?:html|css|js|svg|png|webmanifest))"/g)].map((m) => m[1].replace(/^\.\//, "")));
// nb: sw.js must NOT be cached — a worker that caches itself never updates.
const want = ["index.html", "styles.css", "manifest.webmanifest", "js/shell.js", "js/hub.js", "js/images.js", "js/bench.worker.js", "js/core/tools.js"];
for (const t of TOOLS) {
  if (t.id === "images") { want.push("images/index.html"); continue; }
  want.push(`tools/${t.id}/index.html`, `js/tools/${t.id}.js`);
}
const notCached = want.filter((w) => ![...listed].some((l) => l.endsWith(w)));
if (notCached.length) fail(`not precached → ${notCached.join(", ")}`);
else ok(`${want.length} shell files all precached`);

console.log(`\n${failures} failure(s), ${warnings} warning(s)\n`);
process.exit(failures ? 1 : 0);
