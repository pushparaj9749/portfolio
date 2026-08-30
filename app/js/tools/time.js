/* =========================================================
   Tool · Dates & Units
   Timestamp inference, cross-timezone rendering, date maths
   and a factor-table unit converter.
   ========================================================= */

const MS = { s: 1000, min: 60000, hour: 3600000, day: 86400000, week: 604800000 };

/** Guess what a number or string means: seconds, ms, µs, ns, or a date string. */
export function inferTimestamp(input, now = Date.now()) {
  const raw = String(input ?? "").trim();
  if (!raw) return { ok: false, error: "empty" };
  if (/^-?\d+$/.test(raw)) {
    const n = Number(raw);
    const digits = raw.replace("-", "").length;
    const candidates = [
      { unit: "s", ms: n * 1000, when: digits <= 11 },
      { unit: "ms", ms: n, when: digits >= 11 && digits <= 14 },
      { unit: "us", ms: n / 1000, when: digits >= 15 && digits <= 17 },
      { unit: "ns", ms: n / 1e6, when: digits >= 18 },
    ].filter((c) => c.when && Number.isFinite(c.ms) && Math.abs(c.ms) < 8.64e15);
    if (!candidates.length) return { ok: false, error: "That number is outside any sane date range (year ±275760)." };
    // Prefer the reading closest to "now" — that is almost always what a paste means.
    const best = candidates.sort((a, b) => Math.abs(a.ms - now) - Math.abs(b.ms - now))[0];
    return {
      ok: true,
      ms: best.ms,
      unit: best.unit,
      alternatives: candidates.map((c) => ({ unit: c.unit, ms: c.ms, chosen: c.unit === best.unit })),
      how: `read as ${best.unit === "s" ? "seconds since the epoch" : best.unit === "ms" ? "milliseconds" : best.unit === "us" ? "microseconds" : "nanoseconds"}`,
    };
  }
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return { ok: false, error: `Could not read “${raw}” as a date or a timestamp.` };
  return { ok: true, ms: t, unit: "parsed", how: `Date.parse(“${raw}”)`, alternatives: [] };
}

const TZ_DEFAULT = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

export function renderInstant(ms, timeZone = TZ_DEFAULT()) {
  const d = new Date(ms);
  const iso = (tz) => {
    try {
      const f = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        hour12: false,
      });
      const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
      return `${p.year}-${p.month}-${p.day}T${p.hour === "24" ? "00" : p.hour}:${p.minute}:${p.second}`;
    } catch {
      return d.toISOString().slice(0, 19);
    }
  };
  const epochDays = Math.floor(ms / MS.day);
  const week = isoWeekParts(d);
  const weekUtc = week.week;
  return {
    ms,
    local: d.toString(),
    isoLocal: iso(timeZone),
    isoUtc: d.toISOString(),
    rfc1123: d.toUTCString(),
    unix: Math.floor(ms / 1000),
    unixMs: ms,
    weekday: d.toLocaleDateString("en-US", { weekday: "long", timeZone }),
    dayOfYear: Math.floor((ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / MS.day) + 1,
    weekOfYear: weekUtc,
    quarter: `Q${Math.floor(d.getUTCMonth() / 3) + 1}`,
    isoWeekDate: `${week.isoYear}-W${String(week.week).padStart(2, "0")}-${week.day}`,
    epochDays,
    binary: null,
    timeZone,
    offsetMinutes: -d.getTimezoneOffset(),
    isLeap: isLeapYear(d.getUTCFullYear()),
    zoneAbbrev: (d.toLocaleTimeString("en-US", { timeZone, timeZoneName: "short" }).split(" ")[1] || "").replace("GMT", "UTC"),
  };
}

export const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/**
 * ISO 8601 week number and week-numbering year.
 * Weeks start Monday and week 1 is the week containing the first Thursday,
 * which is why the year can differ from the calendar year on 1–3 January.
 */
export function isoWeekParts(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // move to this week's Thursday
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / MS.day + 1) / 7);
  return { isoYear, week, day: dayNum };
}

