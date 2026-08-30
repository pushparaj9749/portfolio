/* Gradients tool — the model, not the pixels, is what can be wrong. */
import assert from "node:assert/strict";
import {
  parseStops, splitStopList, fillPositions, buildCss, sampleRamp, legibility, normalizeAngle, fmtAngle,
  stopsToText, shiftStops, reverseStops, uniqueColors, randomStops, exportGradient, PRESETS, GRAD_TYPES, DIRECTIONS, cssColorOf,
} from "../app/js/tools/gradient.js";
import { suite } from "./harness.mjs";

const s = suite("gradient");
const T = (text, opts = {}) => buildCss({ type: "linear", angle: 180, stops: parseStops(text).stops, ...opts });

s.group("a stop list parses positions, colours and both pasted shapes", () => {
  const one = parseStops("#0e3b43 0%\n#2c8f8f 55%\n#cfeee4 100%");
  assert.equal(one.stops.length, 3);
  assert.deepEqual(one.stops.map((x) => x.pos), [0, 55, 100]);
  const css = parseStops("#1c1330 0%, #6d3b7a 48%, #e8845e 100%"); // one line, devtools style
  assert.deepEqual(css.stops.map((x) => x.pos), [0, 48, 100]);
  assert.deepEqual(css.errors, []);
  const at = parseStops("#fff at 20%");
  assert.equal(at.stops[0].pos, 20);
  const bad = parseStops("notacolour 0%");
  assert.equal(bad.errors.length, 1, "an unreadable colour is reported, not skipped silently");
  assert.equal(bad.stops.length, 0);
  assert.match(bad.errors[0].message, /read/);
  assert.equal(parseStops("#000 0%\nstill-not\n#fff 100%").stops.length, 2, "one bad line does not poison the list");
  assert.equal(parseStops("").stops.length, 0);
  assert.equal(parseStops("// just a comment").stops.length, 0);
});

s.group("commas inside a colour never split a stop", () => {
  assert.deepEqual(splitStopList("rgba(1, 0, 0, .5) 0%, #000 100%"), ["rgba(1, 0, 0, .5) 0%", "#000 100%"]);
  const r = parseStops("rgba(1, 0, 0, .5) 0%, rgb(0 0 0 / 0.25) 100%");
  assert.equal(r.errors.length, 0);
  assert.equal(r.stops[0].color.a, 0.5);
});

s.group("missing positions are spread evenly; written ones are kept", () => {
  assert.deepEqual(fillPositions(parseStops("#000\n#fff").stops).map((x) => x.pos), [0, 100]);
  assert.deepEqual(fillPositions(parseStops("#000\n#888\n#fff").stops).map((x) => x.pos), [0, 50, 100]);
  const kept = fillPositions(parseStops("#000 0%\n#888\n#fff 80%").stops);
  assert.deepEqual(kept.map((x) => x.pos), [0, 40, 80], "the gap between anchors is divided, not guessed");
  assert.deepEqual(fillPositions([]), []);
});

s.group("each type renders its own geometry, and refusing beats lying", () => {
  const stops = parseStops("#000 0%\n#fff 100%").stops;
  assert.equal(buildCss({ type: "linear", angle: 45, stops }).css, "linear-gradient(45deg, #000000 0%, #ffffff 100%)");
  assert.equal(buildCss({ type: "radial", shape: "circle", position: "30% 20%", stops }).css, "radial-gradient(circle at 30% 20%, #000000 0%, #ffffff 100%)");
  assert.equal(buildCss({ type: "conic", angle: 90, stops }).css, "conic-gradient(from 90deg, #000000 0%, #ffffff 100%)");
  assert.match(buildCss({ type: "linear", angle: 0, repeat: true, stops }).css, /^repeating-linear-gradient/);
  assert.match(buildCss({ type: "linear", angle: 0, interpolate: "oklab", stops }).css, / in oklab,/);
  assert.equal(buildCss({ type: "linear", stops: [stops[0]] }).error, "A gradient needs at least two stops.");
  assert.equal(GRAD_TYPES.length, 3);
});

s.group("angles accept the forms people actually type", () => {
  assert.equal(normalizeAngle("to top right"), 45);
  assert.equal(DIRECTIONS["to bottom left"], 225);
  assert.equal(normalizeAngle("-30"), 330);
  assert.equal(normalizeAngle("45deg"), 45);
  assert.equal(normalizeAngle("0.25turn"), 90);
  assert.equal(normalizeAngle(720), 0, "360 is a full circle, so a wrap is not a bug");
  assert.equal(typeof normalizeAngle("banana"), "object");
  assert.match(normalizeAngle("banana").error, /banana/);
  assert.equal(fmtAngle(370), "10deg");
  assert.equal(fmtAngle(12.5), "12.5deg");
});

s.group("the ramp samples the real gradient, not a linear list of stop colours", () => {
  const stops = parseStops("#000000 0%\n#ff0000 100%").stops;
  const ramp = sampleRamp(stops, 3);
  assert.equal(ramp[0].hex, "#000000");
  assert.equal(ramp[2].hex, "#ff0000");
  assert.equal(ramp[1].hex, "#800000", "the midpoint is a real 50% mix");
  const anchored = sampleRamp(parseStops("#000 0%\n#f00 20%\n#00f 100%").stops, 11);
  assert.equal(anchored[2].hex, "#ff0000", "the 20% stop lands exactly on a sample");
  assert.equal(anchored[5].pos, 50);
});

