"use client";

import { useState } from "react";
import { captureOrQueue } from "../../lib/browserAnalytics.js";
import GuidePhoto from "./GuidePhoto.js";
import PhotoCreditLink from "./PhotoCreditLink.js";
import { NavIcon } from "./kit.js";
import CommerceClickBeacon from "./CommerceClickBeacon.js";
import { GuideCommissionLine } from "./GuideCommissionLine.js";
import { emitCommerce } from "../../lib/commerce.js";
import { activeSeasonalMark } from "../../lib/seasonalBrand.js";

// Wayfind home header replica plus Christmas ticket cards, built like the
// Halloween page (BoHalloweenHaunt). Deep night, warm white text, one festive
// pair (red and evergreen) and soft gold only on the light bulbs. Every
// visible string comes from the server model (lib/christmasTickets.js) and is
// dash free. The statewide browse and the watchlist arrive as `browse`.
const SURFACE = "christmas_tickets";
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

function track(event, props) {
  if (typeof window === "undefined") return;
  try { captureOrQueue(window, event, { surface: SURFACE, ...props }); } catch { /* ignore */ }
}

// Organizer links (no affiliate, not one of our /go routes) are invisible to
// CommerceClickBeacon, so the card records its own single tap. Our /go links
// are recorded once by the beacon and never here.
function organizerTap(row) {
  try {
    emitCommerce("commerce_cta_clicked", { surface: SURFACE, provider: "organizer", merchant: new URL(row.cta.href).hostname, content_id: row.id });
  } catch { /* ignore */ }
}

function askSanta() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("wf:boo-open"));
}

