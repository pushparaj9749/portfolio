/* =========================================================
   Tool · Tables (CSV / TSV / JSON / Markdown)
   A real RFC-4180 parser: quoted fields, escaped quotes,
   embedded newlines, delimiter sniffing, typed coercion.
   ========================================================= */

export const DELIMITERS = { ",": "comma", "\t": "tab", ";": "semicolon", "|": "pipe" };

/** Pick the delimiter whose column counts are most consistent. */
export function guessDelimiter(text, candidates = [",", "\t", ";", "|"]) {
  const lines = String(text ?? "").split(/\r?\n/).filter((l) => l.trim().length).slice(0, 40);
  if (!lines.length) return ",";
  let best = { d: candidates[0], score: -Infinity };
  for (const d of candidates) {
    // count only delimiters outside quotes
    const counts = lines.map((l) => splitLine(l, d).length);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    if (mean < 1.5) continue;
    const variance = counts.reduce((a, b) => a + (b - mean) ** 2, 0) / counts.length;
    const score = mean - variance * 2;
    if (score > best.score) best = { d, score };
  }
  return best.d;
}

/** Split one physical line, honouring quotes. Returns {cells, rest}. */
function scan(text, d, quote = '"', escape = quote) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  let started = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === quote) {
        if (text[i + 1] === escape) {
          cell += escape;
          i++;
          continue;
        }
        inQuotes = false;
        continue;
      }
      cell += ch;
      continue;
    }
    if (ch === quote && !started) {
      inQuotes = true;
      started = true;
      continue;
    }
    if (ch === quote && started) {
      // quote in the middle: treat as literal unless it ends the cell
      if (text[i + 1] === d || text[i + 1] === "\n" || text[i + 1] === "\r" || i + 1 === text.length) {
        inQuotes = true;
        continue;
      }
      cell += ch;
      continue;
    }
    if (ch === d) {
      row.push(cell);
      cell = "";
      started = false;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      started = false;
      continue;
    }
    if (ch === "\r") continue;
    cell += ch;
    started = true;
  }
  if (started || cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function splitLine(line, d, quote = '"') {
  return scan(line, d, quote)[0] ?? [];
}

export function parseTable(text, opts = {}) {
  const raw = String(text ?? "");
  const d = opts.delimiter && opts.delimiter !== "auto" ? opts.delimiter : guessDelimiter(raw);
  const quote = opts.quote || '"';
  const errors = [];
  let rows = scan(raw, d, quote);
  // drop fully blank trailing rows
  while (rows.length && rows[rows.length - 1].every((c) => c.trim() === "")) rows.pop();

  const width = rows.reduce((n, r) => Math.max(n, r.length), 0);
  const ragged = [];
  rows.forEach((r, i) => {
    if (r.length !== width) ragged.push(i + 1);
  });
  if (ragged.length) {
    errors.push(
      `${ragged.length} row${ragged.length === 1 ? "" : "s"} have a different number of columns than the first row (${width}).${
        ragged.length <= 8 ? ` Lines: ${ragged.join(", ")}.` : ""
      }`
    );
  }
  // quote imbalance detection
  let openQuotes = 0;
  for (const ch of raw) {
    if (ch === quote) openQuotes = openQuotes ? 0 : 1;
  }
  if (openQuotes) errors.push("Unbalanced quotation mark — a field may be swallowing the rest of the file.");

  const hasHeader = opts.header !== false;
  const header = hasHeader ? rows[0] ?? [] : Array.from({ length: width }, (_, i) => `column_${i + 1}`);
  const body = hasHeader ? rows.slice(1) : rows;
  const typed = opts.type !== false;
  const data = body.map((r, ri) => {
    const obj = {};
    header.forEach((h, i) => {
      const key = h || `column_${i + 1}`;
      const cell = r[i] === undefined ? "" : r[i];
      obj[key] = typed ? coerce(cell) : cell;
      void ri;
    });
    return obj;
  });
  return {
    rows: body,
    allRows: rows,
    header,
    data,
    errors,
    delimiter: d,
    delimiterName: DELIMITERS[d] || JSON.stringify(d),
    width,
    rowCount: body.length,
    colCount: header.length,
    ragged,
  };
}

/** Coerce obvious types without inventing data (leading-zero IDs stay strings). */
export function coerce(cell) {
  const s = String(cell);
  if (s === "") return "";
  if (/^(null|na|n\/a|none)$/i.test(s.trim())) return null;
  const t = s.trim();
  if (/^(true|false)$/i.test(t)) return t.toLowerCase() === "true";
  if (/^-?\d+$/.test(t) && !/^0\d/.test(t)) {
    const n = Number(t);
    return Number.isSafeInteger(n) ? n : t;
  }
  if (/^-?\d*\.\d+$/.test(t) || /^-?\d+\.\d*[eE][-+]?\d+$/.test(t)) return Number(t);
  return s;
}

export function stringifyTable(rows, opts = {}) {
  const d = opts.delimiter || ",";
  const quoteAll = Boolean(opts.quoteAll);
  const nl = opts.newline || "\n";
  const esc = opts.quote || '"';
  const needs = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return quoteAll || s.includes(d) || s.includes(esc) || s.includes("\n") || s.includes("\r") || /^\s|\s$/.test(s);
  };
  const fmt = (v) => {
    if (v === null || v === undefined) return "";
    if (typeof v === "boolean") return opts.rawBooleans ? String(v) : String(v);
    const s = String(v);
    return needs(s) ? esc + s.split(esc).join(esc + esc) + esc : s;
  };
  return rows.map((r) => r.map(fmt).join(d)).join(nl);
}

