"use client";

import { useEffect, useRef, useState } from "react";
import { captureOrQueue } from "../../lib/browserAnalytics.js";
import GuidePhoto from "./GuidePhoto.js";
import { NavIcon } from "./kit.js";
import CommerceClickBeacon from "./CommerceClickBeacon.js";
import CollectionFilter from "./CollectionFilter.js";
import useHalloweenLocation from "./useHalloweenLocation.js";
import { halloweenBrowse } from "../../lib/halloweenBrowse.js";
import { formatScore } from "../../lib/score.js";
import { emitCommerce } from "../../lib/commerce.js";
import { activeSeasonalMark, HALLOWEEN_MARK } from "../../lib/seasonalBrand.js";

// Wayfind home header replica plus Halloween ticket cards. Home palette, Inter via --wf-sans.
// Visible copy comes from the server model and stays dash free.
const BULB_COUNT = 18;
const WIRE_PITCH = 1200 / BULB_COUNT;
const WIRE_PATH = (() => {
  let d = "M0 4";
  for (let i = 0; i < BULB_COUNT; i += 1) {
    d += " Q" + ((i + 0.5) * WIRE_PITCH).toFixed(1) + " 24 " + ((i + 1) * WIRE_PITCH).toFixed(1) + " 4";
  }
  return d;
})();

// Same destinations home uses (CATEGORY_ROUTE through railHref for Tampa).
// Stays and Shopping have no page of their own on home (they are filters
// there), so they open the home search for the same word.
const CATEGORY_TABS = [
  { id: "food", label: "Food", href: "/restaurants/tampa" },
  { id: "nightlife", label: "Night out", href: "/nightlife/tampa" },
  { id: "attractions", label: "Activities", href: "/things-to-do/tampa" },
  { id: "family", label: "Family", href: "/family" },
  { id: "hotels", label: "Stays", href: "/?q=hotels" },
  { id: "shopping", label: "Shopping", href: "/?q=shopping" },
];
const DEST_LINKS = [
  { icon: "saved", label: "Favorites", href: "/favorites" },
  { icon: "itinerary", label: "Itinerary", href: "/itinerary" },
  { icon: "events", label: "Events", href: "/events" },
  { icon: "coupons", label: "Coupons", href: "/coupons" },
];

const BOO_ART = "/images/boo/boo_v1_hype_guide.png";

function trackHauntEvent(event, props) {
  if (typeof window === "undefined") return;
  try {
    captureOrQueue(window, event, { surface: "halloween_haunts", ...props });
  } catch { /* ignore */ }
}

// Organizer links (no affiliate, not one of our /go routes) are invisible to
// CommerceClickBeacon, so the card records its own single tap. Our /go links
// are recorded once by the beacon and never here.
function organizerTap(row) {
  try {
    emitCommerce("commerce_cta_clicked", { surface: "halloween_haunts", provider: "organizer", merchant: new URL(row.cta.href).hostname, content_id: row.id });
  } catch { /* ignore */ }
}

function photoChip(row) {
  if (row.filters.includes("family")) return "Family friendly";
  if (row.scareLevel === "Extreme Scare") return "Extreme scares";
  return row.scareLevel || "Haunt";
}

// "from" + big price when the row has a numeric price, else the admission note.
function priceParts(row) {
  const kind = row.price && row.price.kind;
  if (kind === "from") {
    const figure = String(row.priceLabel).match(/\$[\d,]+(?:\.\d+)?/);
    if (figure) return { from: true, text: figure[0] };
  }
  if (kind === "range") return { from: false, text: row.priceLabel };
  return { from: false, note: row.admissionNote || row.priceLabel };
}

function openBoo() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("wf:boo-open"));
}

