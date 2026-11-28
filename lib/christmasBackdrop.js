// The sitewide Christmas clock and styling for the shared header and the
// dedicated Christmas page.
//
// ONE END INSTANT. The background stays up through 2026-12-25 23:59:59
// America/New_York and is gone at 2026-12-26 00:00:00 ET. December is EST
// (UTC-5); the constant is that exclusive end, not a UTC calendar day.
// christmasBackdropActive() is the only comparison. Do not add a second date.
//
// WHY A HEAD SCRIPT, NOT A SHORTER PAGE REVALIDATE. Place pages revalidate
// daily and the homepage hourly. Baking "on" into that HTML would keep the
// red up past midnight until the next regeneration, and dropping every route
// to a few-minute revalidate would regenerate the cached shells far more
// often than those pages need. The blocking head script compares Date.now()
// to this constant before the body paints, including on ISR HTML that was
// generated while the season was still on. A tab left open re-arms under the
// setTimeout ceiling (2^31-1 ms) and rechecks when the tab becomes visible,
// so it turns off with no redeploy. The server attribute is the no-JS
// fallback for a freshly rendered page.

export const CHRISTMAS_BG_ENDS_AT = "2026-12-26T00:00:00-05:00";
export const CHRISTMAS_BG_ENDS_AT_MS = Date.parse(CHRISTMAS_BG_ENDS_AT);
// The visual cannot outlive the end instant for a browser that runs the head
// script. 180s is the ceiling we would have set on a cache if the decision
// were baked into HTML. The script is stricter than that ceiling.
export const CHRISTMAS_BG_MAX_STALE_MS = 180 * 1000;
const TIMEOUT_CEILING_MS = 2147483647;

if (!Number.isFinite(CHRISTMAS_BG_ENDS_AT_MS)) {
  throw new Error("CHRISTMAS_BG_ENDS_AT is not a valid timestamp: " + CHRISTMAS_BG_ENDS_AT);
}

export function christmasBackdropActive(now = new Date()) {
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime();
  return Number.isFinite(t) && t < CHRISTMAS_BG_ENDS_AT_MS;
}

// Same gradient the Christmas page sets on .xm-page. Imported there so the
// two surfaces cannot drift.
export const CHRISTMAS_BG_GRADIENT = "radial-gradient(120% 55% at 50% 0%,#7A0F22 0%,rgba(122,15,34,0) 62%),linear-gradient(180deg,#4A0816 0%,#38060F 38%,#2C0610 70%,#220409 100%)";

// Faint festive doodles (gift, holly, candy cane, ornament, tree, snowflake)
// as one tiling line drawing, plus a separate tile of gold sparkles.
export const CHRISTMAS_DOODLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="520" viewBox="0 0 520 520" fill="none" stroke="#E8B48A" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
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
export const CHRISTMAS_SPARKLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="340" viewBox="0 0 340 340" fill="#F5C451">
<path d="M40 30l3 9 9 3-9 3-3 9-3-9-9-3 9-3z"/><path d="M250 70l2.4 7 7 2.4-7 2.4-2.4 7-2.4-7-7-2.4 7-2.4z" opacity=".8"/><path d="M130 150l3.4 10 10 3.4-10 3.4-3.4 10-3.4-10-10-3.4 10-3.4z"/><path d="M300 230l2.6 7.5 7.5 2.6-7.5 2.6-2.6 7.5-2.6-7.5-7.5-2.6 7.5-2.6z" opacity=".8"/><path d="M60 280l3 8.5 8.5 3-8.5 3-3 8.5-3-8.5-8.5-3 8.5-3z"/><circle cx="200" cy="300" r="2.4"/><circle cx="90" cy="100" r="2"/><circle cx="310" cy="140" r="2"/><circle cx="190" cy="40" r="1.8"/></svg>`;
export const christmasSvgUrl = (svg) => 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';

export const CHRISTMAS_DOODLE_CSS = `/* Whole page theme: faint line doodles and gold sparkles behind everything */
.xm-doodles,.xm-sparkles{position:absolute;inset:0;z-index:0;pointer-events:none}
.xm-doodles{background-image:${christmasSvgUrl(CHRISTMAS_DOODLE_SVG)};background-size:520px 520px;opacity:.16}
.xm-sparkles{background-image:${christmasSvgUrl(CHRISTMAS_SPARKLE_SVG)};background-size:340px 340px;opacity:.5;animation:xm-sparkle 7s ease-in-out infinite}
@keyframes xm-sparkle{0%,100%{opacity:.25}50%{opacity:.45}}`;

export const CHRISTMAS_LIGHTS_CSS = `/* Festival string lights: green garland, multicolor bulbs with real glow, rotating chase and twinkle sequences */
.xm-lights{position:relative;height:36px;margin-bottom:12px;pointer-events:none;overflow-x:clip;z-index:30}
.xm-wire{position:absolute;inset:0;width:100%;height:100%}
/* Cute bulbs (owner 2026-11-03): chubby round glass with a shine dot and a gold
   cap, each hanging from the wire and gently swaying; little red bows on the wire. */
