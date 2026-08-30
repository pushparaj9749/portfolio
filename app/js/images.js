/* =========================================================
   Bench — application
   ---------------------------------------------------------
   State lives in one object. The file objects are never copied or
   sent anywhere: blobs are handed to workers and results come back as
   blob: URLs. The only persistence in this app is your recipe (settings).
   ========================================================= */

import {
  APP,
  FORMATS,
  ACCEPTED,
  DEFAULT_SETTINGS,
  resolveMime,
  extFor,
  isImage,
  prettyBytes,
  clamp,
} from "./core/constants.js";
import { probeEncoders, fitSize } from "./core/pipeline.js";
import { createPool } from "./core/pool.js";
import { buildZip } from "./core/zip.js";
import { loadSettings, saveSettings } from "./core/store.js";
import { reduced as SHELL_REDUCED, toast, bootTool, paintPrivacy } from "./shell.js";

const reduced = SHELL_REDUCED;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------- state ---------- */
const state = {
  settings: loadSettings(),
  support: new Map(),
  pool: null,
  items: new Map(), // id -> { file, url, outName, result, status, error }
  order: [],
  busy: false,
  lastRunMs: 0,
  lastRunCount: 0,
};

let uid = 0;
const nextId = () => `f${Date.now().toString(36)}${(++uid).toString(36)}`;

/* ---------- dom cache ---------- */
const el = {
  root: document.documentElement,
  loadState: $("#loadState"),
  engineBadge: $("#engineBadge"),
  dropzone: $("#dropzone"),
  fileInput: $("#fileInput"),
  dzCount: $("#dzCount"),
  results: $("#results"),
  emptyState: $("#emptyState"),
  totals: $("#totals"),
  actions: $("#actions"),
  runBtn: $("#runBtn"),
  zipBtn: $("#zipBtn"),
  clearBtn: $("#clearBtn"),
  formatList: $("#formatList"),
  formatNote: $("#formatNote"),
  toasts: $("#toasts"),
  srTable: $("#srTable"),
};

el.fileInput.accept = ACCEPTED;
$("#version").textContent = `v${APP.version}`;

/* =========================================================
   Recipe presets — deep-linkable, and used by the PWA shortcuts
   ========================================================= */
const PRESETS = {
  compress: {
    label: "Compress photos",
    settings: { format: "webp", resizeMode: "max", maxDim: 1920, quality: 0.82, stripMeta: true, skipIfLarger: true, keepName: false, suffix: "-compressed" },
  },
  privacy: {
    label: "Strip location data",
    settings: { format: "source", resizeMode: "none", stripMeta: true, skipIfLarger: true, keepName: true, suffix: "" },
  },
  web: {
    label: "Web-ready",
    settings: { format: "webp", resizeMode: "max", maxDim: 1600, quality: 0.8, stripMeta: true, skipIfLarger: true, keepName: false, suffix: "@2x" },
  },
  png: {
    label: "Lossless screenshots",
    settings: { format: "png", resizeMode: "none", stripMeta: true, skipIfLarger: false, keepName: false, suffix: "" },
  },
};

function applyPresetFromUrl() {
  const wanted = new URLSearchParams(location.search).get("recipe");
  const preset = wanted && PRESETS[wanted.toLowerCase()];
  if (!preset) return null;
  state.settings = { ...state.settings, ...preset.settings };
  saveSettings(state.settings);
  return preset;
}

/* =========================================================
   Controls
   ========================================================= */
function buildFormatCards() {
  el.formatList.innerHTML = "";
  FORMATS.forEach((f) => {
    const label = document.createElement("label");
    label.className = "rc";
    label.dataset.id = f.id;

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "format";
    input.value = f.id;
    input.checked = state.settings.format === f.id;

    const name = document.createElement("span");
    name.className = "rc-name";
    name.textContent = f.label;

    const tag = document.createElement("span");
    tag.className = "rc-tag";
    tag.dataset.tag = f.id;

    input.addEventListener("change", () => {
      state.settings.format = f.id;
      syncSettings();
      refreshRunLabel();
    });

    label.append(input, name, tag);
    el.formatList.appendChild(label);
  });
  markSupport();
}

