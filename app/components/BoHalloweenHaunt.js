"use client";

import { useEffect, useId, useRef, useState } from "react";
import { captureOrQueue } from "../../lib/browserAnalytics.js";

// Inter via --wf-sans. Visible copy comes from the server model and stays dash free.
const BULBS = ["pink", "gold", "cyan", "orange", "pink", "cyan", "gold", "orange", "pink", "gold", "cyan", "orange"];
const REEL_IDS = ["howlTampa", "howlOrlando", "hhn", "zooTampa", "mickey", "brick", "peppa", "spookquarium"];
const KICKERS = [
  { pill: "GHOST BUDGET", line: "Floated up 40ft. 0 steps taken! Leg day skipped." },
  { pill: "SKEPTIC VERDICT", line: "See for yourself. The gate price is the real scare." },
  { pill: "INSTANT MOBILE ENTRY", line: "Don't ghost me! Tap Get Tickets and lock the night." },
];

const STICKER_MAP = {
  hype: "/images/boo/boo_v1_hype_guide.png",
  springs: "/images/boo/boo_v2_springs_diver.png",
  pirate: "/images/boo/boo_v3_night_pirate.png",
  explorer: "/images/boo/boo_v4_canopy_explorer.png",
  maracas: "/images/boo/boo_v5_sunset_maracas.png",
  navigator: "/images/boo/boo_v6_route_navigator.png",
  flamingo: "/images/boo/boo_v7_flamingo_vip.png",
};

const COSTUME_TABS = [
  { id: "hype", label: "VIP Guide", emote: "wink", kicker: "BOO'S VIP TOUR", line: "I'm Boo, your ghost host! I died so I could haunt these Florida scares and save your wallet from gate prices." },
  { id: "pirate", label: "Night Pirate", emote: "shades", kicker: "AFTER DARK CONTRABAND", line: "Sunglasses on, gate prices off! Universal Horror Nights and Busch Gardens Howl O Scream are waiting." },
  { id: "springs", label: "Splash Diver", emote: "shock", kicker: "COASTAL SCARE ALERT", line: "SeaWorld Howl O Scream Orlando starts at $45.99 online. Even the sharks know walk up prices bite!" },
  { id: "explorer", label: "Trail Scout", emote: "tongue", kicker: "0 STEPS TAKEN", line: "Floated up 40ft. 0 steps taken! Leg day skipped, and your gate markup skipped too when you book online." },
  { id: "maracas", label: "Fiesta Vibe", emote: "squint", kicker: "CARNIVAL AFTER DARK", line: "Brick or Treat and Fright Fest bring the music, rides, and late night thrills without the box office markup." },
  { id: "navigator", label: "Route Scout", emote: "wink", kicker: "I4 HAUNT COMPASS", line: "Point my compass at Plant City or Altamonte Springs! Sir Henry's Haunted Trail and A Petrified Forest are pure local gold." },
  { id: "flamingo", label: "Family VIP", emote: "stars", kicker: "FAMILY TREAT PASS", line: "Bringing the crew? Mickey's Not So Scary and ZooTampa Creatures of the Night deliver the treats without the tears." },
];

function poseFor(id) {
  if (id === "hhn" || id === "screamageddon" || id === "sirHenry") return "shades";
  if (id === "mickey" || id === "peppa" || id === "brick" || id === "spooktacular") return "squint";
  if (id === "zooTampa" || id === "spookquarium") return "stars";
  if (id === "undead" || id === "frightfest" || id === "petrified") return "tongue";
  return "wink";
}

function costumeFor(id) {
  if (id === "hhn" || id === "undead" || id === "screamageddon") return "pirate";
  if (id === "howlOrlando" || id === "spooktacular" || id === "spookquarium") return "springs";
  if (id === "zooTampa" || id === "petrified") return "explorer";
  if (id === "brick" || id === "frightfest") return "maracas";
  if (id === "sirHenry") return "navigator";
  if (id === "mickey" || id === "peppa") return "flamingo";
  return "hype";
}

function trackHauntEvent(event, props) {
  if (typeof window === "undefined") return;
  try {
    captureOrQueue(window, event, { surface: "halloween_haunts", ...props });
  } catch { /* ignore */ }
}

