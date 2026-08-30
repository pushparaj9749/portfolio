/* =========================================================
   Tool · Color
   Conversions, ramps, harmonies and WCAG contrast maths.
   Contrast uses the same formula as WCAG 2.2, verified in tests
   against the reference pairs from the spec.
   ========================================================= */

const NAMED = {
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff",
  yellow: "#ffff00", orange: "#ffa500", purple: "#800080", pink: "#ffc0cb", grey: "#808080",
  gray: "#808080", silver: "#c0c0c0", navy: "#000080", maroon: "#800000", olive: "#808000",
  teal: "#008080", aqua: "#00ffff", fuchsia: "#ff00ff", transparent: "#000000",
  rebeccapurple: "#663399", tomato: "#ff6347", coral: "#ff7f50", salmon: "#fa8072",
  gold: "#ffd700", crimson: "#dc143c", indigo: "#4b0082", violet: "#ee82ee",
  orchid: "#da70d6", plum: "#dda0dd", khaki: "#f0e68c", sienna: "#a0522d",
  peru: "#cd853f", dodgerblue: "#1e90ff", skyblue: "#87ceeb", steelblue: "#4682b4",
  slategray: "#708090", darkslategray: "#2f4f4f", gainsboro: "#dcdcdc",
  whitesmoke: "#f5f5f5", lavender: "#e6e6fa", honeydew: "#f0fff0",
  black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", lime: "#00ff00",
  blue: "#0000ff", yellow: "#ffff00", cyan: "#00ffff", magenta: "#ff00ff", silver: "#c0c0c0",
  gray: "#808080", grey: "#808080", maroon: "#800000", olive: "#808000", purple: "#800080",
  teal: "#008080", navy: "#000080", orange: "#ffa500", aqua: "#00ffff", fuchsia: "#ff00ff",
  transparent: "#00000000",
};

const clamp01 = (n) => Math.min(1, Math.max(0, n));
const round = (n, p = 0) => {
  const f = 10 ** p;
  return Math.round(n * f) / f;
};

export function parseColor(input) {
  const s = String(input ?? "").trim().toLowerCase();
  if (!s) return { ok: false, error: "empty" };
  if (NAMED[s]) return { ok: true, ...hexToRgba(NAMED[s]) };

  let m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    const h = m[1];
    if (![3, 4, 6, 8].includes(h.length)) return { ok: false, error: `“#${h}” is not a valid hex length` };
    return { ok: true, ...hexToRgba(s) };
  }
  m = s.match(/^(rgb|rgba|hsl|hsla)\(([^)]+)\)$/);
  if (m) {
    const fn = m[1];
    const body = m[2].replace(/\//g, " ").replace(/,/g, " ").split(/\s+/).filter(Boolean);
    if (body.length < 3) return { ok: false, error: `${fn}() needs three components` };
    const num = (v, scale) => {
      if (v.endsWith("%")) return (parseFloat(v) / 100) * scale;
      return parseFloat(v);
    };
    if (fn.startsWith("rgb")) {
      const [r, g, b] = [num(body[0], 255), num(body[1], 255), num(body[2], 255)];
      if ([r, g, b].some((n) => !Number.isFinite(n))) return { ok: false, error: "rgb() components must be numbers" };
      const a = body[3] === undefined ? 1 : clamp01(parseFloat(body[3]) / (body[3].endsWith("%") ? 100 : 1));
      return { ok: true, r: round(r), g: round(g), b: round(b), a: round(a, 3) };
    }
    const hue = (v) => {
      const n = parseFloat(v);
      if (!Number.isFinite(n)) return NaN;
      if (/turn\)?$/i.test(v)) return n * 360;
      if (/grad\)?$/i.test(v)) return n * 0.9;
      if (/rad\)?$/i.test(v)) return (n * 180) / Math.PI;
      return n; // "deg" or a bare number are both degrees
    };
    // Sat/light may arrive as "100%", "100" or the legacy "1". All three mean 100%.
    const unit = (v) => {
      const n = parseFloat(v);
      if (!Number.isFinite(n)) return NaN;
      return String(v).trim().endsWith("%") ? clamp01(n / 100) : clamp01(n <= 1 ? n : n / 100);
    };
    const h = hue(body[0]);
    const sat = unit(body[1]);
    const lig = unit(body[2]);
    const a = body[3] === undefined ? 1 : clamp01(parseFloat(body[3]) / (body[3].endsWith("%") ? 100 : 1));
    if (![h, sat, lig].every(Number.isFinite)) return { ok: false, error: "hsl() components must be numbers" };
    const rgb = hslToRgb((((h % 360) + 360) % 360), sat, lig);
    return { ok: true, ...rgb, a: round(a, 3) };
  }
  return { ok: false, error: `Could not read “${input}”. Try #2e6fdb, rgb(46 111 219), hsl(217 71% 52%) or a name.` };
}