.xm-sway{position:absolute;top:9px;width:0;height:0;transform-origin:0 0;animation:xm-sway var(--sw,3.6s) ease-in-out var(--d,0s) infinite alternate}
@keyframes xm-sway{from{rotate:-7deg}to{rotate:7deg}}
.xm-bulb{
  position:absolute;left:-8px;top:5px;width:16px;height:20px;
  border-radius:50% 50% 48% 48% / 42% 42% 58% 58%;
  background:radial-gradient(ellipse 22% 30% at 33% 30%,rgba(255,255,255,.95),rgba(255,255,255,0) 72%),radial-gradient(circle at 42% 38%,var(--bc) 0 38%,var(--bd) 100%);
  box-shadow:0 0 6px 1px var(--bg-glow),0 0 16px 4px var(--bg-glow2);
  will-change:opacity,transform;
}
.xm-bow{position:absolute;top:2px;width:16px;height:12px;margin-left:-8px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.35))}
.xm-wire-phone{display:none}
@media(max-width:600px){.xm-bulb{left:-9px;width:18px;height:22px}.xm-wire-desk{display:none}.xm-wire-phone{display:block}.xm-sway{left:var(--lp)!important}.xm-sway:nth-of-type(even),.xm-bow.xm-bow-desk{display:none}.xm-bow{left:var(--bp)!important}}
.xm-bulb::before{content:"";position:absolute;left:4px;top:-5px;width:7px;height:6px;border-radius:2px 2px 1px 1px;background:linear-gradient(180deg,#F7D774,#B8860B)}
.xm-bulb::after{content:"";position:absolute;left:50%;top:50%;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;background:radial-gradient(circle,var(--bg-glow) 0%,rgba(0,0,0,0) 66%);opacity:.45}
[data-pattern="twinkle"] .xm-bulb{animation:xm-twinkle var(--f,3.2s) ease-in-out var(--d,0s) infinite}
[data-pattern="chase"] .xm-bulb{animation:xm-chase 2s linear infinite;animation-delay:calc(var(--i) * -.11s)}
[data-pattern="alt"] .xm-bulb{animation:xm-alt 1.5s ease-in-out infinite}
[data-pattern="alt"] .xm-sway:nth-of-type(even) .xm-bulb{animation-delay:-.75s}
@keyframes xm-twinkle{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.93)}}
@keyframes xm-chase{0%,100%{opacity:.6;transform:scale(.95)}14%,26%{opacity:1;transform:scale(1.06)}48%{opacity:.6;transform:scale(.95)}}
@keyframes xm-alt{0%,100%{opacity:1;transform:scale(1.03)}50%{opacity:.62;transform:scale(.95)}}
@media(prefers-reduced-motion:reduce){.xm-bulb,.xm-sway,.xm-sparkles{animation:none!important}.xm-sparkles{opacity:.4}}`;

// Pages that already own a full theme. The backdrop stays out of them so we
// do not double the Christmas garland, cover a map, or restyle a designed
// landing. data-wf-own-theme is set on those roots; the other three are the
// roots those pages already render.
const SITE_GATE = 'html[data-wf-xmas="on"]:not(:has([data-wf-own-theme])):not(:has(.xm-page)):not(:has(.boo-page)):not(:has([data-seasonal-search]))';

// --wf-fixed-top: height of the fixed garland. Every sticky top bar on the site
// sits at top:var(--wf-fixed-top,0px) so nothing slides under the lights
// (owner report 2026-11-27; scripts/check-sticky-under-garland.mjs). The band
// behind the bulbs is frosted red glass so text scrolling under the lights is
// softened instead of showing through sharp, like a proper header.
// The band clips sideways only (owner 2026-11-28: the bulbs looked "cut off
// at the bottom"). A phone bulb hangs to the band's 36px edge and grows a
// little when it twinkles, and every glow reaches past it, so a vertical clip
// sliced a flat line under each bulb. Now each bulb and its glow hang free,
// like the string on /christmas-in-florida.
export const CHRISTMAS_SITE_CSS = `${CHRISTMAS_DOODLE_CSS}
${CHRISTMAS_LIGHTS_CSS}
.wf-xmas-bg,.wf-xmas-lights{display:none}
.wf-xmas-bg .xm-snow{position:fixed;inset:0;width:100%;height:100%;pointer-events:none}
${SITE_GATE} .wf-xmas-bg{display:block;position:fixed;inset:0;z-index:-1;pointer-events:none;background:${CHRISTMAS_BG_GRADIENT}}
${SITE_GATE} .wf-xmas-lights{display:block;position:fixed;top:0;left:0;right:0;height:36px;z-index:35;pointer-events:none;overflow-x:clip;overflow-y:visible;background:linear-gradient(180deg,rgba(70,8,21,.84),rgba(62,7,19,.7));-webkit-backdrop-filter:blur(10px) saturate(130%);backdrop-filter:blur(10px) saturate(130%);box-shadow:0 6px 16px rgba(20,2,6,.22)}
${SITE_GATE} .wf-xmas-lights .xm-lights{margin-bottom:0;height:36px}
${SITE_GATE}{--wf-fixed-top:36px;--wf-nav-gap:4px}
${SITE_GATE} .wf-event-section-nav{--wf-nav-bg:rgba(52,8,17,.92);--wf-nav-solid:#340811;--wf-nav-line:rgba(232,180,138,.38);--wf-nav-tab:rgba(255,236,220,.06);--wf-nav-tab-line:rgba(232,180,138,.30);--wf-nav-text:#fbefe4}
${SITE_GATE} body{background-color:transparent !important}
${SITE_GATE} .wf-page-canvas,
${SITE_GATE} .wf-guide-editorial,
${SITE_GATE} .wf-xmas-canvas,
${SITE_GATE} .wf-shell,
${SITE_GATE} .wf-event-experience{background-color:transparent !important;background-image:none !important}
${SITE_GATE} .wf-topbar{background-color:transparent !important;border-bottom-color:rgba(232,180,138,.35) !important;padding-top:calc(36px + max(8px, env(safe-area-inset-top))) !important}
${SITE_GATE} #wf-main:not(:has(.wf-shell)){padding-top:36px}
`;

// Blocking head script. Must stay free of "</script>" so layout.js can inline it.
export function christmasBackdropBootScript() {
  const end = CHRISTMAS_BG_ENDS_AT_MS;
  return `(function(){var end=${end};var root=document.documentElement;function apply(){root.setAttribute("data-wf-xmas",Date.now()<end?"on":"off");}function arm(){var left=end-Date.now();apply();if(left<=0)return;setTimeout(arm,Math.min(left,${TIMEOUT_CEILING_MS}));}apply();arm();document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")apply();});})();`;
}

// Same clock as the head script, for the client render after hydration in case
// React writes the server attribute back onto <html>.
export function installChristmasBackdropClock(root, now = () => Date.now()) {
  if (!root || typeof root.setAttribute !== "function") return () => {};
  const end = CHRISTMAS_BG_ENDS_AT_MS;
  let timer = 0;
  const apply = () => root.setAttribute("data-wf-xmas", now() < end ? "on" : "off");
  const arm = () => {
    const left = end - now();
    apply();
    if (left <= 0) return;
    timer = setTimeout(arm, Math.min(left, TIMEOUT_CEILING_MS));
  };
  const onVis = () => {
    if (typeof document === "undefined" || document.visibilityState === "visible") apply();
  };
  arm();
  if (typeof document !== "undefined" && document.addEventListener) document.addEventListener("visibilitychange", onVis);
  return () => {
    clearTimeout(timer);
    if (typeof document !== "undefined" && document.removeEventListener) document.removeEventListener("visibilitychange", onVis);
  };
}
