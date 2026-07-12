"use client";
// Extracted from app/home.js (G1, July 2026 decomposition). Render-only; the
// two original sibling branches (trip list, open trip) keep their conditions.
import { C } from "../kit";
import { openExternal } from "../../../lib/links";
import * as Trips from "../../../lib/trips";

export default function ItineraryScreen({ ctx }) {
  const { activeTrip, setActiveTrip, trips, setTrips, tripNoteEdit, setTripNoteEdit, tripMoveFor, setTripMoveFor, sub, logEvent, setScreen, pickBrowse, reservations, removeRes, saveResConf, isSaved, liked, disliked, openDetail, quickSaveFavorite, toggleLike, toggleDislike, addShared, giveawayMark, blurbs, openExperience, openCuisine, PlaceCard, CategoryMenu, StateBadge, requireAuth } = ctx;
  return (
    <>
        {!activeTrip && (() => {
          const list = Trips.tripList(trips);
          return (
            <div>
              <CategoryMenu activeCat={null} sub={sub} onCat={(id, label) => { try { logEvent("intent_chip", null, { intent: label, layer: 1, src: "itinerary" }); } catch (e) {} setScreen("home"); setTimeout(() => pickBrowse(id), 60); }} onSub={() => {}} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, paddingTop: 4 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>Your trips</div>
                {list.length > 0 && <span style={{ fontSize: 13, color: C.muted }}>{list.length} destination{list.length !== 1 ? "s" : ""}</span>}
              </div>
              <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.4, marginBottom: 16 }}>Save a place and it lands here under its city. Reorder your stops, mark what you have hit, and route the whole trip in Google Maps.</div>
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
                        {r.url ? <a href={r.url} target="_blank" rel="noreferrer" style={{ fontSize: 11.5, fontWeight: 800, color: C.accent, textDecoration: "none", flexShrink: 0 }}>View ↗</a> : null}
                        <button onClick={() => removeRes(r.id)} aria-label="Remove reservation" style={{ background: "transparent", border: "none", color: C.muted, fontSize: 15, cursor: "pointer", padding: "2px 4px", flexShrink: 0 }}>✕</button>
                      </div>
                      <input defaultValue={r.conf} onBlur={(e) => saveResConf(r.id, e.target.value)} placeholder="Add confirmation # or note"
                        style={{ width: "100%", boxSizing: "border-box", marginTop: 9, padding: "8px 11px", borderRadius: 10, border: `1px dashed ${r.conf ? C.border : C.accent + "66"}`, background: "transparent", color: C.text, fontSize: 12.5, outline: "none" }} />
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
                  return (
                    <div key={t.key} onClick={() => { setActiveTrip(t.key); try { window.scrollTo(0, 0); } catch {} }} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                      <StateBadge code={t.state} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15.5, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.city}{t.state ? ", " + t.state : ""}</div>
                        <div style={{ fontSize: 13, color: C.muted }}>{st.total} place{st.total !== 1 ? "s" : ""}{st.visited > 0 ? " · " + st.visited + " visited" : ""}</div>
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
          const items = Trips.sortedItems(t);
          const st = Trips.tripStats(t);
          const others = Trips.tripList(trips).filter((x) => x.key !== t.key);
          const tripCtl = { width: 34, height: 30, borderRadius: 8, border: "1px solid " + C.border, background: C.card, color: C.text, fontSize: 15, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" };
          const tripChip = { border: "1px solid " + C.border, background: C.card, color: C.muted, fontSize: 12, fontWeight: 700, padding: "7px 11px", borderRadius: 18, cursor: "pointer" };
          const doRoute = () => { const u = Trips.routeUrl(t); if (u) { openExternal(u); try { logEvent("trip_route", null, { key: t.key, n: items.length }); } catch {} } };
          return (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 14, borderBottom: "1px solid " + C.border, marginBottom: 14, paddingTop: 4 }}>
                <button onClick={() => { setActiveTrip(null); setTripNoteEdit(null); setTripMoveFor(null); }} style={{ background: "none", border: "none", color: C.accent, fontSize: 22, cursor: "pointer" }}>‹</button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.city}{t.state ? ", " + t.state : ""}</div>
                  <div style={{ fontSize: 12.5, color: C.muted }}>{st.total} place{st.total !== 1 ? "s" : ""}{st.visited > 0 ? " · " + st.visited + " visited" : ""}</div>
                </div>
                {items.length > 0 && <button onClick={doRoute} style={{ background: C.accent, border: "none", color: "#0D1117", fontSize: 13, fontWeight: 800, padding: "8px 14px", borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap" }}>Route it ↗</button>}
              </div>
              {items.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px", color: C.muted }}>This trip is empty.</div>
              ) : items.map((it, i) => {
                const p = it.place;
                const editing = tripNoteEdit === p.id;
                const moving = tripMoveFor === p.id;
                return (
                  <div key={p.id} style={{ marginBottom: 12 }}>
                    <div style={{ position: "relative", opacity: it.visited ? 0.62 : 1 }}>
                      <PlaceCard p={p} saved={isSaved(p.id)} liked={!!liked[p.id]} disliked={!!disliked[p.id]} onDetail={() => openDetail(p)} onSave={() => quickSaveFavorite(p)} onLike={(e) => toggleLike(e, p)} onDislike={(e) => toggleDislike(e, p)} onShareCard={(pl) => { try { addShared(pl); giveawayMark(pl.id); } catch (e) {} }} line={blurbs[p.id]} onBadge={openExperience} onCuisineTap={openCuisine} />
                      {it.visited && <div style={{ position: "absolute", top: 8, left: 8, background: C.accent, color: "#0D1117", fontSize: 11, fontWeight: 800, padding: "3px 8px", borderRadius: 20, zIndex: 2 }}>✓ Visited</div>}
                    </div>
                    {it.note && !editing && <div style={{ fontSize: 12.5, color: C.light, background: C.card, border: "1px solid " + C.border, borderRadius: 10, padding: "8px 10px", marginTop: 6 }}>📝 {it.note}</div>}
                    {editing && (
                      <div style={{ marginTop: 6 }}>
                        <textarea autoFocus defaultValue={it.note} id={"note_" + p.id} placeholder="Reservation time, what to order, who to ask for…" style={{ width: "100%", boxSizing: "border-box", minHeight: 60, background: C.card, border: "1px solid " + C.accent, borderRadius: 10, padding: "8px 10px", color: C.text, fontSize: 13, resize: "vertical" }} />
                        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                          <button onClick={() => { if (!requireAuth("Sign in to save trip notes")) return; const el = document.getElementById("note_" + p.id); const v = el ? el.value : ""; setTrips((prev) => Trips.setNote(prev, t.key, p.id, (v || "").trim())); setTripNoteEdit(null); }} style={{ background: C.accent, border: "none", color: "#0D1117", fontSize: 12.5, fontWeight: 800, padding: "7px 14px", borderRadius: 18, cursor: "pointer" }}>Save note</button>
                          <button onClick={() => setTripNoteEdit(null)} style={{ background: "transparent", border: "1px solid " + C.border, color: C.muted, fontSize: 12.5, fontWeight: 700, padding: "7px 14px", borderRadius: 18, cursor: "pointer" }}>Cancel</button>
                        </div>
                      </div>
                    )}
                    {moving && (
                      <div style={{ marginTop: 6, background: C.card, border: "1px solid " + C.border, borderRadius: 10, padding: 8 }}>
                        <div style={{ fontSize: 12, color: C.muted, marginBottom: 6, padding: "0 2px" }}>Move to…</div>
                        {others.length === 0 ? (
                          <div style={{ fontSize: 12.5, color: C.muted, padding: "4px 2px" }}>No other trips yet.</div>
                        ) : others.map((o) => (
                          <div key={o.key} onClick={() => { if (!requireAuth("Sign in to manage trips")) return; setTrips((prev) => Trips.movePlaceToTrip(prev, t.key, o.key, p.id)); setTripMoveFor(null); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 6px", borderRadius: 8, cursor: "pointer" }}>
                            <StateBadge code={o.state} size={28} />
                            <span style={{ fontSize: 13.5, color: C.text }}>{o.city}{o.state ? ", " + o.state : ""}</span>
                          </div>
                        ))}
                        <button onClick={() => setTripMoveFor(null)} style={{ marginTop: 4, background: "transparent", border: "none", color: C.muted, fontSize: 12.5, fontWeight: 700, padding: "4px 2px", cursor: "pointer" }}>Cancel</button>
                      </div>
                    )}
                    {!editing && !moving && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                        <button onClick={() => { if (!requireAuth("Sign in to manage trips")) return; setTrips((prev) => Trips.moveItem(prev, t.key, p.id, -1)); }} disabled={i === 0} style={{ ...tripCtl, opacity: i === 0 ? 0.35 : 1 }}>↑</button>
                        <button onClick={() => { if (!requireAuth("Sign in to manage trips")) return; setTrips((prev) => Trips.moveItem(prev, t.key, p.id, 1)); }} disabled={i === items.length - 1} style={{ ...tripCtl, opacity: i === items.length - 1 ? 0.35 : 1 }}>↓</button>
                        <button onClick={() => { if (!requireAuth("Sign in to manage trips")) return; setTrips((prev) => Trips.toggleVisited(prev, t.key, p.id)); }} style={{ ...tripChip, ...(it.visited ? { background: C.adim, borderColor: C.accent, color: C.accent } : {}) }}>{it.visited ? "✓ Visited" : "Mark visited"}</button>
                        <button onClick={() => { if (!requireAuth("Sign in to add trip notes")) return; setTripNoteEdit(p.id); setTripMoveFor(null); }} style={tripChip}>{it.note ? "Edit note" : "Add note"}</button>
                        <button onClick={() => { if (!requireAuth("Sign in to manage trips")) return; setTripMoveFor(p.id); setTripNoteEdit(null); }} style={tripChip}>Move</button>
                        <button onClick={() => { if (!requireAuth("Sign in to manage trips")) return; if (typeof window !== "undefined" && window.confirm("Remove this place from the trip? It stays in your Favorites.")) setTrips((prev) => Trips.removePlaceFromTrip(prev, t.key, p.id)); }} style={{ ...tripChip, color: C.red }}>Remove</button>
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