export function rowsFromObjects(arr) {
  const list = Array.isArray(arr) ? arr : [arr];
  const header = [];
  for (const obj of list) {
    for (const k of Object.keys(obj ?? {})) if (!header.includes(k)) header.push(k);
  }
  const rows = [header];
  for (const obj of list) rows.push(header.map((k) => flattenCell(obj?.[k])));
  return rows;
}
function flattenCell(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

export function objectsFromRows(rows, headerRow = true) {
  const header = headerRow ? rows[0] : Array.from({ length: rows[0]?.length || 0 }, (_, i) => `column_${i + 1}`);
  const body = headerRow ? rows.slice(1) : rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h || `column_${i + 1}`, coerce(r[i] ?? "")])));
}

export function toMarkdown(rows, { align } = {}) {
  if (!rows.length) return "";
  const esc = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, "<br>");
  const head = rows[0];
  const lines = [`| ${head.map(esc).join(" | ")} |`];
  lines.push(
    `| ${head
      .map((_, i) => {
        const a = Array.isArray(align) ? align[i] : align;
        return a === "right" ? "---:" : a === "center" ? ":--:" : a === "left" ? ":--" : "---";
      })
      .join(" | ")} |`
  );
  for (const r of rows.slice(1)) lines.push(`| ${head.map((_, i) => esc(r[i] ?? "")).join(" | ")} |`);
  return lines.join("\n");
}

export function fromMarkdown(text) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"));
  return lines
    .filter((l) => !/^\|[\s:|-]+\|$/.test(l)) // drop the alignment row
    .map((l) =>
      l
        .replace(/^\||\|$/g, "")
        .split(/(?<!\\)\|/)
        .map((c) => c.trim().replace(/\\\|/g, "|").replace(/<br>/gi, "\n"))
    );
}

export function transpose(rows) {
  const width = rows.reduce((n, r) => Math.max(n, r.length), 0);
  return Array.from({ length: width }, (_, i) => rows.map((r) => (r[i] === undefined ? "" : r[i])));
}

