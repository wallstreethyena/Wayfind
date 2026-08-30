// app/components/railMenuCss.js — the rail menu's stylesheet, as a string.
//
// Same pattern as app/components/css.js: one exported template literal, injected
// once through <style dangerouslySetInnerHTML>. Next's CSS pipeline never sees
// it, so it cannot be split, reordered, or dropped from a route that needs it.
//
// SCOPING IS THE POINT. The prototype styled bare element selectors and toggled
// state on <body> (`body.menuopen`, `body.dp-night`). Dropped into app/home.js —
// 10,785 lines with its own `.wf-*` system — that would have restyled the entire
// application. Every rule below is prefixed `.wf8-`, every rule is a descendant
// of `.wf8`, and every state is a class on THAT root, not on <body>. The menu
// can therefore sit inside any page without reaching outside its own subtree.
//
// The type scale is Amazon's, matching app/components/kit.js TYPE: weights 400
// and 700 only, letter-spacing normal, sizes on 12/13/15/17/21.
export const WF_RAIL_MENU_CSS =
  // the hero band — logo, then the pitch, then the rail drops out of it
  `.wf8-hero{position:relative;z-index:4;overflow:hidden;border-bottom:1px solid var(--wf8-line);margin:0 calc(var(--wf8-pad) * -1) 0;padding:26px var(--wf8-pad) 22px;text-align:center;background:radial-gradient(760px 420px at 20% -10%,rgba(255,106,43,.13),transparent 62%),radial-gradient(700px 420px at 88% 108%,rgba(139,92,246,.14),transparent 62%),var(--wf8-band)}` +
  `.wf8.is-night .wf8-hero{background:radial-gradient(820px 460px at 18% -12%,rgba(251,191,36,.16),transparent 62%),radial-gradient(760px 440px at 88% 108%,rgba(236,72,153,.18),transparent 62%),var(--wf8-band)}` +
  `.wf8-hlogo{height:38px;width:auto;display:block;margin:0 auto 14px}` +
  `.wf8-h1{font-size:clamp(24px,3.2vw,34px);line-height:1.18;font-weight:700;letter-spacing:normal;margin:0 0 10px;color:#fff}` +
  `.wf8-hsub{font-size:17px;line-height:1.5;color:var(--wf8-mut);font-weight:400;margin:0 auto;max-width:560px}` +
  `@media(max-width:560px){.wf8-hero{padding:20px var(--wf8-pad) 18px}.wf8-hlogo{height:30px;margin-bottom:11px}.wf8-h1{font-size:23px}.wf8-hsub{font-size:15px}}` +
  `.wf8{--wf8-band:#0A0E1A;--wf8-card:#101725;--wf8-line:rgba(255,255,255,.08);--wf8-line2:rgba(255,255,255,.14);--wf8-tx:#F4F7FF;--wf8-mut:#A9B5CD;--wf8-dim:#7A87A0;--wf8-acc:#FF6A2B;--wf8-acc2:#FF8A3D;--wf8-pad:22px;--wf8-ratio:.5625;--wf8-tw:clamp(300px,34vw,440px);--wf8-pcvis:3.4;--wf8-pcgap:13px;position:relative;color:var(--wf8-tx);font-family:var(--wf-sans,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif)}.wf8 *{box-sizing:border-box}.wf8 button{background:none;border:0;cursor:pointer;font:inherit;color:inherit}.wf8 a{color:inherit;text-decoration:none}.wf8-in{max-width:1720px;margin:0 auto;padding:0 var(--wf8-pad)}` +
  // the page dresses for the hour — scoped to the root, never to <body>
  `.wf8.is-morning{--wf8-acc:#FF8A3D;--wf8-acc2:#FFB25E;--wf8-band:#0B1119}.wf8.is-lunch{--wf8-acc:#FF6A2B;--wf8-acc2:#FF8A3D;--wf8-band:#0A0E17}.wf8.is-afternoon{--wf8-acc:#FF7A2B;--wf8-acc2:#FFA23A;--wf8-band:#0C0D16}.wf8.is-night{--wf8-band:#0A0711;--wf8-card:#12101F;--wf8-acc:#FBBF24;--wf8-acc2:#FCD34D;--wf8-line:rgba(255,255,255,.09);--wf8-line2:rgba(255,255,255,.16)}` +
  // the daypart bar
  `.wf8-dpbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 0 2px}.wf8-dpnow{display:flex;align-items:center;gap:8px;height:30px;padding:0 12px;border-radius:16px;background:rgba(255,255,255,.05);border:1px solid var(--wf8-line);font-size:12px;font-weight:700;color:#C3CBDD}.wf8-dpnow i{width:7px;height:7px;border-radius:50%;background:var(--wf8-acc);display:block}.wf8-dpnow b{color:#fff;font-weight:700}.wf8-dpwhy{font-size:13px;color:var(--wf8-dim);font-weight:400;flex:1;min-width:200px;line-height:1.46}` +
  // v8.29 — THE SHARE CHIP HAD TO BORROW ITS CONTRAST FROM THE ARTWORK (owner,
  // 2026-08-20: "the share button on the white background cannot be seen so we
  // need to make sure that for a white background the share button stands
  // out"). It was rgba(8,11,18,.52) with a .24 white hairline: over a dark
  // photo that composites to near-black and reads fine, but the editorial art
  // includes cream and near-white tiles, where the same fill lands around
  // #838589 and a white glyph on it is roughly 2.9:1 — under the 4.5 a 17px
  // icon needs, and invisible in daylight on a phone.
  //
  // The fix is to stop depending on what is behind it: .86 fill (white glyph
  // ~15:1 whatever the tile), a brighter .38 white ring for dark art, and a
  // 1px BLACK outer ring so the chip still has an edge against cream. Same
  // size, same position, same blur, same hover.
  // the tile rail
  `.wf8-railsec{padding:0}.wf8-heroin{padding-left:0;padding-right:0}.wf8-rhead{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:12px;flex-wrap:wrap}.wf8-rhead h2{margin:0;font-size:15px;font-weight:700;color:#9AA7C0}.wf8-railwrap{position:relative}.wf8-track{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;overscroll-behavior-x:contain;scrollbar-width:none;scroll-padding-left:var(--wf8-pad);margin:0 calc(var(--wf8-pad) * -1);padding:30px var(--wf8-pad) 42px}.wf8-track::-webkit-scrollbar{display:none}.wf8-tile{border:0;padding:0;appearance:none;font:inherit;position:relative;flex:0 0 auto;width:var(--wf8-tw);height:calc(var(--wf8-tw) / var(--wf8-ratio));border-radius:18px;overflow:hidden;isolation:isolate;scroll-snap-align:start;display:block;text-decoration:none;color:inherit;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;z-index:1;box-shadow:0 10px 26px -14px rgba(0,0,0,.95);transition:transform .62s cubic-bezier(.16,1,.3,1),box-shadow .62s cubic-bezier(.16,1,.3,1),opacity .34s ease,filter .34s ease}.wf8-tlink{position:absolute;inset:0;z-index:1;display:block;margin:0;padding:0;border:0;appearance:none;background:none;font:inherit;color:inherit;text-decoration:none;cursor:pointer;border-radius:inherit;-webkit-tap-highlight-color:transparent}.wf8-tlink:focus-visible{outline:2px solid var(--wf8-acc2);outline-offset:-4px}.wf8-tim{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 0%;display:block;border:0;transition:transform .95s cubic-bezier(.16,1,.3,1)}.wf8-tile::after{content:"";position:absolute;inset:0;z-index:2;pointer-events:none;border-radius:inherit;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06);transition:box-shadow .5s ease}.wf8-tile::before{content:"";position:absolute;z-index:3;top:-40%;left:-64%;width:42%;height:180%;pointer-events:none;opacity:0;transform:translateX(0) rotate(14deg);background:linear-gradient(100deg,rgba(255,255,255,0),rgba(255,255,255,.20) 46%,rgba(255,255,255,.34) 52%,rgba(255,255,255,0));mix-blend-mode:screen}@keyframes wf8Sheen{0%{opacity:0;transform:translateX(0) rotate(14deg)}14%{opacity:1}72%{opacity:.85}100%{opacity:0;transform:translateX(470%) rotate(14deg)}}@media(hover:hover){.wf8-tile:hover{z-index:4;transform:translateY(-12px) scale(1.03);box-shadow:0 46px 78px -30px rgba(0,0,0,1),0 16px 30px -16px rgba(0,0,0,.9),0 0 0 1px rgba(255,255,255,.09)}.wf8-tile:hover .wf8-tim{transform:scale(1.06)}.wf8-tile:hover::after{box-shadow:inset 0 0 0 1px rgba(255,255,255,.18),inset 0 -90px 110px -70px rgba(255,138,61,.45)}.wf8-tile:hover::before{animation:wf8Sheen 1.05s cubic-bezier(.22,.72,.28,1) forwards}.wf8-track:hover .wf8-tile:not(:hover):not(.is-sel){opacity:.7;filter:saturate(.78)}}.wf8-tile:has(:focus-visible){z-index:4;transform:translateY(-8px) scale(1.02)}.wf8-tile:focus-visible{outline:2px solid var(--wf8-acc2);outline-offset:3px}.wf8-tile:active{transform:translateY(-4px) scale(.985);transition-duration:.12s}.wf8-tshare{position:absolute;top:11px;right:11px;z-index:6;width:40px;height:40px;padding:0;border-radius:999px;display:flex;align-items:center;justify-content:center;background:rgba(9,12,19,.86);border:1px solid rgba(255,255,255,.38);color:#fff;-webkit-backdrop-filter:blur(12px) saturate(1.3);backdrop-filter:blur(12px) saturate(1.3);box-shadow:0 0 0 1px rgba(0,0,0,.42),0 8px 22px -6px rgba(0,0,0,.7);cursor:pointer;opacity:0;transform:translateY(-8px) scale(.86);transition:opacity .34s ease,transform .44s cubic-bezier(.16,1,.3,1),background .2s ease,border-color .2s ease,color .2s ease}.wf8-tshare svg{width:17px;height:17px;display:block;pointer-events:none}.wf8-tshare:hover{background:var(--wf8-acc);border-color:var(--wf8-acc);color:#0A0A0B}.wf8-tshare:active{transform:scale(.9)}.wf8-tshare:focus-visible{opacity:1;transform:none;outline:2px solid var(--wf8-acc2);outline-offset:2px}@media(hover:hover){.wf8-tile:hover .wf8-tshare{opacity:1;transform:none}}@media(hover:none){.wf8-tshare{opacity:1;transform:none}}.wf8-tile.is-sel .wf8-tshare{opacity:1;transform:none}.wf8-tsaid{position:absolute;top:11px;right:59px;z-index:6;height:40px;display:flex;align-items:center;padding:0 14px;border-radius:999px;background:rgba(8,11,18,.78);border:1px solid rgba(255,255,255,.2);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);color:#fff;font-size:12px;font-weight:700;white-space:nowrap;pointer-events:none;animation:wf8Said 2.4s ease forwards}@keyframes wf8Said{0%{opacity:0;transform:translateX(10px)}10%,74%{opacity:1;transform:none}100%{opacity:0;transform:translateX(10px)}}.wf8-nav,.wf8-pnav{position:absolute;top:calc(50% - 8px);transform:translateY(-50%);z-index:5;background:rgba(9,12,20,.93);border:1px solid var(--wf8-line2);display:grid;place-items:center;box-shadow:0 8px 24px rgba(0,0,0,.7);transition:opacity .2s;color:#fff}.wf8-nav{width:46px;height:92px}.wf8-pnav{width:40px;height:76px}.wf8-nav[disabled],.wf8-nav.l,.wf8-pnav.l{left:0;border-radius:0 10px 10px 0}.wf8-nav.r,.wf8-pnav.r{right:0;border-radius:10px 0 0 10px}@media(hover:none){.wf8-nav,.wf8-pnav{display:none}}.wf8-railhint{font-size:13px;font-weight:400;color:var(--wf8-dim);padding:0 0 6px}.wf8.is-open .wf8-railhint{display:none}.wf8.is-open .wf8-tile{opacity:.82;transform:scale(.985);filter:saturate(.8)}@media(hover:hover){.wf8.is-open .wf8-tile:hover{opacity:1;filter:none;transform:translateY(-12px) scale(1.03)}}.wf8-tile.is-sel,.wf8.is-open .wf8-tile.is-sel{opacity:1;filter:none;z-index:3;transform:translateY(-10px) scale(1.05);animation:wf8SelGlow 2.6s ease-in-out infinite}.wf8-tile.is-sel::after{box-shadow:inset 0 0 0 1px rgba(249,115,22,.42),inset 0 -110px 130px -80px rgba(249,115,22,.38)}@keyframes wf8SelGlow{0%,100%{box-shadow:0 0 0 1px rgba(249,115,22,.26),0 14px 48px -6px rgba(249,115,22,.5),0 40px 66px -22px rgba(0,0,0,1)}50%{box-shadow:0 0 0 1px rgba(249,115,22,.4),0 20px 72px -4px rgba(249,115,22,.8),0 40px 66px -22px rgba(0,0,0,1)}}@media (prefers-reduced-motion:reduce){.wf8-tile.is-sel,.wf8.is-open .wf8-tile.is-sel{animation:none;transform:scale(1.035);box-shadow:0 0 0 1px rgba(249,115,22,.32),0 16px 56px -6px rgba(249,115,22,.6),0 40px 66px -22px rgba(0,0,0,1)}}` +
  // the menu — it does not exist until a card is chosen
  `.wf8-menusec{scroll-margin-top:12px;display:none;background:linear-gradient(180deg,rgba(255,106,43,.05),transparent 46%),var(--wf8-band);border-top:1px solid var(--wf8-line);border-bottom:1px solid var(--wf8-line)}.wf8.is-open .wf8-menusec{display:block;animation:wf8MenuIn .46s cubic-bezier(.19,1.06,.34,1) both}.wf8-menusec .wf8-in{padding:18px var(--wf8-pad) 26px;position:relative;z-index:2;text-align:left}@keyframes wf8MenuIn{0%{opacity:0;transform:translateY(-30px) scaleY(.97);transform-origin:top}58%{opacity:1;transform:translateY(5px) scaleY(1.006);transform-origin:top}100%{opacity:1;transform:none}}.wf8-mbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px}.wf8-mhd{font-size:15px;font-weight:700;color:#9AA7C0;margin:0}.wf8-mhd b{color:var(--wf8-acc2)}.wf8-mclose{display:flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:16px;border:1px solid var(--wf8-line2);font-size:12px;font-weight:700;color:#C3CBDD;flex:0 0 auto}.wf8-mclose:hover{background:rgba(255,255,255,.06);color:#fff}` +
  // the categories — a rail, never a stack
  // v8.3: .wf8-catwrap / -catrail / -cat / -cico / -ctx removed with the chip
  // row they styled (see DaypartRail.js). Nothing else referenced them.
    // the place cards — ONE horizontal rail, below the band, never a stack
  `.wf8-pcwrap{position:relative;margin:0 calc(var(--wf8-pad) * -1)}.wf8-pcrail{display:flex;gap:var(--wf8-pcgap);overflow-x:auto;scrollbar-width:none;scroll-snap-type:x mandatory;padding:4px var(--wf8-pad) 6px;scroll-padding-left:var(--wf8-pad);margin:0;list-style:none}.wf8-pcrail::-webkit-scrollbar{display:none}.wf8-pcrail>.wf-place-card{flex:0 0 calc((100% - (var(--wf8-pcvis) - 1) * var(--wf8-pcgap)) / var(--wf8-pcvis));scroll-snap-align:start;margin-bottom:0!important;animation:wf8CardDrop .5s cubic-bezier(.18,1.08,.34,1) both}` +
  // The drop stagger. IconicPlaceCard is a shared component with a fixed prop
  // surface and no style pass-through, so the delay is positional, in CSS, rather
  // than a per-card inline variable. There is no card cap (lib/railSelect.js).
  `.wf8-pcrail>.wf-place-card:nth-child(2){animation-delay:58ms}.wf8-pcrail>.wf-place-card:nth-child(3){animation-delay:116ms}.wf8-pcrail>.wf-place-card:nth-child(n+4){animation-delay:174ms}@keyframes wf8CardDrop{0%{opacity:0;transform:translateY(-30px) scale(.955)}62%{opacity:1;transform:translateY(6px) scale(1.008)}100%{opacity:1;transform:none}}` +
  // THE TRENDING DROP USES THE SAME COLUMN AS EVERY OTHER DROP.
  //
  // <ExplodingNearby> is rendered by exactly one caller — DaypartRail, inside
  // this .wf8 subtree — but it brings its own .wf-rail from app/components/css.js,
  // and that rail's card rule is flex:0 0 100%. On a phone that rule is close to
  // right and owner-set (2026-08-08: "i want the card size to be full"); measured,
  // --wf8-pcvis 1.08 below 560px is a 321px card in a 364px column — still the
  // full card the owner asked for, now with the same sliver of peek Tonight's
  // Move already shows on that phone. On a DESKTOP the two rails disagreed
  // loudly: Tonight's Move served 3.4 cards across a 1396px column while
  // the trend directly above it served ONE card stretched to that full 1396px —
  // same component, same score chip, same action row, 3.6x the width (measured
  // by scripts/test-drop-rail-parity.mjs: trend 1396, place 383). It read as a
  // different, broken card, and a stretched card is a weaker card: the photo
  // shrinks to a sliver of its own frame and the Directions CTA becomes a
  // 1300px band nobody reads as a button.
  //
  // So the trend rail inherits the drop's geometry rather than restating it:
  // --wf8-pcvis and --wf8-pcgap are the SAME variables .wf8-pcrail uses, which
  // means the responsive steps below (3.4 / 2.4 / 1.9 / 1.35 / 1.08) move both
  // rails together forever. Higher specificity than .wf-rail>.wf-rail-card, so
  // no !important is needed and nothing outside .wf8 is touched.
  `.wf8 .wf-rail-exploding{gap:var(--wf8-pcgap);margin:0 calc(var(--wf8-pad) * -1);padding:4px var(--wf8-pad) 6px;scroll-padding-left:var(--wf8-pad)}.wf8 .wf-rail-exploding>.wf-rail-card{flex:0 0 calc((100% - (var(--wf8-pcvis) - 1) * var(--wf8-pcgap)) / var(--wf8-pcvis));width:auto;animation:wf8CardDrop .5s cubic-bezier(.18,1.08,.34,1) both}.wf8 .wf-rail-exploding>.wf-rail-card:nth-child(2){animation-delay:58ms}.wf8 .wf-rail-exploding>.wf-rail-card:nth-child(3){animation-delay:116ms}.wf8 .wf-rail-exploding>.wf-rail-card:nth-child(n+4){animation-delay:174ms}` +
  // a rail whose axis nothing nearby clears. Honest, not padded.
  `.wf8-thin{display:flex;flex-direction:column;gap:9px;align-items:flex-start;padding:16px 0 8px;border-left:3px solid var(--wf8-acc);padding-left:14px}.wf8-thin p{margin:0;font-size:15px;line-height:1.5;color:var(--wf8-mut);max-width:620px}.wf8-thin a{font-size:15px;font-weight:700;color:var(--wf8-acc2)}` +
  // v8.46 — the action row of an honest-empty drop. A reader who lands on
  // "we're not live here yet" or "we couldn't reach the ranking service" gets
  // something to PRESS: the one-tap GPS recenter (which is also the self-heal
  // for a stored pin whose label and coordinates disagree) or a real retry,
  // alongside the rail's own page. Same accent vocabulary as .wf8-thin a, so
  // it reads as part of the same honest block rather than a bolted-on dialog.
  `.wf8-thinact{display:flex;flex-wrap:wrap;gap:14px;align-items:center}` +
  `.wf8-thinbtn{appearance:none;border:1px solid var(--wf8-acc);background:transparent;color:var(--wf8-acc2);font:inherit;font-size:15px;font-weight:700;padding:8px 14px;border-radius:999px;cursor:pointer;transition:background .16s ease,color .16s ease}` +
  `.wf8-thinbtn:hover{background:var(--wf8-acc);color:#0b0b0d}` +
  `.wf8-thinbtn:focus-visible{outline:2px solid var(--wf8-acc2);outline-offset:2px}` +
  `@media (prefers-reduced-motion:reduce){.wf8-thinbtn{transition:none}}` +
  // v8.75 -- the voice a waiting skeleton acquires after RAIL_VOICE_MS.
  // Rationale lives in DaypartRail.js beside the state it renders; kept out of
  // this template literal because prose here ships to every reader
  // (scripts/check-css-comment-bytes.mjs).
  `.wf8-slowsay{display:flex;flex-direction:column;gap:8px;align-items:flex-start;padding:12px 0 2px}` +
  `.wf8-slowsay p{margin:0;font-size:14px;line-height:1.5;color:var(--wf8-mut);max-width:620px}` +
  `.wf8-slowsay a{font-size:15px;font-weight:700;color:var(--wf8-acc2)}` +
  // the guides library — what Local Guides opens onto
  `.wf8-grail{display:flex;gap:var(--wf8-pcgap);overflow-x:auto;scrollbar-width:none;scroll-snap-type:x mandatory;padding:4px var(--wf8-pad) 6px;scroll-padding-left:var(--wf8-pad);margin:0 calc(var(--wf8-pad) * -1);list-style:none}.wf8-grail::-webkit-scrollbar{display:none}` +
  // The <li> is the flex ITEM, so the width and the snap point belong to it; the
  // <a> is the card and fills it. With the sizing on the <a> instead, every li
  // shrank to its content and the rail came out ragged — uneven heights, columns
  // too narrow to hold a title on one line.
  `.wf8-grail>li{flex:0 0 clamp(268px,26vw,330px);scroll-snap-align:start;display:flex;min-width:0}.wf8-gcard{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;padding:15px 16px 16px;border-radius:14px;background:var(--wf8-card);border:1px solid var(--wf8-line);transition:transform .18s,border-color .18s;animation:wf8CardDrop .5s cubic-bezier(.18,1.08,.34,1) both;animation-delay:calc(var(--wf8-i) * 48ms)}.wf8-gcard:hover{transform:translateY(-3px);border-color:var(--wf8-line2)}.wf8-gtop{display:flex;align-items:baseline;gap:7px;font-size:12px;font-weight:700;color:var(--wf8-acc2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wf8-gtop em{font-style:normal;color:var(--wf8-dim);font-weight:400}.wf8-gtit{margin:0;font-size:17px;font-weight:700;line-height:1.3;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.wf8-gtea{margin:0;font-size:13px;font-weight:400;line-height:1.46;color:var(--wf8-mut);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.wf8-gread{margin-top:auto;padding-top:4px;font-size:13px;font-weight:700;color:var(--wf8-acc2)}` +
  // responsive: no dead space on either device
  `@media(max-width:900px){.wf8-track{padding:16px var(--wf8-pad) 28px}.wf8-tile.is-sel,.wf8.is-open .wf8-tile.is-sel{transform:translateY(-6px) scale(1.03)}.wf8-tshare{width:36px;height:36px;top:9px;right:9px}.wf8-tsaid{height:36px;top:9px;right:53px}}@media(max-width:1400px){.wf8{--wf8-pcvis:2.4}}@media(max-width:1100px){.wf8{--wf8-pcvis:1.9}}@media(max-width:900px){.wf8{--wf8-tw:min(76vw,340px);--wf8-pcvis:1.35;--wf8-pcgap:11px;--wf8-pad:16px}.wf8-grail>li{flex:0 0 min(78vw,320px)}}@media(max-width:560px){.wf8{--wf8-pcvis:1.08;--wf8-pad:13px}}@media (prefers-reduced-motion:reduce){.wf8.is-open .wf8-menusec,.wf8-pcrail>.wf-place-card,.wf8 .wf-rail-exploding>.wf-rail-card,.wf8-gcard{animation:none}.wf8-tile,.wf8-gcard,.wf8-tim,.wf8-tshare{transition:none}.wf8-tile::before{display:none}.wf8-tile:hover,.wf8-tile:has(:focus-visible){transform:translateY(-4px)}.wf8-tile:hover .wf8-tim{transform:none}.wf8-tsaid{animation:none}}` +
  // Date Night locked poster is 3:4 (1086×1448). The shared tile is 9:16 with
  // object-fit:cover, which center-cropped the left-aligned type. This tile
  // matches the source aspect and contains the full frame. Other posters
  // stay on --wf8-ratio:.5625 + cover. Hover zoom is off here because scale
  // plus overflow:hidden re-clips the same left edge.
  `.wf8-tile[data-id="datenight"]{--wf8-ratio:0.75}.wf8-tile[data-id="datenight"] .wf8-tim{object-fit:contain;object-position:center center}.wf8-tile[data-id="datenight"]:hover .wf8-tim{transform:none}`;
