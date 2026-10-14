"use client";
// app/components/RemindMe.js: the "Remind me" button and its bottom sheet.
//
// Owner, 2026-10-14: "add a reminder to the person's phone about the event
// because i would forget ... and ask the user when they would like to be
// reminded." The sheet asks which night (when the event runs more than one),
// then when to be reminded, then hands the phone a calendar invite
// (GET /api/events/reminder) that carries one alert at that time.
//
// Every decision (which events qualify, which nights, which choices are still in
// the future, the alarm instant) comes from lib/eventReminder.js, the same
// module the server route uses, so the sheet cannot offer what the route would
// refuse.
//
// Used in two places: the action row of an event RailCard (variant "card", the
// Christmas red and rose gold skin styles it through the card's own button
// rules) and the event page action row (variant "page").
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { track } from "../../lib/track";
import { SITE_URL } from "../../lib/site";
import { siteTodayStr } from "../../lib/siteTime";
import {
  GOOGLE_ALERT_NOTE, REMINDER_CUSTOM_LABEL, clockText, customBounds, dayLabel, googleCalendarUrl,
  reminderDownloadPath, reminderNights, reminderOptions, resolveReminder, wallLabel,
} from "../../lib/eventReminder.js";

function Bell() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: "block", flex: "0 0 auto" }}>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

