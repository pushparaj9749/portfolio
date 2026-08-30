/* =========================================================
   Bench — service worker
   Cache-the-shell so the tool keeps working with no network at all.
   Nothing is ever sent anywhere else; there is nowhere else to send it.
   ========================================================= */

const VERSION = "bench-v1.2.1";

/* Required to boot any page at all. If one of these is missing we abort the
   install rather than claim a cache that renders a blank shell. */
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./js/shell.js",
  "./js/hub.js",
  "./js/core/tools.js",
  "./js/core/palette.js",
  "./js/core/constants.js",
  "./js/core/store.js",
  "./assets/icon.svg",
];

/* Per-tool pages and modules. Kept separate on purpose: one tool being absent
   from a deployment must not take offline mode away from the other eleven. */
const TOOLS = [
  "./js/bench.worker.js",
  "./js/core/pipeline.js",
  "./js/core/pool.js",
  "./js/core/zip.js",
  "./js/images.js",
  "./images/index.html",
  "./js/tools/text.js",
  "./tools/text/index.html",
  "./js/tools/json.js",
  "./tools/json/index.html",
  "./js/tools/color.js",
  "./tools/color/index.html",
  "./js/tools/hash.js",
  "./tools/hash/index.html",
  "./js/tools/regex.js",
  "./tools/regex/index.html",
  "./js/tools/csv.js",
  "./tools/csv/index.html",
  "./js/tools/time.js",
  "./tools/time/index.html",
  "./js/tools/gradient.js",
  "./tools/gradient/index.html",
  "./js/tools/shadow.js",
  "./tools/shadow/index.html",
  "./js/tools/scale.js",
  "./tools/scale/index.html",
  "./js/tools/theme.js",
  "./tools/theme/index.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      const required = await Promise.allSettled(SHELL.map((u) => cache.add(u)));
      const dead = required.filter((r) => r.status === "rejected");
      if (dead.length) {
        // Missing shell files: refuse to activate a broken offline shell.
        throw new Error(`bench sw: ${dead.length} required shell file(s) failed to cache`);
      }
      // Best-effort for the tools themselves.
      await Promise.allSettled(TOOLS.map((u) => cache.add(u)));
      // Stale-while-revalidate feel: claim immediately so a refresh picks it up.
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Only same-origin, and never user files (blob:/data:).
  if (url.origin !== self.location.origin || url.protocol === "blob:" || url.protocol === "data:") return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) {
        // Refresh in the background so the next visit gets the new version.
        fetch(req)
          .then((res) => {
            if (res && res.ok) caches.open(VERSION).then((c) => c.put(req, res.clone()));
          })
          .catch(() => {});
        return hit;
      }
      return fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(async () => {
          if (req.mode === "navigate") {
            // Try the page that was asked for, then the hub, then anything cached.
            return (
              (await caches.match(req, { ignoreSearch: true })) ||
              (await caches.match("./index.html")) ||
              (await caches.match("./")) ||
              new Response("<h1>Offline</h1><p>Bench could not find a cached copy of that page.</p>", {
                status: 503,
                headers: { "content-type": "text/html; charset=utf-8" },
              })
            );
          }
          return new Response("offline", { status: 503, statusText: "offline" });
        });
    })
  );
});
