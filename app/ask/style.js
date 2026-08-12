// app/ask/style.js — the pastel pixel world (v7.27).
//
// This page does NOT look like Wayfind, and that is deliberate. It is opened in
// a text thread by someone who has never heard of us, at the one moment they
// are being asked a personal question. A dark product UI with an orange CTA
// would read as an ad interrupting a private moment. It gets its own world, and
// the Wayfind mark only appears at the end, after the yes, when we have earned
// the right to say who arranged it.
//
// Exported as a string so the page can inline it — a single request, no
// stylesheet round trip, because the whole page must paint before the person
// decides whether to bother.
export const ASK_CSS = `
@font-face{font-family:Pixelify;font-style:normal;font-weight:400;font-display:swap;
  src:url(/fonts/pixelify-sans-latin-400-normal.woff2) format('woff2')}
@font-face{font-family:Pixelify;font-style:normal;font-weight:700;font-display:swap;
  src:url(/fonts/pixelify-sans-latin-700-normal.woff2) format('woff2')}

.wfx{position:fixed;inset:0;overflow:hidden;display:flex;align-items:center;justify-content:center;
  font-family:ui-rounded,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,system-ui,sans-serif;
  background:linear-gradient(180deg,#EAB9EE 0%,#E1A0E6 42%,#D588D8 78%,#CE7ACD 100%);
  text-rendering:optimizeLegibility}
.wfx *{box-sizing:border-box}

/* Pixel clouds. Three bands of stacked round shapes, no image. */
.wfx-clouds{position:absolute;left:0;right:0;bottom:0;height:38%;pointer-events:none}
.wfx-cloud{position:absolute;border-radius:999px}
.wfx-c1{background:#E795D6}.wfx-c2{background:#EFA6DE}.wfx-c3{background:#F7BCE9}

.wfx-sparkle{position:absolute;width:8px;height:8px;background:#FFE6F7;border-radius:2px;
  animation:wfxTwinkle 2.6s ease-in-out infinite;opacity:.85}
@keyframes wfxTwinkle{0%,100%{transform:scale(.6);opacity:.35}50%{transform:scale(1.15);opacity:.95}}

.wfx-heart{position:absolute;font-size:14px;color:#F784C6;animation:wfxFloat 6s linear infinite;opacity:.9}
@keyframes wfxFloat{0%{transform:translateY(0) rotate(-6deg);opacity:0}
  12%{opacity:.9}88%{opacity:.9}100%{transform:translateY(-260px) rotate(8deg);opacity:0}}

.wfx-stage{position:relative;z-index:2;width:100%;max-width:420px;padding:22px 20px 30px;
  display:flex;flex-direction:column;align-items:center;text-align:center;
  max-height:100dvh;overflow-y:auto}

.wfx-portrait{display:flex;align-items:center;justify-content:center;
  background:linear-gradient(180deg,#F9EFFE,#E9D8F6);
  border:6px solid #FFFFFF;border-radius:14px;
  box-shadow:0 0 0 5px #C9A0DC,0 10px 0 rgba(126,80,150,.34);
  animation:wfxBob 3.4s ease-in-out infinite}
@keyframes wfxBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}

/* One HARD shadow, not two soft ones. The first pass had a white 3px and a
   translucent plum 6px, and on a pale ground that reads as a blurred double
   image rather than pixel type — the whole point of a bitmap face is that its
   edges are hard. Deeper ink, one crisp offset. */
.wfx-h1{font-family:Pixelify,ui-monospace,monospace;margin:20px 0 0;font-weight:700;
  line-height:1.2;color:#7A1F63;letter-spacing:1px;
  text-shadow:0 3px 0 rgba(255,255,255,.55);
  font-size:clamp(27px,7.6vw,36px);animation:wfxPop .5s cubic-bezier(.2,1.4,.4,1)}
.wfx-sub{margin:12px 0 0;color:#5E2A66;font-size:15px;font-weight:600;letter-spacing:.2px}
@keyframes wfxPop{0%{transform:scale(.72) translateY(10px);opacity:0}100%{transform:scale(1) translateY(0);opacity:1}}
/* Ink deepened after reading real screenshots: on this pale ground the first
   pass sat near 40% contrast and the pixel edges dissolved into the sky. */

.wfx-row{display:flex;align-items:center;justify-content:center;gap:16px;margin-top:24px;min-height:104px}

/* THE YES BUTTON. Its scale is set inline from yesScale(noCount) — every No
   makes it bigger. The transition is what sells the joke: the growth has to be
   watchable, not instant. */
/* The growth is REAL LAYOUT, not a transform. transform:scale() does not
   reflow, so at the second No the YES button grew straight over the top of the
   No button and the person could no longer press the thing they were trying to
   press — which turns a joke into a trick. Scaling font-size and padding makes
   the row push No aside honestly. */
.wfx-yes{border:0;cursor:pointer;font-family:inherit;font-weight:700;color:#FFFFFF;
  background:linear-gradient(180deg,#F76BA6,#E8347F);
  border-radius:12px;letter-spacing:1px;
  font-family:Pixelify,ui-monospace,monospace;
  padding:calc(13px * var(--s,1)) calc(28px * var(--s,1));
  font-size:calc(25px * var(--s,1));
  box-shadow:inset 0 0 0 4px #FFFFFF,0 7px 0 #A81C58,0 12px 18px rgba(120,20,70,.3);
  transition:font-size .34s cubic-bezier(.2,1.5,.4,1),padding .34s cubic-bezier(.2,1.5,.4,1)}
.wfx-yes:active{transform:translateY(3px)}
.wfx-no{border:3px solid #D9B8E4;cursor:pointer;font-family:inherit;font-weight:600;
  color:#7E5C8E;background:#FDF4FB;border-radius:10px;
  padding:calc(8px * var(--n,1)) calc(16px * var(--n,1));font-size:calc(15px * var(--n,1));
  box-shadow:0 4px 0 rgba(150,96,172,.22);
  transition:font-size .34s cubic-bezier(.2,1.5,.4,1),padding .34s cubic-bezier(.2,1.5,.4,1)}
.wfx-plea{margin-top:16px;color:#6B2C60;font-size:15px;font-weight:600;min-height:20px;
  animation:wfxPop .3s ease both}

/* The activity grid and the calendar reuse one chip. */
.wfx-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%;margin-top:22px}
.wfx-chip{border:4px solid #FFFFFF;cursor:pointer;font-family:inherit;font-weight:400;
  color:#5E2456;background:linear-gradient(180deg,#FFFFFF,#F6E2F6);border-radius:10px;
  padding:12px 8px;font-size:14px;font-weight:600;line-height:1.3;
  box-shadow:0 0 0 3px #CE9BD8,0 5px 0 rgba(126,80,150,.3);
  display:flex;align-items:center;justify-content:center;gap:7px;min-height:52px;
  transition:transform .12s ease}
.wfx-chip:active{transform:translateY(3px)}
.wfx-chip[aria-pressed="true"]{background:linear-gradient(180deg,#F98BC4,#E8479A);color:#FFFFFF;
  box-shadow:0 0 0 3px #A81C58,0 5px 0 rgba(120,20,70,.4)}

.wfx-cal{width:100%;margin-top:18px;background:linear-gradient(180deg,#FDF2FC,#F2D9F2);
  border:5px solid #FFFFFF;border-radius:12px;padding:12px 10px 14px;
  box-shadow:0 0 0 4px #CE9BD8,0 8px 0 rgba(126,80,150,.3)}
.wfx-calhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;
  color:#6B2C60;font-weight:700;font-size:16px}
.wfx-calnav{border:0;background:transparent;color:#A0479A;font-family:inherit;font-size:20px;
  cursor:pointer;padding:0 10px;line-height:1}
.wfx-calnav[disabled]{opacity:.28;cursor:default}
.wfx-caldays,.wfx-calgrid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.wfx-caldays div{color:#8E5C9E;font-size:11px;font-weight:700;padding-bottom:3px}
.wfx-day{border:2px solid transparent;background:#FFFFFF;color:#5E2456;border-radius:6px;
  font-family:inherit;font-size:14px;font-weight:600;padding:8px 0;cursor:pointer}
.wfx-day[disabled]{background:transparent;color:#C9A9CF;cursor:default}
.wfx-day[aria-pressed="true"]{background:#E8479A;color:#FFFFFF;border-color:#FFFFFF;
  box-shadow:0 0 0 2px #A81C58}

.wfx-go{margin-top:20px;border:0;cursor:pointer;font-family:inherit;font-weight:700;color:#FFFFFF;
  background:linear-gradient(180deg,#F76BA6,#E8347F);border-radius:11px;padding:13px 26px;
  font-family:Pixelify,ui-monospace,monospace;font-size:19px;letter-spacing:1px;
  box-shadow:inset 0 0 0 3px #FFFFFF,0 6px 0 #A81C58}
.wfx-go[disabled]{filter:grayscale(.55);opacity:.6;cursor:default}
.wfx-quiet{margin-top:18px;border:0;background:transparent;color:#4A1F46;font-family:inherit;
  font-size:15px;font-weight:600;cursor:pointer;text-decoration:underline}

.wfx-card{width:100%;margin-top:20px;background:#FFFFFF;border:5px solid #FFFFFF;border-radius:12px;
  padding:15px 17px;color:#4A1F46;font-size:15px;font-weight:500;line-height:1.75;text-align:left;
  box-shadow:0 0 0 4px #CE9BD8,0 8px 0 rgba(126,80,150,.3)}
.wfx-card b{color:#A33184}

.wfx-mark{margin-top:22px;display:flex;align-items:center;justify-content:center;gap:7px;
  color:#6E4A7C;font-size:13px;font-weight:600}

/* ── THE CAST ─────────────────────────────────────────────────────────────
   Fast and looping, per the owner. Sub-second cycles on purpose: at 1.5s a
   kawaii idle reads as a slow shrug, and this page has about two seconds to
   be charming before the person decides whether to answer. */
.wfc{overflow:visible;transform-origin:50% 92%}
/* One rhythm per rung. They are all fast, but they are not the SAME fast —
   hopeful hops, worried wobbles, crying trembles, heartbroken slumps. Reusing
   one loop across six moods is how a mood ladder turns back into one drawing. */
.wfc-hop{animation:wfcHop .58s ease-in-out infinite}
.wfc-bounce{animation:wfcHop .42s ease-in-out infinite}
.wfc-wobble{animation:wfcWobble .5s ease-in-out infinite}
.wfc-shiver{animation:wfcShiver .16s linear infinite}
.wfc-slump{animation:wfcSlump .9s ease-in-out infinite}
.wfc-tremble{animation:wfcTremble .12s linear infinite}
@keyframes wfcWobble{0%,100%{transform:rotate(-4deg) translateY(0)}50%{transform:rotate(4deg) translateY(-3%)}}
@keyframes wfcShiver{0%,100%{transform:translateX(-1.2%)}50%{transform:translateX(1.2%)}}
@keyframes wfcSlump{0%,100%{transform:translateY(2%) scale(1,.97)}50%{transform:translateY(4%) scale(1.02,.94)}}
@keyframes wfcTremble{0%,100%{transform:translate(-.8%,2%) scale(.9)}50%{transform:translate(.8%,2%) scale(.9)}}

/* The extras run on their own loops so a tear never falls on the shiver. */
.wfc-xheart{transform-origin:50% 10%;animation:wfcPulse .44s ease-in-out infinite}
.wfc-xsweat{animation:wfcSweat .7s ease-in infinite}
.wfc-xbreak{transform-origin:50% 10%;animation:wfcBreak .8s ease-in-out infinite}
.wfc-tear1{animation:wfcDrop .62s ease-in infinite}
.wfc-tear2{animation:wfcDrop .62s ease-in .31s infinite}
.wfc-wet{animation:wfcShine .5s ease-in-out infinite}
@keyframes wfcDrop{0%{transform:translateY(0);opacity:0}20%{opacity:1}100%{transform:translateY(26px);opacity:0}}
@keyframes wfcSweat{0%{transform:translateY(0);opacity:0}30%{opacity:1}100%{transform:translateY(14px);opacity:0}}
@keyframes wfcBreak{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}
@keyframes wfcShine{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}

/* THE HUG. They lean in, squeeze, and the heart pops between them — on a loop,
   because a hug that happens once is a picture. */
.wfc-hugL{animation:wfcHugL .52s ease-in-out infinite;margin-right:-16px;transform-origin:80% 90%}
.wfc-hugR{animation:wfcHugR .52s ease-in-out infinite;margin-left:-16px;transform-origin:20% 90%}
@keyframes wfcHugL{0%,100%{transform:translateX(0) rotate(4deg)}50%{transform:translateX(7%) rotate(9deg)}}
@keyframes wfcHugR{0%,100%{transform:translateX(0) rotate(-4deg)}50%{transform:translateX(-7%) rotate(-9deg)}}
@keyframes wfcHop{
  0%{transform:translateY(0) scale(1,1)}
  28%{transform:translateY(-9%) scale(.96,1.05)}
  55%{transform:translateY(0) scale(1.05,.94)}
  78%{transform:translateY(-3%) scale(.99,1.01)}
  100%{transform:translateY(0) scale(1,1)}}

.wfc-ears{transform-origin:50% 30%;animation:wfcTwitch .74s ease-in-out infinite}
@keyframes wfcTwitch{0%,62%,100%{transform:rotate(0)}72%{transform:rotate(-5deg)}86%{transform:rotate(5deg)}}

.wfc-tail{transform-origin:82% 76%;animation:wfcTail .46s ease-in-out infinite}
@keyframes wfcTail{0%,100%{transform:rotate(-13deg)}50%{transform:rotate(15deg)}}

/* Blink is the one SLOW loop in the set. A cat that blinks on the same beat it
   bounces looks like a glitch, not a creature. */
.wfc-eyes{transform-origin:50% 52%;animation:wfcBlink 2.6s steps(1,end) infinite}
@keyframes wfcBlink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.12)}}

.wfc-couple{position:relative;display:flex;align-items:flex-end;justify-content:center;gap:-6px}
.wfc-heart{position:absolute;top:-12%;left:50%;transform:translateX(-50%);z-index:2;
  animation:wfcPulse .44s ease-in-out infinite}
@keyframes wfcPulse{0%,100%{transform:translateX(-50%) scale(.85)}50%{transform:translateX(-50%) scale(1.18)}}

@media (prefers-reduced-motion: reduce){
  .wfc,.wfc-ears,.wfc-tail,.wfc-eyes,.wfc-heart,.wfc-hugL,.wfc-hugR,
  .wfc-xheart,.wfc-xsweat,.wfc-xbreak,.wfc-tear1,.wfc-tear2,.wfc-wet{animation:none}
}

@media (prefers-reduced-motion: reduce){
  .wfx-portrait,.wfx-heart,.wfx-sparkle{animation:none}
  .wfx-h1,.wfx-plea{animation:none}
  .wfx-yes,.wfx-no{transition:none}
}
`;
