// app/ask/style.js — the pixel world (v7.27).
//
// Matched to the owner's reference capture, frame by frame: a magenta sky with
// a dither at the top, three banks of chunky pixel cloud, a hot-pink skyline on
// the horizon, crimson pixel type with a white outline, and a bevelled YES.
//
// This page does NOT look like the rest of Wayfind, and that is deliberate. It
// is opened inside a private conversation by someone who has never heard of us,
// at the one moment they are being asked a personal question. A dark product UI
// with an orange CTA reads there as an advert interrupting something private.
// Wayfind's mark appears once, at the end, after the yes — where it reads as
// "somebody arranged this for you" rather than as a banner.
//
// NOTHING HERE IS AN IMAGE. Owner: "I don't want to use any AI generated image,
// it looks fake." Every cloud, every sparkle, the skyline and the whole cast are
// drawn — CSS boxes and SVG rects on a grid. That is also why the page opens
// instantly in a text thread: the entire world is a few kilobytes of markup.
//
// Exported as a string so the page inlines it: one request, no stylesheet round
// trip, because the whole thing must paint before the person decides to bother.
export const ASK_CSS = `
@font-face{font-family:Pixelify;font-style:normal;font-weight:400;font-display:block;
  src:url(/fonts/pixelify-sans-latin-400-normal.woff2) format('woff2')}
@font-face{font-family:Pixelify;font-style:normal;font-weight:700;font-display:block;
  src:url(/fonts/pixelify-sans-latin-700-normal.woff2) format('woff2')}

.wfx{position:fixed;inset:0;overflow:hidden;display:flex;align-items:center;justify-content:center;
  font-family:Pixelify,ui-monospace,monospace;
  background:linear-gradient(180deg,#E07AD0 0%,#DD66C2 34%,#DA51B0 62%,#D63C9E 100%)}
.wfx *{box-sizing:border-box}

/* The dither. The reference fades a checkerboard out of the top of the sky —
   two pixels of a lighter magenta on a 8px grid, masked to the upper third. It
   is what makes a flat CSS gradient read as a 16-bit sky instead of a gradient. */
.wfx-dither{position:absolute;left:0;right:0;top:0;height:34%;pointer-events:none;opacity:.34;
  background-image:linear-gradient(45deg,rgba(255,255,255,.18) 25%,transparent 25%,transparent 75%,rgba(255,255,255,.18) 75%),
    linear-gradient(45deg,rgba(255,255,255,.18) 25%,transparent 25%,transparent 75%,rgba(255,255,255,.18) 75%);
  background-size:10px 10px;background-position:0 0,5px 5px;
  -webkit-mask-image:linear-gradient(180deg,#000 0%,transparent 100%);
  mask-image:linear-gradient(180deg,#000 0%,transparent 100%)}

/* Clouds and skyline. Stepped boxes, never border-radius: a rounded cloud in a
   pixel scene is the one thing that gives the whole illusion away. */
.wfx-scene{position:absolute;left:0;right:0;bottom:0;height:42%;pointer-events:none}
.wfx-cloud{position:absolute;display:block}
.wfx-cloud i{position:absolute;display:block}
.wfx-sky1 i{background:#F6DCF0}.wfx-sky2 i{background:#F1CBE8}.wfx-sky3 i{background:#EAB8DF}
.wfx-ground{position:absolute;left:0;right:0;bottom:0;height:26%;
  background:linear-gradient(180deg,#DF4EA4 0%,#D63C97 100%)}
.wfx-skyline{position:absolute;left:0;right:0;bottom:22%;height:26px;
  background-image:repeating-linear-gradient(90deg,#C82E82 0 6px,transparent 6px 14px,#C82E82 14px 24px,transparent 24px 30px,#C82E82 30px 34px,transparent 34px 46px);
  -webkit-mask-image:linear-gradient(180deg,transparent 0,#000 40%);mask-image:linear-gradient(180deg,transparent 0,#000 40%)}

/* Sparkles are four-pointed pixel crosses, drawn with two bars. */
.wfx-sparkle{position:absolute;width:14px;height:14px;pointer-events:none;
  animation:wfxTwinkle 1.6s steps(3,end) infinite}
.wfx-sparkle:before,.wfx-sparkle:after{content:"";position:absolute;background:#FBD9F2}
.wfx-sparkle:before{left:5px;top:0;width:4px;height:14px}
.wfx-sparkle:after{left:0;top:5px;width:14px;height:4px}
@keyframes wfxTwinkle{0%,100%{transform:scale(.45);opacity:.35}50%{transform:scale(1);opacity:.95}}

.wfx-heart{position:absolute;animation:wfxFloat 5s linear infinite;opacity:.95}
@keyframes wfxFloat{0%{transform:translateY(0) scale(.9);opacity:0}
  14%{opacity:.95}86%{opacity:.95}100%{transform:translateY(-300px) scale(1.05);opacity:0}}

.wfx-stage{position:relative;z-index:3;width:100%;max-width:430px;padding:20px 20px 28px;
  display:flex;flex-direction:column;align-items:center;text-align:center;
  max-height:100dvh;overflow-y:auto}

/* THE FRAME. Two chunky pixel rings around a near-black plate, with a notched
   corner on each side — the reference's frame, rebuilt in box-shadow so it
   costs nothing and scales with the art. */
.wfx-portrait{position:relative;display:flex;align-items:center;justify-content:center;
  background:#140C18;image-rendering:pixelated;
  box-shadow:0 0 0 5px #C0246A,0 0 0 10px #FFF3FB,0 0 0 15px #A8175A,0 16px 0 rgba(120,16,70,.32);
  animation:wfxBob 2.2s steps(4,end) infinite}
.wfx-portrait:before,.wfx-portrait:after{content:"";position:absolute;width:9px;height:9px;background:#E8459E}
.wfx-portrait:before{left:-3px;top:-3px;box-shadow:calc(100% + 6px) 0 0 #E8459E}
.wfx-portrait:after{left:-3px;bottom:-3px;box-shadow:calc(100% + 6px) 0 0 #E8459E}
@keyframes wfxBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}

/* TYPE. Crimson with a hard white outline and a deep shadow under it — the
   reference's exact treatment. The outline is four offsets rather than a blur,
   because a blurred pixel letter is a smudge. */
.wfx-h1{margin:26px 0 0;font-weight:700;line-height:1.3;color:#5E0A2C;letter-spacing:2px;
  font-size:clamp(27px,7.6vw,35px);
  text-shadow:3px 0 0 #FFF6FB,-3px 0 0 #FFF6FB,0 3px 0 #FFF6FB,0 -3px 0 #FFF6FB,
    3px 3px 0 #FFF6FB,-3px 3px 0 #FFF6FB,3px -3px 0 #FFF6FB,-3px -3px 0 #FFF6FB,
    0 8px 0 rgba(94,10,44,.34);
  animation:wfxPop .38s steps(4,end)}
@keyframes wfxPop{0%{transform:scale(.7);opacity:0}100%{transform:scale(1);opacity:1}}

.wfx-sub{margin:14px 0 0;color:#FFF6FB;font-size:16px;letter-spacing:1px;
  text-shadow:0 2px 0 #7E1038,2px 0 0 rgba(94,10,44,.45),-2px 0 0 rgba(94,10,44,.45)}

.wfx-row{display:flex;align-items:center;justify-content:center;gap:18px;margin-top:26px;min-height:108px}

/* THE YES. Bevelled and notched at the corners like a 16-bit menu button, and
   it grows with REAL LAYOUT — font-size and padding, not transform:scale().
   scale() does not reflow, so at the second No it grew straight over the top of
   the No button and the person could no longer press the thing they were
   reaching for, which turns a joke into a trick. */
.wfx-yes{position:relative;border:0;cursor:pointer;font-family:inherit;font-weight:700;color:#FFFFFF;
  background:#E8236E;letter-spacing:2px;
  padding:calc(14px * var(--s,1)) calc(30px * var(--s,1));
  font-size:calc(26px * var(--s,1));
  clip-path:polygon(10px 0,calc(100% - 10px) 0,100% 10px,100% calc(100% - 10px),
    calc(100% - 10px) 100%,10px 100%,0 calc(100% - 10px),0 10px);
  box-shadow:inset 0 0 0 5px #FFF6FB,inset 0 0 0 9px #C0165A,0 8px 0 #8E0F3E;
  text-shadow:0 3px 0 rgba(120,10,55,.55);
  transition:font-size .3s steps(5,end),padding .3s steps(5,end)}
.wfx-yes:active{transform:translateY(4px)}
.wfx-no{border:0;cursor:pointer;font-family:inherit;font-weight:400;color:#B01F4A;background:#FFF6FB;
  padding:calc(9px * var(--n,1)) calc(18px * var(--n,1));font-size:calc(16px * var(--n,1));
  box-shadow:inset 0 0 0 3px #E27BB8,0 5px 0 rgba(140,20,70,.3);
  transition:font-size .3s steps(5,end),padding .3s steps(5,end)}
.wfx-plea{margin-top:18px;color:#FFF6FB;font-size:16px;letter-spacing:.8px;min-height:22px;
  text-shadow:0 2px 0 #7E1038,2px 0 0 rgba(94,10,44,.45),-2px 0 0 rgba(94,10,44,.45);
  animation:wfxPop .24s steps(3,end)}

.wfx-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;margin-top:24px}
.wfx-chip{border:0;cursor:pointer;font-family:inherit;font-weight:400;color:#6E0B33;background:#FFF6FB;
  padding:14px 8px;font-size:14px;letter-spacing:1px;line-height:1.3;min-height:54px;
  display:flex;align-items:center;justify-content:center;
  box-shadow:inset 0 0 0 4px #E8236E,0 5px 0 rgba(140,20,70,.3);
  transition:transform .1s steps(2,end)}
.wfx-chip:active{transform:translateY(3px)}
.wfx-chip[aria-pressed="true"]{background:#E8236E;color:#FFF6FB;
  box-shadow:inset 0 0 0 4px #FFF6FB,inset 0 0 0 7px #C0165A,0 5px 0 #8E0F3E}

.wfx-cal{width:100%;margin-top:20px;background:#FFF6FB;padding:14px 12px 16px;
  box-shadow:inset 0 0 0 4px #E8236E,0 8px 0 rgba(140,20,70,.3)}
.wfx-calhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;
  color:#6E0B33;font-weight:700;font-size:16px;letter-spacing:1px}
.wfx-calnav{border:0;background:transparent;color:#B01F4A;font-family:inherit;font-size:20px;
  cursor:pointer;padding:0 12px;line-height:1}
.wfx-calnav[disabled]{opacity:.25;cursor:default}
.wfx-caldays,.wfx-calgrid{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.wfx-caldays div{color:#C4658F;font-size:11px;padding-bottom:4px}
.wfx-day{border:0;background:#FBE6F3;color:#5E0A2C;font-family:inherit;font-size:14px;
  padding:8px 0;cursor:pointer}
.wfx-day[disabled]{background:transparent;color:#DCA9C6;cursor:default}
.wfx-day[aria-pressed="true"]{background:#E8236E;color:#FFF6FB;box-shadow:inset 0 0 0 2px #FFF6FB}

.wfx-go{margin-top:22px;border:0;cursor:pointer;font-family:inherit;font-weight:700;color:#FFFFFF;
  background:#E8236E;padding:14px 28px;font-size:19px;letter-spacing:2px;
  clip-path:polygon(9px 0,calc(100% - 9px) 0,100% 9px,100% calc(100% - 9px),
    calc(100% - 9px) 100%,9px 100%,0 calc(100% - 9px),0 9px);
  box-shadow:inset 0 0 0 4px #FFF6FB,inset 0 0 0 7px #C0165A,0 7px 0 #8E0F3E}
.wfx-go[disabled]{background:#C88BB0;box-shadow:inset 0 0 0 4px #FFF6FB,inset 0 0 0 7px #A87696,0 7px 0 #8E6480;cursor:default}
.wfx-quiet{margin-top:18px;border:0;background:transparent;color:#FFF6FB;font-family:inherit;
  font-size:15px;letter-spacing:.6px;cursor:pointer;text-decoration:underline;
  text-shadow:0 2px 0 #7E1038}

.wfx-card{width:100%;margin-top:22px;background:#FFF6FB;padding:16px 18px;color:#5E0A2C;
  font-size:15px;line-height:1.9;letter-spacing:.6px;text-align:left;
  box-shadow:inset 0 0 0 4px #E8236E,0 8px 0 rgba(140,20,70,.3)}
.wfx-card b{color:#C0165A;font-weight:700}

.wfx-mark{margin-top:22px;display:flex;align-items:center;justify-content:center;gap:8px;
  color:#FFF0F8;font-size:13px;letter-spacing:1.4px;text-shadow:0 2px 0 #7E1038}

/* ── THE CAST ─────────────────────────────────────────────────────────────
   Fast and looping, per the owner. Sub-second cycles on purpose: at 1.5s a
   kawaii idle reads as a slow shrug, and this page has about two seconds to be
   charming before the person decides whether to answer. steps() rather than
   ease, because pixel art that eases between frames looks like smooth vector
   art wearing a costume.

   One rhythm per rung. They are all fast, but not the SAME fast — hopeful hops,
   worried wobbles, crying trembles, heartbroken slumps. Reusing one loop across
   six moods is how a mood ladder turns back into a single drawing. */
.wfc{overflow:visible;transform-origin:50% 92%;image-rendering:pixelated}
.wfc-hop{animation:wfcHop .5s steps(4,end) infinite}
.wfc-bounce{animation:wfcHop .36s steps(4,end) infinite}
.wfc-wobble{animation:wfcWobble .44s steps(4,end) infinite}
.wfc-shiver{animation:wfcShiver .12s steps(2,end) infinite}
.wfc-slump{animation:wfcSlump .8s steps(4,end) infinite}
.wfc-tremble{animation:wfcTremble .1s steps(2,end) infinite}
@keyframes wfcHop{0%,100%{transform:translateY(0)}50%{transform:translateY(-8%)}}
@keyframes wfcWobble{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
@keyframes wfcShiver{0%,100%{transform:translateX(-1.4%)}50%{transform:translateX(1.4%)}}
@keyframes wfcSlump{0%,100%{transform:translateY(3%)}50%{transform:translateY(6%)}}
@keyframes wfcTremble{0%,100%{transform:translate(-1%,3%)}50%{transform:translate(1%,3%)}}

.wfc-xheart{animation:wfcPulse .4s steps(3,end) infinite}
.wfc-xsweat{animation:wfcSweat .66s steps(5,end) infinite}
.wfc-xbreak{animation:wfcBreak .7s steps(3,end) infinite}
.wfc-tear1{animation:wfcDrop .56s steps(6,end) infinite}
.wfc-tear2{animation:wfcDrop .56s steps(6,end) .28s infinite}
@keyframes wfcPulse{0%,100%{transform:scale(.82)}50%{transform:scale(1.2)}}
@keyframes wfcDrop{0%{transform:translateY(0);opacity:0}18%{opacity:1}100%{transform:translateY(22px);opacity:0}}
@keyframes wfcSweat{0%{transform:translateY(0);opacity:0}28%{opacity:1}100%{transform:translateY(13px);opacity:0}}
@keyframes wfcBreak{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}

/* THE HUG. They lean in, squeeze, and a heart pops between them — on a loop,
   because a hug that happens once is a picture. */
.wfc-couple{position:relative;display:flex;align-items:flex-end;justify-content:center}
.wfc-hugL{animation:wfcHugL .44s steps(4,end) infinite;margin-right:-18%;transform-origin:80% 90%}
.wfc-hugR{animation:wfcHugR .44s steps(4,end) infinite;margin-left:-18%;transform-origin:20% 90%}
@keyframes wfcHugL{0%,100%{transform:translateX(0)}50%{transform:translateX(7%)}}
@keyframes wfcHugR{0%,100%{transform:translateX(0)}50%{transform:translateX(-7%)}}
.wfc-heart{position:absolute;top:-14%;left:50%;margin-left:-8px;z-index:2;
  animation:wfcPulse .4s steps(3,end) infinite}

@media (prefers-reduced-motion: reduce){
  .wfx-portrait,.wfx-heart,.wfx-sparkle,.wfx-h1,.wfx-plea,
  .wfc,.wfc-hugL,.wfc-hugR,.wfc-heart,
  .wfc-xheart,.wfc-xsweat,.wfc-xbreak,.wfc-tear1,.wfc-tear2{animation:none}
  .wfx-yes,.wfx-no{transition:none}
}
`;
