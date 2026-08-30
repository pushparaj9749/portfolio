/* =========================================================
   Bench — the pipeline.  Runs in a Worker (OffscreenCanvas)
   or on the main thread (canvas fallback) with identical code,
   because `document` is only touched when OffscreenCanvas is absent.
   ========================================================= */

import { extFor } from "./constants.js";

/* ---------- canvas helper ---------- */
function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

async function canvasToBlob(canvas, mime, quality) {
  // OffscreenCanvas prefers convertToBlob; HTMLCanvasElement only has toBlob.
  if (typeof canvas.convertToBlob === "function") {
    try {
      const blob = await canvas.convertToBlob({
        type: mime,
        quality: mime === "image/png" ? undefined : quality,
      });
      if (blob && blob.size > 0) return blob;
    } catch {
      /* fall through to toBlob */
    }
  }
  return await new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== "function") {
      reject(new Error(`This browser cannot encode ${mime}`));
      return;
    }
    canvas.toBlob(
      (b) => (b && b.size > 0 ? resolve(b) : reject(new Error(`Encoding to ${mime} produced nothing`))),
      mime,
      quality
    );
  });
}

/* ---------- encoder probing ---------- */
let probe = null;
const PROBE_MIMES = ["image/webp", "image/avif", "image/jpeg", "image/png"];

/**
 * Does the returned blob really carry `mime`? We trust the file header and never
 * `blob.type`, because engines that don't know a requested type happily hand back
 * a PNG that they happily *label* as the thing you asked for.
 */
async function isGenuine(blob, mime) {
  if (!blob || blob.size === 0) return false;
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const ascii = [...head].map((c) => String.fromCharCode(c)).join("");
  switch (mime) {
    case "image/webp":
      return ascii.slice(8, 12) === "WEBP";
    case "image/avif":
      return ascii.slice(4, 8) === "ftyp" && ascii.slice(8, 12) === "avif";
    case "image/jpeg":
      return head[0] === 0xff && head[1] === 0xd8;
    case "image/png":
      return head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
    default:
      return false;
  }
}

export async function probeEncoders() {
  if (probe) return probe;
  const canvas = makeCanvas(2, 2);
  if (!canvas) {
    probe = { supported: new Map(), mode: "missing" };
    return probe;
  }
  const supported = new Map();
  for (const mime of PROBE_MIMES) {
    try {
      supported.set(mime, await isGenuine(await canvasToBlob(canvas, mime, 0.5), mime));
    } catch {
      supported.set(mime, false);
    }
  }
  probe = { supported, mode: supported.get("image/png") ? "ok" : "missing" };
  return probe;
}

/* ---------- decode ---------- */
async function decode(file) {
  if (typeof createImageBitmap === "function") {
    try {
      // `from-image` applies the EXIF Orientation tag, so phone photos stay upright.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* fall through to element-based decode */
    }
  }
  if (typeof document === "undefined") throw new Error("This browser cannot decode image files");
  return await decodeViaImg(file);
}

/** Last-resort decode path for browsers without createImageBitmap. */
function decodeViaImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = makeCanvas(img.naturalWidth, img.naturalHeight);
      c.getContext("2d").drawImage(img, 0, 0);
      resolve({ canvasLike: c, width: c.width, height: c.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Unsupported or corrupt image"));
    };
    img.src = url;
  });
}

/* ---------- metadata sniffing, so we can report what got removed ---------- */
async function sniffMeta(file) {
  const out = { exif: false, gps: false, icc: false, text: false };
  try {
    const head = new Uint8Array(await file.slice(0, Math.min(file.size, 256 * 1024)).arrayBuffer());
    // PNG
    if (head.length > 8 && head[0] === 0x89 && head[1] === 0x50) {
      let p = 8;
      while (p + 8 <= head.length) {
        const len = ((head[p] << 24) | (head[p + 1] << 16) | (head[p + 2] << 8) | head[p + 3]) >>> 0;
        const type = String.fromCharCode(head[p + 4], head[p + 5], head[p + 6], head[p + 7]);
        if (type === "eXIf") out.exif = true;
        else if (type === "iCCP") out.icc = true;
        else if (type === "tEXt" || type === "iTXt" || type === "zTXt") out.text = true;
        else if (type === "IEND") break;
        if (len > head.length) break;
        p += 12 + len; // 4 len + 4 type + data + 4 crc
      }
      return out;
    }
    // JPEG: walk the marker segments
    if (head.length > 4 && head[0] === 0xff && head[1] === 0xd8) {
      let p = 2;
      while (p + 4 < head.length && head[p] === 0xff) {
        const marker = head[p + 1];
        if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) break;
        const segLen = (head[p + 2] << 8) | head[p + 3];
        if (segLen < 2) break;
        if (marker === 0xe1) {
          const tag = String.fromCharCode(...head.subarray(p + 4, Math.min(p + 10, head.length)));
          if (tag.startsWith("Exif")) {
            out.exif = true;
            // The GPS IFD pointer is tag 0x8825 inside IFD0 — either byte order.
            const body = head.subarray(p + 10, p + 2 + segLen);
            for (let i = 0; i + 1 < body.length; i++) {
              if ((body[i] === 0x88 && body[i + 1] === 0x25) || (body[i] === 0x25 && body[i + 1] === 0x88)) {
                out.gps = true;
                break;
              }
            }
          }
        } else if (marker === 0xe2) out.icc = true;
        else if (marker === 0xed || marker === 0xfe) out.text = true; // Adobe / comment
        p += 2 + segLen;
      }
    }
  } catch {
    /* sniffing is cosmetic — never fail a job over it */
  }
  return out;
}