const CSS = `
.boo-page{
  --bg:#040810;--surface:#1C2230;--line:#2D3748;
  --orange:#F97316;--lav:#C4B5FD;--cream:#F5EFE6;--muted:#94A3B8;
  background:var(--bg);color:var(--cream);
  font-family:var(--wf-sans),sans-serif;font-weight:400;
  min-height:100dvh;overflow-x:clip;box-sizing:border-box;padding-bottom:56px;
}
.boo-page *,.boo-page *::before,.boo-page *::after{box-sizing:border-box}
.boo-page button,.boo-page a,.boo-page input{font-family:inherit}

/* Festival string lights: sagging wire, glowing bulbs that slowly cycle colour */
.boo-lights{position:relative;height:28px;pointer-events:none;overflow-x:clip;z-index:30}
.boo-wire{position:absolute;inset:0;width:100%;height:100%}
.boo-bulb{
  position:absolute;top:12px;width:11px;height:15px;margin-left:-5.5px;
  border-radius:50% 50% 55% 55%;background:#F97316;
  box-shadow:0 0 8px 2px rgba(249,115,22,.55),0 0 18px 6px rgba(249,115,22,.2);
  transition:transform .35s ease,filter .35s ease;
  animation:boo-cycle 9s linear var(--d,0s) infinite,boo-flick var(--f,2.4s) steps(1,end) var(--fd,0s) infinite;
}
.boo-bulb.is-pop{transform:scale(1.5);filter:brightness(1.6);opacity:1 !important}
@keyframes boo-cycle{
  0%,100%{background:#F97316;box-shadow:0 0 8px 2px rgba(249,115,22,.55),0 0 18px 6px rgba(249,115,22,.2)}
  25%{background:#9D5CFF;box-shadow:0 0 8px 2px rgba(157,92,255,.55),0 0 18px 6px rgba(157,92,255,.2)}
  50%{background:#C4B5FD;box-shadow:0 0 8px 2px rgba(196,181,253,.5),0 0 18px 6px rgba(196,181,253,.18)}
  75%{background:#F5A524;box-shadow:0 0 8px 2px rgba(245,165,36,.55),0 0 18px 6px rgba(245,165,36,.2)}
}
@keyframes boo-flick{0%,100%{opacity:1}22%{opacity:.25}30%{opacity:1}55%{opacity:.35}62%{opacity:1}80%{opacity:.6}86%{opacity:1}}
@media(prefers-reduced-motion:reduce){
  .boo-bulb{animation:none;transition:none}
  .boo-bulb:nth-child(even){background:#F5A524;box-shadow:0 0 8px 2px rgba(245,165,36,.5),0 0 16px 5px rgba(245,165,36,.18)}
}

/* Wayfind header replica (home classes and values) */
.wf-topbar{background:#040810;border-bottom:1px solid #2D3748;padding:12px 14px;padding-top:max(12px,env(safe-area-inset-top));position:relative;z-index:20;box-shadow:inset 0 1px 0 rgba(255,255,255,.025),0 8px 20px rgba(0,0,0,.12)}
.wf-topbar:after{content:"";position:absolute;left:14px;right:14px;bottom:-1px;height:1px;background:linear-gradient(90deg,transparent,rgba(249,115,22,.48),transparent);opacity:.6}
.boo-topin{max-width:800px;margin:0 auto}
.wf-topbar-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.wf-wordmark{display:flex;align-items:center;gap:5px;flex-shrink:0;filter:drop-shadow(0 4px 12px rgba(0,0,0,.3));text-decoration:none}
.wf-wordmark-text{display:block;flex:none;width:154.05px;height:39.06px;background-image:url("/brand/wayfind-wordmark-original-v3.png");background-image:image-set(url("/brand/opt/wordmark-original-v3-400.avif") type("image/avif"),url("/brand/opt/wordmark-original-v3-400.webp") type("image/webp"));background-repeat:no-repeat;background-size:contain;background-position:center}
.wf-wordmark.is-seasonal{gap:0}
.wf-wordmark.is-seasonal .wf-wordmark-text{width:147.4px;height:49.1px;background-image:url("${HALLOWEEN_MARK.png}");background-image:image-set(url("${HALLOWEEN_MARK.avif}") type("image/avif"),url("${HALLOWEEN_MARK.webp}") type("image/webp"));background-position:center;background-size:contain}
.boo-goto{
  flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 16px;border-radius:999px;
  background:#F97316;color:#0D1117;font-size:13px;font-weight:800;text-decoration:none;white-space:nowrap;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 7px 14px rgba(249,115,22,.22);
}
.wf-navtabs{display:flex;gap:18px;overflow-x:auto;scrollbar-width:none;margin:0 0 8px;padding:0 2px;overscroll-behavior-x:contain}
.wf-navtabs::-webkit-scrollbar,.wf-dests::-webkit-scrollbar{display:none}
.wf-navtab{position:relative;display:inline-flex;align-items:center;gap:7px;flex:0 0 auto;padding:5px 0 10px;font-size:14px;font-weight:600;color:#8A96AE;white-space:nowrap;text-decoration:none;transition:color .16s ease}
.wf-navtab:hover{color:#CBD4E8}
.wf-navtab:focus-visible,.wf-dest:focus-visible,.boo-goto:focus-visible{outline:2px solid #F97316;outline-offset:2px;border-radius:6px}
.wf-search-row{display:flex;gap:0;position:relative;min-width:0;filter:drop-shadow(0 11px 20px rgba(0,0,0,.24))}
.wf-scope{display:flex;align-items:center;gap:5px;height:48px;padding:0 12px;background:#1D2536;border:1.5px solid #30363D;border-right:none;border-radius:14px 0 0 14px;color:#B7C2D8;font-size:13px;font-weight:650;white-space:nowrap;flex:0 0 auto}
.wf-scope-city{max-width:104px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wf-search-field{flex:1;min-width:0;position:relative}
.wf-search-icon{position:absolute;left:13px;top:50%;transform:translateY(-50%);pointer-events:none;opacity:.9;display:inline-flex;z-index:1;color:#AEB9C8}
.wf-search-input{width:100%;min-width:0;height:48px;padding:0 46px 0 38px;background:linear-gradient(135deg,#182130,#111923);border:1.5px solid #354153;border-left:none;border-right:none;border-radius:0;color:#F1F5F9;font-size:16px;outline:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.045),inset 0 -1px 0 rgba(0,0,0,.25)}
.wf-search-input::placeholder{color:#8190A3;opacity:1}
.wf-search-input:focus{border-color:rgba(203,213,225,.72)}
.wf-search-submit{flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;width:54px;height:48px;background:linear-gradient(180deg,#FF9B47 0%,#F97316 55%,#E95A0C 100%);border:none;border-radius:0 14px 14px 0;color:#0D1117;font-size:22px;font-weight:800;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.34),0 8px 18px rgba(249,115,22,.27)}
.wf-dest-row{display:flex;align-items:stretch;gap:2px;margin:9px 0 -6px;border-top:1px solid #22272E}
.wf-dests{display:flex;align-items:stretch;gap:2px;flex:1;min-width:0;overflow-x:auto;scrollbar-width:none}
.wf-dest{position:relative;display:inline-flex;align-items:center;gap:7px;flex:0 0 auto;padding:10px 12px 11px;font-size:13.5px;font-weight:600;color:#94A1BC;white-space:nowrap;text-decoration:none;transition:color .16s ease}
.wf-dest:hover{color:#E4EAF7}
.wf-dest-opener{margin-left:auto}
@media(max-width:560px){.wf-navtabs{gap:9px}.wf-navtab{font-size:12.5px;gap:4px}.wf-navtab svg{width:15px;height:15px}.wf-dest{padding:10px 8px 11px;font-size:12.5px;gap:5px}.wf-dest svg{width:16px;height:16px}.wf-scope{font-size:12.5px;padding:0 10px}}
@media(max-width:430px){.wf-scope{padding:0 8px;gap:4px}.wf-scope-city{max-width:88px}.wf-search-icon{display:none}.wf-search-input{font-size:14px;padding-left:12px;padding-right:8px}.wf-search-submit{width:46px}}
@media(max-width:380px){.wf-dest{padding:10px 6px 11px;font-size:12px;gap:4px}.wf-dest svg{width:15px;height:15px}.wf-dest-opener{padding-left:4px}}

/* Page body */
.boo-main{max-width:720px;margin:0 auto;padding:20px 16px 0}
.boo-hero h1{margin:0 0 6px;font-size:26px;line-height:1.2;font-weight:700;color:var(--cream);letter-spacing:-.01em}
.boo-lede{margin:0;font-size:15px;line-height:1.5;color:var(--muted)}
.boo-legal{margin:8px 0 0;font-size:12px;line-height:1.5;color:var(--muted)}
.boo-boo-row{display:flex;align-items:center;gap:12px;margin-top:18px}
.boo-art{position:relative;flex:0 0 64px;width:64px;height:64px}
.boo-art::before{content:"";position:absolute;inset:-10px;border-radius:50%;background:radial-gradient(circle,rgba(249,115,22,.2) 0%,rgba(249,115,22,0) 68%)}
.boo-art svg{position:relative;width:64px;height:64px;display:block}
.boo-bubble{flex:1;min-width:0;margin:0;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:10px 12px;font-size:14px;line-height:1.4;color:var(--cream)}
.boo-ask{margin-top:12px;width:100%;min-height:48px;border-radius:12px;border:0;cursor:pointer;background:var(--orange);color:#0D1117;font-size:15px;font-weight:700}

.boo-share{margin-top:8px;display:flex;justify-content:flex-start}
.boo-share button,.boo-share a{min-height:44px}
.boo-picks-wrap{margin-top:24px}
.boo-picks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:stretch}
.boo-picks button{
  display:flex;align-items:center;justify-content:space-between;gap:8px;
  min-height:56px;width:100%;margin:0;padding:10px 14px;
  background:var(--surface);color:var(--cream);border:1px solid var(--line);border-radius:12px;cursor:pointer;
  font-size:15px;line-height:1.25;font-weight:600;text-align:left;
}
.boo-picks button:last-child:nth-child(odd){grid-column:1 / -1}
.boo-picks button .boo-arrow{flex:0 0 auto;color:var(--orange);font-size:18px;line-height:1}
.boo-picks button[aria-pressed="true"]{border-color:var(--orange)}
.boo-jump:focus-visible,.boo-picks button:focus-visible,.boo-filters button:focus-visible,.boo-ask:focus-visible,.boo-buy:focus-visible,.boo-card a:focus-visible{outline:2px solid var(--lav);outline-offset:2px}

#boo-vault{margin-top:28px;scroll-margin-top:12px}
.boo-filters{display:flex;flex-wrap:wrap;gap:8px}
.boo-filters button{min-height:44px;padding:8px 14px;border-radius:999px;cursor:pointer;background:transparent;color:var(--lav);border:1px solid var(--line);font-size:14px;font-weight:600}
.boo-filters button[aria-pressed="true"]{background:var(--lav);color:#040810;border-color:var(--lav)}
.boo-picked{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px}
.boo-picked p{margin:0;font-size:16px;font-weight:700;color:var(--cream)}
.boo-picked button{min-height:44px;padding:0 4px;background:none;border:0;cursor:pointer;color:var(--lav);font-size:14px;font-weight:600;text-decoration:underline;text-underline-offset:3px}
.boo-vault-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;margin-top:16px}
@media(min-width:720px){.boo-main{max-width:960px}.boo-vault-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.boo-card{display:grid;grid-template-columns:40% minmax(0,1fr);min-width:0;overflow:hidden;background:var(--surface);border:1px solid var(--line);border-radius:12px;scroll-margin-top:12px}
.boo-photo{position:relative;min-width:0;min-height:230px;height:100%;background:var(--surface);overflow:hidden}
.boo-strip{position:absolute;inset:0;display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;scrollbar-width:none;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch}
.boo-strip::-webkit-scrollbar{display:none}
.boo-slide{position:relative;flex:0 0 100%;min-width:0;height:100%;scroll-snap-align:start;scroll-snap-stop:always;overflow:hidden}
.boo-slide img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.boo-ph{position:absolute;inset:0;background:linear-gradient(180deg,#1C2230 0%,#040810 100%)}
.boo-ph span{display:none}
.boo-ph::after{content:"";position:absolute;left:50%;top:50%;width:34%;aspect-ratio:1 / 1;transform:translate(-50%,-50%);background:url("/images/boo/boo_v8_clean_avatar.png") center / contain no-repeat;opacity:.1;filter:grayscale(1)}
.boo-dots{position:absolute;left:0;right:0;bottom:8px;z-index:1;display:flex;justify-content:center;gap:5px;pointer-events:none}
.boo-dots i{width:6px;height:6px;border-radius:50%;background:rgba(245,239,230,.45)}
.boo-dots i.is-on{background:#F5EFE6}
.boo-body{display:flex;flex-direction:column;gap:6px;min-width:0;padding:12px 12px 12px 12px}
.boo-chip{align-self:flex-start;max-width:100%;padding:3px 9px;border-radius:999px;background:rgba(196,181,253,.16);color:var(--lav);font-size:12px;font-weight:600;line-height:1.4}
.boo-card h2{margin:0;font-size:16px;line-height:1.3;min-height:calc(1.3em * 2);font-weight:700;color:var(--cream);overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.boo-credit{margin:0;font-size:11px;line-height:1.35;height:calc(1.35em);color:#9A94A8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.boo-credit a{color:inherit;text-decoration:underline;text-underline-offset:2px}
.boo-line{display:flex;align-items:flex-start;gap:7px;margin:0;font-size:13px;line-height:1.4;color:#9A94A8;min-width:0;overflow-wrap:anywhere}
.boo-line .boo-when{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:calc(1.4em * 2)}
.boo-line svg{flex:0 0 auto;width:15px;height:15px;margin-top:1px}
.boo-bottom{margin-top:auto;display:flex;flex-direction:column;gap:6px;padding-top:6px}
.boo-pricerow,.boo-note{min-height:calc(1.2em + 12px * 1.2 + 2px)}
.boo-pricerow{display:flex;flex-direction:column;align-items:flex-end;margin:0;min-width:0}
.boo-from{font-size:12px;line-height:1.2;color:#9A94A8}
.boo-amt{text-align:right;font-size:22px;line-height:1.2;font-weight:800;color:var(--cream)}
.boo-note{margin:0;font-size:13px;line-height:1.35;color:var(--cream);text-align:right;overflow-wrap:anywhere}
.boo-buy{display:flex;align-items:center;justify-content:center;width:100%;min-height:46px;padding:6px 8px;background:var(--orange);color:#0D1117;border:2px solid var(--orange);border-radius:12px;font-size:15px;font-weight:700;line-height:1.2;text-decoration:none;text-align:center}
.boo-buy.is-muted{background:transparent;color:var(--cream);border-color:var(--line)}
.boo-alts{display:flex;flex-direction:column;gap:4px;margin:0;font-size:12.5px;line-height:1.35;color:#9A94A8}
.boo-alts a{color:var(--lav);font-weight:600;text-decoration:underline;text-underline-offset:2px;min-height:24px;display:inline-flex;align-items:center}
.boo-via{margin:0;font-size:11px;line-height:1.35;color:#9A94A8;text-align:center}
.boo-event{display:flex;align-items:center;justify-content:center;min-height:44px;color:var(--lav);font-size:13px;font-weight:600;text-decoration:underline;text-underline-offset:3px}
.boo-empty{margin:16px 0 0;color:var(--muted);font-size:14px}
.boo-jump{display:inline-flex;align-items:center;gap:6px;margin-top:4px;min-height:44px;padding:0;background:none;border:0;cursor:pointer;color:var(--lav);font-size:14px;font-weight:600;text-decoration:underline;text-underline-offset:3px}
#boo-tours{margin-top:16px;scroll-margin-top:12px}
#boo-tours h2.boo-sec{margin:0 0 6px;font-size:22px;line-height:1.25;font-weight:700;color:var(--cream);min-height:0;display:block;-webkit-line-clamp:unset}
.boo-sec-lede{margin:0 0 14px;font-size:14px;line-height:1.5;color:var(--muted)}
.boo-rating{margin:0;font-size:13px;line-height:1.4;color:var(--cream);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.boo-rating b{color:#F5A524;font-weight:700}
.boo-tour-photo{position:relative;min-width:0;min-height:200px;height:100%;background:var(--surface);overflow:hidden}
.boo-tour-photo img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}

.boo-main{max-width:1120px}
.boo-card h2{display:block;min-height:0;overflow:visible;-webkit-line-clamp:unset}
.boo-credit{height:auto;white-space:normal;overflow:visible}
.boo-tour-photo{min-height:240px}
.boo-location{margin-top:22px;padding:16px;background:var(--surface);border:1px solid var(--line);border-radius:14px}
.boo-location h2{font-size:18px;margin:0 0 8px}
.boo-location p,.boo-sort-note{color:var(--muted);font-size:13px;line-height:1.5;margin:8px 0}
.boo-location-controls{display:flex;gap:10px;align-items:end;flex-wrap:wrap}
.boo-location-controls button,.boo-location select{min-height:44px;border:1px solid var(--line);border-radius:999px;padding:10px 14px;background:#161D2B;color:var(--cream);font:inherit;font-size:14px;max-width:100%}
.boo-location-controls button{border-color:var(--orange);cursor:pointer}
.boo-location-controls label{display:flex;flex-direction:column;gap:5px;min-width:0;font-size:12px;color:var(--muted)}
.boo-location-controls button:disabled{opacity:.65;cursor:wait}
.boo-controls{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.boo-filters{margin-top:12px}
.boo-rail-section{margin-top:26px;min-width:0}
.boo-rail-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}
.boo-rail-heading h2{font-size:21px;line-height:1.3;margin:0}
.boo-rail-heading small{font-size:13px;font-weight:400;color:var(--muted);white-space:nowrap}
.boo-rail-controls{display:flex;gap:6px;flex-shrink:0}
.boo-rail-controls button{display:grid;place-items:center;width:44px;height:44px;border:1px solid var(--line);border-radius:50%;background:var(--surface);color:var(--cream);font-size:20px;cursor:pointer}
.boo-rail{display:flex;align-items:stretch;gap:14px;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;scroll-padding-inline:2px;overscroll-behavior-x:contain;padding:3px 2px 14px;scrollbar-width:thin;scrollbar-color:#64748B transparent}
.boo-rail>.boo-card{flex:0 0 min(440px,calc(100% - 12px));scroll-snap-align:start;scroll-snap-stop:always}
.boo-rail:focus-visible,.boo-page button:focus-visible,.boo-page select:focus-visible{outline:2px solid var(--lav);outline-offset:2px}
.boo-group-label{margin:0;color:var(--muted);font-size:11px;line-height:1.4}
.boo-distance{display:block;font-size:12px;color:var(--muted)}
.boo-rail-disclosure{margin:0 0 10px;color:#CBD5E1;font-size:12px;line-height:1.5}
.wf-halloween-browse .boo-c{display:none}
@media(max-width:380px){.boo-main{padding-inline:12px}.boo-body{padding:10px;gap:7px}.boo-card{grid-template-columns:34% minmax(0,1fr)}.boo-card h2{font-size:15px}.boo-amt{font-size:21px}.boo-chip{font-size:11px;padding:3px 7px}.boo-location{padding:12px}.boo-location-controls label{width:100%}.boo-location select{width:100%}}
`;