const CSS = `
.xm-page{
  --bg:#050A14;--surface:#0E1727;--line:#24344D;
  --red:#E8343F;--redfill:#D92C37;--green:#3FBF7F;--cream:#FFF8EE;--muted:#A3B2C8;--soft:#8D9DB5;
  background:var(--bg);color:var(--cream);
  font-family:var(--wf-sans),sans-serif;font-weight:400;
  min-height:100dvh;overflow-x:clip;box-sizing:border-box;padding-bottom:56px;
}
.xm-page *,.xm-page *::before,.xm-page *::after{box-sizing:border-box}
.xm-page button,.xm-page a,.xm-page input{font-family:inherit}

/* Festival string lights: sagging wire, red green gold and warm white bulbs that gently twinkle */
.xm-lights{position:relative;height:28px;pointer-events:none;overflow-x:clip;z-index:30}
.xm-wire{position:absolute;inset:0;width:100%;height:100%}
.xm-bulb{
  position:absolute;top:12px;width:11px;height:15px;margin-left:-5.5px;
  border-radius:50% 50% 55% 55%;background:var(--bc,#E8343F);
  box-shadow:0 0 8px 2px var(--bg-glow,rgba(232,52,63,.55)),0 0 18px 6px var(--bg-glow2,rgba(232,52,63,.2));
  animation:xm-twinkle var(--f,3.2s) ease-in-out var(--d,0s) infinite;
}
.xm-bulb:nth-child(4n+1){--bc:#E8343F;--bg-glow:rgba(232,52,63,.55);--bg-glow2:rgba(232,52,63,.2)}
.xm-bulb:nth-child(4n+2){--bc:#3FBF7F;--bg-glow:rgba(63,191,127,.5);--bg-glow2:rgba(63,191,127,.18)}
.xm-bulb:nth-child(4n+3){--bc:#F5C451;--bg-glow:rgba(245,196,81,.55);--bg-glow2:rgba(245,196,81,.2)}
.xm-bulb:nth-child(4n+4){--bc:#FFF1D6;--bg-glow:rgba(255,241,214,.5);--bg-glow2:rgba(255,241,214,.18)}
@keyframes xm-twinkle{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(.94)}}
@media(prefers-reduced-motion:reduce){.xm-bulb{animation:none}}

/* Wayfind header replica (home classes and values) */
.wf-topbar{background:#040810;border-bottom:1px solid #2D3748;padding:12px 14px;padding-top:max(12px,env(safe-area-inset-top));position:relative;z-index:20;box-shadow:inset 0 1px 0 rgba(255,255,255,.025),0 8px 20px rgba(0,0,0,.12)}
.wf-topbar:after{content:"";position:absolute;left:14px;right:14px;bottom:-1px;height:1px;background:linear-gradient(90deg,transparent,rgba(249,115,22,.48),transparent);opacity:.6}
.xm-topin{max-width:800px;margin:0 auto}
.wf-topbar-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.wf-wordmark{display:flex;align-items:center;gap:5px;flex-shrink:0;filter:drop-shadow(0 4px 12px rgba(0,0,0,.3));text-decoration:none}
.wf-wordmark-text{display:block;flex:none;width:154.05px;height:39.06px;background-image:url("/brand/wayfind-wordmark-original-v3.png");background-image:image-set(url("/brand/opt/wordmark-original-v3-400.avif") type("image/avif"),url("/brand/opt/wordmark-original-v3-400.webp") type("image/webp"));background-repeat:no-repeat;background-size:contain;background-position:center}
.xm-goto{
  flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 16px;border-radius:999px;
  background:#F97316;color:#0D1117;font-size:13px;font-weight:800;text-decoration:none;white-space:nowrap;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 7px 14px rgba(249,115,22,.22);
}
.wf-navtabs{display:flex;gap:18px;overflow-x:auto;scrollbar-width:none;margin:0 0 8px;padding:0 2px;overscroll-behavior-x:contain}
.wf-navtabs::-webkit-scrollbar,.wf-dests::-webkit-scrollbar{display:none}
.wf-navtab{position:relative;display:inline-flex;align-items:center;gap:7px;flex:0 0 auto;padding:5px 0 10px;font-size:14px;font-weight:600;color:#8A96AE;white-space:nowrap;text-decoration:none;transition:color .16s ease}
.wf-navtab:hover{color:#CBD4E8}
.wf-navtab:focus-visible,.wf-dest:focus-visible,.xm-goto:focus-visible{outline:2px solid #F97316;outline-offset:2px;border-radius:6px}
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
.xm-main{max-width:720px;margin:0 auto;padding:20px 16px 0}
.xm-hero h1{margin:0 0 6px;font-size:26px;line-height:1.2;font-weight:700;color:var(--cream);letter-spacing:-.01em;text-wrap:balance}
.xm-lede{margin:0;font-size:15px;line-height:1.5;color:var(--muted)}
.xm-honest{margin:8px 0 0;font-size:13px;line-height:1.5;color:var(--soft)}
.xm-ask{margin-top:16px;width:100%;min-height:48px;border-radius:12px;border:0;cursor:pointer;background:var(--redfill);color:#fff;font-size:15px;font-weight:700}
.xm-share{margin-top:8px;display:flex;justify-content:flex-start}
.xm-share button,.xm-share a{min-height:44px}
.xm-jump{display:inline-flex;align-items:center;gap:6px;margin-top:4px;min-height:44px;padding:0;background:none;border:0;cursor:pointer;color:var(--green);font-size:14px;font-weight:600;text-decoration:underline;text-underline-offset:3px}
.xm-jump:focus-visible,.xm-filters button:focus-visible,.xm-ask:focus-visible,.xm-buy:focus-visible,.xm-card a:focus-visible{outline:2px solid var(--green);outline-offset:2px}

#xm-tickets{margin-top:24px;scroll-margin-top:12px}
.xm-filters{display:flex;flex-wrap:wrap;gap:8px}
.xm-filters button{min-height:44px;padding:8px 14px;border-radius:999px;cursor:pointer;background:transparent;color:var(--green);border:1px solid var(--line);font-size:14px;font-weight:600}
.xm-filters button[aria-pressed="true"]{background:var(--green);color:#04120B;border-color:var(--green)}
.xm-count{margin:16px 0 0;font-size:14px;color:var(--muted)}
.xm-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;margin-top:12px}
@media(min-width:720px){.xm-main{max-width:960px}.xm-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.xm-card{display:grid;grid-template-columns:40% minmax(0,1fr);min-width:0;overflow:hidden;background:var(--surface);border:1px solid var(--line);border-radius:12px;scroll-margin-top:12px}
.xm-photo{position:relative;min-width:0;min-height:230px;height:100%;background:var(--surface);overflow:hidden}
.xm-strip{position:absolute;inset:0;display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;scrollbar-width:none;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch}
.xm-strip::-webkit-scrollbar{display:none}
.xm-slide{position:relative;flex:0 0 100%;min-width:0;height:100%;scroll-snap-align:start;scroll-snap-stop:always;overflow:hidden}
.xm-slide img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.xm-ph,.xm-tile{position:absolute;inset:0;background:linear-gradient(180deg,#14213A 0%,#050A14 100%)}
.xm-ph{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:12px;text-align:center}
.xm-ph::before{content:"\\2728";font-size:30px;line-height:1;opacity:.85}
.xm-ph span{font-size:12px;font-weight:600;line-height:1.3;color:var(--muted)}
.xm-tile{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:12px;text-align:center}
.xm-tile i{font-style:normal;font-size:34px;line-height:1;opacity:.9}
.xm-tile b{font-size:12px;font-weight:600;line-height:1.3;color:var(--muted)}
.xm-dots{position:absolute;left:0;right:0;bottom:8px;z-index:1;display:flex;justify-content:center;gap:5px;pointer-events:none}
.xm-dots i{width:6px;height:6px;border-radius:50%;background:rgba(255,248,238,.45)}
.xm-dots i.is-on{background:#FFF8EE}
.xm-body{display:flex;flex-direction:column;gap:6px;min-width:0;padding:12px}
.xm-chip{align-self:flex-start;max-width:100%;padding:3px 9px;border-radius:999px;background:rgba(63,191,127,.14);color:var(--green);font-size:12px;font-weight:600;line-height:1.4}
.xm-card h2{margin:0;font-size:16px;line-height:1.3;min-height:calc(1.3em * 2);font-weight:700;color:var(--cream);overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.xm-credit{margin:0;font-size:11px;line-height:1.35;height:calc(1.35em);color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.xm-credit a{color:inherit;text-decoration:underline;text-underline-offset:2px}
.xm-line{display:flex;align-items:flex-start;gap:7px;margin:0;font-size:13px;line-height:1.4;color:var(--muted);min-width:0;overflow-wrap:anywhere}
.xm-line .xm-when{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;min-height:calc(1.4em * 2)}
.xm-line svg{flex:0 0 auto;width:15px;height:15px;margin-top:1px}
.xm-bottom{margin-top:auto;display:flex;flex-direction:column;gap:6px;padding-top:6px}
.xm-pricerow,.xm-note{min-height:calc(1.2em + 12px * 1.2 + 2px)}
.xm-pricerow{display:flex;flex-direction:column;align-items:flex-end;margin:0;min-width:0}
.xm-from{font-size:12px;line-height:1.2;color:var(--soft)}
.xm-amt{text-align:right;font-size:22px;line-height:1.2;font-weight:800;color:var(--cream)}
.xm-note{margin:0;font-size:13px;line-height:1.35;color:var(--cream);text-align:right;overflow-wrap:anywhere}
.xm-buy{display:flex;align-items:center;justify-content:center;width:100%;min-height:46px;padding:6px 8px;background:var(--redfill);color:#fff;border:2px solid var(--redfill);border-radius:12px;font-size:15px;font-weight:700;line-height:1.2;text-decoration:none;text-align:center}
.xm-via{margin:0;font-size:11px;line-height:1.35;color:var(--soft);text-align:center}
.xm-event{display:flex;align-items:center;justify-content:center;min-height:44px;color:var(--green);font-size:13px;font-weight:600;text-decoration:underline;text-underline-offset:3px}
.xm-foot{margin-top:18px}
.xm-foot .wf-guide-commission{font-size:12px !important;color:var(--soft) !important;margin:0 !important}
.xm-empty{margin:16px 0 0;color:var(--muted);font-size:14px}
.xm-all{max-width:1180px;margin:44px auto 0;padding:28px 16px 0;border-top:1px solid var(--line);scroll-margin-top:12px}
.xm-all h2{margin:0 0 6px;font-size:22px;line-height:1.25;font-weight:700;color:var(--cream)}
.xm-all-body{min-width:0}
`;

