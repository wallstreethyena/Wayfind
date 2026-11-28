"use client";
// The soft ask for re-engagement push, and the iPhone helper that replaces it in a
// Safari tab. LAZY ONLY: reengageBoot.js imports it with import() after
// lib/reengagePushClient.offerFor said yes, and ReengageMount renders it with no
// props, so what it needs (kind, trigger) comes from window[PROMPT_CTX_KEY], set
// by the boot just before. Nothing here is in first load JS.
//
// Rules this file keeps:
//   * The browser's permission dialog opens ONLY from the Yes button (a real click).
//     "Not now" and the close button never reach it. The iPhone helper makes no
//     network call and never asks for permission.
//   * Showing either form counts as an alert (shared daily cap, lib/alertPolicy.js)
//     and as the one ask in 21 days, so a visitor is not asked twice.
//   * Two equal buttons. 44px tap targets, safe area inset, z-index 890 (under the
//     app's sheets, same as the return banner).
//   * It is an unsolicited interruption, so it obeys the owner rule of ONE per visit
//     (lib/interruptionBudget.js): lib/reengagePushClient.offerFor asks canInterrupt()
//     before it is offered, and this component claims the budget when it shows. That
//     is also what keeps the planner's Santa offer (z-index 936, a bubble and a 104px
//     figure that would cover these buttons) from appearing in the same visit. If the
//     Santa offer is already on screen, or the budget is already spent, this renders
//     nothing and spends nothing.
//   * A fixed bottom dock (the Santa dock on holiday pages, z-index 930, 65px at 390
//     wide) would cover the card, so the card is lifted by the measured dock height.
//   * Escape, Not now and the close button are the same answer: no new ask for 21 days.
//     Escape counts only when focus (or the key event) is inside this card, so an Escape
//     that closes some other overlay (a planner sheet above it) is not an answer here.
//   * The title names what the ask is about: the plan, the Christmas hub or the guide.
// Copy rules: plain words, no dashes, no pressure, no countdowns, no claim of new.
import { useEffect, useRef, useState } from "react";
import { markPushAsked, reengageEvent } from "../../lib/reengageClient.js";
import { PROMPT_CTX_KEY, enableReengagePush, noteAskShown, pushMode, sessionStoreOf } from "../../lib/reengagePushClient.js";
import { claimInterruption } from "../../lib/interruptionBudget.js";

