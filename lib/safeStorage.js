// Safe access to the browser's storage objects.
//
// Merely READING `window.localStorage` (or `sessionStorage`) throws a
// SecurityError in browsers where site data is blocked: Chrome with
// "Block all cookies", embedded WebViews with DOM storage off, sandboxed
// iframes. `typeof localStorage` throws there too, because the getter runs.
// So `window.localStorage ? … : null` and `fn(window.localStorage)` are both
// crashes, not checks.
//
// 2026-11-10 (Sentry WAYFIND-W): app/components/PostHogProvider.js handed
// `window.localStorage` to analyticsSuppressionReason() outside any try. For
// those visitors the analytics boot threw on every page, was retried from the
// promise `.catch`, threw again as an unhandled rejection, and no visit was
// ever recorded for them.
//
// Every read of a storage global outside a `try` block goes through these two
// helpers. scripts/check-storage-access.mjs enforces that for app/ and lib/.
// A null return means "no storage in this browser": callers treat it exactly
// like an empty store and keep working.
function safeStore(name) {
  if (typeof window === "undefined") return null;
  try {
    const store = window[name];
    return store && typeof store.getItem === "function" ? store : null;
  } catch (e) {
    return null;
  }
}

export function safeLocalStorage() { return safeStore("localStorage"); }
export function safeSessionStorage() { return safeStore("sessionStorage"); }
