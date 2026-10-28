"use client";

// Boo, the Halloween ghost guide, as a site wide floating companion (through
// Nov 1). He drifts, drops one liners, and opens a small chat sheet backed by
// POST /api/bo-haunt. One element, transform only, rAF loop stops whenever he
// is not drifting (sheet open, bubble up, tab hidden, reduced motion).
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { siteTodayStr } from "../../lib/siteTime.js";
import { captureOrQueue } from "../../lib/browserAnalytics.js";
import { BooGhostSvg } from "./booGhost.js";
<<<<<<< HEAD
import { openerFor } from "./booOpeners.js";
=======
>>>>>>> origin/main

const HIDE_KEY = "wf_boo_hidden";
const RESERVED_PATHS = ["/api", "/go", "/oauth", "/embed", "/share"];
const HAUNT_PATH = "/halloween-in-florida";

// Oct 1 through Nov 1 inclusive, by the Eastern site date.
function inSeason() {
  const d = siteTodayStr();
  const md = d.slice(5);
  return md >= "10-01" && md <= "11-01";
}
function reservedPath(p) {
  return RESERVED_PATHS.some((r) => p === r || p.startsWith(r + "/"));
}

const GAGS_GENERAL = [
  "Boo! Did I scare you or is that your battery?",
  "I am not dead, I am just really well rested.",
  "Trick or treat? Honestly, I recommend both.",
  "Sheets are my whole wardrobe. Zero laundry days.",
  "I float, so traffic is not my problem.",
  "Need a fright? I know a guy. Technically a ghost.",
  "I haunt Florida so you do not have to guess.",
  "Tap me. I barely bite. Kidding, I am a ghost.",
  "Spooky season is short. Plans should not be.",
  "Be nice to me. I will remember it forever.",
  "Cold spots are free. Haunted nights are worth planning.",
  "Friends who scream together stay together.",
  "I have been ghosting since before it was cool.",
  "Ask me where the real screams are tonight.",
  "Candy is great. Candy plus a haunt is better.",
<<<<<<< HEAD
  "Floated up 40ft. Zero steps taken. Leg day skipped.",
  "Tourist trap? I only haunt the hidden gems.",
  "Sea for yourself. Swipe a little, scare a lot.",
  "Don't ghost me, tap and plan a night.",
=======
>>>>>>> origin/main
  "Haunted houses are just open houses with better lighting.",
  "Bring a friend. Someone has to hold the screaming.",
];
const GAGS_HOME = [
  "Ghost tip: plan before the candy runs out",
  "Your weekend called. It wants a little fright.",
];
const GAGS_HALLOWEEN = [
  "Haunt tickets sell out. I would grab yours tonight.",
  "Online tickets beat gate prices. Boo math, never wrong.",
  "Tell me your budget and I will find your scare.",
];
const GAGS_EVENTS = ["Scream now, sleep later"];
const GAGS_FOOD = [
  "Pancakes before pandemonium? Respect.",
  "Dinner first, then a fright. That is the order.",
];

function gagPoolFor(path) {
  if (path === "/" ) return GAGS_HOME.concat(GAGS_GENERAL);
  if (path.startsWith("/halloween")) return GAGS_HALLOWEEN.concat(GAGS_HALLOWEEN, GAGS_GENERAL);
  if (path.startsWith("/events")) return GAGS_EVENTS.concat(GAGS_GENERAL);
  if (/eat|food|restaurant|breakfast|brunch|dinner|pancake|coffee|bar/.test(path)) return GAGS_FOOD.concat(GAGS_GENERAL);
  return GAGS_GENERAL;
}

const CHIPS_HALLOWEEN = ["Scariest in Tampa?", "Kid friendly tonight?", "Cheapest Orlando haunt?"];
const CHIPS_OTHER = ["What's haunting Florida this week?", "Scares with kids?", "Best deal under $50?"];
const GREETING = "Boo! Need a fright tonight or just a bite? Ask me anything, I float fast.";
<<<<<<< HEAD
const CENTER_KEY = "wf_center";
// Official pose illustrations (public/boo/poses, 256px plus a 128px variant for
// the chat avatar). Each companion state maps to one pose.
const PB = "/boo/poses/";
const POSES = {
  idle: "01-pointing-right-star-wink", up: "02-pointing-up-eureka-gasp", bow: "03-pointing-down-determined-brows",
  sassy: "04-pointing-at-viewer-sassy-tongue", poke: "05-poking-button-nervous-sweat", orb: "06-touching-cyan-orb-hypnotized",
  kids: "07-squished-against-glass-pleading", juggle: "08-ringing-desk-bell-mischievous-cat-smile", cheer: "09-frantic-waving-joyful-squint",
  mega: "10-megaphone-blast-fierce-shout", peek: "11-peeking-over-signboard-puppy-eyes", greet: "12-waving-tour-flag-hype-star-wink",
  nap: "13-shoulder-tap-sheepish-grin", talk: "14-excuse-me-finger-up-skeptical-brow", price: "15-knocking-on-door-curious-side-eye",
  bye: "16-cupping-hands-yelling-joyful-tears", err: "17-tugging-curtain-watery-pleading-pout", panic: "18-pointing-at-alarm-clock-anime-panic",
  swipe: "19-swiping-tablet-sassy-tongue-wink", sales: "20-easel-chart-pointer-vip-shades-smirk",
};
const ANTIC_POSE = { wave: "greet", bow: "bow", spin: "cheer", zoomies: "mega", peekaboo: "peek", shiver: "panic", nap: "nap", juggle: "juggle" };
const seen = new Set();
function prefetch(k, small) {
  const src = PB + POSES[k] + (small ? "-128" : "") + ".webp";
  if (seen.has(src) || typeof Image === "undefined") return;
  seen.add(src);
  try { const im = new Image(); im.decoding = "async"; im.src = src; } catch { /* ignore */ }
}
const KID_RX = /\b(?:kid|kids|child|children|toddler|toddlers|family|little\s+ones?|preschool)\b/i;
const PRICE_RX = /\$|\b(?:price|prices|cost|costs|cheap|cheapest|budget|deal|deals|discount)\b/i;

