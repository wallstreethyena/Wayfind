// app/components/css.js — the homepage's server-rendered CSS, lifted verbatim
// out of app/home.js (July 2026 decomposition, wave 1).
//
// WHY THIS FILE EXISTS. These five constants were ~520 lines of app/home.js,
// including its two longest single lines. They are pure data: no JSX, no hooks,
// no state, no imports. Nothing in home.js reads them except the one
// <style dangerouslySetInnerHTML> tag that concatenates them, and that consumer
// stays exactly where it was. Moving them shrinks the file every future edit
// has to be read through, at zero behavioural cost.
//
// WHY app/components/ AND NOT lib/. scripts/lib/shellSrc.mjs defines "the
// shell" as app/home.js plus everything extracted out of it, and roughly a
// dozen content guardrails grep that shell for copy, classes and CTAs. This
// file is registered in shellFiles() alongside kit.js / screens / sheets, so
// every one of those greps still sees this CSS. Putting it under lib/ would
// remove it from the shell and silently blind those guards.
//
// The strings below are byte-identical to what shipped in v6.43 — they were
// moved by script, not retyped, precisely so the CSS could not drift during
// the move.

// Responsive layout, in CSS instead of JS state.
//
// It used to live in `const [vw, setVw] = useState(0)` + `isDesktop = vw >= 900`.
// vw starts at 0, so the server HTML and the FIRST CLIENT PAINT were always the
// MOBILE layout; the effect then measured the real width and re-rendered desktop.
// On a 1440px viewport that snapped the shell 480px -> 1280px at ~514ms and threw
// every child 800px sideways — one shift worth 0.4938, i.e. 99.8% of a 0.4947 CLS.
//
// Media queries are evaluated by the browser before first paint, at the real
// width, on the server-rendered HTML. There is no "wrong" frame to correct, so
// the shift cannot happen. The 900px breakpoint MUST stay in lockstep with the
// old `vw >= 900` — scripts/test-layout-shift.mjs enforces that.
export const WF_DESKTOP_BP = 900;
export const WF_LAYOUT_CSS = `@keyframes wfsk{0%{background-position:200% 0}100%{background-position:-200% 0}}.wf-sk{background:linear-gradient(90deg,#161B22 25%,#1D242E 37%,#161B22 63%);background-size:200% 100%;animation:wfsk 1.4s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.wf-sk{animation:none}}.wf-shell{max-width:480px}.wf-col-main{flex:1;min-width:0}.wf-hooks{display:block;margin:0 0 14px}.wf-hook-card{width:100%;height:152px}.wf-topbar{box-shadow:inset 0 1px 0 rgba(255,255,255,.025),0 8px 20px rgba(0,0,0,.12)}.wf-topbar:after{content:"";position:absolute;left:14px;right:14px;bottom:-1px;height:1px;background:linear-gradient(90deg,transparent,rgba(249,115,22,.48),transparent);opacity:.6}.wf-wordmark{display:flex;align-items:center;gap:5px;cursor:pointer;flex-shrink:0;filter:drop-shadow(0 4px 12px rgba(0,0,0,.3))}.wf-wordmark-text,.wf-wordmark-pin{display:block;flex:none;background-image:url("/brand/wayfind-wordmark-transparent-v2.png");background-repeat:no-repeat}.wf-wordmark-text{width:117.4px;height:39.06px;background-size:151.2px 39.06px;background-position:left center}.wf-wordmark-pin{width:31.65px;height:36.54px;background-size:141.45px 36.54px;background-position:right center}.wf-event-share-card{transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}.wf-event-share-card:hover{transform:translateY(-2px);border-color:rgba(203,213,225,.42)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.075),0 14px 30px rgba(0,0,0,.34)!important}.wf-weather-button,.wf-signin-button,.wf-vibe-button{transition:background .18s ease,border-color .18s ease,transform .18s ease}.wf-weather-button:hover{background:rgba(255,255,255,.04)!important;border-radius:10px}.wf-signin-button:hover,.wf-vibe-button:hover{border-color:rgba(249,115,22,.5)!important;transform:translateY(-1px)}.wf-search-row{filter:drop-shadow(0 8px 14px rgba(0,0,0,.18))}.wf-search-input{transition:border-color .18s ease,background .18s ease}.wf-search-input:focus{border-color:rgba(203,213,225,.72)!important;background:#151D29!important}.wf-search-submit{box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 7px 14px rgba(249,115,22,.22);transition:filter .18s ease,transform .18s ease}.wf-search-submit:hover{filter:brightness(1.06);transform:translateX(1px)}.wf-bottom-nav{gap:3px;padding:5px 5px 6px!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.035),0 -9px 24px rgba(0,0,0,.14)}@media(display-mode:standalone){.wf-bottom-nav{padding-bottom:env(safe-area-inset-bottom)!important}}.wf-bottom-nav-item{position:relative;min-height:66px;transition:color .18s ease,transform .18s ease}.wf-bottom-nav-icon{width:32px;height:28px;display:grid;place-items:center}.wf-bottom-nav-item.is-active:before{content:"";position:absolute;top:0;width:24px;height:2px;border-radius:0 0 99px 99px;background:#F97316;box-shadow:0 2px 8px rgba(249,115,22,.6)}.wf-bottom-nav-item.is-active .wf-bottom-nav-icon{filter:drop-shadow(0 2px 6px rgba(249,115,22,.28))}.wf-bottom-nav-item.is-active .wf-bottom-nav-label{letter-spacing:.12px}.wf-discovery-visual{position:relative;min-height:188px;overflow:hidden;border-radius:20px;background:#0D1117;box-shadow:0 16px 38px rgba(0,0,0,.28)}.wf-discovery-visual img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.wf-discovery-visual:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(3,8,14,.9) 0%,rgba(3,8,14,.62) 43%,rgba(3,8,14,.1) 78%),linear-gradient(0deg,rgba(3,8,14,.42),transparent 60%)}.wf-discovery-copy{position:relative;z-index:1;display:flex;flex-direction:column;justify-content:flex-end;height:188px;max-width:300px;padding:20px;color:#F8FAFC}.wf-discovery-kicker{font-size:10px;font-weight:800;letter-spacing:1.1px;color:#FB923C}.wf-discovery-title{margin-top:7px;font-size:22px;font-weight:800;line-height:1.08;letter-spacing:-.45px}.wf-discovery-text{margin-top:7px;font-size:12.5px;font-weight:600;line-height:1.42;color:#D8E0EA}@media(min-width:${WF_DESKTOP_BP}px){.wf-shell{max-width:1280px}.wf-explore{max-width:760px;margin:0 auto}.wf-cols{display:block;width:100%;max-width:800px;margin:16px auto 0}.wf-col-main{width:100%;max-width:800px;margin:0 auto}.wf-topbar{padding-left:max(28px,calc((100vw - 800px)/2))!important;padding-right:max(28px,calc((100vw - 800px)/2))!important;padding-top:20px!important;padding-bottom:18px!important}.wf-topbar-row{margin-bottom:14px!important}.wf-wordmark{gap:6px}.wf-wordmark-text{width:139.77px;height:46.5px;background-size:179.99px 46.5px}.wf-wordmark-pin{width:37.68px;height:43.5px;background-size:168.38px 43.5px}.wf-weather-button{padding:5px 8px!important}.wf-weather-button span:first-child{font-size:21px!important}.wf-signin-button{padding:10px 16px!important;font-size:13px!important}.wf-vibe-button{width:48px!important;height:48px!important}.wf-search-input{height:58px!important;font-size:17px!important;border-radius:17px 0 0 17px!important}.wf-search-submit{width:62px!important;height:58px!important;border-radius:0 17px 17px 0!important;font-size:25px!important}.wf-bottom-nav{left:50%!important;right:auto!important;bottom:18px!important;transform:translateX(-50%);width:min(800px,calc(100vw - 44px));max-width:none!important;margin:0!important;padding:9px!important;border:1px solid #30363D!important;border-radius:22px;box-shadow:inset 0 1px 0 rgba(255,255,255,.045),0 18px 48px rgba(0,0,0,.42);backdrop-filter:blur(18px)}.wf-bottom-nav-item{min-height:72px;padding:10px 12px!important;border-radius:0!important}.wf-bottom-nav-icon{width:36px;height:31px;transform:scale(1.1)}.wf-bottom-nav-label{font-size:12px!important;letter-spacing:.05px}.wf-bottom-nav-item:hover{background:rgba(255,255,255,.025)!important}.wf-discovery-empty{padding-top:30px!important}.wf-discovery-heading{display:block!important;margin-bottom:16px!important}.wf-discovery-heading>div:first-child{margin:0!important;flex:initial!important}.wf-discovery-visual{min-height:224px;border-radius:22px}.wf-discovery-copy{height:224px;max-width:365px;padding:28px}.wf-discovery-title{font-size:27px}.wf-discovery-text{font-size:13.5px;max-width:300px}.wf-discovery-grid{gap:0!important;border-top:1px solid #30363D}.wf-discovery-link{min-height:42px!important;padding:10px 6px!important;border:0!important;border-bottom:1px solid #30363D!important;background:transparent!important}.wf-discovery-link:nth-child(odd){padding-right:18px!important}.wf-discovery-link:nth-child(even){padding-left:18px!important;border-left:1px solid #30363D!important}.wf-hooks{display:flex;flex-wrap:wrap;overflow-x:visible;padding-left:12px;padding-right:12px;margin:0 -12px 14px}.wf-hook-card{width:290px;height:185px}}`;
export const WF_SEARCH_CSS = `.wf-search-row{filter:drop-shadow(0 11px 20px rgba(0,0,0,.24));transition:filter .2s ease}.wf-search-row:focus-within{filter:drop-shadow(0 13px 25px rgba(0,0,0,.34)) drop-shadow(0 0 7px rgba(148,163,184,.06))}.wf-search-row>div:first-child{border-radius:14px 0 0 14px}.wf-search-icon{color:#AEB9C8;transition:color .18s ease}.wf-search-row:focus-within .wf-search-icon{color:#E2E8F0}.wf-search-input{background:linear-gradient(135deg,#182130,#111923)!important;border-color:#354153!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.045),inset 0 -1px 0 rgba(0,0,0,.25);transition:border-color .18s ease,background .18s ease,box-shadow .18s ease}.wf-search-input::placeholder{color:#8190A3;opacity:1}.wf-search-input:focus,.wf-search-input:focus-visible{outline:none!important;outline-offset:0!important;border-color:rgba(203,213,225,.72)!important;background:linear-gradient(135deg,#1A2330,#121923)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.075),inset 0 0 0 1px rgba(203,213,225,.08),0 0 0 1px rgba(203,213,225,.14)!important}.wf-search-submit{background:linear-gradient(180deg,#FF9B47 0%,#F97316 55%,#E95A0C 100%)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.34),0 8px 18px rgba(249,115,22,.27);transition:filter .18s ease,transform .18s ease,box-shadow .18s ease}.wf-search-submit:hover{filter:brightness(1.06);transform:translateX(1px);box-shadow:inset 0 1px 0 rgba(255,255,255,.42),0 10px 20px rgba(249,115,22,.34)}@media(min-width:${WF_DESKTOP_BP}px){.wf-topbar{padding-top:18px!important;padding-bottom:16px!important}.wf-topbar-row{margin-bottom:10px!important}.wf-search-row>div:first-child{border-radius:17px 0 0 17px}.wf-search-icon{left:16px!important}.wf-search-input{padding-left:43px!important}}`;
export const WF_PLACE_CARD_CSS = `
.wf-place-card{
  position:relative;
  margin-bottom:12px!important;
  overflow:hidden;
  border-radius:17px!important;
  border-color:rgba(159,177,203,.25)!important;
  background:radial-gradient(circle at 100% 0%,rgba(76,224,179,.035),transparent 42%),linear-gradient(145deg,rgba(255,255,255,.035),transparent 36%),#111824!important;
  box-shadow:0 14px 36px rgba(0,0,0,.27),inset 0 1px rgba(255,255,255,.035);
  transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;
}
.wf-place-card:before{
  content:"";
  position:absolute;
  z-index:3;
  top:0;
  left:26px;
  width:50px;
  height:2px;
  border-radius:0 0 99px 99px;
  background:linear-gradient(90deg,transparent,#F97316,transparent);
  opacity:.7;
  pointer-events:none;
}
.wf-place-card:hover{transform:translateY(-1px);border-color:rgba(159,177,203,.37)!important;box-shadow:0 18px 42px rgba(0,0,0,.34),inset 0 1px rgba(255,255,255,.05)}
.wf-place-card:focus-visible{outline:2px solid rgba(249,115,22,.72);outline-offset:3px}
.wf-place-card-layout{--wf-place-card-media:96px;display:grid!important;grid-template-columns:var(--wf-place-card-media) minmax(0,1fr);min-height:176px}
.wf-place-card-layout>img{width:96px!important;height:100%!important;min-height:176px!important}
.wf-place-card-monogram{
  position:relative;
  display:grid;
  min-height:176px;
  place-items:center;
  color:#FFC08F;
  font-size:14px;
  font-weight:900;
  letter-spacing:.09em;
  background:radial-gradient(circle at 35% 24%,rgba(255,121,24,.18),transparent 35%),linear-gradient(155deg,#192230,#0D131E 72%);
  box-shadow:inset -1px 0 rgba(159,177,203,.1);
}
.wf-place-card-monogram:after{
  content:"";
  position:absolute;
  left:50%;
  top:50%;
  width:52px;
  height:52px;
  transform:translate(-50%,-50%);
  border:1px solid rgba(255,142,61,.3);
  border-radius:18px;
  box-shadow:0 14px 34px rgba(0,0,0,.28),inset 0 1px rgba(255,255,255,.07);
}
.wf-place-card-content{padding:13px 13px 11px!important;display:flex;min-width:0;flex-direction:column}
.wf-place-card-title-row{gap:7px!important}
.wf-place-card-rank{
  position:absolute!important;
  z-index:4;
  top:11px;
  left:calc(10px - var(--wf-place-card-media));
  display:flex!important;
  width:34px!important;
  height:34px!important;
  align-items:center;
  justify-content:center;
  border:1px solid rgba(255,255,255,.2);
  border-radius:11px!important;
  background:rgba(4,8,15,.78)!important;
  color:#FFF!important;
  font-size:12px!important;
  box-shadow:0 8px 20px rgba(0,0,0,.28);
  backdrop-filter:blur(10px);
}
.wf-place-card.is-curator-pick{
  border-color:rgba(238,190,75,.48)!important;
  background:
    radial-gradient(circle at 0% 100%,rgba(238,190,75,.10),transparent 35%),
    radial-gradient(circle at 100% 0%,rgba(76,224,179,.035),transparent 42%),
    linear-gradient(145deg,rgba(255,255,255,.04),transparent 36%),
    #111824!important;
  box-shadow:0 20px 52px rgba(0,0,0,.38),0 0 32px rgba(218,164,37,.07),inset 0 1px rgba(255,240,195,.08);
}
.wf-place-card.is-curator-pick:before{
  left:0;
  width:100%;
  height:2px;
  background:linear-gradient(90deg,transparent 2%,#9A6813 15%,#FFE8A3 42%,#D89B20 68%,transparent 98%);
  opacity:1;
}
/* v6.44: IN FLOW, never absolute. An absolutely-positioned badge on a card
   whose action row lives at the bottom-left will sit on top of Save — that is
   exactly what shipped and what the owner photographed. Geometry now matches
   .wf-place-card-award below (same inline-flex / width:max-content / 999px
   rhythm) so the two stack as one coherent column of credentials.
   scripts/test-curator-boost.mjs forbids position:absolute here. */
.wf-place-card-owner{
  position:relative;
  display:inline-flex;
  width:max-content;
  max-width:100%;
  align-items:center;
  gap:6px;
  min-height:25px;
  margin:1px 0 7px;
  padding:2px 11px 2px 3px;
  overflow:hidden;
  border:1px solid rgba(255,218,126,.55);
  border-radius:999px;
  background:
    linear-gradient(110deg,rgba(255,224,142,.20),rgba(255,224,142,.05) 46%,transparent 72%),
    rgba(10,9,7,.72);
  color:#F8D985;
  box-shadow:0 6px 18px rgba(0,0,0,.34),0 0 18px rgba(223,174,53,.10),inset 0 1px rgba(255,248,217,.14);
  backdrop-filter:blur(10px) saturate(1.2);
  -webkit-backdrop-filter:blur(10px) saturate(1.2);
  pointer-events:none;
}
.wf-place-card-owner:after{
  content:"";
  position:absolute;
  top:-55%;
  left:-24%;
  width:42%;
  height:220%;
  transform:rotate(20deg);
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.20),transparent);
}
.wf-place-card-owner-mark{
  position:relative;
  display:grid;
  width:19px;
  height:19px;
  flex:0 0 19px;
  place-items:center;
  border:1px solid rgba(255,238,181,.82);
  border-radius:50%;
  background:radial-gradient(circle at 35% 28%,#FFF1BC,#E1A72D 58%,#80500A 100%);
  color:#2A1A03;
  font-size:10px;
  line-height:1;
  text-shadow:0 1px rgba(255,255,255,.35);
  box-shadow:0 3px 9px rgba(0,0,0,.34),inset 0 1px 2px rgba(255,255,255,.7);
}
.wf-place-card-owner-copy{display:flex;min-width:0;align-items:center;text-transform:uppercase}
.wf-place-card-owner-copy>strong{color:#FFE19A;font-size:9px;font-weight:900;letter-spacing:.115em;line-height:1;white-space:nowrap}
.wf-place-card-heading{flex:1;min-width:0}
.wf-place-card-category{
  display:flex;
  align-items:center;
  gap:5px;
  margin:0 0 4px;
  padding:0;
  border:0;
  background:transparent;
  color:#FF9B50;
  font-size:8.5px;
  font-weight:850;
  letter-spacing:.12em;
  text-transform:uppercase;
  cursor:default;
}
.wf-place-card-category:before{content:"";width:12px;height:2px;border-radius:99px;background:#F97316}
.wf-place-card-category.is-tappable{cursor:pointer}
.wf-place-card-name{font-size:16px!important;font-weight:780!important;line-height:1.12!important;letter-spacing:-.025em}
.wf-place-card-score{filter:none!important}
.wf-place-card-score .wayfind-score-badge[data-score-band="excellent"]{--wf-score-color:#25C26E;--wf-score-tint:rgba(37,194,110,.10);--wf-score-border:rgba(37,194,110,.62);--wf-score-glow:rgba(37,194,110,.20)}
.wf-place-card-score .wayfind-score-badge[data-score-band="strong"]{--wf-score-color:#FF6B18;--wf-score-tint:rgba(255,107,24,.11);--wf-score-border:rgba(255,107,24,.68);--wf-score-glow:rgba(255,107,24,.20)}
.wf-place-card-score .wayfind-score-badge[data-score-band="fair"]{--wf-score-color:#F2C94C;--wf-score-tint:rgba(242,201,76,.11);--wf-score-border:rgba(242,201,76,.68);--wf-score-glow:rgba(242,201,76,.18)}
.wf-place-card-score .wayfind-score-badge[data-score-band="low"]{--wf-score-color:#E5484D;--wf-score-tint:rgba(229,72,77,.11);--wf-score-border:rgba(229,72,77,.66);--wf-score-glow:rgba(229,72,77,.18)}
.wf-place-card-score .wayfind-score-badge{
  width:98px;
  min-width:98px;
  height:46px;
  box-sizing:border-box;
  justify-content:flex-start;
  border-width:1.5px!important;
  border-color:var(--wf-score-border)!important;
  border-radius:13px!important;
  background:linear-gradient(135deg,var(--wf-score-tint),transparent 68%),rgba(5,13,17,.92)!important;
  box-shadow:0 8px 20px rgba(0,0,0,.25),0 0 11px var(--wf-score-glow);
}
.wf-place-card-score .wayfind-score-badge>span:first-child{
  display:flex!important;
  width:24px!important;
  height:100%;
  box-sizing:border-box;
  background:linear-gradient(180deg,var(--wf-score-color),color-mix(in srgb,var(--wf-score-color) 72%,#071018))!important;
  box-shadow:inset -1px 0 rgba(255,255,255,.12);
}
.wf-place-card-score .wayfind-score-badge>span:last-child{
  min-width:0!important;
  flex:1;
  align-items:center;
  justify-content:center;
  text-align:center;
  box-sizing:border-box;
  padding:6px 6px!important;
  gap:2px!important;
}
.wf-place-card-score .wayfind-score-badge>span:last-child>span:first-child{
  width:100%;
  text-align:center;
  font-size:6.5px!important;
  line-height:1!important;
  letter-spacing:.7px!important;
  color:#B8C2D0!important;
}
.wf-place-card-score .wayfind-score-badge>span:last-child>span:last-child{
  width:100%;
  display:flex!important;
  align-items:baseline!important;
  justify-content:center!important;
  gap:2px!important;
  font-size:18px!important;
  line-height:.95!important;
  white-space:nowrap;
}
.wf-place-card-score .wayfind-score-badge>span:last-child>span:last-child span{
  font-size:7.5px!important;
  line-height:1!important;
}
.wf-place-card-meta{gap:4px 12px!important;margin:8px 0 6px!important;color:#A8B2C2}
.wf-place-card-meta>span{position:relative;font-size:10.5px!important;white-space:nowrap}
.wf-place-card-meta>span+span:before{content:"·";position:absolute;left:-8px;color:#4E5A6D}
.wf-place-card-meta>span[style*="color: rgb(34, 197, 94)"],.wf-place-card-meta>span[style*="#22C55E"]{color:#4CE0B3!important}
.wf-place-card-award{
  display:inline-flex;
  width:max-content;
  max-width:100%;
  min-height:25px;
  align-items:center;
  gap:6px;
  margin:1px 0 7px;
  padding:3px 9px 3px 5px;
  overflow:hidden;
  border:1px solid rgba(223,184,96,.35);
  border-radius:999px;
  background:linear-gradient(110deg,rgba(223,184,96,.16),rgba(223,184,96,.035));
  color:#F5D98F;
  font-size:9px;
  font-weight:850;
  letter-spacing:.055em;
  line-height:1;
  text-transform:uppercase;
  box-shadow:inset 0 1px rgba(255,255,255,.045);
}
.wf-place-card-award>span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wf-place-card-award-icon{
  position:relative;
  isolation:isolate;
  display:grid;
  width:18px;
  height:18px;
  flex:0 0 18px;
  place-items:center;
  border-radius:50%;
  background:#D9A52E;
  color:#111824;
  font-size:9px;
  font-weight:950;
  box-shadow:0 3px 10px rgba(0,0,0,.24),inset 0 1px rgba(255,255,255,.45);
}
.wf-place-card-award-icon:after{
  content:"";
  position:absolute;
  z-index:-1;
  bottom:-4px;
  width:9px;
  height:7px;
  background:currentColor;
  clip-path:polygon(0 0,100% 0,78% 100%,50% 68%,22% 100%);
  opacity:.72;
}
.wf-place-card-award.is-rank-1{border-color:rgba(235,187,72,.48);background:linear-gradient(110deg,rgba(235,187,72,.2),rgba(235,187,72,.04));color:#F4D477}
.wf-place-card-award.is-rank-1 .wf-place-card-award-icon{background:linear-gradient(145deg,#FFE39A,#D79A18);color:#2B1B00}
.wf-place-card-award.is-rank-2{border-color:rgba(190,204,223,.34);background:linear-gradient(110deg,rgba(190,204,223,.14),rgba(190,204,223,.025));color:#D9E2EF}
.wf-place-card-award.is-rank-2 .wf-place-card-award-icon{background:linear-gradient(145deg,#F2F5F8,#9BAABD);color:#17202D}
.wf-place-card-award.is-rank-3{border-color:rgba(204,139,91,.38);background:linear-gradient(110deg,rgba(204,139,91,.15),rgba(204,139,91,.025));color:#E4B18B}
.wf-place-card-award.is-rank-3 .wf-place-card-award-icon{background:linear-gradient(145deg,#E6B184,#9A5D36);color:#25150C}
.wf-place-card-highlights{gap:5px!important;margin-bottom:6px!important}
.wf-place-card-highlights>button,.wf-place-card-highlights>span{
  display:inline-flex!important;
  align-items:center;
  min-height:23px;
  padding:2px 8px!important;
  border:1px solid rgba(159,177,203,.17)!important;
  border-radius:999px!important;
  background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.025))!important;
  color:#DFE5EE!important;
  font-size:9.5px!important;
  font-weight:750!important;
  box-shadow:inset 0 1px rgba(255,255,255,.035);
}
.wf-place-card-highlights>button{
  border-color:rgba(249,115,22,.44)!important;
  background:linear-gradient(180deg,rgba(249,115,22,.13),rgba(249,115,22,.045))!important;
  color:#FFC18F!important;
  cursor:pointer;
  box-shadow:inset 0 1px rgba(255,255,255,.07);
  transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease,background .18s ease;
}
.wf-place-card-highlights>button:hover,.wf-place-card-highlights>button:focus-visible{
  border-color:rgba(255,155,80,.82)!important;
  background:linear-gradient(180deg,rgba(249,115,22,.2),rgba(249,115,22,.07))!important;
  box-shadow:inset 0 1px rgba(255,255,255,.1);
  transform:translateY(-1px);
  outline:none;
}
.wf-place-card-highlights>span{color:#DFE5EE!important}
.wf-place-card-take{
  overflow:hidden;
  padding-left:8px;
  border-left:2px solid rgba(249,115,22,.58);
  color:#CDD5E1!important;
  font-size:10.5px!important;
  line-height:1.35!important;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.wf-place-card-actions{align-items:center;gap:5px!important;margin-top:auto!important;padding-top:9px;flex-wrap:wrap!important}
.wf-place-card-actions>a,.wf-place-card-actions>button{
  display:inline-flex!important;
  min-height:34px;
  align-items:center;
  justify-content:center;
  padding:0 13px!important;
  border:1px solid rgba(159,177,203,.22)!important;
  border-radius:11px!important;
  background:linear-gradient(180deg,rgba(255,255,255,.025),rgba(255,255,255,.005)),#0A1019!important;
  color:#DFE5EE!important;
  font-size:10.5px!important;
  font-weight:800!important;
  line-height:1!important;
  box-shadow:inset 0 1px rgba(255,255,255,.025);
}
.wf-place-card-book{color:#FF9B50!important;border-color:rgba(249,115,22,.36)!important;text-decoration:none}
.wf-place-card-save.is-active{color:#0D1117!important;border-color:#F97316!important;background:#F97316!important}
.wf-place-card-like,.wf-place-card-dislike{
  width:42px!important;
  min-width:42px!important;
  height:40px!important;
  min-height:40px!important;
  flex:0 0 42px;
  justify-content:center!important;
  padding:0!important;
  border-radius:12px!important;
}
.wf-place-card-like svg,.wf-place-card-dislike svg{display:block;width:19px;height:19px}
.wf-place-card-like.is-active{color:#4CE0B3!important;border-color:rgba(76,224,179,.45)!important;background:rgba(76,224,179,.08)!important}
.wf-place-card-dislike.is-active{color:#F87171!important;border-color:rgba(248,113,113,.4)!important;background:rgba(248,113,113,.07)!important}
.wf-place-card-share{min-width:88px;margin-left:auto}
.wf-place-card.is-liked{border-color:rgba(76,224,179,.35)!important}
.wf-place-card.is-disliked{border-color:rgba(248,113,113,.28)!important}
@media(max-width:430px){
  .wf-place-card-layout{--wf-place-card-media:88px}
  .wf-place-card-layout>img{width:88px!important}
  .wf-place-card-content{padding-inline:10px!important}
  .wf-place-card-name{font-size:15px!important}
  .wf-place-card-meta>span{font-size:9.75px!important}
  .wf-place-card-highlights>button{font-size:9px!important}
}
@media(min-width:${WF_DESKTOP_BP}px){
  .wf-place-card-layout{--wf-place-card-media:108px}
  .wf-place-card-layout>img{width:108px!important}
  .wf-place-card-name{font-size:17px!important}
}
.wf-bottom-nav{
  padding:3px 4px 2px!important;
  gap:2px!important;
}
.wf-bottom-nav-item{
  min-height:52px!important;
  padding:4px 4px 2px!important;
  gap:2px!important;
}
.wf-bottom-nav-icon{width:29px!important;height:24px!important;transform:none!important}
.wf-bottom-nav-label{font-size:10.5px!important}
@media(display-mode:standalone){
  .wf-bottom-nav{padding-bottom:max(3px,calc(env(safe-area-inset-bottom) - 16px))!important}
}
@media(min-width:${WF_DESKTOP_BP}px){
  .wf-bottom-nav{bottom:12px!important;padding:4px 6px 3px!important;border-radius:18px!important}
  .wf-bottom-nav-item{min-height:54px!important;padding:4px 6px 3px!important}
  .wf-bottom-nav-icon{width:30px!important;height:25px!important}
  .wf-bottom-nav-label{font-size:10.75px!important}
}
`;
// v6.44 — the "Your taste" panel (owner: "image 4 is new and i love, just not
// crazy on how it looks... we need to leverage the way that we enhanced the
// appearance and make it the same style. i need premium").
//
// The panel shipped in the app's oldest visual dialect: flat #1C2230 buttons, a
// single hard border, no depth. Every surface we have since restyled — the
// intro CTA, the search submit, the place card — shares one recipe: a layered
// gradient body, an inset top highlight that reads as a lit edge, an inset
// bottom shadow that reads as thickness, one soft ambient drop shadow, and a
// second coloured bloom only on the surface that earns it. This applies that
// same recipe here rather than inventing a new one, so the panel looks like the
// rest of the app instead of merely looking nicer.
//
// Deliberately NOT champagne: kit.js reserves that palette for giveaway /
// premium-tier surfaces and flags orange+champagne pairings for owner review.
// This is a privacy panel, so it stays in the established orange/glass system.
export const WF_TASTE_CSS = `
.wf-taste-sheet{
  position:relative;
  overflow:hidden;
  background:linear-gradient(180deg,#0E1621 0%,#0A0F17 46%,#070A10 100%)!important;
  border:1px solid #2B3441!important;
  box-shadow:0 -2px 0 rgba(255,255,255,.045) inset,0 -30px 76px rgba(0,0,0,.66)!important;
}
.wf-taste-sheet:before{
  content:"";
  position:absolute;
  z-index:0;
  top:0;
  left:0;
  right:0;
  height:132px;
  pointer-events:none;
  background:radial-gradient(120% 100% at 50% 0%,rgba(249,115,22,.10),transparent 68%);
}
.wf-taste-body{position:relative;z-index:1}
.wf-taste-mark{
  display:inline-grid;
  place-items:center;
  width:26px;
  height:26px;
  border-radius:9px;
  border:1px solid rgba(255,168,90,.42);
  background:linear-gradient(150deg,rgba(89,49,27,.92),rgba(20,24,32,.96) 74%);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.13),0 6px 14px rgba(0,0,0,.32);
  color:#FFB575;
  font-size:13px;
  line-height:1;
}
.wf-taste-cloud{display:flex;flex-wrap:wrap;gap:8px}
.wf-taste-chip{
  display:inline-flex;
  align-items:center;
  gap:6px;
  padding:6px 6px 6px 13px;
  border-radius:999px;
  border:1px solid rgba(255,159,84,.44);
  background:linear-gradient(145deg,rgba(94,53,25,.60),rgba(20,26,36,.92) 76%);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.11),inset 0 -1px 0 rgba(0,0,0,.34),0 6px 15px rgba(0,0,0,.24);
  color:#FDEFE2;
  font-size:12.5px;
  font-weight:750;
  letter-spacing:-.005em;
  transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;
}
.wf-taste-chip:hover{transform:translateY(-1px);border-color:rgba(255,181,117,.72);box-shadow:inset 0 1px 0 rgba(255,255,255,.15),inset 0 -1px 0 rgba(0,0,0,.34),0 9px 20px rgba(0,0,0,.3),0 3px 12px rgba(249,115,22,.13)}
.wf-taste-chip.is-neg{
  border-color:rgba(159,177,203,.26);
  background:linear-gradient(145deg,rgba(31,39,52,.9),rgba(13,18,26,.94));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.05),inset 0 -1px 0 rgba(0,0,0,.32),0 5px 13px rgba(0,0,0,.2);
  color:#A8B4C6;
}
.wf-taste-chip.is-neg:hover{border-color:rgba(159,177,203,.44);box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 8px 18px rgba(0,0,0,.26)}
.wf-taste-chip-neg{font-weight:650;opacity:.72;text-transform:uppercase;font-size:9.5px;letter-spacing:.7px;margin-right:1px}
/* WCAG 2.5.8 — the old remove control was an 18px dot. 24px is the minimum. */
.wf-taste-x{
  display:grid;
  place-items:center;
  width:24px;
  height:24px;
  flex:none;
  padding:0;
  border:1px solid transparent;
  border-radius:50%;
  background:rgba(255,255,255,.08);
  color:inherit;
  font-size:11px;
  line-height:1;
  cursor:pointer;
  opacity:.7;
  transition:background .16s ease,color .16s ease,opacity .16s ease,border-color .16s ease;
}
.wf-taste-x:hover{opacity:1;background:rgba(248,113,113,.2);border-color:rgba(248,113,113,.5);color:#FCA5A5}
.wf-taste-x:focus-visible,.wf-taste-btn:focus-visible{outline:2px solid #FFB56F;outline-offset:2px}
.wf-taste-btn{
  flex:1;
  min-height:48px;
  padding:11px 14px;
  border-radius:14px;
  font-size:13.5px;
  font-weight:800;
  letter-spacing:-.01em;
  cursor:pointer;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:7px;
  backdrop-filter:blur(12px);
  -webkit-backdrop-filter:blur(12px);
  transition:transform .2s ease,filter .2s ease,box-shadow .2s ease;
}
.wf-taste-btn:hover{transform:translateY(-1px);filter:brightness(1.06)}
.wf-taste-btn:active{transform:translateY(0) scale(.99)}
.wf-taste-btn.is-primary{
  border:1px solid rgba(255,168,90,.88);
  background:linear-gradient(180deg,#FF9B47 0%,#F97316 55%,#E95A0C 100%);
  color:#1A0C02;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.34),inset 0 -1px 0 rgba(0,0,0,.22),0 12px 24px rgba(0,0,0,.3),0 5px 18px rgba(249,115,22,.26);
}
.wf-taste-btn.is-danger{
  border:1px solid rgba(248,113,113,.46);
  background:linear-gradient(135deg,rgba(46,22,26,.94),rgba(11,14,20,.92));
  color:#FCA5A5;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.07),inset 0 -1px 0 rgba(0,0,0,.32),0 12px 24px rgba(0,0,0,.24);
}
.wf-taste-btn.is-danger:hover{border-color:rgba(248,113,113,.72);box-shadow:inset 0 1px 0 rgba(255,255,255,.09),0 14px 26px rgba(0,0,0,.3),0 4px 14px rgba(239,68,68,.14)}
@media (prefers-reduced-motion:reduce){
  .wf-taste-chip,.wf-taste-btn,.wf-taste-x{transition:none!important}
  .wf-taste-chip:hover,.wf-taste-btn:hover,.wf-taste-btn:active{transform:none!important}
}
`;
