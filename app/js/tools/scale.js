/* =========================================================
   Tool · Type & Space
   Scales are arithmetic, so the arithmetic here is exact and tested:
   a modular scale is a power, a fluid size is a line, and a fluid size
   that does not reach its own endpoints is a bug wearing a clamp().

   The claim most generators get away with — "clamp(1rem, 0.6rem + 1.2vw, 2rem)"
   typed from a felt idea — is checked here: the page recomputes the value at
   both viewport ends and tells you when they do not meet.
   ========================================================= */

export const RATIOS = [
  { name: "minor second", value: 1.067 },
  { name: "major second", value: 1.125 },
  { name: "minor third", value: 1.2 },
  { name: "major third", value: 1.25 },
  { name: "perfect fourth", value: 1.333 },
  { name: "augmented fourth", value: 1.414 },
  { name: "perfect fifth", value: 1.5 },
  { name: "golden ratio", value: 1.618 },
];

/** Type steps are named around step 0 = the body size, which is the only reason a
 *  scale has negative steps at all. Spacing has no centre, so it gets its own list. */
export const TYPE_NAMES = ["2xs", "xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl"];
export const SPACE_NAMES = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "8xl", "9xl", "10xl", "11xl", "12xl"];
export const STEP_NAMES = TYPE_NAMES; // kept: older callers and the page reference this name

const num = (v, fallback = 0) => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
};

export const round = (n, places = 4) => {
  const p = 10 ** places;
  return Math.round(n * p) / p;
};

export const pxToRem = (px, root = 16) => round(num(px, root) / num(root, 16), 4);
export const remToPx = (rem, root = 16) => round(num(rem, 0) * num(root, 16), 4);

/**
 * `base` raised to each integer step in range. Step 0 is the body size, which is
 * what makes negative steps (small text, captions) first-class instead of an
 * afterthought — a scale with no below is not a scale, it's a list of headings.
 */
export function modularScale({ base = 16, ratio = 1.25, from = -2, to = 6, root = 16, snap = 0 } = {}) {
  const r = num(ratio, 1);
  const b = num(base, 16);
  if (r <= 1) return { error: "A ratio of 1 or less is a flat line, not a scale." };
  const lo = Math.min(num(from, 0), num(to, 0));
  const hi = Math.max(num(from, 0), num(to, 0));
  const out = [];
  for (let step = lo; step <= hi; step++) {
    const raw = b * r ** step;
    const px = snap > 0 ? Math.max(snap, Math.round(raw / snap) * snap) : round(raw, 2);
    out.push({
      step,
      name: TYPE_NAMES[step + 3] || `step${step > 0 ? "+" : ""}${step}`,
      px,
      rem: pxToRem(px, root),
      exact: round(raw, 3),
      offBy: snap > 0 ? round(px - raw, 3) : 0,
    });
  }
  return { sizes: out, ratio: r, base: b, root: num(root, 16) };
}

/**
 * The fluid line: preferred = intercept + slope·100vw, solved so the line passes
 * through (minVw, minSize) and (maxVw, maxSize).
 * Returns the clamp() string plus what it evaluates to at the ends — `atMin` and
 * `atMax` are the numbers that prove the fit, so a bad rounding is visible.
 */
export function fluidSize({ minSize = 16, maxSize = 24, minVw = 360, maxVw = 1200, root = 16, precision = 3 } = {}) {
  const a = num(minSize, 16);
  const b = num(maxSize, 24);
  const v1 = num(minVw, 360);
  const v2 = num(maxVw, 1200);
  if (v2 <= v1) return { error: "The large viewport must be wider than the small one." };
  const slope = (b - a) / (v2 - v1); // px per px of viewport
  const interceptPx = a - slope * v1;
  const vw = round(slope * 100, precision);
  const rem = round(interceptPx / root, precision);
  // clamp() needs its bounds sorted even when the type *shrinks* on big screens,
  // which is a real trick for display type — so the line is solved in one
  // direction and the bounds in the other
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const at = (w) => round(clampEval(lo, rem, vw, hi, w, root), 2);
  const min = lo;
  const max = hi;
  return {
    min: round(lo, 2),
    max: round(hi, 2),
    from: round(a, 2),
    to: round(b, 2),
    shrinks: b < a,
    minRem: round(lo / root, precision),
    maxRem: round(hi / root, precision),
    vw,
    rem,
    slope: round(slope, 5),
    css: `clamp(${round(lo / root, precision)}rem, ${rem}rem + ${vw}vw, ${round(hi / root, precision)}rem)`,
    fallback: round(a, 2),
    atSmall: at(v1),
    atLarge: at(v2),
    at375: at(375),
    at768: at(768),
    at1440: at(1440),
    // a size that reaches the ends is the whole point of solving for a line
    fits: Math.abs(at(v1) - a) <= 0.51 && Math.abs(at(v2) - b) <= 0.51,
    spans: round(at(v2) - at(v1), 2),
  };
}

