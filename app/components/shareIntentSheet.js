"use client";
import { encodeInvite, invitePath, inviteShareText } from "../../lib/dateInvite";

// app/components/shareIntentSheet.js — the question, callable from anywhere (v7.28).
//
// Owner: the ask has to be on EVERY share, not just the place sheet.
//
// WHY THIS IS IMPERATIVE AND NOT A REACT COMPONENT. The share buttons are
// scattered across a 10,700-line shell, two intent clients and half a dozen
// rails, most of them inline arrow functions inside deep JSX with no state of
// their own. Making each one stateful means seven copies of the same sheet and
// seven chances for them to drift — which is exactly the failure the one share
// card was built to end. One function, called from a click handler, mounts one
// overlay, and every share button on the site asks the same question.
//
// THE ACTIVATION CHAIN IS THE WHOLE RISK. On iOS navigator.share() is refused
// unless it runs inside a user gesture, and the gesture that opened this sheet
// is spent by the time the sheet is on screen. That is fine and deliberate: the
// share fires from the tap on OUR button inside the sheet, which is itself a
// fresh gesture. What must never appear between that tap and the share is
// anything async — no await, no setTimeout, no fetch. check-date-invite guards
// it.
//
// It is also plain DOM rather than a portal because it has to be callable from
// module-scope helpers in home.js that are not components and have no tree.

const ID = "wf-share-intent";

function el(tag, style, text) {
  const n = document.createElement(tag);
  if (style) n.setAttribute("style", style);
  if (text != null) n.textContent = text;
  return n;
}

/**
 * Ask who the share is for, then run the caller's own handler.
 *
 * @param {object}   o
 * @param {string}   o.name      the place being shared
 * @param {string}   o.city      so the ranking at the end points at the right city
 * @param {string}   o.id        place id, carried through the invite
 * @param {Function} o.onPlain   share exactly as before
 * @param {Function} o.onInvite  (absoluteUrl, text) => share the invite
 */
export function askShareIntent(o) {
  const opt = o || {};
  // Server, or a browser too old for this: never swallow the share.
  if (typeof document === "undefined") { try { opt.onPlain && opt.onPlain(); } catch (e) {} return; }

  const prior = document.getElementById(ID);
  if (prior) { try { prior.remove(); } catch (e) {} }

  const name = String(opt.name || "").slice(0, 60);
  const wrap = el("div", "position:fixed;inset:0;z-index:100000;display:flex;align-items:flex-end;justify-content:center");
  wrap.id = ID;
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-label", "How do you want to share this?");

  const scrim = el("div", "position:absolute;inset:0;background:rgba(3,6,10,.62)");
  const card = el("div",
    "position:relative;width:100%;max-width:520px;background:#0D1218;border-top:1px solid #30363D;" +
    "border-radius:16px 16px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom));" +
    "box-shadow:0 -18px 48px rgba(0,0,0,.55)");

  card.appendChild(el("div", "font-size:16px;font-weight:800;color:#E6EDF3;margin-bottom:3px",
    name ? "Share " + name : "Share this"));
  card.appendChild(el("div", "font-size:13px;color:#8B98A9;margin-bottom:14px", "Who is this for?"));

  const close = () => { try { wrap.remove(); } catch (e) {} document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };

  // NOTHING ASYNC BETWEEN THE TAP AND THE SHARE.
  const act = (fn) => (e) => {
    e.preventDefault(); e.stopPropagation();
    try { fn(); } catch (err) {}
    close();
  };

  const button = (primary, title, sub, onTap) => {
    const b = el("button",
      "display:block;width:100%;text-align:left;cursor:pointer;padding:13px 15px;margin-bottom:9px;" +
      "border-radius:12px;font-size:14.5px;font-weight:800;line-height:1.25;" +
      (primary
        ? "background:#F97316;border:none;color:#0B0F14"
        : "background:rgba(255,255,255,.045);border:1px solid #30363D;color:#E6EDF3"));
    b.appendChild(el("span", "display:block", title));
    if (sub) b.appendChild(el("span", "display:block;font-size:12.5px;font-weight:600;color:#8B98A9;margin-top:2px", sub));
    b.addEventListener("click", act(onTap));
    return b;
  };

  // The plain share is FIRST and primary. Sharing already worked in one tap, and
  // a question in front of it makes the common case worse to serve the rare one.
  card.appendChild(button(true, "Just share it", "", () => { opt.onPlain && opt.onPlain(); }));

  card.appendChild(button(false, "I’m asking someone out",
    "We’ll send a little invite instead — and help them say yes", () => {
      const code = encodeInvite({ place: name, city: opt.city, id: opt.id });
      if (!code) { opt.onPlain && opt.onPlain(); return; }
      // The LIVE origin, not a constant: a preview deployment then shares a link
      // that opens on the preview instead of bouncing to production.
      const origin = (typeof window !== "undefined" && window.location && window.location.origin)
        || "https://www.gowayfind.com";
      opt.onInvite && opt.onInvite(origin + invitePath(code), inviteShareText());
    }));

  const cancel = el("button",
    "display:block;width:100%;padding:11px;background:transparent;border:none;color:#8B98A9;" +
    "font-size:13px;font-weight:700;cursor:pointer", "Cancel");
  cancel.addEventListener("click", act(() => {}));
  card.appendChild(cancel);

  scrim.addEventListener("click", act(() => {}));
  wrap.appendChild(scrim);
  wrap.appendChild(card);
  document.body.appendChild(wrap);
  document.addEventListener("keydown", onKey);
  try { card.querySelector("button").focus({ preventScroll: true }); } catch (e) {}
}
