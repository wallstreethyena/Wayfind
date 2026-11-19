import { scrubGroupPlanTelemetry } from "./groupPlanPrivacy.js";
// Shared Sentry options — errors-only, PII-scrubbed, common noise dropped.
// Imported statically by the server/edge configs (server bundles only) and
// DYNAMICALLY by app/components/SentryClient.js, so it never lands in the
// client's first-load JS. Keep this dependency-free (no @sentry import) so it
// stays a few hundred bytes.

// Browser/runtime noise that is never actionable — drop it before it bills a
// Sentry event or drowns real errors.
export const IGNORE_ERRORS = [
  "ResizeObserver loop limit exceeded",
  "ResizeObserver loop completed with undelivered notifications",
  "Non-Error promise rejection captured",
  "Failed to fetch",
  "NetworkError when attempting to fetch resource",
  "Load failed",
  "AbortError",
  "The operation was aborted",
  "cancelled",
];

// Third-party / browser-extension frames are not our code.
//
// v8.29.7 — THE VERCEL TOOLBAR JOINS THE LIST (owner, 2026-08-20, forwarding a
// Sentry alert): "InvalidNodeTypeError: Failed to execute 'selectNode' on
// 'Range': the given Node has no parent", every frame in
// app:///_next-live/feedback/913.<hash>.js. That bundle is Vercel's comment /
// feedback widget, injected for signed-in Vercel team members; the throw is in
// its own text-selection handling and there is no Wayfind frame in the stack.
// It filed as a WAYFIND-9 production error at level=error, which is worse than
// useless — a third-party crash sitting at the top of the inbox is how a real
// one gets scrolled past.
//
// Denied by URL rather than by message ON PURPOSE: an InvalidNodeTypeError
// thrown by OUR code must still page us. This drops the frames that are not
// ours, and nothing else.
// v8.56.4 — THE TWO MONETIZATION TAGS JOIN THE LIST (owner, 2026-09-03,
// forwarding a Sentry alert): TWO issues, "TypeError: Cannot read properties of
// null (reading 'parentNode')" on /events, both stamped 18:21:43 UTC — the same
// second, which is the signature of one first-interaction moment, not two user
// journeys.
//
// WHAT ACTUALLY THROWS. scripts.stay22.com/letmeallez.js bundles Mozilla's
// Readability and runs it over the live page to work out what the page is
// about. Readability walks the DOM holding node references across iterations
// and dereferences `node.parentNode` unguarded in several places
// (`_simplifyNestedElements`, `_setNodeTag`, the <p> promotion in `_grabArticle`).
// On a React route that is still streaming — /events re-renders as each provider
// answers — a node it is holding gets unmounted between iterations, parentNode
// becomes null, and it throws. Two unguarded sites reached in one pass is two
// Sentry issues in the same second. It is their bundle, their DOM walk, and we
// cannot fix it from here.
//
// Denied by URL, never by message — same rule as the Vercel Toolbar above. A
// TypeError about parentNode thrown by OUR code must still page us, and after
// this change there is no `.parentNode` left in Wayfind's own client source to
// throw one (the two inline loaders that used the
// getElementsByTagName('script')[0].parentNode.insertBefore idiom now append to
// document.head inside a try/catch — app/layout.js).
export const DENY_URLS = [
  /^chrome:\/\//i,
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-extension:\/\//i,
  /extensions\//i,
  /_next-live\//i,      // Vercel Toolbar: comments + feedback widget
  /vercel\.live/i,      // Vercel Live: the same toolbar's socket/runtime
  /scripts\.stay22\.com/i,  // Stay22 letmeallez: bundles Mozilla Readability
  /\btp-em\.com/i,          // Travelpayouts Drive loader + its chunks
];

const EXTENSION_TAB_GONE = "Invalid call to runtime.sendMessage(). Tab not found.";
const ANDROID_BRIDGE_GONE = "Error invoking postMessage: Java object is gone";
const META_IAB_UNDEFINED = "undefined is not an object (evaluating 'window._META.IABInnerFrame')";

function isMetaIabMessage(message) {
  return typeof message === "string" && message.replace(/^TypeError:\s*/, "").trim() === META_IAB_UNDEFINED;
}

