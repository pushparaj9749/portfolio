/* =========================================================
   Bench — persistence + privacy audit
   Everything here is localStorage and a fetch monkey-patch.
   There is no backend to talk to, and the app proves it.
   ========================================================= */

import { APP, DEFAULT_SETTINGS } from "./constants.js";

/* ---------- tiny store ---------- */
export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...fallback };
    const parsed = JSON.parse(raw);
    return typeof fallback === "object" && fallback !== null
      ? { ...fallback, ...parsed }
      : parsed;
  } catch {
    return { ...fallback };
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // private mode / quota — degrade silently
  }
}

export const loadSettings = () => load(APP.settingsKey, DEFAULT_SETTINGS);
export const saveSettings = (s) => save(APP.settingsKey, s);

/* ---------- privacy audit ---------- */
/**
 * Wrap the network entry points so we can honestly display "0 requests".
 * Any real outbound request is recorded and surfaced in the UI — if a
 * future dependency ever phones home, you'll see it immediately.
 */
export function installPrivacyAudit() {
  const audit = {
    requests: [],
    bytes: 0,
    allowedOrigins: [location.origin],
  };

  const isSameOrigin = (raw) => {
    try {
      const url = new URL(raw, location.href);
      if (url.protocol === "blob:" || url.protocol === "data:") return true;
      return audit.allowedOrigins.includes(url.origin);
    } catch {
      return false;
    }
  };

  const record = (kind, target) => {
    if (isSameOrigin(target)) return;
    audit.requests.push({
      kind,
      target: String(target).slice(0, 160),
      at: new Date().toISOString(),
    });
  };

  const origFetch = window.fetch ? window.fetch.bind(window) : null;
  if (origFetch) {
    window.fetch = (input, init) => {
      const target = typeof input === "string" ? input : input && input.url;
      record("fetch", target || "");
      return origFetch(input, init);
    };
  }

  const XHR = window.XMLHttpRequest;
  if (XHR) {
    const origOpen = XHR.prototype.open;
    XHR.prototype.open = function (method, url, ...rest) {
      try {
        record("xhr", url);
      } catch {
        /* defensive */
      }
      return origOpen.call(this, method, url, ...rest);
    };
  }

  const beacon = navigator.sendBeacon && navigator.sendBeacon.bind(navigator);
  if (beacon) {
    navigator.sendBeacon = (url, data) => {
      record("beacon", url);
      return beacon(url, data);
    };
  }

  // Count bytes our own assets cost, so the "how heavy is this tool" number is real.
  if (performance.getEntriesByType) {
    addEventListener("load", () => {
      requestAnimationFrame(() => {
        try {
          audit.bytes = performance
            .getEntriesByType("resource")
            .concat(performance.getEntriesByType("navigation"))
            .reduce((n, e) => n + (e.transferSize || 0), 0);
        } catch {
          /* unsupported */
        }
        document.dispatchEvent(new CustomEvent("bench:privacy"));
      });
    }, { once: true });
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") document.dispatchEvent(new CustomEvent("bench:privacy"));
  });

  window.__benchPrivacy = audit; // console-inspectable: prove it in devtools
  return audit;
}

export function privacySummary() {
  const a = window.__benchPrivacy;
  if (!a) return { outbound: 0, bytes: 0, requests: [] };
  return { outbound: a.requests.length, bytes: a.bytes, requests: a.requests };
}
