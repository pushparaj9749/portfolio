/* =========================================================
   Tool · Shadow & Glass
   A shadow is a *stack* of layers, and CSS lets you stack them for free —
   so that is the model here: add, mute, reorder nothing, just tune each
   layer's offset/blur/spread/alpha and read the composed value.

   Two things worth saying out loud, which the tool does instead of hiding:
   - a single big blurred black shadow looks like dirt; real depth is a wide
     low-alpha ambient layer plus a tight dark contact layer (that is why
     `elevation()` emits two);
   - `filter: drop-shadow()` and `box-shadow` are not the same trick — one
     follows a shape's alpha, the other paints a rectangle, so both are
     generated rather than left as an exercise.
   ========================================================= */

export const LAYER_KEYS = ["x", "y", "blur", "spread", "color", "alpha", "inset", "on"];

export const defaultLayer = (over = {}) => ({
  x: 0,
  y: 8,
  blur: 24,
  spread: 0,
  color: "#000000",
  alpha: 0.28,
  inset: false,
  on: true,
  ...over,
});

const num = (v, fallback = 0) => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

/** One layer → CSS text. Pixels only — a shadow in `rem` is a nice idea that
 *  nobody's devtools will round-trip for you. */
export function serializeLayer(l, { noSpread = false } = {}) {
  const layer = { ...defaultLayer(), ...l };
  const px = (n) => `${+n.toFixed(2)}px`;
  const colour = layer.alpha < 1 ? `rgb(${hexRgb(layer.color).join(" ")} / ${+layer.alpha.toFixed(3)})` : layer.color;
  // text-shadow takes x/y/blur and *nothing else* — a spread there is an invalid declaration
  const parts = [layer.inset && !noSpread ? "inset" : "", px(layer.x), px(layer.y), px(Math.max(0, layer.blur))];
  if (!noSpread) parts.push(px(layer.spread));
  parts.push(colour);
  return parts.filter(Boolean).join(" ");
}

function hexRgb(hex) {
  const h = String(hex ?? "").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6).padEnd(6, "0");
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0);
}

const NAMED_COLOURS = { black: "#000000", white: "#ffffff", transparent: "#000000", currentcolor: "#000000", red: "#ff0000", green: "#008000", blue: "#0000ff", grey: "#808080", gray: "#808080", dimgray: "#696969" };

/**
 * Any CSS colour we meet in a pasted shadow → { hex, alpha }.
 * Normalising on the way in is what makes the editor's "on" / "inset" /
 * slider round-trip work: a layer written as rgba(0,0,0,.28) and one written as
 * #00000047 must not become two different things in the list.
 */
export function colourToHexAlpha(input) {
  const text = String(input ?? "").trim().toLowerCase();
  if (!text) return { hex: "#000000", alpha: 1 };
  if (text[0] === "#") {
    const h = text.slice(1);
    if (/^[0-9a-f]{3}$/.test(h)) return { hex: "#" + h.split("").map((c) => c + c).join(""), alpha: 1 };
    if (/^[0-9a-f]{6}$/.test(h)) return { hex: "#" + h, alpha: 1 };
    if (/^[0-9a-f]{8}$/.test(h)) return { hex: "#" + h.slice(0, 6), alpha: +(parseInt(h.slice(6, 8), 16) / 255).toFixed(3) };
    return { hex: "#000000", alpha: 1 };
  }
  const fn = /^(rgba?)\(([^)]*)\)$/.exec(text);
  if (fn) {
    const body = fn[2];
    let alpha = 1;
    const slash = /\/\s*([\d.]+)\s*%?\s*$/.exec(body);
    let numsText = body;
    if (slash) {
      alpha = Number(slash[1]) / (slash[0].includes("%") ? 100 : 1);
      numsText = body.slice(0, slash.index);
    }
    const parts = numsText.split(/[\s,]+/).filter(Boolean).map(Number);
    if (parts.length >= 4 && parts.slice(0, 3).every(Number.isFinite)) {
      alpha = parts[3] / (String(body.split(",")[3]?.trim() || "").endsWith("%") ? 100 : 1);
      return { hex: rgbHex(parts.slice(0, 3)), alpha: Math.max(0, Math.min(1, alpha)) };
    }
    const rgb = parts.slice(0, 3);
    if (rgb.every(Number.isFinite)) return { hex: rgbHex(rgb), alpha: Math.max(0, Math.min(1, alpha)) };
  }
  if (NAMED_COLOURS[text]) return { hex: NAMED_COLOURS[text], alpha: text === "transparent" ? 0 : 1 };
  return { hex: "#000000", alpha: 1 };
}

