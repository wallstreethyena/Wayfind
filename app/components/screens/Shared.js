"use client";
// Extracted from app/home.js (G1, July 2026 decomposition). Render-only.
// home.js only renders this when screen === "shared" && sharedList.
import { useEffect, useState } from "react";
import { C, Icon } from "../kit";
import { openExternal } from "../../../lib/links";
import * as TripCore from "../../../lib/trips";
import * as TripDays from "../../../lib/tripDays";
import {
  isSharedTripSaved,
  saveSharedTripToStore,
  MAX_SHARED_LIST_PLACES,
} from "../../../lib/itineraryShare";
const Trips = { ...TripCore, ...TripDays };

export default function SharedScreen({ ctx }) {
  const {
    sharedList,
    setSharedList,
    setScreen,
    trips,
    setTrips,
    setActiveTrip,
    user,
    requireAuth,
    showToast,
    logEvent,
    isDesktop,
    isSaved,
    liked,
    disliked,
    openDetail,
    quickSaveFavorite,
    toggleLike,
    toggleDislike,
    addShared,
    giveawayMark,
    openExperience,
    openCuisine,
    PlaceCard,
  } = ctx;

  const [importFeedback, setImportFeedback] = useState(null);
  useEffect(() => {
    setImportFeedback(null);
  }, [sharedList]);

  const todayOpt = ctx.__today ? { today: ctx.__today } : {};
  const isMobile =
    ctx.__mobile !== undefined
      ? Boolean(ctx.__mobile)
      : isDesktop !== undefined
        ? isDesktop === false
        : (typeof window !== "undefined" && typeof window.innerWidth === "number" ? window.innerWidth < 768 : false);
  const routeOpts = { ...todayOpt, mobile: isMobile };

  const pseudoTrip = {
    items: (sharedList || []).map((p, i) => ({
      id: p && p.id ? p.id : String(i),
      order: i,
      day: p && p.day ? Trips.normalizeStopDate(p.day) : null,
      place: p,
    })),
  };
  const grouped = Trips.groupItemsByDay(pseudoTrip, todayOpt);
  const dateSum = Trips.tripDateSummary(pseudoTrip, todayOpt);
  const savedCheck = isSharedTripSaved(trips, sharedList, { kind: "list" });
  const norm = savedCheck.norm;
  const isSavedTrip = Boolean(savedCheck.saved);
  const savedTripKey = (importFeedback && importFeedback.tripKey) || savedCheck.tripKey;
  const atListCap = Boolean(
    norm && (norm.truncatedCount > 0 || norm.totalStops >= MAX_SHARED_LIST_PLACES)
  );

  const handleSaveTrip = () => {
    const res = saveSharedTripToStore({
      trips,
      setTrips,
      storage: ctx.__storage,
      sharedInput: sharedList,
      kind: "list",
      logEvent,
      showToast,
    });
    setImportFeedback(res);
  };

  const handleOpenSavedTrip = () => {
    if (!user && requireAuth && !requireAuth("Sign up free to open and edit your saved trip in Itinerary, and sync it across devices.")) {
      return;
    }
    if (savedTripKey && setActiveTrip) setActiveTrip(savedTripKey);
    setSharedList(null);
    setScreen("itinerary");
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, borderBottom: `1px solid ${C.border}`, marginBottom: 14, paddingTop: 4, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>📩 Shared with you</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{sharedList.length} place{sharedList.length !== 1 ? "s" : ""}{dateSum ? " · " + dateSum : ""} someone wanted you to see</div>
        </div>
        <button type="button" onClick={() => { setSharedList(null); setScreen("explore"); }} style={{ background: C.accent, border: "none", color: "#0D1117", fontSize: 13, fontWeight: 800, padding: "8px 14px", minHeight: 44, borderRadius: 20, cursor: "pointer" }}>Explore ›</button>
      </div>

      {norm && norm.totalStops > 0 && (
        <div
          data-wf-save-shared-trip="list"
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: "12px 14px",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                Keep this plan in your Itinerary
              </div>
              <div
                data-wf-share-limit-notice={atListCap ? "list" : undefined}
                style={{ fontSize: 12, color: C.muted, marginTop: 2, lineHeight: 1.4 }}
              >
                {atListCap
                  ? `Shared list links hold up to ${MAX_SHARED_LIST_PLACES} places (first ${MAX_SHARED_LIST_PLACES} shown). Saving copies all ${norm.totalStops} places${norm.datedCount ? ` and ${norm.datedCount} scheduled date${norm.datedCount === 1 ? "" : "s"}` : ""} into your own editable Itinerary.`
                  : `Saves your own editable copy (${norm.title}) with all ${norm.totalStops} stop${norm.totalStops === 1 ? "" : "s"}${norm.datedCount ? ` and ${norm.datedCount} scheduled date${norm.datedCount === 1 ? "" : "s"}` : ""}.`}
              </div>
              {(norm.skippedCount > 0 || norm.invalidDateCount > 0) && (
                <div data-wf-share-sanitized-notice="list" style={{ fontSize: 11.5, color: C.light, marginTop: 4 }}>
                  {norm.skippedCount > 0 && norm.invalidDateCount > 0
                    ? `Skipped ${norm.skippedCount} invalid item${norm.skippedCount === 1 ? "" : "s"} and cleared ${norm.invalidDateCount} invalid date${norm.invalidDateCount === 1 ? "" : "s"} from this link.`
                    : norm.skippedCount > 0
                      ? `Skipped ${norm.skippedCount} invalid item${norm.skippedCount === 1 ? "" : "s"} from this link.`
                      : `Cleared ${norm.invalidDateCount} invalid date${norm.invalidDateCount === 1 ? "" : "s"} (kept as unscheduled).`}
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                id="wf-save-shared-list-btn"
                type="button"
                data-wf-save-trip-btn="list"
                aria-label={isSavedTrip ? `Saved ${norm.title} to your Itinerary` : `Save this trip (${norm.title}) to my Itinerary`}
                onClick={handleSaveTrip}
                style={{
                  background: isSavedTrip ? C.adim : C.accent,
                  border: isSavedTrip ? `1px solid ${C.accent}` : "none",
                  color: isSavedTrip ? C.light : "#0D1117",
                  fontSize: 13,
                  fontWeight: 800,
                  padding: "9px 16px",
                  minHeight: 44,
                  borderRadius: 22,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {isSavedTrip ? "✓ Saved to your Itinerary" : "Save this trip to my Itinerary"}
              </button>
              {isSavedTrip && (
                <button
                  type="button"
                  data-wf-open-saved-trip="list"
                  aria-label={`Open ${norm.title} in your Itinerary`}
                  onClick={handleOpenSavedTrip}
                  style={{
                    background: "transparent",
                    border: `1px solid ${C.border}`,
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
                  Open in Itinerary ›
                </button>
              )}
            </div>
          </div>

          {importFeedback && importFeedback.status === "storage_error" && (
            <div
              role="alert"
              data-wf-save-trip-error="list"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}` }}
            >
              <span style={{ fontSize: 12, color: C.red }}>{importFeedback.message}</span>
              <button
                type="button"
                data-wf-retry-save-trip="list"
                onClick={handleSaveTrip}
                style={{
                  background: C.card,
                  border: `1px solid ${C.red}`,
                  color: C.text,
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "6px 12px",
                  minHeight: 44,
                  borderRadius: 20,
                  cursor: "pointer",
                }}
              >
                Retry save
              </button>
            </div>
          )}

          {importFeedback && importFeedback.ok && importFeedback.message && (
            <div
              role="status"
              aria-live="polite"
              data-wf-save-trip-status={importFeedback.status}
              style={{ fontSize: 12, color: C.light, marginTop: 8 }}
            >
              {importFeedback.message}
              {!user && importFeedback.status === "saved" ? " Saved on this device — sign in anytime to sync across devices." : ""}
            </div>
          )}
        </div>
      )}

      {grouped.hasDates ? (
        grouped.groups.map((group, gi) => {
          const routeLegs = group.day ? Trips.dayRouteLegs(pseudoTrip, group.day, routeOpts) : [];
          return (
            <div key={group.key} data-wf-day-group={group.day || "unscheduled"} style={{ marginBottom: 18 }}>
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
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
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
                      onClick={() => { if (routeLegs[0].url) openExternal(routeLegs[0].url); }}
                      style={{
                        background: C.card,
                        border: `1px solid ${C.border}`,
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
                        onClick={() => { if (leg.url) openExternal(leg.url); }}
                        style={{
                          background: C.card,
                          border: `1px solid ${C.border}`,
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
              {group.items.map((it) => {
                const p = it.place;
                return (
                  <PlaceCard key={p.id} p={p} saved={isSaved(p.id)} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} onShareCard={(pl) => { try { addShared(pl); giveawayMark(pl.id); } catch (e) {} }} onBadge={openExperience} onCuisineTap={openCuisine} />
                );
              })}
            </div>
          );
        })
      ) : (
        sharedList.map((p) => (
          <PlaceCard key={p.id} p={p} saved={isSaved(p.id)} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} onShareCard={(pl) => { try { addShared(pl); giveawayMark(pl.id); } catch (e) {} }} onBadge={openExperience} onCuisineTap={openCuisine} />
        ))
      )}
    </div>
  );
}
