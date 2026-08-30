/* =========================================================
   Palette audit — proves the colour system is the colour system.
   Nothing here trusts the generator's output: the tokens are read back out of
   app/styles.css (what CSS actually paints) and measured, and the derived values
   are re-derived to catch hand-editing. If this suite passes, no theme/tool/pair
   can be unreadable and no page can have quietly re-tinted itself.
   ========================================================= */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contrast, tokens, toolAccents, TOOL_HUES, cssBlock, jsModule } from "../tools/make-palette.mjs";
import { accentPair, TOOLS } from "../app/js/core/tools.js";
import { suite, tokensFromCss } from "./harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const css = read("app/styles.css");
const s = suite("palette");

const dark = { ...tokensFromCss(css, ":root"), ...tokensFromCss(css, ':root:not([data-theme="light"])') };
const light = { ...tokensFromCss(css, ":root"), ...tokensFromCss(css, ':root[data-theme="light"]') };

s.group("styles.css and palette.js are exactly what the generator derives", () => {
  assert.ok(css.includes(cssBlock()), "app/styles.css palette block is stale — run: node tools/make-palette.mjs --write");
  assert.equal(read("app/js/core/palette.js"), jsModule(), "app/js/core/palette.js is stale — run: node tools/make-palette.mjs --write");
  assert.equal(css.match(/@palette:start/g).length, 1, "exactly one generated block");
  assert.equal(css.split("{").length, css.split("}").length, "styles.css is brace-balanced");
});

s.group("the CSS that ships matches the tokens the JS mirrors", () => {
  const derived = tokens();
  for (const [theme, painted] of [["dark", dark], ["light", light]]) {
    for (const [key, want] of Object.entries(derived[theme])) {
      if (!(key in painted)) continue; // the indirection splits these across selectors on purpose
      assert.equal(painted[key], want, `${theme} ${key} drifted: css ${painted[key]} vs derived ${want}`);
    }
  }
});

s.group("body text clears AAA on its own ground, in both themes", () => {
  for (const [name, T] of [["dark", dark], ["light", light]]) {
    assert.ok(contrast(T["--fg"], T["--bg"]) >= 7, `${name}: fg on bg is ${contrast(T["--fg"], T["--bg"]).toFixed(2)}`);
    assert.ok(contrast(T["--fg"], T["--panel"]) >= 7, `${name}: fg on panel`);
  }
});

s.group("secondary and hint text stay legible on a panel", () => {
  for (const [name, T] of [["dark", dark], ["light", light]]) {
    assert.ok(contrast(T["--fg-2"], T["--panel"]) >= 4.5, `${name}: fg-2 ${contrast(T["--fg-2"], T["--panel"]).toFixed(2)}`);
    assert.ok(contrast(T["--fg-3"], T["--panel"]) >= 3, `${name}: fg-3 ${contrast(T["--fg-3"], T["--panel"]).toFixed(2)}`);
    assert.ok(contrast(T["--fg-2"], T["--bg"]) >= 4.5, `${name}: fg-2 on the page ground too`);
  }
});

s.group("structure is visible without shouting", () => {
  for (const [name, T] of [["dark", dark], ["light", light]]) {
    const line = contrast(T["--line"], T["--panel"]);
    assert.ok(line >= 1.15 && line <= 2.4, `${name}: --line on --panel is ${line.toFixed(2)} — want a visible edge, not a stroke`);
    assert.ok(contrast(T["--line-2"], T["--bg"]) > line, `${name}: --line-2 must read stronger than --line`);
  }
});

s.group("status colours work on the page ground", () => {
  for (const [name, T] of [["dark", dark], ["light", light]]) {
    for (const key of ["--ok", "--warn", "--err"]) {
      assert.ok(contrast(T[key], T["--bg"]) >= 3, `${name}: ${key} is ${contrast(T[key], T["--bg"]).toFixed(2)} on bg`);
      assert.ok(contrast(T[key], T["--panel"]) >= 2.8, `${name}: ${key} on panel`);
    }
    assert.notEqual(T["--ok"], T["--err"], "ok and err cannot be the same colour");
  }
});

