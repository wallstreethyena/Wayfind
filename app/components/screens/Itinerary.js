"use client";
// Extracted from app/home.js (G1, July 2026 decomposition). Render-only; the
// two original sibling branches (trip list, open trip) keep their conditions.
// Upgraded into the Wayfind Trip-Planning Workspace while preserving every
// manual itinerary capability, date picker contract, share flow, and auth gate.
import { useEffect, useRef, useState } from "react";
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
  const trackedPlanOpenRef = useRef(new Set());

  useEffect(() => {
    setDateEditFor(null);
    setDateDraft("");
    setShareConfirmPending(null);
    setSelectedDayFilter("overview");
    setAskInput("");
    setAskFeedback(null);
    setInlineUndoSnapshot(null);
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
                {user && itineraryFlags && itineraryFlags.sync ? <span style={{ fontSize: 12, color: C.light }}>Synced across devices</span> : null}
              </div>

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
          return (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", paddingBottom: 14, borderBottom: "1px solid " + C.border, marginBottom: 14, paddingTop: 4 }}>
                <button type="button" aria-label="Back to all trips" onClick={() => { setActiveTrip(null); setTripNoteEdit(null); setTripMoveFor(null); setDateEditFor(null); setDateDraft(""); setShareConfirmPending(null); }} style={{ background: "none", border: "none", color: C.light, fontSize: 22, minWidth: 44, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>‹</button>
                <div style={{ flex: "1 1 190px", minWidth: 190 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tripTitle}</div>
                  <div style={{ fontSize: 12.5, color: C.muted }}>{st.total} place{st.total !== 1 ? "s" : ""}{dateSum ? " · " + dateSum : ""}{st.visited > 0 ? " · " + st.visited + " visited" : ""}</div>
                </div>
                {items.length > 0 && shareList && <button onClick={() => { if (listNeedsConfirm) { setShareConfirmPending("list"); return; } try { shareList(items.map((it) => it.place), (t.city || "My") + " trip"); } catch (e) {} }} style={{ background: "transparent", border: "1px solid " + C.border, color: C.text, fontSize: 13, fontWeight: 800, padding: "8px 14px", minHeight: 44, borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap" }}>Share ↗</button>}
                {itineraryFlags && itineraryFlags.share && items.length > 0 && <button aria-label={`Share an unlisted snapshot link for ${tripTitle}`} onClick={() => { if (!requireAuth("Sign up free to share an unlisted snapshot link to this trip.")) return; if (itinNeedsConfirm) { setShareConfirmPending("itinerary"); return; } if (shareTrip) shareTrip(t); }} style={{ background: "transparent", border: "1px solid " + C.border, color: C.text, fontSize: 13, fontWeight: 800, padding: "8px 14px", minHeight: 44, borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap" }}>Share privately</button>}
                {items.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      aria-label={fullTripLegs.length > 1 ? `Route ${tripTitle} stops 1 to ${fullTripLegs[0].endStop} in Google Maps` : `Route ${tripTitle} in Google Maps`}
                      onClick={() => doRoute(fullTripLegs[0] && fullTripLegs[0].url)}
                      style={{ background: C.accent, border: "none", color: "#0D1117", fontSize: 13, fontWeight: 800, padding: "8px 14px", minHeight: 44, borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap" }}
                    >
                      Route it ↗
                    </button>
                    {fullTripLegs.slice(1).map((leg, li) => (
                      <button
                        key={li}
                        type="button"
                        data-wf-trip-route-leg={li + 2}
                        aria-label={`Route ${tripTitle} stops ${leg.startStop} to ${leg.endStop} in Google Maps`}
                        onClick={() => doRoute(leg.url)}
                        style={{ background: C.card, border: "1px solid " + C.border, color: C.light, fontSize: 12, fontWeight: 700, padding: "8px 12px", minHeight: 44, borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        Stops {leg.startStop}–{leg.endStop} ↗
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {preShareNotices.length > 0 && (
                <div data-wf-share-limit-note="true" style={{ fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.4 }}>
                  {preShareNotices.join(" ")}
                </div>
              )}
              {shareConfirmPending && (
                <div
                  role="alert"
                  data-wf-share-confirm-prompt={shareConfirmPending}
                  style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 12, padding: "12px 14px", marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}
                >
                  <div style={{ flex: 1, minWidth: 200, fontSize: 12.5, color: C.text, lineHeight: 1.45 }}>
                    {shareConfirmPending === "list"
                      ? `${listShareMeasure && listShareMeasure.warning ? listShareMeasure.warning + " " : ""}${itinShareMeasure && itinShareMeasure.notesCount > 0 ? `Share ↗ shares a place list without your ${itinShareMeasure.notesCount} stop note${itinShareMeasure.notesCount === 1 ? "" : "s"} (use Share privately to include notes). ` : ""}Your original saved trip stays unchanged.`
                      : `${(itinShareMeasure && itinShareMeasure.warning) || "This share link uses compaction to fit URL limits."} Your original saved trip stays unchanged.`}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {((shareConfirmPending === "list" && listShareMeasure && listShareMeasure.ok) || (shareConfirmPending === "itinerary" && itinShareMeasure && itinShareMeasure.ok)) && (
                      <button
                        type="button"
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
                        style={{ background: C.accent, border: "none", color: "#0D1117", fontSize: 12.5, fontWeight: 800, padding: "8px 14px", minHeight: 44, borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        Share copy anyway
                      </button>
                    )}
                    <button
                      type="button"
                      data-wf-cancel-share={shareConfirmPending}
                      onClick={() => setShareConfirmPending(null)}
                      style={{ background: "transparent", border: "1px solid " + C.border, color: C.text, fontSize: 12.5, fontWeight: 700, padding: "8px 14px", minHeight: 44, borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Integrated Ask Wayfind Trip Workspace Bar */}
              {entitlement.allowed && (
                <div
                  data-wf-ask-wayfind-bar="1"
                  style={{
                    background: C.card,
                    border: "1px solid " + C.border,
                    borderRadius: 14,
                    padding: "11px 12px",
                    marginBottom: 14,
                  }}
                >
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      runInlineAskWayfind(askInput);
                    }}
                    style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
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
                          ? `Describe your ${t.city || "Florida"} trip (dates, interests, pace)…`
                          : "Ask Wayfind (e.g. Move a stop, Make Saturday cheaper, Add dinner nearby)…"
                      }
                      style={{
                        flex: "1 1 220px",
                        minWidth: 0,
                        minHeight: 44,
                        borderRadius: 11,
                        border: "1px solid " + C.border,
                        background: C.bg,
                        color: C.text,
                        padding: "8px 12px",
                        fontSize: 14,
                        boxSizing: "border-box",
                        outline: "none",
                      }}
                    />
                    <button
                      type="submit"
                      data-wf-ask-wayfind-submit="1"
                      disabled={askBusy || !askInput.trim()}
                      style={{
                        background: C.accent,
                        border: "none",
                        color: "#0D1117",
                        fontSize: 12.5,
                        fontWeight: 800,
                        padding: "8px 14px",
                        minHeight: 44,
                        borderRadius: 20,
                        cursor: askBusy || !askInput.trim() ? "default" : "pointer",
                        opacity: askBusy || !askInput.trim() ? 0.55 : 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {askBusy ? "Updating…" : "✨ Ask Wayfind"}
                    </button>
                  </form>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 9 }}>
                    {workspaceSuggestions.map((chip) => (
                      <button
                        key={chip.label}
                        type="button"
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
                        style={{
                          background: "rgba(255,255,255,0.03)",
                          border: "1px solid " + C.border,
                          color: C.light,
                          fontSize: 11.5,
                          fontWeight: 700,
                          padding: "6px 11px",
                          minHeight: 34,
                          borderRadius: 999,
                          cursor: askBusy ? "default" : "pointer",
                        }}
                      >
                        {chip.label}
                      </button>
                    ))}
                  </div>
                  {(askFeedback || inlineUndoSnapshot) && (
                    <div
                      role="status"
                      data-wf-inline-planner-feedback="1"
                      style={{
                        marginTop: 10,
                        paddingTop: 9,
                        borderTop: "1px solid " + C.border,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 180, fontSize: 12.5, color: askFeedback && askFeedback.isError ? C.red : C.text, lineHeight: 1.4 }}>
                        {askFeedback ? askFeedback.text : "Trip updated."}
                        {askFeedback && Array.isArray(askFeedback.warnings) && askFeedback.warnings.length > 0 ? (
                          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 3 }}>{askFeedback.warnings.join(" ")}</div>
                        ) : null}
                      </div>
                      {inlineUndoSnapshot && (
                        <button
                          type="button"
                          data-wf-inline-planner-undo="1"
                          onClick={handleInlineUndo}
                          style={{
                            background: "transparent",
                            border: "1px solid " + C.accent,
                            color: C.light,
                            fontSize: 12,
                            fontWeight: 800,
                            padding: "6px 13px",
                            minHeight: 38,
                            borderRadius: 18,
                            cursor: "pointer",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Undo
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Day Navigation Tabs (rendered only when trip has dated stops) */}
              {grouped.hasDates && (
                <div
                  role="tablist"
                  aria-label="Trip day filter"
                  data-wf-day-tabs="1"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    overflowX: "auto", overscrollBehaviorX: "contain",
                    paddingBottom: 6,
                    marginBottom: 12,
                  }}
                >
                  <button
                    type="button"
                    role="tab"
                    data-wf-day-tab="overview"
                    aria-selected={effectiveDayFilter === "overview"}
                    onClick={() => setSelectedDayFilter("overview")}
                    style={{
                      background: effectiveDayFilter === "overview" ? C.accent : C.card,
                      border: "1px solid " + (effectiveDayFilter === "overview" ? C.accent : C.border),
                      color: effectiveDayFilter === "overview" ? "#0D1117" : C.text,
                      fontSize: 12.5,
                      fontWeight: 800,
                      padding: "7px 13px",
                      minHeight: 40,
                      borderRadius: 999,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Overview ({items.length})
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
                        style={{
                          background: selected ? C.accent : C.card,
                          border: "1px solid " + (selected ? C.accent : C.border),
                          color: selected ? "#0D1117" : (g.isPast ? C.muted : C.text),
                          fontSize: 12.5,
                          fontWeight: 800,
                          padding: "7px 13px",
                          minHeight: 40,
                          borderRadius: 999,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {tabLabel} ({g.items.length})
                      </button>
                    );
                  })}
                </div>
              )}

              {RouteMap ? <RouteMap items={items} /> : null}
              {items.length === 0 ? (
                <div style={{ textAlign: "center", padding: "36px 20px", background: C.card, border: "1px solid " + C.border, borderRadius: 14, color: C.muted }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: C.text, marginBottom: 6 }}>This trip has no stops yet.</div>
                  <div style={{ fontSize: 13, marginBottom: 14 }}>Use Ask Wayfind above to generate a grounded day-by-day plan, or browse places to add stops manually.</div>
                  <button
                    type="button"
                    onClick={() => openBrowse(null)}
                    style={{
                      background: "transparent",
                      border: "1px solid " + C.border,
                      color: C.light,
                      fontSize: 12.5,
                      fontWeight: 800,
                      padding: "8px 14px",
                      minHeight: 44,
                      borderRadius: 20,
                      cursor: "pointer",
                    }}
                  >
                    Browse places
                  </button>
                </div>
              ) : visibleGroups.map((group, gi) => {
                const routeLegs = group.day ? Trips.dayRouteLegs(t, group.day, routeOpts) : [];
                return (
                  <div key={group.key} data-wf-day-group={grouped.hasDates ? (group.day || "unscheduled") : "plain"} style={{ marginBottom: grouped.hasDates ? 18 : 0 }}>
                    {grouped.hasDates && (
                      <div
                        data-wf-day-heading={group.day || "unscheduled"}
                        data-wf-day-past={group.isPast ? "true" : "false"}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                          gap: 10,
                          padding: "10px 0 8px",
                          marginTop: gi === 0 ? 0 : 8,
                          marginBottom: 10,
                          borderBottom: "1px solid " + C.border,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
                          {group.day ? <Icon name="calendar" size={16} color={group.isPast ? C.muted : C.light} /> : null}
                          <span style={{ fontSize: 15, fontWeight: 700, color: group.day && !group.isPast ? C.text : C.muted }}>
                            {group.label}
                          </span>
                          <span style={{ fontSize: 12.5, color: C.muted }}>
                            · {group.items.length} stop{group.items.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        {group.day && routeLegs.length > 0 && (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              aria-label={routeLegs.length > 1 ? `Route ${group.label} stops 1 to ${routeLegs[0].endStop} in Google Maps` : `Route ${group.label} in Google Maps`}
                              onClick={() => doRouteDay(group, routeLegs[0].url)}
                              style={{
                                background: C.card,
                                border: "1px solid " + C.border,
                                color: C.text,
                                fontSize: 12.5,
                                fontWeight: 700,
                                padding: "8px 14px",
                                minHeight: 44,
                                borderRadius: 22,
                                cursor: "pointer",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Route day ↗
                            </button>
                            {routeLegs.slice(1).map((leg, li) => (
                              <button
                                key={li}
                                type="button"
                                data-wf-route-leg={li + 2}
                                aria-label={`Route ${group.label} stops ${leg.startStop} to ${leg.endStop} in Google Maps`}
                                onClick={() => doRouteDay(group, leg.url)}
                                style={{
                                  background: C.card,
                                  border: "1px solid " + C.border,
                                  color: C.light,
                                  fontSize: 12,
                                  fontWeight: 700,
                                  padding: "8px 12px",
                                  minHeight: 44,
                                  borderRadius: 22,
                                  cursor: "pointer",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                Stops {leg.startStop}–{leg.endStop} ↗
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
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
                      const nextStopInDay =
                        grouped.hasDates && group.day && i < group.items.length - 1
                          ? group.items[i + 1]
                          : null;
                      const travelRel = nextStopInDay ? stopTravelRelationship(it, nextStopInDay) : null;

                      return (
                        <div key={stopKey} data-wf-stop-id={stopKey} style={{ marginBottom: 12 }}>
                          {(slotLabel || confidence) && (
                            <div
                              data-wf-stop-plan-meta={stopKey}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 8,
                                flexWrap: "wrap",
                                marginBottom: 6,
                              }}
                            >
                              {slotLabel ? (
                                <span style={{ fontSize: 11.5, fontWeight: 800, color: C.light, letterSpacing: "0.02em" }}>
                                  {slotLabel}
                                </span>
                              ) : <span />}
                              {confidence ? (
                                <span
                                  data-wf-stop-confidence={confidence}
                                  title={confidenceNote || undefined}
                                  style={{
                                    fontSize: 10.5,
                                    fontWeight: 800,
                                    padding: "2px 8px",
                                    borderRadius: 999,
                                    background: confidence === "confirmed" ? "rgba(16, 185, 129, 0.14)" : "rgba(245, 158, 11, 0.14)",
                                    color: confidence === "confirmed" ? "#6EE7B7" : "#FCD34D",
                                  }}
                                >
                                  {confidence === "confirmed" ? "✓ Confirmed" : "Check hours"}
                                </span>
                              ) : null}
                            </div>
                          )}
                          <div style={{ position: "relative", opacity: it.visited ? 0.62 : 1 }}>
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
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 12,
                                  padding: "12px 14px",
                                  borderRadius: 14,
                                  background: C.card,
                                  border: `1px solid ${C.border}`,
                                  cursor: "pointer",
                                }}
                              >
                                <div style={{ width: 64, height: 64, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}>
                                  <SafeImg
                                    src={railPhotoSrc(p) || ""}
                                    alt=""
                                    compact
                                    category={p.type}
                                    style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover", display: "block" }}
                                  />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 15, fontWeight: 800, color: C.text, lineHeight: 1.3 }}>
                                    {p.name || "Saved stop"}
                                  </div>
                                  <div style={{ fontSize: 12.5, color: C.muted, marginTop: 3 }}>
                                    {[p.type, p.price, p.address || p.city].filter(Boolean).join(" · ")}
                                  </div>
                                </div>
                                <span style={{ color: C.accent, fontSize: 16, fontWeight: 800, flexShrink: 0 }} aria-hidden="true">›</span>
                              </div>
                            )}
                            {it.visited && <div style={{ position: "absolute", top: 8, left: 8, background: C.accent, color: "#0D1117", fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 20, zIndex: 2 }}>✓ Visited</div>}
                          </div>
                          {it.note && !editing && <div style={{ fontSize: 12.5, color: C.light, background: C.card, border: "1px solid " + C.border, borderRadius: 10, padding: "8px 10px", marginTop: 6 }}>📝 {it.note}</div>}
                          {editing && (
                            <div style={{ marginTop: 6 }}>
                              <textarea autoFocus defaultValue={it.note} id={"note_" + stopKey} placeholder="Reservation time, what to order, who to ask for…" style={{ width: "100%", boxSizing: "border-box", minHeight: 60, background: C.card, border: "1px solid " + C.accent, borderRadius: 10, padding: "8px 10px", color: C.text, fontSize: 16, resize: "vertical" }} />
                              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                                <button onClick={() => { if (!hasLocalTrip && !requireAuth("Sign up free to jot trip notes that travel with you.")) return; const el = document.getElementById("note_" + stopKey); const v = el ? el.value : ""; setTrips((prev) => Trips.setNote(prev, t.key, stopKey, (v || "").trim())); setTripNoteEdit(null); }} style={{ background: C.accent, border: "none", color: "#0D1117", fontSize: 12.5, fontWeight: 800, padding: "7px 14px", minHeight: 44, borderRadius: 22, cursor: "pointer" }}>Save note</button>
                                <button onClick={() => setTripNoteEdit(null)} style={{ background: "transparent", border: "1px solid " + C.border, color: C.muted, fontSize: 12.5, fontWeight: 700, padding: "7px 14px", minHeight: 44, borderRadius: 22, cursor: "pointer" }}>Cancel</button>
                              </div>
                            </div>
                          )}
                          {moving && (
                            <div style={{ marginTop: 6, background: C.card, border: "1px solid " + C.border, borderRadius: 10, padding: 8 }}>
                              <div style={{ fontSize: 12, color: C.muted, marginBottom: 6, padding: "0 2px" }}>Move to…</div>
                              {others.length === 0 ? (
                                <div style={{ fontSize: 12.5, color: C.muted, padding: "4px 2px" }}>No other trips yet.</div>
                              ) : others.map((o) => (
                                <div key={o.key} onClick={() => { if (!hasLocalTrip && !requireAuth("Sign up free to plan your trip and pick up right where you left off, anywhere.")) return; try { logEvent("stop_move_trip", p, { from_key: t.key, to_key: o.key, to_city: o.city, to_state: o.state }); } catch (e) {} setTrips((prev) => Trips.movePlaceToTrip(prev, t.key, o.key, stopKey)); setTripMoveFor(null); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 6px", minHeight: 44, borderRadius: 8, cursor: "pointer" }}>
                                  <StateBadge code={o.state} size={28} />
                                  <span style={{ fontSize: 13.5, color: C.text }}>{o.city}{o.state ? ", " + o.state : ""}</span>
                                </div>
                              ))}
                              <button onClick={() => setTripMoveFor(null)} style={{ marginTop: 4, background: "transparent", border: "none", color: C.muted, fontSize: 12.5, fontWeight: 700, padding: "8px 6px", minHeight: 44, cursor: "pointer" }}>Cancel</button>
                            </div>
                          )}
                          {!editing && !moving && (
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
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
                                style={{
                                  ...tripChip,
                                  ...(stopDay
                                    ? (stopIsPast
                                      ? { background: C.card, borderColor: C.border, color: C.muted }
                                      : { background: C.adim, borderColor: C.accent, color: C.light })
                                    : {}),
                                }}
                              >
                                <Icon name="calendar" size={13} color={stopDay && !stopIsPast ? C.light : C.muted} />
                                <span>{stopDateLabel}</span>
                              </button>
                              <button type="button" aria-label={`Move ${p.name || "stop"} earlier`} onClick={() => { if (!hasLocalTrip && !requireAuth("Sign up free to plan your trip and pick up right where you left off, anywhere.")) return; try { logEvent("stop_reorder", p, { key: t.key, from: i, to: i - 1, dir: -1 }); } catch (e) {} setTrips((prev) => Trips.moveItem(prev, t.key, stopKey, -1, todayOpt)); }} disabled={i === 0} style={{ ...tripCtl, opacity: i === 0 ? 0.35 : 1 }}>↑</button>
                              <button type="button" aria-label={`Move ${p.name || "stop"} later`} onClick={() => { if (!hasLocalTrip && !requireAuth("Sign up free to plan your trip and pick up right where you left off, anywhere.")) return; try { logEvent("stop_reorder", p, { key: t.key, from: i, to: i + 1, dir: 1 }); } catch (e) {} setTrips((prev) => Trips.moveItem(prev, t.key, stopKey, 1, todayOpt)); }} disabled={i === group.items.length - 1} style={{ ...tripCtl, opacity: i === group.items.length - 1 ? 0.35 : 1 }}>↓</button>
                              <button type="button" onClick={() => { if (!hasLocalTrip && !requireAuth("Sign up free to plan your trip and pick up right where you left off, anywhere.")) return; try { logEvent("stop_visited", p, { key: t.key, visited: !it.visited }); } catch (e) {} setTrips((prev) => Trips.toggleVisited(prev, t.key, stopKey)); }} style={{ ...tripChip, ...(it.visited ? { background: C.adim, borderColor: C.accent, color: C.light } : {}) }}>{it.visited ? "✓ Visited" : "Mark visited"}</button>
                              <button type="button" onClick={() => { if (!hasLocalTrip && !requireAuth("Sign up free to jot trip notes that travel with you.")) return; setTripNoteEdit(stopKey); setTripMoveFor(null); setDateEditFor(null); }} style={tripChip}>{it.note ? "Edit note" : "Add note"}</button>
                              <button
                                type="button"
                                data-wf-ask-someone="itinerary"
                                aria-label={`Ask someone to ${p.name || "this stop"}`}
                                onClick={() => {
                                  openShareFlow({
                                    title: p.name || "Trip stop",
                                    name: p.name || "",
                                    city: t.city || "",
                                    placeId: p.id || "",
                                    kind: placeKinds(p),
                                    when: stopDay || "",
                                    eventDate: p.itemType === "event" ? (stopDay || p.date || "") : "",
                                    surface: "itinerary",
                                    geo: p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : "",
                                    directInvite: true,
                                  });
                                }}
                                style={{ ...tripChip, borderColor: "rgba(249,115,22,.45)", color: C.light }}
                              >
                                ♡ Ask someone
                              </button>
                              <button type="button" onClick={() => { if (!hasLocalTrip && !requireAuth("Sign up free to plan your trip and pick up right where you left off, anywhere.")) return; setTripMoveFor(stopKey); setTripNoteEdit(null); setDateEditFor(null); }} style={tripChip}>Move</button>
                              <button type="button" onClick={() => { if (!hasLocalTrip && !requireAuth("Sign up free to plan your trip and pick up right where you left off, anywhere.")) return; if (typeof window !== "undefined" && window.confirm("Remove this place from the trip? It stays in your Favorites.")) { try { logEvent("stop_remove", p, { key: t.key, remaining: items.length - 1 }); } catch (e) {} setTrips((prev) => Trips.removePlaceFromTrip(prev, t.key, stopKey)); } }} style={{ ...tripChip, color: C.red }}>Remove</button>
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
                              style={{ marginTop: 6, background: C.card, border: "1px solid " + C.border, borderRadius: 10, padding: 10 }}
                            >
                              <div id={"wf-date-picker-label-" + stopKey} style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>
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
                                        style={{
                                          ...tripChip,
                                          ...(active ? { background: C.adim, borderColor: C.accent, color: C.light } : { color: C.text }),
                                        }}
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
                                  style={{
                                    background: C.bg,
                                    border: "1px solid " + C.border,
                                    borderRadius: 10,
                                    padding: "8px 10px",
                                    minHeight: 44,
                                    boxSizing: "border-box",
                                    color: C.text,
                                    fontSize: 14,
                                    colorScheme: "dark",
                                    outline: "none",
                                  }}
                                />
                                <button
                                  type="button"
                                  aria-label={`Save date for ${p.name || "stop"}`}
                                  onClick={() => { const clean = Trips.normalizeStopDate(dateDraft); if (clean) applyStopDate(p, clean, stopKey); }}
                                  disabled={!Trips.normalizeStopDate(dateDraft)}
                                  style={{
                                    background: C.accent,
                                    border: "none",
                                    color: "#0D1117",
                                    fontSize: 12.5,
                                    fontWeight: 800,
                                    padding: "8px 14px",
                                    minHeight: 44,
                                    borderRadius: 22,
                                    cursor: Trips.normalizeStopDate(dateDraft) ? "pointer" : "default",
                                    opacity: Trips.normalizeStopDate(dateDraft) ? 1 : 0.45,
                                  }}
                                >
                                  Save date
                                </button>
                                {stopDay && (
                                  <button
                                    type="button"
                                    aria-label={`Clear date for ${p.name || "stop"}`}
                                    onClick={() => applyStopDate(p, null, stopKey)}
                                    style={{
                                      background: "transparent",
                                      border: "1px solid " + C.border,
                                      color: C.light,
                                      fontSize: 12.5,
                                      fontWeight: 700,
                                      padding: "8px 12px",
                                      minHeight: 44,
                                      borderRadius: 22,
                                      cursor: "pointer",
                                    }}
                                  >
                                    Clear date
                                  </button>
                                )}
                                <button
                                  type="button"
                                  aria-label={`Cancel date selection for ${p.name || "stop"}`}
                                  onClick={() => closeDatePicker(stopKey)}
                                  style={{
                                    background: "transparent",
                                    border: "1px solid " + C.border,
                                    color: C.muted,
                                    fontSize: 12.5,
                                    fontWeight: 700,
                                    padding: "8px 12px",
                                    minHeight: 44,
                                    borderRadius: 22,
                                    cursor: "pointer",
                                  }}
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                          {travelRel && travelRel.label && (
                            <div
                              data-wf-travel-connector="1"
                              style={{
                                marginTop: 10,
                                paddingLeft: 12,
                                borderLeft: "2px dashed " + C.border,
                                fontSize: 11.5,
                                color: C.muted,
                                lineHeight: 1.4,
                              }}
                            >
                              ↓ {travelRel.label}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {grouped.hasDates && group.day && !group.isPast && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                        <button
                          type="button"
                          data-wf-day-add={group.day}
                          onClick={() => {
                            const promptPrefix = `Add a stop on ${Trips.formatStopDate(group.day)}: `;
                            setAskInput(promptPrefix);
                            if (askInputRef.current) {
                              try {
                                askInputRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
                                askInputRef.current.focus();
                              } catch {}
                            }
                          }}
                          style={{
                            background: "transparent",
                            border: "1px dashed " + C.border,
                            color: C.light,
                            fontSize: 12,
                            fontWeight: 700,
                            padding: "8px 14px",
                            minHeight: 40,
                            borderRadius: 20,
                            cursor: "pointer",
                          }}
                        >
                          ＋ Add something to {shortDayTabLabel(group.day)}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}
    </>
  );
}
