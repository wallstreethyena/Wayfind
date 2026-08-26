import { RAIL_IDS } from "../../lib/railCollapse";
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

// WIDE DESKTOP (2026-08-07, owner: "the desktop view does not look good",
// screenshot at ~2000px). Three separate defects, all geometry, all fixed in
// CSS for exactly the reason the 900px tier above exists — see the incident
// note at the top of this file. NOTHING here may move into JS state.
//
//   1. THE HEADER WAS NOT ALIGNED TO THE CONTENT. The topbar centred its own
//      contents with `calc((100vw - 800px)/2)`, but the topbar lives INSIDE
//      .wf-shell, which is itself capped and centred. At 1600px that is
//      (1600-800)/2 = 400px of padding inside a box that starts at x=160 — so
//      the wordmark and the search bar sat ~160px to the RIGHT of the feed
//      column they belong to. Measured: topbar content x=560, feed x=400. The
//      basis has to be the shell's width, not the window's: min(100vw,1280px).
//      Fixed in the 900 tier as well, since the bug is present from 900px up.
//   2. THE COLUMN WAS A PHONE. 800px of content in a 2000px window is ~600px
//      of dead black on each side, and it clipped the rails mid-card, which
//      reads as broken rather than as "scroll for more".
//   3. THE HEADER FLOATED. With .wf-shell capped at 1280px the top bar ended
//      in mid-air on a wide monitor. Above WF_WIDE_BP the shell goes full
//      bleed so the bar spans the window like a real site header, while the
//      CONTENT stays centred at WF_WIDE_COL. The 1280px cap in the 900 tier is
//      untouched and still covers 900–1179px.
//
// WHY 1180: WF_WIDE_COL + 2×60px of breathing room. Below that the 800px
// column is still the right answer, so the tier simply does not apply.
export const WF_WIDE_BP = 1180;
export const WF_WIDE_COL = 1060;

