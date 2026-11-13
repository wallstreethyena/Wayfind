"use client";
// "Reserve a table" sheet. Lazy: lib/reserveOpen.js openReserveSheet() imports
// this file on the first tap, so none of it ships in the card's bundle.
//
// Reserve v2: on open it asks /api/reserve/path how this restaurant takes bookings.
//   wayfind   -> the instant flow (chat or form, real open times from the server). Name, phone and email come from the
//                saved booking profile; a missing name is asked in a chat bubble but collected in a structured input
//                that posts to /api/reserve/profile, never into the chat model.
//   opentable -> a handoff. No times, no "booked": a link to /api/reserve/go, which the server turns into OpenTable's own form.
//   none      -> Call, Directions and similar bookable places.
//
// Truth rule: nothing here ever says "You're booked" unless the server answered 201 with a
// saved booking (or a saved confirmed booking came back from /api/reserve/mine).
import { useCallback, useEffect, useRef, useState } from "react";
import { C } from "./kit";
import { mainBtn, quietBtn, linkBtn, field, label, stepBtn, chip, actionBar, errStyle, keepVisible, Bubble, Shell, showInHost } from "./reserveUi.js";
import ReservePicks from "./ReservePicks.js";
import {
  RESERVE_LIMITS, reserveChat, reserveSlots, bookTable, myBookings, cancelBooking, answerProposal, reserveDateRange,
  timeLabel, dateLabel, summaryLine, validateDraft, cleanPhoneInput, newIdempotencyKey, downloadIcs,
  reservePath, getProfile, saveProfile, reserveGoUrl, halfHourTimes, nearestHalfHour, profileShortName, aroundLine,
  addHandoff, addToItinerary, directionsUrl, addDaysIso, profileBody,
} from "../../lib/reserveClientApi.js";
import { trackReserve } from "../../lib/reserveOpen.js";
import { siteTodayStr } from "../../lib/siteTime.js";
import { showLikeFeedback } from "../../lib/cardActions";

const FIRST_LINE = "How many people, and what day and time?";
const EMPTY_DRAFT = { partySize: null, date: null, time: null, note: null };


function Summary({ draft, openAt }) {
  return (
    <div data-reserve-summary="1" style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px", margin: "4px 0 12px" }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.text, lineHeight: 1.4 }}>{summaryLine(draft)}</div>
      {openAt ? <div data-reserve-open="1" style={{ fontSize: 14, fontWeight: 700, color: C.green, marginTop: 6 }}>Open at {timeLabel(openAt)}</div> : null}
      {draft.note ? <div style={{ fontSize: 13, color: C.muted, marginTop: 6, overflowWrap: "anywhere" }}>Note: {draft.note}</div> : null}
    </div>
  );
}


const LONG_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// "today", "tomorrow", "Friday" inside the next week, else "Sat, Nov 21". Calendar arithmetic only.
function dayPhrase(iso) {
  const today = siteTodayStr();
  if (iso === today) return "today";
  if (iso === addDaysIso(today, 1)) return "tomorrow";
  for (let i = 2; i < 7; i++) if (iso === addDaysIso(today, i)) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return LONG_DAYS[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()]; }
  return dateLabel(iso);
}

