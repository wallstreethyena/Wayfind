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

// A destination-led editorial scene makes the welcome feel like the beginning
// of a night out, not a generic onboarding panel.
const INTRO_VISUAL = "/brand/wayfind-welcome-local-discovery-v1.png";

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
  const introLocation = String(locName || "").replace(/\s*,\s*/g, ", ").trim();
  const dismissIntro = () => {
    try { sessionStorage.setItem("wf_intro_seen", "1"); } catch (e) {}
    setIntroOpen(false);
  };
  useDialogFocus(introOpen, introDlgRef, dismissIntro);
  return (
        <div className="wf-intro-backdrop" onClick={dismissIntro}>
          <style dangerouslySetInnerHTML={{ __html: `
            @keyframes wfIntroIn{from{opacity:0;transform:scale(.985) translateY(18px)}to{opacity:1;transform:scale(1) translateY(0)}}
            @keyframes wfIntroTileIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
            .wf-intro-backdrop{position:fixed;inset:0;z-index:90;background:rgba(5,15,23,.64);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:24px;overflow-y:auto}
            .wf-intro-pop{--wf-intro-text:${C.text};--wf-intro-muted:${C.muted};--wf-intro-light:${C.light};--wf-intro-accent:${C.accent};--wf-intro-ink:#111824;--wf-intro-border:${C.border};isolation:isolate;outline:none;position:relative;z-index:1;width:100%;max-width:960px;max-height:calc(100dvh - 48px);display:grid;grid-template-columns:minmax(0,.9fr) minmax(470px,1.1fr);overflow:hidden;border-radius:36px;background:#F7F3EA;border:1px solid rgba(255,255,255,.74);box-shadow:0 46px 120px rgba(3,13,20,.46),0 4px 16px rgba(3,13,20,.16);animation:wfIntroIn .48s cubic-bezier(.16,1,.3,1) both}
            .wf-intro-visual{position:relative;min-height:604px;overflow:hidden;background:${C.bg}}
            .wf-intro-visual>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:47% center}
            .wf-intro-visual:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,16,24,.08) 20%,rgba(5,16,24,.24) 54%,rgba(5,16,24,.88) 100%)}
            .wf-intro-brand{position:absolute;z-index:1;left:32px;top:28px;width:142px;height:48px}
            .wf-intro-brand img{display:block;width:100%;height:100%;object-fit:contain}
            .wf-intro-copy{position:absolute;z-index:1;left:36px;right:34px;bottom:38px;color:var(--wf-intro-text)}
            .wf-intro-kicker{display:flex;align-items:center;gap:10px;font-size:10px;font-weight:800;letter-spacing:.2em;text-transform:uppercase;color:#FFB575}
            .wf-intro-kicker:before{content:"";width:26px;height:1px;background:var(--wf-intro-accent)}
            .wf-intro-title{max-width:370px;margin-top:14px;font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-size:44px;font-weight:500;letter-spacing:-.045em;line-height:.97;text-wrap:balance}
            .wf-intro-desc{max-width:350px;margin-top:18px;color:var(--wf-intro-light);font-size:13.5px;line-height:1.62;font-weight:520}
            .wf-intro-body{position:relative;display:flex;flex-direction:column;padding:45px 48px 32px;color:var(--wf-intro-ink);overflow-y:auto;background:radial-gradient(circle at 100% 0%,rgba(249,115,22,.055),transparent 42%),#F7F3EA}
            .wf-intro-meta{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:28px;color:#4E5A6D;font-size:9.5px;font-weight:850;letter-spacing:.16em;text-transform:uppercase}
            .wf-intro-location{display:flex;align-items:center;gap:6px;max-width:56%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#B94E0B;letter-spacing:.08em}
            .wf-intro-location:before{content:"";width:5px;height:5px;border-radius:999px;background:var(--wf-intro-accent);box-shadow:0 0 0 3px rgba(249,115,22,.12)}
            .wf-intro-prompt{margin:0;font-family:"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif;font-size:34px;font-weight:500;letter-spacing:-.04em;line-height:1.03;color:var(--wf-intro-ink);text-wrap:balance}
            .wf-intro-sub{margin:13px 0 24px;max-width:390px;color:#4E5A6D;font-size:13px;line-height:1.62}
            .wf-mood-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));width:100%;column-gap:18px;row-gap:2px;border-top:1px solid rgba(45,55,72,.18)}
            .wf-mood-tile{min-height:60px;display:flex;align-items:center;gap:11px;text-align:left;padding:10px 5px;border:0;border-bottom:1px solid rgba(45,55,72,.18);border-radius:0;background:transparent;color:var(--wf-intro-ink);font-size:12.5px;font-weight:760;line-height:1.2;cursor:pointer;box-shadow:none;transition:padding .2s ease,color .2s ease,background .2s ease}
            .wf-mood-icon{width:28px;height:28px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;color:#C95A10;transition:color .2s ease,transform .2s ease}
            .wf-mood-tile:after{content:"";width:6px;height:6px;margin-left:auto;border-radius:999px;border:1px solid rgba(45,55,72,.32);transition:background .2s ease,border-color .2s ease,transform .2s ease}
            .wf-mood-tile:hover{padding-left:9px;background:rgba(255,255,255,.4);color:#8F3B09}
            .wf-mood-tile[data-selected="true"]{padding-left:9px;background:rgba(249,115,22,.08);color:var(--wf-intro-ink)}
            .wf-mood-tile[data-selected="true"] .wf-mood-icon{color:var(--wf-intro-accent);transform:scale(1.05)}
            .wf-mood-tile[data-selected="true"]:after{background:var(--wf-intro-accent);border-color:var(--wf-intro-accent);transform:scale(1.12)}
            .wf-mood-tile:active{transform:translateY(0) scale(.985)}
            .wf-intro-cta{width:100%;min-height:55px;margin-top:25px;padding:13px 20px;border-radius:999px;border:1px solid transparent;background:var(--wf-intro-ink);color:var(--wf-intro-text);box-shadow:0 13px 26px rgba(17,24,36,.2);font-size:13.5px;font-weight:850;letter-spacing:.005em;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:12px;transition:transform .2s ease,background .2s ease,box-shadow .2s ease}
            .wf-intro-cta span{color:var(--wf-intro-accent);font-size:18px;font-weight:500}
            .wf-intro-cta:disabled{background:#DEDCD3;color:#7B8380;box-shadow:none;cursor:default}
            .wf-intro-cta:disabled span{color:#9DA29D}
            .wf-intro-cta:not(:disabled):hover{transform:translateY(-1px);background:${C.bg};box-shadow:0 16px 30px rgba(4,8,16,.25)}
            .wf-intro-cta:not(:disabled):active{transform:translateY(0) scale(.992)}
            .wf-intro-skip{align-self:center;margin-top:13px;border:0;background:transparent;color:#4E5A6D;font-size:11.5px;font-weight:700;text-decoration:underline;text-decoration-color:rgba(78,90,109,.3);text-underline-offset:3px;cursor:pointer}
            .wf-intro-foot{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:auto;padding-top:20px;font-size:10px;color:#647082;letter-spacing:.01em}
            .wf-intro-close{position:absolute;z-index:4;right:18px;top:18px;width:38px;height:38px;border-radius:999px;background:rgba(247,243,234,.86);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(45,55,72,.16);color:var(--wf-intro-ink);font-size:15px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 3px 12px rgba(17,24,36,.08)}
            .wf-mood-tile:focus-visible,.wf-intro-cta:focus-visible,.wf-intro-skip:focus-visible,.wf-intro-close:focus-visible{outline:3px solid rgba(249,115,22,.5);outline-offset:3px}
            @media(max-width:760px){
              .wf-intro-backdrop{align-items:flex-end;padding:10px}
              .wf-intro-pop{display:block;max-width:520px;max-height:calc(100dvh - 10px);border-radius:26px 26px 20px 20px;overflow-y:auto}
              .wf-intro-visual{min-height:205px}
              .wf-intro-visual>img{object-position:50% 57%}
              .wf-intro-brand{left:22px;top:18px;width:118px;height:38px}
              .wf-intro-copy{left:22px;right:58px;bottom:20px}
              .wf-intro-kicker{font-size:9px}
              .wf-intro-kicker:before{width:18px}
              .wf-intro-title{margin-top:8px;font-size:31px;line-height:1}
              .wf-intro-desc{display:none}
              .wf-intro-body{padding:25px 20px 19px;overflow:visible}
              .wf-intro-meta{margin-bottom:19px}
              .wf-intro-prompt{font-size:25px}
              .wf-intro-sub{margin:8px 0 17px;font-size:12.5px}
              .wf-mood-grid{column-gap:12px;row-gap:0}
              .wf-mood-tile{min-height:52px;padding:8px 3px;gap:7px;font-size:11.5px}
              .wf-mood-tile:hover,.wf-mood-tile[data-selected="true"]{padding-left:6px}
              .wf-mood-icon{width:25px;height:25px}
              .wf-mood-icon svg{width:18px!important;height:18px!important}
              .wf-intro-cta{min-height:49px;margin-top:17px}
              .wf-intro-foot{padding-top:14px}
              .wf-intro-close{right:15px;top:15px;background:rgba(7,19,27,.64);border-color:rgba(255,255,255,.18);color:#fff}
            }
            @media(max-height:700px) and (min-width:761px){
              .wf-intro-pop{max-width:820px;grid-template-columns:.82fr 1.18fr}
              .wf-intro-visual{min-height:520px}
              .wf-intro-body{padding:32px 40px 24px}
              .wf-intro-meta{margin-bottom:18px}
              .wf-intro-prompt{font-size:28px}
              .wf-intro-sub{margin:8px 0 17px}
              .wf-mood-tile{min-height:54px;padding:9px 12px}
              .wf-intro-cta{margin-top:16px;min-height:49px}
              .wf-intro-foot{padding-top:15px}
            }
            @media(max-height:620px) and (max-width:760px){
              .wf-intro-visual{min-height:158px}
              .wf-intro-title{font-size:27px}
              .wf-intro-body{padding-top:18px}
              .wf-intro-sub{display:none}
              .wf-mood-grid{margin-top:14px}
              .wf-intro-foot{display:none}
            }
            @media(prefers-reduced-motion:reduce){.wf-intro-pop,.wf-mood-tile,.wf-intro-cta{animation:none!important;transition:none!important}}
          ` }} />
          <div ref={introDlgRef} role="dialog" aria-modal="true" aria-label="Welcome to Wayfind — choose a local experience" tabIndex={-1} onClick={(e) => e.stopPropagation()} className="wf-intro-pop">
            <button onClick={dismissIntro} aria-label="Close" className="wf-intro-close">{"\u2715"}</button>
            <section className="wf-intro-visual" aria-label="A local evening waiting to be discovered">
              <img aria-hidden="true" src={INTRO_VISUAL} alt="" />
              <div className="wf-intro-brand"><img src="/brand/wayfind-wordmark-transparent-v2.png" alt="Wayfind" /></div>
              <div className="wf-intro-copy">
                <div className="wf-intro-kicker">Your local concierge</div>
                <div className="wf-intro-title">A better plan is closer than you think.</div>
                <div className="wf-intro-desc">Wayfind does the research and brings back places worth your time—nearby now or wherever you go.</div>
              </div>
            </section>
            <section className="wf-intro-body">
              <div className="wf-intro-meta">
                <span>Find your moment</span>
                {introLocation ? <span className="wf-intro-location">{introLocation}</span> : null}
              </div>
              <h2 className="wf-intro-prompt">Tell us the mood.<br />We’ll handle the shortlist.</h2>
              <p className="wf-intro-sub">One choice is enough. Wayfind will surface the places that fit this moment—not another endless list.</p>
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
                <div className="wf-mood-grid">
                  {order.map((k, i) => { const ex = EXPERIENCES[k]; if (!ex) return null; const on = introSel[0] === k; return (
                    <button key={k} className="wf-mood-tile" data-selected={on ? "true" : "false"} aria-pressed={on} onClick={() => { setIntroSel(on ? [] : [k]); try { logEvent("mood_tile", null, { mood: k, src: "intro", adaptive: k === "cozyindoor" || k === "brunch" ? 1 : 0 }); } catch (e) {} }} style={{ animation: `wfIntroTileIn .38s cubic-bezier(.16,1,.3,1) ${90 + i * 45}ms both` }}>
                      <span className="wf-mood-icon"><Icon name={MOOD_ICON[k] || "pin"} size={20} color="currentColor" strokeWidth={1.8} /></span>
                      <span>{(MOOD_LBL[k] || [null, ex.label])[1]}</span>
                    </button>
                  ); })}
                </div>
              );
            } catch (e) { return null; } })()}
              <button className="wf-intro-cta" onClick={() => { if (!introSel.length) return; dismissIntro(); openExperience(introSel[0]); }} disabled={!introSel.length}>Show me the best matches <span aria-hidden="true">→</span></button>
              <button className="wf-intro-skip" onClick={dismissIntro}>Skip and explore everything</button>
              <div className="wf-intro-foot"><IntroIcon k="shield" size={13} color={C.muted} />No sponsored rankings. Just places worth your time.</div>
            </section>
          </div>
        </div>
  );
}
