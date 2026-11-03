"use client";

import { useEffect, useRef, useState } from "react";
import { XM_CARD_CSS } from "./ChristmasTicketCard.js";
import CommerceClickBeacon from "./CommerceClickBeacon.js";
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
  let d = "M0 6";
  for (let i = 0; i < BULB_COUNT; i += 1) {
    d += " Q" + ((i + 0.5) * WIRE_PITCH).toFixed(1) + " 30 " + ((i + 1) * WIRE_PITCH).toFixed(1) + " 6";
  }
  return d;
})();
// Rotating light sequences (chase, alternate, twinkle). CSS only: each pattern
// animates opacity and transform on the bulbs, so it stays GPU cheap.
const LIGHT_PATTERNS = ["twinkle", "chase", "alt", "chase"];

// Faint festive doodles (gift, holly, candy cane, ornament, tree, snowflake) as
// one tiling line drawing, plus a separate tile of gold sparkles that twinkles.
const DOODLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="520" viewBox="0 0 520 520" fill="none" stroke="#E8B48A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
<g transform="translate(46 62) rotate(-8)"><rect x="0" y="16" width="52" height="38"/><rect x="-4" y="6" width="60" height="12"/><path d="M26 6v48M26 6c-12-14-24-2-10 0M26 6c12-14 24-2 10 0"/></g>
<g transform="translate(318 40) rotate(14)"><path d="M0 30c6-18 22-22 32-12-4 14-18 22-32 12zM34 30c8-16 24-18 32-6-6 14-20 20-32 6z"/><circle cx="30" cy="40" r="5"/><circle cx="40" cy="46" r="5"/><circle cx="24" cy="48" r="5"/></g>
<g transform="translate(400 250)"><path d="M30 0l26 36H4zM30 24l34 44H-4zM30 52l42 52H-12z"/><path d="M30 104v14M30 -10l3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z"/></g>
<g transform="translate(120 290) rotate(-12)"><path d="M0 70V18a18 18 0 0 1 36 0v6"/><path d="M0 52l16-8M0 38l16-8M0 24l16-8"/></g>
<g transform="translate(250 390)"><circle cx="30" cy="40" r="26"/><path d="M24 14h12v-8H24zM30 6V-2"/><path d="M14 36c10 8 22 8 32 0"/></g>
<g transform="translate(40 410)"><path d="M0 -26v52M-22 -13l44 26M-22 13l44 -26M-6 -22l6 6 6 -6M-6 22l6 -6 6 6"/></g>
<g transform="translate(250 190)"><path d="M0 -14v28M-14 0h28M-10 -10l20 20M-10 10l20 -20"/></g>
<g transform="translate(470 120)" stroke-width="2"><path d="M0 -12v24M-12 0h24"/></g>
<g transform="translate(180 470)" stroke-width="2"><path d="M0 -10v20M-10 0h20"/></g>
</svg>`;
const SPARKLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="340" viewBox="0 0 340 340" fill="#F5C451">
<path d="M40 30l3 9 9 3-9 3-3 9-3-9-9-3 9-3z"/><path d="M250 70l2.4 7 7 2.4-7 2.4-2.4 7-2.4-7-7-2.4 7-2.4z" opacity=".8"/><path d="M130 150l3.4 10 10 3.4-10 3.4-3.4 10-3.4-10-10-3.4 10-3.4z"/><path d="M300 230l2.6 7.5 7.5 2.6-7.5 2.6-2.6 7.5-2.6-7.5-7.5-2.6 7.5-2.6z" opacity=".8"/><path d="M60 280l3 8.5 8.5 3-8.5 3-3 8.5-3-8.5-8.5-3 8.5-3z"/><circle cx="200" cy="300" r="2.4"/><circle cx="90" cy="100" r="2"/><circle cx="310" cy="140" r="2"/><circle cx="190" cy="40" r="1.8"/></svg>`;
const svgUrl = (svg) => 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';


function askSanta() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("wf:boo-open"));
}

