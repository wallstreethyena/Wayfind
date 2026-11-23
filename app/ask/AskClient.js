"use client";
import { shareOut } from "../../lib/shareOut.js";
import { concreteSharePlaceId, groupPlanHref } from "../../lib/shareContext.js";
import { addStopToStoredTrips } from "../../lib/itineraryAdd.js";
import { track, recordInviteRecipient } from "../../lib/track.js";
import { useState, useMemo, useEffect, useRef } from "react";
import { Cat, Heart, Portrait, Couple, SantaConciergeSvg } from "./pixel.js";
import { ASK_CSS } from "./style.js";
import {
  ACTIVITIES, activityFor, activityHref, activityLinkLabel, askHeadline, yayLine,
  pleaAt, moodAt, yesText, noText, needsName, planFitsPlace, datedCardPath,
  inviteKinds, inviteDirectionsHref, inviteCalendarEvent, inviteItineraryStop,
  eventDateMismatch, eventVenueTimeZone, isEventDatePast,
} from "../../lib/dateInvite.js";
import { styleHtml } from "../../lib/styleHtml.js";

// app/ask/AskClient.js — Wayfind Chibi Elf invitation & Plan Together flow.
//
//   1 ASK       "Will you go out with me?" + proposed plan + YES / No + respectful pivots + Santa AI date helper
//   2 YAY       warm celebration with the Elf couple
//   3 ACTIVITY  what would you like to do
//   4 WHEN      pick or confirm a date
//   5 DONE      agreed plan summary (every row editable), Wayfind Santa AI calling the date with updates, share reply, toolkit
//   6 DECLINED  kind acknowledgment when the visitor declines


const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

/**
 * Parse an explicit date-only string ("YYYY-MM-DD") in local calendar time
 * so UTC midnight never shifts the calendar day backward, and preserve human
 * date labels ("Friday", "Sat, Oct 31") verbatim without replacing past dates.
 */
export function parseInviteWhen(raw) {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return { iso: "", label: "", date: null };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const da = Number(m[3]);
    const d = new Date(y, mo, da);
    if (!isNaN(d.getTime()) && d.getFullYear() === y && d.getMonth() === mo && d.getDate() === da) {
      const nowYear = new Date().getFullYear();
      const opts = { weekday: "short", month: "long", day: "numeric" };
      if (y !== nowYear) opts.year = "numeric";
      return { iso: s, label: d.toLocaleDateString(undefined, opts), date: d };
    }
  }
  return { iso: s, label: s, date: null };
}

const CLOUDS = [
  ["wfx-sky3", -6, 46, 46, 3], ["wfx-sky3", 44, 52, 52, 3],
  ["wfx-sky2", 8, 26, 44, 4], ["wfx-sky2", 56, 30, 50, 4],
  ["wfx-sky1", -10, 8, 52, 5], ["wfx-sky1", 40, 4, 62, 5],
];
function Cloud({ cls, left, bottom, width, rows }) {
  const bars = [];
  for (let i = 0; i < rows; i++) {
    const inset = i * 12;
    bars.push(
      <i key={i} style={{ left: inset + "%", right: inset + "%", bottom: (i * 9) + "px", height: "10px" }} />
    );
  }
  return (
    <div className={"wfx-cloud " + cls}
      style={{ left: left + "%", bottom: bottom + "%", width: width + "%", height: (rows * 9 + 10) + "px" }}>
      {bars}
    </div>
  );
}

function Decor() {
  const sparkles = [[7, 16], [24, 58], [80, 22], [91, 50], [42, 9], [64, 74], [13, 80], [88, 86]];
  const hearts = [[14, 5.2], [32, 7.8], [60, 6.4], [78, 9.1], [47, 11.5]];
  return (
    <>
      <div className="wfx-dither" aria-hidden="true" />
      <div className="wfx-scene" aria-hidden="true">
        {CLOUDS.map((c, i) => <Cloud key={i} cls={c[0]} left={c[1]} bottom={c[2]} width={c[3]} rows={c[4]} />)}
        <div className="wfx-skyline" />
        <div className="wfx-ground" />
      </div>
      {sparkles.map(([l, t], i) => (
        <div key={"s" + i} className="wfx-sparkle" aria-hidden="true"
          style={{ left: l + "%", top: t + "%", animationDelay: (i * 0.21) + "s" }} />
      ))}
      {hearts.map(([l, d], i) => (
        <div key={"h" + i} className="wfx-heart" aria-hidden="true"
          style={{ left: l + "%", bottom: "16%", animationDelay: d + "s" }}>
          <Heart size={18} tone="cream" />
        </div>
      ))}
    </>
  );
}

function venueTodayDate(timeZone) {
  const now = new Date();
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const y = Number((parts.find((p) => p.type === "year") || {}).value);
    const m = Number((parts.find((p) => p.type === "month") || {}).value);
    const da = Number((parts.find((p) => p.type === "day") || {}).value);
    if (y && m && da) return new Date(y, m - 1, da);
  } catch (e) {}
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

function nextDayFor(baseDate, targetDow, minAddDays = 1) {
  const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
  let add = (targetDow - d.getDay() + 7) % 7;
  if (add < minAddDays) add += 7;
  d.setDate(d.getDate() + add);
  const iso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const label = d.toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric" });
  return { iso, label, date: d };
}

function Calendar({ value, onPick, timeZone }) {
  const today = useMemo(() => venueTodayDate(timeZone), [timeZone]);
  const [offset, setOffset] = useState(0);
  const view = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const first = view.getDay();
  const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(view.getFullYear(), view.getMonth(), d));
  const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

  return (
    <div className="wfx-cal">
      <div className="wfx-calhead">
        <button className="wfx-calnav" onClick={() => setOffset((o) => Math.max(0, o - 1))}
          disabled={offset === 0} aria-label="Previous month">{"<"}</button>
        <span>{MONTHS[view.getMonth()]} {view.getFullYear()}</span>
        <button className="wfx-calnav" onClick={() => setOffset((o) => Math.min(2, o + 1))}
          disabled={offset === 2} aria-label="Next month">{">"}</button>
      </div>
      <div className="wfx-caldays" aria-hidden="true">{DAYS.map((d, i) => <div key={i}>{d}</div>)}</div>
      <div className="wfx-calgrid">
        {cells.map((d, i) => d === null
          ? <div key={"e" + i} />
          : (
            <button key={iso(d)} className="wfx-day" disabled={d < today}
              aria-pressed={value === iso(d)} onClick={() => onPick(iso(d), d)}>
              {d.getDate()}
            </button>
          ))}
      </div>
    </div>
  );
}