// One <img> per layer, src swapped by state with a 150ms crossfade. The SVG
// ghost is only the fallback when an image fails to load.
function PoseImg({ pose, small }) {
  const [layers, setLayers] = useState({ cur: pose, prev: null });
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setLayers((l) => (l.cur === pose ? l : { cur: pose, prev: l.cur }));
    const t = window.setTimeout(() => setLayers((l) => (l.prev ? { cur: l.cur, prev: null } : l)), 200);
    return () => clearTimeout(t);
  }, [pose]);
  if (bad) return <BooGhostSvg face="wink" />;
  const px = small ? 128 : 256;
  const one = (k, cls) => (
    <img
      key={k + cls}
      className={"boo-pi " + cls}
      src={PB + POSES[k] + (small ? "-128" : "") + ".webp"}
      width={px}
      height={px}
      alt=""
      decoding="async"
      loading={k === "idle" || k === "greet" ? "eager" : "lazy"}
      draggable={false}
      onError={() => setBad(true)}
    />
  );
  return <>{layers.prev ? one(layers.prev, "out") : null}{one(layers.cur, "in")}</>;
}
const TOUCH_SEL = ".boo-bulb,.boo-buy,.boo-ask,.boo-goto,.boo-picks button,.boo-photo,.wf-wordmark-text,input[type=search],input[placeholder^=Search]";
const TOUCH_MS = 1200;
const SPOOKY_PLACEHOLDER = "Search a haunt or city...";
function splitKicker(t) {
  const m = /^([A-Z][A-Z0-9 '&]{2,24}):\s+([\s\S]+)$/.exec(t || "");
  return m ? [m[1], m[2]] : [null, t];
}
=======
>>>>>>> origin/main
const FALLBACK_LINE = "My chains got tangled. The full haunt list is one tap away.";

const ANTICS = ["wave", "spin", "peekaboo", "shiver", "zoomies", "nap", "bow", "juggle"];
const ANTIC_MS = { wave: 1800, spin: 1500, peekaboo: 2600, shiver: 1500, zoomies: 2800, nap: 3200, bow: 1600, juggle: 2800 };
<<<<<<< HEAD
const SIZE = 88;
=======
const SIZE = 64;
>>>>>>> origin/main
const TOP = 70, BOTTOM = 96, SIDE = 12;

function track(event, props) {
  if (typeof window === "undefined") return;
  try { captureOrQueue(window, event, { surface: "boo_companion", ...props }); } catch { /* ignore */ }
}
function clean(t) {
  return String(t || "").replace(/[–—]/g, " ").replace(/\s{2,}/g, " ").trim();
}
function rand(a, b) { return a + Math.random() * (b - a); }

const CSS = `
.boo-c{position:fixed;left:0;top:0;width:${SIZE}px;height:${SIZE}px;z-index:940;will-change:transform;touch-action:manipulation}
.boo-c-btn{all:unset;box-sizing:border-box;display:block;width:${SIZE}px;height:${SIZE}px;cursor:pointer;position:relative;border-radius:50%;-webkit-tap-highlight-color:transparent}
.boo-c-btn:focus-visible{outline:2px solid #F97316;outline-offset:3px}
.boo-c-glow{position:absolute;inset:-14px;border-radius:50%;background:radial-gradient(closest-side,rgba(249,115,22,.26),rgba(249,115,22,0));pointer-events:none}
.boo-c-flip{position:absolute;inset:0;transition:transform .35s ease}
<<<<<<< HEAD
.boo-c-bob{position:absolute;inset:0;animation:boo-c-bob .87s cubic-bezier(.37,0,.63,1) infinite}
@keyframes boo-c-bob{0%,100%{transform:translateY(0)}25%{transform:translateY(-9px)}75%{transform:translateY(9px)}}
.boo-c-bubble{all:unset;box-sizing:border-box;position:absolute;width:max-content;max-width:210px;padding:9px 12px;background:#F5EFE6;color:#1A1420;font:600 14px/1.3 var(--wf-sans),system-ui,sans-serif;border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.35);cursor:pointer;animation:boo-c-pop .35s cubic-bezier(.2,.8,.3,1) both}
=======
.boo-c-bob{position:absolute;inset:0;animation:boo-c-bob 2s ease-in-out infinite}
@keyframes boo-c-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
.boo-c-bubble{all:unset;box-sizing:border-box;position:absolute;width:max-content;max-width:210px;padding:9px 12px;background:#F5EFE6;color:#1A1420;font:600 14px/1.3 var(--wf-sans),system-ui,sans-serif;border-radius:14px;box-shadow:0 8px 24px rgba(0,0,0,.35);cursor:pointer;animation:boo-c-pop .22s ease-out both}
>>>>>>> origin/main
.boo-c-bubble:focus-visible{outline:2px solid #F97316;outline-offset:2px}
.boo-c-bubble:after{content:"";position:absolute;width:10px;height:10px;background:#F5EFE6;transform:rotate(45deg);border-radius:2px}
.boo-c-bubble[data-v="above"]{bottom:${SIZE - 2}px}
.boo-c-bubble[data-v="above"]:after{bottom:-4px}
.boo-c-bubble[data-v="below"]{top:${SIZE - 2}px}
.boo-c-bubble[data-v="below"]:after{top:-4px}
.boo-c-bubble[data-h="right"]{left:${SIZE / 2 - 18}px}
.boo-c-bubble[data-h="right"]:after{left:18px}
.boo-c-bubble[data-h="left"]{right:${SIZE / 2 - 18}px}
.boo-c-bubble[data-h="left"]:after{right:18px}
<<<<<<< HEAD
@keyframes boo-c-pop{0%{opacity:0;transform:translateY(6px) scale(.6)}60%{opacity:1;transform:scale(1.08)}100%{opacity:1;transform:none}}
.boo-s-back{position:fixed;inset:0;z-index:99000;background:rgba(3,2,8,.62);display:flex;align-items:flex-end;justify-content:center;animation:boo-s-fade .2s ease-out both}
@keyframes boo-s-fade{from{opacity:0}to{opacity:1}}
.boo-s{box-sizing:border-box;width:100%;max-width:520px;max-height:70vh;max-height:70dvh;display:flex;flex-direction:column;background:#07060B;border:1px solid rgba(196,181,253,.2);border-bottom:0;border-radius:22px 22px 0 0;color:#F5EFE6;font-family:var(--wf-sans),system-ui,sans-serif;animation:boo-s-up .26s cubic-bezier(.2,.85,.3,1) both;will-change:transform}
=======
@keyframes boo-c-pop{from{opacity:0;transform:translateY(4px) scale(.96)}to{opacity:1;transform:none}}
.boo-s-back{position:fixed;inset:0;z-index:99000;background:rgba(3,2,8,.62);display:flex;align-items:flex-end;justify-content:center;animation:boo-s-fade .2s ease-out both}
@keyframes boo-s-fade{from{opacity:0}to{opacity:1}}
.boo-s{box-sizing:border-box;width:100%;max-width:520px;max-height:70vh;max-height:70dvh;display:flex;flex-direction:column;background:#0D0B14;border:1px solid rgba(196,181,253,.2);border-bottom:0;border-radius:22px 22px 0 0;color:#F5EFE6;font-family:var(--wf-sans),system-ui,sans-serif;animation:boo-s-up .26s cubic-bezier(.2,.85,.3,1) both;will-change:transform}
>>>>>>> origin/main
@keyframes boo-s-up{from{transform:translateY(40px);opacity:0}to{transform:none;opacity:1}}
.boo-s:focus{outline:none}
.boo-s-grab{flex:none;padding:8px 0 2px;touch-action:none;cursor:grab}
.boo-s-grab i{display:block;width:38px;height:4px;border-radius:2px;background:rgba(196,181,253,.3);margin:0 auto}
.boo-s-head{flex:none;display:flex;align-items:center;gap:10px;padding:6px 14px 10px;touch-action:none}
.boo-s-av{flex:none;width:42px;height:42px;position:relative}
.boo-s-name{flex:1;min-width:0}
.boo-s-name b{display:block;font-size:16px;font-weight:700;line-height:1.15}
.boo-s-name span{display:block;font-size:12px;color:#9A94A8;margin-top:1px}
.boo-s-hide{all:unset;box-sizing:border-box;font-size:12px;color:#9A94A8;cursor:pointer;padding:8px 6px;text-decoration:underline;text-underline-offset:2px}
.boo-s-x{all:unset;box-sizing:border-box;width:36px;height:36px;display:grid;place-items:center;border-radius:50%;cursor:pointer;color:#C4B5FD;font-size:22px;line-height:1}
.boo-s-hide:focus-visible,.boo-s-x:focus-visible{outline:2px solid #F97316;outline-offset:2px}
.boo-s-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:4px 14px 10px;display:flex;flex-direction:column;gap:8px}
.boo-m{max-width:86%;padding:9px 12px;border-radius:16px;font-size:14.5px;line-height:1.42;word-wrap:break-word;overflow-wrap:anywhere}
<<<<<<< HEAD
.boo-m.b{align-self:flex-start;background:#17131F;border:1px solid rgba(196,181,253,.16);box-shadow:0 2px 10px rgba(0,0,0,.35);border-bottom-left-radius:5px}
.boo-k{display:inline-block;font:800 11px/1 var(--wf-sans),system-ui,sans-serif;letter-spacing:.07em;background:#00F5D4;color:#07060B;padding:4px 8px;border-radius:999px;margin-right:7px;vertical-align:1px}
=======
.boo-m.b{align-self:flex-start;background:#1A1626;border:1px solid rgba(196,181,253,.14);border-bottom-left-radius:5px}
>>>>>>> origin/main
.boo-m.u{align-self:flex-end;background:#F97316;color:#1A0E05;font-weight:600;border-bottom-right-radius:5px}
.boo-m.t{color:#9A94A8;font-style:italic}
.boo-m a{color:#C4B5FD}
.boo-s-cards{display:flex;flex-direction:column;gap:8px}
.boo-s-card{background:#14111D;border:1px solid rgba(196,181,253,.16);border-radius:16px;padding:12px}
.boo-s-card h4{margin:0;font-size:15px;font-weight:700;line-height:1.25}
.boo-s-card p{margin:3px 0 0;font-size:12.5px;color:#9A94A8}
.boo-s-card a{display:block;margin-top:10px;text-align:center;background:#F97316;color:#1A0E05;font-weight:800;font-size:15px;padding:13px 14px;border-radius:12px;text-decoration:none;min-height:44px;box-sizing:border-box}
.boo-s-card a:focus-visible{outline:2px solid #F5EFE6;outline-offset:2px}
.boo-s-chips{display:flex;flex-wrap:wrap;gap:7px;padding-top:2px}
.boo-s-chip{all:unset;box-sizing:border-box;cursor:pointer;font-size:13px;font-weight:600;color:#C4B5FD;border:1px solid rgba(196,181,253,.3);padding:8px 12px;border-radius:999px}
.boo-s-chip:focus-visible{outline:2px solid #F97316;outline-offset:2px}
.boo-wrap{display:block;text-align:center;color:#1A0E05;background:#F5EFE6;font-weight:800;font-size:14px;padding:12px;border-radius:12px;text-decoration:none}
<<<<<<< HEAD
.boo-s-foot{flex:none;display:flex;gap:10px;padding:12px 14px calc(14px + env(safe-area-inset-bottom));background:#07060B;border-top:1px solid rgba(245,239,230,.28)}
.boo-in{flex:1;min-width:0;box-sizing:border-box;background:#110E19;color:#F5EFE6;border:1.5px solid rgba(245,239,230,.6);border-radius:14px;padding:0 14px;height:52px;font:500 16px var(--wf-sans),system-ui,sans-serif;-webkit-text-size-adjust:100%}
.boo-in::placeholder{color:#B8B2C6;opacity:1}
.boo-in:disabled{opacity:.5}
.boo-send{all:unset;box-sizing:border-box;flex:none;height:52px;padding:0 20px;border-radius:14px;background:#F97316;color:#1A0E05;font-weight:800;font-size:16px;cursor:pointer;display:grid;place-items:center}
.boo-send:disabled{opacity:.85;cursor:default}
=======
.boo-s-foot{flex:none;display:flex;gap:8px;padding:8px 14px calc(12px + env(safe-area-inset-bottom));border-top:1px solid rgba(196,181,253,.12)}
.boo-in{flex:1;min-width:0;box-sizing:border-box;background:#07060B;color:#F5EFE6;border:1px solid rgba(196,181,253,.25);border-radius:12px;padding:0 12px;height:44px;font:500 16px var(--wf-sans),system-ui,sans-serif}
.boo-in::placeholder{color:#9A94A8}
.boo-in:disabled{opacity:.5}
.boo-send{all:unset;box-sizing:border-box;flex:none;height:44px;padding:0 16px;border-radius:12px;background:#F97316;color:#1A0E05;font-weight:800;font-size:15px;cursor:pointer;display:grid;place-items:center}
.boo-send:disabled{opacity:.4;cursor:default}
>>>>>>> origin/main
.boo-send:focus-visible,.boo-in:focus-visible{outline:2px solid #F5EFE6;outline-offset:2px}
.boo-c-act{position:absolute;inset:0;transform-origin:50% 60%}
.boo-a-wave{animation:boo-k-wave 1.8s ease-in-out both;transform-origin:85% 65%}
.boo-a-spin{animation:boo-k-spin 1.5s cubic-bezier(.4,0,.2,1) both}
.boo-a-peekaboo{animation:boo-k-peek 2.6s ease-in-out both}
.boo-a-shiver{animation:boo-k-shiver 1.5s linear both}
.boo-a-zoomies{animation:boo-k-zoom 2.8s cubic-bezier(.5,0,.3,1) both}
.boo-a-nap{animation:boo-k-nap 3.2s ease-in-out both}
.boo-a-bow{animation:boo-k-bow 1.6s ease-in-out both}
@keyframes boo-k-wave{0%,100%{transform:rotate(0)}15%{transform:rotate(9deg) skewY(3deg)}30%{transform:rotate(-7deg)}45%{transform:rotate(9deg) skewY(3deg)}60%{transform:rotate(-7deg)}75%{transform:rotate(5deg)}}
@keyframes boo-k-spin{0%{transform:scale(1,1)}20%{transform:scale(1.12,.86)}60%{transform:rotate(360deg) scale(.94,1.06)}100%{transform:rotate(360deg) scale(1,1)}}
@keyframes boo-k-peek{0%{transform:translateX(0)}30%,60%{transform:translateX(var(--px,0))}80%{transform:translateX(0) scale(1.08)}100%{transform:none}}
@keyframes boo-k-shiver{0%,100%{transform:translateX(0)}10%{transform:translateX(-3px) rotate(-2deg)}20%{transform:translateX(3px) rotate(2deg)}30%{transform:translateX(-3px)}40%{transform:translateX(3px) rotate(2deg)}50%{transform:translateX(-2px)}60%{transform:translateX(3px) rotate(-2deg)}70%{transform:translateX(-3px)}80%{transform:translateX(2px)}90%{transform:translateX(-2px)}}
@keyframes boo-k-zoom{0%{transform:translateX(0)}42%,50%{transform:translateX(var(--zx,0)) }100%{transform:translateX(0)}}
@keyframes boo-k-nap{0%{transform:rotate(0)}25%,80%{transform:rotate(-14deg) translateY(3px)}100%{transform:rotate(0)}}
@keyframes boo-k-bow{0%,100%{transform:rotate(0) translateY(0)}35%,60%{transform:rotate(16deg) translateY(5px)}}
.boo-z{position:absolute;right:-6px;top:-4px;font:800 13px var(--wf-sans),sans-serif;color:#C4B5FD;pointer-events:none;animation:boo-k-z 3.2s ease-out both}
.boo-z:nth-child(2){right:-14px;top:-14px;font-size:10px;animation-delay:.5s}
@keyframes boo-k-z{0%{opacity:0;transform:translateY(6px)}25%{opacity:1}100%{opacity:0;transform:translateY(-18px)}}
.boo-pk{position:absolute;left:50%;top:-6px;width:13px;height:11px;margin-left:-6px;border-radius:50% 50% 45% 45%;background:#F97316;pointer-events:none;opacity:0;animation:boo-k-pk 2.8s ease-in-out both}
.boo-pk:before{content:"";position:absolute;left:5px;top:-3px;width:3px;height:4px;background:#8FBF6A;border-radius:1px}
.boo-pk:nth-child(2){animation-delay:.25s}.boo-pk:nth-child(3){animation-delay:.5s}
@keyframes boo-k-pk{0%{opacity:0;transform:translate(-22px,10px)}10%{opacity:1}25%{transform:translate(0,-26px)}50%{transform:translate(22px,10px)}75%{transform:translate(0,-26px)}90%{opacity:1}100%{opacity:0;transform:translate(-22px,10px)}}
<<<<<<< HEAD
.boo-c-flip,.boo-s-av{contain:layout}
.boo-pi{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain;display:block;pointer-events:none;user-select:none;-webkit-user-drag:none}
.boo-pi.in{animation:boo-pi-in .15s ease-out both}
.boo-pi.out{animation:boo-pi-out .15s ease-out both}
@keyframes boo-pi-in{from{opacity:0}to{opacity:1}}
@keyframes boo-pi-out{from{opacity:1}to{opacity:0}}
.boo-eye{transform-box:fill-box;transform-origin:center;animation:boo-blink 2.2s infinite}
.boo-lid{opacity:0;animation:boo-lid 2.2s infinite}
@keyframes boo-blink{0%,92.2%{transform:scaleY(1)}92.3%,100%{transform:scaleY(.1)}}
@keyframes boo-lid{0%,92.2%{opacity:0}92.3%,100%{opacity:1}}
.boo-tr{position:absolute;left:28px;top:30px;width:9px;height:9px;opacity:0;pointer-events:none;background:#00F5D4;clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%)}
.boo-tr:nth-child(even){background:#FF2A85}
.boo-c[data-dart="1"] .boo-tr{animation:boo-tr .55s linear infinite}
.boo-tr:nth-child(2){animation-delay:.14s !important}.boo-tr:nth-child(3){animation-delay:.28s !important}.boo-tr:nth-child(4){animation-delay:.41s !important}
@keyframes boo-tr{0%{opacity:1;transform:translate(0,0) scale(1)}100%{opacity:0;transform:translate(calc(var(--tdir,1) * -38px),10px) scale(.3)}}
[data-boo-touch].boo-bulb{animation:boo-t-bulb 1.2s ease-out both !important}
@keyframes boo-t-bulb{0%{filter:brightness(1)}20%{transform:scale(1.8);filter:brightness(2.4) saturate(1.5);box-shadow:0 0 22px 10px rgba(255,214,102,.95)}100%{transform:scale(1);filter:brightness(1)}}
.boo-buy[data-boo-touch],.boo-ask[data-boo-touch],.boo-goto[data-boo-touch],.boo-picks button[data-boo-touch]{animation:boo-t-glow 1.2s ease-out both}
@keyframes boo-t-glow{0%{box-shadow:0 0 0 0 rgba(249,115,22,0);transform:scale(1)}30%{box-shadow:0 0 26px 8px rgba(249,115,22,.6);transform:scale(1.035)}100%{box-shadow:0 0 0 0 rgba(249,115,22,0);transform:scale(1)}}
.boo-photo[data-boo-touch]:after{content:"";position:absolute;inset:0;z-index:2;pointer-events:none;box-shadow:inset 0 0 0 3px #C4B5FD,inset 0 0 34px rgba(196,181,253,.6);animation:boo-t-rim 1.2s ease-out both}
@keyframes boo-t-rim{0%{opacity:0}25%{opacity:1}100%{opacity:0}}
.wf-wordmark-text[data-boo-touch]{animation:boo-t-word 1.2s ease-out both}
@keyframes boo-t-word{0%,100%{filter:none}30%{filter:drop-shadow(0 0 10px rgba(196,181,253,.95)) drop-shadow(0 0 4px rgba(249,115,22,.7))}}
input[data-boo-touch]{animation:boo-t-glow 1.2s ease-out both}
@media (prefers-reduced-motion:reduce){.boo-pi{animation:none !important}.boo-eye,.boo-lid,.boo-tr{animation:none !important}.boo-c-act,.boo-z,.boo-pk{animation:none !important}.boo-c-bob,.boo-c-bubble,.boo-s,.boo-s-back{animation:none}.boo-c-flip{transition:none}}
=======
@media (prefers-reduced-motion:reduce){.boo-c-act,.boo-z,.boo-pk{animation:none !important}.boo-c-bob,.boo-c-bubble,.boo-s,.boo-s-back{animation:none}.boo-c-flip{transition:none}}
>>>>>>> origin/main
`;

export default function BooCompanion() {
  const pathname = usePathname() || "/";
  const [eligible, setEligible] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [open, setOpen] = useState(false);
  const [bubble, setBubble] = useState(null); // { text, v, h }
<<<<<<< HEAD
  const [pose, setPose] = useState("idle");
  const holdRef = useRef(null);
=======
  const [face, setFace] = useState("wink");
>>>>>>> origin/main
  const [antic, setAntic] = useState(null); // { name, key }
  const [msgs, setMsgs] = useState([]);
  const [cards, setCards] = useState([]);
  const [pending, setPending] = useState(false);
  const [wrapped, setWrapped] = useState(false);
  const [draft, setDraft] = useState("");

  const elRef = useRef(null);
  const flipRef = useRef(null);
  const sheetRef = useRef(null);
  const bodyRef = useRef(null);
  const inputRef = useRef(null);
  const lastFocus = useRef(null);
  const seg = useRef(null);
  const anticTimer = useRef(0);
  const reducedRef = useRef(false);
  const rafRef = useRef(0);
  const lastTs = useRef(0);
  const posRef = useRef({ x: 0, y: 0 });
<<<<<<< HEAD
  const legRef = useRef(0);
=======
>>>>>>> origin/main
  const facing = useRef(1);
  const turnRef = useRef(0);
  const wrapRef = useRef(false);
  const pendingRef = useRef(false);
  const gagCount = useRef(0);
  const shownGags = useRef(new Set());
  const tappedRef = useRef(false);
<<<<<<< HEAD
  const openerRef = useRef("");
  const openerSpoken = useRef(false);
  const touchSt = useRef({ els: new Set(), timers: [] });
=======
>>>>>>> origin/main
  const openRef = useRef(false);
  const eligibleRef = useRef(false);
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  openRef.current = open;
  reducedRef.current = reduced;
  eligibleRef.current = eligible;

<<<<<<< HEAD
  // Resting pose: idle while roaming, the sheet's current reply pose while open.
  const restPose = () => (openRef.current && holdRef.current) || "idle";

  // The arrival line: city flavored when wf_center maps to a served metro, else
  // generic. Picked once per page load so the bubble and the sheet agree.
  const getOpener = () => {
    if (!openerRef.current) {
      let raw = null;
      try { raw = localStorage.getItem(CENTER_KEY); } catch { /* ignore */ }
      openerRef.current = openerFor(raw, Math.floor(Math.random() * 6));
    }
    return openerRef.current;
  };

=======
>>>>>>> origin/main
  // Mount gate: season, reserved paths, session hide.
  useEffect(() => {
    let ok = false;
    try {
      ok = inSeason() && !reservedPath(pathname);
      if (ok && sessionStorage.getItem(HIDE_KEY) === "1") ok = false;
    } catch { ok = inSeason() && !reservedPath(pathname); }
    setEligible(ok);
  }, [pathname]);

  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      setReduced(mq.matches);
      const on = (e) => setReduced(e.matches);
      mq.addEventListener ? mq.addEventListener("change", on) : mq.addListener(on);
      return () => { mq.removeEventListener ? mq.removeEventListener("change", on) : mq.removeListener(on); };
    } catch { /* ignore */ }
  }, []);

