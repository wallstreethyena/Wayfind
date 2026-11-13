"use client";
// "My reservations": the guest's bookings from GET /api/reserve/history (cancel, accept or decline a new time),
// plus the OpenTable handoffs remembered on this device ("Started on OpenTable"). Lazy: opened from the reserve sheet
// header and from the account sheet, never loaded eagerly.
import { useCallback, useEffect, useState } from "react";
import { C } from "./kit";
import { mainBtn, quietBtn, linkBtn, errStyle, Shell, showInHost } from "./reserveUi.js";
import { reserveHistory, cancelBooking, answerProposal, readHandoffs, reserveGoUrl, timeLabel, dateLabel } from "../../lib/reserveClientApi.js";
import { siteTodayStr } from "../../lib/siteTime.js";

const STATUS = { confirmed: "Booked", proposed: "New time offered", cancelled: "Cancelled", completed: "Done", no_show: "Missed" };

function Row({ children, id }) {
  return <div data-reserve-row={id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "12px 14px", marginBottom: 10 }}>{children}</div>;
}

export function ReserveHistoryView({ onClose }) {
  const [state, setState] = useState({ s: "loading", bookings: [] });
  const [handoffs, setHandoffs] = useState([]);
  const [busyId, setBusyId] = useState("");
  const [askId, setAskId] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const r = await reserveHistory();
    if (r.status === 401) setState({ s: "signedout", bookings: [] });
    else if (r.ok && Array.isArray(r.bookings)) setState({ s: "ready", bookings: r.bookings });
    else setState({ s: "error", bookings: [] });
  }, []);
  useEffect(() => { setHandoffs(readHandoffs()); load(); }, [load]);

  const patch = (b) => setState((st) => ({ ...st, bookings: st.bookings.map((x) => (x.id === b.id ? { ...x, ...b } : x)) }));
  async function cancel(b) {
    if (busyId) return;
    setBusyId(b.id); setError("");
    const r = await cancelBooking(b.id);
    setBusyId(""); setAskId("");
    if (r.ok && r.booking) patch(r.booking); else setError(r.message || "We could not cancel that. Please try again, or call the restaurant.");
  }
  async function answer(b, accept) {
    if (busyId) return;
    setBusyId(b.id); setError("");
    const r = await answerProposal(b.id, accept);
    setBusyId("");
    if (r.ok && r.booking) patch(r.booking); else setError(r.message || "We could not save your answer. Please try again.");
  }

  const today = siteTodayStr();
  const list = state.bookings.slice().sort((a, b) => String(b.date + b.time).localeCompare(String(a.date + a.time)));
  return (
    <Shell title="My reservations" onClose={onClose} titleId="wf-reserve-mine-title">
      {error ? <div role="alert" style={errStyle}>{error}</div> : null}
      {state.s === "loading" ? <div style={{ fontSize: 14, color: C.muted }}>Loading your reservations</div> : null}
      {state.s === "signedout" ? <div style={{ fontSize: 14, color: C.light, marginBottom: 12 }}>Sign in to see your Wayfind reservations.</div> : null}
      {state.s === "error" ? <div role="alert" style={errStyle}>We could not load your reservations. Please try again.</div> : null}
      {state.s === "ready" && !list.length ? <div data-reserve-empty="1" style={{ fontSize: 14, color: C.light, marginBottom: 12 }}>No reservations yet.</div> : null}
      {list.map((b) => {
        const live = (b.status === "confirmed" || b.status === "proposed") && b.date >= today;
        return (
          <Row key={b.id} id={b.id}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text, overflowWrap: "anywhere" }}>{b.restaurantName || "Restaurant"}</div>
            <div style={{ fontSize: 14, color: C.light, margin: "2px 0" }}>{dateLabel(b.date)} {"·"} {timeLabel(b.time)} {"·"} {b.partySize} {b.partySize === 1 ? "person" : "people"}</div>
            <div style={{ fontSize: 13, color: b.status === "cancelled" ? C.muted : C.green, fontWeight: 700 }}>{STATUS[b.status] || b.status}{b.confirmationCode && b.status === "confirmed" ? " · Code " + b.confirmationCode : ""}</div>
            {b.status === "proposed" && live ? (
              <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                <div style={{ fontSize: 14, color: C.text }}>New time: {dateLabel(b.proposedDate)} {"·"} {timeLabel(b.proposedTime)}</div>
                <button type="button" style={mainBtn} disabled={!!busyId} onClick={() => answer(b, true)}>Accept new time</button>
                <button type="button" style={quietBtn} disabled={!!busyId} onClick={() => answer(b, false)}>Keep looking</button>
                <div style={{ fontSize: 12, color: C.muted, textAlign: "center" }}>Keep looking cancels your current table.</div>
              </div>
            ) : null}
            {b.status === "confirmed" && live ? (
              askId === b.id ? (
                <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Cancel this table?</div>
                  <button type="button" style={mainBtn} disabled={!!busyId} onClick={() => cancel(b)}>Yes, cancel it</button>
                  <button type="button" style={quietBtn} disabled={!!busyId} onClick={() => setAskId("")}>Keep my table</button>
                </div>
              ) : <button type="button" data-reserve-cancel={b.id} style={{ ...quietBtn, marginTop: 8 }} onClick={() => setAskId(b.id)}>Cancel</button>
            ) : null}
          </Row>
        );
      })}
      {handoffs.length ? (
        <div data-reserve-handoffs="1" style={{ marginTop: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 8 }}>Started on OpenTable</div>
          {handoffs.map((h, i) => (
            <Row key={h.placeId + h.date + h.time + i} id={"ot-" + i}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text, overflowWrap: "anywhere" }}>{h.name || "Restaurant"}</div>
              <div style={{ fontSize: 14, color: C.light, margin: "2px 0 6px" }}>{[h.date ? dateLabel(h.date) : "", h.time ? "around " + timeLabel(h.time) : "", h.party ? h.party + (h.party === 1 ? " person" : " people") : ""].filter(Boolean).join(" · ")}</div>
              <div style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>Started on OpenTable. Confirm there, we cannot see the result.</div>
              <a href={reserveGoUrl({ placeId: h.placeId, date: h.date, time: h.time, party: h.party })} target="_blank" rel="noopener noreferrer" style={linkBtn}>Open on OpenTable again</a>
            </Row>
          ))}
        </div>
      ) : null}
    </Shell>
  );
}

export function showReserveHistory() {
  showInHost((close) => <ReserveHistoryView onClose={close} />);
}
export default ReserveHistoryView;
