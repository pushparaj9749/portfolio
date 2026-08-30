/* =========================================================
   Bench — ZIP writer
   A minimal STORE (no deflate) archive built with DataViews.
   Hand-rolled on purpose: zero dependencies, and the output is a
   perfectly standard .zip that Finder / Explorer / unzip open natively.
   ========================================================= */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** DOS timestamp packing (2s resolution, local time) — what unzip expects. */
function dosTime(d = new Date()) {
  return (
    ((d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2) & 0x1f)) >>> 0
  );
}
function dosDate(d = new Date()) {
  const year = Math.max(1980, d.getFullYear());
  return (((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) >>> 0;
}

/**
 * @param {Array<{name:string, blob:Blob}>} entries
 * @returns {Promise<Blob>} the archive
 */
export async function buildZip(entries) {
  const enc = new TextEncoder();
  const now = new Date();
  const time = dosTime(now);
  const date = dosDate(now);

  const locals = [];
  const centrals = [];
  let offset = 0;

  // de-duplicate names: zip silently tolerates dupes, but extraction loses files
  const used = new Map();

  for (const entry of entries) {
    let name = (entry.name || "file").replace(/[\\:*?"<>|]+/g, "_").replace(/^\/+/, "");
    if (used.has(name)) {
      const n = used.get(name) + 1;
      used.set(name, n);
      const dot = name.lastIndexOf(".");
      name = dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
    } else {
      used.set(name, 0);
    }

    const bytes = new Uint8Array(await entry.blob.arrayBuffer());
    const crc = crc32(bytes);
    const nameBytes = enc.encode(name);
    const size = bytes.length;

    const local = new DataView(new ArrayBuffer(30 + nameBytes.length));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // flag: UTF-8 filenames
    local.setUint16(8, 0, true); // method: store
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true); // uncompressed == compressed (store)
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    new Uint8Array(local.buffer, 30).set(nameBytes);
    locals.push(local.buffer, bytes.buffer);

    const central = new DataView(new ArrayBuffer(46 + nameBytes.length));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true); // made by
    central.setUint16(6, 20, true); // needed
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, time, true);
    central.setUint16(14, date, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, size, true);
    central.setUint32(24, size, true);
    central.setUint16(28, nameBytes.length, true);
    central.setUint16(30, 0, true); // extra
    central.setUint16(32, 0, true); // comment
    central.setUint16(34, 0, true); // disk
    central.setUint16(36, 0, true); // internal attrs
    central.setUint32(38, 0o600 << 16, true); // external attrs: rw-------
    central.setUint32(42, offset, true);
    new Uint8Array(central.buffer, 46).set(nameBytes);
    centrals.push(central.buffer);

    offset += 30 + nameBytes.length + size;
  }

  const centralSize = centrals.reduce((n, b) => n + b.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  end.setUint16(20, 0, true);

  return new Blob([...locals, ...centrals, end.buffer], { type: "application/zip" });
}