s.group("legibility reports the worst place, which is the only useful place", () => {
  const dark = parseStops("#0b0e12 0%\n#123 100%").stops;
  const onDark = legibility(dark, { fg: "#ffffff" });
  assert.ok(onDark.worst >= 4.5, `white on an all-dark ramp should pass, got ${onDark.worst}`);
  assert.equal(onDark.pass, true);
  const split = parseStops("#ffffff 0%\n#000000 100%").stops;
  const both = legibility(split, { fg: "#ffffff" });
  assert.ok(both.worst < 1.5, "white text on the white end is the failure a generator would hide");
  assert.ok(both.best.ratio > 15, "and the black end is fine — the two numbers are the whole story");
  assert.equal(both.large, false);
  // the point of `behind`: a transparent stop is not a colour, it is a window
  const fade = parseStops("#ffffff 0%\nrgb(255 255 255 / 0) 100%").stops;
  const overInk = legibility(fade, { fg: "#000000", behind: "#0b0e12" });
  const overPaper = legibility(fade, { fg: "#000000", behind: "#ffffff" });
  assert.ok(overInk.worst < 1.3, "black text where the fade has thinned to nothing over ink is invisible");
  assert.ok(overPaper.worst > 15, "…and the same fade over paper is perfectly readable");
  assert.notEqual(overInk.worst, overPaper.worst, "a generator that ignores the ground cannot tell you this");
});

s.group("stop edits keep their own positions", () => {
  const stops = parseStops("#000 0%\n#888 40%\n#fff 100%").stops;
  assert.deepEqual(shiftStops(stops, 10).map((x) => x.pos), [10, 50, 100], "shifted, then clamped at the end");
  assert.deepEqual(reverseStops(stops).map((x) => `${cssColorOf(x.color)}@${x.pos}`), ["#ffffff@0", "#888888@60", "#000000@100"]);
  const dupes = parseStops("#f00 0%\n#f00 30%\n#00f 100%").stops;
  assert.equal(dupes.length, 3);
  assert.equal(uniqueColors(dupes).length, 2, "an identical colour twice is one colour");
});

s.group("the editor's text is re-readable, in both directions", () => {
  const alpha = parseStops("rgb(255 0 0 / 0.5) 0%\n#0000ff 100%").stops;
  const text = stopsToText(alpha);
  assert.match(text, /^rgb\(255 0 0 \/ 0.5\) 0%/);
  const again = parseStops(text);
  assert.deepEqual(again.errors, [], "what we print, we can read back");
  assert.equal(again.stops[0].color.a, 0.5);
  assert.deepEqual(again.stops.map((x) => x.pos), [0, 100]);
});

s.group("random gradients are pleasant by construction, not by luck", () => {
  for (let i = 0; i < 40; i++) {
    const stops = randomStops({ count: 3 });
    assert.equal(stops.length, 3);
    assert.deepEqual(stops.map((x) => x.pos), [0, 50, 100]);
    for (const st of stops) {
      for (const ch of ["r", "g", "b"]) assert.ok(st.color[ch] >= 0 && st.color[ch] <= 255, "in range for CSS");
    }
  }
  const fixed = randomStops({ hue: 200, count: 2 });
  assert.equal(fixed.length, 2);
});

s.group("every preset is valid CSS and re-parses through the editor", () => {
  assert.ok(PRESETS.length >= 5, "a preset row of two is not a preset row");
  for (const p of PRESETS) {
    const { stops, errors } = parseStops(p.stops);
    assert.deepEqual(errors, [], `${p.name} has stops we cannot parse`);
    const built = buildCss({ type: p.type, angle: p.angle ?? 0, shape: p.shape, position: p.position, stops });
    assert.ok(!built.error, `${p.name}: ${built.error}`);
    assert.match(built.css, new RegExp(`^${p.repeat ? "repeating-" : ""}${p.type}-gradient`), `${p.name} type`);
    assert.equal(parseStops(stopsToText(stops)).errors.length, 0, `${p.name} round-trips`);
  }
});

s.group("exports paste into the thing they name", () => {
  const model = { type: "linear", angle: 120, stops: parseStops("#000 0%\n#fff 100%").stops };
  assert.match(exportGradient(model, { format: "css" }).text, /--brand-gradient: linear-gradient/);
  assert.match(exportGradient(model, { format: "raw" }).text, /^linear-gradient\(120deg/);
  assert.match(exportGradient(model, { format: "tailwind" }).text, /^bg-\[linear-gradient\(.+_.+\]$/);
  assert.match(exportGradient(model, { format: "scss" }).text, /^\$brand-gradient: linear-gradient/);
  const json = JSON.parse(exportGradient(model, { format: "json", name: "hero" }).text);
  assert.equal(json.name, "hero");
  assert.deepEqual(json.stops.map((x) => x.pos), [0, 100]);
  assert.deepEqual(exportGradient({ type: "linear", stops: [] }, { format: "css" }), { error: "A gradient needs at least two stops." });
});

s.done();