function FestivalLights() {
  return (
    <div className="xm-lights" aria-hidden="true">
      <svg className="xm-wire" viewBox="0 0 1200 28" preserveAspectRatio="none">
        <path d={WIRE_PATH} fill="none" stroke="rgba(163,178,200,.4)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      {Array.from({ length: BULB_COUNT }, (_, i) => (
        <span
          key={i}
          className="xm-bulb"
          style={{
            left: (((i + 0.5) / BULB_COUNT) * 100).toFixed(2) + "%",
            "--d": "-" + ((i * 1.7) % 9).toFixed(1) + "s",
            "--f": (2.8 + ((i * 37) % 30) / 10).toFixed(1) + "s",
          }}
        />
      ))}
    </div>
  );
}

// The wordmark follows the one seasonal resolver like every other header
// (owner direction: the original logo sitewide, so this is null today).
function seasonalMarkCss(mark) {
  if (!mark) return "";
  const width = (49.1 * mark.width / mark.height).toFixed(1);
  return `.wf-wordmark.is-seasonal{gap:0}.wf-wordmark.is-seasonal .wf-wordmark-text{width:${width}px;height:49.1px;background-image:url("${mark.png}");background-image:image-set(url("${mark.avif}") type("image/avif"),url("${mark.webp}") type("image/webp"));background-position:center;background-size:contain}`;
}