<<<<<<< HEAD
  useEffect(() => { if (eligible) { prefetch("idle"); prefetch("greet"); } }, [eligible]);
=======
>>>>>>> origin/main
  useEffect(() => { if (eligible) track("boo_companion_shown", { path: pathname }); }, [eligible]); // eslint-disable-line react-hooks/exhaustive-deps

  const place = useCallback((x, y) => {
    const el = elRef.current;
    if (el) el.style.transform = "translate3d(" + x.toFixed(1) + "px," + y.toFixed(1) + "px,0)";
  }, []);

  const bounds = () => {
    const vw = window.innerWidth, vh = window.innerHeight;
    return { minX: SIDE, maxX: Math.max(SIDE, vw - SIDE - SIZE), minY: TOP, maxY: Math.max(TOP, vh - BOTTOM - SIZE), vw, vh };
  };

<<<<<<< HEAD
  // Touch targets: one querySelectorAll per hop, a few random probes for one that
  // is fully on screen. Never an input the visitor is in, never inside the sheet.
  const pickTarget = () => {
    const list = document.querySelectorAll(TOUCH_SEL);
    if (!list.length) return null;
    const vw = window.innerWidth, vh = window.innerHeight, ae = document.activeElement;
    for (let i = 0; i < 12; i++) {
      const el = list[Math.floor(Math.random() * list.length)];
      if (el === ae || (el.tagName === "INPUT" && ae && ae.tagName === "INPUT")) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.top < 0 || r.bottom > vh - 4 || r.left < 0 || r.right > vw) continue;
      return { el, r };
    }
    return null;
  };
  const touchTarget = useCallback((el) => {
    try {
      if (!el || !el.isConnected || openRef.current || reducedRef.current) return;
      const ae = document.activeElement;
      const isInput = el.tagName === "INPUT";
      if (isInput && ae && ae.tagName === "INPUT") return;
      const st = touchSt.current;
      const on = (t, delay) => {
        st.timers.push(window.setTimeout(() => {
          try {
            t.setAttribute("data-boo-touch", "1");
            st.els.add(t);
            st.timers.push(window.setTimeout(() => { t.removeAttribute("data-boo-touch"); st.els.delete(t); }, TOUCH_MS));
          } catch { /* ignore */ }
        }, delay));
      };
      on(el, 0);
      if (el.classList.contains("boo-bulb")) {
        // Ripple outward to the neighbours.
        let a = el.previousElementSibling, b = el.nextElementSibling;
        for (let d = 1; d <= 4; d++) {
          if (a && a.classList.contains("boo-bulb")) on(a, d * 110);
          if (b && b.classList.contains("boo-bulb")) on(b, d * 110);
          a = a && a.previousElementSibling; b = b && b.nextElementSibling;
        }
      }
      if (isInput) {
        const prev = el.getAttribute("placeholder");
        el.setAttribute("placeholder", SPOOKY_PLACEHOLDER);
        st.timers.push(window.setTimeout(() => {
          try { if (el.getAttribute("placeholder") === SPOOKY_PLACEHOLDER) { if (prev == null) el.removeAttribute("placeholder"); else el.setAttribute("placeholder", prev); } } catch { /* ignore */ }
        }, TOUCH_MS));
      }
      // Poke first, then the happy cheer. Hovering a photo is the orb pose,
      // the search bar is swiping, and the Go to Wayfind button is eureka.
      const cl = el.classList;
      const first = cl.contains("boo-photo") ? "orb" : isInput ? "swipe" : cl.contains("boo-goto") ? "up" : "poke";
      setPose(first);
      if (first === "poke") st.timers.push(window.setTimeout(() => setPose("cheer"), 450));
      st.timers.push(window.setTimeout(() => setPose(restPose()), TOUCH_MS + 200));
    } catch { /* ignore */ }
  }, []);
  const touchRef = useRef(touchTarget);
  touchRef.current = touchTarget;
  useEffect(() => () => {
    const st = touchSt.current;
    st.timers.forEach(clearTimeout);
    st.timers = [];
    st.els.forEach((t) => { try { t.removeAttribute("data-boo-touch"); } catch { /* ignore */ } });
    st.els.clear();
  }, []);

  // Roaming: hop between random waypoints anywhere in the safe box with eased
  // legs, varying speed, pauses, and now and then a dart to the far corner.
  const nextLeg = useCallback(() => {
    legRef.current += 1;
    const b = bounds();
    const from = posRef.current;
    let tx, ty, speed, target = null, free = false;
    if (!openRef.current && !reducedRef.current && (legRef.current < 2 || Math.random() < 0.7)) {
      const hit = pickTarget();
      if (hit) {
        target = hit.el; free = true;
        prefetch("poke"); prefetch("cheer"); prefetch("orb"); prefetch("swipe"); prefetch("up");
        const r = hit.r;
        tx = r.left + r.width / 2 - SIZE / 2;
        ty = r.top - SIZE + 18 >= 0 ? r.top - SIZE + 18 : r.bottom - 18;
        speed = rand(80, 160);
      }
    }
    if (target) { /* chosen above */ }
    else if (Math.random() < 0.18) {
=======
  // Roaming: hop between random waypoints anywhere in the safe box with eased
  // legs, varying speed, pauses, and now and then a dart to the far corner.
  const nextLeg = useCallback(() => {
    const b = bounds();
    const from = posRef.current;
    let tx, ty, speed;
    if (Math.random() < 0.18) {
>>>>>>> origin/main
      tx = from.x + SIZE / 2 < b.vw / 2 ? b.maxX : b.minX;
      ty = from.y + SIZE / 2 < (b.minY + b.maxY) / 2 ? b.maxY : b.minY;
      tx += rand(-30, 30); ty += rand(-30, 30);
      speed = rand(240, 340);
    } else {
      for (let i = 0; i < 6; i++) {
        tx = rand(b.minX, b.maxX); ty = rand(b.minY, b.maxY);
        if (Math.hypot(tx - from.x, ty - from.y) > 140) break;
      }
      speed = rand(35, 115);
    }
    tx = Math.min(b.maxX, Math.max(b.minX, tx));
<<<<<<< HEAD
    ty = free ? Math.min(Math.max(0, b.vh - SIZE - 8), Math.max(0, ty)) : Math.min(b.maxY, Math.max(b.minY, ty));
=======
    ty = Math.min(b.maxY, Math.max(b.minY, ty));
>>>>>>> origin/main
    const dist = Math.max(1, Math.hypot(tx - from.x, ty - from.y));
    const dir = tx - from.x;
    if (Math.abs(dir) > 20) {
      const f = dir > 0 ? 1 : -1;
      if (f !== facing.current && flipRef.current) { facing.current = f; flipRef.current.style.transform = f > 0 ? "scaleX(1)" : "scaleX(-1)"; }
    }
<<<<<<< HEAD
    const darting = speed > 200;
    const el = elRef.current;
    if (el) { el.dataset.dart = darting ? "1" : ""; el.style.setProperty("--tdir", String(facing.current)); }
    seg.current = { x0: from.x, y0: from.y, x1: tx, y1: ty, t: 0, dur: dist / speed, pause: 0, target, free };
=======
    seg.current = { x0: from.x, y0: from.y, x1: tx, y1: ty, t: 0, dur: dist / speed, pause: 0 };
>>>>>>> origin/main
  }, []);

  // Corner spot for reduced motion.
  const corner = useCallback(() => {
    const b = bounds();
    return { x: b.minX, y: b.maxY };
  }, []);

  const drifting = eligible && !reduced && !open && !bubble && !antic;

  // The rAF loop only runs while he is actually drifting and the tab is visible.
  useEffect(() => {
    if (!eligible) return;
    if (!drifting) {
      const p = reduced ? corner() : null;
      if (p) { place(p.x, p.y); }
      return;
    }
    let alive = true;
    const frame = (ts) => {
      if (!alive) return;
      const dt = lastTs.current ? Math.min(0.1, (ts - lastTs.current) / 1000) : 0;
      lastTs.current = ts;
      let g = seg.current;
      if (!g) { nextLeg(); g = seg.current; }
      if (g.pause > 0) {
        g.pause -= dt;
        if (g.pause <= 0) nextLeg();
      } else {
        g.t += dt;
        const u = Math.min(1, g.t / g.dur);
        const e = u * u * (3 - 2 * u);
        const b = bounds();
        const x = Math.min(b.maxX, Math.max(b.minX, g.x0 + (g.x1 - g.x0) * e));
<<<<<<< HEAD
        const yy = g.y0 + (g.y1 - g.y0) * e;
        const y = g.free ? Math.min(Math.max(0, b.vh - SIZE - 8), Math.max(0, yy)) : Math.min(b.maxY, Math.max(b.minY, yy));
        posRef.current = { x, y };
        place(x, y);
        if (u >= 1) {
          if (elRef.current) elRef.current.dataset.dart = "";
          if (g.target) { touchRef.current(g.target); g.target = null; g.pause = 1.5; }
          else g.pause = Math.random() < 0.4 ? 0.05 : rand(0.7, 2.6);
        }
=======
        const y = Math.min(b.maxY, Math.max(b.minY, g.y0 + (g.y1 - g.y0) * e));
        posRef.current = { x, y };
        place(x, y);
        if (u >= 1) { g.pause = Math.random() < 0.4 ? 0.05 : rand(0.7, 2.6); }
>>>>>>> origin/main
      }
      rafRef.current = requestAnimationFrame(frame);
    };
    const start = () => {
      if (!rafRef.current && !document.hidden) {
        lastTs.current = 0;
        if (!seg.current) { const b = bounds(); posRef.current = { x: rand(b.minX, b.maxX), y: rand(b.minY, b.maxY) }; }
        place(posRef.current.x, posRef.current.y);
        rafRef.current = requestAnimationFrame(frame);
      }
    };
    const stop = () => { if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; } };
    const vis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", vis);
    start();
<<<<<<< HEAD
    return () => { alive = false; stop(); document.removeEventListener("visibilitychange", vis); if (elRef.current) elRef.current.dataset.dart = ""; };
=======
    return () => { alive = false; stop(); document.removeEventListener("visibilitychange", vis); };
>>>>>>> origin/main
  }, [eligible, drifting, reduced, place, nextLeg, corner]);

  // Keep the reduced motion spot in the corner on resize.
  useEffect(() => {
    if (!eligible || !reduced) return;
    const on = () => { const p = corner(); place(p.x, p.y); };
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [eligible, reduced, corner, place]);

  // Antics: small keyframe bits of business. Travel ones read the current spot.
  const playAntic = useCallback((name) => {
    if (reducedRef.current) return 0;
    const n = ANTICS.indexOf(name) >= 0 ? name : ANTICS[Math.floor(Math.random() * ANTICS.length)];
    const el = elRef.current;
    if (el) {
      const b = bounds();
      const x = posRef.current.x;
      el.style.setProperty("--zx", (x + SIZE / 2 < b.vw / 2 ? b.maxX - x : b.minX - x) + "px");
      el.style.setProperty("--px", (x + SIZE / 2 < b.vw / 2 ? -(x + SIZE / 2) : (b.vw - x - SIZE / 2)) + "px");
    }
    clearTimeout(anticTimer.current);
    setAntic({ name: n, key: Date.now() });
<<<<<<< HEAD
    const ap = ANTIC_POSE[n] || "idle";
    prefetch(ap);
    setPose(ap);
    anticTimer.current = window.setTimeout(() => { setAntic(null); setPose(restPose()); }, ANTIC_MS[n]);
=======
    if (n === "nap") setFace("sleep");
    anticTimer.current = window.setTimeout(() => { setAntic(null); setFace("wink"); }, ANTIC_MS[n]);
>>>>>>> origin/main
    return ANTIC_MS[n];
  }, []);
  useEffect(() => () => clearTimeout(anticTimer.current), []);

  // Gags: first after 6s, then every 40 to 70s; at most 6 per page view. The
  // first two are local (free), then every third calls gag mode, always with a
  // local fallback.
  useEffect(() => {
    if (!eligible) return;
    gagCount.current = 0;
    shownGags.current = new Set();
    let timer = 0, hideTimer = 0, showTimer = 0, dead = false;
    const schedule = (ms) => { timer = window.setTimeout(fire, ms); };
    const localGag = () => {
      const pool = gagPoolFor(pathRef.current).filter((g) => !shownGags.current.has(g));
      if (!pool.length) return null;
      const text = pool[Math.floor(Math.random() * pool.length)];
      shownGags.current.add(text);
      return text;
    };
    const present = (text, name, src) => {
      if (dead || openRef.current) return;
      const cur = reducedRef.current ? corner() : posRef.current;
      const b = bounds();
      const v = cur.y < 150 ? "below" : "above";
      const h = cur.x + SIZE / 2 > b.vw / 2 ? "left" : "right";
      const wait = playAntic(name);
      const travel = name === "peekaboo" || name === "zoomies";
      const delay = travel ? wait : 0;
      showTimer = window.setTimeout(() => {
        if (dead || openRef.current) return;
        setBubble({ text, v, h });
<<<<<<< HEAD
        if (src !== "opener" && !travel && Math.random() < 0.4) { prefetch("sassy"); setPose("sassy"); }
        track("boo_companion_gag", { path: pathRef.current, n: gagCount.current, source: src, antic: name });
        hideTimer = window.setTimeout(() => { setBubble(null); setPose(restPose()); }, 5000);
=======
        if (!reducedRef.current) setFace(Math.random() < 0.5 ? "grin" : "shock");
        track("boo_companion_gag", { path: pathRef.current, n: gagCount.current, source: src, antic: name });
        hideTimer = window.setTimeout(() => { setBubble(null); setFace("wink"); }, 5000);
>>>>>>> origin/main
      }, delay);
    };
    const fire = async () => {
      if (dead) return;
      if (gagCount.current >= 6) return;
      if (openRef.current || document.hidden) { schedule(rand(8000, 15000)); return; }
      gagCount.current += 1;
      const n = gagCount.current;
      let text = null, name = ANTICS[Math.floor(Math.random() * ANTICS.length)], src = "local";
<<<<<<< HEAD
      if (n === 1 && !openerSpoken.current) { openerSpoken.current = true; text = getOpener(); name = "wave"; src = "opener"; }
      else if (n >= 3 && n % 3 === 0) {
=======
      if (n >= 3 && n % 3 === 0) {
>>>>>>> origin/main
        try {
          const ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
          const to = window.setTimeout(() => ctl && ctl.abort(), 4000);
          const res = await fetch("/api/bo-haunt", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ mode: "gag", page: { path: pathRef.current, title: (document.title || "").slice(0, 120) } }),
            signal: ctl ? ctl.signal : undefined,
          });
          clearTimeout(to);
          const data = await res.json().catch(() => null);
          const g = data && typeof data.gag === "string" ? clean(data.gag) : "";
          if (res.ok && g && g.length <= 120) {
            text = g; src = data.source === "claude" ? "claude" : "server_fallback";
            if (ANTICS.indexOf(data.antic) >= 0) name = data.antic;
          }
        } catch { /* local fallback below */ }
      }
      if (dead) return;
      if (!text) text = localGag();
      if (!text) return;
      present(text, name, src);
      schedule(rand(40000, 70000));
    };
    schedule(6000);
<<<<<<< HEAD
    return () => { dead = true; clearTimeout(timer); clearTimeout(hideTimer); clearTimeout(showTimer); setBubble(null); setPose(restPose()); };
  }, [eligible, pathname, corner, playAntic]); // eslint-disable-line react-hooks/exhaustive-deps
=======
    return () => { dead = true; clearTimeout(timer); clearTimeout(hideTimer); clearTimeout(showTimer); setBubble(null); setFace("wink"); };
  }, [eligible, pathname, corner, playAntic]);