function FestivalLights() {
  const rootRef = useRef(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window === "undefined") return undefined;
    let reduce = false;
    try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* ignore */ }
    if (reduce) return undefined;
    const bulbs = Array.from(root.querySelectorAll(".boo-bulb"));
    bulbs.forEach((bulb) => {
      bulb.style.setProperty("--d", (-Math.random() * 14).toFixed(2) + "s");
      bulb.style.setProperty("--f", (1.6 + Math.random() * 2.2).toFixed(2) + "s");
      bulb.style.setProperty("--fd", (-Math.random() * 6).toFixed(2) + "s");
    });
    let timer = null;
    let off = null;
    const pop = () => {
      const bulb = bulbs[Math.floor(Math.random() * bulbs.length)];
      if (bulb) {
        bulb.classList.add("is-pop");
        off = setTimeout(() => bulb.classList.remove("is-pop"), 800);
      }
      timer = setTimeout(pop, 1200 + Math.random() * 2000);
    };
    timer = setTimeout(pop, 2500);
    return () => { clearTimeout(timer); clearTimeout(off); };
  }, []);
  return (
    <div className="boo-lights" aria-hidden="true" ref={rootRef}>
      <svg className="boo-wire" viewBox="0 0 1200 28" preserveAspectRatio="none">
        <path d={WIRE_PATH} fill="none" stroke="rgba(148,163,184,.4)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      {Array.from({ length: BULB_COUNT }, (_, i) => (
        <span
          key={i}
          className="boo-bulb"
          style={{
            left: (((i + 0.5) / BULB_COUNT) * 100).toFixed(2) + "%",
            "--d": "-" + ((i * 1.9) % 14).toFixed(1) + "s",
            "--f": (3 + ((i * 37) % 40) / 10).toFixed(1) + "s",
            "--fd": "-" + ((i * 1.3) % 6).toFixed(1) + "s",
          }}
        />
      ))}
    </div>
  );
}

