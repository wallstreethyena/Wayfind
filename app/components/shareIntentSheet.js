"use client";
import { encodeInvite, invitePath, inviteShareText, activityForPlace } from "../../lib/dateInvite";
// v8.46 — the pairing law. wf_center is shared state; every reader validates.
import { centerAgreesWithLabel } from "../../lib/locationHonesty";
import { shareOut } from "../../lib/shareOut.js";
import { groupPlanHref, placeSharePreview, runShareChoice } from "../../lib/shareContext.js";

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
let activeIntentClose = null;

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
 * @param {string}   o.kind      which of the six the place IS, so the plan the
 *                               recipient builds cannot contradict it later
 * @param {Function} o.onPlain   share exactly as before
 * @param {Function} o.onInvite  (absoluteUrl, text, {to, key}) => share the invite.
 *                               MUST RETURN TRUTHY IF VISIBLE SHARE UI OPENED.
 *                               That return value is the only way this
 *                               sheet can know whether anything visible happened
 *                               — see showReady() below for why guessing fails.
 */
export function askShareIntent(o) {
  const opt = o || {};
  // Server, or a browser too old for this: never swallow the share.
  if (typeof document === "undefined") { try { opt.onPlain && opt.onPlain(); } catch (e) {} return; }

  if (activeIntentClose) activeIntentClose();
  const returnFocus = document.activeElement;
  const prior = document.getElementById(ID);
  if (prior) { try { prior.remove(); } catch (e) {} }

  const name = String(opt.name || "").slice(0, 60);
  const wrap = el("div", "position:fixed;inset:0;z-index:100000;display:flex;align-items:flex-end;justify-content:center");
  wrap.id = ID;
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-label", "How do you want to share this?");

  // IT HAS TO LOOK LIKE SOMETHING HAPPENED. Owner: "when you click share the
  // screen does not automatically centre to the place where you need to write
  // the name — for someone who does not know, it is as if the share button did
  // nothing." A panel that appears with no motion, at the bottom edge of a long
  // scrolled page, on a phone whose thumb is halfway up the screen, reads as no
  // response at all. One 220ms slide is the whole difference.
  // Wrapped, because a share must never fail over a decoration.
  const anim = "wf-share-intent-anim";
  try {
    if (!document.getElementById(anim)) {
      const st = document.createElement("style");
      st.id = anim;
      st.textContent = "@keyframes wfSiUp{from{transform:translateY(18px);opacity:0}to{transform:translateY(0);opacity:1}}"
        + "@keyframes wfSiFade{from{opacity:0}to{opacity:1}}"
        + "@media (prefers-reduced-motion: reduce){#" + ID + " *{animation:none!important}}";
      (document.head || document.body).appendChild(st);
    }
  } catch (e) {}

  const scrim = el("div", "position:absolute;inset:0;background:rgba(3,6,10,.62);animation:wfSiFade .18s ease-out");
  const card = el("div",
    "position:relative;width:100%;max-width:520px;background:#0D1218;border-top:1px solid #30363D;" +
    "border-radius:16px 16px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom));" +
    "box-shadow:0 -18px 48px rgba(0,0,0,.55);animation:wfSiUp .22s cubic-bezier(.22,.61,.36,1);max-height:90dvh;overflow-y:auto;box-sizing:border-box");

  const preview = placeSharePreview(opt.id, name, opt.city);
  if (preview) {
    const img = el("img", "display:block;width:100%;aspect-ratio:1200/630;object-fit:cover;border-radius:12px;margin-bottom:14px");
    img.src = preview;
    img.alt = name ? "Share preview for " + name : "Wayfind place share preview";
    // /api/og/hero owns licensed real-photo resolution and honest typography.
    // A failed preview never blocks the share or substitutes invented imagery.
    img.addEventListener("error", () => { try { img.remove(); } catch {} });
    card.appendChild(img);
  }
  card.appendChild(el("div", "font-size:16px;font-weight:800;color:#E6EDF3;margin-bottom:3px",
    name ? "Share " + name : "Share this"));
  card.appendChild(el("div", "font-size:13px;color:#8B98A9;margin-bottom:14px", "Who is this for?"));

  const close = () => {
    try { wrap.dispatchEvent(new Event("wf-si-close")); } catch (e) {}
    try { wrap.remove(); } catch (e) {}
    document.removeEventListener("keydown", onKey);
    if (activeIntentClose === close) activeIntentClose = null;
    try { returnFocus?.focus?.({ preventScroll: true }); } catch {}
  };
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key !== "Tab") return;
    const items = Array.from(card.querySelectorAll?.("button,input") || []);
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  };

  // NOTHING ASYNC BETWEEN THE TAP AND THE SHARE.
  const act = (fn) => (e) => {
    e.preventDefault(); e.stopPropagation();
    close();
    try { runShareChoice(fn); } catch (err) {}
  };

  const button = (primary, title, sub, onTap, keepOpen) => {
    const b = el("button",
      "display:block;width:100%;text-align:left;cursor:pointer;padding:13px 15px;margin-bottom:9px;" +
      "border-radius:12px;font-size:14.5px;font-weight:800;line-height:1.25;" +
      (primary
        ? "background:#F97316;border:none;color:#0B0F14"
        : "background:rgba(255,255,255,.045);border:1px solid #30363D;color:#E6EDF3"));
    const label = el("span", "display:block", title);
    b.appendChild(label);
    b._wfLabel = label; // so a button can rewrite its own word without a re-render
    if (sub) b.appendChild(el("span", "display:block;font-size:12.5px;font-weight:600;color:#8B98A9;margin-top:2px", sub));
    // `keepOpen` REPLACES the sheet's contents rather than closing it, so the
    // second step is not a second dialog stacked on the first.
    b.addEventListener("click", keepOpen ? (e) => {
      e.preventDefault(); e.stopPropagation();
      try { onTap(); } catch (err) {}
    } : act(onTap));
    return b;
  };

  // A caller reporting no visible handoff gets the same explicit choices.
  // Never silently copy, claim delivery, or open a second composer underneath
  // a native sheet. More share options owns its own fresh user gesture.
  const showReady = (url, who, text) => {
    const how = shareOut({ title: who ? "Invite for " + who : "Your invite", url, text });
    if (how !== "failed") { close(); return; }
    card.textContent = "";
    card.appendChild(el("div", "color:#E6EDF3;font-size:14px", "Couldn’t open share options. You can select this invite link:"));
    card.appendChild(el("div", "color:#8B98A9;overflow-wrap:anywhere;user-select:all", url));
    card.appendChild(button(false, "Done", "", () => {}));
  };

  // The plain share is FIRST and primary. Sharing already worked in one tap, and
  // a question in front of it makes the common case worse to serve the rare one.
  card.appendChild(button(true, "Just share it", "", () => { opt.onPlain && opt.onPlain(); }));

  // A ONE-FIELD SECOND STEP, and it had to earn its place. A form in front of a
  // share is how a share stops happening — but the owner hit the reason it is
  // worth it: send one link to three people and he cannot tell who accepted.
  // The name is what makes the reply legible, and it also puts their name on the
  // first screen they see, which is the difference between an invitation and a
  // link that could have gone to anyone.
  //
  // It is skippable in one tap, it never blocks, and pressing Enter sends.
  const askWho = () => {
    card.textContent = "";
    card.appendChild(el("div", "font-size:16px;font-weight:800;color:#E6EDF3;margin-bottom:3px", "Who are you asking?"));
    card.appendChild(el("div", "font-size:13px;color:#8B98A9;margin-bottom:14px",
      "Just a first name. It goes on their invite, and it comes back with their answer."));

    const input = el("input",
      "display:block;width:100%;padding:13px 15px;margin-bottom:10px;border-radius:12px;" +
      "background:rgba(255,255,255,.045);border:1px solid #30363D;color:#E6EDF3;" +
      "font-size:16px;font-weight:700;outline:none");
    input.setAttribute("type", "text");
    input.setAttribute("autocomplete", "given-name");
    input.setAttribute("enterkeyhint", "send");
    input.setAttribute("maxlength", "24");
    // A format hint, not a guess at who they know. The first draft used "Sam",
    // which reads as though we had picked somebody out of their contacts.
    input.setAttribute("placeholder", "Their first name");
    input.setAttribute("aria-label", "Their first name, optional");
    card.appendChild(input);

    // send() OWNS THE CLOSE. It used to be wrapped in act(), which closed
    // unconditionally — fine when a native sheet takes over the screen, and the
    // whole bug when nothing does. Nothing async still sits between the tap and
    // onInvite; the branch below happens strictly after it returns.
    const send = (who) => {
      // Classified HERE, where the full place object still exists — Google's
      // type array never reaches the /ask page, which only gets a name.
      // WHERE THEY ARE, READ HERE. The sender's own app has already resolved a
      // centre and persisted it; the recipient never has one, because they have
      // never been to Wayfind. Reading it at share time is what makes the last
      // tap of the whole flow land on real places instead of "Nothing near you
      // clears the bar" — and it costs the callers nothing, so a share button
      // added later cannot forget it.
      let geo = "";
      try {
        const c = JSON.parse(window.localStorage.getItem("wf_center") || "null");
        // v8.46 — THE PAIRING LAW, and it matters MORE here than anywhere else:
        // these coordinates are baked into a link a friend opens, permanently,
        // with no session of their own to self-correct from. A stored pair whose
        // label and point contradict each other would ship the recipient a
        // ranking origin in the wrong state under this invite's city name.
        // Sending no geo at all is honest — the recipient's own location
        // resolves on arrival — and a lie is not.
        if (c && isFinite(c.lat) && isFinite(c.lng) && centerAgreesWithLabel({ lat: c.lat, lng: c.lng }, c.loc)) {
          geo = c.lat + "," + c.lng;
        }
      } catch (e) {}
      const code = encodeInvite({ place: name, city: opt.city, id: opt.id, to: who, kind: opt.kind, geo });
      if (!code) { opt.onPlain && opt.onPlain(); close(); return; }
      // The LIVE origin, not a constant: a preview deployment then shares a link
      // that opens on the preview instead of bouncing to production.
      const origin = (typeof window !== "undefined" && window.location && window.location.origin)
        || "https://www.gowayfind.com";
      const url = origin + invitePath(code);
      // Seeded off THIS invite, so the same link always carries the same line —
      // and never "Open this", which is not a sentence a person types.
      const text = inviteShareText({ place: name, city: opt.city, from: who }, who);
      close();
      let opened = false;
      try { opened = !!runShareChoice(() => opt.onInvite && opt.onInvite(url, text, { to: who, key: code })); } catch (err) {}
      if (opened) { close(); return; } // the chosen transport has visible UI
      showReady(url, who, text);
    };

    card.appendChild(button(true, "Send the invite", "", () => send(input.value), true));
    const skip = el("button",
      "display:block;width:100%;padding:11px;background:transparent;border:none;color:#8B98A9;" +
      "font-size:13px;font-weight:700;cursor:pointer", "Skip — I’ll keep it a mystery");
    skip.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      try { send(""); } catch (err) {}
    });
    card.appendChild(skip);

    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      try { send(input.value); } catch (err) {}
    });
    // preventScroll:true was the bug. It tells the browser NOT to bring the
    // focused element into view — which is right for a panel that is already on
    // screen and wrong the moment iOS raises the keyboard over the bottom of
    // the viewport, because the field it just focused is now underneath it. The
    // caret blinks somewhere the person cannot see, and the sheet reads as
    // dead.
    //
    // visualViewport is the only thing that knows how tall the keyboard is:
    // window.innerHeight does not change when it opens. We lift the sheet by
    // the difference so the field lands above it, and put it back on close.
    const lift = () => {
      try {
        const vv = window.visualViewport;
        if (!vv) return;
        const under = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        card.style.transform = under > 24 ? "translateY(-" + Math.round(under) + "px)" : "";
      } catch (e) {}
    };
    try {
      input.focus();
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", lift);
        wrap.addEventListener("wf-si-close", () => {
          try { window.visualViewport.removeEventListener("resize", lift); } catch (e) {}
        });
      }
      // One frame later, because the keyboard has not started animating yet.
      window.requestAnimationFrame(() => { lift(); try { card.scrollIntoView({ block: "end" }); } catch (e) {} });
    } catch (e) {}
  };

  card.appendChild(button(false, "I’m asking someone out",
    "Write a little invite they can answer", askWho, true));

  const groupHref = groupPlanHref(opt.id, name);
  if (groupHref) card.appendChild(button(false, "Organize a group",
    "Pick a place. Find a time.", () => { window.location.href = groupHref; }));

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
  activeIntentClose = close;
  try { card.querySelector("button").focus({ preventScroll: true }); } catch (e) {}
}
