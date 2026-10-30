// app/ask/style.js — Wayfind's Chibi Elf date-invite world.
//
// Styled around Wayfind's Chibi Elf mascot (Official Mascot Bible palette):
// twilight-lavender sky (#1B1030 -> #5E2479) with Govee Neon Pink (#FF2A85),
// Rosy Blush (#FF7597), Springs Cyan (#00F5D4), and Wayfind Gold (#FFD166)
// accents, soft glowing aura portrait frame, and accessible pill controls.
export const ASK_CSS = `
.wfx{position:fixed;inset:0;overflow:hidden;display:flex;align-items:center;justify-content:center;
  font-family:var(--wf-sans),-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  background:
    radial-gradient(circle at 50% 16%,rgba(255,117,151,.32),transparent 54%),
    radial-gradient(circle at 84% 22%,rgba(0,245,212,.15),transparent 46%),
    radial-gradient(circle at 16% 74%,rgba(255,42,133,.24),transparent 52%),
    linear-gradient(180deg,#1B1030 0%,#2B174C 38%,#441D68 72%,#5E2479 100%)}
.wfx *{box-sizing:border-box}
.wfx button:focus-visible,.wfx a:focus-visible,.wfx input:focus-visible{
  outline:3px solid #00F5D4;outline-offset:3px}

.wfx-dither{position:absolute;left:0;right:0;top:0;height:38%;pointer-events:none;opacity:.45;
  background-image:radial-gradient(circle,rgba(255,255,255,.28) 1px,transparent 1.5px),
    radial-gradient(circle,rgba(255,209,102,.22) 1px,transparent 1.5px);
  background-size:36px 36px,54px 54px;background-position:0 0,18px 18px;
  -webkit-mask-image:linear-gradient(180deg,#000 0%,transparent 100%);
  mask-image:linear-gradient(180deg,#000 0%,transparent 100%)}

.wfx-scene{position:absolute;left:0;right:0;bottom:0;height:42%;pointer-events:none}
.wfx-cloud{position:absolute;display:block;filter:blur(0.5px);pointer-events:none}
.wfx-cloud i{position:absolute;display:block;border-radius:999px}
.wfx-sky1 i{background:rgba(255,214,238,.16)}
.wfx-sky2 i{background:rgba(213,194,255,.14)}
.wfx-sky3 i{background:rgba(255,117,151,.12)}
.wfx-ground{position:absolute;left:0;right:0;bottom:0;height:24%;
  background:linear-gradient(180deg,rgba(255,42,133,.14) 0%,rgba(27,16,48,.55) 100%)}
.wfx-skyline{position:absolute;left:0;right:0;bottom:22%;height:2px;
  background:linear-gradient(90deg,transparent 0%,rgba(255,117,151,.35) 25%,rgba(0,245,212,.3) 50%,rgba(255,209,102,.35) 75%,transparent 100%)}

/* Four-pointed star sparkles */
.wfx-sparkle{position:absolute;width:14px;height:14px;pointer-events:none;
  background:#FFD166;
  clip-path:polygon(50% 0,63% 37%,100% 50%,63% 63%,50% 100%,37% 63%,0 50%,37% 37%);
  animation:wfxTwinkle 2.2s ease-in-out infinite}
.wfx-sparkle:nth-child(even){background:#00F5D4}
.wfx-sparkle:nth-child(3n){background:#FF7597}
@keyframes wfxTwinkle{0%,100%{transform:scale(.45) rotate(-8deg);opacity:.35}50%{transform:scale(1.08) rotate(8deg);opacity:.95}}

.wfx-heart{position:absolute;pointer-events:none;animation:wfxFloat 5.6s ease-in-out infinite;opacity:.92;
  filter:drop-shadow(0 4px 10px rgba(255,42,133,.35))}
@keyframes wfxFloat{0%{transform:translateY(0) scale(.85);opacity:0}
  16%{opacity:.92}84%{opacity:.92}100%{transform:translateY(-290px) scale(1.08);opacity:0}}

/* Single scroll authority inside fixed parent */
.wfx-stage{position:relative;z-index:3;width:100%;max-width:440px;padding:22px 20px 32px;
  display:flex;flex-direction:column;align-items:center;text-align:center;
  max-height:100%;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain}

/* Soft glowing Elf medallion stage */
.wfx-portrait{position:relative;flex-shrink:0;display:flex;align-items:center;justify-content:center;
  border-radius:42px;
  background:
    radial-gradient(circle at 50% 42%,rgba(255,117,151,.34),rgba(213,194,255,.18) 56%,rgba(24,14,44,.84) 100%);
  border:2.5px solid rgba(255,255,255,.32);
  box-shadow:
    0 18px 44px rgba(12,5,26,.52),
    0 0 0 6px rgba(255,117,151,.15),
    inset 0 2px 0 rgba(255,255,255,.35);
  animation:wfxBob 2.4s ease-in-out infinite}
.wfx-portrait:before,.wfx-portrait:after{content:"";position:absolute;width:12px;height:12px;pointer-events:none;
  background:#FFD166;
  clip-path:polygon(50% 0,63% 37%,100% 50%,63% 63%,50% 100%,37% 63%,0 50%,37% 37%)}
.wfx-portrait:before{right:10px;top:10px}
.wfx-portrait:after{left:10px;bottom:10px;background:#00F5D4}
@keyframes wfxBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}

.wfx-h1{margin:20px 0 0;font-weight:850;line-height:1.18;color:#FFFFFF;letter-spacing:-.02em;
  font-size:clamp(26px,7vw,35px);max-width:100%;overflow-wrap:anywhere;
  text-shadow:0 4px 18px rgba(15,6,32,.55);
  animation:wfxPop .34s cubic-bezier(.2,1.4,.3,1)}
@keyframes wfxPop{0%{transform:scale(.86);opacity:0}100%{transform:scale(1);opacity:1}}

.wfx-sub{margin:10px 0 0;color:#F5E6FF;font-size:15.5px;font-weight:650;letter-spacing:.01em;line-height:1.45;
  max-width:100%;overflow-wrap:anywhere;
  text-shadow:0 2px 10px rgba(15,6,32,.45)}

.wfx-plan-preview{width:100%;max-width:368px;margin-top:14px;padding:12px 16px;border-radius:18px;
  background:rgba(24,14,44,.78);backdrop-filter:blur(12px);
  border:1.5px solid rgba(255,255,255,.24);color:#F5E6FF;
  font-size:14.5px;font-weight:650;line-height:1.5;text-align:center;
  overflow-wrap:anywhere;box-shadow:0 10px 26px rgba(12,5,26,.36)}
.wfx-plan-preview strong{color:#FFD166;font-weight:800}
.wfx-plan-note{margin-top:5px;color:#D5C2FF;font-size:13.5px;font-weight:600;font-style:italic}

.wfx-alert{width:100%;max-width:368px;margin-top:12px;padding:11px 15px;border-radius:15px;
  background:rgba(255,209,102,.15);border:1.5px solid rgba(255,209,102,.52);
  color:#FFE8A3;font-size:13.5px;font-weight:650;line-height:1.45;text-align:center}

.wfx-row{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:22px;min-height:64px;flex-wrap:wrap;width:100%}

/* Balanced, accessible response buttons — both answers stay clearly readable and easy to tap */
.wfx-yes{position:relative;border:2.5px solid #FFFFFF;cursor:pointer;font-family:inherit;font-weight:850;color:#FFFFFF;
  background:linear-gradient(135deg,#FF2A85 0%,#FF5E9E 100%);
  letter-spacing:.04em;border-radius:999px;
  min-height:52px;min-width:132px;padding:14px 32px;font-size:20px;
  box-shadow:0 6px 0 #9E1152,0 14px 32px rgba(255,42,133,.48),inset 0 2px 0 rgba(255,255,255,.45);
  text-shadow:0 2px 4px rgba(120,10,55,.45);
  transition:transform .12s ease,filter .15s ease}
.wfx-yes:hover{filter:brightness(1.06)}
.wfx-yes:active{transform:translateY(3px)}

.wfx-no{border:2px solid rgba(255,228,242,.55);cursor:pointer;font-family:inherit;font-weight:800;
  color:#FFFFFF;background:rgba(26,15,46,.74);backdrop-filter:blur(10px);
  border-radius:999px;
  min-height:52px;min-width:120px;padding:14px 28px;font-size:18px;
  box-shadow:0 6px 18px rgba(15,6,32,.34);
  transition:transform .12s ease,background .15s ease,border-color .15s ease}
.wfx-no:hover{background:rgba(44,26,74,.88);border-color:#FFFFFF}
.wfx-no:active{transform:translateY(2px)}

.wfx-plea{margin-top:12px;color:#FFD166;font-size:15px;font-weight:750;letter-spacing:.01em;min-height:22px;
  text-shadow:0 2px 10px rgba(15,6,32,.55);
  animation:wfxPop .24s cubic-bezier(.2,1.4,.3,1)}

.wfx-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;margin-top:20px}
.wfx-chip{border:1.5px solid rgba(255,255,255,.22);cursor:pointer;font-family:inherit;font-weight:750;
  color:#FFFFFF;background:rgba(26,15,46,.72);backdrop-filter:blur(12px);
  border-radius:18px;padding:14px 10px;font-size:15px;letter-spacing:.01em;line-height:1.3;min-height:58px;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  box-shadow:0 8px 20px rgba(12,5,26,.32);
  transition:transform .12s ease,border-color .15s ease,background .15s ease}
.wfx-chip:active{transform:translateY(2px)}
.wfx-chip:hover{border-color:rgba(255,117,151,.65);background:rgba(40,22,68,.84)}
.wfx-chip[aria-pressed="true"]{background:linear-gradient(135deg,#FF2A85 0%,#FF5E9E 100%);color:#FFFFFF;
  border-color:#FFFFFF;
  box-shadow:0 5px 0 #9E1152,0 12px 26px rgba(255,42,133,.42)}

.wfx-tag{display:inline-block;margin-top:5px;padding:2px 8px;border-radius:999px;
  font-size:10px;font-weight:800;letter-spacing:.06em;color:#0A0A0B;background:#00F5D4;
  text-transform:uppercase}
.wfx-chip[aria-pressed="true"] .wfx-tag{background:#FFD166;color:#1E1233}

.wfx-cal{width:100%;margin-top:16px;background:rgba(24,14,44,.82);backdrop-filter:blur(14px);
  border:1.5px solid rgba(255,255,255,.22);border-radius:22px;padding:16px 14px 18px;
  box-shadow:0 14px 34px rgba(12,5,26,.42)}
.wfx-calhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;
  color:#FFFFFF;font-weight:800;font-size:16px;letter-spacing:.01em}
.wfx-calnav{border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#FFFFFF;
  border-radius:999px;font-family:inherit;font-size:16px;font-weight:800;
  cursor:pointer;width:36px;height:36px;display:inline-flex;align-items:center;justify-content:center;line-height:1}
.wfx-calnav[disabled]{opacity:.25;cursor:default}
.wfx-caldays,.wfx-calgrid{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}
.wfx-caldays div{color:#D5C2FF;font-size:11.5px;font-weight:750;padding-bottom:4px}
.wfx-day{border:1px solid transparent;background:rgba(255,255,255,.08);color:#FFFFFF;
  border-radius:12px;font-family:inherit;font-size:14px;font-weight:700;
  padding:9px 0;cursor:pointer;transition:all .14s ease}
.wfx-day:hover:not([disabled]){border-color:rgba(255,117,151,.6);background:rgba(255,255,255,.15)}
.wfx-day[disabled]{background:transparent;color:rgba(213,194,255,.28);cursor:default}
.wfx-day[aria-pressed="true"]{background:linear-gradient(135deg,#FF2A85 0%,#FF5E9E 100%);
  color:#FFFFFF;border-color:#FFFFFF;box-shadow:0 4px 12px rgba(255,42,133,.45)}

.wfx-field{display:block;width:100%;margin-top:12px;padding:13px 16px;font-family:inherit;
  font-size:16px;font-weight:650;color:#FFFFFF;background:rgba(24,14,44,.78);
  border:1.5px solid rgba(255,255,255,.24);border-radius:16px;outline:none;
  box-shadow:0 6px 18px rgba(12,5,26,.28)}
.wfx-field::placeholder{color:rgba(213,194,255,.68)}
.wfx-field:focus{border-color:#FF7597;box-shadow:0 0 0 3px rgba(255,117,151,.25)}

.wfx-go{margin-top:18px;border:2px solid #FFFFFF;cursor:pointer;font-family:inherit;font-weight:850;color:#FFFFFF;
  background:linear-gradient(135deg,#FF2A85 0%,#FF5E9E 100%);
  border-radius:999px;min-height:50px;padding:13px 28px;font-size:16.5px;letter-spacing:.04em;
  box-shadow:0 5px 0 #9E1152,0 12px 28px rgba(255,42,133,.42)}
.wfx-go[disabled]{background:rgba(255,255,255,.14);color:rgba(255,255,255,.45);
  border-color:rgba(255,255,255,.18);box-shadow:none;cursor:default}
.wfx-go2{margin-top:12px;background:rgba(255,255,255,.12);color:#FFFFFF;
  border:1.5px solid rgba(255,255,255,.32);box-shadow:0 6px 18px rgba(12,5,26,.32)}

.wfx-quiet{display:inline-block;margin-top:14px;border:0;background:transparent;color:#FFD166;font-family:inherit;
  font-size:15px;font-weight:750;letter-spacing:.01em;cursor:pointer;text-decoration:underline;
  text-underline-offset:4px;text-shadow:0 2px 8px rgba(12,5,26,.5)}

.wfx-card{width:100%;margin-top:16px;background:rgba(24,14,44,.82);backdrop-filter:blur(14px);
  border:1.5px solid rgba(255,255,255,.24);border-radius:20px;padding:15px 18px;color:#F5E6FF;
  font-size:15px;font-weight:600;line-height:1.8;text-align:left;overflow-wrap:anywhere;
  box-shadow:0 12px 30px rgba(12,5,26,.4)}
.wfx-card b{color:#FFD166;font-weight:800}

.wfx-mark{margin-top:20px;display:flex;align-items:center;justify-content:center;gap:8px;
  color:#D5C2FF;font-size:13px;font-weight:700;letter-spacing:.06em;text-shadow:0 2px 8px rgba(12,5,26,.5)}

.wfx-burst{position:fixed;left:0;top:0;width:0;height:0;z-index:99999;pointer-events:none}
.wfx-burst i{position:absolute;left:0;top:0;display:block;
  animation:wfxBurst .75s cubic-bezier(.16,.9,.36,1) forwards}
@keyframes wfxBurst{
  0%{transform:translate(-50%,-50%) rotate(0) scale(.4);opacity:0}
  18%{opacity:1}
  100%{transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) rotate(var(--rot)) scale(1.08);opacity:0}}

/* ── ELF MOTION RHYTHMS ─────────────────────────────────────────────────── */
.wfc{overflow:visible;transform-origin:50% 88%}
.wfc-hop{animation:wfcHop .95s ease-in-out infinite}
.wfc-bounce{animation:wfcHop .68s ease-in-out infinite}
.wfc-wobble{animation:wfcWobble .76s ease-in-out infinite}
.wfc-shiver{animation:wfcShiver .18s ease-in-out infinite}
.wfc-slump{animation:wfcSlump 1.2s ease-in-out infinite}
.wfc-tremble{animation:wfcTremble .16s ease-in-out infinite}
@keyframes wfcHop{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-7%) scale(1.02)}}
@keyframes wfcWobble{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
@keyframes wfcShiver{0%,100%{transform:translateX(-1.6%)}50%{transform:translateX(1.6%)}}
@keyframes wfcSlump{0%,100%{transform:translateY(3%) scale(.98)}50%{transform:translateY(6%) scale(.96)}}
@keyframes wfcTremble{0%,100%{transform:translate(-1.2%,2%)}50%{transform:translate(1.2%,2%)}}

.wfc-xheart{animation:wfcPulse .7s ease-in-out infinite}
.wfc-xsweat{animation:wfcSweat .9s ease-in-out infinite}
.wfc-xbreak{animation:wfcBreak .85s ease-in-out infinite}
.wfc-tear1{animation:wfcDrop .75s ease-in infinite}
.wfc-tear2{animation:wfcDrop .75s ease-in .36s infinite}
@keyframes wfcPulse{0%,100%{transform:scale(.86) translateY(0)}50%{transform:scale(1.16) translateY(-4px)}}
@keyframes wfcDrop{0%{transform:translateY(0) scale(.75);opacity:0}22%{opacity:1}100%{transform:translateY(28px) scale(1);opacity:0}}
@keyframes wfcSweat{0%{transform:translateY(0);opacity:0}28%{opacity:1}100%{transform:translateY(18px);opacity:0}}
@keyframes wfcBreak{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}

.wfc-lean{display:inline-flex;translate:var(--lean,0) var(--liftv,0);transition:translate .12s ease-out}
.wfc-eager{will-change:transform;animation:wfcEager .44s ease-in-out infinite}
.wfc-fid2{animation-duration:.3s}
.wfc-fid3{animation-duration:.2s}
@keyframes wfcEager{
  0%{transform:translate(-1.5px,0)}
  50%{transform:translate(1.5px,-3px)}
  100%{transform:translate(-1.5px,0)}}

/* Two Elves snuggling cheek-to-cheek */
.wfc-couple{position:relative;display:flex;align-items:flex-end;justify-content:center}
.wfc-hugL{animation:wfcHugL .72s ease-in-out infinite;margin-right:-11%;transform-origin:80% 90%}
.wfc-hugR{animation:wfcHugR .72s ease-in-out infinite;margin-left:-11%;transform-origin:20% 90%}
@keyframes wfcHugL{0%,100%{transform:translateX(0) rotate(-2deg)}50%{transform:translateX(5%) rotate(3deg)}}
@keyframes wfcHugR{0%,100%{transform:translateX(0) rotate(2deg)}50%{transform:translateX(-5%) rotate(-3deg)}}
.wfc-heart{position:absolute;top:-6%;left:50%;margin-left:-11px;z-index:2;
  animation:wfcCoupleHeart .65s ease-in-out infinite}
@keyframes wfcCoupleHeart{0%,100%{transform:scale(.88) translateY(0)}50%{transform:scale(1.22) translateY(-5px)}}

.boo-c,.boo-s-back{display:none!important}
.wfx-paused *,.wfx-paused *:before,.wfx-paused *:after{animation-play-state:paused!important}

@media (max-height: 520px){
  .wfx{align-items:flex-start}
  .wfx-stage{padding:8px 16px 14px}
  .wfx-portrait{transform:scale(.72);margin:-18px 0 -14px}
  .wfx-h1{margin-top:6px;font-size:clamp(20px,4.8vw,25px)}
  .wfx-sub{margin-top:4px;font-size:14px}
  .wfx-plan-preview{margin-top:8px;padding:8px 12px;font-size:13.5px}
  .wfx-row{margin-top:10px;min-height:48px}
}

@media (prefers-reduced-motion: reduce){
  .wfx-portrait,.wfx-heart,.wfx-sparkle,.wfx-h1,.wfx-plea,
  .wfc,.wfc-eager,.wfc-hugL,.wfc-hugR,.wfc-heart,
  .wfc-xheart,.wfc-xsweat,.wfc-xbreak,.wfc-tear1,.wfc-tear2{animation:none}
  .wfx-yes,.wfx-no,.wfc-lean{transition:none}
}
`;