export function timezones(instantMs, zones) {
  return zones.map((tz) => {
    let label = tz;
    let value = "";
    let day = "";
    try {
      const f = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
      const parts = Object.fromEntries(f.formatToParts(new Date(instantMs)).map((p) => [p.type, p.value]));
      value = `${parts.day} ${parts.month} ${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`;
      day = parts.weekday;
      const off = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" })
        .formatToParts(new Date(instantMs))
        .find((p) => p.type === "timeZoneName")?.value;
      label = `${tz} ${off && off !== "GMT" ? `(${off.replace("GMT", "UTC")})` : ""}`.trim();
    } catch {
      value = "unknown zone";
    }
    return { tz, label, value, day };
  });
}

export function humanDelta(ms, { long = false, tense = true } = {}) {
  const abs = Math.abs(ms);
  const units = [
    ["year", 31557600000],
    ["month", 2629800000],
    ["week", 604800000],
    ["day", 86400000],
    ["hour", 3600000],
    ["minute", 60000],
    ["second", 1000],
  ];
  const out = [];
  let rest = abs;
  for (const [name, size] of units) {
    const n = Math.floor(rest / size);
    if (n) {
      out.push(long ? `${n} ${name}${n > 1 ? "s" : ""}` : `${n}${name[0]}`);
      rest -= n * size;
    }
    if (out.length === 2) break;
  }
  if (!out.length) return long ? "0 seconds" : "0s";
  if (!tense) return long ? out.join(" ") : out.join(" ");
  const suffix = ms < 0 ? (long ? "ago" : " ago") : long ? "from now" : "";
  return long ? `${out.join(" ")} ${suffix}`.trim() : `${out.join(" ")}${suffix}`;
}

