"use client";
// Extracted from app/home.js (G2, July 2026 decomposition). Render-only.
// TWO sub-states: pick (Wayfind Roulette) and experiences (the Occasions
// chooser). There were six. The other four — menu, community, explore, weather —
// were UNREACHABLE: nothing ever set menuSheet to any of those values, so 208
// lines of sheet rendered for nobody. Deleted 2026-07-29.
//
// Read this before adding a fifth: `menuSheet` is only written by
// setMenuSheet("pick") in app/home.js and setMenuSheet("experiences") in this
// file. A new sub-state needs a write that is ITSELF reachable — the "menu"
// block held the only setter for "experiences", which is how a live-looking
// entry point turned out to open nothing.
import { C, sheetBg, sheet, SHEET_EASE, Grabber, PlaceScoreChip } from "../kit";
import CollectionHero from "../CollectionHero";
import { CATEGORIES } from "../../../lib/google";

export default function MenuSheet({ ctx }) {
  const { menuSheet, setMenuSheet, sheetDragStart, sheetDragMove, sheetDragEnd, pickCat, suggested, places, openDetail, rollHomePick, homeRolling, homeDiceFace, rollHistory, FallbackImg, INTENTS, intent, setIntent } = ctx;
  return (
        <div style={sheetBg} onClick={() => setMenuSheet(null)}>
          <div style={{ ...sheet, padding: "6px 16px 28px", overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setMenuSheet(null))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 16px" }} />
            {menuSheet === "pick" && (
              <>
                <style dangerouslySetInnerHTML={{ __html: "@keyframes wfRouletteFloat{0%,100%{transform:translateY(0) rotate(-9deg)}50%{transform:translateY(-7px) rotate(7deg)}}@keyframes wfRouletteGlow{0%,100%{opacity:.42;transform:scale(.92)}50%{opacity:1;transform:scale(1.08)}}@keyframes wfRouletteSpin{to{transform:rotate(360deg)}}" }} />
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
                      {homeRolling ? <span style={{ position: "relative", zIndex: 1, color: "#fff", fontSize: 41, lineHeight: 1, animation: "wfroll .48s linear infinite" }}>{homeDiceFace}</span> : <span aria-hidden="true" style={{ position: "relative", zIndex: 1, width: 48, height: 48, borderRadius: 14, background: "linear-gradient(145deg, #F8FAFC, #B9C3D0)", boxShadow: "inset 0 1px 0 #fff, 0 7px 14px rgba(0,0,0,.26)", transform: "rotate(-9deg)", animation: "wfRouletteFloat 3.6s ease-in-out infinite", display: "block" }}><i style={{ position: "absolute", width: 7, height: 7, borderRadius: "50%", background: "#18202C", left: 10, top: 10 }} /><i style={{ position: "absolute", width: 7, height: 7, borderRadius: "50%", background: "#18202C", right: 10, top: 10 }} /><i style={{ position: "absolute", width: 7, height: 7, borderRadius: "50%", background: "#F97316", left: 20.5, top: 20.5 }} /><i style={{ position: "absolute", width: 7, height: 7, borderRadius: "50%", background: "#18202C", left: 10, bottom: 10 }} /><i style={{ position: "absolute", width: 7, height: 7, borderRadius: "50%", background: "#18202C", right: 10, bottom: 10 }} /></span>}
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
                {/* v6.75: the last surface still wearing the old sheet chrome
                    (icon tile + 22px title) now wears the SAME CollectionHero the
                    experience screen, the single-pick screen and every standalone
                    collection route wear — one hero, so "the Wayfind look" means
                    one thing.
                    Sheet-specific geometry, and why each value: no negative TOP
                    bleed because the grabber owns the sheet's top edge, so the
                    hero starts below it; -16px sides to escape the sheet's 16px
                    padding and reach the full width; radius 0 for the same reason
                    (the sheet already rounds its own top corners above the
                    grabber); 176px rather than the 278px the screens use — a
                    sheet must leave room for the grid it is introducing, and the
                    content block is bottom-anchored, so a taller box on a
                    photo-less hero is just void above the eyebrow (208px left
                    ~60px of it).
                    No heroImg: there is no art for "Occasions", and CollectionHero
                    renders the scrim alone as a deliberate dark title block. The
                    ✨ survives in the eyebrow, so nothing is lost in the move.
                    CONTENT IS UNCHANGED — same INTENTS tiles, same Surprise Me
                    tile, same copy. Swapping the tile set to EXPERIENCES is a
                    product decision, not a styling one. */}
                <CollectionHero
                  wordmark={false}
                  height={176}
                  bleed="0 -16px 16px"
                  radius={0}
                  accent={C.gold}
                  eyebrow="✨ Shape the feed"
                  titleTop="Occasions"
                  subtitle="Pick an occasion and the feed reshapes around it."
                />
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
          </div>
        </div>
  );
}
