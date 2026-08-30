#!/usr/bin/env node
/**
 * make-palette.mjs — the colour system, derived instead of hand-typed.
 *
 * Surfaces (backgrounds, panels, lines, text) are chosen by hand because mood is
 * not a formula. The *accents* are derived: twelve tool hues, exactly 30° apart on
 * the OKLCH hue wheel, at one fixed lightness and one fixed chroma per theme. That
 * buys three things a hand-picked list never guarantees:
 *
 *   1. every tool is as far from its neighbours as possible (30° — no two read alike);
 *   2. every tool is equally saturated and equally bright, so a row of tool cards
 *      looks like one family instead of twelve accidents;
 *   3. the text drawn on an accent is chosen by measuring contrast, not by eye.
 *
 * OKLCH is used rather than HSL because HSL's "same lightness" is a lie: yellow at
 * L 50% screams while blue at L 50% goes muddy. Perceptual lightness is what makes
 * a fixed value workable across the whole wheel.
 *
 * Run `node tools/make-palette.mjs --write` after changing the spec; `--check`
 * (used by tests/palette.test.mjs) fails if app/styles.css or app/js/core/palette.js
 * has drifted from this file, so nobody can tune one page by hand and lose the system.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => (existsSync(path.join(ROOT, rel)) ? readFileSync(path.join(ROOT, rel), "utf8") : "");

/* ------------------------------------------------------------------ colour maths */

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** OKLCH → linear sRGB, with a simple in-gamut walk (chroma reduced until it fits). */
function oklchToLinear(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const lp = L + 0.3963377774 * a + 0.2158037573 * b;
  const mp = L - 0.1055613458 * a - 0.0638541728 * b;
  const sp = L - 0.0894841775 * a - 1.291485548 * b;
  const l = lp ** 3;
  const m = mp ** 3;
  const s = sp ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const encode = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const decode = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** Perceptual colour → the nearest sRGB hex we can actually paint. */
export function oklch(L, C, h) {
  let c = C;
  for (let i = 0; i < 80; i++) {
    const lin = oklchToLinear(L, c, h);
    if (lin.every((v) => v >= -0.0005 && v <= 1.0005)) {
      return (
        "#" +
        lin
          .map((v) => Math.round(encode(clamp01(v)) * 255).toString(16).padStart(2, "0"))
          .join("")
      );
    }
    c -= C / 80;
  }
  return "#" + oklchToLinear(L, 0, h).map(() => "80").join("");
}

const hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
};

export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(decode);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/* ------------------------------------------------------------------ the spec */

/** Hand-picked surfaces. Cold, near-neutral, faintly sea-tinted so colour swatches
 *  on the page are never judged against a coloured ground. */
const SURFACES = {
  dark: {
    "--bg": "#0b0e12",
    "--bg-2": "#0f141a",
    "--panel": "#141a22",
    "--panel-2": "#1a222c",
    "--line": "#243039",
    "--line-2": "#31414c",
    "--fg": "#e7edf2",
    "--fg-2": "#a2b2bd",
    "--fg-3": "#6d7f8b",
  },
  light: {
    "--bg": "#f2f4f4",
    "--bg-2": "#e9ecec",
    "--panel": "#ffffff",
    "--panel-2": "#f7f9f8",
    "--line": "#d9dedd",
    "--line-2": "#c1c9c8",
    "--fg": "#101619",
    "--fg-2": "#4b5a63",
    "--fg-3": "#78868f",
  },
};

/** The anchor hue of the site itself (hub, links, focus rings). */
const SITE = { hue: 180 };

/** One hue per tool, evenly spaced. The name says what the tool is for; the hue is
 *  only wayfinding, so spacing wins over symbolism where they conflict. */
export const TOOL_HUES = {
  time: 15,
  images: 45,
  gradient: 75,
  regex: 105,
  scale: 135,
  text: 165,
  csv: 195,
  json: 225,
  shadow: 255,
  hash: 285,
  theme: 315,
  color: 345,
};

/** Lightness / chroma per theme. Dark needs a bright mark on a dark panel; light
 *  needs an ink mark on white, so the same hue is painted twice, not tinted. */
