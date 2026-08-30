/* =========================================================
   Bench — shell
   Everything shared between tools: header + nav, theme, toasts,
   the live privacy audit, and small DOM helpers. Each tool page
   opts in with <body data-tool="json"> and calls bootTool().
   ========================================================= */

import { TOOLS, toolById, accentVars } from "./core/tools.js";
import { installPrivacyAudit, privacySummary } from "./core/store.js";
import { prettyBytes } from "./core/constants.js";

/* Lazy so the module can be imported by Node tests, where there is no matchMedia. */
export const reduced =
  typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)").matches : false;
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v === null || v === undefined) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return node;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function debounce(fn, ms = 180) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ---------- toasts ---------- */
const timers = new WeakMap();
export function toast(message, kind = "info", ms = 4200) {
  let host = $("#toasts");
  if (!host) {
    host = el("div", { class: "toasts", id: "toasts", "aria-live": "polite" });
    document.body.append(host);
  }
  const node = el("div", { class: `toast is-${kind}`, role: kind === "err" ? "alert" : "status", text: message });
  host.append(node);
  const kill = () => {
    node.classList.add("is-out");
    setTimeout(() => node.remove(), reduced ? 0 : 320);
  };
  timers.set(node, setTimeout(kill, ms));
  node.addEventListener("click", () => {
    clearTimeout(timers.get(node));
    kill();
  });
  while (host.children.length > 3) host.firstElementChild.remove();
}

/* ---------- clipboard / download ---------- */
export async function copyText(text, okMsg = "Copied to clipboard.") {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = el("textarea", { style: "position:fixed;top:-100px;opacity:0" });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      const fell = document.execCommand("copy");
      ta.remove();
      if (!fell) throw new Error("execCommand refused");
    }
    if (okMsg) toast(okMsg, "ok", 2200);
    return true;
  } catch (err) {
    toast("Clipboard blocked by the browser — select the text and copy manually.", "err", 5200);
    return false;
  }
}

