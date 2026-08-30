# Bench — twelve private tools, one tab

Compress images in bulk · format JSON · write a regex · convert a CSV · read a timestamp ·
hash a download · build a gradient · type a scale · derive a whole theme from one colour —
**entirely inside the browser.** No upload, no signup, no server, no ads, no cookie banner,
no build step.

Live: https://pushparaj9749.github.io/portfolio/app/

> Why "Bench" in a repo called `portfolio`: the repo started life as a placeholder.
> This is a real tool, not a résumé page — see [docs/PLAN.md](docs/PLAN.md) for the
> idea menu it was picked from.

---

## The twelve

Each tool is its own page (`app/tools/<id>/`), its own module, its own accent colour.
They share one shell: keyboard palette (`⌘K`), theme switch, a hub with search, and the
privacy audit in the header.

| Tool | What it does |
|---|---|
| **Images** | Batch compress, resize, convert (WebP/AVIF/JPEG/PNG), strip EXIF + GPS, one `.zip` out. |
| **Text** | Cases, line ops (sort/dedupe/unique/diff), counts, Base64 · URL · HTML · JWT-safe encodings. |
| **JSON** | Format, validate, minify, flatten/expand, sort keys, path picker, CSV↔JSON. |
| **Tables** | CSV · TSV · JSON · Markdown, both ways, with quote/newline-aware parsing. |
| **Regex** | Live matches, named groups, replace preview, flag lab, catastrophic-backtrack guard. |
| **Dates & Units** | Epoch, timezones, durations, `Intl` formatting, and a conversion bench for length/mass/data/temp. |
| **Hash & Code** | SHA-1/256/512 + MD5, HMAC, UUIDs, strong passwords, JWT decode. |
| **Color** | Parse anything, convert, harmonies, ramps, WCAG contrast with a real pass/fail table. |
| **Gradients** | Linear / radial / conic stops you drag, a legibility check against the text you'll put on top, CSS out. |
| **Shadow & Glass** | Layered box shadows, text shadows, `drop-filter`, elevation ramps, frosted glass with its fallback. |
| **Type & Space** | Modular scales, fluid `clamp()`, line-height rhythm, spacing scales, tokens as CSS/Tailwind/SCSS/JSON. |
| **Theme Builder** | One brand colour in → both themes' full token ladder out, every pair contrast-checked, with one-click fixes. |

Installable PWA (`?recipe=…` shortcuts deep-link into Image recipes), and it keeps working
after the first load with the network off — every page and module is precached.

## The one claim that matters, and how it's enforced

**Your data never leaves the tab.** Not a promise — a property of the build:

- There is **no backend**. `app/` is 44 static files; nothing accepts a POST.
- There is **no network code**. Across ~470 KB of shipped source there are exactly three
  things that can touch a socket: `sw.js` refilling its own cache, and one `new Image()` in
  the image pipeline that is handed a local `blob:` URL. No `fetch` of user data, no XHR,
  no `sendBeacon`, no CDN, no webfont — the dependency list is empty, so there is no
  transitive supplier to trust.
- The header's **`0 uploads`** counter is a live audit: `fetch`, `XMLHttpRequest.open` and
  `sendBeacon` are wrapped, and any off-origin request is recorded and displayed in red.
  Inspect `window.__benchPrivacy` in devtools for the raw log.
- Images are processed in a **Web Worker** via `OffscreenCanvas` — never touched by the UI
  thread, never serialised anywhere.

Try it yourself: devtools → Network → run a batch or paste a secret. The only entries are
the app's own files.

## Colour, derived not typed

The palette is **Sea Ink**: a near-neutral cold ground (dark `#0b0e12`, light `#f2f4f4`) so a
swatch never sits on a coloured field, with a teal accent (`#40d9c1`) that survives both themes.

The surfaces were chosen by hand — mood isn't a formula. The **twelve accents are derived**:
30° apart on the OKLCH hue wheel at one fixed lightness and one fixed chroma per theme. That
buys three things a hand-picked list can't guarantee:

1. every tool is as far from its neighbours as possible, so twelve chips never look like
   twelve accidents;
2. they're all equally bright and equally saturated, so the hub grid reads as one family;
3. the text drawn *on* an accent is picked by measuring contrast, not by eye.

OKLCH rather than HSL because HSL's "same lightness" is a lie — yellow at L 50% screams,
blue at L 50% goes muddy.