export function ReserveSheet({ place, surface, prefill, onClose }) {
  const name = place.name || "this restaurant";
  // boot | signin | signin-wait | name | status | chat | form | summary | full | booked | ot | none
  const [phase, setPhase] = useState("boot");
  const [msgs, setMsgs] = useState([{ role: "assistant", content: FIRST_LINE, local: true }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const pf = prefill || {};
  const [draft, setDraft] = useState({ partySize: pf.partySize || 2, date: pf.date || "", time: "", note: "" });
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
  const [profile, setProfile] = useState(null); // the saved booking profile, or null
  const [localName, setLocalName] = useState(""); // a name given for this booking only (not saved)
  const [nameDraft, setNameDraft] = useState("");
  const [saveName, setSaveName] = useState(true);
  const [added, setAdded] = useState(false);
  const [ot, setOt] = useState({ partySize: pf.partySize || 2, date: pf.date || siteTodayStr(), time: nearestHalfHour(pf.time) || "19:00" });
  const alive = useRef(true);
  const logRef = useRef(null);
  const idemKey = useRef("");
  const afterName = useRef("chat");
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const haveProfileName = !!(profile && profile.firstName);
  const whoName = haveProfileName ? profile.firstName : localName;
  const startPhase = () => (pf.date && pf.partySize ? "form" : "chat");

  const boot = useCallback(async () => {
    let user = null;
    try {
      const m = await import("../../lib/supabase");
      const { data } = await m.supabase.auth.getSession();
      user = data && data.session && data.session.user;
    } catch (e) {}
    if (!alive.current) return;
    // How does this restaurant take bookings? A failed lookup falls back to the Wayfind flow, which the server still enforces.
    const pr = await reservePath(place.id);
    if (!alive.current) return;
    const path = pr && pr.ok && (pr.path === "opentable" || pr.path === "none" || pr.path === "wayfind") ? pr.path : "wayfind";
    const rp = pr && pr.ok && pr.restaurant && pr.restaurant.phone;
    if (rp) setRestaurantPhone(rp);
    if (pr && pr.ok && Number.isInteger(pr.maxParty)) setMaxParty(pr.maxParty);
    if (path === "opentable") { setPhase("ot"); return; }
    if (path === "none") { setPhase("none"); return; }
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
    const [pRes, r] = await Promise.all([getProfile(), myBookings(place.id)]);
    if (!alive.current) return;
    const prof = pRes && pRes.ok && pRes.profile ? pRes.profile : null;
    setProfile(prof);
    if (prof && prof.defaultPartySize && !pf.partySize) setDraft((d) => ({ ...d, partySize: prof.defaultPartySize }));
    const first = user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name);
    if (first) setNameDraft((n) => n || String(first).split(/\s+/)[0].slice(0, RESERVE_LIMITS.nameMax));
    const live = r && r.ok && Array.isArray(r.bookings) ? r.bookings.find((b) => (b.status === "confirmed" || b.status === "proposed") && b.date >= siteTodayStr()) : null;
    if (live) { setBooking(live); if (live.restaurantPhone) setRestaurantPhone(live.restaurantPhone); setPhase("status"); return; }
    if (prof && prof.firstName) setPhase(startPhase());
    else { afterName.current = startPhase(); setPhase("name"); }
  }, [place.id]); // eslint-disable-line react-hooks/exhaustive-deps
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

  // The name question. The answer goes to the structured input below, then (with consent) to /api/reserve/profile. Never to the chat model.
  async function submitName(e) {
    e.preventDefault();
    if (busy) return;
    const n = nameDraft.trim();
    if (n.length < 1 || n.length > RESERVE_LIMITS.nameMax) { setError("Add a name for the table, up to 40 letters."); return; }
    setError("");
    if (saveName) {
      setBusy(true);
      const r = await saveProfile(profileBody(profile, { firstName: n, consent: true }));
      if (!alive.current) return;
      setBusy(false);
      if (r.status === 401) { boot(); return; }
      if (!r.ok) { setError(r.message || "We could not save that. Please try again."); return; }
      setProfile(r.profile || { ...(profile || {}), firstName: n });
    } else setLocalName(n);
    setPhase(afterName.current || "chat");
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
      setDraft((cur) => ({ ...cur, partySize: d.partySize, date: d.date, time: d.time, note: d.note || "" }));
      toSummary(d.time);
    }
  }

  function submitForm(e) {
    e.preventDefault();
    const clean = { ...draft, note: String(draft.note || "").trim() };
    const bad = validateDraft(clean, new Date(), maxParty, { needName: false }) || (slots.list.includes(clean.time) ? null : "Pick one of the open times.");
    if (bad) { setError(bad); return; }
    setDraft(clean); setUsedForm(true); toSummary(clean.time);
  }

  // Book with the key made for this summary. Retrying the same summary reuses the same key.
  async function book(d, key) {
    if (busy) return;
    const bad = validateDraft(d, new Date(), maxParty, { needName: false });
    if (bad) { toForm(bad, d); return; }
    let phoneOut = null;
    if (sharePhone) {
      phoneOut = cleanPhoneInput(phone);
      if (!phoneOut) { setError("Add a phone number with 10 digits, or turn off sharing your phone."); return; }
    }
    setBusy(true); setError("");
    const body = { placeId: place.id, partySize: d.partySize, date: d.date, time: d.time, idempotencyKey: key };
    // A saved profile gives the server the name. Only a name given for this booking alone travels in the request.
    if (!haveProfileName && localName) body.guestName = localName;
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
  const dirHref = directionsUrl(place);
  const doAdd = () => { const r = addToItinerary(place); if (r.ok) { setAdded(true); trackReserve("reserve_itinerary_add", { place_id: place.id }); } };
  const openMine = () => { import("./ReserveHistory.js").then((m) => m.showReserveHistory()).catch(() => {}); };
  const openProfile = () => { import("./ReserveProfile.js").then((m) => m.showReserveProfile()).catch(() => {}); };
  // The three backups every non Wayfind path offers.
  const backups = (intent) => (
    <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
      <a data-reserve-directions="1" href={dirHref} target="_blank" rel="noopener noreferrer" style={linkBtn}>Directions</a>
      <button type="button" data-reserve-itinerary="1" style={quietBtn} onClick={doAdd} disabled={added}>{added ? "Added to your itinerary" : "Add to itinerary"}</button>
      <ReservePicks placeId={place.id} intent={intent} exclude={place.id} title="Places you can book" />
    </div>
  );
  const bookingAs = whoName ? (
    <div data-reserve-as="1" style={{ fontSize: 13, color: C.light, margin: "0 0 10px" }}>
      Booking as {haveProfileName ? profileShortName(profile) : localName} {"·"} <button type="button" onClick={haveProfileName ? openProfile : () => { afterName.current = phase; setPhase("name"); }} style={{ background: "none", border: "none", padding: "12px 4px", minHeight: 44, color: C.accent, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Change</button>
    </div>
  ) : null;

  // One view for a saved booking: confirmed, proposed, or cancelled. Every word comes from the server's row.
  const bookingView = () => {
    const b = booking;
    const view = { partySize: b.partySize, date: b.date, time: b.time, note: "" };
    const at = b.restaurantName || name;
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
          {error ? <div role="alert" style={errStyle}>{error}</div> : null}
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
        <div data-reserve-status="confirmed" aria-live="polite" style={{ fontSize: 19, fontWeight: 800, color: C.green, margin: "0 0 8px", lineHeight: 1.3, overflowWrap: "anywhere" }}>You're booked at {timeLabel(b.time)} for {b.partySize} at {at}.</div>
        <div data-reserve-code="1" style={{ fontSize: 14, color: C.light, marginBottom: 8 }}>Confirmation code <strong style={{ color: C.text, letterSpacing: 1.5, fontSize: 18 }}>{b.confirmationCode}</strong></div>
        <Summary draft={view} />
        <div style={{ fontSize: 14, color: C.light, margin: "0 0 10px", overflowWrap: "anywhere" }}>{callLine}</div>
        {error ? <div role="alert" style={errStyle}>{error}</div> : null}
        {confirmingCancel ? (
          <div style={actionBar}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Cancel this table?</div>
            <button type="button" style={{ ...mainBtn, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={doCancel}>Yes, cancel it</button>
            <button type="button" style={quietBtn} disabled={busy} onClick={() => setConfirmingCancel(false)}>Keep my table</button>
          </div>
        ) : (
          <div style={actionBar}>
            <a data-reserve-directions="1" href={dirHref} target="_blank" rel="noopener noreferrer" style={{ ...linkBtn, background: C.accent, border: "none", color: "#0D1117", fontWeight: 800, minHeight: 48 }}>Directions</a>
            <button type="button" data-reserve-itinerary="1" style={quietBtn} onClick={doAdd} disabled={added}>{added ? "Added to your itinerary" : "Add to itinerary"}</button>
            <button type="button" style={quietBtn} onClick={() => downloadIcs(b)}>Add to calendar</button>
            <button type="button" style={quietBtn} onClick={() => { setError(""); setConfirmingCancel(true); }}>Cancel booking</button>
          </div>
        )}
      </div>
    );
  };

  const otReady = /^\d{4}-\d{2}-\d{2}$/.test(ot.date) && ot.date >= range.min && ot.date <= range.max && /^\d{2}:\d{2}$/.test(ot.time);
  const goHref = reserveGoUrl({ placeId: place.id, date: ot.date, time: ot.time, party: ot.partySize });

  const header = (
    <button type="button" data-reserve-mine="1" onClick={openMine} style={{ background: "none", border: "none", padding: "0 0", minHeight: 44, color: C.accent, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>My reservations</button>
  );

  return (
    <Shell title="Reserve a table" sub={name} onClose={onClose} extra={header}>
      {phase === "signin" ? (
        <div>
          <div style={{ fontSize: 15, color: C.text, marginBottom: 12 }}>Sign in to book a table</div>
          {unhandledSignIn ? <a href="/" style={{ ...mainBtn, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", boxSizing: "border-box" }}>Open Wayfind to sign in</a> : null}
        </div>
      ) : null}

      {phase === "name" ? (
        <form onSubmit={submitName} data-reserve-name-form="1" noValidate>
          <Bubble role="assistant">What name should I put the table under?</Bubble>
          <label htmlFor="wf-reserve-first" style={label}>First name</label>
          <input id="wf-reserve-first" value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} onFocus={keepVisible} maxLength={RESERVE_LIMITS.nameMax} autoComplete="given-name" style={field} />
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, minHeight: 44, padding: "10px 0", fontSize: 14, color: C.light, cursor: "pointer" }}>
            <input type="checkbox" data-reserve-save-name="1" checked={saveName} onChange={(e) => setSaveName(e.target.checked)} style={{ width: 24, height: 24, marginTop: 0, flexShrink: 0 }} />
            <span>Save for future bookings</span>
          </label>
          {error ? <div role="alert" style={errStyle}>{error}</div> : null}
          <div style={actionBar}><button type="submit" style={{ ...mainBtn, opacity: busy ? 0.7 : 1 }} disabled={busy}>Continue</button></div>
        </form>
      ) : null}

      {phase === "ot" ? (
        <div data-reserve-path="opentable">
          <div data-reserve-ot-copy="1" style={{ fontSize: 15, color: C.text, lineHeight: 1.45, marginBottom: 6, overflowWrap: "anywhere" }}>
            I can take you directly to {name} on OpenTable for {otReady ? dayPhrase(ot.date) : "the day you pick"} around {timeLabel(ot.time)} for {ot.partySize}.
          </div>
          <span style={label} id="wf-reserve-ot-party-l">People</span>
          <div role="group" aria-labelledby="wf-reserve-ot-party-l" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button type="button" aria-label="One fewer person" style={stepBtn} onClick={() => setOt((o) => ({ ...o, partySize: Math.max(1, o.partySize - 1) }))}>{"−"}</button>
            <div aria-live="polite" style={{ minWidth: 36, textAlign: "center", fontSize: 18, fontWeight: 800, color: C.text }}>{ot.partySize}</div>
            <button type="button" aria-label="One more person" style={stepBtn} onClick={() => setOt((o) => ({ ...o, partySize: Math.min(maxParty, o.partySize + 1) }))}>+</button>
          </div>
          <label htmlFor="wf-reserve-ot-date" style={label}>Day</label>
          <input id="wf-reserve-ot-date" type="date" min={range.min} max={range.max} value={ot.date} onChange={(e) => setOt((o) => ({ ...o, date: e.target.value }))} style={field} />
          <label htmlFor="wf-reserve-ot-time" style={label}>Around what time?</label>
          <select id="wf-reserve-ot-time" value={ot.time} onChange={(e) => setOt((o) => ({ ...o, time: e.target.value }))} style={field}>
            {halfHourTimes().map((t) => <option key={t} value={t}>{timeLabel(t)}</option>)}
          </select>
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            <a data-reserve-go="1" href={otReady ? goHref : undefined} aria-disabled={!otReady} target="_blank" rel="noopener noreferrer"
              onClick={(e) => { if (!otReady) { e.preventDefault(); return; } addHandoff({ placeId: place.id, name, date: ot.date, time: ot.time, party: ot.partySize }); trackReserve("reserve_opentable_handoff", { place_id: place.id, party_size: ot.partySize }); }}
              style={{ ...mainBtn, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", boxSizing: "border-box", opacity: otReady ? 1 : 0.5, overflowWrap: "anywhere", textAlign: "center", padding: "8px 16px" }}>Open {name} on OpenTable</a>
            <div style={{ fontSize: 12.5, color: C.muted, textAlign: "center" }}>You'll pick the exact time and confirm on OpenTable.</div>
          </div>
          {backups({ date: ot.date, time: ot.time, partySize: ot.partySize })}
        </div>
      ) : null}

      {phase === "none" ? (
        <div data-reserve-path="none">
          <div style={{ fontSize: 15, color: C.text, lineHeight: 1.45, marginBottom: 10 }}>{name} does not take bookings through Wayfind yet. You can call them, or try a place you can book.</div>
          {restaurantPhone ? <a data-reserve-call="1" href={"tel:" + restaurantPhone.replace(/[^\d+]/g, "")} style={{ ...linkBtn, background: C.accent, border: "none", color: "#0D1117", fontWeight: 800, minHeight: 48 }}>Call {restaurantPhone}</a> : <div style={{ fontSize: 14, color: C.light }}>We do not have a phone number for them.</div>}
          {backups(null)}
        </div>
      ) : null}

      {(phase === "status" || phase === "booked") && booking ? bookingView() : null}

      {phase === "chat" ? (
        <div>
          {bookingAs}
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
          {bookingAs}
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
          {draft.date && slots.state === "ready" && !slots.list.length ? (
            <div>
              <div style={{ fontSize: 13, color: C.light, marginTop: 6 }}>No open tables that day. Try another day, or one of these.</div>
              <ReservePicks placeId={place.id} intent={{ date: draft.date, partySize: draft.partySize }} exclude={place.id} title="Places you can book" />
            </div>
          ) : null}
          {slots.state === "error" ? <div role="alert" style={{ fontSize: 13, color: "#FCA5A5", marginTop: 6 }}>We could not check open times. Please try again.</div> : null}
          <label htmlFor="wf-reserve-note" style={label}>Note (optional)</label>
          <textarea id="wf-reserve-note" value={draft.note} onChange={setD("note")} onFocus={keepVisible} maxLength={RESERVE_LIMITS.noteMax} rows={2} style={{ ...field, padding: "10px 12px", resize: "none" }} />
          {error ? <div role="alert" style={{ ...errStyle, marginTop: 10 }}>{error}</div> : null}
          <div style={actionBar}><button type="submit" style={mainBtn}>Review booking</button></div>
        </form>
      ) : null}

      {phase === "summary" ? (
        <div>
          <Summary draft={{ ...draft, guestName: whoName }} openAt={verifiedTime} />
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
          {error ? <div role="alert" style={{ ...errStyle, margin: "10px 0 0" }}>{error}</div> : null}
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
          ) : <div style={{ fontSize: 14, color: C.light }}>No other times are open that day. Try another day, or one of these.</div>}
          <ReservePicks placeId={place.id} intent={{ date: draft.date, time: draft.time, partySize: draft.partySize }} exclude={place.id} title="Places you can book" />
          <div style={actionBar}><button type="button" style={quietBtn} onClick={() => toForm("", { ...draft, time: "" })}>Pick another day</button></div>
        </div>
      ) : null}
    </Shell>
  );
}

export function showReserveSheet(place, opts) {
  if (typeof document === "undefined" || !place || !place.id) return;
  const o = opts || {};
  showInHost((close) => <ReserveSheet place={place} surface={o.surface || "place_card"} prefill={o.prefill || null} onClose={close} />);
}

export default ReserveSheet;
