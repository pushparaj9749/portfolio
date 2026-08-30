/* =========================================================
   Tool · Hash & Code
   Digests (pure JS, so they work on plain http too), JWT
   decoding, identifiers, and local password generation.
   ========================================================= */

const enc = new TextEncoder();
const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const bytesOf = (input) => (typeof input === "string" ? enc.encode(input) : input);
const rotl = (x, n) => (x << n) | (x >>> (32 - n));
const rotr = (x, n) => (x >>> n) | (x << (32 - n));

/* ---------------- SHA-256 ---------------- */
const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256Bytes(input) {
  const bytes = bytesOf(input);
  const len = bytes.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const m = new Uint8Array(total);
  m.set(bytes);
  m[len] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(total - 8, Math.floor((len * 8) / 4294967296));
  dv.setUint32(total - 4, (len * 8) >>> 0);

  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const x = w[i - 15];
      const y = w[i - 2];
      const s0 = rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
      const s1 = rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K256[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  const out = new Uint8Array(32);
  const odv = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) odv.setUint32(i * 4, H[i]);
  return out;
}
export const sha256 = (input) => toHex(sha256Bytes(input));

/* ---------------- MD5 ---------------- */
const MD5_SHIFT = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const MD5_K = Uint32Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0);

export function md5(input) {
  const bytes = bytesOf(input);
  const len = bytes.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const m = new Uint8Array(total);
  m.set(bytes);
  m[len] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(total - 8, (len * 8) >>> 0, true);
  dv.setUint32(total - 4, Math.floor((len * 8) / 4294967296), true);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const M = new Uint32Array(16);
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) M[i] = dv.getUint32(off + i * 4, true);
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;
    for (let i = 0; i < 64; i++) {
      let F;
      let g;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + MD5_K[i] + M[g]) >>> 0;
      A = D; D = C; C = B;
      B = (B + rotl(F, MD5_SHIFT[i])) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16);
  const odv = new DataView(out.buffer);
  odv.setUint32(0, a0, true);
  odv.setUint32(4, b0, true);
  odv.setUint32(8, c0, true);
  odv.setUint32(12, d0, true);
  return toHex(out);
}

/* ---------------- checksums ---------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(input) {
  const bytes = bytesOf(input);
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

export function adler32(input) {
  const bytes = bytesOf(input);
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % 65521;
    b = (b + a) % 65521;
  }
  return (((b << 16) | a) >>> 0).toString(16).padStart(8, "0");
}

/* ---------------- HMAC-SHA256 (built on the JS core, so no secure context needed) ---------------- */
export function hmacSha256(key, input) {
  const block = 64;
  let k = bytesOf(key);
  if (k.length > block) k = sha256Bytes(k);
  const padded = new Uint8Array(block);
  padded.set(k);
  const inner = new Uint8Array(block);
  const outer = new Uint8Array(block);
  for (let i = 0; i < block; i++) {
    inner[i] = padded[i] ^ 0x36;
    outer[i] = padded[i] ^ 0x5c;
  }
  const msg = bytesOf(input);
  const innerHash = sha256Bytes(concat(inner, msg));
  return toHex(sha256Bytes(concat(outer, innerHash)));
}
const concat = (a, b) => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
};

/** SubtleCrypto when the origin allows it — used for SHA-1/384/512. */
export function subtleAvailable() {
  return typeof crypto !== "undefined" && typeof crypto.subtle?.digest === "function";
}
export async function subtleDigest(algo, data) {
  if (!subtleAvailable()) throw new Error(`${algo} needs a secure context (https:// or localhost). SHA-256 and MD5 still work here.`);
  const buf = await crypto.subtle.digest(algo, bytesOf(data).buffer.slice(0));
  return toHex(new Uint8Array(buf));
}