// The Facebook iOS screenshot has only injected app:/// line-1 frames:
// anonymous :1:51 and global code :1:136. Wayfind defines neither _META nor
// IABInnerFrame. app:/// alone is NOT a deny URL: our own Next chunks can use
// that scheme too. Require the exact property error AND an entirely host-only
// stack, preserving missing/mixed/application stacks. Inspect original stacks,
// not Sentry's synthetic capture-site stack (which belongs to SentryClient).
function isMetaIabHostNoise(value, hint, messages) {
  if (!messages.some(isMetaIabMessage)) return false;
  if (value && value.filename && value.filename !== "app:///") return false;
  if (value && value.lineno != null && value.lineno !== 1) return false;
  const groups = [];
  for (const candidate of [value, value && value.error, value && value.reason, hint && hint.originalException]) {
    if (!candidate || typeof candidate.stack !== "string" || !candidate.stack.trim()) continue;
    const lines = candidate.stack.trim().split(/\r?\n/);
    if (isMetaIabMessage(lines[0])) lines.shift();
    groups.push(lines.map((line) => {
      const match = line.trim().match(/^(global code)?@(app:\/\/\/):1:([1-9]\d*)$/);
      return match ? { filename: match[2], function: match[1] || "", lineno: 1 } : null;
    }));
  }
  const exceptions = (value && value.exception && value.exception.values) || [];
  for (const exception of exceptions) {
    // A chained exception can carry a real app failure beside the host error.
    if (!exception || !isMetaIabMessage(exception.value)) return false;
    const frames = exception.stacktrace && exception.stacktrace.frames;
    if (Array.isArray(frames) && frames.length) groups.push(frames);
  }
  return groups.length > 0 && groups.every((frames) =>
    frames.length >= 2
    && frames.every((frame) => frame && frame.filename === "app:///" && frame.lineno === 1
      && (!frame.function || frame.function === "?" || frame.function === "global code"))
    && frames.some((frame) => frame.function === "global code")
    && frames.some((frame) => !frame.function || frame.function === "?")
  );
}

// WAYFIND-1E / WAYFIND-1G (2026-11-15): "undefined is not an object (evaluating
// 'window.webkit.messageHandlers')" and "...messageHandlers[t].postMessage'",
// 5 events on /christmas-in-florida, every one browser=Facebook 521.0.0 on iOS
// (device iPhone11,8), frames app:///christmas-in-florida line 1 (the host
// injecting script into the page document, no _next chunk frame). Wayfind has no
// WKWebView bridge call: `messageHandlers` appears nowhere in our source (only in
// the vendored MapLibre bundle, which never touches window.webkit). The Facebook
// in-app browser injects a bridge script that assumes window.webkit exists, and
// it does not once the page runs in a context without WKScriptMessageHandlers.
//
// Narrow by construction: exact property messages, AND a Facebook/Instagram
// in-app-browser user agent, AND no frame from our own _next chunks. The same
// TypeError in any other browser, or with a Wayfind frame, still reports.
const WEBKIT_BRIDGE_MESSAGE = /^undefined is not an object \(evaluating 'window\.webkit\.messageHandlers(?:\[[A-Za-z_$][\w$]*\]\.postMessage)?'\)$/;
const META_IAB_UA = /\b(?:FBAN|FBAV|FB_IAB|FBIOS|Instagram)\b/;

function eventUserAgent(value) {
  const headers = value && value.request && value.request.headers;
  const fromEvent = headers && (headers["User-Agent"] || headers["user-agent"]);
  if (typeof fromEvent === "string" && fromEvent) return fromEvent;
  return typeof navigator !== "undefined" && typeof navigator.userAgent === "string" ? navigator.userAgent : "";
}

function isWebkitBridgeHostNoise(value, hint) {
  // The SDK's synthetic capture-site Error carries its own text and stack; judge
  // the event and the original thrown value only.
  const messages = noiseMessages(value, hint && { originalException: hint.originalException });
  if (!messages.length || !messages.every((message) => WEBKIT_BRIDGE_MESSAGE.test(message.replace(/^TypeError:\s*/, "")))) return false;
  if (!META_IAB_UA.test(eventUserAgent(value))) return false;
  // Any frame from our own bundles (the real app:/// _next chunks or https
  // chunks) means the call is ours: report it.
  // Not noiseStackText(): its synthetic capture-site stack lives in OUR Sentry
  // chunk (/_next/) and would always veto the drop. Original stacks only.
  return !/\/_next\//.test(noiseStackText(value, hint && { originalException: hint.originalException }));
}

