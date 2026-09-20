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
import { useEffect, useId, useRef, useState } from "react";
import { C } from "./kit";
import { bindFeedbackDialog, FEEDBACK_DIALOG_CSS } from "./feedbackDialog";

export const WAYFIND_INSTAGRAM = "https://www.instagram.com/gowayfind.app/";
export const CREATOR_EMAIL = "hello@gowayfind.com";
// NB: not "Wayfind creator" — that phrase implies existing affiliation
// (Lanham Act s.43(a), lib/creatorRights.js BANNED_AFFILIATION_PHRASES). This is
// an APPLICATION from someone who is not affiliated yet, so it is phrased as one.
const CREATOR_SUBJECT = "Creator spot request — Wayfind";
const CREATOR_BODY =
  "Hi Wayfind team,\n\nI make local content and I'd love a creator spot on the app.\n\nWho I am:\nWhere I post (handle + link):\nFollowers / typical views:\nThe area I cover:\n\nThanks!";

const link = { color: C.muted, textDecoration: "none", fontSize: 12, fontWeight: 700 };

export default function CommunityFooter({ path = "/", loc = "", build = "", userId = null, compact = false, initialPlace = "", recommendation = false, initialOpen = false, hideTrigger = false, onClose = null } = {}) {
  const [open, setOpen] = useState(initialOpen);
  const [msg, setMsg] = useState("");
  const [place, setPlace] = useState(() => String(initialPlace || "").slice(0, 200));
  const [sentiment, setSentiment] = useState(null);
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const id = useId();
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  // Already-embedded public-page forms and place recommendations keep their
  // existing host. Ordinary feedback must not expand the fixed home header.
  const dialogMode = !hideTrigger && !recommendation;
  const Panel = dialogMode ? "dialog" : "div";
  const doneRef = useRef(null);
  const requestRef = useRef(null);
  const placeEditedRef = useRef(false);
  useEffect(() => {
    if (!placeEditedRef.current) setPlace(String(initialPlace || "").slice(0, 200));
  }, [initialPlace]);
  useEffect(() => {
    if (open && state === "done") doneRef.current?.focus({ preventScroll: true });
  }, [open, state]);
  useEffect(() => {
    if (!open) return;
    if (dialogMode) return bindFeedbackDialog(panelRef.current, {
      opener: triggerRef.current, onClose: () => closeRef.current?.(),
    });
    panelRef.current?.focus({ preventScroll: true });
  }, [open, dialogMode]);
  useEffect(() => () => { requestRef.current?.abort(); }, []);

  function close() {
    if (state === "sending") return;
    setOpen(false);
    if (state === "done") {
      setMsg("");
      setSentiment(null);
      setState("idle");
      placeEditedRef.current = false;
      setPlace(String(initialPlace || "").slice(0, 200));
    }
    if (!dialogMode) triggerRef.current?.focus({ preventScroll: true });
    if (typeof onClose === "function") onClose();
  }

  closeRef.current = close;

  async function send() {
    const text = msg.trim();
    const placeText = place.trim();
    if (!text || (recommendation && !placeText) || state === "sending" || requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    const timer = setTimeout(() => controller.abort(), 10000);
    setState("sending");
    setError("");
    try {
      const r = await fetch("/api/feedback", {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: recommendation ? "Place recommendation: " + placeText + "\n\n" + text : text,
          ...(recommendation ? { place: placeText } : {}),
          sentiment, path, loc, build, userId,
        }),
      });
      const j = await r.json().catch(() => ({}));
      // A thank-you is proof of storage, never a substitute for it.
      if (r.ok && j.ok === true && j.stored === true) setState("done");
      else {
        setError(r.status === 429 || j.error === "rate_limited"
          ? "Too many requests right now. Your note is still here — please try again later."
          : "Your note wasn't saved. Please try again; your text is still here.");
        setState("error");
      }
    } catch {
      setError(controller.signal.aborted
        ? "We couldn't confirm your note was saved in time. Your text is still here; please try again."
        : "We couldn't confirm your note was saved. Check your connection and try again.");
      setState("error");
    } finally {
      clearTimeout(timer);
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  const mailHref =
    "mailto:" + CREATOR_EMAIL +
    "?subject=" + encodeURIComponent(CREATOR_SUBJECT) +
    "&body=" + encodeURIComponent(CREATOR_BODY);
  const canSend = !!msg.trim() && (!recommendation || !!place.trim()) && state !== "sending";
  const fieldStyle = { width: "100%", boxSizing: "border-box", background: C.bg, color: C.text, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 16, minWidth: 0, maxWidth: "100%", lineHeight: 1.45, fontFamily: "inherit" };

  return (
    <div style={{ width: "100%", minWidth: 0, boxSizing: "border-box", maxWidth: compact ? 520 : 340, margin: compact ? 0 : "0 auto" }}>
      {!hideTrigger && <div style={{ display: "flex", alignItems: "center", justifyContent: compact ? "flex-start" : "center", gap: 14, flexWrap: "wrap", marginBottom: compact ? 0 : 10 }}>
        {!compact && <>
          <a href={WAYFIND_INSTAGRAM} target="_blank" rel="noopener noreferrer" aria-label="Wayfind on Instagram" style={{ ...link, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
              <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
              <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
            </svg>
            Instagram
          </a>
          <span style={{ color: C.border }} aria-hidden="true">·</span>
        </>}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => { if (open) close(); else setOpen(true); }}
          disabled={state === "sending"}
          aria-expanded={open}
          aria-haspopup={dialogMode ? "dialog" : undefined}
          aria-controls={id + "-panel"}
          style={{ ...link, color: recommendation ? C.accent : C.muted, background: "none", border: "none", padding: compact ? "7px 0" : 0, cursor: "pointer" }}
        >
          {recommendation ? "Recommend this place" : compact ? "Feedback" : "Send feedback"}
        </button>
      </div>}

      {!compact && <>
        <a href={mailHref} style={{ display: "block", textAlign: "center", fontSize: 11.5, color: C.muted, textDecoration: "none", lineHeight: 1.5, marginBottom: 4 }}>
          Are you a local creator?{" "}
          <span style={{ color: C.accent, fontWeight: 800 }}>We'll build you a spot &rarr;</span>
        </a>
        <div style={{ textAlign: "center", fontSize: 10, color: C.muted, opacity: 0.6, marginBottom: open && !dialogMode ? 12 : 0 }}>
          If your content&apos;s good, email {CREATOR_EMAIL}
        </div>
      </>}

      {open && (
        <Panel ref={panelRef} id={id + "-panel"} className={dialogMode ? "wf-feedback-dialog" : undefined}
          tabIndex={dialogMode ? undefined : -1} aria-label={dialogMode ? "Send feedback" : undefined}
          style={{ marginTop: dialogMode ? undefined : 4, minWidth: 0, boxSizing: "border-box", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, textAlign: "left" }}>
          {dialogMode && <style>{FEEDBACK_DIALOG_CSS}</style>}
          {state === "done" ? (
            <div ref={doneRef} tabIndex={-1} role="status" style={{ textAlign: "center", padding: "8px 4px" }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{recommendation ? "Thank you — your recommendation was saved for review." : "Thank you — your feedback was saved."}</div>
              <button type="button" onClick={close} style={{ marginTop: 10, background: "none", border: "none", color: C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Close</button>
            </div>
          ) : (
            <form aria-labelledby={id + "-title"} aria-busy={state === "sending"} onSubmit={(e) => { e.preventDefault(); send(); }}>
              <div className="wf-feedback-heading" style={{ display: "flex", alignItems: "center", gap: 12, background: C.card, marginBottom: 8 }}>
                <div id={id + "-title"} style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 800, color: C.text }}>{recommendation ? "Recommend a place for review" : "What's on your mind?"}</div>
                {dialogMode && <button data-feedback-close type="button" aria-label="Close feedback" onClick={close} disabled={state === "sending"}
                  style={{ flexShrink: 0, minWidth: 44, minHeight: 44, padding: 8, border: 0, borderRadius: 10, background: "transparent", color: C.muted, fontSize: 24, cursor: "pointer" }}>&times;</button>}
              </div>
              {recommendation ? <>
                <p style={{ margin: "0 0 12px", fontSize: 12, color: C.muted, lineHeight: 1.5 }}>We welcome recommendations and will review this place for Wayfind. Inclusion isn&apos;t guaranteed.</p>
                <label htmlFor={id + "-place"} style={{ display: "block", color: C.text, fontSize: 12, marginBottom: 5 }}>Place name and city</label>
                <input id={id + "-place"} value={place} onChange={(e) => { placeEditedRef.current = true; setPlace(e.target.value); }} maxLength={200} required disabled={state === "sending"} style={{ ...fieldStyle, marginBottom: 12 }} />
              </> : <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {[["up", "👍", "Love it"], ["down", "👎", "Needs work"]].map(([val, emoji, lbl]) => (
                  <button key={val} type="button" onClick={() => setSentiment((s) => (s === val ? null : val))} aria-pressed={sentiment === val} disabled={state === "sending"}
                    style={{ flex: "1 1 0", minWidth: 0, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px 0", borderRadius: 10, cursor: "pointer", fontSize: 12, fontWeight: 700, color: sentiment === val ? C.text : C.muted, background: sentiment === val ? C.adim : "transparent", border: `1px solid ${sentiment === val ? C.accent : C.border}` }}>
                    <span aria-hidden="true">{emoji}</span> {lbl}
                  </button>
                ))}
              </div>}
              <label htmlFor={id + "-message"} style={{ display: "block", color: C.text, fontSize: 12, marginBottom: 5 }}>{recommendation ? "Why do you recommend it?" : "Your feedback"}</label>
              <textarea
                id={id + "-message"}
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                maxLength={recommendation ? 1700 : 2000}
                rows={3}
                required
                disabled={state === "sending"}
                aria-describedby={state === "error" ? id + "-error" : undefined}
                placeholder={recommendation ? "What makes this place worth visiting? Add any details that would help us review it." : "Tell us what's working, what's broken, or what you wish Wayfind did…"}
                style={{ ...fieldStyle, resize: "vertical" }}
              />
              {state === "error" && <p id={id + "-error"} role="alert" style={{ fontSize: 12, color: C.red, lineHeight: 1.5, margin: "8px 0 0" }}>{error}</p>}
              <div className="wf-feedback-actions" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10, background: C.card }}>
                <span style={{ flex: "1 1 170px", minWidth: 0, fontSize: 11, lineHeight: 1.45, color: C.muted }}>Shared with the Wayfind team. No email required.</span>
                <button type="submit" disabled={!canSend} style={{ flexShrink: 0, minHeight: 44, minWidth: 74, padding: "8px 16px", borderRadius: 999, border: "none", fontSize: 12.5, fontWeight: 800, cursor: canSend ? "pointer" : "default", color: "#0D1117", background: canSend ? C.accent : C.border, opacity: state === "sending" ? 0.7 : 1 }}>
                  {state === "sending" ? "Sending…" : "Send"}
                </button>
              </div>
            </form>
          )}
        </Panel>
      )}
    </div>
  );
}
