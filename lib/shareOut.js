// lib/shareOut.js — sharing FROM a page that is not the app shell.
//
// WHY A SECOND SHARE FUNCTION EXISTS, AND WHY THAT IS NOT DUPLICATION.
//
// app/home.js has shareLink(): it prefers the Capacitor sheet inside the iOS
// wrapper (lib/native.js), falls back to navigator.share, then to the
// clipboard, reports which path ran through _sharePath, and feeds the
// app-rating high-point counter. It is a closure inside a 10,000-line client
// component, and nothing outside app/home.js can call it.
//
// The guides are 39 server-rendered marketing pages that are ~46% of external
// entries (AUDIT F2), they live entirely outside that component, and until
// v8.23 not one of them had a share control at all — owner, 2026-08-19: "why is
// it that none of these blog has a share button". They need the behaviour and
// cannot reach the implementation.
//
// So this is the behaviour, isolated, for pages outside the shell. It does NOT
// try to be shareLink(): no Capacitor branch (a guide is never inside the
// native wrapper), no rating hook. What it DOES have to match is the one thing
// that is easy to get wrong and invisible when you do:
//
//   THE ORDER. On iOS a clipboard write CONSUMES the tap's transient user
//   activation, so a navigator.share() called after it is rejected with
//   NotAllowedError — the "copied" toast appears and the sheet never opens.
//   That was a real production bug (v4.06 -> v4.07). The native sheet must be
//   the FIRST activation-consuming call in the handler, and the clipboard is
//   only reached when there is no sheet or the sheet refused.
//
// scripts/check-share-out.mjs asserts that ordering in BOTH implementations, so
// the two cannot drift on the only thing they must agree about.

/** A pointer-coarse device — the only kind where a native sheet beats a copy. */
export function isTouchDevice() {
  try {
    if (typeof window === "undefined") return false;
    return ("ontouchstart" in window)
      || !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  } catch (e) { return false; }
}

/** Is a native share sheet available for this payload? */
export function canShareNatively() {
  try {
    return isTouchDevice() && typeof navigator !== "undefined" && typeof navigator.share === "function";
  } catch (e) { return false; }
}

// execCommand fallback for a browser with no async clipboard (and for an
// insecure origin, where navigator.clipboard is simply absent).
function legacyCopy(url) {
  try {
    const ta = document.createElement("textarea");
    ta.value = url;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  } catch (e) { return false; }
}

/**
 * Share a URL. Returns SYNCHRONOUSLY what the user is about to experience, so
 * the caller can decide whether it has to say anything itself:
 *
 *   "native"  a share sheet is opening — say nothing, the OS is talking
 *   "copied"  the link went to the clipboard — the caller MUST show that,
 *             because otherwise the tap looks like it did nothing
 *   "failed"  nothing happened (no url)
 *
 * Never throws: every branch is wrapped, because this runs inside a click
 * handler and an exception there kills the interaction with no message.
 *
 * @param {{url:string,title?:string,text?:string}} payload
 * @param {function} [onCopied] called once the clipboard write resolves
 */
export function shareOut(payload, onCopied) {
  const p = payload || {};
  const url = String(p.url || "");
  if (!url) return "failed";
  const copy = () => {
    const done = () => { try { onCopied && onCopied(); } catch (e) {} };
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(done, () => { legacyCopy(url); done(); });
        return;
      }
    } catch (e) {}
    legacyCopy(url);
    done();
  };
  // THE SHEET FIRST. See the header note: reversing these two lines is a bug
  // that only reproduces on a real iPhone.
  if (canShareNatively()) {
    try {
      const data = p.text ? { title: p.title, text: p.text, url } : { title: p.title, url };
      const pr = navigator.share(data);
      if (pr && typeof pr.then === "function") {
        // A user who cancels has not failed — copying the link behind their
        // back after they said no is worse than doing nothing.
        pr.then(function () {}, function (e) { if (e && e.name === "AbortError") return; copy(); });
      }
      return "native";
    } catch (e) { copy(); return "copied"; }
  }
  copy();
  return "copied";
}
