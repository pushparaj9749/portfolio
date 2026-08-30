/* =========================================================
   Tool · JSON
   ========================================================= */

const INDENTS = { 2: "  ", 4: "    ", tab: "\t" };

/** Parse with a human-readable failure: position, line, column and a caret. */
export function parseJson(text) {
  const src = String(text ?? "");
  if (!src.trim()) return { ok: false, empty: true, error: { message: "Nothing to parse yet — paste some JSON." } };
  try {
    return { ok: true, value: JSON.parse(src) };
  } catch (err) {
    const pos = extractPosition(err.message, src);
    const { line, col } = lineColAt(src, pos);
    const lines = src.split(/\r?\n/);
    const snippet = lines[line - 1] || "";
    return {
      ok: false,
      error: {
        message: err.message.replace(/^JSON\.parse:\s*/i, ""),
        position: pos,
        line,
        col,
        snippet,
        pointer: `${" ".repeat(Math.max(0, col - 1))}^`,
        hint: hintFor(src, pos),
      },
    };
  }
}

function extractPosition(message, src) {
  const m = String(message).match(/position\s+(\d+)/i) || String(message).match(/line\s+(\d+) column\s+(\d+)/i);
  if (m && m[2]) return offsetOf(Number(m[1]), Number(m[2]), src);
  if (m) return Number(m[1]);
  return -1;
}
function offsetOf(line, col, src) {
  const lines = src.split(/\r?\n/);
  let n = 0;
  for (let i = 0; i < Math.min(line - 1, lines.length); i++) n += lines[i].length + 1;
  return n + col - 1;
}
function lineColAt(src, pos) {
  if (pos < 0) return { line: 1, col: 1 };
  const before = src.slice(0, pos);
  const lines = before.split(/\r?\n/);
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}
function hintFor(src, pos) {
  const around = src.slice(Math.max(0, pos - 60), pos + 20);
  if (/'/.test(around) && !/"[^"]*"/.test(around)) return "JSON needs double quotes around keys and string values — single quotes are not valid.";
  if (/,(\s*[}\]])/.test(src)) return "Trailing comma before a closing brace or bracket.";
  if (/\b(undefined|NaN|Infinity)\b/.test(src)) return "undefined / NaN / Infinity are not JSON values — use null.";
  const line = src.slice(0, Math.max(0, pos)).split(/\r?\n/).pop() || "";
  if (/"[^"]*"\s+(?![,:}\]])/.test(line)) return "Missing a colon between a key and its value.";
  if (/(?:\d|true|false|null|"|\]|\})\s+"[^"]*"\s*:/.test(line)) return "Missing a comma between two entries.";
  if (/[\w]\s*:\s*[\w]/.test(around)) return "Unquoted string value? Values must be quoted, or be true/false/null/number.";
  return "";
}

export function formatJson(value, indent = 2) {
  const pad = INDENTS[indent] ?? String(indent);
  return JSON.stringify(value, null, pad);
}

export function minify(value) {
  return JSON.stringify(value);
}

/** Stable, recursive key sort — handy for diffing API payloads. */
export function sortKeys(value, { deep = true, desc = false } = {}) {
  if (Array.isArray(value)) return deep ? value.map((v) => sortKeys(v, { deep, desc })) : value;
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort((a, b) => (desc ? b.localeCompare(a) : a.localeCompare(b)));
    const out = {};
    for (const k of keys) out[k] = deep ? sortKeys(value[k], { deep, desc }) : value[k];
    return out;
  }
  return value;
}

export function flatten(value, prefix = "", depth = 0) {
  const out = [];
  const walk = (v, path, d) => {
    if (Array.isArray(v)) {
      if (!v.length) out.push({ path, value: "[]", type: "array" });
      v.forEach((item, i) => walk(item, `${path}[${i}]`, d + 1));
      return;
    }
    if (v && typeof v === "object") {
      const keys = Object.keys(v);
      if (!keys.length) out.push({ path, value: "{}", type: "object" });
      keys.forEach((k) => walk(v[k], path ? `${path}.${k}` : k, d + 1));
      return;
    }
    out.push({ path, value: v === undefined ? "undefined" : JSON.stringify(v), type: v === null ? "null" : typeof v });
  };
  walk(value, prefix, depth);
  return out;
}