const CSS = XM_CARD_CSS + `
.xm-page{
  --bg:#2C0610;--surface:#5A0712;--line:rgba(232,180,138,.55);
  --red:#E8343F;--redfill:#D92C37;--green:#3FBF7F;--gold:#F5C451;--cream:#FFF6F0;--muted:#F0D3C4;--soft:#E2BBA8;
  color:var(--cream);
  font-family:var(--wf-sans),sans-serif;font-weight:400;position:relative;isolation:isolate;
  background:radial-gradient(120% 55% at 50% 0%,#7A0F22 0%,rgba(122,15,34,0) 62%),linear-gradient(180deg,#4A0816 0%,#38060F 38%,#2C0610 70%,#220409 100%);
  min-height:100dvh;overflow-x:clip;box-sizing:border-box;padding-bottom:56px;
}
.xm-page *,.xm-page *::before,.xm-page *::after{box-sizing:border-box}
.xm-page button,.xm-page a,.xm-page input,.xm-page select{font-family:inherit}

/* Whole page theme: faint line doodles and gold sparkles behind everything */
.xm-doodles,.xm-sparkles{position:absolute;inset:0;z-index:0;pointer-events:none}
.xm-doodles{background-image:${svgUrl(DOODLE_SVG)};background-size:520px 520px;opacity:.16}
.xm-sparkles{background-image:${svgUrl(SPARKLE_SVG)};background-size:340px 340px;opacity:.5;animation:xm-sparkle 7s ease-in-out infinite}
@keyframes xm-sparkle{0%,100%{opacity:.25}50%{opacity:.45}}
.xm-snow{position:fixed;inset:0;width:100%;height:100%;z-index:1;pointer-events:none}
.xm-main{position:relative;z-index:2}

/* Festival string lights: green garland, multicolor bulbs with real glow, rotating chase and twinkle sequences */
.xm-lights{position:relative;height:36px;pointer-events:none;overflow-x:clip;z-index:30}
.xm-wire{position:absolute;inset:0;width:100%;height:100%}
.xm-bulb{
  position:absolute;top:14px;width:12px;height:17px;margin-left:-6px;
  border-radius:50% 50% 55% 55%;
  background:radial-gradient(circle at 36% 28%,#fff 0%,var(--bc) 42%,var(--bd) 100%);
  box-shadow:0 0 6px 1px var(--bg-glow),0 0 14px 3px var(--bg-glow2);
  will-change:opacity,transform;
}
.xm-bulb::before{content:"";position:absolute;left:3px;top:-4px;width:6px;height:5px;border-radius:2px 2px 0 0;background:#1E1A16}
.xm-bulb::after{content:"";position:absolute;left:50%;top:50%;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;background:radial-gradient(circle,var(--bg-glow) 0%,rgba(0,0,0,0) 66%);opacity:.45}
.xm-bulb:nth-of-type(6n+1){--bc:#FF4458;--bd:#B3111F;--bg-glow:rgba(255,68,88,.75);--bg-glow2:rgba(255,68,88,.32)}
.xm-bulb:nth-of-type(6n+2){--bc:#3DDC84;--bd:#13803F;--bg-glow:rgba(61,220,132,.7);--bg-glow2:rgba(61,220,132,.3)}
.xm-bulb:nth-of-type(6n+3){--bc:#FFC94A;--bd:#C98A0B;--bg-glow:rgba(255,201,74,.78);--bg-glow2:rgba(255,201,74,.34)}
.xm-bulb:nth-of-type(6n+4){--bc:#4DA3FF;--bd:#1456B8;--bg-glow:rgba(77,163,255,.75);--bg-glow2:rgba(77,163,255,.32)}
.xm-bulb:nth-of-type(6n+5){--bc:#FF7AC8;--bd:#B02C86;--bg-glow:rgba(255,122,200,.75);--bg-glow2:rgba(255,122,200,.32)}
.xm-bulb:nth-of-type(6n+6){--bc:#FFF1D6;--bd:#D8B27A;--bg-glow:rgba(255,241,214,.7);--bg-glow2:rgba(255,241,214,.28)}
[data-pattern="twinkle"] .xm-bulb{animation:xm-twinkle var(--f,3.2s) ease-in-out var(--d,0s) infinite}
[data-pattern="chase"] .xm-bulb{animation:xm-chase 2s linear infinite;animation-delay:calc(var(--i) * -.11s)}
[data-pattern="alt"] .xm-bulb{animation:xm-alt 1.5s ease-in-out infinite}
[data-pattern="alt"] .xm-bulb:nth-of-type(even){animation-delay:-.75s}
@keyframes xm-twinkle{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.93)}}
@keyframes xm-chase{0%,100%{opacity:.32;transform:scale(.9)}14%,26%{opacity:1;transform:scale(1.1)}48%{opacity:.32;transform:scale(.9)}}
@keyframes xm-alt{0%,100%{opacity:1;transform:scale(1.04)}50%{opacity:.28;transform:scale(.9)}}
@media(prefers-reduced-motion:reduce){.xm-bulb,.xm-sparkles{animation:none!important}.xm-sparkles{opacity:.4}}

/* Wayfind header replica (home classes and values) */
.wf-topbar{background:transparent;border:0;padding:6px 16px 4px;position:relative;z-index:20}
.xm-topin{max-width:800px;margin:0 auto}
.wf-topbar-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0}
.wf-wordmark{display:flex;align-items:center;gap:5px;flex-shrink:0;filter:drop-shadow(0 4px 12px rgba(0,0,0,.3));text-decoration:none}
.wf-wordmark-text{display:block;flex:none;width:154.05px;height:39.06px;background-image:url("/brand/wayfind-wordmark-original-v3.png");background-image:image-set(url("/brand/opt/wordmark-original-v3-400.avif") type("image/avif"),url("/brand/opt/wordmark-original-v3-400.webp") type("image/webp"));background-repeat:no-repeat;background-size:contain;background-position:center}
.xm-goto{
  flex:0 0 auto;display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 16px;border-radius:999px;
  background:#F97316;color:#0D1117;font-size:13px;font-weight:800;text-decoration:none;white-space:nowrap;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 7px 14px rgba(249,115,22,.22);
}
.xm-goto:focus-visible{outline:2px solid #F97316;outline-offset:2px;border-radius:6px}

/* Page body */
.xm-main{max-width:720px;margin:0 auto;padding:20px 16px 0}
.xm-hero h1{margin:0 0 6px;font-size:26px;line-height:1.2;font-weight:700;color:var(--cream);letter-spacing:-.01em;text-wrap:balance;text-shadow:0 2px 10px rgba(30,0,6,.6)}
.xm-lede{margin:0;font-size:15px;line-height:1.5;color:var(--muted)}
.xm-honest{margin:8px 0 0;font-size:13px;line-height:1.5;color:var(--soft)}
.xm-ask{margin-top:16px;width:100%;min-height:48px;border-radius:12px;border:1px solid var(--line);cursor:pointer;background:linear-gradient(180deg,#E0303F,#B01728);color:#fff;font-size:15px;font-weight:700;box-shadow:0 0 14px rgba(232,180,138,.2)}
.xm-share{margin-top:8px;display:flex;justify-content:flex-start}
.xm-share button,.xm-share a{min-height:44px}
.xm-ask:focus-visible,.xm-filters button:focus-visible,.xm-more:focus-visible{outline:2px solid #FFD9AE;outline-offset:2px}

#xm-tickets{margin-top:22px;scroll-margin-top:12px}
.xm-filters{display:flex;flex-wrap:wrap;gap:8px}
@media(max-width:719px){.xm-filters{flex-wrap:nowrap;overflow-x:auto;margin:0 -16px;padding:2px 16px 6px;scrollbar-width:none;overscroll-behavior-x:contain;-webkit-overflow-scrolling:touch}.xm-filters::-webkit-scrollbar{display:none}.xm-filters button{flex:0 0 auto;white-space:nowrap}}
.xm-filters button{min-height:44px;padding:8px 14px;border-radius:999px;cursor:pointer;background:rgba(24,2,8,.5);color:#FFE9C8;border:1px solid rgba(232,180,138,.7);font-size:14px;font-weight:600}
.xm-filters button[aria-pressed="true"]{background:linear-gradient(180deg,#FFE9B8,#F5C451);color:#4A0610;border-color:#F5C451;font-weight:800;box-shadow:0 0 12px rgba(245,196,81,.35)}
.xm-controls{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.xm-controls input::placeholder{color:#D9B3A3;opacity:1}
.xm-count{margin:14px 0 0;font-size:14px;color:var(--muted)}
.xm-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;margin-top:12px}
@media(min-width:720px){.xm-main{max-width:960px}.xm-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.xm-more{margin-top:16px;min-height:48px;padding:0 22px;border-radius:12px;cursor:pointer;background:linear-gradient(180deg,#FFE9B8,#F5C451);color:#4A0610;border:2px solid #E8B48A;font-size:15px;font-weight:800}
.xm-more:disabled{opacity:.7;cursor:default}
.xm-foot{margin-top:18px}
.xm-foot .wf-guide-commission{font-size:12px !important;color:var(--soft) !important;margin:0 !important}
.xm-empty{margin:16px 0 0;color:var(--muted);font-size:14px}
`;