function clampEval(minPx, interceptRem, vw, maxPx, viewportPx, root) {
  const preferred = interceptRem * root + (vw * viewportPx) / 100;
  return Math.min(maxPx, Math.max(minPx, preferred));
}

/** How many characters fit on a line — the crude but useful 0.5em average. */
export function charsPerLine(containerPx, fontSizePx, { avg = 0.5 } = {}) {
  const c = num(containerPx, 0);
  const f = num(fontSizePx, 16);
  if (c <= 0 || f <= 0) return { cpl: 0, ideal: false };
  const cpl = Math.round(c / (f * avg));
  return { cpl, ideal: cpl >= 45 && cpl <= 75, narrow: cpl < 45, wide: cpl > 75 };
}

/** Measure in `ch` is the only container width that survives a font swap. */
export const measureFor = (cpl = 66) => `${Math.max(20, Math.round(num(cpl, 66)))}ch`;

/**
 * Leading: bigger type needs less of it, long lines need more. Both halves of
 * that are load-bearing, so the function is monotone in size and in line length.
 */
export function suggestedLineHeight(fontSizePx, cpl = 66) {
  const f = Math.max(8, num(fontSizePx, 16));
  const bySize = 1.65 - 0.42 * Math.log2(f / 16); // 16px → 1.65, 32px → 1.23, 64px → 0.81
  const byLength = (Math.max(20, Math.min(120, num(cpl, 66))) - 66) / 260; // ±0.18 across the useful range
  return round(Math.min(2.05, Math.max(1.02, bySize + byLength)), 2);
}

/**
 * Space scales: a type scale multiplies, spacing usually *steps*. Both are offered
 * because "8pt grid" and "fibonacci spacing" are different jobs — the first is a
 * constraint you want enforced, the second is a feeling you want when blocks meet.
 */
export function spaceScale({ unit = 8, steps = 8, mode = "multiply", ratio = 1.5, root = 16 } = {}) {
  const u = Math.max(1, num(unit, 8));
  const n = Math.max(1, Math.min(16, Math.round(num(steps, 8))));
  const out = [];
  if (mode === "fibonacci") {
    let a = u / 2;
    let b = u;
    for (let i = 0; i < n; i++) {
      const value = i < 2 ? u * (i + 1) : b;
      out.push({ name: SPACE_NAMES[i] || `s${i}`, px: round(value, 2), rem: pxToRem(value, root) });
      [a, b] = [b, a + b];
    }
  } else if (mode === "binary") {
    for (let i = 0; i < n; i++) {
      const value = u * 2 ** (i - 1);
      out.push({ name: SPACE_NAMES[i] || `s${i}`, px: round(value, 2), rem: pxToRem(value, root) });
    }
  } else {
    const r = Math.max(1.05, num(ratio, 1.5));
    for (let i = 0; i < n; i++) {
      const value = u * r ** i;
      out.push({ name: SPACE_NAMES[i] || `s${i}`, px: round(value, 2), rem: pxToRem(value, root) });
    }
  }
  return { spaces: out, unit: u, mode, steps: n };
}

/** Vertical rhythm: which type sizes land on the spacing grid, and by how much they miss. */
export function rhythmCheck(sizes, base = 8, lineFactor = 1) {
  const b = Math.max(1, num(base, 8));
  const rows = (Array.isArray(sizes) ? sizes : []).map((s) => {
    const px = num(s.px ?? s, 0);
    const nearest = Math.max(b, Math.round(px / b) * b);
    return { name: s.name || String(px), px, nearest, offBy: round(px - nearest, 3), onGrid: Math.abs(px - nearest) < 0.01, line: round(nearest * lineFactor, 2) };
  });
  const off = rows.filter((r) => !r.onGrid);
  return { rows, offGrid: off.length, onGrid: rows.length - off.length, base: b, worst: off.sort((x, y) => Math.abs(y.offBy) - Math.abs(x.offBy))[0] || null };
}

export const snapToGrid = (px, grid = 4) => Math.max(num(grid, 4), Math.round(num(px, 0) / num(grid, 4)) * num(grid, 4));

/**
 * Exports. The Tailwind shape is `theme.extend.fontSize` / `.spacing`, which is
 * what a real config file wants — not a flat list of sizes.
 */
