"use client";
// Extracted from app/home.js (G2, July 2026 decomposition). Render-only.
// Six sub-states: menu, community, explore, pick, experiences, weather.
import { C, CAT_COLOR, sheetBg, sheet, SHEET_EASE, Grabber, moonPhase, NavIcon, Icon, PlaceScoreChip } from "../kit";
import { openExternal } from "../../../lib/links";
import { eventWhenLabel } from "../../../lib/eventTime";
import { CATEGORIES } from "../../../lib/google";

export default function MenuSheet({ ctx }) {
  const { menuSheet, setMenuSheet, sheetDragStart, sheetDragMove, sheetDragEnd, locName, pickCat, openSurprise, SheetHero, libraryEvents, primaryCategory, dedupeEvents, foryouEvents, formatEventDate, openVenue, suggested, places, dedupePlaces, openDetail, whyNow, searchRadius, setPendingRadius, setRadiusSheet, setScreen, rollHomePick, homeRolling, homeDiceFace, rollHistory, FallbackImg, INTENTS, intent, setIntent, weather, isNightNow, moonImgName, weatherAdvisory, wayfindWeatherTake, uvLabel, shareWeather, liveOpen } = ctx;
  return (
        <div style={sheetBg} onClick={() => setMenuSheet(null)}>
          <div style={{ ...sheet, padding: "6px 16px 28px", overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setMenuSheet(null))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 16px" }} />
            {menuSheet === "menu" && (
              <>
                <SheetHero icon="🧭" title="Browse by category" subtitle={"Pick a category to explore near " + (locName ? locName.split(",")[0] : "you") + "."} color={C.accent} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                  {CATEGORIES.map((c) => {
                    const cc = CAT_COLOR[c.id] || { c: C.accent, dim: C.adim };
                    return (
                      <button key={c.id} onClick={() => { setMenuSheet(null); pickCat(c.id); }} style={{ height: 84, borderRadius: 16, border: `1.5px solid ${cc.c}`, background: cc.dim, color: C.text, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7, fontSize: 15, fontWeight: 800 }}>
                        <NavIcon name={c.id} color={cc.c} size={26} />
                        <span>{c.label.replace(/^\S+\s/, "")}</span>
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => setMenuSheet("experiences")} style={{ width: "100%", marginTop: 10, minHeight: 56, borderRadius: 16, border: `1px solid ${C.border}`, background: C.card, color: C.text, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 15, fontWeight: 800 }}>
                  <Icon name="sparkles" size={19} color={C.accent} />
                  <span>Browse by occasion</span>
                </button>
                <button onClick={() => { setMenuSheet(null); openSurprise(); }} style={{ width: "100%", marginTop: 12, minHeight: 62, borderRadius: 16, border: `1.5px solid ${C.border}`, background: `linear-gradient(150deg, ${C.adim} 0%, ${C.card} 70%)`, color: C.light, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, fontSize: 15, fontWeight: 800 }}>
                  <Icon name="dice" size={19} color={C.accent} />
                  <span>Can't decide? Let's Wayfind it</span>
                </button>
              </>
            )}
            {menuSheet === "community" && (
              <>
                <SheetHero icon="📚" title="Local Events" subtitle="Free local programs and civic events near you." color="#2DD4BF" />
                {libraryEvents && libraryEvents.length > 0 ? (
                  <>
                    {libraryEvents.slice(0, 12).map((e, i) => {
                      const dt = e.date ? new Date(e.date + "T00:00:00") : null;
                      return (
                        <div key={(e.id || e.name || "ev") + "-" + i} onClick={() => openExternal(e.url)} style={{ display: "flex", alignItems: "center", gap: 12, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "11px 13px", marginBottom: 8, cursor: e.url ? "pointer" : "default" }}>
                          <div style={{ flexShrink: 0, width: 44, textAlign: "center" }}>
                            {dt ? (<><div style={{ fontSize: 10.5, fontWeight: 800, color: "#2DD4BF", textTransform: "uppercase", letterSpacing: "0.3px" }}>{dt.toLocaleDateString(undefined, { month: "short" })}</div><div style={{ fontSize: 20, fontWeight: 800, color: C.text, lineHeight: 1.05 }}>{dt.getDate()}</div></>) : (<div style={{ fontSize: 22 }}>📚</div>)}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.name}</div>
                            <div style={{ fontSize: 12, color: C.muted, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.time ? e.time + " · " : ""}{e.venue || "Manatee County Library"}</div>
                          </div>
                          {e.url && <span style={{ color: C.muted, fontSize: 16, flexShrink: 0 }}>›</span>}
                        </div>
                      );
                    })}
                    <div style={{ fontSize: 10.5, color: C.muted, marginTop: 10, textAlign: "center" }}>Manatee County Public Library · via LibCal</div>
                  </>
                ) : (
                  <div style={{ textAlign: "center", padding: "28px 16px", color: C.muted, fontSize: 13.5, lineHeight: 1.5 }}>No local programs loaded right now. Check back soon for library events, workshops, and civic happenings nearby.</div>
                )}
              </>
            )}
            {menuSheet === "explore" && (
              <>
                <SheetHero icon="📍" title={locName || "Nearby"} subtitle="Open spots near you, ranked best first." color={C.accent} />
                {(() => {
                  const src = (suggested && suggested.length ? suggested : places) || [];
                  if (src.length < 4) return null;
                  const counts = {};
                  src.forEach((p) => { const c = primaryCategory(p); if (c) counts[c] = (counts[c] || 0) + 1; });
                  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 2);
                  if (!top.length) return null;
                  const gems = src.filter((p) => (p.rating || 0) >= 4.5).length;
                  const catLine = top.map(([c, n]) => `${c} (${n})`).join(" and ");
                  return (
                    <div style={{ fontSize: 13.5, color: C.light, lineHeight: 1.55, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
                      <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700, marginBottom: 5 }}>The local scene</div>
                      Strongest around here: {catLine}.{gems > 0 ? ` ${gems} spot${gems === 1 ? "" : "s"} sitting at 4.5★ or higher.` : ""}
                    </div>
                  );
                })()}
                {(() => {
                  const src = dedupePlaces([...(suggested || []), ...places]);
                  if (!src.length) return null;
                  const openFirst = src.filter((p) => p && liveOpen(p) === true);
                  const base = (openFirst.length >= 2 ? openFirst : src).filter(Boolean);
                  const picks = base.slice(0, 2);
                  if (picks.length === 0) return null;
                  const evs = dedupeEvents(foryouEvents || [], true).filter(Boolean).slice(0, 2);
                  return (
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: C.light, marginBottom: 8 }}>Start with these</div>
                      {picks.map((p, i) => (
                        <div key={"nbpick-" + p.id} onClick={() => { setMenuSheet(null); openDetail(p); }} style={{ marginBottom: 10, border: `1.5px solid ${i === 0 ? C.light : C.border}`, borderRadius: 16, overflow: "hidden", cursor: "pointer", background: i === 0 ? `linear-gradient(160deg, rgba(255,150,70,.10) 0%, ${C.card} 60%)` : C.card }}>
                          <div style={{ position: "relative" }}>
                            <FallbackImg src={p.photo} icon="📍" style={{ width: "100%", height: 130, objectFit: "cover", display: "block" }} />
                            {(() => { const lo = liveOpen(p); return (
                            <div style={{ position: "absolute", top: 9, left: 9, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,.62)", border: `1px solid ${(lo === true ? C.green : C.accent)}80`, borderRadius: 999, padding: "4px 10px", backdropFilter: "blur(4px)" }}>
                              <span style={{ fontSize: 9.5, fontWeight: 800, color: lo === true ? C.green : C.accent, textTransform: "uppercase", letterSpacing: "0.7px" }}>{lo === true ? "Open now" : (i === 0 ? "Top pick nearby" : "Also near you")}</span>
                            </div>); })()}
                          </div>
                          <div style={{ padding: "11px 13px 13px" }}>
                            <div style={{ fontSize: 16.5, fontWeight: 800, color: C.text, lineHeight: 1.2 }}>{p.name}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 6 }}>
                              <PlaceScoreChip p={p} size={12} />
                              {p.reviews != null && <span style={{ fontSize: 11.5, color: C.muted }}>· {p.reviews.toLocaleString()} reviews</span>}
                              {(() => { const lo = liveOpen(p); return lo === true ? <span style={{ fontSize: 11.5, fontWeight: 700, color: C.green }}>· Open</span> : lo === false ? <span style={{ fontSize: 11.5, fontWeight: 700, color: p.nextOpen && p.nextOpen.today ? C.gold : C.red }}>· {p.nextOpen && p.nextOpen.today ? p.nextOpen.label : "Closed"}</span> : null; })()}
                              {p.distMi != null && <span style={{ fontSize: 11.5, color: C.muted }}>· {p.distMi.toFixed(1)} mi</span>}
                            </div>
                            {whyNow(p) && <div style={{ fontSize: 12.5, color: C.light, lineHeight: 1.5, marginTop: 7 }}><span style={{ color: C.light, fontWeight: 800 }}>Why now: </span>{whyNow(p)}</div>}
                          </div>
                        </div>
                      ))}
                      {evs.length > 0 && (
                        <>
                          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: "uppercase", color: C.light, margin: "6px 2px 8px" }}>Happening near you</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 9, marginBottom: 4 }}>
                            {evs.map((e) => {
                              // v5.76 (B3): the last event surface still dead-ending via openVenue(e)
                              // (which showed a "Could not find this venue" toast). Render the card as
                              // a real link to the event's resolved destination — the same contract every
                              // other event surface uses — and drop any event without a working
                              // destination rather than showing a card that goes nowhere.
                              if (!e.dest) return null;
                              const f = formatEventDate(e.date, e.time);
                              const evRel = eventWhenLabel(e); // v6.13: time-aware same-day label
                              const internal = typeof e.dest === "string" && e.dest[0] === "/";
                              return (
                                <a key={"nbev-" + e.id} href={e.dest} {...(internal ? {} : { target: "_blank", rel: "noreferrer" })} onClick={() => setMenuSheet(null)} style={{ display: "block", textDecoration: "none", background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 11, cursor: "pointer", minWidth: 0 }}>
                                  <div style={{ fontSize: 10, fontWeight: 800, color: evRel ? C.light : C.purple, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{evRel ? evRel.toUpperCase() : (f.mo + " " + f.day)}{f.time ? " · " + f.time : ""}</div>
                                  <div style={{ fontSize: 12.5, fontWeight: 700, color: C.text, lineHeight: 1.3, marginBottom: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{e.name}</div>
                                  <div style={{ fontSize: 10, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>📍 {e.venue || e.city || "Nearby"}</div>
                                </a>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}
                {(() => {
                  const near = ((suggested && suggested.length ? suggested : places) || []).filter(Boolean);
                  if (near.length >= 1) return null;
                  return (
                    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 16px", marginBottom: 12, textAlign: "center" }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Quiet right around {locName ? locName.split(",")[0] : "you"}</div>
                      <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.45, marginBottom: 12 }}>We did not find much in your immediate area. Want to look a little farther out?</div>
                      <button onClick={() => { setMenuSheet(null); setPendingRadius(Math.max(searchRadius || 0, 40234)); setRadiusSheet(true); }} style={{ width: "100%", padding: 13, borderRadius: 12, border: `1.5px solid ${C.border}`, background: C.adim, color: C.light, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Search a wider area →</button>
                    </div>
                  );
                })()}
                <button onClick={() => { setMenuSheet(null); setScreen("explore"); }} style={{ width: "100%", padding: 14, borderRadius: 12, border: "none", background: C.accent, color: "#0D1117", fontSize: 14.5, fontWeight: 800, cursor: "pointer" }}>Show me the best spots →</button>
              </>
            )}
            {menuSheet === "pick" && (
              <>
                <style>{"@keyframes wfRouletteFloat{0%,100%{transform:translateY(0) rotate(-9deg)}50%{transform:translateY(-7px) rotate(7deg)}}@keyframes wfRouletteGlow{0%,100%{opacity:.42;transform:scale(.92)}50%{opacity:1;transform:scale(1.08)}}@keyframes wfRouletteSpin{to{transform:rotate(360deg)}}"}</style>
                <section aria-label="Wayfind Roulette" style={{ position: "relative", overflow: "hidden", borderRadius: 22, padding: "22px 18px 18px", marginBottom: 16, background: "radial-gradient(circle at 84% 16%, rgba(148,163,184,.25), transparent 31%), linear-gradient(145deg, #172235 0%, #0E1622 58%, #0A1019 100%)", border: "1px solid rgba(148,163,184,.34)", boxShadow: "0 18px 44px rgba(0,0,0,.38)" }}>
                  <div aria-hidden="true" style={{ position: "absolute", width: 188, height: 188, right: -64, top: -72, borderRadius: "50%", border: "1px solid rgba(148,163,184,.25)", animation: "wfRouletteSpin 18s linear infinite" }} />
                  <div aria-hidden="true" style={{ position: "absolute", width: 126, height: 126, right: -33, top: -40, borderRadius: "50%", border: "1px dashed rgba(255,255,255,.16)", animation: "wfRouletteSpin 12s linear infinite reverse" }} />
                  <div style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14 }}>
                    <div style={{ maxWidth: 245 }}>
                      <div style={{ fontSize: 10.5, fontWeight: 850, letterSpacing: "1.15px", color: C.light }}>WAYFIND ROULETTE</div>
                      <div style={{ fontSize: 25, lineHeight: 1.06, fontWeight: 850, letterSpacing: "-.55px", color: "#F8FAFC", marginTop: 6 }}>One great plan. No endless scrolling.</div>
                      <div style={{ fontSize: 13, color: "#B7C4D6", lineHeight: 1.48, marginTop: 9 }}>We choose one standout nearby based on what is worth your time right now.</div>
                    </div>
                    <button aria-label={homeRolling ? "Choosing your Wayfind pick" : "Roll Wayfind Roulette"} onClick={() => rollHomePick(suggested || places || [])} disabled={homeRolling} style={{ position: "relative", flexShrink: 0, width: 92, height: 92, borderRadius: 28, border: "1px solid rgba(148,163,184,.88)", background: "linear-gradient(145deg, #2C394B, #111A26)", cursor: homeRolling ? "default" : "pointer", boxShadow: "0 12px 28px rgba(0,0,0,.42), inset 0 1px 0 rgba(255,255,255,.12)", display: "grid", placeItems: "center" }}>
                      <span aria-hidden="true" style={{ position: "absolute", inset: -8, borderRadius: 34, border: "1px solid rgba(148,163,184,.36)", animation: "wfRouletteGlow 2.2s ease-in-out infinite" }} />
                      {homeRolling ? <span style={{ position: "relative", zIndex: 1, color: "#fff", fontSize: 41, lineHeight: 1, animation: "wfroll .48s linear infinite" }}>{homeDiceFace}</span> : <span aria-hidden="true" style={{ position: "relative", zIndex: 1, width: 48, height: 48, borderRadius: 14, background: "linear-gradient(145deg, #F8FAFC, #B9C3D0)", boxShadow: "inset 0 1px 0 #fff, 0 7px 14px rgba(0,0,0,.26)", transform: "rotate(-9deg)", animation: "wfRouletteFloat 3.6s ease-in-out infinite", display: "block" }}><i style={{ position: "absolute", width: 7, height: 7, borderRadius: "50%", background: "#18202C", left: 10, top: 10 }} /><i style={{ position: "absolute", width: 7, height: 7, borderRadius: "50%", background: "#18202C", right: 10, top: 10 }} /><i style={{ position: "absolute", width: 7, height: 7, borderRadius: "50%", background: "#C9A961", left: 20.5, top: 20.5 }} /><i style={{ position: "absolute", width: 7, height: 7, borderRadius: "50%", background: "#18202C", left: 10, bottom: 10 }} /><i style={{ position: "absolute", width: 7, height: 7, borderRadius: "50%", background: "#18202C", right: 10, bottom: 10 }} /></span>}
                    </button>
                  </div>
                  <div style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 7, marginTop: 18 }}>
                    {["Nearby", "Great reviews", "Best for now"].map((label, index) => <div key={label} style={{ borderTop: "1px solid rgba(255,255,255,.14)", paddingTop: 8, color: "#D7E0EC", fontSize: 11, fontWeight: 750, lineHeight: 1.2 }}><span style={{ color: C.light, marginRight: 5 }}>{["01", "02", "03"][index]}</span>{label}</div>)}
                  </div>
                  <button onClick={() => rollHomePick(suggested || places || [])} disabled={homeRolling} style={{ position: "relative", zIndex: 1, width: "100%", minHeight: 54, marginTop: 18, border: "none", borderRadius: 15, background: "linear-gradient(180deg,#FF963C,#F97316 58%,#E95A0C)", color: "#0B111A", fontSize: 15, fontWeight: 850, cursor: homeRolling ? "default" : "pointer", boxShadow: "0 10px 22px rgba(148,163,184,.28)", opacity: homeRolling ? .65 : 1 }}>{homeRolling ? "Finding your move…" : rollHistory.length ? "Roll a new plan →" : "Find my next move →"}</button>
                </section>
                {rollHistory.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 8 }}>Your rolls</div>
                    {rollHistory.map((rp, i) => (
                      <div key={rp.id + "-" + i} onClick={() => { setMenuSheet(null); openDetail(rp); }} style={{ display: "flex", alignItems: "center", gap: 10, background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 10px", marginBottom: 7, cursor: "pointer" }}>
                        <span style={{ flexShrink: 0, width: 22, height: 22, borderRadius: "50%", background: C.adim, color: C.light, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{rollHistory.length - i}</span>
                        <FallbackImg src={rp.photo} icon="🍽️" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rp.name}</div>
                          <div style={{ display: "flex", gap: 6, marginTop: 2, alignItems: "center" }}>
                            <PlaceScoreChip p={rp} size={11} />
                            {rp.distMi != null && <span style={{ fontSize: 11, color: C.muted }}>· {rp.distMi.toFixed(1)} mi</span>}
                          </div>
                        </div>
                        <span style={{ color: C.muted, fontSize: 16, flexShrink: 0 }}>›</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            {menuSheet === "experiences" && (
              <>
                <SheetHero icon="✨" title="Occasions" subtitle="Pick an occasion and the feed reshapes around it." color={C.gold} />
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                  {INTENTS.map((it) => {
                    const on = intent === it.id;
                    return (
                      <button key={it.id} onClick={() => { setIntent(on ? null : it.id); setMenuSheet(null); }} style={{ height: 76, borderRadius: 16, border: `1.5px solid ${on ? C.light : C.border}`, background: on ? C.adim : C.card, color: on ? C.light : C.light, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 14, fontWeight: 800 }}>
                        <span style={{ fontSize: 24, lineHeight: 1 }}>{it.icon}</span>
                        <span>{it.label}</span>
                      </button>
                    );
                  })}
                  <button onClick={() => { const rc = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)]; setMenuSheet(null); pickCat(rc.id); }} style={{ height: 76, borderRadius: 16, border: `1.5px dashed ${C.accent}`, background: C.adim, color: C.light, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, fontSize: 13, fontWeight: 800 }}>
                    <span style={{ fontSize: 24, lineHeight: 1 }}>🎲</span>
                    <span>Surprise Me</span>
                  </button>
                </div>
              </>
            )}
            {menuSheet === "weather" && weather && (
              <>
                {/* v4.7: no static icon tile above the title. The live condition icon sits to the right of the words. */}
                {(() => {
                  const hr = new Date().getHours();
                  const timeLabel = hr < 5 ? "Late-night weather" : hr < 12 ? "This morning's weather" : hr < 17 ? "This afternoon's weather" : hr < 21 ? "This evening's weather" : "Tonight's weather";
                  const night = isNightNow(weather);
                  const cloudyNight = night && !!weather.img && weather.img !== "sunny";
                  const headIcon = night ? ("/wx/" + moonImgName(new Date(), cloudyNight) + ".png") : ("/wx/" + (weather.img || "cloudy") + ".png");
                  return (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: "-0.2px", lineHeight: 1.15 }}>{timeLabel}</div>
                        <div style={{ fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.45 }}>{(locName ? locName.split(",")[0] : "Your area") + (weather && weather.updated ? " · updated " + weather.updated : ", live conditions.")}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 11, flexShrink: 0 }}>
                        <img src={headIcon} alt="" style={{ height: 58, width: "auto", display: "block" }} />
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 32, fontWeight: 800, color: C.text, lineHeight: 1 }}>{weather.temp}°</div>
                          {weather.label && <div style={{ fontSize: 12.5, color: C.light, marginTop: 3 }}>{weather.label}</div>}
                        </div>
                      </div>
                    </div>
                  );
                })()}
                {(() => { const adv = weatherAdvisory(weather); return adv ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.adim, border: `1px solid ${C.gold}`, borderRadius: 12, padding: "11px 13px", marginBottom: 14 }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{adv.icon}</span>
                    <div style={{ fontSize: 13, color: C.light, lineHeight: 1.45 }}>{adv.text}</div>
                  </div>
                ) : null; })()}
                {(() => { const t = wayfindWeatherTake(weather); if (!t || (!t.good.length && !t.avoid.length)) return null; return (
                  <div style={{ background: `linear-gradient(150deg, ${C.adim} 0%, ${C.card} 70%)`, border: `1px solid ${C.border}`, borderRadius: 14, padding: "13px 14px", marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.4px", color: C.light, textTransform: "uppercase", marginBottom: 8 }}>Wayfind take · {t.night ? "tonight" : "today"}</div>
                    {t.good.length > 0 && <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, color: C.text, lineHeight: 1.5, marginBottom: t.avoid.length ? 7 : 0 }}><span style={{ color: C.green, fontWeight: 800, flexShrink: 0 }}>Good for</span><span>{t.good.join(", ")}</span></div>}
                    {t.avoid.length > 0 && <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, color: C.text, lineHeight: 1.5 }}><span style={{ color: C.muted, fontWeight: 800, flexShrink: 0 }}>Skip</span><span>{t.avoid.join(", ")}</span></div>}
                  </div>
                ); })()}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                  {weather.feels != null && (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Feels like</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 3 }}>{weather.feels}°</div></div>)}
                  {weather.wind != null && (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Wind</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 3 }}>💨 {weather.wind} mph</div></div>)}
                  {weather.sunset && (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Sunset</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 3 }}><img src="/wx/sunset.png" alt="" style={{ height: 18, width: "auto", verticalAlign: "middle", marginRight: 4 }} />{weather.sunset}</div></div>)}
                  {weather.rain != null && (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Rain chance</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 3 }}>{weather.rain}%</div></div>)}
                  {weather.hi != null && weather.lo != null && (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>High / Low</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 3 }}>{weather.hi}° / {weather.lo}°</div></div>)}
                  {weather.humidity != null && (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Humidity</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 3 }}>{weather.humidity}%</div></div>)}
                  {weather.uv != null && (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Today's UV peak</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 3 }}>{weather.uv} · {uvLabel(weather.uv)}</div></div>)}
                  {weather.dew != null && (<div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 14px" }}><div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Dew point</div><div style={{ fontSize: 18, fontWeight: 800, color: C.text, marginTop: 3 }}>{weather.dew}°{weather.dew >= 70 ? " · muggy" : weather.dew >= 60 ? " · sticky" : " · comfy"}</div></div>)}
                  {(() => { const m = moonPhase(new Date()); return (
                    <div style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 14, background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px" }}>
                      <img src={"/wx/" + moonImgName(new Date(), false) + ".png"} alt="" style={{ height: 40, width: "auto", display: "block", flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>Tonight's moon</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginTop: 2 }}>{m.name}</div>
                        <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{m.illum}% illuminated</div>
                      </div>
                    </div>
                  ); })()}
                </div>
                <button onClick={shareWeather} style={{ width: "100%", marginTop: 16, padding: "13px 0", borderRadius: 12, border: `1.5px solid ${C.border}`, background: C.adim, color: C.light, fontSize: 14.5, fontWeight: 800, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="M8 7l4-4 4 4" /><path d="M6 12v7a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-7" /></svg>
                  {isNightNow(weather) ? "Share the weather tonight" : "Share the weather"}
                </button>
              </>
            )}
          </div>
        </div>
  );
}
