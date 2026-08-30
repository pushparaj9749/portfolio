/* =========================================================
   Tool · Gradients
   A gradient is a list of stops and a geometry, so that is what this
   models. The CSS string is *rendered from the model* on every edit —
   there is no half-parsed textarea where the user's markup and the
   tool's markup fight each other.

   Two things this does that a CSS generator usually does not:
   - it samples the gradient and reports the worst contrast a foreground
     colour would face anywhere across it (a gradient you cannot read on
     is decoration, not a surface);
   - stops keep their real positions when you reverse, shift or re-space
     them, so a 3-stop ramp does not silently become an even spread.
   ========================================================= */

import { parseColor, toHex, mix, relativeLuminance, bestTextOn } from "./color.js";

export const GRAD_TYPES = ["linear", "radial", "conic"];

/** CSS angle 0 = "to top", clockwise. Named directions are the friendly path. */
export const DIRECTIONS = {
  "to top": 0,
  "to top right": 45,
  "to right": 90,
  "to bottom right": 135,
  "to bottom": 180,
  "to bottom left": 225,
  "to left": 270,
  "to top left": 315,
};

/** Accepts "45", "45deg", "to top right", "1.2turn", "-30" → 0–359 float. */
export function normalizeAngle(input) {
  if (typeof input === "number" && Number.isFinite(input)) return ((input % 360) + 360) % 360;
  const s = String(input ?? "").trim().toLowerCase();
  if (!s) return { error: "empty" };
  if (DIRECTIONS[s] !== undefined) return DIRECTIONS[s];
  const num = Number.parseFloat(s);
  if (!Number.isFinite(num)) return { error: `“${input}” is not an angle or a direction` };
  const deg = s.endsWith("turn") || s.endsWith("tone") ? num * 360 : s.endsWith("rad") ? (num * 180) / Math.PI : num;
  if (s.endsWith("grad")) return ((deg * 0.9) % 360 + 360) % 360;
  return ((deg % 360) + 360) % 360;
}

export const fmtAngle = (deg) => {
  const d = ((deg % 360) + 360) % 360;
  return Number.isInteger(d) ? `${d}deg` : `${d.toFixed(1)}deg`;
};

/**
 * One stop per line: `#0fc 0%`, `rgb(0 0 0 / .5) 45%`, `tomato`,
 * `rgba(255,0,0,.4) at 12%` — `at` optional, position optional
 * (missing positions are spread evenly by fillPositions).
 */
/** Split on newlines and on top-level commas: `#fff 0%, #000 100%` pasted straight
 *  out of devtools is as valid as one stop per line. Commas inside rgb(…) stay put. */
export function splitStopList(text) {
  const src = String(text ?? "");
  const parts = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && (c === "\n" || (c === "," && src[i + 1] !== " "))) {
      parts.push(cur);
      cur = "";
      continue;
    }
    if (depth === 0 && c === "," && src[i + 1] === " ") {
      parts.push(cur);
      cur = "";
      i++; // eat the space too
      continue;
    }
    cur += c;
  }
  parts.push(cur);
  return parts;
}

export function parseStops(text) {
  const lines = splitStopList(text);
  const stops = [];
  const errors = [];
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith("//")) return; // // only, so "#" always means a hex
    let colorPart = line;
    let pos = null;
    const withPos = /^(.*?)[\s,]+at\s+(-?\d+(?:\.\d+)?)%$/.exec(line) || /^(.*?)[\s,]+(-?\d+(?:\.\d+)?)%$/.exec(line);
    if (withPos) {
      colorPart = withPos[1];
      pos = Math.min(100, Math.max(0, Number(withPos[2])));
    }
    const color = parseColor(colorPart.trim());
    // parseColor answers { ok:false, error } rather than null, and colour.js's own
    // helpers throw on that — so honour the answer instead of shipping a NaN stop
    if (!color || color.ok === false) {
      errors.push({ line: i + 1, text: line, message: color?.error || "not a colour this page understands" });
      return;
    }
    stops.push({ color, pos, alpha: color.a ?? 1 });
  });
  return { stops, errors };
}