const CSS = `
.boo-page{
  background:#0A0A0B;
  color:#FFFFFF;
  font-family:var(--wf-sans),sans-serif;
  padding:0 16px 140px;
  position:relative;
  min-height:100dvh;
  overflow-x:clip;
  background-image:
    radial-gradient(ellipse 80% 50% at 50% -10%,rgba(249,115,22,.16),transparent 65%),
    radial-gradient(ellipse 60% 45% at 85% 20%,rgba(0,245,212,.08),transparent 60%),
    radial-gradient(ellipse 60% 45% at 15% 35%,rgba(255,42,133,.08),transparent 60%),
    linear-gradient(180deg,#0A0A0B 0%,#121216 45%,#0A0A0B 100%);
}
.boo-page,.boo-page button,.boo-page a,.boo-page input{font-family:var(--wf-sans),sans-serif;box-sizing:border-box}
.boo-inner{max-width:1140px;margin:0 auto}

/* Festoon Lights */
.boo-lights{position:relative;height:68px;margin:0 -16px 8px;overflow:hidden;pointer-events:none}
.boo-lights::after{content:"";position:absolute;left:0;right:0;top:36px;height:32px;background:linear-gradient(180deg,rgba(249,115,22,.12),rgba(0,245,212,.04),transparent)}
.boo-wire{position:absolute;left:0;right:0;top:0;width:100%;height:56px;opacity:.75}
.boo-bulb{position:absolute;top:16px;width:14px;height:20px;border-radius:8px 8px 10px 10px;animation:boo-flicker 2.8s infinite}
.boo-bulb::before{content:"";position:absolute;left:50%;top:50%;width:22px;height:22px;transform:translate(-50%,-50%);background:currentColor;clip-path:polygon(50% 0,58% 42%,100% 50%,58% 58%,50% 100%,42% 58%,0 50%,42% 42%);opacity:.85}
.boo-bulb::after{content:"";position:absolute;left:4px;top:-7px;width:6px;height:7px;background:#FFD166;border-radius:2px}
.boo-flare{position:absolute;inset:-12px;border-radius:50%;opacity:.75}
.boo-charm{position:absolute;left:3px;top:24px;width:8px;height:8px;background:#FFD166;clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%)}
.boo-bulb.is-pink{background:#FF2A85;color:#FF2A85;box-shadow:0 0 16px #FF2A85}
.boo-bulb.is-pink .boo-flare{background:radial-gradient(circle,#FF2A85,transparent 70%)}
.boo-bulb.is-gold{background:#FFD166;color:#FFD166;box-shadow:0 0 16px #FFD166}
.boo-bulb.is-gold .boo-flare{background:radial-gradient(circle,#FFD166,transparent 70%)}
.boo-bulb.is-orange{background:#FF921C;color:#FF921C;box-shadow:0 0 16px #FF921C}
.boo-bulb.is-orange .boo-flare{background:radial-gradient(circle,#FF921C,transparent 70%)}
.boo-bulb.is-cyan{background:#00F5D4;color:#00F5D4;box-shadow:0 0 16px #00F5D4}
.boo-bulb.is-cyan .boo-flare{background:radial-gradient(circle,#00F5D4,transparent 70%)}
.boo-bulb:nth-child(2){left:2%;top:10px;animation-duration:1.9s}
.boo-bulb:nth-child(3){left:10%;top:24px;animation-duration:2.8s;animation-delay:.3s}
.boo-bulb:nth-child(4){left:18%;top:11px;animation-duration:2.2s;animation-delay:.15s}
.boo-bulb:nth-child(5){left:26%;top:25px;animation-duration:3.1s;animation-delay:.6s}
.boo-bulb:nth-child(6){left:34%;top:10px;animation-duration:2.0s;animation-delay:.2s}
.boo-bulb:nth-child(7){left:42%;top:24px;animation-duration:2.7s;animation-delay:.5s}
.boo-bulb:nth-child(8){left:50%;top:10px;animation-duration:1.8s;animation-delay:.25s}
.boo-bulb:nth-child(9){left:58%;top:25px;animation-duration:3.3s;animation-delay:.7s}
.boo-bulb:nth-child(10){left:66%;top:11px;animation-duration:2.3s;animation-delay:.2s}
.boo-bulb:nth-child(11){left:74%;top:23px;animation-duration:2.1s;animation-delay:.55s}
.boo-bulb:nth-child(12){left:82%;top:10px;animation-duration:2.9s;animation-delay:.35s}
.boo-bulb:nth-child(13){left:91%;top:22px;animation-duration:2.4s;animation-delay:.45s}

/* Top Navigation Bar */
.boo-top{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  padding:10px 14px;
  margin-bottom:20px;
  background:rgba(18,18,22,.82);
  backdrop-filter:blur(16px);
  border:1px solid rgba(255,255,255,.09);
  border-radius:999px;
}
.boo-top-right{display:flex;align-items:center;gap:10px}
.boo-home{
  border:1px solid rgba(255,255,255,.16);
  background:#121216;
  color:#FFFFFF;
  border-radius:999px;
  padding:8px 16px;
  font-size:14px;
  font-weight:750;
  cursor:pointer;
  text-decoration:none;
  min-height:42px;
  display:inline-flex;
  align-items:center;
  gap:6px;
  transition:all .18s ease;
}
.boo-home:hover{border-color:#F97316;background:#191920}
.boo-home.is-fill{background:#F97316;color:#0A0A0B;border-color:#F97316;font-weight:800}
.boo-home.is-fill:hover{background:#FF921C}

/* Hero Layout */
#boo-hero{
  background:linear-gradient(145deg,rgba(22,22,29,.95) 0%,rgba(14,14,19,.98) 100%);
  border:1px solid rgba(255,255,255,.1);
  border-radius:28px;
  padding:20px;
  box-shadow:0 24px 64px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.08);
  margin-bottom:24px;
}
.boo-hero-grid{
  display:grid;
  grid-template-columns:minmax(0,1fr);
  gap:24px;
  align-items:start;
}
.boo-hero-grid>*{min-width:0}
@media(max-width:560px){
  #boo-hero{padding:14px;border-radius:22px}
}
@media(min-width:920px){
  #boo-hero{padding:32px}
  .boo-hero-grid{grid-template-columns:minmax(0,1.05fr) minmax(0,0.95fr);gap:32px}
}

.boo-pill-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:12px}
.boo-sheet-pill{
  display:inline-flex;
  align-items:center;
  margin:0;
  background:rgba(249,115,22,.14);
  color:#FF921C;
  border:1px solid rgba(249,115,22,.4);
  border-radius:999px;
  padding:5px 12px;
  font-size:11px;
  font-weight:800;
  letter-spacing:.08em;
}
.boo-eyebrow{
  margin:0;
  display:inline-flex;
  align-items:center;
  gap:6px;
  background:rgba(0,245,212,.1);
  color:#00F5D4;
  border:1px solid rgba(0,245,212,.35);
  border-radius:999px;
  padding:5px 12px;
  font-size:11px;
  font-weight:800;
  letter-spacing:.08em;
  text-transform:uppercase;
}
.boo-page h1{
  margin:0 0 12px;
  font-size:clamp(30px,5vw,46px);
  font-weight:850;
  letter-spacing:-.035em;
  line-height:1.06;
  color:#FFFFFF;
}
.boo-lede{
  margin:0 0 14px;
  color:#D4D4D8;
  font-size:16px;
  line-height:1.55;
  max-width:62ch;
}
.boo-trust-strip{
  display:flex;
  flex-wrap:wrap;
  gap:8px 16px;
  padding:10px 14px;
  background:rgba(255,255,255,.03);
  border:1px solid rgba(255,255,255,.07);
  border-radius:14px;
  margin-bottom:18px;
}
.boo-note{
  margin:0;
  font-size:12.5px;
  color:#A1A1AA;
  line-height:1.4;
}

/* Quick Matcher ("Who Are You Bringing Tonight?") */
.boo-matcher-box{
  background:rgba(10,10,11,.65);
  border:1px solid rgba(255,255,255,.08);
  border-radius:20px;
  padding:16px;
  margin-top:14px;
}
.boo-who{
  margin:0 0 4px;
  font-size:12px;
  font-weight:800;
  color:#F97316;
  text-transform:uppercase;
  letter-spacing:.1em;
}
.boo-matcher-sub{
  margin:0 0 12px;
  color:#FFFFFF;
  font-size:16px;
  font-weight:750;
}
.boo-picks{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(165px,1fr));
  gap:8px;
}
.boo-picks button{
  border:1px solid rgba(255,255,255,.12);
  background:#121216;
  color:#FFFFFF;
  border-radius:14px;
  padding:10px 13px;
  font-size:13.5px;
  font-weight:750;
  cursor:pointer;
  min-height:46px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  text-align:left;
  transition:all .16s ease;
}
.boo-picks button:hover,.boo-picks button[aria-pressed="true"]{
  border-color:#F97316;
  background:rgba(249,115,22,.15);
  transform:translateY(-1px);
}
.boo-picks button::after{
  content:"→";
  color:#F97316;
  font-weight:800;
  margin-left:8px;
}

/* Shortlist-First Panel */
.boo-shortlist{
  background:linear-gradient(155deg,rgba(24,20,16,.96) 0%,rgba(14,14,19,.98) 100%);
  border:1.5px solid #F97316;
  border-radius:24px;
  padding:18px;
  margin-bottom:24px;
  box-shadow:0 18px 44px rgba(0,0,0,.55),0 0 24px rgba(249,115,22,.14);
}
.boo-shortlist-head{
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  margin-bottom:14px;
}
.boo-shortlist-title{
  margin:0;
  font-size:18px;
  font-weight:850;
  color:#FFFFFF;
}
.boo-shortlist-sub{
  margin:2px 0 0;
  font-size:13px;
  color:#FFD166;
  font-weight:700;
}
.boo-shortlist-clear{
  border:1px solid rgba(255,255,255,.2);
  background:#121216;
  color:#FFFFFF;
  border-radius:999px;
  padding:6px 14px;
  font-size:12.5px;
  font-weight:750;
  min-height:36px;
  cursor:pointer;
}
.boo-shortlist-clear:hover{border-color:#00F5D4;color:#00F5D4}
.boo-shortlist-grid{
  display:grid;
  grid-template-columns:1fr;
  gap:12px;
}
@media(min-width:860px){
  .boo-shortlist-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
}
.boo-shortlist-card{
  display:flex;
  flex-direction:column;
  justify-content:space-between;
  gap:10px;
  background:rgba(18,18,24,.95);
  border:1px solid rgba(255,255,255,.12);
  border-radius:18px;
  padding:14px;
}
.boo-shortlist-card h3{
  margin:4px 0;
  font-size:16px;
  font-weight:850;
  color:#FFFFFF;
  line-height:1.25;
}
.boo-shortlist-reason{
  margin:0;
  font-size:13px;
  color:#E4E4E7;
  line-height:1.42;
}
.boo-shortlist-meta{
  margin:6px 0 0;
  font-size:12px;
  color:#FFD166;
  font-weight:750;
}
.boo-shortlist-note{
  margin:2px 0 0;
  font-size:11.5px;
  color:#A1A1AA;
}
.boo-shortlist-actions{
  display:flex;
  align-items:center;
  gap:8px;
  margin-top:6px;
}
.boo-shortlist-actions .boo-buy{
  flex:1;
  min-height:42px;
  font-size:14px;
  padding:8px 12px;
}
.boo-shortlist-jump{
  border:1px solid rgba(0,245,212,.4);
  background:rgba(0,245,212,.08);
  color:#00F5D4;
  border-radius:12px;
  padding:8px 10px;
  font-size:12px;
  font-weight:800;
  min-height:42px;
  cursor:pointer;
}

/* Boo Interactive Concierge Stage */
.boo-concierge-card{
  background:radial-gradient(circle at 30% 20%,rgba(255,42,133,.12),transparent 55%),radial-gradient(circle at 80% 10%,rgba(0,245,212,.12),transparent 50%),#0E0E13;
  border:1.5px solid rgba(249,115,22,.45);
  border-radius:24px;
  padding:18px;
  min-width:0;
  box-shadow:0 16px 40px rgba(0,0,0,.5),0 0 28px rgba(249,115,22,.1);
}
@media(max-width:560px){
  .boo-concierge-card{padding:14px;border-radius:20px}
}
.boo-stage-top{
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  margin-bottom:10px;
}
.boo-badge{
  margin:0;
  display:inline-flex;
  align-items:center;
  gap:6px;
  background:rgba(249,115,22,.14);
  color:#F97316;
  border:1px solid rgba(249,115,22,.45);
  border-radius:999px;
  padding:4px 10px;
  font-size:11px;
  font-weight:800;
  letter-spacing:.06em;
}
.boo-ai-status{
  display:inline-flex;
  align-items:center;
  gap:6px;
  background:rgba(0,245,212,.12);
  color:#00F5D4;
  border:1px solid rgba(0,245,212,.35);
  border-radius:999px;
  padding:4px 10px;
  font-size:11px;
  font-weight:800;
  letter-spacing:.04em;
}
.boo-ai-dot{
  width:7px;
  height:7px;
  border-radius:50%;
  background:#00F5D4;
  box-shadow:0 0 8px #00F5D4;
}

.boo-stage{
  display:grid;
  grid-template-columns:165px minmax(0,1fr);
  gap:14px;
  align-items:center;
}
@media(max-width:560px){
  .boo-stage{grid-template-columns:118px minmax(0,1fr);gap:10px}
}
.boo-hero-sprite{
  position:relative;
  background:radial-gradient(circle,rgba(255,255,255,.06) 0%,transparent 70%);
  border-radius:20px;
  padding:4px;
  cursor:pointer;
}
.boo-costume-bar{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  margin:10px 0 12px;
}
.boo-costume-btn{
  border:1px solid rgba(255,255,255,.12);
  background:rgba(255,255,255,.04);
  color:#D4D4D8;
  border-radius:999px;
  padding:5px 10px;
  font-size:11.5px;
  font-weight:750;
  cursor:pointer;
  min-height:30px;
  transition:all .15s ease;
}
.boo-costume-btn.is-on,.boo-costume-btn:hover{
  background:rgba(0,245,212,.14);
  color:#00F5D4;
  border-color:#00F5D4;
}

.boo-copy{display:flex;flex-direction:column;gap:8px;min-width:0}
.boo-kicker{
  margin:0;
  color:#FFD166;
  font-size:11px;
  font-weight:850;
  letter-spacing:.1em;
  text-transform:uppercase;
}
.boo-bubble{
  margin:0;
  background:#121216;
  border:1.5px solid #F97316;
  border-radius:18px;
  padding:14px;
  color:#FFFFFF;
  font-size:15px;
  font-weight:650;
  line-height:1.45;
  box-shadow:0 8px 24px rgba(0,0,0,.35);
}

/* Interactive Action Controls */
.boo-actions{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  margin-top:12px;
}
.boo-actions button{
  border:1px solid rgba(255,255,255,.16);
  background:#16161D;
  color:#FFFFFF;
  border-radius:999px;
  padding:8px 13px;
  font-size:13px;
  font-weight:750;
  cursor:pointer;
  min-height:40px;
  display:inline-flex;
  align-items:center;
  gap:6px;
  transition:all .15s ease;
}
.boo-actions button:hover{border-color:#F97316;background:#1E1E28}
.boo-actions button.is-fill{
  background:#F97316;
  color:#0A0A0B;
  border-color:#F97316;
  font-weight:800;
}
.boo-actions button.is-fill:hover{background:#FF921C}

/* Reel Scrubber */
.boo-reel-bar{
  display:flex;
  align-items:center;
  gap:10px;
  margin-top:12px;
  padding-top:12px;
  border-top:1px solid rgba(255,255,255,.08);
}
.boo-reel{display:flex;gap:5px;flex:1}
.boo-reel button{
  flex:1;
  height:7px;
  border:0;
  border-radius:99px;
  background:rgba(255,255,255,.18);
  padding:0;
  min-height:7px;
  cursor:pointer;
  transition:all .2s ease;
}
.boo-reel button.is-on,.boo-reel button:hover{
  background:#00F5D4;
  box-shadow:0 0 10px #00F5D4;
}

/* Claude AI Chat Box */
.boo-chat{
  margin-top:14px;
  background:rgba(18,18,22,.92);
  border:1px solid rgba(255,255,255,.12);
  border-radius:18px;
  padding:14px;
}
.boo-chat-head{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  margin-bottom:8px;
}
.boo-chips{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  margin-bottom:10px;
}
.boo-chips button{
  border:1px solid rgba(249,115,22,.4);
  background:rgba(249,115,22,.08);
  color:#FFFFFF;
  border-radius:999px;
  padding:6px 12px;
  font-size:12.5px;
  font-weight:700;
  cursor:pointer;
  min-height:36px;
  transition:all .15s ease;
}
.boo-chips button:hover{
  background:#F97316;
  color:#0A0A0B;
}
.boo-chat form{display:flex;gap:8px;margin-top:8px}
.boo-chat input{
  flex:1;
  min-width:0;
  min-height:44px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.2);
  background:#0A0A0B;
  color:#FFFFFF;
  padding:8px 12px;
  font-size:15px;
}
.boo-chat input:focus{border-color:#F97316;outline:none}
.boo-send{
  border:1px solid #F97316;
  background:#F97316;
  color:#0A0A0B;
  border-radius:12px;
  padding:8px 16px;
  font-size:14px;
  font-weight:800;
  cursor:pointer;
  min-height:44px;
  white-space:nowrap;
}
.boo-send:hover{background:#FF921C}
.boo-reply{
  margin:8px 0 10px;
  padding:10px 12px;
  background:rgba(0,245,212,.07);
  border-left:3px solid #00F5D4;
  border-radius:8px;
  color:#FFFFFF;
  font-size:14.5px;
  line-height:1.45;
}
.boo-rec{
  display:grid;
  grid-template-columns:1fr;
  gap:8px;
  margin:10px 0;
}
.boo-rec-item{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  background:rgba(255,255,255,.04);
  border:1px solid rgba(249,115,22,.4);
  border-radius:14px;
  padding:10px 12px;
}
.boo-rec-info{min-width:0;flex:1}
.boo-rec-name{
  margin:0;
  font-size:14px;
  font-weight:800;
  color:#FFFFFF;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.boo-rec-meta{
  margin:2px 0 0;
  font-size:12px;
  color:#FFD166;
  font-weight:700;
}
.boo-rec-item .boo-buy{
  flex:none;
  min-height:38px;
  padding:6px 14px;
  font-size:13px;
  border-radius:10px;
}

/* Vault Section & Filters */
#boo-vault{margin-top:8px}
.boo-vault-header{
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  margin-bottom:18px;
}
.boo-vault-title{
  margin:0;
  font-size:22px;
  font-weight:850;
  letter-spacing:-.02em;
}
.boo-filters{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
}
.boo-filters button{
  border:1px solid rgba(255,255,255,.14);
  background:#121216;
  color:#D4D4D8;
  border-radius:999px;
  padding:9px 16px;
  font-size:14px;
  font-weight:750;
  cursor:pointer;
  min-height:42px;
  transition:all .16s ease;
}
.boo-filters button:hover{border-color:#F97316;color:#FFFFFF}
.boo-filters button[aria-pressed="true"]{
  background:#F97316;
  color:#0A0A0B;
  border-color:#F97316;
  font-weight:850;
  box-shadow:0 4px 16px rgba(249,115,22,.35);
}

/* Haunt Ticket Cards + Festival Animatronics */
.boo-vault-grid{
  display:grid;
  grid-template-columns:1fr;
  gap:18px;
  align-items:stretch;
}
@media(min-width:800px){
  .boo-vault-grid{grid-template-columns:1fr 1fr;gap:20px}
}
.boo-card{
  position:relative;
  overflow:hidden;
  display:flex;
  flex-direction:column;
  background:
    radial-gradient(circle at 92% 10%,rgba(249,115,22,.14),transparent 42%),
    radial-gradient(circle at 8% 92%,rgba(0,245,212,.08),transparent 42%),
    linear-gradient(165deg,#171720 0%,#101015 100%);
  border:1.5px solid rgba(255,255,255,.12);
  border-radius:24px;
  padding:20px;
  margin:0;
  scroll-margin:24px 0 220px;
  box-shadow:0 12px 32px rgba(0,0,0,.45);
  transition:border-color .2s ease,transform .2s ease,box-shadow .2s ease;
}
.boo-card::before{
  content:"";
  position:absolute;
  inset:0;
  border-radius:24px;
  padding:1.5px;
  background:linear-gradient(135deg,rgba(249,115,22,.45),rgba(255,42,133,.2),rgba(0,245,212,.35));
  -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);
  -webkit-mask-composite:xor;
  mask-composite:exclude;
  pointer-events:none;
  opacity:.55;
}
.boo-card:hover{
  border-color:rgba(249,115,22,.6);
  transform:translateY(-2px);
}
.boo-card:hover::before,.boo-card.is-active::before{opacity:1}
.boo-card.is-active{
  border-color:#FFD166;
  box-shadow:0 14px 36px rgba(0,0,0,.55),0 0 0 1px rgba(255,209,102,.35);
}
.boo-card.is-hot{
  border-color:#F97316;
  box-shadow:0 0 0 2px #F97316,0 16px 40px rgba(249,115,22,.28);
}

/* Card Festival Animatronic Stage */
.boo-card-top{
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  justify-content:space-between;
  gap:8px;
  margin-bottom:10px;
}
.boo-card-badges{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.boo-stop,.boo-cat,.boo-scare{
  display:inline-flex;
  align-items:center;
  min-height:26px;
  border-radius:999px;
  padding:3px 10px;
  font-size:11px;
  font-weight:800;
  letter-spacing:.05em;
}
.boo-stop{background:#FF2A85;color:#FFFFFF}
.boo-cat{background:rgba(0,245,212,.1);color:#00F5D4;border:1px solid rgba(0,245,212,.35)}
.boo-scare{background:rgba(255,209,102,.12);color:#FFD166;border:1px solid rgba(255,209,102,.3)}

.boo-card-head-row{
  display:grid;
  grid-template-columns:minmax(0,1fr) 74px;
  gap:12px;
  align-items:center;
  margin-bottom:12px;
}
.boo-anim-box{
  width:74px;
  height:74px;
  border-radius:18px;
  background:radial-gradient(circle at 50% 50%,rgba(249,115,22,.22),rgba(10,10,11,.85) 72%);
  border:1px solid rgba(249,115,22,.35);
  display:flex;
  align-items:center;
  justify-content:center;
  pointer-events:none;
  box-shadow:inset 0 0 14px rgba(255,42,133,.15);
}
.boo-anim-svg{width:64px;height:64px;overflow:visible;display:block}
.boo-anim-swing{transform-box:fill-box;transform-origin:50% 8%;animation:boo-pendulum 2.4s ease-in-out infinite}
.boo-anim-gear{transform-box:fill-box;transform-origin:center;animation:boo-spin 6s linear infinite}
.boo-anim-chomp{transform-box:fill-box;transform-origin:center;animation:boo-chomp 1.4s ease-in-out infinite}
.boo-anim-float{transform-box:fill-box;transform-origin:center;animation:boo-mini-bob 2s ease-in-out infinite}
.boo-anim-clap{transform-box:fill-box;transform-origin:15% 85%;animation:boo-clap 1.8s ease-in-out infinite}
.boo-anim-glow{animation:boo-eye-pulse 1.6s ease-in-out infinite}

.boo-card h2{
  margin:0;
  font-size:21px;
  font-weight:850;
  line-height:1.22;
  letter-spacing:-.02em;
  color:#FFFFFF;
}
.boo-where-row{
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  gap:8px;
  margin:6px 0 0;
}
.boo-where{
  margin:0;
  color:#FFD166;
  font-size:13.5px;
  font-weight:750;
}
.boo-vibe{
  margin:0;
  color:#A1A1AA;
  font-size:13px;
  font-weight:600;
}

/* Price, Admission & Hours Info Grid on Card */
.boo-facts{
  display:grid;
  grid-template-columns:1fr 1.15fr;
  gap:10px;
  background:rgba(10,10,11,.78);
  border:1px solid rgba(255,255,255,.09);
  border-radius:16px;
  padding:12px 14px;
  margin-bottom:12px;
}
@media(max-width:480px){
  .boo-facts{grid-template-columns:1fr;gap:8px}
}
.boo-fact-label{
  display:block;
  font-size:10.5px;
  font-weight:800;
  text-transform:uppercase;
  letter-spacing:.08em;
  color:#A1A1AA;
  margin-bottom:3px;
}
.boo-price{
  margin:0;
  color:#F97316;
  font-size:20px;
  font-weight:850;
  line-height:1.2;
}
.boo-when{
  margin:0;
  color:#FFFFFF;
  font-size:13.5px;
  font-weight:650;
  line-height:1.38;
}
.boo-fact-sub{
  margin:4px 0 0;
  color:#A1A1AA;
  font-size:11.5px;
  line-height:1.35;
}

/* Boo Verdict Box inside Card */
.boo-verdict-box{
  background:rgba(249,115,22,.07);
  border:1px solid rgba(249,115,22,.28);
  border-radius:14px;
  padding:11px 13px;
  margin-bottom:14px;
}
.boo-tip{
  margin:0;
  color:#F4F4F5;
  font-size:13.5px;
  line-height:1.45;
}
.boo-tip span{
  display:inline-block;
  color:#F97316;
  font-size:11px;
  font-weight:850;
  letter-spacing:.08em;
  text-transform:uppercase;
  margin-right:6px;
}
.boo-nudge{
  margin:6px 0 0;
  color:#FFD166;
  font-size:12.5px;
  font-weight:700;
  line-height:1.35;
}
.boo-age-note{
  margin:4px 0 0;
  color:#A1A1AA;
  font-size:11.5px;
}

/* Carnival Ticket Marquee CTA Frame */
.boo-buyrow{
  position:relative;
  display:flex;
  flex-direction:column;
  gap:6px;
  margin-top:auto;
  padding:10px;
  border-radius:18px;
  background:
    radial-gradient(circle at 0% 50%,rgba(10,10,11,.95) 6px,transparent 7px),
    radial-gradient(circle at 100% 50%,rgba(10,10,11,.95) 6px,transparent 7px),
    linear-gradient(90deg,rgba(249,115,22,.16),rgba(255,42,133,.14),rgba(0,245,212,.14));
  border:1px dashed rgba(255,209,102,.45);
}
.boo-buy-marquee{
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:0 4px;
  font-size:10.5px;
  font-weight:800;
  letter-spacing:.08em;
  text-transform:uppercase;
  color:#FFD166;
}
.boo-marquee-dots{
  display:inline-flex;
  gap:5px;
  align-items:center;
}
.boo-marquee-dots i{
  width:6px;
  height:6px;
  border-radius:50%;
  background:#FF921C;
  box-shadow:0 0 6px #FF921C;
  animation:boo-flicker 1.8s infinite;
}
.boo-marquee-dots i:nth-child(2){background:#00F5D4;box-shadow:0 0 6px #00F5D4;animation-delay:.3s}
.boo-marquee-dots i:nth-child(3){background:#FF2A85;box-shadow:0 0 6px #FF2A85;animation-delay:.6s}

.boo-buy{
  display:flex;
  align-items:center;
  justify-content:center;
  min-height:48px;
  border-radius:14px;
  background:linear-gradient(135deg,#F97316 0%,#FF921C 100%);
  color:#0A0A0B;
  font-size:16px;
  font-weight:850;
  text-decoration:none;
  text-align:center;
  padding:10px 16px;
  box-shadow:0 6px 20px rgba(249,115,22,.3);
  transition:transform .15s ease,box-shadow .15s ease;
}
.boo-buy:hover{
  transform:translateY(-1px);
  box-shadow:0 10px 26px rgba(249,115,22,.45);
}
.boo-card-foot{
  display:flex;
  align-items:center;
  justify-content:space-between;
  flex-wrap:wrap;
  gap:8px;
  margin-top:10px;
  padding-top:10px;
  border-top:1px solid rgba(255,255,255,.07);
}
.boo-via{
  margin:0;
  color:#A1A1AA;
  font-size:12px;
  line-height:1.35;
}
.boo-links{
  display:flex;
  align-items:center;
  gap:10px;
}
.boo-links a{
  display:inline-flex;
  align-items:center;
  min-height:36px;
  color:#D4D4D8;
  font-size:13px;
  font-weight:700;
  text-decoration:underline;
  text-underline-offset:3px;
}
.boo-links a:hover{color:#FFFFFF}
.boo-links button{
  border:1px solid rgba(0,245,212,.45);
  background:rgba(0,245,212,.1);
  color:#00F5D4;
  border-radius:999px;
  padding:6px 12px;
  font-size:12.5px;
  font-weight:800;
  cursor:pointer;
  min-height:36px;
  transition:all .15s ease;
}
.boo-links button:hover{
  background:#00F5D4;
  color:#0A0A0B;
}
.boo-bottom-home{margin-top:24px}

/* Floating Boo Companion Dock */
.boo-fly{
  position:fixed;
  z-index:40;
  left:0;
  top:0;
  width:min(300px,calc(100vw - 20px));
  pointer-events:none;
  transform:translate3d(14px,calc(100vh - 210px),0);
  transition:opacity .28s ease;
}
.boo-fly.is-docked{
  opacity:0;
  pointer-events:none !important;
}
.boo-fly.is-docked *{
  pointer-events:none !important;
}
.boo-fly.is-chat{width:min(350px,calc(100vw - 20px))}
.boo-fly>*{pointer-events:auto}
.boo-fly-card{
  background:rgba(14,14,19,.94);
  backdrop-filter:blur(16px);
  border:1.5px solid rgba(249,115,22,.55);
  border-radius:22px;
  padding:10px 12px;
  box-shadow:0 16px 40px rgba(0,0,0,.65);
}
.boo-fly.is-flying .boo-drag{
  filter:drop-shadow(-12px 6px 0 rgba(249,115,22,.5)) drop-shadow(-24px 12px 0 rgba(0,245,212,.25));
}
.boo-fly-col{display:flex;align-items:center;gap:10px}
.boo-drag{
  width:72px;
  flex:none;
  padding:0;
  border:0;
  background:transparent;
  cursor:grab;
  touch-action:none;
}
.boo-drag:active{cursor:grabbing}
.boo-fly-copy{display:flex;flex-direction:column;gap:5px;min-width:0;flex:1}
.boo-float-bubble{
  border:1px solid rgba(255,255,255,.14);
  background:#16161E;
  color:#FFFFFF;
  border-radius:14px;
  padding:7px 10px;
  text-align:left;
  font-size:12px;
  font-weight:650;
  line-height:1.34;
  cursor:pointer;
  display:-webkit-box;
  -webkit-line-clamp:3;
  -webkit-box-orient:vertical;
  overflow:hidden;
}
.boo-float-bubble:hover{border-color:#F97316}
.boo-fly-btns{display:flex;align-items:center;gap:6px}
.boo-hide,.boo-open{
  border:1px solid rgba(255,255,255,.18);
  background:#121216;
  color:#FFFFFF;
  border-radius:999px;
  min-height:30px;
  padding:4px 10px;
  font-size:11px;
  font-weight:750;
  cursor:pointer;
}
.boo-open{background:#F97316;color:#0A0A0B;border-color:#F97316;font-weight:800}
@media(max-width:560px){
  .boo-fly-card{padding:8px 10px;border-radius:18px}
  .boo-drag{width:54px}
  .boo-float-bubble{font-size:11.5px;padding:6px 8px;-webkit-line-clamp:2}
}
.boo-show{
  position:fixed;
  left:14px;
  bottom:calc(14px + env(safe-area-inset-bottom));
  z-index:40;
  border:1.5px solid #F97316;
  background:#121216;
  color:#FFFFFF;
  border-radius:999px;
  padding:10px 16px;
  font-size:14px;
  font-weight:800;
  cursor:pointer;
  box-shadow:0 10px 28px rgba(0,0,0,.55);
}
.boo-fly-chat{margin-top:8px;max-height:44vh;overflow:auto}

/* Boo Vector Sprite & Festival Animatronic Keyframes */
.boo-sprite{width:100%;height:auto;display:block;overflow:visible;animation:boo-bob 2.2s ease-in-out infinite}
.boo-hem{transform-box:fill-box;transform-origin:center}
.boo-flag{transform-box:fill-box;transform-origin:20% 90%;animation:boo-wave 1.8s ease-in-out infinite}
.boo-bubble,.boo-float-bubble{animation:boo-pop .32s cubic-bezier(.2,1.5,.3,1)}
.boo-trail{position:absolute;left:8px;top:24px;width:90px;height:70px;pointer-events:none}
.boo-trail i{position:absolute;width:12px;height:12px;background:#00F5D4;clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);animation:boo-spark .6s linear infinite}
.boo-trail i:nth-child(2){left:22px;top:16px;background:#FF2A85;animation-delay:.1s}
.boo-trail i:nth-child(3){left:40px;top:4px;background:#FFD166;animation-delay:.2s}
.boo-trail i:nth-child(4){left:58px;top:22px;background:#00F5D4;animation-delay:.3s}
.boo-squint{opacity:0}
.boo-sprite[data-face="wink"] .boo-squint{animation:boo-blink-on 2.6s linear infinite}
.boo-sprite[data-face="wink"] .boo-awake{animation:boo-blink-off 2.6s linear infinite}
@keyframes boo-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
@keyframes boo-mini-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes boo-wave{0%,100%{transform:rotate(-5deg)}50%{transform:rotate(8deg)}}
@keyframes boo-pop{0%{transform:scale(.96)}50%{transform:scale(1.03)}100%{transform:scale(1)}}
@keyframes boo-flicker{0%,18%,22%,53%,57%,100%{opacity:1}20%,55%{opacity:.4}70%{opacity:.85}}
@keyframes boo-spark{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(-18px,14px) scale(.4);opacity:0}}
@keyframes boo-blink-off{0%,93%{opacity:1}94%,100%{opacity:0}}
@keyframes boo-blink-on{0%,93%{opacity:0}94%,100%{opacity:1}}
@keyframes boo-pendulum{0%,100%{transform:rotate(-9deg)}50%{transform:rotate(9deg)}}
@keyframes boo-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
@keyframes boo-chomp{0%,100%{transform:scaleY(1)}50%{transform:scaleY(1.14) translateY(-2px)}}
@keyframes boo-clap{0%,100%{transform:rotate(0deg)}45%{transform:rotate(-18deg)}55%{transform:rotate(0deg)}}
@keyframes boo-eye-pulse{0%,100%{opacity:.55;transform:scale(.95)}50%{opacity:1;transform:scale(1.08)}}
@media(prefers-reduced-motion:reduce){
  .boo-sprite,.boo-flag,.boo-bubble,.boo-float-bubble,.boo-bulb,.boo-trail i,.boo-squint,.boo-awake,
  .boo-anim-swing,.boo-anim-gear,.boo-anim-chomp,.boo-anim-float,.boo-anim-clap,.boo-anim-glow,.boo-marquee-dots i{animation:none !important}
}
@media(max-width:520px){
  .boo-page{padding-bottom:220px}
  .boo-fly{width:min(270px,calc(100vw - 16px))}
  .boo-fly.is-chat{width:min(330px,calc(100vw - 16px))}
  .boo-drag{width:74px}
  .boo-float-bubble{font-size:12px;max-height:68px;overflow:hidden}
}
`;

