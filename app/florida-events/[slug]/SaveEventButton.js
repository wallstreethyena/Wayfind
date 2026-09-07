"use client";
// app/florida-events/[slug]/SaveEventButton.js — v9.00. "Save and share"
// (owner's premium-event-page list, 2026-09-07). ShareButton already existed
// on this page; nothing on it let a reader SAVE an event to come back to
// later. Wired through the SAME lib/contentCardActions.js store RailCard,
// IconicPlaceCard and the aggregator event page's EventActions all use, so a
// save made HERE shows up as saved everywhere else — one save store across
// the product, not a second one invented for this page.
import { useContentCardActions } from "../../../lib/contentCardActions";

function Heart({ filled }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill={filled ? "currentColor" : "none"} stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ display: "block", flex: "0 0 auto" }}>
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
    </svg>
  );
}

/**
 * @param {string} id    the content key ("wfc:" + event_id), same prefix the
 *                       aggregator feed and EventActions already use, so a
 *                       save made from either surface for the same event
 *                       dedupes against the other.
 * @param {string} name  the event's display name (used for the saved-item title)
 * @param {string} image a photo path, or null
 * @param {string} url   ABSOLUTE, server-resolved share/canonical url
 */
export default function SaveEventButton({ id, name, image, url }) {
  const actions = useContentCardActions(id ? { id, type: "event", title: name, image: image || null, url: url || null } : null);
  if (!id) return null;
  return (
    <button
      type="button"
      aria-pressed={actions.saved}
      onClick={actions.toggleSave}
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
        padding: "11px 18px", borderRadius: 999, cursor: "pointer",
        font: "inherit", fontSize: 14, fontWeight: 800, lineHeight: 1,
        background: actions.saved ? "#F97316" : "transparent",
        color: actions.saved ? "#0D1117" : "#F1F5F9",
        border: actions.saved ? "1.5px solid #F97316" : "1.5px solid #2D3748",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <Heart filled={actions.saved} />
      <span>{actions.saved ? "Saved" : "Save"}</span>
    </button>
  );
}