/** Even spread for anything without an explicit position, anchored at both ends. */
export function fillPositions(stops) {
  const list = stops.map((s) => ({ ...s }));
  if (!list.length) return list;
  const missing = list.filter((s) => s.pos === null || s.pos === undefined);
  if (!missing.length) return list.sort((a, b) => a.pos - b.pos);
  if (missing.length === list.length) {
    return list.map((s, i) => ({ ...s, pos: list.length === 1 ? 0 : (i / (list.length - 1)) * 100 }));
  }
  // walk the list; a run of gaps between two anchors is divided evenly
  let lastIdx = 0;
  let lastPos = list[0].pos ?? 0;
  if (list[0].pos === null || list[0].pos === undefined) {
    list[0].pos = 0;
    lastPos = 0;
  }
  for (let i = 1; i < list.length; i++) {
    if (list[i].pos === null || list[i].pos === undefined) continue;
    const gap = i - lastIdx;
    if (gap > 1) {
      const step = (list[i].pos - lastPos) / gap;
      for (let k = 1; k < gap; k++) list[lastIdx + k].pos = lastPos + step * k;
    }
    lastIdx = i;
    lastPos = list[i].pos;
  }
  if (lastIdx < list.length - 1) {
    const gap = list.length - lastIdx;
    const step = (100 - lastPos) / gap;
    for (let k = 1; k < gap; k++) list[lastIdx + k].pos = lastPos + step * k;
    list[list.length - 1].pos = 100;
  }
  return list.sort((a, b) => a.pos - b.pos);
}

/** The CSS form is chosen so the *text editor* can read it back: `#rrggbb` when
 *  opaque, `rgb(r g b / a)` when not — never `#rrggbbaa / .5`, which would not parse. */
export const cssColorOf = (color) =>
  color.a !== undefined && color.a < 1
    ? `rgb(${color.r} ${color.g} ${color.b} / ${+color.a.toFixed(3)})`
    : toHex(color);

export const stopToCss = (s) => {
  const css = cssColorOf(s.color);
  return s.pos === null || s.pos === undefined ? css : `${css} ${+s.pos.toFixed(2)}%`;
};

export const stopsToText = (stops) =>
  fillPositions(stops)
    .map((s) => `${cssColorOf(s.color)} ${+s.pos.toFixed(1)}%`)
    .join("\n");

/**
 * Render the model to one CSS value.
 * opts: { type, angle, shape, size, position, repeat, interpolate }
 */
export function buildCss(opts = {}) {
  const type = GRAD_TYPES.includes(opts.type) ? opts.type : "linear";
  const stops = fillPositions(Array.isArray(opts.stops) ? opts.stops : []);
  if (stops.length < 2) return { error: "A gradient needs at least two stops." };
  const list = stops.map(stopToCss).join(", ");
  const rep = opts.repeat ? "repeating-" : "";
  const interp = opts.interpolate && opts.interpolate !== "srgb" ? ` in ${opts.interpolate}` : "";
  if (type === "linear") {
    const angle = normalizeAngle(opts.angle ?? 180);
    return { css: `${rep}linear-gradient(${fmtAngle(typeof angle === "number" ? angle : 180)}${interp}, ${list})` };
  }
  if (type === "radial") {
    const shape = ["circle", "ellipse"].includes(opts.shape) ? opts.shape : "circle";
    const size = opts.size && opts.size !== "auto" ? ` ${opts.size}` : "";
    const at = opts.position && opts.position !== "50% 50%" ? ` at ${opts.position}` : "";
    return { css: `${rep}radial-gradient(${shape}${size}${at}${interp}, ${list})` };
  }
  const from = normalizeAngle(opts.angle ?? 0);
  const at = opts.position && opts.position !== "50% 50%" ? ` at ${opts.position}` : "";
  return { css: `${rep}conic-gradient(from ${fmtAngle(typeof from === "number" ? from : 0)}${at}${interp}, ${list})` };
}

/** n samples along the ramp, positions included — the basis for preview strips
 *  and for the legibility check below. */
