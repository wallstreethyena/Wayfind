"use client";
// "Reserve a table" sheet. Lazy: lib/reserveClient.js openReserveSheet() imports
// this file on the first tap, so none of it ships in the card's bundle.
//
// Composes the site's own pieces: sheetBg / sheet / Grabber / useDialogFocus (focus
// trap + Escape) and the C colour tokens from kit.js, the same bordered 14px
// buttons the card CTA uses, and a plain chat look (assistant bubble on C.card,
// user bubble in the accent). No new visual language.
//
// Truth rule: nothing here ever says a table is booked until the server says
// status === "confirmed".
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { C, sheetBg, sheet, Grabber, useDialogFocus } from "./kit";
import {
  RESERVE_LIMITS, reserveChat, sendReserveRequest, myReserveRequests, reserveDateRange, reserveTimeSlots,
  timeLabel, summaryLine, validateDraft, draftIsSendable,
} from "../../lib/reserveApi.js";
import { trackReserve } from "../../lib/reserveOpen.js";
import { siteTodayStr } from "../../lib/siteTime.js";
import { showLikeFeedback } from "../../lib/cardActions";

const FIRST_LINE = "How many people, and what day and time?";
const POLL_MS = 20000;

const mainBtn = { width: "100%", minHeight: 48, padding: "0 16px", background: C.accent, border: "none", borderRadius: 12, color: "#0D1117", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" };
const quietBtn = { width: "100%", minHeight: 44, padding: "0 16px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 12, color: C.light, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const field = { width: "100%", minHeight: 44, padding: "0 12px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 16, fontFamily: "inherit", boxSizing: "border-box" };
const label = { display: "block", fontSize: 13, fontWeight: 700, color: C.light, margin: "12px 0 6px" };
const stepBtn = { width: 44, height: 44, borderRadius: 12, background: C.card, border: `1px solid ${C.border}`, color: C.text, fontSize: 20, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };

function statusCopy(status, name) {
  if (status === "pending") return { title: `Waiting for ${name} to answer`, tone: C.light };
  if (status === "confirmed") return { title: "You're booked.", tone: C.green };
  if (status === "declined") return { title: `${name} can't fit that time. Try another time?`, tone: C.light };
  if (status === "expired") return { title: "No answer yet. You may want to call them.", tone: C.light };
  if (status === "cancelled") return { title: "This request was cancelled.", tone: C.light };
  return { title: "", tone: C.light };
}

function Bubble({ role, children }) {
  const mine = role === "user";
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", margin: "0 0 8px" }}>
      <div style={{ maxWidth: "86%", padding: "9px 12px", borderRadius: 14, fontSize: 15, lineHeight: 1.4, background: mine ? C.accent : C.card, color: mine ? "#0D1117" : C.text, border: mine ? "none" : `1px solid ${C.border}`, fontWeight: mine ? 700 : 500, overflowWrap: "anywhere" }}>{children}</div>
    </div>
  );
}

function Summary({ draft }) {
  return (
    <div data-reserve-summary="1" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px", margin: "4px 0 12px" }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.text, lineHeight: 1.4 }}>{summaryLine(draft)}</div>
      {draft.note ? <div style={{ fontSize: 13, color: C.muted, marginTop: 6, overflowWrap: "anywhere" }}>Note: {draft.note}</div> : null}
    </div>
  );
}

