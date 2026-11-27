// scripts/test-sentry-mapkit-parse.mjs — WAYFIND-1M regression.
// "SyntaxError: Unexpected token '{'", 20 events since 2026-11-03, latest on
// iPhone Mobile Safari 16.3; the only frame was Apple's MapKit JS library
// (app:///mk/6.1.205/libs/mapkit.core.user-location.ab2fb6.js line 2). MapKit
// JS 6 cannot be parsed before Safari 16.4. Two protections, both CALLED here:
//   1. lib/appleMapsRuntime.loadAppleMapKit fails at once on that parse error
//      (the reader gets the map fallback, not a 15s wait) and stops retrying;
//   2. lib/sentryShared.shouldDropBrowserNoise drops exactly that error and
//      keeps runtime MapKit errors (WAYFIND-10) and parse errors in our code.
import { shouldDropBrowserNoise } from "../lib/sentryShared.js";
import { MAPKIT_LIBRARY_FRAME, MAPKIT_ORIGIN_FILE } from "../lib/mapkitScript.js";

let n = 0, failures = 0;
const ok = (cond, msg) => { n++; if (!cond) { failures++; console.error("test-sentry-mapkit-parse: FAIL — " + msg); } };
const syntax = (msg) => { const e = new SyntaxError(msg); return e; };
const APP_FRAME = "app:///mk/6.1.205/libs/mapkit.core.user-location.ab2fb6.js";
const CDN_FRAME = "https://cdn.apple-mapkit.com/mk/6.1.205/libs/mapkit.core.user-location.ab2fb6.js";
const CORE = "https://cdn.apple-mapkit.com/mk/6/mapkit.core.js";
const OUR_CHUNK = "https://www.gowayfind.com/_next/static/chunks/4821-abc.js";
const event = (type, value, files) => ({ exception: { values: [{ type, value, stacktrace: { frames: files.map((filename) => ({ filename, lineno: 2 })) } }] } });

// ── the patterns ──
ok([APP_FRAME, CDN_FRAME, CORE].every((f) => MAPKIT_LIBRARY_FRAME.test(f)), "MapKit library frame pattern matches the Sentry app:// form, the CDN lib form and mapkit.core.js");
ok(![OUR_CHUNK, "app:///christmas-in-florida", "https://cdn.apple-mapkit.com/evil.js", "https://example.com/mk/6/mapkit.core.js"].some((f) => MAPKIT_LIBRARY_FRAME.test(f)), "the pattern refuses our chunks, page frames, other Apple paths and look-alike hosts");
ok(MAPKIT_ORIGIN_FILE.test(CDN_FRAME) && !MAPKIT_ORIGIN_FILE.test(OUR_CHUNK), "the loader's origin pattern names Apple's /mk/ files only");

// ── Sentry filter ──
ok(shouldDropBrowserNoise(event("SyntaxError", "Unexpected token '{'", [APP_FRAME]), { originalException: syntax("Unexpected token '{'") }, true), "WAYFIND-1M's exact shape (SyntaxError, only frame Apple's MapKit lib) is dropped");
ok(shouldDropBrowserNoise({ t: 1, error: syntax("Unexpected token '{'"), message: "SyntaxError: Unexpected token '{'", filename: CDN_FRAME, lineno: 2 }, null, true), "the pre-SDK queued item for the same parse error is dropped");
ok(!shouldDropBrowserNoise(event("TypeError", "[MapKit] Expected a number for `x` in MapRect constructor but got `NaN`", [CORE]), null, true), "a runtime MapKit error (WAYFIND-10) still reports");
ok(!shouldDropBrowserNoise(event("SyntaxError", "Unexpected token '{'", [OUR_CHUNK]), null, true), "a parse error in our own chunk still reports");
ok(!shouldDropBrowserNoise(event("SyntaxError", "Unexpected token '{'", [APP_FRAME, OUR_CHUNK]), null, true), "a parse error with any non-MapKit frame still reports");
ok(!shouldDropBrowserNoise(event("SyntaxError", "Unexpected token '{'", []), null, true), "a parse error with no source at all still reports (unknown origin)");
ok(!shouldDropBrowserNoise({ error: syntax("x"), message: "SyntaxError: x", filename: OUR_CHUNK }, null, true), "a queued parse error from our file still reports");
ok(!shouldDropBrowserNoise(event("SyntaxError", "Unexpected token '{'", [APP_FRAME]), null, false), "server runtimes are never filtered by the browser rule");