export function sampleRamp(stops, n = 12) {
  const list = fillPositions(stops);
  if (list.length < 2) return list.map((s) => ({ hex: toHex(s.color).slice(0, 7), pos: 0, alpha: 1 }));
  const out = [];
  for (let i = 0; i < n; i++) {
    const pos = (i / (n - 1)) * 100;
    let a = list[0];
    let b = list[list.length - 1];
    for (let k = 0; k < list.length - 1; k++) {
      if (pos >= list[k].pos && pos <= list[k + 1].pos) {
        a = list[k];
        b = list[k + 1];
        break;
      }
    }
    if (pos < list[0].pos) {
      a = list[0];
      b = list[0];
    }
    if (pos > list[list.length - 1].pos) {
      a = list[list.length - 1];
      b = list[list.length - 1];
    }
    const span = b.pos - a.pos;
    const t = span > 0 ? (pos - a.pos) / span : 0;
    const blended = mix(a.color, b.color, t);
    const alpha = (a.color.a ?? 1) + ((b.color.a ?? 1) - (a.color.a ?? 1)) * t;
    out.push({ hex: toHex(blended).slice(0, 7), pos, alpha: +alpha.toFixed(3), r: blended.r, g: blended.g, b: blended.b });
  }
  return out;
}

/**
 * Worst contrast a text colour faces anywhere across the gradient.
 * Transparent stops are evaluated against `behind`, because that is what the
 * eye actually sees through them.
 */
export function legibility(stops, { fg, behind = "#ffffff", samples = 24 } = {}) {
  const readOr = (value, fallback) => {
    const c = parseColor(value);
    return c && c.ok !== false ? c : fallback;
  };
  const text = readOr(fg, { r: 0, g: 0, b: 0, a: 1 });
  const base = readOr(behind, { r: 255, g: 255, b: 255, a: 1 });
  const ramp = sampleRamp(stops, samples);
  let worst = { ratio: 21, at: null };
  let best = { ratio: 0, at: null };
  for (const s of ramp) {
    const over = mix(base, { r: s.r, g: s.g, b: s.b, a: s.alpha }, s.alpha);
    const lum = relativeLuminance(over);
    const textLum = relativeLuminance(text);
    const ratio = (Math.max(lum, textLum) + 0.05) / (Math.min(lum, textLum) + 0.05);
    if (ratio < worst.ratio) worst = { ratio: +ratio.toFixed(2), at: s.hex, pos: s.pos };
    if (ratio > best.ratio) best = { ratio: +ratio.toFixed(2), at: s.hex, pos: s.pos };
  }
  const suggestion = ramp.length ? bestTextOn({ r: ramp[Math.floor(ramp.length / 2)].r, g: ramp[Math.floor(ramp.length / 2)].g, b: ramp[Math.floor(ramp.length / 2)].b, a: 1 }) : "#fff";
  return { ...worst, best, worst: worst.ratio, suggestion, pass: worst.ratio >= 4.5, large: worst.ratio >= 3 };
}

export const shiftStops = (stops, delta) =>
  fillPositions(stops).map((s) => ({ ...s, pos: Math.min(100, Math.max(0, s.pos + Number(delta) || 0)) }));

export const reverseStops = (stops) =>
  fillPositions(stops)
    .slice()
    .reverse()
    .map((s) => ({ ...s, pos: 100 - s.pos }));

export const uniqueColors = (stops) => {
  const seen = new Set();
  return stops.filter((s) => {
    const k = toHex({ ...s.color, a: 1 });
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/** Deterministic pleasant random: two hues on either side of a spin, plus a bridge. */
export function randomStops({ hue = null, count = 3, spin = 40 } = {}) {
  const base = hue === null ? Math.floor(Math.random() * 360) : Number(hue);
  const out = [];
  for (let i = 0; i < count; i++) {
    const h = (base + (i - (count - 1) / 2) * spin + 360) % 360;
    const l = 0.32 + (i / Math.max(1, count - 1)) * 0.42;
    out.push({ color: hslToColor(h, 0.72, l), pos: count === 1 ? 0 : (i / (count - 1)) * 100, alpha: 1 });
  }
  return out;
}

/** hsl (h 0-360, s/l 0-1) → rgb 0-255, local so this module can be used alone. */
export function hslToColor(h, s, l) {
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))));
  };
  return { r: f(0), g: f(8), b: f(4), a: 1 };
}