export function hexToRgba(hex) {
  let h = String(hex).replace("#", "");
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length === 8 ? round(parseInt(h.slice(6, 8), 16) / 255, 3) : 1;
  return { r, g, b, a };
}

export const toHex = ({ r, g, b, a = 1 }) =>
  `#${[r, g, b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}${a < 1 ? Math.round(a * 255).toString(16).padStart(2, "0") : ""}`;

export const toRgbString = ({ r, g, b, a = 1 }) =>
  a < 1 ? `rgba(${round(r)}, ${round(g)}, ${round(b)}, ${round(a, 2)})` : `rgb(${round(r)}, ${round(g)}, ${round(b)})`;

export function rgbToHsl({ r, g, b, a = 1 }) {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
  }
  return { h: round(h, 1), s: round(s * 100, 1), l: round(l * 100, 1), a: round(a, 3) };
}

export function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: round(f(0) * 255), g: round(f(8) * 255), b: round(f(4) * 255) };
}

export const toHslString = (c) => {
  const { h, s, l, a } = rgbToHsl(c);
  return a < 1 ? `hsla(${h}, ${s}%, ${l}%, ${a})` : `hsl(${h}, ${s}%, ${l}%)`;
};

/* ---------- WCAG ---------- */
/**
 * Colours arrive at these functions either as {r,g,b,a} objects or as hex strings
 * from the ramp/preview code. Normalising in one place is what keeps
 * bestTextOn("#0f1017") from quietly computing NaN and answering "black".
 */
export function asColor(c) {
  if (c && typeof c === "object" && Number.isFinite(c.r)) return c;
  const parsed = parseColor(c);
  if (!parsed.ok) throw new Error(`Not a colour: ${JSON.stringify(String(c ?? ""))}`);
  return parsed;
}

