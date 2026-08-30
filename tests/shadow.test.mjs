/* Shadow & glass — a shadow stack is a list, so the list is what is tested. */
import assert from "node:assert/strict";
import {
  defaultLayer, serializeLayer, buildBoxShadow, buildTextShadow, buildDropFilter, parseShadow,
  elevation, PRESETS, glass, inkWeight, scaleLayers, hoverBlock, exportBlock, colourToHexAlpha,
} from "../app/js/tools/shadow.js";
import { suite } from "./harness.mjs";

const s = suite("shadow");
const L = (over) => defaultLayer(over);
const SOFT = PRESETS[0].layers;

s.group("a layer serialises to exactly the five parts CSS wants", () => {
  assert.equal(serializeLayer(L({ x: 0, y: 8, blur: 24, spread: 0, alpha: 1, color: "#000000" })), "0px 8px 24px 0px #000000");
  assert.equal(serializeLayer(L({ y: 4, blur: 10, alpha: 0.25 })), "0px 4px 10px 0px rgb(0 0 0 / 0.25)");
  assert.equal(serializeLayer(L({ y: 3, blur: 7, inset: true, alpha: 1 })), "inset 0px 3px 7px 0px #000000");
  assert.equal(serializeLayer(L({ blur: -5 })), "0px 8px 0px 0px rgb(0 0 0 / 0.28)", "a negative blur is not a thing");
});

s.group("the stack keeps its order and mutes what you switch off", () => {
  const two = [L({ y: 2, blur: 6, alpha: 0.5 }), L({ y: 12, blur: 28, alpha: 0.25 })];
  assert.equal(buildBoxShadow(two).count, 2);
  assert.match(buildBoxShadow(two).css, /^0px 2px 6px.*0px 12px 28px/, "first layer stays first");
  assert.equal(buildBoxShadow(two.map((l, i) => ({ ...l, on: i === 1 }))).css, "0px 12px 28px 0px rgb(0 0 0 / 0.25)");
  assert.deepEqual(buildBoxShadow([]), { css: "none", count: 0 });
  assert.equal(buildBoxShadow([{ ...L(), on: false }]).css, "none");
});

s.group("text-shadow is a different property, not a copy-paste", () => {
  const stack = [L({ x: 1, y: 1, blur: 0, spread: 9, alpha: 1, color: "#ff0000" }), L({ y: 3, blur: 0, spread: 0, alpha: 1, inset: true })];
  const css = buildTextShadow(stack);
  assert.equal(css, "1px 1px 0px #ff0000", "one layer, no spread, no inset");
  assert.ok(!/\b9px\b/.test(css), "spread would make the declaration invalid");
  assert.ok(!/inset/.test(css), "text-shadow has no inset");
  assert.equal(buildTextShadow([]), "none");
});

s.group("drop-filter merges the stack, because it takes one layer", () => {
  const stack = [L({ y: 2, blur: 6, alpha: 0.5 }), L({ y: 12, blur: 28, alpha: 0.5 })];
  const r = buildDropFilter(stack);
  assert.match(r.css, /^drop-shadow\(-?[\d.]+px -?[\d.]+px [\d.]+px rgb\(0 0 0 \/ [\d.]+\)\)$/);
  assert.equal(r.merged, 2);
  assert.ok(!/\d+px \d+px \d+px \d+px/.test(r.css), "no spread slot in drop-shadow");
  assert.equal(buildDropFilter([]).css, "none");
});

s.group("a pasted shadow reads back into layers", () => {
  const modern = parseShadow("0 12px 28px -6px rgb(0 0 0 / 0.22), inset 0 3px 7px #00000059");
  assert.equal(modern.count, 2);
  assert.deepEqual([modern.layers[0].y, modern.layers[0].blur, modern.layers[0].spread], [12, 28, -6]);
  assert.equal(modern.layers[1].inset, true);
  assert.ok(Math.abs(modern.layers[1].alpha - 0.349) < 0.01, "#00000059 is alpha 0.349");
  const legacy = parseShadow("0px 2px 4px rgba(0, 0, 0, .28), 6px 6px 0 #101619");
  assert.equal(legacy.count, 2);
  assert.deepEqual([legacy.layers[0].x, legacy.layers[0].blur, legacy.layers[0].alpha], [0, 4, 0.28]);
  assert.equal(legacy.layers[1].blur, 0, "a three-value shadow has no spread");
  assert.equal(parseShadow("").count, 0);
  assert.equal(parseShadow("none").count, 0);
  const junk = parseShadow("inherit");
  assert.equal(junk.count, 0, "something unreadable is simply no layers, not a crash");
  assert.equal(junk.unparsed, true, "…but the page can still say so");
});

s.group("what the tool writes, the tool can read back unchanged", () => {
  for (const preset of PRESETS) {
    const written = buildBoxShadow(preset.layers).css;
    const again = buildBoxShadow(parseShadow(written).layers).css;
    assert.equal(again, written, `${preset.name} round-trip`);
  }
});