export function columnStats(rows, header = true) {
  const body = header ? rows.slice(1) : rows;
  const names = header ? rows[0] ?? [] : Array.from({ length: rows[0]?.length || 0 }, (_, i) => `column_${i + 1}`);
  return names.map((name, i) => {
    const cells = body.map((r) => (r[i] ?? "").toString());
    const nonEmpty = cells.filter((c) => c.trim() !== "");
    const numeric = nonEmpty.filter((c) => /^-?\d*\.?\d+(e[-+]?\d+)?$/i.test(c.trim())).map(Number);
    const isNumeric = numeric.length > 0 && numeric.length >= nonEmpty.length * 0.8;
    const counts = new Map();
    for (const c of nonEmpty) counts.set(c, (counts.get(c) || 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const maxLen = nonEmpty.reduce((n, c) => Math.max(n, c.length), 0);
    return {
      name: name || `column_${i + 1}`,
      index: i,
      cells: cells.length,
      empties: cells.length - nonEmpty.length,
      unique: counts.size,
      dupes: nonEmpty.length - counts.size,
      maxLen,
      isNumeric,
      min: isNumeric ? Math.min(...numeric) : null,
      max: isNumeric ? Math.max(...numeric) : null,
      sum: isNumeric ? numeric.reduce((a, b) => a + b, 0) : null,
      avg: isNumeric ? numeric.reduce((a, b) => a + b, 0) / numeric.length : null,
      top: top.map(([v, n]) => ({ value: v, count: n })),
    };
  });
}

export function sortRows(rows, colIndex, { desc = false, numeric = "auto", header = true, column } = {}) {
  const idx = Number.isInteger(colIndex) ? colIndex : (rows[0] || []).indexOf(column);
  if (idx < 0) return rows.map((r) => r.slice());
  const body = header ? rows.slice(1) : rows;
  const val = (r) => (r[idx] ?? "").trim();
  const useNum = numeric === true || (numeric === "auto" && body.every((r) => val(r) === "" || /^-?\d*\.?\d+$/.test(val(r))));
  const sorted = [...body].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    if (x === y) return 0;
    if (x === "") return 1;
    if (y === "") return -1;
    const c = useNum ? Number(x) - Number(y) : x.localeCompare(y, undefined, { numeric: false, sensitivity: "base" });
    return desc ? -c : c;
  });
  return header ? [rows[0], ...sorted] : sorted;
}

export function filterRows(rows, { column, op = "=", value = "", caseSensitive = false, header = true } = {}) {
  const body = header ? rows.slice(1) : rows;
  const head = header ? rows[0] : null;
  if (value === "" && op !== "empty" && op !== "!empty") return { rows, matched: body.length };
  // The select can hand us a header name or an index; accepting only one of the
  // two means a filter that quietly matches every row when the two disagree.
  let idx = -1;
  if (column !== "" && column !== null && column !== undefined) {
    idx = head ? head.indexOf(column) : -1;
    if (idx < 0) {
      const asNum = Number(column);
      if (Number.isInteger(asNum) && asNum >= 0) idx = asNum;
    }
  }
  const cols = idx >= 0 ? [idx] : head ? head.map((_, i) => i) : body[0] ? body[0].map((_, i) => i) : [];
  const needle = caseSensitive ? value : value.toLowerCase();
  const testCell = (cell) => {
    const c = caseSensitive ? cell : cell.toLowerCase();
    switch (op) {
      case "=":
        return c === needle;
      case "!=":
        return c !== needle;
      case "~":
        return c.includes(needle);
      case "!~":
        return !c.includes(needle);
      // A blank or non-numeric cell is not "zero", and ">" on a text column has no
      // honest answer either — so those rows simply do not match.
      case ">": {
        const n = Number(cell);
        const m = Number(value);
        return cell.trim() !== "" && Number.isFinite(n) && Number.isFinite(m) ? n > m : false;
      }
      case "<": {
        const n = Number(cell);
        const m = Number(value);
        return cell.trim() !== "" && Number.isFinite(n) && Number.isFinite(m) ? n < m : false;
      }
      case "empty":
        return cell.trim() === "";
      case "!empty":
        return cell.trim() !== "";
      case "regex":
        try {
          return new RegExp(value, caseSensitive ? "" : "i").test(cell);
        } catch {
          return false;
        }
      default:
        return false;
    }
  };
  const matched = body.filter((r) => cols.some((i) => testCell(String(r[i] ?? ""))));
  return { rows: head ? [head, ...matched] : matched, matched: matched.length };
}

export function dedupeRows(rows, { header = true, key = null } = {}) {
  const body = header ? rows.slice(1) : rows;
  const seen = new Set();
  const out = [];
  let removed = 0;
  for (const r of body) {
    const k = key == null ? r.join("\u0000") : typeof key === "function" ? String(key(r) ?? "") : String(r[key] ?? "");
    if (seen.has(k)) {
      removed++;
      continue;
    }
    seen.add(k);
    out.push(r);
  }
  return { rows: header ? [rows[0], ...out] : out, removed };
}

const NBSP = /[\u00a0\u2007\u202f]/g;
export function cleanCells(rows, { trim = true, collapse = true, unifyQuotes = true, stripNbsp = true } = {}) {
  return rows.map((r) =>
    r.map((cell) => {
      let c = String(cell ?? "");
      if (stripNbsp) c = c.replace(NBSP, " ");
      if (unifyQuotes) c = c.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, "-");
      if (collapse) c = c.replace(/[ \t]{2,}/g, " ");
      if (trim) c = c.trim();
      return c;
    })
  );
}

