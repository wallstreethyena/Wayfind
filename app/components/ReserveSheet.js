"use client";
// "Reserve a table" sheet. Lazy: lib/reserveClient.js openReserveSheet() imports
// this file on the first tap, so none of it ships in the card's bundle.
//
// Composes the site's own pieces: sheetBg / sheet / Grabber / useDialogFocus (focus
// trap + Escape) and the C colour tokens from kit.js, the same bordered 14px
// buttons the card CTA uses, and a plain chat look (assistant bubble on C.card,
// user bubble in the accent). No new visual language.
//
// Truth rule: nothing here ever says "You're booked" unless the server answered 201 with a
// saved booking (or a saved confirmed booking came back from /api/reserve/mine).
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { C, sheetBg, sheet, Grabber, useDialogFocus } from "./kit";
import {
  RESERVE_LIMITS, reserveChat, reserveSlots, bookTable, myBookings, cancelBooking, answerProposal, reserveDateRange,
  timeLabel, dateLabel, summaryLine, validateDraft, cleanPhoneInput, newIdempotencyKey, downloadIcs,
} from "../../lib/reserveClientApi.js";
import { trackReserve } from "../../lib/reserveOpen.js";
import { siteTodayStr } from "../../lib/siteTime.js";
import { showLikeFeedback } from "../../lib/cardActions";

const FIRST_LINE = "How many people, and what day and time?";
const EMPTY_DRAFT = { partySize: null, date: null, time: null, guestName: null, note: null };