export function exportTokens({ sizes = [], spaces = [], name = "scale", format = "css", root = 16 } = {}) {
  const typeLines = sizes.map((s) => `  --${name}-${s.name}: ${s.rem}rem; /* ${s.px}px */`);
  const spaceLines = spaces.map((s) => `  --space-${s.name}: ${s.rem}rem; /* ${s.px}px */`);
  if (format === "json") {
    return JSON.stringify(
      {
        fontSize: Object.fromEntries(sizes.map((s) => [s.name, `${s.rem}rem`])),
        spacing: Object.fromEntries(spaces.map((s) => [s.name, `${s.rem}rem`])),
      },
      null,
      2
    );
  }
  if (format === "tailwind") {
    // fontSize takes the [size, { lineHeight }] pair — the shape that actually
    // sets leading in a Tailwind project; a bare string leaves line-height alone
    const type = sizes
      .map((x) => `      ${JSON.stringify(x.name)}: ["${x.rem}rem", { lineHeight: "${suggestedLineHeight(x.px).toFixed(2)}" }],`)
      .join("\n");
    const gap = spaces.map((x) => `      ${JSON.stringify(x.name)}: "${x.rem}rem",`).join("\n");
    return `module.exports = {\n  theme: {\n    extend: {\n      fontSize: {\n${type}\n      },\n      spacing: {\n${gap}\n      },\n    },\n  },\n};`;
  }
  if (format === "scss") return [...typeLines, ...spaceLines].map((l) => l.trim().replace(/^--/, "$").replace("rem;", "rem;")).join("\n");
  return [`:root {`, ...typeLines, ...(spaceLines.length ? ["", ...spaceLines] : []), `}`].join("\n");
}

/** The base size every `rem` here is spoken in — worth stating, since browsers lie. */
export const userRootSize = () => {
  if (typeof document === "undefined") return 16;
  const probe = document.createElement("span");
  probe.style.cssText = "position:absolute;width:1rem;height:0;visibility:hidden";
  document.body.appendChild(probe);
  const px = probe.getBoundingClientRect().width || 16;
  probe.remove();
  return round(px, 2);
};

/* ---------------- UI ---------------- */
if (typeof document !== "undefined" && typeof window !== "undefined") boot().catch((err) => console.warn(err));

