/* =========================================================
   Tool · Theme Builder
   One brand colour in, a whole token set out — and every pair the page will
   actually paint gets measured, because "it looks fine at 100% zoom" is not a
   contrast statement.

   Surfaces are built in OKLCH rather than HSL on purpose: HSL lightness is a
   lie across the hue wheel (a saturated yellow at L 15% is still bright, a blue
   at L 90% is still dark), and a theme generator that uses it produces a ground
   whose colour depends on the brand. OKLCH lets "a dark surface, faintly tinted
   toward your hue" mean the same thing for every hue you can paste.
   ========================================================= */

import { parseColor, toHex, bestTextOn, ensureContrast, contrastRatio, harmonies } from "./color.js";

/* ---------------------------------------------------------- colour-space maths */

const decode = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const encode = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const clamp01 = (n) => Math.min(1, Math.max(0, n));

/** sRGB → { L 0–1, C 0–~0.4, h 0–360 } */
export function toOklch(color) {
  const [r, g, b] = [color.r, color.g, color.b].map((v) => decode(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { L: clamp01(L), C, h };
}

/** { L, C, h } → hex, walking chroma down until the colour fits in sRGB. */
export function fromOklch({ L, C, h }) {
  const hr = ((h * Math.PI) / 180);
  let chroma = Math.max(0, C);
  for (let attempt = 0; attempt < 40; attempt++) {
    const a = chroma * Math.cos(hr);
    const b = chroma * Math.sin(hr);
    const lp = L + 0.3963377774 * a + 0.2158037573 * b;
    const mp = L - 0.1055613458 * a - 0.0638541728 * b;
    const sp = L - 0.0894841775 * a - 1.291485548 * b;
    const l = lp ** 3;
    const m = mp ** 3;
    const s = sp ** 3;
    const lin = [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ];
    if (lin.every((v) => v >= -0.002 && v <= 1.002)) {
      return {
        r: Math.round(encode(clamp01(lin[0])) * 255),
        g: Math.round(encode(clamp01(lin[1])) * 255),
        b: Math.round(encode(clamp01(lin[2])) * 255),
        a: 1,
      };
    }
    chroma *= 0.94;
  }
  return { r: 128, g: 128, b: 128, a: 1 }; // neutral, rather than an out-of-gamut surprise
}

export const hexToOklch = (hex) => {
  const c = parseColor(hex);
  return toOklch(c && c.ok !== false ? c : { r: 128, g: 128, b: 128, a: 1 });
};
export const oklchToHex = (L, C, h) => toHex(fromOklch({ L, C, h }));

/* ---------------------------------------------------------- the generator */

/**
 * Roles and their perceptual lightness. Kept as a table so the ladder is legible
 * and auditable instead of being six expressions buried in a loop.
 * `tint` is how much of the brand's hue survives into the surface (0 = neutral grey).
 */
// name, perceptual lightness, and how much of the brand hue the role keeps
const ROLES = {
  dark: [
    ["--bg", 0.17, 1],
    ["--bg-2", 0.205, 1],
    ["--panel", 0.245, 1],
    ["--panel-2", 0.29, 1],
    ["--line", 0.365, 0.7],
    ["--line-2", 0.45, 0.6],
    ["--fg", 0.965, 0.12],
    ["--fg-2", 0.8, 0.2],
    ["--fg-3", 0.63, 0.24],
  ],
  light: [
    ["--bg", 0.975, 0.3],
    ["--bg-2", 0.955, 0.35],
    ["--panel", 1, 0],
    ["--panel-2", 0.985, 0.22],
    ["--line", 0.9, 0.3],
    ["--line-2", 0.83, 0.32],
    ["--fg", 0.21, 0.35],
    ["--fg-2", 0.46, 0.3],
    ["--fg-3", 0.6, 0.28],
  ],
};

/**
 * @param brand  any CSS colour
 * @param opts   { mode:"dark"|"light", tint 0–1 (hue bleed into surfaces),
 *                 chroma 0–1 (how loud the accent is), accent2Offset deg }
 */
export function buildTheme(brand, opts = {}) {
  const color = parseColor(brand);
  // parseColor answers { ok:false, error } rather than null — the truthy check
  // everyone reaches for here would let "nope" build a whole theme out of NaN
  if (!color || color.ok === false) return { error: `“${brand}” is not a colour I can read${color?.error ? ` — ${color.error}` : ""}.` };
  const mode = opts.mode === "light" ? "light" : "dark";
  const { L, C, h } = toOklch(color);
  const tint = Math.min(1, Math.max(0, opts.tint ?? 0.55));
  const loud = Math.min(1, Math.max(0.05, opts.chroma ?? 1));
  const tokens = {};
  for (const [name, baseL, hueKeep] of ROLES[mode]) {
    tokens[name] = oklchToHex(baseL, C * 0.055 * tint * hueKeep, (h + 360) % 360);
  }
  // accent keeps the brand's own lightness only if it can carry text on a panel;
  // otherwise the ladder moves it, because a brand mark is not a body colour
  const accentC = Math.min(0.19, Math.max(0.02, C)) * loud;
  // A brand colour is not automatically a readable accent colour. Walk *lightness*
  // toward the value that clears 4.5:1 on the panel (the brand's hue and chroma are
  // never touched), so the theme this tool hands you passes on its first try and
  // the fix button is left for hand-edited sets.
  const panel = tokens["--panel"];
  const accentAt = (ll) => oklchToHex(ll, accentC, h);
  let accentL = mode === "dark" ? Math.max(0.7, Math.min(0.88, L)) : Math.min(0.58, Math.max(0.36, L));
  const step = mode === "dark" ? 0.02 : -0.02;
  for (let i = 0; i < 40; i++) {
    const candidate = accentAt(accentL);
    const ratio = contrastRatio(candidate, panel);
    const onRatio = contrastRatio(bestTextOn(parseColor(candidate) || { r: 0, g: 0, b: 0 }), candidate);
    if (ratio >= 4.5 && onRatio >= 4.5) break;
    const next = accentL + step;
    if (next <= 0.15 || next >= 0.98) break;
    accentL = next;
  }
  tokens["--accent"] = accentAt(accentL);
  tokens["--on-accent"] = bestTextOn(parseColor(tokens["--accent"]) || { r: 0, g: 0, b: 0 });
  const h2 = (h + (Number(opts.accent2Offset) || 150) + 360) % 360;
  tokens["--accent-2"] = oklchToHex(mode === "dark" ? 0.78 : 0.52, Math.min(0.17, accentC * 0.9), h2);
  // Status colours are conventions, so they are not rotated to match your brand —
  // a green "ok" next to a green brand collides, and the honest answer is to say so
  // rather than hand you an olive tick nobody recognises.
  const SEMANTIC_HUES = { "--ok": 155, "--warn": 80, "--err": 27 };
  const collisions = [];
  for (const [name, wantH] of Object.entries(SEMANTIC_HUES)) {
    const L2 = name === "--err" ? (mode === "dark" ? 0.66 : 0.51) : mode === "dark" ? 0.78 : 0.52;
    const C2 = name === "--err" ? 0.19 : mode === "dark" ? 0.13 : 0.12;
    tokens[name] = oklchToHex(L2, C2, wantH);
    // shortest way round the wheel, not the long way
    const apart = Math.abs(((wantH - h + 540) % 360) - 180);
    if (apart < 22) collisions.push({ token: name, hue: wantH, apart: Math.round(apart) });
  }

  return { mode, tokens, brand: toHex(color), hue: Math.round(h), chroma: +C.toFixed(3), tint, loud, collisions };
}

/** The pairs a theme is judged on — not every pair, the ones a reader meets. */
export const AUDIT_PAIRS = [
  { name: "body text on page", fg: "--fg", bg: "--bg", target: 7, note: "AAA body copy; the number people actually read all day" },
  { name: "secondary text on panel", fg: "--fg-2", bg: "--panel", target: 4.5, note: "labels, captions, table heads" },
  { name: "tertiary text on panel", fg: "--fg-3", bg: "--panel", target: 3, note: "disabled and hint text — 3 is the floor, not the goal" },
  { name: "accent text on panel", fg: "--accent", bg: "--panel", target: 4.5, note: "links, focus rings, tab labels" },
  { name: "text inside an accent button", fg: "--on-accent", bg: "--accent", target: 4.5, note: "the most common failure in brand-driven themes" },
  { name: "panel edge on page", fg: "--line", bg: "--bg", target: 1.15, ui: true, note: "not text, but a border nobody can find is a layout problem" },
  { name: "status colours on page", fg: "--ok", bg: "--bg", target: 3, ui: true, also: ["--warn", "--err"], note: "semantic marks, kept out of the brand hue on purpose" },
];

export function auditTheme(tokens) {
  const rows = [];
  const get = (k) => tokens[k] || tokens[k.replace("--", "")];
  for (const pair of AUDIT_PAIRS) {
    const items = [pair.fg, ...(pair.also || [])];
    for (const fgKey of items) {
      const fg = get(fgKey);
      const bg = get(pair.bg);
      if (!fg || !bg) continue;
      const ratio = +contrastRatio(fg, bg).toFixed(2);
      rows.push({
        name: items.length > 1 ? `${fgKey.replace("--", "")} on ${pair.bg.replace("--", "")}` : pair.name,
        fg: fgKey,
        bg: pair.bg,
        fgHex: fg,
        bgHex: bg,
        ratio,
        target: pair.target,
        pass: ratio >= pair.target,
        aa: ratio >= (pair.ui ? 3 : 4.5),
        aaa: !pair.ui && ratio >= 7,
        note: pair.note,
      });
    }
  }
  return { rows, fails: rows.filter((r) => !r.pass), passes: rows.filter((r) => r.pass).length };
}

/**
 * Nudge only what failed, and only in lightness — hue and chroma are the brand's
 * business. `ensureContrast` from the colour tool walks it, so this stays honest
 * about *how far* each token had to move.
 */
export function fixTheme(tokens, { theme = "dark" } = {}) {
  const next = { ...tokens };
  const changes = [];
  const a = auditTheme(next);
  for (const row of a.fails) {
    const before = next[row.fg];
    const after = ensureContrast(before, next[row.bg], row.target, 140);
    if (after && after !== before) {
      next[row.fg] = after;
      changes.push({ token: row.fg, from: before, to: after, was: row.ratio, now: +contrastRatio(after, next[row.bg]).toFixed(2) });
    }
  }
  const b = auditTheme(next);
  return { tokens: next, changes, remaining: b.fails.length, audit: b };
}

/**
 * Read a stylesheet back in. Anything `--token: #hex` shaped is fair game, so a
 * team's existing CSS can be tuned here instead of retyped.
 */
export function parseTokens(css) {
  const text = String(css ?? "").replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens = {};
  const unknown = [];
  const re = /--([\w-]+)\s*:\s*([^;{}]+);?/g;
  let m;
  while ((m = re.exec(text))) {
    const value = m[2].trim();
    if (!value.includes("var(") && !value.includes("calc(") && value.length < 64) {
      const c = parseColor(value);
      if (c && c.ok !== false) tokens[`--${m[1]}`] = toHex(c);
      else unknown.push(`--${m[1]}`);
    } else unknown.push(`--${m[1]}`);
  }
  return { tokens, unknown, count: Object.keys(tokens).length };
}

export function exportTheme(tokens, { name = "theme", format = "css", mode = "dark" } = {}) {
  const keys = Object.keys(tokens).filter((k) => k.startsWith("--"));
  if (format === "json") {
    const out = {};
    for (const k of keys) out[k.replace(/^--/, "")] = { value: tokens[k], type: "color", $description: `${name} · ${mode}` };
    return JSON.stringify({ name, tokens: out }, null, 2);
  }
  if (format === "figma") {
    const out = {};
    for (const k of keys) {
      const c = parseColor(tokens[k]) || { r: 0, g: 0, b: 0 };
      out[k.replace(/^--/, "").replace(/[-_](\w)/g, (_s, ch) => ch.toUpperCase())] = {
        r: +(c.r / 255).toFixed(4),
        g: +(c.g / 255).toFixed(4),
        b: +(c.b / 255).toFixed(4),
        a: 1,
      };
    }
    return JSON.stringify(out, null, 2);
  }
  if (format === "tailwind") {
    const body = keys
      .map((k) => `      ${JSON.stringify(k.replace(/^--/, ""))}: ${JSON.stringify(tokens[k])},`)
      .join("\n");
    return `module.exports = {\n  theme: {\n    extend: {\n      colors: {\n${body}\n      },\n    },\n  },\n};`;
  }
  if (format === "scss") return keys.map((k) => `$${k.replace(/^--/, "").replace(/-/g, "_")}: ${tokens[k]};`).join("\n");
  return [`${name === "theme" ? ":root" : `[data-theme="${name}"]`} {`, ...keys.map((k) => `  ${k}: ${tokens[k]};`), "}"].join("\n");
}

/** Siblings worth offering next to a brand colour — delegated to the colour tool
 *  so the answer is identical on both pages. */
export const siblingColours = (brand) => {
  const c = parseColor(brand);
  if (!c || c.ok === false) return [];
  // harmonies() answers { name: [hex, hex…] }, so one row per suggestion
  return Object.entries(harmonies(c)).flatMap(([name, list]) => (Array.isArray(list) ? list : [list]).map((hex) => ({ name, hex })));
};

/* ---------------- UI ---------------- */
if (typeof document !== "undefined" && typeof window !== "undefined") boot().catch((err) => console.warn(err));

async function boot() {
  const shell = await import("../shell.js");
  const { $, $$, toast, copyText, debounce, escapeHtml } = shell;
  shell.bootTool();

  const state = { brand: "#3fd9bf", tint: 0.55, chroma: 1, offset: 150, modes: ["dark", "light"], tokens: null, applied: false, fix: null, fixFor: "" };
  const fixKey = () => `${state.brand}|${state.tint}|${state.chroma}|${state.offset}`;

  const render = () => {
    // any brand change clears the fixes: they were computed against the old colours
    if (state.fix && state.fixFor !== fixKey()) state.fix = null;
    const built = {};
    for (const mode of state.modes) {
      const r = buildTheme(state.brand, { mode, tint: state.tint, chroma: state.chroma, accent2Offset: state.offset });
      if (r.error) {
        $("#brandErr").hidden = false;
        $("#brandErr").textContent = r.error;
        return;
      }
      built[mode] = { ...r.tokens, ...(state.fix?.[mode] || {}) };
    }
    $("#brandErr").hidden = true;
    const primary = { tokens: built[state.modes[0]] };
    const meta = buildTheme(state.brand, { mode: state.modes[0], tint: state.tint, chroma: state.chroma, accent2Offset: state.offset });
    state.tokens = primary.tokens;
    const a = auditTheme(primary.tokens);
    $("#themeAudit").innerHTML = a.rows
      .map(
        (r) => `<div class="auditrow">
          <span class="pair"><span class="chip" style="background:${r.bgHex};color:${r.fgHex}">Aa</span><span>${escapeHtml(r.name)}</span></span>
          <span class="mono">${r.ratio.toFixed(2)}:1</span>
          <span class="pill ${r.pass ? "is-pass" : r.aa ? "is-warn" : "is-fail"}">${r.aaa ? "AAA" : r.aa ? "AA" : r.pass ? "ok" : "fail"}</span>
        </div>`
      )
      .join("");
    $("#auditScore").innerHTML =
      `<span class="pill ${a.fails.length ? "is-fail" : "is-pass"}">${a.passes}/${a.rows.length} pairs</span>` +
      `<span class="mini">${a.fails.length ? `${a.fails.length} need${a.fails.length === 1 ? "s" : ""} a fix — the worst is ${escapeHtml(a.fails[0].name)} at ${a.fails[0].ratio.toFixed(2)}:1` : "every pair in the table clears its own bar"}</span>`;
    paintMini("#miniDark", built.dark || null);
    paintMini("#miniLight", built.light || null);
    $("#miniDark").closest(".panel")?.toggleAttribute("hidden", !built.dark);
    $("#miniLight").closest(".panel")?.toggleAttribute("hidden", !built.light);
    $("#hexRow").innerHTML = Object.entries(primary.tokens)
      .map(([k, v]) => `<button class="tokencard copyable" type="button" data-copy="${v}"><i style="background:${v}"></i><span>${escapeHtml(k)} ${escapeHtml(v)}</span></button>`)
      .join("");
    $$("#hexRow .copyable").forEach((b) => b.addEventListener("click", () => copyText(b.dataset.copy, `Copied ${b.dataset.copy}.`)));
    const tintOut = $("#tintOut");
    if (tintOut) tintOut.textContent = `${(state.tint * 100).toFixed(0)}%`;
    const clash = (meta.collisions || [])
      .map((c) => `${c.token.replace("--", "")} is ${c.apart}° from your brand hue`)
      .join("; ");
    $("#brandRead").textContent = `hue ${meta.hue}° · chroma ${meta.chroma} · tint bleed ${(state.tint * 100).toFixed(0)}%${state.fix ? " · lightness fixes applied" : ""}`;
    $("#brandRead").classList.toggle("is-warn-text", Boolean(clash));
    if (clash) $("#brandRead").textContent += ` · heads-up: ${clash}, so a status mark may read as brand — the icons and words carry the meaning here`;
    renderExport();
    if (state.applied) applyToPage(primary.tokens);
  };

  const paintMini = (sel, tokens) => {
    const el = $(sel);
    if (!el || !tokens) return;
    Object.entries(tokens).forEach(([k, v]) => el.style.setProperty(k, v));
  };

  function renderExport() {
    const format = $("#format").value;
    const name = $("#tname").value || "theme";
    const scopes = state.modes
      .map((mode) => {
        const r = buildTheme(state.brand, { mode, tint: state.tint, chroma: state.chroma, accent2Offset: state.offset });
        if (r.error) return "";
        const body = exportTheme({ ...r.tokens, ...(state.fix?.[mode] || {}) }, { name, format, mode });
        return format === "css" ? body.replace(":root", `:root[data-theme="${mode}"]`) : body;
      })
      .filter(Boolean);
    $("#themeOut").value = scopes.join("\n\n");
  }

  const applyToPage = (tokens) => {
    for (const [k, v] of Object.entries(tokens)) document.documentElement.style.setProperty(k, v);
  };

  $("#brand").addEventListener("input", (e) => {
    state.brand = e.target.value;
    $("#brandText").value = e.target.value;
    render();
  });
  $("#brandText").addEventListener(
    "input",
    debounce((e) => {
      const c = parseColor(e.target.value.trim());
      if (!c || c.ok === false) return;
      state.brand = toHex(c);
      $("#brand").value = toHex(c).slice(0, 7);
      render();
    }, 160)
  );
  $("#brandRandom").addEventListener("click", () => {
    const h = Math.floor(Math.random() * 360);
    state.brand = oklchToHex(0.72, 0.14, h);
    $("#brand").value = state.brand.slice(0, 7);
    $("#brandText").value = state.brand;
    render();
  });
  [["tintRange", "tint", 0.01], ["chromaRange", "chroma", 0.01], ["offsetRange", "offset", 1]].forEach(([id, key, scale]) =>
    $("#" + id).addEventListener("input", (e) => {
      state[key] = Number(e.target.value) * scale;
      render();
    })
  );
  $$("#modes .tbtn").forEach((b) =>
    b.addEventListener("click", () => {
      const on = b.classList.toggle("is-on");
      const want = $$("#modes .tbtn.is-on").map((x) => x.dataset.mode);
      state.modes = want.length ? want : ["dark"];
      b.setAttribute("aria-pressed", String(on));
      render();
    })
  );
  $("#fixAll").addEventListener("click", () => {
    const fixes = {};
    const merged = { ...state.tokens };
    for (const mode of state.modes) {
      const r = buildTheme(state.brand, { mode, tint: state.tint, chroma: state.chroma, accent2Offset: state.offset });
      const f = fixTheme(r.tokens, { mode });
      fixes[mode] = f;
      if (mode === state.modes[0]) Object.assign(merged, f.tokens);
    }
    const total = Object.values(fixes).reduce((n, f) => n + f.changes.length, 0);
    if (!total) return toast("Nothing to fix — every pair already clears its bar.", "ok");
    // the fix is a per-mode override layered on top of whatever the generator
    // produces, so dragging a slider afterwards re-derives from the brand and
    // clears it (a hand-fix surviving a brand change would be a lie)
    state.fix = fixes;
    state.fixFor = fixKey();
    $("#fixLog").textContent =
      `${total} token${total === 1 ? "" : "s"} moved, lightness only: ` +
      Object.values(fixes)
        .flatMap((f) => f.changes.map((c) => `${c.token} ${c.from}→${c.to} (${c.was}→${c.now})`))
        .join(" · ");
    $("#fixLog").hidden = false;
    state.tokens = merged;
    render();
    renderExport();
    toast("Fixed by lightness only — your hue and chroma are untouched.", "ok", 3600);
  });
  $("#applyPage").addEventListener("click", () => {
    state.applied = !state.applied;
    if (state.applied) {
      applyToPage(state.tokens);
      toast("Applied to this page. Press again to put Bench's own theme back.", "ok", 4200);
    } else {
      for (const k of Object.keys(state.tokens)) document.documentElement.style.removeProperty(k);
      toast("Back to the house theme.", "ok", 2200);
    }
  });
  $("#importCss").addEventListener("click", () => {
    const r = parseTokens($("#importBox").value);
    if (!r.count) return toast("No --token: #colour declarations in there.", "err");
    $("#importReport").textContent = `Read ${r.count} colour token${r.count === 1 ? "" : "s"}${r.unknown.length ? `; left alone: ${r.unknown.slice(0, 6).join(", ")}${r.unknown.length > 6 ? "…" : ""}` : ""}`;
    $("#importReport").hidden = false;
    const brand = r.tokens["--accent"] || r.tokens["--brand"] || Object.values(r.tokens)[0];
    if (brand) {
      state.brand = brand;
      $("#brand").value = brand.slice(0, 7);
      $("#brandText").value = brand;
      render();
    }
  });
  $("#format").addEventListener("change", renderExport);
  $("#tname").addEventListener("input", debounce(renderExport, 150));
  $("#copyTheme").addEventListener("click", () => copyText($("#themeOut").value, "Copied the token set."));

  render();
}