function noiseMessages(value, hint) {
  const out = [];
  const add = (candidate) => {
    if (typeof candidate === "string" && candidate.trim()) out.push(candidate.trim());
    else if (candidate && typeof candidate.message === "string") out.push(candidate.message.trim());
  };
  add(value && value.message);
  add(value && value.reason);
  add(value && value.error);
  add(value && value.logentry && value.logentry.formatted);
  for (const exception of (value && value.exception && value.exception.values) || []) add(exception && exception.value);
  add(hint && hint.originalException);
  add(hint && hint.syntheticException);
  return out.map((message) => message.replace(/^Error:\s*/, ""));
}

function noiseStackText(value, hint) {
  const parts = [];
  const add = (candidate) => { if (typeof candidate === "string") parts.push(candidate); };
  add(value && value.stack);
  add(value && value.reason && value.reason.stack);
  add(value && value.error && value.error.stack);
  add(hint && hint.originalException && hint.originalException.stack);
  add(hint && hint.syntheticException && hint.syntheticException.stack);
  for (const exception of (value && value.exception && value.exception.values) || []) {
    add(exception && exception.stacktrace && exception.stacktrace.frames && exception.stacktrace.frames.map((frame) => `${frame.filename || ""} ${frame.function || ""}`).join("\n"));
  }
  return parts.join("\n");
}

// Exact browser-host failures observed in Sentry (the app has no extension,
// Android bridge, or Meta IAB calls).
// Android is message + stack gated because the same WebView text from our own
// code would still be actionable. Keep framework/DOM errors, including every
// parentNode error, out of this filter.
export function shouldDropBrowserNoise(value, hint, browserRuntime = typeof window !== "undefined") {
  if (!browserRuntime) return false;
  const messages = noiseMessages(value, hint);
  if (messages.includes(EXTENSION_TAB_GONE)) return true;
  if (isMetaIabHostNoise(value, hint, messages)) return true;
  if (isWebkitBridgeHostNoise(value, hint)) return true;
  if (!messages.includes(ANDROID_BRIDGE_GONE)) return false;
  const stack = noiseStackText(value, hint);
  return stack.includes("app://navigation_performance_logger_android")
    && stack.includes("sendDataToNative")
    && stack.includes("sendBeforeUnloadMessage");
}

// WAYFIND-1Y (2026-11-18): one "SyntaxError: Invalid or unexpected token" on
// /p/:id from the layout's pre-SDK buffer (tag early_buffer) with NO stack and
// no source. A parse error has no stack, and the replay dropped the
// filename/lineno the shim had recorded, so Sentry's denyUrls (stack frame
// based) could not filter an extension script and nobody could tell whose code
// failed to parse. earlyErrorContext keeps the source on the event and says
// whether a queued item came from a denied (extension / third party) origin.
export function earlyErrorContext(item, denyUrls = DENY_URLS) {
  const filename = item && typeof item.filename === "string" ? item.filename : "";
  const lineno = item && Number.isFinite(item.lineno) ? item.lineno : null;
  let origin = "none";
  if (filename) {
    try {
      const here = typeof location !== "undefined" ? location.origin : "";
      origin = here && new URL(filename, here).origin === here ? "same" : "cross";
    } catch (_) { origin = "cross"; }
  }
  const denied = !!filename && denyUrls.some((re) => re.test(filename));
  return { denied, tags: { early_buffer: true, early_source: origin }, extra: filename ? { early_filename: filename, early_lineno: lineno } : {} };
}

// Base init options every runtime shares. errors-only: no tracing, no replay.
export function baseSentryOptions(dsn, extra) {
  const options = Object.assign(
    {
      dsn: dsn || undefined,
      enabled: !!dsn,
      tracesSampleRate: 0,          // errors-only — no performance tracing
      sampleRate: 1.0,              // capture 100% of errors
      sendDefaultPii: false,        // scrub PII (no IPs, cookies, request bodies)
      ignoreErrors: IGNORE_ERRORS,
      environment: (typeof process !== "undefined" && (process.env.VERCEL_ENV || process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV)) || "development",
    },
    extra || {}
  );
  const callerBeforeSend = options.beforeSend;
  options.beforeSend = (event, hint) => {
    if (shouldDropBrowserNoise(event, hint)) return null;
    const safeEvent=scrubGroupPlanTelemetry(event);
    return typeof callerBeforeSend === "function" ? callerBeforeSend(safeEvent, hint) : safeEvent;
  };
  return options;
}
