"use client";
import { useState } from "react";
import { C } from "./kit";
import { encodeInvite, invitePath, inviteShareText } from "../../lib/dateInvite";

// app/components/ShareIntent.js — the question at the moment of sharing (v7.27).
//
// Owner: "whenever the user wants to share we should ask if they are inviting
// someone on a date, or if they would like for us to increase their chances of
// the person saying yes."
//
// THE COST OF ASKING IS THE WHOLE DESIGN PROBLEM. Sharing a place already works
// in one tap, and putting a question in front of it makes the common case worse
// to serve the rare one. So:
//
//   • the plain share is the FIRST button, it is styled as the primary, and one
//     tap still gets you the sheet you already expected;
//   • the invite is one extra tap, never a form — no name field, no message box,
//     nothing to fill in. The sender's name is the only thing we would want and
//     it is not worth a keyboard, so the card reads "Someone has a question for
//     you" when we do not have it;
//   • it does not appear at all for things you cannot take a person to.
//
// Everything about the invite lives in the URL (lib/dateInvite.js) — no account,
// no invite table, nothing stored about either person.
export default function ShareIntent({ place, city, onPlain, onInvite, onClose }) {
  const [busy, setBusy] = useState(false);
  const name = (place && (place.name || place.title)) || "";

  const go = (fn) => {
    if (busy) return;
    setBusy(true);
    // The native share sheet must be opened INSIDE the tap that asked for it.
    // On iOS the transient user activation is consumed by anything async, so a
    // setTimeout here would silently kill navigator.share() — the same defect
    // documented on shareLink() in app/home.js.
    try { fn(); } catch (e) {}
    try { onClose && onClose(); } catch (e) {}
  };

  const invite = () => go(() => {
    const code = encodeInvite({ place: name, city, id: place && place.id });
    if (!code) { onPlain && onPlain(); return; }
    onInvite && onInvite(invitePath(code), inviteShareText());
  });

  return (
    <div role="dialog" aria-label="How do you want to share this?"
      style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 100000,
        background: "#0D1218", borderTop: "1px solid " + C.border,
        borderRadius: "16px 16px 0 0", padding: "18px 18px calc(18px + env(safe-area-inset-bottom))",
        boxShadow: "0 -18px 48px rgba(0,0,0,.55)" }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 4 }}>
        {name ? "Share " + name : "Share this"}
      </div>
      <div style={{ fontSize: 13, color: C.light, marginBottom: 14 }}>Who is this for?</div>

      <button onClick={() => go(() => onPlain && onPlain())} style={btn(true)}>
        Just share it
      </button>

      <button onClick={invite} style={btn(false)}>
        <span style={{ display: "block", fontSize: 14.5, fontWeight: 800 }}>I&rsquo;m asking someone out</span>
        <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, color: C.light, marginTop: 2 }}>
          We&rsquo;ll send a little invite instead — and help them say yes
        </span>
      </button>

      <button onClick={() => onClose && onClose()} style={{ ...btn(false), background: "transparent",
        border: "none", color: C.light, fontSize: 13, fontWeight: 700, marginBottom: 0 }}>
        Cancel
      </button>
    </div>
  );
}

function btn(primary) {
  return {
    display: "block", width: "100%", textAlign: "left", cursor: "pointer",
    padding: "13px 15px", marginBottom: 9, borderRadius: 12,
    background: primary ? C.accent : "rgba(255,255,255,.045)",
    border: primary ? "none" : "1px solid " + C.border,
    color: primary ? "#0B0F14" : C.text,
    fontSize: 14.5, fontWeight: 800, lineHeight: 1.25,
  };
}