function WayfindHeader() {
  const seasonal = activeSeasonalMark();
  return (
    <div className="wf-topbar">
      <div className="boo-topin">
        <div className="wf-topbar-row">
          <a className={"wf-wordmark" + (seasonal ? " is-seasonal" : "")} href="/" aria-label="Wayfind home">
            <span className="wf-wordmark-text" aria-hidden="true" />
          </a>
          <a className="boo-goto" href="/">Go to Wayfind<span aria-hidden="true">→</span></a>
        </div>
        <div className="wf-navtabs" role="group" aria-label="Browse categories">
          {CATEGORY_TABS.map((tab) => (
            <a key={tab.id} className="wf-navtab" href={tab.href}>
              <NavIcon name={tab.id} color="#8A96AE" size={17} strokeWidth={1.7} />
              <span>{tab.label}</span>
            </a>
          ))}
        </div>
        <form className="wf-search-row has-scope" action="/" method="get" role="search">
          <div className="wf-scope">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-6.6-5.4-6.6-10.2A6.6 6.6 0 0 1 12 4.2a6.6 6.6 0 0 1 6.6 6.6C18.6 15.6 12 21 12 21Z" /><circle cx="12" cy="10.8" r="2.3" /></svg>
            <span className="wf-scope-city">Florida</span>
          </div>
          <div className="wf-search-field">
            <span className="wf-search-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.2 4.2" /></svg></span>
            <input className="wf-search-input" type="search" name="q" placeholder="Search a place or city" aria-label="Search Wayfind" autoComplete="off" enterKeyHint="search" />
          </div>
          <button type="submit" className="wf-search-submit" aria-label="Search">→</button>
        </form>
        <div className="wf-dest-row">
          <nav className="wf-dests" aria-label="Destinations">
            {DEST_LINKS.map((d) => (
              <a key={d.label} className="wf-dest" href={d.href}>
                <NavIcon name={d.icon} color="currentColor" size={17} strokeWidth={1.8} />
                <span>{d.label}</span>
              </a>
            ))}
          </nav>
          <a className="wf-dest wf-dest-opener" href="/">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            <span>Shortcuts</span>
          </a>
        </div>
      </div>
    </div>
  );
}