export function downloadText(filename, text, mime = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = el("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
}

/* ---------- header ---------- */
function buildHeader(activeId) {
  const tool = toolById(activeId);
  const nav = el(
    "nav",
    { class: "toolnav", "aria-label": "All tools" },
    TOOLS.map((t) =>
      el("a", {
        href: base + t.href,
        class: `toolnav-item${t.id === activeId ? " is-active" : ""}`,
        title: t.tagline,
        "aria-current": t.id === activeId ? "page" : false,
        style: t.id === activeId ? `--nav-accent:${t.accent.dark}` : "",
        html: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${t.glyph}"/></svg><span>${t.name}</span>`,
      })
    )
  );
  // The hub lives one level up from every tool page.
  nav.querySelector("a")?.setAttribute("href", "../images/");

  const themeBtn = el("button", {
    class: "icon-btn",
    type: "button",
    id: "themeBtn",
    "aria-label": "Switch colour theme",
    html: '<span class="theme-icon" aria-hidden="true"></span>',
  });
  const privacyChip = el("button", {
    class: "chip",
    type: "button",
    id: "privacyChip",
    title: "Live count of requests sent outside this origin. Should always be zero.",
    html: '<span class="chip-dot" aria-hidden="true"></span><span id="privacyChipText">0 uploads</span>',
  });

  const header = el("header", { class: "top is-shell" }, [
    el(
      "a",
      { class: "brand", href: "../", "aria-label": "Bench — all tools" },
      [
        el("span", { class: "brand-mark", "aria-hidden": "true" }),
        el("span", { class: "brand-name", text: "Bench" }),
        tool ? el("span", { class: "brand-sub", text: tool.name }) : null,
      ]
    ),
    nav,
    el("div", { class: "top-actions" }, [privacyChip, themeBtn]),
  ]);
  document.body.prepend(header);

  const apply = (mode) => {
    document.documentElement.dataset.theme = mode;
    themeBtn.setAttribute("aria-label", mode === "dark" ? "Switch to light theme" : "Switch to dark theme");
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", mode === "dark" ? "#0f1017" : "#f4f3ef");
    try {
      localStorage.setItem("bench.theme.v1", JSON.stringify(mode));
    } catch {
      /* private mode */
    }
  };
  themeBtn.addEventListener("click", () =>
    apply(document.documentElement.dataset.theme === "dark" ? "light" : "dark")
  );
  apply(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  return { header, themeBtn, privacyChip };
}

export function paintPrivacy() {
  const { outbound, bytes } = privacySummary();
  const chip = $("#privacyChip");
  const text = $("#privacyChipText");
  if (text) text.textContent = outbound === 0 ? "0 uploads" : `${outbound} off-origin`;
  if (chip) chip.classList.toggle("is-alert", outbound > 0);
  $$("[data-privacy-out]").forEach((n) => (n.textContent = String(outbound)));
  $$("[data-privacy-bytes]").forEach((n) => (n.textContent = bytes ? prettyBytes(bytes) : "0 B"));
  const note = $("[data-privacy-note]");
  if (note)
    note.textContent = outbound
      ? `⚠ ${outbound} off-origin request(s) recorded — inspect window.__benchPrivacy.`
      : "Nothing left this tab since you loaded the page.";
  return { outbound, bytes };
}

/* ---------- per-page boot ---------- */
const RECENT_KEY = "bench.recent.v1";
export const RECENT_LIMIT = 8;

/** Count a tool session locally. No timestamps leave the device. */
export function recordVisit(id, store = typeof localStorage !== "undefined" ? localStorage : null) {
  if (!id || !store) return null;
  try {
    const list = JSON.parse(store.getItem(RECENT_KEY) || "[]");
    const hit = list.find((r) => r.id === id);
    if (hit) {
      hit.n += 1;
      hit.at = Date.now();
    } else {
      list.push({ id, n: 1, at: Date.now() });
    }
    list.sort((a, b) => b.at - a.at);
    const trimmed = list.slice(0, RECENT_LIMIT);
    store.setItem(RECENT_KEY, JSON.stringify(trimmed));
    return trimmed;
  } catch {
    return null; /* private mode / quota — the hub just shows no history */
  }
}

export function readRecent(store = typeof localStorage !== "undefined" ? localStorage : null) {
  try {
    const raw = store && store.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function bootTool() {
  installPrivacyAudit();
  const activeId = document.body.dataset.tool || "";
  // Hub sits at app/, tools sit one/two levels deeper — the shell needs a base href.
  const base = document.body.dataset.base ?? "../../";
  window.__benchBase = base;
  const tool = toolById(activeId);
  // Every tool's accent lands on :root so the hub can colour its cards and a
  // tool page can tint shared UI without importing the registry again.
  for (const t of TOOLS) {
    document.documentElement.style.setProperty(`--tool-${t.id}-dark`, t.accent.dark);
    document.documentElement.style.setProperty(`--tool-${t.id}-light`, t.accent.light);
    document.documentElement.style.setProperty(`--tool-${t.id}-on-dark`, t.accent.onDark);
    document.documentElement.style.setProperty(`--tool-${t.id}-on-light`, t.accent.onLight);
  }
  if (tool) {
    const vars = accentVars(tool);
    for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
    document.body.dataset.tool = tool.id;
    recordVisit(tool.id);
  }
  const { header } = buildHeader(activeId);

  // One skip link for every page, aimed at the page's own first control.
  if (!$(".skip")) {
    const main = document.querySelector("main.tool") || document.querySelector("main");
    if (main && !main.id) main.id = "main";
    const target = $("#src, #epoch, #pattern, #fileInput, #main");
    if (target && !target.id) target.id = "main";
    document.body.prepend(
      el("a", { class: "skip", href: target ? `#${target.id || "main"}` : "#main", text: "Skip to the tool" })
    );
  }

  // Solid on scroll, hidden on scroll-down: keeps the rail out of the way.
  let lastY = scrollY;
  addEventListener(
    "scroll",
    () => {
      header.classList.toggle("scrolled", scrollY > 16);
      if (reduced) return;
      header.classList.toggle("nav-hidden", scrollY > lastY + 6 && scrollY > 260);
      if (scrollY < lastY - 4) header.classList.remove("nav-hidden");
      lastY = scrollY;
    },
    { passive: true }
  );

  paintPrivacy();
  setInterval(paintPrivacy, 4000);

  if ("IntersectionObserver" in window && !reduced) {
    $$("[data-reveal]").forEach((n) => n.classList.add("reveal"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in-view");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.15 }
    );
    $$(".reveal").forEach((n) => io.observe(n));
  }

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    addEventListener("load", () => {
      navigator.serviceWorker.register(base + "sw.js").catch(() => {});
    });
  }

  return { header, tool };
}

/** Count-up for a numeric readout — the one flourish every tool gets. */
export function animateNumber(node, to, format = (v) => String(Math.round(v))) {
  if (!node) return;
  if (reduced) {
    node.textContent = format(to);
    return;
  }
  const from = Number(node.dataset.v || 0);
  node.dataset.v = String(to);
  const t0 = performance.now();
  const dur = 460;
  const step = (now) => {
    const t = Math.min((now - t0) / dur, 1);
    node.textContent = format(from + (to - from) * (1 - Math.pow(1 - t, 3)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
