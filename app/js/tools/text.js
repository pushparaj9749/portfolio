/* =========================================================
   Tool · Text
   Pure transforms (exported, unit-tested in Node) + the page UI.
   ========================================================= */

export const CASES = [
  { id: "upper", label: "UPPER" },
  { id: "lower", label: "lower" },
  { id: "title", label: "Title Case" },
  { id: "sentence", label: "Sentence case" },
  { id: "kebab", label: "kebab-case" },
  { id: "snake", label: "snake_case" },
  { id: "constant", label: "CONSTANT_CASE" },
  { id: "camel", label: "camelCase" },
  { id: "pascal", label: "PascalCase" },
  { id: "invert", label: "iNVERSE cASE" },
  { id: "smallcaps", label: "sᴍᴀʟʟ ᴄᴀᴘs" },
  { id: "fullwidth", label: "ＦＵＬＬＷＩＤＴＨ" },
];

const SMALL_CAPS = "ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋᴍɴᴏᴘqʀsᴛᴜᴠᴡxyᴢ";

export function convertCase(text, kind) {
  const t = String(text ?? "");
  const words = (s) => s.match(/[^\s]+/g) || [];
  switch (kind) {
    case "upper":
      return t.toUpperCase();
    case "lower":
      return t.toLowerCase();
    case "title":
      return t
        .toLowerCase()
        .replace(/(^|[\s("'`[({])([a-z\u00c0-\u024f])/g, (_m, pre, ch) => pre + ch.toUpperCase());
    case "sentence":
      return t
        .toLowerCase()
        .replace(/(^\s*[a-z\u00c0-\u024f])|([.!?]\s+([a-z\u00c0-\u024f]))/g, (m) => m.toUpperCase());
    case "kebab":
      return words(t.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[^A-Za-z0-9\u00c0-\u024f]+/g, " "))
        .join("-")
        .toLowerCase();
    case "snake":
      return words(t.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[^A-Za-z0-9\u00c0-\u024f]+/g, " "))
        .join("_")
        .toLowerCase();
    case "constant":
      return words(t.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[^A-Za-z0-9]+/g, " "))
        .join("_")
        .toUpperCase();
    case "camel": {
      const parts = words(t.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[^A-Za-z0-9]+/g, " "));
      return parts
        .map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()))
        .join("");
    }
    case "pascal":
      return words(t.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[^A-Za-z0-9]+/g, " "))
        .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
        .join("");
    case "invert":
      return [...t]
        .map((c) => (c === c.toUpperCase() && c !== c.toLowerCase() ? c.toLowerCase() : c === c.toLowerCase() ? c.toUpperCase() : c))
        .join("");
    case "smallcaps":
      return [...t.toLowerCase()].map((c) => {
        const i = "abcdefghijklmnopqrstuvwxyz".indexOf(c);
        return i > -1 ? SMALL_CAPS[i] : c;
      }).join("");
    case "fullwidth":
      return [...t]
        .map((c) => {
          const code = c.codePointAt(0);
          if (code === 32) return " ";
          if (code >= 33 && code <= 126) return String.fromCodePoint(code + 0xfee0);
          return c;
        })
        .join("");
    default:
      return t;
  }
}