/* Dark marks sit at one lightness, light marks at one lightness — measured, not
 * eyeballed: 0.52 is where the *worst* hue on the wheel still clears 4.5:1 as text
 * on the light page ground (yellow and cyan are the troublemakers, and they are the
 * hues a hand-picked palette always seems to pick). */
const INK = { dark: { L: 0.8, C: 0.13 }, light: { L: 0.52, C: 0.135 } };

/** Semantic colours are fixed points, not wheel members — they must stay readable
 *  as meaning (ok/warn/err) even on a page whose accent happens to be nearby. */
const SEMANTIC = {
  dark: { ok: { L: 0.78, C: 0.14, h: 155 }, warn: { L: 0.82, C: 0.13, h: 80 }, err: { L: 0.68, C: 0.19, h: 25 } },
  light: { ok: { L: 0.5, C: 0.12, h: 155 }, warn: { L: 0.5, C: 0.12, h: 70 }, err: { L: 0.51, C: 0.19, h: 27 } },
};

/** Pick the text colour that an accent can actually carry: a dark tint of its own
 *  hue reads better on a bright mark, white better on an ink mark — measured. */
function onAccent(accent, theme) {
  const dark = theme === "dark" ? oklch(0.19, 0.03, 0) : oklch(0.22, 0.02, 0);
  const light = "#ffffff";
  return contrast(dark, accent) >= contrast(light, accent) ? dark : light;
}

export function accentFor(hue, theme) {
  const { L, C } = INK[theme];
  const hex = oklch(L, C, hue);
  return {
    hex,
    on: onAccent(hex, theme),
    contrastOnPanel: +contrast(hex, SURFACES[theme]["--panel"]).toFixed(2),
  };
}

export function tokens() {
  const out = { dark: {}, light: {} };
  for (const theme of ["dark", "light"]) {
    const site = accentFor(SITE.hue, theme);
    out[theme] = {
      ...SURFACES[theme],
      "--accent": site.hex,
      "--on-accent": site.on,
      // --tool-* are the per-page overrides the shell injects; :root carries the
      // site default so the hub, the 404 path and pre-boot paint all agree
      "--tool-dark": accentFor(SITE.hue, "dark").hex,
      "--tool-light": accentFor(SITE.hue, "light").hex,
      "--tool-on-dark": accentFor(SITE.hue, "dark").on,
      "--tool-on-light": accentFor(SITE.hue, "light").on,
      "--accent-2": accentFor(SITE.hue + 150, theme).hex,
      "--ok": oklch(SEMANTIC[theme].ok.L, SEMANTIC[theme].ok.C, SEMANTIC[theme].ok.h),
      "--warn": oklch(SEMANTIC[theme].warn.L, SEMANTIC[theme].warn.C, SEMANTIC[theme].warn.h),
      "--err": oklch(SEMANTIC[theme].err.L, SEMANTIC[theme].err.C, SEMANTIC[theme].err.h),
    };
    if (theme === "light") {
      // the light theme never needs its own --tool-* pair: the shell swaps which
      // variable --accent reads, so one injection serves both themes
      delete out[theme]["--tool-dark"];
      delete out[theme]["--tool-on-dark"];
    } else {
      delete out[theme]["--tool-light"];
      delete out[theme]["--tool-on-light"];
    }
  }
  return out;
}

export function toolAccents() {
  const out = {};
  for (const [id, hue] of Object.entries(TOOL_HUES)) {
    const dark = accentFor(hue, "dark");
    const light = accentFor(hue, "light");
    out[id] = { dark: dark.hex, light: light.hex, onDark: dark.on, onLight: light.on, hue };
  }
  return out;
}

/* ------------------------------------------------------------------ emitters */

const START = "/* @palette:start";
const END = "/* @palette:end */";

