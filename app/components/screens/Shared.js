"use client";
// Extracted from app/home.js (G1, July 2026 decomposition). Render-only.
// home.js only renders this when screen === "shared" && sharedList.
import { C, Icon } from "../kit";
import { openExternal } from "../../../lib/links";
import * as TripCore from "../../../lib/trips";
import * as TripDays from "../../../lib/tripDays";
const Trips = { ...TripCore, ...TripDays };

export default function SharedScreen({ ctx }) {
  const { sharedList, setSharedList, setScreen, isSaved, liked, disliked, openDetail, quickSaveFavorite, toggleLike, toggleDislike, addShared, giveawayMark, openExperience, openCuisine, PlaceCard } = ctx;
  const pseudoTrip = {
    items: (sharedList || []).map((p, i) => ({
      id: p && p.id ? p.id : String(i),
      order: i,
      day: p && p.day ? Trips.normalizeStopDate(p.day) : null,
      place: p,
    })),
  };
  const grouped = Trips.groupItemsByDay(pseudoTrip);
  const dateSum = Trips.tripDateSummary(pseudoTrip);
  return (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, borderBottom: `1px solid ${C.border}`, marginBottom: 14, paddingTop: 4 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>📩 Shared with you</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>{sharedList.length} place{sharedList.length !== 1 ? "s" : ""}{dateSum ? " · " + dateSum : ""} someone wanted you to see</div>
              </div>
              <button onClick={() => { setSharedList(null); setScreen("explore"); }} style={{ background: C.accent, border: "none", color: "#fff", fontSize: 13, fontWeight: 700, padding: "8px 14px", minHeight: 44, borderRadius: 20, cursor: "pointer" }}>Explore ›</button>
            </div>
            {grouped.hasDates ? (
              grouped.groups.map((group, gi) => {
                const routeLegs = group.day ? Trips.dayRouteLegs(pseudoTrip, group.day) : [];
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
                        <button
                          type="button"
                          aria-label={`Route ${group.label} in Google Maps`}
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