const rgbHex = (rgb) => "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v)))).map((v) => v.toString(16).padStart(2, "0")).join("");

export function buildBoxShadow(layers, { onlyVisible = true } = {}) {
  const list = (layers || []).filter((l) => (onlyVisible ? l.on !== false : true));
  if (!list.length) return { css: "none", count: 0 };
  return { css: list.map(serializeLayer).join(", "), count: list.length };
}

export const buildTextShadow = (layers) => {
  const list = (layers || []).filter((l) => l.on !== false && !l.inset);
  return list.length ? list.map((l) => serializeLayer(l, { noSpread: true })).join(", ") : "none";
};

/** drop-shadow() takes one layer and no spread — so the stack has to be
 *  *merged* rather than pasted, or the CSS is simply invalid. */
export function buildDropFilter(layers) {
  const list = (layers || []).filter((l) => l.on !== false && !l.inset);
  if (!list.length) return { css: "none" };
  const merge = list.reduce((acc, l) => {
    const w = Math.max(0.0001, l.alpha);
    return {
      x: (acc.x * acc.w + l.x * w) / (acc.w + w),
      y: (acc.y * acc.w + l.y * w) / (acc.w + w),
      blur: (acc.blur * acc.w + Math.max(0, l.blur) * w) / (acc.w + w),
      alpha: Math.min(1, acc.alpha + l.alpha * (1 - acc.alpha)),
      color: acc.color || l.color,
      w: acc.w + w,
    };
  }, { x: 0, y: 0, blur: 0, alpha: 0, color: list[0].color, w: 0 });
  const css = `drop-shadow(${merge.x.toFixed(1)}px ${merge.y.toFixed(1)}px ${Math.max(0, merge.blur).toFixed(1)}px rgb(${hexRgb(merge.color).join(" ")} / ${merge.alpha.toFixed(3)}))`;
  return { css, merged: list.length };
}

/**
 * Read a CSS shadow list back into layers. Tolerant by necessity: people paste
 * what devtools copied, with or without spread, with `rgba()` or modern `rgb() / a`.
 */
export function parseShadow(css) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of String(css ?? "")) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  const layers = [];
  for (const raw of parts) {
    const text = raw.trim();
    if (!text || text === "none") continue;
    const inset = /\binset\b/i.test(text);
    const body = text.replace(/\binset\b/i, "").trim();
    const colourMatch = /(#[0-9a-f]{3,8}|(?:rgba?|hsla?)\([^)]*\)|\b[a-z]+\b)\s*$/i.exec(body);
    let colour = "";
    let geometry = body;
    if (colourMatch) {
      colour = colourMatch[1];
      geometry = body.slice(0, colourMatch.index).trim();
    }
    const nums = [];
    for (const tok of geometry.split(/\s+/)) {
      const n = num(tok, null);
      if (n !== null) nums.push(n);
    }
    if (!nums.length) continue; // "inherit", a stray comment — not a layer
    while (nums.length < 4) nums.push(0);
    const c = colourToHexAlpha(colour);
    layers.push(defaultLayer({ x: nums[0], y: nums[1], blur: Math.max(0, nums[2]), spread: nums[3] || 0, color: c.hex, alpha: colour ? c.alpha : 0.28, inset }));
  }
  return { layers, count: layers.length, unparsed: layers.length === 0 && String(css ?? "").trim().length > 0 };
}