// THE SECOND COLUMN (v7.29, owner: "can we make the desktop version of wayfind
// fit nice"). The 2026-08-07 tier above stopped the desktop page from being
// MISALIGNED; it left it a phone-shaped column with 226px of dead black on each
// side at 1512px and ~600px a side on a 27" monitor. Widening that single column
// is the wrong repair — an 1100px line of place cards reads worse, not better.
// The width becomes a second column instead: the feed keeps a readable measure
// and the reclaimed space carries app/components/HomeAside.js.
//
// WF_WIDE_COL is kept, and is now DERIVED rather than dictated: the page width
// is min(WF_WIDE_MAX, 100vw - 2*WF_WIDE_PAD), which at exactly WF_WIDE_BP
// (1180 - 120) is 1060 — the same number, so nothing about where this tier
// begins has moved. Above that it grows to WF_WIDE_MAX instead of pinning.
//
// WHY THE CAP IS 1320 AND NOT "as wide as it goes": at 1320 the feed column is
// 1320 - 332 - 28 = 960px, which is where a two-line place card with a 108px
// thumbnail stops gaining and starts stretching. Past that the row is longer
// than the eye wants to track back.
export const WF_WIDE_PAD = 60;
export const WF_WIDE_MAX = 1320;
export const WF_ASIDE_COL = 332;
export const WF_ASIDE_GAP = 28;
export const WF_LAYOUT_CSS = `.wf-navtabs,.wf-navsubs-row,.wf-dests,.wf-mapfp-scroll,.wf-intent-proof,.wf-place-card-highlights,.wf-catrow,.wf-hooks,.wf-discovery-grid,.wf8-track,.wf8-pcrail,.wf8-grail,.matches{overscroll-behavior-x:contain}.wf-search-row.is-suggesting{z-index:40}.wf-dests.is-covered{pointer-events:none}@keyframes wfsk{0%{background-position:200% 0}100%{background-position:-200% 0}}.wf-sk{background:linear-gradient(90deg,#161B22 25%,#1D242E 37%,#161B22 63%);background-size:200% 100%;animation:wfsk 1.4s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.wf-sk{animation:none}}.wf-catrow{position:relative}.wf-catrow::-webkit-scrollbar{display:none}.wf-cattile:active{transform:scale(.96)}.wf-catwrap{position:relative}@keyframes wfcatsweep{0%{transform:translateX(-100%)}100%{transform:translateX(150%)}}.wf-catwrap.is-coach:before{content:"";position:absolute;top:0;bottom:8px;left:0;width:40%;border-radius:14px;pointer-events:none;z-index:0;background:linear-gradient(100deg,rgba(249,115,22,0) 0%,rgba(249,115,22,.17) 50%,rgba(249,115,22,0) 100%);animation:wfcatsweep 2.5s cubic-bezier(.4,0,.2,1) .8s 3 both}.wf-subwrap{overflow:hidden;max-height:0;opacity:0;transform:translateY(-9px);transition:max-height .32s cubic-bezier(.2,.85,.3,1),opacity .2s ease,transform .28s cubic-bezier(.2,.85,.3,1)}.wf-subwrap.is-open{max-height:120px;opacity:1;transform:translateY(0)}@keyframes wfsubin{from{opacity:0;transform:translateY(-7px) scale(.97)}to{opacity:1;transform:none}}.wf-subwrap.is-open .wf-subchip{animation:wfsubin .32s cubic-bezier(.2,.85,.3,1) both}@keyframes wfcathint{0%,100%{opacity:.62}50%{opacity:1}}.wf-catlead-hint.is-coach{animation:wfcathint 1.9s ease-in-out 4}@media (prefers-reduced-motion:reduce){.wf-catwrap.is-coach:before,.wf-catlead-hint.is-coach,.wf-subwrap.is-open .wf-subchip{animation:none}.wf-subwrap{transition:none;transform:none}}.wf-shell{max-width:480px}.wf-col-main{flex:1;min-width:0}.wf-col-side{display:block;margin:18px 0 4px}.wf-fullbleed{margin-left:-12px;margin-right:-12px}.wf-hooks{display:block;margin:0 0 14px}.wf-hook-card{width:100%;height:152px}.wf-topbar{box-shadow:inset 0 1px 0 rgba(255,255,255,.025),0 8px 20px rgba(0,0,0,.12)}.wf-topbar:after{content:"";position:absolute;left:14px;right:14px;bottom:-1px;height:1px;background:linear-gradient(90deg,transparent,rgba(249,115,22,.48),transparent);opacity:.6}.wf-wordmark{display:flex;align-items:center;gap:5px;cursor:pointer;flex-shrink:0;filter:drop-shadow(0 4px 12px rgba(0,0,0,.3))}.wf-wordmark-text,.wf-wordmark-pin{display:block;flex:none;background-image:url("/brand/wayfind-wordmark-transparent-v2.png");background-image:image-set(url("/brand/opt/wordmark-400.avif") type("image/avif"),url("/brand/opt/wordmark-400.webp") type("image/webp"));background-repeat:no-repeat}.wf-wordmark-text{width:117.4px;height:39.06px;background-size:151.2px 39.06px;background-position:left center}.wf-wordmark-pin{width:31.65px;height:36.54px;background-size:141.45px 36.54px;background-position:right center}.wf-event-share-card{transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}.wf-event-share-card:hover{transform:translateY(-2px);border-color:rgba(203,213,225,.42)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.075),0 14px 30px rgba(0,0,0,.34)!important}.wf-weather-button,.wf-signin-button,.wf-vibe-button{transition:background .18s ease,border-color .18s ease,transform .18s ease}.wf-weather-button:hover{background:rgba(255,255,255,.04)!important;border-radius:10px}.wf-signin-button:hover,.wf-vibe-button:hover{border-color:rgba(249,115,22,.5)!important;transform:translateY(-1px)}.wf-search-row{filter:drop-shadow(0 8px 14px rgba(0,0,0,.18))}.wf-search-input{transition:border-color .18s ease,background .18s ease}.wf-search-input:focus{border-color:rgba(203,213,225,.72)!important;background:#151D29!important}.wf-search-submit{box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 7px 14px rgba(249,115,22,.22);transition:filter .18s ease,transform .18s ease}.wf-search-submit:hover{filter:brightness(1.06);transform:translateX(1px)}.wf-bottom-nav{gap:3px;padding:5px 5px 6px!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.035),0 -9px 24px rgba(0,0,0,.14)}@media(display-mode:standalone){.wf-bottom-nav{padding-bottom:env(safe-area-inset-bottom)!important}}.wf-bottom-nav-item{position:relative;min-height:66px;transition:color .18s ease,transform .18s ease}.wf-bottom-nav-icon{width:32px;height:28px;display:grid;place-items:center}.wf-bottom-nav-item.is-active:before{content:"";position:absolute;top:0;width:24px;height:2px;border-radius:0 0 99px 99px;background:#F97316;box-shadow:0 2px 8px rgba(249,115,22,.6)}.wf-bottom-nav-item.is-active .wf-bottom-nav-icon{filter:drop-shadow(0 2px 6px rgba(249,115,22,.28))}.wf-bottom-nav-item.is-active .wf-bottom-nav-label{letter-spacing:.12px}.wf-discovery-visual{position:relative;min-height:188px;overflow:hidden;border-radius:20px;background:#0D1117;box-shadow:0 16px 38px rgba(0,0,0,.28)}.wf-discovery-visual picture{position:absolute;inset:0;display:block}.wf-discovery-visual img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.wf-discovery-visual:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(3,8,14,.9) 0%,rgba(3,8,14,.62) 43%,rgba(3,8,14,.1) 78%),linear-gradient(0deg,rgba(3,8,14,.42),transparent 60%)}.wf-discovery-copy{position:relative;z-index:1;display:flex;flex-direction:column;justify-content:flex-end;height:188px;max-width:300px;padding:20px;color:#F8FAFC}.wf-discovery-kicker{font-size:10px;font-weight:800;letter-spacing:1.1px;color:#FB923C}.wf-discovery-title{margin-top:7px;font-size:22px;font-weight:800;line-height:1.08;letter-spacing:-.45px}.wf-discovery-text{margin-top:7px;font-size:12.5px;font-weight:600;line-height:1.42;color:#D8E0EA}.wf-navtabs{display:flex;gap:18px;overflow-x:auto;scrollbar-width:none;margin:0 0 8px;padding:0 2px}.wf-navtabs::-webkit-scrollbar{display:none}.wf-navtab{position:relative;display:inline-flex;align-items:center;gap:7px;flex:0 0 auto;padding:5px 0 10px;background:none;border:0;cursor:pointer;font-size:14px;font-weight:600;color:#8A96AE;white-space:nowrap;transition:color .16s ease}.wf-navtab:hover{color:#CBD4E8}.wf-navtab.is-on{color:#FFFFFF;font-weight:800}.wf-navtab.is-on:after{content:"";position:absolute;left:0;right:0;bottom:4px;height:2.5px;border-radius:2px;background:#F97316}.wf-navtab:focus-visible{outline:2px solid #F97316;outline-offset:2px;border-radius:6px}.wf-navtab{text-decoration:none}.wf-navtab.is-filter{cursor:default;text-decoration:underline dotted rgba(255,255,255,.28);text-underline-offset:5px}.wf-navtab.is-filter:hover{color:#CBD4E8;text-decoration-color:rgba(255,255,255,.5)}.wf-navtab.is-filter.is-on:after{height:2px;background:rgba(249,115,22,.55);border-radius:1px}.wf-navsubs{overflow:hidden;max-height:0;opacity:0;transition:max-height .2s ease-out,opacity .18s ease-out;margin:0 0 6px}.wf-navsubs.is-open{max-height:96px;opacity:1}.wf-navsubs-row{display:flex;gap:16px;overflow-x:auto;scrollbar-width:none;padding:2px 2px 4px;border-top:1px solid #22272E;padding-top:8px}.wf-navsubs-row::-webkit-scrollbar{display:none}.wf-navsub{position:relative;flex:0 0 auto;display:inline-flex;align-items:center;padding:5px 2px 10px;background:none;border:0;color:#8A96AE;font-size:13px;font-weight:600;white-space:nowrap;cursor:pointer;text-decoration:none;transition:color .16s ease;animation:wfsubin .3s cubic-bezier(.2,.85,.3,1) both}.wf-navsub:hover{color:#CBD4E8}.wf-navsub.is-on{color:#FFFFFF;font-weight:800}.wf-navsub.is-on:after{content:"";position:absolute;left:0;right:0;bottom:4px;height:2.5px;border-radius:2px;background:#F97316}.wf-navsub:focus-visible{outline:2px solid #F97316;outline-offset:2px}.wf-navsub-all{color:#FB923C;font-weight:750}.wf-navsub-all:hover{color:#FFC58F}@media (prefers-reduced-motion:reduce){.wf-navsubs{transition:none}.wf-navsub{animation:none}}.wf-scope-wrap{position:relative;flex:0 0 auto}.wf-scope{display:flex;align-items:center;gap:5px;height:48px;padding:0 12px;background:#1D2536;border:1.5px solid #30363D;border-right:none;border-radius:14px 0 0 14px;color:#B7C2D8;font-size:13px;font-weight:650;cursor:pointer;white-space:nowrap}.wf-scope:hover{background:#242D40}.wf-scope:focus-visible{outline:2px solid #F97316;outline-offset:-2px}.wf-search-row.has-scope .wf-search-input{border-radius:0!important;border-left:none!important}.wf-scope-menu{position:absolute;top:calc(100% + 8px);left:0;z-index:60;min-width:216px;margin:0;padding:6px;list-style:none;background:rgba(16,22,33,.94);backdrop-filter:blur(18px) saturate(1.25);-webkit-backdrop-filter:blur(18px) saturate(1.25);border:1px solid rgba(255,255,255,.09);border-radius:14px;box-shadow:0 24px 56px rgba(0,0,0,.62),0 3px 10px rgba(0,0,0,.45);transform-origin:top left;animation:wfscopein .22s cubic-bezier(.2,.85,.3,1) both}@keyframes wfscopein{from{opacity:0;transform:translateY(-7px) scale(.965)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.wf-scope-menu{animation:none}}.wf-scope-menu li{padding:11px 12px;border-radius:9px;font-size:13.5px;font-weight:650;color:#E7EDF5;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wf-scope-menu li:hover,.wf-scope-menu li[aria-selected="true"]{background:rgba(249,115,22,.16);color:#FFC2A2}.wf-scope-cur{display:flex;align-items:center;gap:9px;color:#fff!important;font-weight:750!important}.wf-scope-cur svg{flex:0 0 auto;color:#F97316}.wf-scope-sep{height:1px;margin:6px 4px;padding:0!important;background:rgba(255,255,255,.08);cursor:default!important}.wf-scope-sep:hover{background:rgba(255,255,255,.08)!important}.wf-scope-label{padding:7px 12px 3px!important;font-size:10.5px!important;font-weight:800!important;letter-spacing:.12em;text-transform:uppercase;color:#8B96A9!important;cursor:default!important}.wf-scope-label:hover{background:none!important;color:#8B96A9!important}.wf-dests{display:flex;align-items:stretch;gap:2px;margin:9px 0 -6px;overflow-x:auto;scrollbar-width:none;border-top:1px solid #22272E}.wf-dests::-webkit-scrollbar{display:none}.wf-dest{position:relative;display:inline-flex;align-items:center;gap:7px;flex:0 0 auto;padding:10px 12px 11px;background:none;border:0;cursor:pointer;font-size:13.5px;font-weight:600;color:#94A1BC;white-space:nowrap;text-decoration:none;transition:color .16s ease}.wf-dest:hover{color:#E4EAF7}.wf-dest.is-on{color:#FFFFFF;font-weight:800}.wf-dest.is-on:after{content:"";position:absolute;left:12px;right:12px;bottom:4px;height:2.5px;border-radius:2px;background:#F97316}.wf-dest-opener.is-on{color:#FB923C}.wf-dest-opener.is-on:after{background:#FB923C}.wf-dest:focus-visible{outline:2px solid #F97316;outline-offset:-2px;border-radius:8px}.wf-scpanel{margin:6px 0 -6px;padding:4px 0 2px;border-top:1px solid #22272E;animation:wfscin .18s ease-out}@keyframes wfscin{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.wf-scpanel{animation:none}}@media(max-width:560px){.wf-navtabs{gap:14px}.wf-navtab{font-size:13px}.wf-dest{padding:10px 10px 11px;font-size:12.5px;gap:6px}.wf-scope{font-size:12.5px;padding:0 10px}}@media(min-width:${WF_DESKTOP_BP}px){.wf-shell{max-width:1280px}.wf-navtab{font-size:15px}.wf-dest{font-size:14px;padding:10px 14px 12px}.wf-scope{height:58px;font-size:14px;border-radius:17px 0 0 17px}.wf-explore{max-width:760px;margin:0 auto}.wf-cols{display:block;width:100%;max-width:800px;margin:16px auto 0}.wf-col-main{width:100%;max-width:800px;margin:0 auto}.wf-col-side{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:start}.wf-topbar{padding-left:max(28px,calc((min(100vw,1280px) - 800px)/2))!important;padding-right:max(28px,calc((min(100vw,1280px) - 800px)/2))!important;padding-top:20px!important;padding-bottom:18px!important}.wf-topbar-row{margin-bottom:14px!important}.wf-wordmark{gap:6px}.wf-wordmark-text{width:139.77px;height:46.5px;background-size:179.99px 46.5px}.wf-wordmark-pin{width:37.68px;height:43.5px;background-size:168.38px 43.5px}.wf-weather-button{padding:5px 8px!important}.wf-weather-button span:first-child{font-size:21px!important}.wf-signin-button{padding:10px 16px!important;font-size:13px!important}.wf-vibe-button{width:48px!important;height:48px!important}.wf-search-input{height:58px!important;font-size:17px!important;border-radius:17px 0 0 17px!important}.wf-search-submit{width:62px!important;height:58px!important;border-radius:0 17px 17px 0!important;font-size:25px!important}.wf-bottom-nav{left:50%!important;right:auto!important;bottom:18px!important;transform:translateX(-50%);width:min(800px,calc(100vw - 44px));max-width:none!important;margin:0!important;padding:9px!important;border:1px solid #30363D!important;border-radius:22px;box-shadow:inset 0 1px 0 rgba(255,255,255,.045),0 18px 48px rgba(0,0,0,.42);backdrop-filter:blur(18px)}.wf-bottom-nav-item{min-height:72px;padding:10px 12px!important;border-radius:0!important}.wf-bottom-nav-icon{width:36px;height:31px;transform:scale(1.1)}.wf-bottom-nav-label{font-size:12px!important;letter-spacing:.05px}.wf-bottom-nav-item:hover{background:rgba(255,255,255,.025)!important}.wf-discovery-empty{padding-top:30px!important}.wf-discovery-heading{display:block!important;margin-bottom:16px!important}.wf-discovery-heading>div:first-child{margin:0!important;flex:initial!important}.wf-discovery-visual{min-height:224px;border-radius:22px}.wf-discovery-copy{height:224px;max-width:365px;padding:28px}.wf-discovery-title{font-size:27px}.wf-discovery-text{font-size:13.5px;max-width:300px}.wf-discovery-link{transition:transform .16s ease,border-color .16s ease}.wf-discovery-link:hover{transform:translateY(-1px);border-color:rgba(203,213,225,.35)!important}.wf-scrollarea{padding-bottom:calc(34px + env(safe-area-inset-bottom))!important}.wf-hooks{display:flex;flex-wrap:wrap;overflow-x:visible;padding-left:12px;padding-right:12px;margin:0 -12px 14px}.wf-hook-card{width:290px;height:185px}.wf-catrow{overflow-x:visible!important}.wf-cattile{flex:1 1 auto!important;justify-content:center!important}.wf-discovery-grid{overflow-x:visible!important}.wf-discovery-link{flex:1 1 auto!important;justify-content:center!important}}@media(min-width:${WF_WIDE_BP}px){.wf-shell{--wf-page:min(${WF_WIDE_MAX}px,calc(100vw - ${WF_WIDE_PAD * 2}px));--wf-side:${WF_ASIDE_COL}px;--wf-gutter:${WF_ASIDE_GAP}px;--wf-main:var(--wf-page);--wf-feed:min(960px,var(--wf-page))}.wf-shell{max-width:none}.wf-cols{display:block;width:100%;max-width:var(--wf-page);margin:16px auto 0}.wf-col-main{width:100%;max-width:var(--wf-feed);margin:0 auto}.wf-col-side{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;align-items:start;width:100%;max-width:none;margin:22px 0 6px}.wf-explore{max-width:var(--wf-page)}.wf-topbar{padding-left:max(28px,calc((100vw - var(--wf-page))/2))!important;padding-right:max(28px,calc((100vw - var(--wf-page))/2))!important}.wf-topbar:after{left:max(28px,calc((100vw - var(--wf-page))/2));right:max(28px,calc((100vw - var(--wf-page))/2))}.wf-bottom-nav{left:max(28px,calc((100vw - var(--wf-page))/2))!important;right:auto!important;transform:none;width:min(var(--wf-main),calc(100vw - 56px));box-sizing:border-box}.wf-search-row{max-width:var(--wf-main)}.wf-catrow{max-width:none;margin:0;gap:9px}.wf-catlead{max-width:none;margin:0}.wf-cattile:hover{filter:brightness(1.12)}.wf-subwrap.is-open{max-height:140px}}`;
export const WF_SEARCH_CSS = `.wf-search-row{filter:drop-shadow(0 11px 20px rgba(0,0,0,.24));transition:filter .2s ease}.wf-search-row:focus-within{filter:drop-shadow(0 13px 25px rgba(0,0,0,.34)) drop-shadow(0 0 7px rgba(148,163,184,.06))}.wf-search-row>div:first-child{border-radius:14px 0 0 14px}.wf-search-icon{color:#AEB9C8;transition:color .18s ease}.wf-search-row:focus-within .wf-search-icon{color:#E2E8F0}.wf-search-input{background:linear-gradient(135deg,#182130,#111923)!important;border-color:#354153!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.045),inset 0 -1px 0 rgba(0,0,0,.25);transition:border-color .18s ease,background .18s ease,box-shadow .18s ease}.wf-search-input::placeholder{color:#8190A3;opacity:1}.wf-search-input:focus,.wf-search-input:focus-visible{outline:none!important;outline-offset:0!important;border-color:rgba(203,213,225,.72)!important;background:linear-gradient(135deg,#1A2330,#121923)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.075),inset 0 0 0 1px rgba(203,213,225,.08),0 0 0 1px rgba(203,213,225,.14)!important}.wf-search-submit{background:linear-gradient(180deg,#FF9B47 0%,#F97316 55%,#E95A0C 100%)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.34),0 8px 18px rgba(249,115,22,.27);transition:filter .18s ease,transform .18s ease,box-shadow .18s ease}.wf-search-submit:hover{filter:brightness(1.06);transform:translateX(1px);box-shadow:inset 0 1px 0 rgba(255,255,255,.42),0 10px 20px rgba(249,115,22,.34)}@media(min-width:${WF_DESKTOP_BP}px){.wf-topbar{padding-top:18px!important;padding-bottom:16px!important}.wf-topbar-row{margin-bottom:10px!important}.wf-search-row>div:first-child{border-radius:17px 0 0 17px}.wf-search-icon{left:16px!important}.wf-search-input{padding-left:43px!important}}` +
  /* v8.28 — 390px placeholder fit. The official string is "Search a place or
     city" (aria-label + placeholder). The location chip + 38px icon gutter +
     54px submit left ~110px of text at 16px, which clipped to "Search a place (".
     Narrow the chip, drop the decorative icon, and size the field so the
     official string stays fully readable. Do not invent a new brand line. */
  `.wf-search-row{min-width:0}.wf-search-field{flex:1;min-width:0;position:relative}.wf-scope-city{max-width:92px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wf-search-input{min-width:0}` +
  `@media(max-width:430px){.wf-scope{padding:0 8px;gap:4px}.wf-scope-city{max-width:56px}.wf-search-icon{display:none!important}.wf-search-input{font-size:14px!important;padding-left:12px!important;padding-right:8px!important}.wf-search-submit{width:46px!important}}`;
