"use client";
// Bottom sheet that emails a built itinerary. Props: { planRef, areaName, surface, onClose }.
// The address lives only in this component's state while the visitor types. It is
// posted once to /api/reengage/email, then dropped from state. It is never logged,
// stored, sent in an event or put in a URL; only the boolean flag hasSavedEmail
// is kept (lib/reengageClient.js). Copy: plain words, no dashes, no pressure.
import { useEffect, useRef, useState } from "react";
import { CONSENT_TEXT, ensureAnonId, setFlag, reengageEvent } from "../../lib/reengageClient.js";

const T = { card: "#161B22", card2: "#1C2230", border: "#2D3748", text: "#F1F5F9", muted: "#94A3B8", light: "#CBD5E1", accent: "#F97316", green: "#22C55E", red: "#FCA5A5" };
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

const ERROR_COPY = {
  plan_expired: "This plan expired. Build it again and we'll send the new one.",
  rate_limited: "One moment, then try again.",
  unavailable: "Email is not available right now.",
  invalid: "That email does not look right. Check it and try again.",
  consent: "Tick the box to say it is okay to email you.",
  network: "You look offline. Check your connection and try again.",
  error: "Something went wrong. Try again.",
};

function errorCode(status, body) {
  const c = body && typeof body.code === "string" ? body.code : "";
  if (c === "plan_expired" || status === 404) return "plan_expired";
  if (status === 429) return "rate_limited";
  if (status === 503 || c === "unconfigured") return "unavailable";
  if (c === "invalid") return "invalid";
  if (c === "consent") return "consent";
  return "error";
}