/** Natural compare so "item-2" sorts before "item-10". */
export function naturalCompare(a, b) {
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export function lineOp(text, op, opts = {}) {
  const nl = String(text ?? "").includes("\r\n") ? "\r\n" : "\n";
  const raw = String(text ?? "").split(/\r?\n/);
  // Ops that compare lines (sort, dedupe, count) want them trimmed so " a" and "a"
  // are the same thing. Ops that *edit* lines must not, or indenting a block of
  // code would quietly flatten every line in the file.
  const PRESERVES_INDENT = new Set(["keep", "indent", "outdent", "wrap", "prefixSuffix", "number", "stripNumbers", "joinNone"]);
  const preserves = PRESERVES_INDENT.has(op);
  const trim = opts.trim !== undefined ? opts.trim !== false : !preserves;
  const lines = trim ? raw.map((l) => l.trim()) : raw.slice();
  const out = [];
  switch (op) {
    case "keep":
      return raw.join(nl);
    case "sort": {
      // "ignore case" is tie-broken by the real text, so "Banana" and "apple" sort
      // a/A together without making equal-case lines swap unpredictably.
      const cmp = (a, b) =>
        opts.caseInsensitive
          ? naturalCompare(a.toLowerCase(), b.toLowerCase()) || naturalCompare(a, b)
          : naturalCompare(a, b);
      return [...lines].sort(opts.desc ? (a, b) => -cmp(a, b) : cmp).join(nl);
    }
    case "sortLength": {
      const cmp = (a, b) => a.length - b.length || naturalCompare(a, b);
      return [...lines].sort(opts.desc ? (a, b) => -cmp(a, b) : cmp).join(nl);
    }
    case "shuffle": {
      const arr = lines.slice();
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr.join(nl);
    }
    case "reverse":
      return [...lines].reverse().join(nl);
    case "dedupe": {
      const seen = new Set();
      for (const l of lines) {
        const key = opts.caseInsensitive ? l.toLowerCase() : l;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(l);
      }
      return out.join(nl);
    }
    case "dupesOnly": {
      const counts = new Map();
      for (const l of lines) {
        const key = opts.caseInsensitive ? l.toLowerCase() : l;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const shown = new Set();
      for (const l of lines) {
        const key = opts.caseInsensitive ? l.toLowerCase() : l;
        if ((counts.get(key) || 0) > 1 && !shown.has(key)) {
          shown.add(key);
          out.push(l);
        }
      }
      return out.join(nl);
    }
    case "uniqOnly": {
      const counts = new Map();
      for (const l of lines) {
        const key = opts.caseInsensitive ? l.toLowerCase() : l;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      return lines.filter((l) => counts.get(opts.caseInsensitive ? l.toLowerCase() : l) === 1).join(nl);
    }
    case "dropEmpty":
      return lines.filter((l) => l.length > 0).join(nl);
    case "keepEmpty":
      return raw.filter((l) => l.trim().length === 0).join(nl);
    case "number": {
      const start = Number(opts.start ?? 1);
      const step = Number(opts.step ?? 1);
      return lines.map((l, i) => `${start + i * step}. ${l}`).join(nl);
    }
    case "stripNumbers":
      return lines.map((l) => l.replace(/^\s*\d+[.)]:?\s*/, "")).join(nl);
    case "indent": {
      const size = Number(opts.size ?? 2);
      const pad = opts.tabs ? "\t" : " ".repeat(Math.max(0, size));
      return lines.map((l) => (l.length ? pad + l : l)).join(nl);
    }
    case "outdent": {
      // The inverse of `indent`, and of how editors do Shift+Tab: remove the
      // *common* indentation so a pasted block keeps its internal structure
      // instead of being flattened to column zero.
      const filled = lines.filter((l) => l.trim().length);
      const width = (l) => (l.match(/^[\t ]*/)?.[0].length ?? 0);
      const common = opts.size != null ? Number(opts.size) : filled.length ? Math.min(...filled.map(width)) : 0;
      return lines.map((l) => l.slice(Math.min(common, width(l)))).join(nl);
    }
    case "stripAllSpace":
      return lines.map((l) => l.replace(/\s+/g, " ").trim()).join(nl);
    case "wrap": {
      const width = Math.max(10, Number(opts.width ?? 80));
      const paras = String(text ?? "").split(/\n{2,}/);
      return paras
        .map((p) =>
          p
            .replace(/\s+/g, " ")
            .trim()
            .split(" ")
            .reduce((acc, w) => {
              // acc[-1] is a property, not an array slot — an earlier version of
              // this lost every word before the first overflow by assigning there.
              if (!acc.length) acc.push(w);
              else if ((acc[acc.length - 1] + " " + w).length > width) acc.push(w);
              else acc[acc.length - 1] += " " + w;
              return acc;
            }, [])
            .join(nl)
        )
        .join(nl + nl);
    }
    case "prefixSuffix":
      return lines
        .filter((l) => l.length)
        .map((l) => `${opts.prefix ?? ""}${l}${opts.suffix ?? ""}`)
        .join(nl);
    case "joinSpaces":
      return lines.filter(Boolean).join(" ");
    case "joinNone":
      return lines.filter(Boolean).join("");
    case "asArray":
      return `[${lines.filter(Boolean).map((l) => JSON.stringify(l)).join(", ")}]`;
    case "asSqlList":
      return lines.filter(Boolean).map((l) => `'${l.replace(/'/g, "''")}'`).join(", ");
    case "quoteCsv":
      // Each *line* becomes one CSV field — the case where you paste a column of
      // addresses full of commas and want the whole line quoted, not split.
      return lines
        .filter(Boolean)
        .map((l) => (/[",\n]/.test(l) ? `"${l.replace(/"/g, '""')}"` : l))
        .join(nl);
    default:
      return raw.join(nl);
  }
}

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0", en: "–", em: "—",
  hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»",
  deg: "°", plusmn: "±", times: "×", divide: "÷", middot: "·", bull: "•", dagger: "†",
  euro: "€", pound: "£", yen: "¥", cent: "¢", copy: "©", reg: "®", trade: "™",
  sect: "§", para: "¶", mdash: "—", ndash: "–", frac12: "½", frac14: "¼", sup2: "²", sup3: "³",
};

export function decodeEntities(s) {
  return String(s ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_m, h) => safeCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d) => safeCode(Number(d)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => (name in ENTITIES ? ENTITIES[name] : m));
}
const safeCode = (n) => (Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "");

export function escapeEntities(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => `&${{ "&": "amp", "<": "lt", ">": "gt", '"': "quot", "'": "apos" }[c]};`);
}

export function stripTags(s) {
  return decodeEntities(
    String(s ?? "")
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
      .replace(/<[^>]*>/g, "")
  ).replace(/\n{3,}/g, "\n\n").trim();
}

export function slugify(s) {
  return String(s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

export function base64(s, urlSafe = false) {
  const bytes = new TextEncoder().encode(String(s ?? ""));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  let out = btoa(bin);
  if (urlSafe) out = out.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return out;
}

export function unBase64(s, urlSafe = false) {
  let str = String(s ?? "").trim().replace(/\s+/g, "");
  if (urlSafe || /[-_]/.test(str)) str = str.replace(/-/g, "+").replace(/_/g, "/");
  str += "=".repeat((4 - (str.length % 4)) % 4);
  const bin = atob(str);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

export function findReplace(text, pattern, flags, replacement) {
  const t = String(text ?? "");
  if (!pattern) return { output: t, count: 0 };
  let re;
  try {
    const f = String(flags || "");
    re = new RegExp(pattern, f.includes("g") ? f : f + "g");
  } catch (err) {
    return { error: String(err.message || err).replace(/^Invalid regular expression:\s*:?\s*/i, "") };
  }
  // Count with the same engine that replaces, so `$1` style refs still work in the output.
  const matches = t.match(re);
  const count = matches ? matches.length : 0;
  let output;
  try {
    output = t.replace(re, String(replacement ?? ""));
  } catch {
    output = t;
    return { output, count, error: `Replacement failed: ${err.message}` };
  }
  return { output, count };
}

export function stats(text) {
  const t = String(text ?? "");
  const chars = [...t].length; // grapheme-ish: code points, so Devanagari/CJK count once
  // \p{M} keeps a consonant-vowel sign cluster (क्, ि, ে) inside one word.
  const words = (t.match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}'’\-_]*/gu) || []).length;
  const lines = t.length ? t.split(/\r?\n/).length : 0;
  const paragraphs = (t.split(/\n{2,}/).filter((p) => p.trim().length)).length;
  const sentences = (t.match(/[^.!?\n]+[.!?]+|[^.!?\n]+$/g) || []).filter((s) => s.trim()).length;
  const bytes = new TextEncoder().encode(t).length;
  const nonLatin = (t.match(/[^\u0000-\u007f]/g) || []).length;
  const longestLine = t.split(/\r?\n/).reduce((n, l) => Math.max(n, l.length), 0);
  return {
    chars,
    charsNoSpaces: chars - (t.match(/\s/g) || []).length,
    words,
    lines,
    paragraphs,
    sentences,
    bytes,
    nonLatin,
    longestLine,
    avgWordLen: words ? +(t.replace(/\s+/g, " ").trim().length / words).toFixed(1) : 0,
    readingMin: +(words / 220).toFixed(1),
    uniqWords: new Set((t.toLowerCase().match(/[\p{L}\p{N}\p{M}']+/gu) || [])).size,
  };
}

/* ---------------- UI ---------------- */
if (typeof document !== "undefined" && typeof window !== "undefined") boot().catch((err) => console.warn(err));

async function boot() {
  const shell = await import("../shell.js");
  shell.bootTool();
  initText(shell);
}

function initText({ $, $$, toast, copyText, downloadText, debounce }) {
  const src = $("#src");
  const out = $("#out");
  const opts = {};

  const apply = (fn) => {
    out.textContent = fn();
    out.classList.remove("is-error");
    paintStats();
  };

  function paintStats() {
    const s = stats(src.value);
    for (const [k, v] of Object.entries(s)) {
      const node = $(`[data-stat="${k}"]`);
      if (node) node.textContent = String(v);
    }
    const co = $("[data-count-out]");
    if (co) co.textContent = `${[...out.textContent].length} chars`;
  }

  // case buttons
  $$("#caseRow .tbtn").forEach((btn) => {
    btn.addEventListener("click", () => apply(() => convertCase(src.value, btn.dataset.case)));
  });

  // line ops
  $$("#lineRow .tbtn").forEach((btn) =>
    btn.addEventListener("click", () => {
      opts.caseInsensitive = $("#optCi")?.checked;
      opts.desc = $("#optDesc")?.checked;
      apply(() => lineOp(src.value, btn.dataset.op, opts));
    })
  );

  // misc transforms
  $("#slug").addEventListener("click", () => apply(() => slugify(src.value)));
  $("#stripTags").addEventListener("click", () => apply(() => stripTags(src.value)));
  $("#escapeHtml").addEventListener("click", () => apply(() => escapeEntities(src.value)));
  $("#decodeHtml").addEventListener("click", () => apply(() => decodeEntities(src.value)));
  $("#b64").addEventListener("click", () => apply(() => base64(src.value, $("#optUrlSafe")?.checked)));
  $("#unb64").addEventListener("click", () =>
    apply(() => {
      try {
        return unBase64(src.value, $("#optUrlSafe")?.checked);
      } catch {
        out.classList.add("is-error");
        return "Not valid base64 — check for stray characters or missing padding.";
      }
    })
  );
  $("#urlEnc").addEventListener("click", () => apply(() => encodeURIComponent(src.value)));
  $("#urlDec").addEventListener("click", () =>
    apply(() => {
      try {
        return decodeURIComponent(src.value);
      } catch {
        return "%-escape sequence is malformed.";
      }
    })
  );

  // find / replace
  const runFindReplace = debounce(() => {
    const res = findReplace(src.value, $("#find").value, $("#flags").value, $("#repl").value);
    if (res.error) {
      out.textContent = `Regex error: ${res.error}`;
      out.classList.add("is-error");
      const rc = $("#rrCount");
      if (rc) rc.textContent = "—";
      return;
    }
    out.classList.remove("is-error");
    out.textContent = res.output;
    const rc = $("#rrCount");
    if (rc) rc.textContent = `${res.count} match${res.count === 1 ? "" : "es"}`;
    paintStats();
  }, 200);
  ["#find", "#repl", "#flags"].forEach((sel) => $(sel).addEventListener("input", runFindReplace));

  // wrap / number / prefix use their fields
  $("#wrapBtn")?.addEventListener("click", () =>
    apply(() => lineOp(src.value, "wrap", { width: Number($("#wrapWidth").value) || 80 }))
  );
  $("#numBtn")?.addEventListener("click", () =>
    apply(() => lineOp(src.value, "number", { start: Number($("#numStart").value) || 1, step: Number($("#numStep").value) || 1 }))
  );
  $("#psBtn")?.addEventListener("click", () =>
    apply(() => lineOp(src.value, "prefixSuffix", { prefix: $("#prefix").value, suffix: $("#suffix").value }))
  );

  $("#copyOut").addEventListener("click", () => copyText(out.textContent, "Result copied."));
  $("#downloadOut").addEventListener("click", () => downloadText("bench-text.txt", out.textContent));
  $("#useOut").addEventListener("click", () => {
    src.value = out.textContent;
    paintStats();
    toast("Result moved to the input — chain another operation.", "ok", 2200);
  });
  $("#swap").addEventListener("click", () => {
    const a = src.value;
    src.value = out.textContent;
    out.textContent = a;
    paintStats();
  });
  $("#pasteIn").addEventListener("click", async () => {
    try {
      src.value = await navigator.clipboard.readText();
      paintStats();
    } catch (err) {
      toast("Clipboard read needs permission — paste with Ctrl/Cmd+V instead.", "err", 4600);
    }
  });
  $("#clearAll").addEventListener("click", () => {
    src.value = "";
    out.textContent = "";
    paintStats();
    src.focus();
  });

  src.addEventListener("input", debounce(paintStats, 120));
  src.value = localStorage.getItem("bench.text.last") || "";
  src.addEventListener(
    "input",
    debounce(() => {
      try {
        localStorage.setItem("bench.text.last", src.value.slice(0, 200000));
      } catch {
        /* quota */
      }
    }, 700)
  );

  // Tab inserts two spaces instead of leaving the field.
  src.addEventListener("keydown", (e) => {
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const { selectionStart: s, selectionEnd: en } = src;
      src.setRangeText("  ", s, en, "end");
      src.dispatchEvent(new Event("input"));
    }
  });

  if (!src.value) src.value = "banana, Apple, cherry\napple\n  already-trimmed  \n\nzebra\nitem-10\nitem-2";
  paintStats();
}