s.group("the site accent carries links and focus rings", () => {
  for (const [name, T] of [["dark", dark], ["light", light]]) {
    assert.ok(contrast(T["--accent"], T["--panel"]) >= 4.5, `${name}: accent on panel ${contrast(T["--accent"], T["--panel"]).toFixed(2)}`);
    assert.ok(contrast(T["--accent"], T["--bg"]) >= 4.5, `${name}: a link on the page ground, not just on a card`);
    assert.ok(contrast(T["--accent-2"], T["--panel"]) >= 3, `${name}: accent-2 on panel`);
    assert.notEqual(T["--accent"], T["--accent-2"], "a secondary that equals the primary is not a secondary");
  }
});

s.group("every tool's accent carries its own button label, in both themes", () => {
  let checked = 0;
  for (const tool of TOOLS) {
    for (const theme of ["dark", "light"]) {
      const pair = accentPair(tool, theme);
      assert.ok(pair.bg && pair.fg, `${tool.id} ${theme} has no accent — is it in TOOL_HUES?`);
      const r = contrast(pair.fg, pair.bg);
      assert.ok(r >= 4.5, `${tool.id} (${theme}): label on accent is ${r.toFixed(2)}:1`);
      checked++;
    }
  }
  assert.equal(checked, TOOLS.length * 2, "checked every combination");
});

s.group("a tool accent is also readable as text on its own page", () => {
  for (const [name, T] of [["dark", dark], ["light", light]]) {
    for (const tool of TOOLS) {
      const accent = name === "dark" ? tool.accent.dark : tool.accent.light;
      assert.ok(contrast(accent, T["--panel"]) >= 3, `${tool.id} (${name}) as a label is ${contrast(accent, T["--panel"]).toFixed(2)}:1 on panel`);
    }
  }
});

s.group("the wheel: one hue per tool, evenly spaced, one family", () => {
  const accents = toolAccents();
  assert.equal(Object.keys(accents).length, TOOLS.length, "every tool has a slice and no slice is spare");
  const hues = Object.values(TOOL_HUES).sort((a, b) => a - b);
  const gaps = [...hues.slice(1).map((h, i) => h - hues[i]), 360 - hues[hues.length - 1] + hues[0]];
  assert.ok(Math.min(...gaps) >= 28, `closest two hues are ${Math.min(...gaps)}° apart`);
  assert.equal(new Set(hues).size, hues.length, "no two tools share a hue");
  // Consistency, measured in the units a reader perceives: every accent of a theme
  // must sit in the same contrast band against the panel it is painted on. HSL
  // lightness cannot express this (a yellow and a blue at HSL L 60% are nowhere
  // near each other), which is the whole reason the generator uses OKLCH.
  const bands = { dark: [7.5, 11], light: [4.5, 6.5] };
  for (const theme of ["dark", "light"]) {
    const panel = theme === "dark" ? dark["--panel"] : light["--panel"];
    const ratios = Object.values(accents).map((a) => contrast(a[theme], panel));
    const [lo, hi] = bands[theme];
    assert.ok(Math.min(...ratios) >= lo, `${theme}: weakest tool accent is ${Math.min(...ratios).toFixed(2)}:1, want ≥ ${lo}`);
    assert.ok(Math.max(...ratios) <= hi, `${theme}: loudest tool accent is ${Math.max(...ratios).toFixed(2)}:1, want ≤ ${hi} so no tool outshouts the page`);
  }
});

s.group("no page re-tints itself, and no cliché crept in", () => {
  const pages = ["app/index.html", "app/images/index.html", ...TOOLS.filter((t) => t.href.startsWith("tools/")).map((t) => `app/${t.href}index.html`)];
  for (const p of pages) {
    // prose inside a placeholder or a textarea is example CSS, not a declaration
    const html = read(p)
      .replace(/placeholder="[^"]*"/g, "")
      .replace(/<textarea[\s\S]*?<\/textarea>/g, "");
    assert.ok(!/--accent\s*:/.test(html), `${p} overrides --accent by hand`);
    assert.ok(!/--tool-(dark|light)\s*:/.test(html), `${p} hard-codes a tool accent instead of letting the registry inject it`);
    assert.ok(/data-theme="(dark|light)"/.test(html) || /dataset\.theme/.test(html), `${p} must set the theme before first paint`);
    assert.ok(html.includes('localStorage.getItem("bench.theme.v1")'), `${p} must read the saved theme pre-boot`);
    assert.ok(/<link rel="stylesheet" href="[^"]*styles\.css">/.test(html), `${p} is not on the shared stylesheet`);
  }
  // framework indigo, the neon shortcuts, and *this project's own retired brand*:
  // an old accent resurfacing in one unwatched file is how a retheme gets undone
  const banned = /#6366f1|#8b5cf6|#a855f7|#00ff00|#ff00ff|#7c3aed|#ff7a59|#d4ff2f|#0a0a0b/i;
  const shipped = ["app/styles.css", "app/manifest.webmanifest", "app/js/core/palette.js", "index.html", ...pages].map(read).join("\n");
  assert.ok(!banned.test(shipped), `banned cliché colour in shipped files: ${(shipped.match(banned) || [])[0]}`);
});