/**
 * Material-ish elevation: a broad, weak ambient layer plus a tight contact
 * shadow, both growing with n. One layer per step would be wrong at n=0.
 */
export function elevation(n, { color = "#000000", strength = 1 } = {}) {
  const level = Math.max(0, Math.min(24, num(n, 0)));
  if (level === 0) return [defaultLayer({ x: 0, y: 0, blur: 0, spread: 0, alpha: 0, color, on: false })];
  const ambient = 0.1 + level * 0.008;
  const contact = 0.16 + level * 0.012;
  return [
    defaultLayer({ x: 0, y: Math.round(1 + level * 0.6), blur: Math.round(2 + level * 1.1), spread: 0, alpha: Math.min(0.6, contact * strength), color }),
    defaultLayer({ x: 0, y: Math.round(2 + level * 1.7), blur: Math.round(8 + level * 4.4), spread: -Math.round(level * 0.4), alpha: Math.min(0.5, ambient * strength), color }),
    ...(level > 12 ? [defaultLayer({ x: 0, y: Math.round(6 + level * 2.6), blur: Math.round(26 + level * 7.5), spread: -Math.round(level * 0.8), alpha: Math.min(0.4, ambient * 0.7 * strength), color })] : []),
  ];
}

export const PRESETS = [
  {
    name: "Soft lift",
    note: "the card hover most sites ship",
    layers: [defaultLayer({ y: 2, blur: 6, alpha: 0.16 }), defaultLayer({ y: 12, blur: 28, spread: -6, alpha: 0.22 })],
  },
  {
    name: "Brutal",
    note: "hard offset, no blur — reads as a print shadow",
    layers: [defaultLayer({ x: 8, y: 8, blur: 0, spread: 0, alpha: 1, color: "#101619" })],
  },
  {
    name: "Carved in",
    note: "inset light above, inset dark below",
    layers: [
      defaultLayer({ y: 3, blur: 7, spread: 0, alpha: 0.35, inset: true }),
      defaultLayer({ y: -2, blur: 5, alpha: 0.5, color: "#ffffff", inset: true }),
    ],
  },
  {
    name: "Neon",
    note: "same hue three times, wider each pass",
    layers: [
      defaultLayer({ x: 0, y: 0, blur: 6, alpha: 0.9, color: "#3fd9bf" }),
      defaultLayer({ x: 0, y: 0, blur: 22, alpha: 0.55, color: "#3fd9bf" }),
      defaultLayer({ x: 0, y: 0, blur: 64, alpha: 0.3, color: "#3fd9bf" }),
    ],
  },
  {
    name: "Long",
    note: "64px of fade for hero panels",
    layers: [defaultLayer({ y: 4, blur: 8, alpha: 0.1 }), defaultLayer({ y: 18, blur: 32, alpha: 0.12 }), defaultLayer({ y: 48, blur: 80, alpha: 0.16 })],
  },
  {
    name: "Dirty",
    note: "what one big soft black shadow actually looks like",
    layers: [defaultLayer({ y: 20, blur: 60, alpha: 0.55 })],
  },
];

/** Frosted glass, honestly: blur without a border and a top highlight just
 *  looks like a smudge, so the recipe ships all four parts. */
