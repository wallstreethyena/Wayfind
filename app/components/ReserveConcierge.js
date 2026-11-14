"use client";
// Reserve concierge: Claude, in the same chat. One thread, used inside the Reserve sheet and inline in Boo / Santa.
// Contract: docs/reserve-concierge-contract.md. Each turn POSTs /api/reserve/concierge; the server writes every
// availability and booking sentence from database results, and a table is only ever created by a tap that posts to /api/reserve/book.
//
// Truth rules: nothing here says "Booked" unless the server returned a booking with status confirmed; a request says
// "Request sent"; a handoff never claims a table; times shown are only the ones a times card carries.
// Lazy: Boo and the Reserve sheet load this file with a dynamic import, so none of it ships in the main bundle.
import { useCallback, useEffect, useRef, useState } from "react";
import { C } from "./kit";
import { mainBtn, quietBtn, linkBtn, field, label, chip, errStyle, keepVisible, Bubble } from "./reserveUi.js";
import ReservePicks from "./ReservePicks.js";
import {
  RESERVE_LIMITS, conciergeTurn, bookTable, cancelBooking, saveProfile, profileBody, cleanPhoneInput, newIdempotencyKey,
  addToItinerary, directionsUrl, addHandoff, downloadIcs, timeLabel, dateLabel, weekdayLabel,
} from "../../lib/reserveClientApi.js";
import { trackReserve, savePendingReserve, clearPendingReserve } from "../../lib/reserveOpen.js";

const NAME_NEEDED = ["INVALID_NAME", "NAME_REQUIRED", "NEEDS_NAME", "PROFILE_REQUIRED", "NEEDS_PROFILE", "GUEST_NAME_REQUIRED"];
const KEEP = ["booked", "requested", "cancelled"]; // cards that stay in the thread after later messages

const safe = (fn) => { try { return fn(); } catch (e) { return undefined; } };
const track = (name, props) => { safe(() => trackReserve(name, props)); };
const partyWord = (n) => n + (n === 1 ? " person" : " people");

function greeting(name) {
  return name ? "What day and time for " + name + ", and how many people?" : "Which restaurant, what day and time, and how many people?";
}

// The site's own sign in sheet lives in the home shell: a visitor opens it with the header .wf-signin-button.
function openSignIn() {
  const door = safe(() => document.querySelector(".wf-signin-button"));
  if (!door) return false;
  try { door.click(); return true; } catch (e) { return false; }
}

function Note({ children }) { return <div style={{ fontSize: 12.5, color: C.muted, marginTop: 6, overflowWrap: "anywhere" }}>{children}</div>; }
const box = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px", margin: "0 0 10px" };

function TimesCard({ card, busy, onPick }) {
  const opts = Array.isArray(card.options) ? card.options : [];
  return (
    <div data-reserve-card="times" style={{ margin: "0 0 10px" }}>
      <div style={{ fontSize: 13, color: C.light, marginBottom: 8 }}>{[weekdayLabel(card.date), card.partySize ? partyWord(card.partySize) : ""].filter(Boolean).join(" · ")}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {opts.map((o) => <button key={o.time} type="button" data-reserve-time={o.time} style={chip} disabled={busy} onClick={() => onPick(o.time)}>{o.label || timeLabel(o.time)}</button>)}
      </div>
    </div>
  );
}

