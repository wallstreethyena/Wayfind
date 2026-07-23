"use client";
// Extracted from app/home.js (G4, July 2026 decomposition). Render-only,
// with one exception: this component owns its own focus-trap. useDialogFocus
// needs a ref to DOM that exists the moment its effect runs — since this
// whole component is itself the next/dynamic({ssr:false}) boundary, calling
// the hook here (not in PageInner) means the ref and the effect mount
// together, unlike the old wiring where PageInner's copy of the hook could
// fire before this lazy chunk had rendered anything into the ref.
// IntroIcon + its INTRO_PATHS data table are exclusive to this overlay.
// The 3.2s auto-show timer stays in PageInner (it's a useEffect); it just
// flips introOpen, which arrives here as a normal ctx value.
import { useRef } from "react";
import { C, useDialogFocus, Icon } from "../kit";

// Premium redesign, Phase 4: the mood tiles draw from the app's one line-icon
// language instead of an emoji grid, calmer and on-brand.
const MOOD_ICON = { outdoors: "leaf", cozyindoor: "cloudrain", datenight: "heart", nightout: "glass", eatnow: "utensils", brunch: "utensils", hiddengems: "gem", familyfun: "users" };

// Welcome imagery is editorial, never ad placement. Evergreen scenes change
// weekly; a seasonal scene can take the lead during a meaningful travel window.
const INTRO_VISUAL_LIBRARY = {
  evergreen: [
    "/brand/wayfind-welcome-wynwood-v3.png",
    "/brand/wayfind-welcome-local-plan-v2.png",
  ],
  seasonal: [
    { startsOn: "2026-07-22", endsOn: "2026-09-08", src: "/brand/wayfind-welcome-labor-day-south-beach-v2.png" },
  ],
};

function introVisualForDate(now = new Date()) {
  const dateKey = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  const seasonal = INTRO_VISUAL_LIBRARY.seasonal.find((item) => dateKey >= item.startsOn && dateKey <= item.endsOn);
  if (seasonal) return seasonal.src;
  const week = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 604800000);
  return INTRO_VISUAL_LIBRARY.evergreen[week % INTRO_VISUAL_LIBRARY.evergreen.length];
}

const INTRO_PATHS = {
  family: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7 1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3.5 19c0-2.8 2.5-4.6 5.5-4.6s5.5 1.8 5.5 4.6M14.8 15c2.4.2 4.7 1.7 4.7 4",
  date: "M12 20s-7-4.4-9.2-8.6C1.2 8.3 3.2 5 6.4 5c2 0 3.4 1.1 4.1 2.4l1.5 2.4 1.5-2.4C14.2 6.1 15.6 5 17.6 5c3.2 0 5.2 3.3 3.6 6.4C19 15.6 12 20 12 20Z",
  friends: "M8.5 10.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.5 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.5 19.5c0-2.7 2.7-4.5 6-4.5 1.7 0 3.2.5 4.2 1.3M15 15.1c3.1.1 5.5 1.9 5.5 4.4",
  twohrs: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3.2 2",
  outside: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-14v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10-1.4 1.4",
  locals: "M6 3h12l3 5-9 13L3 8l3-5Zm-3 5h18M9.5 3 8 8l4 13m2.5-18L16 8l-4 13",
  drive: "M5 12l1.6-4.2A2 2 0 0 1 8.5 6.5h7a2 2 0 0 1 1.9 1.3L19 12M5 12h14M5 12a2 2 0 0 0-2 2v3.5h2M19 12a2 2 0 0 1 2 2v3.5h-2m-14 0V19a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.5m8 0V19a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1.5m-11 0h8M7.5 14.8h.01m9 0h.01",
  fifty: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm2.6-11.6c-.4-.9-1.4-1.5-2.6-1.5-1.6 0-2.8.9-2.8 2.1s1 1.7 2.8 2c1.9.3 3 .9 3 2.2 0 1.3-1.3 2.2-3 2.2-1.4 0-2.5-.7-2.9-1.7M12 6.5v11",
  surprise: "M12 3l1.7 4.6L18 9l-4.3 1.4L12 15l-1.7-4.6L6 9l4.3-1.4L12 3Zm6.5 9 .9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9.9-2.3ZM5 14.5l.7 1.9 1.9.7-1.9.7L5 19.7l-.7-1.9-1.9-.7 1.9-.7.7-1.9Z",
  visitors: "M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7m-9.5 0h11A1.5 1.5 0 0 1 19 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 17.5v-9A1.5 1.5 0 0 1 6.5 7ZM9 11v4m6-4v4",
  rainy: "M7 15a4.5 4.5 0 0 1-.9-8.9A5.5 5.5 0 0 1 16.7 7 4 4 0 0 1 17 15H7Zm1.5 3-.8 2.2m4.3-2.2-.8 2.2m4.3-2.2-.8 2.2",
  wand: "M6 21 17.5 9.5M15 4l.8 2.2L18 7l-2.2.8L15 10l-.8-2.2L12 7l2.2-.8L15 4Zm5.5 5 .5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5.5-1.4ZM8 3.5l.5 1.3 1.3.5-1.3.5L8 7.1l-.5-1.3-1.3-.5 1.3-.5.5-1.3Z",
  pin: "M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  spark: "M12 2l2 5.5L19.5 9 14 11l-2 5.5L10 11 4.5 9 10 7.5 12 2Zm7 11 .9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4Z",
  shield: "M12 3l7 2.8v5.4c0 4.5-3 8.1-7 9.8-4-1.7-7-5.3-7-9.8V5.8L12 3Zm-2.5 8.6 1.8 1.9 3.4-3.7",
};
function IntroIcon({ k, size = 22, color = "#FF8A3D" }) {
  const d = INTRO_PATHS[k]; if (!d) return null;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d={d} /></svg>;
}

