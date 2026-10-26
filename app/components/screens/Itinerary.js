"use client";
// Extracted from app/home.js (G1, July 2026 decomposition). Render-only; the
// two original sibling branches (trip list, open trip) keep their conditions.
import { useEffect, useState } from "react";
import { C, Icon } from "../kit";
import { openExternal } from "../../../lib/links";
import * as TripCore from "../../../lib/trips";
import * as TripDays from "../../../lib/tripDays";
import { measureItineraryShare, measureListShare } from "../../../lib/itineraryShare";
const Trips = { ...TripCore, ...TripDays };

export default function ItineraryScreen({ ctx }) {
  const { activeTrip, setActiveTrip, trips, setTrips, tripNoteEdit, setTripNoteEdit, tripMoveFor, setTripMoveFor, sub, logEvent, openBrowse, reservations, removeRes, saveResConf, isSaved, liked, disliked, openDetail, quickSaveFavorite, toggleLike, toggleDislike, addShared, giveawayMark, blurbs, openExperience, openCuisine, PlaceCard, CategoryMenu, StateBadge, shareList, itineraryFlags, shareTrip, requireAuth } = ctx;
  const mapOn = !!(itineraryFlags && itineraryFlags.map);
  const [RouteMap, setRouteMap] = useState(null);
  const [dateEditFor, setDateEditFor] = useState(null);
  const [dateDraft, setDateDraft] = useState("");
  const [shareConfirmPending, setShareConfirmPending] = useState(null);
  useEffect(() => {
    setDateEditFor(null);
    setDateDraft("");
    setShareConfirmPending(null);
  }, [activeTrip]);
  useEffect(() => {
    if (!mapOn) { setRouteMap(null); return undefined; }
    let cancelled = false;
    import("../ItineraryRouteMap").then((mod) => { if (!cancelled) setRouteMap(() => mod.default); }).catch(() => {});
    return () => { cancelled = true; };
  }, [mapOn]);
  return (
    <>
        {!activeTrip && (() => {
          const list = Trips.tripList(trips);
          return (
            <div>
              {/* v8.41 — THIS ROW WENT NOWHERE. It called setScreen("home"), and
                  there is no screen called "home": the feed is "suggested"
                  (app/home.js renders it under `screen === "suggested"`), so a
                  category tap here left the reader on an empty scroller with no
                  itinerary and no feed, and the bottom nav highlighted nothing.
                  The 60ms setTimeout was covering for the same confusion — two
                  state changes in one handler are batched, they never needed a
                  timer. openBrowse switches to the feed, sets the category
                  WITHOUT toggling, and lands the reader on the place cards. */}
              <CategoryMenu activeCat={null} sub={sub} onCat={(id, label) => { try { logEvent("intent_chip", null, { intent: label, layer: 1, src: "itinerary" }); } catch (e) {} openBrowse(id); }} onSub={() => {}} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, paddingTop: 4 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Your trips</div>
                {list.length > 0 && <span style={{ fontSize: 13, color: C.muted }}>{list.length} destination{list.length !== 1 ? "s" : ""}</span>}
              </div>
              <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.4, marginBottom: 16 }}>Save a place and it lands here under its city. Group stops by day, reorder them, mark what you have hit, and route each day or the whole trip in Google Maps.</div>
              {itineraryFlags && itineraryFlags.sync ? <div style={{ fontSize: 12.5, color: C.light, lineHeight: 1.4, marginTop: -10, marginBottom: 16 }}>Your trips sync across your devices.</div> : null}
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
                <div style={{ textAlign: "center", padding: "48px 24px", color: C.muted, fontSize: 14, lineHeight: 1.5 }}>No trips yet. Save any place from Home or the Map and a city trip is created for you automatically.</div>
              ) : (
                list.map((t) => {
                  const st = Trips.tripStats(t);
                  const dateSum = Trips.tripDateSummary(t, ctx.__today ? { today: ctx.__today } : {});
                  const listTitle = t.title || (t.city + (t.state ? ", " + t.state : ""));
                  return (
                    <div key={t.key} onClick={() => { setActiveTrip(t.key); try { window.scrollTo(0, 0); } catch {} }} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                      <StateBadge code={t.state} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15.5, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{listTitle}</div>
                        <div style={{ fontSize: 13, color: C.muted }}>{st.total} place{st.total !== 1 ? "s" : ""}{dateSum ? " · " + dateSum : ""}{st.visited > 0 ? " · " + st.visited + " visited" : ""}</div>
                      </div>
                      <span style={{ color: C.muted, fontSize: 20 }}>›</span>
                    </div>
                  );
                })
              )}
            </div>
          );
        })()}
        {activeTrip && trips[activeTrip] && (() => {
          const t = trips[activeTrip];
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
            }
          };
          const doRouteDay = (group, legUrl) => {
            const u = legUrl || Trips.dayRouteUrl(t, group.day, routeOpts);
            if (u) {
              openExternal(u);
              try { logEvent("trip_route_day", null, { key: t.key, day: group.day, n: group.items.length }); } catch {}
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
                <div style={{ flex: 1, minWidth: 0 }}>
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
              {RouteMap ? <RouteMap items={items} /> : null}
              {items.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", color: C.muted }}>This trip is empty.</div>
              ) : grouped.groups.map((group, gi) => {
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
                      return (
                        <div key={stopKey} data-wf-stop-id={stopKey} style={{ marginBottom: 12 }}>
                          <div style={{ position: "relative", opacity: it.visited ? 0.62 : 1 }}>
                            <PlaceCard p={p} saved={isSaved(p.id)} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} onShareCard={(pl) => { try { addShared(pl); giveawayMark(pl.id); } catch (e) {} }} line={blurbs[p.id]} onBadge={openExperience} onCuisineTap={openCuisine} />
                            {it.visited && <div style={{ position: "absolute", top: 8, left: 8, background: C.accent, color: "#0D1117", fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 20, zIndex: 2 }}>✓ Visited</div>}
                          </div>
                          {it.note && !editing && <div style={{ fontSize: 12.5, color: C.light, background: C.card, border: "1px solid " + C.border, borderRadius: 10, padding: "8px 10px", marginTop: 6 }}>📝 {it.note}</div>}
                          {editing && (
                            <div style={{ marginTop: 6 }}>
                              <textarea autoFocus defaultValue={it.note} id={"note_" + stopKey} placeholder="Reservation time, what to order, who to ask for…" style={{ width: "100%", boxSizing: "border-box", minHeight: 60, background: C.card, border: "1px solid " + C.accent, borderRadius: 10, padding: "8px 10px", color: C.text, fontSize: 16, resize: "vertical" }} />
                              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                                <button onClick={() => { if (!requireAuth("Sign up free to jot trip notes that travel with you.")) return; const el = document.getElementById("note_" + stopKey); const v = el ? el.value : ""; setTrips((prev) => Trips.setNote(prev, t.key, stopKey, (v || "").trim())); setTripNoteEdit(null); }} style={{ background: C.accent, border: "none", color: "#0D1117", fontSize: 12.5, fontWeight: 800, padding: "7px 14px", minHeight: 44, borderRadius: 22, cursor: "pointer" }}>Save note</button>
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
                                <div key={o.key} onClick={() => { if (!requireAuth("Sign up free to plan your trip and pick up right where you left off, anywhere.")) return; try { logEvent("stop_move_trip", p, { from_key: t.key, to_key: o.key, to_city: o.city, to_state: o.state }); } catch (e) {} setTrips((prev) => Trips.movePlaceToTrip(prev, t.key, o.key, stopKey)); setTripMoveFor(null); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 6px", minHeight: 44, borderRadius: 8, cursor: "pointer" }}>
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
                              <button type="button" aria-label={`Move ${p.name || "stop"} earlier`} onClick={() => { if (!requireAuth("Sign up free to plan your trip and pick up right where you left off, anywhere.")) return; try { logEvent("stop_reorder", p, { key: t.key, from: i, to: i - 1, dir: -1 }); } catch (e) {} setTrips((prev) => Trips.moveItem(prev, t.key, stopKey, -1, todayOpt)); }} disabled={i === 0} style={{ ...tripCtl, opacity: i === 0 ? 0.35 : 1 }}>↑</button>
                              <button type="button" aria-label={`Move ${p.name || "stop"} later`} onClick={() => { if (!requireAuth("Sign up free to plan your trip and pick up right where you left off, anywhere.")) return; try { logEvent("stop_reorder", p, { key: t.key, from: i, to: i + 1, dir: 1 }); } catch (e) {} setTrips((prev) => Trips.moveItem(prev, t.key, stopKey, 1, todayOpt)); }} disabled={i === group.items.length - 1} style={{ ...tripCtl, opacity: i === group.items.length - 1 ? 0.35 : 1 }}>↓</button>
                              <button type="button" onClick={() => { if (!requireAuth("Sign up free to plan your trip and pick up right where you left off, anywhere.")) return; try { logEvent("stop_visited", p, { key: t.key, visited: !it.visited }); } catch (e) {} setTrips((prev) => Trips.toggleVisited(prev, t.key, stopKey)); }} style={{ ...tripChip, ...(it.visited ? { background: C.adim, borderColor: C.accent, color: C.light } : {}) }}>{it.visited ? "✓ Visited" : "Mark visited"}</button>
                              <button type="button" onClick={() => { if (!requireAuth("Sign up free to jot trip notes that travel with you.")) return; setTripNoteEdit(stopKey); setTripMoveFor(null); setDateEditFor(null); }} style={tripChip}>{it.note ? "Edit note" : "Add note"}</button>
                              <button type="button" onClick={() => { if (!requireAuth("Sign up free to plan your trip and pick up right where you left off, anywhere.")) return; setTripMoveFor(stopKey); setTripNoteEdit(null); setDateEditFor(null); }} style={tripChip}>Move</button>
                              <button type="button" onClick={() => { if (!requireAuth("Sign up free to plan your trip and pick up right where you left off, anywhere.")) return; if (typeof window !== "undefined" && window.confirm("Remove this place from the trip? It stays in your Favorites.")) { try { logEvent("stop_remove", p, { key: t.key, remaining: items.length - 1 }); } catch (e) {} setTrips((prev) => Trips.removePlaceFromTrip(prev, t.key, stopKey)); } }} style={{ ...tripChip, color: C.red }}>Remove</button>
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
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })()}
    </>
  );
}
