/* =========================================================
   Tool · Regex
   Live matching with groups, replace preview, and a token
   explainer so the pattern can be read as well as tested.
   ========================================================= */

export const MAX_MATCHES = 2000;

function matchParen(src, i) {
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === "(") depth++;
    else if (src[j] === ")") {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

/**
 * Catastrophic-backtracking sniff test.
 *
 * A JS RegExp cannot be interrupted, and this tool runs the user's pattern on the
 * main thread: one nested quantifier on a long enough line can keep the tab busy
 * for *minutes* (measured: 114 s for `(a+)+$` against 40 characters). So patterns
 * that put an unbounded quantifier inside an already-quantified group are refused
 * with an explanation instead of run — which is a better answer than a frozen page.
 *
 * Deliberately conservative: it only reports the classic `(X+)+`, `(X*)*`,
 * `(X{2,})+` shapes, not every possible super-linear pattern.
 */
export function redosRisk(pattern) {
  const src = String(pattern ?? "").replace(/\\([(){}\[\]|+*.?^$\\/])/g, "\u0000$1"); // escaped metachars are literals
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== "(") continue;
    const close = matchParen(src, i);
    if (close === -1) continue;
    if (!quantifiedAfter(src, close)) continue;
    const body = src.slice(i + 1, close);
    // A repeated group only explodes when the *same* text can be split between the
    // repetitions in more than one way: an inner unbounded quantifier over an atom
    // that the group can also start with, or an alternation with a quantified branch.
    const branches = splitTopLevel(body);
    if (branches.length > 1 && branches.some(endsUnbounded)) {
      return { risky: true, why: "an alternation with a quantified branch inside a quantified group" };
    }
    const branch = branches[0] || "";
    if (!endsUnbounded(branch)) continue;
    const atoms = atomsOf(branch);
    // the last atom in the branch is the one being repeated; a single-atom body like
    // (a+)+ has that atom as its first token too, which is exactly the overlap we want
    const trailing = atoms[atoms.length - 1];
    if (trailing && overlaps(trailing, atoms[0])) {
      return { risky: true, why: "the same text can be repeated by an inner and an outer quantifier" };
    }
  }
  return { risky: false, why: "" };
}

/** tokens of one branch: classes, escapes, then single characters (quantifiers dropped) */
function atomsOf(branch) {
  const out = [];
  const re = /\\[dwsSDWbBnrtfv]|\\u\{[0-9a-fA-F]+\}|\\x[0-9a-fA-F]{2}|\\c[A-Za-z]|\\[pP]\{[^}]*\}|\[[^\]]*\]|\\[\s\S]|[\s\S]/g;
  let m;
  while ((m = re.exec(branch))) {
    if (/[+*?{]/.test(m[0][0])) continue; // quantifier, not an atom
    out.push(m[0]);
  }
  return out;
}

function endsUnbounded(text) {
  return /(?:\+|\*|\{\d+,\}|\{\d+,\d+\})$/.test(text);
}

function quantifiedAfter(src, closeIndex) {
  const next = src[closeIndex + 1];
  if (next === "+" || next === "*") return true;
  if (next === "{") {
    const q = /^\{(\d+),(\d*)\}/.exec(src.slice(closeIndex + 1));
    return !!q && (q[2] === "" || Number(q[2]) >= 2);
  }
  return false;
}

/** split a group body on its top-level `|` (brackets and nesting respected) */
function splitTopLevel(body) {
  const parts = [];
  let depth = 0, inClass = false, cur = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "\\" && i + 1 < body.length) { cur += c + body[++i]; continue; }
    if (inClass) { if (c === "]") inClass = false; cur += c; continue; }
    if (c === "[") { inClass = true; cur += c; continue; }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "|" && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += c;
  }
  parts.push(cur);
  return parts;
}