export function cssBlock() {
  const t = tokens();
  const line = (k, v) => `  ${k}: ${v};`;
  const body = (theme, extra) =>
    [`:root${extra} {`, Object.entries(t[theme]).filter(([k]) => keepFor(theme, k)).map(([k, v]) => line(k, v)).join("\n"), "}"].join("\n");
  return [
    `${START} — generated by tools/make-palette.mjs. Run --write, do not hand-edit. */`,
    "/* Surfaces are hand-picked; accents are derived (see the generator's note). */",
    body("dark", ""),
    "",
    body("light", '[data-theme="light"]'),
    "",
    "/* Dark reads the bright variants, light the ink ones; each page injects its tool's",
    "   pair from the TOOLS registry, so an accent hue is defined in exactly one place",
    "   and stays theme-switchable without a single per-page override. */",
    ":root:not([data-theme=\"light\"]) {",
    `  --accent: var(--tool-dark, ${t.dark["--accent"]});`,
    `  --on-accent: var(--tool-on-dark, ${t.dark["--on-accent"]});`,
    "}",
    ":root[data-theme=\"light\"] {",
    `  --accent: var(--tool-light, ${t.light["--accent"]});`,
    `  --on-accent: var(--tool-on-light, ${t.light["--on-accent"]});`,
    "}",
    `${END}`,
  ].join("\n");
}

/** which of the derived names belong in which theme block (surfaces only — the
 *  accent indirection lives in the two small rules at the end of the block) */
function keepFor(theme, key) {
  // each theme keeps only its own half of the indirection (plus the site default, so
  // an un-booted page still paints the right ink); --accent itself is defined once,
  // by the var() rules at the end of the block
  const mine = theme === "dark" ? ["--tool-dark", "--tool-on-dark"] : ["--tool-light", "--tool-on-light"];
  if (mine.includes(key)) return true;
  if (key.startsWith("--tool-") || key === "--accent" || key === "--on-accent") return false;
  return true;
}

export function jsModule() {
  const t = tokens();
  const acc = toolAccents();
  const fmt = (o) =>
    Object.entries(o)
      .map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
      .join("\n");
  return `/* @generated by tools/make-palette.mjs — do not hand-edit; run --write */

/** Theme tokens, mirrored so JS (canvas previews, icon/OG generation, the palette
 *  audit) can never disagree with what CSS paints. */
export const TOKENS = {
  dark: {
${fmt(t.dark)}
  },
  light: {
${fmt(t.light)}
  },
};

/** Per-tool accent pairs, derived from evenly spaced OKLCH hues. */
export const TOOL_ACCENTS = {
${Object.entries(acc)
  .map(([id, v]) => `  ${id}: ${JSON.stringify(v)},`)
  .join("\n")}
};

export const accentFor = (id, theme) => TOOL_ACCENTS[id]?.[theme === "light" ? "light" : "dark"];
export const onFor = (id, theme) => TOOL_ACCENTS[id]?.[theme === "light" ? "onLight" : "onDark"];
`;
}

/* ------------------------------------------------------------------ CLI */

function patchCss(src, block) {
  const i = src.indexOf(START);
  const j = src.indexOf(END);
  if (i === -1 || j === -1) throw new Error("styles.css is missing the @palette markers");
  return src.slice(0, i) + block + src.slice(j + END.length);
}

const invokedDirectly =
  process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1])) ? true : import.meta.url === `file://${process.argv[1]}`;
if (!invokedDirectly) {
  /* imported for its maths (tests, other scripts) — the CLI below is only for `node tools/make-palette.mjs` */
} else {
const args = process.argv.slice(2);
if (args.includes("--print")) {
  console.log(cssBlock());
  console.log(jsModule());
} else if (args.includes("--write")) {
  const cssPath = path.join(ROOT, "app/styles.css");
  const css = read("app/styles.css");
  writeFileSync(cssPath, patchCss(css, cssBlock()));
  writeFileSync(path.join(ROOT, "app/js/core/palette.js"), jsModule());
  console.log("wrote app/styles.css (palette block) + app/js/core/palette.js");
} else {
  // --check: the two generated artefacts must be exactly reproducible
  let bad = 0;
  const css = read("app/styles.css");
  const want = cssBlock();
  if (css.indexOf(want) === -1) {
    console.log("FAIL app/styles.css palette block is stale — run: node tools/make-palette.mjs --write");
    bad++;
  }
  if (read("app/js/core/palette.js") !== jsModule()) {
    console.log("FAIL app/js/core/palette.js is stale — run: node tools/make-palette.mjs --write");
    bad++;
  }
  console.log(bad ? `palette: ${bad} drift(s)` : "palette: generated files are current");
  process.exit(bad ? 1 : 0);
}
}