/* ---------- resize math ---------- */
export function fitSize(srcW, srcH, s) {
  if (!s || s.resizeMode === "none") return [srcW, srcH];
  let scale = 1;
  const num = (v, fb) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fb;
  };
  switch (s.resizeMode) {
    case "percent":
      scale = num(s.percent, 100) / 100;
      break;
    case "max": {
      const m = num(s.maxDim, Infinity);
      // "cap the longest edge" never enlarges — upscaling can only look worse.
      scale = Math.min(1, m / Math.max(srcW, srcH));
      break;
    }
    case "width":
      scale = num(s.width, srcW) / srcW;
      break;
    case "height":
      scale = num(s.height, srcH) / srcH;
      break;
    default:
      scale = 1;
  }
  scale = Math.min(Math.max(scale, 0.01), 8);
  return [Math.max(1, Math.round(srcW * scale)), Math.max(1, Math.round(srcH * scale))];
}

/* ---------- the one entry point ---------- */
export async function run(file, spec) {
  const started = performance.now();
  const meta = await sniffMeta(file);
  const decoded = await decode(file);
  const srcW = decoded.width || decoded.naturalWidth;
  const srcH = decoded.height || decoded.naturalHeight;
  if (!srcW || !srcH) throw new Error("Could not read the image dimensions");

  const srcMime = file.type || "image/png";
  const [outW, outH] = fitSize(srcW, srcH, spec);
  const needsDraw = outW !== srcW || outH !== srcH;
  const formatChange = !!spec.mime && spec.mime !== srcMime;
  // Re-encoding is what destroys metadata; if nothing changes we hand back the original bytes.
  const needsReencode = Boolean(spec.stripMeta) || needsDraw || formatChange;

  let blob = null;
  if (needsReencode) {
    const canvas = makeCanvas(outW, outH);
    const ctx = canvas.getContext("2d", { alpha: spec.mime !== "image/jpeg" });
    if (spec.mime === "image/jpeg") {
      ctx.fillStyle = "#ffffff"; // JPEG has no alpha: flatten instead of going black
      ctx.fillRect(0, 0, outW, outH);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(decoded.canvasLike || decoded, 0, 0, outW, outH);
    blob = await canvasToBlob(canvas, spec.mime || srcMime, spec.quality);
  }

  if (decoded.close) decoded.close();

  // Don't hand back a bigger file than we were given.
  let skipped = false;
  if (needsReencode && blob.size >= file.size && spec.skipIfLarger) {
    blob = file;
    skipped = true;
  } else if (!needsReencode) {
    blob = file;
  }

  const outMime = skipped || !needsReencode ? srcMime : spec.mime || srcMime;
  return {
    ok: true,
    id: spec.id,
    blob,
    name: skipped ? file.name : spec.outName || `${file.name}.${extFor(outMime)}`,
    originalSize: file.size,
    size: blob.size,
    savedBytes: file.size - blob.size,
    savedPct: file.size ? ((file.size - blob.size) / file.size) * 100 : 0,
    fromMime: srcMime,
    toMime: outMime,
    ext: extFor(outMime),
    srcW,
    srcH,
    outW: skipped || !needsReencode ? srcW : outW,
    outH: skipped || !needsReencode ? srcH : outH,
    meta,
    metaRemoved: needsReencode && !skipped,
    reencoded: needsReencode && !skipped,
    skipped,
    grew: !skipped && needsReencode && blob.size >= file.size,
    ms: Math.round(performance.now() - started),
  };
}

export function errorMessage(err) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  return err.message || String(err);
}