function Star({ cx, cy, size = 11, fill }) {
  const x = Number(cx);
  const y = Number(cy);
  const s = Number(size);
  const inner = Math.round(s * 0.28 * 10) / 10;
  const d = [
    "M", x, y - s,
    "L", x + inner, y - inner,
    "L", x + s, y,
    "L", x + inner, y + inner,
    "L", x, y + s,
    "L", x - inner, y + inner,
    "L", x - s, y,
    "L", x - inner, y - inner,
    "Z",
  ].join(" ");
  return <path d={d} fill={fill || "#FFD166"} />;
}

function HauntAnimatronic({ type = "lantern" }) {
  if (type === "coaster") {
    return (
      <div className="boo-anim-box" aria-hidden="true">
        <svg className="boo-anim-svg" viewBox="0 0 64 64" aria-hidden="true">
          {/* Spinning Coaster Gear */}
          <g className="boo-anim-gear">
            <circle cx="46" cy="18" r="9" fill="none" stroke="#00F5D4" strokeWidth="2.5" strokeDasharray="4 3" />
            <circle cx="46" cy="18" r="3.5" fill="#FFD166" />
          </g>
          {/* Coaster Track Arc */}
          <path d="M 6 52 Q 32 24 58 52" fill="none" stroke="#FF2A85" strokeWidth="3" strokeLinecap="round" />
          {/* Chomping Jack O Lantern Coaster Car */}
          <g className="boo-anim-chomp">
            <ellipse cx="30" cy="34" rx="16" ry="13" fill="#F97316" stroke="#23143B" strokeWidth="3" />
            <polygon points="22,29 26,29 24,24" fill="#FFD166" className="boo-anim-glow" />
            <polygon points="34,29 38,29 36,24" fill="#FFD166" className="boo-anim-glow" />
            <path d="M 20 38 L 24 41 L 28 38 L 32 41 L 36 38 L 40 41" fill="none" stroke="#23143B" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        </svg>
      </div>
    );
  }
  if (type === "cinema") {
    return (
      <div className="boo-anim-box" aria-hidden="true">
        <svg className="boo-anim-svg" viewBox="0 0 64 64" aria-hidden="true">
          {/* Floating Neon Bat */}
          <g className="boo-anim-float">
            <path d="M 16 18 Q 24 10 32 18 Q 40 10 48 18 Q 38 22 32 26 Q 26 22 16 18 Z" fill="#FF2A85" />
            <circle cx="30" cy="19" r="1.5" fill="#FFD166" />
            <circle cx="34" cy="19" r="1.5" fill="#FFD166" />
          </g>
          {/* Director Clapperboard Base */}
          <rect x="14" y="34" width="36" height="22" rx="4" fill="#16161E" stroke="#FFD166" strokeWidth="2.5" />
          <line x1="20" y1="42" x2="44" y2="42" stroke="#00F5D4" strokeWidth="2" />
          <line x1="20" y1="48" x2="36" y2="48" stroke="#F97316" strokeWidth="2" />
          {/* Animated Clapper Top Bar */}
          <g className="boo-anim-clap">
            <rect x="14" y="27" width="36" height="6" rx="2" fill="#F97316" stroke="#23143B" strokeWidth="2" />
          </g>
        </svg>
      </div>
    );
  }
  if (type === "cauldron") {
    return (
      <div className="boo-anim-box" aria-hidden="true">
        <svg className="boo-anim-svg" viewBox="0 0 64 64" aria-hidden="true">
          {/* Rising Candy Bubbles & Stars */}
          <g className="boo-anim-float">
            <circle cx="24" cy="18" r="3.5" fill="#00F5D4" />
            <circle cx="38" cy="14" r="4" fill="#FF2A85" />
            <Star cx="31" cy="22" size="5" fill="#FFD166" />
          </g>
          {/* Bubbling Rim */}
          <ellipse cx="32" cy="31" rx="16" ry="5" fill="#00F5D4" stroke="#23143B" strokeWidth="2.5" />
          {/* Cauldron Body */}
          <path d="M 15 32 C 13 50 22 56 32 56 C 42 56 51 50 49 32 Z" fill="#1E1E28" stroke="#F97316" strokeWidth="2.8" />
          <path d="M 22 42 Q 32 48 42 42" fill="none" stroke="#FFD166" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  if (type === "woods") {
    return (
      <div className="boo-anim-box" aria-hidden="true">
        <svg className="boo-anim-svg" viewBox="0 0 64 64" aria-hidden="true">
          {/* Full Harvest Moon */}
          <circle cx="44" cy="18" r="10" fill="#FFD166" opacity="0.85" />
          {/* Swinging Haunted Trail Sign / Tombstone */}
          <g className="boo-anim-chomp">
            <path d="M 16 54 V 30 C 16 20 38 20 38 30 V 54 Z" fill="#1A1A22" stroke="#00F5D4" strokeWidth="2.5" />
            <circle cx="23" cy="34" r="2.6" fill="#FF2A85" className="boo-anim-glow" />
            <circle cx="31" cy="34" r="2.6" fill="#FF2A85" className="boo-anim-glow" />
            <path d="M 21 43 H 33" stroke="#FFD166" strokeWidth="2" strokeLinecap="round" />
          </g>
          {/* Gnarled Woods Branch */}
          <path d="M 8 54 L 56 54" stroke="#F97316" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  if (type === "nautical") {
    return (
      <div className="boo-anim-box" aria-hidden="true">
        <svg className="boo-anim-svg" viewBox="0 0 64 64" aria-hidden="true">
          {/* Spinning Ghost Ship Wheel / Helm */}
          <g className="boo-anim-gear">
            <circle cx="32" cy="30" r="14" fill="none" stroke="#FFD166" strokeWidth="3" />
            <circle cx="32" cy="30" r="4" fill="#FF2A85" />
            <line x1="32" y1="11" x2="32" y2="49" stroke="#FFD166" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="13" y1="30" x2="51" y2="30" stroke="#FFD166" strokeWidth="2.5" strokeLinecap="round" />
          </g>
          {/* Glowing Sea Waves */}
          <path d="M 10 51 Q 21 45 32 51 T 54 51" fill="none" stroke="#00F5D4" strokeWidth="3" strokeLinecap="round" className="boo-anim-float" />
        </svg>
      </div>
    );
  }
  // Default: Swinging Festival Jack O Lantern
  return (
    <div className="boo-anim-box" aria-hidden="true">
      <svg className="boo-anim-svg" viewBox="0 0 64 64" aria-hidden="true">
        <g className="boo-anim-swing">
          <line x1="32" y1="4" x2="32" y2="17" stroke="#FFD166" strokeWidth="2.5" />
          <rect x="27" y="15" width="10" height="5" rx="2" fill="#00F5D4" />
          <ellipse cx="32" cy="35" rx="16" ry="14" fill="#F97316" stroke="#23143B" strokeWidth="2.8" />
          <polygon points="24,31 28,31 26,26" fill="#FFD166" className="boo-anim-glow" />
          <polygon points="36,31 40,31 38,26" fill="#FFD166" className="boo-anim-glow" />
          <path d="M 23 40 Q 32 46 41 40" fill="none" stroke="#FFD166" strokeWidth="2.8" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
}

function BooGhostSvg({ label, face, costume = "hype" }) {
  const raw = useId().replace(/:/g, "");
  const sheet = "boo-sheet-" + raw;
  const glow = "boo-glow-" + raw;
  const mode = face || "wink";
  const shadesDown = mode === "shades" || costume === "pirate";
  const stickerHref = STICKER_MAP[costume] || STICKER_MAP.hype;

  return (
    <svg
      className="boo-sprite"
      data-face={mode}
      data-costume={costume}
      viewBox="0 0 260 260"
      role={label ? "img" : "presentation"}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <linearGradient id={sheet} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="60%" stopColor="#F5F0FF" />
          <stop offset="100%" stopColor="#D5C2FF" />
        </linearGradient>
        <radialGradient id={glow} cx="50%" cy="52%" r="48%">
          <stop offset="0%" stopColor="#FF2A85" stopOpacity="0.28" />
          <stop offset="65%" stopColor="#00F5D4" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Soft Mascot Aura */}
      <circle cx="128" cy="136" r="114" fill={"url(#" + glow + ")"} />

      {/* Vector Fallback Geometry (Preserved for SVG DOM Integrity) */}
      <g opacity="0" aria-hidden="true">
        <path
          d="M 60 144 C 38 134 30 112 42 104 C 50 98 58 110 62 126 Z"
          fill={"url(#" + sheet + ")"}
          stroke="#23143B"
          strokeWidth="7.5"
          strokeLinejoin="round"
        />
        <path
          d="M 194 144 C 216 136 232 134 234 143 C 236 152 218 160 194 158 Z"
          fill={"url(#" + sheet + ")"}
          stroke="#23143B"
          strokeWidth="7.5"
          strokeLinejoin="round"
        />
        <g className="boo-hem">
          <path
            d="M 128 38 C 178 38 196 74 198 124 L 200 192 C 200 208 184 214 174 202 C 164 190 154 190 144 204 C 134 218 120 218 110 204 C 100 190 90 190 80 202 C 70 214 56 208 56 192 L 58 124 C 60 74 78 38 128 38 Z"
            fill={"url(#" + sheet + ")"}
            stroke="#23143B"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <g className="boo-awake">
          <Star cx="156" cy="119" size="10.5" fill="#FFD166" />
        </g>
        <g className="boo-squint">
          <path d="M 88 126 Q 102 109 116 126" fill="none" stroke="#23143B" strokeWidth="6.8" strokeLinecap="round" />
        </g>
        <g transform={shadesDown ? "translate(0 38) rotate(-5 128 82)" : "rotate(-6 128 76)"}>
          <rect x="82" y="61" width="42" height="29" rx="8.5" fill="#160F24" stroke="#FF2A85" strokeWidth="4.2" />
          <rect x="134" y="61" width="42" height="29" rx="8.5" fill="#160F24" stroke="#00F5D4" strokeWidth="4.2" />
        </g>
        <g className="boo-flag">
          <text
            x="42"
            y="77"
            fill="#FFFFFF"
            fontSize="10.5"
            fontWeight="900"
            fontFamily="var(--wf-sans), sans-serif"
          >
            TOUR
          </text>
        </g>
        <g transform="translate(192, 96)">
          <rect x="0" y="0" width="62" height="26" rx="13" fill="#FF2A85" stroke="#FFFFFF" strokeWidth="3" />
          <text
            x="11"
            y="17"
            fill="#FFFFFF"
            fontSize="11.5"
            fontWeight="900"
            fontFamily="var(--wf-sans), sans-serif"
          >
            GO →
          </text>
        </g>
      </g>

      {/* Official Studio Mascot Bible Sticker Artwork (512x512 Transparent PNG) */}
      <image
        href={stickerHref}
        x="2"
        y="2"
        width="256"
        height="256"
        preserveAspectRatio="xMidYMid meet"
      />
    </svg>
  );
}

function cleanReply(text) {
  return String(text || "").replace(/[-\u2013\u2014]/g, " ").replace(/\s{2,}/g, " ").trim();
}

export default function BoHalloweenHaunt({ model, share = null }) {
  const { chrome, lines, filters, haunts, picks, prompts } = model;
  const [filter, setFilter] = useState("all");
  const [selectedPickId, setSelectedPickId] = useState(null);
  const [bubble, setBubble] = useState(lines[0]);
  const [gagIndex, setGagIndex] = useState(0);
  const [activeId, setActiveId] = useState("howlOrlando");
  const [hotId, setHotId] = useState(null);
  const [spinNonce, setSpinNonce] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [quipAt, setQuipAt] = useState({});
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatReply, setChatReply] = useState("");
  const [chatIds, setChatIds] = useState(["howlOrlando", "howlTampa"]);
  const [cardPitches, setCardPitches] = useState({});
  const [flying, setFlying] = useState(false);
  const [emote, setEmote] = useState("wink");
  const [costume, setCostume] = useState("hype");
  const [reelOn, setReelOn] = useState(false);
  const [reelIndex, setReelIndex] = useState(0);
  const [kicker, setKicker] = useState(KICKERS[0].pill);
  const [aiSource, setAiSource] = useState("catalog");
  const [heroVisible, setHeroVisible] = useState(true);
  const [pop, setPop] = useState(0);

  const reelRows = REEL_IDS.map((id) => haunts.find((row) => row.id === id)).filter(Boolean);
  const holdUntil = useRef(0);
  const emoteLock = useRef(0);
  const lastSeen = useRef(null);
  const flyRef = useRef(null);
  const sideRef = useRef("left");
  const activeRef = useRef(activeId);
  const dragHold = useRef(false);
  const poseRef = useRef(null);
  const reqSeqRef = useRef(0);
  const abortRef = useRef(null);
  const inFlightKeyRef = useRef("");
  const clientCacheRef = useRef(new Map());
  const inspectedSetRef = useRef(new Set());

  useEffect(() => { activeRef.current = activeId; }, [activeId]);

  const cancelPendingRequest = () => {
    reqSeqRef.current += 1;
    inFlightKeyRef.current = "";
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch { /* ignore */ }
      abortRef.current = null;
    }
    setPending(false);
  };

  // Reel-to-recommendation URL continuity (?haunt=howlTampa, ?pick=kids, ?filter=family)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search || "");
      const hauntParam = params.get("haunt");
      const pickParam = params.get("pick");
      const filterParam = params.get("filter");
      if (pickParam) {
        const matchedPick = picks.find((p) => p.id === pickParam);
        if (matchedPick) {
          setSelectedPickId(matchedPick.id);
          setActiveId(matchedPick.hauntId);
          setCostume(costumeFor(matchedPick.hauntId));
          setEmote(poseFor(matchedPick.hauntId));
          setBubble(matchedPick.pitch);
          return;
        }
      }
      if (hauntParam) {
        const matchedHaunt = haunts.find((h) => h.id === hauntParam || h.eventId === hauntParam);
        if (matchedHaunt) {
          emoteLock.current = Date.now() + 4000;
          holdUntil.current = Date.now() + 4000;
          lastSeen.current = matchedHaunt.id;
          setActiveId(matchedHaunt.id);
          setHotId(matchedHaunt.id);
          setCostume(costumeFor(matchedHaunt.id));
          setEmote(poseFor(matchedHaunt.id));
          setBubble(matchedHaunt.tip);
          return;
        }
      }
      if (filterParam && filters.some((f) => f.id === filterParam)) {
        setFilter(filterParam);
      }
    } catch { /* ignore */ }
  }, [filters, haunts, picks]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const heroNode = document.getElementById("boo-hero");
    if (!heroNode) return undefined;
    const io = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (entry) setHeroVisible(entry.isIntersecting && entry.intersectionRatio > 0.25);
    }, { threshold: [0, 0.25, 0.6] });
    io.observe(heroNode);
    return () => io.disconnect();
  }, []);

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
    setCostume(costumeFor(row.id));
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
  const selectedPick = picks.find((p) => p.id === selectedPickId) || null;
  const shortlistHaunts = selectedPick
    ? (selectedPick.shortlistIds || [selectedPick.hauntId]).map((id) => haunts.find((h) => h.id === id)).filter(Boolean)
    : [];

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const nodes = document.querySelectorAll("[data-haunt-id]");
    const io = new IntersectionObserver((entries) => {
      if (Date.now() < emoteLock.current) return;
      const best = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!best) return;
      const id = best.target.getAttribute("data-haunt-id");
      if (!id || lastSeen.current === id) return;
      lastSeen.current = id;
      setActiveId(id);
      setEmote(poseFor(id));
      setCostume(costumeFor(id));
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
    const pose = { x: 14, y: Math.max(80, window.innerHeight - 210), vx: 0, vy: 0, targetX: 14, targetY: Math.max(80, window.innerHeight - 210) };
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
      const width = chat ? Math.min(340, w - 20) : (narrow ? 260 : Math.min(300, w - 20));
      const edge = sideRef.current === "right" ? Math.max(10, w - width - 10) : 10;
      pose.targetX = Math.max(10, Math.min(w - width - 10, edge));
      pose.targetY = Math.max(76, h - (chat ? 420 : 190));
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
      pose.vx = (pose.vx + (pose.targetX - pose.x) * 0.06) * 0.76;
      pose.vy = (pose.vy + (pose.targetY - pose.y) * 0.06) * 0.76;
      pose.x += pose.vx;
      pose.y += pose.vy;
      const speed = Math.hypot(pose.vx, pose.vy);
      const isFly = speed > 0.85;
      const tilt = isFly ? Math.max(-12, Math.min(12, pose.vx * 0.25 + pose.vy * 0.05)) : 0;
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

  const showRecommendation = (data, focusFirst = false) => {
    const reply = cleanReply(data && data.reply) || lines[1];
    const ids = (data && data.recommendedIds || []).filter((id) => haunts.some((row) => row.id === id));
    const validIds = ids.length ? ids : ["howlOrlando"];
    setChatReply(reply);
    setChatIds(validIds);
    setAiSource(data && data.source === "claude" ? "claude" : "fallback");
    const first = haunts.find((row) => row.id === validIds[0]);
    if (first) {
      setActiveId(first.id);
      if (focusFirst) {
        setHotId(first.id);
        setSpinNonce((n) => n + 1);
      }
      setReelOn(false);
      emoteLock.current = Date.now() + 12000;
      setEmote("stars");
      setCostume(costumeFor(first.id));
    }
    speak(reply, 12000);
  };

  // Bounded live AI concierge call ONLY for contextual chat questions & prompt chips.
  const askLive = async (text, options = {}) => {
    const message = String(text || "").trim().slice(0, 300);
    if (!message) return;
    const normKey = message.toLowerCase().replace(/\s+/g, " ");
    if (inFlightKeyRef.current === normKey) return;
    cancelPendingRequest();
    const seq = reqSeqRef.current;
    setDraft("");
    setReelOn(false);
    if (options.openFloatChat) setChatOpen(true);
    setDismissed(false);

    if (clientCacheRef.current.has(normKey)) {
      const cached = clientCacheRef.current.get(normKey);
      setKicker(cached.source === "claude" ? "BOO AI · VERIFIED CATALOG" : "VERIFIED CATALOG MATCH");
      showRecommendation(cached, false);
      trackHauntEvent("boo_ai_request", { source: cached.source, cache_hit: true, recommended_count: (cached.recommendedIds || []).length });
      return;
    }

    inFlightKeyRef.current = normKey;
    setPending(true);
    emoteLock.current = Date.now() + 12000;
    setEmote("shock");
    setKicker("CHECKING VERIFIED VAULT");

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    abortRef.current = controller;
    const startedAt = Date.now();

    try {
      const res = await fetch("/api/bo-haunt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
        signal: controller ? controller.signal : undefined,
      });
      const data = await res.json();
      if (seq !== reqSeqRef.current) return;
      clientCacheRef.current.set(normKey, data);
      setKicker(data && data.source === "claude" ? "BOO AI · VERIFIED CATALOG" : "VERIFIED CATALOG MATCH");
      showRecommendation(data, false);
      trackHauntEvent("boo_ai_request", {
        source: data && data.source ? data.source : "fallback",
        cache_hit: Boolean(data && data.cached),
        latency_ms: Date.now() - startedAt,
        recommended_count: (data && data.recommendedIds || []).length,
      });
    } catch (err) {
      if (err && err.name === "AbortError") return;
      if (seq !== reqSeqRef.current) return;
      setKicker("VERIFIED CATALOG MATCH");
      showRecommendation({ reply: lines[1], recommendedIds: ["howlOrlando", "howlTampa"], source: "fallback" }, false);
    } finally {
      if (seq === reqSeqRef.current) {
        inFlightKeyRef.current = "";
        setPending(false);
        abortRef.current = null;
      }
    }
  };

  const focusHaunt = (row, lock) => {
    if (!lock && Date.now() < emoteLock.current) return;
    if (lock) setReelOn(false);
    setActiveId(row.id);
    if (lock) {
      emoteLock.current = Date.now() + 8000;
      if (!inspectedSetRef.current.has(row.id)) {
        inspectedSetRef.current.add(row.id);
        trackHauntEvent("boo_haunt_inspected", { haunt_id: row.id, trigger: "card_focus" });
      }
    }
    setEmote(poseFor(row.id));
    setCostume(costumeFor(row.id));
    if (Date.now() >= holdUntil.current) setBubble(cardPitches[row.id] || row.tip);
  };

  // Pure local state: zero network calls.
  const nextGag = () => {
    const next = (gagIndex + 1) % lines.length;
    setGagIndex(next);
    const tab = COSTUME_TABS[next % COSTUME_TABS.length];
    setCostume(tab.id);
    setEmote(tab.emote);
    setKicker(tab.kicker);
    speak(lines[next], 8000);
  };

  // Deterministic catalog price & date explanation: zero network calls.
  const roastPrice = () => {
    cancelPendingRequest();
    const pool = shown.length ? shown : haunts;
    const current = pool.find((row) => row.id === activeId) || pool[0];
    if (!current) return;
    setActiveId(current.id);
    setReelOn(false);
    emoteLock.current = Date.now() + 9000;
    setEmote("tongue");
    setCostume(costumeFor(current.id));
    setKicker("VERIFIED PRICE BREAKDOWN");
    setAiSource("catalog");
    setDismissed(false);
    const note = current.priceNote ? " " + current.priceNote : "";
    speak(cleanReply(current.roast + note), 9000);
  };

  // Constraint-respecting deterministic haunt selector: zero network calls.
  const spinDeal = () => {
    cancelPendingRequest();
    const familyConstrained = filter === "family" || selectedPickId === "kids";
    const candidatePool = familyConstrained
      ? haunts.filter((row) => row.filters.includes("family"))
      : (shown.length ? shown : haunts);
    const nonCurrent = candidatePool.filter((row) => row.id !== activeId);
    const pool = nonCurrent.length ? nonCurrent : candidatePool;
    const pick = pool[Math.floor(Math.random() * pool.length)] || haunts[0];
    setActiveId(pick.id);
    setHotId(pick.id);
    setSpinNonce((n) => n + 1);
    setReelOn(false);
    emoteLock.current = Date.now() + 9000;
    setEmote(poseFor(pick.id));
    setCostume(costumeFor(pick.id));
    setKicker("SURPRISE HAUNT PICK");
    setAiSource("catalog");
    setDismissed(false);
    speak(cleanReply(pick.name + ": " + pick.priceLabel + ". " + pick.timing + ". " + (pick.admissionNote || "")), 9000);
  };

  // Instant deterministic shortlist: zero network calls.
  const pickScare = (item) => {
    cancelPendingRequest();
    const row = haunts.find((haunt) => haunt.id === item.hauntId);
    if (!row) return;
    setSelectedPickId(item.id);
    if (item.filterId) setFilter(item.filterId);
    setActiveId(row.id);
    setReelOn(false);
    emoteLock.current = Date.now() + 10000;
    setEmote(item.id === "terrify" ? "shades" : poseFor(row.id));
    setCostume(costumeFor(row.id));
    setKicker("SHORTLIST · " + item.label.toUpperCase());
    setAiSource("catalog");
    setDismissed(false);
    speak(item.pitch, 10000);
    trackHauntEvent("boo_preference_applied", {
      pick_id: item.id,
      filter_id: item.filterId || "all",
      shortlist_count: (item.shortlistIds || []).length,
    });
    const shortlistNode = document.getElementById("boo-shortlist");
    if (shortlistNode && typeof shortlistNode.scrollIntoView === "function") {
      shortlistNode.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  // Instant deterministic card insider verdict: zero network calls.
  const askBoo = (row) => {
    cancelPendingRequest();
    const at = quipAt[row.id] || 0;
    setQuipAt({ ...quipAt, [row.id]: at + 1 });
    setActiveId(row.id);
    setReelOn(false);
    emoteLock.current = Date.now() + 10000;
    setEmote(poseFor(row.id));
    setCostume(costumeFor(row.id));
    setKicker("BOO'S VERIFIED TAKE");
    setAiSource("catalog");
    setDismissed(false);
    const quip = row.quips[at % row.quips.length];
    const detail = cleanReply(quip + (row.admissionNote ? " " + row.admissionNote + "." : ""));
    setCardPitches((prev) => ({ ...prev, [row.id]: detail }));
    speak(detail, 10000);
    trackHauntEvent("boo_haunt_inspected", { haunt_id: row.id, trigger: "ask_boo_button" });
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

  const statusLabel = pending
    ? "Asking Boo..."
    : aiSource === "claude"
      ? "Boo AI · Verified Catalog"
      : aiSource === "fallback"
        ? "Verified Catalog Match"
        : "Verified Catalog · 14 Haunts";

  const chatBox = (compact) => (
    <div className={"boo-chat" + (compact ? " boo-fly-chat" : "")} data-boo-chat={compact ? "float" : "hero"}>
      <div className="boo-chat-head">
        <p className="boo-badge">{chrome.vip}</p>
        <p className="boo-who" style={{ margin: 0 }}>{chrome.chatTitle}</p>
      </div>
      {pending ? <p className="boo-reply" aria-live="polite">{chrome.thinking}</p> : null}
      {chatReply ? <p className="boo-reply" aria-live="polite">{chatReply}</p> : null}
      {chatIds.length ? (
        <div className="boo-rec">
          {chatIds.map((id) => {
            const row = haunts.find((item) => item.id === id);
            if (!row) return null;
            return (
              <div key={id} className="boo-rec-item" data-place-id={row.eventId || row.id}>
                <div className="boo-rec-info">
                  <p className="boo-rec-name">{row.name}</p>
                  <p className="boo-rec-meta">{row.city} · {row.priceLabel}</p>
                </div>
                <a className="boo-buy" href={row.cta.href} rel={row.cta.rel}>{row.cta.label}</a>
              </div>
            );
          })}
        </div>
      ) : null}
      <div className="boo-chips" role="group" aria-label={chrome.chatTitle}>
        {prompts.map((prompt) => (
          <button type="button" key={prompt} onClick={() => askLive(prompt, { openFloatChat: compact })}>{prompt}</button>
        ))}
      </div>
      <form onSubmit={(event) => { event.preventDefault(); askLive(draft, { openFloatChat: compact }); }}>
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
    <section className="boo-page" aria-labelledby="boo-title" data-analytics-page="halloween_haunts">
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
          <div className="boo-top-right">
            {share}
          </div>
        </div>

        <div id="boo-hero">
          <div className="boo-hero-grid">
            {/* Left Column: Editorial Headline + Instant Shortlist Matcher */}
            <div>
              <div className="boo-pill-row">
                <p className="boo-sheet-pill">OFFICIAL HAUNT TICKET VAULT · GOWAYFIND.COM</p>
                <p className="boo-eyebrow">{chrome.vip}</p>
              </div>
              <h1 id="boo-title">{chrome.title}</h1>
              <p className="boo-lede">{chrome.host}. {chrome.lede}</p>
              <div className="boo-trust-strip">
                <p className="boo-note">{chrome.disclosure}</p>
                <p className="boo-note">{chrome.merit}</p>
              </div>

              <div className="boo-matcher-box">
                <p className="boo-who">{chrome.pick}</p>
                <p className="boo-matcher-sub">{chrome.who}</p>
                <div className="boo-picks" role="toolbar" aria-label={chrome.pick}>
                  {picks.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      aria-pressed={selectedPickId === item.id}
                      onClick={() => pickScare(item)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column: Boo's Interactive Concierge Stage */}
            <div className="boo-concierge-card">
              <div className="boo-stage-top">
                <p className="boo-badge">{chrome.vip}</p>
                <span className="boo-ai-status" data-boo-source={aiSource}>
                  <span className="boo-ai-dot" />
                  {statusLabel}
                </span>
              </div>

              <div className="boo-stage">
                <div className="boo-hero-sprite" onClick={nextGag} title="Tap Boo for a new gag and outfit">
                  <BooGhostSvg label={chrome.videoLabel} face={pending ? "shock" : emote} costume={costume} />
                </div>
                <div className="boo-copy">
                  <p className="boo-kicker">{kicker}</p>
                  <p key={pop} className="boo-bubble" data-boo-bubble="hero">{bubble}</p>
                </div>
              </div>

              {/* Costume & Personality Switcher (Cosmetic only, never overrides visitor preferences) */}
              <div className="boo-costume-bar" role="group" aria-label="Boo costume poses">
                {COSTUME_TABS.map((tab) => (
                  <button
                    type="button"
                    key={tab.id}
                    className={"boo-costume-btn" + (costume === tab.id ? " is-on" : "")}
                    onClick={() => {
                      setReelOn(false);
                      setCostume(tab.id);
                      setEmote(tab.emote);
                      setKicker(tab.kicker);
                      speak(tab.line, 8000);
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="boo-actions">
                <button type="button" onClick={nextGag}>{chrome.nextGag}</button>
                <button type="button" onClick={roastPrice}>{chrome.roast}</button>
                <button type="button" onClick={spinDeal}>{chrome.spin}</button>
                <button
                  type="button"
                  className="is-fill"
                  onClick={() => {
                    setDismissed(false);
                    setHeroVisible(false);
                    const vault = document.getElementById("boo-vault");
                    if (vault && vault.scrollIntoView) vault.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  {chrome.hauntScroll}
                </button>
              </div>

              <div className="boo-reel-bar">
                <div className="boo-reel" role="tablist" aria-label="Boo reel stops">
                  {reelRows.map((row, index) => (
                    <button
                      type="button"
                      key={row.id}
                      className={index === (reelIndex % reelRows.length) && reelOn ? "is-on" : ""}
                      aria-label={"Show stop " + (index + 1)}
                      onClick={() => {
                        setReelOn(false);
                        setReelIndex(index);
                        setHotId(row.id);
                        setActiveId(row.id);
                        setSpinNonce((n) => n + 1);
                        emoteLock.current = Date.now() + 8000;
                        setEmote(poseFor(row.id));
                        setCostume(costumeFor(row.id));
                        speak(row.nudge, 8000);
                      }}
                    />
                  ))}
                </div>
                <div className="boo-actions" style={{ marginTop: 0 }}>
                  <button type="button" className="is-fill" onClick={() => { setReelOn((on) => !on); setDismissed(false); }}>
                    {reelOn ? "Pause The Reel" : "Play Boo's Interactive Reel Tour"}
                  </button>
                </div>
              </div>

              {chatBox(false)}
            </div>
          </div>
        </div>

        {/* Shortlist-First Panel when Visitor Selects a Preference */}
        {selectedPick && shortlistHaunts.length ? (
          <div id="boo-shortlist" className="boo-shortlist" data-boo-shortlist={selectedPick.id}>
            <div className="boo-shortlist-head">
              <div>
                <p className="boo-shortlist-title">Boo's Shortlist: {selectedPick.label}</p>
                <p className="boo-shortlist-sub">Verified matches from the catalog with direct ticket access</p>
              </div>
              <button
                type="button"
                className="boo-shortlist-clear"
                onClick={() => {
                  setSelectedPickId(null);
                  setFilter("all");
                }}
              >
                Show All 14 Haunts
              </button>
            </div>
            <div className="boo-shortlist-grid">
              {shortlistHaunts.map((row) => (
                <div key={row.id} className="boo-shortlist-card" data-place-id={row.eventId || row.id}>
                  <div>
                    <div className="boo-card-badges">
                      <span className="boo-cat">{row.city}</span>
                      {row.scareLevel ? <span className="boo-scare">{row.scareLevel}</span> : null}
                    </div>
                    <h3>{row.name}</h3>
                    <p className="boo-shortlist-reason">{row.shortlistReason || row.tip}</p>
                    <p className="boo-shortlist-meta">{row.priceLabel} · {row.timing}</p>
                    {row.admissionNote ? <p className="boo-shortlist-note">{row.admissionNote}</p> : null}
                  </div>
                  <div className="boo-shortlist-actions">
                    <a className="boo-buy" href={row.cta.href} rel={row.cta.rel}>{row.cta.label}</a>
                    <button
                      type="button"
                      className="boo-shortlist-jump"
                      onClick={() => {
                        setFilter("all");
                        setActiveId(row.id);
                        setHotId(row.id);
                        setSpinNonce((n) => n + 1);
                      }}
                    >
                      Details
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Haunt Ticket Vault */}
        <div id="boo-vault" data-haunt-vault="">
          <div className="boo-vault-header">
            <p className="boo-vault-title">14 Verified Florida Haunts</p>
            <div className="boo-filters" role="toolbar" aria-label={chrome.eyebrow}>
              {filters.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={filter === item.id}
                  onClick={() => {
                    cancelPendingRequest();
                    setReelOn(false);
                    setFilter(item.id);
                    trackHauntEvent("boo_preference_applied", { filter_id: item.id, pick_id: selectedPickId || "none" });
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {shown.length ? (
            <div className="boo-vault-grid">
              {shown.map((row) => {
                const catLabel = row.filters.includes("family")
                  ? "Family Friendly"
                  : row.filters.includes("major")
                    ? "Major Scream Parks"
                    : "Local Haunted Trails";
                return (
                  <article
                    key={row.id}
                    id={"haunt-" + row.id}
                    data-haunt-id={row.id}
                    data-place-id={row.eventId || row.id}
                    className={"boo-card" + (activeId === row.id ? " is-active" : "") + (hotId === row.id ? " is-hot" : "")}
                    onMouseEnter={() => focusHaunt(row)}
                    onFocus={() => focusHaunt(row)}
                    onClick={() => focusHaunt(row, true)}
                  >
                    <div className="boo-card-top">
                      <div className="boo-card-badges">
                        <span className="boo-stop">{"STOP " + (haunts.indexOf(row) + 1)}</span>
                        <span className="boo-cat">{catLabel}</span>
                      </div>
                      {row.scareLevel ? <span className="boo-scare">{row.scareLevel}</span> : null}
                    </div>

                    <div className="boo-card-head-row">
                      <div>
                        <h2>{row.name}</h2>
                        <div className="boo-where-row">
                          <p className="boo-where">{row.where}</p>
                          {row.vibe ? <p className="boo-vibe">· {row.vibe}</p> : null}
                        </div>
                      </div>
                      <HauntAnimatronic type={row.animatronic} />
                    </div>

                    <div className="boo-facts">
                      <div>
                        <span className="boo-fact-label">Online Ticket Price</span>
                        <p className="boo-price">{row.priceLabel}</p>
                        {row.priceNote ? <p className="boo-fact-sub">{row.priceNote}</p> : null}
                      </div>
                      <div>
                        <span className="boo-fact-label">Operating Dates & Hours</span>
                        <p className="boo-when">{row.timing}</p>
                        {row.admissionNote ? <p className="boo-fact-sub">{row.admissionNote}</p> : null}
                      </div>
                    </div>

                    <div className="boo-verdict-box">
                      <p className="boo-tip">
                        <span>{chrome.boSays}</span>
                        {cardPitches[row.id] || row.tip}
                      </p>
                      <p className="boo-nudge">{row.nudge}</p>
                      {row.ageNote ? <p className="boo-age-note">{row.ageNote}</p> : null}
                    </div>

                    <div className="boo-buyrow">
                      <div className="boo-buy-marquee" aria-hidden="true">
                        <span>Halloween Festival Pass</span>
                        <span className="boo-marquee-dots"><i /><i /><i /></span>
                      </div>
                      <a
                        className="boo-buy"
                        href={row.cta.href}
                        rel={row.cta.rel}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.cta.label}
                      </a>
                    </div>

                    <div className="boo-card-foot">
                      <p className="boo-via">{row.cta.via}</p>
                      <div className="boo-links">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            askBoo(row);
                          }}
                        >
                          {chrome.ask}
                        </button>
                        <a href={row.eventHref} onClick={(e) => e.stopPropagation()}>{chrome.eventPage}</a>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <p>{chrome.empty}</p>
          )}
          <a className="boo-home is-fill boo-bottom-home" href="/">{chrome.homeBottom}</a>
        </div>
      </div>

      {/* Floating Boo Companion */}
      {dismissed ? (
        <button type="button" className="boo-show" onClick={() => setDismissed(false)}>{chrome.show}</button>
      ) : (
        <aside ref={flyRef} className={"boo-fly" + (flying ? " is-flying" : "") + (chatOpen ? " is-chat" : "") + (heroVisible && !chatOpen ? " is-docked" : "")} data-boo-fly="" aria-label={chrome.floatLabel}>
          {flying ? <span className="boo-trail" aria-hidden="true"><i /><i /><i /><i /></span> : null}
          <div className="boo-fly-card">
            <div className="boo-fly-col">
              <button
                type="button"
                className="boo-drag"
                aria-label={chrome.videoLabel}
                onPointerDown={onDragDown}
                onPointerMove={onDragMove}
                onPointerUp={onDragUp}
              >
                <BooGhostSvg label="" face={pending ? "shock" : emote} costume={costume} />
              </button>
              <div className="boo-fly-copy">
                <p className="boo-kicker">{kicker}</p>
                <button type="button" className="boo-float-bubble" data-boo-bubble="float" onClick={nextGag}>{bubble}</button>
                <div className="boo-fly-btns">
                  <button type="button" className="boo-open" onClick={() => setChatOpen((open) => !open)}>{chrome.openChat}</button>
                  <button type="button" className="boo-hide" onClick={() => setDismissed(true)}>{chrome.hide}</button>
                </div>
              </div>
            </div>
            {chatOpen ? chatBox(true) : null}
          </div>
        </aside>
      )}
    </section>
  );
}