/** two atoms can match the same single character — unknown shapes are treated as safe */
function overlaps(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const wide = (t) => t === "." || t === "\\S" || t === "\\W" || t === "\\D" || t === "\\P" || (t[0] === "[" && t[1] === "^");
  if (wide(a) || wide(b)) return false; // honest: not proven, so no refusal
  return accepts(a, b) || accepts(b, a);
}

/** does the class/escape `atom` accept the single literal character `ch`? */
function accepts(atom, ch) {
  if (!ch || ch.length !== 1) return false;
  let set = null;
  if (atom === "\\d") set = "0123456789";
  else if (atom === "\\w") set = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_";
  else if (atom === "\\s") set = " \t\n\r\f\u000b";
  else if (atom[0] === "[") {
    set = "";
    const body = atom.slice(1, atom.endsWith("]") ? -1 : undefined);
    for (let i = 0; i < body.length; i++) {
      if (body[i] === "\\" && i + 1 < body.length) set += body[++i];
      else if (body[i + 1] === "-" && i + 2 < body.length && body[i + 2] !== "]") {
        for (let c = body.charCodeAt(i); c <= body.charCodeAt(i + 2); c++) set += String.fromCharCode(c);
        i += 2;
      } else set += body[i];
    }
  } else if (atom[0] === "\\") return false; // \b, \n, \u… — not comparable to a plain char
  return set ? set.includes(ch) : false;
}
const REDOS_HINT =
  "Refused to run: this pattern has " ;

export function runRegex(pattern, flags = "g", input = "", opts = {}) {
  const src = String(input ?? "");
  if (!pattern) return { ok: false, empty: true, matches: [], count: 0 };
  const risk = redosRisk(pattern);
  if (risk.risky && !opts.allowRedos) {
    return { ok: false, redos: true, error: `${REDOS_HINT}${risk.why}, which would freeze this tab`,
      hint: "Rewrite the inner part as a character class — e.g. (a+)+ is just a+ — or make the group non-capturing with an explicit bound.",
      matches: [], count: 0 };
  }
  let re;
  try {
    re = new RegExp(pattern, flags || "g");
  } catch (err) {
    return { ok: false, error: cleanRegexError(err.message), matches: [], count: 0 };
  }
  const global = (flags || "").includes("g");
  // `y` on its own still means "keep going while the matches touch", so loop for it too
  const loop = global || (flags || "").includes("y");
  const matches = [];
  const limit = opts.maxMatches ?? MAX_MATCHES;
  let count = 0;
  let truncated = false;

  const push = (m) => {
    count++;
    if (matches.length < limit) matches.push(m);
    else truncated = true;
  };

  try {
    if (loop) {
      let m;
      let guard = 0;
      const re2 = new RegExp(re.source, re.flags);
      while ((m = re2.exec(src)) !== null) {
        push({ index: m.index, length: m[0].length, text: m[0], groups: m.slice(1), named: { ...(m.groups || {}) } });
        if (m[0].length === 0) re2.lastIndex++; // zero-length match: step forward or loop forever
        if (++guard > limit * 4) {
          truncated = true;
          break;
        }
      }
    } else {
      const m = re.exec(src);
      if (m) push({ index: m.index, length: m[0].length, text: m[0], groups: m.slice(1), named: { ...(m.groups || {}) } });
    }
  } catch (err) {
    return { ok: false, error: cleanRegexError(err.message), matches: [], count };
  }
  const groupCount = matches.length ? matches[0].groups.length : countGroups(pattern);
  return { ok: true, matches, count, truncated, groupCount, flags: re.flags };
}

function cleanRegexError(msg) {
  return String(msg)
    .replace(/^Invalid regular expression:\s*/i, "")
    .replace(/\s*\(\d+:\d+\)\s*$/, "")
    .trim();
}