function markSupport() {
  FORMATS.forEach((f) => {
    const card = el.formatList.querySelector(`[data-id="${f.id}"]`);
    if (!card) return;
    const tag = card.querySelector("[data-tag]");
    const supported = f.mime === null ? true : state.support.get(f.mime);
    const canEncode = f.id === "source" || supported === true || supported === undefined;
    card.dataset.disabled = canEncode ? "0" : "1";
    if (canEncode) {
      tag.textContent = f.id === "source" ? "same" : f.lossy ? "lossy" : "lossless";
    } else {
      tag.textContent = "not in this browser";
    }
    card.title = f.note;
  });

  // If the chosen format is unavailable, fall to something that is and say so.
  const chosen = state.settings.format;
  const chosenFmt = FORMATS.find((f) => f.id === chosen);
  if (chosenFmt && chosenFmt.mime && state.support.get(chosenFmt.mime) === false) {
    const fallback = FORMATS.find(
      (f) => f.mime && (state.support.get(f.mime) === true || state.support.get(f.mime) === undefined)
    );
    if (fallback) {
      state.settings.format = fallback.id;
      const input = el.formatList.querySelector(`input[value="${fallback.id}"]`);
      if (input) input.checked = true;
      toast(`This browser can't encode ${chosenFmt.label} — using ${fallback.label} instead.`, "err", 6500);
    }
  }
}

const controls = {
  resizeMode: $("#resizeMode"),
  maxDim: $("#maxDim"),
  percent: $("#percent"),
  width: $("#width"),
  height: $("#height"),
  quality: $("#quality"),
  stripMeta: $("#stripMeta"),
  skipIfLarger: $("#skipIfLarger"),
  keepName: $("#keepName"),
  suffix: $("#suffix"),
};

function syncControlsFromSettings() {
  const s = state.settings;
  controls.resizeMode.value = s.resizeMode;
  controls.maxDim.value = s.maxDim;
  controls.percent.value = s.percent;
  controls.width.value = s.width;
  controls.height.value = s.height;
  controls.quality.value = Math.round(s.quality * 100);
  controls.stripMeta.checked = s.stripMeta;
  controls.skipIfLarger.checked = s.skipIfLarger;
  controls.keepName.checked = s.keepName;
  controls.suffix.value = s.suffix;
  paintQuality();
  paintVisibility();
}

function paintQuality() {
  const v = Number(controls.quality.value);
  $("#qualityOut").textContent = String(v);
  controls.quality.style.setProperty("--fill", `${((v - 35) / 65) * 100}%`);
}

/** Shows the concrete pixel target once we know a source size. */
function updateResizePreview() {
  const first = state.order.map((id) => state.items.get(id)).find((i) => i?.srcDims);
  const readout = (key, text) => {
    const node = $(`[data-out="${key}"]`);
    if (node) node.textContent = text;
  };
  if (!first) {
    ["width", "height"].forEach((k) => readout(k, "→ —"));
    return;
  }
  const [w, h] = first.srcDims;
  const s2 = state.settings;
  const [tw, th] = fitSize(w, h, s2);
  const arrow = tw === w && th === h ? `${w}×${h} (unchanged)` : `${w}×${h} → ${tw}×${th}`;
  readout("width", arrow);
  readout("height", arrow);
}

function paintVisibility() {
  const mode = controls.resizeMode.value;
  $$("[data-when]", $(".controls")).forEach((n) => {
    n.hidden = n.dataset.when !== mode;
  });
  const isSource = state.settings.format === "source";
  $("#suffixField").hidden = state.settings.keepName;
  updateResizePreview();
  $("#formatNote").textContent = isSource
    ? "Keeps the container you gave it — useful for resizing or stripping only."
    : (FORMATS.find((f) => f.id === state.settings.format) || {}).note || "";
}

