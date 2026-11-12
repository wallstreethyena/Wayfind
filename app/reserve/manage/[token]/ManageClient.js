"use client";
import { useCallback, useEffect, useState } from "react";
import { GroupFrame } from "../../../group-plans/GroupFrame.js";
import { formatReserveDate, formatReserveTime } from "../../../../lib/reserveFormat.js";

// The restaurant dashboard. Reading never changes anything; only a button press does.
const api = "/api/reserve/manage";

function Booking({ b, token, onChanged }) {
  const [mode, setMode] = useState(null); // null | "cancel" | "offer"
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(b.date);
  const [slots, setSlots] = useState(null);
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (mode !== "offer") return undefined;
    let alive = true;
    setSlots(null); setTime("");
    fetch(`${api}?t=${encodeURIComponent(token)}&slotsFor=${encodeURIComponent(b.id)}&date=${encodeURIComponent(date)}`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((j) => { if (alive) setSlots(j && j.ok && Array.isArray(j.slots) ? j.slots : []); })
      .catch(() => { if (alive) setSlots([]); });
    return () => { alive = false; };
  }, [mode, date, token, b.id]);

  const send = async (payload) => {
    if (busy) return;
    setBusy(true); setNotice("");
    try {
      const r = await fetch(api, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, bookingId: b.id, ...payload }), cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (j && j.ok) { setMode(null); onChanged(); }
      else setNotice((j && j.message) || "That did not go through. Please try again.");
    } catch { setNotice("That did not go through. Please try again."); }
    setBusy(false);
  };

  return (
    <li style={{ listStyle: "none", border: "1px solid rgba(128,128,128,.35)", borderRadius: 12, padding: "12px 14px", margin: "0 0 10px" }}>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{formatReserveTime(b.time)} · {b.partySize} {b.partySize === 1 ? "person" : "people"}</div>
      <div style={{ margin: "4px 0", overflowWrap: "anywhere" }}>{b.guestName} · code {b.confirmationCode}</div>
      {b.note ? <div style={{ overflowWrap: "anywhere" }}>Note: {b.note}</div> : null}
      {b.phone ? <div>Phone (shared by the guest): <a href={`tel:${b.phone.replace(/[^\d+]/g, "")}`}>{b.phone}</a></div> : null}
      {b.status === "proposed" ? <div role="status" style={{ marginTop: 6 }}>Waiting for the guest to answer your offer of {formatReserveTime(b.proposedTime)} on {formatReserveDate(b.proposedDate)}.</div> : null}
      {mode === null ? (
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          <button type="button" className="gp-button" style={{ minHeight: 44 }} onClick={() => setMode("offer")}>Offer another time</button>
          <button type="button" className="gp-button" style={{ minHeight: 44 }} onClick={() => setMode("cancel")}>Cancel booking</button>
        </div>
      ) : null}
      {mode === "cancel" ? (
        <div style={{ marginTop: 10 }}>
          <label htmlFor={`why-${b.id}`} style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>Short reason for the guest</label>
          <input id={`why-${b.id}`} value={reason} maxLength={120} onChange={(e) => setReason(e.target.value)} style={{ width: "100%", minHeight: 44, fontSize: 16, boxSizing: "border-box", padding: "0 12px" }} />
          {notice ? <p className="gp-status gp-error" role="alert">{notice}</p> : null}
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <button type="button" className="gp-button primary" style={{ minHeight: 44 }} disabled={busy || reason.trim().length < 2} onClick={() => send({ action: "cancel", reason: reason.trim() })}>Cancel booking</button>
            <button type="button" className="gp-button" style={{ minHeight: 44 }} onClick={() => setMode(null)}>Keep booking</button>
          </div>
        </div>
      ) : null}
      {mode === "offer" ? (
        <div style={{ marginTop: 10 }}>
          <label htmlFor={`day-${b.id}`} style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>Day</label>
          <input id={`day-${b.id}`} type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ width: "100%", minHeight: 44, fontSize: 16, boxSizing: "border-box", padding: "0 12px" }} />
          <div style={{ fontWeight: 700, margin: "10px 0 6px" }}>Open times</div>
          {slots === null ? <p className="gp-status" role="status">Loading open times...</p> : null}
          {slots && !slots.length ? <p className="gp-status">No open times that day. Try another day.</p> : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {(slots || []).map((s) => <button key={s} type="button" className={time === s ? "gp-button primary" : "gp-button"} style={{ minHeight: 44 }} aria-pressed={time === s} onClick={() => setTime(s)}>{formatReserveTime(s)}</button>)}
          </div>
          {notice ? <p className="gp-status gp-error" role="alert">{notice}</p> : null}
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <button type="button" className="gp-button primary" style={{ minHeight: 44 }} disabled={busy || !time} onClick={() => send({ action: "propose", date, time })}>Send offer</button>
            <button type="button" className="gp-button" style={{ minHeight: 44 }} onClick={() => setMode(null)}>Never mind</button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

export default function ManageClient({ token }) {
  const [state, setState] = useState({ phase: "loading" });
  const load = useCallback(() => {
    fetch(`${api}?t=${encodeURIComponent(token)}`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((j) => setState(j && j.ok ? { phase: "ready", partner: j.partner, bookings: j.bookings, today: j.today } : { phase: "error", message: (j && j.message) || "We could not load this page." }))
      .catch(() => setState({ phase: "error", message: "We could not load this page. Please try again." }));
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const days = [];
  for (const b of state.bookings || []) {
    const last = days[days.length - 1];
    if (last && last.date === b.date) last.items.push(b); else days.push({ date: b.date, items: [b] });
  }
  return (
    <GroupFrame>
      <section className="gp-panel">
        {state.phase === "loading" ? <p className="gp-status" role="status">Loading bookings...</p> : null}
        {state.phase === "error" ? <p className="gp-status gp-error" role="alert">{state.message}</p> : null}
        {state.phase === "ready" ? (
          <>
            <div className="gp-step">Bookings</div>
            <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>{state.partner.name}</h1>
            {!days.length ? <p>No upcoming bookings yet.</p> : null}
            {days.map((d) => (
              <div key={d.date}>
                <h2 style={{ fontSize: 17, margin: "16px 0 8px" }}>{d.date === state.today ? "Today, " : ""}{formatReserveDate(d.date)}</h2>
                <ul style={{ padding: 0, margin: 0 }}>{d.items.map((b) => <Booking key={b.id} b={b} token={token} onChanged={load} />)}</ul>
              </div>
            ))}
            <p className="gp-note" style={{ marginTop: 14 }}>Wayfind does not take payment. Guests see a cancel or a new time right away.</p>
          </>
        ) : null}
      </section>
    </GroupFrame>
  );
}
