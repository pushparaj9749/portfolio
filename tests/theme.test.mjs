/* Theme builder — the colour-space maths and the honesty of its audit. */
import assert from "node:assert/strict";
import {
  toOklch, fromOklch, oklchToHex, hexToOklch, buildTheme, auditTheme, AUDIT_PAIRS, fixTheme, parseTokens, exportTheme, siblingColours,
} from "../app/js/tools/theme.js";
import { contrast } from "../tools/make-palette.mjs";
import { suite } from "./harness.mjs";

const s = suite("theme");
const BRANDS = ["#3fd9bf", "#ff5555", "#1d4ed8", "#f2c14e", "#111111", "#808080", "tomato", "rgb(63 217 191)", "#a15cff", "#003366"];

s.group("sRGB → OKLCH → sRGB is a round trip, not a one-way sketch", () => {
  const exact = ["#000000", "#ffffff", "#3fd9bf", "#808080", "#123456", "#0f1017"];
  for (const hex of exact) {
    const { L, C, h } = hexToOklch(hex);
    assert.equal(oklchToHex(L, C, h), hex, `${hex} must come back unchanged`);
  }
  // fully saturated red sits ON the sRGB wall, so re-deriving it can graze the
  // neighbouring channel; the honest contract is "close", not "identical"
  for (const hex of ["#ff0000", "#00ff00", "#0000ff", "#ff00ff"]) {
    const { L, C, h } = hexToOklch(hex);
    const back = oklchToHex(L, C, h);
    const d = [0, 2, 4].map((i) => Math.abs(parseInt(back.slice(i + 1, i + 3), 16) - parseInt(hex.slice(i + 1, i + 3), 16)));
    assert.ok(Math.max(...d) <= 24, `${hex} → ${back} drifted ${Math.max(...d)} per channel`);
    assert.ok(hexToOklch(back).L.toFixed(2) === L.toFixed(2), `${hex}: lightness must survive even when a channel grazes`);
  }
  assert.ok(Math.abs(hexToOklch("#ff0000").h - 29.2) < 1.5, "red sits near 29° in OKLCH, not 0° as HSL claims");
  assert.ok(hexToOklch("#808080").C < 0.001, "grey has no chroma");
});

