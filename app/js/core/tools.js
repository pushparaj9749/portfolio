/* =========================================================
   Tools registry — the single source of truth.
   Drives the header nav, the per-page accent, the hub's
   keyboard search, and the service worker's warm-up list.

   Adding a tool = one entry here + a page under tools/<id>/
   + a module under js/tools/<id>.js + two lines in sw.js.

   Accent colours are not typed here. They come from palette.js, which is
   generated from tools/make-palette.mjs (twelve hues, one lightness and one
   chroma per theme), so a new tool gets a colour that cannot clash and cannot
   fail contrast — and the palette audit proves it.
   ========================================================= */

import { TOOL_ACCENTS } from "./palette.js";

export const TOOLS = [
  {
    id: "images",
    name: "Images",
    href: "images/",
    tagline: "Compress, resize, convert, strip EXIF — in bulk.",
    glyph: "M3 5.5h18v13H3z M6 15l4-4.5 3 3 2.5-2.5L20 15",
    keywords: "photo jpeg png webp avif compress resize convert quality zip exif gps metadata",
  },
  {
    id: "text",
    name: "Text",
    href: "tools/text/",
    tagline: "Cases, line ops, counts, encodings.",
    glyph: "M5 5h14 M5 10h14 M5 15h9 M5 20h5",
    keywords: "text case uppercase lowercase title slug kebab snake dedupe sort lines count words trim whitespace entity url base64",
  },
  {
    id: "json",
    name: "JSON",
    href: "tools/json/",
    tagline: "Format, validate, transform, flatten.",
    glyph: "M8 4c-3 0-3 4-3 4s0 2-2 4c2 2 2 4 2 4s0 4 3 4 M16 4c3 0 3 4 3 4s0 2 2 4c-2 2-2 4-2 4s0 4-3 4",
    keywords: "json format minify pretty print validate parse error sort keys flatten csv tsv query path stats",
  },
  {
    id: "csv",
    name: "Tables",
    href: "tools/csv/",
    tagline: "CSV · TSV · JSON · Markdown, both ways.",
    glyph: "M3 5h18v14H3z M3 10h18 M3 15h18 M9 5v14 M15 5v14",
    keywords: "csv tsv table delimiter quote excel markdown json rows columns transpose filter sort dedupe",
  },
  {
    id: "regex",
    name: "Regex",
    href: "tools/regex/",
    tagline: "Live matches, groups, replace preview.",
    glyph: "M12 4v16 M6.5 7.5l11 9 M17.5 7.5l-11 9 M4 12h4 M4 8h4 M4 16h4",
    keywords: "regex regexp javascript pattern match replace capture group named flags highlight validate email url phone test",
  },
  {
    id: "time",
    name: "Dates & Units",
    href: "tools/time/",
    tagline: "Epochs, timezones, durations, conversions.",
    glyph: "M12 3a9 9 0 100 18 9 9 0 000-18z M12 7v5l3.5 2",
    keywords: "date time epoch unix timestamp iso8601 timezone utc duration countdown age units metric imperial bytes temperature",
  },
  {
    id: "hash",
    name: "Hash & Code",
    href: "tools/hash/",
    tagline: "Digests, JWTs, UUIDs, strong passwords.",
    glyph: "M6 4v16 M12 4v16 M18 4v16 M6 9h12 M6 15h12",
    keywords: "hash sha256 sha1 sha512 md5 crc32 hmac digest checksum jwt token decode uuid nanoid password passphrase entropy base64 hex",
  },
  {
    id: "color",
    name: "Color",
    href: "tools/color/",
    tagline: "Palettes, conversions, WCAG contrast.",
    glyph: "M12 3a9 9 0 100 18c1.5 0 2-1 2-2s-.5-2-2-2h1a4 4 0 004-4c0-3-2.5-8-6-8z M8 10h.01 M8.5 14.5h.01 M12 8h.01",
    keywords: "color hex rgb hsl oklch palette contrast wcag accessibility tint shade gradient css tailwind",
  },
  {
    id: "gradient",
    name: "Gradients",
    href: "tools/gradient/",
    tagline: "Linear, radial, conic — CSS you can paste.",
    glyph: "M4 19.5v-3 M9 19.5v-7 M14 19.5v-11 M19 19.5v-15",
    keywords: "gradient css linear radial conic angular repeating angle stop background mesh soft hero banner",
  },
  {
    id: "shadow",
    name: "Shadow & Glass",
    href: "tools/shadow/",
    tagline: "Layered box, text and glass effects.",
    glyph: "M4 4h10v10H4z M10 10h10v10H10z",
    keywords: "shadow box-shadow text-shadow drop-filter glow neon blur glass backdrop-filter elevation depth layer inset",
  },
  {
    id: "scale",
    name: "Type & Space",
    href: "tools/scale/",
    tagline: "Modular scales, fluid clamp, spacing.",
    glyph: "M3 9h18v6H3z M7 9v3 M11 9v4 M15 9v3 M19 9v4",
    keywords: "type scale modular rhythm fluid clamp viewport rem px spacing space 8pt grid line-height heading size",
  },
  {
    id: "theme",
    name: "Theme Builder",
    href: "tools/theme/",
    tagline: "One colour in, a contrast-checked token set out.",
    glyph: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M15 15h3v3h-3z",
    keywords: "theme tokens design system css custom properties variables dark light contrast wcag brand surface palette ramp",
  },
];

/** Every tool carries its slice of the wheel. */
for (const tool of TOOLS) tool.accent = TOOL_ACCENTS[tool.id] || { dark: "", light: "", onDark: "", onLight: "" };

export const toolById = (id) => TOOLS.find((t) => t.id === id) || null;

/** CSS custom properties for a tool's accent, ready for style.setProperty. */
export function accentVars(tool) {
  if (!tool) return {};
  return {
    "--tool-dark": tool.accent.dark,
    "--tool-light": tool.accent.light,
    "--tool-on-dark": tool.accent.onDark,
    "--tool-on-light": tool.accent.onLight,
  };
}

/**
 * Which text colour belongs with a tool's accent in a given theme.
 * Exported so the palette test can check every pair in isolation.
 */
export function accentPair(tool, theme) {
  return theme === "light"
    ? { bg: tool.accent.light, fg: tool.accent.onLight }
    : { bg: tool.accent.dark, fg: tool.accent.onDark };
}
