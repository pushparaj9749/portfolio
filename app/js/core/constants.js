/* =========================================================
   Bench — shared constants
   No imports. Used by the page and by the Web Workers, so it
   must stay dependency-free and side-effect-free.
   ========================================================= */

export const APP = {
  name: "Bench",
  tagline: "A private image workbench. Your files never leave this tab.",
  version: "1.0.0",
  settingsKey: "bench.settings.v1",
  flagsKey: "bench.flags.v1",
  themeKey: "bench.theme.v1",
};

/** Image types we can read. Decoder support is probed at runtime too. */
export const ACCEPTED = "image/png,image/jpeg,image/webp,image/avif,image/gif,image/bmp";

export const FORMATS = [
  {
    id: "webp",
    label: "WebP",
    mime: "image/webp",
    ext: "webp",
    lossy: true,
    note: "Best all-round size. Great for web and sharing.",
  },
  {
    id: "avif",
    label: "AVIF",
    mime: "image/avif",
    ext: "avif",
    lossy: true,
    note: "Smallest output on modern browsers. Slower to encode.",
  },
  {
    id: "jpeg",
    label: "JPEG",
    mime: "image/jpeg",
    ext: "jpg",
    lossy: true,
    note: "Maximum compatibility. Transparency is flattened to white.",
  },
  {
    id: "png",
    label: "PNG",
    mime: "image/png",
    ext: "png",
    lossy: false,
    note: "Lossless. Use for screenshots, logos and flat graphics.",
  },
  {
    id: "source",
    label: "Keep original",
    mime: null,
    ext: null,
    lossy: true,
    note: "Re-encode to the same format — for resize or strip only.",
  },
];

const MIME_BY_EXT = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", avif: "image/avif" };

/**
 * Decide the real output MIME for one file, given the chosen format id,
 * that file's source type and the browser's encoder support.
 * Always returns a usable `image/*` MIME (or "" when nothing can be encoded).
 */
export function resolveMime(targetId, sourceMime, supported) {
  const target = FORMATS.find((f) => f.id === targetId) || FORMATS[0];
  const src = sourceMime || "image/png";

  if (target.id === "source") return src;

  // Trust the browser over our table: if it says it can't encode this, degrade.
  const canEncode = (mime) => {
    if (!supported || !supported.size) return true; // probing not done / unavailable
    const flag = supported.get(mime);
    return flag !== false;
  };

  if (!canEncode(target.mime)) {
    const fallbacks = [src, "image/webp", "image/jpeg", "image/png"];
    for (const mime of fallbacks) {
      if (mime && canEncode(mime) && /^image\//.test(mime)) return mime;
    }
    return src;
  }
  return target.mime;
}

/** Preferred extension for a MIME (used for filenames). */
export function extFor(mime) {
  const hit = FORMATS.find((f) => f.mime === mime);
  if (hit) return hit.ext;
  if (mime === "image/gif") return "gif";
  if (mime === "image/bmp") return "bmp";
  return String(mime || "").split("/")[1] || "img";
}

/** Which format id a given MIME maps back to (for display). */
export function formatIdFor(mime) {
  const hit = FORMATS.find((f) => f.mime === mime);
  return hit ? hit.id : "source";
}

export function isImage(file) {
  return /^image\//.test(file.type) || /\.(png|jpe?g|webp|avif|gif|bmp)$/i.test(file.name || "");
}

export function prettyBytes(n) {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 2 : 1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function clamp(n, min, max, fallback = min) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

export const DEFAULT_SETTINGS = {
  format: "webp",
  resizeMode: "max", // none | max | percent | width | height
  maxDim: 1920,
  width: 1600,
  height: 1600,
  percent: 70,
  quality: 0.82,
  stripMeta: true,
  skipIfLarger: true,
  suffix: "-compressed",
  keepName: false,
};

export { MIME_BY_EXT };