Everything else follows from that: `tools/make-palette.mjs` writes the `@palette` block into
`app/styles.css`, mirrors the tokens into `app/js/core/palette.js` so JS (canvas previews,
icons, the social card) can never disagree with what CSS paints, and attaches each tool's
accent to the registry. **No page hard-codes a colour and no page overrides `--accent`** —
`tests/palette.test.mjs` fails if either happens.

```bash
node tools/make-palette.mjs --print    # the whole system, hex by hex
node tools/make-palette.mjs --write    # regenerate styles.css + palette.js + tool accents
node tools/make-palette.mjs --check    # fails if a generated file drifted (used by tests)
```

Contrast floors, asserted rather than admired (both themes, every pair a reader meets):
body text ≥ 7:1, secondary ≥ 4.5, muted ≥ 3, status colours ≥ 3 on the page background,
site accent ≥ 4.5 on its panel, tool accents ≥ 3 as text and ≥ 4.5 for the label drawn on them.

## Architecture

```
index.html                  repo root: 0ms redirect to app/ for GitHub Pages. No stylesheet here,
                            so its inlined colours are asserted against the palette (tests/palette.test.mjs)

app/
├── index.html              the hub: search, cards, recipes — no framework, no inline logic
├── styles.css              generated palette block + design tokens + every component
├── sw.js                   precache-the-shell service worker (offline)
├── manifest.webmanifest    installable; shortcuts deep-link ?recipe=…
├── assets/                 icons + og.png, both generated from the palette
├── images/index.html       the image workbench (the only tool big enough for its own dir)
├── js/
│   ├── shell.js            chrome: theme, palette (⌘K), privacy audit wiring
│   ├── hub.js              hub page: search + cards, rendered from the registry
│   ├── bench.worker.js     worker entry: receives a File, returns a Blob
│   ├── core/
│   │   ├── palette.js      GENERATED theme tokens + per-tool accents
│   │   ├── tools.js        the registry — one entry per tool (name, page, accent hue)
│   │   ├── constants.js    formats table, settings, small pure helpers (shared with the worker)
│   │   ├── pipeline.js     decode → sniff metadata → resize → encode → skip-if-bigger
│   │   ├── pool.js         worker pool with bounded retries + main-thread fallback
│   │   ├── store.js        localStorage settings + the privacy audit
│   │   └── zip.js          STORE-only .zip writer (DataView + CRC-32), no library
│   └── tools/<id>.js       one module per tool; logic separate from DOM so Node can run it
└── tools/<id>/index.html   one page per tool
```

Decisions worth knowing:

- **No dependencies, no build step.** ES modules the browser loads directly. Nothing to rot,
  nothing to audit for supply-chain risk. ~470 KB of source, ~130 KB gzipped for all twelve tools.
- **The registry is the single source of truth.** Hub cards, nav, the service worker's
  precache list and the accent of a page all read from `app/js/core/tools.js`, so a tool
  cannot be half-registered: forget the sw entry and `tools/check-pages.mjs` fails.
- **Tool modules keep logic out of the DOM at module scope**, which is why the test suites in
  `tests/` can import `app/js/tools/*.js` directly and run them in Node.
- **`pipeline.js` is host-agnostic** — `OffscreenCanvas` when present, `document` when not, so
  the same code runs in the worker and on the main thread. If Workers are unavailable the tool
  gets slower, never broken.
- **Encoder support is probed from file headers, never `blob.type`** — engines happily label a
  PNG as `image/avif` when asked for AVIF. Guessing wrong here silently converts everything to PNG.
- **Metadata stripping is an emergent property of re-encoding**, not a parser — which is why it
  can't miss a marker format that didn't exist when this was written.
- **`skipIfLarger` is on by default.** A second lossy pass on an already-tuned JPEG grows the
  file; then the original bytes are returned and the card says "left untouched" rather than
  pretending there was a saving.
- **No webfont.** A Google Fonts link is an off-origin request on every page view — the exact
  thing this tool is against — and it blocks first paint.

## Adding a thirteenth tool

1. Add an entry to `app/js/core/tools.js` (id, name, page, tagline, keywords) and one hue in
   `TOOL_HUES` in `tools/make-palette.mjs`.
2. `node tools/make-palette.mjs --write` — the accent, the hub card and the `theme-color`
   meta all follow from the registry.
3. Write `app/js/tools/<id>.js` (logic first, DOM second) and `app/tools/<id>/index.html`,
   then add the two lines to `TOOLS` in `app/sw.js` and bump `VERSION`.
4. Add `tests/<id>.test.mjs` and run `node tests/run.mjs` + `node tools/check-pages.mjs`.

The two scripts are the point: they fail loudly on the exact mistakes that are invisible in a
dev server — an unregistered page, a dead control, an accent that can't be read on its own panel.