function FestivalLights() {
  const [pattern, setPattern] = useState("twinkle");
  useEffect(() => {
    if (typeof window === "undefined" || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) return undefined;
    let n = 0;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      n += 1;
      setPattern(LIGHT_PATTERNS[n % LIGHT_PATTERNS.length]);
    }, 6500);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="xm-lights" aria-hidden="true" data-pattern={pattern}>
      <svg className="xm-wire" viewBox="0 0 1200 36" preserveAspectRatio="none">
        <path d={WIRE_PATH} fill="none" stroke="rgba(20,8,10,.85)" strokeWidth="1.6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {Array.from({ length: BULB_COUNT }, (_, i) => (
        <span
          key={i}
          className="xm-bulb"
          style={{
            left: (((i + 0.5) / BULB_COUNT) * 100).toFixed(2) + "%",
            "--i": i,
            "--d": "-" + ((i * 1.7) % 9).toFixed(1) + "s",
            "--f": (2.6 + ((i * 37) % 30) / 10).toFixed(1) + "s",
          }}
        />
      ))}
    </div>
  );
}

// Gentle falling snow, drawn behind the page content (z-index below it, no
// pointer events, hidden from assistive tech). Capped at 36 flakes on a phone
// and 70 on a desktop, paused while the tab is hidden, and with reduced motion
// a single still frame of flakes instead of falling snow.
function Snow() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || typeof window === "undefined") return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    const reduced = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    let w = 0, h = 0, raf = 0, last = 0;
    let flakes = [];
    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth; h = window.innerHeight;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = w < 720 ? 36 : 70;
      flakes = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h, r: 0.9 + Math.random() * 2.3,
        v: 14 + Math.random() * 26, sw: 8 + Math.random() * 16, ph: Math.random() * 6.28, a: 0.35 + Math.random() * 0.5,
      }));
    };
    const paint = (t) => {
      ctx.clearRect(0, 0, w, h);
      for (const f of flakes) {
        ctx.globalAlpha = f.a;
        ctx.fillStyle = "#FFF8EE";
        ctx.beginPath();
        ctx.arc(f.x + (reduced ? 0 : Math.sin(t / 1800 + f.ph) * f.sw), f.y, f.r, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    const tick = (now) => {
      raf = window.requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      for (const f of flakes) {
        f.y += f.v * dt;
        if (f.y > h + 6) { f.y = -6; f.x = Math.random() * w; }
      }
      paint(now);
    };
    const start = () => { if (!raf && !reduced) { last = 0; raf = window.requestAnimationFrame(tick); } };
    const stop = () => { if (raf) { window.cancelAnimationFrame(raf); raf = 0; } };
    const onVisibility = () => (document.hidden ? stop() : start());
    const onResize = () => { build(); if (reduced) paint(0); };
    build();
    if (reduced) paint(0); else start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("resize", onResize);
    return () => { stop(); document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("resize", onResize); };
  }, []);
  return <canvas ref={ref} className="xm-snow" aria-hidden="true" data-xm-snow="" />;
}