// ── loader fast-fail ──
function fakeBrowser() {
  const listeners = {};
  const appended = [];
  const win = {
    addEventListener: (t, fn) => { (listeners[t] ||= new Set()).add(fn); },
    removeEventListener: (t, fn) => { listeners[t] && listeners[t].delete(fn); },
    dispatch: (t, ev) => { for (const fn of [...(listeners[t] || [])]) fn(ev); },
    count: (t) => (listeners[t] ? listeners[t].size : 0),
  };
  const doc = {
    querySelector: () => null,
    createElement: () => {
      const el = { dataset: {}, addEventListener() {}, removeEventListener() {}, parentNode: null };
      return el;
    },
    head: { appendChild: (el) => { el.parentNode = { removeChild: () => { el.parentNode = null; } }; appended.push(el); } },
  };
  return { win, doc, appended };
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = `${b64({ alg: "ES256", kid: "k", typ: "JWT" })}.${b64({ iss: "TEAM", iat: 1795700000, origin: "https://www.gowayfind.com" })}.sig`;
const { win, doc, appended } = fakeBrowser();
globalThis.window = win; globalThis.document = doc;
const { loadAppleMapKit, resetAppleMapKitLoaderForTests, MAPKIT_UNSUPPORTED_MESSAGE } = await import("../lib/appleMapsRuntime.js");
const { appleMapsTokenUsable } = await import("../lib/appleMapsToken.js");
if (!appleMapsTokenUsable(token)) { console.error("test-sentry-mapkit-parse: FAIL — fixture token is not usable; the loader assertions below would test the token gate instead"); process.exit(1); }

resetAppleMapKitLoaderForTests();
let p = loadAppleMapKit(token);
ok(appended.length === 1 && appended[0].src === CORE && win.count("error") === 1, "loading injects MapKit once and listens for its parse error");
win.dispatch("error", { filename: OUR_CHUNK, message: "SyntaxError: x", error: syntax("x") });
win.dispatch("error", { filename: CORE, message: "TypeError: boom", error: new TypeError("boom") });
let settled = false; p.then(() => { settled = true; }, () => { settled = true; });
await new Promise((r) => setTimeout(r, 0));
ok(!settled, "our own parse error and a MapKit runtime error do not abort the load");
win.dispatch("error", { filename: CDN_FRAME, message: "SyntaxError: Unexpected token '{'", error: syntax("Unexpected token '{'") });
let reason = null; try { await p; } catch (e) { reason = e; }
ok(reason && reason.message === MAPKIT_UNSUPPORTED_MESSAGE, "a MapKit parse error rejects at once with the unsupported-browser reason (no 15s wait)");
ok(win.count("error") === 0 && appended[0].parentNode === null, "the failed load removes its listener and its script tag");
let again = null; try { await loadAppleMapKit(token); } catch (e) { again = e; }
ok(again && again.message === MAPKIT_UNSUPPORTED_MESSAGE && appended.length === 1, "later maps on the page go straight to the fallback without downloading MapKit again");
resetAppleMapKitLoaderForTests();
win.mapkit = { Map: function Map() {} };
ok((await loadAppleMapKit(token)) === win.mapkit, "a browser where MapKit loaded keeps using it (positive control)");
delete win.mapkit; delete globalThis.window; delete globalThis.document;

if (failures) { console.error(`test-sentry-mapkit-parse: ${failures} failure(s)`); process.exit(1); }
console.log(`test-sentry-mapkit-parse: OK — ${n} assertions, all by CALL (WAYFIND-1M shape dropped, runtime MapKit and our own parse errors kept; loader fails fast on a MapKit parse error, removes its tag and stops retrying)`);
