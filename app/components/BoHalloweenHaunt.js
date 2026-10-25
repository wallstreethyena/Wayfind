"use client";

import { useEffect, useId, useRef, useState } from "react";

// Inter via --wf-sans. Visible copy comes from the server model.
const BULBS = ["pink", "gold", "cyan", "orange", "pink", "cyan", "gold", "orange", "pink", "gold", "cyan", "orange"];
const REEL_IDS = ["howlTampa", "howlOrlando", "hhn", "zooTampa", "mickey", "brick", "peppa", "spookquarium"];
const KICKERS = [
  { pill: "GHOST BUDGET", line: "Floated up 40ft. 0 steps taken! Leg day skipped." },
  { pill: "SKEPTIC VERDICT", line: "See for yourself. The gate price is the real scare." },
  { pill: "INSTANT MOBILE ENTRY", line: "Don't ghost me! Tap Get Tickets and lock the night." },
];

function poseFor(id) {
  if (id === "hhn" || id === "screamageddon" || id === "sirHenry") return "shades";
  if (id === "mickey" || id === "peppa" || id === "brick" || id === "spooktacular") return "squint";
  if (id === "zooTampa" || id === "spookquarium") return "stars";
  if (id === "undead" || id === "frightfest" || id === "petrified") return "tongue";
  return "wink";
}

