"use client";
import { useEffect, useRef } from "react";
import { eventCostSummary, eventRestrictions, eventVisitStatus } from "../../lib/eventVisitFacts.js";

// A real dialog, not a hover-only title: touch and keyboard users get the same
// complete verified schedule, fees and entry rules without leaving the card.
export default function EventVisitDetails({ event, title, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal();
    return () => { dialog?.close(); if (previousFocus?.isConnected) previousFocus.focus?.(); };
  }, []);
  const close = () => { ref.current?.close(); onClose(); };
  const status = eventVisitStatus(event);
  const restrictions = eventRestrictions(event);
  return <dialog ref={ref} className="wf-event-visit-dialog" aria-label={`Plan ${title}`} onCancel={(e) => { e.preventDefault(); close(); }} onClick={(e) => e.stopPropagation()}>
    <button type="button" className="wf-event-visit-close" onClick={close} aria-label="Close visit details">×</button>
    <h3>{title}</h3>
    {status ? <p><strong>{status.label}{status.value ? ` · ${status.value}` : ""}</strong>{status.nextDate ? ` · Next session ${status.nextDate}${status.nextTime ? ` at ${status.nextTime}` : ""}` : ""}</p> : null}
    <p>{event.schedule_note || "Check the official event calendar for hours."}</p>
    <p><strong>{eventCostSummary(event)}</strong></p>
    {event.visit_cost?.note ? <p>{event.visit_cost.note}</p> : null}
    {restrictions.length ? <ul>{restrictions.map((rule) => <li key={rule}>{rule}</li>)}</ul> : null}
    {event.visit_source_url ? <a href={event.visit_source_url} target="_blank" rel="noopener noreferrer">Official visit information ↗</a> : null}
    <p className="wf-event-visit-note">Hours and prices can change. Confirm your date before travelling.</p>
  </dialog>;
}