let debounce = null;
function syncSettings() {
  saveSettings(state.settings);
  paintVisibility();
  el.formatNote.textContent =
    (FORMATS.find((f) => f.id === state.settings.format) || {}).note || "";
  // Re-run automatically once there is output to keep honest.
  if (state.order.length && state.items.size) {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      if (hasResults()) runBatch("auto");
    }, 260);
  }
  refreshRunLabel();
}

function readControls() {
  const s = state.settings;
  s.resizeMode = controls.resizeMode.value;
  s.maxDim = clamp(controls.maxDim.value, 16, 8192, DEFAULT_SETTINGS.maxDim);
  s.percent = clamp(controls.percent.value, 5, 400, DEFAULT_SETTINGS.percent);
  s.width = clamp(controls.width.value, 16, 8192, DEFAULT_SETTINGS.width);
  s.height = clamp(controls.height.value, 16, 8192, DEFAULT_SETTINGS.height);
  s.quality = clamp(Number(controls.quality.value) / 100, 0.35, 1, DEFAULT_SETTINGS.quality);
  s.stripMeta = controls.stripMeta.checked;
  s.skipIfLarger = controls.skipIfLarger.checked;
  s.keepName = controls.keepName.checked;
  s.suffix = controls.suffix.value.replace(/[\\/:*?"<>|]/g, "").slice(0, 24);
  s.format = el.formatList.querySelector("input[name=format]:checked")?.value || s.format;
  return s;
}

function hasResults() {
  return Array.from(state.items.values()).some((i) => i.result);
}

function refreshRunLabel() {
  const count = state.order.length;
  $("[data-t=runLabel]").textContent = hasResults() ? "Re-run" : "Process";
  $("[data-t=runHint]").textContent = count ? `${count} file${count === 1 ? "" : "s"}` : "";
  el.runBtn.disabled = !count;
  el.zipBtn.disabled = !hasResults();
  el.clearBtn.disabled = !count;
  el.actions.hidden = count === 0;
  el.totals.hidden = count === 0;
  el.emptyState.hidden = count > 0;
}

/* =========================================================
   Naming
   ========================================================= */
function outputName(item, ext) {
  if (state.settings.keepName) return item.file.name;
  const dot = item.file.name.lastIndexOf(".");
  const base = dot > 0 ? item.file.name.slice(0, dot) : item.file.name;
  const suffix = state.settings.suffix || "";
  return `${base}${suffix}.${ext}`;
}

/* =========================================================
   Files in
   ========================================================= */
function addFiles(list) {
  const incoming = Array.from(list);
  const files = incoming.filter(isImage);
  const skipped = incoming.length - files.length;

  files.forEach((file) => {
    const id = nextId();
    state.items.set(id, {
      id,
      file,
      url: URL.createObjectURL(file),
      status: "pending",
      result: null,
    });
    state.order.push(id);
  });

  if (files.length) {
    renderNewCards(files.length);
    refreshRunLabel();
    updateDropzoneCount();
    if (state.order.length) runBatch("add");
  }
  if (skipped > 0) {
    toast(`${skipped} file${skipped === 1 ? "" : "s"} skipped — Bench handles images only.`, "err", 5200);
  }
  if (files.length) el.dropzone.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
}

function updateDropzoneCount() {
  const n = state.order.length;
  const bytes = state.order.reduce((sum, id) => sum + (state.items.get(id)?.file.size || 0), 0);
  el.dzCount.textContent = n ? `${n} file${n === 1 ? "" : "s"} in memory · ${prettyBytes(bytes)}` : "";
}

function renderNewCards(count) {
  const start = state.order.length - count;
  state.order.slice(Math.max(0, start)).forEach((id, i) => {
    const item = state.items.get(id);
    if (item && !item.node) el.results.appendChild(createCard(item, start + i));
  });
}

function createCard(item, index = 0) {
  const card = document.createElement("article");
  card.className = "card is-pending";
  card.dataset.id = item.id;
  card.style.setProperty("--d", reduced ? "0ms" : `${Math.min(index, 12) * 40}ms`);

  card.innerHTML = `
    <div class="thumb">
      <img alt="" loading="lazy" decoding="async">
      <span class="thumb-ext mono">${escapeHtml(item.file.type.replace("image/", "") || "?")}</span>
    </div>
    <div class="card-body">
      <p class="card-name" title="${escapeHtml(item.file.name)}">${escapeHtml(item.file.name)}</p>
      <p class="card-dims" data-r="dims">reading…</p>
      <p class="card-sizes">
        <span class="was" data-r="was">${prettyBytes(item.file.size)}</span>
        <span class="now" data-r="now">—</span>
        <span class="card-delta is-same" data-r="delta">queued</span>
      </p>
      <div class="card-tags" data-r="tags"></div>
    </div>
    <div class="card-actions">
      <button class="mini-btn is-accent" data-act="save" type="button" disabled>Save</button>
      <button class="mini-btn is-ghost" data-act="remove" type="button" aria-label="Remove ${escapeHtml(item.file.name)}">✕</button>
    </div>`;

  card.querySelector("img").src = item.url;
  item.node = card;
  return card;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* =========================================================
   Batch processing
   ========================================================= */
function buildSpec(item, settings) {
  const sourceMime = item.file.type || "image/png";
  const mime = resolveMime(settings.format, sourceMime, state.support);
  const ext = extFor(mime);
  return {
    id: item.id,
    outName: outputName(item, ext),
    mime,
    quality: settings.quality,
    stripMeta: settings.stripMeta,
    skipIfLarger: settings.skipIfLarger,
    resizeMode: settings.resizeMode,
    maxDim: settings.maxDim,
    width: settings.width,
    height: settings.height,
    percent: settings.percent,
  };
}

async function runBatch(reason = "manual") {
  if (state.busy || !state.order.length) return;
  readControls();
  const settings = state.settings;
  state.busy = true;
  el.results.setAttribute("aria-busy", "true");
  const started = performance.now();
  let done = 0;
  let failed = 0;
  const total = state.order.length;

  el.runBtn.disabled = true;
  $("[data-t=runLabel]").textContent = "Processing…";

  const tasks = state.order.map((id) => {
    const item = state.items.get(id);
    if (!item) return Promise.resolve();
    item.status = "busy";
    item.node?.classList.remove("is-error", "is-done");
    item.node?.classList.add("is-busy");
    const spec = buildSpec(item, settings);
    return state.pool
      .submit({ file: item.file, spec })
      .then((res) => {
        item.result = res;
        item.outName = res.name || spec.outName;
        item.srcDims = [res.srcW, res.srcH];
        item.status = res.skipped ? "skipped" : "done";
        paintCard(item, res);
      })
      .catch((err) => {
        failed++;
        item.status = "error";
        item.error = err.message || String(err);
        paintCardError(item);
      })
      .then(() => {
        done++;
        setProgress(done / total);
      });
  });

  await Promise.all(tasks);

  state.busy = false;
  state.lastRunMs = Math.round(performance.now() - started);
  state.lastRunCount = done;
  el.results.setAttribute("aria-busy", "false");
  el.runBtn.disabled = false;
  setProgress(0);
  paintTotals();
  paintSrTable();
  updateResizePreview();
  refreshRunLabel();

  const okCount = state.order.filter((id) => state.items.get(id).status === "done" || state.items.get(id).status === "skipped").length;
  if (failed) toast(`${okCount} of ${total} done · ${failed} could not be read.`, "err", 6000);
  else if (reason !== "auto") toast(`${okCount} file${okCount === 1 ? "" : "s"} processed in ${(state.lastRunMs / 1000).toFixed(1)}s.`, "ok");
}

function setProgress(p) {
  const bar = el.runBtn.querySelector(".progress") || (() => {
    const b = document.createElement("i");
    b.className = "progress";
    el.runBtn.appendChild(b);
    return b;
  })();
  bar.style.transform = `scaleX(${clamp(p, 0, 1)})`;
}

function paintCard(item, res) {
  const node = item.node;
  if (!node) return;
  node.classList.remove("is-busy", "is-pending", "is-error");
  node.classList.add("is-done");

  const dims = node.querySelector('[data-r="dims"]');
  const was = node.querySelector('[data-r="was"]');
  const now = node.querySelector('[data-r="now"]');
  const delta = node.querySelector('[data-r="delta"]');
  const tags = node.querySelector('[data-r="tags"]');
  const saveBtn = node.querySelector('[data-act="save"]');

  const sizeChange =
    res.outW !== res.srcW || res.outH !== res.srcH
      ? `${res.srcW}×${res.srcH} → ${res.outW}×${res.outH}`
      : `${res.srcW}×${res.srcH}`;
  dims.textContent = `${sizeChange} · ${res.ext.toUpperCase()}`;
  was.textContent = prettyBytes(res.originalSize);
  now.textContent = prettyBytes(res.size);

  const pct = Math.round(res.savedPct);
  delta.classList.remove("is-loss", "is-same");
  if (res.skipped) {
    delta.textContent = "kept original";
    delta.classList.add("is-same");
    saveBtn.disabled = true;
    saveBtn.textContent = "Kept original";
  } else if (res.grew) {
    delta.textContent = `+${Math.abs(pct)}%`;
    delta.classList.add("is-loss");
    saveBtn.disabled = false;
    saveBtn.textContent = "Save";
  } else {
    delta.textContent = `−${pct}%`;
    saveBtn.disabled = false;
    saveBtn.textContent = "Save";
  }

  const chips = [];
  if (res.skipped) chips.push(`<span class="tag">left untouched</span>`);
  if (res.metaRemoved && res.meta.gps) chips.push(`<span class="tag is-gps">gps coordinates removed</span>`);
  if (res.metaRemoved && res.meta.exif) chips.push(`<span class="tag is-strip">exif removed</span>`);
  if (res.metaRemoved && res.meta.icc) chips.push(`<span class="tag is-strip">colour profile removed</span>`);
  if (res.metaRemoved && res.meta.text) chips.push(`<span class="tag is-strip">captions/xmp removed</span>`);
  if (res.grew) chips.push(`<span class="tag is-grow">grew ${Math.abs(pct)}%</span>`);
  if (res.toMime !== res.fromMime) chips.push(`<span class="tag">converted</span>`);
  if (res.reencoded && !res.metaRemoved) chips.push(`<span class="tag">re-encoded</span>`);
  chips.push(`<span class="tag">${res.ms}ms</span>`);
  tags.innerHTML = chips.join("");
}

function paintCardError(item) {
  const node = item.node;
  if (!node) return;
  node.classList.remove("is-busy", "is-pending");
  node.classList.add("is-error");
  node.querySelector('[data-r="dims"]').textContent = item.error;
  node.querySelector('[data-r="now"]').textContent = "—";
  const delta = node.querySelector('[data-r="delta"]');
  delta.textContent = "failed";
  delta.classList.remove("is-loss");
  delta.classList.add("is-same");
}

/* ---------- totals with a count-up ---------- */
function batchStats() {
  let before = 0;
  let after = 0;
  let counted = 0;
  for (const id of state.order) {
    const item = state.items.get(id);
    if (!item || !item.result) continue;
    const r = item.result;
    if (r.skipped) {
      before += r.originalSize;
      after += r.originalSize;
    } else {
      before += r.originalSize;
      after += r.size;
    }
    counted++;
  }
  return { before, after, counted };
}

let animFrame = null;
function paintTotals() {
  const { before, after, counted } = batchStats();
  const saved = before - after;
  const pct = before ? (saved / before) * 100 : 0;

  const from = { b: Number(el.totals.dataset.before || 0), a: Number(el.totals.dataset.after || 0) };
  el.totals.dataset.before = String(before);
  el.totals.dataset.after = String(after);

  const bar = el.totals.querySelector('[data-t="bar"]');
  bar.style.width = `${clamp(100 - (before ? (after / before) * 100 : 100), 0, 100)}%`;

  const savedNode = el.totals.querySelector('[data-t="saved"]');
  savedNode.classList.toggle("is-loss", saved < 0);

  const targets = {
    before: prettyBytes(before),
    after: prettyBytes(after),
    saved: `${saved >= 0 ? "−" : "+"}${Math.abs(Math.round(pct))}% (${prettyBytes(Math.abs(saved))})`,
    count: String(counted),
    time: counted ? `${(state.lastRunMs / 1000).toFixed(state.lastRunMs < 10000 ? 1 : 0)}s` : "—",
  };

  if (reduced) {
    Object.entries(targets).forEach(([k, v]) => {
      el.totals.querySelector(`[data-t="${k}"]`).textContent = v;
    });
    return;
  }

  // Count up the two byte values, then swap the text labels.
  const bEl = el.totals.querySelector('[data-t="before"]');
  const aEl = el.totals.querySelector('[data-t="after"]');
  const t0 = performance.now();
  const dur = 620;
  cancelAnimationFrame(animFrame);
  const step = (now) => {
    const t = Math.min((now - t0) / dur, 1);
    const e = 1 - Math.pow(1 - t, 3);
    bEl.textContent = prettyBytes(from.b + (before - from.b) * e);
    aEl.textContent = prettyBytes(from.a + (after - from.a) * e);
    if (t < 1) animFrame = requestAnimationFrame(step);
    else Object.entries(targets).forEach(([k, v]) => {
      if (k === "before" || k === "after") return;
      el.totals.querySelector(`[data-t="${k}"]`).textContent = v;
    });
  };
  animFrame = requestAnimationFrame(step);
}

function paintSrTable() {
  const rows = state.order
    .map((id) => state.items.get(id))
    .filter((i) => i && i.result)
    .map(
      (i) =>
        `<tr><td>${escapeHtml(i.result.name)}</td><td>${prettyBytes(i.result.originalSize)}</td><td>${prettyBytes(
          i.result.size
        )}</td><td>${Math.round(i.result.savedPct)}% smaller</td></tr>`
    );
  el.srTable.innerHTML = rows.length
    ? `<tbody>${rows.join("")}</tbody>`
    : "";
}

/* =========================================================
   Downloads
   ========================================================= */
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
}

function downloadOne(item) {
  const r = item.result;
  if (!r) return;
  if (r.blob) {
    saveBlob(r.blob, r.name || item.outName);
    return;
  }
  // "kept original": no blob to hand back, so trigger a plain file save of the source.
  saveBlob(item.file, item.file.name);
}

async function downloadZip() {
  const ready = state.order
    .map((id) => state.items.get(id))
    .filter((i) => i && i.result && i.result.blob);
  if (!ready.length) {
    toast("Nothing to package yet — run the recipe first.", "err");
    return;
  }
  el.zipBtn.disabled = true;
  const original = el.zipBtn.firstChild.textContent;
  el.zipBtn.firstChild.textContent = "Building archive…";
  try {
    const blob = await buildZip(ready.map((i) => ({ name: i.result.name || i.outName, blob: i.result.blob })));
    const stamp = new Date().toISOString().slice(0, 10);
    saveBlob(blob, `bench-${stamp}.zip`);
    toast(`${ready.length} files packaged · ${prettyBytes(blob.size)}, still 0 bytes uploaded.`, "ok");
  } catch (err) {
    toast(`Could not build the zip: ${err.message}. Downloading files individually instead.`, "err", 7000);
    ready.forEach((i, n) => setTimeout(() => downloadOne(i), n * 220));
  } finally {
    el.zipBtn.disabled = false;
    el.zipBtn.firstChild.textContent = original;
  }
}

/* ---------- privacy: the chip lives in the shell; keep the detail panel in sync ---------- */
function paintPrivacyPanel() {
  paintPrivacy();
  let used = "n/a";
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith("bench."));
    used = prettyBytes(keys.reduce((n, k) => n + k.length + (localStorage.getItem(k) || "").length, 0));
  } catch {
    /* private mode */
  }
  const st = $('[data-p="storage"]');
  if (st) st.textContent = used;
}