async function boot() {
  const shell = await import("../shell.js");
  const { $, $$, toast, copyText, debounce, escapeHtml } = shell;
  shell.bootTool();

  const root = userRootSize();
  $("#rootNote").textContent = `Your browser renders 1rem as ${root}px — every value below is written in rem, so it will follow a reader who sets 20px.`;

  const state = { base: 18, ratio: 1.25, from: -2, to: 6, snap: 0, spaceUnit: 8, spaceMode: "multiply", spaceSteps: 8 };

  function renderScale() {
    const scale = modularScale({ base: state.base, ratio: state.ratio, from: state.from, to: state.to, root, snap: state.snap });
    if (scale.error) {
      $("#specimen").innerHTML = `<p class="out is-error">${escapeHtml(scale.error)}</p>`;
      $("#rhythm").innerHTML = "";
      return;
    }
    const container = $("#specimen").clientWidth || 640;
    $("#specimen").innerHTML = scale.sizes
      .map((s) => {
        const cpl = charsPerLine(container, s.px).cpl;
        const lh = suggestedLineHeight(s.px, cpl);
        const snapped = state.snap && s.offBy ? ` <i class="mini">${s.offBy > 0 ? "+" : ""}${s.offBy}px</i>` : "";
        return `<div class="spec-row" data-px="${s.px}">
          <span class="spec-name">${escapeHtml(s.name)}${snapped}</span>
          <span style="font-size:${s.rem}rem;line-height:${lh}">Grumpy wizards make</span>
          <button class="spec-size copyable" type="button" data-copy="${s.rem}rem" title="${cpl} characters on this line">⧉ ${s.px}px · lh ${lh}</button>
        </div>`;
      })
      .join("");
    $$("#specimen .copyable").forEach((b) => b.addEventListener("click", () => copyText(b.dataset.copy, "Copied " + b.dataset.copy + ".")));
    const audit = rhythmCheck(scale.sizes, state.spaceUnit);
    $("#rhythm").innerHTML =
      `<span class="pill ${audit.offGrid === 0 ? "is-pass" : "is-warn"}">${audit.onGrid}/${audit.rows.length} on the ${state.spaceUnit}px grid</span>` +
      (audit.worst
        ? ` <span class="mini">furthest off: ${escapeHtml(audit.worst.name)} by ${audit.worst.offBy > 0 ? "+" : ""}${audit.worst.offBy}px — either snap it or accept that headings do not have to land on the baseline grid</span>`
        : "");
    lastScale = scale;
    renderExport();
  }
  let lastScale = null;

  function renderFluid() {
    const f = fluidSize({
      minSize: Number($("#fMin").value),
      maxSize: Number($("#fMax").value),
      minVw: Number($("#fMinVw").value),
      maxVw: Number($("#fMaxVw").value),
      root,
    });
    if (f.error) {
      $("#fluidOut").value = "";
      $("#fluidChecks").innerHTML = `<span class="pill is-fail">${escapeHtml(f.error)}</span>`;
      $("#fluidBars").innerHTML = "";
      return;
    }
    $("#fluidOut").value = `font-size: ${f.css};\n/* fallback for engines without clamp(): */\nfont-size: ${f.fallback / root}rem;`;
    $("#fluidChecks").innerHTML =
      `<span class="pill ${f.fits ? "is-pass" : "is-fail"}">${f.fits ? "reaches both ends" : "does not reach its ends"}</span>` +
      `<span class="mini">slope ${f.vw}vw per 100vw · grows ${f.spans}px · ${f.rem}rem + ${f.vw}vw</span>`;
    const vMin = Number($("#fMinVw").value);
    const vMax = Number($("#fMaxVw").value);
    const bars = [
      [`${vMin}px`, f.atSmall],
      ["375px", f.at375],
      ["768px", f.at768],
      ["1440px", f.at1440],
      [`${vMax}px`, f.atLarge],
    ];
    const top = Math.max(...bars.map((b) => b[1]), 1);
    $("#fluidBars").innerHTML = bars
      .map(([w, px]) => `<div class="fluid-bar"><span>${w}px</span><i style="width:${((px / top) * 100).toFixed(1)}%"></i><span>${px}px</span></div>`)
      .join("");
    renderExport();
  }

  function renderSpace() {
    const sp = spaceScale({ unit: state.spaceUnit, steps: state.spaceSteps, mode: state.spaceMode, root });
    $("#spaceStrip").innerHTML = sp.spaces
      .map(
        (s) =>
          `<button class="spacecell copyable" type="button" data-copy="${s.rem}rem" title="copy ${s.rem}rem"><i style="width:${s.px}px;height:${s.px}px"></i>${s.name}<span>${s.px}</span></button>`
      )
      .join("");
    $$("#spaceStrip .copyable").forEach((b) => b.addEventListener("click", () => copyText(b.dataset.copy, "Copied " + b.dataset.copy + ".")));
    lastSpace = sp;
    renderExport();
  }
  let lastSpace = null;

  function renderExport() {
    $("#scaleOut").value = exportTokens({
      sizes: lastScale?.sizes || [],
      spaces: lastSpace?.spaces || [],
      name: $("#tname").value || "text",
      format: $("#format").value,
      root,
    });
  }

  // one debounced wrapper, reused — calling debounce(fn)() per keystroke would
  // build a fresh timer every event and never actually coalesce anything
  const renderScaleSoon = debounce(renderScale, 90);
  $("#base").addEventListener("input", (e) => {
    state.base = num(e.target.value, 16);
    renderScaleSoon();
  });
  $$("#ratios .tbtn").forEach((b) =>
    b.addEventListener("click", () => {
      $$("#ratios .tbtn").forEach((x) => x.classList.toggle("is-on", x === b));
      state.ratio = Number(b.dataset.ratio);
      $("#ratioNum").value = state.ratio;
      renderScale();
    })
  );
  $("#ratioNum").addEventListener("input", debounce((e) => {
    state.ratio = num(e.target.value, 1.25);
    $$("#ratios .tbtn").forEach((x) => x.classList.toggle("is-on", Number(x.dataset.ratio) === state.ratio));
    renderScale();
  }, 120));
  $("#spread").addEventListener("input", (e) => {
    state.to = Number(e.target.value);
    state.from = -Math.max(1, Math.round(Number(e.target.value) / 3));
    renderScale();
  });
  $("#snapRow").addEventListener("change", (e) => {
    state.snap = e.target.checked ? 4 : 0;
    renderScale();
  });
  [["spUnit", "spaceUnit"], ["spSteps", "spaceSteps"]].forEach(([id, key]) =>
    $("#" + id).addEventListener("input", (e) => {
      state[key] = Number(e.target.value);
      renderScale();
      renderSpace();
    })
  );
  $$("#spaceModes .tbtn").forEach((b) =>
    b.addEventListener("click", () => {
      $$("#spaceModes .tbtn").forEach((x) => x.classList.toggle("is-on", x === b));
      state.spaceMode = b.dataset.mode;
      renderSpace();
    })
  );
  ["#fMin", "#fMax", "#fMinVw", "#fMaxVw"].forEach((sel) => $(sel).addEventListener("input", debounce(renderFluid, 110)));
  $("#swapFluid").addEventListener("click", () => {
    const a = $("#fMin").value;
    $("#fMin").value = $("#fMax").value;
    $("#fMax").value = a;
    renderFluid();
  });
  $("#format").addEventListener("change", renderExport);
  $("#tname").addEventListener("input", debounce(renderExport, 140));
  $("#copyScale").addEventListener("click", () => copyText($("#scaleOut").value, "Copied the token block."));
  $("#copyFluid").addEventListener("click", () => copyText($("#fluidOut").value, "Copied the clamp()."));

  renderScale();
  renderFluid();
  renderSpace();
}