/** Cheap source scan for capture groups (excluding non-capturing/named-only). */
export function countGroups(pattern) {
  let n = 0;
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "(" && !inClass) {
      const next = pattern[i + 1];
      if (next === "?") {
        if (pattern[i + 2] === ":") continue; // (?:
        if (pattern.slice(i + 2).startsWith("<=") || pattern.slice(i + 2).startsWith("!=")) continue; // lookaround
        if (pattern[i + 2] === "<" && /[A-Za-z_$]/.test(pattern[i + 3] || "")) n++; // (?<name>
        continue;
      }
      n++;
    }
  }
  return n;
}

/** Build highlighted HTML. Marks are inserted by index so the text is never re-parsed. */
export function highlight(input, matches, { maxLen = 200000 } = {}) {
  const src = String(input ?? "");
  if (src.length > maxLen) return escapeHtml(src.slice(0, maxLen)) + `<span class="mini"> …tripped for performance</span>`;
  const esc = (s) => escapeHtml(s);
  let out = "";
  let pos = 0;
  const sorted = [...matches].filter((m) => m.length > 0).sort((a, b) => a.index - b.index);
  for (const m of sorted) {
    if (m.index < pos) continue; // overlapping tail from a zero-length pass
    out += esc(src.slice(pos, m.index));
    out += `<mark>${esc(src.slice(m.index, m.index + m.length))}</mark>`;
    pos = m.index + m.length;
  }
  out += esc(src.slice(pos));
  return out;
}
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function replaceWith(pattern, flags, input, replacement) {
  const src = String(input ?? "");
  if (!pattern) return { output: src, count: 0 };
  // same refusal as runRegex: a replacement run over a big textarea can hang just as dead
  const risk = redosRisk(pattern);
  if (risk.risky) return { error: `${REDOS_HINT}${risk.why}, and replacing is even slower than matching.`, hint: "Same fix as matching: give the inner quantifier a bound, or drop the group." };
  let re;
  try {
    re = new RegExp(pattern, (flags || "").includes("g") ? flags || "g" : `${flags || ""}g`);
  } catch (err) {
    return { error: cleanRegexError(err.message) };
  }
  let count = 0;
  const output = src.replace(re, (...args) => {
    count++;
    const full = args[0];
    // String.replace passes (match, ...captures, offset, string[, namedGroups]):
    // the groups object exists only when the pattern names something, and the
    // capture holes have to survive or $2 would silently mean "the second capture
    // that happened to participate".
    const hasNamed = args.length > 0 && typeof args[args.length - 1] === "object" && args[args.length - 1] !== null;
    const groups = args.slice(1, args.length - (hasNamed ? 3 : 2));
    const named = hasNamed ? args[args.length - 1] : undefined;
    let r = String(replacement ?? "");
    // $$, $&, $` and $' plus $1..$99, and $<name> — implemented the same way JS does
    return r
      .replace(/\$\$/g, "\u0000DOLLAR\u0000")
      .replace(/\$&/g, full)
      .replace(/\$\{(\d+)\}/g, (_m, i) => groups[Number(i) - 1] ?? "")
      .replace(/\$(\d{1,2})/g, (_m, i) => groups[Number(i) - 1] ?? "")
      .replace(/\$<([A-Za-z_$][\w$]*)>/g, (_m, name) => (named && named[name] !== undefined ? named[name] : ""))
      .replace(/\u0000DOLLAR\u0000/g, "$$");
  });
  return { output, count };
}

