"use client";
// Extracted from app/home.js (G4, July 2026 decomposition). Render-only.
// tasteBoost is exclusive to the map's default ranking blend and moves with it.
import { useEffect, useRef } from "react";
import { C, scoreLabel, PlaceScoreChip } from "../kit";
import { MAP_DEFAULT_CATEGORY } from "../../../lib/mapExplorer";
import { TRENDING_BONUS } from "../../../lib/wayfindScore";

function tasteBoost(place) {
  try { const k = String((place && place.type) || ""); if (!k) return 0; const t = JSON.parse(localStorage.getItem("wf_taste_v1") || "{}"); return Math.min(3, (t[k] || 0) * 0.5); } catch (e) { return 0; }
}

// v6.71 (Wave 2): same flame + water-quality read as every other beach
// surface, sourced from the SAME `beachSignals` batch home.js already
// computes for the visible PlaceCards (isBeach + beachSignals both arrive
// via ctx) — no separate fetch for the map screen.
function BeachChips({ p, isBeach, beachSignals }) {
  // 2026-08-08: the 🔥 is the UNIFIED trend signal (lib/trendSignal.js) —
  // any category, the signal's own level-honest reason — and the disclosure
  // for the +0.6 trending component. The beach-only popularity flame is
  // folded into it; water quality stays a beach-signal read.
  const sig = isBeach && isBeach(p) && beachSignals ? beachSignals[p.id] : null;
  const wq = sig && sig.water ? (sig.water.advisory ? { t: "Advisory", c: C.red } : sig.water.result === "Good" ? { t: "Water: Good", c: C.green } : sig.water.result === "Moderate" ? { t: "Water: Moderate", c: "#E8B84B" } : sig.water.result ? { t: "Water: Poor", c: C.red } : null) : null;
  const trending = !!(p && p.trending && p.trend_reason);
  if (!trending && !wq) return null;
  return (
    <>
      {trending ? <span style={{ fontSize: 11.5, fontWeight: 800, color: "#FB923C" }} title={"Trending — " + p.trend_reason}>🔥 {p.trend_reason}</span> : null}
      {wq ? <span style={{ fontSize: 11.5, fontWeight: 700, color: wq.c }}>🏖️ {wq.t}</span> : null}
    </>
  );
}

// EVENTS CONTROL — FLAGGED OFF, NOT DELETED (owner, 2026-08-06). Removing the
// control takes event pins off the map, which is a deliberate consequence: Events
// remains its own tab. mapMode/setMapMode and MapView's events/onSelectEvent props
// are untouched, so restoring this is one env var and no code change.
const MAP_EVENTS_ON = String(process.env.NEXT_PUBLIC_MAP_EVENTS || "").trim() === "1";

