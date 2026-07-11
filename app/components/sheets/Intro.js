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
import { C, useDialogFocus } from "../kit";

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
  useDialogFocus(introOpen, introDlgRef, () => { try { sessionStorage.setItem("wf_intro_seen", "1"); } catch (e) {} setIntroOpen(false); });
  return (
        <div style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(5,7,14,.78)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "30px 16px", overflowY: "auto" }} onClick={() => { try { sessionStorage.setItem("wf_intro_seen", "1"); } catch (e) {} setIntroOpen(false); }}>
          {/* v4.80: livelier breathing — wider swing between soft and bright, and
              the border warms with the glow so the whole frame feels lit.
              v5.25 premium concierge: soft radial halo behind a frosted-glass
              card, a scale-and-fade entrance instead of a hard cut, and the six
              adaptive mood tiles (the ONLY home of the mood picker — the inline
              home-screen row is gone by design). */}
          <style>{"@keyframes wfIntroGlow{0%,100%{box-shadow:0 30px 90px rgba(0,0,0,.65),0 0 14px rgba(255,138,61,.28),0 0 45px rgba(249,115,22,.14);border-color:rgba(255,138,61,.4)}50%{box-shadow:0 30px 90px rgba(0,0,0,.65),0 0 38px rgba(255,138,61,.8),0 0 120px rgba(249,115,22,.5);border-color:rgba(255,178,110,.9)}}@keyframes wfIntroIn{from{opacity:0;transform:scale(.94) translateY(14px)}to{opacity:1;transform:scale(1) translateY(0)}}@keyframes wfHalo{0%,100%{opacity:.5}50%{opacity:.95}}.wf-mood-tile{transition:transform .18s ease,border-color .18s ease,background .18s ease}.wf-mood-tile:hover{transform:translateY(-2px) scale(1.02)}.wf-mood-tile:active{transform:scale(.96)}@media (prefers-reduced-motion: reduce){.wf-intro-pop,.wf-intro-halo{animation:none !important}.wf-mood-tile{transition:none}}"}</style>
          <div className="wf-intro-halo" aria-hidden="true" style={{ position: "absolute", width: 560, height: 560, borderRadius: "50%", background: "radial-gradient(circle, rgba(249,115,22,.30) 0%, rgba(249,115,22,.12) 42%, transparent 68%)", filter: "blur(34px)", pointerEvents: "none", animation: "wfHalo 2.8s ease-in-out infinite" }} />
          <div ref={introDlgRef} role="dialog" aria-modal="true" aria-label="Welcome to Wayfind — what are you in the mood for?" tabIndex={-1} onClick={(e) => e.stopPropagation()} className="wf-intro-pop" style={{ outline: "none", position: "relative", width: "100%", maxWidth: 440, maxHeight: "82vh", overflowY: "auto", borderRadius: 24, padding: "12px 16px 16px", background: "linear-gradient(165deg, rgba(22,26,42,.90) 0%, rgba(11,14,23,.86) 60%)", backdropFilter: "blur(22px) saturate(1.4)", WebkitBackdropFilter: "blur(22px) saturate(1.4)", border: "1.5px solid rgba(255,138,61,.55)", boxShadow: "0 30px 90px rgba(0,0,0,.65), 0 0 22px rgba(255,138,61,.45), 0 0 70px rgba(249,115,22,.25)", animation: "wfIntroIn .5s cubic-bezier(.16,1,.3,1) both", boxShadow: "0 30px 90px rgba(0,0,0,.65), 0 0 38px rgba(255,138,61,.6), 0 0 90px rgba(249,115,22,.3)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
              <button onClick={() => { try { sessionStorage.setItem("wf_intro_seen", "1"); } catch (e) {} setIntroOpen(false); }} aria-label="Close" style={{ width: 34, height: 34, borderRadius: 999, background: "rgba(255,255,255,.14)", border: "1.5px solid rgba(255,255,255,.45)", color: "#FFFFFF", fontSize: 16, fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{"\u2715"}</button>
            </div>
            <div style={{ textAlign: "center", fontSize: 24, fontWeight: 800, color: "#F4F6FC", lineHeight: 1.18, marginTop: 8 }}>Find the right place.<br />For the <span style={{ background: "linear-gradient(90deg, #FF8A3D, #E8B84B)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>right moment.</span></div>
            <div style={{ textAlign: "center", marginTop: 7 }}><IntroIcon k="spark" size={21} color="#FFC28A" /></div>
            {/* v5.25 concierge greeting — personalization (name/time/weather),
                real abundance (live open-now count, never invented), and an
                easy out. Every claim in it is computed from live data. */}
            <div style={{ textAlign: "center", fontSize: 13.5, color: "#B6BCD0", lineHeight: 1.55, margin: "8px auto 12px", maxWidth: 360 }}>{(() => { try {
              const h = new Date().getHours();
              const gm = user && user.user_metadata && (user.user_metadata.full_name || user.user_metadata.name);
              const first = gm ? String(gm).trim().split(/\s+/)[0] : "";
              const g = (h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening") + (first ? ", " + first : "") + " \ud83d\udc4b";
              const town = locName ? locName.split(",")[0] : "your area";
              let w = "";
              if (weather && typeof weather.temp === "number") {
                // v5.26: the greeting speaks in what it FEELS like — a Florida
                // 92° with a 103° heat index greets as 103°. When feels-like
                // meaningfully differs from the thermometer, say so explicitly.
                const felt = weather.feels != null ? weather.feels : weather.temp;
                const diff = weather.feels != null && Math.abs(weather.feels - weather.temp) >= 3;
                const rainy = weather.wet || /rain|storm|shower/i.test(weather.label || "");
                w = rainy ? " Rain out there — the perfect excuse for a cozy find in " + town + "."
                  : felt >= 99 ? (diff ? " It's " + weather.temp + "° but feels like " + felt + "° — cool, easy picks are winning today." : " It's a steamy " + felt + "° — cool, easy picks are winning today.")
                  : felt >= 60 ? (diff ? " It feels like a gorgeous " + felt + "° out — a great moment to be out in " + town + "." : " It's a gorgeous " + felt + "° — a great moment to be out in " + town + ".")
                  : (diff ? " It feels like a crisp " + felt + "° in " + town + " — perfect for finding somewhere warm and good." : " A crisp " + felt + "° in " + town + " — perfect for finding somewhere warm and good.");
              }
              const openN = (suggested || []).filter((p) => liveOpen(p) === true).length;
              const alive = openN >= 3 ? " " + openN + " great spots are open near you right now." : "";
              return g + w + alive;
            } catch (e) { return "Wayfind turns how you feel into the best places near you."; } })()}</div>
            <div style={{ display: "flex", justifyContent: "center", margin: "0 0 10px" }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 999, border: "1.5px solid rgba(255,138,61,.5)", background: "rgba(255,138,61,.08)" }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#F4F6FC", textAlign: "center" }}>What are you in the mood for?</span>
              </div>
            </div>
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 9 }}>
                  {order.map((k) => { const ex = EXPERIENCES[k]; if (!ex) return null; const on = introSel[0] === k; return (
                    <button key={k} className="wf-mood-tile" onClick={() => { setIntroSel(on ? [] : [k]); try { logEvent("mood_tile", null, { mood: k, src: "intro", adaptive: k === "cozyindoor" || k === "brunch" ? 1 : 0 }); } catch (e) {} }} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 7, textAlign: "center", padding: "16px 10px 13px", borderRadius: 16, border: `1.5px solid ${on ? "#FF8A3D" : "rgba(255,255,255,.13)"}`, background: on ? "linear-gradient(150deg, rgba(255,138,61,.24) 0%, rgba(255,138,61,.10) 100%)" : "linear-gradient(150deg, rgba(255,255,255,.06) 0%, rgba(255,255,255,.015) 100%)", color: "#E8EAF2", fontSize: 13.5, fontWeight: 700, cursor: "pointer", lineHeight: 1.25 }}>
                      <span style={{ fontSize: 25 }}>{(MOOD_LBL[k] || [ex.icon])[0]}</span><span>{(MOOD_LBL[k] || [null, ex.label])[1]}</span>
                    </button>
                  ); })}
                </div>
              );
            } catch (e) { return null; } })()}
            <button onClick={() => { if (!introSel.length) return; try { sessionStorage.setItem("wf_intro_seen", "1"); } catch (e) {} setIntroOpen(false); openExperience(introSel[0]); }} disabled={!introSel.length} style={{ width: "100%", marginTop: 12, padding: "13px 10px", borderRadius: 15, border: "none", background: "linear-gradient(90deg, #F97316 0%, #FF8A3D 55%, #E8B84B 100%)", color: "#FFFFFF", fontSize: 15.5, fontWeight: 800, cursor: introSel.length ? "pointer" : "default", opacity: introSel.length ? 1 : 0.55, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 9, boxShadow: "0 0 18px rgba(255,138,61,.55), 0 8px 30px rgba(249,115,22,.45)" }}><IntroIcon k="wand" size={19} color="#FFFFFF" />Let's Wayfind it</button>
            <div onClick={() => { try { sessionStorage.setItem("wf_intro_seen", "1"); } catch (e) {} setIntroOpen(false); }} style={{ textAlign: "center", fontSize: 12.5, color: "#AEB4C8", marginTop: 12, cursor: "pointer" }}>Just let me look around</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 9, fontSize: 10.5, color: "#8B90A5" }}><IntroIcon k="shield" size={13} color="#8B90A5" />Rankings are merit-based. Affiliate links never change placement.</div>
          </div>
        </div>
  );
}
