// One text-first transport for every URL/reply share. Opening a chooser never
// copies or sends anything. Text message / Email open user-controlled composers;
// More share options is a fresh tap into the native share sheet.
import { openShareChooser } from "./shareChooser.js";
import { canonicalShareUrl, SITE_URL } from "./site.js";

export function canonicalSharePayload(payload) {
  const p={...(payload||{})};
  if(!p.url)return p;
  try {
    const url=new URL(canonicalShareUrl(p.url));
    if(url.protocol!=="https:"||url.origin!==new URL(SITE_URL).origin||url.username||url.password)return null;
    p.url=url.toString();
    return p;
  }catch{return null;}
}

export function isTouchDevice() {
  try {
    return typeof window !== "undefined" && (("ontouchstart" in window)
      || !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches));
  } catch { return false; }
}

function nativeBridgeAvailable() {
  try { return !!(typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.()); }
  catch { return false; }
}

export function canShareNatively() {
  try {
    return (typeof navigator !== "undefined" && typeof navigator.share === "function")
      || nativeBridgeAvailable();
  } catch { return false; }
}

/** Explicit native choice only. No clipboard write, await, or lazy web chunk
 * may precede navigator.share: iOS needs this button's transient activation.
 * Resolution means the OS handled a share, never that an SMS was delivered.
 */
export function shareNatively(payload, onCopied, options = {}) {
  const p = canonicalSharePayload(payload);
  if(!p)return "failed";
  const retry = () => shareOut(p, onCopied, options);
  const completed = () => { try { options.onShared?.(); } catch {} };
  try {
    if (nativeBridgeAvailable()) {
      import("./native.js").then(({ nativeShareResult }) => nativeShareResult(p)).then((result) => {
        if (result === "shared") completed();
        else if (result !== "cancelled") retry();
      }, retry);
      return "native";
    }
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      const data = { ...(p.title ? { title: p.title } : {}), ...(p.text ? { text: p.text } : {}), ...(p.url ? { url: p.url } : {}) };
      const pr = navigator.share(data);
      if (pr && typeof pr.then === "function") pr.then(completed, (e) => {
        if (e?.name !== "AbortError") retry();
      });
      return "native";
    }
  } catch (e) { if (e?.name === "AbortError") return "cancelled"; }
  return retry();
}

/** Returns chooser only after visible UI mounts; failed means no action ran.
 * Text-only replies are allowed explicitly via options.textOnly.
 */
export function shareOut(payload, onCopied, options = {}) {
  const p = canonicalSharePayload(payload);
  if(!p)return "failed";
  if (!String(p.url || "").trim() && !(options.textOnly && String(p.text || "").trim())) return "failed";
  try {
    return openShareChooser(p, onCopied, {
      ...options,
      onNative: canShareNatively() ? () => shareNatively(p, onCopied, options) : null,
    }) === true ? "chooser" : "failed";
  } catch { return "failed"; }
}