>>>>>>> origin/main

  const openSheet = useCallback((src) => {
    tappedRef.current = true;
    lastFocus.current = typeof document !== "undefined" ? document.activeElement : null;
    setBubble(null);
<<<<<<< HEAD
    holdRef.current = "greet";
    prefetch("greet", true);
    setPose("greet");
=======
>>>>>>> origin/main
    setOpen(true);
    track("boo_companion_open", { source: src || "tap", path: pathRef.current });
  }, []);

  const closeSheet = useCallback(() => {
<<<<<<< HEAD
    holdRef.current = null;
    setPose("idle");
=======
>>>>>>> origin/main
    setOpen(false);
    try { if (lastFocus.current && lastFocus.current.focus) lastFocus.current.focus(); } catch { /* ignore */ }
  }, []);

  const send = useCallback(async (raw, source) => {
    const message = String(raw || "").trim().slice(0, 300);
    if (!message || pendingRef.current || wrapRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setDraft("");
    setMsgs((m) => m.concat([{ role: "user", text: message }]));
    turnRef.current += 1;
    const turn = turnRef.current;
    const started = Date.now();
    let source2 = "fallback", wrap = false;
    try {
      const res = await fetch("/api/bo-haunt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, page: { path: pathRef.current, title: (document.title || "").slice(0, 120) }, turn }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.reply) throw new Error("bad");
      source2 = data.source === "claude" ? "claude" : "fallback";
      wrap = !!data.wrap;
      setMsgs((m) => m.concat([{ role: "boo", text: clean(data.reply) }]));
      playAntic(data.antic);
      setCards(Array.isArray(data.cards) ? data.cards.filter((c) => c && c.cta && c.cta.href).slice(0, 4) : []);
      if (wrap) { wrapRef.current = true; setWrapped(true); }
<<<<<<< HEAD
      const nCards = Array.isArray(data.cards) ? data.cards.length : 0;
      const rp = wrap ? "bye" : data.smallTalk ? "talk" : !nCards ? "greet" : KID_RX.test(message) ? "kids" : PRICE_RX.test(message) ? "price" : "sales";
      holdRef.current = rp; prefetch(rp, true); setPose(rp);
    } catch {
      setMsgs((m) => m.concat([{ role: "boo", text: FALLBACK_LINE, link: true }]));
      playAntic();
      holdRef.current = "err"; prefetch("err", true); setPose("err");
=======
    } catch {
      setMsgs((m) => m.concat([{ role: "boo", text: FALLBACK_LINE, link: true }]));
      playAntic();
>>>>>>> origin/main
      setCards([]);
    } finally {
      pendingRef.current = false;
      setPending(false);
      track("boo_companion_ask", { source: source2, latency_ms: Date.now() - started, wrap, turn, via: source || "typed" });
    }
  }, [playAntic]);

  // External trigger (Ask Boo button on the Halloween page).
  useEffect(() => {
    const on = (e) => {
      let ok = false;
      try { ok = inSeason() && !reservedPath(pathRef.current); } catch { /* ignore */ }
      if (!ok) return;
      try { sessionStorage.removeItem(HIDE_KEY); } catch { /* ignore */ }
      setEligible(true);
      eligibleRef.current = true;
      const prompt = e && e.detail && typeof e.detail.prompt === "string" ? e.detail.prompt : "";
      if (!openRef.current) openSheet("event");
      if (prompt) send(prompt, "prompt");
    };
    window.addEventListener("wf:boo-open", on);
    return () => window.removeEventListener("wf:boo-open", on);
  }, [openSheet, send]);

  // Opening line, focus, scroll lock, Escape and focus trap.
  useEffect(() => {
    if (!open) return;
<<<<<<< HEAD
    setMsgs((m) => (m.length ? m : [{ role: "boo", text: getOpener() || GREETING }]));
=======
    setMsgs((m) => (m.length ? m : [{ role: "boo", text: GREETING }]));
>>>>>>> origin/main
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const f = window.setTimeout(() => { try { (inputRef.current || sheetRef.current).focus({ preventScroll: true }); } catch { /* ignore */ } }, 60);
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); closeSheet(); return; }
      if (e.key !== "Tab" || !sheetRef.current) return;
      const nodes = sheetRef.current.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])');
      if (!nodes.length) { e.preventDefault(); return; }
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === sheetRef.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => { clearTimeout(f); document.body.style.overflow = prevOverflow; document.removeEventListener("keydown", onKey, true); };
<<<<<<< HEAD
  }, [open, closeSheet]); // eslint-disable-line react-hooks/exhaustive-deps
