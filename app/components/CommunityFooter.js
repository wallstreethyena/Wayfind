"use client";
// app/components/CommunityFooter.js — the one visible community strip on the app
// route ("/"). Three things the owner asked for, in the ONE below-content area a
// phone user actually reaches on the home screen (app/home.js's centered
// Privacy · Terms · build block). Deliberately NOT the left/side nav — the owner
// said not to touch that — and deliberately not the server footer in
// app/layout.js, which is veiled on "/" for viewport reasons (FooterVeil).
//
//   1. Follow us      — Instagram @gowayfind.app, surfaced in-app (the layout
//                       footer has it, but that footer is invisible on "/").
//   2. Creators       — an open call. A GOOD creator gets a spot; the ask is one
//                       tap to email hello@gowayfind.com. This one IS a mailto,
//                       because the owner said creators "send us an e-mail".
//   3. Feedback       — the opposite: this must NOT be email. It opens an in-app
//                       panel and POSTs to /api/feedback, which writes to the
//                       wf_feedback table. A team member reads it with one query.
//
// scripts/check-community-footer.mjs pins all three: Instagram handle exact,
// creators = mailto, feedback = /api/feedback and never a mailto, and that this
// component is actually mounted in the home footer.
import { useState } from "react";
import { C } from "./kit";

export const WAYFIND_INSTAGRAM = "https://www.instagram.com/gowayfind.app/";
export const CREATOR_EMAIL = "hello@gowayfind.com";
// NB: not "Wayfind creator" — that phrase implies existing affiliation
// (Lanham Act s.43(a), lib/creatorRights.js BANNED_AFFILIATION_PHRASES). This is
// an APPLICATION from someone who is not affiliated yet, so it is phrased as one.
const CREATOR_SUBJECT = "Creator spot request — Wayfind";
const CREATOR_BODY =
  "Hi Wayfind team,\n\nI make local content and I'd love a creator spot on the app.\n\nWho I am:\nWhere I post (handle + link):\nFollowers / typical views:\nThe area I cover:\n\nThanks!";

const link = { color: C.muted, textDecoration: "none", fontSize: 12, fontWeight: 700 };

export default function CommunityFooter({ path = "/", loc = "", build = "", userId = null } = {}) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [sentiment, setSentiment] = useState(null);   // 'up' | 'down' | null
  const [state, setState] = useState("idle");         // idle | sending | done | error

  async function send() {
    const text = msg.trim();
    if (!text || state === "sending") return;
    setState("sending");
    try {
      const r = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text, sentiment, path, loc, build, userId }),
      });
      const j = await r.json().catch(() => ({}));
      // The server says "thanks" even when it could not store (unconfigured /
      // rate-limited), so the person is never scolded for a fault that is ours.
      setState(j && j.ok === false && j.error && j.error !== "rate_limited" && j.error !== "unconfigured" ? "error" : "done");
    } catch (e) {
      setState("error");
    }
  }

  const mailHref =
    "mailto:" + CREATOR_EMAIL +
    "?subject=" + encodeURIComponent(CREATOR_SUBJECT) +
    "&body=" + encodeURIComponent(CREATOR_BODY);

  return (
    <div style={{ maxWidth: 340, margin: "0 auto" }}>
      {/* Row 1: the three affordances, quiet by default so they never compete
          with the feed but are always in the same reachable place. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, flexWrap: "wrap", marginBottom: 10 }}>
        <a href={WAYFIND_INSTAGRAM} target="_blank" rel="noopener noreferrer" aria-label="Wayfind on Instagram" style={{ ...link, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
          </svg>
          Instagram
        </a>
        <span style={{ color: C.border }} aria-hidden="true">·</span>
        <button
          type="button"
          onClick={() => { setState("idle"); setOpen((v) => !v); }}
          aria-expanded={open}
          style={{ ...link, background: "none", border: "none", padding: 0, cursor: "pointer" }}
        >
          Send feedback
        </button>
      </div>

      {/* Row 2: the creator call. One line, one tap to email — the owner's ask. */}
      <a
        href={mailHref}
        style={{ display: "block", textAlign: "center", fontSize: 11.5, color: C.muted, textDecoration: "none", lineHeight: 1.5, marginBottom: 4 }}
      >
        Are you a local creator?{" "}
        <span style={{ color: C.accent, fontWeight: 800 }}>We'll build you a spot &rarr;</span>
      </a>
      <div style={{ textAlign: "center", fontSize: 10, color: C.muted, opacity: 0.6, marginBottom: open ? 12 : 0 }}>
        If your content&apos;s good, email {CREATOR_EMAIL}
      </div>

      {/* The feedback panel — in-app, no email, no browser dialog. */}
      {open && (
        <div style={{ marginTop: 4, background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, textAlign: "left" }}>
          {state === "done" ? (
            <div style={{ textAlign: "center", padding: "8px 4px" }}>
              <div style={{ fontSize: 22, marginBottom: 4 }}>&#128591;</div>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>Thank you — we read every note.</div>
              <button type="button" onClick={() => { setOpen(false); setMsg(""); setSentiment(null); setState("idle"); }} style={{ marginTop: 10, background: "none", border: "none", color: C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Close</button>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: C.text, marginBottom: 8 }}>What&apos;s on your mind?</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {[["up", "👍", "Love it"], ["down", "👎", "Needs work"]].map(([val, emoji, lbl]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setSentiment((s) => (s === val ? null : val))}
                    aria-pressed={sentiment === val}
                    style={{
                      flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
                      padding: "8px 0", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 700,
                      color: sentiment === val ? C.text : C.muted,
                      background: sentiment === val ? C.adim : "transparent",
                      border: `1px solid ${sentiment === val ? C.accent : C.border}`,
                    }}
                  >
                    <span aria-hidden="true">{emoji}</span> {lbl}
                  </button>
                ))}
              </div>
              <textarea
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Tell us what's working, what's broken, or what you wish Wayfind did…"
                style={{ width: "100%", boxSizing: "border-box", resize: "vertical", background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, lineHeight: 1.45, fontFamily: "inherit", outline: "none" }}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                <span style={{ fontSize: 10.5, color: state === "error" ? C.red : C.muted, opacity: state === "error" ? 1 : 0.7 }}>
                  {state === "error" ? "Couldn't send — please try again." : "Goes straight to the team. No email needed."}
                </span>
                <button
                  type="button"
                  onClick={send}
                  disabled={!msg.trim() || state === "sending"}
                  style={{
                    padding: "8px 16px", borderRadius: 999, border: "none", fontSize: 12.5, fontWeight: 800,
                    cursor: !msg.trim() || state === "sending" ? "default" : "pointer",
                    color: "#0D1117",
                    background: !msg.trim() ? C.border : C.accent,
                    opacity: state === "sending" ? 0.7 : 1,
                  }}
                >
                  {state === "sending" ? "Sending…" : "Send"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
