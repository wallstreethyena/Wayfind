"use client";
import { encodeInvite, invitePath, inviteShareText, smsHref, activityForPlace } from "../../lib/dateInvite";

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
 * @param {string}   o.kind      which of the six the place IS, so the plan the
 *                               recipient builds cannot contradict it later
 * @param {Function} o.onPlain   share exactly as before
 * @param {Function} o.onInvite  (absoluteUrl, text, {to, key}) => share the invite.
 *                               MUST RETURN TRUTHY IF IT OPENED A NATIVE SHARE
 *                               SHEET. That return value is the only way this
 *                               sheet can know whether anything visible happened
 *                               — see showReady() below for why guessing fails.
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

  // No legacy textarea fallback on purpose: navigator.clipboard is present on
  // every https browser this ships to, and the link is on screen to be selected
  // by hand if it ever is not. A hidden textarea is also the exact thing the
  // one-field rule forbids on this sheet.
  const copyNow = (url, btn) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        const pr = navigator.clipboard.writeText(url);
        if (pr && pr.catch) pr.catch(() => {});
      }
    } catch (e) {}
    try { if (btn && btn._wfLabel) btn._wfLabel.textContent = "Copied — go paste it"; } catch (e) {}
  };

  // NO SHARE SHEET IS COMING — SO WRITE THE TEXT AND SAY SO.
  //
  // Owner, 2026-08-12, twice: "i hit send invite and nothing happens", then
  // "it still said invite copied instead of automatically sending the text."
  //
  // Both are the same defect. On a laptop there is no OS share sheet, so
  // shareLink() fell through to a quiet clipboard write and the overlay closed:
  // nothing was broken and nothing was visible, which is the same thing to the
  // person holding the mouse — on the one tap in this product they are actually
  // nervous about. And a clipboard write is not a send. It is homework.
  //
  // So the invite goes out as a REAL message: sms:?&body= hands macOS, iOS and
  // Android a composed text with the invite already written in it, and all that
  // is left is choosing the person and pressing send. The panel underneath is
  // the honest fallback — we cannot observe whether the OS took the handoff, so
  // it says what we did, shows the link, and keeps it on the clipboard.
  //
  // WE ARE TOLD WHICH CASE THIS IS, WE DO NOT SNIFF. The obvious version tests
  // navigator.share here, and it is wrong: shareLink() decides with
  // `touchDevice && navigator.share` while the two intent clients decide with
  // navigator.share alone. On desktop Safari — which has navigator.share and is
  // not a touch device — a sheet that guessed would be wrong for one of them
  // every time. onInvite returns whether it opened something, and a caller that
  // returns nothing lands here, which is the safe way to be wrong.
  const showReady = (url, who, text) => {
    // The handoff first, while the tap is still warm. Unhandled schemes are a
    // no-op in every browser this ships to, so the worst case is the panel.
    try {
      if (typeof window !== "undefined" && window.location) window.location.href = smsHref(url, text);
    } catch (e) {}
    copyNow(url); // silent safety net — the panel promises this below

    card.textContent = "";
    card.appendChild(el("div", "font-size:16px;font-weight:800;color:#E6EDF3;margin-bottom:3px",
      who ? "Off to " + who + " 💌" : "Your invite is written 💌"));
    card.appendChild(el("div", "font-size:13px;color:#8B98A9;margin-bottom:12px",
      "We started the text for you — all that’s left is hitting send. If nothing " +
      "popped open, it’s copied, so paste it into a message and it works the same."));

    // ONE LINE, ELLIPSED. The payload is the invite, so the URL is 140+
    // characters of base64 and wrapping it turns the panel into a wall of
    // gibberish. user-select:all still selects the WHOLE string on one click,
    // clipped or not, so nothing is lost by not showing all of it.
    card.appendChild(el("div",
      "display:block;width:100%;padding:12px 14px;margin-bottom:10px;border-radius:12px;" +
      "background:rgba(255,255,255,.045);border:1px solid #30363D;color:#8B98A9;" +
      "font-size:12.5px;font-weight:600;line-height:1.35;white-space:nowrap;overflow:hidden;" +
      "text-overflow:ellipsis;user-select:all;-webkit-user-select:all", url));

    const copyBtn = button(true, "Copy the link again", "", () => copyNow(url, copyBtn), true);
    card.appendChild(copyBtn);

    const done = el("button",
      "display:block;width:100%;padding:11px;background:transparent;border:none;color:#8B98A9;" +
      "font-size:13px;font-weight:700;cursor:pointer", "Done");
    done.addEventListener("click", act(() => {}));
    card.appendChild(done);
    try { copyBtn.focus({ preventScroll: true }); } catch (e) {}
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
        if (c && isFinite(c.lat) && isFinite(c.lng)) geo = c.lat + "," + c.lng;
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
      let opened = false;
      try { opened = !!(opt.onInvite && opt.onInvite(url, text, { to: who, key: code })); } catch (err) {}
      if (opened) { close(); return; } // the OS sheet is up — get out of its way
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
    try { input.focus({ preventScroll: true }); } catch (e) {}
  };

  card.appendChild(button(false, "I’m asking someone out",
    "We’ll send a little invite instead — and help them say yes", askWho, true));

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