export function glass({ blur = 14, saturate = 1.2, tint = "#ffffff", alpha = 0.14, borderAlpha = 0.22, highlightAlpha = 0.3, radius = 16 } = {}) {
  const t = tint.startsWith("#") ? tint : "#ffffff";
  const [tr, tg, tb] = hexRgb(t);
  const backdrop = `blur(${num(blur, 14)}px) saturate(${num(saturate, 1).toFixed(2)})`;
  const background = `rgb(${tr} ${tg} ${tb} / ${num(alpha, 0.14).toFixed(3)})`;
  const border = `1px solid rgb(${tr} ${tg} ${tb} / ${num(borderAlpha, 0.2).toFixed(3)})`;
  const boxShadow = `inset 0 1px 0 rgb(255 255 255 / ${num(highlightAlpha, 0.3).toFixed(3)})`;
  return {
    backdrop,
    background,
    border,
    boxShadow,
    radius: num(radius, 16),
    css: [
      `backdrop-filter: ${backdrop};`,
      `-webkit-backdrop-filter: ${backdrop};`,
      `background: ${background};`,
      `border: ${border};`,
      `box-shadow: ${boxShadow};`,
      `border-radius: ${num(radius, 16)}px;`,
    ].join("\n"),
  };
}

/** A rough "how much ink is this adding" measure, so the page can warn about
 *  a shadow stack that will turn muddy on a light background. */
export function inkWeight(layers) {
  const list = (layers || []).filter((l) => l.on !== false && !l.inset);
  if (!list.length) return { weight: 0, verdict: "nothing", advice: "Add a layer to begin." };
  const total = list.reduce((sum, l) => sum + num(l.alpha, 0) * (0.5 + Math.min(1, Math.max(0, l.blur) / 48)), 0);
  const weight = +Math.min(1.6, total).toFixed(2);
  if (weight > 0.7) return { weight, verdict: "heavy", advice: "This much ink reads as a grey halo, not depth. Halve the widest layer's alpha and keep one tight contact layer." };
  if (weight > 0.42) return { weight, verdict: "solid", advice: "Good for a raised panel; too much for an inline card." };
  return { weight, verdict: "subtle", advice: "Reads as depth only next to a flat surface — pair it with a 1px border if the page is busy." };
}

export const scaleLayers = (layers, factor) => {
  const f = num(factor, 1);
  return (layers || []).map((l) => ({ ...l, x: +(l.x * f).toFixed(2), y: +(l.y * f).toFixed(2), blur: +(Math.max(0, l.blur) * f).toFixed(2), spread: +(l.spread * f).toFixed(2) }));
};

/** The two-state block people actually paste: rest, hover, transition. */
export function hoverBlock(rest, lifted, { ms = 180, ease = "cubic-bezier(.2,.8,.2,1)" } = {}) {
  const a = buildBoxShadow(rest);
  const b = buildBoxShadow(lifted);
  return [
    `.card {`,
    `  box-shadow: ${a.css};`,
    `  transition: box-shadow ${num(ms, 180)}ms ${ease}, transform ${num(ms, 180)}ms ${ease};`,
    `}`,
    `.card:hover {`,
    `  box-shadow: ${b.css};`,
    `  transform: translateY(-1px);`,
    `}`,
  ].join("\n");
}

export function exportBlock(layers, { name = "shadow", format = "css", glass: g = null } = {}) {
  const built = buildBoxShadow(layers);
  if (format === "raw" || format === "css-value") return built.css;
  if (format === "json") return JSON.stringify({ name, layers: (layers || []).filter((l) => l.on !== false) }, null, 2);
  if (format === "tailwind") return `shadow-[${built.css.replace(/\s+/g, "_")}]`;
  if (format === "scss") return `$${name}: ${built.css};\nbox-shadow: $${name};${g ? `\n${g.css.split("\n").map((l) => `/* ${l} */`).join("\n")}` : ""}`;
  return [`--${name}: ${built.css};`, `box-shadow: var(--${name});`, g ? g.css : "", "--shadow-glass: " + (g ? g.backdrop : "n/a")].filter(Boolean).join("\n");
}

/* ---------------- UI ---------------- */
if (typeof document !== "undefined" && typeof window !== "undefined") boot().catch((err) => console.warn(err));

