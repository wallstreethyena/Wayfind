"use client";
// Extracted from app/home.js (G4, July 2026 decomposition). Render-only.
// tasteBoost is exclusive to the map's default ranking blend and moves with it.
import { C, scoreLabel, PlaceScoreChip, TRENDING_POPULARITY_THRESHOLD } from "../kit";

function tasteBoost(place) {
  try { const k = String((place && place.type) || ""); if (!k) return 0; const t = JSON.parse(localStorage.getItem("wf_taste_v1") || "{}"); return Math.min(3, (t[k] || 0) * 0.5); } catch (e) { return 0; }
}

// v6.71 (Wave 2): same flame + water-quality read as every other beach
// surface, sourced from the SAME `beachSignals` batch home.js already
// computes for the visible PlaceCards (isBeach + beachSignals both arrive
// via ctx) — no separate fetch for the map screen.
function BeachChips({ p, isBeach, beachSignals }) {
  if (!isBeach || !isBeach(p) || !beachSignals) return null;
  const sig = beachSignals[p.id];
  if (!sig) return null;
  const wq = sig.water ? (sig.water.advisory ? { t: "Advisory", c: C.red } : sig.water.result === "Good" ? { t: "Water: Good", c: C.green } : sig.water.result === "Moderate" ? { t: "Water: Moderate", c: "#E8B84B" } : sig.water.result ? { t: "Water: Poor", c: C.red } : null) : null;
  const trending = sig.popularityPct != null && sig.popularityPct >= TRENDING_POPULARITY_THRESHOLD;
  if (!trending && !wq) return null;
  return (
    <>
      {trending ? <span style={{ fontSize: 11.5, fontWeight: 800, color: "#FB923C" }}>🔥 Popular</span> : null}
      {wq ? <span style={{ fontSize: 11.5, fontWeight: 700, color: wq.c }}>🏖️ {wq.t}</span> : null}
    </>
  );
}