const ICON = { fill: "none", stroke: "#9A94A8", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };

function PhotoStrip({ photos, priority }) {
  const [active, setActive] = useState(0);
  const onScroll = (event) => {
    const el = event.currentTarget;
    if (!el.clientWidth) return;
    setActive(Math.max(0, Math.min(photos.length - 1, Math.round(el.scrollLeft / el.clientWidth))));
  };
  const list = photos.length ? photos : [null];
  return (
    <div className="boo-photo" data-photo-strip="" data-photo-count={photos.length}>
      <div className="boo-strip" onScroll={onScroll} role="group" aria-label="Venue photos" tabIndex={photos.length > 1 ? 0 : undefined}>
        {list.map((photo, i) => (
          <div className="boo-slide" key={photo ? photo.src : "empty"}>
            <GuidePhoto
              src={photo ? photo.src : ""}
              alt={photo ? photo.alt : ""}
              width={photo ? photo.width : undefined}
              height={photo ? photo.height : undefined}
              sizes="(min-width: 720px) 190px, 40vw"
              loading={i === 0 && priority ? "eager" : "lazy"}
              fallbackClassName="boo-ph"
              fallbackText=""
            />
          </div>
        ))}
      </div>
      {photos.length > 1 ? (
        <div className="boo-dots" aria-hidden="true">
          {photos.map((photo, i) => <i key={photo.src} className={i === active ? "is-on" : ""} />)}
        </div>
      ) : null}
    </div>
  );
}