export const WF_PLACE_CARD_CSS = `
.wf-ticket-pill{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 9px 0 8px;border-radius:7px;text-decoration:none;position:relative;color:#FFD9AE;background:linear-gradient(180deg,rgba(253,186,116,.17),rgba(249,115,22,.10));border:1px solid rgba(253,186,116,.44);box-shadow:inset 0 1px 0 rgba(255,236,209,.18),0 1px 0 rgba(0,0,0,.34);transition:background .18s ease,border-color .18s ease,box-shadow .18s ease,transform .18s ease}
.wf-ticket-pill svg{width:13px;height:13px;display:block;flex:0 0 13px;color:#FDBA74}
.wf-ticket-pill-lb{font-size:9.5px;font-weight:800;letter-spacing:.085em;text-transform:uppercase;color:#FFC98A;line-height:1}
.wf-ticket-pill-sep{flex:0 0 1px;width:1px;height:12px;background:repeating-linear-gradient(180deg,rgba(253,186,116,.6) 0 2px,transparent 2px 4px)}
.wf-ticket-pill-mr{font-size:11px;font-weight:700;line-height:1;color:#FFEAD2;max-width:104px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wf-ticket-pill-ar{font-size:10px;font-weight:800;line-height:1;color:rgba(255,201,138,.82)}
@media(hover:hover){.wf-ticket-pill:hover{background:linear-gradient(180deg,rgba(253,186,116,.27),rgba(249,115,22,.17));border-color:rgba(253,186,116,.72);box-shadow:inset 0 1px 0 rgba(255,236,209,.26),0 5px 16px -7px rgba(249,115,22,.75);transform:translateY(-1px)}}
.wf-ticket-pill:active{transform:none}
.wf-ticket-pill:focus-visible{outline:2px solid #FDBA74;outline-offset:2px}
@media(max-width:390px){.wf-ticket-pill{height:24px;gap:5px;padding:0 8px 0 7px}.wf-ticket-pill-mr{max-width:82px}}
@media (prefers-reduced-motion:reduce){.wf-ticket-pill{transition:none}.wf-ticket-pill:hover{transform:none}}

.wf-place-card,.wf-place-card *,.wf-place-card *::before,.wf-place-card *::after{box-sizing:border-box}
.wf-place-card{--wf-card-h:268px;height:var(--wf-card-h);box-sizing:border-box;position:relative}
.wf-place-card-layout{height:100%;box-sizing:border-box}
.wf-place-card-monogram{height:100%;box-sizing:border-box}
.wf-place-card-content{display:flex;flex-direction:column;height:100%;box-sizing:border-box}
.wf-place-card-name{display:-webkit-box!important;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.wf-place-card-meta{flex-wrap:nowrap!important;overflow:hidden;white-space:nowrap}
.wf-place-card-highlights{display:flex;flex-wrap:nowrap;align-items:center;max-height:30px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-webkit-overflow-scrolling:touch;touch-action:pan-x pan-y;mask-image:linear-gradient(90deg,#000 90%,transparent 99.5%);-webkit-mask-image:linear-gradient(90deg,#000 90%,transparent 99.5%)}.wf-place-card-highlights::-webkit-scrollbar{display:none}.wf-place-card-highlights-wrap{position:relative;min-width:0}.wf-pill-more{position:absolute;right:-2px;top:50%;transform:translateY(-50%);pointer-events:none;color:#F97316;font-size:15px;font-weight:800;line-height:1;text-shadow:0 0 8px rgba(11,14,26,.9);animation:wfPillMore 1.8s ease-in-out 3}@keyframes wfPillMore{0%,100%{opacity:.85;transform:translateY(-50%) translateX(0)}50%{opacity:1;transform:translateY(-50%) translateX(3px)}}@media (prefers-reduced-motion:reduce){.wf-pill-more{animation:none}}.wf-place-card-highlights>button,.wf-place-card-highlights>span,.wf-place-card-highlights>a{flex:0 0 auto;white-space:nowrap;align-self:center;max-height:100%}
.wf8-pcrail .wf-place-card{box-sizing:border-box;margin-bottom:0!important}
.wf8-pcrail .wf-place-card-actions{padding-top:10px}
.wf-place-card{
  position:relative;
  margin-bottom:12px!important;
  overflow:hidden;
  border-radius:17px!important;
  border-width:1px;border-style:solid;
  border-color:rgba(159,177,203,.25)!important;
  background:linear-gradient(145deg,rgba(255,255,255,.035),transparent 36%),#111824!important;
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
.wf-place-card-layout>img,.wf-place-card-layout>.wf-place-card-media{position:relative;overflow:hidden;width:var(--wf-place-card-media)!important;height:100%!important;min-height:176px!important}
.wf-place-card-media>:first-child{display:block;width:100%!important;height:100%!important;min-height:176px!important;object-fit:cover}
.wf-place-card.is-no-take .wf-place-card-layout,
.wf-place-card.is-no-take .wf-place-card-layout>*,
.wf-place-card.is-no-take .wf-place-card-monogram{min-height:0}
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
.wf-place-card-title-row{display:flex!important;align-items:flex-start;gap:7px!important}
.wf-place-card-rank{
  position:absolute!important;
  z-index:4;
  top:11px;
  left:10px;
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
.wf-place-card-score{position:absolute;z-index:5;inset:10px 10px auto auto;pointer-events:auto;filter:none!important}
.wf-place-card-score~.wf-place-card-layout .wf-place-card-heading{padding-right:86px}
.wf-place-card-score .wayfind-score-badge[data-score-band="excellent"]{--wf-score-color:#25C26E;--wf-score-tint:rgba(37,194,110,.10);--wf-score-border:rgba(37,194,110,.62);--wf-score-glow:rgba(37,194,110,.20)}
.wf-place-card-score .wayfind-score-badge[data-score-band="strong"]{--wf-score-color:#FF6B18;--wf-score-tint:rgba(255,107,24,.11);--wf-score-border:rgba(255,107,24,.68);--wf-score-glow:rgba(255,107,24,.20)}
.wf-place-card-score .wayfind-score-badge[data-score-band="fair"]{--wf-score-color:#F2C94C;--wf-score-tint:rgba(242,201,76,.11);--wf-score-border:rgba(242,201,76,.68);--wf-score-glow:rgba(242,201,76,.18)}
.wf-place-card-score .wayfind-score-badge[data-score-band="low"]{--wf-score-color:#E5484D;--wf-score-tint:rgba(229,72,77,.11);--wf-score-border:rgba(229,72,77,.66);--wf-score-glow:rgba(229,72,77,.18)}
.wf-place-card-score .wayfind-score-badge{
  width:100%;
  min-width:0;
  height:40px;
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
.wf-place-card-meta{display:flex!important;align-items:center;gap:4px 12px!important;margin:8px 0 6px!important;color:#A8B2C2}
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
  border:1px solid rgba(148,163,184,.28);
  border-radius:999px;
  background:linear-gradient(110deg,rgba(51,65,85,.62),rgba(15,23,42,.38));
  color:#E2E8F0;
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
  background:#334155;
  color:#F8FAFC;
  font-size:9px;
  font-weight:950;
  box-shadow:0 3px 10px rgba(0,0,0,.24),inset 0 1px rgba(255,255,255,.12);
}
.wf-place-card-award.is-rank-1,.wf-place-card-award.is-rank-2,.wf-place-card-award.is-rank-3{border-color:rgba(148,163,184,.28);background:linear-gradient(110deg,rgba(51,65,85,.62),rgba(15,23,42,.38));color:#E2E8F0}
.wf-place-card-award.is-rank-1 .wf-place-card-award-icon,.wf-place-card-award.is-rank-2 .wf-place-card-award-icon,.wf-place-card-award.is-rank-3 .wf-place-card-award-icon{background:#334155;color:#F8FAFC}
.wf-place-card-award.is-curator{border-color:rgba(244,212,119,.52);background:linear-gradient(110deg,rgba(244,212,119,.17),rgba(244,212,119,.025));color:#F7D982}
.wf-place-card-award.is-curator .wf-place-card-award-icon{background:radial-gradient(circle at 35% 28%,#FFF1BC,#E1A72D 58%,#80500A 100%);color:#2A1A03}
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
    display:-webkit-box;
  -webkit-line-clamp:2;
  -webkit-box-orient:vertical;
  text-overflow:ellipsis;
}
.wf-place-card-actions{align-items:center;gap:5px!important;margin-top:auto!important;padding-top:9px;flex-wrap:wrap!important;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}
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
.wf-place-card-save.is-active{color:#0D1117!important;border-color:#F97316!important;background:#F97316!important}.wf-place-card-trip.is-active{color:#0D1117!important;border-color:#38BDF8!important;background:#38BDF8!important}
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
.wf-sheet-card-actions{
  display:grid!important;
  grid-template-columns:minmax(64px,.9fr) 42px 42px minmax(76px,1fr);
  gap:6px!important;
  flex-wrap:nowrap!important;
  width:100%;
}
.wf-sheet-card-actions>.wf-place-card-save,
.wf-sheet-card-actions>.wf-place-card-share{min-width:0!important;margin-left:0!important;padding-inline:8px!important}
.wf-sheet-card-actions:has(.wf-place-card-book){grid-template-columns:minmax(70px,.8fr) minmax(64px,.8fr) 42px 42px minmax(76px,1fr)}
.wf-place-card.is-liked{border-color:rgba(76,224,179,.35)!important}
.wf-place-card.is-disliked{border-color:rgba(248,113,113,.28)!important}
@media(max-width:430px){
  .wf-place-card-layout{--wf-place-card-media:88px}
  .wf-place-card-layout>img,.wf-place-card-layout>.wf-place-card-media{width:88px!important}
  .wf-place-card-content{padding-inline:10px!important}
  .wf-place-card-name{font-size:15px!important}
  .wf-place-card-meta>span{font-size:9.75px!important}
  .wf-place-card-highlights>button{font-size:9px!important}
}
@media(min-width:${WF_DESKTOP_BP}px){
  .wf-place-card-layout{--wf-place-card-media:108px}
  .wf-place-card-layout>img,.wf-place-card-layout>.wf-place-card-media{width:108px!important}
  .wf-place-card-name{font-size:17px!important}
}

.wf-rail{
  display:flex;
  align-items:stretch;
  gap:10px;
  overflow-x:auto;
  overflow-y:hidden;
    overscroll-behavior-inline:contain;
  padding-bottom:4px;
  scroll-snap-type:x mandatory;
  -webkit-overflow-scrolling:touch;
  scrollbar-width:none;
}
.wf-rail::-webkit-scrollbar{display:none}
.wf-rail>.wf-rail-card{
  flex:0 0 100%;
  width:100%;
  margin-bottom:0!important;
  scroll-snap-align:start;
}
.wf-rail-card{display:flex;flex-direction:column;cursor:pointer}
.wf-rail-events>.wf-rail-card{min-height:245px}
.wf-rail-card>.wf-place-card-layout{flex:1}
.wf-rail-card .wf-place-card-content{padding:12px 12px 10px!important}
.wf-rail-card .wf-place-card-name{
  display:-webkit-box;
  -webkit-line-clamp:2;
  -webkit-box-orient:vertical;
  overflow:hidden;
  min-height:2.3em;
  font-size:15px!important;
  line-height:1.15!important;
}
.wf-rail-card .wf-place-card-meta{flex-wrap:nowrap!important;overflow:hidden;gap:4px 10px!important;margin:7px 0 6px!important}
.wf-rail-card .wf-place-card-highlights{flex-wrap:nowrap!important;overflow:hidden}
.wf-rail-top40 .wf-place-card-highlights{flex-wrap:wrap!important;overflow:visible;max-height:none;mask-image:none;-webkit-mask-image:none}
.wf-rail-card .wf-place-card-award{margin-bottom:6px}
.wf-rail-card .wf-place-card-take{white-space:normal!important;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:6px}
.wf-rail-card-cta{
  display:flex!important;
  align-items:center;
  justify-content:center;
  min-height:34px;
  margin-top:auto;
  padding:0 12px;
  border:1px solid rgba(249,115,22,.5);
  border-radius:11px;
  background:linear-gradient(180deg,rgba(249,115,22,.22),rgba(249,115,22,.07));
  color:#FFB27A!important;
  font-size:11px;
  font-weight:800;
  letter-spacing:.2px;
  text-decoration:none;
  transition:border-color .18s ease,background .18s ease;
}
.wf-rail-card-cta:hover,.wf-rail-card-cta:focus-visible{border-color:rgba(255,155,80,.85);background:linear-gradient(180deg,rgba(249,115,22,.3),rgba(249,115,22,.12))}
.wf-rail-card .wf-place-card-actions{margin-top:auto!important;padding-top:8px}
.wf-rail-card .wf-rail-card-cta~.wf-place-card-actions{margin-top:0!important;padding-top:6px}
.wf-rail-card .wf-sheet-card-actions{grid-template-columns:minmax(50px,1fr) 38px 38px minmax(56px,1fr);gap:5px!important}
.wf-rail-card .wf-place-card-like,.wf-rail-card .wf-place-card-dislike{width:38px!important;min-width:38px!important;height:36px!important;min-height:36px!important;flex:0 0 38px}
.wf-rail-card .wf-place-card-like svg,.wf-rail-card .wf-place-card-dislike svg{width:17px;height:17px}
.wf-rail-card .wf-place-card-actions>a,.wf-rail-card .wf-place-card-actions>button{min-height:36px;padding:0 7px!important;font-size:10px!important}

.wf-rail-nav{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 7px}
.wf-rail-nav-hint{color:#8B97A8;font-size:11px;font-weight:700;letter-spacing:.2px}
.wf-rail-nav-hint b{color:#CBD5E1;font-weight:800}
.wf-rail-nav-btns{display:flex;gap:6px}
.wf-rail-nav-btn{
  display:grid;
  width:32px;
  height:32px;
  align-items:center;
  place-items:center;
  border:1px solid rgba(159,177,203,.28);
  border-radius:999px;
  background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.012)),#0B111A;
  color:#DFE5EE;
  cursor:pointer;
  font-size:17px;
  font-weight:800;
  line-height:1;
  transition:border-color .18s ease,background .18s ease,transform .18s ease;
}
.wf-rail-nav-btn:hover{border-color:rgba(249,115,22,.6);color:#FFB27A;transform:translateY(-1px)}
.wf-rail-nav-btn:focus-visible{outline:2px solid rgba(249,115,22,.72);outline-offset:2px}

.wf-place-card-score .wf-rail-when{width:100%;min-width:0;height:40px}
.wf-rail-when{
  --wf-when-color:#7FA6C8;
  --wf-when-tint:rgba(127,166,200,.10);
  --wf-when-border:rgba(127,166,200,.58);
  --wf-when-glow:rgba(127,166,200,.16);
  display:inline-flex;
  align-items:stretch;
  box-sizing:border-box;
  width:98px;
  min-width:98px;
  height:46px;
  overflow:hidden;
  border:1.5px solid var(--wf-when-border);
  border-radius:13px;
  background:linear-gradient(135deg,var(--wf-when-tint),transparent 68%),rgba(5,13,17,.92);
  box-shadow:0 8px 20px rgba(0,0,0,.25),0 0 11px var(--wf-when-glow);
  line-height:1;
}
.wf-rail-when[data-when-tone="now"]{--wf-when-color:#FF6B18;--wf-when-tint:rgba(255,107,24,.13);--wf-when-border:rgba(255,107,24,.72);--wf-when-glow:rgba(255,107,24,.24)}
.wf-rail-when[data-when-tone="soon"]{--wf-when-color:#F2C94C;--wf-when-tint:rgba(242,201,76,.12);--wf-when-border:rgba(242,201,76,.68);--wf-when-glow:rgba(242,201,76,.2)}
.wf-rail-when-rail{
  display:flex;
  box-sizing:border-box;
  width:24px;
  flex-shrink:0;
  align-items:center;
  justify-content:center;
  background:linear-gradient(180deg,var(--wf-when-color),color-mix(in srgb,var(--wf-when-color) 72%,#071018));
  color:#071018;
  box-shadow:inset -1px 0 rgba(255,255,255,.12);
}
.wf-rail-when-rail svg{width:13px;height:13px}
.wf-rail-when-body{display:flex;box-sizing:border-box;flex:1;min-width:0;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:6px 5px;text-align:center}
.wf-rail-when-label{width:100%;overflow:hidden;color:#B8C2D0;font-size:6.5px;font-weight:800;letter-spacing:.7px;text-overflow:ellipsis;text-transform:uppercase;white-space:nowrap}
.wf-rail-when-value{width:100%;color:#F8FAFC;font-size:13.5px;font-weight:800;line-height:.98;white-space:nowrap}

.wf-place-card-award.is-creator{border-color:rgba(244,114,182,.42);background:linear-gradient(110deg,rgba(244,114,182,.16),rgba(244,114,182,.03));color:#F9A8D4}
.wf-place-card-award.is-creator .wf-place-card-award-icon{background:linear-gradient(145deg,#FDA4C8,#B83280);color:#2A0A18}

.wf-place-card-credit{
  display:flex;
  align-items:center;
  min-width:0;
  gap:8px;
  margin-top:auto;
  padding-top:10px;
  pointer-events:none;
}
.wf-place-card-credit~.wf-place-card-actions{margin-top:0!important;padding-top:8px}
.wf-pcc-name{
  min-width:0;
  flex:1 1 auto;
  overflow:hidden;
  color:#DCE4EE;
  font-size:11.5px;
  font-weight:750;
  letter-spacing:-.01em;
  line-height:1;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.wf-pcc-plat{
  display:inline-flex;
  flex:0 0 auto;
  height:17px;
  align-items:center;
  padding:0 7px;
  border:1px solid rgba(var(--pcc-rgb,255,0,80),.42);
  border-radius:999px;
  background:rgba(var(--pcc-rgb,255,0,80),.12);
  color:var(--pcc-ring,#FF0050);
  font-size:9px;
  font-weight:800;
  letter-spacing:.06em;
  line-height:1;
  text-transform:uppercase;
  white-space:nowrap;
}
.wf-pcc-stack{position:relative;display:flex;flex:0 0 auto;align-items:center}
.wf-pcc-head{
  position:relative;
  display:block;
  padding:1.5px;
  border-radius:50%;
  background:linear-gradient(150deg,var(--pcc-ring,#FF0050),rgba(255,255,255,.3) 58%,var(--pcc-ring,#FF0050));
  box-shadow:0 2px 10px rgba(0,0,0,.55),0 0 0 1.5px rgba(4,8,15,.88);
}
.wf-pcc-head+.wf-pcc-head{margin-left:-9px}
.wf-pcc-play{
  position:absolute;
  right:-3px;
  bottom:-3px;
  z-index:6;
  display:flex;
  width:13px;
  height:13px;
  align-items:center;
  justify-content:center;
  padding-left:1px;
  border:1.5px solid rgba(4,8,15,.92);
  border-radius:50%;
  background:var(--pcc-ring,#FF0050);
  color:#0B0E1A;
}
.wf-pcc-more{color:#94A3B8;font-size:10.5px;font-weight:800}
@media(max-width:390px){
  .wf-place-card-credit{gap:6px;padding-top:8px}
  .wf-pcc-plat{padding:0 6px;letter-spacing:.03em}
  .wf-pcc-name{font-size:11px}
}

@media(max-width:360px){
  .wf-rail-card .wf-place-card-content{padding-inline:9px!important}
  .wf-rail-card .wf-sheet-card-actions{grid-template-columns:minmax(42px,1fr) 34px 34px minmax(46px,1fr);gap:4px!important}
  .wf-rail-card .wf-place-card-like,.wf-rail-card .wf-place-card-dislike{width:34px!important;min-width:34px!important;flex:0 0 34px}
  .wf-rail-card .wf-place-card-actions>a,.wf-rail-card .wf-place-card-actions>button{padding:0 5px!important;font-size:9.5px!important}
}

.wf-rail-bridge{
  display:flex;
  flex:0 0 100%;
  width:100%;
  flex-direction:column;
  align-items:flex-start;
  justify-content:center;
  gap:5px;
  padding:16px 15px;
  border:1px dashed rgba(159,177,203,.3);
  border-radius:17px;
  background:linear-gradient(145deg,rgba(255,255,255,.03),transparent 46%),#101724;
  color:#F1F5F9;
  cursor:pointer;
  scroll-snap-align:start;
  text-align:left;
}
.wf-rail-bridge:hover{border-color:rgba(249,115,22,.5)}
.wf-rail-bridge-glyph{color:#F97316;font-size:22px;line-height:1}
.wf-rail-bridge-title{font-size:13px;font-weight:750;line-height:1.2}
.wf-rail-bridge-sub{color:#94A3B8;font-size:11px}

@media(min-width:${WF_DESKTOP_BP}px){
  .wf-rail{gap:12px}
  .wf-rail-card .wf-place-card-name{font-size:16px!important}
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

@keyframes wfDealGlow{
  0%,100%{box-shadow:0 0 0 0 rgba(249,115,22,0),0 4px 14px rgba(0,0,0,.25)}
  50%{box-shadow:0 0 26px 6px rgba(249,115,22,.38),0 4px 14px rgba(0,0,0,.25)}
}
.wf-deal-glow{animation:wfDealGlow 2.6s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){
  .wf-deal-glow{animation:none;box-shadow:0 0 16px 3px rgba(249,115,22,.24),0 4px 14px rgba(0,0,0,.25)}
}

@keyframes wfSocialGlow{
  0%,100%{box-shadow:0 0 0 0 rgba(var(--glow-rgb,255,0,80),0),0 4px 14px rgba(0,0,0,.25)}
  50%{box-shadow:0 0 26px 6px rgba(var(--glow-rgb,255,0,80),.42),0 4px 14px rgba(0,0,0,.25)}
}
.wf-social-glow{animation:wfSocialGlow 2.6s ease-in-out infinite}
@media (prefers-reduced-motion:reduce){
  .wf-social-glow{animation:none;box-shadow:0 0 16px 3px rgba(var(--glow-rgb,255,0,80),.3),0 4px 14px rgba(0,0,0,.25)}
}
.wf-place-card-sk{pointer-events:none}
.wf-place-card-sk-media{width:100%;height:100%;min-height:176px;border-radius:0}
.wf-place-card-sk-line{height:11px;border-radius:6px;margin:0 0 8px}
.wf-place-card-sk-line.is-title{height:16px;margin-top:6px}
.wf-place-card-sk-actions{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:auto;padding-top:10px}
.wf-place-card-sk-actions>.wf-sk{height:34px;border-radius:999px}
.wf8-pcrail>.wf-place-card-sk{flex:0 0 calc((100% - (var(--wf8-pcvis) - 1) * var(--wf8-pcgap)) / var(--wf8-pcvis));scroll-snap-align:start;margin-bottom:0!important}
.wf8-tile-sk{position:absolute;inset:12px 12px auto;z-index:1;pointer-events:none}
.wf8-tile.is-art-ready .wf8-tile-sk{display:none}
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
.wf-taste-btn.is-quiet{
  border:1px solid #2D3748;
  background:linear-gradient(135deg,rgba(28,34,48,.94),rgba(11,14,20,.92));
  color:#CBD5E1;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.05),inset 0 -1px 0 rgba(0,0,0,.3),0 12px 24px rgba(0,0,0,.22);
}
.wf-taste-btn.is-quiet:hover{border-color:#3E4A5F;box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 14px 26px rgba(0,0,0,.28)}
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

// ── THE MENU'S "SEE EVERY ONE" LINK (owner, 2026-08-09) ────────────────────
// The home menu's eight sections live in app/components/BestNearby.js and carry
// their chrome inline, next to the rows they have always styled. The only rule
// that has to be global is this one: the link that closes each intent rail sits
// inside a horizontally-scrolling flex container, and an inline <a> in there
// collapses to nothing without an explicit display and a tap target.
// THE PRE-PAINT COLLAPSE. `html[data-wf-rails~="<id>"]` is set by the blocking
// script in app/layout.js from the reader's stored preference, before anything
// paints. !important because the open/closed geometry is an inline style on the
// section body (BestNearby's SectionShell) and an inline style otherwise wins —
// once React hydrates it writes the same values, so nothing fights.
//
// AND THE OPEN DIRECTION, v7.29. The rule above could only ever CLOSE. Opening
// was an inline style written by React, which beats a stylesheet — so a reader
// whose stored set is smaller than the default watched those sections paint
// closed and then jump open once an effect ran. See the long note above
// applyCollapsedAttr in lib/railCollapse.js for how long that has been shipping
// and why the desktop default made fixing it non-optional.
//
// SCOPED TO :not([data-wf-rails-ready]) SO IT EXPIRES. It has to be !important
// to beat the inline max-height:0 in the server HTML, and an !important that
// never expires would also beat the numeric max-height React animates between —
// the accordion would open and close without a transition forever after. The
// marker is set by BestNearby after the commit that applies the real state, so
// this rule governs exactly the window it exists for: first paint to hydration.
export const WF_RAIL_COLLAPSED_CSS = RAIL_IDS.map((id) =>
  `html[data-wf-rails~="${id}"] [data-wf-section="${id}"]{display:none!important}\n`
  + `html[data-wf-rails]:not([data-wf-rails-ready]):not([data-wf-rails~="${id}"]) [data-wf-section="${id}"]{display:block!important}\n`
  + `html[data-wf-rails~="${id}"] #wf-sec-${id}{max-height:0!important;opacity:0!important;visibility:hidden!important}\n`
  + `html[data-wf-rails]:not([data-wf-rails-ready]):not([data-wf-rails~="${id}"]) #wf-sec-${id}{max-height:none!important;opacity:1!important;visibility:visible!important}`
).join("\n") + "\n";