export const PRESETS = [
  { name: "Dusk", type: "linear", angle: 160, stops: "#1c1330 0%, #6d3b7a 48%, #e8845e 100%" },
  { name: "Sea glass", type: "linear", angle: 120, stops: "#0e3b43 0%, #2c8f8f 55%, #cfeee4 100%" },
  { name: "Ember", type: "radial", shape: "circle", position: "30% 20%", stops: "#ffd9a0 0%, #f0763b 45%, #4a1108 100%" },
  { name: "Graphite", type: "linear", angle: 180, stops: "#1a1e23 0%, #2b3138 60%, #3c444d 100%" },
  { name: "Citrus", type: "conic", angle: 0, stops: "#f7d154 0%, #ef5b4c 30%, #7a2c8f 62%, #f7d154 100%" },
  { name: "Fog", type: "linear", angle: 0, stops: "rgb(255 255 255 / 0) 0%, rgb(255 255 255 / 0.55) 100%" },
  { name: "Fade out", type: "linear", angle: 90, stops: "#0b0e12 0%, #0b0e12 62%, rgb(11 14 18 / 0) 100%" },
];

/**
 * Exports. `css` gives a usable custom-property block; `tailwind` an arbitrary
 * value; `json` the model itself so a gradient can be re-opened, not just pasted.
 */
export function exportGradient(model, { name = "brand", format = "css" } = {}) {
  const built = buildCss(model);
  if (built.error) return { error: built.error };
  const stops = fillPositions(model.stops).map((s) => ({ hex: toHex(s.color), pos: +s.pos.toFixed(2) }));
  if (format === "raw" || format === "css-value") return { text: built.css };
  if (format === "json") return { text: JSON.stringify({ name, ...model, angle: model.angle, stops }, null, 2) };
  if (format === "tailwind") return { text: `bg-[${built.css.replace(/\s+/g, "_")}]` };
  if (format === "scss") return { text: `$${name}-gradient: ${built.css};\nbackground: $${name}-gradient;` };
  return { text: `--${name}-gradient: ${built.css};\nbackground-image: var(--${name}-gradient);` };
}

/* ---------------- UI ---------------- */
if (typeof document !== "undefined" && typeof window !== "undefined") boot().catch((err) => console.warn(err));