async function boot() {
  const shell = await import("../shell.js");
  const { $, $$, toast, copyText, escapeHtml } = shell;
  shell.bootTool();

  let layers = PRESETS[0].layers.map((l) => ({ ...l }));
  let glassState = { blur: 14, saturate: 1.2, tint: "#ffffff", alpha: 0.14, borderAlpha: 0.22, highlightAlpha: 0.3, radius: 16 };
  let useGlass = false;
  let format = "css";

  const SLIDERS = [
    ["x", "x offset", -60, 60],
    ["y", "y offset", -60, 60],
    ["blur", "blur", 0, 120],
    ["spread", "spread", -40, 40],
    ["alpha", "alpha", 0, 1],
  ];

  function renderLayers() {
    $("#layers").innerHTML = layers
      .map((l, i) => {
        const sw = escapeHtml(l.color);
        return `<div class="layer${l.on ? "" : " is-off"}" data-i="${i}">
          <div class="layer-head">
            <span class="layer-swatches" style="background:${sw}"></span>
            <b class="grow">${l.inset ? "inset" : "outer"} · ${l.blur}px</b>
            <label class="mini"><input type="checkbox" data-act="on" ${l.on ? "checked" : ""}> on</label>
            <label class="mini"><input type="checkbox" data-act="inset" ${l.inset ? "checked" : ""}> inset</label>
            <button class="tbtn" type="button" data-act="del">remove</button>
          </div>
          <div class="layer-sliders">
            ${SLIDERS.map(
              ([key, label, min, max]) =>
                `<label>${label}<input type="range" data-key="${key}" min="${min}" max="${max}" step="${key === "alpha" ? "0.01" : "1"}" value="${l[key]}"><span class="mono">${l[key]}</span></label>`
            ).join("")}
            <label>colour<input type="color" data-key="color" value="${sw}" style="height:30px;padding:2px"></label>
          </div>
        </div>`;
      })
      .join("");
    $$("#layers .layer").forEach((row) => {
      const i = Number(row.dataset.i);
      row.querySelectorAll("input[type=range]").forEach((inp) =>
        inp.addEventListener("input", () => {
          layers[i][inp.dataset.key] = Number(inp.value);
          inp.closest("label").querySelector("span").textContent = inp.value;
          renderAll();
        })
      );
      row.querySelectorAll("input[type=checkbox]").forEach((inp) =>
        inp.addEventListener("change", () => {
          layers[i][inp.dataset.act] = inp.checked;
          renderAll();
        })
      );
      const col = row.querySelector('input[type="color"]');
      if (col)
        col.addEventListener("input", () => {
          layers[i].color = col.value;
          renderAll();
        });
      row.querySelector('[data-act="del"]').addEventListener("click", () => {
        layers.splice(i, 1);
        renderAll();
      });
    });
  }

  function renderAll() {
    const built = buildBoxShadow(layers);
    const text = buildTextShadow(layers);
    const drop = buildDropFilter(layers);
    const g = glass(glassState);
    const stage = $("#shadowPreview");
    const card = $("#demoCard");
    card.style.boxShadow = built.css;
    card.style.borderRadius = `${g.radius}px`;
    card.style.background = useGlass ? g.background : "var(--panel)";
    card.style.backdropFilter = useGlass ? g.backdrop : "";
    card.style.webkitBackdropFilter = useGlass ? g.backdrop : "";
    card.style.border = useGlass ? g.border : "1px solid var(--line)";
    $("#demoWord").style.textShadow = text === "none" ? "none" : text;
    $("#demoSvg").style.filter = drop.css === "none" ? "" : drop.css;
    const weight = inkWeight(layers);
    $("#inkWeight").innerHTML =
      `<span class="pill ${weight.verdict === "heavy" ? "is-fail" : weight.verdict === "subtle" ? "is-neutral" : "is-pass"}">${weight.verdict}</span>` +
      ` <span class="mini">${escapeHtml(weight.advice)}</span>`;
    const note = `/* ${built.count} layer${built.count === 1 ? "" : "s"} — order matters: the first is painted on top */`;
    const block = [
      note,
      `box-shadow: ${built.css};`,
      text !== "none" ? `text-shadow: ${text};` : "",
      drop.css !== "none" ? `filter: ${drop.css}; /* drop-shadow merges ${drop.merged} layer(s): no spread, one shape */` : "",
      useGlass ? g.css : "",
    ]
      .filter(Boolean)
      .join("\n");
    $("#shadowOut").value =
      format === "css" ? block : exportBlock(layers, { name: $("#sname").value || "shadow", format, glass: useGlass ? g : null });
    $("#shadowIn").value = built.css;
    $("#elevRead").textContent = `dp ${$("#elevRow").value} · ink ${$("#elevStrength").value}%`;
  }

  $("#addLayer").addEventListener("click", () => {
    layers.push(defaultLayer({ y: 2, blur: 6, alpha: 0.16 }));
    renderLayers();
    renderAll();
  });
  $("#flatten").addEventListener("click", () => {
    layers = layers.filter((l) => l.on !== false);
    if (!layers.length) layers = [defaultLayer()];
    renderLayers();
    renderAll();
  });
  $$("#presets .tbtn").forEach((b) =>
    b.addEventListener("click", () => {
      const p = PRESETS.find((x) => x.name === b.dataset.preset);
      if (!p) return;
      $$("#presets .tbtn").forEach((x) => x.classList.toggle("is-on", x === b));
      layers = p.layers.map((l) => ({ ...l }));
      renderLayers();
      renderAll();
      toast(p.note, "ok", 3200);
    })
  );
  const applyElevation = () => {
    layers = elevation(Number($("#elevRow").value), {
      color: $("#elevColor").value,
      strength: Number($("#elevStrength").value) / 100,
    });
    renderLayers();
    renderAll();
  };
  ["#elevRow", "#elevColor", "#elevStrength"].forEach((sel) => $("#" + sel.slice(1)).addEventListener("input", applyElevation));
  $("#glassToggle").addEventListener("change", (e) => {
    useGlass = e.target.checked;
    renderAll();
  });
  // the DOM deals in whole numbers on a slider; CSS wants fractions, so the scale
  // lives here rather than in twelve markup attributes
  const GLASS_SLIDERS = { gBlur: ["blur", 1], gAlpha: ["alpha", 0.01], gSat: ["saturate", 0.01], gBorder: ["borderAlpha", 0.01], gRadius: ["radius", 1] };
  Object.entries(GLASS_SLIDERS).forEach(([id, [key, scale]]) =>
    $("#" + id).addEventListener("input", (e) => {
      glassState[key] = Number(e.target.value) * scale;
      renderAll();
    })
  );
  $("#gTint").addEventListener("input", (e) => {
    glassState.tint = e.target.value;
    renderAll();
  });
  $("#importShadow").addEventListener("click", () => {
    const r = parseShadow($("#shadowIn").value);
    if (r.unparsed || !r.layers.length) return toast("Nothing readable in that value.", "err");
    layers = r.layers;
    renderLayers();
    renderAll();
    toast(`Read ${r.count} layer${r.count === 1 ? "" : "s"} from your CSS.`, "ok");
  });
  $("#copyOut").addEventListener("click", () => copyText($("#shadowOut").value, "Copied."));
  $("#copyHover").addEventListener("click", () => {
    const lifted = scaleLayers(layers.filter((l) => l.on !== false), 1.9).map((l) => ({ ...l, alpha: Math.min(0.42, l.alpha * 0.8) }));
    copyText(hoverBlock(layers, lifted), "Copied a rest + hover pair.");
  });
  $("#format").addEventListener("change", (e) => {
    format = e.target.value;
    renderAll();
  });
  $("#sname").addEventListener("input", renderAll);

  renderLayers();
  renderAll();
}