/* ---------------- UI ---------------- */
if (typeof document !== "undefined" && typeof window !== "undefined") boot().catch((err) => console.warn(err));

async function boot() {
  const shell = await import("../shell.js");
  const { $, $$, toast, copyText, downloadText, debounce } = shell;
  shell.bootTool();

  const src = $("#src");
  let parsed = null;

  src.value =
    localStorage.getItem("bench.csv.last") ||
    "name,team,score,joined\nAsha,Blue,42,2024-03-11\nBikram,Red,37,2023-11-02\nChhaya,Blue,42,2025-01-19\nDeepa,Green,,2025-06-30\nBikram,Red,37,2023-11-02";

  function render() {
    const opts = {
      delimiter: $("#delim").value,
      header: $("#hasHeader").checked,
      type: $("#typed").checked,
    };
    parsed = parseTable(src.value, opts);
    const dl = $("#delimInfo");
    dl.textContent = parsed.delimiterName;
    $("#meta").innerHTML = [
      ["rows", parsed.rowCount],
      ["cols", parsed.colCount],
      ["width", parsed.width],
      ["issues", parsed.errors.length],
    ]
      .map(([k, v]) => `<div class="statbox"><span class="stat-label">${k}</span><b>${v}</b></div>`)
      .join("");
    $("#issues").hidden = !parsed.errors.length;
    $("#issues").innerHTML = parsed.errors.map((e) => `<p>⚠ ${shell.escapeHtml(e)}</p>`).join("");

    // column selector for sort/filter
    const sel = $("#filterCol");
    const prev = sel.value;
    sel.innerHTML =
      `<option value="">any column</option>` +
      parsed.header.map((h, i) => `<option value="${shell.escapeHtml(h)}">${shell.escapeHtml(h || `column_${i + 1}`)}</option>`).join("");
    if (prev && parsed.header.includes(prev)) sel.value = prev;

    const sortSel = $("#sortCol");
    sortSel.innerHTML = parsed.header
      .map((h, i) => `<option value="${i}">${shell.escapeHtml(h || `column_${i + 1}`)}</option>`)
      .join("");

    renderView();
  }

  function currentRows() {
    let rows = parsed.rows;
    if ($("#hasHeader").checked) rows = [parsed.header, ...rows];
    const value = $("#filterVal").value;
    if (value !== "" || ["empty", "!empty"].includes($("#filterOp").value)) {
      rows = filterRows(rows, {
        column: $("#filterCol").value,
        op: $("#filterOp").value,
        value,
        caseSensitive: $("#caseSen").checked,
      }).rows;
    }
    if ($("#sortDir").value !== "") {
      rows = sortRows(rows, Number($("#sortCol").value), { desc: $("#sortDir").value === "desc", header: true });
    }
    return rows;
  }

  function renderView() {
    const rows = currentRows();
    const grid = $("#grid");
    const shown = rows.slice(0, 300);
    grid.innerHTML =
      `<thead><tr>${(shown[0] || []).map((h) => `<th>${shell.escapeHtml(h)}</th>`).join("")}</tr></thead>` +
      `<tbody>${shown
        .slice(1)
        .map(
          (r) =>
            `<tr>${r
              .map((c) => `<td data-type="${/^-?\d*\.?\d+$/.test(String(c).trim()) ? "number" : c === "" ? "empty" : ""}">${shell.escapeHtml(c)}</td>`)
              .join("")}</tr>`
        )
        .join("")}</tbody>`;
    $("#rowNote").textContent = rows.length > 300 ? `showing 300 of ${rows.length - 1} rows` : `${Math.max(0, rows.length - 1)} rows`;
    const stats = columnStats(rows, true);
    $("#stats").innerHTML =
      `<thead><tr><th>column</th><th>unique</th><th>empty</th><th>dupes</th><th>max len</th><th>numeric</th><th>min / max</th><th>avg</th><th>top values</th></tr></thead><tbody>` +
      stats
        .map(
          (s) =>
            `<tr><td>${shell.escapeHtml(s.name)}</td><td data-type="number">${s.unique}</td><td data-type="number">${s.empties}</td><td data-type="number">${s.dupes}</td><td data-type="number">${s.maxLen}</td><td>${
              s.isNumeric ? '<span class="pill is-pass">yes</span>' : '<span class="pill is-neutral">text</span>'
            }</td><td class="mono">${s.isNumeric ? `${fmt(s.min)} / ${fmt(s.max)}` : "—"}</td><td class="mono">${s.isNumeric ? fmt(s.avg) : "—"}</td><td>${s.top
              .map((t) => `<span class="pill is-neutral">${shell.escapeHtml(t.value.slice(0, 18))} ×${t.count}</span>`)
              .join(" ")}</td></tr>`
        )
        .join("") +
      `</tbody>`;
    const out = $("#out");
    const kind = $$("#export .tbtn.is-on")[0]?.dataset.kind || "csv";
    out.textContent = exportAs(rows, kind);
  }

  const fmt = (n) => (n === null || n === undefined ? "—" : Number.isInteger(n) ? String(n) : String(+n.toFixed(2)));

  function exportAs(rows, kind) {
    switch (kind) {
      case "tsv":
        return stringifyTable(rows, { delimiter: "\t" });
      case "md":
        return toMarkdown(rows);
      case "html":
        return `<table>\n${rows
          .map((r, i) => `  <tr>${r.map((c) => `<${i === 0 ? "th" : "td"}>${String(c).replace(/[<>&]/g, (ch) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[ch]))}</${i === 0 ? "th" : "td"}>`).join("")}</tr>`)
          .join("\n")}\n</table>`;
      case "sql": {
        const head = rows[0] || [];
        const cols = head.map((h, i) => (h || `column_${i + 1}`).replace(/[^\w]/g, "_").toLowerCase());
        const table = ($("#tableName").value || "bench_table").replace(/[^\w.]/g, "_");
        const vals = (r) =>
          r
            .map((c) => {
              if (c === "" ) return "NULL";
              if (/^-?\d+(\.\d+)?$/.test(c)) return c;
              return `'${String(c).replace(/'/g, "''")}'`;
            })
            .join(", ");
        return `insert into ${table} (${cols.join(", ")}) values\n${rows.slice(1).map((r) => `  (${vals(r)})`).join(",\n")};`;
      }
      case "json":
        return JSON.stringify(objectsFromRows(rows, true), null, 2);
      default:
        return stringifyTable(rows);
    }
  }

  $$("#export .tbtn").forEach((btn) =>
    btn.addEventListener("click", () => {
      $$("#export .tbtn").forEach((b) => b.classList.toggle("is-on", b === btn));
      renderView();
    })
  );

  src.addEventListener(
    "input",
    debounce(() => {
      render();
      try {
        localStorage.setItem("bench.csv.last", src.value.slice(0, 300000));
      } catch {
        /* quota */
      }
    }, 200)
  );
  $$("#controls select, #controls input").forEach((n) => n.addEventListener("change", () => (n === src ? render() : renderView())));

  $("#transpose").addEventListener("click", () => {
    const rows = currentRows();
    src.value = stringifyTable(transpose(rows));
    render();
    toast("Rows and columns swapped.", "ok", 2000);
  });
  $("#dedupe").addEventListener("click", () => {
    const rows = currentRows();
    const res = dedupeRows(rows, { header: $("#hasHeader").checked });
    src.value = stringifyTable(res.rows);
    render();
    toast(res.removed ? `Removed ${res.removed} duplicate row(s).` : "No duplicate rows found.", res.removed ? "ok" : "info", 2600);
  });
  $("#clean").addEventListener("click", () => {
    const rows = currentRows();
    src.value = stringifyTable(cleanCells(rows));
    render();
    toast("Trimmed cells, collapsed runs of spaces, normalised smart quotes.", "ok", 2800);
  });
  $("#toMarkdown").addEventListener("click", () => {
    $$("#export .tbtn").forEach((b) => b.classList.toggle("is-on", b.dataset.kind === "md"));
    renderView();
  });
  $("#copyOut").addEventListener("click", () => copyText($("#out").textContent, "Copied."));
  $("#downloadOut").addEventListener("click", () => {
    const kind = $$("#export .tbtn.is-on")[0]?.dataset.kind || "csv";
    downloadText(`bench-table.${kind === "md" ? "md" : kind === "json" ? "json" : kind}`, $("#out").textContent);
  });
  $("#fileIn").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    src.value = await file.text();
    render();
    toast(`Loaded ${file.name} locally — it was never uploaded.`, "ok", 3200);
  });

  render();
}