async function boot() {
  const shell = await import("../shell.js");
  const { $, $$, toast, copyText, debounce, escapeHtml } = shell;
  shell.bootTool();

  const ta = $("#stops");
  const angle = $("#angle");
  const angleNum = $("#angleNum");
  const preview = $("#gradPreview");
  const out = $("#gradOut");
  const state = { type: "linear", repeat: false, shape: "circle", position: "50% 50%", interpolate: "srgb" };

  const model = () => {
    const { stops, errors } = parseStops(ta.value);
    return { type: state.type, angle: state.type === "radial" ? 180 : Number(angleNum.value || 0), shape: state.shape, position: state.position, repeat: state.repeat, interpolate: state.interpolate, stops, errors };
  };

  function render() {
    const m = model();
    const built = buildCss(m);
    $("#stopErrors").hidden = !m.errors.length;
    $("#stopErrors").textContent = m.errors.length
      ? m.errors.map((e) => `line ${e.line}: ${e.text} — ${e.message}`).join(" · ")
      : "";
    if (built.error) {
      preview.style.background = "var(--panel-2)";
      out.value = "";
      $("#ramp").innerHTML = "";
      $("#legi").innerHTML = '<span class="pill is-warn">needs two stops</span>';
      return;
    }
    out.value = built.css;
    preview.style.background = built.css;
    const ramp = sampleRamp(m.stops, 16);
    $("#ramp").innerHTML = ramp
      .map(
        (s) =>
          `<button class="rampcell" type="button" data-hex="${s.hex}" title="copy ${s.hex}" style="background:${s.hex}"></button>`
      )
      .join("");
    $$("#ramp .rampcell").forEach((b) =>
      b.addEventListener("click", () => copyText(b.dataset.hex, `Copied ${b.dataset.hex}.`))
    );
    const legi = legibility(m.stops, { fg: $("#fgCheck").value, behind: $("#bgCheck").value });
    $("#legi").innerHTML =
      `<span class="pill ${legi.pass ? "is-pass" : legi.large ? "is-warn" : "is-fail"}">worst ${legi.worst.toFixed(2)}:1</span>` +
      `<span class="mini">text ${escapeHtml($("#fgCheck").value)} across the ramp · ${
        legi.pass ? "readable everywhere" : legi.large ? "headlines only" : "unreadable in part"
      } · nearest safe: <button class="copyable" type="button" data-copy="${legi.suggestion}">${escapeHtml(legi.suggestion)}</button></span>`;
    $$("#legi .copyable").forEach((b) => b.addEventListener("click", () => copyText(b.dataset.copy, "Copied.")));
    $("#angleRead").textContent = state.type === "linear" ? `line at ${fmtAngle(Number(angleNum.value || 0))}` : state.type === "conic" ? `starts at ${fmtAngle(Number(angleNum.value || 0))}` : `centre ${state.position}`;
  }

  ta.addEventListener("input", debounce(render, 110));
  angle.addEventListener("input", () => {
    angleNum.value = String(angle.value);
    render();
  });
  angleNum.addEventListener("input", debounce(() => {
    const a = normalizeAngle(angleNum.value);
    if (typeof a === "number") angle.value = String(Math.round(a));
    render();
  }, 140));

  $$("#types .tbtn").forEach((b) =>
    b.addEventListener("click", () => {
      $$("#types .tbtn").forEach((x) => x.classList.toggle("is-on", x === b));
      state.type = b.dataset.type;
      $("#angleRow").hidden = state.type === "radial";
      $("#radialRow").hidden = state.type !== "radial";
      render();
    })
  );
  $("#repeat").addEventListener("change", (e) => {
    state.repeat = e.target.checked;
    render();
  });
  $("#interp").addEventListener("change", (e) => {
    state.interpolate = e.target.value;
    render();
  });
  $("#shape").addEventListener("change", (e) => {
    state.shape = e.target.value;
    render();
  });
  $("#posn").addEventListener("input", debounce((e) => {
    state.position = e.target.value || "50% 50%";
    render();
  }, 140));
  $$("#directions .tbtn").forEach((b) =>
    b.addEventListener("click", () => {
      const a = normalizeAngle(b.dataset.dir);
      angleNum.value = String(Math.round(a));
      angle.value = String(Math.round(a));
      render();
    })
  );
  $("#fgCheck").addEventListener("input", debounce(render, 90));
  $("#bgCheck").addEventListener("input", debounce(render, 90));
  $("#reverse").addEventListener("click", () => {
    ta.value = stopsToText(reverseStops(model().stops));
    render();
  });
  $("#spread").addEventListener("click", () => {
    const s = model().stops.map((x) => ({ ...x, pos: null }));
    ta.value = stopsToText(fillPositions(s));
    render();
  });
  $("#dedupe").addEventListener("click", () => {
    ta.value = stopsToText(uniqueColors(model().stops));
    render();
  });
  $("#randomGrad").addEventListener("click", () => {
    ta.value = stopsToText(randomStops({ count: 3 + Math.floor(Math.random() * 2) }));
    render();
  });
  $$("#presets .tbtn").forEach((b) =>
    b.addEventListener("click", () => {
      const p = PRESETS.find((x) => x.name === b.dataset.preset);
      if (!p) return;
      ta.value = p.stops;
      $$("#types .tbtn").forEach((x) => x.classList.toggle("is-on", x.dataset.type === p.type));
      state.type = p.type;
      $("#angleRow").hidden = p.type === "radial";
      $("#radialRow").hidden = p.type !== "radial";
      if (p.angle !== undefined) {
        angleNum.value = String(p.angle);
        angle.value = String(p.angle);
      }
      if (p.position) $("#posn").value = p.position;
      state.position = p.position || "50% 50%";
      render();
    })
  );
  const doExport = () => {
    const r = exportGradient(model(), { name: $("#gname").value || "brand", format: $("#format").value });
    out.value = r.error ? r.error : r.text;
  };
  $("#format").addEventListener("change", () => {
    doExport();
    render();
  });
  $("#gname").addEventListener("input", debounce(doExport, 140));
  $("#copyOut").addEventListener("click", () => copyText(out.value, "Copied to the clipboard."));
  $("#useHere").addEventListener("click", () => {
    const built = buildCss(model());
    if (built.error) return toast(built.error, "err");
    const mid = sampleRamp(model().stops, 3)[1].hex;
    document.documentElement.style.setProperty("--tool-dark", mid);
    document.documentElement.style.setProperty("--tool-light", mid);
    toast("Applied as this page's accent. Reload to put it back.", "ok", 3400);
  });

  render();
}
