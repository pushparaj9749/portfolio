/* =========================================================
   Hub — renders the tool grid from the registry so the nav,
   the cards and the service worker can never disagree about
   which tools exist. Plus: instant keyboard search.
   ========================================================= */

import { TOOLS } from "./js/core/tools.js";
import { bootTool, $, $$, escapeHtml, paintPrivacy, readRecent } from "./js/shell.js";

bootTool();

const grid = $("#grid");
const search = $("#q");
const count = $("#count");

function recent() {
  return readRecent();
}

function card(tool, opts = {}) {
  const { useCount = 0, fresh = false } = opts;
  const node = document.createElement("a");
  node.className = "toolcard";
  node.href = tool.href;
  node.dataset.id = tool.id;
  // The accent hue is a var(), not a literal, so it follows dark/light for free.
  node.style.setProperty("--card-accent", `var(--tool-${tool.id}-dark, var(--accent))`);
  node.innerHTML = `
    <span class="tc-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="${tool.glyph}"/></svg>
    </span>
    <h3>${escapeHtml(tool.name)}${fresh ? '<span class="pill is-new">new</span>' : ""}</h3>
    <p>${escapeHtml(tool.tagline)}</p>
    <span class="tc-meta">
      <span class="mini">${useCount ? `used ${useCount}× here` : "no account · no upload"}</span>
    </span>
    <span class="tc-go">open →</span>`;
  return node;
}

function render(list, fresh = new Set()) {
  grid.innerHTML = "";
  const frag = document.createDocumentFragment();
  const rec = new Map(recent().map((r) => [r.id, r.n]));
  for (const t of list) frag.append(card(t, { useCount: rec.get(t.id) || 0, fresh: fresh.has(t.id) }));
  grid.append(frag);
  count.textContent = list.length === TOOLS.length ? `${TOOLS.length} tools · 0 bytes uploaded` : `${list.length} of ${TOOLS.length} tools`;
  count.hidden = false;
}

/* ---- search: filter as you type, Enter opens the top hit ---- */
const FRESH = new Set(["text", "json", "color", "hash", "regex", "csv", "time"]);
render(TOOLS, FRESH);

let cursor = -1;
function applyQuery(q) {
  const needle = q.trim().toLowerCase();
  if (!needle) {
    render(TOOLS, FRESH);
    return;
  }
  const words = needle.split(/\s+/);
  const scored = TOOLS.map((t) => {
    const hay = `${t.name} ${t.tagline} ${t.keywords}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (t.name.toLowerCase().startsWith(w)) score += 6;
      else if (hay.includes(w)) score += 2;
      else score -= 10;
    }
    return { t, score };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.t);
  render(scored, new Set());
}

search.addEventListener("input", () => {
  cursor = -1;
  applyQuery(search.value);
});
search.addEventListener("keydown", (e) => {
  const cards = $$(".tcard");
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!cards.length) return;
    cursor = (cursor + (e.key === "ArrowDown" ? 1 : -1) + cards.length) % cards.length;
    cards.forEach((c, i) => c.classList.toggle("is-cursor", i === cursor));
    cards[cursor].scrollIntoView({ block: "nearest" });
  } else if (e.key === "Enter") {
    const hit = cards[cursor > -1 ? cursor : 0];
    if (hit) hit.click();
  } else if (e.key === "Escape") {
    search.value = "";
    applyQuery("");
    search.blur();
  }
});

addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== search) {
    e.preventDefault();
    search.focus();
    search.select();
  }
});

/* ---- tool counts live in localStorage; show a "continue where you left off" ---- */
const rec = recent().filter((r) => r.n > 0);
if (rec.length) {
  const map = new Map(TOOLS.map((t) => [t.id, t]));
  const last = rec.sort((a, b) => b.at - a.at)[0];
  const t = map.get(last.id);
  if (t) {
    const bar = $("#recent");
    bar.hidden = false;
    bar.innerHTML = `Continue where you left off —
      <a href="${escapeHtml(t.href)}">${escapeHtml(t.name)}</a>
      <span class="mini">${last.n} session${last.n === 1 ? "" : "s"} on this device</span>
      <button class="tbtn" type="button" id="forgetRecent">forget</button>`;
    $("#forgetRecent").addEventListener("click", () => {
      localStorage.removeItem(recentKey);
      bar.hidden = true;
      render(TOOLS, FRESH);
    });
  }
}

/* ---- live proof of the claim, not an assertion of it ---- */
function paintTrust() {
  paintPrivacy();
  const payload = performance.getEntriesByType?.("navigation")[0]?.encodedBodySize || 0;
  const all = performance.getEntriesByType?.("resource") || [];
  const bytes = all.reduce((n, r) => n + (r.encodedBodySize || 0), payload);
  const nodes = all.filter((r) => !r.name.startsWith(location.origin) && !r.name.startsWith("data:"));
  const t = $("[data-stat='payload']");
  if (t) t.textContent = bytes ? `${(bytes / 1024).toFixed(0)} KB` : "measuring…";
  const n = $("[data-stat='external']");
  if (n) n.textContent = String(nodes.length);
}
addEventListener("load", () => setTimeout(paintTrust, 120));
paintTrust();