/* =========================================================
   Wiring
   ========================================================= */
function initInput() {
  el.fileInput.addEventListener("change", (e) => {
    addFiles(e.target.files);
    e.target.value = "";
  });

  ["dragenter", "dragover"].forEach((type) =>
    el.dropzone.addEventListener(type, (e) => {
      e.preventDefault();
      el.dropzone.classList.add("is-over");
    })
  );
  ["dragleave", "drop"].forEach((type) =>
    el.dropzone.addEventListener(type, (e) => {
      e.preventDefault();
      if (type === "dragleave" && el.dropzone.contains(e.relatedTarget)) return;
      el.dropzone.classList.remove("is-over");
    })
  );
  el.dropzone.addEventListener("drop", (e) => {
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files);
  });
  // full-page drop support
  window.addEventListener("dragover", (e) => {
    e.preventDefault();
    document.body.classList.add("is-dragging");
  });
  window.addEventListener("dragleave", (e) => {
    if (!e.relatedTarget) document.body.classList.remove("is-dragging");
  });
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    document.body.classList.remove("is-dragging");
    if (e.dataTransfer?.files?.length && !el.results.contains(e.target)) addFiles(e.dataTransfer.files);
  });

  document.addEventListener("paste", (e) => {
    const files = Array.from(e.clipboardData?.files || []);
    if (files.length) {
      addFiles(files);
      toast(`Pasted ${files.length} image${files.length === 1 ? "" : "s"} from your clipboard.`, "ok", 2600);
    }
  });

  el.results.addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (!card) return;
    const item = state.items.get(card.dataset.id);
    if (!item) return;
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "save") downloadOne(item);
    if (act === "remove") removeItem(item);
  });

  el.runBtn.addEventListener("click", () => runBatch("manual"));
  el.zipBtn.addEventListener("click", downloadZip);
  el.clearBtn.addEventListener("click", clearAll);
  $("#resetBtn").addEventListener("click", () => {
    state.settings = { ...DEFAULT_SETTINGS };
    syncControlsFromSettings();
    $$('#formatList input').forEach((i) => (i.checked = i.value === state.settings.format));
    saveSettings(state.settings);
    refreshRunLabel();
    if (hasResults()) runBatch("auto");
    toast("Recipe reset to defaults.", "ok", 2200);
  });

  Object.entries({
    resizeMode: "change",
    maxDim: "input",
    percent: "input",
    width: "input",
    height: "input",
    quality: "input",
    stripMeta: "change",
    skipIfLarger: "change",
    keepName: "change",
    suffix: "input",
  }).forEach(([key, ev]) => {
    controls[key].addEventListener(ev, () => {
      readControls();
      if (key === "quality") paintQuality();
      if (key === "resizeMode") paintVisibility();
      syncSettings();
    });
  });
}