// The wordmark follows the one seasonal resolver like every other header
// (owner direction: the original logo sitewide, so this is null today).
function seasonalMarkCss(mark) {
  if (!mark) return "";
  const width = (49.1 * mark.width / mark.height).toFixed(1);
  return `.wf-wordmark.is-seasonal{gap:0}.wf-wordmark.is-seasonal .wf-wordmark-text{width:${width}px;height:49.1px;background-image:url("${mark.png}");background-image:image-set(url("${mark.avif}") type("image/avif"),url("${mark.webp}") type("image/webp"));background-position:center;background-size:contain}`;
}

// Just the logo and one way back (owner 2026-11-01: "remove the top portion
// of the site and bring them back to gowayfind only by keeping the button").
// No category tabs, search or shortcut row: they led off this page into
// surfaces that are not part of it. It sits on the page's own red, so the top
// no longer reads as a separate dark block.
function WayfindHeader({ seasonal }) {
  return (
    <div className="wf-topbar xm-topbar">
      <div className="xm-topin">
        <div className="wf-topbar-row">
          <a className={"wf-wordmark" + (seasonal ? " is-seasonal" : "")} href="/" aria-label="Wayfind home">
            <span className="wf-wordmark-text" aria-hidden="true" />
          </a>
          <a className="xm-goto" href="/">Go to Wayfind<span aria-hidden="true">→</span></a>
        </div>
      </div>
    </div>
  );
}

// The page shell: theme, lights, snow, header and hero. The one list of every
// Christmas listing (ticketed events first, one pill menu) arrives as `browse`
// (owner direction 2026-11-01). `model` supplies the hero copy.
export default function ChristmasTickets({ model, share = null, browse = null }) {
  const { chrome } = model;
  const seasonal = activeSeasonalMark();
  return (
    <section className="xm-page" aria-labelledby="xm-title" data-analytics-page={SURFACE}>
      <style dangerouslySetInnerHTML={{ __html: CSS + seasonalMarkCss(seasonal) }} />
      <CommerceClickBeacon surface={SURFACE} />
      <div className="xm-doodles" aria-hidden="true" />
      <div className="xm-sparkles" aria-hidden="true" />
      <Snow />
      <FestivalLights />
      <WayfindHeader seasonal={seasonal} />

      <div className="xm-main">
        <div className="xm-hero" id="xm-hero" data-boo-clear="">
          <h1 id="xm-title">{chrome.title}</h1>
          <p className="xm-lede">{chrome.lede}</p>
          <p className="xm-honest">{chrome.honest}</p>
          <button type="button" className="xm-ask" onClick={askSanta}>{chrome.ask}</button>
          {share ? <div className="xm-share">{share}</div> : null}
        </div>

        <div id="xm-tickets" data-ticket-grid="">{browse}</div>
      </div>
    </section>
  );
}