export const WF_RAIL_SECTION_CSS = `
.wf-railsec-more{display:inline-flex;align-items:center;min-height:36px;margin-top:8px;padding:0;background:none;border:0;font:inherit;font-size:12.5px;font-weight:750;color:#FB923C;text-decoration:none;cursor:pointer}
.wf-railsec-more:hover,.wf-railsec-more:focus-visible{text-decoration:underline}
.wf-railsec-more:focus-visible{outline:2px solid #F97316;outline-offset:2px;border-radius:6px}
`;

// THE DESKTOP ASIDE (v7.29). Only the interactive chrome lives here — the
// aside's cards carry their own inline styles next to the copy they wrap, the
// same convention the rail sections use. What cannot be inline is the hover and
// focus behaviour of the two control shapes it introduces, and the reset that
// makes a <button> usable as a two-line list row without inheriting the UA's
// centred, 13px, system-font default.
//
// GEOMETRY IS NOT HERE ON PURPOSE. .wf-col-side's placement, stickiness and
// visibility are in WF_LAYOUT_CSS behind the wide media query, where every
// other layout dimension in this app lives (see the CLS note at the top of this
// file). Nothing in this block may set a width, a column or a display that
// depends on the viewport.
export const WF_ASIDE_CSS = `
.wf-aside-row{display:block;width:100%;padding:0;background:none;border:0;font:inherit;text-align:left;color:inherit;cursor:pointer;border-radius:8px;transition:opacity .16s ease,transform .16s ease}
.wf-aside-row:hover{opacity:.82;transform:translateX(2px)}
.wf-aside-row:focus-visible{outline:2px solid #F97316;outline-offset:3px}
.wf-aside-row-title{display:block;font-size:12.75px;font-weight:800;line-height:1.35;color:#F1F5F9}
.wf-aside-row-sub{display:block;margin-top:2px;font-size:10.5px;font-weight:700;line-height:1.35;color:#94A3B8;letter-spacing:.01em}
.wf-aside-link{display:inline-flex;align-items:center;gap:7px;min-height:36px;padding:0;background:none;border:0;font:inherit;font-size:12.25px;font-weight:750;color:#FB923C;cursor:pointer;border-radius:6px}
.wf-aside-link:hover{text-decoration:underline}
.wf-aside-link:focus-visible{outline:2px solid #F97316;outline-offset:2px}
@media (prefers-reduced-motion:reduce){.wf-aside-row{transition:none}.wf-aside-row:hover{transform:none}}
`;