export default function MapScreen({ ctx }) {
  const mapCardTouch = useRef(0);
  const { mapMode, setMapMode, mapBrowse, setMapBrowse, mapPool, mapListOverride, map3D, setMap3D, mapRetryKey, setMapRetryKey, cat, setCat, sub, setSub, setVibe, sortBy, center, deviceLoc, mapFocus, setMapFocus, setMapSearchOpen, events, eventsLoading, eventsUnavailable, mapDate, setMapDate, mapPreview, setMapPreview, mapDrawer, setMapDrawer, eventPreview, setEventPreview, suggested, places, liked, disliked, view, featuredBoost, MapView, CategoryMenu, FallbackImg, iconForPlace, liveOpen, logEvent, loadEvents, openDetail, openVenue, ticketUrl, Hol, recenterToMe, isBeach, beachSignals, PlaceCard, isSaved, toggleLike, toggleDislike, quickSaveFavorite, addShared, giveawayMark, blurbs, openExperience, openCuisine, cityNow, mapDefaultAppliedRef } = ctx;
  // Owner ask (2026-08-03): "we should open the map defaulted to activities
  // showing the activities near the user" -- `cat` is shared, single-source-
  // of-truth state across Home/Map/Itinerary (see CategoryMenu's own header
  // comment), so this only nudges it the FIRST time the Map tab is opened in
  // a session, and only if the user has not already picked something else
  // (cat is still sitting on the untouched app-wide default). Once set, the
  // ref guard means this never fires again this session, so a deliberate
  // later choice of Food/Nightlife/etc. on Home is never silently overridden
  // just because the user also happens to open the Map tab.
  useEffect(() => {
    if (!mapDefaultAppliedRef || mapDefaultAppliedRef.current) return;
    mapDefaultAppliedRef.current = true;
    if (cat === MAP_DEFAULT_CATEGORY) { setCat("attractions"); setSub("all"); setVibe("all"); setMapBrowse(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
              const dateChips = [];
              const now = new Date();
              for (let i = 0; i < 14; i++) {
                const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
                const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                dateChips.push({ value, top: i === 0 ? "Today" : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()], day: d.getDate() });
              }
              let mapEvents = [];
              if (mapMode === "events") {
                const src = (events || []).filter((e) => e.lat != null && e.lng != null && (mapDate === "all" || e.date === mapDate));
                const seen = new Set();
                for (const e of src) { const k = `${e.lat.toFixed(3)},${e.lng.toFixed(3)}`; if (!seen.has(k)) { seen.add(k); mapEvents.push(e); } }
              }
              const tchip = (on) => ({ flexShrink: 0, minWidth: 44, padding: "5px 9px", borderRadius: 10, border: "none", cursor: "pointer", textAlign: "center", background: on ? C.light : "transparent", color: on ? "#fff" : C.light, fontWeight: 700 });
              return (
                <div style={{ position: "relative", width: "100%", height: "100%" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 30, padding: "8px 10px 0" }}>
                    <div style={{ borderRadius: 14, boxShadow: "0 8px 24px rgba(0,0,0,.45)", background: "rgba(16,20,27,.94)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}>
                      {/* v5.08 (user direction): the map menu never fully
                          collapses — the primary tile row stays; only the
                          sub-row expands down after a category is chosen. */}
                      {(<>
                      <CategoryMenu compact activeCat={cat} sub={sub} onCat={(id, label) => { try { logEvent("intent_chip", null, { intent: label, layer: 1, src: "map" }); } catch (e) {} setMapBrowse(true); setCat(id); setSub("all"); setVibe("all"); }} onSub={(v) => setSub(v)} />
                      </>)}
                    </div>
                  </div>
                  {/* v6.97 (owner: "a near me button... I got stuck looking
                      around and had no idea where I was") — the search-bar
                      version of this button is easy to miss on the map
                      screen since the search row is collapsed by default
                      here; a floating button on the map itself is the
                      standard "locate me" affordance and the one place the
                      owner actually got lost. Mirrors the Events/FIFA toggle
                      stack's vertical position but on the right, well clear
                      of both the left-side button column and MapView's own
                      bottom-right zoom control. */}
                  {/* TICKET 4a — PREMIUM FLOATING CONTROLS.
                      A raised control is LIGHTER than what it sits on. These were
                      dark squares on a light basemap, darker than the map itself,
                      which is what made them read as debug UI. The inset top
                      highlight is what sells it as a physical raised control
                      rather than a flat swatch.
                      Stacked top-right, 46px, 10px apart. The gap is 10 and not
                      the specified 9 for one reason: 46+10 = 56, which is the
                      overlap floor test-map-explorer enforces. 9 would put them
                      55px apart and trip a guard that exists to stop exactly this
                      class of collision. */}
                  <button onClick={recenterToMe} aria-label="Near me \u2014 recenter the map to your current location" title="Near me" aria-pressed={!!deviceLoc}
                    style={{ position: "absolute", top: 164, right: 12, zIndex: 5, width: 46, height: 46, borderRadius: 999, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", ...(deviceLoc ? { background: "linear-gradient(160deg, #FDBA74, #F97316)", border: "1px solid rgba(255,255,255,.75)", boxShadow: "0 6px 18px rgba(249,115,22,.34), 0 1px 2px rgba(15,23,35,.16), inset 0 1px 0 rgba(255,255,255,.55)" } : { background: "linear-gradient(160deg, rgba(255,255,255,.97), rgba(240,243,248,.9))", border: "1px solid rgba(255,255,255,.9)", boxShadow: "0 6px 18px rgba(15,23,35,.22), 0 1px 2px rgba(15,23,35,.16), inset 0 1px 0 rgba(255,255,255,.9)" }) }}>
                    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={deviceLoc ? "#FFFFFF" : "#F97316"} strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
                  </button>
                  <MapView key={mapRetryKey} onRetry={() => setMapRetryKey((k) => k + 1)} rings styleMode={map3D ? "3d" : "bright"} fit={!!(mapListOverride && mapListOverride.length)} places={mapListOverride && mapListOverride.length ? mapListOverride : mapMode === "events" ? [] : (mapMode === "fifa" ? (() => { const seen = new Set(); const pool = [...(mapPool || []), ...(suggested || []), ...(places || [])].filter((q) => q && q.id && !seen.has(q.id) && seen.add(q.id)); return pool.map((q) => [q, Hol.fitFor("worldcup", q)]).filter((x) => x[1] >= 8).map((x) => [x[0], x[1] + featuredBoost(x[0].name) + (x[0].wfScore || 50)]).sort((a, b) => b[1] - a[1]).slice(0, 12).map((x) => x[0]); })() : (mapBrowse ? view : (() => { const seen = new Set(); const pool = [...(mapPool || []), ...(suggested || []), ...(places || [])].filter((q) => q && q.id && !seen.has(q.id) && seen.add(q.id)); return pool.map((q) => [q, (q.wfScore || 50) + featuredBoost(q.name) + tasteBoost(q) + (q.trending ? TRENDING_BONUS : 0) - (liked && liked[q.id] ? 8 : 0)]).sort((a, b) => b[1] - a[1]).slice(0, 10).map((x) => x[0]); })()))} events={mapEvents} center={center} category={cat} deviceLoc={deviceLoc} focus={mapFocus} selectedId={mapPreview && mapPreview.id} onSelect={(p) => { setMapPreview(p); setMapDrawer(false); try { logEvent("map_pin_tap", p, { rank: 1 + (view || []).findIndex((x) => x && x.id === p.id) }); } catch (e) {} try { logEvent("map_pin_selected", p, {}); } catch (e) {} }} onSelectEvent={(e) => { setMapPreview(null); setEventPreview(e); }} />
                  {/* The Events/FIFA stack. With Events flagged off (ticket 1) and the World
                      Cup out of season this container rendered as an EMPTY dark box
                      floating on the map — a control with nothing in it. Only mount it
                      when it would actually hold a button. */}
                  {(MAP_EVENTS_ON || Hol.worldCup(new Date())) && <div style={{ position: "absolute", top: 164, left: 12, zIndex: 5, display: "flex", flexDirection: "column", background: "rgba(10,16,27,.88)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,.45)" }}>
                    {Hol.worldCup(new Date()) ? <button onClick={() => setMapMode(mapMode === "fifa" ? "places" : "fifa")} style={{ padding: "7px 13px", fontSize: 13, fontWeight: 800, border: "none", cursor: "pointer", background: mapMode === "fifa" ? C.light : "transparent", color: mapMode === "fifa" ? "#fff" : C.light }}>⚽ FIFA</button> : null}
                    {MAP_EVENTS_ON ? <button onClick={() => { if (mapMode === "events") { setMapMode("places"); } else { setMapMode("events"); if (!events) loadEvents(); } }} style={{ padding: "7px 15px", fontSize: 13, fontWeight: 800, border: "none", cursor: "pointer", background: mapMode === "events" ? C.light : "transparent", color: mapMode === "events" ? "#fff" : C.light }}>🎟️ Events</button> : null}
                  </div>}
                  {/* COMPASS REMOVED (owner, 2026-08-06). It floated over the map
                      competing with the thing people came to look at, and its
                      deviceorientation listener was registered with capture:true —
                      removing only the button would have leaked a global listener on
                      every Map visit. The registration path goes with it; see
                      scripts/check-map-controls.mjs, which fails if either the control
                      or the listener comes back. */}
                  {mapMode === "places" && (
                    // v6.99 (owner: "give the user an option to go 3d also")
                    // — OpenFreeMap's free tier includes a "3d" style
                    // (extruded buildings) alongside the default flat
                    // "bright" one; this is an explicit opt-in toggle rather
                    // than the default since 3D needs pitch/rotation enabled,
                    // a real change to how the map is driven, not just a
                    // color swap. Same pill language as Compass above it.
                    <button onClick={() => setMap3D((v) => !v)} aria-label={map3D ? "Switch to flat map" : "Switch to 3D map"} title={map3D ? "3D on \u2014 tap for flat map" : "Tap for 3D buildings"} aria-pressed={!!map3D}
                      style={{ position: "absolute", top: 220, right: 12, zIndex: 5, width: 46, height: 46, borderRadius: 999, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, ...(map3D ? { background: "linear-gradient(160deg, #FDBA74, #F97316)", border: "1px solid rgba(255,255,255,.75)", boxShadow: "0 6px 18px rgba(249,115,22,.34), 0 1px 2px rgba(15,23,35,.16), inset 0 1px 0 rgba(255,255,255,.55)" } : { background: "linear-gradient(160deg, rgba(255,255,255,.97), rgba(240,243,248,.9))", border: "1px solid rgba(255,255,255,.9)", boxShadow: "0 6px 18px rgba(15,23,35,.22), 0 1px 2px rgba(15,23,35,.16), inset 0 1px 0 rgba(255,255,255,.9)" }) }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={map3D ? "#FFFFFF" : "#64748B"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2 2 7l10 5 10-5-10-5Z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
                      <span style={{ fontSize: 8.5, fontWeight: 800, color: map3D ? "#FFFFFF" : "#64748B", letterSpacing: ".2px", lineHeight: 1 }}>{map3D ? "3D" : "2D"}</span>
                    </button>
                  )}
                  {mapMode === "events" && (
                    <div style={{ position: "absolute", left: 0, right: 0, bottom: 64, zIndex: 5, padding: "0 12px" }}>
                      {!eventsLoading && !eventsUnavailable && (
                        <div style={{ fontSize: 11.5, color: "#fff", fontWeight: 700, textAlign: "center", marginBottom: 6, textShadow: "0 1px 4px rgba(0,0,0,.8)" }}>{mapEvents.length} venue{mapEvents.length === 1 ? "" : "s"}{mapDate === "all" ? " coming up" : " that day"}</div>
                      )}
                      <div style={{ display: "flex", gap: 6, overflowX: "auto", background: "rgba(13,17,23,.9)", border: `1px solid ${C.border}`, borderRadius: 14, padding: 8, WebkitOverflowScrolling: "touch" }}>
                        <button onClick={() => setMapDate("all")} style={tchip(mapDate === "all")}><div style={{ fontSize: 10, opacity: 0.85 }}>Any</div><div style={{ fontSize: 13 }}>All</div></button>
                        {dateChips.map((d) => (
                          <button key={d.value} onClick={() => setMapDate(d.value)} style={tchip(mapDate === d.value)}><div style={{ fontSize: 10, opacity: 0.85 }}>{d.top}</div><div style={{ fontSize: 13 }}>{d.day}</div></button>
                        ))}
                      </div>
                      {eventsUnavailable && <div style={{ fontSize: 11.5, color: "#fff", textAlign: "center", marginTop: 6, textShadow: "0 1px 4px rgba(0,0,0,.8)" }}>Add a Ticketmaster key in Vercel to switch events on.</div>}
                    </div>
                  )}
                  {mapMode !== "events" && mapPreview && (() => {
                    // TICKET 3 — ONE PLACE CARD, NOT THE DRAWER.
                    //
                    // Capped at 175px so the map, the distance rings and the user
                    // pin all stay visible behind it. The old card replaced the
                    // map with a list, which is the thing that stopped the map
                    // being a map.
                    //
                    // The footer is the point of a ranked map and was missing
                    // entirely: `n of N - ranked by fit`, with arrows that step
                    // through the ranked set. Opening the card does NOT move the
                    // camera — only the arrows do, because recentering under the
                    // user's finger is disorienting.
                    const mp = mapPreview;
                    const ranked = (view || []).filter((x) => x && x.id);
                    const idx = ranked.findIndex((x) => x.id === mp.id);
                    const pos = idx >= 0 ? idx + 1 : null;
                    const step = (dir) => {
                      if (idx < 0 || !ranked.length) return;
                      const next = ranked[(idx + dir + ranked.length) % ranked.length];
                      if (!next) return;
                      setMapPreview(next);
                      // The camera moves HERE and only here.
                      setMapFocus({ lat: next.lat, lng: next.lng, ts: Date.now() });
                      try { logEvent("map_card_page", next, { direction: dir > 0 ? "next" : "prev", rank: 1 + ranked.indexOf(next) }); } catch (e) {}
                    };
                    const sl = scoreLabel(mp.wfScore);
                    const meta = [mp.cuisine || mp.type, mp.distMi != null ? mp.distMi.toFixed(1) + " mi" : null,
                      mp.distMi != null ? Math.max(1, Math.round(mp.distMi * 2.2)) + " min drive" : null].filter(Boolean).join(" \u00b7 ");
                    const openNow = liveOpen(mp);
                    return (
                      <div
                        onTouchStart={(e) => { mapCardTouch.current = e.touches[0].clientY; }}
                        onTouchEnd={(e) => {
                          const dy = e.changedTouches[0].clientY - (mapCardTouch.current || 0);
                          if (dy > 60) setMapPreview(null);   // swipe down dismisses
                        }}
                        style={{ position: "absolute", left: 12, right: 12, bottom: 76, zIndex: 18, maxHeight: 175, overflow: "hidden", background: "rgba(11,15,20,.95)", WebkitBackdropFilter: "blur(14px)", backdropFilter: "blur(14px)", border: `1px solid ${C.border}`, borderRadius: 18, boxShadow: "0 12px 34px rgba(0,0,0,.5)" }}>
                        <div aria-hidden="true" style={{ width: 34, height: 4, borderRadius: 2, background: "rgba(255,255,255,.24)", margin: "7px auto 4px" }} />
                        <button onClick={() => setMapPreview(null)} aria-label="Close" style={{ position: "absolute", top: 4, right: 4, width: 44, height: 44, border: "none", background: "transparent", color: "#fff", fontSize: 15, cursor: "pointer" }}>&#10005;</button>
                        <div style={{ display: "flex", gap: 11, padding: "0 12px 9px", minWidth: 0 }}>
                          <FallbackImg src={mp.photo} icon="\ud83d\udccd" style={{ width: 74, height: 74, borderRadius: 13, objectFit: "cover", flexShrink: 0, display: "block" }} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 16, fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{mp.name}</div>
                            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{meta}</div>
                            <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "nowrap", overflow: "hidden" }}>
                              {sl ? <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: C.accent, background: "rgba(249,115,22,.16)", border: "1px solid rgba(249,115,22,.4)", borderRadius: 8, padding: "2px 7px" }}>{sl}</span> : null}
                              {mp.trending && mp.trend_reason ? <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, color: "#FB923C", background: "rgba(251,146,60,.12)", border: "1px solid rgba(251,146,60,.4)", borderRadius: 8, padding: "2px 7px" }} title={"Trending — " + mp.trend_reason}>🔥 {mp.trend_reason}</span> : null}
                              {mp.price ? <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: C.light, background: "rgba(255,255,255,.07)", borderRadius: 8, padding: "2px 7px" }}>{mp.price}</span> : null}
                              {openNow === true ? <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: C.green, background: "rgba(34,197,94,.14)", borderRadius: 8, padding: "2px 7px" }}>Open now</span> : null}
                            </div>
                          </div>
                        </div>
                        <button onClick={() => { try { logEvent("map_card_cta", mp, { rank: pos }); } catch (e) {} openDetail(mp); }}
                          style={{ display: "block", width: "calc(100% - 24px)", margin: "0 12px", height: 44, borderRadius: 12, border: "none", background: C.accent, color: "#0B0F14", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>See details &rarr;</button>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 12px 9px" }}>
                          <span style={{ fontSize: 11.5, color: C.muted }}>{pos ? `${pos} of ${ranked.length} \u00b7 ranked by fit` : "ranked by fit"}</span>
                          <span style={{ display: "flex", gap: 4 }}>
                            <button onClick={() => step(-1)} aria-label="Previous place" style={{ width: 34, height: 30, border: `1px solid ${C.border}`, background: "transparent", color: C.light, borderRadius: 9, cursor: "pointer" }}>&#8249;</button>
                            <button onClick={() => step(1)} aria-label="Next place" style={{ width: 34, height: 30, border: `1px solid ${C.border}`, background: "transparent", color: C.light, borderRadius: 9, cursor: "pointer" }}>&#8250;</button>
                          </span>
                        </div>
                      </div>
                    );
                  })()}
                  {mapMode === "events" && eventPreview && (() => {
                    const ev = eventPreview;
                    const dl = ev.date ? (() => { try { return new Date(ev.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); } catch { return ev.date; } })() : "";
                    return (
                      <div style={{ position: "absolute", left: 12, right: 12, bottom: 22, zIndex: 6 }}>
                        <div style={{ position: "relative", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 10px 34px rgba(0,0,0,.6)" }}>
                          {/* Phase 2 (EVENTS_PIPELINE_DIAGNOSIS.md): the preview body is ONE
                              semantic link to the event's resolved destination; the venue
                              lookup and dismiss are separate sibling controls. */}
                          {ev.dest ? (
                            <a href={ev.destKind === "internal" ? ev.dest : ticketUrl(ev.dest)} {...(ev.destKind === "internal" ? {} : { target: "_blank", rel: "noreferrer" })} onClick={() => { try { logEvent("event_open", null, { id: ev.id, kind: ev.destKind, src: "map_preview" }); } catch (e2) {} }} style={{ display: "flex", minWidth: 0, textDecoration: "none" }}>
                              <FallbackImg src={ev.image} icon="🎫" style={{ width: 96, height: 96, objectFit: "cover", flexShrink: 0, display: "block" }} />
                              <div style={{ padding: "10px 12px", minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: 14.5, fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 22 }}>{ev.name}</div>
                                {(dl || ev.time) && <div style={{ fontSize: 11.5, fontWeight: 700, color: C.light, marginTop: 4 }}>{dl}{ev.time ? " · " + ev.time : ""}</div>}
                                {ev.venue && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {ev.venue}</div>}
                                <div style={{ fontSize: 11.5, fontWeight: 700, color: C.light, marginTop: 5 }}>View event →</div>
                              </div>
                            </a>
                          ) : null}
                          {ev.venue && (
                            <button onClick={() => openVenue(ev)} style={{ display: "block", width: "100%", textAlign: "left", background: "transparent", border: "none", borderTop: `1px solid ${C.border}`, padding: "8px 12px", fontSize: 11.5, fontWeight: 700, color: C.light, cursor: "pointer" }}>📍 View venue on Wayfind ›</button>
                          )}
                          <button onClick={(ev2) => { ev2.stopPropagation(); setEventPreview(null); }} aria-label="Dismiss" style={{ position: "absolute", top: 7, right: 7, width: 24, height: 24, borderRadius: 999, border: "none", background: "rgba(0,0,0,.5)", color: "#fff", fontSize: 13, lineHeight: 1, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>✕</button>
                        </div>
                      </div>
                    );
                  })()}
                  {/* v6.94 (owner: "the letter inside of it seem like its
                      not fitting inside of it") — the collapsed strip was
                      a hard maxHeight:52 with overflow:hidden, and the
                      grabber (16px) + text row's UNSET line-height (which
                      varies by browser/font, commonly 1.15-1.3x the
                      13px/11.5px font sizes here) could exceed that,
                      clipping descenders off the bottom row. Explicit
                      line-height makes the row's real height predictable,
                      and 58px gives it headroom instead of an exact fit. */}
                  {mapMode === "places" && !mapPreview && view.length > 0 && (
                    <div style={{ position: "absolute", left: 12, right: 12, bottom: 76, zIndex: 18, background: "rgba(10,16,27,.94)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: `1px solid ${C.border}`, borderRadius: 18, boxShadow: "0 14px 38px rgba(0,0,0,.55)", maxHeight: mapDrawer ? "min(58%, 460px)" : 58, transition: "max-height .26s cubic-bezier(.4,0,.2,1)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                      <button onClick={() => setMapDrawer((o) => !o)} aria-label={mapDrawer ? "Collapse list" : "Expand list"} style={{ flexShrink: 0, width: "100%", background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "8px auto 6px" }} />
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", padding: "0 16px 10px" }}>
                          <span style={{ fontSize: 13, lineHeight: "17px", fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{view.length} place{view.length === 1 ? "" : "s"} {sortBy === "near" ? "nearest first" : "ranked by fit"}</span>
                          <span style={{ flexShrink: 0, fontSize: 11.5, lineHeight: "17px", color: C.accent, fontWeight: 800 }}>{mapDrawer ? "Hide list ▾" : "Browse list ▴"}</span>
                        </div>
                      </button>
                      {mapDrawer && (
                        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", padding: "0 12px 16px" }}>
                          {/* v6.88 (owner: "Sofra Kitchen Bar & Bistro looks like two
                              different restaurants depending on where I see it"): this
                              drawer used to render its own trimmed-down row (rank +
                              52px thumbnail + name + score chip) instead of the SAME
                              PlaceCard every other ranked list on the site uses — so a
                              place picked up the category eyebrow, the "Top X pick"
                              award, the experience tag chips (Romantic/Hidden gem/etc.)
                              and the Save/Like/Dislike/Share row everywhere EXCEPT here.
                              PlaceCard was already threaded onto ctx for other G4 screens
                              (see the "module-scope components" block in home.js's ctx);
                              this drawer just wasn't using it. `view` is the exact same
                              array/object references the rest of the app renders with
                              PlaceCard, so the numbers on a card here now match the
                              numbers on that same place everywhere else in this session. */}
                          {view.map((p, i) => (
                            <PlaceCard key={p.id} p={p} rank={i + 1} saved={isSaved(p.id)} liked={!!(liked && liked[p.id])} disliked={!!(disliked && disliked[p.id])} onDetail={() => { setMapPreview(p); setMapFocus({ lat: p.lat, lng: p.lng, ts: Date.now() }); setMapDrawer(false); }} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} onShareCard={(pl) => { try { addShared(pl); giveawayMark(pl.id); } catch (e) {} }} line={blurbs[p.id]} onBadge={openExperience} onCuisineTap={openCuisine} beachSignal={beachSignals && beachSignals[p.id]} city={cityNow} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
}