export default function IntroSheet({ ctx }) {
  const { introOpen, setIntroOpen, introSel, setIntroSel, user, locName, weather, suggested, liveOpen, EXPERIENCES, logEvent, openExperience } = ctx;
  const introDlgRef = useRef(null);
  const introVisual = introVisualForDate();
  useDialogFocus(introOpen, introDlgRef, () => { try { sessionStorage.setItem("wf_intro_seen", "1"); } catch (e) {} setIntroOpen(false); });
  return (
        <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(5,7,14,.78)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "30px 16px", overflowY: "auto" }} onClick={() => { try { sessionStorage.setItem("wf_intro_seen", "1"); } catch (e) {} setIntroOpen(false); }}>
          <style>{`@keyframes wfIntroIn{from{opacity:0;transform:scale(.975) translateY(14px)}to{opacity:1;transform:scale(1) translateY(0)}}@keyframes wfIntroTileIn{from{opacity:0;transform:translateY(9px)}to{opacity:1;transform:translateY(0)}}@keyframes wfLogoPinGlow{0%,100%{opacity:.26;transform:scale(.88)}50%{opacity:.58;transform:scale(1.12)}}.wf-intro-pop{isolation:isolate}.wf-logo-pin-glow{animation:wfLogoPinGlow 3.8s ease-in-out infinite}.wf-mood-tile{transition:transform .2s ease,border-color .2s ease,background .2s ease,box-shadow .2s ease}.wf-mood-tile:hover{transform:translateY(-2px);border-color:rgba(255,175,105,.92)!important;box-shadow:0 9px 18px rgba(0,0,0,.19)}.wf-mood-tile:active{transform:translateY(0) scale(.98)}.wf-intro-cta{transition:transform .2s ease,filter .2s ease}.wf-intro-cta:not(:disabled):hover{transform:translateY(-1px);filter:brightness(1.04)}.wf-intro-cta:not(:disabled):active{transform:translateY(0) scale(.99)}.wf-mood-tile:focus-visible,.wf-intro-cta:focus-visible{outline:2px solid #FFB56F;outline-offset:2px}@media (prefers-reduced-motion:reduce){.wf-intro-pop,.wf-logo-pin-glow,.wf-mood-tile,.wf-intro-cta{animation:none !important;transition:none!important}}`}</style>
          <div ref={introDlgRef} role="dialog" aria-modal="true" aria-label="Welcome to Wayfind — choose a local experience" tabIndex={-1} onClick={(e) => e.stopPropagation()} className="wf-intro-pop" style={{ outline: "none", position: "relative", zIndex: 1, width: "100%", maxWidth: 383, maxHeight: "88vh", overflowY: "auto", borderRadius: 26, padding: 0, background: "#080B10", border: "1px solid #2B3441", boxShadow: "0 32px 80px rgba(0,0,0,.72)", animation: "wfIntroIn .46s cubic-bezier(.16,1,.3,1) both" }}>
            <img aria-hidden="true" src={introVisual} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center center", pointerEvents: "none" }} />
            <div aria-hidden="true" style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg,rgba(5,8,13,.68) 0%,rgba(5,8,13,.46) 34%,rgba(5,8,13,.58) 64%,rgba(5,8,13,.68) 100%)" }} />
            <button onClick={() => { try { sessionStorage.setItem("wf_intro_seen", "1"); } catch (e) {} setIntroOpen(false); }} aria-label="Close" style={{ position: "absolute", zIndex: 3, right: 14, top: 14, width: 38, height: 38, borderRadius: 999, background: "rgba(8,11,16,.68)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,.18)", color: "#F5F7FA", fontSize: 16, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{"\u2715"}</button>
            <div style={{ position: "relative", zIndex: 1, padding: "30px 18px 11px" }}>
              <div aria-hidden="true" style={{ position: "absolute", inset: "0 0 -24px", pointerEvents: "none", background: "linear-gradient(180deg,rgba(2,5,9,.66) 0%,rgba(2,5,9,.42) 58%,rgba(2,5,9,0) 100%)" }} />
              <div style={{ position: "relative", width: 195, height: 71 }}><div style={{ position: "absolute", zIndex: 1, left: 0, top: 0, width: 145, height: 71, overflow: "hidden" }}><img src="/brand/wayfind-logo-header-transparent.png" alt="Wayfind" style={{ position: "absolute", top: -7, left: -16, display: "block", width: 214, height: "auto" }} /></div><div className="wf-logo-pin-glow" aria-hidden="true" style={{ position: "absolute", zIndex: 0, left: 150, top: 17, width: 35, height: 35, borderRadius: "50%", background: "radial-gradient(circle,rgba(255,124,34,.62),rgba(255,124,34,0) 68%)", filter: "blur(3px)", pointerEvents: "none" }} /><img src="/brand/wayfind-pin-transparent.png" aria-hidden="true" alt="" style={{ position: "absolute", zIndex: 1, left: 142, top: 0, display: "block", width: 50, height: 70 }} /></div>
              <div style={{ position: "relative", fontSize: 29, fontWeight: 850, letterSpacing: "-.045em", color: "#FFFFFF", lineHeight: 1.06, textShadow: "0 2px 12px rgba(0,0,0,.7)", marginTop: 15 }}>Your best next plan,<br />without the work.</div>
              <div style={{ position: "relative", marginTop: 9, maxWidth: 350, color: "#FFFFFF", fontSize: 13.5, lineHeight: 1.42, fontWeight: 650, textShadow: "0 1px 8px rgba(0,0,0,.72)" }}>Tell Wayfind what sounds good. We do the research and bring back places worth your time—nearby now or wherever you go.</div>
            </div>
            <div style={{ position: "relative", zIndex: 1, padding: "10px 18px 16px", marginTop: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", marginTop: 12, marginBottom: 10 }}><div style={{ fontSize: 14.5, fontWeight: 800, color: "#F4F6FC" }}>What sounds good right now?</div></div>
            {/* v5.25: the six adaptive mood tiles ARE the moment picker — same
                adaptive rules the home row used: evenings lead with Date Night
                and Night Out, bad weather swaps Outside for Cozy Indoor, weekend
                mornings swap Where to Eat for Brunch. Every tile fires the full
                moment engine (structured ranking + cached LLM why-lines). */}
            {(() => { try {
              const _h = new Date().getHours(); const _d = new Date().getDay();
              const _eve = _h >= 16 || _h < 4;
              const _wkndMorn = (_d === 0 || _d === 6) && _h >= 6 && _h < 13;
              // "Too hot" is what it FEELS like, not the thermometer: a Florida
              // 91° with a 104° heat index is not an Outside afternoon.
              const _felt = weather ? (weather.feels != null ? weather.feels : weather.temp) : null;
              const _bad = !!(weather && (weather.wet || (weather.rain != null && weather.rain >= 55) || /storm|rain|shower/i.test(weather.label || "") || (_felt != null && (_felt >= 99 || _felt <= 40))));
              const outsideKey = _bad ? "cozyindoor" : "outdoors";
              const eatKey = _wkndMorn ? "brunch" : "eatnow";
              const MOOD_LBL = { outdoors: ["\u2600\ufe0f", "Outside"], cozyindoor: ["\ud83c\udf27\ufe0f", "Cozy Indoor"], datenight: ["\ud83c\udf39", "Date Night"], nightout: ["\ud83c\udf78", "Night Out"], eatnow: ["\ud83c\udf7d\ufe0f", "Where to Eat"], brunch: ["\ud83e\udd5e", "Brunch"], hiddengems: ["\ud83d\udc8e", "Hidden Gems"], familyfun: ["\ud83d\udc68\u200d\ud83d\udc69\u200d\ud83d\udc67", "Family Fun"] };
              const order = _eve ? ["datenight", "nightout", eatKey, "hiddengems", outsideKey, "familyfun"] : [eatKey, outsideKey, "hiddengems", "familyfun", "datenight", "nightout"];
              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, marginBottom: 12 }}>
                  {order.map((k, i) => { const ex = EXPERIENCES[k]; if (!ex) return null; const on = introSel[0] === k; return (
                    <button key={k} className="wf-mood-tile" onClick={() => { setIntroSel(on ? [] : [k]); try { logEvent("mood_tile", null, { mood: k, src: "intro", adaptive: k === "cozyindoor" || k === "brunch" ? 1 : 0 }); } catch (e) {} }} style={{ animation: `wfIntroTileIn .38s cubic-bezier(.16,1,.3,1) ${90 + i * 45}ms both`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7, textAlign: "center", padding: "11px 6px 10px", borderRadius: 15, border: `1px solid ${on ? "#FF9A50" : "rgba(225,232,243,.19)"}`, background: "rgba(7,12,20,.76)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", boxShadow: on ? "inset 0 0 0 1px rgba(255,166,94,.16),0 8px 18px rgba(0,0,0,.18)" : "inset 0 1px 0 rgba(255,255,255,.06)", color: "#F1F3F8", fontSize: 12, fontWeight: 750, cursor: "pointer", lineHeight: 1.2, minHeight: 74 }}>
                      <Icon name={MOOD_ICON[k] || "pin"} size={25} color={on ? "#FFB36E" : "#D7DEEA"} strokeWidth={1.8} /><span>{(MOOD_LBL[k] || [null, ex.label])[1]}</span>
                    </button>
                  ); })}
                </div>
              );
            } catch (e) { return null; } })()}
            <button className="wf-intro-cta" onClick={() => { if (!introSel.length) return; try { sessionStorage.setItem("wf_intro_seen", "1"); } catch (e) {} setIntroOpen(false); openExperience(introSel[0]); }} disabled={!introSel.length} style={{ width: "100%", marginTop: 10, minHeight: 57, padding: "13px 18px", borderRadius: 17, border: `1px solid ${introSel.length ? "rgba(255,168,90,.88)" : "rgba(231,238,248,.25)"}`, background: introSel.length ? "linear-gradient(135deg,#20232B 0%,#12161D 100%)" : "linear-gradient(135deg,rgba(19,27,40,.94),rgba(8,12,20,.92))", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", color: introSel.length ? "#FFF7EF" : "#E6EBF3", boxShadow: introSel.length ? "inset 0 1px 0 rgba(255,255,255,.12),inset 0 -1px 0 rgba(0,0,0,.42),0 16px 28px rgba(0,0,0,.30),0 5px 18px rgba(249,115,22,.14)" : "inset 0 1px 0 rgba(255,255,255,.09),inset 0 -1px 0 rgba(0,0,0,.32),0 12px 24px rgba(0,0,0,.22)", fontSize: 15.5, fontWeight: 850, letterSpacing: "-.012em", cursor: introSel.length ? "pointer" : "default", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10 }}>Find my next favorite place<span style={{ marginLeft: 7, fontSize: 21, fontWeight: 500, lineHeight: 0, color: introSel.length ? "#FFB575" : "#E6EBF3" }}>→</span></button>
            <div style={{ minHeight: 42, marginTop: 5, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontSize: 13, color: "#D5DBE5", fontWeight: 650 }}>We’ll do the work.</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 5, fontSize: 10.5, color: "#9AA5B7" }}><IntroIcon k="shield" size={13} color="#9AA5B7" />No paid placement. Just places worth your time.</div>
            </div>
          </div>
        </div>
  );
}