const T = { card: "#161B22", border: "#2D3748", text: "#F1F5F9", muted: "#94A3B8", accent: "#F97316" };
const DOCKS = ["[data-santa-dock]", ".wfp-so"];
const PLANNER_OFFER = "[data-wf-planner-santa-offer]";
const BAR = {
  position: "fixed", left: 12, right: 12, margin: "0 auto", maxWidth: 520, boxSizing: "border-box", zIndex: 890,
  background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, padding: "12px 52px 12px 14px",
  color: T.text, boxShadow: "0 10px 30px rgba(0,0,0,.45)", fontFamily: "var(--wf-sans, system-ui, sans-serif)",
};
const TITLE = { margin: 0, fontSize: 15, fontWeight: 800, lineHeight: "20px" };
const BODY = { margin: "2px 0 0", fontSize: 13, lineHeight: "18px", color: T.muted };
const ROW = { display: "flex", gap: 8, marginTop: 10 };
const BTN = { flex: 1, minHeight: 44, padding: "0 14px", borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxSizing: "border-box", whiteSpace: "nowrap", font: "inherit", fontSize: 14, fontWeight: 800 };
const PRIMARY = { ...BTN, background: T.accent, color: "#111827", border: `1px solid ${T.accent}` };
const SECONDARY = { ...BTN, background: "transparent", color: T.text, border: `1px solid ${T.border}` };
const CLOSE = { position: "absolute", top: 0, right: 0, width: 44, height: 44, background: "transparent", border: "none", color: T.muted, fontSize: 22, lineHeight: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" };

// How much of the bottom edge a fixed dock already covers, in px.
function dockLift(win) {
  try {
    let lift = 0;
    for (const sel of DOCKS) {
      const el = win.document.querySelector(sel);
      const r = el && el.getBoundingClientRect();
      if (r && r.height > 0) lift = Math.max(lift, Math.ceil(win.innerHeight - r.top));
    }
    return Math.max(0, Math.min(200, lift));
  } catch (e) { return 0; }
}

// The ask names what it is about. A plan: "this trip". A hub page: the Christmas hub, or the guide. Owner copy (contract 7.10).
function askTitle(kind, trigger) {
  if (kind !== "hub") return "Want a heads up about this trip?";
  const p = trigger && typeof trigger.path === "string" ? trigger.path : "";
  if (/^\/christmas-in-florida(?:\/|$)/.test(p)) return "Want a heads up about Christmas in Florida?";
  return "Want a heads up about this guide?";
}

export default function PushPrompt() {
  const [m, setM] = useState(null); // { mode, kind, trigger }
  const [phase, setPhase] = useState("ask"); // ask | busy | done | blocked | failed | gone
  const [lift, setLift] = useState(0);
  const shown = useRef(false);
  const card = useRef(null);

  useEffect(() => {
    if (shown.current) return;
    const h = window[PROMPT_CTX_KEY];
    const mode = pushMode(window);
    if (!h || !mode || (h.kind !== "itinerary" && h.kind !== "hub")) return;
    // Step aside for the planner's Santa offer, and spend the visit's one interruption (or show nothing).
    if (window.document.querySelector(PLANNER_OFFER)) return;
    if (!claimInterruption(sessionStoreOf(window), "push_prompt")) return;
    shown.current = true;
    noteAskShown(window);
    if (mode === "a2hs") reengageEvent(window, "reengage_a2hs_shown", { kind: h.kind, surface: "a2hs" });
    else reengageEvent(window, "reengage_push_ask_shown", { kind: h.kind, surface: "push" });
    setM({ mode, kind: h.kind, trigger: h.trigger || {} });
  }, []);

  // A dock can mount after this card, so measure again shortly, and on resize.
  useEffect(() => {
    if (!m) return undefined;
    const measure = () => {
      if (window.document.querySelector(PLANNER_OFFER)) { setPhase("gone"); return; }
      setLift(dockLift(window));
    };
    measure();
    const timers = [setTimeout(measure, 700), setTimeout(measure, 2500)];
    window.addEventListener("resize", measure);
    return () => { timers.forEach(clearTimeout); window.removeEventListener("resize", measure); };
  }, [m]);

  // Escape is the same answer as Not now (and as Got it on the iPhone helper), while the ask is open
  // and the key belongs to this card: the event target or the focused element is inside it.
  useEffect(() => {
    if (!m || phase !== "ask") return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      const el = card.current;
      const doc = window.document;
      const inside = !!el && ((e.target && typeof e.target.nodeType === "number" && el.contains(e.target)) || (!!doc.activeElement && el.contains(doc.activeElement)));
      if (!inside) return;
      markPushAsked(window);
      if (m.mode === "push") reengageEvent(window, "reengage_push_ask_no", { kind: m.kind, surface: "push" });
      setPhase("gone");
    };
    window.document.addEventListener("keydown", onKey);
    return () => window.document.removeEventListener("keydown", onKey);
  }, [m, phase]);

  if (!m || phase === "gone") return null;
  const { mode, kind, trigger } = m;

  const no = () => {
    markPushAsked(window);
    if (mode === "push") reengageEvent(window, "reengage_push_ask_no", { kind, surface: "push" });
    setPhase("gone");
  };
  const yes = async () => {
    reengageEvent(window, "reengage_push_ask_yes", { kind, surface: "push" });
    setPhase("busy");
    const r = await enableReengagePush(window, { kind, trigger });
    setPhase(r.ok ? "done" : (r.code === "denied" || r.code === "dismissed") ? "blocked" : "failed");
  };

  let title; let body; let buttons;
  if (phase === "done" || phase === "blocked" || phase === "failed") {
    title = phase === "done" ? "Done. We will send at most 2 short notes a week."
      : phase === "blocked" ? "No problem. You can change this in your browser settings."
        : "That did not work. Please try again later.";
    buttons = <div style={ROW}><button type="button" style={PRIMARY} onClick={() => setPhase("gone")}>OK</button></div>;
  } else if (mode === "a2hs") {
    title = "Reminders need one step on iPhone";
    body = "Tap Share, then Add to Home Screen.";
    buttons = <div style={ROW}><button type="button" style={PRIMARY} onClick={no}>Got it</button></div>;
  } else {
    title = askTitle(kind, trigger);
    body = "We send at most 2 short notes a week, never at night. Turn them off anytime in your browser settings.";
    buttons = (
      <div style={ROW}>
        <button type="button" style={PRIMARY} disabled={phase === "busy"} onClick={yes}>Yes, remind me</button>
        <button type="button" style={SECONDARY} disabled={phase === "busy"} onClick={no}>Not now</button>
      </div>
    );
  }

  return (
    <div ref={card} role="region" aria-label="Reminders" aria-live="polite" data-reengage-push={mode} data-dock-lift={lift} style={{ ...BAR, bottom: `calc(12px + ${lift}px + env(safe-area-inset-bottom, 0px))` }}>
      <p style={TITLE}>{title}</p>
      {body ? <p style={BODY}>{body}</p> : null}
      {buttons}
      <button type="button" aria-label="Close" style={CLOSE} onClick={phase === "ask" ? no : () => setPhase("gone")}><span aria-hidden="true">×</span></button>
    </div>
  );
}
