# portfolio — ideas, plans & decision memo

> Written 2026-08-29 against a repo that contains only `README.md` + one commit.
> Context source: sibling repo `pushparaj9749/ad` (~4,500 LOC: GSAP + ScrollTrigger +
> Lenis motion layer, hash-routed vanilla JS "Studio OS", dual IndexedDB / Supabase
> data layer with RLS + Realtime, vendored deps, reduced-motion fallback).

---

## 0. The one problem your portfolio has to solve

`ad` is a **fictional studio's** site. It proves you can build, but a recruiter
landing on it has to guess whether *you* exist. A personal portfolio has to answer,
in under 8 seconds:

1. Who are you, and what do you want to be paid to do?
2. What did **you** build (not "we")?
3. How hard was it, and what decision did you make that a weaker dev wouldn't?
4. Can I contact you in one click?

Every idea below is ranked by how well it answers those four.

**Non-negotiable baseline (cheap, and most devs skip it):**
Lighthouse 100 / 100 / 100 / 100 · a11y keyboard + SR pass · `prefers-reduced-motion` ·
dark + light · `<img>` `width`/`height` or `aspect-ratio` · OG + Twitter cards ·
sitemap + robots · 404 page · `no-JS` readable · FCP < 1.0s on 4G · CLS ≈ 0.

---

## 1. Concept A — "Me, One Scroll" *(highest ROI, my default pick)*

**What:** port the `ad` motion system onto *you*. Same visual grammar — oversized
display type, single acid accent, dark editorial — but every section is real.

**Sections**
| # | Section | The thing that makes it yours |
|---|---|---|
| 1 | Hero | Name + one-line positioning statement, scrubbed exit like your `.hero` |
| 2 | **Pinned case-reel** | Reuse the scroll-scrubbed-video trick, but scrub through **your own project UI frames** (screen recordings / 12 static captures of a real flow). Instantly reads as "signature move", not a template. |
| 3 | Selected work | `clip-path` reveals + parallax, exactly your `.work-card` pattern — but each card links to a **case study** |
| 4 | Capability | Not a skills list. Three rows: *"I make scroll feel expensive / I ship backends people can trust / I finish things"* with proof links |
| 5 | Studio OS | Real product you shipped — live demo button, repo, the RLS diagram |
| 6 | Timeline | Education / work / self-taught milestones, count-up years |
| 7 | Contact | Magnetic button + form. Email, GitHub, LinkedIn, résumé |

**Effort:** 3–4 focused days. **Risk:** low — you've already written 80% of the engine.
**Ship-list additions:** case-study page template (a project deserves a *page*, not a card),
and a `/og.png` generated at your exact hero crop.

---

## 2. Concept B — "The Living Index" *(highest ceiling for a dev, not a designer)*

**What:** content-first, and **programmatically alive**. GitHub + your repo are the CMS.

