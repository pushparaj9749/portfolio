/* Type & space — the maths people paste into a PR without checking. */
import assert from "node:assert/strict";
import {
  RATIOS, STEP_NAMES, modularScale, fluidSize, charsPerLine, measureFor, suggestedLineHeight,
  spaceScale, rhythmCheck, snapToGrid, exportTokens, pxToRem, remToPx, round, TYPE_NAMES, SPACE_NAMES,
} from "../app/js/tools/scale.js";
import { suite } from "./harness.mjs";

const s = suite("scale");

s.group("a modular scale is a power series with the body size at step 0", () => {
  const sc = modularScale({ base: 16, ratio: 1.25, from: -1, to: 3 });
  assert.deepEqual(sc.sizes.map((x) => x.px), [12.8, 16, 20, 25, 31.25]);
  assert.deepEqual(sc.sizes.map((x) => x.name), ["sm", "base", "lg", "xl", "2xl"]);
  assert.equal(sc.sizes[1].px, 16, "step 0 is the body size and is called base");
  assert.equal(sc.sizes[1].step, 0);
  const growth = sc.sizes.slice(1).map((x, i) => round(x.px / sc.sizes[i].px, 3));
  assert.deepEqual(growth, [1.25, 1.25, 1.25, 1.25], "five sizes, four equal steps");
  assert.equal(modularScale({ base: 16, ratio: 1 }).error.includes("flat line"), true);
  assert.equal(modularScale({ base: 16, ratio: 0.8 }).error !== undefined, true, "a ratio below 1 inverts the scale — refuse, do not reorder");
});

s.group("below the body size is a first-class part of a scale", () => {
  const sc = modularScale({ base: 16, ratio: 1.25, from: -3, to: 0 });
  assert.equal(sc.sizes.length, 4);
  assert.ok(sc.sizes.every((x) => x.px > 0));
  assert.ok(sc.sizes[0].px < 16, "captions exist");
  assert.equal(sc.sizes[3].name, "base", "the last row of a -3…0 scale is the body size");
  assert.equal(sc.sizes[0].name, TYPE_NAMES[0], "three steps down is the smallest name we ship");
});

s.group("snapping to a rhythm reports what it did", () => {
  const sc = modularScale({ base: 17, ratio: 1.25, from: 0, to: 2, snap: 4 });
  assert.deepEqual(sc.sizes.map((x) => x.px), [16, 20, 28]);
  assert.deepEqual(sc.sizes.map((x) => Math.sign(x.offBy)), [-1, -1, 1], "offBy says which way the snap moved it");
  assert.equal(sc.sizes[0].exact, 17, "the unsnapped value is still there for comparison");
  assert.deepEqual(modularScale({ base: 17, ratio: 1.25, from: 0, to: 2 }).sizes.map((x) => x.offBy), [0, 0, 0], "no snap, no apology");
});

s.group("rem and px agree with the root size you declare", () => {
  assert.equal(pxToRem(24, 16), 1.5);
  assert.equal(pxToRem(24, 20), 1.2);
  assert.equal(remToPx(1.5, 16), 24);
  assert.equal(remToPx(pxToRem(13, 16), 16), 13);
  assert.equal(snapToGrid(17, 4), 16);
  assert.equal(snapToGrid(18, 4), 20);
  assert.equal(snapToGrid(2, 4), 4, "never snap a size to zero");
});

