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
import { C, sheetBg, sheet, SHEET_EASE, Grabber } from "../kit";
import CollectionHero from "../CollectionHero";
import { CATEGORIES } from "../../../lib/google";
import { useContentCardActions } from "../../../lib/contentCardActions";

function playLunchCoin() {
  // Synthesized in the click gesture: no plug-in, downloaded audio, or
  // autoplay permission. Two short square-wave notes make the familiar
  // coin-sized feedback while keeping the asset bundle at zero bytes.
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const audio = new AudioCtx();
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, audio.currentTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.16);
    gain.connect(audio.destination);
    const first = audio.createOscillator();
    first.type = "square";
    first.frequency.setValueAtTime(988, audio.currentTime);
    first.frequency.setValueAtTime(1319, audio.currentTime + 0.065);
    first.connect(gain);
    first.start();
    first.stop(audio.currentTime + 0.17);
    first.onended = () => { try { audio.close(); } catch {} };
  } catch {}
}

export default function MenuSheet({ ctx }) {
  const { menuSheet, setMenuSheet, sheetDragStart, sheetDragMove, sheetDragEnd, pickCat, rollLunchPick, homeRolling, rollHistory, lunchAttemptsUsed, user, setAuthOpen, FallbackImg, INTENTS, intent, setIntent, shareLink, showToast } = ctx;
  const lunchPick = rollHistory[0] || null;
  const lunchActions = useContentCardActions(lunchPick ? {
    id: lunchPick.id,
    type: "experience",
    title: lunchPick.name,
    image: lunchPick.photo || lunchPick.restaurantPhoto || null,
    url: lunchPick.id ? `/p/${encodeURIComponent(lunchPick.id)}` : "",
    provider: "wayfind_lunch",
  } : null);
  const lunchLimit = user ? 2 : 1;
  const lunchExhausted = lunchAttemptsUsed >= lunchLimit;
  return (
        <div style={sheetBg} onClick={() => setMenuSheet(null)}>
          <div style={{ ...sheet, padding: "6px 16px 28px", overscrollBehaviorY: "contain", transition: SHEET_EASE }} onClick={(e) => e.stopPropagation()} onTouchStart={(e) => sheetDragStart(e, () => setMenuSheet(null))} onTouchMove={sheetDragMove} onTouchEnd={sheetDragEnd}>
            <Grabber />
            <div style={{ width: 36, height: 4, background: C.border, borderRadius: 2, margin: "0 auto 16px" }} />
            {menuSheet === "pick" && (
              <>
                <style dangerouslySetInnerHTML={{ __html: `
                  @keyframes wfLunchGlow{0%,100%{box-shadow:0 0 0 4px rgba(255,255,255,.72),0 0 18px 7px rgba(249,115,22,.74),0 0 42px 15px rgba(251,191,36,.35);transform:scale(1)}50%{box-shadow:0 0 0 6px #fff,0 0 28px 12px rgba(249,115,22,.98),0 0 58px 24px rgba(251,191,36,.5);transform:scale(1.055)}}
                  @keyframes wfLunchPress{0%,100%{transform:scale(1)}25%{transform:scale(.9) rotate(-3deg)}58%{transform:scale(1.12) rotate(3deg)}}
                  @keyframes wfLunchRise{0%{opacity:.15;transform:translateY(390px) rotate(-2deg) scale(.78)}68%{opacity:1;transform:translateY(-12px) rotate(.5deg) scale(1.02)}100%{opacity:1;transform:translateY(0) rotate(0) scale(1)}}
                  @keyframes wfLunchSpark{0%{opacity:0;transform:translate(-50%,-50%) scale(.3)}35%{opacity:1}100%{opacity:0;transform:translate(var(--spark-x),var(--spark-y)) scale(1.15)}}
                  @keyframes wfLunchDisclosure{0%{opacity:0;transform:translateY(8px)}100%{opacity:1;transform:translateY(0)}}
                  .wf-lunch-question:focus-visible{outline:3px solid #fff;outline-offset:7px}
                  @media(prefers-reduced-motion:reduce){.wf-lunch-question,.wf-lunch-result,.wf-lunch-spark,.wf-lunch-disclosure{animation:none!important}}
                ` }} />
                <section aria-label="Lunch in My City" style={{ position: "relative", height: "clamp(520px, 72dvh, 650px)", overflow: "hidden", borderRadius: 24, marginBottom: lunchPick ? 10 : 16, background: "#10151B", border: "1px solid rgba(251,146,60,.62)", boxShadow: "0 20px 52px rgba(0,0,0,.5), 0 0 30px rgba(249,115,22,.14)" }}>
                  <img className="wf-lunch-scene" src="/cards/lunch-in-my-city.webp" alt="Pixel art question block and Mario above a green pipe on a city wall" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 38%", filter: homeRolling ? "brightness(.72)" : "none", transition: "filter 180ms ease" }} />
                  <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(3,7,12,.74) 0%,rgba(3,7,12,.18) 28%,rgba(3,7,12,.04) 52%,rgba(3,7,12,.78) 100%)" }} />
                  <div style={{ position: "absolute", zIndex: 2, top: 18, left: 18, right: 18, color: "#fff", textShadow: "0 2px 14px rgba(0,0,0,.95)" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "1.3px", color: "#FDBA74" }}>LUNCH IN MY CITY</div>
                    <div style={{ maxWidth: 320, marginTop: 5, fontSize: 27, lineHeight: 1.05, fontWeight: 800, letterSpacing: "-.5px" }}>Your next lunch is hiding here.</div>
                  </div>
                  <button
                    type="button"
                    className="wf-lunch-question"
                    aria-label={homeRolling ? "Choosing a lunch place near you" : lunchExhausted ? "Today's lunch reveal has been used" : lunchPick ? "Reveal another lunch place near you" : "Reveal a lunch place near you"}
                    onClick={() => { playLunchCoin(); rollLunchPick(); }}
                    disabled={homeRolling || lunchExhausted}
                    style={{ position: "absolute", zIndex: 5, left: "39.5%", top: "31.5%", width: "22%", aspectRatio: "1 / 1", padding: 0, border: "none", borderRadius: 10, background: homeRolling ? "rgba(255,255,255,.32)" : "rgba(255,255,255,.06)", cursor: homeRolling ? "wait" : lunchExhausted ? "default" : "pointer", opacity: lunchExhausted ? .68 : 1, animation: homeRolling ? "wfLunchPress .55s ease-in-out infinite" : lunchExhausted ? "none" : "wfLunchGlow 1.65s ease-in-out infinite", WebkitTapHighlightColor: "transparent" }}
                  >
                    <span aria-hidden="true" style={{ position: "absolute", left: "50%", top: -34, transform: "translateX(-50%)", padding: "6px 10px", borderRadius: 999, background: lunchExhausted ? "#4B5563" : "#F97316", color: "#fff", boxShadow: "0 5px 16px rgba(0,0,0,.45)", fontSize: 12, fontWeight: 800, whiteSpace: "nowrap" }}>{homeRolling ? "Picking…" : lunchExhausted ? "Used today" : lunchPick ? "One more?" : "Tap me"}</span>
                  </button>
                  {homeRolling && [["-74px","-58px"],["84px","-34px"],["-88px","68px"],["96px","78px"]].map(([x,y], i) => <span key={i} className="wf-lunch-spark" aria-hidden="true" style={{ "--spark-x": x, "--spark-y": y, position: "absolute", zIndex: 4, left: "50%", top: "39%", width: 10, height: 10, borderRadius: 3, background: i % 2 ? "#FDBA74" : "#fff", boxShadow: "0 0 16px #F97316", animation: `wfLunchSpark .75s ease-out ${i * .08}s infinite` }} />)}
                  {!lunchPick && !homeRolling && <div style={{ position: "absolute", zIndex: 2, left: 18, right: 18, bottom: 20, padding: "14px 16px", borderRadius: 16, background: "rgba(4,8,16,.78)", border: "1px solid rgba(255,255,255,.18)", color: "#F8FAFC", textAlign: "center", backdropFilter: "blur(10px)", fontSize: 15, fontWeight: 700, lineHeight: 1.35 }}>Tap the box to accept your Lunch in My City challenge—for one standout place around you, wherever you are now.</div>}
                  {lunchPick && !homeRolling && (
                    <article key={lunchPick.id} className="wf-lunch-result" style={{ position: "absolute", zIndex: 6, left: 16, right: 16, bottom: 18, width: "calc(100% - 32px)", overflow: "hidden", borderRadius: 10, border: "6px solid #F8D447", background: "#5C8FEA", color: "#fff", boxShadow: "8px 8px 0 rgba(8,25,62,.78),0 20px 42px rgba(0,0,0,.55)", transformOrigin: "center bottom", animation: "wfLunchRise 1s cubic-bezier(.16,.88,.26,1.08) both" }}>
                      <FallbackImg src={lunchPick.photo || (lunchPick.photoRef ? "/api/photo?ref=" + encodeURIComponent(lunchPick.photoRef) + "&w=800" : null)} fallbackSrc={lunchPick.restaurantPhoto || null} icon="🍽️" style={{ width: "100%", height: 156, borderRadius: 0, objectFit: "cover", background: "#E8DED0" }} />
                      <div style={{ padding: "13px 15px 15px", borderTop: "5px solid #F8D447", background: "linear-gradient(180deg,#173979,#0B214D)" }}>
                        <div style={{ fontSize: 21, lineHeight: 1.05, fontWeight: 900, letterSpacing: "-.3px" }}>{lunchPick.name}</div>
                        <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.35, fontWeight: 700, color: "#FFF5C2" }}><span style={{ color: "#F8D447" }}>Must try:</span> {lunchPick.mustTry}</div>
                        <div className="wf-lunch-card-actions" style={{ display: "grid", gridTemplateColumns: "minmax(78px,1fr) 42px 42px minmax(78px,1fr)", gap: 7, marginTop: 12 }}>
                          <button type="button" aria-pressed={lunchActions.saved} onClick={(e) => { e.stopPropagation(); lunchActions.toggleSave(); }} style={{ minHeight: 40, border: "1px solid rgba(255,255,255,.34)", borderRadius: 9, background: lunchActions.saved ? "#F8D447" : "rgba(3,12,32,.48)", color: lunchActions.saved ? "#10151B" : "#fff", fontSize: 12, fontWeight: 850, cursor: "pointer" }}>{lunchActions.saved ? "♥ Saved" : "♡ Save"}</button>
                          <button type="button" aria-label={`Like ${lunchPick.name}`} aria-pressed={lunchActions.liked} onClick={(e) => { e.stopPropagation(); lunchActions.toggleLike(); }} style={{ minHeight: 40, border: "1px solid rgba(255,255,255,.34)", borderRadius: 9, background: lunchActions.liked ? "#F8D447" : "rgba(3,12,32,.48)", color: lunchActions.liked ? "#10151B" : "#fff", fontSize: 17, fontWeight: 900, cursor: "pointer" }}>↑</button>
                          <button type="button" aria-label={`Not for me: ${lunchPick.name}`} aria-pressed={lunchActions.disliked} onClick={(e) => { e.stopPropagation(); lunchActions.toggleDislike(); }} style={{ minHeight: 40, border: "1px solid rgba(255,255,255,.34)", borderRadius: 9, background: lunchActions.disliked ? "#F8D447" : "rgba(3,12,32,.48)", color: lunchActions.disliked ? "#10151B" : "#fff", fontSize: 17, fontWeight: 900, cursor: "pointer" }}>↓</button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); lunchActions.share(); }} style={{ minHeight: 40, border: "1px solid rgba(255,255,255,.34)", borderRadius: 9, background: "rgba(3,12,32,.48)", color: "#fff", fontSize: 12, fontWeight: 850, cursor: "pointer" }}>↗ Share</button>
                        </div>
                      </div>
                    </article>
                  )}
                </section>
                {lunchPick && <div key={`disclosure-${lunchPick.id}`} className="wf-lunch-disclosure" style={{ padding: "12px 14px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.muted, fontSize: 12.5, lineHeight: 1.4, animation: "wfLunchDisclosure .25s ease 2.8s both" }}>
                  {user
                    ? lunchAttemptsUsed >= 2 ? "You've used both lunch reveals for today. A new pick unlocks tomorrow." : "You have one lunch reveal left today."
                    : <>That was today&apos;s guest reveal. <button type="button" onClick={() => { setMenuSheet(null); setAuthOpen(true); }} style={{ padding: 0, border: 0, background: "transparent", color: C.light, font: "inherit", fontWeight: 800, textDecoration: "underline", cursor: "pointer" }}>Sign in for one more lunch pick today.</button></>}
                </div>}
                {lunchPick && <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, marginTop: 10 }}>
                  <button type="button" onClick={() => {
                    const url = typeof window !== "undefined" ? window.location.origin + "/?go=lunch" : "https://www.gowayfind.com/?go=lunch";
                    shareLink("Lunch in My City — Wayfind", url, () => showToast("Challenge link copied"), `I got ${lunchPick.name}. Tap the question block and see where Wayfind sends you for lunch.`);
                  }} style={{ minHeight: 46, padding: "0 16px", borderRadius: 12, border: "1px solid rgba(249,115,22,.55)", background: "linear-gradient(135deg,#F97316,#FB923C)", color: "#10151B", fontSize: 14, fontWeight: 900, cursor: "pointer" }}>↗ Challenge a friend</button>
                  <button type="button" onClick={() => setMenuSheet(null)} style={{ minHeight: 46, padding: "0 18px", borderRadius: 12, border: `1px solid ${C.border}`, background: C.card, color: C.text, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Close</button>
                </div>}
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
