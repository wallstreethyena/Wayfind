"use client";
import { shareOut } from "../../lib/shareOut.js";
import { concreteSharePlaceId, groupPlanHref } from "../../lib/shareContext.js";
import { addStopToStoredTrips } from "../../lib/itineraryAdd.js";
import { track, recordInviteRecipient } from "../../lib/track.js";
import { setLocal } from "../../lib/localStore.js";
import { mergeTripMaps } from "../../lib/trips.js";
import { safeLocalStorage, safeSessionStorage } from "../../lib/safeStorage.js";
import { itineraryPlanHref, writePlannerHandoff } from "../../lib/itineraryHandoff.js";
import { useState, useMemo, useEffect, useRef } from "react";
import { Cat, Heart, Portrait, Couple, SantaConciergeSvg, SantaCallStage } from "./pixel.js";
import { ASK_CSS } from "./style.js";
import {
  ACTIVITIES, activityFor, activityHref, activityLinkLabel, askHeadline, yayLine,
  pleaAt, moodAt, yesScale, noScale, yesText, noText, needsName, planFitsPlace, datedCardPath,
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

const SANTA_CITY_SPOTS = {
  tampa: [
    { name: "Ulele", kind: "dinner", hook: "Riverwalk views & fire-grilled native Florida dining" },
    { name: "Rocca", kind: "dinner", hook: "Handmade pasta, tableside mozzarella & Michelin star" },
    { name: "Bern's Steak House", kind: "dinner", hook: "Iconic Tampa date night & Harry Waugh Dessert Room" },
    { name: "Olivia", kind: "dinner", hook: "Modern Italian kitchen with an electric South Tampa room" },
    { name: "Bulla Gastrobar Tampa", kind: "tonight", hook: "Lively Spanish tapas, sangria & rooftop cocktails" },
    { name: "Ciro's Speakeasy", kind: "tonight", hook: "Intimate Prohibition cocktail lounge & supper club" },
    { name: "CW's Gin Joint", kind: "tonight", hook: "Downtown jazz, craft cocktails & velvet booths" },
    { name: "Oxford Exchange", kind: "bite", hook: "Sunlit conservatory for coffee, champagne & brunch" },
    { name: "Armature Works", kind: "hidden", hook: "Waterfront market, cocktails & Riverwalk sunset walk" },
  ],
  "st. petersburg": [
    { name: "Il Ritorno", kind: "dinner", hook: "Downtown St. Pete handmade pasta & intimate lighting" },
    { name: "Allelo", kind: "dinner", hook: "Mediterranean coastal dining on Beach Drive" },
    { name: "Ceviche Tapas Bar", kind: "dinner", hook: "Romantic Spanish tapas & sangria by the waterfront" },
    { name: "The Saint Speakeasy", kind: "tonight", hook: "Hidden velvet cocktail bar with theatrical drinks" },
    { name: "Canopy Rooftop Lounge", kind: "tonight", hook: "Panoramic bay views & rooftop cocktails on Beach Drive" },
    { name: "Bandit Coffee Co.", kind: "bite", hook: "Bright specialty coffee & pastry date in Grand Central" },
    { name: "The Dalí Museum", kind: "hidden", hook: "Surrealist masterpieces & waterfront garden walk" },
  ],
  orlando: [
    { name: "Prato", kind: "dinner", hook: "Park Avenue Winter Park Italian & wood-fired dishes" },
    { name: "Kres Chophouse", kind: "dinner", hook: "Historic downtown steakhouse with late-night energy" },
    { name: "Mathers Social Gathering", kind: "tonight", hook: "Third-floor antique bookshop speakeasy & cocktails" },
    { name: "The Guesthouse", kind: "tonight", hook: "Mills 50 neighborhood cocktail lounge with lush patio" },
    { name: "Briarpatch Restaurant", kind: "bite", hook: "Park Avenue brunch, famous pancakes & patio seating" },
    { name: "East End Market", kind: "bite", hook: "Artisan food hall, Gideon's cookies & courtyard coffee" },
    { name: "Leu Gardens", kind: "hidden", hook: "50-acre botanical gardens & shaded walking paths" },
  ],
  sarasota: [
    { name: "Indigenous", kind: "dinner", hook: "Romantic Towles Court bungalow & seasonal seafood" },
    { name: "Owen's Fish Camp", kind: "dinner", hook: "Burns Court backyard banyan tree, live music & seafood" },
    { name: "Chart House", kind: "dinner", hook: "Waterfront dining on Longboat Key with sunset bay views" },
    { name: "Kojo", kind: "dinner", hook: "Modern Asian dining & craft cocktails downtown" },
    { name: "Cask and Ale", kind: "tonight", hook: "Downtown whiskey & craft cocktail lounge" },
    { name: "Perq Coffee Bar", kind: "bite", hook: "Specialty espresso, latte art & sunny courtyard" },
    { name: "The Ringling", kind: "hidden", hook: "Bayfront courtyard, art museum & waterfront grounds" },
  ],
  miami: [
    { name: "Mandolin Aegean Bistro", kind: "dinner", hook: "Blue-and-white garden courtyard in the Design District" },
    { name: "COTE Miami", kind: "dinner", hook: "Michelin-starred Korean steakhouse & cocktail bar" },
    { name: "Lagniappe", kind: "tonight", hook: "Backyard fairy lights, charcuterie, wine & live jazz" },
    { name: "Sweet Liberty", kind: "tonight", hook: "Award-winning cocktails & lively South Beach vibe" },
    { name: "Panther Coffee Wynwood", kind: "bite", hook: "Small-batch roasted coffee under the Wynwood trees" },
    { name: "Vizcaya Museum & Gardens", kind: "hidden", hook: "Biscayne Bay Italian Villa gardens & waterfront stroll" },
  ],
  default: [
    { name: "Ulele", kind: "dinner", hook: "Waterfront views & fire-grilled Florida dining" },
    { name: "Oxford Exchange", kind: "bite", hook: "Sunlit conservatory for coffee, cocktails & brunch" },
    { name: "Bulla Gastrobar", kind: "tonight", hook: "Lively Spanish tapas, sangria & craft cocktails" },
    { name: "Bern's Steak House", kind: "dinner", hook: "Classic candlelit dinner & famous dessert room" },
    { name: "Armature Works", kind: "hidden", hook: "Waterfront food hall, drinks & evening stroll" },
  ],
};

function pickCityPool(cityStr) {
  const c = String(cityStr || "").trim().toLowerCase();
  if (!c) return SANTA_CITY_SPOTS.default;
  if (c.includes("tampa") || c.includes("ybor")) return SANTA_CITY_SPOTS.tampa;
  if (c.includes("pete") || c.includes("clearwater") || c.includes("dunedin")) return SANTA_CITY_SPOTS["st. petersburg"];
  if (c.includes("orlando") || c.includes("winter park") || c.includes("kissimmee")) return SANTA_CITY_SPOTS.orlando;
  if (c.includes("sarasota") || c.includes("bradenton") || c.includes("venice")) return SANTA_CITY_SPOTS.sarasota;
  if (c.includes("miami") || c.includes("lauderdale") || c.includes("palm")) return SANTA_CITY_SPOTS.miami;
  return SANTA_CITY_SPOTS.default;
}

export default function AskClient({ inv, bad = false }) {
  const venueTz = useMemo(() => eventVenueTimeZone(inv && inv.geo), [inv && inv.geo]);
  const proposedWhen = useMemo(() => parseInviteWhen(inv && inv.when), [inv && inv.when]);
  const suggested = useMemo(() => inviteKinds(inv), [inv]);

  const [step, setStep] = useState("ask");
  const [nos, setNos] = useState(0);
  const [activity, setActivity] = useState(() => suggested[0] || "dinner");
  const [dayIso, setDayIso] = useState(() => proposedWhen.iso);
  const [dayLabel, setDayLabel] = useState(() => proposedWhen.label);
  const [customPlace, setCustomPlace] = useState("");
  // "" | "spot" | "day" | "vibe"
  const [santaMode, setSantaMode] = useState("");
  const [santaDraft, setSantaDraft] = useState("");
  const [liveSpots, setLiveSpots] = useState([]);
  // "" | "ringing" | "updated"
  const [santaCallState, setSantaCallState] = useState("");
  const [santaCallSummary, setSantaCallSummary] = useState("");
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
    setActivity(suggested[0] || "dinner");
    setDayIso(proposedWhen.iso);
    setDayLabel(proposedWhen.label);
    setCustomPlace("");
    setSantaMode("");
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

  const recommendedSpots = useMemo(() => {
    const activeName = String(customPlace || (inv && inv.place) || "").trim().toLowerCase();
    const basePool = pickCityPool(city);
    const seen = new Set();
    const unique = [];
    for (const item of basePool) {
      if (!item || !item.name) continue;
      const key = item.name.trim().toLowerCase();
      if (!key || key === activeName || activeName.includes(key) || seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }
    const matching = unique.filter((s) => s.kind === activity);
    const others = unique.filter((s) => s.kind !== activity);
    return matching.concat(others).slice(0, 4);
  }, [city, customPlace, inv && inv.place, activity]);

  useEffect(() => {
    if (step === "yay") { const t = setTimeout(() => setStep("activity"), 2000); return () => clearTimeout(t); }
  }, [step]);

  useEffect(() => {
    if (santaCallState !== "ringing") return;
    const t = setTimeout(() => setSantaCallState("updated"), 1200);
    return () => clearTimeout(t);
  }, [santaCallState]);

  const triggerSantaCall = (summaryText) => {
    setSantaCallSummary(summaryText);
    setSantaCallState("ringing");
    track("ask_invite_action", { action: "santa_call_update", surface: inviteSurface });
  };

  const applySantaChange = (patch, evt) => {
    if (evt) burst(evt);
    const today = venueTodayDate(venueTz);
    let nextAct = patch.activity !== undefined ? patch.activity : (activity || suggested[0] || "dinner");
    let nextIso = patch.dayIso !== undefined ? patch.dayIso : dayIso;
    let nextLabel = patch.dayLabel !== undefined ? patch.dayLabel : dayLabel;
    let nextPlace = patch.customPlace !== undefined ? patch.customPlace : customPlace;
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
    const actWord = (activityFor(nextAct) || {}).label || "Dinner";
    const whereWord = nextPlace || (inv && inv.place) || (city ? city : "our spot");
    const whenWord = nextLabel || "this weekend";
    const summary = `switched the plan to ${actWord} at ${whereWord} on ${whenWord}`;
    setSantaMode("");
    triggerSantaCall(summary);
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

    const atMatch = /\b(?:at|try|go\s+to)\s+([A-Za-z0-9'’& -]{2,40}?)(?:\s+on\s+(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*|\s+this\s+|\s+tomorrow|$)/i.exec(raw);
    const cleanedSpot = atMatch ? atMatch[1].trim() : "";
    if (cleanedSpot && !/^(friday|fri|saturday|sat|sunday|sun|tomorrow|dinner|drinks|coffee|lunch|brunch)$/i.test(cleanedSpot)) {
      patch.customPlace = cleanedSpot;
    } else if (!patch.activity && !patch.dayIso) {
      if (/\b(another spot|different place|somewhere else|change spot)\b/.test(lower)) {
        if (recommendedSpots[0]) patch.customPlace = recommendedSpots[0].name;
      } else {
        patch.customPlace = raw.slice(0, 48);
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
          try {
            const store = safeLocalStorage();
            const existing = store ? JSON.parse(store.getItem("wayfind_trips") || "null") : null;
            const merged = mergeTripMaps(existing && typeof existing === "object" ? existing : {}, nextTrips);
            setLocal("wayfind_trips", JSON.stringify(merged));
          } catch (mergeErr) {}
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
      writePlannerHandoff(safeSessionStorage(), {
        source: "date",
        city,
        date: dayIso,
        activity,
        placeName: (itineraryStop && itineraryStop.name) || "",
      });
      window.location.href = itineraryPlanHref({
        city,
        date: dayIso,
        activity,
        build: true,
      });
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
  const hasProposedPreview = Boolean(inv && (inv.place || suggestedActivityLabel));
  const BUBBLES = [
    "Wait—your finger slipped, right?! 👀",
    "Deploying emergency puppy eyes 🥺",
    "EMOTIONAL DAMAGE: 999% 😭",
    "Even my hat bell stopped jingling 💔",
    "Plot twist: “No” is purely decorative ✨",
  ];
  const ACTIVITY_BUBBLES = {
    tonight: "Ooooh craft cocktails & late-night vibes! 🍸✨",
    dinner: "Candlelight & amazing food—elite choice! 🍝🕯️",
    bite: "Cozy coffee & a sweet bite—love it! ☕🥐",
    hidden: "An adventure! Let’s discover a hidden gem! 🗺️✨",
    drive: "Windows down, playlist on—let’s ride! 🌴🚗",
    surprise: "Mystery date unlocked—I love the boldness! 🎁💫",
  };

  const planWasModified = Boolean(
    customPlace ||
    detachedEvent ||
    santaCallState ||
    (proposedWhen.iso && dayIso && dayIso !== proposedWhen.iso) ||
    (suggested[0] && activity && activity !== suggested[0])
  );

  const renderSantaConcierge = () => {
    const today = venueTodayDate(venueTz);
    const fri = nextDayFor(today, 5, 1);
    const sat = nextDayFor(today, 6, 1);
    const sun = nextDayFor(today, 0, 1);
    const senderWord = from || "them";
    const toggleMode = (m) => setSantaMode((cur) => (cur === m ? "" : m));
    return (
      <div className="wfx-santa-box" data-wf-santa-date-concierge="1" aria-label="Wayfind Santa AI date assistant">
        <div className="wfx-santa-top">
          <div className="wfx-santa-head-left">
            <div className="wfx-santa-ava" aria-hidden="true">
              <div style={{ width: "38px", height: "44px" }}>
                <SantaConciergeSvg calling={Boolean(santaCallState)} />
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="wfx-santa-badge">🎅 Wayfind Santa AI · Date Concierge</span>
              <div className="wfx-santa-msg">
                {`Want a different spot, day, or vibe? Tap below and I’ll call ${senderWord} with the update!`}
              </div>
            </div>
          </div>
        </div>

        <div className="wfx-santa-tabs" role="group" aria-label="Customize the date with Santa AI">
          <button
            type="button"
            className="wfx-santa-tab"
            data-santa-tweak="spot"
            aria-pressed={santaMode === "spot"}
            onClick={() => toggleMode("spot")}>
            📍 Pick a spot
          </button>
          <button
            type="button"
            className="wfx-santa-tab"
            data-santa-tweak="day"
            aria-pressed={santaMode === "day"}
            onClick={() => toggleMode("day")}>
            📅 Switch day
          </button>
          <button
            type="button"
            className="wfx-santa-tab"
            data-santa-tweak="vibe"
            aria-pressed={santaMode === "vibe"}
            onClick={() => toggleMode("vibe")}>
            ✨ Switch vibe
          </button>
        </div>

        {santaMode === "spot" ? (
          <div className="wfx-spot-panel" data-wf-santa-spots="1">
            <div className="wfx-spot-caption">
              {`Santa’s Top Date Picks${city ? " in " + city : ""}`}
            </div>
            <div className="wfx-spot-list">
              {recommendedSpots.map((sp) => (
                <button
                  key={sp.name}
                  type="button"
                  className="wfx-spot-item"
                  data-santa-spot-pick={sp.name}
                  aria-pressed={customPlace === sp.name}
                  onClick={(e) => applySantaChange({ customPlace: sp.name, activity: sp.kind || activity }, e)}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="wfx-spot-name">{sp.name}</div>
                    <div className="wfx-spot-hook">{sp.hook}</div>
                  </div>
                  <span className="wfx-spot-pick">Pick →</span>
                </button>
              ))}
            </div>
            <div className="wfx-santa-input-row">
              <input
                className="wfx-santa-input"
                value={santaDraft}
                maxLength={80}
                onChange={(e) => setSantaDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSantaFreeText(); }}
                aria-label="Type any spot or change for Santa AI"
                placeholder={`Or type any spot${city ? " in " + city : ""} (e.g. Ulele)…`}
              />
              <button type="button" className="wfx-santa-send" onClick={handleSantaFreeText}>
                Update
              </button>
            </div>
          </div>
        ) : null}

        {santaMode === "day" ? (
          <div className="wfx-spot-panel" data-wf-santa-days="1">
            <div className="wfx-spot-caption">Pick a day that works better for you</div>
            <div className="wfx-santa-chips">
              <button
                type="button"
                className="wfx-santa-chip"
                data-santa-tweak="friday"
                aria-pressed={dayIso === fri.iso}
                onClick={(e) => applySantaChange({ dayIso: fri.iso, dayLabel: fri.label }, e)}>
                {fri.label}
              </button>
              <button
                type="button"
                className="wfx-santa-chip"
                data-santa-tweak="saturday"
                aria-pressed={dayIso === sat.iso}
                onClick={(e) => applySantaChange({ dayIso: sat.iso, dayLabel: sat.label }, e)}>
                {sat.label}
              </button>
              <button
                type="button"
                className="wfx-santa-chip"
                data-santa-tweak="sunday"
                aria-pressed={dayIso === sun.iso}
                onClick={(e) => applySantaChange({ dayIso: sun.iso, dayLabel: sun.label }, e)}>
                {sun.label}
              </button>
              <button
                type="button"
                className="wfx-santa-chip"
                onClick={() => { setSantaMode(""); setStep("when"); }}>
                📅 Full calendar →
              </button>
            </div>
          </div>
        ) : null}

        {santaMode === "vibe" ? (
          <div className="wfx-spot-panel" data-wf-santa-vibes="1">
            <div className="wfx-spot-caption">Switch the vibe for this date</div>
            <div className="wfx-santa-chips">
              {ordered.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="wfx-santa-chip"
                  data-santa-tweak={a.id}
                  aria-pressed={activity === a.id}
                  onClick={(e) => applySantaChange({ activity: a.id }, e)}>
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  const renderSantaCallCard = () => {
    if (!santaCallState && !planWasModified) return null;
    const isRinging = santaCallState === "ringing";
    const actWord = (activityFor(activity) || {}).label || "Dinner";
    const whereWord = customPlace
      ? customPlace
      : (!detachedEvent && !hasEventDateConflict && !eventIsPast && inv && inv.place && planFitsPlace(inv, activity)
          ? inv.place
          : (recommendedSpots[0] ? recommendedSpots[0].name : (city ? city : "")));
    const whenWord = dayLabel || proposedWhen.label || "this weekend";
    return (
      <div className="wfx-santa-bubble" role="status" aria-live="polite" data-wf-santa-call-card="1" key={santaCallState + "-" + whereWord + "-" + whenWord + "-" + actWord}>
        <div className="wfx-santa-tag">
          {isRinging ? `📞 Ringing ${from || "your date"}…` : `🎅 Santa Called ${from || "In Your Upgrade"} ✓`}
        </div>
        <div>
          <b>Santa on speaker:</b>{" "}
          {from ? `“Ho ho ho ${from}! It’s a YES — we upgraded the plan to ` : `“Ho ho ho! It’s a YES — we upgraded the plan to `}
          <b>{actWord}</b>
          {whereWord ? <>{" at "}<b>{whereWord}</b></> : null}
          {whenWord ? <>{" on "}<b>{whenWord}</b></> : null}
          {`!”`}
        </div>
      </div>
    );
  };

  const activePlaceDisplay = customPlace
    ? customPlace
    : (!detachedEvent && !hasEventDateConflict && !eventIsPast && inv && inv.place && planFitsPlace(inv, activity)
        ? inv.place
        : (inv && inv.place ? inv.place : "Pick a spot with Santa AI"));

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
            <Portrait size={168}><Cat tone="cream" mood={moodAt(nos)} size={154} key={nos} look={look} /></Portrait>
            <h1 className="wfx-h1" key={step}>{askHeadline(inv)}</h1>
            {from ? <p className="wfx-sub">from {from}</p> : null}

            <div className="wfx-row">
              <button className="wfx-yes" style={{ "--s": yesScale(nos) }}
                onClick={(e) => {
                  burst(e);
                  setSent("");
                  if (!activity) setActivity(suggested[0] || "dinner");
                  track("ask_invite_choice", { choice: "yes", has_place: Boolean(inv && inv.place) });
                  setStep("yay");
                }}>YES</button>
              <button className="wfx-no" style={{ "--n": noScale(nos) }}
                onClick={(e) => {
                  burst(e);
                  setNos((n) => n + 1);
                  track("ask_invite_choice", { choice: "no", has_place: Boolean(inv && inv.place) });
                }}>No</button>
            </div>
            {nos > 0 ? (
              <p className="wfx-plea" key={nos}>{pleaAt(nos)}</p>
            ) : null}
          </>
        )}

        {step === "declined" && (
          <>
            <Portrait size={152}><Cat tone="cream" mood={moodAt(nos || 1)} size={138} look={look} /></Portrait>
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
              <button className="wfx-pivot-btn wfx-pivot-decline" onClick={() => setStep("ask")}>
                No thanks
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
            <Portrait size={164}><Couple size={78} /></Portrait>
            <h1 className="wfx-h1" key={step}>· YAY! ·</h1>
            <p className="wfx-sub">{yayLine(inv)}</p>
            <button className="wfx-quiet" onClick={(e) => { burst(e); setStep("activity"); }}>Continue →</button>
          </>
        )}

        {step === "activity" && (
          <>
            <div className="wfx-bubble" key={"act-" + (activity || "dinner")} role="status" aria-live="polite">
              {ACTIVITY_BUBBLES[activity || "dinner"] || "Pick the vibe you want for our date! ✨"}
            </div>
            <Portrait size={138}>
              <Cat tone="cream" mood="love" size={126} look={look} fidget={eager} prop={activity || "dinner"} key={"cat-" + (activity || "dinner")} />
            </Portrait>
            <h1 className="wfx-h1" key={step}>What would you like to do?</h1>
            <p className="wfx-sub">
              {hasProposedPreview && from
                ? `${from} suggested ${inv.place || suggestedActivityLabel || "an outing"} — keep it or tap any vibe!`
                : "Tap any vibe to see the Elf react, then lock it in!"}
            </p>
            <div className="wfx-grid">
              {ordered.map((a) => (
                <button key={a.id} className="wfx-chip" aria-pressed={activity === a.id}
                  onClick={(e) => {
                    burst(e);
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
            <button className="wfx-go" disabled={!activity} onClick={(e) => {
              burst(e);
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
            <div className="wfx-bubble" key={"cal-" + (dayLabel || "pick")} role="status" aria-live="polite">
              {dayLabel
                ? (proposedWhen.iso && dayIso === proposedWhen.iso
                    ? `Yay! Locked in for ${dayLabel}! 💖`
                    : `Ooh, ${dayLabel} works way better—Santa’s calling it in! 🎅📅`)
                : "Tap any day on the calendar that works best for you! 📅✨"}
            </div>
            <Portrait size={138}>
              <Cat tone="panda" mood="happy" size={126} look={look} fidget={eager} prop="calendar" key={"calcat-" + (dayIso || "none")} />
            </Portrait>
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
                onClick={(e) => {
                  burst(e);
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
            <button className="wfx-go" disabled={!dayIso} onClick={(e) => {
              burst(e);
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
            {renderSantaCallCard()}
            <Portrait size={132}>
              {planWasModified ? <SantaCallStage size={66} /> : <Couple size={64} />}
            </Portrait>
            <h1 className="wfx-h1" key={step}>It's a date</h1>
            <p className="wfx-sub">
              {planWasModified
                ? `Santa called in your upgrade — send your reply below!`
                : "Your plan is set — send your reply below, or tap any line to adjust."}
            </p>

            <div className="wfx-card" aria-label="Your date plan — tap to edit any detail">
              <div className="wfx-card-row">
                <div className="wfx-row-meta">
                  <span className="wfx-row-k">{customPlace ? "Spot (Your Pick)" : "Spot"}</span>
                  <span className="wfx-row-v">{activePlaceDisplay}{city && !activePlaceDisplay.includes(city) ? ` · ${city}` : ""}</span>
                  {(hasEventDateConflict || eventIsPast) && inv && inv.eventDate ? (
                    <span className="wfx-row-sub">
                      {`${inv.place} runs on ${scheduledEventWhen.label || inv.eventDate} — tap Swap spot for ${dayLabel}`}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="wfx-edit-pill"
                  data-edit-plan="spot"
                  aria-pressed={santaMode === "spot"}
                  onClick={() => setSantaMode((m) => (m === "spot" ? "" : "spot"))}>
                  Swap spot
                </button>
              </div>
              <div className="wfx-card-row">
                <div className="wfx-row-meta">
                  <span className="wfx-row-k">When</span>
                  <span className="wfx-row-v">{dayLabel || "Pick a day"}</span>
                </div>
                <button
                  type="button"
                  className="wfx-edit-pill"
                  data-edit-plan="when"
                  aria-pressed={santaMode === "day"}
                  onClick={() => setSantaMode((m) => (m === "day" ? "" : "day"))}>
                  Change day
                </button>
              </div>
              <div className="wfx-card-row">
                <div className="wfx-row-meta">
                  <span className="wfx-row-k">Vibe</span>
                  <span className="wfx-row-v">{(activityFor(activity) || {}).label || "Dinner"}{from ? ` · with ${from}` : ""}</span>
                </div>
                <button
                  type="button"
                  className="wfx-edit-pill"
                  data-edit-plan="activity"
                  aria-pressed={santaMode === "vibe"}
                  onClick={() => setSantaMode((m) => (m === "vibe" ? "" : "vibe"))}>
                  Change vibe
                </button>
              </div>
            </div>

            {santaMode ? renderSantaConcierge() : null}

            <div style={{ display: "flex", gap: "8px", width: "100%", marginTop: "10px" }}>
              {needsName(inv) ? (
                <input className="wfx-field" style={{ marginTop: 0, flex: "0 0 38%", padding: "11px 12px", fontSize: "13.5px" }}
                  value={who} maxLength={24} enterKeyHint="done"
                  onChange={(e) => setWho(e.target.value)}
                  aria-label="Your name, so they know who said yes"
                  placeholder="Your name" />
              ) : null}
              <input className="wfx-field" style={{ marginTop: 0, flex: 1, padding: "11px 12px", fontSize: "13.5px" }}
                value={note} maxLength={120} enterKeyHint="done"
                onChange={(e) => setNote(e.target.value)}
                aria-label="Add a message, optional"
                placeholder="Say something back (optional)" />
            </div>

            <button className="wfx-go" style={{ marginTop: "10px" }} onClick={tellThem}>
              {sent === "copied"
                ? "LINK COPIED ✓"
                : sent === "options"
                  ? "SHARE YOUR ANSWER"
                  : (planWasModified
                      ? ("SEND UPDATED PLAN TO " + (from ? from.toUpperCase() : "YOUR DATE"))
                      : ("TELL " + (from ? from.toUpperCase() : "THEM") + " · SHARE YOUR ANSWER"))}
            </button>
            {sent ? (
              <p className="wfx-sub" role="status" aria-live="polite">
                {sent === "options" ? "Share your answer — choose your message app and press Send there." :
                 sent === "copied" ? "Link copied. Paste your reply into your chat with " + (from || "them") + "." :
                 "Could not open share options — copy the plan above and text it to " + (from || "them") + "."}
              </p>
            ) : null}

            {!santaMode ? renderSantaConcierge() : null}

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