s.group("fromOklch refuses to leave the screen", () => {
  for (const [L, C, h] of [[0.99, 0.4, 120], [0.02, 0.4, 300], [0.5, 0.5, 60], [0.8, 0.0001, 0]]) {
    const c = fromOklch({ L, C, h });
    for (const ch of ["r", "g", "b"]) {
      assert.ok(Number.isInteger(c[ch]) && c[ch] >= 0 && c[ch] <= 255, `${L}/${C}/${h} gave ${JSON.stringify(c)}`);
    }
    assert.match(oklchToHex(L, C, h), /^#[0-9a-f]{6}$/);
  }
});

s.group("a colour it cannot read is an answer, not a crash", () => {
  const r = buildTheme("not-a-colour");
  assert.match(r.error, /not a colour/);
  assert.match(r.error, /read/, "and it says what it wanted");
  assert.equal(buildTheme("").error !== undefined, true);
  assert.ok(buildTheme("tomato").tokens["--bg"].startsWith("#"), "a name is a colour");
});

s.group("every generated theme passes its own audit, in both modes", () => {
  for (const brand of BRANDS) {
    for (const mode of ["dark", "light"]) {
      const built = buildTheme(brand, { mode });
      const a = auditTheme(built.tokens);
      assert.ok(a.rows.length >= 9, `${brand}/${mode}: the audit must cover the pairs, got ${a.rows.length}`);
      for (const row of a.fails) {
        assert.fail(`${brand} (${mode}) fails "${row.name}" at ${row.ratio}:1 (needs ${row.target}) — a generated theme should not need a repair`);
      }
    }
  }
});

s.group("the surface ladder goes the right way for the mode", () => {
  const d = buildTheme("#3fd9bf", { mode: "dark" }).tokens;
  assert.ok(contrast(d["--panel"], d["--bg"]) > 1, "a dark panel is *lighter* than the ground");
  assert.ok(contrast(d["--panel-2"], d["--panel"]) > 1, "and the raised surface lighter still");
  assert.ok(contrast(d["--line"], d["--panel"]) > 1, "an edge reads as an edge");
  assert.ok(contrast(d["--fg"], d["--bg"]) > contrast(d["--fg-2"], d["--bg"]), "primary text beats secondary, measurably");
  assert.ok(contrast(d["--fg-2"], d["--bg"]) > contrast(d["--fg-3"], d["--bg"]), "and secondary beats hint");
  const l = buildTheme("#3fd9bf", { mode: "light" }).tokens;
  assert.ok(contrast(l["--bg"], l["--panel"]) > 1, "in the light mode the ground is the quiet one");
  assert.ok(contrast(l["--fg"], l["--bg"]) > contrast(l["--fg-2"], l["--bg"]));
});

s.group("tint bleed does what its label says", () => {
  const neutral = buildTheme("#ff0000", { tint: 0 }).tokens;
  const loud = buildTheme("#ff0000", { tint: 1 }).tokens;
  const chroma = (t) => hexToOklch(t["--bg"]).C;
  assert.ok(chroma(neutral) < 0.005, `tint 0 should be grey, got C ${chroma(neutral).toFixed(4)}`);
  assert.ok(chroma(loud) > 0.01, `tint 1 should be visibly tinted, got C ${chroma(loud).toFixed(4)}`);
  assert.equal(loud["--accent"], neutral["--accent"], "…and none of this touches the accent");
});

s.group("the accent keeps the brand's hue and earns its lightness", () => {
  for (const brand of ["#ff0000", "#1d4ed8", "#f2c14e", "#111111"]) {
    const brandHue = hexToOklch(brand).h;
    for (const mode of ["dark", "light"]) {
      const t = buildTheme(brand, { mode }).tokens;
      const accentHue = hexToOklch(t["--accent"]).h;
      const delta = Math.abs(((accentHue - brandHue + 540) % 360) - 180);
      assert.ok(delta < 14, `${brand} ${mode}: accent hue moved ${delta.toFixed(1)}°`);
      // lightness, though, is allowed to move — and must, for a brand like #111111
      assert.ok(contrast(t["--accent"], t["--panel"]) >= 4.5, `${brand} ${mode}: accent not readable on a panel`);
      assert.ok(contrast(t["--on-accent"], t["--accent"]) >= 4.5, `${brand} ${mode}: button label`);
    }
  }
});

s.group("a brand that collides with a status colour is reported, not papered over", () => {
  const green = buildTheme("#0a8f5b", { mode: "dark" });
  assert.ok(green.collisions.some((c) => c.token === "--ok"), "green brand + green ok is exactly the clash worth mentioning");
  const cyan = buildTheme("#3fd9bf", { mode: "dark" });
  assert.deepEqual(cyan.collisions, [], "a cyan brand collides with nothing");
  // the status colours keep their conventions regardless of the advice
  assert.equal(green.tokens["--ok"], cyan.tokens["--ok"], "ok is ok for everyone — that is what it means");
  assert.notEqual(green.tokens["--ok"], green.tokens["--err"]);
  assert.notEqual(green.tokens["--warn"], green.tokens["--ok"]);
});

s.group("fixTheme moves lightness only, and only where it must", () => {
  const built = buildTheme("#3fd9bf", { mode: "light" });
  const clean = fixTheme(built.tokens);
  assert.equal(clean.changes.length, 0, "an already-passing set is left alone");
  assert.equal(clean.remaining, 0);
  const broken = { ...built.tokens, "--fg-2": "#ffffff", "--accent": "#ffffff", "--line": "#ffffff" };
  const fixed = fixTheme(broken);
  assert.ok(fixed.changes.length >= 3, `expected the failures to be repaired, got ${fixed.changes.length}`);
  assert.equal(fixed.remaining, 0, "…and to actually clear them");
  for (const change of fixed.changes) {
    const before = hexToOklch(change.from);
    const after = hexToOklch(change.to);
    if (before.C > 0.02) {
      assert.ok(Math.abs(((after.h - before.h + 540) % 360) - 180) < 8, `${change.token} hue drifted by more than a rounding`);
      assert.ok(Math.abs(after.C - before.C) < before.C * 0.6 + 0.02, `${change.token} lost its chroma`);
    }
    assert.ok(change.now >= change.was, `${change.token} got worse: ${change.was} → ${change.now}`);
  }
});

s.group("existing tokens can be read back in", () => {
  const css = `
    /* a real stylesheet */
    :root { --bg: #0b0e12; --accent: rgb(63 217 191); --radius: 16px; --fg: #e7edf2; }
    [data-theme="light"] { --panel: white; }
  `;
  const r = parseTokens(css);
  assert.equal(r.count, 4, "including a named colour");
  assert.equal(r.tokens["--panel"], "#ffffff", "`white` is a colour too");
  assert.equal(parseTokens(css + ' [data-theme="x"] { --bg: #123456; }').tokens["--bg"], "#123456",
    "when two blocks set one name, the last declaration is the one that would apply");
  assert.equal(r.tokens["--bg"], "#0b0e12", "the first block still owns its own value");
  assert.equal(r.tokens["--accent"], "#3fd9bf", "rgb() is normalised to hex");
  assert.equal(r.tokens["--radius"], undefined, "a length is not a colour");
  assert.ok(r.unknown.includes("--radius"));
  assert.equal(parseTokens("").count, 0);
  assert.equal(parseTokens("div { color: red }").count, 0, "declarations without custom-property names are none of our business");
});

s.group("each export is valid in the language it names", () => {
  const t = buildTheme("#3fd9bf", { mode: "dark" }).tokens;
  const css = exportTheme(t, { format: "css" });
  assert.match(css, /^:root \{/m);
  assert.equal(css.split("{").length, css.split("}").length);
  const scoped = exportTheme(t, { format: "css", name: "brand" });
  assert.match(scoped, /\[data-theme="brand"\]/);
  const json = JSON.parse(exportTheme(t, { format: "json" }));
  assert.equal(json.tokens.bg.type, "color");
  assert.equal(json.tokens.bg.value, t["--bg"]);
  const figma = JSON.parse(exportTheme(t, { format: "figma" }));
  for (const [k, v] of Object.entries(figma)) {
    assert.match(k, /^[a-z][a-zA-Z0-9]*$/, `${k} should be camelCase for the Figma plugin API`);
    for (const ch of ["r", "g", "b"]) assert.ok(v[ch] >= 0 && v[ch] <= 1, `${k}.${ch} = ${v[ch]}`);
    assert.equal(v.a, 1);
  }
  const tw = exportTheme(t, { format: "tailwind" });
  assert.match(tw, /colors: \{/);
  assert.ok(!/"--/.test(tw), "the leading dashes are CSS's convention, not a JS key's");
  assert.match(exportTheme(t, { format: "scss" }), /^\$bg: #/m);
});

s.group("the suggestions come from the colour tool, so both pages agree", () => {
  const siblings = siblingColours("#3fd9bf");
  assert.ok(siblings.length >= 6, `got ${siblings.length}`);
  for (const sib of siblings) assert.match(sib.hex, /^#[0-9a-f]{6}$/, `${sib.name} → ${sib.hex}`);
  assert.ok(siblings.some((x) => x.name === "complement"));
  assert.deepEqual(siblingColours("garbage"), []);
  assert.equal(AUDIT_PAIRS.length, 7, "the audit covers these seven pairs and says so on the page");
});

s.group("same brand, both modes, one hue", () => {
  const d = buildTheme("#f2c14e", { mode: "dark" }).tokens;
  const l = buildTheme("#f2c14e", { mode: "light" }).tokens;
  const hueDelta = Math.abs(((hexToOklch(d["--accent"]).h - hexToOklch(l["--accent"]).h + 540) % 360) - 180);
  assert.ok(hueDelta < 6, `dark and light accents drifted ${hueDelta.toFixed(1)}° apart`);
  assert.notEqual(d["--accent"], l["--accent"], "…but they are not the same colour — one is ink, one is a mark");
  assert.ok(contrast(d["--bg"], "#ffffff") > 12, "the dark ground really is dark");
  assert.ok(contrast(l["--bg"], "#000000") > 12, "and the light ground really is light");
});

s.done();
