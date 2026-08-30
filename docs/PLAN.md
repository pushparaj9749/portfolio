# Decision memo — what this repo is, and why

Asked for "a website that actually useful for everyone", stack left to me. The full
10-idea menu I scored it against is in [IDEAS.md](IDEAS.md); this is the outcome.

## Filter

An idea had to be all four of:
1. **Utility** — a stranger bookmarks it and returns next week.
2. **Zero-friction** — no signup, no server, no install; value in under 10 seconds.
3. **Free to host forever** — static files only; no monthly bill, no database to die.
4. **Craft ceiling** — room for motion, offline support, performance, real architecture.

## Picked: Bench — a private image workbench

Batch compress / resize / convert / strip-EXIF in the browser tab, exporting a `.zip`.

Beaten candidates and why: PDF tools (needs a ~1 MB dependency — deferred to roadmap),
subscription tracker (needs an account or a server, fails #3), new-tab dashboard
(taste-shaped, crowded), regional reference site and calculator suite (strong on #1–#3,
weak on #4 — no engineering story, and they need ongoing editorial upkeep).

**Stack: zero dependencies, zero build step.** Plain ES modules the browser loads directly,
Web Workers + `OffscreenCanvas` for processing, a hand-written ZIP writer. Chosen over
Astro/Next because the interesting problems here (worker pools, canvas encoding, binary
file formats, offline) are all client-side, so a framework would only add a build and a
supply chain to audit — while the no-build constraint is itself the privacy argument.

## What's built

- `app/` — the workbench: 44 static files, ~130 KB gzip for twelve tools, offline as a PWA.
- `tests/` — five Node suites (63 groups) that run without a browser, plus
  `tools/check-pages.mjs`, a static audit of registry ↔ pages ↔ precache ↔ palette ↔ contrast.
  The ZIP output is checked with real `unzip -t`. (Tests lived in `/tmp` until they didn't —
  see *What the second round taught*.)

## Bugs the writing process actually caught

Worth recording, because they're the reason the tests exist:

| Bug | Consequence if shipped |
|---|---|
| `resolveFormat` returned the string `"source"` where callers expected a MIME | PNG→JPEG silently produced `.img` files with a broken blob type |
| "needs re-encode" test was `spec.mime !== null` — always true | every file re-encoded, so "keep original" quietly degraded quality |
| Encoder probe trusted `blob.type` before the header | a browser that can't encode AVIF returns a PNG *labelled* AVIF → we'd have advertised a format it can't write |
| Pool drained the whole queue onto the main thread at once | a 60-image batch without Workers = 60 simultaneous decodes, jank or OOM |
| Poison file requeued with no attempt cap | one corrupt image could terminate workers forever; the batch never finished |
| `destroy()` only rejected *queued* jobs | in-flight promises never settled → any `await` on the batch hung |
| `save` imported from `store.js` shadowed by a local `save()` in the same module | theme persistence silently threw a redeclaration error |
| Manifest shortcuts pointed at `?recipe=…` params that were never implemented | four dead buttons on the home screen |

## Second round: from one tool to a workbench

Two follow-up briefs: *"add more tools"* (which grew into eight: text, JSON, tables, regex,
dates & units, hash & code, colour, and a hub with `⌘K` search), then *"change colour palette of
this site and add more tools"* (four design tools: gradients, shadow & glass, type & space, theme
builder). Each round had the same shape, so the memo records the *rules* rather than the list.

**Rule 1 — a tool is a page, a module, a registry entry, a precache pair and a test suite, or it
is not in the product.** The hub, the nav, the accents and the audit all derive from
`app/js/core/tools.js`. Deliberately, nothing checks "did you remember the service worker": the
check-pages script does, so forgetting is a failed command rather than a tool that breaks offline
two commits later.

**Rule 2 — no dead controls.** Every range, select, checkbox and textarea on a page has to change
the output. Two of the four design tools shipped a control that was wired to state but never read;
both were caught by re-reading the page against the module, which is why that habit is in the
audit instead of in a comment.

**Rule 3 — accents are derived, never typed.** See below.

## The palette decision

Asked what direction to take the colours, the answer was *"you choose — just don't keep Ink &
Ember."* The previous skin was a warm cream-on-charcoal with a terracotta accent: fine for one
image tool, wrong for a bench whose whole job is showing *other people's* colours. A cream ground
tints every swatch you compare on it, and a loud accent competes with the twelve accents the hub
needed.

So: **Sea Ink** — a cold, near-neutral ground (dark `#0b0e12`, light `#f2f4f4`) that reads as a
workbench surface and stays out of the way of colour work, one teal accent, and twelve tool
accents **derived at 30° intervals on the OKLCH hue wheel** at fixed lightness and chroma per
theme. `tools/make-palette.mjs` writes the palette block into `styles.css`, mirrors it into
`app/js/core/palette.js`, and attaches per-tool accents to the registry; the icons and the
social card import that module rather than remembering hexes.

Why derive: a hand-picked list of twelve is twelve arguments about taste, it cannot guarantee
equal brightness, and it silently rots the moment someone tunes one page. Derived, the constraints
become numbers that a test can assert — `fg ≥ 7:1`, `accent ≥ 4.5:1` on its own panel, `line`
between 1.15 and 2.4 (a border should be *visible*, not contrast-checked like text), hue gaps
≥ 28°, and `--accent` never hard-coded in a page. `--check` fails if a generated file drifts from
the generator.

The retune that took the most care was light-theme accent lightness: derived at L 0.55, the
twelve accents spanned 4.9:1 to 6.4:1 against the panel — the cyan end looked washed out next to
the red. Dropping the fixed lightness to 0.52 flattened that spread and kept every one above 4.5,
which is the whole argument for using perceptual lightness in the first place.

## What the second round's tests caught

| Bug | Consequence if shipped |
|---|---|
| `parseColor` answers `{ ok: false }`, never `null`; two consumers wrote `if (!color)` | unparseable input became `NaN` channels painted into gradients and theme tokens instead of an error message |
| OKLab→sRGB matrix: the `s_` row carried `m_`'s `a` coefficient | every derived colour was a few degrees off hue — the palette, the icons and the social card, silently, since only the round trip reveals it |
| Scale tokens indexed from step 0 as `xs` | a 16px base exported as `--text-sm`; every Tailwind/SCSS token off by one name |
| Slider ranges written straight into 0–1 model fields (0–60 into a `tint` alpha) | a control that looked alive and clamped to 1.0 on first touch |
| `debounce(fn, ms)()` called inside a handler | a fresh timer per keystroke — i.e. no debounce at all, and a repaint per keypress |
| Tests in `/tmp` | lost between sessions; the suites live in `tests/` now, which is the only reason they exist for the next person |

## Next

In order: crop/rotate · rename patterns + per-file overrides · PDF page tools ·
shareable `?config=` links · DEFLATE in the zip via `CompressionStream`.