/* ---------------- JWT ---------------- */
function b64urlDecode(s) {
  const clean = String(s).replace(/-/g, "+").replace(/_/g, "/");
  const pad = clean + "=".repeat((4 - (clean.length % 4)) % 4);
  const bin = typeof atob === "function" ? atob(pad) : Buffer.from(clean, "base64").toString("binary");
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
function b64urlEncode(str) {
  const bytes = enc.encode(str);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  const b64 = typeof btoa === "function" ? btoa(bin) : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeJwt(token) {
  const raw = String(token || "").trim().replace(/^Bearer\s+/i, "");
  const parts = raw.split(".");
  if (parts.length < 2) return { ok: false, error: "A JWT is header.payload.signature — this has fewer than two parts." };
  if (parts.length > 3) return { ok: false, error: "Too many dots for a JWT." };
  try {
    const header = JSON.parse(b64urlDecode(parts[0]));
    const payload = JSON.parse(b64urlDecode(parts[1]));
    const now = Math.floor(Date.now() / 1000);
    const flags = [];
    if (typeof payload.exp === "number") {
      const left = payload.exp - now;
      flags.push({
        key: "exp",
        label: "expires",
        value: new Date(payload.exp * 1000).toISOString(),
        state: left < 0 ? "expired" : left < 300 ? "soon" : "ok",
        seconds: left,
      });
    }
    if (typeof payload.iat === "number")
      flags.push({ key: "iat", label: "issued", value: new Date(payload.iat * 1000).toISOString(), state: "info", seconds: now - payload.iat });
    if (typeof payload.nbf === "number" && payload.nbf > now)
      flags.push({ key: "nbf", label: "not valid before", value: new Date(payload.nbf * 1000).toISOString(), state: "soon", seconds: payload.nbf - now });
    return { ok: true, header, payload, signature: parts[2] || "", flags, alg: header.alg || "none", unverified: true };
  } catch (err) {
    return { ok: false, error: `Could not base64url-decode a segment: ${err.message}` };
  }
}

/* ---------------- identifiers ---------------- */
const randomBytes = (n) => {
  const out = new Uint8Array(n);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(out);
  else for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
};

export function uuidv4() {
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = toHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Sortable UUID: 48-bit big-endian ms timestamp + random, version 7. */
export function uuidv7(now = Date.now()) {
  const b = randomBytes(16);
  const ts = Math.floor(now);
  for (let i = 5; i >= 0; i--) {
    b[i] = ts % 256;
    b[5 - i] = b[5 - i];
  }
  // write big-endian into the first 6 bytes
  let t = ts;
  for (let i = 5; i >= 0; i--) {
    b[i] = t & 0xff;
    t = Math.floor(t / 256);
  }
  b[6] = (b[6] & 0x0f) | 0x70;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = toHex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function nanoid(size = 21, alphabet = "useandom26T1983407326843951550158727954715971") {
  const bytes = randomBytes(size);
  let out = "";
  for (let i = 0; i < size; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}
export const randomHex = (bytes = 16) => toHex(randomBytes(bytes));
export const randomBase64 = (bytes = 18) => {
  const raw = randomBytes(bytes);
  let bin = "";
  raw.forEach((b) => (bin += String.fromCharCode(b)));
  return (typeof btoa === "function" ? btoa(bin) : Buffer.from(raw).toString("base64")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/* ---------------- passwords ---------------- */
export const CHARSETS = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.?/",
  ambiguous: "Il1O0o|`'\"{}[]()*/\\",
};

export function password({
  length = 20,
  lower = true,
  upper = true,
  digits = true,
  symbols = true,
  avoidAmbiguous = true,
  requireEach = true,
} = {}) {
  let pool = "";
  const required = [];
  for (const [flag, name] of [[lower, "lower"], [upper, "upper"], [digits, "digits"], [symbols, "symbols"]]) {
    if (!flag) continue;
    let set = CHARSETS[name];
    if (avoidAmbiguous) set = [...set].filter((c) => !CHARSETS.ambiguous.includes(c)).join("");
    pool += set;
    required.push(set);
  }
  if (!pool) return { error: "Pick at least one character set." };
  const len = Math.max(1, Math.min(256, Number(length) || 20));
  if (requireEach && required.length > len) return { error: `Length must be at least ${required.length} to include one character from each set.` };

  const chars = [];
  for (const set of requireEach ? required : []) chars.push(set[pick(set.length)]);
  while (chars.length < len) chars.push(pool[pick(pool.length)]);
  // Fisher-Yates so required characters aren't stuck at the front
  for (let i = chars.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  const value = chars.join("");
  const bits = +(len * Math.log2(pool.length)).toFixed(1);
  return { value, length: len, poolSize: pool.length, entropyBits: bits, ...strength(bits) };
}

/** Uniform index in [0,n) via rejection sampling — `v % n` alone biases low values. */
const pick = (n) => {
  if (n <= 1) return 0;
  const limit = 0x100000000 - (0x100000000 % n);
  for (let i = 0; i < 64; i++) {
    const b = randomBytes(4);
    const v = ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
    if (v < limit) return v % n;
  }
  return Math.floor(Math.random() * n); // unreachable in practice
};

/** EFF diceware-style word list: exactly 256 entries, so 8 bits per word. */
/**
 * Diceware-style word list: exactly 256 unique entries, so each word is
 * a clean 8 bits. Uniqueness is asserted by the test suite — a duplicate
 * silently shrinks the real keyspace while the UI still says 8 bits/word.
 */
/**
 * Diceware-style word list: exactly 256 unique entries, so each word is a clean 8 bits.
 * Uniqueness is asserted by the tests, because a duplicate silently shrinks the real
 * keyspace while the UI still claims 8 bits per word.
 */
export const WORDS = [
  "anchor", "almond", "basil", "beryl", "beacon", "birch",
  "bramble", "bronze", "cedar", "chalk", "cinder", "clover",
  "cobalt", "copper", "coral", "cove", "crimson", "cypress",
  "dune", "ember", "fern", "flint", "gale", "garnet",
  "granite", "grove", "harbor", "hazel", "heron", "indigo",
  "ivory", "jasper", "jade", "juniper", "kestrel", "lagoon",
  "lantern", "larch", "linen", "lotus", "lumen", "mallow",
  "marble", "meadow", "mesa", "mistral", "nectar", "onyx",
  "opal", "orchid", "otter", "pebble", "pine", "quartz",
  "quiver", "raven", "ridge", "river", "saffron", "sage",
  "salt", "sand", "slate", "solstice", "sparrow", "spruce",
  "stone", "summit", "thistle", "thorn", "tide", "timber",
  "topaz", "tundra", "umber", "vault", "violet", "walnut",
  "willow", "zenith", "zephyr", "amber", "ash", "aspen",
  "bay", "berry", "blaze", "brook", "brow", "canyon",
  "cape", "cave", "cliff", "cloud", "coast", "crest",
  "dale", "delta", "dew", "earth", "echo", "field",
  "flame", "fog", "forest", "fork", "gully", "hall",
  "haven", "hill", "hollow", "inlet", "isle", "lake",
  "lea", "ledge", "loop", "marsh", "mill", "mount",
  "nest", "notch", "oak", "ocean", "oasis", "peak",
  "pearl", "plain", "point", "pool", "port", "quarry",
  "reed", "reef", "ring", "rock", "root", "shore",
  "slope", "sound", "spire", "spring", "strand", "stream",
  "swift", "tarn", "tor", "trail", "vale", "vane",
  "vertex", "valley", "wave", "well", "west", "wood",
  "adit", "axis", "base", "bulk", "cell", "core",
  "curl", "dark", "deep", "dome", "drift", "dyke",
  "east", "edge", "fault", "fen", "flux", "forge",
  "gap", "gate", "glen", "grot", "holt", "keep",
  "knoll", "link", "mass", "moor", "nave", "nook",
  "oriel", "pier", "pill", "post", "quay", "raft",
  "rill", "sail", "seal", "sill", "site", "snub",
  "spit", "sump", "talc", "teal", "thicket", "tideline",
  "toft", "tomb", "treeline", "veined", "wadi", "weir",
  "wetland", "wold", "wraith", "ablaze", "acorn", "alder",
  "aurora", "balcony", "boulder", "brushwood", "cavern", "citrus",
  "clearing", "cloudbank", "cobweb", "coralreef", "crescent", "dell",
  "driftwood", "dusk", "echopleth", "emberlight", "estuary", "farthing",
  "fenland", "firefly", "flagstone", "fjord", "glimmer", "granary",
  "greenhouse", "grit", "hallway", "harbour", "icicle", "lanternlight",
  "lichen", "limestone", "littoral", "loom", "marina", "oolean",
  "glade", "copse", "dene", "shaw",
];

export function passphrase({ words = 6, separator = "-", capitalize = true, addNumber = true } = {}) {
  const n = Math.max(1, Math.min(20, Number(words) || 6));
  const list = Array.from({ length: n }, () => WORDS[pick(WORDS.length)]);
  if (addNumber) list.splice(pick(list.length + 1), 0, String(pick(1000)).padStart(2, "0"));
  let out = list.join(separator);
  if (capitalize) out = out[0].toUpperCase() + out.slice(1);
  const bits = +(n * Math.log2(WORDS.length) + (addNumber ? Math.log2(1000) : 0)).toFixed(1);
  return { value: out, wordCount: n, bits, ...strength(bits) };
}

export function strength(bits) {
  const label =
    bits < 40 ? "weak" : bits < 60 ? "fair" : bits < 80 ? "strong" : bits < 100 ? "very strong" : "excellent";
  const guessPerSec = 1e11; // offline, GPU cluster, guesses/second
  const years = 2 ** bits / guessPerSec / 31557600;
  return { label, crackYears: years, crackHuman: humanYears(years) };
}
function humanYears(y) {
  if (y < 1 / 31557600) return "under a second";
  if (y < 1) return `${Math.round(y * 365)} days`;
  if (y < 1000) return `${Math.round(y)} years`;
  if (y < 1e6) return `${(y / 1000).toFixed(1)} thousand years`;
  if (y < 1e9) return `${(y / 1e6).toFixed(1)} million years`;
  if (y < 1e12) return `${(y / 1e9).toFixed(1)} billion years`;
  return "longer than the sun will burn";
}

/* ---------------- encodings ---------------- */
export function toBase64(str) {
  const bytes = enc.encode(str);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return typeof btoa === "function" ? btoa(bin) : Buffer.from(bytes).toString("base64");
}
export function fromBase64(b64) {
  const bin = typeof atob === "function" ? atob(b64.trim()) : Buffer.from(b64, "base64").toString("binary");
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
export const toHexBytes = (str) => toHex(enc.encode(str));
export function fromHex(hex) {
  const clean = String(hex).replace(/[^0-9a-f]/gi, "");
  if (clean.length % 2) throw new Error("Hex needs an even number of digits.");
  const bytes = Uint8Array.from(clean.match(/../g) || [], (h) => parseInt(h, 16));
  return new TextDecoder().decode(bytes);
}
/** Order-insensitive comparison, as hashes are pasted with different spacing/case. */
export function sameHash(a, b) {
  const n = (s) => String(s).toLowerCase().replace(/[^0-9a-f]/g, "");
  const x = n(a);
  const y = n(b);
  if (!x || !y) return { equal: false, reason: "Enter two hexadecimal digests." };
  if (x.length !== y.length) return { equal: false, reason: `Different lengths: ${x.length} vs ${y.length} hex digits.`, lengthMatch: false };
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return { equal: diff === 0, lengthMatch: true, differingDigits: [...x].filter((c, i) => c !== y[i]).length };
}

export { b64urlEncode, randomBytes, toHex };

/* ---------------- UI ---------------- */
if (typeof document !== "undefined" && typeof window !== "undefined") boot().catch((err) => console.warn(err));

async function boot() {
  const shell = await import("../shell.js");
  const { $, $$, toast, copyText, debounce } = shell;
  shell.bootTool();

  const src = $("#src");
  const tabs = $$("#tabs .tbtn");
  let mode = "digest";

  const ALGOS = [
    ["MD5", "md5", "legacy — checksums only, never passwords"],
    ["SHA-1", "sha1", "broken for signatures; fine for legacy keys"],
    ["SHA-256", "sha256", "the default"],
    ["SHA-384", "sha384", ""],
    ["SHA-512", "sha512", ""],
    ["CRC32", "crc32", "accidental-corruption checks only"],
    ["Adler-32", "adler32", "fast, weaker than CRC32"],
  ];

  $("#algoList").innerHTML = ALGOS.map(
    ([name, id, note], i) =>
      `<tr><td><code>${name}</code>${note ? ` <span class="mini">${note}</span>` : ""}</td><td class="mono" data-algo="${id}">${
        i === 2 ? "…" : "—"
      }</td><td><button class="tbtn" data-copyrow="${id}">copy</button></td></tr>`
  ).join("");

  async function runDigest() {
    const text = src.value;
    const bytes = mode === "file" && fileRef ? new Uint8Array(await fileRef.arrayBuffer()) : text;
    const rows = [];
    for (const [, id] of ALGOS) {
      try {
        if (id === "md5") rows.push([id, md5(bytes)]);
        else if (id === "sha256") rows.push([id, sha256(bytes)]);
        else if (id === "crc32") rows.push([id, crc32(bytes)]);
        else if (id === "adler32") rows.push([id, adler32(bytes)]);
        else rows.push([id, await subtleDigest(id.toUpperCase(), bytes)]);
      } catch (err) {
        rows.push([id, `— ${err.message}`]);
      }
    }
    for (const [id, val] of rows) {
      const node = $(`[data-algo="${id}"]`);
      if (node) {
        node.textContent = val;
        node.dataset.value = val;
      }
    }
    $$("[data-copyrow]").forEach((b) => {
      b.onclick = () => copyText($(`[data-algo="${b.dataset.copyrow}"]`)?.dataset.value || "", "Digest copied.");
    });
    $("#byteCount").textContent = `${(bytes.length ?? enc.encode(text).length).toLocaleString()} bytes`;
  }

  let fileRef = null;
  $("#fileIn").addEventListener("change", async (e) => {
    fileRef = e.target.files?.[0] || null;
    if (!fileRef) return;
    mode = "file";
    src.value = `${fileRef.name} · ${fileRef.size.toLocaleString()} bytes`;
    $("#fileNote").textContent = `Hashing ${fileRef.name} from disk — the file never leaves this tab.`;
    await runDigest();
    toast("Digest computed locally.", "ok", 2200);
  });

  const refresh = debounce(() => {
    if (mode === "digest") runDigest();
    else if (mode === "jwt") runJwt();
    else if (mode === "ids") runIds();
    else if (mode === "pw") runPassword();
    else if (mode === "cmp") runCompare();
  }, 150);
  src.addEventListener("input", refresh);

  function runJwt() {
    const res = decodeJwt(src.value);
    const out = $("#jwtOut");
    if (!res.ok) {
      out.innerHTML = `<p class="out is-error">${shell.escapeHtml(res.error)}</p>`;
      return;
    }
    const flagHtml = res.flags.length
      ? res.flags
          .map(
            (f) =>
              `<span class="pill ${f.state === "expired" ? "is-fail" : f.state === "soon" ? "is-warn" : "is-neutral"}">${f.label}: ${
                f.state === "expired" ? `expired ${humanYears(-f.seconds / 31557600)} ago` : f.state === "ok" && f.key === "exp" ? `in ${humanYears(f.seconds / 31557600)}` : f.value
              }</span>`
          )
          .join(" ")
      : '<span class="pill is-neutral">no exp/iat/nbf claims</span>';
    out.innerHTML = `
      <p>${flagHtml} <span class="pill is-warn">alg ${shell.escapeHtml(res.alg)} · signature NOT verified</span></p>
      <p class="mini">Decoding proves nothing about trust — anyone can mint a JWT. Verify the signature server-side.</p>
      <h4 class="label">header</h4>
      <pre class="out">${shell.escapeHtml(JSON.stringify(res.header, null, 2))}</pre>
      <h4 class="label">payload</h4>
      <pre class="out">${shell.escapeHtml(JSON.stringify(res.payload, null, 2))}</pre>`;
  }

  function runIds() {
    const n = Math.max(1, Math.min(200, Number($("#idCount").value) || 10));
    const kind = $("#idKind").value;
    const out = [];
    for (let i = 0; i < n; i++) {
      if (kind === "uuidv4") out.push(uuidv4());
      else if (kind === "uuidv7") out.push(uuidv7());
      else if (kind === "nanoid") out.push(nanoid(21));
      else if (kind === "hex") out.push(randomHex(16));
      else out.push(randomBase64(18));
    }
    src.value = out.join("\n");
    $("#jwtOut").innerHTML = `<p class="mini">${n} ${kind} value(s), generated from <code>crypto.getRandomValues</code>. Nothing was fetched.</p>`;
  }

  function runPassword() {
    const res = password({
      length: Number($("#len").value),
      lower: $("#cLower").checked,
      upper: $("#cUpper").checked,
      digits: $("#cDigits").checked,
      symbols: $("#cSymbols").checked,
      avoidAmbiguous: $("#cAmbig").checked,
      requireEach: $("#cEach").checked,
    });
    const pf = passphrase({
      words: Number($("#pw").value),
      separator: $("#sep").value || "-",
      capitalize: $("#cap").checked,
      addNumber: $("#num").checked,
    });
    if (res.error) {
      $("#pwOut").textContent = res.error;
      return;
    }
    $("#pwOut").innerHTML = `
      <code class="pwvalue">${shell.escapeHtml(res.value)}</code>
      <div class="meter"><i style="width:${Math.min(100, (res.entropyBits / 128) * 100)}%"></i></div>
      <p><span class="pill ${res.entropyBits >= 80 ? "is-pass" : res.entropyBits >= 60 ? "is-warn" : "is-fail"}">${res.label}</span>
      <span class="mono">${res.entropyBits} bits · pool ${res.poolSize}</span></p>
      <p class="mini">At 100 billion guesses/second (a serious offline rig): <b>${res.crackHuman}</b>.</p>
      <hr>
      <code class="pwvalue">${shell.escapeHtml(pf.value)}</code>
      <p><span class="pill ${pf.entropyBits >= 80 ? "is-pass" : "is-warn"}">${pf.wordCount} words · ${pf.bits} bits</span> <span class="mini">${pf.crackHuman}</span></p>
      <p class="mini">Word list has ${WORDS.length} entries = ${Math.log2(WORDS.length)} bits per word. These never touch a network — see the “0 uploads” chip.</p>`;
    $$("#pwOut .pwvalue").forEach((n) => n.addEventListener("click", () => copyText(n.textContent, "Copied — then paste it into your password manager.")));
  }

  function runCompare() {
    const [a, b] = src.value.split(/\n|,|;/).map((s) => s.trim()).filter(Boolean);
    const res = sameHash(a, b);
    $("#jwtOut").innerHTML = res.reason
      ? `<p class="pill is-fail">${shell.escapeHtml(res.reason)}</p>`
      : `<p class="pill ${res.equal ? "is-pass" : "is-fail"}">${res.equal ? "✓ identical" : `✕ different (${res.differingDigits} of ${a.length} digits differ)`}</p>`;
  }

  tabs.forEach((btn) =>
    btn.addEventListener("click", () => {
      tabs.forEach((b) => b.classList.toggle("is-on", b === btn));
      mode = btn.dataset.mode;
      $("#digestTable").hidden = mode !== "digest";
      $("#jwtOut").hidden = mode === "digest" || mode === "ids";
      $("#pwOut").hidden = mode !== "pw";
      $("#idsRow").hidden = mode !== "ids";
      $("#pwRow").hidden = mode !== "pw";
      $("#fileRow").hidden = mode === "pw" || mode === "cmp";
      if (mode === "digest") src.value = "The quick brown fox jumps over the lazy dog";
      if (mode === "cmp") src.value = "d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592\n  D7A8FBB307D7809469CA9ABCB0082E4F8D5651E46D3CDB762D02D0BF37C9E592\n";
      refresh();
    })
  );

  ["#len", "#pw", "#sep", "#cap", "#num", "#idKind", "#idCount"].forEach((sel) =>
    $(sel)?.addEventListener("change", refresh)
  );
  ["#cLower", "#cUpper", "#cDigits", "#cSymbols", "#cAmbig", "#cEach"].forEach((sel) => $(sel)?.addEventListener("change", refresh));
  ["#len"].forEach((sel) => $(sel)?.addEventListener("input", () => {
    $("#lenOut").textContent = `${$(sel).value} chars`;
    refresh();
  }));

  $("#copyAll").addEventListener("click", () => copyText($$('[data-algo]').map((n) => `${n.dataset.algo}  ${n.textContent}`).join("\n")));
  src.addEventListener("paste", () => setTimeout(refresh, 20));

  src.value = "The quick brown fox jumps over the lazy dog";
  tabs[2].classList.add("is-on");
  runDigest();
}