export function unflatten(rows) {
  const out = {};
  for (const row of rows) {
    // flatten() emits {path, value}; accept `raw` too so callers can hand back an edited table.
    const raw = "raw" in row ? row.raw : row.value;
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      value = raw;
    }
    const parts = String(row.path)
      .replace(/\[(\d+)\]/g, ".$1")
      .split(".")
      .filter((part) => part !== "");
    if (!parts.length) continue;
    let node = out;
    for (let i = 0; i < parts.length; i++) {
      const key = parts[i];
      const last = i === parts.length - 1;
      if (last) {
        if (Array.isArray(node) && /^\d+$/.test(key)) node[Number(key)] = value;
        else node[key] = value;
        break;
      }
      // The *next* segment decides whether this level is an array or an object.
      const nextIsIndex = /^\d+$/.test(parts[i + 1]);
      const want = nextIsIndex ? [] : {};
      if (node[key] === undefined || node[key] === null || typeof node[key] !== "object") node[key] = want;
      node = node[key];
    }
  }
  // A document whose top level is all indices was an array.
  const top = Object.keys(out);
  if (top.length && top.every((k) => /^\d+$/.test(k))) {
    return top
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => out[k]);
  }
  return out;
}

/** `a.b[0].c` / `$.a.b` / `/a/b` — dot path, JSONPath-lite and JSON Pointer. */
function step(node, part) {
  if (node === null || node === undefined) return { err: `Cannot read "${part}" — the path stops earlier.` };
  if (Array.isArray(node)) {
    const i = Number(part);
    if (!Number.isInteger(i) || i < 0) return { err: `"${part}" is not a valid array index.` };
    if (i >= node.length) return { err: `Index ${i} is past the end of a ${node.length}-item array.` };
    return { value: node[i] };
  }
  if (typeof node === "object") {
    if (!(part in node)) {
      const near = Object.keys(node).filter((k) => k.toLowerCase().includes(String(part).toLowerCase())).slice(0, 4);
      return { err: `No key "${part}".${near.length ? ` Closest: ${near.join(", ")}.` : ""}` };
    }
    return { value: node[part] };
  }
  return { err: `"${part}" is inside a ${typeof node}, which has no children.` };
}

export function queryPath(value, path) {
  const trimmed = String(path || "").trim();
  const clean = trimmed.replace(/^\$\.?/, "").replace(/^\//, "");
  if (!clean) return { ok: true, value };
  // "/a/b/0" — slash form, the jq-ish one people reach for
  if (trimmed.startsWith("/")) {
    const segs = clean.split("/").filter(Boolean);
    let slashNode = value;
    for (const seg of segs) {
      const r = step(slashNode, seg);
      if (r.err) return { ok: false, error: r.err };
      slashNode = r.value;
    }
    return { ok: true, value: slashNode };
  }
  // A literal key containing dots wins over treating the dot as a separator.
  if (value && typeof value === "object" && !Array.isArray(value) && clean in value) {
    return { ok: true, value: value[clean] };
  }
  const parts = clean
    .replace(/\["?([^"\]]+)"?\]/g, ".$1")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let node = value;
  for (const part of parts) {
    const r = step(node, part);
    if (r.err) return { ok: false, error: r.err };
    node = r.value;
  }
  return { ok: true, value: node };
}

export function jsonStats(value) {
  let nodes = 0;
  let depth = 0;
  let maxArray = 0;
  const types = {};
  const keyNames = new Set();
  const walk = (v, d) => {
    nodes++;
    depth = Math.max(depth, d);
    const t = Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
    types[t] = (types[t] || 0) + 1;
    if (Array.isArray(v)) {
      maxArray = Math.max(maxArray, v.length);
      v.forEach((x) => walk(x, d + 1));
    } else if (v && typeof v === "object") {
      for (const k of Object.keys(v)) keyNames.add(k);
      Object.values(v).forEach((x) => walk(x, d + 1));
    }
  };
  walk(value, 1);
  // `paths` is the row count of the tree table; `keys` counts distinct property names.
  return { nodes, depth, maxArray, types, paths: flatten(value).length, keys: keyNames.size };
}

export function removeEmpty(value, { nulls = true, empties = true, zeros = false } = {}) {
  if (Array.isArray(value)) {
    const arr = value.map((v) => removeEmpty(v, { nulls, empties, zeros })).filter((v) => !isDropworthy(v, { nulls, empties, zeros }));
    return arr;
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const nv = removeEmpty(v, { nulls, empties, zeros });
      if (isDropworthy(nv, { nulls, empties, zeros })) continue;
      out[k] = nv;
    }
    return out;
  }
  return value;
}
function isDropworthy(v, { nulls, empties, zeros }) {
  if (nulls && v === null) return true;
  if (empties && v === "") return true;
  if (empties && typeof v === "object" && v !== null && Object.keys(v).length === 0) return true;
  if (empties && Array.isArray(v) && v.length === 0) return true;
  if (zeros && v === 0) return true; // deliberately NOT `false`: a boolean is data
  return false;
}

