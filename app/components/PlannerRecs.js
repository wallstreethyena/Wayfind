"use client";
// Picks the site AI returns for "one restaurant", "best brunch?", "3 bars in St Pete" (owner 2026-11-28: answer
// exactly what was asked). Exactly the places the server chose, each with its open or hours status, a link to its
// Wayfind page, "Book a table" for restaurants (a tap starts the booking, it never books), and one small optional
// "Turn this into a plan" button. Nothing here builds a plan unless that button is pressed.
import { C } from "./kit";

const STATUS_COLOR = { open: C.green, today: C.green, unknown: C.muted, later: C.muted };

export default function PlannerRecs({ picks, planPrompt, disabled, onBook, onPlan }) {
  const list = Array.isArray(picks) ? picks.filter((p) => p && p.id && p.name) : [];
  if (!list.length) return null;
  return (
    <div data-wf-recs={list.length} style={{ margin: "8px 0 4px", display: "grid", gap: 8 }}>
      {list.map((p) => {
        const meta = [p.type, p.city, Number.isFinite(p.distanceMi) ? `${p.distanceMi} mi` : null].filter(Boolean).join(" · ");
        return (
          <div key={p.id} data-wf-rec={p.id} data-wf-rec-status={p.status} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text, overflowWrap: "anywhere" }}>
              {p.href ? <a href={p.href} style={{ color: C.text, textDecoration: "none" }}>{p.name}</a> : p.name}
            </div>
            {meta ? <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2, overflowWrap: "anywhere" }}>{meta}</div> : null}
            {p.statusLabel ? <div style={{ fontSize: 12.5, fontWeight: 700, color: STATUS_COLOR[p.status] || C.muted, marginTop: 4 }}>{p.statusLabel}</div> : null}
            {p.take ? <div style={{ fontSize: 13, color: C.light, marginTop: 4, lineHeight: 1.4 }}>{p.take}</div> : null}
            {p.isFood && onBook ? (
              <button type="button" data-wf-rec-book={p.id} disabled={disabled} onClick={() => onBook({ placeId: p.id, name: p.name })}
                style={{ marginTop: 8, background: "transparent", border: `1px solid ${C.border}`, color: C.text, borderRadius: 999, padding: "6px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", minHeight: 32 }}>
                Book a table
              </button>
            ) : null}
          </div>
        );
      })}
      {planPrompt && onPlan ? (
        <button type="button" data-wf-rec-plan="1" disabled={disabled} onClick={() => onPlan(planPrompt)}
          style={{ justifySelf: "start", background: "transparent", border: "none", color: C.accent, fontSize: 13, fontWeight: 700, padding: "4px 2px", cursor: "pointer", minHeight: 32 }}>
          Turn this into a plan
        </button>
      ) : null}
    </div>
  );
}