export default function EmailItineraryDrawer({ planRef, areaName, surface, onClose }) {
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [phase, setPhase] = useState("idle"); // idle | sending | sent | error
  const [code, setCode] = useState("");
  const sheetRef = useRef(null);
  const inputRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const surf = typeof surface === "string" ? surface : "unknown";

  // Open: remember focus, lock scroll, focus the field. Close: undo all three.
  useEffect(() => {
    const prev = document.activeElement;
    const targets = [document.body, document.getElementById("wf-scroll")].filter(Boolean);
    const saved = targets.map((el) => el.style.overflow);
    targets.forEach((el) => { el.style.overflow = "hidden"; });
    reengageEvent(window, "reengage_email_open", { surface: surf });
    const t = setTimeout(() => { try { inputRef.current && inputRef.current.focus(); } catch (e) { /* ignore */ } }, 0);
    return () => {
      clearTimeout(t);
      targets.forEach((el, i) => { el.style.overflow = saved[i]; });
      try { if (prev && prev.isConnected && typeof prev.focus === "function") prev.focus(); } catch (e) { /* ignore */ }
    };
  }, [surf]);

  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); closeRef.current && closeRef.current(); return; }
    if (e.key !== "Tab" || !sheetRef.current) return;
    const items = Array.from(sheetRef.current.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !sheetRef.current.contains(active))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (active === last || !sheetRef.current.contains(active))) { e.preventDefault(); first.focus(); }
  };

  const trimmed = email.trim();
  const canSend = agreed && EMAIL_RX.test(trimmed) && trimmed.length <= 254 && phase !== "sending";

  const submit = async (e) => {
    e.preventDefault();
    if (!canSend) return;
    setPhase("sending"); setCode("");
    let outcome = "error";
    try {
      const res = await fetch("/api/reengage/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: trimmed, consent: true, planRef, anonId: ensureAnonId(window) || undefined, page: window.location.pathname }),
      });
      const body = await res.json().catch(() => null);
      if (res.ok && body && body.ok) outcome = "ok";
      else outcome = errorCode(res.status, body);
    } catch (err) {
      outcome = "network";
    }
    if (outcome === "ok") {
      setFlag("hasSavedEmail", true, window);
      setEmail("");
      setPhase("sent");
      reengageEvent(window, "reengage_email_saved", { surface: surf });
    } else {
      setCode(outcome);
      setPhase("error");
      reengageEvent(window, "reengage_email_error", { code: outcome });
    }
  };

  return (
    <div data-reengage-drawer="" style={{ position: "fixed", inset: 0, zIndex: 955 }} onKeyDown={onKeyDown}>
      <div aria-hidden="true" onClick={() => closeRef.current && closeRef.current()} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.62)" }} />
      <div ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby="wf-reengage-title"
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, margin: "0 auto", maxWidth: 520, boxSizing: "border-box", maxHeight: "90dvh", overflowY: "auto", background: T.card, border: `1px solid ${T.border}`, borderBottom: "none", borderRadius: "18px 18px 0 0", padding: "18px 16px calc(18px + env(safe-area-inset-bottom, 0px))", color: T.text, fontFamily: "var(--wf-sans, system-ui, sans-serif)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <h2 id="wf-reengage-title" style={{ margin: 0, fontSize: 20, lineHeight: 1.25, fontWeight: 900 }}>Email me this itinerary</h2>
          <button type="button" aria-label="Close" onClick={() => closeRef.current && closeRef.current()}
            style={{ flex: "0 0 auto", width: 44, height: 44, margin: "-8px -8px 0 0", background: "transparent", border: "none", color: T.muted, fontSize: 24, cursor: "pointer" }}><span aria-hidden="true">×</span></button>
        </div>
        {phase === "sent" ? (
          <div style={{ marginTop: 14 }}>
            <p role="status" style={{ margin: 0, color: T.green, fontSize: 16, fontWeight: 800 }}>If that address can get email, your plan is on its way.</p>
            <button type="button" onClick={() => closeRef.current && closeRef.current()}
              style={{ marginTop: 16, width: "100%", minHeight: 48, borderRadius: 14, border: `1px solid ${T.border}`, background: T.card2, color: T.text, font: "inherit", fontSize: 16, fontWeight: 800, cursor: "pointer" }}>Done</button>
          </div>
        ) : (
          <form onSubmit={submit} noValidate style={{ marginTop: 10 }}>
            <p style={{ margin: "0 0 12px", color: T.light, fontSize: 14, lineHeight: 1.45 }}>
              {areaName ? `We will send the ${areaName} plan we built for you.` : "We will send the plan we built for you."}
            </p>
            <label htmlFor="wf-reengage-email" style={{ display: "block", color: T.muted, fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Email</label>
            <input id="wf-reengage-email" ref={inputRef} name="email" type="email" autoComplete="email" inputMode="email" required
              value={email} onChange={(e) => setEmail(e.target.value)} spellCheck={false} autoCapitalize="none"
              style={{ width: "100%", boxSizing: "border-box", minHeight: 48, borderRadius: 12, border: `1px solid ${T.border}`, background: T.card2, color: T.text, fontSize: 16, padding: "0 12px", fontFamily: "inherit" }} />
            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", minHeight: 44, marginTop: 12, color: T.light, fontSize: 14, lineHeight: 1.45, cursor: "pointer" }}>
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} required
                style={{ flex: "0 0 auto", width: 22, height: 22, margin: "2px 0 0", accentColor: T.accent }} />
              <span>{CONSENT_TEXT}</span>
            </label>
            <div aria-live="polite" style={{ minHeight: 0 }}>
              {phase === "error" && ERROR_COPY[code] ? <p role="alert" style={{ margin: "10px 0 0", color: T.red, fontSize: 14 }}>{ERROR_COPY[code]}</p> : null}
            </div>
            <button type="submit" disabled={!canSend}
              style={{ marginTop: 14, width: "100%", minHeight: 48, borderRadius: 14, border: "none", background: canSend ? T.accent : "#7C2D12", color: canSend ? "#111827" : "#FDBA74", opacity: canSend ? 1 : 0.7, font: "inherit", fontSize: 16, fontWeight: 900, cursor: canSend ? "pointer" : "not-allowed" }}>
              {phase === "sending" ? "Sending..." : "Email it to me"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