const CSS = `
.boo-page{background:#120A1E;color:#FFFFFF;font-family:var(--wf-sans),sans-serif;padding:12px 12px 120px;position:relative;background-image:linear-gradient(rgba(0,245,212,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,42,133,.05) 1px,transparent 1px);background-size:42px 42px}
.boo-page,.boo-page button,.boo-page a,.boo-page input{font-family:var(--wf-sans),sans-serif}
.boo-inner{max-width:760px;margin:0 auto}
.boo-top,.boo-actions,.boo-filters,.boo-links,.boo-picks,.boo-chips,.boo-buyrow{display:flex;flex-wrap:wrap;gap:8px}
.boo-top{align-items:center;justify-content:space-between;margin-bottom:10px}
.boo-home,.boo-actions button,.boo-filters button,.boo-picks button,.boo-chips button,.boo-links button,.boo-send,.boo-hide,.boo-show,.boo-open{
  border:1px solid #F97316;background:#121216;color:#FFFFFF;border-radius:999px;padding:8px 12px;font-size:14px;font-weight:750;cursor:pointer;text-decoration:none;min-height:44px;display:inline-flex;align-items:center}
.boo-home.is-fill,.boo-actions button.is-fill,.boo-filters button[aria-pressed="true"],.boo-send,.boo-show{background:#F97316;color:#0A0A0B}
.boo-eyebrow{margin:0 0 6px;color:#F97316;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
.boo-page h1{margin:0 0 8px;font-size:clamp(28px,8vw,40px);font-weight:800;letter-spacing:-.03em;line-height:1.05}
.boo-lede,.boo-note{margin:0;color:#D4D4D4;font-size:15px;line-height:1.45}
.boo-note{margin-top:8px;font-size:13px;color:#FFFFFF}
.boo-stage{display:grid;grid-template-columns:168px 1fr;gap:12px;align-items:stretch;margin-top:14px}
.boo-hero-sprite{background:transparent;min-height:168px}
.boo-copy{display:flex;flex-direction:column;gap:8px;min-width:0}
.boo-badge{margin:0;display:inline-flex;align-items:center;gap:6px;background:#121216;color:#F97316;border:1px solid #F97316;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:800;letter-spacing:.06em}
.boo-bubble{margin:0;background:#121216;border:1px solid #F97316;border-radius:16px;padding:12px;color:#FFFFFF;font-size:15px;font-weight:650;line-height:1.35}
.boo-actions{margin-top:12px}
.boo-who{margin:14px 0 6px;font-size:13px;font-weight:800;color:#F97316;text-transform:uppercase;letter-spacing:.08em}
.boo-picks,.boo-chips,.boo-filters{overflow-x:auto;flex-wrap:nowrap;max-width:100%;padding-bottom:2px}
.boo-picks button,.boo-chips button,.boo-filters button{flex:none}
.boo-filters{margin:14px 0 12px}
.boo-chat{margin-top:10px;background:#121216;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:12px}
.boo-chat form{display:flex;gap:8px;margin-top:8px}
.boo-chat input{flex:1;min-width:0;min-height:44px;border-radius:12px;border:1px solid #F97316;background:#0A0A0B;color:#FFFFFF;padding:8px 10px;font-size:15px}
.boo-reply{margin:8px 0;color:#FFFFFF;font-size:15px;line-height:1.4}
.boo-rec{display:flex;flex-direction:column;gap:8px}
.boo-card{position:relative;overflow:hidden;background:rgba(22,14,36,.88);border:1px solid rgba(0,245,212,.55);border-radius:18px;padding:14px;margin:0 0 12px;scroll-margin:12px 0 200px;box-shadow:0 0 28px rgba(255,42,133,.16)}
.boo-card::before{content:"";position:absolute;inset:0;pointer-events:none;background:radial-gradient(circle at 18% 0%,rgba(0,245,212,.18),transparent 46%),radial-gradient(circle at 100% 80%,rgba(255,42,133,.16),transparent 42%);animation:boo-mist 7s ease-in-out infinite}
.boo-card>*{position:relative}
.boo-card.is-active,.boo-card.is-hot{border-color:#FFD166}
.boo-card.is-hot{box-shadow:0 0 0 2px #FF921C,0 0 32px rgba(255,209,102,.4)}
.boo-card-top{display:flex;justify-content:space-between;gap:8px;margin-bottom:8px}
.boo-stop,.boo-cat{display:inline-flex;align-items:center;min-height:26px;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:800;letter-spacing:.06em}
.boo-stop{background:#FF2A85;color:#FFFFFF}
.boo-cat{background:#121216;color:#00F5D4;border:1px solid #00F5D4}
.boo-card h2{margin:0;font-size:20px;font-weight:800;line-height:1.2;letter-spacing:-.02em}
.boo-where{margin:4px 0 0;color:#D4D4D4;font-size:14px;font-weight:650}
.boo-price{margin:10px 0 0;color:#F97316;font-size:22px;font-weight:800}
.boo-when{margin:4px 0 0;color:#FFFFFF;font-size:14px;line-height:1.4}
.boo-tip{margin:10px 0;color:#FFFFFF;font-size:14px;line-height:1.4}
.boo-tip span{display:block;color:#F97316;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-bottom:2px}
.boo-buyrow{align-items:stretch}
.boo-buy{flex:1.1;display:flex;align-items:center;justify-content:center;min-height:48px;border-radius:12px;background:#F97316;color:#0A0A0B;font-size:16px;font-weight:800;text-decoration:none;text-align:center;padding:8px}
.boo-nudge{flex:0.9;margin:0;border:1px solid #F97316;border-radius:12px;padding:8px;color:#FFFFFF;font-size:13px;line-height:1.35;background:#0A0A0B}
.boo-via{margin:6px 0 0;color:#D4D4D4;font-size:12px;line-height:1.35}
.boo-links{align-items:center;margin-top:8px}
.boo-links a{display:inline-flex;align-items:center;min-height:44px;color:#FFFFFF;font-size:14px;font-weight:700;text-decoration:underline;text-underline-offset:3px}
.boo-bottom-home{margin-top:8px}
.boo-fly{position:fixed;z-index:40;left:0;top:0;width:min(280px,calc(100vw - 16px));pointer-events:none;transform:translate3d(12px,calc(100vh - 220px),0)}
.boo-fly.is-chat{width:min(320px,calc(100vw - 16px))}
.boo-fly>*{pointer-events:auto}
.boo-fly.is-flying .boo-drag{filter:drop-shadow(-14px 8px 0 rgba(249,115,22,.55)) drop-shadow(-28px 16px 0 rgba(249,115,22,.28))}
.boo-fly-col{display:flex;align-items:flex-end;gap:8px}
.boo-drag{width:132px;flex:none;padding:0;border:0;background:transparent;cursor:grab;touch-action:none}
.boo-drag:active{cursor:grabbing}
.boo-fly-copy{display:flex;flex-direction:column;gap:6px;min-width:0;flex:1}
.boo-float-bubble{border:1px solid #F97316;background:#121216;color:#FFFFFF;border-radius:16px;padding:10px 12px;text-align:left;font-size:14px;font-weight:650;line-height:1.35;cursor:pointer}
.boo-hide,.boo-open{align-self:flex-start;min-height:36px;padding:4px 10px;font-size:12px}
.boo-show{position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:40}
.boo-fly-chat{margin-top:6px;max-height:42vh;overflow:auto}
.boo-sprite{width:100%;height:auto;display:block;overflow:hidden;animation:boo-bob .87s linear infinite}
.boo-hem{transform-box:fill-box;transform-origin:center}
.boo-flag{transform-box:fill-box;transform-origin:0% 100%;animation:boo-wave 1s ease-in-out infinite}
.boo-bubble,.boo-float-bubble{animation:boo-pop .35s cubic-bezier(.2,1.6,.3,1)}
.boo-lights{position:relative;height:78px;margin:0 0 4px}
.boo-lights::after{content:"";position:absolute;left:4%;right:4%;top:46px;height:42px;pointer-events:none;background:linear-gradient(180deg,rgba(255,42,133,.22),rgba(255,209,102,.12) 42%,rgba(0,245,212,.08),transparent)}
.boo-wire{position:absolute;left:0;right:0;top:0;width:100%;height:64px}
.boo-bulb{position:absolute;top:18px;width:18px;height:24px;border-radius:10px 10px 12px 12px;animation:boo-flicker 2.4s infinite}
.boo-bulb::before{content:"";position:absolute;left:50%;top:50%;width:28px;height:28px;transform:translate(-50%,-50%);background:currentColor;clip-path:polygon(50% 0,58% 42%,100% 50%,58% 58%,50% 100%,42% 58%,0 50%,42% 42%);opacity:.85;filter:blur(.2px)}
.boo-bulb::after{content:"";position:absolute;left:6px;top:-9px;width:6px;height:9px;background:#FFD166;border-radius:2px}
.boo-flare{position:absolute;inset:-14px;border-radius:50%;opacity:.85}
.boo-charm{position:absolute;left:4px;top:28px;width:11px;height:11px;background:#FFD166;clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%)}
.boo-bulb.is-pink{background:#FF2A85;color:#FF2A85;box-shadow:0 0 18px #FF2A85,0 0 36px rgba(255,42,133,.45)}
.boo-bulb.is-pink .boo-flare{background:radial-gradient(circle,#FF2A85,transparent 70%)}
.boo-bulb.is-gold{background:#FFD166;color:#FFD166;box-shadow:0 0 18px #FFD166,0 0 36px rgba(255,209,102,.45)}
.boo-bulb.is-gold .boo-flare{background:radial-gradient(circle,#FFD166,transparent 70%)}
.boo-bulb.is-orange{background:#FF921C;color:#FF921C;box-shadow:0 0 18px #FF921C,0 0 36px rgba(255,146,28,.4)}
.boo-bulb.is-orange .boo-flare{background:radial-gradient(circle,#FF921C,transparent 70%)}
.boo-bulb.is-cyan{background:#00F5D4;color:#00F5D4;box-shadow:0 0 18px #00F5D4,0 0 36px rgba(0,245,212,.4)}
.boo-bulb.is-cyan .boo-flare{background:radial-gradient(circle,#00F5D4,transparent 70%)}
.boo-bulb:nth-child(2){left:1%;top:10px;animation-duration:1.7s;animation-delay:.1s}
.boo-bulb:nth-child(3){left:9%;top:26px;animation-duration:2.8s;animation-delay:.4s}
.boo-bulb:nth-child(4){left:17%;top:12px;animation-duration:2.1s;animation-delay:.2s}
.boo-bulb:nth-child(5){left:25%;top:28px;animation-duration:3.2s;animation-delay:.7s}
.boo-bulb:nth-child(6){left:33%;top:11px;animation-duration:1.9s;animation-delay:.15s}
.boo-bulb:nth-child(7){left:41%;top:27px;animation-duration:2.6s;animation-delay:.55s}
.boo-bulb:nth-child(8){left:49%;top:10px;animation-duration:1.5s;animation-delay:.3s}
.boo-bulb:nth-child(9){left:57%;top:28px;animation-duration:3.4s;animation-delay:.8s}
.boo-bulb:nth-child(10){left:65%;top:12px;animation-duration:2.2s;animation-delay:.25s}
.boo-bulb:nth-child(11){left:73%;top:26px;animation-duration:1.8s;animation-delay:.6s}
.boo-bulb:nth-child(12){left:81%;top:11px;animation-duration:2.9s;animation-delay:.35s}
.boo-bulb:nth-child(13){left:90%;top:24px;animation-duration:2.4s;animation-delay:.5s}
.boo-sheet-pill{display:inline-flex;align-items:center;margin:0 0 8px;background:#FF921C;color:#0A0A0B;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:800;letter-spacing:.04em}
.boo-reel{display:flex;gap:4px;margin:8px 0}
.boo-reel button{flex:1;height:8px;border:0;border-radius:99px;background:rgba(255,255,255,.2);padding:0;min-height:8px}
.boo-reel button.is-on{background:#00F5D4;box-shadow:0 0 12px #00F5D4}
.boo-kicker{margin:0 0 6px;color:#FFD166;font-size:11px;font-weight:800;letter-spacing:.08em}
.boo-trail{position:absolute;left:8px;top:24px;width:90px;height:70px;pointer-events:none}
.boo-trail i{position:absolute;width:12px;height:12px;background:#00F5D4;clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);animation:boo-spark .6s linear infinite}
.boo-trail i:nth-child(2){left:22px;top:16px;background:#FF2A85;animation-delay:.1s}
.boo-trail i:nth-child(3){left:40px;top:4px;background:#FFD166;animation-delay:.2s}
.boo-trail i:nth-child(4){left:58px;top:22px;background:#00F5D4;animation-delay:.3s}
.boo-squint{opacity:0}
.boo-sprite[data-face="wink"] .boo-squint{animation:boo-blink-on 2.2s linear infinite}
.boo-sprite[data-face="wink"] .boo-awake{animation:boo-blink-off 2.2s linear infinite}
@keyframes boo-bob{0%{transform:translateY(0)}12.5%{transform:translateY(6.4px)}25%{transform:translateY(9px)}37.5%{transform:translateY(6.4px)}50%{transform:translateY(0)}62.5%{transform:translateY(-6.4px)}75%{transform:translateY(-9px)}87.5%{transform:translateY(-6.4px)}100%{transform:translateY(0)}}
@keyframes boo-wave{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(10deg)}}
@keyframes boo-pop{0%{transform:scale(1)}45%{transform:scale(1.08)}100%{transform:scale(1)}}
@keyframes boo-flicker{0%,18%,22%,53%,57%,100%{opacity:1}20%,55%{opacity:.35}70%{opacity:.8}}
@keyframes boo-mist{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes boo-spark{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(-18px,14px) scale(.4);opacity:0}}
@keyframes boo-blink-off{0%,92%{opacity:1}93%,100%{opacity:0}}
@keyframes boo-blink-on{0%,92%{opacity:0}93%,100%{opacity:1}}
@media(prefers-reduced-motion:reduce){
  .boo-sprite,.boo-flag,.boo-bubble,.boo-float-bubble,.boo-bulb,.boo-card::before,.boo-trail i,.boo-squint,.boo-awake{animation:none}
}
@media(max-width:520px){
  .boo-page{padding-bottom:240px}
  .boo-fly{width:136px}
  .boo-fly.is-chat{width:min(320px,calc(100vw - 16px))}
  .boo-fly-col{flex-direction:column;align-items:stretch}
  .boo-fly .boo-badge{display:none}
  .boo-drag{width:120px}
  .boo-float-bubble{font-size:12px;max-height:74px;overflow:hidden}
}
@media(min-width:800px){
  .boo-page{padding:28px 24px 140px}
  .boo-inner{max-width:1120px}
  .boo-stage{grid-template-columns:230px 1fr}
  .boo-vault-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:start}
  .boo-vault-grid .boo-card{margin:0}
}
`;

