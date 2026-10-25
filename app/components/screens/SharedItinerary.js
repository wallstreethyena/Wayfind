"use client";
// Read-only trip opened from a private share link. Not auth-walled: the link
// itself is the access. The owner's itinerary row is never read here.
import { useEffect, useState } from "react";
import { C, Icon } from "../kit";
import { openExternal } from "../../../lib/links";
import {
  sortedItems,
  groupItemsByDay,
  tripDateSummary,
  dayRouteLegs,
  tripRouteLegs,
} from "../../../lib/tripDays";
import {
  isSharedTripSaved,
  saveSharedTripToStore,
  retrySharedTripAccountSync,
  MAX_SHARED_ITINERARY_STOPS,
} from "../../../lib/itineraryShare";
import { ensureSignedOutTripIsolation, syncTripsToAccount } from "../../../lib/itinerarySync";

export default function SharedItineraryScreen({ ctx }) {
  const {
    sharedItinerary,
    setSharedItinerary,
    setScreen,
    trips,
    setTrips,
    setActiveTrip,
    user,
    requireAuth,
    showToast,
    logEvent,
    isDesktop,
    itineraryFlags,
  } = ctx;
  const trip = sharedItinerary;
  const mapOn = !!(itineraryFlags && itineraryFlags.map);
  const [RouteMap, setRouteMap] = useState(null);
  const [importFeedback, setImportFeedback] = useState(null);

  useEffect(() => {
    setImportFeedback(null);
  }, [sharedItinerary]);

  useEffect(() => {
    if (user) return;
    const targetStorage =
      ctx.__storage !== undefined
        ? ctx.__storage
        : (typeof window !== "undefined" && window.localStorage ? window.localStorage : null);
    if (!targetStorage) return;
    const isolated = ensureSignedOutTripIsolation(targetStorage);
    if (isolated !== null && setTrips) {
      setTrips(isolated);
    }
  }, [user, ctx.__storage, setTrips]);

  useEffect(() => {
    if (!mapOn) { setRouteMap(null); return undefined; }
    let cancelled = false;
    import("../ItineraryRouteMap").then((mod) => { if (!cancelled) setRouteMap(() => mod.default); }).catch(() => {});
    return () => { cancelled = true; };
  }, [mapOn]);

  if (!trip) return null;
  const todayOpt = ctx.__today ? { today: ctx.__today } : {};
  const isMobile =
    ctx.__mobile !== undefined
      ? Boolean(ctx.__mobile)
      : isDesktop !== undefined
        ? isDesktop === false
        : (typeof window !== "undefined" && typeof window.innerWidth === "number" ? window.innerWidth < 768 : false);
  const routeOpts = { ...todayOpt, mobile: isMobile };

  const items = sortedItems(trip, todayOpt);
  const grouped = groupItemsByDay(trip, todayOpt);
  const dateSum = tripDateSummary(trip, todayOpt);
  const fullTripLegs = tripRouteLegs(trip, routeOpts);
  const savedCheck = isSharedTripSaved(trips, trip, { kind: "itinerary", title: trip.title });
  const norm = savedCheck.norm;
  const isSavedTrip = Boolean(savedCheck.saved || (importFeedback && importFeedback.ok));
  const savedTripKey = (importFeedback && importFeedback.tripKey) || savedCheck.tripKey;
  const atTripCap = Boolean(
    norm && (norm.truncatedCount > 0 || norm.totalStops >= MAX_SHARED_ITINERARY_STOPS)
  );
  const displayTitle = trip.title || (trip.city + (trip.state ? ", " + trip.state : ""));

  const resolveSyncFn = () => {
    if (typeof ctx.__syncTrips === "function") return ctx.__syncTrips;
    if (ctx.__supabase) return null;
    if (!user || !user.id) return null;
    return async ({ userId, trips: nextTrips, storage }) => {
      try {
        const mod = await import("../../../lib/lazySupabase");
        const client = mod && typeof mod.getSupabase === "function" ? await mod.getSupabase() : null;
        if (!client) return { ok: false, status: "sync_error", reason: "cloud_write_failed" };
        return syncTripsToAccount({ supabase: client, userId, trips: nextTrips, storage, logEvent });
      } catch {
        return { ok: false, status: "sync_error", reason: "cloud_write_failed" };
      }
    };
  };

  const handleSaveTrip = () => {
    const res = saveSharedTripToStore({
      trips,
      setTrips,
      storage: ctx.__storage,
      sharedInput: trip,
      kind: "itinerary",
      title: displayTitle,
      user,
      supabase: ctx.__supabase,
      syncFn: resolveSyncFn(),
      onSyncResult: (syncedRes) => setImportFeedback(syncedRes),
      logEvent,
      showToast,
    });
    setImportFeedback(res);
  };

  const handleRetrySync = async () => {
    if (!norm) return;
    const latestTrips = (importFeedback && importFeedback.trips) || trips;
    setImportFeedback((prev) => (prev ? { ...prev, status: "syncing", syncStatus: "syncing", message: "Retrying account sync…" } : prev));
    const res = await retrySharedTripAccountSync({
      supabase: ctx.__supabase,
      syncFn: resolveSyncFn(),
      user,
      trips: latestTrips,
      storage: ctx.__storage,
      tripKey: savedTripKey || norm.baseKey,
      totalStops: norm.totalStops,
      datedStops: norm.datedCount,
      destLabel: displayTitle,
      kind: "itinerary",
      logEvent,
      showToast,
    });
    setImportFeedback((prev) => ({ ...(prev || {}), ...res, trips: latestTrips }));
  };

  const handleOpenSavedTrip = () => {
    if (!user && requireAuth && !requireAuth("Sign up free to open and edit your saved trip in Itinerary, and sync it across devices.")) {
      return;
    }
    try {
      if (logEvent && norm) {
        logEvent("shared_trip_open_itinerary", null, {
          kind: "itinerary",
          stops: norm.totalStops,
          dated_stops: norm.datedCount,
          signed_in: Boolean(user && user.id),
        });
      }
    } catch {}
    if (savedTripKey && setActiveTrip) setActiveTrip(savedTripKey);
    setSharedItinerary(null);
    setScreen("itinerary");
  };

  const syncBadgeState = !isSavedTrip
    ? null
    : !user
      ? "local"
      : importFeedback && importFeedback.syncStatus
        ? importFeedback.syncStatus
        : "synced";

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, borderBottom: "1px solid " + C.border, marginBottom: 14, paddingTop: 4, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{displayTitle}</div>
          <div data-wf-share-access-note="unlisted" style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>Shared trip link · {items.length} stop{items.length === 1 ? "" : "s"}{dateSum ? " · " + dateSum : ""} · Anyone with this link can view a copy</div>
        </div>
        {fullTripLegs.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <button
              type="button"
              aria-label={fullTripLegs.length > 1 ? `Route ${displayTitle} stops 1 to ${fullTripLegs[0].endStop} in Google Maps` : `Route ${displayTitle} in Google Maps`}
              onClick={() => { if (fullTripLegs[0].url) openExternal(fullTripLegs[0].url); }}
              style={{ background: C.card, border: "1px solid " + C.border, color: C.text, fontSize: 12.5, fontWeight: 700, padding: "8px 14px", minHeight: 44, borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              Route in Maps ↗
            </button>
            {fullTripLegs.slice(1).map((leg, li) => (
              <button
                key={li}
                type="button"
                data-wf-trip-route-leg={li + 2}
                aria-label={`Route ${displayTitle} stops ${leg.startStop} to ${leg.endStop} in Google Maps`}
                onClick={() => { if (leg.url) openExternal(leg.url); }}
                style={{ background: C.card, border: "1px solid " + C.border, color: C.light, fontSize: 12, fontWeight: 700, padding: "8px 12px", minHeight: 44, borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap" }}
              >
                Stops {leg.startStop}–{leg.endStop} ↗
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={() => { setSharedItinerary(null); setScreen("explore"); }} style={{ background: C.accent, border: "none", color: "#0D1117", fontSize: 13, fontWeight: 800, padding: "8px 14px", minHeight: 44, borderRadius: 20, cursor: "pointer" }}>Explore ›</button>
      </div>

      {norm && norm.totalStops > 0 && (
        <div
          data-wf-save-shared-trip="itinerary"
          style={{
            background: C.card,
            border: "1px solid " + C.border,
            borderRadius: 14,
            padding: "12px 14px",
            marginBottom: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                Keep this trip in your Itinerary
              </div>
              <div
                data-wf-share-limit-notice={atTripCap ? "itinerary" : undefined}
                style={{ fontSize: 12, color: C.muted, marginTop: 2, lineHeight: 1.4 }}
              >
                {atTripCap
                  ? `Shared trip links include up to ${MAX_SHARED_ITINERARY_STOPS} stops (first ${MAX_SHARED_ITINERARY_STOPS} shown). Saving copies these ${norm.totalStops} stops${norm.datedCount ? `${norm.notesOmitted ? " and " : ", "}${norm.datedCount} scheduled date${norm.datedCount === 1 ? "" : "s"}${norm.notesOmitted ? "" : ","}` : ""}${norm.notesOmitted ? " (stop notes were omitted to fit the 12,000-character payload limit)" : " and notes"} into your own private editable Itinerary.`
                  : `Saves your own private editable copy (${displayTitle}) with all ${norm.totalStops} stop${norm.totalStops === 1 ? "" : "s"}${norm.datedCount ? `${norm.notesOmitted ? " and " : ", "}${norm.datedCount} scheduled date${norm.datedCount === 1 ? "" : "s"}${norm.notesOmitted ? "" : ","}` : ""}${norm.notesOmitted ? " (stop notes were omitted to fit the 12,000-character payload limit)." : " and notes."}`}
              </div>
              {norm.notesOmitted && (
                <div data-wf-share-notes-omitted="itinerary" style={{ fontSize: 11.5, color: C.light, marginTop: 4 }}>
                  {`Stop notes (${norm.notesOmittedCount}) were omitted from this shared copy to fit the 12,000-character payload limit.`}
                </div>
              )}
              {!norm.notesOmitted && norm.notesCompacted && (
                <div data-wf-share-notes-compacted="itinerary" style={{ fontSize: 11.5, color: C.light, marginTop: 4 }}>
                  {`${norm.notesCompactedCount} long stop note${norm.notesCompactedCount === 1 ? " was" : "s were"} shortened to 56 characters in this shared copy to fit the 12,000-character payload limit.`}
                </div>
              )}
              {(norm.skippedCount > 0 || norm.invalidDateCount > 0) && (
                <div data-wf-share-sanitized-notice="itinerary" style={{ fontSize: 11.5, color: C.light, marginTop: 4 }}>
                  {norm.skippedCount > 0 && norm.invalidDateCount > 0
                    ? `Skipped ${norm.skippedCount} invalid stop${norm.skippedCount === 1 ? "" : "s"} and cleared ${norm.invalidDateCount} invalid date${norm.invalidDateCount === 1 ? "" : "s"} from this link.`
                    : norm.skippedCount > 0
                      ? `Skipped ${norm.skippedCount} invalid stop${norm.skippedCount === 1 ? "" : "s"} from this link.`
                      : `Cleared ${norm.invalidDateCount} invalid date${norm.invalidDateCount === 1 ? "" : "s"} (kept as unscheduled).`}
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <button
                id="wf-save-shared-itinerary-btn"
                type="button"
                data-wf-save-trip-btn="itinerary"
                aria-label={isSavedTrip ? `Saved ${displayTitle} to your Itinerary` : `Save this trip (${displayTitle}) to my Itinerary`}
                onClick={handleSaveTrip}
                style={{
                  background: isSavedTrip ? C.adim : C.accent,
                  border: isSavedTrip ? "1px solid " + C.accent : "none",
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
                  data-wf-open-saved-trip="itinerary"
                  aria-label={`Open ${displayTitle} in your Itinerary`}
                  onClick={handleOpenSavedTrip}
                  style={{
                    background: "transparent",
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
                  Open in Itinerary ›
                </button>
              )}
            </div>
          </div>

          {importFeedback && importFeedback.status === "storage_error" && (
            <div
              role="alert"
              data-wf-save-trip-error="itinerary"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 10, paddingTop: 8, borderTop: "1px solid " + C.border }}
            >
              <span style={{ fontSize: 12, color: C.red }}>{importFeedback.message}</span>
              <button
                type="button"
                data-wf-retry-save-trip="itinerary"
                onClick={handleSaveTrip}
                style={{
                  background: C.card,
                  border: "1px solid " + C.red,
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

          {importFeedback && importFeedback.status === "sync_error" && (
            <div
              role="alert"
              data-wf-save-trip-error="itinerary"
              data-wf-save-sync-error="itinerary"
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginTop: 10, paddingTop: 8, borderTop: "1px solid " + C.border }}
            >
              <span style={{ fontSize: 12, color: C.red }}>{importFeedback.message}</span>
              <button
                type="button"
                data-wf-retry-sync-trip="itinerary"
                onClick={handleRetrySync}
                style={{
                  background: C.card,
                  border: "1px solid " + C.red,
                  color: C.text,
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "6px 12px",
                  minHeight: 44,
                  borderRadius: 20,
                  cursor: "pointer",
                }}
              >
                Retry account sync
              </button>
            </div>
          )}

          {((importFeedback && importFeedback.ok && importFeedback.status !== "sync_error" && importFeedback.message) || (isSavedTrip && !importFeedback)) && (
            <div
              role="status"
              aria-live="polite"
              data-wf-save-trip-status={(importFeedback && importFeedback.status) || (user ? "synced" : "saved_local")}
              data-wf-save-sync-badge={syncBadgeState || undefined}
              style={{ fontSize: 12, color: C.light, marginTop: 8 }}
            >
              {importFeedback && importFeedback.message
                ? importFeedback.message
                : (!user
                  ? "Saved on this device — sign in anytime to sync this trip to your account."
                  : "Saved in your Itinerary · Synced to your account.")}
            </div>
          )}
        </div>
      )}

      {RouteMap ? <RouteMap items={items} /> : null}
      {grouped.hasDates ? (
        grouped.groups.map((group, gi) => {
          const routeLegs = group.day ? dayRouteLegs(trip, group.day, routeOpts) : [];
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
                  marginBottom: 8,
                  borderBottom: "1px solid " + C.border,
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
                        onClick={() => { if (leg.url) openExternal(leg.url); }}
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
              {group.items.map((it, idx) => (
                <div key={it.id} style={{ padding: "10px 0", borderBottom: "1px solid " + C.border }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700, color: C.text }}>{(idx + 1) + ". " + ((it.place && it.place.name) || "Stop")}</div>
                  {it.place && it.place.address ? <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{it.place.address}</div> : null}
                  {it.note ? <div style={{ fontSize: 12.5, color: C.light, marginTop: 4 }}>{it.note}</div> : null}
                </div>
              ))}
            </div>
          );
        })
      ) : (
        items.map((it) => (
          <div key={it.id} style={{ padding: "10px 0", borderBottom: "1px solid " + C.border }}>
            <div style={{ fontSize: 14.5, fontWeight: 700, color: C.text }}>{(it.order + 1) + ". " + ((it.place && it.place.name) || "Stop")}</div>
            {it.place && it.place.address ? <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{it.place.address}</div> : null}
            {it.note ? <div style={{ fontSize: 12.5, color: C.light, marginTop: 4 }}>{it.note}</div> : null}
          </div>
        ))
      )}
    </div>
  );
}