export function relativeLuminance(color) {
  const { r, g, b } = asColor(color);
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(c1, c2) {
  const l1 = relativeLuminance(c1);
  const l2 = relativeLuminance(c2);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export function wcag(ratio, { large = false, ui = false } = {}) {
  const need = large ? 3 : ui ? 3 : 4.5;
  const needAAA = large ? 4.5 : 7;
  return {
    need,
    needAAA,
    aa: ratio >= need,
    aaa: ratio >= needAAA,
    label: ratio >= needAAA ? "AAA" : ratio >= need ? "AA" : ratio >= 3 ? "AA large only" : "fail",
  };
}

/** Highest-contrast of black/white for text on this background. */
export function bestTextOn(bg) {
  bg = asColor(bg);
  const white = contrastRatio(bg, { r: 255, g: 255, b: 255 });
  const black = contrastRatio(bg, { r: 0, g: 0, b: 0 });
  return white >= black ? "#ffffff" : "#000000";
}

/** Nudge a colour's lightness until it clears `target` against `bg`. */
export function ensureContrast(fg, bg, target = 4.5, maxSteps = 100) {
  fg = asColor(fg);
  bg = asColor(bg);
  if (contrastRatio(fg, bg) >= target) return { ...fg, adjusted: false, steps: 0 };
  const { h, s } = rgbToHsl(fg);
  const bgIsDark = relativeLuminance(bg) < 0.4;
  let l = rgbToHsl(fg).l / 100;
  for (let i = 1; i <= maxSteps; i++) {
    l = bgIsDark ? Math.min(1, l + 0.01) : Math.max(0, l - 0.01);
    const next = { ...hslToRgb(h, s / 100, l), a: fg.a ?? 1 };
    if (contrastRatio(next, bg) >= target) return { ...next, adjusted: true, steps: i };
  }
  return { ...fg, adjusted: false, steps: maxSteps, failed: true };
}

export function mix(a, b, t = 0.5) {
  const c1 = asColor(a);
  const c2 = asColor(b);
  const w = clamp01(t);
  return {
    r: round(c1.r + (c2.r - c1.r) * w),
    g: round(c1.g + (c2.g - c1.g) * w),
    b: round(c1.b + (c2.b - c1.b) * w),
    a: round((c1.a ?? 1) + ((c2.a ?? 1) - (c1.a ?? 1)) * w, 3),
  };
}

/** Perceptually-steady ramp: interpolate lightness in HSL, keep hue+sat. */
export function ramp(color, { steps = 10, from = 0.96, to = 0.14 } = {}) {
  const { h, s } = rgbToHsl(asColor(color));
  const sat = Math.max(6, Math.min(100, s));
  return Array.from({ length: steps }, (_, i) => {
    const t = steps === 1 ? 0 : i / (steps - 1);
    const l = from + (to - from) * t;
    return {
      step: i + 1,
      weight: Math.round(l * 100), // lightness of the stop, e.g. 96 → 14
      ...hslToRgb(h, sat / 100, l),
      a: 1,
    };
  }).map((c) => ({ ...c, hex: toHex(c), on: bestTextOn(c), ratio: +contrastRatio(c, { r: 255, g: 255, b: 255 }).toFixed(2) }));
}

export function harmonies(color) {
  const { h, s, l } = rgbToHsl(asColor(color));
  const at = (deg, ll = l, ss = s) => toHex({ ...hslToRgb(((deg % 360) + 360) % 360, ss / 100, ll / 100), a: 1 });
  return {
    complement: [at(h + 180)],
    analogous: [at(h - 30), at(h + 30)],
    triadic: [at(h + 120), at(h + 240)],
    tetradic: [at(h + 90), at(h + 180), at(h + 270)],
    "split-complementary": [at(h + 150), at(h + 210)],
    monochrome: [at(h, l - 24), at(h, l - 12), at(h, l + 12), at(h, l + 24)],
  };
}

export function exportSet(colors, kind = "css") {
  const list = colors.map((c) => ({ name: c.name || toHex(c).replace("#", "c"), hex: c.hex || toHex(c) }));
  switch (kind) {
    case "tailwind":
      return `module.exports = {\n  theme: {\n    extend: {\n      colors: {\n${list.map((c) => `        ${c.name}: "${c.hex}",`).join("\n")}\n      },\n    },\n  },\n};`;
    case "scss":
      return list.map((c) => `$${kebab(c.name)}: ${c.hex};`).join("\n");
    case "json":
      return JSON.stringify(Object.fromEntries(list.map((c) => [c.name, c.hex])), null, 2);
    case "js":
      return `export const palette = {\n${list.map((c) => `  ${JSON.stringify(c.name)}: ${JSON.stringify(c.hex)},`).join("\n")}\n};`;
    case "svg":
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${list.length * 64} 64">\n${list
        .map((c, i) => `  <rect x="${i * 64}" width="64" height="64" fill="${c.hex}"/>`)
        .join("\n")}\n</svg>`;
    default:
      return `:root {\n${list.map((c) => `  --${kebab(c.name)}: ${c.hex};`).join("\n")}\n}`;
  }
}
const kebab = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase().replace(/[^a-z0-9-]+/g, "-");

/* ---------------- UI ---------------- */
if (typeof document !== "undefined" && typeof window !== "undefined") boot().catch((err) => console.warn(err));

async function boot() {
  const shell = await import("../shell.js");
  const { $, $$, toast, copyText } = shell;
  shell.bootTool();

  const base = { r: 255, g: 122, b: 89, a: 1 };
  let color = base;
  let against = { r: 15, g: 16, b: 23, a: 1 };

  const sw = $("#swatch");
  const hexIn = $("#hexIn");

  function render() {
    const hex = toHex(color);
    document.documentElement.style.setProperty("--tool-dark", hex);
    document.documentElement.style.setProperty("--tool-light", hex);
    const on = bestTextOn(color);
    document.documentElement.style.setProperty("--tool-on-dark", on);
    document.documentElement.style.setProperty("--tool-on-light", on);
    sw.style.background = hex;
    sw.style.color = on;
    sw.textContent = hex;

    const formats = [
      ["hex", hex],
      ["rgb", toRgbString(color)],
      ["hsl", toHslString(color)],
      ["css var", `--brand: ${hex};`],
    ];
    $("#formats").innerHTML = formats
      .map(([k, v]) => `<button class="fmtbtn" data-copy="${shell.escapeHtml(v)}"><span class="label">${k}</span><code>${shell.escapeHtml(v)}</code></button>`)
      .join("");
    $$("#formats [data-copy]").forEach((b) => b.addEventListener("click", () => copyText(b.dataset.copy, `${b.querySelector(".label").textContent} copied.`)));

    // contrast readouts
    const ratio = contrastRatio(color, against);
    const verdict = wcag(ratio);
    const verdictLarge = wcag(ratio, { large: true });
    const verdictUi = wcag(ratio, { ui: true });
    $("#ratio").textContent = ratio.toFixed(2);
    $("#ratioBar").style.width = `${Math.min(100, (ratio / 21) * 100)}%`;
    const pills = [
      [`normal text · AA`, verdict.aa],
      [`normal text · AAA`, verdict.aaa],
      [`large text · AA`, verdictLarge.aa],
      [`UI components · 3:1`, verdictUi.aa],
    ];
    $("#verdicts").innerHTML = pills
      .map(([label, pass]) => `<span class="pill ${pass ? "is-pass" : "is-fail"}">${pass ? "✓" : "✕"} ${label}</span>`)
      .join("");
    $("#sample").innerHTML = `<p class="samp-a">Body copy on this surface at 16&nbsp;px.</p><p class="samp-b">Large heading text at 24&nbsp;px bold.</p>`;
    $("#sample").style.background = toHex(against);
    $("#sample .samp-a").style.color = hex;
    $("#sample .samp-b").style.color = hex;
    const fix = $("#fixContrast");
    if (verdict.aa) {
      fix.textContent = "Passes AA — no change needed.";
      fix.disabled = true;
    } else {
      fix.disabled = false;
      const sug = ensureContrast(color, against, 4.5);
      fix.textContent = sug.failed
        ? "No lightness of this hue clears 4.5:1 against that background."
        : `Nudge ${verdict.aaa ? "" : "to AA: "}${toHex(sug)} (${sug.steps} step${sug.steps === 1 ? "" : "s"})`;
      fix.dataset.fixed = toHex(sug);
    }

    // ramp + harmonies
    const steps = 10;
    const cols = ramp(color, { steps });
    $("#ramp").innerHTML = cols
      .map(
        (c) =>
          `<button class="rampcell" data-copy="${c.hex}" style="background:${c.hex};color:${c.on}" title="${c.hex} — ${c.ratio}:1 on white"><span class="mono">${c.weight}</span><span class="ratio">${c.ratio}</span></button>`
      )
      .join("");
    const harm = harmonies(color);
    $("#harmonies").innerHTML = Object.entries(harm)
      .map(
        ([name, list]) =>
          `<div class="harmrow"><span class="label">${name}</span><div class="harmcells">${list
            .map((hx) => `<button class="dot" data-copy="${hx}" style="background:${hx}" title="${hx}"></button>`)
            .join("")}</div></div>`
      )
      .join("");
    $$("[data-copy]").forEach((b) =>
      b.addEventListener("click", () => copyText(b.dataset.copy, `${b.dataset.copy} copied.`))
    );

    const names = [
      { name: "brand", hex },
      ...cols.map((c) => ({ name: `brand-${c.weight}`, hex: c.hex })),
      ...Object.entries(harm).flatMap(([k, v]) => v.map((hex2, i) => ({ name: `${k}-${i + 1}`, hex: hex2 }))),
    ];
    $("#exports").value = exportSet(names, $("#exportKind").value);
    $("#exportBytes").textContent = `${new Blob([$("#exports").value]).size} B`;
    void names;
  }

  function setFromInput(v) {
    const parsed = parseColor(v);
    if (!parsed.ok) {
      $("#hexErr").textContent = parsed.error;
      $("#hexErr").hidden = false;
      return;
    }
    $("#hexErr").hidden = true;
    color = { r: parsed.r, g: parsed.g, b: parsed.b, a: parsed.a };
    render();
  }

  hexIn.value = toHex(base);
  hexIn.addEventListener("input", () => setFromInput(hexIn.value));
  $("#pick").addEventListener("input", (e) => {
    hexIn.value = e.target.value;
    setFromInput(e.target.value);
  });
  $("#pickBg").addEventListener("input", (e) => {
    against = { ...hexToRgba(e.target.value), a: 1 };
    render();
  });
  $("#swapBg").addEventListener("click", () => {
    const t = against;
    against = color;
    color = t;
    hexIn.value = toHex(color);
    render();
  });
  $("#fixContrast").addEventListener("click", (e) => {
    if (e.target.dataset.fixed) {
      hexIn.value = e.target.dataset.fixed;
      setFromInput(e.target.dataset.fixed);
      toast("Applied the accessible variant.", "ok", 2200);
    }
  });
  $("#random").addEventListener("click", () => {
    const c = { r: Math.floor(Math.random() * 256), g: Math.floor(Math.random() * 256), b: Math.floor(Math.random() * 256), a: 1 };
    hexIn.value = toHex(c);
    color = c;
    render();
  });
  $("#exportKind").addEventListener("change", render);
  $("#copyExport").addEventListener("click", () => copyText($("#exports").value, "Palette exported."));

  // paste a colour from anywhere on the page
  document.addEventListener("paste", (e) => {
    const txt = (e.clipboardData || window.clipboardData).getData("text");
    if (/#?[0-9a-f]{3,8}\b/i.test(txt) && txt.length < 40) {
      hexIn.value = txt.trim();
      setFromInput(txt.trim());
      toast("Read that colour from your clipboard.", "ok", 2200);
    }
  });

  render();
}