=======
  }, [open, closeSheet]);
>>>>>>> origin/main

  useEffect(() => {
    if (open && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [open, msgs, cards, pending]);

  // Swipe down on the handle or header to close.
  const drag = useRef({ y: 0, dy: 0, on: false });
  const onTouchStart = (e) => { drag.current = { y: e.touches[0].clientY, dy: 0, on: true }; };
  const onTouchMove = (e) => {
    if (!drag.current.on) return;
    const dy = Math.max(0, e.touches[0].clientY - drag.current.y);
    drag.current.dy = dy;
    if (sheetRef.current) { sheetRef.current.style.transform = "translateY(" + dy + "px)"; sheetRef.current.style.animation = "none"; }
  };
  const onTouchEnd = () => {
    if (!drag.current.on) return;
    drag.current.on = false;
    if (drag.current.dy > 80) { closeSheet(); return; }
    if (sheetRef.current) sheetRef.current.style.transform = "";
  };

  const hideBoo = () => {
    try { sessionStorage.setItem(HIDE_KEY, "1"); } catch { /* ignore */ }
    track("boo_companion_hidden", { path: pathRef.current });
<<<<<<< HEAD
    holdRef.current = null;
=======
>>>>>>> origin/main
    setOpen(false);
    setEligible(false);
  };

  if (!eligible) return null;

  const onHaunt = pathname.startsWith("/halloween");
  const chips = onHaunt ? CHIPS_HALLOWEEN : CHIPS_OTHER;
  const hasUser = msgs.some((m) => m.role === "user");

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="boo-c" ref={elRef} style={{ transform: "translate3d(" + SIDE + "px,-200px,0)" }}>
        <button type="button" className="boo-c-btn" aria-label="Chat with Boo, Wayfind's ghost guide" onClick={() => openSheet("tap")}>
          <span className="boo-c-glow" aria-hidden="true" />
          <span className={"boo-c-act" + (antic ? " boo-a-" + antic.name : "")} key={antic ? antic.key : "idle"}>
            <span className="boo-c-flip" ref={flipRef}>
<<<<<<< HEAD
              <span className="boo-c-bob"><PoseImg pose={pose} /></span>
=======
              <span className="boo-c-bob"><BooGhostSvg face={face} /></span>
>>>>>>> origin/main
            </span>
            {antic && antic.name === "nap" ? (<><span className="boo-z" aria-hidden="true">z</span><span className="boo-z" aria-hidden="true">z</span></>) : null}
            {antic && antic.name === "juggle" ? (<><span className="boo-pk" aria-hidden="true" /><span className="boo-pk" aria-hidden="true" /><span className="boo-pk" aria-hidden="true" /></>) : null}
          </span>
        </button>
<<<<<<< HEAD
        <i className="boo-tr" aria-hidden="true" /><i className="boo-tr" aria-hidden="true" /><i className="boo-tr" aria-hidden="true" /><i className="boo-tr" aria-hidden="true" />
=======
>>>>>>> origin/main
        {bubble && !open ? (
          <button type="button" className="boo-c-bubble" data-v={bubble.v} data-h={bubble.h} onClick={() => openSheet("bubble")}>
            {bubble.text}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="boo-s-back" onClick={(e) => { if (e.target === e.currentTarget) closeSheet(); }}>
          <div className="boo-s" ref={sheetRef} role="dialog" aria-modal="true" aria-label="Chat with Boo" tabIndex={-1}>
            <div className="boo-s-grab" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}><i /></div>
            <div className="boo-s-head" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
<<<<<<< HEAD
              <div className={"boo-s-av" + (antic && ["wave", "spin", "shiver", "bow"].indexOf(antic.name) >= 0 ? " boo-a-" + antic.name : "")} key={antic ? antic.key : "i"}><PoseImg pose={pending ? "panic" : pose} small /></div>
=======
              <div className={"boo-s-av" + (antic && ["wave", "spin", "shiver", "bow"].indexOf(antic.name) >= 0 ? " boo-a-" + antic.name : "")} key={antic ? antic.key : "i"}><BooGhostSvg face={pending ? "shock" : "wink"} /></div>
>>>>>>> origin/main
              <div className="boo-s-name"><b>Boo</b><span>Wayfind's ghost guide</span></div>
              <button type="button" className="boo-s-hide" onClick={hideBoo}>Hide Boo</button>
              <button type="button" className="boo-s-x" aria-label="Close chat" onClick={closeSheet}>{"×"}</button>
            </div>
            <div className="boo-s-body" ref={bodyRef} aria-live="polite">
              {msgs.map((m, i) => (
                <div key={i} className={"boo-m " + (m.role === "user" ? "u" : "b")}>
<<<<<<< HEAD
                  {m.role === "boo" && splitKicker(m.text)[0] ? <span className="boo-k">{splitKicker(m.text)[0]}</span> : null}
                  {m.role === "boo" ? splitKicker(m.text)[1] : m.text}
=======
                  {m.text}
>>>>>>> origin/main
                  {m.link ? <> <a href={HAUNT_PATH}>See the haunt list</a></> : null}
                </div>
              ))}
              {pending ? <div className="boo-m b t">Boo is rattling the chains...</div> : null}
              {cards.length ? (
                <div className="boo-s-cards">
                  {cards.map((c, i) => (
                    <div className="boo-s-card" key={(c.id || "c") + i}>
                      <h4>{c.name}</h4>
                      <p>{[c.city, c.priceLabel, c.timing].filter(Boolean).join(" · ")}</p>
                      <a
                        href={c.cta.href}
                        rel={c.cta.rel || "noopener"}
                        target={/^https?:/i.test(c.cta.href) ? "_blank" : undefined}
                        onClick={() => track("boo_companion_cta_click", { haunt_id: c.id, label: c.cta.label })}
                      >
                        {c.cta.label || "Get tickets"}
                      </a>
                    </div>
                  ))}
                </div>
              ) : null}
              {wrapped ? <a className="boo-wrap" href={HAUNT_PATH}>Open the full haunt list</a> : null}
              {!wrapped && !hasUser && !pending ? (
                <div className="boo-s-chips">
                  {chips.map((c) => (<button type="button" key={c} className="boo-s-chip" onClick={() => send(c, "chip")}>{c}</button>))}
                </div>
              ) : null}
            </div>
            <form className="boo-s-foot" onSubmit={(e) => { e.preventDefault(); send(draft, "typed"); }}>
              <input
                ref={inputRef}
                className="boo-in"
                value={draft}
                maxLength={300}
                disabled={wrapped}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={wrapped ? "That is all from me" : "Ask Boo anything"}
                aria-label="Your question for Boo"
                enterKeyHint="send"
              />
              <button type="submit" className="boo-send" disabled={wrapped || pending || !draft.trim()}>Send</button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