s.group("elevation climbs and stops climbing into nonsense", () => {
  const widths = [0, 1, 3, 6, 12, 18, 24].map((n) => {
    const layers = elevation(n);
    return Math.max(...layers.map((l) => l.blur));
  });
  for (let i = 1; i < widths.length; i++) assert.ok(widths[i] >= widths[i - 1], `blur must not shrink as dp grows: ${widths.join(" ")}`);
  assert.equal(buildBoxShadow(elevation(0)).css, "none", "dp 0 is flat, and flat means no shadow at all");
  assert.ok(elevation(3).length >= 2, "ambient plus contact, not one blob");
  assert.equal(elevation(999).length, elevation(24).length, "the scale is capped, so a typo cannot make a 4000px shadow");
  const weak = elevation(6, { strength: 0.2 });
  const strong = elevation(6, { strength: 1.6 });
  assert.ok(weak.reduce((n, l) => n + l.alpha, 0) < strong.reduce((n, l) => n + l.alpha, 0));
});

s.group("glass is four declarations, because blur alone is a smudge", () => {
  const g = glass({ blur: 18, alpha: 0.2, tint: "#ffffff", radius: 12 });
  assert.match(g.backdrop, /^blur\(18px\) saturate/);
  assert.match(g.css, /backdrop-filter: blur\(18px\)/);
  assert.match(g.css, /-webkit-backdrop-filter: blur\(18px\)/, "Safari without the prefix gets no frost");
  assert.match(g.css, /background: rgb\(255 255 255 \/ 0.200\)/);
  assert.match(g.css, /border: 1px solid rgb\(255 255 255 \/ 0.220\)/);
  assert.match(g.css, /box-shadow: inset 0 1px 0 rgb\(255 255 255 \/ 0.300\)/, "the top highlight is what makes the edge read as glass");
  assert.match(g.css, /border-radius: 12px/);
  assert.equal(glass({}).radius, 16);
});

s.group("ink weight calls a muddy stack muddy", () => {
  assert.equal(inkWeight([]).verdict, "nothing");
  assert.equal(inkWeight([L({ y: 2, blur: 4, alpha: 0.1 })]).verdict, "subtle");
  assert.ok(inkWeight(PRESETS.find((p) => p.name === "Dirty").layers).verdict === "heavy", "the preset named Dirty must be the one that fails");
  assert.ok(inkWeight(PRESETS.find((p) => p.name === "Soft lift").layers).verdict !== "heavy");
  assert.ok(inkWeight([L({ alpha: 0.01 })]).weight < inkWeight([L({ alpha: 0.5 })]).weight);
});

s.group("scaling and hovering", () => {
  const stack = [L({ x: 2, y: 8, blur: 24, spread: -6, alpha: 0.2 })];
  const doubled = scaleLayers(stack, 2)[0];
  assert.deepEqual([doubled.x, doubled.y, doubled.blur, doubled.spread], [4, 16, 48, -12]);
  assert.equal(doubled.alpha, 0.2, "scaling geometry is not the same as darkening the shadow");
  const block = hoverBlock(stack, scaleLayers(stack, 2));
  assert.match(block, /\.card \{[\s\S]*box-shadow:[\s\S]*transition: box-shadow 180ms/);
  assert.match(block, /\.card:hover \{[\s\S]*transform: translateY\(-1px\)/);
  assert.ok(block.split("box-shadow:").length === 3, "one rest value, one hover value");
});

s.group("exports paste into the target", () => {
  const stack = SOFT;
  assert.match(exportBlock(stack, {}), /^--shadow: 0px 2px/);
  assert.match(exportBlock(stack, { format: "raw" }), /^0px 2px 6px/);
  assert.match(exportBlock(stack, { format: "tailwind" }), /^shadow-\[.+\]$/, "spaces become underscores, which Tailwind turns back");
  assert.match(exportBlock(stack, { format: "scss" }), /^\$shadow: /);
  const json = JSON.parse(exportBlock(stack, { format: "json" }));
  assert.equal(json.layers.length, 2);
  assert.ok(Number.isFinite(json.layers[0].blur));
});

s.group("colour normalisation: the same colour is one colour", () => {
  assert.deepEqual(colourToHexAlpha("#fff"), { hex: "#ffffff", alpha: 1 });
  assert.deepEqual(colourToHexAlpha("#000000"), { hex: "#000000", alpha: 1 });
  assert.deepEqual(colourToHexAlpha("#00000047"), { hex: "#000000", alpha: 0.278 });
  assert.deepEqual(colourToHexAlpha("rgba(0, 0, 0, .28)"), { hex: "#000000", alpha: 0.28 });
  assert.deepEqual(colourToHexAlpha("rgb(0 0 0 / 25%)"), { hex: "#000000", alpha: 0.25 });
  assert.deepEqual(colourToHexAlpha("black"), { hex: "#000000", alpha: 1 });
  assert.deepEqual(colourToHexAlpha("transparent"), { hex: "#000000", alpha: 0 });
  assert.deepEqual(colourToHexAlpha("gibberish"), { hex: "#000000", alpha: 1 });
});

s.done();