## Run / develop

```bash
python3 tools/serve.py 3000 .      # or: npx serve .   ·   php -S localhost:3000
# → http://localhost:3000/app/
```

A server is needed only because browsers refuse to load ES modules over `file://`.
Edits are plain files — refresh, no build.

```bash
node tests/run.mjs                 # five suites, 63 groups, Node only (no browser, no deps)
node tools/check-pages.mjs         # static audit: registry ↔ pages ↔ sw ↔ palette ↔ contrast
node tools/make-icons.mjs          # PNG icons — colours read from the palette module
bash tools/make-og.sh              # og.png — colours AND tool list read from the palette + registry
node --check app/js/**/*.js        # there is no lint step; syntax is checked, styles are audited
```

## Testing

There's no browser in CI here, so the logic runs in Node against real input and the browser
APIs are stubbed. Coverage:

- **images** — `fitSize` in all 5 modes, "never enlarges", byte-identical passthrough when the
  recipe changes nothing, `skipIfLarger` never overstating a saving, PNG→JPEG alpha flattening
  to white, metadata sniffing of PNG `eXIf`/`iCCP`/`tEXt` and JPEG APP1/APP2 + the `0x8825` GPS
  pointer, an encoder that *lies* about the type it produced, the pool (concurrency cap, bounded
  retries on a poison file, one bad file not sinking a batch, clean teardown, no-Worker fallback),
  and the ZIP verified with real `unzip -t`. One integration pass: 5 files → pool → pipeline →
  zip → `unzip -t` → member is a real `RIFF`.
- **`tests/palette.test.mjs`** (13 groups) — generated files current, shipped CSS equals the
  derived tokens, every contrast floor in both themes, ≥28° hue gaps, no hand-written `--accent`,
  `theme-color` metas matching the palette, sw precache complete, and no cliché colours.
- **`tests/gradient.test.mjs`** (12) — stop parsing that survives `rgba()` commas, devtools
  one-liners and newline lists; unanchored stops spreading evenly; every preset building and
  round-tripping; `sampleRamp` a real piecewise mix; per-sample legibility against what's behind.
- **`tests/shadow.test.mjs`** (12) — five-part layer serialisation, `text-shadow` dropping
  spread/inset, `drop-filter` merging, `build(parse(x)) === x` for every preset, monotone
  elevation with a cap, glass emitting its `-webkit-` twin and its inset highlight.
- **`tests/scale.test.mjs`** (13) — the modular scale indexed from `base`, snapping keeping
  `.exact`, fluid `clamp()` *re-evaluated at 360/768/1200* rather than trusted from the model,
  leading monotone against size, measure/characters-per-line, rhythm warnings, token exports
  balanced and JSON-parseable.
- **`tests/theme.test.mjs`** (13) — OKLCH round trip exact over the sRGB cube, out-of-gamut
  colours clamped instead of NaN'd, all ten sample brands passing their own audit in both modes,
  surface ladder ordering, tint bleed, semantics separation, `fixTheme` moving lightness only
  and never the brand, five export formats, and `parseTokens` reading real stylesheets.

Writing the suites found four real bugs. They are in the repo because of them:
`parseColor` returns `{ ok: false }` rather than null, and two consumers tested it with
`if (!color)` — which built NaN colours out of garbage; a modular-scale table whose labels were
off by one step (`16px` shipped as `--text-sm`); and an OKLab→sRGB matrix whose `s_` row
carried `m_`'s coefficient, quietly rotating every derived colour by a few degrees — fixed, and
the round trip is now exact across 64k sampled colours.

## Deliberate limits

GIFs flatten to their first frame (animation needs a real decoder) · no crop/rotate yet ·
gradients preview at sample resolution, not the browser's own interpolation · the shadow bench
doesn't render blur on a canvas, it emits CSS you paste · `Theme Builder` reports a status-colour
clash rather than re-tinting your brand to avoid it · results live in memory, so a refresh
clears them (by design — nothing is stored).

## Roadmap

1. Crop / rotate / straighten, with the same scrub-style interaction as resize.
2. Rename patterns (`{name}_{w}x{h}`) and per-file recipe overrides.
3. PDF page tools — the same no-upload trick via `pdf-lib`, worth the dependency.
4. `?config=` share links, so a recipe or a generated theme can be sent as a URL.
5. A design-token *linter* that reads a pasted stylesheet and reports contrast and scale
   violations — `parseTokens` already does the hard half.
6. Drop `zip.js` for DEFLATE via `CompressionStream` when it's universal (~30% smaller archives).
