"use client";
// Extracted from app/home.js (G1, July 2026 decomposition). Render-only; the
// two original sibling branches (trip list, open trip) keep their conditions.
// Upgraded into the Wayfind Trip-Planning Workspace while preserving every
// manual itinerary capability, date picker contract, share flow, and auth gate.
import { Component, useEffect, useLayoutEffect, useRef, useState } from "react";
import { C, Icon } from "../kit";
import { openExternal } from "../../../lib/links";
import * as TripCore from "../../../lib/trips";
import * as TripDays from "../../../lib/tripDays";
import { measureItineraryShare, measureListShare } from "../../../lib/itineraryShare";
import { railPhotoSrc } from "../../../lib/cardPhotoRequest";
import SafeImg from "../SafeImg";
import { stopTravelRelationship } from "../../../lib/plannerGeo";
import { executePlannerAction, executePlannerActionBatch } from "../../../lib/plannerActions";
import { openWayfindPlanner } from "../../../lib/plannerCompanionBridge";
import { PLANNER_EVENTS, trackPlannerEvent, isPlannedStopItem } from "../../../lib/plannerAnalytics";
import { checkPlannerEntitlement } from "../../../lib/plannerEntitlement";
import { COVERED_CITIES } from "../../../lib/landingCities";
import { cardComplete, searchEditorialCard } from "../../../lib/score";
import { openShareFlow } from "../../../lib/shareFlow";
import { placeKinds } from "../../../lib/dateInvite";
import { styleHtml } from "../../../lib/styleHtml.js";
import { captureOrQueue } from "../../../lib/browserAnalytics.js";
import dynamic from "next/dynamic";
const PublishGuideButton = dynamic(() => import("../PublishGuideButton"), { ssr: false, loading: () => null });
const Trips = { ...TripCore, ...TripDays };

function shortDayTabLabel(ymd) {
  const clean = Trips.normalizeStopDate(ymd);
  if (!clean) return "";
  const [y, m, d] = clean.split("-").map(Number);
  const utcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const wk = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(utcNoon);
  return `${wk} ${d}`;
}

function resolveTripHeroPhoto(trip) {
  const items = Array.isArray(trip && trip.items) ? trip.items : [];
  for (const it of items) {
    const p = it && it.place;
    if (!p) continue;
    const src = railPhotoSrc(p);
    if (src) return src;
  }
  return "";
}

function summarizeTripPlanningStatus(trip, todayOpt) {
  const items = Array.isArray(trip && trip.items) ? trip.items : [];
  const total = items.length;
  let datedCount = 0;
  const distinctDays = new Set();
  for (const it of items) {
    const d = Trips.itemDayOf(it);
    if (d) {
      datedCount += 1;
      distinctDays.add(d);
    }
  }
  let spanDays = distinctDays.size;
  if (spanDays === 0 && trip && trip.startDate && trip.endDate) {
    const s = Trips.normalizeStopDate(trip.startDate);
    const e = Trips.normalizeStopDate(trip.endDate);
    if (s && e && e >= s) {
      let cur = s;
      let n = 0;
      while (cur && cur <= e && n < 30) {
        n += 1;
        cur = Trips.addCalendarDays(cur, 1);
      }
      spanDays = n;
    }
  }
  let statusLabel = "Dates flexible";
  let statusTone = "muted";
  if (total > 0 && datedCount === total) {
    statusLabel = trip && trip.plannedBy === "wayfind_planner" ? "✨ Planned" : "✓ Planned";
    statusTone = "ready";
  } else if (total > 0 && datedCount > 0) {
    const rem = total - datedCount;
    statusLabel = `${rem} stop${rem === 1 ? "" : "s"} need dates`;
    statusTone = "partial";
  } else if (total === 0 && (trip && (trip.startDate || trip.endDate))) {
    statusLabel = "Ready for stops";
    statusTone = "partial";
  }
  const dateSum = Trips.tripDateSummary(trip, todayOpt) || (
    trip && trip.startDate && trip.endDate
      ? (trip.startDate === trip.endDate
        ? Trips.formatStopDate(trip.startDate, { compact: true })
        : `${Trips.formatStopDate(trip.startDate, { compact: true })} – ${Trips.formatStopDate(trip.endDate, { compact: true })}`)
      : ""
  );
  return { total, datedCount, spanDays, statusLabel, statusTone, dateSum };
}