const mainBtn = { width: "100%", minHeight: 48, padding: "0 16px", background: C.accent, border: "none", borderRadius: 12, color: "#0D1117", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" };
const quietBtn = { width: "100%", minHeight: 44, padding: "0 16px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 12, color: C.light, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const field = { width: "100%", minHeight: 44, padding: "0 12px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, color: C.text, fontSize: 16, fontFamily: "inherit", boxSizing: "border-box" };
const label = { display: "block", fontSize: 13, fontWeight: 700, color: C.light, margin: "12px 0 6px" };
const stepBtn = { width: 44, height: 44, borderRadius: 12, background: C.card, border: `1px solid ${C.border}`, color: C.text, fontSize: 20, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const chip = { minHeight: 44, padding: "0 16px", background: C.card, border: `1px solid ${C.accent}`, borderRadius: 999, color: C.text, fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" };
// The action bar stays at the bottom of the scrolling sheet, so the keyboard never hides the Book button.
const actionBar = { position: "sticky", bottom: 0, background: C.panel, padding: "10px 0 2px", display: "grid", gap: 8, zIndex: 1 };
const keepVisible = (e) => { try { const el = e.target; setTimeout(() => el && el.scrollIntoView && el.scrollIntoView({ block: "center", behavior: "smooth" }), 250); } catch (er) {} };

function Bubble({ role, children }) {
  const mine = role === "user";
  return (
    <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", margin: "0 0 8px" }}>
      <div style={{ maxWidth: "86%", padding: "9px 12px", borderRadius: 14, fontSize: 15, lineHeight: 1.4, background: mine ? C.accent : C.card, color: mine ? "#0D1117" : C.text, border: mine ? "none" : `1px solid ${C.border}`, fontWeight: mine ? 700 : 500, overflowWrap: "anywhere" }}>{children}</div>
    </div>
  );
}

function Summary({ draft, openAt }) {
  return (
    <div data-reserve-summary="1" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px", margin: "4px 0 12px" }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.text, lineHeight: 1.4 }}>{summaryLine(draft)}</div>
      {openAt ? <div data-reserve-open="1" style={{ fontSize: 14, fontWeight: 700, color: C.green, marginTop: 6 }}>Open at {timeLabel(openAt)}</div> : null}
      {draft.note ? <div style={{ fontSize: 13, color: C.muted, marginTop: 6, overflowWrap: "anywhere" }}>Note: {draft.note}</div> : null}
    </div>
  );
}

export function ReserveSheet({ place, surface, onClose }) {
  const name = place.name || "this restaurant";
  const dlgRef = useRef(null);
  useDialogFocus(true, dlgRef, onClose);
  // boot | signin | signin-wait | status | chat | form | summary | full | booked
  const [phase, setPhase] = useState("boot");
  const [msgs, setMsgs] = useState([{ role: "assistant", content: FIRST_LINE, local: true }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ partySize: 2, date: "", time: "", guestName: "", note: "" });
  const [chatDraft, setChatDraft] = useState(EMPTY_DRAFT);
  const [verifiedTime, setVerifiedTime] = useState(null); // the open time the server confirmed for this summary
  const [formNote, setFormNote] = useState("");
  const [usedForm, setUsedForm] = useState(false);
  const [error, setError] = useState("");
  const [booking, setBooking] = useState(null); // the booking as the server saved it
  const [alternatives, setAlternatives] = useState([]);
  const [slots, setSlots] = useState({ state: "idle", list: [] });
  const [maxParty, setMaxParty] = useState(RESERVE_LIMITS.maxParty);
  const [restaurantPhone, setRestaurantPhone] = useState("");
  const [sharePhone, setSharePhone] = useState(false);
  const [phone, setPhone] = useState("");
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [unhandledSignIn, setUnhandledSignIn] = useState(false);
  const alive = useRef(true);
  const logRef = useRef(null);
  const idemKey = useRef("");
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
      if (door) { try { door.click(); showLikeFeedback("Sign in to book a table"); } catch (e) { detail.handled = false; } }
      setUnhandledSignIn(!detail.handled);
      setPhase(detail.handled ? "signin-wait" : "signin");
      return;
    }
    const first = user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name);
    if (first) setDraft((d) => (d.guestName ? d : { ...d, guestName: String(first).split(/\s+/)[0].slice(0, RESERVE_LIMITS.nameMax) }));
    const r = await myBookings(place.id);
    if (!alive.current) return;
    const live = r && r.ok && Array.isArray(r.bookings) ? r.bookings.find((b) => (b.status === "confirmed" || b.status === "proposed") && b.date >= siteTodayStr()) : null;
    if (live) { setBooking(live); if (live.restaurantPhone) setRestaurantPhone(live.restaurantPhone); setPhase("status"); }
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

  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs, busy]);

  // Form mode: only REAL open times are offered, from /api/reserve/slots for this day and party.
  useEffect(() => {
    if (phase !== "form" || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date || "") || !draft.partySize) { return undefined; }
    let stop = false;
    setSlots({ state: "loading", list: [] });
    reserveSlots(place.id, draft.date, draft.partySize).then((r) => {
      if (stop || !alive.current) return;
      if (r && r.ok && Array.isArray(r.slots)) {
        setSlots({ state: "ready", list: r.slots });
        if (r.phone) setRestaurantPhone(r.phone);
        if (Number.isInteger(r.maxParty)) setMaxParty(r.maxParty);
        setDraft((d) => (d.time && !r.slots.includes(d.time) ? { ...d, time: "" } : d));
      } else setSlots({ state: "error", list: [] });
    });
    return () => { stop = true; };
  }, [phase, draft.date, draft.partySize, place.id]);

  function toForm(note, from) {
    if (from) setDraft((d) => ({ ...d, partySize: from.partySize || d.partySize || 2, date: from.date || d.date, time: from.time || "", note: from.note || d.note }));
    setFormNote(note || ""); setError(""); setPhase("form");
  }
  function toSummary(time) { idemKey.current = newIdempotencyKey(); setVerifiedTime(time); setError(""); setPhase("summary"); }
  function restart() {
    setMsgs([{ role: "assistant", content: FIRST_LINE, local: true }]); setInput(""); setError(""); setUsedForm(false); setBooking(null);
    setChatDraft(EMPTY_DRAFT); setAlternatives([]); setConfirmingCancel(false); setPhase("chat");
  }

  async function sendChat(e) {
    e && e.preventDefault();
    const text = input.trim().slice(0, 500);
    if (!text || busy) return;
    const next = msgs.concat([{ role: "user", content: text }]);
    setMsgs(next); setInput(""); setBusy(true); setError("");
    // The local greeting is not sent: the server only needs the guest's own words and its own replies.
    const r = await reserveChat(place.id, next.filter((m) => !m.local), chatDraft);
    if (!alive.current) return;
    setBusy(false);
    if (r.status === 401) { boot(); return; }
    if (!r.ok || r.fallback === "form" || typeof r.reply !== "string") { setUsedForm(true); toForm("Chat is not available right now. Fill this in instead.", chatDraft); return; }
    // The server draft is the whole truth: a time it dropped (taken) must not come back from an old draft.
    const d = r.draft || EMPTY_DRAFT;
    setChatDraft(d);
    setMsgs(next.concat([{ role: "assistant", content: r.reply }]));
    if (r.complete && r.verified && d.time) {
      setDraft((cur) => ({ ...cur, partySize: d.partySize, date: d.date, time: d.time, guestName: d.guestName || cur.guestName, note: d.note || "" }));
      toSummary(d.time);
    }
  }

  function submitForm(e) {
    e.preventDefault();
    const clean = { ...draft, guestName: String(draft.guestName || "").trim(), note: String(draft.note || "").trim() };
    const bad = validateDraft(clean, new Date(), maxParty) || (slots.list.includes(clean.time) ? null : "Pick one of the open times.");
    if (bad) { setError(bad); return; }
    setDraft(clean); setUsedForm(true); toSummary(clean.time);
  }

  // Book with the key made for this summary. Retrying the same summary reuses the same key.
  async function book(d, key) {
    if (busy) return;
    const bad = validateDraft(d, new Date(), maxParty);
    if (bad) { toForm(bad, d); return; }
    let phoneOut = null;
    if (sharePhone) {
      phoneOut = cleanPhoneInput(phone);
      if (!phoneOut) { setError("Add a phone number with 10 digits, or turn off sharing your phone."); return; }
    }
    setBusy(true); setError("");
    const body = { placeId: place.id, partySize: d.partySize, date: d.date, time: d.time, guestName: String(d.guestName).trim(), idempotencyKey: key };
    if (d.note && String(d.note).trim()) body.note = String(d.note).trim();
    if (sharePhone) { body.phone = phoneOut; body.phoneConsent = true; }
    const r = await bookTable(body);
    if (!alive.current) return;
    setBusy(false);
    if (r.status === 401) { boot(); return; }
    if (r.status === 201 && r.ok && r.booking && r.booking.confirmationCode) {
      trackReserve("reserve_booked", { place_id: place.id, party_size: d.partySize, used_fallback_form: usedForm, shared_phone: sharePhone });
      setBooking(r.booking); if (r.booking.restaurantPhone) setRestaurantPhone(r.booking.restaurantPhone);
      setConfirmingCancel(false); setPhase("booked");
      return;
    }
    if (r.status === 409 && r.error === "SLOT_FULL") {
      setDraft(d); setAlternatives(Array.isArray(r.alternatives) ? r.alternatives.slice(0, 3) : []); setPhase("full");
      return;
    }
    // Closed, too soon, outside the window: back to the form with the rest of the draft kept.
    if (r.error === "CLOSED" || r.error === "TOO_SOON" || r.error === "OUT_OF_WINDOW") { toForm(r.message || "That time will not work. Pick another.", d); return; }
    // Not confirmed (network or server): stay here, keep the key, so a retry can never book twice.
    setError(r.message || "We could not confirm your table. Tap Book table again.");
  }
  const bookNow = () => book({ ...draft, time: verifiedTime || draft.time }, idemKey.current);
  const bookAlternative = (t) => { const d = { ...draft, time: t }; setDraft(d); idemKey.current = newIdempotencyKey(); setVerifiedTime(t); setPhase("summary"); book(d, idemKey.current); };

  async function doCancel() {
    if (busy || !booking) return;
    setBusy(true); setError("");
    const r = await cancelBooking(booking.id);
    if (!alive.current) return;
    setBusy(false);
    if (r.status === 401) { boot(); return; }
    if (r.ok && r.booking) { trackReserve("reserve_cancelled", { place_id: place.id }); setBooking(r.booking); setConfirmingCancel(false); return; }
    setError(r.message || "We could not cancel that. Please try again, or call the restaurant.");
  }
  async function doAnswer(accept) {
    if (busy || !booking) return;
    setBusy(true); setError("");
    const r = await answerProposal(booking.id, accept);
    if (!alive.current) return;
    setBusy(false);
    if (r.status === 401) { boot(); return; }
    if (r.ok && r.booking) { trackReserve("reserve_proposal", { place_id: place.id, accepted: accept }); setBooking(r.booking); return; }
    if (r.error === "SLOT_FULL" && r.booking) { setBooking(r.booking); }
    setError(r.message || "We could not save your answer. Please try again.");
  }

  const range = reserveDateRange();
  const setD = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const hidden = phase === "boot" || phase === "signin-wait";
  if (hidden) return null;
  const callLine = restaurantPhone ? `Running late? Call ${restaurantPhone}.` : "Running late? Call the restaurant.";

  // One view for a saved booking: confirmed, proposed, or cancelled. Every word comes from the server's row.
  const bookingView = () => {
    const b = booking;
    const view = { partySize: b.partySize, date: b.date, time: b.time, guestName: "", note: "" };
    if (b.status === "cancelled") {
      return (
        <div>
          <div data-reserve-status="cancelled" aria-live="polite" style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: "0 0 10px" }}>Your table is cancelled.</div>
          <Summary draft={view} />
          <button type="button" style={mainBtn} onClick={restart}>Find another time</button>
        </div>
      );
    }
    if (b.status === "proposed") {
      return (
        <div>
          <div data-reserve-status="proposed" aria-live="polite" style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: "0 0 10px", lineHeight: 1.35 }}>{name} asked to move your table to {timeLabel(b.proposedTime)}</div>
          <Summary draft={view} />
          <div style={{ fontSize: 14, color: C.light, marginBottom: 6 }}>New time: {dateLabel(b.proposedDate)} {"·"} {timeLabel(b.proposedTime)}</div>
          {error ? <div role="alert" style={{ color: "#FCA5A5", fontSize: 14, margin: "6px 0" }}>{error}</div> : null}
          <div style={actionBar}>
            <button type="button" style={{ ...mainBtn, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={() => doAnswer(true)}>Accept new time</button>
            <button type="button" style={quietBtn} disabled={busy} onClick={() => doAnswer(false)}>Keep looking</button>
            <div style={{ fontSize: 12, color: C.muted, textAlign: "center" }}>Keep looking cancels your current table.</div>
          </div>
        </div>
      );
    }
    return (
      <div>
        <div data-reserve-status="confirmed" aria-live="polite" style={{ fontSize: 20, fontWeight: 800, color: C.green, margin: "0 0 8px" }}>You're booked.</div>
        <div data-reserve-code="1" style={{ fontSize: 14, color: C.light, marginBottom: 8 }}>Confirmation code <strong style={{ color: C.text, letterSpacing: 1.5, fontSize: 18 }}>{b.confirmationCode}</strong></div>
        <Summary draft={view} />
        <div style={{ fontSize: 14, color: C.light, margin: "0 0 10px", overflowWrap: "anywhere" }}>{callLine}</div>
        {error ? <div role="alert" style={{ color: "#FCA5A5", fontSize: 14, margin: "6px 0" }}>{error}</div> : null}
        {confirmingCancel ? (
          <div style={actionBar}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Cancel this table?</div>
            <button type="button" style={{ ...mainBtn, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={doCancel}>Yes, cancel it</button>
            <button type="button" style={quietBtn} disabled={busy} onClick={() => setConfirmingCancel(false)}>Keep my table</button>
          </div>
        ) : (
          <div style={actionBar}>
            <button type="button" style={mainBtn} onClick={() => downloadIcs(b)}>Add to calendar</button>
            <button type="button" style={quietBtn} onClick={() => { setError(""); setConfirmingCancel(true); }}>Cancel booking</button>
          </div>
        )}
      </div>
    );
  };

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
            <div style={{ fontSize: 15, color: C.text, marginBottom: 12 }}>Sign in to book a table</div>
            {unhandledSignIn ? <a href="/" style={{ ...mainBtn, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", boxSizing: "border-box" }}>Open Wayfind to sign in</a> : null}
          </div>
        ) : null}

        {(phase === "status" || phase === "booked") && booking ? bookingView() : null}

        {phase === "chat" ? (
          <div>
            <div ref={logRef} role="log" aria-live="polite" style={{ maxHeight: "40dvh", overflowY: "auto", padding: "2px 0 4px" }}>
              {msgs.map((m, i) => <Bubble key={i} role={m.role}>{m.content}</Bubble>)}
              {busy ? <Bubble role="assistant">{"…"}</Bubble> : null}
            </div>
            <form onSubmit={sendChat} style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <label htmlFor="wf-reserve-msg" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Your message</label>
              <input id="wf-reserve-msg" value={input} onChange={(e) => setInput(e.target.value)} onFocus={keepVisible} maxLength={500} autoComplete="off" placeholder="Example: 4 people Saturday at 7" style={{ ...field, flex: 1, minWidth: 0 }} />
              <button type="submit" disabled={busy || !input.trim()} style={{ ...mainBtn, width: "auto", padding: "0 16px", opacity: busy || !input.trim() ? 0.6 : 1 }}>Send</button>
            </form>
            <button type="button" onClick={() => { setUsedForm(true); toForm("", chatDraft); }} style={{ ...quietBtn, marginTop: 10, border: "none", color: C.muted, minHeight: 44 }}>Use a form instead</button>
          </div>
        ) : null}

        {phase === "form" ? (
          <form onSubmit={submitForm} noValidate>
            {formNote ? <div style={{ fontSize: 14, color: C.light, marginBottom: 4 }}>{formNote}</div> : null}
            <span style={label} id="wf-reserve-party-l">People</span>
            <div role="group" aria-labelledby="wf-reserve-party-l" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button type="button" aria-label="One fewer person" style={stepBtn} onClick={() => setDraft((d) => ({ ...d, partySize: Math.max(1, (d.partySize || 2) - 1) }))}>{"−"}</button>
              <div aria-live="polite" style={{ minWidth: 36, textAlign: "center", fontSize: 18, fontWeight: 800, color: C.text }}>{draft.partySize}</div>
              <button type="button" aria-label="One more person" style={stepBtn} onClick={() => setDraft((d) => ({ ...d, partySize: Math.min(maxParty, (d.partySize || 2) + 1) }))}>+</button>
            </div>
            <label htmlFor="wf-reserve-date" style={label}>Day</label>
            <input id="wf-reserve-date" type="date" min={range.min} max={range.max} value={draft.date} onChange={setD("date")} style={field} />
            <label htmlFor="wf-reserve-time" style={label}>Time</label>
            <select id="wf-reserve-time" data-reserve-times="1" value={slots.list.includes(draft.time) ? draft.time : ""} onChange={setD("time")} style={field} disabled={slots.state !== "ready" || !slots.list.length}>
              <option value="" disabled>{!draft.date ? "Pick a day first" : slots.state === "loading" ? "Checking open times" : slots.list.length ? "Pick a time" : "No open times"}</option>
              {slots.list.map((s) => <option key={s} value={s}>{timeLabel(s)}</option>)}
            </select>
            {draft.date && slots.state === "ready" && !slots.list.length ? <div style={{ fontSize: 13, color: C.light, marginTop: 6 }}>No open tables that day. Try another day.</div> : null}
            {slots.state === "error" ? <div role="alert" style={{ fontSize: 13, color: "#FCA5A5", marginTop: 6 }}>We could not check open times. Please try again.</div> : null}
            <label htmlFor="wf-reserve-name" style={label}>Name for the table</label>
            <input id="wf-reserve-name" value={draft.guestName} onChange={setD("guestName")} onFocus={keepVisible} maxLength={RESERVE_LIMITS.nameMax} autoComplete="given-name" style={field} />
            <label htmlFor="wf-reserve-note" style={label}>Note (optional)</label>
            <textarea id="wf-reserve-note" value={draft.note} onChange={setD("note")} onFocus={keepVisible} maxLength={RESERVE_LIMITS.noteMax} rows={2} style={{ ...field, padding: "10px 12px", resize: "none" }} />
            {error ? <div role="alert" style={{ color: "#FCA5A5", fontSize: 14, marginTop: 10 }}>{error}</div> : null}
            <div style={actionBar}><button type="submit" style={mainBtn}>Review booking</button></div>
          </form>
        ) : null}

        {phase === "summary" ? (
          <div>
            <Summary draft={draft} openAt={verifiedTime} />
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, minHeight: 44, padding: "6px 0", fontSize: 14, color: C.light, cursor: "pointer" }}>
              <input type="checkbox" role="switch" data-reserve-share="1" checked={sharePhone} onChange={(e) => { setSharePhone(e.target.checked); setError(""); }} style={{ width: 24, height: 24, marginTop: 2, flexShrink: 0 }} />
              <span>Share my phone with {name} so they can reach me</span>
            </label>
            {sharePhone ? (
              <div>
                <label htmlFor="wf-reserve-phone" style={label}>Your phone number</label>
                <input id="wf-reserve-phone" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} onFocus={keepVisible} maxLength={20} style={field} />
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Only {name} sees it, for this booking.</div>
              </div>
            ) : null}
            {error ? <div role="alert" style={{ color: "#FCA5A5", fontSize: 14, margin: "10px 0 0" }}>{error}</div> : null}
            <div style={actionBar}>
              <button type="button" style={{ ...mainBtn, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={bookNow}>{busy ? "Booking…" : "Book table"}</button>
              <button type="button" style={quietBtn} onClick={() => toForm("", draft)}>Change something</button>
            </div>
          </div>
        ) : null}

        {phase === "full" ? (
          <div>
            <div data-reserve-status="full" role="alert" style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: "0 0 6px", lineHeight: 1.35 }}>{timeLabel(draft.time)} just filled up.</div>
            {alternatives.length ? (
              <div>
                <div style={{ fontSize: 14, color: C.light, marginBottom: 10 }}>These times are open. Tap one to book it.</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {alternatives.map((t) => <button key={t} type="button" data-reserve-alt={t} style={chip} disabled={busy} onClick={() => bookAlternative(t)}>{timeLabel(t)}</button>)}
                </div>
              </div>
            ) : <div style={{ fontSize: 14, color: C.light }}>No other times are open that day. Try another day.</div>}
            <div style={actionBar}><button type="button" style={quietBtn} onClick={() => toForm("", { ...draft, time: "" })}>Pick another day</button></div>
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