function PhotoCredit({ photos }) {
  const seen = new Set();
  const lines = (photos || []).filter((p) => p && p.credit && !seen.has(p.credit) && seen.add(p.credit));
  if (!lines.length) return <p className="boo-credit" aria-hidden="true">&nbsp;</p>;
  return (
    <p className="boo-credit">
      {lines.map((photo, i) => {
        const href = (photo.source === "google" || photo.source === "vault") ? (photo.authorUri || photo.mapsUri) : null;
        return (
          <span key={photo.credit}>
            {i ? " \u00b7 " : ""}
            {href ? <a href={href} target="_blank" rel="noopener nofollow">{photo.credit}</a> : photo.credit}
          </span>
        );
      })}
    </p>
  );
}

function Rating({ row }) {
  if (row.ratingKind === "wayfind" && Number.isFinite(row.ratingValue)) return <p className="boo-rating">Wayfind Score {formatScore(row.ratingValue)}</p>;
  if ((row.ratingKind === "traveler" || row.ratingKind === undefined) && row.ratingLabel) return <p className="boo-rating">{row.ratingLabel}</p>;
  return null;
}

function Distance({ row, origin }) {
  if (!Number.isFinite(row.distanceMi)) return null;
  return <span className="boo-distance">{row.distanceMi.toFixed(1)} mi {origin?.kind === "area" ? "from area center" : "away"}</span>;
}

export function HauntCard({ row, priority = false, origin, alternatives = [] }) {
  const chrome = { eventPage: "Full event page" };
  return (
<article
                  id={"haunt-" + row.id}
                  data-haunt-id={row.id} data-browse-id={row.id}
                  data-place-id={row.eventId || row.id}
                  className="boo-card"
                >
                  <PhotoStrip photos={row.photos || (row.photo ? [row.photo] : [])} priority={priority} />
                  <div className="boo-body">
                    <span className="boo-chip">{photoChip(row)}</span>
                    <h2>{row.name}</h2>
                    <Rating row={row} />
                    {row.browseGroup ? <p className="boo-group-label">{row.browseGroup}</p> : null}
                    <PhotoCredit photos={row.photos || (row.photo ? [row.photo] : [])} />
                    <p className="boo-line">
                      <svg viewBox="0 0 16 16" {...ICON}><circle cx="8" cy="8" r="6.2" /><path d="M8 4.6V8l2.3 1.5" /></svg>
                      <span className="boo-when">{row.timing}</span>
                    </p>
                    <p className="boo-line boo-city">
                      <svg viewBox="0 0 16 16" {...ICON}><path d="M8 14.5s4.5-4 4.5-7.5a4.5 4.5 0 1 0-9 0c0 3.5 4.5 7.5 4.5 7.5z" /><circle cx="8" cy="7" r="1.6" /></svg>
                      <span>{row.city}<Distance row={row} origin={origin} /></span>
                    </p>
                    <div className="boo-bottom">
                    {(() => {
                      const price = priceParts(row);
                      return price.note ? (
                        <p className="boo-note">{price.note}</p>
                      ) : (
                        <p className="boo-pricerow" aria-label={row.priceLabel}>
                          {price.from ? <span className="boo-from">from</span> : null}
                          <span className="boo-amt">{price.text}</span>
                        </p>
                      );
                    })()}
                    {row.bookable === false && alternatives.some((alt) => row.alternatives?.includes(alt.id) && alt.bookable !== false && Number.isFinite(alt.distanceMi) && alt.distanceMi <= 40) ? <p className="boo-alts" data-haunt-alternatives=""><span>Nearby ticket options:</span>{alternatives.filter((alt) => row.alternatives?.includes(alt.id) && alt.bookable !== false && Number.isFinite(alt.distanceMi) && alt.distanceMi <= 40).map((alt) => <a key={alt.id} href={"#haunt-" + alt.id}>{alt.name}</a>)}</p> : null}
                    <a className={"boo-buy" + (row.bookable === false ? " is-muted" : "")} href={row.cta.href} target={row.cta.kind === "affiliate" ? "_blank" : undefined} rel={row.cta.kind === "affiliate" ? "sponsored nofollow noopener" : row.cta.rel} data-commerce-owner={row.cta.kind === "organizer" ? "BoHalloweenHaunt" : undefined} onClick={row.cta.kind === "organizer" ? () => organizerTap(row) : undefined}>{row.cta.label}</a>
                    <p className="boo-via">{row.cta.via}</p>
                    <a className="boo-event" href={row.eventHref}>{chrome.eventPage}</a>
                    </div>
                  </div>
                </article>
  );
}