export default function ItineraryScreen({ ctx }) {
  const { activeTrip, setActiveTrip, trips, setTrips, tripNoteEdit, setTripNoteEdit, tripMoveFor, setTripMoveFor, sub, logEvent, openBrowse, reservations, removeRes, saveResConf, isSaved, liked, disliked, openDetail, quickSaveFavorite, toggleLike, toggleDislike, addShared, giveawayMark, blurbs, openExperience, openCuisine, PlaceCard, CategoryMenu, StateBadge, shareList, itineraryFlags, shareTrip, user, setAuthOpen, requireAuth } = ctx;
  const mapOn = !!(itineraryFlags && itineraryFlags.map);
  const [RouteMap, setRouteMap] = useState(null);
  const [dateEditFor, setDateEditFor] = useState(null);
  const [dateDraft, setDateDraft] = useState("");
  const [shareConfirmPending, setShareConfirmPending] = useState(null);
  // Live Trips (2026-11-27): plan one trip together with friends in real time.
  const [liveBusy, setLiveBusy] = useState(false);
  const [liveTrips, setLiveTrips] = useState(null);
  const [liveError, setLiveError] = useState("");
  const liveTripsOn = process.env.NEXT_PUBLIC_LIVE_TRIPS_OFF !== "1";

  // Manual trip creator state (Trip Index)
  const [manualCreateOpen, setManualCreateOpen] = useState(false);
  const [manualCity, setManualCity] = useState("Orlando");
  const [manualTitle, setManualTitle] = useState("");
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");
  const [manualErr, setManualErr] = useState("");

  // Day-by-day filter & inline Ask Wayfind state (Open Trip)
  const [selectedDayFilter, setSelectedDayFilter] = useState("overview");
  const [askInput, setAskInput] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [askFeedback, setAskFeedback] = useState(null); // { text, warnings, isError }
  const [inlineUndoSnapshot, setInlineUndoSnapshot] = useState(null);
  const askInputRef = useRef(null);
  // Simple itinerary (owner, 2026-11-28): one trip menu, one menu per stop,
  // and a slide when a stop moves (FLIP: measure, reorder, animate the gap).
  const [tripMenuOpen, setTripMenuOpen] = useState(false);
  const [stopMenuFor, setStopMenuFor] = useState(null);
  const [askOpen, setAskOpen] = useState(false);
  const [showMoreChips, setShowMoreChips] = useState(false);
  const stopListRef = useRef(null);
  const flipRef = useRef(null);
  const captureStopPositions = (movedKey) => {
    const root = stopListRef.current;
    if (!root || typeof root.querySelectorAll !== "function") return;
    const tops = new Map();
    root.querySelectorAll("[data-wf-stop-id]").forEach((el) => { tops.set(el.getAttribute("data-wf-stop-id"), el.getBoundingClientRect().top); });
    flipRef.current = { tops, movedKey };
  };
  useIsoLayoutEffect(() => {
    const flip = flipRef.current;
    if (!flip) return;
    flipRef.current = null;
    const root = stopListRef.current;
    if (!root) return;
    const reduce = prefersReducedMotion();
    let movedEl = null;
    root.querySelectorAll("[data-wf-stop-id]").forEach((el) => {
      const key = el.getAttribute("data-wf-stop-id");
      if (key === flip.movedKey) {
        movedEl = el;
        el.classList.remove("wf-itin-moved");
        void el.offsetWidth; // restart the highlight
        el.classList.add("wf-itin-moved");
      }
      const before = flip.tops.get(key);
      if (before == null || reduce) return;
      const dy = before - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) return;
      el.style.transition = "none";
      el.style.transform = "translateY(" + dy + "px)";
      el.style.zIndex = key === flip.movedKey ? "3" : "1";
      el.getBoundingClientRect();
      requestAnimationFrame(() => {
        el.style.transition = "transform 420ms cubic-bezier(.22,.61,.36,1)";
        el.style.transform = "";
      });
      const done = () => { el.style.transition = ""; el.style.zIndex = ""; el.removeEventListener("transitionend", done); };
      el.addEventListener("transitionend", done);
      setTimeout(done, 600);
    });
    if (movedEl) {
      setTimeout(() => {
        try {
          const r = movedEl.getBoundingClientRect();
          const vh = window.innerHeight || 0;
          if (r.top < 80 || r.top > vh - 160) movedEl.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
        } catch {}
      }, reduce ? 0 : 440);
    }
  });
  const trackedPlanOpenRef = useRef(new Set());

  useEffect(() => {
    setDateEditFor(null);
    setDateDraft("");
    setShareConfirmPending(null);
    setSelectedDayFilter("overview");
    setAskInput("");
    setAskFeedback(null);
    setInlineUndoSnapshot(null);
    setTripMenuOpen(false);
    setStopMenuFor(null);
    setAskOpen(false);
    setShowMoreChips(false);
  }, [activeTrip]);

  useEffect(() => {
    if (!activeTrip || !trips || !trips[activeTrip]) return;
    const t = trips[activeTrip];
    const hasPlanned = t.plannedBy === "wayfind_planner" || (Array.isArray(t.items) && t.items.some(isPlannedStopItem));
    if (hasPlanned && !trackedPlanOpenRef.current.has(activeTrip)) {
      trackedPlanOpenRef.current.add(activeTrip);
      trackPlannerEvent(
        PLANNER_EVENTS.ITINERARY_OPENED_AFTER_PLAN,
        {
          city: t.city || "",
          saved_stop_count: Array.isArray(t.items) ? t.items.length : 0,
        },
        { logEvent }
      );
    }
  }, [activeTrip, trips, logEvent]);

  useEffect(() => {
    if (activeTrip || !trips || typeof window === "undefined") return;
    try {
      const sp = new URLSearchParams(window.location && window.location.search ? window.location.search : "");
      const wantTrip = (sp.get("trip") || "").trim();
      const wantCity = (sp.get("city") || "").trim();
      if (wantTrip && trips[wantTrip]) {
        setActiveTrip(wantTrip);
        return;
      }
      if (wantCity) {
        const flKey = Trips.tripKeyOf(wantCity, "FL");
        if (trips[flKey]) {
          setActiveTrip(flKey);
          return;
        }
        const lower = wantCity.toLowerCase();
        const matchedKey = Object.keys(trips).find(
          (k) => trips[k] && typeof trips[k].city === "string" && trips[k].city.toLowerCase() === lower
        );
        if (matchedKey) setActiveTrip(matchedKey);
      }
    } catch (e) {}
  }, [activeTrip, trips, setActiveTrip]);
  useEffect(() => {
    if (!mapOn) { setRouteMap(null); return undefined; }
    let cancelled = false;
    import("../ItineraryRouteMap").then((mod) => { if (!cancelled) setRouteMap(() => mod.default); }).catch(() => {});
    return () => { cancelled = true; };
  }, [mapOn]);

  const handleManualCreateSubmit = (e) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    const cityTrim = String(manualCity || "").trim();
    if (!cityTrim) {
      setManualErr("Choose or enter a destination city.");
      return;
    }
    if (manualStart && manualEnd && manualEnd < manualStart) {
      setManualErr("End date cannot be earlier than start date.");
      return;
    }
    const res = executePlannerAction(
      trips || {},
      {
        type: "CREATE_TRIP",
        city: cityTrim,
        state: "FL",
        title: String(manualTitle || "").trim() || null,
        startDate: manualStart || null,
        endDate: manualEnd || manualStart || null,
      },
      { allowManualCreate: true }
    );
    if (!res.ok) {
      setManualErr(res.error || "Could not create trip.");
      return;
    }
    setManualErr("");
    setManualCreateOpen(false);
    setManualTitle("");
    setManualStart("");
    setManualEnd("");
    setTrips(res.nextTrips);
    setActiveTrip(res.tripKey);
  };

  // Live Trips logic lives in lib/liveTripEntry.js, loaded only on use, so it
  // stays out of the homepage's first-load bundle.
  const startLiveTrip = async (t, items) => {
    if (!liveTripsOn || liveBusy) return;
    if (!requireAuth("Sign up free to plan this trip together with friends.")) return;
    setLiveBusy(true);
    setLiveError("");
    let r;
    try { r = await (await import("../../../lib/liveTripEntry.js")).startLiveTrip(t, items); }
    catch (e) { r = { message: "We couldn't start live planning. Check your connection and try again." }; }
    if (r && r.id) {
      try { logEvent("live_trip_start", null, { stops: (items || []).length }); } catch (e) {}
      window.location.assign("/trips/" + r.id);
      return;
    }
    setLiveError(r.message);
    setLiveBusy(false);
  };

  useEffect(() => {
    if (!liveTripsOn || !user || activeTrip) return undefined;
    let alive = true;
    import("../../../lib/liveTripEntry.js").then((m) => m.listLiveTrips()).then((trips) => { if (alive && trips) setLiveTrips(trips); }, () => {});
    return () => { alive = false; };
  }, [user && user.id, activeTrip]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
        {!user && (
          <div
            role="status"
            data-wf-guest-sync-banner="itinerary"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
              background: C.card,
              border: "1px solid " + C.border,
              borderRadius: 12,
              padding: "10px 14px",
              marginBottom: 14,
            }}
          >
            <span style={{ fontSize: 12.5, color: C.light, lineHeight: 1.4 }}>
              Saved on this device. Sign in to sync across devices.
            </span>
            <button
              type="button"
              data-wf-guest-signin-btn="itinerary"
              onClick={() => {
                if (setAuthOpen) setAuthOpen(true);
                else if (requireAuth) requireAuth("Sign in to sync your trips across devices.");
              }}
              style={{
                background: "transparent",
                border: "1px solid " + C.accent,
                color: C.light,
                fontSize: 12.5,
                fontWeight: 700,
                padding: "8px 14px",
                minHeight: 44,
                borderRadius: 20,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              Sign in
            </button>
          </div>
        )}
        {!activeTrip && (() => {
          const list = Trips.tripList(trips);
          const todayOpt = ctx.__today ? { today: ctx.__today } : {};
          const entitlement = checkPlannerEntitlement(user);
          return (
            <div>
              {/* v8.41 — openBrowse switches to the feed, sets the category
                  WITHOUT toggling, and lands the reader on the place cards. */}
              <CategoryMenu activeCat={null} sub={sub} onCat={(id, label) => { try { logEvent("intent_chip", null, { intent: label, layer: 1, src: "itinerary" }); } catch (e) {} openBrowse(id); }} onSub={() => {}} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12, paddingTop: 4, flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <div style={{ fontSize: 19, fontWeight: 800, color: C.text }}>Your trips</div>
                  {list.length > 0 && <span style={{ fontSize: 12.5, color: C.muted }}>{list.length} trip{list.length !== 1 ? "s" : ""}</span>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {user && itineraryFlags && itineraryFlags.sync ? <span style={{ fontSize: 12, color: C.light }}>Synced across devices</span> : null}
                  <a href="/plan-my-day" style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    minHeight: 44,
                    color: C.light,
                    fontSize: 13,
                    fontWeight: 800,
                    textDecoration: "none",
                  }}>
                    Plan my day <span aria-hidden="true">›</span>
                  </a>
                </div>
              </div>

              {liveTrips && liveTrips.length > 0 && (
                <div data-wf-live-trips="1" style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: C.light, marginBottom: 8 }}>Planning with friends</div>
                  <div style={{ display: "grid", gap: 8 }}>
                    {liveTrips.map((lt) => (
                      <a key={lt.id} href={"/trips/" + lt.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: C.card, border: "1px solid " + C.border, borderRadius: 12, padding: "12px 14px", minHeight: 44, color: C.text, textDecoration: "none" }}>
                        <span style={{ fontWeight: 800, fontSize: 14, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lt.title}</span>
                        <span style={{ fontSize: 12, color: "#86EFAC", fontWeight: 800, whiteSpace: "nowrap" }}>● Live · {lt.stops} stop{lt.stops === 1 ? "" : "s"}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Primary Trip Index Actions: Build with Wayfind + Create manually */}
              <div
                data-wf-trip-index-actions="1"
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                  gap: 10,
                  marginBottom: 16,
                }}
              >
                {entitlement.allowed && (
                  <button
                    type="button"
                    data-wf-planner-open="trip-index"
                    onClick={() => openWayfindPlanner({ surface: "itinerary_index" })}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "13px 16px",
                      minHeight: 52,
                      borderRadius: 14,
                      border: "none",
                      background: "linear-gradient(135deg, #F97316, #FB923C)",
                      color: "#0D1117",
                      fontSize: 14,
                      fontWeight: 900,
                      cursor: "pointer",
                      textAlign: "left",
                      boxShadow: "0 8px 22px rgba(249, 115, 22, 0.22)",
                    }}
                  >
                    <span>✨ Build a trip with Wayfind</span>
                    <span style={{ fontSize: 16, fontWeight: 900 }}>›</span>
                  </button>
                )}
                <button
                  type="button"
                  data-wf-create-manual-btn="1"
                  aria-expanded={manualCreateOpen}
                  onClick={() => { setManualCreateOpen((v) => !v); setManualErr(""); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "13px 16px",
                    minHeight: 52,
                    borderRadius: 14,
                    border: "1px solid " + C.border,
                    background: C.card,
                    color: C.text,
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span>＋ Create manually</span>
                  <span style={{ fontSize: 14, color: C.muted }}>{manualCreateOpen ? "✕" : "›"}</span>
                </button>
              </div>

              {manualCreateOpen && (
                <form
                  data-wf-manual-trip-form="1"
                  onSubmit={handleManualCreateSubmit}
                  style={{
                    background: C.card,
                    border: "1px solid " + C.border,
                    borderRadius: 14,
                    padding: 14,
                    marginBottom: 16,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 800, color: C.text }}>New Florida trip</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 8 }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: C.muted }}>
                      Destination
                      <select
                        aria-label="Destination city"
                        value={manualCity}
                        onChange={(e) => setManualCity(e.target.value)}
                        style={{
                          minHeight: 44,
                          borderRadius: 10,
                          border: "1px solid " + C.border,
                          background: C.bg,
                          color: C.text,
                          padding: "8px 10px",
                          fontSize: 14,
                        }}
                      >
                        {(Array.isArray(COVERED_CITIES) && COVERED_CITIES.length > 0 ? COVERED_CITIES : [{ name: "Orlando" }, { name: "Tampa" }, { name: "Sarasota" }, { name: "Miami" }, { name: "St. Petersburg" }]).map((c) => (
                          <option key={c.slug || c.name} value={c.name}>{c.name}, FL</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: C.muted }}>
                      Trip name (optional)
                      <input
                        type="text"
                        placeholder={`e.g. ${manualCity} Weekend`}
                        value={manualTitle}
                        onChange={(e) => setManualTitle(e.target.value)}
                        style={{
                          minHeight: 44,
                          borderRadius: 10,
                          border: "1px solid " + C.border,
                          background: C.bg,
                          color: C.text,
                          padding: "8px 10px",
                          fontSize: 14,
                          boxSizing: "border-box",
                        }}
                      />
                    </label>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 8 }}>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: C.muted }}>
                      Start date (optional)
                      <input
                        type="date"
                        value={manualStart}
                        onChange={(e) => setManualStart(e.target.value)}
                        style={{
                          minHeight: 44,
                          borderRadius: 10,
                          border: "1px solid " + C.border,
                          background: C.bg,
                          color: C.text,
                          padding: "8px 10px",
                          fontSize: 14,
                          colorScheme: "dark",
                          boxSizing: "border-box",
                        }}
                      />
                    </label>
                    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11.5, color: C.muted }}>
                      End date (optional)
                      <input
                        type="date"
                        value={manualEnd}
                        onChange={(e) => setManualEnd(e.target.value)}
                        style={{
                          minHeight: 44,
                          borderRadius: 10,
                          border: "1px solid " + C.border,
                          background: C.bg,
                          color: C.text,
                          padding: "8px 10px",
                          fontSize: 14,
                          colorScheme: "dark",
                          boxSizing: "border-box",
                        }}
                      />
                    </label>
                  </div>
                  {manualErr ? <div style={{ fontSize: 12, color: C.red }}>{manualErr}</div> : null}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="submit"
                      data-wf-manual-trip-submit="1"
                      style={{
                        background: C.accent,
                        border: "none",
                        color: "#0D1117",
                        fontSize: 13,
                        fontWeight: 800,
                        padding: "9px 16px",
                        minHeight: 44,
                        borderRadius: 22,
                        cursor: "pointer",
                      }}
                    >
                      Create trip
                    </button>
                    <button
                      type="button"
                      onClick={() => { setManualCreateOpen(false); setManualErr(""); }}
                      style={{
                        background: "transparent",
                        border: "1px solid " + C.border,
                        color: C.muted,
                        fontSize: 12.5,
                        fontWeight: 700,
                        padding: "9px 14px",
                        minHeight: 44,
                        borderRadius: 22,
                        cursor: "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {reservations.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>🧾 Reservations</div>
                    <span style={{ fontSize: 12, color: C.muted }}>{reservations.length}</span>
                  </div>
                  {reservations.map((r) => (
                    <div key={r.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "11px 13px", marginBottom: 9 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                        <span style={{ fontSize: 18 }}>{r.kind === "hotel" ? "🏨" : "🎟️"}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Booked via {r.partner} · {new Date(r.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
                        </div>
                        {r.url ? <a href={r.url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, fontWeight: 800, color: C.light, textDecoration: "none", flexShrink: 0 }}>View ↗</a> : null}
                        <button onClick={() => removeRes(r.id)} aria-label="Remove reservation" style={{ background: "transparent", border: "none", color: C.muted, fontSize: 15, cursor: "pointer", padding: "2px 4px", flexShrink: 0 }}>✕</button>
                      </div>
                      <input defaultValue={r.conf} onBlur={(e) => saveResConf(r.id, e.target.value)} placeholder="Add confirmation # or note"
                        style={{ width: "100%", boxSizing: "border-box", marginTop: 9, padding: "8px 11px", borderRadius: 10, border: `1px dashed ${r.conf ? C.border : C.accent + "66"}`, background: "transparent", color: C.text, fontSize: 16, outline: "none" }} />
                    </div>
                  ))}
                  <div style={{ fontSize: 10.5, color: C.muted, lineHeight: 1.45 }}>Wayfind logs when you head out to book. Your confirmation details stay on this device.</div>
                </div>
              )}

              {list.length === 0 ? (
                <div
                  data-wf-trip-empty="1"
                  style={{
                    textAlign: "center",
                    padding: "36px 20px",
                    background: C.card,
                    border: `1px solid ${C.border}`,
                    borderRadius: 16,
                    color: C.muted,
                    fontSize: 13.5,
                    lineHeight: 1.5,
                  }}
                >
                  <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 6 }}>No trips saved yet</div>
                  <div>Tell Wayfind where and when you are going, or save any place while browsing to start a city trip automatically.</div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {list.map((t) => {
                    const st = Trips.tripStats(t);
                    const planMeta = summarizeTripPlanningStatus(t, todayOpt);
                    const heroSrc = resolveTripHeroPhoto(t);
                    const destLabel = (t.city || "Florida") + (t.state ? ", " + t.state : "");
                    const listTitle = t.title || destLabel;
                    const showDestSub = Boolean(t.title && t.title.trim() && t.title.trim().toLowerCase() !== destLabel.toLowerCase());
                    return (
                      <div
                        key={t.key}
                        data-wf-trip-card={t.key}
                        onClick={() => { setActiveTrip(t.key); try { window.scrollTo(0, 0); } catch {} }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 13,
                          padding: 12,
                          background: C.card,
                          border: `1px solid ${C.border}`,
                          borderRadius: 16,
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            width: 72,
                            height: 72,
                            borderRadius: 12,
                            overflow: "hidden",
                            flexShrink: 0,
                            background: "linear-gradient(135deg, rgba(249,115,22,0.18), rgba(15,23,42,0.9))",
                            border: `1px solid ${C.border}`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            position: "relative",
                          }}
                        >
                          {heroSrc ? (
                            <SafeImg
                              src={heroSrc}
                              alt=""
                              compact
                              loading="lazy"
                              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            />
                          ) : (
                            <StateBadge code={t.state} />
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <div style={{ fontSize: 15.5, fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                              {listTitle}
                            </div>
                            <span
                              style={{
                                fontSize: 10.5,
                                fontWeight: 800,
                                padding: "2px 8px",
                                borderRadius: 999,
                                background: planMeta.statusTone === "ready"
                                  ? "rgba(16, 185, 129, 0.14)"
                                  : planMeta.statusTone === "partial"
                                    ? "rgba(249, 115, 22, 0.14)"
                                    : "rgba(148, 163, 184, 0.12)",
                                color: planMeta.statusTone === "ready"
                                  ? "#6EE7B7"
                                  : planMeta.statusTone === "partial"
                                    ? C.light
                                    : C.muted,
                              }}
                            >
                              {planMeta.statusLabel}
                            </span>
                          </div>
                          {showDestSub && (
                            <div style={{ fontSize: 12, color: C.light, marginTop: 2 }}>{destLabel}</div>
                          )}
                          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 4, lineHeight: 1.35 }}>
                            {planMeta.dateSum ? `${planMeta.dateSum} · ` : ""}
                            {planMeta.spanDays > 0 ? `${planMeta.spanDays} day${planMeta.spanDays === 1 ? "" : "s"} · ` : ""}
                            {st.total} stop{st.total !== 1 ? "s" : ""}
                            {st.visited > 0 ? ` · ${st.visited} visited` : ""}
                          </div>
                        </div>
                        <span style={{ color: C.muted, fontSize: 20, paddingRight: 2 }}>›</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
        {activeTrip && trips[activeTrip] && (() => {
          const t = trips[activeTrip];
          const hasLocalTrip = Boolean(t && Array.isArray(t.items) && t.items.length > 0);
          const todayOpt = ctx.__today ? { today: ctx.__today } : {};
          const isMobile =
            ctx.__mobile !== undefined
              ? Boolean(ctx.__mobile)
              : ctx.isDesktop !== undefined
                ? ctx.isDesktop === false
                : (typeof window !== "undefined" && typeof window.innerWidth === "number" ? window.innerWidth < 768 : false);
          const routeOpts = { ...todayOpt, mobile: isMobile };
          const items = Trips.sortedItems(t, todayOpt);
          const grouped = Trips.groupItemsByDay(t, todayOpt);
          const dateSum = Trips.tripDateSummary(t, todayOpt);
          const quickChoices = Trips.quickDateChoices(t, ctx.__today || undefined);
          const fullTripLegs = Trips.tripRouteLegs(t, routeOpts);
          const itinShareMeasure = measureItineraryShare(t);
          const listShareMeasure = measureListShare(items.map((it) => ({ ...it.place, ...(it.day ? { day: it.day } : {}) })), undefined, (t.city || "My") + " trip");
          const st = Trips.tripStats(t);
          const tripTitle = t.title || (t.city + (t.state ? ", " + t.state : ""));
          const others = Trips.tripList(trips).filter((x) => x.key !== t.key);
          const entitlement = checkPlannerEntitlement(user);
          const tripHasPlannedStops = t.plannedBy === "wayfind_planner" || items.some(isPlannedStopItem);
          const undatedStopCount = items.filter((it) => !Trips.itemDayOf(it)).length;

          const activeFilterValid =
            selectedDayFilter === "overview" ||
            grouped.groups.some((g) => (g.day || "unscheduled") === selectedDayFilter);
          const effectiveDayFilter = grouped.hasDates && activeFilterValid ? selectedDayFilter : "overview";
          const visibleGroups =
            effectiveDayFilter === "overview"
              ? grouped.groups
              : grouped.groups.filter((g) => (g.day || "unscheduled") === effectiveDayFilter);

          const tripCtl = { width: 44, height: 44, minWidth: 44, minHeight: 44, borderRadius: 10, border: "1px solid " + C.border, background: C.card, color: C.text, fontSize: 15, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" };
          const tripChip = { border: "1px solid " + C.border, background: C.card, color: C.muted, fontSize: 12, fontWeight: 700, padding: "8px 12px", minHeight: 44, borderRadius: 22, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 };
          const focusDateToggle = (stopId) => {
            if (typeof document === "undefined" || !stopId) return;
            setTimeout(() => {
              try {
                const btn = document.getElementById("wf-date-btn-" + stopId);
                if (btn && typeof btn.focus === "function") btn.focus();
              } catch (e) {}
            }, 0);
          };
          const openDatePicker = (stopId, currentDay) => {
            setDateEditFor(stopId);
            setDateDraft(currentDay || "");
            setTripNoteEdit(null);
            setTripMoveFor(null);
            if (typeof document !== "undefined") {
              setTimeout(() => {
                try {
                  const box = document.getElementById("wf-date-picker-" + stopId);
                  if (!box) return;
                  const firstTarget = box.querySelector('button[data-wf-quick-date], input[type="date"]');
                  if (firstTarget && typeof firstTarget.focus === "function") firstTarget.focus();
                } catch (e) {}
              }, 0);
            }
          };
          const closeDatePicker = (stopId) => {
            setDateEditFor(null);
            setDateDraft("");
            focusDateToggle(stopId);
          };
          const doRoute = (legUrl) => {
            const u = legUrl || Trips.routeUrl(t, routeOpts);
            if (u) {
              openExternal(u);
              try { logEvent("trip_route", null, { key: t.key, n: items.length }); } catch {}
              if (tripHasPlannedStops) {
                trackPlannerEvent(
                  PLANNER_EVENTS.HIGH_INTENT_FROM_PLANNED_STOP,
                  { action_kind: "route_trip", city: t.city || "", saved_stop_count: items.length },
                  { logEvent }
                );
              }
            }
          };
          const doRouteDay = (group, legUrl) => {
            const u = legUrl || Trips.dayRouteUrl(t, group.day, routeOpts);
            if (u) {
              openExternal(u);
              try { logEvent("trip_route_day", null, { key: t.key, day: group.day, n: group.items.length }); } catch {}
              if (group.items.some(isPlannedStopItem) || t.plannedBy === "wayfind_planner") {
                trackPlannerEvent(
                  PLANNER_EVENTS.HIGH_INTENT_FROM_PLANNED_STOP,
                  { action_kind: "route_day", city: t.city || "", saved_stop_count: group.items.length },
                  { logEvent }
                );
              }
            }
          };
          const applyStopDate = (place, nextDate, stopIdOverride) => {
            const clean = nextDate == null || nextDate === "" ? null : Trips.normalizeStopDate(nextDate);
            if (nextDate != null && nextDate !== "" && !clean) return;
            const targetId = stopIdOverride || place.id;
            try { logEvent("stop_date", place, { key: t.key, day: clean }); } catch (e) {}
            setTrips((prev) => Trips.setStopDate(prev, t.key, targetId, clean));
            setDateEditFor(null);
            setDateDraft("");
            focusDateToggle(targetId);
          };

          const runInlineAskWayfind = async (rawPrompt) => {
            const text = String(rawPrompt || "").trim();
            if (!text || askBusy) return;
            // If the trip currently has 0 stops and the user asks to build a plan,
            // open the rich multi-day preview sheet so they can inspect & confirm.
            if (items.length === 0) {
              openWayfindPlanner({
                activeTripKey: t.key,
                city: t.city || "",
                prompt: text,
                surface: "itinerary_empty_trip",
              });
              setAskInput("");
              return;
            }
            setAskBusy(true);
            setAskFeedback(null);
            trackPlannerEvent(
              PLANNER_EVENTS.REQUEST,
              { mode: "inline_edit", surface: "itinerary_workspace", trip_key: t.key, saved_stop_count: items.length },
              { logEvent }
            );
            const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
            const timeoutId = controller && typeof window !== "undefined"
              ? window.setTimeout(() => { try { controller.abort(); } catch {} }, 16000)
              : null;
            try {
              const res = await fetch("/api/planner", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                ...(controller ? { signal: controller.signal } : {}),
                body: JSON.stringify({
                  message: text,
                  contextCity: t.city || null,
                  activeTrip: t,
                }),
              });
              const data = await res.json().catch(() => null);
              if (!res.ok || !data || !data.ok) {
                setAskFeedback({
                  text: (data && data.reply) || "Wayfind couldn't apply that change right now. Your manual itinerary controls remain ready below.",
                  warnings: [],
                  isError: true,
                });
                return;
              }
              if (data.mode === "propose_trip" && data.proposedPlan) {
                openWayfindPlanner({
                  activeTripKey: t.key,
                  city: t.city || "",
                  prompt: text,
                  surface: "itinerary_workspace_handoff",
                });
                setAskInput("");
                return;
              }
              if (data.mode === "edit_trip" && Array.isArray(data.actions) && data.actions.length > 0) {
                const batch = executePlannerActionBatch(trips, data.actions, {
                  verifiedCatalog: data.candidateCatalog || {},
                });
                if (batch.ok) {
                  setInlineUndoSnapshot(batch.undoSnapshot);
                  setTrips(batch.nextTrips);
                  setAskInput("");
                  setAskFeedback({
                    text: data.reply || batch.summary || "Updated your trip.",
                    warnings: Array.isArray(data.warnings) ? data.warnings : [],
                    isError: false,
                  });
                  for (const act of data.actions) {
                    if (act.type === "ADD_STOP") trackPlannerEvent(PLANNER_EVENTS.STOP_ADDED, { trip_key: t.key }, { logEvent });
                    else if (act.type === "REMOVE_STOP") trackPlannerEvent(PLANNER_EVENTS.STOP_REMOVED, { trip_key: t.key }, { logEvent });
                    else if (act.type === "REPLACE_STOP") trackPlannerEvent(PLANNER_EVENTS.STOP_REPLACED, { trip_key: t.key }, { logEvent });
                    else if (act.type === "OPTIMIZE_DAY") trackPlannerEvent(PLANNER_EVENTS.DAY_OPTIMIZED, { trip_key: t.key }, { logEvent });
                  }
                  return;
                }
                setAskFeedback({
                  text: batch.errors && batch.errors[0] ? batch.errors[0] : "Wayfind refused an unverified change so your trip stays accurate.",
                  warnings: [],
                  isError: true,
                });
                return;
              }
              setAskFeedback({
                text: data.reply || "Tell me which day or stop you'd like to adjust.",
                warnings: Array.isArray(data.warnings) ? data.warnings : [],
                isError: false,
              });
            } catch {
              setAskFeedback({
                text: "Planner connection unavailable right now. You can still reorder, date, note, and route every stop manually.",
                warnings: [],
                isError: true,
              });
            } finally {
              if (timeoutId != null && typeof window !== "undefined") window.clearTimeout(timeoutId);
              setAskBusy(false);
            }
          };

          const handleInlineUndo = () => {
            if (!inlineUndoSnapshot) return;
            setTrips(inlineUndoSnapshot);
            setInlineUndoSnapshot(null);
            setAskFeedback({ text: "Undid the last Wayfind change.", warnings: [], isError: false });
          };

          const scopedDayPrefix =
            effectiveDayFilter !== "overview" && effectiveDayFilter !== "unscheduled"
              ? ` on ${Trips.formatStopDate(effectiveDayFilter)}`
              : "";

          const workspaceSuggestions = items.length === 0
            ? [
                { label: `Build 3-day ${t.city || "Florida"} plan`, prompt: `${t.city || "Orlando"} 3 days, great food and minimal driving`, immediate: true },
                { label: "Weekend highlights & dinner", prompt: `${t.city || "Orlando"} weekend for two adults, top sights and dinner`, immediate: true },
              ]
            : [
                {
                  label: effectiveDayFilter !== "overview" && effectiveDayFilter !== "unscheduled"
                    ? `Optimize ${shortDayTabLabel(effectiveDayFilter)}`
                    : "Optimize route",
                  prompt: effectiveDayFilter !== "overview" && effectiveDayFilter !== "unscheduled"
                    ? `Optimize ${effectiveDayFilter}`
                    : "Optimize route to reduce driving",
                  immediate: true,
                },
                { label: "Add breakfast", prompt: `Add breakfast${scopedDayPrefix}`, immediate: true },
                { label: "Find dinner nearby", prompt: `Add dinner nearby${scopedDayPrefix}`, immediate: true },
                { label: "Make this cheaper", prompt: `Make${scopedDayPrefix || " this trip"} cheaper`, immediate: true },
                { label: "Reduce driving", prompt: "Optimize route to reduce driving", immediate: true },
                { label: "Add something indoors", prompt: `Add something indoors${scopedDayPrefix}`, immediate: true },
                { label: "Replace a stop", prompt: "Replace ", immediate: false },
                ...(undatedStopCount >= 3
                  ? [{ label: "Organize into days", prompt: `${t.city || "Orlando"} 3 days — organize my saved stops and reduce driving`, immediate: false, openSheet: true }]
                  : []),
              ];

          const preShareNotices = [];
          if (items.length > 40) {
            preShareNotices.push("Share ↗ includes the first 25 places. Share privately creates an unlisted link with the first 40 stops (anyone with the link can view and save a copy; your original trip stays unchanged).");
          } else if (items.length > 25) {
            preShareNotices.push("Share ↗ includes the first 25 places. Use Share privately to create an unlisted link with all " + items.length + " stops (up to 40; anyone with the link can view and save a copy).");
          }
          if (itinShareMeasure && itinShareMeasure.warning) {
            preShareNotices.push(itinShareMeasure.warning);
          } else if (listShareMeasure && !listShareMeasure.withinSafeUrlBudget && listShareMeasure.warning) {
            preShareNotices.push(listShareMeasure.warning);
          }
          const listNeedsConfirm = Boolean(listShareMeasure && (listShareMeasure.requiresConfirm || (itinShareMeasure && itinShareMeasure.notesCount > 0)));
          const itinNeedsConfirm = Boolean(itinShareMeasure && itinShareMeasure.requiresConfirm);
          const runAuthed = (reason, fn) => { if (!hasLocalTrip && !requireAuth(reason)) return; fn(); };
          const openAskPanel = (prefill) => {
            setTripMenuOpen(false);
            setAskOpen(true);
            if (typeof prefill === "string") setAskInput(prefill);
            if (typeof window !== "undefined") {
              setTimeout(() => {
                try {
                  if (askInputRef.current) {
                    askInputRef.current.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "center" });
                    askInputRef.current.focus();
                  }
                } catch {}
              }, 60);
            }
          };
          const askPanelVisible = items.length === 0 || askOpen || askBusy || Boolean(askFeedback) || Boolean(inlineUndoSnapshot);
          const primaryChips = workspaceSuggestions.filter((c) => c.openSheet).concat(workspaceSuggestions.filter((c) => !c.openSheet)).slice(0, 3);
          const extraChips = workspaceSuggestions.filter((c) => !primaryChips.includes(c));
          const chipButton = (chip) => (
            <button
              key={chip.label}
              type="button"
              className="wf-itin-chip"
              data-wf-ask-chip={chip.label}
              disabled={askBusy}
              onClick={() => {
                if (chip.openSheet) {
                  openWayfindPlanner({
                    activeTripKey: t.key,
                    city: t.city || "",
                    prompt: chip.prompt,
                    surface: "itinerary_organize_saves",
                  });
                  return;
                }
                if (chip.immediate) {
                  runInlineAskWayfind(chip.prompt);
                } else {
                  setAskInput(chip.prompt);
                  if (askInputRef.current && typeof askInputRef.current.focus === "function") {
                    askInputRef.current.focus();
                  }
                }
              }}
            >
              {chip.label}
            </button>
          );
          const menuStop = stopMenuFor ? items.find((it) => (it.id || (it.place && it.place.id)) === stopMenuFor) : null;
          const menuPlace = menuStop ? menuStop.place : null;
          const menuStopDay = menuStop ? Trips.itemDayOf(menuStop) : null;
          const moveStop = (it, p, group, i, dir) => {
            const stopKey = it.id || p.id;
            runAuthed("Sign up free to plan your trip and pick up right where you left off, anywhere.", () => {
              try { logEvent("stop_reorder", p, { key: t.key, from: i, to: i + dir, dir }); } catch (e) {}
              captureStopPositions(stopKey);
              setTrips((prev) => Trips.moveItem(prev, t.key, stopKey, dir, todayOpt));
            });
          };
          return (
            <div className="wf-itin" data-wf-itin-layout="simple">
              <style dangerouslySetInnerHTML={styleHtml(ITIN_CSS)} />
              <div className="wf-itin-head">
                <button type="button" className="wf-itin-icon" aria-label="Back to all trips" onClick={() => { setActiveTrip(null); setTripNoteEdit(null); setTripMoveFor(null); setDateEditFor(null); setDateDraft(""); setShareConfirmPending(null); setTripMenuOpen(false); setStopMenuFor(null); }}>
                  <span aria-hidden="true">‹</span>
                </button>
                <div className="wf-itin-title-wrap">
                  <h2 className="wf-itin-title">{tripTitle}</h2>
                  <div className="wf-itin-sub">{st.total} place{st.total !== 1 ? "s" : ""}{dateSum ? " · " + dateSum : ""}{st.visited > 0 ? " · " + st.visited + " visited" : ""}</div>
                </div>
                {items.length > 0 && shareList && <button type="button" className="wf-itin-pill wf-itin-share" aria-label={`Share ${tripTitle}`} onClick={() => { if (listNeedsConfirm) { setShareConfirmPending("list"); return; } try { shareList(items.map((it) => it.place), (t.city || "My") + " trip"); } catch (e) {} }}><ShareGlyph /><span className="wf-itin-share-label">Share ↗</span></button>}
                <button
                  type="button"
                  className="wf-itin-icon"
                  data-wf-trip-more="1"
                  aria-label={`More for ${tripTitle}`}
                  aria-haspopup="dialog"
                  aria-expanded={tripMenuOpen}
                  onClick={() => { setTripMenuOpen(true); setStopMenuFor(null); }}
                >
                  <MoreDots />
                </button>
              </div>

              <ItinSheet open={tripMenuOpen} onClose={() => setTripMenuOpen(false)} title={tripTitle} subtitle="Trip options" id="wf-itin-trip-menu">
                {items.length > 0 && (
                  <SheetRow
                    icon="🧭"
                    label={fullTripLegs.length > 1 ? `Route stops 1–${fullTripLegs[0].endStop} ↗` : "Route it ↗"}
                    hint={fullTripLegs.length > 1 ? "Google Maps takes a few stops at a time" : "Opens the whole trip in Google Maps"}
                    aria-label={fullTripLegs.length > 1 ? `Route ${tripTitle} stops 1 to ${fullTripLegs[0].endStop} in Google Maps` : `Route ${tripTitle} in Google Maps`}
                    onClick={() => { setTripMenuOpen(false); doRoute(fullTripLegs[0] && fullTripLegs[0].url); }}
                  />
                )}
                {items.length > 0 && fullTripLegs.slice(1).map((leg, li) => (
                  <SheetRow
                    key={"leg" + li}
                    icon="🧭"
                    data-wf-trip-route-leg={li + 2}
                    label={`Route stops ${leg.startStop}–${leg.endStop} ↗`}
                    hint="Google Maps takes a few stops at a time"
                    aria-label={`Route ${tripTitle} stops ${leg.startStop} to ${leg.endStop} in Google Maps`}
                    onClick={() => { setTripMenuOpen(false); doRoute(leg.url); }}
                  />
                ))}
                {entitlement.allowed && (
                  <SheetRow icon="✨" label="Ask Wayfind" hint="Add dinner, cut driving, fill a gap" data-wf-ask-open="1" onClick={() => openAskPanel()} />
                )}
                {liveTripsOn && items.length > 0 && (
                  <SheetRow
                    icon="👥"
                    label={liveBusy ? "Starting…" : "Plan together"}
                    hint="Edit this trip live with friends"
                    data-wf-live-start="1"
                    aria-label={`Plan ${tripTitle} together with friends, live`}
                    disabled={liveBusy}
                    onClick={() => startLiveTrip(t, items)}
                  />
                )}
                {itineraryFlags && itineraryFlags.share && items.length > 0 && (
                  <SheetRow
                    icon="🔗"
                    label="Share privately"
                    hint="An unlisted link with your notes"
                    aria-label={`Share an unlisted snapshot link for ${tripTitle}`}
                    onClick={() => { setTripMenuOpen(false); if (!requireAuth("Sign up free to share an unlisted snapshot link to this trip.")) return; if (itinNeedsConfirm) { setShareConfirmPending("itinerary"); return; } if (shareTrip) shareTrip(t); }}
                  />
                )}
                {items.length >= 3 && (
                  <div className="wf-itin-sheet-row-wrap">
                    <PublishGuideButton trip={t} user={user} requireAuth={requireAuth} logEvent={logEvent} triggerClassName="wf-itin-sheet-row" triggerIcon="📖" triggerHint="Let other travelers use your plan" />
                  </div>
                )}
              </ItinSheet>

              {liveError && <div role="alert" data-wf-live-error="1" className="wf-itin-alert">{liveError}</div>}
              {preShareNotices.length > 0 && (
                <div data-wf-share-limit-note="true" className="wf-itin-note-muted">
                  {preShareNotices.join(" ")}
                </div>
              )}
              {shareConfirmPending && (
                <div
                  role="alert"
                  data-wf-share-confirm-prompt={shareConfirmPending}
                  className="wf-itin-panel wf-itin-confirm"
                >
                  <div style={{ flex: 1, minWidth: 200, fontSize: 13, color: C.text, lineHeight: 1.45 }}>
                    {shareConfirmPending === "list"
                      ? `${listShareMeasure && listShareMeasure.warning ? listShareMeasure.warning + " " : ""}${itinShareMeasure && itinShareMeasure.notesCount > 0 ? `Share ↗ shares a place list without your ${itinShareMeasure.notesCount} stop note${itinShareMeasure.notesCount === 1 ? "" : "s"} (use Share privately to include notes). ` : ""}Your original saved trip stays unchanged.`
                      : `${(itinShareMeasure && itinShareMeasure.warning) || "This share link uses compaction to fit URL limits."} Your original saved trip stays unchanged.`}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {((shareConfirmPending === "list" && listShareMeasure && listShareMeasure.ok) || (shareConfirmPending === "itinerary" && itinShareMeasure && itinShareMeasure.ok)) && (
                      <button
                        type="button"
                        className="wf-itin-pill wf-itin-pill-primary"
                        data-wf-confirm-share={shareConfirmPending}
                        onClick={() => {
                          const mode = shareConfirmPending;
                          setShareConfirmPending(null);
                          if (mode === "list") {
                            try { shareList(items.map((it) => it.place), (t.city || "My") + " trip"); } catch (e) {}
                          } else if (shareTrip) {
                            shareTrip(t);
                          }
                        }}
                      >
                        Share copy anyway
                      </button>
                    )}
                    <button type="button" className="wf-itin-pill" data-wf-cancel-share={shareConfirmPending} onClick={() => setShareConfirmPending(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Ask Wayfind: one tidy panel, opened from the trip menu, a day's "Add a stop", or shown on an empty trip. */}
              {entitlement.allowed && (
                <div
                  data-wf-ask-wayfind-bar="1"
                  data-wf-ask-open-state={askPanelVisible ? "open" : "closed"}
                  className="wf-itin-panel wf-itin-ask"
                  hidden={!askPanelVisible}
                  style={askPanelVisible ? undefined : { display: "none" }}
                >
                  <div className="wf-itin-ask-head">
                    <span className="wf-itin-ask-title">✨ Ask Wayfind</span>
                    {items.length > 0 && (
                      <button type="button" className="wf-itin-icon wf-itin-icon-sm" aria-label="Close Ask Wayfind" onClick={() => { setAskOpen(false); setAskFeedback(null); setShowMoreChips(false); }}>
                        <span aria-hidden="true">✕</span>
                      </button>
                    )}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      runInlineAskWayfind(askInput);
                    }}
                    className="wf-itin-ask-form"
                  >
                    <input
                      ref={askInputRef}
                      type="text"
                      data-wf-ask-wayfind-input="1"
                      aria-label={`Ask Wayfind about ${tripTitle}`}
                      value={askInput}
                      disabled={askBusy}
                      onChange={(e) => setAskInput(e.target.value)}
                      placeholder={
                        items.length === 0
                          ? `Describe your ${t.city || "Florida"} trip…`
                          : "What should change?"
                      }
                      className="wf-itin-input"
                    />
                    <button
                      type="submit"
                      data-wf-ask-wayfind-submit="1"
                      aria-label="✨ Ask Wayfind"
                      disabled={askBusy || !askInput.trim()}
                      className="wf-itin-pill wf-itin-pill-primary"
                    >
                      {askBusy ? "Updating…" : "Ask"}
                    </button>
                  </form>
                  <div className="wf-itin-chips">
                    {primaryChips.map(chipButton)}
                    {showMoreChips && extraChips.map(chipButton)}
                    {extraChips.length > 0 && (
                      <button type="button" className="wf-itin-chip wf-itin-chip-quiet" aria-expanded={showMoreChips} onClick={() => setShowMoreChips((v) => !v)}>
                        {showMoreChips ? "Fewer ideas" : "More ideas"}
                      </button>
                    )}
                  </div>
                  {(askFeedback || inlineUndoSnapshot) && (
                    <div role="status" data-wf-inline-planner-feedback="1" className="wf-itin-ask-feedback">
                      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                        {askFeedback && askFeedback.text && (
                          <div style={{ fontSize: 13, color: askFeedback.isError ? "#FCA5A5" : C.text, lineHeight: 1.45 }}>{askFeedback.text}</div>
                        )}
                        {askFeedback && Array.isArray(askFeedback.warnings) && askFeedback.warnings.length > 0 && (
                          <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 12, color: "#FCD34D", lineHeight: 1.4 }}>
                            {askFeedback.warnings.map((w, wi) => <li key={wi}>{w}</li>)}
                          </ul>
                        )}
                      </div>
                      {inlineUndoSnapshot && (
                        <button type="button" data-wf-inline-undo="1" onClick={handleInlineUndo} className="wf-itin-pill">
                          Undo
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Day tabs (only when the trip has dated stops) */}
              {grouped.hasDates && (
                <div role="tablist" aria-label="Trip day filter" data-wf-day-tabs="1" className="wf-itin-tabs">
                  <button
                    type="button"
                    role="tab"
                    data-wf-day-tab="overview"
                    aria-selected={effectiveDayFilter === "overview"}
                    onClick={() => setSelectedDayFilter("overview")}
                    className={"wf-itin-tab" + (effectiveDayFilter === "overview" ? " is-on" : "")}
                  >
                    All days
                  </button>
                  {grouped.groups.map((g) => {
                    const tabKey = g.day || "unscheduled";
                    const selected = effectiveDayFilter === tabKey;
                    const tabLabel = g.day ? shortDayTabLabel(g.day) : "No date";
                    return (
                      <button
                        key={tabKey}
                        type="button"
                        role="tab"
                        data-wf-day-tab={tabKey}
                        aria-selected={selected}
                        onClick={() => setSelectedDayFilter(tabKey)}
                        className={"wf-itin-tab" + (selected ? " is-on" : "") + (g.isPast && !selected ? " is-past" : "")}
                      >
                        {tabLabel}
                      </button>
                    );
                  })}
                </div>
              )}

              {RouteMap ? <RouteMap items={items} deviceLoc={!ctx.locApprox ? (ctx.deviceLoc || null) : null} /> : null}
              {items.length === 0 ? (
                <div className="wf-itin-panel wf-itin-empty">
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 6 }}>This trip has no stops yet.</div>
                  <div style={{ fontSize: 13.5, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>Ask Wayfind above for a day by day plan, or browse places to add stops.</div>
                  <button type="button" className="wf-itin-pill" onClick={() => openBrowse(null)}>
                    Browse places
                  </button>
                </div>
              ) : (
                <div ref={stopListRef} data-wf-itin-stops="1">
                  {visibleGroups.map((group, gi) => {
                    const routeLegs = group.day ? Trips.dayRouteLegs(t, group.day, routeOpts) : [];
                    return (
                      <section key={group.key} data-wf-day-group={grouped.hasDates ? (group.day || "unscheduled") : "plain"} className="wf-itin-day">
                        {grouped.hasDates && (
                          <div
                            data-wf-day-heading={group.day || "unscheduled"}
                            data-wf-day-past={group.isPast ? "true" : "false"}
                            className="wf-itin-day-head"
                          >
                            <div style={{ minWidth: 0 }}>
                              <div className={"wf-itin-day-title" + (group.day && !group.isPast ? "" : " is-muted")}>{group.label}</div>
                              <div className="wf-itin-day-sub">{group.items.length} stop{group.items.length !== 1 ? "s" : ""}</div>
                            </div>
                            {group.day && routeLegs.length > 0 && (
                              <div className="wf-itin-day-routes">
                                <button
                                  type="button"
                                  className="wf-itin-link"
                                  aria-label={routeLegs.length > 1 ? `Route ${group.label} stops 1 to ${routeLegs[0].endStop} in Google Maps` : `Route ${group.label} in Google Maps`}
                                  onClick={() => doRouteDay(group, routeLegs[0].url)}
                                >
                                  Route day ↗
                                </button>
                                {routeLegs.slice(1).map((leg, li) => (
                                  <button
                                    key={li}
                                    type="button"
                                    className="wf-itin-link"
                                    data-wf-route-leg={li + 2}
                                    aria-label={`Route ${group.label} stops ${leg.startStop} to ${leg.endStop} in Google Maps`}
                                    onClick={() => doRouteDay(group, leg.url)}
                                  >
                                    Stops {leg.startStop}–{leg.endStop} ↗
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <ol className="wf-itin-timeline" aria-label={grouped.hasDates ? `${group.label} stops` : "Trip stops"}>
                          {group.items.map((it, i) => {
                            const p = it.place;
                            const stopKey = it.id || p.id;
                            const stopDay = Trips.itemDayOf(it);
                            const stopIsPast = stopDay ? Trips.isPastStopDate(stopDay, ctx.__today || undefined) : false;
                            const stopDateLabel = stopDay
                              ? (stopIsPast ? `Past · ${Trips.formatStopDate(stopDay)}` : Trips.formatStopDate(stopDay))
                              : "Set date";
                            const editing = tripNoteEdit === stopKey;
                            const moving = tripMoveFor === stopKey;
                            const dating = dateEditFor === stopKey;
                            const slotLabel = it.slotLabel || (p && p.slotLabel) || "";
                            const confidence = (p && p.confidence) || "";
                            const confidenceNote = (p && p.confidenceNote) || "";
                            const isLast = i === group.items.length - 1;
                            const nextStopInDay =
                              grouped.hasDates && group.day && !isLast
                                ? group.items[i + 1]
                                : null;
                            const travelRel = nextStopInDay ? stopTravelRelationship(it, nextStopInDay) : null;
                            const stopNumber = i + 1;
                            const stopName = p.name || "stop";

                            return (
                              <li key={stopKey} data-wf-stop-id={stopKey} className={"wf-itin-stop" + (it.visited ? " is-visited" : "")}>
                                <div className="wf-itin-rail" aria-hidden="true">
                                  <span className="wf-itin-num" data-wf-stop-number={stopNumber}>{it.visited ? "✓" : stopNumber}</span>
                                  {!isLast && <span className="wf-itin-line" />}
                                </div>
                                <div className="wf-itin-body">
                                  <div className="wf-itin-meta" data-wf-stop-plan-meta={stopKey}>
                                    <span className="wf-itin-time">
                                      <span className="wf-sr">Stop {stopNumber}{slotLabel ? ", " : ""}</span>
                                      {slotLabel || (it.visited ? "Visited" : "")}
                                    </span>
                                    {confidence ? (
                                      <span
                                        data-wf-stop-confidence={confidence}
                                        title={confidenceNote || undefined}
                                        className={"wf-itin-badge" + (confidence === "confirmed" ? " is-ok" : " is-warn")}
                                      >
                                        {confidence === "confirmed" ? "✓ Confirmed" : "Check hours"}
                                      </span>
                                    ) : null}
                                  </div>
                                  <div className="wf-itin-card">
                                    <StopBoundary name={p.name}>
                                      <PlaceCard
                                        p={p}
                                        saved={isSaved(p.id)}
                                        liked={!!liked[p.id]}
                                        disliked={!!disliked[p.id]}
                                        onDetail={() => {
                                          if (isPlannedStopItem(it)) {
                                            trackPlannerEvent(
                                              PLANNER_EVENTS.HIGH_INTENT_FROM_PLANNED_STOP,
                                              { action_kind: "detail_open", city: t.city || "", saved_stop_count: items.length },
                                              { logEvent }
                                            );
                                          }
                                          openDetail(p);
                                        }}
                                        onSave={() => quickSaveFavorite(p)}
                                        onLike={(e) => toggleLike(e, p)}
                                        onDislike={(e) => toggleDislike(e, p)}
                                        onShareCard={(pl) => { try { addShared(pl); giveawayMark(pl.id); } catch (e) {} }}
                                        line={blurbs[p.id]}
                                        onBadge={openExperience}
                                        onCuisineTap={openCuisine}
                                      />
                                      {typeof window !== "undefined" && !cardComplete(p) && !searchEditorialCard(p) && (
                                        <div
                                          data-wf-unscored-stop-card={p.id}
                                          className="wf-itin-mini"
                                          onClick={() => {
                                            if (isPlannedStopItem(it)) {
                                              trackPlannerEvent(
                                                PLANNER_EVENTS.HIGH_INTENT_FROM_PLANNED_STOP,
                                                { action_kind: "detail_open", city: t.city || "", saved_stop_count: items.length },
                                                { logEvent }
                                              );
                                            }
                                            openDetail(p);
                                          }}
                                          role="button"
                                          tabIndex={0}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                              e.preventDefault();
                                              openDetail(p);
                                            }
                                          }}
                                        >
                                          <div className="wf-itin-mini-photo">
                                            <SafeImg
                                              src={railPhotoSrc(p) || ""}
                                              alt=""
                                              compact
                                              category={p.type}
                                              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                                            />
                                          </div>
                                          <div style={{ padding: "12px 14px 14px" }}>
                                            <div style={{ fontSize: 16.5, fontWeight: 800, color: C.text, lineHeight: 1.3 }}>
                                              {p.name || "Saved stop"}
                                            </div>
                                            <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
                                              {[p.type, p.price, p.address || p.city].filter(Boolean).join(" · ")}
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </StopBoundary>
                                  </div>
                                  {it.note && !editing && <div className="wf-itin-note">{it.note}</div>}
                                  {editing && (
                                    <div className="wf-itin-panel wf-itin-inline">
                                      <textarea autoFocus defaultValue={it.note} id={"note_" + stopKey} aria-label={`Note for ${stopName}`} placeholder="Reservation time, what to order, who to ask for…" className="wf-itin-input wf-itin-textarea" />
                                      <div className="wf-itin-inline-actions">
                                        <button type="button" className="wf-itin-pill wf-itin-pill-primary" onClick={() => { if (!hasLocalTrip && !requireAuth("Sign up free to jot trip notes that travel with you.")) return; const el = document.getElementById("note_" + stopKey); const v = el ? el.value : ""; setTrips((prev) => Trips.setNote(prev, t.key, stopKey, (v || "").trim())); setTripNoteEdit(null); }}>Save note</button>
                                        <button type="button" className="wf-itin-pill" onClick={() => setTripNoteEdit(null)}>Cancel</button>
                                      </div>
                                    </div>
                                  )}
                                  {moving && (
                                    <div className="wf-itin-panel wf-itin-inline">
                                      <div className="wf-itin-inline-label">Move {stopName} to another trip</div>
                                      {others.length === 0 ? (
                                        <div style={{ fontSize: 13, color: C.muted, padding: "4px 2px" }}>No other trips yet.</div>
                                      ) : others.map((o) => (
                                        <button type="button" key={o.key} className="wf-itin-trip-pick" onClick={() => { if (!hasLocalTrip && !requireAuth("Sign up free to plan your trip and pick up right where you left off, anywhere.")) return; try { logEvent("stop_move_trip", p, { from_key: t.key, to_key: o.key, to_city: o.city, to_state: o.state }); } catch (e) {} setTrips((prev) => Trips.movePlaceToTrip(prev, t.key, o.key, stopKey)); setTripMoveFor(null); }}>
                                          <StateBadge code={o.state} size={28} />
                                          <span>{o.city}{o.state ? ", " + o.state : ""}</span>
                                        </button>
                                      ))}
                                      <div className="wf-itin-inline-actions">
                                        <button type="button" className="wf-itin-pill" onClick={() => setTripMoveFor(null)}>Cancel</button>
                                      </div>
                                    </div>
                                  )}
                                  {!editing && !moving && (
                                    <div className="wf-itin-actions">
                                      <button
                                        id={"wf-date-btn-" + stopKey}
                                        type="button"
                                        aria-expanded={dating}
                                        aria-controls={"wf-date-picker-" + stopKey}
                                        aria-label={stopDay ? `Change date for ${p.name || "stop"} (${stopIsPast ? "Past, " : ""}${Trips.formatStopDate(stopDay, { heading: true })})` : `Set date for ${p.name || "stop"}`}
                                        onClick={() => {
                                          if (dating) {
                                            closeDatePicker(stopKey);
                                          } else {
                                            openDatePicker(stopKey, stopDay);
                                          }
                                        }}
                                        className={"wf-itin-date" + (stopDay ? (stopIsPast ? " is-past" : " is-set") : "")}
                                      >
                                        <Icon name="calendar" size={14} color={stopDay && !stopIsPast ? C.light : C.muted} />
                                        <span>{stopDateLabel}</span>
                                      </button>
                                      <div className="wf-itin-reorder" role="group" aria-label={`Reorder ${stopName}`}>
                                        <button type="button" className="wf-itin-icon" aria-label={`Move ${p.name || "stop"} earlier`} onClick={() => moveStop(it, p, group, i, -1)} disabled={i === 0}>
                                          <Chevron dir="up" />
                                        </button>
                                        <button type="button" className="wf-itin-icon" aria-label={`Move ${p.name || "stop"} later`} onClick={() => moveStop(it, p, group, i, 1)} disabled={isLast}>
                                          <Chevron dir="down" />
                                        </button>
                                      </div>
                                      <button
                                        type="button"
                                        className="wf-itin-icon"
                                        data-wf-stop-more={stopKey}
                                        aria-label={`More for ${stopName}`}
                                        aria-haspopup="dialog"
                                        aria-expanded={stopMenuFor === stopKey}
                                        onClick={() => { setStopMenuFor(stopKey); setTripMenuOpen(false); setTripNoteEdit(null); setTripMoveFor(null); setDateEditFor(null); }}
                                      >
                                        <MoreDots />
                                      </button>
                                    </div>
                                  )}
                                  {dating && (
                                    <div
                                      id={"wf-date-picker-" + stopKey}
                                      data-wf-date-picker={stopKey}
                                      role="region"
                                      aria-labelledby={"wf-date-picker-label-" + stopKey}
                                      onKeyDown={(e) => {
                                        if (e.key === "Escape") {
                                          e.stopPropagation();
                                          closeDatePicker(stopKey);
                                        }
                                      }}
                                      className="wf-itin-panel wf-itin-inline"
                                    >
                                      <div id={"wf-date-picker-label-" + stopKey} className="wf-itin-inline-label">
                                        Pick a day for {p.name || "this stop"}
                                      </div>
                                      {quickChoices.length > 0 && (
                                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                                          {quickChoices.map((ch) => {
                                            const active = stopDay === ch.day;
                                            return (
                                              <button
                                                key={ch.day}
                                                type="button"
                                                data-wf-quick-date={ch.day}
                                                aria-pressed={active}
                                                aria-label={`Set date for ${p.name || "stop"} to ${ch.label}`}
                                                onClick={() => applyStopDate(p, ch.day, stopKey)}
                                                className={"wf-itin-chip" + (active ? " is-on" : "")}
                                                style={{ minHeight: 44 }}
                                              >
                                                {ch.label}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}
                                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                        <input
                                          id={"wf-date-input-" + stopKey}
                                          type="date"
                                          aria-label={`Choose date for ${p.name || "stop"}`}
                                          value={dateDraft}
                                          onChange={(e) => setDateDraft(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              const clean = Trips.normalizeStopDate(dateDraft);
                                              if (clean) {
                                                e.preventDefault();
                                                applyStopDate(p, clean, stopKey);
                                              }
                                            }
                                          }}
                                          className="wf-itin-input"
                                          style={{ flex: "0 1 auto", width: "auto", minHeight: 44, colorScheme: "dark" }}
                                        />
                                        <button
                                          type="button"
                                          aria-label={`Save date for ${p.name || "stop"}`}
                                          onClick={() => { const clean = Trips.normalizeStopDate(dateDraft); if (clean) applyStopDate(p, clean, stopKey); }}
                                          disabled={!Trips.normalizeStopDate(dateDraft)}
                                          className="wf-itin-pill wf-itin-pill-primary"
                                          style={{ minHeight: 44 }}
                                        >
                                          Save date
                                        </button>
                                        {stopDay && (
                                          <button
                                            type="button"
                                            aria-label={`Clear date for ${p.name || "stop"}`}
                                            onClick={() => applyStopDate(p, null, stopKey)}
                                            className="wf-itin-pill"
                                            style={{ minHeight: 44 }}
                                          >
                                            Clear date
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          aria-label={`Cancel date selection for ${p.name || "stop"}`}
                                          onClick={() => closeDatePicker(stopKey)}
                                          className="wf-itin-pill"
                                          style={{ minHeight: 44 }}
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                  {travelRel && travelRel.label && (
                                    <div data-wf-travel-connector="1" className="wf-itin-travel">
                                      {travelRel.label}
                                    </div>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                        {grouped.hasDates && group.day && !group.isPast && entitlement.allowed && (
                          <button
                            type="button"
                            data-wf-day-add={group.day}
                            className="wf-itin-add"
                            onClick={() => openAskPanel(`Add a stop on ${Trips.formatStopDate(group.day)}: `)}
                          >
                            <span aria-hidden="true">＋</span> Add a stop to {shortDayTabLabel(group.day)}
                          </button>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}

              <ItinSheet
                open={Boolean(menuStop)}
                onClose={() => setStopMenuFor(null)}
                title={menuPlace ? (menuPlace.name || "This stop") : ""}
                subtitle={menuStop ? [menuStop.slotLabel || (menuPlace && menuPlace.slotLabel) || "", menuStopDay ? Trips.formatStopDate(menuStopDay) : ""].filter(Boolean).join(" · ") : ""}
                id="wf-itin-stop-menu"
              >
                {menuStop && menuPlace && (() => {
                  const it = menuStop;
                  const p = menuPlace;
                  const stopKey = it.id || p.id;
                  const close = () => setStopMenuFor(null);
                  return (
                    <>
                      <SheetRow
                        icon={it.visited ? "↺" : "✓"}
                        label={it.visited ? "Mark as not visited" : "Mark visited"}
                        onClick={() => { close(); if (!hasLocalTrip && !requireAuth("Sign up free to plan your trip and pick up right where you left off, anywhere.")) return; try { logEvent("stop_visited", p, { key: t.key, visited: !it.visited }); } catch (e) {} setTrips((prev) => Trips.toggleVisited(prev, t.key, stopKey)); }}
                      />
                      <SheetRow
                        icon="✎"
                        label={it.note ? "Edit note" : "Add note"}
                        onClick={() => { close(); if (!hasLocalTrip && !requireAuth("Sign up free to jot trip notes that travel with you.")) return; setTripNoteEdit(stopKey); setTripMoveFor(null); setDateEditFor(null); }}
                      />
                      <SheetRow
                        icon="📅"
                        label={menuStopDay ? "Change day" : "Set a day"}
                        onClick={() => { close(); openDatePicker(stopKey, menuStopDay); }}
                      />
                      <SheetRow
                        icon="♡"
                        label="Ask someone to come"
                        hint="Send a quick invite"
                        data-wf-ask-someone="itinerary"
                        aria-label={`Ask someone to ${p.name || "this stop"}`}
                        onClick={() => {
                          close();
                          openShareFlow({
                            title: p.name || "Trip stop",
                            name: p.name || "",
                            city: t.city || "",
                            placeId: p.id || "",
                            kind: placeKinds(p),
                            when: menuStopDay || "",
                            eventDate: p.itemType === "event" ? (menuStopDay || p.date || "") : "",
                            surface: "itinerary",
                            geo: p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : "",
                            directInvite: true,
                          });
                        }}
                      />
                      <SheetRow
                        icon={isSaved(p.id) ? "♥" : "♡"}
                        label={isSaved(p.id) ? "Saved to Favorites" : "Save to Favorites"}
                        onClick={() => { close(); quickSaveFavorite(p); }}
                      />
                      <SheetRow
                        icon={liked[p.id] ? "👍" : "👍"}
                        label={liked[p.id] ? "Liked" : "Like"}
                        onClick={(e) => { close(); toggleLike(e, p); }}
                      />
                      {shareList && (
                        <SheetRow
                          icon="↗"
                          label="Share this place"
                          onClick={() => { close(); try { addShared(p); giveawayMark(p.id); } catch (e) {} try { shareList([p], p.name || "A Wayfind pick"); } catch (e) {} }}
                        />
                      )}
                      <SheetRow
                        icon="⇄"
                        label="Move to another trip"
                        onClick={() => { close(); if (!hasLocalTrip && !requireAuth("Sign up free to plan your trip and pick up right where you left off, anywhere.")) return; setTripMoveFor(stopKey); setTripNoteEdit(null); setDateEditFor(null); }}
                      />
                      <SheetRow
                        icon="🗑"
                        danger
                        label="Remove from trip"
                        hint="It stays in your Favorites"
                        onClick={() => { close(); if (!hasLocalTrip && !requireAuth("Sign up free to plan your trip and pick up right where you left off, anywhere.")) return; if (typeof window !== "undefined" && window.confirm("Remove this place from the trip? It stays in your Favorites.")) { try { logEvent("stop_remove", p, { key: t.key, remaining: items.length - 1 }); } catch (e) {} setTrips((prev) => Trips.removePlaceFromTrip(prev, t.key, stopKey)); } }}
                      />
                    </>
                  );
                })()}
              </ItinSheet>
            </div>
          );
        })()}
    </>
  );
}

// ── Itinerary building blocks (owner, 2026-11-28: "too many buttons", "it
// needs to look premium"). Each stop shows its number, time, the place card
// and three quiet controls (day, reorder, •••). Everything else lives in one
// bottom sheet per stop and one per trip. Colors come from kit's C tokens.

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function prefersReducedMotion() {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function MoreDots() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="5" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="19" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}

function ShareGlyph() {
  return (
    <svg className="wf-itin-share-ico" width="19" height="19" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 3v12M7.5 7.5L12 3l4.5 4.5M5 12.5V19a2 2 0 002 2h10a2 2 0 002-2v-6.5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Chevron({ dir }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" style={{ transform: dir === "down" ? "rotate(180deg)" : "none" }}>
      <path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// One bottom sheet. Rendered (hidden) even when closed, so the trip's actions
// stay in the server HTML and reachable from one tap.
function ItinSheet({ open, onClose, title, subtitle, id, children }) {
  const panelRef = useRef(null);
  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const prevFocus = document.activeElement;
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", onKey);
    const timer = setTimeout(() => {
      try {
        const first = panelRef.current && panelRef.current.querySelector("button:not([disabled]), a[href]");
        if (first) first.focus({ preventScroll: true });
      } catch {}
    }, 30);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", onKey);
      try { if (prevFocus && typeof prevFocus.focus === "function") prevFocus.focus({ preventScroll: true }); } catch {}
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div
      className={"wf-itin-sheet" + (open ? " is-open" : "")}
      hidden={!open}
      style={open ? undefined : { display: "none" }}
      data-wf-itin-sheet={id}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div ref={panelRef} className="wf-itin-sheet-panel" role="dialog" aria-modal="true" aria-labelledby={id + "-title"} id={id}>
        <div className="wf-itin-sheet-grip" aria-hidden="true" />
        <div className="wf-itin-sheet-head">
          <div style={{ minWidth: 0 }}>
            <div id={id + "-title"} className="wf-itin-sheet-title">{title}</div>
            {subtitle ? <div className="wf-itin-sheet-sub">{subtitle}</div> : null}
          </div>
          <button type="button" className="wf-itin-icon wf-itin-icon-sm" aria-label="Close" onClick={onClose}>
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div className="wf-itin-sheet-list">{children}</div>
      </div>
    </div>
  );
}

function SheetRow({ icon, label, hint, danger, onClick, disabled, ...rest }) {
  return (
    <button type="button" className={"wf-itin-sheet-row" + (danger ? " is-danger" : "")} onClick={onClick} disabled={disabled} {...rest}>
      <span className="wf-itin-sheet-ico" aria-hidden="true">{icon}</span>
      <span className="wf-itin-sheet-text">
        <span className="wf-itin-sheet-label">{label}</span>
        {hint ? <span className="wf-itin-sheet-hint">{hint}</span> : null}
      </span>
    </button>
  );
}

// One stop that fails to render shows a small note instead of taking the whole
// itinerary (and the app around it) down with it.
class StopBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) {
    try {
      if (typeof window !== "undefined") captureOrQueue(window, "itinerary_stop_error", { message: String((error && error.message) || "").slice(0, 200) });
    } catch {}
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="wf-itin-panel" data-wf-stop-fallback="1" style={{ padding: "14px 16px" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{this.props.name || "This stop"}</div>
          <div style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>The details for this stop could not load. Your plan is safe.</div>
        </div>
      );
    }
    return this.props.children;
  }
}

const ITIN_CSS = `
.wf-itin{max-width:780px;--it-card:${C.card};--it-panel:${C.panel};--it-line:${C.border};--it-text:${C.text};--it-soft:${C.light};--it-faint:${C.muted};--it-accent:${C.accent};padding-bottom:28px}
.wf-itin .wf-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.wf-itin button{font-family:inherit;-webkit-tap-highlight-color:transparent}
.wf-itin button:focus-visible,.wf-itin-sheet button:focus-visible{outline:2px solid var(--it-accent);outline-offset:2px}
.wf-itin-head{display:flex;align-items:center;gap:8px;padding:6px 0 18px}
.wf-itin-share-ico{display:none;width:19px!important;height:19px!important;flex:none}
@media (max-width:520px){.wf-itin-share{width:44px;padding:0}.wf-itin-share-label{display:none}.wf-itin-share-ico{display:block}}
.wf-itin-title-wrap{flex:1 1 auto;min-width:0}
.wf-itin-title{margin:0;font-size:22px;line-height:1.2;font-weight:800;letter-spacing:-.01em;color:var(--it-text);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.wf-itin-sub{margin-top:3px;font-size:13.5px;color:var(--it-faint)}
.wf-itin-icon{flex:none;display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;min-width:44px;min-height:44px;border-radius:999px;border:1px solid var(--it-line);background:rgba(255,255,255,.03);color:var(--it-text);font-size:20px;font-weight:700;cursor:pointer;transition:background .15s,border-color .15s,transform .15s,opacity .15s}
.wf-itin-icon:hover{border-color:rgba(203,213,225,.45);background:rgba(255,255,255,.06)}
.wf-itin-icon:active{transform:scale(.94)}
.wf-itin-icon:disabled{opacity:.28;cursor:default;transform:none}
.wf-itin-icon-sm{width:36px;height:36px;min-width:36px;min-height:36px;font-size:15px}
.wf-itin-pill{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:0 18px;border-radius:999px;border:1px solid var(--it-line);background:rgba(255,255,255,.03);color:var(--it-text);font-size:14px;font-weight:800;white-space:nowrap;cursor:pointer;transition:background .15s,border-color .15s,transform .15s,opacity .15s}
.wf-itin-pill:hover{border-color:rgba(203,213,225,.45)}
.wf-itin-pill:active{transform:scale(.97)}
.wf-itin-pill:disabled{opacity:.5;cursor:default}
.wf-itin-pill-primary{background:var(--it-accent);border-color:var(--it-accent);color:#0D1117}
.wf-itin-pill-primary:hover{border-color:var(--it-accent);filter:brightness(1.06)}
.wf-itin-panel{background:linear-gradient(145deg,rgba(255,255,255,.035),transparent 40%),var(--it-card);border:1px solid rgba(159,177,203,.18);border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.22)}
.wf-itin-alert{font-size:13px;color:#FCA5A5;margin:0 0 12px;line-height:1.4}
.wf-itin-note-muted{font-size:12.5px;color:var(--it-faint);margin:0 0 10px;line-height:1.45}
.wf-itin-confirm{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:14px 16px;margin-bottom:16px}
.wf-itin-ask{padding:14px 14px 12px;margin-bottom:18px;animation:wfItinIn .22s ease both}
.wf-itin-ask-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
.wf-itin-ask-title{font-size:15px;font-weight:800;color:var(--it-text)}
.wf-itin-ask-form{display:flex;align-items:center;gap:8px}
.wf-itin-input{flex:1 1 auto;min-width:0;width:100%;min-height:46px;box-sizing:border-box;border-radius:14px;border:1px solid var(--it-line);background:${C.bg};color:var(--it-text);padding:10px 14px;font-size:16px;font-family:inherit;outline:none;transition:border-color .15s,box-shadow .15s}
.wf-itin-input:focus{border-color:var(--it-accent);box-shadow:0 0 0 3px rgba(249,115,22,.16)}
.wf-itin-textarea{min-height:84px;resize:vertical;line-height:1.45}
.wf-itin-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.wf-itin-chip{min-height:38px;padding:0 14px;border-radius:999px;border:1px solid var(--it-line);background:rgba(255,255,255,.02);color:var(--it-soft);font-size:13px;font-weight:700;cursor:pointer;transition:border-color .15s,color .15s,background .15s}
.wf-itin-chip:hover{color:var(--it-text);border-color:rgba(203,213,225,.45)}
.wf-itin-chip.is-on{background:rgba(249,115,22,.14);border-color:var(--it-accent);color:var(--it-text)}
.wf-itin-chip-quiet{border-style:dashed;color:var(--it-faint)}
.wf-itin-ask-feedback{margin-top:12px;padding-top:12px;border-top:1px solid var(--it-line);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.wf-itin-tabs{display:flex;gap:8px;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none;margin:0 -2px 6px;padding:2px 2px 10px}
.wf-itin-tabs::-webkit-scrollbar{display:none}
.wf-itin-tab{flex:none;min-height:40px;padding:0 16px;border-radius:999px;border:1px solid var(--it-line);background:transparent;color:var(--it-soft);font-size:14px;font-weight:800;white-space:nowrap;cursor:pointer;transition:background .18s,color .18s,border-color .18s}
.wf-itin-tab.is-on{background:var(--it-text);border-color:var(--it-text);color:#0D1117}
.wf-itin-tab.is-past{color:var(--it-faint)}
.wf-itin-empty{text-align:center;padding:34px 20px}
.wf-itin-day{margin:14px 0 8px}
.wf-itin-day-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 14px}
.wf-itin-day-title{font-size:20px;font-weight:800;letter-spacing:-.01em;color:var(--it-text);line-height:1.2}
.wf-itin-day-title.is-muted{color:var(--it-faint)}
.wf-itin-day-sub{margin-top:2px;font-size:13px;color:var(--it-faint)}
.wf-itin-day-routes{display:flex;gap:4px;flex-wrap:wrap}
.wf-itin-link{min-height:44px;padding:0 6px;border:0;background:transparent;color:var(--it-soft);font-size:13.5px;font-weight:800;cursor:pointer;text-decoration:underline;text-decoration-color:rgba(203,213,225,.35);text-underline-offset:4px}
.wf-itin-link:hover{color:var(--it-text)}
.wf-itin-timeline{list-style:none;margin:0;padding:0}
.wf-itin-stop{position:relative;display:flex;gap:12px;will-change:auto}
.wf-itin-rail{flex:none;width:32px;display:flex;flex-direction:column;align-items:center}
.wf-itin-num{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:999px;background:var(--it-accent);color:#0D1117;font-size:15px;font-weight:900;font-variant-numeric:tabular-nums;box-shadow:0 0 0 4px rgba(249,115,22,.14),0 6px 16px rgba(249,115,22,.25);transition:transform .25s}
.wf-itin-stop.is-visited .wf-itin-num{background:${C.green};box-shadow:0 0 0 4px rgba(34,197,94,.14)}
.wf-itin-line{flex:1 1 auto;width:2px;margin:8px 0 2px;border-radius:2px;background:linear-gradient(180deg,rgba(249,115,22,.55),rgba(159,177,203,.18))}
.wf-itin-body{flex:1 1 auto;min-width:0;padding-bottom:26px}
.wf-itin-meta{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:32px;margin-bottom:8px}
.wf-itin-time{font-size:15px;font-weight:800;color:var(--it-text);letter-spacing:.01em}
.wf-itin-badge{flex:none;font-size:11.5px;font-weight:800;padding:4px 10px;border-radius:999px}
.wf-itin-badge.is-ok{background:rgba(16,185,129,.14);color:#6EE7B7}
.wf-itin-badge.is-warn{background:rgba(245,158,11,.14);color:#FCD34D}
.wf-itin-stop.is-visited .wf-itin-card{opacity:.6}
.wf-itin-card .wf-place-card{height:auto!important;width:100%!important;max-width:none!important;flex:none!important;margin:0!important;border-radius:20px!important}
.wf-itin-card .wf-place-card-layout{display:flex!important;flex-direction:column!important;height:auto!important;grid-template-columns:none!important}
.wf-itin-card .wf-place-card-media{width:100%!important;height:184px!important;min-height:0!important;flex:none!important;border-radius:0!important}
.wf-itin-card .wf-place-card-content{height:auto!important;min-height:0!important;padding:14px 16px 16px!important;gap:6px}
.wf-itin-card .wf-place-card-name{font-size:18px!important;line-height:1.25!important;-webkit-line-clamp:2}
.wf-itin-card .wf-place-card-title-row{min-height:0!important;height:auto!important}
.wf-itin-card .wf-place-card-heading{padding-right:0!important;min-height:0!important;height:auto!important}
.wf-itin-card .wf-place-card-category{margin:0 0 6px!important}
.wf-itin-card .wf-place-card-name,.wf-itin-card .wf-place-card-heading .wf-place-card-name{margin-top:2px!important}
.wf-itin-card .wf-place-card-take{-webkit-line-clamp:2}
.wf-itin-card .wf-place-card-save,.wf-itin-card .wf-place-card-like,.wf-itin-card .wf-place-card-dislike,.wf-itin-card .wf-place-card-share{display:none!important}
.wf-itin-card .wf-place-card-actions{display:flex!important;grid-template-columns:none!important;padding-top:10px!important}
.wf-itin-card .wf-place-card-actions:not(:has(.wf-place-card-book)){display:none!important}
.wf-itin-card .wf-place-card-book{flex:1 1 auto;justify-content:center;min-height:44px}
.wf-itin-mini{overflow:hidden;border-radius:20px;background:var(--it-card);border:1px solid rgba(159,177,203,.25);cursor:pointer;box-shadow:0 14px 36px rgba(0,0,0,.27)}
.wf-itin-mini-photo{width:100%;height:184px;overflow:hidden;background:#111824}
.wf-itin-note{margin-top:10px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(159,177,203,.14);font-size:14px;line-height:1.5;color:var(--it-soft)}
.wf-itin-actions{display:flex;align-items:center;gap:8px;margin-top:12px}
.wf-itin-date{flex:1 1 auto;min-width:0;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 14px;border-radius:999px;border:1px solid var(--it-line);background:rgba(255,255,255,.02);color:var(--it-faint);font-size:14px;font-weight:700;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wf-itin-date span{overflow:hidden;text-overflow:ellipsis}
.wf-itin-date.is-set{color:var(--it-text)}
.wf-itin-date.is-past{color:var(--it-faint)}
.wf-itin-reorder{display:inline-flex;gap:6px}
.wf-itin-inline{margin-top:10px;padding:14px;animation:wfItinIn .2s ease both}
.wf-itin-inline-label{font-size:13px;color:var(--it-faint);margin-bottom:10px}
.wf-itin-inline-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.wf-itin-trip-pick{display:flex;align-items:center;gap:10px;width:100%;min-height:48px;padding:6px 8px;border:0;border-radius:12px;background:transparent;color:var(--it-text);font-size:15px;text-align:left;cursor:pointer}
.wf-itin-trip-pick:hover{background:rgba(255,255,255,.04)}
.wf-itin-travel{margin-top:14px;font-size:12.5px;color:var(--it-faint);display:flex;align-items:center;gap:6px}
.wf-itin-travel::before{content:"";width:6px;height:6px;border-radius:50%;background:rgba(159,177,203,.45)}
.wf-itin-add{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:48px;margin:0 0 10px;border-radius:16px;border:1px dashed rgba(159,177,203,.32);background:transparent;color:var(--it-soft);font-size:14px;font-weight:800;cursor:pointer;transition:border-color .15s,color .15s}
.wf-itin-add:hover{color:var(--it-text);border-color:rgba(203,213,225,.5)}
.wf-itin-stop.wf-itin-moved .wf-itin-card{animation:wfItinGlow 1s ease}
.wf-itin-stop.wf-itin-moved .wf-itin-num{animation:wfItinPop .45s ease}
.wf-itin-sheet{position:fixed;inset:0;z-index:945;display:flex;align-items:flex-end;justify-content:center;background:rgba(2,6,14,.62);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);animation:wfItinFade .18s ease both}
.wf-itin-sheet-panel{width:100%;max-width:520px;max-height:86vh;overflow-y:auto;overscroll-behavior:contain;box-sizing:border-box;padding:8px 14px calc(16px + env(safe-area-inset-bottom));border-radius:24px 24px 0 0;background:${C.panel};border:1px solid rgba(159,177,203,.16);border-bottom:0;box-shadow:0 -18px 50px rgba(0,0,0,.45);animation:wfItinUp .26s cubic-bezier(.2,.8,.2,1) both}
.wf-itin-sheet-grip{width:40px;height:5px;border-radius:5px;background:rgba(203,213,225,.28);margin:4px auto 10px}
.wf-itin-sheet-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:2px 4px 10px}
.wf-itin-sheet-title{font-size:18px;font-weight:800;color:${C.text};line-height:1.25}
.wf-itin-sheet-sub{margin-top:3px;font-size:13px;color:${C.muted}}
.wf-itin-sheet-list{display:flex;flex-direction:column;gap:2px}
.wf-itin-sheet-row,.wf-itin-sheet-row-wrap>button{display:flex;align-items:center;gap:14px;width:100%;min-height:56px;padding:8px 10px;border:0;border-radius:14px;background:transparent;color:${C.text};font-family:inherit;font-size:16px;font-weight:700;text-align:left;cursor:pointer;transition:background .14s}
.wf-itin-sheet-row:hover,.wf-itin-sheet-row:focus-visible{background:rgba(255,255,255,.05)}
.wf-itin-sheet-row:disabled{opacity:.55;cursor:default}
.wf-itin-sheet-row.is-danger{color:#FCA5A5}
.wf-itin-sheet-ico{flex:none;display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:12px;background:rgba(255,255,255,.05);font-size:17px}
.wf-itin-sheet-text{display:flex;flex-direction:column;min-width:0}
.wf-itin-sheet-label{line-height:1.25}
.wf-itin-sheet-hint{margin-top:2px;font-size:12.5px;font-weight:600;color:${C.muted}}
@keyframes wfItinIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@keyframes wfItinFade{from{opacity:0}to{opacity:1}}
@keyframes wfItinUp{from{transform:translateY(24px);opacity:.6}to{transform:none;opacity:1}}
@keyframes wfItinGlow{0%{box-shadow:0 0 0 0 rgba(249,115,22,0)}25%{box-shadow:0 0 0 3px rgba(249,115,22,.55),0 18px 40px rgba(249,115,22,.18)}100%{box-shadow:0 0 0 0 rgba(249,115,22,0)}}
@keyframes wfItinPop{0%{transform:scale(1)}45%{transform:scale(1.18)}100%{transform:scale(1)}}
@media (min-width:768px){.wf-itin-title{font-size:26px}.wf-itin-card .wf-place-card-media,.wf-itin-mini-photo{height:240px!important}.wf-itin-sheet{align-items:center}.wf-itin-sheet-panel{border-radius:24px;border-bottom:1px solid rgba(159,177,203,.16)}}
@media (prefers-reduced-motion:reduce){.wf-itin *,.wf-itin-sheet,.wf-itin-sheet *{animation:none!important;transition:none!important}}
`;
