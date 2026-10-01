// lib/chunkRecovery.js — a JavaScript chunk that fails to load must never leave
// a reader staring at a blank page.
//
// THE FINDING (2026-09-30). Driving production at a real 390x844 viewport, one
// load in three of the homepage ended on Next's bare "Application error: a
// client-side exception has occurred" — white page, no header, no button. The
// cause was one app chunk (/_next/static/chunks/4968-….js) answering 502 on
// that request; the same file served 200 on 15 retries a minute later. A
// transient network failure on ONE script is ordinary on a phone. What made it
// fatal was that the app had no recovery at all: no app/error.js, no
// app/global-error.js (Sentry's build warns about the latter), and no handler
// for a failed script load before React is alive. The reader's only way out was
// knowing to pull-to-refresh — the exact gesture the owner said most people do
// not know (app/components/VersionWatch.js header, 2026-08-27).
//
// THREE LAYERS, ONE DEFINITION (this file):
//   1. chunkRecoveryScript() — inline in app/layout.js <head>, runs before any
//      bundle. It catches a failed /_next/static script or stylesheet load (a
//      resource `error` event, which never bubbles to window.onerror) and an
//      unhandled ChunkLoadError rejection, and reloads the page ONCE.
//   2. app/global-error.js — replaces Next's bare "Application error" text for
//      an error React can see (including a chunk error during hydration).
//   3. app/error.js — the same for an error inside a route, keeping the root
//      layout (header, fonts) on screen.
// ONE IMPLEMENTATION. The rule lives in the inline script, which exposes
// window.__wfChunkRecover(err) ("chunk failure? then reload once; returns
// whether it was one"). Both React boundaries call that hook instead of
// importing anything: every import in a root-level boundary is paid on "/"
// against scripts/check-bundle.mjs (498KB ratchet, 0.3KB headroom on
// 2026-09-30), and importing a shared screen/lib here measured +0.4KB and
// failed it. isChunkLoadError below is the same rule in plain JS — the oracle
// scripts/test-chunk-recovery.mjs holds the inline script to.
//
// ONE AUTOMATIC RELOAD, NEVER A LOOP. The last auto-reload time is stamped in
// sessionStorage; another is allowed only after RELOAD_WINDOW_MS. A chunk that
// is genuinely gone (not transient) therefore costs exactly one reload, then
// the branded recovery screen with a Reload button. No storage (private mode,
// blocked) ⇒ no automatic reload at all: fail toward showing the screen, never
// toward reloading blind.
//
// NOT VersionWatch. VersionWatch moves a healthy, hydrated, STALE tab onto a
// newer build. This handles a page that could not finish booting. Different
// sessionStorage key, so neither can suppress the other.

export const RELOAD_STAMP_KEY = "wf_chunk_reload_at";
export const RELOAD_WINDOW_MS = 30 * 1000;
// Asset paths that are ours and whose failure breaks the app. Third-party
// scripts (maps, analytics, affiliates) failing must never reload the page.
export const CHUNK_PATH_RX_SOURCE = "/_next/static/";

// The message shapes webpack, Next and each browser engine use for a failed
// chunk / dynamic import. Kept as sources so the inline script embeds the SAME
// patterns (see chunkRecoveryScript).
export const CHUNK_MESSAGE_RX_SOURCES = Object.freeze([
  "Loading chunk [\\w-]+ failed",                 // webpack JS chunk
  "Loading CSS chunk [\\w-]+ failed",             // webpack CSS chunk
  "Failed to fetch dynamically imported module",  // Chromium import()
  "error loading dynamically imported module",    // Firefox import()
  "Importing a module script failed",             // Safari import()
]);
const CHUNK_MESSAGE_RX = new RegExp(CHUNK_MESSAGE_RX_SOURCES.join("|"), "i");

export function isChunkLoadError(err) {
  if (!err) return false;
  if (typeof err === "string") return CHUNK_MESSAGE_RX.test(err);
  const name = typeof err.name === "string" ? err.name : "";
  if (name === "ChunkLoadError") return true;
  const message = typeof err.message === "string" ? err.message : "";
  return CHUNK_MESSAGE_RX.test(message);
}