export function diffDates(a, b) {
  const x = new Date(Math.min(a, b));
  const y = new Date(Math.max(a, b));
  const ms = y - x;
  let months = (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + (y.getUTCMonth() - x.getUTCMonth());
  while (months > 0 && addMonthsClamped(x.getTime(), months) > y.getTime()) months--;
  const anchor = addMonthsClamped(x.getTime(), months);
  const days = Math.round((y.getTime() - anchor) / MS.day);
  const years = Math.floor(months / 12);
  return {
    ms,
    ymd: { years, months: months % 12, days },
    totalDays: ms / MS.day,
    totalWeeks: ms / MS.week,
    totalHours: ms / MS.hour,
    totalMinutes: ms / MS.min,
    human: humanDelta(ms, { long: true, tense: false }),
  };
}

/** Add whole months, clamping 31 Feb to the last real day of the month. */
export function addMonthsClamped(ms, count) {
  const n = Math.trunc(count);
  const d = new Date(ms);
  const day = d.getUTCDate();
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const targetYear = y + Math.floor(m / 12);
  const targetMonth = ((m % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return Date.UTC(targetYear, targetMonth, Math.min(day, lastDay), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
}

export function addUnits(ms, amount, unit) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return { error: "Amount must be a number." };
  const d = new Date(ms);
  switch (unit) {
    case "year":
      d.setUTCFullYear(d.getUTCFullYear() + n);
      break;
    case "month":
      return { ms: addMonthsClamped(ms, n) };
    case "week":
      return { ms: ms + n * MS.week };
    case "day":
      return { ms: ms + n * MS.day };
    case "hour":
      return { ms: ms + n * MS.hour };
    case "minute":
      return { ms: ms + n * MS.min };
    case "second":
      return { ms: ms + n * 1000 };
    default:
      return { error: `Unknown unit “${unit}”.` };
  }
  return { ms: d.getTime() };
}

/** N business days, weekends only (no holiday list — say so in the UI). */
export function addBusinessDays(ms, count) {
  const dir = count < 0 ? -1 : 1;
  let t = ms;
  let left = Math.abs(count);
  while (left > 0) {
    t += dir * MS.day;
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) left--;
  }
  return t;
}
export function businessDaysBetween(a, b) {
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  let t = lo;
  let n = 0;
  const guard = 500000;
  let g = 0;
  while (t + MS.day <= hi && g++ < guard) {
    t += MS.day;
    const day = new Date(t).getUTCDay();
    if (day !== 0 && day !== 6) n++;
  }
  return n;
}

const DUR_UNITS = { ns: 1e-6, us: 0.001, ms: 1, s: 1000, sec: 1000, seconds: 1000, m: 60000, min: 60000, h: 3600000, hr: 3600000, d: 86400000, w: 604800000 };
export function parseDuration(text) {
  const s = String(text ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return { error: "empty" };
  if (/^\d+(\.\d+)?$/.test(s)) return { ms: Number(s) * 1000, how: "bare number read as seconds" };
  // Longest unit first: with plain alternation "30min" matched "30m" and left "in".
  const unitAlt = Object.keys(DUR_UNITS)
    .sort((a, b) => b.length - a.length)
    .join("|");
  // group 1 = the number, group 2 = the unit — both must be *capturing*
  const re = new RegExp("(\\d+(?:\\.\\d+)?)(" + unitAlt + ")", "g");
  let total = 0;
  let hits = 0;
  let consumed = 0; // re.lastIndex resets to 0 when exec() returns null
  let m;
  while ((m = re.exec(s))) {
    total += Number(m[1]) * DUR_UNITS[m[2]];
    consumed = re.lastIndex;
    hits++;
  }
  if (!hits) return { error: `Could not read “${text}”. Try 2h30m, 45s, 1.5d, 500ms.` };
  if (consumed !== s.length) return { error: `Unreadable tail at position ${consumed} of “${text}”.` };
  return { ms: total, how: "component units" };
}

export function formatDuration(ms, { compact = false } = {}) {
  const neg = ms < 0;
  let rest = Math.abs(ms);
  const parts = [];
  for (const [unit, size] of [["d", MS.day], ["h", MS.hour], ["m", MS.min], ["s", 1000]]) {
    const n = Math.floor(rest / size);
    if (n) {
      parts.push(compact ? `${n}${unit}` : `${n} ${unit === "d" ? "day" : unit === "h" ? "hour" : unit === "m" ? "minute" : "second"}${n > 1 ? "s" : ""}`);
      rest -= n * size;
    }
  }
  const millis = Math.round(rest);
  if (millis && !compact) parts.push(`${millis} millisecond${millis > 1 ? "s" : ""}`);
  else if (millis && compact) parts.push(`${millis}ms`);
  if (!parts.length) return "0s";
  return (neg ? "-" : "") + parts.join(compact ? " " : ", ");
}

/* ---------------- units ---------------- */
export const UNITS = {
  length: {
    base: "m",
    units: { nm: 1e-9, "µm": 1e-6, mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344, nmi: 1852, "Å": 1e-10, "ly": 9.4607e15, pc: 3.0857e16 },
  },
  mass: {
    base: "kg",
    units: { mg: 1e-6, g: 0.001, kg: 1, t: 1000, oz: 0.028349523125, lb: 0.45359237, st: 6.35029318, ton: 907.18474, "t(ne)": 1016.0469088, carat: 0.0002 },
  },
  volume: {
    base: "l",
    units: { ml: 0.001, cl: 0.01, "l": 1, "m³": 1000, tsp: 0.00492892, tbsp: 0.0147868, floz: 0.0295735, cup: 0.24, pint: 0.473176, quart: 0.946353, gal: 3.785411784, "gal(uk)": 4.54609 },
  },
  area: {
    base: "m²",
    units: { "cm²": 0.0001, "m²": 1, hectare: 10000, "km²": 1e6, sqft: 0.09290304, sqyd: 0.83612736, acre: 4046.8564224, sqmi: 2589988.110336, guntha: 101.17, bigha: 2529.285264, decimal: 40.468564224 },
  },
  speed: {
    base: "m/s",
    units: { "m/s": 1, "km/h": 1 / 3.6, mph: 0.44704, knot: 0.514444, "ft/s": 0.3048, "m/s(max)": 1 },
  },
  time: {
    base: "s",
    units: { ns: 1e-9, "µs": 1e-6, ms: 0.001, s: 1, min: 60, h: 3600, d: 86400, week: 604800, month: 2629800, year: 31557600, decade: 315576000 },
  },
  data: {
    base: "byte",
    units: { bit: 0.125, byte: 1, kB: 1000, MB: 1e6, GB: 1e9, TB: 1e12, PB: 1e15, KiB: 1024, MiB: 1048576, GiB: 1073741824, TiB: 1099511627776, PiB: 1125899906842624 },
  },
  "data rate": {
    base: "byte/s",
    units: { "bit/s": 0.125, "kB/s": 1000, "MB/s": 1e6, "GB/s": 1e9, "KiB/s": 1024, "MiB/s": 1048576, "Mbps": 125000, "Gbps": 125000000, "MBps": 1e6 },
  },
  temperature: { base: "K", special: true, units: { K: 1, C: 1, F: 1, R: 1 } },
  angle: { base: "°", units: { "°": 1, rad: 57.29577951308232, grad: 0.9, turn: 360, arcmin: 1 / 60, arcsec: 1 / 3600 } },
  energy: { base: "J", units: { J: 1, kJ: 1000, MJ: 1e6, Wh: 3600, kWh: 3.6e6, cal: 4.184, kcal: 4184, BTU: 1055.05585, "ft·lb": 1.3558179483, eV: 1.602176634e-19 } },
  pressure: { base: "Pa", units: { Pa: 1, kPa: 1000, bar: 1e5, psi: 6894.757293168, atm: 101325, mmHg: 133.322, "inHg": 3386.389 } },
};

export function convert(kind, value, from, to) {
  const table = UNITS[kind];
  if (!table) return { error: `Unknown category “${kind}”.` };
  const n = Number(value);
  if (!Number.isFinite(n)) return { error: "Enter a number." };
  if (kind === "temperature") return convertTemp(n, from, to);
  const f = table.units[from];
  const t = table.units[to];
  if (!f || !t) return { error: `Unknown unit (${f ? to : from}).` };
  const out = (n * f) / t;
  return { value: out, base: (n * f).toPrecision(10), baseUnit: table.base, pretty: smartNumber(out) };
}

function convertTemp(n, from, to) {
  const toK = { K: (v) => v, C: (v) => v + 273.15, F: (v) => (v + 459.67) / 1.8, R: (v) => v / 1.8 }[from];
  const fromK = { K: (v) => v, C: (v) => v - 273.15, F: (v) => v * 1.8 - 459.67, R: (v) => v * 1.8 }[to];
  if (!toK || !fromK) return { error: "Unknown temperature unit." };
  const k = toK(n);
  const out = Number(fromK(k).toPrecision(12));
  return { value: out, base: k, baseUnit: "K", pretty: smartNumber(out) };
}

export function smartNumber(n) {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e12)) return n.toExponential(6).replace("e", " ×10^");
  const s = n.toPrecision(10);
  return String(Number(s));
}

export function aspectRatio(w, h) {
  const a = Number(w);
  const b = Number(h);
  if (!a || !b) return { error: "Enter both dimensions." };
  const g = (x, y) => (y ? g(y, x % y) : x);
  const d = g(a, b);
  const r = a / b;
  const common = [
    [1, 1], [4, 3], [3, 2], [16, 9], [16, 10], [21, 9], [9, 16], [4, 5], [5, 4], [2, 3], [3, 4], [1.85, 1], [2.39, 1], [2, 1],
  ];
  const near = common
    .map(([x, y]) => ({ label: `${x}:${y}`, diff: Math.abs(Math.log(r / (x / y))) }))
    .sort((p, q) => p.diff - q.diff)[0];
  const scale = (tw) => Math.round((tw / a) * b);
  return {
    simplified: `${a / d}:${b / d}`,
    decimal: +r.toFixed(4),
    nearest: near.label,
    percentOff: +(near.diff * 100).toFixed(2),
    at1080: `1920×${scale(1920)}`,
    half: `${Math.round(a / 2)}×${Math.round(b / 2)}`,
    double: `${a * 2}×${b * 2}`,
    megapixels: +((a * b) / 1e6).toFixed(2),
  };
}

export function percentCalc(kind, a, b, c) {
  const x = Number(a);
  const y = Number(b);
  const z = Number(c);
  switch (kind) {
    case "of":
      return { value: (x / 100) * y, text: `${x}% of ${y} is ${smartNumber((x / 100) * y)}` };
    case "isWhat":
      return y === 0 ? { error: "Division by zero." } : { value: (x / y) * 100, text: `${x} is ${smartNumber((x / y) * 100)}% of ${y}` };
    case "change":
      return x === 0 ? { error: "Starting value cannot be zero." } : { value: ((y - x) / x) * 100, text: `${x} → ${y} is ${smartNumber(((y - x) / x) * 100)}% ${y >= x ? "increase" : "decrease"}` };
    case "reverse":
      return x === 0 ? { error: "Reverse percentage needs a non-zero result." } : { value: (y / x) * 100, text: `${y} is ${x}% of ${smartNumber((y / x) * 100)}` };
    case "ratio":
      return { value: x / (x + y) * 100, text: `Split ${x}:${y} = ${smartNumber((x / (x + y)) * 100)}% / ${smartNumber((y / (x + y)) * 100)}%` };
    case "gst": {
      const amt = x;
      const rate = y;
      const incl = amt * (1 + rate / 100);
      return { value: incl, text: `${amt} + ${rate}% = ${smartNumber(incl)} (tax ${smartNumber((incl - amt).toFixed(2))}); stripping ${rate}% from ${amt} gives ${smartNumber(amt / (1 + rate / 100))}` };
    }
    case "tip": {
      // the third field earns its place here: a bill, a tip %, and how many people are splitting it
      const total = x * (1 + y / 100);
      const people = Number.isFinite(z) && z >= 2 ? Math.trunc(z) : 0;
      const tipAmt = y > 0 ? (x * (y / 100)).toFixed(2) : "0";
      return {
        value: total,
        people,
        each: people ? total / people : null,
        text:
          `Bill ${x} + ${y}% tip = ${smartNumber(total)} (${tipAmt} tip)` +
          (people ? ` · split ${people} ways = ${smartNumber(Number((total / people).toFixed(2)))} each` : ""),
      };
    }
    default:
      return { error: "Unknown calculation." };
  }
}

/* ---------------- UI ---------------- */
if (typeof document !== "undefined" && typeof window !== "undefined") boot().catch((err) => console.warn(err));

async function boot() {
  const shell = await import("../shell.js");
  const { $, $$, toast, copyText, debounce } = shell;
  shell.bootTool();

  /* ---- epoch ---- */
  const ZONES = ["Asia/Kolkata", "UTC", "America/New_York", "Europe/London", "Asia/Singapore", "Australia/Sydney", "Asia/Dubai", "America/Los_Angeles"];
  const now = Date.now();
  const inp = $("#epoch");
  const out = $("#instant");
  const live = { on: false, raf: 0 };

  function showInstant(ms) {
    const r = renderInstant(ms);
    const rows = [
      ["local", r.local.replace(/\s*\(.*\)$/, "")],
      ["ISO (your zone)", r.isoLocal],
      ["ISO 8601 UTC", r.isoUtc],
      ["RFC 1123", r.rfc1123],
      ["unix seconds", String(r.unix)],
      ["unix milliseconds", String(r.unixMs)],
      ["ISO week-date", r.isoWeekDate],
      ["week of year", String(r.weekOfYear)],
      ["day of year", `${r.dayOfYear} / ${r.isLeap ? 366 : 365}`],
      ["quarter", `${r.quarter} ${new Date(ms).getUTCFullYear()}`],
      ["epoch days", String(r.epochDays)],
      ["relative", humanDelta(ms - Date.now(), { long: true })],
    ];
    out.innerHTML =
      `<table class="dt"><tbody>` +
      rows
        .map(
          ([k, v]) =>
            `<tr><td>${k}</td><td class="mono"><button class="copyable" data-v="${shell.escapeHtml(String(v))}">${shell.escapeHtml(String(v))}</button></td></tr>`
        )
        .join("") +
      `</tbody></table>` +
      `<h4 class="label" style="margin-top:14px">same instant, around the world</h4>` +
      `<table class="dt"><thead><tr><th>zone</th><th>local time</th></tr></thead><tbody>` +
      timezones(ms, ZONES)
        .map((z) => `<tr><td>${shell.escapeHtml(z.label)}</td><td class="mono">${shell.escapeHtml(z.day)} ${shell.escapeHtml(z.value)}</td></tr>`)
        .join("") +
      `</tbody></table>`;
    $$("#instant [data-v]").forEach((b) => b.addEventListener("click", () => copyText(b.dataset.v, "Copied.")));
    $("#nowNote").textContent = `now: ${new Date().toISOString()}`;
  }

  function readEpoch() {
    const res = inferTimestamp(inp.value || String(Math.floor(Date.now() / 1000)));
    if (!res.ok) {
      out.innerHTML = `<p class="out is-error">${shell.escapeHtml(res.error || "empty")}</p>`;
      return;
    }
    const alts = (res.alternatives || [])
      .map((a) => `<button class="tbtn ${a.chosen ? "is-on" : ""}" data-alt="${a.ms}">${a.unit} → ${new Date(a.ms).toISOString().slice(0, 16).replace("T", " ")}</button>`)
      .join("");
    $("#altRow").innerHTML = alts;
    $$("#altRow [data-alt]").forEach((b) =>
      b.addEventListener("click", () => {
        inp.value = String(Math.round(Number(b.dataset.alt)));
        $$("#altRow .tbtn").forEach((x) => x.classList.remove("is-on"));
        b.classList.add("is-on");
        showInstant(Number(b.dataset.alt));
      })
    );
    $("#howNote").textContent = res.how;
    showInstant(res.ms);
  }

  inp.value = String(Math.floor(now / 1000));
  inp.addEventListener("input", debounce(readEpoch, 120));
  $("#nowBtn").addEventListener("click", () => {
    inp.value = String(Math.floor(Date.now() / 1000));
    readEpoch();
  });
  $("#msBtn").addEventListener("click", () => {
    inp.value = String(Date.now());
    readEpoch();
  });
  $("#liveBtn").addEventListener("click", (e) => {
    live.on = !live.on;
    e.target.classList.toggle("is-on", live.on);
    e.target.textContent = live.on ? "ticking…" : "watch live";
    const tick = () => {
      if (!live.on) return;
      inp.value = String(Date.now());
      readEpoch();
      setTimeout(tick, 1000);
    };
    if (live.on) tick();
  });

  /* ---- date maths ---- */
  const dA = $("#dateA");
  const dB = $("#dateB");
  const today = new Date().toISOString().slice(0, 10);
  dA.value = "2026-01-01";
  dB.value = today;
  function renderDiff() {
    const a = Date.parse(dA.value);
    const b = Date.parse(dB.value);
    if (Number.isNaN(a) || Number.isNaN(b)) {
      $("#diffOut").textContent = "Pick two valid dates.";
      return;
    }
    const d = diffDates(a, b);
    const bd = businessDaysBetween(a, b);
    $("#diffOut").innerHTML = `<table class="dt"><tbody>
      <tr><td>span</td><td class="mono">${shell.escapeHtml(d.human)}</td></tr>
      <tr><td>years / months / days</td><td class="mono">${d.ymd.years}y ${d.ymd.months}m ${d.ymd.days}d</td></tr>
      <tr><td>total days</td><td class="mono">${d.totalDays.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td></tr>
      <tr><td>business days (Mon–Fri)</td><td class="mono">${bd.toLocaleString()} <span class="mini">public holidays not considered</span></td></tr>
      <tr><td>weeks / hours / minutes</td><td class="mono">${d.totalWeeks.toFixed(1)} · ${Math.round(d.totalHours).toLocaleString()} · ${Math.round(d.totalMinutes).toLocaleString()}</td></tr>
      <tr><td>is leap year?</td><td class="mono">${[new Date(a), new Date(b)].map((x) => (isLeapYear(x.getUTCFullYear()) ? x.getUTCFullYear() + " ✓" : x.getUTCFullYear() + " ✕")).join(", ")}</td></tr>
    </tbody></table>`;
  }
  [dA, dB].forEach((n) => n.addEventListener("change", renderDiff));
  $("#swapDates").addEventListener("click", () => {
    [dA.value, dB.value] = [dB.value, dA.value];
    renderDiff();
  });

  const off = $("#offAmount");
  const offU = $("#offUnit");
  function renderOffset() {
    const base = Date.parse($("#offBase").value || today);
    if (Number.isNaN(base)) return ($("#offOut").textContent = "Pick a start date.");
    const n = Number(off.value);
    let ms;
    if (offU.value === "business days") ms = addBusinessDays(base, n);
    else {
      const r = addUnits(base, n, offU.value.split(" ")[0]);
      if (r.error) return ($("#offOut").textContent = r.error);
      ms = r.ms;
    }
    const d = new Date(ms);
    $("#offOut").innerHTML = `<b class="mono">${d.toISOString().slice(0, 10)}</b> <span class="mini">${d.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    })}</span> <button class="tbtn" id="copyOff">copy</button> <span class="mini">${humanDelta(ms - base, { long: true })}</span>`;
    $("#copyOff").addEventListener("click", () => copyText(d.toISOString().slice(0, 10), "Date copied."));
  }
  [$("#offBase"), off, offU].forEach((n) => n.addEventListener("change", renderOffset));
  off.addEventListener("input", renderOffset);
  [1, 5, 10, 21, 60].forEach((n) =>
    $$(`[data-quick="${n}"]`).forEach((b) =>
      b.addEventListener("click", () => {
        off.value = b.dataset.sign === "-" ? String(-n) : String(n);
        renderOffset();
      })
    )
  );

  /* ---- duration ---- */
  const dur = $("#durIn");
  function renderDur() {
    const r = parseDuration(dur.value);
    if (r.error) {
      $("#durOut").textContent = r.error === "empty" ? "Try 2h30m or 90s." : r.error;
      return;
    }
    const ms = r.ms;
    const bits = [
      ["milliseconds", Math.round(ms)],
      ["seconds", +(ms / 1000).toFixed(3)],
      ["minutes", +(ms / 60000).toFixed(4)],
      ["hours", +(ms / 3600000).toFixed(4)],
      ["days", +(ms / 86400000).toFixed(4)],
      ["hh:mm:ss", `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`],
      ["human", formatDuration(ms)],
    ];
    $("#durOut").innerHTML =
      `<table class="dt"><tbody>` +
      bits.map(([k, v]) => `<tr><td>${k}</td><td class="mono">${v}</td></tr>`).join("") +
      `</tbody></table>`;
  }
  dur.addEventListener("input", renderDur);
  $$("#durPresets .tbtn").forEach((b) =>
    b.addEventListener("click", () => {
      dur.value = b.dataset.preset;
      renderDur();
    })
  );

  /* ---- units ---- */
  const kindSel = $("#uKind");
  const fromSel = $("#uFrom");
  const toSel = $("#uTo");
  const valIn = $("#uVal");
  kindSel.innerHTML = Object.keys(UNITS)
    .map((k) => `<option value="${k}">${k[0].toUpperCase()}${k.slice(1)}</option>`)
    .join("");
  valIn.value = "1";
  function fillUnits() {
    const list = Object.keys(UNITS[kindSel.value].units);
    const base = UNITS[kindSel.value].base;
    const opts = list.map((u) => `<option value="${u}"${u === base ? " selected" : ""}>${u}</option>`).join("");
    fromSel.innerHTML = opts;
    toSel.innerHTML = list
      .filter((u) => u !== base)
      .map((u, i) => `<option value="${u}"${i === 0 ? " selected" : ""}>${u}</option>`)
      .join("");
    convertNow();
  }
  function convertNow() {
    const r = convert(kindSel.value, valIn.value, fromSel.value, toSel.value);
    if (r.error) {
      $("#uOut").textContent = r.error;
      $("#uAll").innerHTML = "";
      return;
    }
    $("#uOut").innerHTML = `<b class="big">${shell.escapeHtml(r.pretty)}</b> <span class="mono">${shell.escapeHtml(toSel.value)}</span>
      <p class="mini">= ${shell.escapeHtml(smartNumber(Number(r.base)))} ${UNITS[kindSel.value].base} (base unit)</p>
      <button class="tbtn" id="uCopy">copy value</button>`;
    $("#uCopy").addEventListener("click", () => copyText(String(r.value), "Copied."));
    const table = UNITS[kindSel.value].units;
    $("#uAll").innerHTML =
      `<table class="dt"><thead><tr><th>unit</th><th>= ${shell.escapeHtml(String(valIn.value || 0))} ${shell.escapeHtml(fromSel.value)}</th></tr></thead><tbody>` +
      Object.keys(table)
        .map((u) => {
          const v = convert(kindSel.value, valIn.value, fromSel.value, u);
          return `<tr><td>${u}</td><td class="mono">${v.error ? "—" : shell.escapeHtml(v.pretty)}</td></tr>`;
        })
        .join("") +
      `</tbody></table>`;
  }
  [kindSel, fromSel, toSel].forEach((n) => n.addEventListener("change", () => (n === kindSel ? fillUnits() : convertNow())));
  valIn.addEventListener("input", debounce(convertNow, 90));
  $("#uSwap").addEventListener("click", () => {
    const a = fromSel.value;
    fromSel.value = toSel.value;
    toSel.value = a;
    convertNow();
  });
  fillUnits();

  /* ---- aspect + percent ---- */
  function renderAspect() {
    const r = aspectRatio($("#aw").value, $("#ah").value);
    $("#aspectOut").textContent = r.error || `${r.simplified} · ${r.decimal} · nearest ${r.nearest} (${r.percentOff}% off) · ${r.megapixels} MP · at 1920w → ${r.at1080} · half ${r.half}`;
  }
  ["#aw", "#ah"].forEach((s) => $(s).addEventListener("input", debounce(renderAspect, 90)));
  $$("#aspectPresets .tbtn").forEach((b) =>
    b.addEventListener("click", () => {
      const [w, h] = b.dataset.preset.split("x");
      $("#aw").value = w;
      $("#ah").value = h;
      renderAspect();
    })
  );
  renderAspect();

  // z only means something for tip-splitting, so show it there and label it plainly
  const PCT_NEEDS_Z = new Set(["tip"]);
  function renderPct() {
    const kind = $$("#pctKinds .tbtn.is-on")[0]?.dataset.kind || "of";
    const zField = $("#pc").closest(".field");
    if (zField) {
      zField.hidden = !PCT_NEEDS_Z.has(kind);
      const lab = zField.querySelector("span");
      if (lab) lab.textContent = PCT_NEEDS_Z.has(kind) ? "÷ people" : "z";
    }
    const r = percentCalc(kind, $("#pa").value, $("#pb").value, $("#pc").value);
    const out = $("#pctOut");
    out.textContent = r.error || r.text;
    out.classList.toggle("is-error", Boolean(r.error));
  }
  $$("#pctKinds .tbtn").forEach((b) =>
    b.addEventListener("click", () => {
      $$("#pctKinds .tbtn").forEach((x) => x.classList.toggle("is-on", x === b));
      renderPct();
    })
  );
  ["#pa", "#pb", "#pc"].forEach((s) => $(s).addEventListener("input", debounce(renderPct, 90)));

  readEpoch();
  renderDiff();
  renderOffset();
  renderDur();
  renderPct();

  toast("Times use your browser’s own zone data — nothing is fetched.", "ok", 2600);
}