function Star({ cx, cy, fill }) {
  const x = Number(cx);
  const y = Number(cy);
  const d = ["M", x, y - 11, "L", x + 3, y - 3, "L", x + 12, y, "L", x + 3, y + 3, "L", x, y + 12, "L", x - 3, y + 3, "L", x - 12, y, "L", x - 3, y - 3, "Z"].join(" ");
  return <path d={d} fill={fill || "#FFD166"} />;
}

function BooGhostSvg({ label, face }) {
  const raw = useId().replace(/:/g, "");
  const sheet = "boo-sheet-" + raw;
  const mode = face || "wink";
  const shadesDown = mode === "shades";
  return (
    <svg className="boo-sprite" data-face={mode} viewBox="0 0 255 255" role={label ? "img" : "presentation"} aria-label={label || undefined} aria-hidden={label ? undefined : true}>
      <defs>
        <linearGradient id={sheet} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#D5C2FF" />
        </linearGradient>
      </defs>
      <g className="boo-flag">
        <path d="M14 78 V128" stroke="#FFD166" strokeWidth="3" strokeLinecap="round" />
        <circle cx="14" cy="70" r="5.5" fill="#FF2A85" stroke="#23143B" strokeWidth="2" />
        <path d="M14 82 L52 96 L14 110 Z" fill="#FF921C" stroke="#23143B" strokeWidth="2" strokeLinejoin="round" />
        <text x="24" y="100" fill="#FFFFFF" fontSize="8" fontWeight="800" fontFamily="var(--wf-sans), sans-serif">TOUR</text>
      </g>
      <ellipse cx="58" cy="150" rx="18" ry="10" transform="rotate(-24 58 150)" fill={"url(#" + sheet + ")"} stroke="#23143B" strokeWidth="6" />
      <ellipse cx="198" cy="146" rx="18" ry="10" transform="rotate(22 198 146)" fill={"url(#" + sheet + ")"} stroke="#23143B" strokeWidth="6" />
      <g className="boo-hem">
        <path d="M128 20 C198 20 214 66 214 112 L214 162 C226 184 204 198 184 184 C164 170 156 208 132 192 C108 176 100 212 78 194 C56 176 50 160 48 142 L48 112 C48 66 58 20 128 20 Z" fill={"url(#" + sheet + ")"} stroke="#23143B" strokeWidth="6" strokeLinejoin="round" />
      </g>
      <ellipse cx="78" cy="132" rx="12" ry="8" fill="#FF7597" opacity="0.82" />
      <ellipse cx="178" cy="132" rx="12" ry="8" fill="#FF7597" opacity="0.82" />
      {mode === "shock" ? (
        <ellipse cx="128" cy="148" rx="10" ry="12" fill="#23143B" />
      ) : (
        <path d="M96 142 Q128 176 160 142 Q128 156 96 142 Z" fill="#23143B" />
      )}
      {mode === "tongue" ? (
        <path d="M108 158 Q128 196 148 158 Q128 176 108 158 Z" fill="#FF7597" />
      ) : mode === "shock" ? null : (
        <path d="M110 158 Q128 174 146 158 Q128 166 110 158 Z" fill="#FF7597" />
      )}
      <g className="boo-awake">
        {mode === "stars" ? (
          <g>
            <Star cx="96" cy="112" />
            <Star cx="164" cy="112" />
          </g>
        ) : mode === "shock" ? (
          <g>
            <ellipse cx="96" cy="112" rx="12" ry="14" fill="#0A0A0B" />
            <ellipse cx="164" cy="112" rx="12" ry="14" fill="#0A0A0B" />
            <circle cx="92" cy="106" r="2.4" fill="#FFFFFF" />
            <circle cx="160" cy="106" r="2.4" fill="#FFFFFF" />
          </g>
        ) : mode === "squint" ? (
          <g>
            <path d="M80 114 Q96 100 112 114" fill="none" stroke="#23143B" strokeWidth="5" strokeLinecap="round" />
            <path d="M148 114 Q164 100 180 114" fill="none" stroke="#23143B" strokeWidth="5" strokeLinecap="round" />
          </g>
        ) : (
          <g>
            <path d="M80 116 Q96 102 112 116" fill="none" stroke="#23143B" strokeWidth="5" strokeLinecap="round" />
            <ellipse cx="164" cy="112" rx="13" ry="15" fill="#0A0A0B" />
            <Star cx="164" cy="112" />
            <circle cx="158" cy="106" r="2.2" fill="#FFFFFF" />
          </g>
        )}
      </g>
      <g className="boo-squint">
        <path d="M80 116 Q96 102 112 116" fill="none" stroke="#23143B" strokeWidth="5" strokeLinecap="round" />
        <path d="M148 116 Q164 102 180 116" fill="none" stroke="#23143B" strokeWidth="5" strokeLinecap="round" />
      </g>
      <g transform={shadesDown ? "translate(0 48) rotate(-6 128 70)" : "rotate(-6 128 58)"}>
        <rect x="78" y="46" width="40" height="22" rx="4" fill="#0A0A0B" stroke="#FF2A85" strokeWidth="3.5" />
        <rect x="124" y="46" width="40" height="22" rx="4" fill="#0A0A0B" stroke="#00F5D4" strokeWidth="3.5" />
        <path d="M118 56 H124" stroke="#23143B" strokeWidth="3.5" />
        <path d="M86 50 L104 64" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
        <path d="M132 50 L150 64" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
      </g>
      <rect x="188" y="118" width="62" height="24" rx="12" fill="#FFFFFF" stroke="#23143B" strokeWidth="3" />
      <text x="196" y="135" fill="#0A0A0B" fontSize="11" fontWeight="800" fontFamily="var(--wf-sans), sans-serif">GO →</text>
    </svg>
  );
}