/** Minimal, valid YAML 1.2 subset emitter — no anchors, no multi-line folding. */
export function toYaml(value, indent = 2) {
  const pad = " ".repeat(indent);
  const scalar = (v) => {
    if (v === null || v === undefined) return "null";
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    const s = String(v);
    if (s === "") return '""';
    if (/^[-?:,[\]{}#&*!|>'"%@`]/.test(s) || /:\s/.test(s) || /\s$/.test(s) || /^\s/.test(s) || /[\n\r]/.test(s) || s === "null" || s === "true" || s === "false") {
      return JSON.stringify(s);
    }
    if (/^-?\d+(\.\d+)?$/.test(s)) return JSON.stringify(s); // keep "12" a string
    return s;
  };
  const walk = (v, d) => {
    const pre = pad.repeat(d);
    if (Array.isArray(v)) {
      if (!v.length) return `${pre}[]`;
      return v
        .map((item) => {
          if (item && typeof item === "object") {
            const body = walk(item, d + 1).trimStart();
            return `${pre}- ${body.replace(/^/, "").split("\n").join("\n" + pre + "  ")}`;
          }
          return `${pre}- ${scalar(item)}`;
        })
        .join("\n");
    }
    if (v && typeof v === "object") {
      const keys = Object.keys(v);
      if (!keys.length) return `${pre}{}`;
      return keys
        .map((k) => {
          const val = v[k];
          if (Array.isArray(val) && val.length) return `${pre}${scalar(k)}:\n${walk(val, d + 1)}`;
          if (val && typeof val === "object" && Object.keys(val).length) return `${pre}${scalar(k)}:\n${walk(val, d + 1)}`;
          if (Array.isArray(val)) return `${pre}${scalar(k)}: []`;
          if (val && typeof val === "object") return `${pre}${scalar(k)}: {}`;
          return `${pre}${scalar(k)}: ${scalar(val)}`;
        })
        .join("\n");
    }
    return `${pre}${scalar(v)}`;
  };
  return walk(value, 0) + "\n";
}

/** Recursive diff by path: added / removed / changed. */
export function diffValues(a, b) {
  const out = { added: [], removed: [], changed: [] };
  const walk = (x, y, path) => {
    const tx = x === null ? "null" : Array.isArray(x) ? "array" : typeof x;
    const ty = y === null ? "null" : Array.isArray(y) ? "array" : typeof y;
    if (tx !== ty) return out.changed.push({ path, a: x, b: y });
    if (tx === "array") {
      const n = Math.max(x.length, y.length);
      for (let i = 0; i < n; i++) {
        if (i >= y.length) out.removed.push({ path: `${path}[${i}]`, a: x[i] });
        else if (i >= x.length) out.added.push({ path: `${path}[${i}]`, b: y[i] });
        else walk(x[i], y[i], `${path}[${i}]`);
      }
      return;
    }
    if (tx === "object") {
      const ka = Object.keys(x);
      const kb = Object.keys(y);
      for (const k of ka) {
        if (!(k in y)) out.removed.push({ path: path ? `${path}.${k}` : k, a: x[k] });
        else walk(x[k], y[k], path ? `${path}.${k}` : k);
      }
      for (const k of kb) if (!(k in x)) out.added.push({ path: path ? `${path}.${k}` : k, b: y[k] });
      return;
    }
    if (x !== y) out.changed.push({ path, a: x, b: y });
  };
  walk(a, b, "");
  out.total = out.added.length + out.removed.length + out.changed.length;
  return out;
}

/* ---------------- UI ---------------- */
if (typeof document !== "undefined" && typeof window !== "undefined") boot().catch((err) => console.warn(err));

async function boot() {
  const shell = await import("../shell.js");
  const { $, $$, toast, copyText, downloadText, debounce } = shell;
  shell.bootTool();

  const src = $("#src");
  const out = $("#out");
  const tree = $("#tree");
  let value = null;

  const renderError = (err) => {
    out.classList.add("is-error");
    const block = err.snippet
      ? `${err.message}\n\n  line ${err.line}, col ${err.col}\n  ${err.snippet}\n  ${err.pointer}\n`
      : err.message;
    out.textContent = block + (err.hint ? `\nHint: ${err.hint}` : "");
    if (tree) tree.innerHTML = "";
    const badge = $("#status");
    if (badge) {
      badge.className = "pill is-fail";
      badge.textContent = "invalid json";
    }
  };

  const renderValue = (v, { indent = 2, sort = false, min = false } = {}) => {
    const shown = sort ? sortKeys(v) : v;
    out.classList.remove("is-error");
    out.textContent = min ? minify(shown) : formatJson(shown, indent);
    const st = jsonStats(v);
    const badge = $("#status");
    if (badge) {
      badge.className = "pill is-pass";
      badge.textContent = `valid · ${st.nodes} nodes · depth ${st.depth}`;
    }
    for (const [k, n] of Object.entries(st.types)) {
      const node = $(`[data-type="${k}"]`);
      if (node) node.textContent = String(n);
    }
    const bytesNode = $('[data-stat="bytes"]');
    if (bytesNode) bytesNode.textContent = `${new TextEncoder().encode(out.textContent).length} B`;
    if (tree) {
      const rows = flatten(v).slice(0, 400);
      tree.innerHTML =
        `<thead><tr><th>path</th><th>value</th><th>type</th></tr></thead><tbody>` +
        rows
          .map(
            (r) =>
              `<tr><td>${shell.escapeHtml(r.path || "(root)")}</td><td data-type="${r.type === "number" ? "number" : r.value === "" ? "empty" : ""}">${shell.escapeHtml(
                String(r.value).slice(0, 120)
              )}</td><td class="mono">${r.type}</td></tr>`
          )
          .join("") +
        (rows.length > 400 ? `<tr><td colspan="3">…${flatten(v).length - 400} more rows</td></tr>` : "") +
        `</tbody>`;
    }
  };

  const refresh = debounce(() => {
    const res = parseJson(src.value);
    if (!res.ok) {
      value = null;
      renderError(res.error);
      return;
    }
    value = res.value;
    renderValue(value, {
      indent: $("#indent")?.value ?? 2,
      sort: $("#sortKeys")?.checked,
      min: $$("#mode .tbtn.is-on")[0]?.dataset.mode === "min",
    });
  }, 160);

  src.value =
    localStorage.getItem("bench.json.last") ||
    '{\n  "service": "bench",\n  "tools": ["images", "text", "json"],\n  "limits": { "uploads": 0, "trackers": 0 },\n  "flags": [{ "name": "offline", "on": true }],\n  "note": "single quotes are invalid json here",\n}';

  $$("#mode .tbtn").forEach((btn) =>
    btn.addEventListener("click", () => {
      $$("#mode .tbtn").forEach((b) => b.classList.toggle("is-on", b === btn));
      refresh();
    })
  );
  $("#indent")?.addEventListener("change", refresh);
  $("#sortKeys")?.addEventListener("change", refresh);
  src.addEventListener("input", () => {
    refresh();
    try {
      localStorage.setItem("bench.json.last", src.value.slice(0, 400000));
    } catch {
      /* quota */
    }
  });

  $("#copyOut")?.addEventListener("click", () => copyText(out.textContent, "JSON copied."));
  $("#downloadOut")?.addEventListener("click", () => downloadText("bench.json", out.textContent, "application/json"));

  $("#toYaml")?.addEventListener("click", () => {
    if (value === null) return toast("Fix the JSON first.", "err");
    out.classList.remove("is-error");
    out.textContent = toYaml(value);
    toast("Emitted YAML.", "ok", 1800);
  });
  $("#toCsv")?.addEventListener("click", async () => {
    if (!Array.isArray(value) || !value.length) return toast("This needs an array of objects at the top level.", "err");
    const { rowsFromObjects } = await import("./csv.js");
    out.classList.remove("is-error");
    out.textContent = rowsFromObjects(value).map((r) => r.join(",")).join("\n").replace(/(?=["\n,])/g, '"');
    const csv = (await import("./csv.js")).stringifyTable(rowsFromObjects(value));
    out.textContent = csv;
    toast("CSV written — switch to the Tables tool to keep editing it.", "ok", 3200);
  });
  $("#minify")?.addEventListener("click", () => {
    if (value === null) return toast("Fix the JSON first.", "err");
    out.classList.remove("is-error");
    out.textContent = minify(value);
  });
  $("#sortNow")?.addEventListener("click", () => {
    if (value === null) return toast("Fix the JSON first.", "err");
    renderValue(value, { sort: true });
  });
  $("#stripEmpty")?.addEventListener("click", () => {
    if (value === null) return toast("Fix the JSON first.", "err");
    const next = removeEmpty(value, { nulls: true, empties: true });
    src.value = formatJson(next);
    refresh();
    toast("Nulls and empty containers removed.", "ok", 2400);
  });

  // path query
  const q = $("#pathQuery");
  const qOut = $("#pathOut");
  q?.addEventListener("input", debounce(() => {
    if (value === null) {
      qOut.textContent = "—";
      return;
    }
    const r = queryPath(value, q.value);
    if (!r.ok) {
      qOut.textContent = r.error;
      qOut.classList.add("is-error");
      return;
    }
    qOut.classList.remove("is-error");
    qOut.textContent = typeof r.value === "string" ? r.value : formatJson(r.value);
  }, 140));

  src.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      const res = parseJson(src.value);
      if (res.ok) renderValue(res.value, {});
      else renderError(res.error);
    }
  });

  const res0 = parseJson(src.value);
  if (res0.ok) {
    value = res0.value;
    renderValue(value, {});
  } else renderError(res0.error);
}