s.group("clamp() is solved for the endpoints it promises", () => {
  const f = fluidSize({ minSize: 16, maxSize: 28, minVw: 360, maxVw: 1200, root: 16 });
  assert.equal(f.fits, true);
  assert.ok(Math.abs(f.atSmall - 16) < 0.05, `at the small viewport it is the small size, got ${f.atSmall}`);
  assert.ok(Math.abs(f.atLarge - 28) < 0.05, `at the large viewport it is the large size, got ${f.atLarge}`);
  assert.ok(f.at768 > 16 && f.at768 < 28, "and it interpolates between them");
  assert.match(f.css, /^clamp\(1rem, [\d.]+rem \+ [\d.]+vw, 1.75rem\)$/);
  // read our own CSS back, so the *string* is tested and not just the model behind it
  const [cMin, cPref, cMax] = [...f.css.matchAll(/(-?[\d.]+)rem/g)].map((m) => Number(m[1]));
  const cVw = Number(/(-?[\d.]+)vw/.exec(f.css)[1]);
  const evaluate = (width) => Math.min(cMax * 16, Math.max(cMin * 16, cPref * 16 + (cVw * width) / 100));
  assert.ok(cMin < cMax, "clamp bounds are sorted");
  assert.ok(Math.abs(cVw - f.vw) < 1e-9, "the vw in the string is the solved slope");
  assert.ok(Math.abs(evaluate(360) - 16) < 0.35, `clamp string at 360 gives ${evaluate(360)}`);
  assert.ok(Math.abs(evaluate(1200) - 28) < 0.35, `clamp string at 1200 gives ${evaluate(1200)}`);
  assert.ok(Math.abs(evaluate(768) - f.at768) < 0.35, "the string and the reported value are the same computation");
});

s.group("display type may shrink on big screens, and clamp still sorts its bounds", () => {
  const f = fluidSize({ minSize: 28, maxSize: 16, minVw: 360, maxVw: 1200 });
  assert.equal(f.shrinks, true);
  assert.equal(f.fits, true);
  assert.ok(Math.abs(f.atSmall - 28) < 0.05, String(f.atSmall));
  assert.equal(f.atLarge, 16);
  const parts = [...f.css.matchAll(/(-?[\d.]+)rem/g)].map((m) => Number(m[1]));
  const [lo, hi] = [parts[0], parts[2]];
  assert.ok(lo < hi, "clamp() with reversed bounds is a silent no-op, so they must be sorted");
  assert.ok(/-[\d.]+vw/.test(f.css), "a negative slope is what shrinking looks like");
});

s.group("degenerate and impossible fluid requests are answered, not computed", () => {
  assert.equal(fluidSize({ minVw: 1200, maxVw: 360 }).error !== undefined, true);
  const flat = fluidSize({ minSize: 20, maxSize: 20, minVw: 360, maxVw: 1200 });
  assert.equal(flat.vw, 0, "a flat size is a constant, and the vw term must vanish");
  assert.equal(flat.fits, true);
  assert.ok(flat.atSmall === flat.atLarge);
});

s.group("leading: bigger type tighter, longer lines looser", () => {
  const ladder = [12, 16, 20, 32, 48].map((px) => suggestedLineHeight(px, 66));
  for (let i = 1; i < ladder.length; i++) assert.ok(ladder[i] <= ladder[i - 1], `leading should tighten as size grows: ${ladder.join(" ")}`);
  assert.ok(suggestedLineHeight(16, 110) > suggestedLineHeight(16, 40), "a long line needs more air");
  for (const px of [6, 400]) {
    const lh = suggestedLineHeight(px, 999);
    assert.ok(lh >= 1.02 && lh <= 2.05, `clamped for absurd input, got ${lh}`);
  }
});

s.group("line length is measured in characters, the only unit readers notice", () => {
  assert.equal(charsPerLine(640, 16).cpl, 80);
  assert.equal(charsPerLine(640, 16).wide, true);
  assert.equal(charsPerLine(500, 16).ideal, true);
  assert.equal(charsPerLine(200, 24).narrow, true);
  assert.deepEqual(charsPerLine(0, 16), { cpl: 0, ideal: false });
  assert.equal(measureFor(70), "70ch");
});