function removeItem(item) {
  const idx = state.order.indexOf(item.id);
  if (idx > -1) state.order.splice(idx, 1);
  if (item.url) URL.revokeObjectURL(item.url);
  if (item.result?.blobUrl) URL.revokeObjectURL(item.result.blobUrl);
  item.node?.remove();
  state.items.delete(item.id);
  updateDropzoneCount();
  refreshRunLabel();
  paintTotals();
}

function clearAll() {
  state.order.forEach((id) => {
    const item = state.items.get(id);
    if (item?.url) URL.revokeObjectURL(item.url);
  });
  state.items.clear();
  state.order = [];
  el.results.innerHTML = "";
  el.totals.dataset.before = "0";
  el.totals.dataset.after = "0";
  updateDropzoneCount();
  refreshRunLabel();
  paintTotals();
  updateResizePreview();
  toast("Cleared. Nothing was ever stored, so there's nothing to delete on a server.", "ok", 3200);
}

function initChrome() {
  // Reveal-on-scroll for the explainer cards (the shell handles header chrome).
  if ("IntersectionObserver" in window && !reduced) {
    $$(".how-card, .how .section-title").forEach((n) => n.classList.add("reveal"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.2 }
    );
    $$(".reveal").forEach((n) => io.observe(n));
  }

  if (matchMedia("(pointer: fine)").matches && !reduced) {
    $$(".magnetic").forEach((node) => {
      node.addEventListener("pointermove", (e) => {
        const r = node.getBoundingClientRect();
        node.style.transform =
          `translate(${(e.clientX - r.left - r.width / 2) * 0.22}px, ${(e.clientY - r.top - r.height / 2) * 0.28}px)`;
      });
      node.addEventListener("pointerleave", () => {
        node.style.transform = "";
      });
    });
  }

  addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) return;
    if (e.key === "o" || e.key === "O") {
      e.preventDefault();
      el.fileInput.click();
    } else if (e.key === "r" || e.key === "R") {
      e.preventDefault();
      runBatch("manual");
    } else if (e.key === "z" || e.key === "Z") {
      if (!el.zipBtn.disabled) {
        e.preventDefault();
        downloadZip();
      }
    } else if (e.key === "?") {
      e.preventDefault();
      toast("o = add files · r = run recipe · z = download .zip · Esc = clear. All processing is local.", "ok", 6500);
    } else if (e.key === "Escape" && state.order.length) {
      clearAll();
    }
  });
}