export default function AskClient({ inv, bad = false }) {
  const venueTz = useMemo(() => eventVenueTimeZone(inv && inv.geo), [inv && inv.geo]);
  const proposedWhen = useMemo(() => parseInviteWhen(inv && inv.when), [inv && inv.when]);
  const suggested = useMemo(() => inviteKinds(inv), [inv]);

  const [step, setStep] = useState("ask");
  const [nos, setNos] = useState(0);
  const [activity, setActivity] = useState(() => suggested[0] || "");
  const [dayIso, setDayIso] = useState(() => proposedWhen.iso);
  const [dayLabel, setDayLabel] = useState(() => proposedWhen.label);
  const [customPlace, setCustomPlace] = useState("");
  const [santaOpen, setSantaOpen] = useState(false);
  const [santaDraft, setSantaDraft] = useState("");
  // "" | "ringing" | "updated"
  const [santaCallState, setSantaCallState] = useState("");
  const [santaCallSummary, setSantaCallSummary] = useState("");
  const [showMoreTools, setShowMoreTools] = useState(false);
  // "" | "options" | "copied" | "failed"
  const [sent, setSent] = useState("");
  const [paused, setPaused] = useState(false);

  const [look, setLook] = useState({ x: 0, y: 0 });
  const [eager, setEager] = useState(0);

  const scheduledEventWhen = useMemo(
    () => parseInviteWhen(inv && inv.eventDate ? String(inv.eventDate).split(",")[0].split("..")[0] : ""),
    [inv && inv.eventDate]
  );
  const [detachedEvent, setDetachedEvent] = useState(false);
  const inviteSurface = (inv && inv.surface) || "direct";

  const loadedRef = useRef(false);
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    if (inv) recordInviteRecipient(inv);
    track("ask_invite_loaded", {
      has_invite: Boolean(inv),
      bad_link: Boolean(bad),
      surface: inviteSurface,
      has_event_date: Boolean(inv && inv.eventDate),
    });
  }, [inv, bad, inviteSurface]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVis = () => setPaused(Boolean(document.hidden));
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (step !== "activity" && step !== "when") { setEager(0); return; }
    setEager(1);
    const a = setTimeout(() => setEager(2), 4200);
    const b = setTimeout(() => setEager(3), 9000);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [step]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fine = !!(window.matchMedia && window.matchMedia("(pointer: fine)").matches);
    if (!fine) return;
    let raf = 0, next = null;
    const apply = () => { raf = 0; if (next) setLook(next); };
    const onMove = (e) => {
      const w = window.innerWidth || 1, h = window.innerHeight || 1;
      next = { x: (e.clientX / w) * 2 - 1, y: (e.clientY / h) * 2 - 1 };
      if (!raf) raf = window.requestAnimationFrame(apply);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, []);

  const [who, setWho] = useState("");
  const [note, setNote] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => { setHydrated(true); }, []);

  const memKey = inv && inv.key ? "wf_ask_" + inv.key : "";
  useEffect(() => {
    setStep("ask");
    setNos(0);
    setSent("");
    setActivity(suggested[0] || "");
    setDayIso(proposedWhen.iso);
    setDayLabel(proposedWhen.label);
    setCustomPlace("");
    setSantaCallState("");
    setSantaCallSummary("");
    setWho("");
    setNote("");
    if (!memKey) return;
    try {
      const raw = window.localStorage.getItem(memKey);
      if (!raw) return;
      const m = JSON.parse(raw);
      if (!m || typeof m !== "object") return;
      if (m.step && m.step !== "ask" && m.step !== "yay" && m.step !== "declined") setStep(m.step);
      if (m.activity) setActivity(m.activity);
      if (m.dayIso) setDayIso(m.dayIso);
      if (m.dayLabel) setDayLabel(m.dayLabel);
      if (m.customPlace) setCustomPlace(m.customPlace);
      if (m.santaCallSummary) {
        setSantaCallSummary(m.santaCallSummary);
        setSantaCallState("updated");
      }
      if (m.who) setWho(m.who);
      if (m.note) setNote(m.note);
    } catch (e) {}
  }, [memKey]);

  useEffect(() => {
    if (!memKey || step === "ask" || step === "declined") return;
    try {
      window.localStorage.setItem(
        memKey,
        JSON.stringify({ step, activity, dayIso, dayLabel, customPlace, santaCallSummary, who, note })
      );
    } catch (e) {}
  }, [memKey, step, activity, dayIso, dayLabel, customPlace, santaCallSummary, who, note]);

  const from = (inv && inv.from) || "";
  const city = (inv && inv.city) || "";
  const placeId = concreteSharePlaceId(inv && inv.id);

  useEffect(() => {
    if (step === "yay") { const t = setTimeout(() => setStep("activity"), 2600); return () => clearTimeout(t); }
  }, [step]);

  useEffect(() => {
    if (santaCallState !== "ringing") return;
    const t = setTimeout(() => setSantaCallState("updated"), 1350);
    return () => clearTimeout(t);
  }, [santaCallState]);

  const triggerSantaCall = (summaryText) => {
    setSantaCallSummary(summaryText);
    setSantaCallState("ringing");
    track("ask_invite_action", { action: "santa_call_update", surface: inviteSurface });
  };

  const applySantaChange = (patch) => {
    const today = venueTodayDate(venueTz);
    let nextAct = patch.activity !== undefined ? patch.activity : (activity || suggested[0] || "dinner");
    let nextIso = patch.dayIso !== undefined ? patch.dayIso : dayIso;
    let nextLabel = patch.dayLabel !== undefined ? patch.dayLabel : dayLabel;
    let nextPlace = patch.customPlace !== undefined ? patch.customPlace : customPlace;
    if (patch.detach) {
      setDetachedEvent(true);
    }
    if (patch.activity !== undefined) setActivity(nextAct);
    if (patch.dayIso !== undefined) setDayIso(nextIso);
    if (patch.dayLabel !== undefined) setDayLabel(nextLabel);
    if (patch.customPlace !== undefined) setCustomPlace(nextPlace);
    if (!nextLabel && !nextIso) {
      const fri = nextDayFor(today, 5, 1);
      nextIso = fri.iso;
      nextLabel = fri.label;
      setDayIso(nextIso);
      setDayLabel(nextLabel);
    }
    const actWord = (activityFor(nextAct) || {}).label || "our outing";
    const whereWord = nextPlace
      ? nextPlace
      : (patch.detach ? ("a fresh spot" + (city ? " in " + city : "")) : ((inv && inv.place) || (city ? city : "our spot")));
    const whenWord = nextLabel || "a better day";
    const summary = `switched the plan to ${actWord} at ${whereWord} on ${whenWord}`;
    triggerSantaCall(summary);
    if (step === "ask") setStep("done");
  };

  const handleSantaFreeText = () => {
    const raw = String(santaDraft || "").trim();
    if (!raw) return;
    const lower = raw.toLowerCase();
    const today = venueTodayDate(venueTz);
    const patch = {};
    if (/\b(friday|fri)\b/.test(lower)) {
      const d = nextDayFor(today, 5, 1);
      patch.dayIso = d.iso; patch.dayLabel = d.label;
    } else if (/\b(saturday|sat)\b/.test(lower)) {
      const d = nextDayFor(today, 6, 1);
      patch.dayIso = d.iso; patch.dayLabel = d.label;
    } else if (/\b(sunday|sun)\b/.test(lower)) {
      const d = nextDayFor(today, 0, 1);
      patch.dayIso = d.iso; patch.dayLabel = d.label;
    } else if (/\b(tomorrow)\b/.test(lower)) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      patch.dayIso = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      patch.dayLabel = d.toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric" });
    }
    if (/\b(coffee|cafe|brunch|breakfast|quick|bite|lunch)\b/.test(lower)) patch.activity = "bite";
    else if (/\b(drink|drinks|cocktail|bar|wine|brewery)\b/.test(lower)) patch.activity = "tonight";
    else if (/\b(dinner|eat|food|steak|sushi)\b/.test(lower)) patch.activity = "dinner";
    else if (/\b(walk|park|museum|new|gem|explore)\b/.test(lower)) patch.activity = "hidden";
    else if (/\b(drive|trip|getaway)\b/.test(lower)) patch.activity = "drive";

    // If they named a specific place or asked for a different spot
    const atMatch = /\b(?:at|try|go\s+to)\s+([A-Za-z0-9'’& -]{2,40}?)(?:\s+on\s+(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*|\s+this\s+|\s+tomorrow|$)/i.exec(raw);
    const cleanedSpot = atMatch ? atMatch[1].trim() : "";
    if (cleanedSpot && !/^(friday|fri|saturday|sat|sunday|sun|tomorrow|dinner|drinks|coffee|lunch|brunch)$/i.test(cleanedSpot)) {
      patch.customPlace = cleanedSpot;
      patch.detach = true;
    } else if (!patch.activity && !patch.dayIso) {
      if (/\b(another spot|different place|somewhere else|change spot)\b/.test(lower)) {
        patch.detach = true;
        patch.customPlace = "";
      } else {
        patch.customPlace = raw.slice(0, 48);
        patch.detach = true;
      }
    }
    setSantaDraft("");
    applySantaChange(patch);
  };

  const burst = (e) => {
    if (typeof document === "undefined") return;
    try {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const r = e.currentTarget.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const host = document.createElement("div");
      host.className = "wfx-burst";
      host.style.transform = "translate(" + x + "px," + y + "px)";
      for (let i = 0; i < 14; i++) {
        const a = (Math.PI * 2 * i) / 14 + (i % 2 ? 0.22 : 0);
        const d = 90 + (i % 4) * 34;
        const h = document.createElement("i");
        h.style.setProperty("--dx", Math.round(Math.cos(a) * d) + "px");
        h.style.setProperty("--dy", Math.round(Math.sin(a) * d - 40) + "px");
        h.style.setProperty("--rot", (i % 2 ? 1 : -1) * (20 + i * 7) + "deg");
        h.style.animationDelay = (i % 5) * 22 + "ms";
        const sz = 16 + (i % 3) * 6;
        h.innerHTML = (i % 3 === 0)
          ? '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 24 24">'
            + '<path d="M12 2 L14.8 9.2 L22 12 L14.8 14.8 L12 22 L9.2 14.8 L2 12 L9.2 9.2 Z" fill="' + (i % 2 ? "#FFD166" : "#00F5D4") + '"/></svg>'
          : '<svg width="' + sz + '" height="' + sz + '" viewBox="0 0 48 40">'
            + '<path d="M 24 36 C 10 26 3 17 3 9.5 C 3 4 7.5 0 13 0 C 17.5 0 21.5 2.8 24 6.8 C 26.5 2.8 30.5 0 35 0 C 40.5 0 45 4 45 9.5 C 45 17 38 26 24 36 Z" fill="#FF2A85" stroke="#23143B" stroke-width="3.5" stroke-linejoin="round"/>'
            + '<ellipse cx="14" cy="8.5" rx="4.5" ry="2.5" transform="rotate(-25 14 8.5)" fill="#FFFFFF" opacity="0.88"/></svg>';
        host.appendChild(h);
      }
      document.body.appendChild(host);
      setTimeout(() => { try { host.remove(); } catch (er) {} }, 1100);
    } catch (er) {}
  };

  const replyText = () => {
    const base = yesText(inv, activity, dayLabel, { name: who, note });
    if (!santaCallState && !customPlace) return base;
    return yesText(inv, activity, dayLabel, {
      name: who,
      note,
      placeName: customPlace,
      santaCall: Boolean(santaCallState),
    });
  };
  const declineReplyText = () => noText(inv, { name: who, note });

  const ordered = (() => {
    const k = suggested[0];
    if (!k) return ACTIVITIES;
    const hit = ACTIVITIES.filter((a) => a.id === k);
    return hit.length ? hit.concat(ACTIVITIES.filter((a) => a.id !== k)) : ACTIVITIES;
  })();

  const [saving, setSaving] = useState(false);
  const [itinerarySaved, setItinerarySaved] = useState(false);
  const eventIsPast = useMemo(
    () => Boolean(!detachedEvent && inv && inv.eventDate && isEventDatePast(inv)),
    [detachedEvent, inv]
  );
  const hasEventDateConflict = useMemo(
    () => Boolean(!detachedEvent && !eventIsPast && inv && inv.place && planFitsPlace(inv, activity) && eventDateMismatch(inv, dayIso)),
    [detachedEvent, eventIsPast, inv, activity, dayIso]
  );
  const effectiveInv = useMemo(() => {
    if (!inv) return null;
    if (customPlace) {
      return { ...inv, place: customPlace, id: "", eventDate: "", when: dayIso || inv.when };
    }
    if (detachedEvent || hasEventDateConflict || eventIsPast) {
      return { ...inv, place: "", id: "", eventDate: "", when: "" };
    }
    return inv;
  }, [inv, customPlace, dayIso, detachedEvent, hasEventDateConflict, eventIsPast]);

  const cardWhere = customPlace || ((!detachedEvent && !hasEventDateConflict && !eventIsPast && inv && inv.place && (planFitsPlace(inv, activity) ? inv.place : "")) || "");
  const cardUrl = () => datedCardPath(activity, dayLabel, cardWhere);

  const proposedIsPast = useMemo(() => {
    if (!proposedWhen.date) return false;
    const today = venueTodayDate(venueTz);
    return proposedWhen.date < today;
  }, [proposedWhen.date, venueTz]);

  const calendarEvent = useMemo(
    () => inviteCalendarEvent(effectiveInv, activity, dayIso, dayLabel),
    [effectiveInv, activity, dayIso, dayLabel]
  );
  const directionsHref = useMemo(
    () => inviteDirectionsHref(effectiveInv, activity),
    [effectiveInv, activity]
  );
  const itineraryStop = useMemo(
    () => inviteItineraryStop(effectiveInv, activity, dayLabel, dayIso),
    [effectiveInv, activity, dayLabel, dayIso]
  );
  const groupHref = useMemo(
    () => groupPlanHref(placeId, inv && inv.place),
    [placeId, inv]
  );

  const saveToItinerary = () => {
    if (!itineraryStop) return false;
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        let current = {};
        try {
          const raw = window.localStorage.getItem("wf_trips_v1");
          const parsed = raw ? JSON.parse(raw) : null;
          if (parsed && typeof parsed === "object") current = parsed;
        } catch (er) {}
        const res = addStopToStoredTrips(current, itineraryStop, Date.now(), {
          autoOrder: true,
          addedVia: "ask_invite",
        });
        if (res && res.trips) {
          const cleanDay = /^\d{4}-\d{2}-\d{2}$/.test(String(dayIso || "").trim()) ? String(dayIso).trim() : "";
          const nextTrips = { ...res.trips };
          for (const k of Object.keys(nextTrips)) {
            const t = nextTrips[k];
            if (!t || !Array.isArray(t.items)) continue;
            if (t.items.some((it) => it && it.id === itineraryStop.id)) {
              nextTrips[k] = {
                ...t,
                items: t.items.map((it) => {
                  if (!it || it.id !== itineraryStop.id) return it;
                  return {
                    ...it,
                    ...(cleanDay ? { day: it.day || cleanDay } : {}),
                    note: it.note || itineraryStop.note || "",
                  };
                }),
              };
            }
          }
          window.localStorage.setItem("wf_trips_v1", JSON.stringify(nextTrips));
        }
        if (res && Array.isArray(res.events)) {
          for (const ev of res.events) {
            if (ev && ev.name) track(ev.name, ev.props);
          }
        }
        setItinerarySaved(true);
        track("ask_invite_itinerary_saved", {
          surface: inviteSurface,
          has_place: Boolean(effectiveInv && effectiveInv.place && planFitsPlace(effectiveInv, activity)),
          activity,
          city,
          day_iso: dayIso || "",
          already: Boolean(res && res.already),
        });
        return true;
      }
    } catch (e) {}
    return false;
  };

  const buildRestOfDay = () => {
    saveToItinerary();
    track("ask_invite_planner_opened", {
      surface: inviteSurface,
      activity,
      city,
      day_iso: dayIso || "",
      has_place: Boolean(effectiveInv && effectiveInv.place),
    });
    try {
      const q = [];
      if (city) q.push("city=" + encodeURIComponent(city));
      if (dayIso && /^\d{4}-\d{2}-\d{2}$/.test(dayIso)) q.push("date=" + encodeURIComponent(dayIso));
      window.location.href = "/itinerary" + (q.length ? "?" + q.join("&") : "");
    } catch (e) {}
  };

  const downloadIcs = () => {
    if (!calendarEvent || !calendarEvent.icsText) return;
    track("ask_invite_calendar_added", { surface: inviteSurface, target: "ics", activity, has_place: Boolean(effectiveInv && effectiveInv.place) });
    try {
      const blob = new Blob([calendarEvent.icsText], { type: "text/calendar;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "wayfind-plan.ics";
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        try { a.remove(); URL.revokeObjectURL(url); } catch (er) {}
      }, 400);
    } catch (e) {}
  };

  const saveCard = async () => {
    if (saving) return;
    track("ask_invite_action", { action: "save_card" });
    const url = cardUrl();
    setSaving(true);
    let file = null;
    try {
      const r = await fetch(url);
      const blob = await r.blob();
      file = new File([blob], "its-a-date.png", { type: "image/png" });
    } catch (e) {}
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
      } catch (e) {
        if (!(e && e.name === "AbortError")) { setSaving(false); try { window.open(url, "_blank", "noopener"); } catch (er) {} return; }
      }
      setSaving(false);
      return;
    }
    setSaving(false);
    try { window.open(url, "_blank", "noopener"); } catch (e) {}
  };

  const sendReplyText = (text) => {
    track("ask_invite_action", { action: "share_reply" });
    const how = shareOut({ title: "Your reply", text }, () => setSent("copied"), { textOnly: true });
    setSent(how === "failed" ? "failed" : "options");
  };

  const tellThem = () => sendReplyText(replyText());
  const tellThemDeclined = () => sendReplyText(declineReplyText());

  const suggestedActivityLabel = suggested[0] && activityFor(suggested[0]) ? activityFor(suggested[0]).label : "";
  const BUBBLES = [
    "Not feeling this exact plan? Pick what works for you! ✨",
    "We can totally switch the day or the spot 🥺",
    "Your call — another day, another vibe, or no thanks 💛",
    "Even my hat bell is rooting for a good plan 🔔",
    "Whatever you choose, thanks for checking it out! ✨",
  ];

  const planWasModified = Boolean(
    customPlace ||
    detachedEvent ||
    santaCallState ||
    (proposedWhen.iso && dayIso && dayIso !== proposedWhen.iso) ||
    (suggested[0] && activity && activity !== suggested[0])
  );

  const renderSantaConcierge = (compactPrompt) => {
    const today = venueTodayDate(venueTz);
    const fri = nextDayFor(today, 5, 1);
    const sat = nextDayFor(today, 6, 1);
    const senderLabel = from || "your date";
    return (
      <div className="wfx-santa-box" data-wf-santa-date-concierge="1" aria-label="Wayfind Santa AI date assistant">
        <div className="wfx-santa-top">
          <div className="wfx-santa-ava" aria-hidden="true">
            <div style={{ width: "46px", height: "54px" }}>
              <SantaConciergeSvg calling={Boolean(santaCallState)} />
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="wfx-santa-badge">🎅 Wayfind Santa AI · Your Date Wingman</span>
            <div className="wfx-santa-msg">
              {compactPrompt
                ? `${senderLabel} suggested the starting idea, but YOU are in charge! Want me to switch the day, vibe, or spot and call ${senderLabel} with the update?`
                : `Want to tweak anything? Tell me what to change and I’ll call ${senderLabel} right now to update the date for you.`}
            </div>
          </div>
        </div>
        <div className="wfx-santa-chips" role="group" aria-label="Quick plan changes with Santa AI">
          <button
            type="button"
            className="wfx-santa-chip"
            data-santa-tweak="friday"
            onClick={() => applySantaChange({ dayIso: fri.iso, dayLabel: fri.label })}>
            📅 Move to Friday
          </button>
          <button
            type="button"
            className="wfx-santa-chip"
            data-santa-tweak="saturday"
            onClick={() => applySantaChange({ dayIso: sat.iso, dayLabel: sat.label })}>
            📅 Move to Saturday
          </button>
          <button
            type="button"
            className="wfx-santa-chip"
            data-santa-tweak="coffee"
            onClick={() => applySantaChange({ activity: "bite" })}>
            ☕ Coffee / Quick Bite
          </button>
          <button
            type="button"
            className="wfx-santa-chip"
            data-santa-tweak="dinner"
            onClick={() => applySantaChange({ activity: "dinner" })}>
            🍽️ Switch to Dinner
          </button>
          <button
            type="button"
            className="wfx-santa-chip"
            data-santa-tweak="spot"
            onClick={() => {
              setSantaOpen(true);
              applySantaChange({ detach: true, customPlace: "" });
            }}>
            📍 Pick another spot
          </button>
          <button
            type="button"
            className="wfx-santa-chip"
            data-santa-tweak="custom"
            aria-pressed={santaOpen}
            onClick={() => setSantaOpen((o) => !o)}>
            {santaOpen ? "Hide custom request" : "✨ Custom Santa request"}
          </button>
        </div>
        {santaOpen ? (
          <div className="wfx-santa-input-row">
            <input
              className="wfx-santa-input"
              value={santaDraft}
              maxLength={80}
              onChange={(e) => setSantaDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSantaFreeText(); }}
              aria-label="Tell Santa AI what to change on the date"
              placeholder={"e.g. \"Move to Saturday\" or \"Let's go to Ulele\""}
            />
            <button type="button" className="wfx-santa-send" onClick={handleSantaFreeText}>
              Have Santa Update
            </button>
          </div>
        ) : null}
      </div>
    );
  };

  const renderSantaCallCard = () => {
    if (!santaCallState && !planWasModified) return null;
    const senderLabel = from || "your date";
    const isRinging = santaCallState === "ringing";
    const actWord = (activityFor(activity) || {}).label || "Drinks";
    const whereWord = customPlace
      ? customPlace
      : (!detachedEvent && !hasEventDateConflict && !eventIsPast && inv && inv.place && planFitsPlace(inv, activity)
          ? inv.place
          : ("a new spot" + (city ? " in " + city : "")));
    const whenWord = dayLabel || "our new day";
    return (
      <div className="wfx-call-card" role="status" aria-live="polite" data-wf-santa-call-card="1">
        <div className="wfx-call-head">
          <div className="wfx-call-left">
            <div className="wfx-call-ring" aria-hidden="true">
              <span style={{ fontSize: "20px" }}>📞</span>
            </div>
            <div>
              <div className="wfx-call-status">
                {isRinging ? `Ringing ${senderLabel}…` : `Santa called ${senderLabel} · Plan Updated ✓`}
              </div>
              <div className="wfx-call-title">
                {isRinging
                  ? `Wayfind Santa is calling ${senderLabel} with your changes…`
                  : `Santa updated ${senderLabel}: you’re on the line!`}
              </div>
            </div>
          </div>
        </div>
        <div className="wfx-call-transcript">
          <b>Santa on speaker:</b>{" "}
          {`“Ho ho ho ${senderLabel}! Good news — it’s a YES, and we made a quick upgrade to the plan: we’re doing `}
          <b>{actWord}</b>
          {whereWord ? <>{" at "}<b>{whereWord}</b></> : null}
          {whenWord ? <>{" on "}<b>{whenWord}</b></> : null}
          {`!”`}
        </div>
      </div>
    );
  };

  return (
    <div className={"wfx" + (paused ? " wfx-paused" : "")} data-hydrated={hydrated ? "1" : undefined}>
      <style dangerouslySetInnerHTML={styleHtml(ASK_CSS)} />
      <Decor />
      <div className="wfx-stage">

        {bad && !inv ? (
          <div className="wfx-alert" role="alert">
            This invitation link looks incomplete or damaged, so the venue details could not be read. You can still respond below or explore Wayfind.
          </div>
        ) : null}

        {step === "ask" && (
          <>
            {nos > 0 ? (
              <div className="wfx-bubble" key={"b" + nos} role="status" aria-live="polite">
                {BUBBLES[Math.min(nos - 1, BUBBLES.length - 1)]}
              </div>
            ) : null}
            <Portrait><Cat tone="cream" mood={moodAt(nos)} size={104} key={nos} look={look} /></Portrait>
            <h1 className="wfx-h1" key={step}>{askHeadline(inv)}</h1>
            {from ? <p className="wfx-sub">from {from} · you can accept as-is or customize the plan</p> : null}
            {inv && (inv.place || suggestedActivityLabel || proposedWhen.label || inv.note) ? (
              <div className="wfx-plan-preview" aria-label="Proposed plan">
                {inv.place ? (
                  <div className="wfx-card-row">
                    <span>
                      <strong>{from ? from + "’s idea" : "Proposed spot"}</strong>
                      {" · "}
                      <span>{customPlace || inv.place}{city ? " (" + city + ")" : ""}</span>
                    </span>
                    <button
                      type="button"
                      className="wfx-edit-pill"
                      onClick={() => {
                        setSent("");
                        setStep("activity");
                      }}>
                      Change vibe
                    </button>
                  </div>
                ) : null}
                {(suggestedActivityLabel || proposedWhen.label) ? (
                  <div className="wfx-card-row">
                    <span>
                      <strong>Proposed day</strong>
                      {" · "}
                      <span>{[suggestedActivityLabel, dayLabel || proposedWhen.label].filter(Boolean).join(" · ")}</span>
                    </span>
                    <button
                      type="button"
                      className="wfx-edit-pill"
                      onClick={() => {
                        setSent("");
                        if (!activity) setActivity(suggested[0] || "dinner");
                        setStep("when");
                      }}>
                      Pick your day
                    </button>
                  </div>
                ) : null}
                {inv.note ? <div className="wfx-plan-note">“{inv.note}”</div> : null}
              </div>
            ) : null}
            <div className="wfx-row">
              <button className="wfx-yes" style={{ "--s": 1 }}
                onClick={(e) => {
                  burst(e);
                  setSent("");
                  track("ask_invite_choice", { choice: "yes", has_place: Boolean(inv && inv.place) });
                  setStep("yay");
                }}>YES</button>
              <button className="wfx-no" style={{ "--n": 1 }}
                onClick={() => {
                  setNos((n) => n + 1);
                  track("ask_invite_choice", { choice: "no", has_place: Boolean(inv && inv.place) });
                }}>No</button>
            </div>
            {renderSantaConcierge(true)}
            {nos > 0 ? (
              <>
                <p className="wfx-plea" key={nos}>{pleaAt(nos)}</p>
                <div className="wfx-pivots" role="group" aria-label="Other ways to answer">
                  <button className="wfx-pivot-btn" data-pivot="day"
                    onClick={() => {
                      setSent("");
                      if (!activity) setActivity(suggested[0] || "dinner");
                      track("ask_invite_choice", { choice: "maybe_another_day", has_place: Boolean(inv && inv.place) });
                      setStep("when");
                    }}>
                    Maybe another day
                  </button>
                  <button className="wfx-pivot-btn" data-pivot="activity"
                    onClick={() => {
                      setSent("");
                      track("ask_invite_choice", { choice: "suggest_something_else", has_place: Boolean(inv && inv.place) });
                      setStep("activity");
                    }}>
                    Suggest something else
                  </button>
                  <button className="wfx-pivot-btn wfx-pivot-decline" data-pivot="decline"
                    onClick={() => {
                      setSent("");
                      track("ask_invite_choice", { choice: "decline", has_place: Boolean(inv && inv.place) });
                      setStep("declined");
                    }}>
                    No thanks
                  </button>
                </div>
              </>
            ) : null}
          </>
        )}

        {step === "declined" && (
          <>
            <Portrait><Cat tone="cream" mood={moodAt(nos || 1)} size={104} look={look} /></Portrait>
            <h1 className="wfx-h1" key={step}>No worries. Thanks for letting me know.</h1>
            <p className="wfx-sub">
              {from
                ? "You can share a quick reply with " + from + " below, or suggest another plan whenever you’re ready."
                : "You can share a quick reply below, or suggest another plan whenever you’re ready."}
            </p>
            {needsName(inv) ? (
              <input className="wfx-field" value={who} maxLength={24} enterKeyHint="done"
                onChange={(e) => setWho(e.target.value)}
                aria-label="Your name (optional)"
                placeholder="Your name (optional)" />
            ) : null}
            <input className="wfx-field" value={note} maxLength={120} enterKeyHint="done"
              onChange={(e) => setNote(e.target.value)}
              aria-label="Add a message, optional"
              placeholder="Say something back (optional)" />
            <button className="wfx-go" onClick={tellThemDeclined}>
              {sent === "copied" ? "LINK COPIED ✓" : "SHARE YOUR ANSWER"}
            </button>
            {sent ? (
              <p className="wfx-sub" role="status" aria-live="polite">
                {sent === "options" ? "Share your answer — choose your message app and press Send there." :
                 sent === "copied" ? "Link copied. Paste your reply into your chat with " + (from || "them") + "." :
                 "Could not open share options — copy your reply above and text it to " + (from || "them") + "."}
              </p>
            ) : null}
            <div className="wfx-pivots" role="group" aria-label="Change or pivot answer">
              <button className="wfx-pivot-btn" onClick={() => {
                setSent("");
                if (!activity) setActivity(suggested[0] || "dinner");
                setStep("when");
              }}>
                Maybe another day
              </button>
              <button className="wfx-pivot-btn" onClick={() => {
                setSent("");
                setStep("activity");
              }}>
                Suggest something else
              </button>
            </div>
            <button className="wfx-go wfx-go2" onClick={() => { setSent(""); setNos(0); setStep("yay"); }}>
              Changed my mind — say YES
            </button>
            <a className="wfx-quiet" href={city ? "/best-of?city=" + encodeURIComponent(city) : "/"}>
              Explore Wayfind
            </a>
          </>
        )}

        {step === "yay" && (
          <>
            <Portrait size={138}><Couple size={64} /></Portrait>
            <h1 className="wfx-h1" key={step}>· YAY! ·</h1>
            <p className="wfx-sub">{yayLine(inv)}</p>
            <button className="wfx-quiet" onClick={() => setStep("activity")}>Continue →</button>
          </>
        )}

        {step === "activity" && (
          <>
            <Portrait><Cat tone="cream" mood="love" size={104} look={look} fidget={eager} /></Portrait>
            <h1 className="wfx-h1" key={step}>What would you like to do?</h1>
            <p className="wfx-sub">
              {from ? `${from} suggested ${suggestedActivityLabel || "an outing"} — keep it or pick your favorite vibe` : "Pick the vibe you want for this date"}
            </p>
            <div className="wfx-grid">
              {ordered.map((a) => (
                <button key={a.id} className="wfx-chip" aria-pressed={activity === a.id}
                  onClick={() => {
                    setActivity(a.id);
                    if (suggested[0] && a.id !== suggested[0]) {
                      triggerSantaCall(`switched the activity to ${a.label}`);
                    }
                  }}>
                  {a.label}
                  {suggested.indexOf(a.id) === 0
                    ? <span className="wfx-tag">{from ? from + "’s idea" : "their idea"}</span>
                    : null}
                </button>
              ))}
            </div>
            <button className="wfx-go" disabled={!activity} onClick={() => {
              track("ask_invite_activity_selected", {
                activity,
                matches_suggested: suggested.indexOf(activity) === 0,
                fits_place: Boolean(planFitsPlace(inv, activity)),
              });
              setStep("when");
            }}>LOCK IT IN</button>
          </>
        )}

        {step === "when" && (
          <>
            <Portrait><Cat tone="panda" mood="happy" size={104} look={look} fidget={eager} /></Portrait>
            <h1 className="wfx-h1" key={step}>Pick a date</h1>
            <p className="wfx-sub">
              {proposedWhen.label
                ? `${from || "They"} proposed ${proposedWhen.label} — keep it or tap any day that works better for you`
                : "Choose the day for our plans together"}
            </p>
            {proposedWhen.label && !proposedIsPast ? (
              <button
                className="wfx-chip"
                style={{ width: "100%", marginTop: "14px", minHeight: "48px" }}
                aria-pressed={!detachedEvent && dayIso === proposedWhen.iso && dayLabel === proposedWhen.label}
                onClick={() => {
                  setDetachedEvent(false);
                  setDayIso(proposedWhen.iso);
                  setDayLabel(proposedWhen.label);
                }}>
                <span>{from ? from + "’s proposed date: " : "Proposed date: "}{proposedWhen.label}</span>
              </button>
            ) : null}
            {proposedWhen.label && proposedIsPast ? (
              <div className="wfx-alert" role="status">
                The originally proposed date ({proposedWhen.label}) has passed — pick a fresh day below.
              </div>
            ) : null}
            {eventIsPast && inv && inv.place ? (
              <div className="wfx-alert" role="status" data-event-date-past="1">
                <div>
                  <b>Heads up:</b> The scheduled dates for {inv.place} have passed.
                </div>
                <div className="wfx-pivots" style={{ marginTop: "8px" }}>
                  <button
                    type="button"
                    className="wfx-pivot-btn"
                    onClick={() => {
                      setDetachedEvent(true);
                      track("ask_invite_action", { action: "detach_past_event", surface: inviteSurface });
                    }}>
                    {"Keep " + (dayLabel || "this date") + " & pick another spot"}
                  </button>
                </div>
              </div>
            ) : null}
            {hasEventDateConflict ? (
              <div className="wfx-alert" role="status" data-event-date-mismatch="1">
                <div>
                  <b>Heads up:</b> {inv.place} is scheduled for {scheduledEventWhen.label || inv.eventDate}, not {dayLabel || dayIso}.
                </div>
                <div className="wfx-pivots" style={{ marginTop: "8px" }}>
                  <button
                    type="button"
                    className="wfx-pivot-btn"
                    onClick={() => {
                      setDetachedEvent(false);
                      setDayIso(scheduledEventWhen.iso || proposedWhen.iso);
                      setDayLabel(scheduledEventWhen.label || proposedWhen.label);
                    }}>
                    {"Use event date (" + (scheduledEventWhen.label || inv.eventDate) + ")"}
                  </button>
                  <button
                    type="button"
                    className="wfx-pivot-btn"
                    onClick={() => {
                      setDetachedEvent(true);
                      track("ask_invite_action", { action: "detach_dated_event", surface: inviteSurface });
                    }}>
                    {"Keep " + (dayLabel || "this date") + " & pick another spot"}
                  </button>
                </div>
              </div>
            ) : null}
            <Calendar value={dayIso} timeZone={venueTz} onPick={(iso, d) => {
              const lbl = d.toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric" });
              setDayIso(iso);
              setDayLabel(lbl);
              if (proposedWhen.iso && iso !== proposedWhen.iso) {
                triggerSantaCall(`moved the date to ${lbl}`);
              }
            }} />
            <button className="wfx-go" disabled={!dayIso} onClick={() => {
              track("ask_invite_date_selected", {
                surface: inviteSurface,
                day_iso: dayIso,
                kept_proposed: Boolean(proposedWhen.iso && dayIso === proposedWhen.iso),
                event_date_mismatch: hasEventDateConflict,
              });
              track("ask_invite_completed", {
                surface: inviteSurface,
                activity,
                day_iso: dayIso,
                has_place: Boolean(effectiveInv && effectiveInv.place && planFitsPlace(effectiveInv, activity)),
                city,
              });
              setStep("done");
            }}>IT'S A DATE</button>
          </>
        )}

        {step === "done" && (
          <>
            <Portrait size={90}><Couple size={46} /></Portrait>
            <h1 className="wfx-h1" key={step}>It's a date</h1>
            <p className="wfx-sub">
              {planWasModified
                ? `You customized the plan — Santa is updating ${from || "your date"} and your reply is ready below.`
                : "Your plan is set — tap Change on any line or ask Wayfind Santa AI to tweak it."}
            </p>

            {renderSantaCallCard()}

            <div className="wfx-card" aria-label="Your date plan — tap Change to edit any detail">
              <div className="wfx-card-row">
                <div><b>When</b> · {dayLabel || "Pick a day"}</div>
                <button
                  type="button"
                  className="wfx-edit-pill"
                  data-edit-plan="when"
                  onClick={() => setStep("when")}>
                  Change day
                </button>
              </div>
              <div className="wfx-card-row">
                <div><b>What</b> · {(activityFor(activity) || {}).label}</div>
                <button
                  type="button"
                  className="wfx-edit-pill"
                  data-edit-plan="activity"
                  onClick={() => setStep("activity")}>
                  Change vibe
                </button>
              </div>
              {customPlace ? (
                <div className="wfx-card-row">
                  <div><b>Your pick</b> · {customPlace}{city ? " (" + city + ")" : ""}</div>
                  <button
                    type="button"
                    className="wfx-edit-pill"
                    onClick={() => setSantaOpen(true)}>
                    Change spot
                  </button>
                </div>
              ) : (!detachedEvent && !hasEventDateConflict && !eventIsPast && inv && inv.place && planFitsPlace(inv, activity) ? (
                <div className="wfx-card-row">
                  <div><b>{from ? from + "'s idea" : "Their idea"}</b> · {inv.place}{city ? " (" + city + ")" : ""}</div>
                  <button
                    type="button"
                    className="wfx-edit-pill"
                    data-edit-plan="spot"
                    onClick={() => {
                      setSantaOpen(true);
                    }}>
                    Change spot
                  </button>
                </div>
              ) : ((detachedEvent || hasEventDateConflict || eventIsPast) && inv && inv.place ? (
                <div className="wfx-card-row">
                  <div><b>Date note</b> · {inv.place} runs on {scheduledEventWhen.label || inv.eventDate} — pick a spot for {dayLabel} below</div>
                  <button
                    type="button"
                    className="wfx-edit-pill"
                    onClick={() => setSantaOpen(true)}>
                    Pick spot
                  </button>
                </div>
              ) : (inv && inv.place ? (
                <div className="wfx-card-row">
                  <div><b>New plan</b> · not {inv.place} then — pick the spot below</div>
                  <button
                    type="button"
                    className="wfx-edit-pill"
                    onClick={() => setSantaOpen(true)}>
                    Pick spot
                  </button>
                </div>
              ) : null)))}
              {inv && inv.note ? <div className="wfx-card-row"><div><b>Note</b> · “{inv.note}”</div></div> : null}
              {from ? <div className="wfx-card-row"><div><b>With</b> · {from}</div></div> : null}
              {(who || (inv && inv.to)) ? <div className="wfx-card-row"><div><b>From</b> · {who || inv.to}</div></div> : null}
            </div>

            {renderSantaConcierge(false)}

            {needsName(inv) ? (
              <input className="wfx-field" value={who} maxLength={24} enterKeyHint="done"
                onChange={(e) => setWho(e.target.value)}
                aria-label="Your name, so they know who said yes"
                placeholder="Your name" />
            ) : null}
            <input className="wfx-field" value={note} maxLength={120} enterKeyHint="done"
              onChange={(e) => setNote(e.target.value)}
              aria-label="Add a message, optional"
              placeholder="Say something back (optional)" />

            <button className="wfx-go" onClick={tellThem}>
              {sent === "copied"
                ? "LINK COPIED ✓"
                : sent === "options"
                  ? "SHARE YOUR ANSWER"
                  : (planWasModified
                      ? ("SEND SANTA'S UPDATE TO " + (from ? from.toUpperCase() : "THEM"))
                      : ("TELL " + (from ? from.toUpperCase() : "THEM") + " · SHARE YOUR ANSWER"))}
            </button>
            {sent ? (
              <p className="wfx-sub" role="status" aria-live="polite">
                {sent === "options" ? "Share your answer — choose your message app and press Send there." :
                 sent === "copied" ? "Link copied. Paste your reply into your chat with " + (from || "them") + "." :
                 "Could not open share options — copy the plan above and text it to " + (from || "them") + "."}
              </p>
            ) : null}

            <div className="wfx-toolkit" role="group" aria-label="Complete your plan">
              {itineraryStop ? (
                <button
                  type="button"
                  className={"wfx-tool-btn" + (itinerarySaved ? " wfx-tool-saved" : "")}
                  onClick={saveToItinerary}>
                  {itinerarySaved ? "SAVED ✓" : "+ SAVE TO ITINERARY"}
                </button>
              ) : null}
              {itineraryStop ? (
                <button
                  type="button"
                  className="wfx-tool-btn"
                  data-wf-build-day="1"
                  onClick={buildRestOfDay}>
                  Build the rest of the day →
                </button>
              ) : null}
              {calendarEvent ? (
                <>
                  <a className="wfx-tool-btn" href={calendarEvent.googleHref}
                    target="_blank" rel="noopener noreferrer"
                    onClick={() => track("ask_invite_calendar_added", { surface: inviteSurface, target: "google", activity })}>
                    + Google Calendar
                  </a>
                  <button type="button" className="wfx-tool-btn" onClick={downloadIcs}>
                    + Apple / iCal (.ics)
                  </button>
                </>
              ) : null}
              {placeId && !customPlace && !detachedEvent && !hasEventDateConflict && !eventIsPast && inv && inv.place && planFitsPlace(inv, activity) ? (
                <a className="wfx-tool-btn" href={"/p/" + encodeURIComponent(placeId)}
                  onClick={() => track("ask_invite_action", { action: "open_place", surface: inviteSurface })}>
                  {"Open " + inv.place + " on Wayfind"}
                </a>
              ) : null}
              {directionsHref ? (
                <a className="wfx-tool-btn" href={directionsHref}
                  target="_blank" rel="noopener noreferrer"
                  onClick={() => track("ask_invite_directions", { surface: inviteSurface, has_place: Boolean(effectiveInv && effectiveInv.place), city })}>
                  Directions →
                </a>
              ) : null}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "14px", marginTop: "10px" }}>
              <button type="button" className="wfx-quiet" style={{ marginTop: 0 }} onClick={saveCard} disabled={saving}>
                {saving ? "Making card…" : "Save the date card"}
              </button>
              <a className="wfx-quiet" style={{ marginTop: 0 }} href={activityHref(activity, city, inv && inv.geo)}
                onClick={() => track("ask_invite_action", { action: "explore_activity" })}>
                {activityLinkLabel(activity, city)}
              </a>
              {groupHref ? (
                <a className="wfx-quiet" style={{ marginTop: 0 }} href={groupHref}
                  onClick={() => track("ask_invite_action", { action: "group_vote" })}>
                  Bringing friends? Group Vote →
                </a>
              ) : null}
            </div>
            <div className="wfx-mark">
              <span>arranged with</span>
              <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2.6c-4.1 0-7.4 3.3-7.4 7.4 0 5 6.4 10.7 6.9 11.1a.8.8 0 0 0 1 0c.5-.4 6.9-6.1 6.9-11.1 0-4.1-3.3-7.4-7.4-7.4Z"
                  fill="none" stroke="#9B6BA8" strokeWidth="2.1" />
                <circle cx="12" cy="9.8" r="2.6" fill="#9B6BA8" />
              </svg>
              <span>wayfind</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}


