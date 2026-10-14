"use client";
// app/components/RemindMe.js: the "Remind me" button. The bottom sheet it opens
// lives in RemindMeSheet.js and is fetched on the first tap.
//
// Owner, 2026-10-14: "add a reminder to the person's phone about the event
// because i would forget ... and ask the user when they would like to be
// reminded." The sheet asks which night (when the event runs more than one),
// then when to be reminded, then hands the phone a calendar invite
// (GET /api/events/reminder) that carries one alert at that time.
//
// Every decision comes from lib/eventReminder.js, the same module the server
// route uses, so the sheet cannot offer what the route would refuse.
//
// Used in two places: the action row of an event RailCard (variant "card") and
// the event page action row (variant "page").
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { track } from "../../lib/track";
import { siteTodayStr } from "../../lib/siteTime";
import { reminderNights, reminderOptions } from "../../lib/eventReminder.js";

/** True when no reminder time is left: nothing upcoming, or a single night whose presets have all passed. */
export function reminderSpent(facts, nowMs) {
  const n = reminderNights(facts, siteTodayStr(new Date(nowMs)), nowMs);
  if (n.kind === "none") return true;
  return n.kind === "single" && !reminderOptions(facts, n.default, nowMs).some((o) => o.available);
}

const RemindMeSheet = dynamic(() => import("./RemindMeSheet.js"), { ssr: false });

function Bell() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block", flex: "0 0 auto" }}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

/**
 * @param {object} p
 * @param {object} p.facts       lib/eventReminderFacts.reminderFactsFor(); null renders nothing
 * @param {string} p.variant     "card" (RailCard action row) | "page" (event page)
 * @param {string} p.ticketHref  an on-site /api/<x>/go path for the Google link, or null
 * @param {string} p.surface     analytics surface
 * @param {number} p.now         epoch ms override (guards)
 * @param {boolean} p.defaultOpen open on mount (guards)
 * @param {boolean} p.portal     false renders the sheet in place (guards)
 */
export default function RemindMe({ facts, variant = "card", ticketHref = null, surface = "", now = null, defaultOpen = false, portal = true }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [openedAt, setOpenedAt] = useState(() => (now != null ? now : Date.now()));
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!facts) return null;
  const today = siteTodayStr(now != null ? new Date(now) : new Date());
  if (reminderNights(facts, today).kind === "none") return null;
  // After mount (so the server HTML and the first client render agree), a
  // reminder with no future time left drops the bell.
  if (mounted && !open && reminderSpent(facts, now != null ? now : Date.now())) return null;

  const onOpen = (e) => {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    setOpenedAt(now != null ? now : Date.now());
    setOpen(true);
    try { track("reminder_open", { slug: facts.slug, surface: surface || variant }); } catch {}
  };
  const close = () => setOpen(false);
  const sheet = open ? <RemindMeSheet facts={facts} ticketHref={ticketHref} nowMs={openedAt} onClose={close} surface={surface || variant} /> : null;
  const label = "Remind me";
  const aria = "Remind me";

  return (
    <>
      {variant === "card" ? (
        <button type="button" className="wf-place-card-remind" aria-label={aria} aria-haspopup="dialog" onClick={onOpen}>
          <Bell /><span className="wf-remind-label">{label}</span>
        </button>
      ) : (
        <button type="button" aria-label={aria} aria-haspopup="dialog" onClick={onOpen}
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 44, padding: "11px 18px", borderRadius: 999, cursor: "pointer", font: "inherit", fontSize: 14, fontWeight: 800, lineHeight: 1, background: "transparent", color: "#F1F5F9", border: "1.5px solid #2D3748", WebkitTapHighlightColor: "transparent" }}>
          <Bell /><span>{label}</span>
        </button>
      )}
      {sheet && portal && mounted && typeof document !== "undefined" ? createPortal(sheet, document.body) : null}
      {sheet && !portal ? sheet : null}
    </>
  );
}