export function TourCard({ t, priority = false, origin }) {
  const photos = t.photos || (t.photo ? [t.photo] : []);
  return (
    <article id={"tour-" + t.id} data-tour-id={t.id} data-browse-id={t.id} data-tour-kind={t.kind || undefined} className="boo-card">
      <PhotoStrip photos={photos} priority={priority} />
      <div className="boo-body">
        <span className="boo-chip">{t.formatLabel || "Ghost tour"}</span>
        <h2>{t.name}</h2>
        <PhotoCredit photos={photos} />
        {t.browseGroup ? <p className="boo-group-label">{t.browseGroup}</p> : null}
        <Rating row={t} />
        {t.duration ? <p className="boo-line"><svg viewBox="0 0 16 16" {...ICON}><circle cx="8" cy="8" r="6.2" /><path d="M8 4.6V8l2.3 1.5" /></svg><span>{t.duration}</span></p> : null}
        <p className="boo-line boo-city"><svg viewBox="0 0 16 16" {...ICON}><path d="M8 14.5s4.5-4 4.5-7.5a4.5 4.5 0 1 0-9 0c0 3.5 4.5 7.5 4.5 7.5z" /><circle cx="8" cy="7" r="1.6" /></svg><span>{t.place}<Distance row={t} origin={origin} /></span></p>
        <div className="boo-bottom">
          {Number.isFinite(t.fromPrice) && t.fromPrice > 0 ? <p className="boo-pricerow" aria-label={t.priceLabel + (t.priceUnit ? " " + t.priceUnit : "")}><span className="boo-from">from</span><span className="boo-amt">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(t.fromPrice)}</span>{t.priceUnit ? <span className="boo-from">{t.priceUnit}</span> : null}</p> : <p className="boo-note">Check current price</p>}
          <a className="boo-buy" href={t.cta.href} target="_blank" rel="sponsored nofollow noopener">{t.cta.label}</a>
          <p className="boo-via">{t.cta.via}</p>
          {t.eventHref ? <a className="boo-event" href={t.eventHref}>Full event page</a> : null}
        </div>
      </div>
    </article>
  );
}

export function CategoryRail({ rail, origin }) {
  const scroller = useRef(null);
  const move = (direction) => {
    const el = scroller.current;
    if (!el) return;
    const step = (el.firstElementChild?.getBoundingClientRect().width || el.clientWidth) + 14;
    el.scrollBy({ left: direction * step, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  };
  return (
    <section className="boo-rail-section" data-halloween-category={rail.id} data-halloween-rail={rail.id} aria-labelledby={"boo-rail-title-" + rail.id}>
      <div className="boo-rail-heading"><h2 id={"boo-rail-title-" + rail.id}>{rail.title} <small>{rail.cards.length} {rail.cards.length === 1 ? "option" : "options"}</small></h2>{rail.cards.length > 1 ? <div className="boo-rail-controls"><button type="button" aria-label={"Previous " + rail.title} onClick={() => move(-1)}>←</button><button type="button" aria-label={"Next " + rail.title} onClick={() => move(1)}>→</button></div> : null}</div>
      <p className="boo-rail-disclosure">Wayfind may earn a commission when you book through partner links. Rankings are never for sale.</p>
      <div ref={scroller} data-halloween-rail-track="" className="boo-rail" role="group" aria-label={rail.title + " listings"} tabIndex={0} onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); move(event.key === "ArrowRight" ? 1 : -1); } }}>
        {rail.cards.map((row, i) => row.browseType === "haunt" ? <HauntCard key={row.id} row={row} origin={origin} alternatives={rail.cards} priority={i === 0} /> : <TourCard key={row.id} t={row} origin={origin} priority={i === 0} />)}
      </div>
    </section>
  );
}