function WayfindHeader({ seasonal }) {
  return (
    <div className="wf-topbar">
      <div className="xm-topin">
        <div className="wf-topbar-row">
          <a className={"wf-wordmark" + (seasonal ? " is-seasonal" : "")} href="/" aria-label="Wayfind home">
            <span className="wf-wordmark-text" aria-hidden="true" />
          </a>
          <a className="xm-goto" href="/">Go to Wayfind<span aria-hidden="true">→</span></a>
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

const ICON = { fill: "none", stroke: "#8D9DB5", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };

function PhotoStrip({ row, priority }) {
  const [active, setActive] = useState(0);
  const photos = row.photos;
  const onScroll = (event) => {
    const el = event.currentTarget;
    if (!el.clientWidth) return;
    setActive(Math.max(0, Math.min(photos.length - 1, Math.round(el.scrollLeft / el.clientWidth))));
  };
  if (!photos.length) {
    const tile = row.placeholder || { icon: "✨", label: "Christmas event" };
    return (
      <div className="xm-photo" data-photo-count="0">
        <div className="xm-tile" data-event-tile="" role="img" aria-label={tile.label}>
          <i aria-hidden="true">{tile.icon}</i>
          <b>{tile.label}</b>
        </div>
      </div>
    );
  }
  return (
    <div className="xm-photo" data-photo-strip="" data-photo-count={photos.length}>
      <div className="xm-strip" onScroll={onScroll} role="group" aria-label="Photos" tabIndex={photos.length > 1 ? 0 : undefined}>
        {photos.map((photo, i) => (
          <div className="xm-slide" key={photo.src}>
            <GuidePhoto
              src={photo.src}
              alt={photo.alt}
              width={photo.width}
              height={photo.height}
              sizes="(min-width: 720px) 190px, 40vw"
              loading={i === 0 && priority ? "eager" : "lazy"}
              fallbackClassName="xm-ph"
              fallbackText={(row.placeholder && row.placeholder.label) || "Christmas event"}
            />
          </div>
        ))}
      </div>
      {photos.length > 1 ? (
        <div className="xm-dots" aria-hidden="true">
          {photos.map((photo, i) => <i key={photo.src} className={i === active ? "is-on" : ""} />)}
        </div>
      ) : null}
    </div>
  );
}

function PhotoCredit({ photos }) {
  const seen = new Set();
  const lines = (photos || []).filter((p) => p && p.credit && !seen.has(p.credit) && seen.add(p.credit));
  if (!lines.length) return <p className="xm-credit" aria-hidden="true">&nbsp;</p>;
  return (
    <p className="xm-credit">
      {lines.map((photo, i) => (
        <span key={photo.credit}>
          {i ? " · " : ""}
          {photo.creditHref ? <PhotoCreditLink href={photo.creditHref} rel="nofollow">{photo.credit}</PhotoCreditLink> : photo.credit}
        </span>
      ))}
    </p>
  );
}

function TicketCard({ row, chrome, priority }) {
  const affiliate = row.cta.kind === "affiliate";
  const { price } = row;
  return (
    <article id={"xm-" + row.id} data-ticket-id={row.id} className="xm-card">
      <PhotoStrip row={row} priority={priority} />
      <div className="xm-body" data-boo-clear="">
        <span className="xm-chip">{row.chip}</span>
        <h2>{row.name}</h2>
        <PhotoCredit photos={row.photos} />
        <p className="xm-line">
          <svg viewBox="0 0 16 16" {...ICON}><circle cx="8" cy="8" r="6.2" /><path d="M8 4.6V8l2.3 1.5" /></svg>
          <span className="xm-when">{row.when}</span>
        </p>
        <p className="xm-line xm-city">
          <svg viewBox="0 0 16 16" {...ICON}><path d="M8 14.5s4.5-4 4.5-7.5a4.5 4.5 0 1 0-9 0c0 3.5 4.5 7.5 4.5 7.5z" /><circle cx="8" cy="7" r="1.6" /></svg>
          <span>{row.city}</span>
        </p>
        <div className="xm-bottom">
          {price.kind === "from" ? (
            <p className="xm-pricerow" aria-label={"From " + price.text + (price.unit ? " " + price.unit : "")}>
              <span className="xm-from">from</span>
              <span className="xm-amt">{price.text}</span>
              {price.unit ? <span className="xm-from">{price.unit}</span> : null}
            </p>
          ) : price.kind === "free" ? (
            <p className="xm-pricerow" aria-label={price.text}><span className="xm-amt">{price.text}</span></p>
          ) : (
            <p className="xm-note">{price.text}</p>
          )}
          <a
            className="xm-buy"
            href={row.cta.href}
            target="_blank"
            rel={affiliate ? "sponsored nofollow noopener" : "nofollow noopener"}
            data-commerce-owner={affiliate ? undefined : "ChristmasTickets"}
            onClick={affiliate ? undefined : () => organizerTap(row)}
          >{row.cta.label}</a>
          <p className="xm-via">{row.cta.via}</p>
          {row.eventHref ? <a className="xm-event" href={row.eventHref}>{chrome.eventPage}</a> : null}
        </div>
      </div>
    </article>
  );
}

export default function ChristmasTickets({ model, share = null, browse = null, initialFilter = "all" }) {
  const { chrome, filters, rows } = model;
  const [filter, setFilter] = useState(filters.some((f) => f.id === initialFilter) ? initialFilter : "all");
  const shown = filter === "all" ? rows : rows.filter((r) => r.filters.includes(filter));

  const applyFilter = (id) => {
    setFilter(id);
    track("christmas_filter_applied", { filter_id: id });
  };
  const jumpAll = () => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      const node = document.getElementById("xm-all");
      if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const seasonal = activeSeasonalMark();
  return (
    <section className="xm-page" aria-labelledby="xm-title" data-analytics-page={SURFACE}>
      <style dangerouslySetInnerHTML={{ __html: CSS + seasonalMarkCss(seasonal) }} />
      <CommerceClickBeacon surface={SURFACE} />
      <FestivalLights />
      <WayfindHeader seasonal={seasonal} />

      <div className="xm-main">
        <div className="xm-hero" id="xm-hero" data-boo-clear="">
          <h1 id="xm-title">{chrome.title}</h1>
          <p className="xm-lede">{chrome.lede}</p>
          <p className="xm-honest">{chrome.honest}</p>
          <button type="button" className="xm-ask" onClick={askSanta}>{chrome.ask}</button>
          {share ? <div className="xm-share">{share}</div> : null}
          {browse ? <button type="button" className="xm-jump" onClick={jumpAll}>{chrome.allHeading}<span aria-hidden="true">↓</span></button> : null}
        </div>

        <div id="xm-tickets" data-ticket-grid="">
          {filters.length > 1 ? (
            <div className="xm-filters" data-boo-clear="" role="toolbar" aria-label="Filter Christmas tickets">
              {filters.map((item) => (
                <button type="button" key={item.id} aria-pressed={filter === item.id} onClick={() => applyFilter(item.id)}>{item.label}</button>
              ))}
            </div>
          ) : null}
          {shown.length ? (
            <div className="xm-grid">
              {shown.map((row, i) => <TicketCard key={row.id} row={row} chrome={chrome} priority={i < 2} />)}
            </div>
          ) : (
            <p className="xm-empty">No ticketed events match this filter right now.</p>
          )}
          {model.hasAffiliate ? <div className="xm-foot"><GuideCommissionLine /></div> : null}
        </div>

      </div>

      {browse ? (
        <div id="xm-all" className="xm-all">
          <h2>{chrome.allHeading}</h2>
          <div className="xm-all-body">{browse}</div>
        </div>
      ) : null}
    </section>
  );
}