// The pre-React layer, as an inline <script> body. When its one reload is
// spent (or storage is unavailable) and a chunk fails AGAIN before React is
// alive, no error boundary can render — measured: the page stays server-
// rendered and silently dead. So it paints a small fixed "didn't finish
// loading — Reload" bar (plain DOM, #wf-chunk-bar, 44px button) instead of
// reloading again. The bar's Reload is handled by ONE window-level CAPTURE
// listener, never the button's own onclick: measured live 2026-10-01, a page
// stuck mid-hydration (React waiting on the failed chunk) has React 18's root
// listener on `document` call stopPropagation() on every click aimed at the
// not-yet-hydrated tree, so a button handler never fires and the Reload tap
// was dead. Window capture runs before document capture, so it still sees it.
// ONE PROMPT AT A TIME: the bar never paints over a React recovery screen
// ([data-wf-recovery], app/components/RecoveryScreen.js), and that screen
// removes a bar that painted first — measured live 2026-10-01, a lazy chunk
// failing after hydration showed both, two Reload buttons at once. Failures React catches are left to the boundaries. It also
// exposes
// window.__wfChunkRecover(err) — "if err is a chunk failure, reload once;
// returns whether it was one" — so app/global-error.js can apply the same rule
// WITHOUT importing this module (every import there is paid on "/" against the
// bundle ratchet; see that file's header). Built from the constants
// above so the pattern set, the key and the window cannot drift from the React
// boundaries. Listens in the CAPTURE phase: a failed <script src> fires `error`
// on the element, which does not bubble, but capture listeners on window see it.
export function chunkRecoveryScript() {
  const rx = JSON.stringify(CHUNK_MESSAGE_RX_SOURCES.join("|"));
  return `(function(){try{if(window.__wfChunkRecovery)return;window.__wfChunkRecovery=1;var K=${JSON.stringify(RELOAD_STAMP_KEY)},W=${RELOAD_WINDOW_MS},P=${JSON.stringify(CHUNK_PATH_RX_SOURCE)},R=new RegExp(${rx},"i");function bar(){try{var d=document;function show(){if(d.getElementById("wf-chunk-bar")||!d.body||d.querySelector("[data-wf-recovery]"))return;var b=d.createElement("div");b.id="wf-chunk-bar";b.setAttribute("role","alert");b.style.cssText="position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;background:#111824;border:1px solid #2D3748;color:#F1F5F9;font:600 14px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.45)";var t=d.createElement("span");t.style.cssText="flex:1";t.textContent="Part of Wayfind didn\u2019t finish loading \u2014 usually a weak connection.";var k=d.createElement("button");k.type="button";k.textContent="Reload";k.style.cssText="min-height:44px;padding:0 18px;border:0;border-radius:12px;background:#F97316;color:#fff;font:800 15px -apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;cursor:pointer";k.setAttribute("data-wf-chunk-reload","1");if(!window.__wfChunkBarTap){window.__wfChunkBarTap=1;window.addEventListener("click",function(e){try{var t=e.target;if(t&&t.closest&&t.closest("[data-wf-chunk-reload]"))window.location.reload()}catch(_){}},true)}b.appendChild(t);b.appendChild(k);d.body.appendChild(b)}if(d.body)show();else d.addEventListener("DOMContentLoaded",show)}catch(_){}}function go(why){try{var n=Date.now(),l=null,ok=1;try{l=window.sessionStorage.getItem(K)}catch(e){ok=0}if(ok&&l!==null&&l!==""){var v=Number(l);if(isFinite(v)&&n-v<W&&n>=v)ok=0}if(ok){try{window.sessionStorage.setItem(K,String(n))}catch(e){ok=0}}if(ok){window.location.reload();return}if(why!=="boundary")bar()}catch(_){}}window.__wfChunkRecover=function(r){try{var m=r&&(r.name==="ChunkLoadError"?"ChunkLoadError":(r.message||String(r)));if(m==="ChunkLoadError"||R.test(String(m||""))){go("boundary");return true}}catch(_){}return false};window.addEventListener("error",function(e){try{var t=e&&e.target;if(t&&t!==window&&(t.tagName==="SCRIPT"||t.tagName==="LINK")){var u=t.src||t.href||"";if(u.indexOf(P)!==-1)go("resource")}}catch(_){}},true);window.addEventListener("unhandledrejection",function(e){try{var r=e&&e.reason,m=r&&(r.name==="ChunkLoadError"?"ChunkLoadError":(r.message||String(r)));if(m==="ChunkLoadError"||R.test(String(m||"")))go("rejection")}catch(_){}})}catch(_){}})();`;
}
