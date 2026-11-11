"use client";
import { useEffect, useState } from "react";
import { GroupFrame } from "../../../group-plans/GroupFrame.js";
import { formatReserveDate, formatReserveTime } from "../../../../lib/reserveFormat.js";

// Reads with GET (never changes anything). Only a button press sends the answer.
const DONE = {
  confirmed: "Thank you. We told the guest you have a table for them.",
  declined: "Thank you. We told the guest you can't fit that time.",
  expired: "This request ran out of time, so it can no longer be answered.",
  cancelled: "The guest cancelled this request.",
};

export default function RespondClient({ token }) {
  const [state, setState] = useState({ phase: "loading" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/reserve/respond?t=" + encodeURIComponent(token), { cache: "no-store" })
      .then((r) => r.json().catch(() => null))
      .then((j) => { if (alive) setState(j && j.ok ? { phase: "ready", request: j.request } : { phase: "error", message: (j && j.message) || "We could not load this request." }); })
      .catch(() => { if (alive) setState({ phase: "error", message: "We could not load this request. Please try again." }); });
    return () => { alive = false; };
  }, [token]);

  const answer = async (action) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/reserve/respond", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, action }), cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (j && j.ok) setState((s) => ({ phase: "answered", request: s.request, status: j.status }));
      else setState((s) => ({ ...s, notice: (j && j.message) || "That did not go through. Please try again." }));
    } catch { setState((s) => ({ ...s, notice: "That did not go through. Please try again." })); }
    setBusy(false);
  };

  const q = state.request;
  return (
    <GroupFrame>
      <section className="gp-panel">
        {state.phase === "loading" ? <p className="gp-status" role="status">Loading the request...</p> : null}
        {state.phase === "error" ? <p className="gp-status gp-error" role="alert">{state.message}</p> : null}
        {q ? (
          <>
            <div className="gp-step">Table request</div>
            <h1 style={{ margin: "0 0 8px", fontSize: 24 }}>{q.restaurantName}</h1>
            <p>A Wayfind guest would like a table.</p>
            <ul style={{ listStyle: "none", padding: 0, margin: "12px 0", lineHeight: 1.9 }}>
              <li><strong>People:</strong> {q.partySize}</li>
              <li><strong>Day:</strong> {formatReserveDate(q.date)}</li>
              <li><strong>Time:</strong> {formatReserveTime(q.time)}</li>
              <li><strong>Name:</strong> {q.guestName}</li>
              {q.note ? <li><strong>Note:</strong> {q.note}</li> : null}
            </ul>
          </>
        ) : null}
        {state.phase === "ready" && q.status === "pending" ? (
          <>
            {state.notice ? <p className="gp-status gp-error" role="alert">{state.notice}</p> : null}
            <div className="gp-actions" style={{ display: "grid", gap: 10, marginTop: 16 }}>
              <button type="button" className="gp-button primary" disabled={busy} onClick={() => answer("confirm")}>Yes, we have the table</button>
              <button type="button" className="gp-button" disabled={busy} onClick={() => answer("decline")}>Sorry, we can&apos;t</button>
            </div>
            <p className="gp-note" style={{ marginTop: 14 }}>Wayfind does not take payment.</p>
          </>
        ) : null}
        {state.phase === "ready" && q.status !== "pending" ? <p className="gp-status" role="status">{q.status === "expired" ? DONE.expired : "This request was already answered. Thank you."}</p> : null}
        {state.phase === "answered" ? <p className="gp-status gp-success" role="status">{DONE[state.status] || "Thank you."}</p> : null}
      </section>
    </GroupFrame>
  );
}