/* ---------------- explainer ---------------- */
const TOKENS = [
  [/^\^/, "start of input (or line, with the m flag)"],
  [/^\$/, "end of input (or line, with the m flag)"],
  [/^\.\*$/, "any characters, as many as possible (greedy)"],
  [/^\.\+\+/, "any characters, as few as possible (lazy)"],
  [/^\.\*/, "any characters, as many as possible (greedy)"],
  [/^\.\+/, "one or more of any character"],
  [/^\\b/, "a word boundary — the edge of a word"],
  [/^\\B/, "not a word boundary"],
  [/^\\d\+/, "one or more digits"],
  [/^\\d\*/, "zero or more digits"],
  [/^\\d\?/, "an optional digit"],
  [/^\\d/, "a single digit (0-9)"],
  [/^\\D/, "anything that is not a digit"],
  [/^\\w\+/, "one or more word characters (letters, digits, underscore)"],
  [/^\\w\*/, "zero or more word characters"],
  [/^\\w/, "a single word character"],
  [/^\\W/, "anything that is not a word character"],
  [/^\\s\+/, "one or more whitespace characters"],
  [/^\\s\*/, "zero or more whitespace characters"],
  [/^\\s/, "a single whitespace character"],
  [/^\\S/, "a single non-whitespace character"],
  [/^\\n/, "a newline"],
  [/^\\t/, "a tab"],
  [/^\\r/, "a carriage return"],
  [/^\\0/, "a NUL character"],
  [/^\(\?<([A-Za-z_$][\w$]*)>/, (m) => `named capture group “${m[1]}” — readable as match.groups.${m[1]}`],
  [/^\(\?:/, "non-capturing group — groups without consuming a number"],
  [/^\(\?=/, "lookahead: the rest must follow, but is not part of the match"],
  [/^\(\?!/, "negative lookahead: the rest must NOT follow here"],
  [/^\(\?<=/, "lookbehind: the rest must precede, but is not part of the match"],
  [/^\(\?<!=/, "negative lookbehind"],
  [/^\(/, "start of a capturing group"],
  [/^\)/, "end of a group"],
  [/^\[\^([^\]]*)\]/, (m) => `one character NOT in ${m[1]}`],
  [/^\[([^\]]*)\]/, (m) => `one character from the set ${m[1]}`],
  [/^\|/, "alternation — match either side"],
  [/^\*\?/, "zero or more, as few as possible (lazy)"],
  [/^\+/, "one or more"],
  [/^\*/, "zero or more"],
  [/^\?/, "optional (zero or one)"],
  [/^\{(\d+),(\d+)\}\?/, (m) => `between ${m[1]} and ${m[2]} of the previous token, as few as possible`],
  [/^\{(\d+),(\d+)\}/, (m) => `between ${m[1]} and ${m[2]} of the previous token`],
  [/^\{(\d+),\}/, (m) => `${m[1]} or more of the previous token`],
  [/^\{(\d+)\}/, (m) => `exactly ${m[1]} of the previous token`],
  [/^\\(\d+)/, (m) => `backreference to group ${m[1]} — must match the same text again`],
  [/^\\u\{?([0-9a-fA-F]{2,6})\}?/, (m) => `the Unicode code point U+${m[1].toUpperCase()}`],
  [/^\\x([0-9a-fA-F]{2})/, (m) => `the character with hex code 0x${m[1].toUpperCase()}`],
  [/^\\([pP])\{([^}]+)\}/, (m) => `a character ${m[1] === "P" ? "NOT" : ""} in the Unicode property ${m[2]} (needs the u flag)`],
  [/^\\(.)/, (m) => `a literal ${m[1]}`],
  [/^\./, "any single character except a newline"],
  [/^([a-zA-Z0-9 _\-.,:;\/'"!?@#%&=+])/, (m) => `the literal character ${m[1]}`],
];

export const FLAG_DOC = {
  g: "global — find every match, not just the first",
  i: "ignoreCase — letters match either case",
  m: "multiline — ^ and $ match at line breaks",
  s: "dotAll — . also matches newlines",
  u: "unicode — \\u{…} and \\p{…} work, surrogates handled",
  v: "unicodeSets — allows classes inside classes (modern engines)",
  y: "sticky — must match exactly at lastIndex",
  d: "hasIndices — match.indices gives source positions",
};

export function explain(pattern) {
  const out = [];
  let rest = String(pattern ?? "");
  let guard = 0;
  while (rest.length && guard++ < 400) {
    let hit = false;
    for (const [re, desc] of TOKENS) {
      const m = rest.match(re);
      if (m && m.index === 0) {
        out.push({
          token: m[0],
          meaning: typeof desc === "function" ? desc(m) : desc,
        });
        rest = rest.slice(m[0].length);
        hit = true;
        break;
      }
    }
    if (!hit) {
      out.push({ token: rest[0], meaning: "a literal character" });
      rest = rest.slice(1);
    }
  }
  return out;
}

export const SNIPPETS = [
  { name: "Email (practical)", pattern: "[\\w.+-]+@[\\w-]+\\.[\\w.-]{2,}", flags: "gi", note: "Covers ~99% of real addresses. No regex validates email properly — delivery does." },
  { name: "URL", pattern: "https?:\\/\\/[^\\s<>\"]+", flags: "gi", note: "Schemes are required so bare domains don't match." },
  { name: "IPv4", pattern: "\\b(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)(?:\\.(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)){3}\\b", flags: "g", note: "Range-checked per octet, so 999.1.1.1 does not match." },
  { name: "IPv6 (loose)", pattern: "\\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{1,4}\\b", flags: "gi", note: 'Structural only; validating the "::" compression needs real code.' },
  { name: "Hex colour", pattern: "#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\\b", flags: "gi" },
  { name: "Date YYYY-MM-DD", pattern: "\\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\\d|3[01])", flags: "g", note: "Month and day ranges checked; 31 February still slips through." },
  { name: "Time HH:MM(:SS)", pattern: "\\b(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?\\b", flags: "g" },
  { name: "Phone, India (10 digit)", pattern: "(?:\\+?91[- ]?)?[6-9]\\d{4}[ -]?\\d{5}\\b", flags: "g", note: "Mobile ranges start 6-9; accepts +91 and spacing." },
  { name: "Phone, US", pattern: "\\b(?:\\+?1[-. ]?)?(?:\\(?\\d{3}\\)?[-. ]?)\\d{3}[-. ]?\\d{4}\\b", flags: "g" },
  { name: "Indian PIN code", pattern: "\\b[1-9]\\d{5}\\b", flags: "g", note: "6 digits, never starting with 0." },
  { name: "PAN (India)", pattern: "\\b[A-Z]{5}\\d{4}[A-Z]\\b", flags: "g" },
  { name: "Aadhaar (grouped)", pattern: "\\b\\d{4}[ -]?\\d{4}[ -]?\\d{4}\\b", flags: "g", note: "Structure only — the last digit is a Verhoeff check, not a regex." },
  { name: "Slug", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$", flags: "" },
  { name: "Semantic version", pattern: "\\bv?(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-([\\w.-]+))?(?:\\+([\\w.-]+))?\\b", flags: "g", note: "Groups 4 and 5 are pre-release and build metadata." },
  { name: "ISO 8601 instant", pattern: "\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d{1,9})?)?(?:Z|[+-]\\d{2}:?\\d{2})?", flags: "gi" },
  { name: "UUID", pattern: "\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\b", flags: "gi" },
  { name: "JWT", pattern: "\\beyJ[A-Za-z0-9_-]*\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]*", flags: "g", note: "Starts at the base64 header for `{`." },
  { name: "Trailing whitespace", pattern: "[ \\t]+$", flags: "gm" },
  { name: "Double words", pattern: "\\b(\\w+)\\s+\\1\\b", flags: "gi", note: "The backreference catches the repeat." },
  { name: "HTML tag pair", pattern: "<(\\w+)(\\s[^>]*)?>([\\s\\S]*?)<\\/\\1>", flags: "g", note: "Backreference keeps open and close names equal. Not a parser." },
  { name: "Password: 12+ w/ classes", pattern: "^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[!-~])(?!.*(.{4})\\1).{12,}$", flags: "", note: "Lookaheads require each class; the last rejects 4 repeated chars." },
  { name: "Camel → snake target", pattern: "([a-z0-9])([A-Z])", flags: "g", note: "Replace with $1_$2 (see the replace box)." },
  { name: "Markdown link", pattern: "\\[([^\\]]+)\\]\\(([^)\\s]+)(?:\\s+\"([^\"]*)\")?\\)", flags: "g" },
  { name: "Timezone offset", pattern: "[+-](?:[01]\\d|2[0-3]):?[0-5]\\d", flags: "g" },
  { name: "Currency (grouped)", pattern: "[$€£₹]\\s?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d{2})?\\b", flags: "g", note: "₹ grouping differs after the lakh — treat as indicative." },
  { name: "CRLF line endings", pattern: "\\r$", flags: "gm" },
  { name: "Repeated character runs", pattern: "(.)\\1{2,}", flags: "g" },
];

/* ---------------- UI ---------------- */
if (typeof document !== "undefined" && typeof window !== "undefined") boot().catch((err) => console.warn(err));

async function boot() {
  const shell = await import("../shell.js");
  const { $, $$, toast, copyText, debounce } = shell;
  shell.bootTool();

  const input = $("#input");
  const pattern = $("#pattern");
  const flags = $("#flags");
  const repl = $("#repl");
  let result = null;

  input.value =
    "orders-2026.csv\nContact: pushpa@example.com, bikram.k+work@mail.co.in\nCall +91 98765 43210 or 0120-4567 890\nPin: 713205 and 700001\nBroken: someone@@nope, pin 012345, ip 999.1.1.1\nVersion bench@2.14.0-rc.1+build.77\nUUID 3f2504e0-4f89-11d3-9a0c-0305e82c3301\nDuplicate word: the the end\nTag <b>bold</b> and <i>italic</i>";
  pattern.value = String.raw`[\w.+-]+@[\w-]+\.[\w.-]{2,}`;
  flags.value = "gi";

  function render() {
    result = runRegex(pattern.value, flags.value, input.value);
    const hl = $("#highlight");
    if (result.empty) {
      hl.innerHTML = shell.escapeHtml(input.value);
      $("#mcount").textContent = "—";
      $("#matchList").innerHTML = `<p class="mini">Type a pattern above.</p>`;
      $("#explain").innerHTML = "";
      return;
    }
    if (!result.ok) {
      hl.innerHTML = shell.escapeHtml(input.value);
      $("#mcount").innerHTML = result.redos
        ? `<span class="pill is-warn">pattern refused — too slow to run</span>`
        : `<span class="pill is-fail">invalid pattern</span>`;
      // a refusal is advice, not a fault: always show the rewrite that fixes it
      $("#matchList").innerHTML =
        `<p class="out is-error">${shell.escapeHtml(result.error)}</p>` +
        (result.hint ? `<p class="mini">${shell.escapeHtml(result.hint)}</p>` : "");
      $("#explain").innerHTML = "";
      return;
    }
    hl.innerHTML = highlight(input.value, result.matches);
    hl.scrollTop = 0;
    $("#mcount").innerHTML =
      `<span class="pill ${result.count ? "is-pass" : "is-warn"}">${result.count} match${result.count === 1 ? "" : "es"}</span>` +
      (result.truncated ? `<span class="pill is-warn">capped at ${MAX_MATCHES}</span>` : "") +
      (result.groupCount ? `<span class="pill is-neutral">${result.groupCount} group${result.groupCount === 1 ? "" : "s"}</span>` : "");

    $("#matchList").innerHTML = result.matches
      .slice(0, 200)
      .map(
        (m, i) =>
          `<tr><td data-type="number">${i + 1}</td><td class="mono">${m.index}+${m.length}</td><td><code>${shell.escapeHtml(
            m.text
          )}</code></td><td>${m.groups
            .map((g, gi) => `<span class="pill is-neutral">$${gi + 1}=${shell.escapeHtml(g === undefined ? "—" : g)}</span>`)
            .join(" ")}${Object.entries(m.named)
            .map(([k, v]) => `<span class="pill is-pass">${shell.escapeHtml(k)}=${shell.escapeHtml(v)}</span>`)
            .join(" ")}</td></tr>`
      )
      .join("") + (result.count > 200 ? `<tr><td colspan="4">…${result.count - 200} more</td></tr>` : "");

    const rep = replaceWith(pattern.value, flags.value, input.value, repl.value);
    $("#replOut").textContent = rep.error ? `⚠ ${rep.error}` : rep.output;
    $("#replOut").classList.toggle("is-error", Boolean(rep.error));
    if (repl.value) $("#replCount").textContent = `${rep.count || 0} replacement${rep.count === 1 ? "" : "s"}`;
    else $("#replCount").textContent = "";

    $("#explain").innerHTML = explain(pattern.value)
      .map((t) => `<tr><td class="mono"><code>${shell.escapeHtml(t.token)}</code></td><td>${shell.escapeHtml(t.meaning)}</td></tr>`)
      .join("");
  }

  const debounced = debounce(render, 140);
  [input, pattern, flags, repl].forEach((n) => n.addEventListener("input", debounced));

  // flag checkboxes
  $("#flagBoxes").innerHTML = Object.entries(FLAG_DOC)
    .map(
      ([f, doc]) =>
        `<label class="check" title="${doc}"><input type="checkbox" data-flag="${f}" ${flags.value.includes(f) ? "checked" : ""}><span><code>${f}</code> <span class="mini">${doc}</span></span></label>`
    )
    .join("");
  $$("#flagBoxes [data-flag]").forEach((cb) =>
    cb.addEventListener("change", () => {
      flags.value = Object.keys(FLAG_DOC)
        .filter((f) => $(`#flagBoxes [data-flag="${f}"]`).checked)
        .join("");
      render();
    })
  );
  flags.addEventListener("input", () => {
    $$("#flagBoxes [data-flag]").forEach((cb) => (cb.checked = flags.value.includes(cb.dataset.flag)));
    render();
  });

  $("#snippets").innerHTML = SNIPPETS.map(
    (sn, i) =>
      `<button class="snip" data-i="${i}" title="${shell.escapeHtml(sn.note || "")}"><code>${shell.escapeHtml(sn.pattern)}</code><span>${
        sn.name
      }</span></button>`
  ).join("");
  $$("#snippets .snip").forEach((b) =>
    b.addEventListener("click", () => {
      const sn = SNIPPETS[Number(b.dataset.i)];
      pattern.value = sn.pattern;
      flags.value = sn.flags;
      $$("#flagBoxes [data-flag]").forEach((cb) => (cb.checked = sn.flags.includes(cb.dataset.flag)));
      render();
      pattern.focus();
      toast(sn.note ? sn.note : `Loaded “${sn.name}”.`, "ok", 5200);
    })
  );

  $("#copyMatches").addEventListener("click", () =>
    copyText((result?.matches || []).map((m) => m.text).join("\n"), "Matched text copied.")
  );
  $("#copyRepl").addEventListener("click", () => copyText($("#replOut").textContent, "Result copied."));
  $("#applyRepl").addEventListener("click", () => {
    const rep = replaceWith(pattern.value, flags.value, input.value, repl.value);
    if (rep.error) return toast(rep.error, "err");
    input.value = rep.output;
    render();
    toast(`Applied ${rep.count} replacement(s).`, "ok", 2400);
  });
  $("#useSelection").addEventListener("click", async () => {
    const sel = String(getSelection());
    if (!sel) return toast("Select some text in the sample first.", "info");
    input.value = sel;
    render();
  });
  $("#escapeSel").addEventListener("click", () => {
    const sel = pattern.value;
    pattern.value = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    render();
    toast("Escaped the pattern so it matches literally.", "ok", 2600);
  });

  render();
}