s.group("the entry redirect cannot disagree with the palette", () => {
  // It lives outside app/, so it never sees styles.css — which is precisely why it
  // needs checking: a page too small to have a stylesheet is too small to be trusted.
  const html = read("index.html");
  const style = (html.match(/<style>[\s\S]*?<\/style>/) || [""])[0];
  assert.ok(/url=app\//.test(html) && html.includes('location.replace("app/"'), "the redirect must still land on the app, query and hash intact");
  for (const [prop, token] of [["background", "--bg"], ["color", "--fg"], ["color", "--accent"]]) {
    const want = dark[token];
    assert.ok(style.toLowerCase().includes(want.toLowerCase()), `the redirect inlines ${token} (${want})`);
  }
  assert.ok(!/--accent\s*:/.test(style), "the redirect must not re-tint anything");
  // new RegExp, not a /literal/: a regex literal does not interpolate ${...}, so the
  // version I wrote first could only ever have failed - the test was the bug, not the page
  assert.ok(new RegExp(`name="theme-color" content="${dark["--bg"]}"`, "i").test(html),
    "its browser chrome must match the app's");
});

s.group("every page paints the palette's own background in its tab", () => {
  const T = tokens();
  const dirs = ["app/index.html", ...readdirSync(path.join(ROOT, "app/tools")).map((d) => `app/tools/${d}/index.html`), "app/images/index.html"];
  for (const rel of dirs) {
    const html = read(rel);
    const metas = [...html.matchAll(/<meta name="theme-color"( media="[^"]*")? content="(#[0-9a-f]{6})"/g)];
    assert.equal(metas.length, 2, `${rel} needs a dark and a light theme-color`);
    const darkMeta = metas.find((m) => !m[1]);
    const lightMeta = metas.find((m) => m[1] && m[1].includes("light"));
    assert.ok(darkMeta, `${rel} has no unqualified theme-color`);
    assert.equal(darkMeta[2].toLowerCase(), T.dark["--bg"], `${rel} dark tab colour`);
    assert.equal(lightMeta[2].toLowerCase(), T.light["--bg"], `${rel} light tab colour`);
  }
  const manifest = JSON.parse(read("app/manifest.webmanifest"));
  assert.equal(manifest.theme_color.toLowerCase(), T.dark["--bg"], "manifest theme_color");
  assert.equal(manifest.background_color.toLowerCase(), T.dark["--bg"], "manifest background_color must match the ground, or install shows a flash of the wrong colour");
});

s.group("the offline shell lists every tool, and only real files", () => {
  const sw = read("app/sw.js");
  const listed = [...sw.matchAll(/"(\.\/[^"]+)"/g)].map((m) => m[1]);
  for (const tool of TOOLS) {
    const mod = `./js/tools/${tool.id}.js`;
    const page = `./tools/${tool.id}/index.html`;
    if (tool.id === "images") continue;
    assert.ok(listed.includes(mod), `${mod} is not precached — the tool is useless offline`);
    assert.ok(listed.includes(page), `${page} is not precached`);
  }
  for (const rel of listed) {
    const file = path.join(ROOT, "app", rel.replace(/^\.\//, ""));
    let ok = true;
    try {
      readFileSync(file);
    } catch {
      ok = false;
    }
    assert.ok(ok, `${rel} is precached but does not exist on disk`);
  }
});

s.done();