export default function MapScreen({ ctx }) {
  const { mapMode, setMapMode, mapBrowse, setMapBrowse, mapPool, mapListOverride, compassOn, compassNeedleRef, toggleCompass, cat, setCat, sub, setSub, setVibe, sortBy, center, deviceLoc, mapFocus, setMapFocus, setMapSearchOpen, events, eventsLoading, eventsUnavailable, mapDate, setMapDate, mapPreview, setMapPreview, mapDrawer, setMapDrawer, eventPreview, setEventPreview, suggested, places, liked, disliked, view, featuredBoost, communityBoost, MapView, CategoryMenu, FallbackImg, iconForPlace, liveOpen, logEvent, loadEvents, openDetail, openVenue, ticketUrl, Hol, isBeach, beachSignals, PlaceCard, isSaved, toggleLike, toggleDislike, quickSaveFavorite, addShared, giveawayMark, blurbs, openExperience, openCuisine, cityNow } = ctx;
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
                      <CategoryMenu showSubs={false} activeCat={cat} sub={sub} onCat={(id, label) => { try { logEvent("intent_chip", null, { intent: label, layer: 1, src: "map" }); } catch (e) {} setMapBrowse(true); if (cat !== id) { setCat(id); setSub("all"); setVibe("all"); } }} onSub={(v) => setSub(v)} trailing={<button onClick={() => setMapSearchOpen((v) => !v)} aria-label="Search" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "8px 3px", borderRadius: 12, background: "transparent", border: "1px solid transparent", cursor: "pointer", flex: 1, minWidth: 0 }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.2" /><path d="M20 20l-4.4-4.4" /></svg><span style={{ fontSize: 10.5, fontWeight: 600, color: C.muted, textAlign: "center", lineHeight: 1.12 }}>Search</span></button>} />
                      </>)}
                    </div>
                  </div>
                  <MapView rings fit={!!(mapListOverride && mapListOverride.length)} places={mapListOverride && mapListOverride.length ? mapListOverride : mapMode === "events" ? [] : (mapMode === "fifa" ? (() => { const seen = new Set(); const pool = [...(mapPool || []), ...(suggested || []), ...(places || [])].filter((q) => q && q.id && !seen.has(q.id) && seen.add(q.id)); return pool.map((q) => [q, Hol.fitFor("worldcup", q)]).filter((x) => x[1] >= 8).map((x) => [x[0], x[1] + featuredBoost(x[0].name) + (x[0].wfScore || 50)]).sort((a, b) => b[1] - a[1]).slice(0, 12).map((x) => x[0]); })() : (mapBrowse ? view : (() => { const seen = new Set(); const pool = [...(mapPool || []), ...(suggested || []), ...(places || [])].filter((q) => q && q.id && !seen.has(q.id) && seen.add(q.id)); return pool.map((q) => [q, (q.wfScore || 50) + featuredBoost(q.name) + tasteBoost(q) + communityBoost(q) - (liked && liked[q.id] ? 8 : 0)]).sort((a, b) => b[1] - a[1]).slice(0, 10).map((x) => x[0]); })()))} events={mapEvents} center={center} category={cat} deviceLoc={deviceLoc} focus={mapFocus} onSelect={(p) => { setMapPreview(p); setMapDrawer(false); try { logEvent("map_pin_selected", p, {}); } catch (e) {} }} onSelectEvent={(e) => { setMapPreview(null); setEventPreview(e); }} />
                  <div style={{ position: "absolute", top: 104, left: 12, zIndex: 5, display: "flex", flexDirection: "column", background: "rgba(10,16,27,.88)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,.45)" }}>
                    {Hol.worldCup(new Date()) ? <button onClick={() => setMapMode(mapMode === "fifa" ? "places" : "fifa")} style={{ padding: "7px 13px", fontSize: 13, fontWeight: 800, border: "none", cursor: "pointer", background: mapMode === "fifa" ? C.light : "transparent", color: mapMode === "fifa" ? "#fff" : C.light }}>⚽ FIFA</button> : null}
                    <button onClick={() => { if (mapMode === "events") { setMapMode("places"); } else { setMapMode("events"); if (!events) loadEvents(); } }} style={{ padding: "7px 15px", fontSize: 13, fontWeight: 800, border: "none", cursor: "pointer", background: mapMode === "events" ? C.light : "transparent", color: mapMode === "events" ? "#fff" : C.light }}>🎟️ Events</button>
                  </div>
                  {mapMode === "places" && (
                    <button onClick={toggleCompass} aria-label="Compass" title="Compass" style={{ position: "absolute", top: 156, left: 12, zIndex: 5, width: 42, height: 42, borderRadius: "50%", background: compassOn ? C.light : "rgba(10,16,27,.88)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: `1px solid ${C.border}`, boxShadow: "0 4px 16px rgba(0,0,0,.45)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>
                      <span ref={compassNeedleRef} style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1, transition: "transform .15s linear", willChange: "transform" }}>
                        <span style={{ fontSize: 8, fontWeight: 800, color: compassOn ? "#fff" : C.accent }}>N</span>
                        <svg width="12" height="16" viewBox="0 0 12 16"><path d="M6 0 L11 9 L6 6.5 L1 9 Z" fill={compassOn ? "#fff" : "#F97316"} /><path d="M6 16 L11 9 L6 11.5 L1 9 Z" fill="rgba(255,255,255,.35)" /></svg>
                      </span>
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
                    const mp = mapPreview;
                    const sl = scoreLabel(mp.wfScore);
                    const opensLater = liveOpen(mp) === false && mp.nextOpen && mp.nextOpen.today;
                    const openList = (view || []).filter((x) => x && liveOpen(x) === true && x.distMi != null);
                    const closestOpen = openList.length ? openList.reduce((a, b) => (b.distMi < a.distMi ? b : a)) : null;
                    let tag = null;
                    if (closestOpen && closestOpen.id === mp.id) tag = { t: "Closest open spot", c: C.green };
                    else if (mp.distMi != null && mp.distMi >= 25 && (mp.rating || 0) >= 4.5) tag = { t: "Worth the drive", c: C.gold };
                    return (
                      <div style={{ position: "absolute", left: 12, right: 12, bottom: 22, zIndex: 6 }}>
                        <div style={{ position: "relative", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 16, overflow: "hidden", boxShadow: "0 10px 34px rgba(0,0,0,.6)" }}>
                          <div onClick={() => openDetail(mp)} style={{ display: "flex", cursor: "pointer", minWidth: 0 }}>
                            <FallbackImg src={mp.photo} icon="📍" style={{ width: 96, height: 96, objectFit: "cover", flexShrink: 0, display: "block" }} />
                            <div style={{ padding: "10px 12px", minWidth: 0, flex: 1 }}>
                              <div style={{ fontSize: 14.5, fontWeight: 800, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: 22 }}>{mp.name}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 4 }}>
                                {sl && <span style={{ fontSize: 12.5, fontWeight: 800, color: C.text }}>{sl.word}</span>}
                                <PlaceScoreChip p={mp} size={12} />
                                {liveOpen(mp) === true && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.green }}>Open</span>}
                                {liveOpen(mp) === false && <span style={{ fontSize: 11.5, fontWeight: 700, color: opensLater ? C.gold : C.red }}>{opensLater ? mp.nextOpen.label : "Closed"}</span>}
                                {mp.distMi != null && <span style={{ fontSize: 11.5, color: C.muted }}>· {mp.distMi.toFixed(1)} mi</span>}
                                {mp.distMi != null && <span style={{ fontSize: 11.5, fontWeight: 700, color: C.light }}>· ≈ {Math.max(4, Math.round((mp.distMi * 1.3 / 28) * 60) + 3)} min drive</span>}
                                <BeachChips p={mp} isBeach={isBeach} beachSignals={beachSignals} />
                              </div>
                              {tag && <div style={{ fontSize: 11, fontWeight: 800, color: tag.c, marginTop: 5 }}>{tag.t}</div>}
                              <div style={{ fontSize: 11.5, fontWeight: 700, color: C.light, marginTop: tag ? 4 : 5 }}>See details →</div>
                            </div>
                          </div>
                          <button onClick={(ev) => { ev.stopPropagation(); setMapPreview(null); }} aria-label="Dismiss" style={{ position: "absolute", top: 7, right: 7, width: 24, height: 24, borderRadius: 999, border: "none", background: "rgba(0,0,0,.5)", color: "#fff", fontSize: 13, lineHeight: 1, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>✕</button>
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
                  {mapMode === "places" && !mapPreview && view.length > 0 && (
                    <div style={{ position: "absolute", left: 12, right: 12, bottom: 76, zIndex: 18, background: "rgba(10,16,27,.94)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: `1px solid ${C.border}`, borderRadius: 18, boxShadow: "0 14px 38px rgba(0,0,0,.55)", maxHeight: mapDrawer ? "min(58%, 460px)" : 52, transition: "max-height .26s cubic-bezier(.4,0,.2,1)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                      <button onClick={() => setMapDrawer((o) => !o)} aria-label={mapDrawer ? "Collapse list" : "Expand list"} style={{ flexShrink: 0, width: "100%", background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "7px auto 5px" }} />
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", padding: "0 16px 9px" }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{view.length} place{view.length === 1 ? "" : "s"} {sortBy === "near" ? "nearest first" : "ranked by fit"}</span>
                          <span style={{ fontSize: 11.5, color: C.accent, fontWeight: 800 }}>{mapDrawer ? "Hide list ▾" : "Browse list ▴"}</span>
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
