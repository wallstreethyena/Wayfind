// lib/safeStorage.js — import-free, never throws. Reading the `localStorage` or
// `sessionStorage` PROPERTY itself throws SecurityError in private / blocked
// storage browsers and some in-app webviews ("Failed to read the 'localStorage'
// property from 'Window': Access is denied for this document", Sentry WAYFIND-W),
// so `window.localStorage` outside a try block is a crash, even before getItem.
// Hand the object returned here to code that already tolerates a null store.

function pick(name) {
  try {
    const root = typeof globalThis !== "undefined" ? globalThis : null;
    const s = root ? root[name] : null;
    return s && typeof s.getItem === "function" ? s : null;
  } catch (e) {
    return null;
  }
}

export function safeLocalStorage() { return pick("localStorage"); }
export function safeSessionStorage() { return pick("sessionStorage"); }

export function safeGet(key, store = safeLocalStorage()) {
  try { return store ? store.getItem(key) : null; } catch (e) { return null; }
}
export function safeSet(key, value, store = safeLocalStorage()) {
  try { if (!store) return false; store.setItem(key, value); return true; } catch (e) { return false; }
}
export function safeRemove(key, store = safeLocalStorage()) {
  try { if (!store) return false; store.removeItem(key); return true; } catch (e) { return false; }
}