function cleanReply(text) {
  return String(text || "").replace(/[-\u2013\u2014]/g, " ").replace(/\s{2,}/g, " ").trim();
}

export default function BoHalloweenHaunt({ model, share = null }) {
  const { chrome, lines, filters, haunts, picks, prompts } = model;
  const [filter, setFilter] = useState("all");
  const [bubble, setBubble] = useState(lines[0]);
  const [gagIndex, setGagIndex] = useState(0);
  const [activeId, setActiveId] = useState(null);
  const [hotId, setHotId] = useState(null);
  const [spinNonce, setSpinNonce] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [quipAt, setQuipAt] = useState({});
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatReply, setChatReply] = useState("");
  const [chatIds, setChatIds] = useState([]);
  const [flying, setFlying] = useState(false);
  const [emote, setEmote] = useState("wink");
  const [reelOn, setReelOn] = useState(false);
  const [reelIndex, setReelIndex] = useState(0);
  const [kicker, setKicker] = useState(KICKERS[0].pill);
  const [pop, setPop] = useState(0);
  const reelRows = REEL_IDS.map((id) => haunts.find((row) => row.id === id)).filter(Boolean);
  const holdUntil = useRef(0);
  const emoteLock = useRef(0);
  const lastSeen = useRef(null);
  const flyRef = useRef(null);
  const sideRef = useRef("left");
  const activeRef = useRef(null);
  const dragHold = useRef(false);
  const poseRef = useRef(null);

  useEffect(() => { activeRef.current = activeId; }, [activeId]);

  useEffect(() => {
    if (!reelOn) return undefined;
    const timer = setInterval(() => setReelIndex((n) => n + 1), 4200);
    return () => clearInterval(timer);
  }, [reelOn]);

  useEffect(() => {
    if (!reelOn || !reelRows.length) return undefined;
    const row = reelRows[reelIndex % reelRows.length];
    const kick = KICKERS[reelIndex % KICKERS.length];
    setFilter("all");
    setActiveId(row.id);
    setHotId(row.id);
    setSpinNonce((n) => n + 1);
    emoteLock.current = Date.now() + 7000;
    setEmote(poseFor(row.id));
    setKicker(kick.pill);
    speak(kick.line, 7000);
    return undefined;
  }, [reelOn, reelIndex]);

  const speak = (text, holdMs) => {
    holdUntil.current = Date.now() + holdMs;
    setBubble(text);
    setPop((n) => n + 1);
  };

  const shown = filter === "all" ? haunts : haunts.filter((row) => row.filters.includes(filter));

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const nodes = document.querySelectorAll("[data-haunt-id]");
    const io = new IntersectionObserver((entries) => {
      const best = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!best) return;
      const id = best.target.getAttribute("data-haunt-id");
      if (!id || lastSeen.current === id) return;
      lastSeen.current = id;
      setActiveId(id);
      if (Date.now() >= emoteLock.current) setEmote(poseFor(id));
      const row = haunts.find((item) => item.id === id);
      if (row && Date.now() >= holdUntil.current) setBubble(row.tip);
    }, { threshold: [0.55, 0.75] });
    nodes.forEach((node) => io.observe(node));
    return () => io.disconnect();
  }, [filter, haunts]);

  useEffect(() => {
    if (!hotId) return undefined;
    const node = document.getElementById("haunt-" + hotId);
    if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ behavior: "smooth", block: "center" });
    return undefined;
  }, [hotId, spinNonce, filter]);

  useEffect(() => {
    const node = flyRef.current;
    if (!node || dismissed) return undefined;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pose = { x: 12, y: Math.max(80, window.innerHeight - 230), vx: 0, vy: 0, targetX: 12, targetY: Math.max(80, window.innerHeight - 230) };
    poseRef.current = pose;
    let wasFlying = false;
    let landedAt = 0;
    let stopped = false;
    let raf = 0;
    const paint = (isFly, tilt) => {
      node.style.transform = "translate3d(" + pose.x + "px," + pose.y + "px,0) rotate(" + tilt + "deg)";
    };
    const place = () => {
      if (dragHold.current) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const chat = node.classList.contains("is-chat");
      const narrow = w < 520;
      const width = chat ? Math.min(320, w - 16) : (narrow ? 136 : Math.min(280, w - 16));
      const edge = sideRef.current === "right" ? Math.max(8, w - width - 8) : 8;
      const scroller = document.querySelector(".wf-scrollarea") || document.scrollingElement;
      const scrolled = scroller ? scroller.scrollTop : 0;
      const sway = narrow ? 0 : Math.sin(scrolled / 180) * 42;
      pose.targetX = Math.max(8, Math.min(w - width - 8, edge + sway));
      if (narrow && !chat) {
        pose.targetY = Math.max(72, h - 248);
        return;
      }
      let y = h * 0.58;
      const cards = document.querySelectorAll("[data-haunt-id]");
      for (const card of cards) {
        const rect = card.getBoundingClientRect();
        if (rect.top < h * 0.7 && rect.bottom > 90) {
          y = Math.min(h - 200, Math.max(72, rect.top + 8));
          break;
        }
      }
      pose.targetY = y;
    };
    const step = () => {
      if (stopped) return;
      place();
      if (reduce) {
        pose.x = pose.targetX;
        pose.y = pose.targetY;
        pose.vx = 0;
        pose.vy = 0;
        paint(0, 0);
        if (wasFlying) setFlying(false);
        wasFlying = false;
        return;
      }
      pose.vx = (pose.vx + (pose.targetX - pose.x) * 0.05) * 0.76;
      pose.vy = (pose.vy + (pose.targetY - pose.y) * 0.05) * 0.76;
      pose.x += pose.vx;
      pose.y += pose.vy;
      const speed = Math.hypot(pose.vx, pose.vy);
      const isFly = speed > 0.85;
      const tilt = isFly ? Math.max(-14, Math.min(14, pose.vx * 0.28 + pose.vy * 0.06)) : 0;
      paint(isFly, tilt);
      if (isFly !== wasFlying) setFlying(isFly);
      if (wasFlying && !isFly && Date.now() > landedAt && Date.now() >= holdUntil.current) {
        landedAt = Date.now() + 2200;
        const row = haunts.find((item) => item.id === activeRef.current);
        if (row) setBubble(row.nudge || row.tip);
      }
      wasFlying = isFly;
      raf = requestAnimationFrame(step);
    };
    place();
    step();
    const onScroll = () => { if (reduce) step(); };
    window.addEventListener("scroll", onScroll, { passive: true });
    if (!reduce) raf = requestAnimationFrame(step);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, [dismissed, haunts]);

  const focusHaunt = (row, lock) => {
    if (lock) setReelOn(false);
    setActiveId(row.id);
    if (lock) emoteLock.current = Date.now() + 8000;
    setEmote(poseFor(row.id));
    if (Date.now() >= holdUntil.current) setBubble(row.tip);
  };

  const nextGag = () => {
    const next = (gagIndex + 1) % lines.length;
    setGagIndex(next);
    speak(lines[next], 8000);
  };

  const roastPrice = () => {
    const pool = haunts.filter((row) => row.roast);
    const current = pool.find((row) => row.id === activeId);
    const pick = current || pool[Math.floor(Math.random() * pool.length)];
    setActiveId(pick.id);
    setReelOn(false);
    emoteLock.current = Date.now() + 9000;
    setEmote("tongue");
    setDismissed(false);
    speak(pick.roast, 9000);
  };

  const spinDeal = () => {
    const pool = haunts.filter((row) => row.cta.kind === "affiliate");
    const pick = pool[Math.floor(Math.random() * pool.length)];
    setFilter("all");
    setActiveId(pick.id);
    setHotId(pick.id);
    setSpinNonce((n) => n + 1);
    setReelOn(false);
    emoteLock.current = Date.now() + 9000;
    setEmote(poseFor(pick.id));
    setDismissed(false);
    speak(pick.roast, 9000);
  };

  const pickScare = (item) => {
    const row = haunts.find((haunt) => haunt.id === item.hauntId);
    if (!row) return;
    setFilter("all");
    setActiveId(row.id);
    setHotId(row.id);
    setSpinNonce((n) => n + 1);
    setReelOn(false);
    emoteLock.current = Date.now() + 10000;
    setEmote(item.id === "terrify" ? "shades" : poseFor(row.id));
    setDismissed(false);
    speak(item.pitch, 10000);
  };

  const askBoo = (row) => {
    const at = quipAt[row.id] || 0;
    setQuipAt({ ...quipAt, [row.id]: at + 1 });
    setActiveId(row.id);
    setHotId(row.id);
    setReelOn(false);
    emoteLock.current = Date.now() + 10000;
    setEmote("shock");
    setDismissed(false);
    speak(row.quips[at % row.quips.length], 10000);
  };

  const showRecommendation = (data) => {
    const reply = cleanReply(data && data.reply) || lines[1];
    const ids = (data && data.recommendedIds || []).filter((id) => haunts.some((row) => row.id === id));
    setChatReply(reply);
    setChatIds(ids.length ? ids : ["howlOrlando"]);
    setChatOpen(true);
    const first = haunts.find((row) => row.id === (ids[0] || "howlOrlando"));
    if (first) {
      setFilter("all");
      setActiveId(first.id);
      setHotId(first.id);
      setSpinNonce((n) => n + 1);
      setReelOn(false);
      emoteLock.current = Date.now() + 12000;
      setEmote("stars");
    }
    speak(reply, 12000);
  };

  const askLive = async (text) => {
    const message = String(text || "").trim();
    if (!message || pending) return;
    setDraft("");
    setPending(true);
    setReelOn(false);
    emoteLock.current = Date.now() + 12000;
    setEmote("shock");
    setChatOpen(true);
    setDismissed(false);
    try {
      const res = await fetch("/api/bo-haunt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      showRecommendation(data);
    } catch {
      showRecommendation({ reply: lines[1], recommendedIds: ["howlOrlando"] });
    } finally {
      setPending(false);
    }
  };

  const onDragDown = (event) => {
    const pose = poseRef.current;
    if (!pose) return;
    dragHold.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    poseRef.current.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, ox: pose.x, oy: pose.y, moved: false };
  };
  const onDragMove = (event) => {
    const pose = poseRef.current;
    const drag = pose && pose.drag;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 8) drag.moved = true;
    pose.x = drag.ox + dx;
    pose.y = drag.oy + dy;
    pose.targetX = pose.x;
    pose.targetY = pose.y;
    pose.vx = 0;
    pose.vy = 0;
  };
  const onDragUp = (event) => {
    const pose = poseRef.current;
    const drag = pose && pose.drag;
    dragHold.current = false;
    if (!pose) return;
    pose.drag = null;
    if (!drag || drag.id !== event.pointerId) return;
    if (!drag.moved) sideRef.current = sideRef.current === "left" ? "right" : "left";
    else sideRef.current = event.clientX > window.innerWidth / 2 ? "right" : "left";
  };

  const chatBox = (compact) => (
    <div className={"boo-chat" + (compact ? " boo-fly-chat" : "")} data-boo-chat={compact ? "fly" : "hero"}>
      <p className="boo-badge">{chrome.vip}</p>
      <p className="boo-who">{chrome.chatTitle}</p>
      {pending ? <p className="boo-reply">{chrome.thinking}</p> : null}
      {chatReply ? <p className="boo-reply" data-boo-reply="">{chatReply}</p> : null}
      {chatIds.length ? (
        <div className="boo-rec">
          {chatIds.map((id) => {
            const row = haunts.find((item) => item.id === id);
            if (!row) return null;
            return <a key={id} className="boo-buy" href={row.cta.href} rel={row.cta.rel}>{row.cta.label}</a>;
          })}
        </div>
      ) : null}
      <div className="boo-chips" role="group" aria-label={chrome.chatTitle}>
        {prompts.map((prompt) => (
          <button type="button" key={prompt} onClick={() => askLive(prompt)}>{prompt}</button>
        ))}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); askLive(draft); }}>
        <input
          aria-label={chrome.askPlaceholder}
          placeholder={chrome.askPlaceholder}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button className="boo-send" type="submit">{chrome.send}</button>
      </form>
    </div>
  );

  return (
    <section className="boo-page" aria-labelledby="boo-title">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="boo-lights" aria-hidden="true">
        <svg className="boo-wire" viewBox="0 0 1200 80" preserveAspectRatio="none">
          <path d="M0 18 C40 18 70 52 110 52 C150 52 170 16 230 16 C290 16 310 56 370 56 C430 56 450 14 510 14 C570 14 590 58 650 58 C710 58 730 16 800 16 C860 16 880 54 950 54 C1010 54 1040 20 1200 28" fill="none" stroke="#FFD166" strokeWidth="3" />
        </svg>
        {BULBS.map((tone, index) => (
          <span key={tone + index} className={"boo-bulb is-" + tone}>
            <span className="boo-flare" />
            <span className="boo-charm" />
          </span>
        ))}
      </div>
      <div className="boo-inner">
        <div className="boo-top">
          <a className="boo-home" href="/">{chrome.home}</a>
          {share}
        </div>
        <div id="boo-hero">
          <p className="boo-sheet-pill">OFFICIAL HAUNT TICKET VAULT · GOWAYFIND.COM</p>
          <p className="boo-eyebrow">{chrome.vip}</p>
          <h1 id="boo-title">{chrome.title}</h1>
          <p className="boo-lede">{chrome.host}. {chrome.lede}</p>
          <p className="boo-note">{chrome.disclosure}</p>
          <p className="boo-note">{chrome.merit}</p>
          <div className="boo-reel" role="tablist" aria-label="Boo reel stops">
            {reelRows.map((row, index) => (
              <button
                type="button"
                key={row.id}
                className={index === (reelIndex % reelRows.length) && reelOn ? "is-on" : ""}
                aria-label={"Show stop " + (index + 1)}
                onClick={() => { setReelOn(false); setReelIndex(index); setHotId(row.id); setActiveId(row.id); setSpinNonce((n) => n + 1); emoteLock.current = Date.now() + 8000; setEmote(poseFor(row.id)); speak(row.nudge, 8000); }}
              />
            ))}
          </div>
          <div className="boo-actions">
            <button type="button" className="is-fill" onClick={() => { setReelOn((on) => !on); setDismissed(false); }}>{reelOn ? "Pause The Reel" : "Play Boo's Interactive Reel Tour"}</button>
          </div>
          <div className="boo-stage">
            <div className="boo-hero-sprite">
              <BooGhostSvg label={chrome.videoLabel} face={pending ? "shock" : emote} />
            </div>
            <div className="boo-copy">
              <p className="boo-badge">{chrome.vip}</p>
              <p className="boo-kicker">{kicker}</p>
              <p key={pop} className="boo-bubble" data-boo-bubble="hero">{bubble}</p>
            </div>
          </div>
          <div className="boo-actions">
            <button type="button" onClick={nextGag}>{chrome.nextGag}</button>
            <button type="button" onClick={roastPrice}>{chrome.roast}</button>
            <button type="button" onClick={spinDeal}>{chrome.spin}</button>
            <button type="button" className="is-fill" onClick={() => { setDismissed(false); const vault = document.getElementById("boo-vault"); if (vault && vault.scrollIntoView) vault.scrollIntoView({ behavior: "smooth", block: "start" }); }}>{chrome.hauntScroll}</button>
          </div>
          <p className="boo-who">{chrome.pick}</p>
          <p className="boo-lede">{chrome.who}</p>
          <div className="boo-picks" role="toolbar" aria-label={chrome.pick}>
            {picks.map((item) => (
              <button type="button" key={item.id} onClick={() => pickScare(item)}>{item.label}</button>
            ))}
          </div>
          {chatBox(false)}
        </div>

        <div id="boo-vault" data-haunt-vault="">
          <div className="boo-filters" role="toolbar" aria-label={chrome.eyebrow}>
            {filters.map((item) => (
              <button type="button" key={item.id} aria-pressed={filter === item.id} onClick={() => { setReelOn(false); setFilter(item.id); }}>{item.label}</button>
            ))}
          </div>
          {shown.length ? <div className="boo-vault-grid">{shown.map((row) => (
            <article
              key={row.id}
              id={"haunt-" + row.id}
              data-haunt-id={row.id}
              className={"boo-card" + (activeId === row.id ? " is-active" : "") + (hotId === row.id ? " is-hot" : "")}
              onMouseEnter={() => focusHaunt(row)}
              onFocus={() => focusHaunt(row)}
              onClick={() => focusHaunt(row, true)}
            >
              <div className="boo-card-top">
                <span className="boo-stop">{"STOP " + (haunts.indexOf(row) + 1)}</span>
                <span className="boo-cat">{row.filters.includes("family") ? "Family Friendly" : row.filters.includes("major") ? "Major Scream Parks" : "Local Haunted Trails"}</span>
              </div>
              <h2>{row.name}</h2>
              <p className="boo-where">{row.where}</p>
              <p className="boo-price">{row.priceLabel}</p>
              <p className="boo-when">{row.timing}</p>
              <p className="boo-tip"><span>{chrome.boSays}</span>{row.tip}</p>
              <div className="boo-buyrow">
                <a className="boo-buy" href={row.cta.href} rel={row.cta.rel}>{row.cta.label}</a>
                <p className="boo-nudge">{row.nudge}</p>
              </div>
              <p className="boo-via">{row.cta.via}</p>
              <div className="boo-links">
                <a href={row.eventHref}>{chrome.eventPage}</a>
                <button type="button" onClick={() => askBoo(row)}>{chrome.ask}</button>
              </div>
            </article>
          ))}</div> : <p>{chrome.empty}</p>}
          <a className="boo-home is-fill boo-bottom-home" href="/">{chrome.homeBottom}</a>
        </div>
      </div>
      {dismissed ? (
        <button type="button" className="boo-show" onClick={() => setDismissed(false)}>{chrome.show}</button>
      ) : (
        <aside ref={flyRef} className={"boo-fly" + (flying ? " is-flying" : "") + (chatOpen ? " is-chat" : "")} data-boo-fly="" aria-label={chrome.floatLabel}>
          {flying ? <span className="boo-trail" aria-hidden="true"><i /><i /><i /><i /></span> : null}
          <div className="boo-fly-col">
            <button type="button" className="boo-drag" aria-label={chrome.videoLabel} onPointerDown={onDragDown} onPointerMove={onDragMove} onPointerUp={onDragUp}>
              <BooGhostSvg label="" face={pending ? "shock" : emote} />
            </button>
            <div className="boo-fly-copy">
              <p className="boo-badge">{chrome.vip}</p>
              <p className="boo-kicker">{kicker}</p>
              <button type="button" className="boo-float-bubble" data-boo-bubble="float" onClick={nextGag}>{bubble}</button>
              <button type="button" className="boo-open" onClick={() => setChatOpen((open) => !open)}>{chrome.openChat}</button>
              <button type="button" className="boo-hide" onClick={() => setDismissed(true)}>{chrome.hide}</button>
            </div>
          </div>
          {chatOpen ? chatBox(true) : null}
        </aside>
      )}
    </section>
  );
}