const C = { bg: "#111821", panel: "#161B22", line: "#2D3748", text: "#F1F5F9", sub: "#9AA7B8", accent: "#F97316", ink: "#0D1117" };
const S = {
  back: { position: "fixed", inset: 0, zIndex: 2147483000, background: "rgba(2,6,12,.66)", display: "flex", alignItems: "flex-end", justifyContent: "center", WebkitTapHighlightColor: "transparent" },
  sheet: { width: "100%", maxWidth: 520, maxHeight: "90dvh", overflowY: "auto", overscrollBehavior: "contain", boxSizing: "border-box", background: C.bg, color: C.text, border: "1px solid " + C.line, borderBottom: 0, borderRadius: "20px 20px 0 0", padding: "16px 16px calc(18px + env(safe-area-inset-bottom, 0px))", fontFamily: "var(--wf-sans, system-ui, sans-serif)", boxShadow: "0 -18px 48px rgba(0,0,0,.5)", outline: "none" },
  head: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  h: { margin: 0, fontSize: 20, fontWeight: 800, lineHeight: 1.25, color: C.text },
  ev: { margin: "4px 0 0", fontSize: 13.5, color: C.sub, lineHeight: 1.4 },
  x: { flex: "0 0 auto", width: 44, height: 44, marginTop: -6, marginRight: -8, border: 0, borderRadius: 12, background: "transparent", color: C.sub, fontSize: 24, lineHeight: 1, cursor: "pointer" },
  h2: { margin: "16px 0 8px", fontSize: 13, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: C.sub },
  note: { margin: "6px 0 0", fontSize: 13, color: C.sub, lineHeight: 1.45 },
  list: { display: "grid", gap: 8, margin: 0, padding: 0, border: 0, minInlineSize: 0 },
  date: { width: "100%", boxSizing: "border-box", minHeight: 48, padding: "10px 12px", borderRadius: 12, border: "1.5px solid " + C.line, background: C.panel, color: C.text, font: "inherit", fontSize: 16, colorScheme: "dark" },
  add: { display: "flex", alignItems: "center", justifyContent: "center", width: "100%", boxSizing: "border-box", minHeight: 48, marginTop: 18, padding: "12px 16px", borderRadius: 14, border: "1.5px solid " + C.accent, background: C.accent, color: C.ink, font: "inherit", fontSize: 16, fontWeight: 850, textDecoration: "none", cursor: "pointer", textAlign: "center" },
  addOff: { background: "transparent", color: C.sub, borderColor: C.line, cursor: "not-allowed" },
  g: { display: "flex", alignItems: "center", justifyContent: "center", minHeight: 44, marginTop: 6, color: "#FFB27A", fontSize: 14.5, fontWeight: 700, textDecoration: "underline", textUnderlineOffset: 3 },
  status: { margin: "10px 0 0", fontSize: 14, color: "#8ED6C4", lineHeight: 1.45 },
};
const choice = (on) => ({
  display: "flex", alignItems: "center", gap: 12, minHeight: 48, boxSizing: "border-box", padding: "9px 12px", borderRadius: 12, cursor: "pointer",
  border: "1.5px solid " + (on ? C.accent : C.line), background: on ? "rgba(249,115,22,.12)" : C.panel, color: C.text,
});
const radio = { width: 20, height: 20, margin: 0, flex: "0 0 auto", accentColor: C.accent };
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Keep taps, keys and presses inside the sheet from reaching the card (or the
// page) it was opened from. The sheet is a React child of the card even though
// the DOM portals it to <body>, so its events would otherwise bubble into the
// card's open-the-event handlers.
const STOP = ["onClick", "onKeyDown", "onKeyUp", "onMouseDown", "onMouseUp", "onPointerDown", "onPointerUp", "onTouchStart", "onTouchEnd"]
  .reduce((o, k) => { o[k] = (e) => e.stopPropagation(); return o; }, {});

function Sheet({ facts, ticketHref, nowMs, onClose, surface }) {
  const uid = useId();
  const today = siteTodayStr(new Date(nowMs));
  const nights = reminderNights(facts, today);
  const [night, setNight] = useState(nights.default || "");
  const [pick, setPick] = useState("");
  const [custom, setCustom] = useState("");
  const [sent, setSent] = useState(false);
  const ref = useRef(null);

  const options = night ? reminderOptions(facts, night, nowMs) : [];
  const live = options.filter((o) => o.available);
  const bounds = night ? customBounds(facts, night, nowMs) : null;
  const choiceValue = pick === "custom" ? custom : pick;
  const result = night && choiceValue ? resolveReminder(facts, night, choiceValue, { nowMs, today }) : null;
  const ready = !!(result && result.ok);
  const href = ready ? reminderDownloadPath(facts.slug, night, choiceValue) : null;
  const google = night ? googleCalendarUrl({ facts, night, siteUrl: SITE_URL, ticketHref }) : null;

  useEffect(() => {
    const opener = typeof document !== "undefined" ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const node = ref.current;
    if (node) node.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      if (opener && typeof opener.focus === "function") { try { opener.focus(); } catch {} }
    };
  }, []);

  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
    if (e.key !== "Tab" || !ref.current) return;
    const items = Array.from(ref.current.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!items.length) { e.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function chooseNight(next) {
    setNight(next);
    setSent(false);
    // A choice that has passed (or no longer fits) for the new night is dropped.
    if (pick && pick !== "custom") {
      const o = reminderOptions(facts, next, nowMs).find((x) => x.id === pick);
      if (!o || !o.available) setPick("");
    }
    if (pick === "custom") setCustom("");
  }

  function onAdd() {
    setSent(true);
    try { track("reminder_set", { slug: facts.slug, preset: result.preset, days_before: result.daysBefore, night, channel: "ics", surface }); } catch {}
  }
  function onGoogle() {
    try { track("reminder_set", { slug: facts.slug, preset: "google_default", days_before: null, night, channel: "google", surface }); } catch {}
  }

  const timeSuffix = facts.start_time ? " at " + clockText(Number(facts.start_time.slice(0, 2)), Number(facts.start_time.slice(3, 5))) : "";
  const titleId = uid + "-t";

  return (
    <div style={S.back} data-remind-backdrop {...STOP} onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} style={S.sheet} onKeyDown={onKey} data-remind-sheet>
        <div style={S.head}>
          <div>
            <h2 id={titleId} style={S.h}>When should we remind you?</h2>
            <p style={S.ev}>{facts.name}</p>
          </div>
          <button type="button" style={S.x} onClick={onClose} aria-label="Close">&times;</button>
        </div>

        {nights.kind === "list" || nights.kind === "range" ? (
          <>
            <h3 style={S.h2} id={uid + "-n"}>Which night?</h3>
            {nights.kind === "list" ? (
              <>
                <div role="radiogroup" aria-labelledby={uid + "-n"} style={S.list}>
                  {nights.nights.map((n) => (
                    <label key={n} style={choice(n === night)}>
                      <input type="radio" name={uid + "-night"} value={n} checked={n === night} onChange={() => chooseNight(n)} style={radio} />
                      <span style={{ fontSize: 15.5, fontWeight: 700 }}>{dayLabel(n)}{timeSuffix}</span>
                    </label>
                  ))}
                </div>
                {nights.more ? <p style={S.note}>{nights.more} more {nights.more === 1 ? "night" : "nights"} are listed on the event page.</p> : null}
              </>
            ) : (
              <>
                <input type="date" aria-labelledby={uid + "-n"} style={S.date} value={night} min={nights.min} max={nights.max}
                  onChange={(e) => { const v = e.target.value; if (v && v >= nights.min && v <= nights.max) chooseNight(v); }} />
                <p style={S.note}>{facts.select_nights ? "This event runs on select nights. Pick the night you plan to go." : "Pick the day you plan to go."}</p>
              </>
            )}
          </>
        ) : (
          <p style={S.note}>{dayLabel(night)}{timeSuffix}</p>
        )}

        {night && (live.length || bounds) ? (
          <>
            <h3 style={S.h2} id={uid + "-w"}>Reminder time</h3>
            <div role="radiogroup" aria-labelledby={uid + "-w"} style={S.list}>
              {live.map((o) => (
                <label key={o.id} style={choice(pick === o.id)}>
                  <input type="radio" name={uid + "-when"} value={o.id} checked={pick === o.id} onChange={() => { setPick(o.id); setSent(false); }} style={radio} />
                  <span><span style={{ display: "block", fontSize: 15.5, fontWeight: 700 }}>{o.label}</span><span style={{ display: "block", fontSize: 13, color: C.sub }}>{o.when}</span></span>
                </label>
              ))}
              {bounds ? (
                <label style={choice(pick === "custom")}>
                  <input type="radio" name={uid + "-when"} value="custom" checked={pick === "custom"} onChange={() => { setPick("custom"); setSent(false); }} style={radio} />
                  <span style={{ fontSize: 15.5, fontWeight: 700 }}>{REMINDER_CUSTOM_LABEL}</span>
                </label>
              ) : null}
            </div>
            {pick === "custom" && bounds ? (
              <div style={{ marginTop: 8 }}>
                <input type="datetime-local" aria-label="Reminder date and time" style={S.date} value={custom} min={bounds.min} max={bounds.max} step={300}
                  onChange={(e) => { setCustom(e.target.value); setSent(false); }} />
                {custom && result && !result.ok ? <p role="alert" style={{ ...S.note, color: "#FCA5A5" }}>{result.error}</p> : null}
              </div>
            ) : null}
          </>
        ) : (
          <p role="status" style={S.note}>There is no time left to remind you before this starts.</p>
        )}

        {ready ? (
          <a href={href} download={facts.slug + ".ics"} style={S.add} onClick={onAdd} data-remind-add>Add reminder to my phone</a>
        ) : (
          <button type="button" disabled aria-disabled="true" style={{ ...S.add, ...S.addOff }} data-remind-add>Add reminder to my phone</button>
        )}
        {sent ? <p role="status" style={S.status}>Open the downloaded file to save it to your calendar. The alert inside it is set for {result && result.ok ? wallLabel(facts.tz, result.alarmMs) : ""}.</p> : null}

        {google ? (
          <>
            <a href={google} target="_blank" rel="noopener noreferrer" style={S.g} onClick={onGoogle}>Use Google Calendar instead</a>
            <p style={{ ...S.note, textAlign: "center", marginTop: 0 }}>{GOOGLE_ALERT_NOTE}</p>
          </>
        ) : null}
      </div>
    </div>
  );
}

/**
 * @param {object} p
 * @param {object} p.facts       lib/eventReminder.reminderFacts(); null renders nothing
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

  const onOpen = (e) => {
    if (e) { e.stopPropagation(); e.preventDefault(); }
    setOpenedAt(now != null ? now : Date.now());
    setOpen(true);
    try { track("reminder_open", { slug: facts.slug, surface: surface || variant }); } catch {}
  };
  const close = () => setOpen(false);
  const sheet = open ? <Sheet facts={facts} ticketHref={ticketHref} nowMs={openedAt} onClose={close} surface={surface || variant} /> : null;
  const label = "Remind me";
  const aria = "Remind me about " + facts.name;

  return (
    <>
      {variant === "card" ? (
        <button type="button" className="wf-place-card-remind" aria-label={aria} aria-haspopup="dialog" onClick={onOpen}>
          <Bell /><span>{label}</span>
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
