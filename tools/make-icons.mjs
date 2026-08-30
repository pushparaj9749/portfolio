/* Dev-only rasteriser — writes Bench's PNG icons with zero dependencies
   (zlib + a hand-rolled PNG encoder + 4x supersampled scalar SDFs).
   Run: node tools/make-icons.mjs */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TOKENS } from "../app/js/core/palette.js";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../app/assets");
mkdirSync(outDir, { recursive: true });

/* ---------- PNG ---------- */
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, c]);
}
function encodePng(size, rgba) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- SDF primitives (all lengths in supersampled px) ---------- */
const sdRound = (px, py, w, h, r) => {
  const qx = Math.abs(px) - w + r;
  const qy = Math.abs(py) - h + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
};
const sdSeg = (px, py, ax, ay, bx, by) => {
  const abx = bx - ax;
  const aby = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby || 1)));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
};
const cov = (d, aa) => Math.max(0, Math.min(1, (aa / 2 - d) / aa));

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/* The icons are the palette's, not the palette's icons' memory: colours come
   from the generated module so regenerating the theme regenerates the brand mark. */
const D = TOKENS.dark;
const BG = hex(D["--bg"]);
const LINE = hex(D["--line"]);
const ACCENT = hex(D["--accent"]);

function render(size, { pad = 0.165 } = {}) {
  const AA = 4;
  const S = size * AA;
  const px = (v) => (v / size) * S; // "design px" (of a 100px box) -> supersampled px
  const R = S / 2; // centre
  const half = S / 2 - S * pad; // background rect half-extent
  const buf = new Float64Array(S * S * 4);

  const over = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= S || y >= S || a <= 0) return;
    const i = (y * S + x) * 4;
    const da = buf[i + 3];
    const na = a + da * (1 - a);
    if (na <= 0.0001) return;
    for (const [off, src] of [[0, r], [1, g], [2, b]]) {
      buf[i + off] = (src * a + buf[i + off] * da * (1 - a)) / na;
    }
    buf[i + 3] = na;
  };

  const drawRing = (cx, cy, w, h, radius, t, color, aa = px(1.1)) => {
    for (let y = 0; y < S; y++) {
      const fy = y + 0.5 - cy;
      if (Math.abs(fy) > h + t + aa) continue;
      for (let x = 0; x < S; x++) {
        const d = Math.abs(sdRound(x + 0.5 - cx, fy, w, h, radius)) - t / 2;
        const a = cov(d, aa);
        if (a > 0.002) over(x, y, color[0] / 255, color[1] / 255, color[2] / 255, a);
      }
    }
  };
  const drawPolyline = (pts, t, color, aa = px(1.1)) => {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs) - t;
    const maxX = Math.max(...xs) + t;
    const minY = Math.min(...ys) - t;
    const maxY = Math.max(...ys) + t;
    for (let y = Math.max(0, Math.floor(minY)); y < Math.min(S, Math.ceil(maxY)); y++) {
      for (let x = Math.max(0, Math.floor(minX)); x < Math.min(S, Math.ceil(maxX)); x++) {
        let d = Infinity;
        for (let i = 0; i < pts.length - 1; i++) {
          d = Math.min(d, sdSeg(x + 0.5, y + 0.5, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
        }
        const a = cov(d - t / 2, aa);
        if (a > 0.002) over(x, y, color[0] / 255, color[1] / 255, color[2] / 255, a);
      }
    }
  };
  const drawDisc = (cx, cy, r, color, aa = px(1.1)) => {
    for (let y = Math.max(0, Math.floor(cy - r - aa)); y < Math.min(S, Math.ceil(cy + r + aa)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r - aa)); x < Math.min(S, Math.ceil(cx + r + aa)); x++) {
        const a = cov(Math.hypot(x + 0.5 - cx, y + 0.5 - cy) - r, aa);
        if (a > 0.002) over(x, y, color[0] / 255, color[1] / 255, color[2] / 255, a);
      }
    }
  };
  const drawBar = (x0, x1, y, t, color, aa = px(1.1)) => {
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
      for (let y0 = Math.floor(y - t); y0 < Math.ceil(y + t); y0++) {
        const a = cov(Math.abs(y0 + 0.5 - y) - t / 2, aa);
        if (a > 0.002) over(x, y0, color[0] / 255, color[1] / 255, color[2] / 255, a);
      }
    }
  };

  /* 1 · background rounded square */
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const a = cov(sdRound(x + 0.5 - R, y + 0.5 - R, half, half, half * 0.235), px(1.2));
      if (a > 0.002) over(x, y, BG[0] / 255, BG[1] / 255, BG[2] / 255, a);
    }
  }

  /* 2 · "image" frame — fits inside the tile with real margin */
  const frameW = half * 0.84;
  const frameH = half * 0.66;
  const frameCY = R - half * 0.08;
  const hairline = size <= 200 ? 1.35 : 1;
  drawRing(R, frameCY, frameW, frameH, frameW * 0.24, px(2.4 * hairline), LINE);

  /* 3 · sun */
  drawDisc(R - frameW * 0.46, frameCY - frameH * 0.4, px(4.2 * hairline), ACCENT);

  /* 4 · mountain range, sitting on the frame's lower third */
  const P = (mx, my) => [R + mx * frameW * 0.86, frameCY + my * frameH];
  drawPolyline(
    [P(-0.82, 0.44), P(-0.3, -0.2), P(0.02, 0.18), P(0.32, -0.1), P(0.82, 0.44)],
    px(3.1 * hairline),
    ACCENT
  );

  /* 5 · progress bar under the frame: grey track, accent fill */
  const barY = frameCY + frameH + half * 0.3;
  const barT = px(2.6 * hairline);
  drawBar(R - frameW * 0.84, R + frameW * 0.84, barY, barT, LINE);
  drawBar(R - frameW * 0.84, R - frameW * 0.84 + frameW * 1.68 * 0.58, barY, barT, ACCENT);

  /* 7 · box downsample */
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < AA; sy++) {
        for (let sx = 0; sx < AA; sx++) {
          const i = ((y * AA + sy) * S + (x * AA + sx)) * 4;
          r += buf[i];
          g += buf[i + 1];
          b += buf[i + 2];
          a += buf[i + 3];
        }
      }
      const n = AA * AA;
      const alpha = a / n;
      const o = (y * size + x) * 4;
      out[o + 3] = Math.round(alpha * 255);
      if (alpha <= 0.002) continue;
      out[o] = Math.min(255, Math.round((r / n) * 255));
      out[o + 1] = Math.min(255, Math.round((g / n) * 255));
      out[o + 2] = Math.min(255, Math.round((b / n) * 255));
    }
  }
  return encodePng(size, out);
}

/* quick contact sheet so the result can be eyeballed in one image */
const jobs = [
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  ["icon-180.png", 180, {}],
  ["icon-maskable.png", 512, { pad: 0.26 }],
];
for (const [name, size, opts] of jobs) {
  const png = render(size, opts);
  writeFileSync(resolve(outDir, name), png);
  console.log(`wrote ${name} (${size}px, ${(png.length / 1024).toFixed(1)} KB)`);
}
