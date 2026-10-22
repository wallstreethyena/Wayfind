"use client";
// Read-only trip opened from a private share link. Not auth-walled: the link
// itself is the access. The owner's itinerary row is never read here.
import { useEffect, useState } from "react";
import { C, Icon } from "../kit";
import { openExternal } from "../../../lib/links";
import { sortedItems, groupItemsByDay, tripDateSummary, dayRouteLegs } from "../../../lib/trips";

export default function SharedItineraryScreen({ ctx }) {
  const { sharedItinerary, setSharedItinerary, setScreen, itineraryFlags } = ctx;
  const trip = sharedItinerary;
  const mapOn = !!(itineraryFlags && itineraryFlags.map);
  const [RouteMap, setRouteMap] = useState(null);
  useEffect(() => {
    if (!mapOn) { setRouteMap(null); return undefined; }
    let cancelled = false;
    import("../ItineraryRouteMap").then((mod) => { if (!cancelled) setRouteMap(() => mod.default); }).catch(() => {});
    return () => { cancelled = true; };
  }, [mapOn]);
  if (!trip) return null;
  const items = sortedItems(trip);
  const grouped = groupItemsByDay(trip);
  const dateSum = tripDateSummary(trip);
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, borderBottom: "1px solid " + C.border, marginBottom: 14, paddingTop: 4 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{trip.title || trip.city}</div>
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>Private link · {items.length} stop{items.length === 1 ? "" : "s"}{dateSum ? " · " + dateSum : ""}</div>
        </div>
        <button onClick={() => { setSharedItinerary(null); setScreen("explore"); }} style={{ background: C.accent, border: "none", color: "#fff", fontSize: 13, fontWeight: 700, padding: "8px 14px", minHeight: 44, borderRadius: 20, cursor: "pointer" }}>Explore ›</button>
      </div>
      {RouteMap ? <RouteMap items={items} /> : null}
      {grouped.hasDates ? (
        grouped.groups.map((group, gi) => {
          const routeLegs = group.day ? dayRouteLegs(trip, group.day) : [];
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
                  <button
                    type="button"
                    aria-label={`Route ${group.label} in Google Maps`}
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