const CATEGORIES = [{ id: "all", label: "All categories" }, { id: "family", label: "Family" }, { id: "scares", label: "Scares" }, { id: "ghost", label: "Ghost tours" }, { id: "parties", label: "Parties" }];
const SORT_KEY = "wf_halloween_sort";

export function HalloweenBrowseContent({ model, share = null, initialFilter = "all", location }) {
  const { chrome } = model;
  const { origin } = location;
  const [filter, setFilter] = useState(initialFilter === "tours" ? "ghost" : ["major", "local"].includes(initialFilter) ? "scares" : initialFilter);
  const [sort, setSort] = useState("rated");
  const [areaOpen, setAreaOpen] = useState(false);
  useEffect(() => {
    document.body.classList.add("wf-halloween-browse");
    try { const saved = localStorage.getItem(SORT_KEY); if (["rated", "near", "price"].includes(saved)) setSort(saved); } catch { /* storage can be disabled */ }
    return () => document.body.classList.remove("wf-halloween-browse");
  }, []);
  const browse = halloweenBrowse(model, { lat: origin?.lat, lng: origin?.lng, sort, category: filter });
  const applySort = (value) => { setSort(value); try { localStorage.setItem(SORT_KEY, value); } catch { /* storage can be disabled */ } trackHauntEvent("boo_sort_applied", { sort: value }); };
  const applyFilter = (value) => { setFilter(value); trackHauntEvent("boo_preference_applied", { filter_id: value, pick_id: "none" }); };
  return (
    <section className="boo-page" aria-labelledby="boo-title" data-analytics-page="halloween_haunts">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <CommerceClickBeacon surface="halloween_haunts" />
      <FestivalLights />
      <WayfindHeader />
      <div className="boo-main">
        <div className="boo-hero" id="boo-hero">
          <h1 id="boo-title">{chrome.title}</h1>
          <p className="boo-lede">Find Halloween plans within 40 miles. Browse family outings, scares, ghost tours and parties.</p>
          <div className="boo-boo-row"><div className="boo-art"><svg viewBox="0 0 96 96" role="img" aria-label={chrome.videoLabel}><image href={BOO_ART} x="0" y="0" width="96" height="96" preserveAspectRatio="xMidYMid meet" /></svg></div><p className="boo-bubble">Pick your area, then find your kind of spooky.</p></div>
          <button type="button" className="boo-ask" onClick={openBoo}>{chrome.ask}</button>
          {share ? <div className="boo-share">{share}</div> : null}
        </div>
        <section className="boo-location" aria-labelledby="boo-location-title">
          <h2 id="boo-location-title">{origin ? "Halloween near " + origin.label : "Where are you looking?"}</h2>
          <p>{origin?.kind === "device" ? "Distances use your current location, within 40 miles." : origin ? "Distances are from the selected area center, within 40 miles. This is not your exact location." : "Use your location or choose an area to see nearby plans. We only show listings with a confirmed location."}</p>
          <div className="boo-location-controls">
            <button type="button" onClick={location.requestLocation} disabled={location.status === "requesting"}>{location.status === "requesting" ? "Finding your location…" : "Use my location"}</button>
            {origin?.kind !== "device" ? <button type="button" aria-expanded={areaOpen} onClick={() => setAreaOpen(!areaOpen)}>Choose area</button> : null}
            {areaOpen && origin?.kind !== "device" ? <label>Florida area<select aria-label="Choose a Florida area" defaultValue="" onChange={(event) => { if (event.target.value) location.chooseArea(event.target.value); }}><option value="" disabled>Choose an area</option>{location.areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label> : null}
          </div>
          {location.error ? <p role="status">{location.error}</p> : null}
        </section>
        <div id="boo-vault" data-haunt-vault="">
          <div className="boo-controls"><div className="boo-filters" role="group" aria-label="Halloween categories">{CATEGORIES.map((item) => <button type="button" key={item.id} data-filter-id={item.id} aria-pressed={filter === item.id} onClick={() => applyFilter(item.id)}>{item.label}</button>)}</div><CollectionFilter sortBy={sort} onSort={applySort} radius={40} fixedRadius city={origin?.label || "your selected location"} /></div>
          {origin ? <p className="boo-sort-note" role="status">{browse.cards.length} {browse.cards.length === 1 ? "option" : "options"} within 40 miles. {sort === "rated" ? "Wayfind scores and traveler reviews are shown separately; unrated listings follow." : sort === "price" ? "Prices are ordered within the same admission basis; unknown prices follow." : "Closest listings appear first in each category."}</p> : null}
          {model.locationDataStatus === "unavailable" ? <p className="boo-empty" role="status">Some listing locations could not be loaded. Nearby results may be incomplete. Please try again later.</p> : null}
          {browse.rails.filter((rail) => rail.cards.length > 0).map((rail) => <CategoryRail key={rail.id} rail={rail} origin={origin} />)}
          {origin && !browse.cards.length && model.locationDataStatus !== "unavailable" ? <p className="boo-empty" role="status">No confirmed listings in this category within 40 miles {origin.kind === "area" ? "of this area center" : "of your location"}. Try another category or choose another area.</p> : null}
          {origin && browse.coverage.unknown > 0 ? <p className="boo-sort-note">Listings without confirmed coordinates are excluded from these nearby results.</p> : null}
        </div>
      </div>
    </section>
  );
}

export default function BoHalloweenHaunt(props) {
  const location = useHalloweenLocation();
  return <HalloweenBrowseContent {...props} location={location} />;
}