- `content/projects/*.md` with frontmatter (title, stack, live URL, repo, Lighthouse scores,
  role, year, what-I'd-change).
- Build step calls the GitHub API → stars, last commit, languages, LOC → so the site
  **re-validates itself** and never shows stale claims.
- `/lab` = grid of tiny failed/odd experiments. `/writing` = MDX posts + RSS.
- `/uses`, `/now` (what I'm learning this month), `/guestbook` (signed by visitors, stored server-side).
- Auto-generated OG image per project (Satori/`@vercel/og`) → sharing looks bespoke.
- Résumé served from a single `data.json`: `/api/cv` renders print-PDF-safe HTML. **Update once,
  site + PDF + API all change.** That's the flex.

**Effort:** 4–6 days. **Best if:** you want to be hired as an *engineer*, and you want the
site to keep growing without a rebuild. This is the one that makes a senior person say "oh, clever."

---

## 3. Concept C — "The Portfolio As A Product" *(most memorable, most risky)*

**What:** stop making a brochure; ship a small **app about you**.

Three ways, pick one:
- **Desktop OS** — draggable/resizable windows for `About`, `Projects`, `Terminal`,
  `Photos`; a dock; `⌘K` to switch windows; desktop icons are your projects.
- **Terminal-first** — `> help`, `> ls projects`, `> cat ad.md`, `> open github`,
  `> whoami`. With `tab` completion, `↑` history, and `man <project>`. Mouse users get a
  normal fallback site (progressive enhancement, same discipline as your GSAP/no-GSAP split).
- **CMS-driven** — a `/studio` admin (like Studio OS's kanban) where *you* edit your own
  projects via Supabase. Portfolio + auth + CRUD + RLS in one repo.

**Effort:** 6–10 days. **Risk:** recruiters on a phone, in a hurry, with a screen reader.
Mitigation: the conventional site must exist at the same URL as the default, and the gimmick
is an opt-in "▶ play with it" toggle. Never make the joke the only door.

---

## 4. Concept D — Real backend (add to any concept)

The `ad` repo shows you can do this; prove it on *your own* domain.

- Contact form → Supabase table, with Turnstile/honeypot, per-IP rate limit, and an
  email notification. Show the inbox state.
- `page_view` + referrer + country-bucket analytics (no cookies, no GDPR banner) →
  render "1,204 people, 38% came from LinkedIn" on your own About page. Self-tracking
  as a credibility artifact is genuinely rare.
- Guestbook with moderation flag, RLS: `select` public / `insert` authenticated-or-anon
  with a policy limit.
- Supabase Edge Function for og-image + PDF résumé on the fly.
- Bonus, high-signal: a **`/.well-known/agent`-style JSON endpoint** or public read-only
  REST view of your profile data. Lets others embed you.

**Effort:** 2–3 days on top of A or B.

---

## 5. Small, disproportionately impressive extras

Pick 3–4 max. Each is < 2 hours.

1. **Cmd-K palette** — search sections/projects/writing; keyboard-only navigation end to end.
2. **View Transitions API** between pages (`startViewTransition`) — 20 lines, feels like magic.
3. **Theme persistence** + `prefers-color-scheme` + a "contrast / dyslexic-friendly / reduced-motion" a11y panel that writes to `localStorage`. Huge goodwill, trivial code.
4. **Lighthouse badge that's actually live** — CI runs Lighthouse nightly, commits a JSON, page renders current scores. No fake badges.
5. **Repo hygiene as a flex** — `gh`-checked CI: typecheck/lint/build/Lighthouse on PR, preview deploys per PR, `.github/ISSUE_TEMPLATE` for your own bugs. Your *repo* is part of the portfolio.
6. **Interactive "how this site works"** — a section annotating your own DOM/CSS/GSAP choices, click-to-jump-to-file with permalinks. Turns the site into the case study.
7. **Sound design** — 40ms UI ticks on hover, mute-default, WebAudio (no files). Use sparingly; it's a love-it-or-hate-it.
8. **Konami / hidden lab** — e.g. `type "hire me"` opens a one-screen pitch. Cheap, remembered.
9. **Print stylesheet + real PDF** — `@media print` so `/print` produces a clean 1-page CV. Recruiters still print.
10. **Easter egg for interviewers** — `/hire` page: 3 bullets, availability, salary range, calendar link. Screenshot-ready.

---

## 6. Stack decision (the actual fork in the road)

| Path | Pick when | Cost |
|---|---|---|
| **Vanilla + vendored libs, one HTML** (what `ad` does) | You want total control, zero build, and want the craft to be visible. Deploy anywhere: GitHub Pages/Netlify. | Content edits get manual; no MDX; keep JS modular with IIFE + a tiny store. |
| **Astro** ⭐ *my recommendation for A+B* | Content collections, MDX, islands (ship GSAP only where needed), zero JS by default → trivially hits perf targets. Static → free hosting. | Learning ~half a day if new. |
| **Next.js + Supabase** | You want Concept C or D to be a *real app* with auth, streaming, dynamic OG, `/studio` admin. | Heaviest; overkill for a brochure; Vercel-centric. |

**Recommendation:** **Astro + vanilla GSAP islands + Supabase for the contact/guestbook layer.**
You keep your hand-written motion engine *exactly as written* (`main.js` is good enough to
copy verbatim), and get MDX, content collections, and free static hosting. Best ratio you can get.

---

## 7. Asset & build hygiene (from reading `ad`)

- `ad` ships **14 MB**, mostly `video/showreel.mp4` + 4 JPGs. For a portfolio: convert stills
  to **AVIF/WebP** with `<picture>`, move any video to a CDN/`/stream` host, and keep
  committed repo payload **< 5 MB** so the repo stays cloneable as a signal of itself.
- Scrub-video alternative worth knowing: **image sequence** (24–48 JPEGs at 800px wide, ~60 KB
  total each, decoded lazily) instead of video → frame-accurate with no codec/range-header
  constraints, works in any static host, no `206` requirement you noted in your README.
- Keep vendored libs, but add a `vendor.lock` comment with version + integrity note.
- Split motion into reusable modules: `reveal.js`, `magnetic.js`, `cursor.js`, `scrambleText.js`,
  `marquee.js`, `smoothScroll.js` — then both `ad` and `portfolio` import them. A shared
  **`@pushparaj/motion`** package (or git subtree) is itself a great portfolio piece.

---

## 8. Suggested sequence (2-week plan)

**Week 1** — Scaffolding + content truth.
1. Init Astro (or vanilla) repo, deploy empty site to a real URL on day 1. *Live beats perfect.*
2. `data/profile.json` + `data/projects.json` — write the words before pixels. 3 projects × 300 words each.
3. Type scale, spacing scale, color tokens, dark/light. Copy your `:root` custom-property system.
4. Build: hero, work grid, case-study template, contact, 404, print.
5. CI: lint + build + Lighthouse. Preview deploy per PR.

**Week 2** — Signature + proof.
6. Pinned case-reel (Concept A §2) — your differentiator, budget a full day.
7. Live GitHub data + Lighthouse badges from CI.
8. Supabase contact form + guestbook + analytics (Concept D).
9. `/writing` — **one** deep post: "Scroll-scrubbed video without dropping frames on mobile"
   from what you learned in `ad`. One excellent post > six mediocre ones.
10. A11y + reduced-motion + no-JS + keyboard pass. Real-device test on a mid-range Android.
11. `/hire` page, résumé PDF, README rewrite with a live screenshot + Lighthouse table.

---

## 9. Open questions (blocking, need your input)

1. **Goal:** full-time role / internship / freelance clients / personal brand? (Changes what "impressive" means.)
2. **Story:** what's your actual status — student, self-taught, employed? What are the 3 *real* projects to feature? Is `ad` yours alone, solo?
3. **Stack:** Astro (recommended) / vanilla like `ad` / Next.js?
4. **Scope now:** should I start building Concept A scaffolding, or Concept B data layer, or do you want a deeper written spec for one idea first?

---

## 10. Addendum — what actually got built (2026-08-30)

The open questions above went unanswered in the way side projects answer them: by building.

**Chosen: none of A/B/C as written.** The repo became **Bench**, a static workbench of
browser-only tools — Concept B's "programmatically alive, no-CMS" instinct applied to
*utility* instead of to a résumé. That inverts question 1: the site is impressive because
people use it, and the evidence a recruiter needs is the code and the traffic, not a case study.

- **v1** — image workbench: batch compress/resize/convert/strip-EXIF, hand-written ZIP, Web
  Worker pipeline, privacy audit, offline PWA. Zero deps, zero build.
- **v1.1** — seven more tools (text, JSON, tables, regex, dates & units, hash & code, colour)
  plus a hub with `⌘K` search and per-page accents.
- **v1.2** — four design tools (gradients, shadow & glass, type & space, theme builder) and a
  **derived palette** (Sea Ink): twelve accents at 30° on the OKLCH wheel, generated by
  `tools/make-palette.mjs`, audited by `tools/check-pages.mjs` and five Node test suites.
  The reasoning, including why the previous skin was wrong for a colour tool, is in
  [PLAN.md](PLAN.md).

**Cut from v1.2 and why, so it isn't re-litigated:** a standalone *ramp export* tool — it is the
Color tool's `ramp()` output with a different border radius, and a second page doing the same job
is a maintenance tax, not a feature. Twelve tools is already the point where the registry, the
precache list and the audit matter more than any individual page.

**Still unbuilt from the menu:** PDF page tools (needs `pdf-lib`, ~1 MB — worth it, still parked),
`/writing` (one deep post about what was learned here would be a *better* portfolio piece than a
description of it), the contact form + guestbook (needs a server: fails filter #3), Lighthouse
badges from CI, and the case-reel motion work — none of it belongs in `app/`, all of it belongs in
a wrapper site that this repo could become.