export function ReserveSheet({ place, surface, onClose }) {
  const name = place.name || "this restaurant";
  const dlgRef = useRef(null);
  useDialogFocus(true, dlgRef, onClose);
  // boot | signin | signin-wait | status | chat | form | summary | sent
  const [phase, setPhase] = useState("boot");
  const [msgs, setMsgs] = useState([{ role: "assistant", content: FIRST_LINE, local: true }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ partySize: 2, date: "", time: "19:00", guestName: "", note: "" });
  const [formNote, setFormNote] = useState("");
  const [usedForm, setUsedForm] = useState(false);
  const [error, setError] = useState("");
  const [request, setRequest] = useState(null); // { id, status, partySize, date, time }
  const [justSent, setJustSent] = useState(false);
  const [demoUrl, setDemoUrl] = useState("");
  const [unhandledSignIn, setUnhandledSignIn] = useState(false);
  const alive = useRef(true);
  const logRef = useRef(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const boot = useCallback(async () => {
    let user = null;
    try {
      const m = await import("../../lib/supabase");
      const { data } = await m.supabase.auth.getSession();
      user = data && data.session && data.session.user;
    } catch (e) {}
    if (!alive.current) return;
    if (!user) {
      // The site's own sign in sheet lives in the home shell. A portable surface opens it the way a visitor
      // does: the shell's header "Sign in" button (.wf-signin-button, rendered only while signed out). The
      // shell is not edited for this, and no second auth prompt exists. If this surface has no shell, say so plainly.
      const door = document.querySelector(".wf-signin-button");
      const detail = { handled: !!door };
      if (door) { try { door.click(); showLikeFeedback("Sign in to request a table"); } catch (e) { detail.handled = false; } }
      setUnhandledSignIn(!detail.handled);
      setPhase(detail.handled ? "signin-wait" : "signin");
      return;
    }
    const first = user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name);
    if (first) setDraft((d) => (d.guestName ? d : { ...d, guestName: String(first).split(/\s+/)[0].slice(0, RESERVE_LIMITS.nameMax) }));
    const r = await myReserveRequests(place.id);
    if (!alive.current) return;
    const latest = r && r.ok && Array.isArray(r.requests) ? r.requests.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] : null;
    // A confirmed table whose day has passed is history, not news.
    if (latest && !(latest.status === "confirmed" && latest.date < siteTodayStr())) { setRequest(latest); setPhase("status"); }
    else setPhase("chat");
  }, [place.id]);
  useEffect(() => { boot(); }, [boot]);

  // While waiting on the sign in sheet, continue the moment a session appears. Give up after 10 minutes.
  useEffect(() => {
    if (phase !== "signin-wait") return undefined;
    let sub = null; let timer = null;
    import("../../lib/supabase").then((m) => {
      if (!alive.current || !m.supabase) return;
      const res = m.supabase.auth.onAuthStateChange((evt, session) => { if (session && session.user) { setPhase("boot"); boot(); } });
      sub = res && res.data && res.data.subscription;
    }).catch(() => {});
    timer = setTimeout(() => { if (alive.current) onClose(); }, 10 * 60 * 1000);
    return () => { try { sub && sub.unsubscribe(); } catch (e) {} clearTimeout(timer); };
  }, [phase, boot, onClose]);

  // Poll every 20s while pending, the sheet is open and the tab is visible. Stops when the status changes.
  useEffect(() => {
    if (!request || request.status !== "pending" || (phase !== "sent" && phase !== "status")) return undefined;
    let stop = false;
    const poll = async () => {
      if (stop || document.hidden) return;
      const r = await myReserveRequests(place.id);
      if (stop || !alive.current || !r || !r.ok || !Array.isArray(r.requests)) return;
      const hit = r.requests.find((x) => x.id === request.id);
      if (hit && hit.status !== request.status) {
        trackReserve("reserve_request_result", { place_id: place.id, status: hit.status });
        setRequest(hit);
      }
    };
    const t = setInterval(poll, POLL_MS);
    const vis = () => { if (!document.hidden) poll(); };
    document.addEventListener("visibilitychange", vis);
    return () => { stop = true; clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [request, phase, place.id]);

  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs, busy]);

  function toForm(note) { setFormNote(note || ""); setError(""); setPhase("form"); }
  function restart() { setMsgs([{ role: "assistant", content: FIRST_LINE, local: true }]); setInput(""); setError(""); setUsedForm(false); setJustSent(false); setDemoUrl(""); setRequest(null); setPhase("chat"); }

  async function sendChat(e) {
    e && e.preventDefault();
    const text = input.trim().slice(0, 500);
    if (!text || busy) return;
    const next = msgs.concat([{ role: "user", content: text }]);
    setMsgs(next); setInput(""); setBusy(true); setError("");
    // The local greeting is not sent: the server only needs the guest's own words and its own replies.
    const r = await reserveChat(place.id, next.filter((m) => !m.local));
    if (!alive.current) return;
    setBusy(false);
    if (r.status === 401) { boot(); return; }
    if (r.ok && r.fallback === "form") { setUsedForm(true); toForm("Chat is not available right now. Fill this in instead."); return; }
    if (!r.ok || typeof r.reply !== "string") { setUsedForm(true); toForm("Chat is not available right now. Fill this in instead."); return; }
    const d = r.draft || {};
    const merged = { partySize: d.partySize || draft.partySize, date: d.date || draft.date, time: d.time || draft.time, guestName: d.guestName || draft.guestName, note: d.note || "" };
    setDraft(merged);
    setMsgs(next.concat([{ role: "assistant", content: r.reply }]));
    if (r.complete && draftIsSendable(merged)) setPhase("summary");
  }

  function submitForm(e) {
    e.preventDefault();
    const clean = { ...draft, guestName: String(draft.guestName || "").trim(), note: String(draft.note || "").trim() };
    const bad = validateDraft(clean);
    if (bad) { setError(bad); return; }
    setDraft(clean); setUsedForm(true); setError(""); setPhase("summary");
  }

  async function send() {
    if (busy) return;
    const bad = validateDraft(draft);
    if (bad) { toForm(bad); return; }
    setBusy(true); setError("");
    const body = { placeId: place.id, partySize: draft.partySize, date: draft.date, time: draft.time, guestName: String(draft.guestName).trim() };
    if (draft.note && String(draft.note).trim()) body.note = String(draft.note).trim();
    const r = await sendReserveRequest(body);
    if (!alive.current) return;
    setBusy(false);
    if (r.status === 401) { boot(); return; }
    if (!r.ok || !r.request) { setError(r.message || "We could not send that. Please try again."); return; }
    trackReserve("reserve_request_sent", { place_id: place.id, party_size: draft.partySize, used_fallback_form: usedForm });
    setRequest(r.request); setJustSent(true);
    setDemoUrl(typeof r.demoRespondUrl === "string" && /^(\/|https:\/\/)/.test(r.demoRespondUrl) ? r.demoRespondUrl : "");
    setPhase("sent");
  }

  const range = reserveDateRange();
  const slots = reserveTimeSlots();
  const setD = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const sc = request ? statusCopy(request.status, name) : null;
  const hidden = phase === "boot" || phase === "signin-wait";
  if (hidden) return null;

  const dialog = (
    <div style={sheetBg} onClick={onClose} data-reserve-backdrop="1">
      <div ref={dlgRef} role="dialog" aria-modal="true" aria-labelledby="wf-reserve-title" tabIndex={-1} onClick={(e) => e.stopPropagation()}
        style={{ ...sheet, outline: "none", position: "relative", padding: "6px 16px calc(24px + env(safe-area-inset-bottom, 0px))", overscrollBehaviorY: "contain" }}>
        <Grabber />
        <button type="button" onClick={onClose} aria-label="Close" style={{ position: "absolute", top: 10, right: 10, width: 44, height: 44, borderRadius: 999, background: C.card, border: `1px solid ${C.border}`, color: C.text, fontSize: 17, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>{"✕"}</button>
        <div id="wf-reserve-title" style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: "4px 52px 2px 0", lineHeight: 1.25 }}>Reserve a table</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 12, overflowWrap: "anywhere" }}>{name}</div>

        {phase === "signin" ? (
          <div>
            <div style={{ fontSize: 15, color: C.text, marginBottom: 12 }}>Sign in to request a table</div>
            {unhandledSignIn ? <a href="/" style={{ ...mainBtn, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", boxSizing: "border-box" }}>Open Wayfind to sign in</a> : null}
          </div>
        ) : null}

        {phase === "status" && request ? (
          <div>
            <div data-reserve-status={request.status} style={{ fontSize: 16, fontWeight: 800, color: sc.tone, margin: "0 0 10px", lineHeight: 1.35 }}>{sc.title}</div>
            <Summary draft={{ partySize: request.partySize, date: request.date, time: request.time, guestName: "" , note: ""}} />
            <div style={{ display: "grid", gap: 8 }}>
              {request.status === "declined" || request.status === "expired" || request.status === "cancelled" ? <button type="button" style={mainBtn} onClick={restart}>{request.status === "declined" ? "Try another time" : "Make a new request"}</button> : <button type="button" style={quietBtn} onClick={restart}>Request a different time</button>}
            </div>
          </div>
        ) : null}

        {phase === "chat" ? (
          <div>
            <div ref={logRef} role="log" aria-live="polite" style={{ maxHeight: "40dvh", overflowY: "auto", padding: "2px 0 4px" }}>
              {msgs.map((m, i) => <Bubble key={i} role={m.role}>{m.content}</Bubble>)}
              {busy ? <Bubble role="assistant">{"…"}</Bubble> : null}
            </div>
            <form onSubmit={sendChat} style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <label htmlFor="wf-reserve-msg" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Your message</label>
              <input id="wf-reserve-msg" value={input} onChange={(e) => setInput(e.target.value)} maxLength={500} autoComplete="off" placeholder="Example: 4 people Saturday at 7" style={{ ...field, flex: 1, minWidth: 0 }} />
              <button type="submit" disabled={busy || !input.trim()} style={{ ...mainBtn, width: "auto", padding: "0 16px", opacity: busy || !input.trim() ? 0.6 : 1 }}>Send</button>
            </form>
            <button type="button" onClick={() => { setUsedForm(true); toForm(""); }} style={{ ...quietBtn, marginTop: 10, border: "none", color: C.muted, minHeight: 44 }}>Use a form instead</button>
          </div>
        ) : null}

        {phase === "form" ? (
          <form onSubmit={submitForm} noValidate>
            {formNote ? <div style={{ fontSize: 14, color: C.light, marginBottom: 4 }}>{formNote}</div> : null}
            <span style={label} id="wf-reserve-party-l">People</span>
            <div role="group" aria-labelledby="wf-reserve-party-l" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button type="button" aria-label="One fewer person" style={stepBtn} onClick={() => setDraft((d) => ({ ...d, partySize: Math.max(1, (d.partySize || 2) - 1) }))}>{"−"}</button>
              <div aria-live="polite" style={{ minWidth: 36, textAlign: "center", fontSize: 18, fontWeight: 800, color: C.text }}>{draft.partySize}</div>
              <button type="button" aria-label="One more person" style={stepBtn} onClick={() => setDraft((d) => ({ ...d, partySize: Math.min(RESERVE_LIMITS.maxParty, (d.partySize || 2) + 1) }))}>+</button>
            </div>
            <label htmlFor="wf-reserve-date" style={label}>Day</label>
            <input id="wf-reserve-date" type="date" min={range.min} max={range.max} value={draft.date} onChange={setD("date")} style={field} />
            <label htmlFor="wf-reserve-time" style={label}>Time</label>
            <select id="wf-reserve-time" value={draft.time} onChange={setD("time")} style={field}>{slots.map((s) => <option key={s} value={s}>{timeLabel(s)}</option>)}</select>
            <label htmlFor="wf-reserve-name" style={label}>Name for the table</label>
            <input id="wf-reserve-name" value={draft.guestName} onChange={setD("guestName")} maxLength={RESERVE_LIMITS.nameMax} autoComplete="given-name" style={field} />
            <label htmlFor="wf-reserve-note" style={label}>Note (optional)</label>
            <textarea id="wf-reserve-note" value={draft.note} onChange={setD("note")} maxLength={RESERVE_LIMITS.noteMax} rows={2} style={{ ...field, padding: "10px 12px", resize: "none" }} />
            {error ? <div role="alert" style={{ color: "#FCA5A5", fontSize: 14, marginTop: 10 }}>{error}</div> : null}
            <button type="submit" style={{ ...mainBtn, marginTop: 14 }}>Review request</button>
          </form>
        ) : null}

        {phase === "summary" ? (
          <div>
            <Summary draft={draft} />
            {error ? <div role="alert" style={{ color: "#FCA5A5", fontSize: 14, marginBottom: 10 }}>{error}</div> : null}
            <div style={{ display: "grid", gap: 8 }}>
              <button type="button" style={{ ...mainBtn, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={send}>{busy ? "Sending…" : "Send request"}</button>
              <button type="button" style={quietBtn} onClick={() => toForm("")}>Change something</button>
            </div>
          </div>
        ) : null}

        {phase === "sent" && request ? (
          <div>
            {justSent && request.status === "pending" ? <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 6 }}>{`Request sent. ${name} will answer here.`}</div> : null}
            <div data-reserve-status={request.status} aria-live="polite" style={{ fontSize: justSent && request.status === "pending" ? 14 : 16, fontWeight: justSent && request.status === "pending" ? 600 : 800, color: sc.tone, margin: "0 0 10px", lineHeight: 1.35 }}>{sc.title}</div>
            <Summary draft={{ ...draft, partySize: request.partySize || draft.partySize, date: request.date || draft.date, time: request.time || draft.time }} />
            {request.status === "declined" || request.status === "expired" ? <button type="button" style={mainBtn} onClick={restart}>Try another time</button> : null}
            {demoUrl ? <a href={demoUrl} target="_blank" rel="noopener noreferrer" style={{ display: "block", textAlign: "center", marginTop: 12, fontSize: 12, color: C.muted, textDecoration: "underline", minHeight: 44, lineHeight: "44px" }}>Demo only: answer as the restaurant</a> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
  return createPortal(dialog, document.body);
}

let host = null;
export function showReserveSheet(place, opts) {
  if (typeof document === "undefined" || !place || !place.id) return;
  if (host) { try { host.root.unmount(); } catch (e) {} try { host.el.remove(); } catch (e) {} host = null; }
  const el = document.createElement("div");
  el.setAttribute("data-reserve-host", "1");
  document.body.appendChild(el);
  const root = createRoot(el);
  host = { el, root };
  const close = () => {
    if (!host || host.el !== el) return;
    try { root.unmount(); } catch (e) {}
    try { el.remove(); } catch (e) {}
    host = null;
  };
  root.render(<ReserveSheet place={place} surface={(opts && opts.surface) || "place_card"} onClose={close} />);
}

export default ReserveSheet;