// Tapping a time never books. It shows this card first; only "Confirm booking" posts /api/reserve/book.
function ConfirmCard({ card, name, who, busy, onConfirm, onBack }) {
  const when = [weekdayLabel(card.date), timeLabel(card.time)].filter(Boolean).join(" at ");
  const line = (name || "the restaurant") + ", " + when + (card.partySize ? " for " + card.partySize : "") + "." + (who ? " Booking as " + who + "." : "");
  return (
    <div data-reserve-card="confirm" style={box}>
      <div style={{ fontSize: 16, fontWeight: 800, color: C.text, lineHeight: 1.35, overflowWrap: "anywhere" }}>{line}</div>
      <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
        <button type="button" data-reserve-confirm="1" style={{ ...mainBtn, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={onConfirm}>Confirm booking</button>
        <button type="button" data-reserve-back="1" style={quietBtn} disabled={busy} onClick={onBack}>Pick another time</button>
      </div>
    </div>
  );
}

function RequestCard({ card, name, busy, onSend }) {
  return (
    <div data-reserve-card="request" style={box}>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.text, lineHeight: 1.4 }}>{[weekdayLabel(card.date), timeLabel(card.time), card.partySize ? partyWord(card.partySize) : ""].filter(Boolean).join(" · ")}</div>
      <Note>{name || "The restaurant"} answers requests on its own time. Nothing is confirmed until they say yes.</Note>
      <div style={{ marginTop: 10 }}><button type="button" style={{ ...mainBtn, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={onSend}>Send request</button></div>
    </div>
  );
}

function HandoffCard({ card, state, place }) {
  const q = safe(() => new URL(card.url, "https://gowayfind.com").searchParams);
  const log = () => safe(() => addHandoff({
    placeId: (q && q.get("placeId")) || (place && place.id) || "",
    name: (place && place.name) || (state && state.restaurantName) || "",
    date: (q && q.get("date")) || (state && state.date) || "",
    time: (q && q.get("time")) || (state && state.time) || "",
    party: Number((q && q.get("party")) || (state && state.partySize)) || null,
  }));
  return (
    <div data-reserve-card="handoff" style={{ margin: "0 0 10px" }}>
      <a data-reserve-go="1" href={card.url} target="_blank" rel="noopener noreferrer" onClick={() => { log(); track("reserve_opentable_handoff", { place_id: place && place.id }); }}
        style={{ ...mainBtn, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", boxSizing: "border-box", textAlign: "center", padding: "8px 16px", overflowWrap: "anywhere" }}>{card.label}</a>
      <Note>You'll finish on OpenTable. Wayfind hasn't booked this yet.</Note>
    </div>
  );
}

function ProfileCard({ busy, error, onSubmit }) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [phone, setPhone] = useState("");
  const [save, setSave] = useState(true);
  return (
    <form data-reserve-card="profile" noValidate style={box} onSubmit={(e) => { e.preventDefault(); onSubmit({ first: first.trim(), last: last.trim(), phone: phone.trim(), save }); }}>
      <label htmlFor="wf-rc-first" style={{ ...label, marginTop: 0 }}>First name</label>
      <input id="wf-rc-first" value={first} onChange={(e) => setFirst(e.target.value)} onFocus={keepVisible} maxLength={RESERVE_LIMITS.nameMax} autoComplete="given-name" style={field} />
      <label htmlFor="wf-rc-last" style={label}>Last name</label>
      <input id="wf-rc-last" value={last} onChange={(e) => setLast(e.target.value)} onFocus={keepVisible} maxLength={RESERVE_LIMITS.nameMax} autoComplete="family-name" style={field} />
      <label htmlFor="wf-rc-phone" style={label}>Mobile (optional)</label>
      <input id="wf-rc-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} onFocus={keepVisible} maxLength={20} autoComplete="tel" style={field} />
      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, minHeight: 44, padding: "10px 0", fontSize: 14, color: C.light, cursor: "pointer" }}>
        <input type="checkbox" data-reserve-save-name="1" checked={save} onChange={(e) => setSave(e.target.checked)} style={{ width: 24, height: 24, flexShrink: 0 }} />
        <span>Save for future bookings</span>
      </label>
      {error ? <div role="alert" style={errStyle}>{error}</div> : null}
      <button type="submit" style={{ ...mainBtn, opacity: busy ? 0.7 : 1 }} disabled={busy}>Continue</button>
    </form>
  );
}

function SigninCard({ onSignedIn, place }) {
  const [state, setState] = useState("idle"); // idle | waiting | nodoor
  useEffect(() => {
    if (state !== "waiting") return undefined;
    let sub = null; let dead = false;
    import("../../lib/supabase").then((m) => {
      if (dead || !m.supabase) return;
      const res = m.supabase.auth.onAuthStateChange((evt, session) => { if (session && session.user && !dead) { dead = true; onSignedIn(); } });
      sub = res && res.data && res.data.subscription;
    }).catch(() => {});
    return () => { dead = true; safe(() => sub && sub.unsubscribe()); };
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div data-reserve-card="signin" style={{ margin: "0 0 10px" }}>
      <button type="button" style={mainBtn} onClick={() => { savePendingReserve(place); setState(openSignIn() ? "waiting" : "nodoor"); }}>Sign in to book</button>
      {state === "nodoor" ? <a href="/" style={{ ...linkBtn, marginTop: 8 }}>Open Wayfind to sign in</a> : null}
      {state === "waiting" ? <Note>I'll pick up right where we left off.</Note> : null}
    </div>
  );
}

function ChooseCard({ card, busy, onChoose }) {
  const list = Array.isArray(card.restaurants) ? card.restaurants : [];
  return (
    <div data-reserve-card="choose" style={{ display: "grid", gap: 8, margin: "0 0 10px" }}>
      {list.map((r) => (
        <button key={r.placeId} type="button" data-reserve-choose={r.placeId} disabled={busy} onClick={() => onChoose(r)}
          style={{ width: "100%", minHeight: 52, padding: "8px 14px", textAlign: "left", background: C.card, border: `1px solid ${C.accent}`, borderRadius: 14, color: C.text, cursor: "pointer", fontFamily: "inherit", boxSizing: "border-box" }}>
          <div style={{ fontSize: 15, fontWeight: 800, overflowWrap: "anywhere" }}>{r.name}</div>
          {r.address ? <div style={{ fontSize: 12.5, color: C.muted, overflowWrap: "anywhere" }}>{r.address}</div> : null}
        </button>
      ))}
    </div>
  );
}

// Booked, requested and cancelled all come from the server's saved booking row.
function BookedCard({ card, place }) {
  const b = card.booking || {};
  const name = b.restaurantName || (place && place.name) || "the restaurant";
  const [added, setAdded] = useState(false);
  const [asking, setAsking] = useState(false);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const when = [weekdayLabel(b.date), timeLabel(b.time)].filter(Boolean).join(" at ");
  const target = place && place.id ? place : { id: b.placeId, name };
  const doCancel = async () => {
    if (busy) return;
    setBusy(true); setError("");
    const r = await cancelBooking(b.id);
    setBusy(false);
    if (r && r.ok && r.booking) { track("reserve_cancelled", { place_id: b.placeId }); setGone(true); return; }
    setError((r && r.message) || "We could not cancel that. Please try again, or call the restaurant.");
  };
  if (gone) return <div data-reserve-card="cancelled" data-reserve-status="cancelled" style={box}><div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Your table is cancelled.</div></div>;
  return (
    <div data-reserve-card="booked" data-reserve-status="confirmed" style={box}>
      <div style={{ fontSize: 18, fontWeight: 800, color: C.green, lineHeight: 1.3, overflowWrap: "anywhere" }}>{"Booked. " + name + ", " + when + " for " + b.partySize + "."}</div>
      {b.confirmationCode ? <div data-reserve-code="1" style={{ fontSize: 14, color: C.light, margin: "8px 0" }}>Confirmation code <strong style={{ color: C.text, letterSpacing: 1.5, fontSize: 18 }}>{b.confirmationCode}</strong></div> : null}
      {error ? <div role="alert" style={errStyle}>{error}</div> : null}
      {asking ? (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Cancel this table?</div>
          <button type="button" style={{ ...mainBtn, opacity: busy ? 0.7 : 1 }} disabled={busy} onClick={doCancel}>Yes, cancel it</button>
          <button type="button" style={quietBtn} disabled={busy} onClick={() => setAsking(false)}>Keep my table</button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          <button type="button" data-reserve-itinerary="1" style={quietBtn} disabled={added} onClick={() => { const r = addToItinerary(target); if (r && r.ok) { setAdded(true); track("reserve_itinerary_add", { place_id: target.id }); } }}>{added ? "Added to your itinerary" : "Add to itinerary"}</button>
          <a data-reserve-directions="1" href={directionsUrl(target)} target="_blank" rel="noopener noreferrer" style={linkBtn}>Directions</a>
          <button type="button" style={quietBtn} onClick={() => safe(() => downloadIcs(Object.assign({ restaurantName: name }, b)))}>Add to calendar</button>
          <button type="button" style={quietBtn} onClick={() => { setError(""); setAsking(true); }}>Cancel</button>
        </div>
      )}
    </div>
  );
}

function RequestedCard({ card, place }) {
  const b = card.booking || {};
  const name = b.restaurantName || (place && place.name) || "the restaurant";
  const when = [weekdayLabel(b.date), timeLabel(b.time)].filter(Boolean).join(" at ");
  return (
    <div data-reserve-card="requested" data-reserve-status="requested" style={box}>
      <div style={{ fontSize: 16, fontWeight: 800, color: C.text, lineHeight: 1.35, overflowWrap: "anywhere" }}>{"Request sent to " + name + " for " + when + " for " + b.partySize + ". We'll show their answer in My reservations."}</div>
      <button type="button" data-reserve-mine="1" style={{ ...quietBtn, marginTop: 10 }} onClick={() => safe(() => import("./ReserveHistory.js").then((m) => m.showReserveHistory()))}>My reservations</button>
    </div>
  );
}

export default function ReserveConcierge({ initialPlace, initialMessage, embedded, onClose }) {
  const startPlace = initialPlace && initialPlace.id ? initialPlace : null;
  const idRef = useRef(1);
  const [items, setItems] = useState(() => [{ id: 0, role: "assistant", text: greeting(startPlace && startPlace.name), card: null }]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [cardError, setCardError] = useState("");
  const [who, setWho] = useState("");
  const alive = useRef(true);
  const started = useRef(false);
  const busyRef = useRef(false);
  const logRef = useRef(null);
  const convo = useRef([]); // what the server sees: the guest's words and its own `say`
  const pid = useRef(startPlace ? startPlace.id : "");
  const place = useRef(startPlace);
  const srv = useRef({ placeId: null, date: null, time: null, partySize: null });
  const last = useRef({ kind: "turn" });
  const keys = useRef({});
  const guest = useRef(null); // a name given for one booking only: { guestName, phone }
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [items, busy]);

  const push = useCallback((it) => { setItems((cur) => cur.concat([Object.assign({ id: idRef.current++, role: "assistant", text: "", card: null }, it)])); }, []);
  const setBusyBoth = (v) => { busyRef.current = v; setBusy(v); };
  const adopt = (st) => {
    if (!st || typeof st !== "object") return;
    srv.current = Object.assign({}, srv.current, st);
    if (st.placeId) {
      pid.current = st.placeId;
      if (!place.current || place.current.id !== st.placeId) place.current = { id: st.placeId, name: st.restaurantName || "Restaurant" };
      else if (st.restaurantName && !place.current.name) place.current = Object.assign({}, place.current, { name: st.restaurantName });
    }
  };

  const runTurn = useCallback(async () => {
    if (busyRef.current) return;
    last.current = { kind: "turn" };
    setBusyBoth(true); setCardError("");
    const body = { messages: convo.current.slice(-12), context: pid.current ? { placeId: pid.current } : {}, state: srv.current };
    const r = await conciergeTurn(body);
    if (!alive.current) return;
    setBusyBoth(false);
    if (r && r.status === 401) { push({ text: "Sign in and I'll take it from here.", card: { type: "signin" } }); return; }
    if (!r || !r.ok || typeof r.say !== "string") {
      push({ text: (r && r.message) || "I could not reach the concierge just now. Please try again.", card: { type: "retry" } });
      return;
    }
    adopt(r.state);
    convo.current.push({ role: "assistant", content: r.say.slice(0, 500) });
    if (r.profile && typeof r.profile.display === "string") setWho(r.profile.display);
    const card = r.card && typeof r.card === "object" && r.card.type ? r.card : null;
    track("reserve_concierge_turn", { place_id: pid.current || null, card: card ? card.type : "none" });
    push({ text: r.say, card });
  }, [push]);

  const send = useCallback((raw) => {
    const text = String(raw || "").trim().slice(0, 500);
    if (!text || busyRef.current) return;
    convo.current.push({ role: "user", content: text });
    push({ role: "user", text });
    runTurn();
  }, [push, runTurn]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (initialMessage && String(initialMessage).trim()) send(initialMessage);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The only thing that creates a table: a tap, with one idempotency key per slot, reused on retry.
  const book = useCallback(async (a) => {
    if (busyRef.current) return;
    const placeId = srv.current.placeId || pid.current;
    const sig = [placeId, a.date, a.time, a.partySize].join("|");
    const key = keys.current[sig] || (keys.current[sig] = newIdempotencyKey());
    last.current = { kind: "book", a };
    setBusyBoth(true); setCardError("");
    const req = { placeId, date: a.date, time: a.time, partySize: a.partySize, idempotencyKey: key };
    if (guest.current) { if (guest.current.guestName) req.guestName = guest.current.guestName; if (guest.current.phone) { req.phone = guest.current.phone; req.phoneConsent = true; } }
    const r = await bookTable(req);
    if (!alive.current) return;
    setBusyBoth(false);
    const b = r && r.booking;
    if (r && r.ok && b && b.status === "confirmed") {
      delete keys.current[sig];
      track("reserve_booked", { place_id: placeId, party_size: a.partySize, via: "concierge" });
      push({ card: { type: "booked", booking: Object.assign({ date: a.date, time: a.time, partySize: a.partySize, placeId }, b) } });
      return;
    }
    if (r && r.ok && b && b.status === "requested") {
      delete keys.current[sig];
      track("reserve_requested", { place_id: placeId, party_size: a.partySize, via: "concierge" });
      push({ card: { type: "requested", booking: Object.assign({ date: a.date, time: a.time, partySize: a.partySize, placeId }, b) } });
      return;
    }
    if (r && r.status === 401) { push({ text: "Sign in to book.", card: { type: "signin" } }); return; }
    if (r && r.status === 409 && r.error === "SLOT_FULL") {
      const alts = (Array.isArray(r.alternatives) ? r.alternatives : []).filter((t) => typeof t === "string").slice(0, 4);
      if (alts.length) push({ text: timeLabel(a.time) + " just filled up. These are open.", card: { type: "times", date: a.date, partySize: a.partySize, options: alts.map((t) => ({ time: t, label: timeLabel(t) })) } });
      else push({ text: timeLabel(a.time) + " just filled up, and nothing else is open that day. Want to try another day?" });
      return;
    }
    if (r && NAME_NEEDED.includes(r.error)) { push({ text: "What name should I put it under?", card: { type: "profile" } }); return; }
    if (r && (r.error === "CLOSED" || r.error === "TOO_SOON" || r.error === "OUT_OF_WINDOW")) { push({ text: r.message || "That time will not work. Want to try another?" }); return; }
    // Not confirmed (network or server): keep the key so a retry can never book twice.
    push({ text: (r && r.message) || "We could not confirm that. Please try again.", card: { type: "retry" } });
  }, [push]);

  const retry = () => { const l = last.current; if (l.kind === "book") book(l.a); else runTurn(); };
  const afterSignIn = () => retry();

  const submitProfile = async (v) => {
    if (busyRef.current) return;
    if (v.first.length < 1 || v.first.length > RESERVE_LIMITS.nameMax || v.last.length > RESERVE_LIMITS.nameMax) { setCardError("Add a first name for the table, up to 40 letters."); return; }
    let phone = null;
    if (v.phone) { phone = cleanPhoneInput(v.phone); if (!phone) { setCardError("Add a phone number with 10 digits, or leave it empty."); return; } }
    setCardError("");
    const display = v.first + (v.last ? " " + v.last.slice(0, 1).toUpperCase() + "." : "");
    if (v.save) {
      setBusyBoth(true);
      const r = await saveProfile(profileBody(null, { firstName: v.first, lastName: v.last || undefined, mobilePhone: phone || undefined, consent: true }));
      if (!alive.current) return;
      setBusyBoth(false);
      if (r.status === 401) { push({ text: "Sign in to save that.", card: { type: "signin" } }); return; }
      if (!r.ok) { setCardError(r.message || "We could not save that. Please try again."); return; }
      guest.current = null;
    } else guest.current = { guestName: (v.first + " " + v.last).trim(), phone };
    setWho(display);
    retry();
  };

  const choose = (r) => {
    pid.current = r.placeId;
    srv.current = Object.assign({}, srv.current, { placeId: r.placeId, restaurantName: r.name });
    place.current = { id: r.placeId, name: r.name, address: r.address };
    push({ role: "user", text: r.name });
    runTurn();
  };
  const pickAlt = (p) => {
    pid.current = p.placeId;
    srv.current = Object.assign({}, srv.current, { placeId: p.placeId, restaurantName: p.name, lane: undefined, time: null });
    place.current = { id: p.placeId, name: p.name };
    push({ role: "user", text: p.name });
    runTurn();
  };

  const renderCard = (it, i) => {
    const c = it.card;
    if (!c) return null;
    const isLast = i === items.length - 1;
    if (!isLast && !KEEP.includes(c.type)) return null;
    const pl = place.current;
    switch (c.type) {
      case "times": return <TimesCard card={c} busy={busy} onPick={(t) => { if (!busyRef.current) push({ card: { type: "confirm", date: c.date, time: t, partySize: c.partySize, back: c } }); }} />;
      case "confirm": return <ConfirmCard card={c} name={srv.current.restaurantName || (pl && pl.name)} who={who} busy={busy} onConfirm={() => book({ date: c.date, time: c.time, partySize: c.partySize })} onBack={() => { if (!busyRef.current && c.back) push({ card: c.back }); }} />;
      case "request": return <RequestCard card={c} name={srv.current.restaurantName || (pl && pl.name)} busy={busy} onSend={() => book({ date: c.date, time: c.time, partySize: c.partySize })} />;
      case "handoff": return <HandoffCard card={c} state={srv.current} place={pl} />;
      case "profile": return <ProfileCard busy={busy} error={cardError} onSubmit={submitProfile} />;
      case "signin": return <SigninCard onSignedIn={() => { clearPendingReserve(); afterSignIn(); }} place={pl} />;
      case "choose": return <ChooseCard card={c} busy={busy} onChoose={choose} />;
      case "alternatives": return (
        <div data-reserve-card="alternatives">
          {c.contact && c.contact.url ? <a data-reserve-contact="1" href={c.contact.url} style={{ ...linkBtn, margin: "0 0 10px" }}>{c.contact.label}</a> : null}
          {Array.isArray(c.picks) && c.picks.length ? <ReservePicks picks={c.picks} title="Similar places nearby" exclude={pid.current} onPick={pickAlt} /> : null}
        </div>
      );
      case "booked": return <BookedCard card={c} place={pl} />;
      case "requested": return <RequestedCard card={c} place={pl} />;
      case "retry": return <div style={{ margin: "0 0 10px" }}><button type="button" style={quietBtn} disabled={busy} onClick={retry}>Try again</button></div>;
      default: return null;
    }
  };

  return (
    <div data-reserve-concierge="1" style={embedded ? { margin: "8px 0 0" } : undefined}>
      {who ? (
        <div data-reserve-as="1" style={{ fontSize: 13, color: C.light, margin: "0 0 6px" }}>
          Booking as {who} {"·"} <button type="button" onClick={() => safe(() => import("./ReserveProfile.js").then((m) => m.showReserveProfile()))} style={{ background: "none", border: "none", padding: "12px 4px", minHeight: 44, color: C.accent, fontWeight: 800, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Change</button>
        </div>
      ) : null}
      <div ref={logRef} role="log" aria-live="polite" aria-label="Reservation chat" style={{ maxHeight: embedded ? "46dvh" : "52dvh", overflowY: "auto", padding: "2px 0 4px" }}>
        {items.map((it, i) => (
          <div key={it.id}>
            {it.text ? <Bubble role={it.role}>{it.text}</Bubble> : null}
            {renderCard(it, i)}
          </div>
        ))}
        {busy ? <Bubble role="assistant">{"…"}</Bubble> : null}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); const t = input; setInput(""); send(t); }} style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <label htmlFor="wf-reserve-msg" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Your message</label>
        <input id="wf-reserve-msg" value={input} onChange={(e) => setInput(e.target.value)} onFocus={keepVisible} maxLength={500} autoComplete="off" placeholder="Example: 4 people Saturday at 7" style={{ ...field, flex: 1, minWidth: 0 }} />
        <button type="submit" disabled={busy || !input.trim()} style={{ ...mainBtn, width: "auto", padding: "0 16px", opacity: busy || !input.trim() ? 0.6 : 1 }}>Send</button>
      </form>
      {embedded && onClose ? <button type="button" onClick={onClose} style={{ ...quietBtn, marginTop: 8, border: "none", color: C.muted }}>Close</button> : null}
    </div>
  );
}