/* =========================================================
   Boot
   ========================================================= */
async function boot() {
  bootTool(); // theme + header + privacy audit + service worker
  const preset = applyPresetFromUrl();
  buildFormatCards();
  syncControlsFromSettings();
  if (preset) toast(`${preset.label} recipe loaded from the link.`, "ok", 3600);
  initInput();
  initChrome();
  refreshRunLabel();
  paintPrivacyPanel();
  setInterval(paintPrivacyPanel, 4000);

  const { supported } = await probeEncoders();
  state.support = supported;
  markSupport();
  syncControlsFromSettings();

  const cores = clamp(navigator.hardwareConcurrency || 4, 2, 6);
  state.pool = createPool(cores);
  state.pool.warm();

  const capable = ["image/webp", "image/avif"].filter((m) => state.support.get(m));
  el.loadState.textContent = "ready — everything below runs locally";
  el.loadState.classList.add("is-ready");
  el.engineBadge.textContent = `engine: ${state.pool.mode}, ${state.pool.size} thread${
    state.pool.size === 1 ? "" : "s"
  }${capable.length ? ", " + capable.map((m) => m.split("/")[1].toUpperCase()).join("+") : ""}`;

  if (state.pool.mode === "main-thread") {
    toast("Web Workers are unavailable here — running on the main thread, so large batches will be slower.", "err", 8000);
  }

}


boot().catch((err) => {
  el.loadState.textContent = "ready (compatibility mode)";
  console.warn("[bench] boot issue:", err);
  toast(`Couldn't start fully: ${err.message}. Try a current Chrome, Safari or Firefox.`, "err", 9000);
});