s.group("spacing scales stay positive, ordered and bounded", () => {
  for (const mode of ["multiply", "binary", "fibonacci"]) {
    const sp = spaceScale({ unit: 8, steps: 8, mode, ratio: 1.5 });
    assert.equal(sp.spaces.length, 8, mode);
    for (let i = 1; i < sp.spaces.length; i++) {
      assert.ok(sp.spaces[i].px > sp.spaces[i - 1].px, `${mode} must grow: ${sp.spaces.map((x) => x.px).join(" ")}`);
    }
    assert.ok(sp.spaces.every((x) => x.px > 0 && x.rem > 0));
  }
  assert.deepEqual(spaceScale({ unit: 8, steps: 4, mode: "binary" }).spaces.map((x) => x.px), [4, 8, 16, 32]);
  assert.deepEqual(spaceScale({ unit: 8, steps: 4, mode: "binary" }).spaces.map((x) => x.name), SPACE_NAMES.slice(0, 4));
  assert.ok(TYPE_NAMES.includes("base") && SPACE_NAMES.includes("xs"));
  assert.deepEqual(spaceScale({ unit: 8, steps: 4, mode: "multiply", ratio: 2 }).spaces.map((x) => x.px), [8, 16, 32, 64]);
  assert.equal(spaceScale({ unit: 8, steps: 999 }).spaces.length, 16, "a typo in a number field is not a licence for 999 tokens");
  assert.ok(spaceScale({ unit: 0, steps: 4 }).spaces.every((x) => x.px >= 1), "a zero unit would make every gap invisible");
});

s.group("the rhythm audit counts what misses and names the worst", () => {
  const sc = modularScale({ base: 16, ratio: 1.25, from: 0, to: 3 });
  const a = rhythmCheck(sc.sizes, 8);
  assert.equal(a.rows.length, 4);
  assert.equal(a.onGrid + a.offGrid, 4);
  assert.ok(a.rows.every((r) => r.nearest % 8 === 0));
  const worst = a.worst;
  if (a.offGrid) {
    const biggest = Math.max(...a.rows.map((r) => Math.abs(r.offBy)));
    assert.equal(Math.abs(worst.offBy), biggest, "the reported worst really is the furthest off");
  }
  assert.equal(rhythmCheck([{ name: "x", px: 24 }], 8).offGrid, 0);
  assert.deepEqual(rhythmCheck([], 8), { rows: [], offGrid: 0, onGrid: 0, base: 8, worst: null });
});

s.group("token exports are syntactically what they claim to be", () => {
  const sc = modularScale({ base: 16, ratio: 1.25, from: -1, to: 1 });
  const sp = spaceScale({ unit: 8, steps: 3 });
  const css = exportTokens({ sizes: sc.sizes, spaces: sp.spaces, name: "text" });
  assert.match(css, /^:root \{/m);
  assert.ok(css.includes("--text-base: 1rem; /* 16px */"), css);
  assert.ok(!/--text-sm: 1rem/.test(css), "16px at a 1.25 ratio is the body size, not a small size");
  assert.equal(css.split("{").length, css.split("}").length, "braces balance");
  const tw = exportTokens({ sizes: sc.sizes, spaces: sp.spaces, format: "tailwind" });
  assert.match(tw, /fontSize: \{/);
  assert.match(tw, /\["1rem", \{ lineHeight: "\d\.\d\d" \}\]/, "Tailwind wants the size/leading pair");
  assert.equal((tw.match(/module.exports = \{/) || []).length, 1);
  const json = JSON.parse(exportTokens({ sizes: sc.sizes, spaces: sp.spaces, format: "json" }));
  assert.ok(json.fontSize.base.endsWith("rem") && json.spacing.xs.endsWith("rem"));
  assert.match(exportTokens({ sizes: sc.sizes.slice(0, 1), spaces: [], format: "scss", name: "text" }), /^\$text-sm: 0.8rem; \/\* 12.8px \*\/$/);
});

s.group("the advertised ratios are usable ratios", () => {
  assert.ok(RATIOS.length >= 6);
  for (const r of RATIOS) {
    assert.ok(r.value > 1 && r.value < 2, r.name);
    assert.equal(r.name.toLowerCase(), r.name, "ratio names are shown in chips");
    const sc = modularScale({ base: 16, ratio: r.value, from: 0, to: 4 });
    assert.ok(sc.sizes[4].px > sc.sizes[0].px, `${r.name} grows`);
    assert.ok(sc.sizes[4].px < 400, `${r.name} at 5 steps stays sane`);
  }
});

s.done();
