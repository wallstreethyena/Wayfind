"use client";

import { useEffect, useId, useRef, useState } from "react";
import { captureOrQueue } from "../../lib/browserAnalytics.js";

// Inter via --wf-sans. Visible copy comes from the server model and stays dash free.
const BULBS = ["pink", "gold", "cyan", "orange", "pink", "cyan", "gold", "orange", "pink", "gold", "cyan", "orange"];
const SESSION_KEY = "wf_boo_session_v2";
const KICKERS = [
  { pill: "FRIENDLY COMPANION", line: "I'm Boo. You pick the plans. I'll bring the spooky suggestions." },
  { pill: "TICKET & FEE GUIDE", line: "Compare separate nighttime event tickets against daytime included admission." },
  { pill: "STATEWIDE VAULT", line: "Filter by Florida region, date window, scare intensity, group, and budget." },
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
  { id: "hype", label: "VIP Guide", emote: "wink", kicker: "BOO COMPANION", line: "I'm Boo. You pick the plans. I'll bring the spooky suggestions." },
  { id: "pirate", label: "Night Pirate", emote: "shades", kicker: "EXTREME NIGHTS", line: "Looking for studio houses or dark coasters? Universal Horror Nights and Busch Gardens Howl O Scream lead the pack." },
  { id: "springs", label: "Splash Diver", emote: "shock", kicker: "COASTAL & WATERFRONT", line: "SeaWorld Howl O Scream Orlando starts at $45.99 online, while Spooktacular is included with daytime park admission." },
  { id: "explorer", label: "Trail Scout", emote: "tongue", kicker: "OUTDOOR WOODS & FARMS", line: "From Dade City woods trails to Sarasota pumpkin patches, check whether advance timed entry is required." },
  { id: "maracas", label: "Fiesta Vibe", emote: "squint", kicker: "FESTIVALS & PARTIES", line: "LEGOLAND Brick or Treat for kids by day, or 21+ rooftop Halloween bashes in Sarasota and West Palm Beach at night." },
  { id: "navigator", label: "Route Scout", emote: "wink", kicker: "HISTORIC GHOST WALKS", line: "Walking ghost tours in St. Augustine, Key West, and downtown Tampa depart at 8:00 PM for haunted history fans." },
  { id: "flamingo", label: "Family VIP", emote: "stars", kicker: "FAMILY & KIDS", line: "Bringing little monsters? Peppa Pig, ZooTampa, Zoo Miami, and Clearwater Spookquarium keep scares gentle." },
];

function poseFor(id) {
  if (id === "hhn" || id === "screamageddon" || id === "sirHenry" || id === "terrorTally") return "shades";
  if (id === "mickey" || id === "peppa" || id === "brick" || id === "spooktacular" || id === "crayolaHaunt") return "squint";
  if (id === "zooTampa" || id === "spookquarium" || id === "zooMiami" || id === "naplesBoo") return "stars";
  if (id === "undead" || id === "frightfest" || id === "petrified" || id === "keyWestGhost") return "tongue";
  return "wink";
}

function costumeFor(id) {
  if (id === "hhn" || id === "undead" || id === "screamageddon" || id === "keyWestGhost" || id === "spookyEmpire") return "pirate";
  if (id === "howlOrlando" || id === "spooktacular" || id === "spookquarium") return "springs";
  if (id === "zooTampa" || id === "petrified" || id === "gatorland" || id === "fruitvilleGrove" || id === "sweetfields" || id === "farmerMikes") return "explorer";
  if (id === "brick" || id === "frightfest" || id === "sarasotaTrolley" || id === "keelFarms") return "maracas";
  if (id === "sirHenry" || id === "stAugGhost" || id === "tampaGhost") return "navigator";
  if (id === "mickey" || id === "peppa" || id === "zooMiami" || id === "crayolaHaunt" || id === "tallySymphony" || id === "naplesBoo") return "flamingo";
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
    radial-gradient(ellipse 80% 45% at 50% -8%,rgba(249,115,22,.15),transparent 65%),
    radial-gradient(ellipse 55% 40% at 88% 18%,rgba(16,185,129,.08),transparent 60%),
    radial-gradient(ellipse 55% 40% at 12% 32%,rgba(0,245,212,.06),transparent 60%),
    linear-gradient(180deg,#0A0A0B 0%,#121216 45%,#0A0A0B 100%);
}
.boo-page,.boo-page button,.boo-page a,.boo-page input,.boo-page select{font-family:var(--wf-sans),sans-serif;box-sizing:border-box}
.boo-inner{max-width:1180px;margin:0 auto}

/* Subtle Festoon String Lights */
.boo-lights{position:relative;height:52px;margin:0 -16px 8px;overflow:hidden;pointer-events:none}
.boo-lights::after{content:"";position:absolute;left:0;right:0;top:28px;height:24px;background:linear-gradient(180deg,rgba(249,115,22,.09),rgba(16,185,129,.03),transparent)}
.boo-wire{position:absolute;left:0;right:0;top:0;width:100%;height:46px;opacity:.65}
.boo-bulb{position:absolute;top:14px;width:12px;height:17px;border-radius:7px 7px 9px 9px;animation:boo-flicker 3.6s infinite}
.boo-bulb::after{content:"";position:absolute;left:3px;top:-5px;width:6px;height:5px;background:#FFD166;border-radius:2px}
.boo-flare{position:absolute;inset:-9px;border-radius:50%;opacity:.55}
.boo-charm{display:none}
.boo-bulb.is-pink{background:#FF6B35;color:#FF6B35;box-shadow:0 0 12px rgba(255,107,53,.7)}
.boo-bulb.is-pink .boo-flare{background:radial-gradient(circle,rgba(255,107,53,.65),transparent 70%)}
.boo-bulb.is-gold{background:#FFD166;color:#FFD166;box-shadow:0 0 12px rgba(255,209,102,.7)}
.boo-bulb.is-gold .boo-flare{background:radial-gradient(circle,rgba(255,209,102,.65),transparent 70%)}
.boo-bulb.is-orange{background:#F97316;color:#F97316;box-shadow:0 0 12px rgba(249,115,22,.7)}
.boo-bulb.is-orange .boo-flare{background:radial-gradient(circle,rgba(249,115,22,.65),transparent 70%)}
.boo-bulb.is-cyan{background:#10B981;color:#10B981;box-shadow:0 0 12px rgba(16,185,129,.7)}
.boo-bulb.is-cyan .boo-flare{background:radial-gradient(circle,rgba(16,185,129,.65),transparent 70%)}
.boo-bulb:nth-child(2){left:3%;top:9px}
.boo-bulb:nth-child(3){left:11%;top:20px;animation-delay:.3s}
.boo-bulb:nth-child(4){left:19%;top:10px;animation-delay:.15s}
.boo-bulb:nth-child(5){left:27%;top:21px;animation-delay:.6s}
.boo-bulb:nth-child(6){left:35%;top:9px;animation-delay:.2s}
.boo-bulb:nth-child(7){left:43%;top:20px;animation-delay:.5s}
.boo-bulb:nth-child(8){left:51%;top:9px;animation-delay:.25s}
.boo-bulb:nth-child(9){left:59%;top:21px;animation-delay:.7s}
.boo-bulb:nth-child(10){left:67%;top:10px;animation-delay:.2s}
.boo-bulb:nth-child(11){left:75%;top:19px;animation-delay:.55s}
.boo-bulb:nth-child(12){left:83%;top:9px;animation-delay:.35s}
.boo-bulb:nth-child(13){left:91%;top:18px;animation-delay:.45s}

/* Top Navigation Bar */
.boo-top{
  display:flex;
  align-items:center;
  justify-content:space-between;
  flex-wrap:wrap;
  gap:12px;
  padding:10px 16px;
  margin-bottom:18px;
  background:rgba(18,18,22,.86);
  backdrop-filter:blur(16px);
  border:1px solid rgba(255,255,255,.1);
  border-radius:999px;
}
.boo-top-right{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
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
  transition:border-color .18s ease,background .18s ease;
}
.boo-home:hover{border-color:#F97316;background:#191920}
.boo-home.is-fill{background:#F97316;color:#0A0A0B;border-color:#F97316;font-weight:800}
.boo-home.is-fill:hover{background:#FF921C}

/* Hero Layout */
#boo-hero{
  background:linear-gradient(145deg,rgba(20,20,27,.96) 0%,rgba(12,12,17,.99) 100%);
  border:1px solid rgba(255,255,255,.11);
  border-radius:28px;
  padding:22px;
  box-shadow:0 22px 58px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.08);
  margin-bottom:20px;
}
.boo-hero-grid{
  display:grid;
  grid-template-columns:minmax(0,1fr);
  gap:24px;
  align-items:start;
}
.boo-hero-grid>*{min-width:0}
@media(max-width:560px){
  #boo-hero{padding:16px;border-radius:22px}
}
@media(min-width:960px){
  #boo-hero{padding:30px}
  .boo-hero-grid{grid-template-columns:minmax(0,1.12fr) minmax(0,0.88fr);gap:28px}
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
  background:rgba(16,185,129,.12);
  color:#10B981;
  border:1px solid rgba(16,185,129,.38);
  border-radius:999px;
  padding:5px 12px;
  font-size:11px;
  font-weight:800;
  letter-spacing:.08em;
  text-transform:uppercase;
}
.boo-page h1{
  margin:0 0 8px;
  font-size:clamp(32px,5vw,48px);
  font-weight:850;
  letter-spacing:-.035em;
  line-height:1.05;
  color:#FFFFFF;
}
.boo-hero-sub{
  margin:0 0 10px;
  font-size:clamp(17px,2.2vw,21px);
  font-weight:750;
  color:#FFD166;
  line-height:1.35;
}
.boo-lede{
  margin:0 0 14px;
  color:#D4D4D8;
  font-size:15px;
  line-height:1.55;
  max-width:64ch;
}
.boo-trust-strip{
  display:flex;
  flex-wrap:wrap;
  gap:8px 16px;
  padding:10px 14px;
  background:rgba(255,255,255,.03);
  border:1px solid rgba(255,255,255,.08);
  border-radius:14px;
  margin-bottom:16px;
}
.boo-note{
  margin:0;
  font-size:12.5px;
  color:#A1A1AA;
  line-height:1.4;
}

/* Quick Curated Shortlists */
.boo-matcher-box{
  background:rgba(10,10,11,.68);
  border:1px solid rgba(255,255,255,.09);
  border-radius:20px;
  padding:15px;
  margin-top:12px;
}
.boo-who{
  margin:0 0 4px;
  font-size:11.5px;
  font-weight:800;
  color:#F97316;
  text-transform:uppercase;
  letter-spacing:.1em;
}
.boo-matcher-sub{
  margin:0 0 10px;
  color:#FFFFFF;
  font-size:15.5px;
  font-weight:750;
}
.boo-picks{
  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(160px,1fr));
  gap:8px;
}
.boo-picks button{
  border:1px solid rgba(255,255,255,.13);
  background:#121216;
  color:#FFFFFF;
  border-radius:14px;
  padding:9px 12px;
  font-size:13px;
  font-weight:750;
  cursor:pointer;
  min-height:44px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  text-align:left;
  transition:border-color .16s ease,background .16s ease;
}
.boo-picks button:hover,.boo-picks button[aria-pressed="true"]{
  border-color:#F97316;
  background:rgba(249,115,22,.16);
}
.boo-picks button::after{
  content:"→";
  color:#F97316;
  font-weight:800;
  margin-left:8px;
}

/* Shortlist Panel */
.boo-shortlist{
  background:linear-gradient(155deg,rgba(24,20,16,.96) 0%,rgba(14,14,19,.98) 100%);
  border:1.5px solid #F97316;
  border-radius:24px;
  padding:18px;
  margin-bottom:22px;
  box-shadow:0 18px 44px rgba(0,0,0,.55);
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
  min-height:38px;
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

/* Boo Non-Intrusive Companion Stage in Hero */
.boo-concierge-card{
  background:radial-gradient(circle at 25% 18%,rgba(249,115,22,.12),transparent 55%),radial-gradient(circle at 82% 12%,rgba(16,185,129,.1),transparent 50%),#0E0E13;
  border:1.5px solid rgba(249,115,22,.42);
  border-radius:24px;
  padding:18px;
  min-width:0;
  box-shadow:0 16px 40px rgba(0,0,0,.5);
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
  margin-bottom:8px;
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
  background:rgba(16,185,129,.12);
  color:#10B981;
  border:1px solid rgba(16,185,129,.35);
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
  background:#10B981;
  box-shadow:0 0 8px #10B981;
}
.boo-greeting-box{
  background:rgba(255,255,255,.03);
  border:1px solid rgba(255,255,255,.08);
  border-radius:14px;
  padding:10px 12px;
  margin-bottom:10px;
}
.boo-greeting-line{
  margin:0;
  font-size:13.5px;
  font-weight:800;
  color:#FFFFFF;
}
.boo-helper-line{
  margin:3px 0 0;
  font-size:12.5px;
  color:#D4D4D8;
}

.boo-stage{
  display:grid;
  grid-template-columns:138px minmax(0,1fr);
  gap:12px;
  align-items:center;
}
@media(max-width:560px){
  .boo-stage{grid-template-columns:104px minmax(0,1fr);gap:10px}
}
.boo-hero-sprite{
  position:relative;
  background:radial-gradient(circle,rgba(255,255,255,.06) 0%,transparent 70%);
  border-radius:20px;
  padding:4px;
  pointer-events:none;
}
.boo-costume-bar{
  display:flex;
  flex-wrap:wrap;
  gap:6px;
  margin:10px 0;
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
  transition:border-color .15s ease,background .15s ease;
}
.boo-costume-btn.is-on,.boo-costume-btn:hover{
  background:rgba(0,245,212,.14);
  color:#00F5D4;
  border-color:#00F5D4;
}

.boo-copy{display:flex;flex-direction:column;gap:6px;min-width:0}
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
  border-radius:16px;
  padding:12px;
  color:#FFFFFF;
  font-size:14px;
  font-weight:650;
  line-height:1.45;
  box-shadow:0 8px 24px rgba(0,0,0,.35);
}

/* Interactive Action Controls */
.boo-actions{
  display:flex;
  flex-wrap:wrap;
  gap:8px;
  margin-top:10px;
}
.boo-actions button{
  border:1px solid rgba(255,255,255,.16);
  background:#16161D;
  color:#FFFFFF;
  border-radius:999px;
  padding:7px 12px;
  font-size:12.5px;
  font-weight:750;
  cursor:pointer;
  min-height:38px;
  display:inline-flex;
  align-items:center;
  gap:6px;
  transition:border-color .15s ease,background .15s ease;
}
.boo-actions button:hover{border-color:#F97316;background:#1E1E28}
.boo-actions button.is-fill{
  background:#F97316;
  color:#0A0A0B;
  border-color:#F97316;
  font-weight:800;
}
.boo-actions button.is-fill:hover{background:#FF921C}

/* Claude AI Chat Box */
.boo-chat{
  margin-top:12px;
  background:rgba(18,18,22,.95);
  border:1px solid rgba(255,255,255,.13);
  border-radius:18px;
  padding:13px;
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
  padding:6px 11px;
  font-size:12px;
  font-weight:700;
  cursor:pointer;
  min-height:34px;
  transition:background .15s ease,color .15s ease;
}
.boo-chips button:hover{
  background:#F97316;
  color:#0A0A0B;
}
.boo-chat form{display:flex;gap:8px;margin-top:8px}
.boo-chat input{
  flex:1;
  min-width:0;
  min-height:42px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.2);
  background:#0A0A0B;
  color:#FFFFFF;
  padding:8px 12px;
  font-size:14.5px;
}
.boo-chat input:focus{border-color:#F97316;outline:none}
.boo-send{
  border:1px solid #F97316;
  background:#F97316;
  color:#0A0A0B;
  border-radius:12px;
  padding:8px 14px;
  font-size:13.5px;
  font-weight:800;
  cursor:pointer;
  min-height:42px;
  white-space:nowrap;
}
.boo-send:hover{background:#FF921C}
.boo-reply{
  margin:8px 0 10px;
  padding:10px 12px;
  background:rgba(16,185,129,.09);
  border-left:3px solid #10B981;
  border-radius:8px;
  color:#FFFFFF;
  font-size:14px;
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
  padding:9px 11px;
}
.boo-rec-info{min-width:0;flex:1}
.boo-rec-name{
  margin:0;
  font-size:13.5px;
  font-weight:800;
  color:#FFFFFF;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}
.boo-rec-meta{
  margin:2px 0 0;
  font-size:11.5px;
  color:#FFD166;
  font-weight:700;
}
.boo-rec-item .boo-buy{
  flex:none;
  min-height:36px;
  padding:6px 12px;
  font-size:12.5px;
  border-radius:10px;
}

/* Discovery Controls Hub (#boo-discovery-controls) */
.boo-discovery-box{
  background:rgba(16,16,22,.94);
  border:1px solid rgba(255,255,255,.11);
  border-radius:24px;
  padding:18px 20px;
  margin-bottom:22px;
  box-shadow:0 14px 36px rgba(0,0,0,.4);
}
.boo-discovery-head{
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  margin-bottom:12px;
}
.boo-vault-title{
  margin:0;
  font-size:22px;
  font-weight:850;
  letter-spacing:-.02em;
}
.boo-vault-count{
  margin:0;
  font-size:13px;
  font-weight:750;
  color:#10B981;
}
.boo-filters{
  display:flex;
  flex-wrap:wrap;
  gap:7px;
  margin-bottom:14px;
}
.boo-filters button{
  border:1px solid rgba(255,255,255,.14);
  background:#121216;
  color:#D4D4D8;
  border-radius:999px;
  padding:8px 14px;
  font-size:13px;
  font-weight:750;
  cursor:pointer;
  min-height:40px;
  transition:border-color .16s ease,background .16s ease;
}
.boo-filters button:hover{border-color:#F97316;color:#FFFFFF}
.boo-filters button[aria-pressed="true"]{
  background:#F97316;
  color:#0A0A0B;
  border-color:#F97316;
  font-weight:850;
}

/* Multi-Facet Selectors Grid */
.boo-facet-grid{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(175px,1fr));
  gap:10px;
  padding-top:12px;
  border-top:1px solid rgba(255,255,255,.08);
}
.boo-facet-field{
  display:flex;
  flex-direction:column;
  gap:4px;
}
.boo-facet-label{
  font-size:11px;
  font-weight:800;
  text-transform:uppercase;
  letter-spacing:.07em;
  color:#A1A1AA;
}
.boo-facet-select{
  width:100%;
  min-height:40px;
  border-radius:12px;
  border:1px solid rgba(255,255,255,.16);
  background:#0A0A0B;
  color:#FFFFFF;
  padding:7px 10px;
  font-size:13px;
  font-weight:700;
  cursor:pointer;
}
.boo-facet-select:focus{border-color:#F97316;outline:none}

/* Active Filter Bar */
.boo-active-bar{
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  margin-top:12px;
  padding-top:12px;
  border-top:1px solid rgba(255,255,255,.08);
}
.boo-active-pills{
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  gap:6px;
}
.boo-active-chip{
  border:1px solid rgba(249,115,22,.45);
  background:rgba(249,115,22,.14);
  color:#FFD166;
  border-radius:999px;
  padding:4px 10px;
  font-size:12px;
  font-weight:750;
  cursor:pointer;
  min-height:30px;
}
.boo-clear-btn{
  border:1px solid rgba(0,245,212,.45);
  background:rgba(0,245,212,.1);
  color:#00F5D4;
  border-radius:999px;
  padding:6px 14px;
  font-size:12.5px;
  font-weight:800;
  cursor:pointer;
  min-height:34px;
}
.boo-clear-btn:hover{background:#00F5D4;color:#0A0A0B}

/* Vault Section & Cards */
#boo-vault{margin-top:8px}
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
    radial-gradient(circle at 92% 10%,rgba(249,115,22,.1),transparent 42%),
    radial-gradient(circle at 8% 92%,rgba(16,185,129,.06),transparent 42%),
    linear-gradient(165deg,#171720 0%,#101015 100%);
  border:1.5px solid rgba(255,255,255,.12);
  border-radius:24px;
  padding:18px;
  margin:0;
  box-shadow:0 12px 32px rgba(0,0,0,.45);
  transition:border-color .2s ease,box-shadow .2s ease;
}
.boo-card:hover{
  border-color:rgba(249,115,22,.58);
}
.boo-card.is-active{
  border-color:#FFD166;
  box-shadow:0 14px 36px rgba(0,0,0,.55),0 0 0 1px rgba(255,209,102,.32);
}
.boo-card.is-hot{
  border-color:#F97316;
  box-shadow:0 0 0 2px #F97316,0 16px 40px rgba(249,115,22,.24);
}

/* Card Photography Header */
.boo-card-media{
  position:relative;
  height:176px;
  margin:-18px -18px 14px;
  overflow:hidden;
  background:#0E0E13;
  border-bottom:1px solid rgba(255,255,255,.08);
}
.boo-card-img{
  width:100%;
  height:100%;
  object-fit:cover;
  display:block;
}
.boo-card-media-overlay{
  position:absolute;
  inset:0;
  background:linear-gradient(180deg,rgba(10,10,11,.2) 0%,transparent 45%,rgba(16,16,21,.92) 100%);
  pointer-events:none;
}
.boo-region-pill{
  position:absolute;
  left:12px;
  top:12px;
  background:rgba(10,10,11,.82);
  backdrop-filter:blur(8px);
  color:#FFFFFF;
  border:1px solid rgba(255,255,255,.18);
  border-radius:999px;
  padding:4px 10px;
  font-size:11px;
  font-weight:800;
}
.boo-photo-badge{
  position:absolute;
  right:12px;
  bottom:10px;
  background:rgba(10,10,11,.78);
  color:#D4D4D8;
  border:1px solid rgba(255,255,255,.14);
  border-radius:999px;
  padding:3px 9px;
  font-size:10.5px;
  font-weight:700;
}

/* Card Badges & Animatronic Stage */
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
.boo-stop{background:rgba(249,115,22,.2);color:#FF921C;border:1px solid rgba(249,115,22,.4)}
.boo-cat{background:rgba(16,185,129,.12);color:#10B981;border:1px solid rgba(16,185,129,.35)}
.boo-scare{background:rgba(255,209,102,.12);color:#FFD166;border:1px solid rgba(255,209,102,.3)}

.boo-card-head-row{
  display:grid;
  grid-template-columns:minmax(0,1fr) 68px;
  gap:12px;
  align-items:center;
  margin-bottom:12px;
}
.boo-anim-box{
  width:68px;
  height:68px;
  border-radius:16px;
  background:radial-gradient(circle at 50% 50%,rgba(249,115,22,.18),rgba(10,10,11,.85) 72%);
  border:1px solid rgba(249,115,22,.32);
  display:flex;
  align-items:center;
  justify-content:center;
  pointer-events:none;
}
.boo-anim-svg{width:58px;height:58px;overflow:visible;display:block}
.boo-anim-swing{transform-box:fill-box;transform-origin:50% 8%;animation:boo-pendulum 3.2s ease-in-out infinite}
.boo-anim-gear{transform-box:fill-box;transform-origin:center;animation:boo-spin 8s linear infinite}
.boo-anim-chomp{transform-box:fill-box;transform-origin:center;animation:boo-chomp 2s ease-in-out infinite}
.boo-anim-float{transform-box:fill-box;transform-origin:center;animation:boo-mini-bob 2.6s ease-in-out infinite}
.boo-anim-clap{transform-box:fill-box;transform-origin:15% 85%;animation:boo-clap 2.4s ease-in-out infinite}
.boo-anim-glow{animation:boo-eye-pulse 2.2s ease-in-out infinite}

.boo-card h2{
  margin:0;
  font-size:20px;
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
  margin:5px 0 0;
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
  font-size:19px;
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
  background:rgba(249,115,22,.06);
  border:1px solid rgba(249,115,22,.24);
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

/* Ticket Marquee CTA Frame */
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
    linear-gradient(90deg,rgba(249,115,22,.14),rgba(16,185,129,.12));
  border:1px solid rgba(255,209,102,.35);
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
  box-shadow:0 0 5px #FF921C;
}
.boo-marquee-dots i:nth-child(2){background:#10B981;box-shadow:0 0 5px #10B981}
.boo-marquee-dots i:nth-child(3){background:#FFD166;box-shadow:0 0 5px #FFD166}

.boo-buy{
  display:flex;
  align-items:center;
  justify-content:center;
  min-height:46px;
  border-radius:14px;
  background:linear-gradient(135deg,#F97316 0%,#FF921C 100%);
  color:#0A0A0B;
  font-size:15.5px;
  font-weight:850;
  text-decoration:none;
  text-align:center;
  padding:10px 16px;
  box-shadow:0 6px 18px rgba(249,115,22,.28);
  transition:box-shadow .15s ease;
}
.boo-buy:hover{
  box-shadow:0 10px 24px rgba(249,115,22,.42);
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
}
.boo-links button:hover{
  background:#00F5D4;
  color:#0A0A0B;
}

/* Empty State Box */
.boo-empty-box{
  background:rgba(18,18,24,.94);
  border:1.5px solid rgba(249,115,22,.4);
  border-radius:22px;
  padding:24px;
  text-align:center;
  margin:16px 0;
}
.boo-empty-box h3{margin:0 0 8px;font-size:19px;font-weight:850}
.boo-empty-box p{margin:0 0 14px;color:#D4D4D8;font-size:14px}
.boo-empty-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:8px}

/* Practical Planning Guide Section */
.boo-planning{
  margin-top:32px;
  padding:22px;
  background:rgba(16,16,22,.92);
  border:1px solid rgba(255,255,255,.1);
  border-radius:24px;
}
.boo-planning h2{margin:0 0 6px;font-size:21px;font-weight:850}
.boo-planning-sub{margin:0 0 16px;color:#A1A1AA;font-size:14px}
.boo-planning-grid{
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(235px,1fr));
  gap:14px;
}
.boo-planning-card{
  background:rgba(10,10,11,.75);
  border:1px solid rgba(255,255,255,.08);
  border-radius:16px;
  padding:14px;
}
.boo-planning-card h3{margin:0 0 6px;font-size:15px;font-weight:800;color:#FFD166}
.boo-planning-card p{margin:0;font-size:13px;color:#D4D4D8;line-height:1.48}
.boo-bottom-home{margin-top:24px}

/* Non-Intrusive Floating Boo Companion Dock */
.boo-fly{
  position:fixed;
  z-index:40;
  right:16px;
  bottom:calc(16px + env(safe-area-inset-bottom));
  width:min(330px,calc(100vw - 24px));
  pointer-events:none !important;
  transition:opacity .24s ease;
}
.boo-fly.is-minimized,
.boo-fly.is-hero-docked{
  width:auto;
  max-width:calc(100vw - 24px);
}
.boo-fly.is-keyboard{
  opacity:.4;
}
.boo-fly-mascot{
  width:56px;
  height:56px;
  flex:none;
  pointer-events:none !important;
  user-select:none;
}
.boo-fly-mascot *{
  pointer-events:none !important;
}
.boo-fly.is-minimized .boo-fly-mascot,
.boo-fly.is-hero-docked .boo-fly-mascot{
  width:38px;
  height:38px;
  opacity:.82;
}
.boo-fly.is-minimized .boo-fly-mascot{
  opacity:.45;
}
.boo-fly.is-hero-docked .boo-float-bubble{
  display:none;
}
@media(max-width:640px){
  .boo-fly:not(.is-chat){
    width:auto;
    max-width:calc(100vw - 20px);
  }
  .boo-fly:not(.is-chat) .boo-fly-mascot{
    width:38px;
    height:38px;
  }
  .boo-fly:not(.is-chat) .boo-float-bubble{
    display:none;
  }
}
.boo-fly-card{
  background:rgba(14,14,19,.94);
  backdrop-filter:blur(16px);
  border:1.5px solid rgba(249,115,22,.5);
  border-radius:20px;
  padding:8px 11px;
  box-shadow:0 14px 36px rgba(0,0,0,.6);
  pointer-events:none !important;
}
.boo-fly-col{
  display:flex;
  align-items:center;
  gap:10px;
  pointer-events:none !important;
}
.boo-fly-copy{
  display:flex;
  flex-direction:column;
  gap:5px;
  min-width:0;
  flex:1;
  pointer-events:none !important;
}
.boo-float-bubble{
  border:1px solid rgba(255,255,255,.12);
  background:#16161E;
  color:#FFFFFF;
  border-radius:12px;
  padding:6px 9px;
  text-align:left;
  font-size:12px;
  font-weight:650;
  line-height:1.35;
  margin:0;
  pointer-events:none !important;
  display:-webkit-box;
  -webkit-line-clamp:2;
  -webkit-box-orient:vertical;
  overflow:hidden;
}
.boo-fly-btns{
  display:flex;
  flex-wrap:wrap;
  align-items:center;
  gap:5px;
  pointer-events:auto !important;
}
.boo-hide,.boo-open,.boo-min{
  border:1px solid rgba(255,255,255,.18);
  background:#121216;
  color:#FFFFFF;
  border-radius:999px;
  min-height:28px;
  padding:4px 9px;
  font-size:11px;
  font-weight:750;
  cursor:pointer;
  pointer-events:auto !important;
}
.boo-open{background:#F97316;color:#0A0A0B;border-color:#F97316;font-weight:800}
.boo-fly-chat{
  margin-top:8px;
  max-height:42vh;
  overflow:auto;
  pointer-events:auto !important;
}
.boo-show{
  position:fixed;
  right:16px;
  bottom:calc(16px + env(safe-area-inset-bottom));
  z-index:40;
  border:1.5px solid #F97316;
  background:#121216;
  color:#FFFFFF;
  border-radius:999px;
  padding:8px 14px;
  font-size:13px;
  font-weight:800;
  cursor:pointer;
  box-shadow:0 10px 28px rgba(0,0,0,.55);
}

/* Boo Vector Sprite & Festival Animatronic Keyframes */
.boo-sprite{width:100%;height:auto;display:block;overflow:visible;animation:boo-bob 2.8s ease-in-out infinite;pointer-events:none}
.boo-hem{transform-box:fill-box;transform-origin:center}
.boo-flag{transform-box:fill-box;transform-origin:20% 90%;animation:boo-wave 2.4s ease-in-out infinite}
.boo-squint{opacity:0}
.boo-sprite[data-face="wink"] .boo-squint{animation:boo-blink-on 3.2s linear infinite}
.boo-sprite[data-face="wink"] .boo-awake{animation:boo-blink-off 3.2s linear infinite}
@keyframes boo-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes boo-mini-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes boo-wave{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(6deg)}}
@keyframes boo-flicker{0%,18%,22%,53%,57%,100%{opacity:1}20%,55%{opacity:.55}70%{opacity:.88}}
@keyframes boo-blink-off{0%,93%{opacity:1}94%,100%{opacity:0}}
@keyframes boo-blink-on{0%,93%{opacity:0}94%,100%{opacity:1}}
@keyframes boo-pendulum{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg)}}
@keyframes boo-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
@keyframes boo-chomp{0%,100%{transform:scaleY(1)}50%{transform:scaleY(1.1) translateY(-1px)}}
@keyframes boo-clap{0%,100%{transform:rotate(0deg)}45%{transform:rotate(-14deg)}55%{transform:rotate(0deg)}}
@keyframes boo-eye-pulse{0%,100%{opacity:.6;transform:scale(.96)}50%{opacity:1;transform:scale(1.05)}}
.boo-page.is-motion-paused .boo-sprite,
.boo-page.is-motion-paused .boo-flag,
.boo-page.is-motion-paused .boo-bulb,
.boo-page.is-motion-paused .boo-squint,
.boo-page.is-motion-paused .boo-awake,
.boo-page.is-motion-paused .boo-anim-swing,
.boo-page.is-motion-paused .boo-anim-gear,
.boo-page.is-motion-paused .boo-anim-chomp,
.boo-page.is-motion-paused .boo-anim-float,
.boo-page.is-motion-paused .boo-anim-clap,
.boo-page.is-motion-paused .boo-anim-glow{animation:none !important}
@media(prefers-reduced-motion:reduce){
  .boo-sprite,.boo-flag,.boo-bulb,.boo-squint,.boo-awake,
  .boo-anim-swing,.boo-anim-gear,.boo-anim-chomp,.boo-anim-float,.boo-anim-clap,.boo-anim-glow{animation:none !important}
}
@media(max-width:560px){
  .boo-page{padding-bottom:160px}
  .boo-fly{right:10px;bottom:calc(10px + env(safe-area-inset-bottom));width:min(300px,calc(100vw - 20px))}
}
@media(max-height:460px){
  .boo-fly-mascot,.boo-float-bubble{display:none}
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
          <g className="boo-anim-gear">
            <circle cx="46" cy="18" r="9" fill="none" stroke="#00F5D4" strokeWidth="2.5" strokeDasharray="4 3" />
            <circle cx="46" cy="18" r="3.5" fill="#FFD166" />
          </g>
          <path d="M 6 52 Q 32 24 58 52" fill="none" stroke="#F97316" strokeWidth="3" strokeLinecap="round" />
          <g className="boo-anim-chomp">
            <ellipse cx="30" cy="34" rx="16" ry="13" fill="#F97316" stroke="#18181B" strokeWidth="3" />
            <polygon points="22,29 26,29 24,24" fill="#FFD166" className="boo-anim-glow" />
            <polygon points="34,29 38,29 36,24" fill="#FFD166" className="boo-anim-glow" />
            <path d="M 20 38 L 24 41 L 28 38 L 32 41 L 36 38 L 40 41" fill="none" stroke="#18181B" strokeWidth="2.5" strokeLinecap="round" />
          </g>
        </svg>
      </div>
    );
  }
  if (type === "cinema") {
    return (
      <div className="boo-anim-box" aria-hidden="true">
        <svg className="boo-anim-svg" viewBox="0 0 64 64" aria-hidden="true">
          <g className="boo-anim-float">
            <path d="M 16 18 Q 24 10 32 18 Q 40 10 48 18 Q 38 22 32 26 Q 26 22 16 18 Z" fill="#F97316" />
            <circle cx="30" cy="19" r="1.5" fill="#FFD166" />
            <circle cx="34" cy="19" r="1.5" fill="#FFD166" />
          </g>
          <rect x="14" y="34" width="36" height="22" rx="4" fill="#16161E" stroke="#FFD166" strokeWidth="2.5" />
          <line x1="20" y1="42" x2="44" y2="42" stroke="#00F5D4" strokeWidth="2" />
          <line x1="20" y1="48" x2="36" y2="48" stroke="#F97316" strokeWidth="2" />
          <g className="boo-anim-clap">
            <rect x="14" y="27" width="36" height="6" rx="2" fill="#F97316" stroke="#18181B" strokeWidth="2" />
          </g>
        </svg>
      </div>
    );
  }
  if (type === "cauldron") {
    return (
      <div className="boo-anim-box" aria-hidden="true">
        <svg className="boo-anim-svg" viewBox="0 0 64 64" aria-hidden="true">
          <g className="boo-anim-float">
            <circle cx="24" cy="18" r="3.5" fill="#00F5D4" />
            <circle cx="38" cy="14" r="4" fill="#10B981" />
            <Star cx="31" cy="22" size="5" fill="#FFD166" />
          </g>
          <ellipse cx="32" cy="31" rx="16" ry="5" fill="#00F5D4" stroke="#18181B" strokeWidth="2.5" />
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
          <circle cx="44" cy="18" r="10" fill="#FFD166" opacity="0.85" />
          <g className="boo-anim-chomp">
            <path d="M 16 54 V 30 C 16 20 38 20 38 30 V 54 Z" fill="#1A1A22" stroke="#00F5D4" strokeWidth="2.5" />
            <circle cx="23" cy="34" r="2.6" fill="#F97316" className="boo-anim-glow" />
            <circle cx="31" cy="34" r="2.6" fill="#F97316" className="boo-anim-glow" />
            <path d="M 21 43 H 33" stroke="#FFD166" strokeWidth="2" strokeLinecap="round" />
          </g>
          <path d="M 8 54 L 56 54" stroke="#F97316" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>
    );
  }
  if (type === "nautical") {
    return (
      <div className="boo-anim-box" aria-hidden="true">
        <svg className="boo-anim-svg" viewBox="0 0 64 64" aria-hidden="true">
          <g className="boo-anim-gear">
            <circle cx="32" cy="30" r="14" fill="none" stroke="#FFD166" strokeWidth="3" />
            <circle cx="32" cy="30" r="4" fill="#F97316" />
            <line x1="32" y1="11" x2="32" y2="49" stroke="#FFD166" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="13" y1="30" x2="51" y2="30" stroke="#FFD166" strokeWidth="2.5" strokeLinecap="round" />
          </g>
          <path d="M 10 51 Q 21 45 32 51 T 54 51" fill="none" stroke="#00F5D4" strokeWidth="3" strokeLinecap="round" className="boo-anim-float" />
        </svg>
      </div>
    );
  }
  return (
    <div className="boo-anim-box" aria-hidden="true">
      <svg className="boo-anim-svg" viewBox="0 0 64 64" aria-hidden="true">
        <g className="boo-anim-swing">
          <line x1="32" y1="4" x2="32" y2="17" stroke="#FFD166" strokeWidth="2.5" />
          <rect x="27" y="15" width="10" height="5" rx="2" fill="#00F5D4" />
          <ellipse cx="32" cy="35" rx="16" ry="14" fill="#F97316" stroke="#18181B" strokeWidth="2.8" />
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
          <stop offset="60%" stopColor="#FFF7ED" />
          <stop offset="100%" stopColor="#FFEDD5" />
        </linearGradient>
        <radialGradient id={glow} cx="50%" cy="52%" r="48%">
          <stop offset="0%" stopColor="#F97316" stopOpacity="0.28" />
          <stop offset="65%" stopColor="#00F5D4" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="128" cy="136" r="114" fill={"url(#" + glow + ")"} />

      <g opacity="0" aria-hidden="true">
        <path
          d="M 60 144 C 38 134 30 112 42 104 C 50 98 58 110 62 126 Z"
          fill={"url(#" + sheet + ")"}
          stroke="#18181B"
          strokeWidth="7.5"
          strokeLinejoin="round"
        />
        <path
          d="M 194 144 C 216 136 232 134 234 143 C 236 152 218 160 194 158 Z"
          fill={"url(#" + sheet + ")"}
          stroke="#18181B"
          strokeWidth="7.5"
          strokeLinejoin="round"
        />
        <g className="boo-hem">
          <path
            d="M 128 38 C 178 38 196 74 198 124 L 200 192 C 200 208 184 214 174 202 C 164 190 154 190 144 204 C 134 218 120 218 110 204 C 100 190 90 190 80 202 C 70 214 56 208 56 192 L 58 124 C 60 74 78 38 128 38 Z"
            fill={"url(#" + sheet + ")"}
            stroke="#18181B"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
        <g className="boo-awake">
          <Star cx="156" cy="119" size="10.5" fill="#FFD166" />
        </g>
        <g className="boo-squint">
          <path d="M 88 126 Q 102 109 116 126" fill="none" stroke="#18181B" strokeWidth="6.8" strokeLinecap="round" />
        </g>
        <g transform={shadesDown ? "translate(0 38) rotate(-5 128 82)" : "rotate(-6 128 76)"}>
          <rect x="82" y="61" width="42" height="29" rx="8.5" fill="#121216" stroke="#F97316" strokeWidth="4.2" />
          <rect x="134" y="61" width="42" height="29" rx="8.5" fill="#121216" stroke="#00F5D4" strokeWidth="4.2" />
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
          <rect x="0" y="0" width="62" height="26" rx="13" fill="#F97316" stroke="#FFFFFF" strokeWidth="3" />
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
  const {
    chrome,
    lines,
    filters,
    categories = [],
    regions = [],
    audiences = [],
    scareBands = [],
    budgetBands = [],
    haunts,
    picks,
    prompts,
  } = model;

  const [filter, setFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [audienceFilter, setAudienceFilter] = useState("all");
  const [scareFilter, setScareFilter] = useState("all");
  const [budgetFilter, setBudgetFilter] = useState("all");
  const [selectedPickId, setSelectedPickId] = useState(null);

  const [bubble, setBubble] = useState(chrome.greeting || lines[0]);
  const [gagIndex, setGagIndex] = useState(0);
  const [activeId, setActiveId] = useState("howlOrlando");
  const [hotId, setHotId] = useState(null);

  // Visitor-controlled Boo visibility & motion preferences persisted per session
  const [dismissed, setDismissed] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [motionPaused, setMotionPaused] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [heroVisible, setHeroVisible] = useState(true);

  const [quipAt, setQuipAt] = useState({});
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatReply, setChatReply] = useState("");
  const [chatIds, setChatIds] = useState(["howlOrlando", "howlTampa"]);
  const [cardPitches, setCardPitches] = useState({});
  const [emote, setEmote] = useState("wink");
  const [costume, setCostume] = useState("hype");
  const [kicker, setKicker] = useState(KICKERS[0].pill);
  const [aiSource, setAiSource] = useState("catalog");
  const [pop, setPop] = useState(0);

  const holdUntil = useRef(0);
  const emoteLock = useRef(0);
  const lastSeen = useRef(null);
  const flyRef = useRef(null);
  const activeRef = useRef(activeId);
  const reqSeqRef = useRef(0);
  const abortRef = useRef(null);
  const inFlightKeyRef = useRef("");
  const clientCacheRef = useRef(new Map());
  const inspectedSetRef = useRef(new Set());

  useEffect(() => { activeRef.current = activeId; }, [activeId]);

  // Restore sessionStorage preferences on mount (dismissed, minimized, motionPaused)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.dismissed === "boolean") setDismissed(parsed.dismissed);
        if (typeof parsed.minimized === "boolean") setMinimized(parsed.minimized);
        if (typeof parsed.motionPaused === "boolean") setMotionPaused(parsed.motionPaused);
      }
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setMotionPaused(true);
      }
    } catch { /* ignore */ }
  }, []);

  const persistSessionPref = (patch) => {
    if (typeof window === "undefined") return;
    try {
      const prevRaw = window.sessionStorage.getItem(SESSION_KEY);
      const prev = prevRaw ? JSON.parse(prevRaw) : {};
      const next = {
        dismissed,
        minimized,
        motionPaused,
        ...prev,
        ...patch,
      };
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
  };

  // Detect mobile software keyboard via visualViewport so Boo automatically yields space
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return undefined;
    const vv = window.visualViewport;
    const onResize = () => {
      const isKb = window.innerHeight - vv.height > 140;
      setKeyboardOpen(isKb);
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, []);

  // Track whether #boo-hero is in view so the floating dock stays compact while hero Boo is visible
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

  const cancelPendingRequest = () => {
    reqSeqRef.current += 1;
    inFlightKeyRef.current = "";
    if (abortRef.current) {
      try { abortRef.current.abort(); } catch { /* ignore */ }
      abortRef.current = null;
    }
    setPending(false);
  };

  // URL query continuity (?haunt=howlTampa, ?pick=kids, ?filter=family, ?region=tampa, ?date=2026-10-31)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search || "");
      const hauntParam = params.get("haunt");
      const pickParam = params.get("pick");
      const filterParam = params.get("filter");
      const regionParam = params.get("region");
      const dateParam = params.get("date");
      const audienceParam = params.get("audience");
      const scareParam = params.get("scare");
      const budgetParam = params.get("budget");

      if (regionParam && regions.some((r) => r.id === regionParam)) setRegionFilter(regionParam);
      if (dateParam) setDateFilter(dateParam);
      if (audienceParam && audiences.some((a) => a.id === audienceParam)) setAudienceFilter(audienceParam);
      if (scareParam && scareBands.some((s) => s.id === scareParam)) setScareFilter(scareParam);
      if (budgetParam && budgetBands.some((b) => b.id === budgetParam)) setBudgetFilter(budgetParam);

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
      if (
        filterParam &&
        (filters.some((f) => f.id === filterParam) || categories.some((c) => c.id === filterParam))
      ) {
        setFilter(filterParam);
      }
    } catch { /* ignore */ }
  }, [audiences, budgetBands, categories, filters, haunts, picks, regions, scareBands]);

  // Sync active filters cleanly to URL search params without scrolling or reloading
  useEffect(() => {
    if (typeof window === "undefined" || !window.history || typeof window.history.replaceState !== "function") return;
    try {
      const params = new URLSearchParams(window.location.search || "");
      const setOrDelete = (key, val) => {
        if (val && val !== "all") params.set(key, val);
        else params.delete(key);
      };
      setOrDelete("filter", filter);
      setOrDelete("region", regionFilter);
      setOrDelete("date", dateFilter);
      setOrDelete("audience", audienceFilter);
      setOrDelete("scare", scareFilter);
      setOrDelete("budget", budgetFilter);
      if (selectedPickId) params.set("pick", selectedPickId);
      else params.delete("pick");
      const qs = params.toString();
      const nextUrl = window.location.pathname + (qs ? "?" + qs : "") + (window.location.hash || "");
      window.history.replaceState(null, "", nextUrl);
    } catch { /* ignore */ }
  }, [filter, regionFilter, dateFilter, audienceFilter, scareFilter, budgetFilter, selectedPickId]);

  const speak = (text, holdMs) => {
    holdUntil.current = Date.now() + holdMs;
    setBubble(text);
    setPop((n) => n + 1);
  };

  // Multi-facet filter evaluation across all 31 statewide Florida experiences
  const shown = haunts.filter((row) => {
    if (filter !== "all") {
      const matchesFilter =
        (Array.isArray(row.filters) && row.filters.includes(filter)) ||
        row.category === filter;
      if (!matchesFilter) return false;
    }
    if (regionFilter !== "all" && row.region !== regionFilter) return false;
    if (dateFilter !== "all") {
      if (dateFilter === "daytime") {
        if (row.daypart !== "daytime" && row.daypart !== "both") return false;
      } else if (dateFilter === "nighttime") {
        if (row.daypart !== "nighttime" && row.daypart !== "both") return false;
      } else if (Array.isArray(row.operatingDates) && !row.operatingDates.includes(dateFilter)) {
        return false;
      }
    }
    if (audienceFilter !== "all") {
      const aud = row.audience;
      const matchesAud = Array.isArray(aud)
        ? aud.includes(audienceFilter)
        : aud === audienceFilter || (audienceFilter === "families" && aud === "kids");
      if (!matchesAud) return false;
    }
    if (scareFilter !== "all" && row.scareBand !== scareFilter) return false;
    if (budgetFilter !== "all" && row.budgetBand !== budgetFilter) return false;
    return true;
  });

  const hasActiveFilters =
    filter !== "all" ||
    regionFilter !== "all" ||
    dateFilter !== "all" ||
    audienceFilter !== "all" ||
    scareFilter !== "all" ||
    budgetFilter !== "all" ||
    Boolean(selectedPickId);

  const clearAllFilters = () => {
    cancelPendingRequest();
    setFilter("all");
    setRegionFilter("all");
    setDateFilter("all");
    setAudienceFilter("all");
    setScareFilter("all");
    setBudgetFilter("all");
    setSelectedPickId(null);
  };

  const selectedPick = picks.find((p) => p.id === selectedPickId) || null;
  const shortlistHaunts = selectedPick
    ? (selectedPick.shortlistIds || [selectedPick.hauntId]).map((id) => haunts.find((h) => h.id === id)).filter(Boolean)
    : [];

  // Passive scroll observation: updates Boo's cosmetic outfit & subtle tip ONLY when scrolled into the vault,
  // and NEVER scrolls the page, changes filters, or overwrites an active chat reply.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return undefined;
    const nodes = document.querySelectorAll("[data-haunt-id]");
    const io = new IntersectionObserver((entries) => {
      if (heroVisible) return;
      if (Date.now() < emoteLock.current) return;
      if (chatOpen || pending || chatReply) return;
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
    }, { threshold: [0.6] });
    nodes.forEach((node) => io.observe(node));
    return () => io.disconnect();
  }, [filter, regionFilter, dateFilter, audienceFilter, scareFilter, budgetFilter, haunts, chatOpen, pending, chatReply, heroVisible]);

  // Read-only AI recommendation handler: NEVER scrolls the page, NEVER changes active filters,
  // NEVER steals focus, and NEVER re-opens Boo if the visitor dismissed or minimized Boo.
  const showRecommendation = (data) => {
    const reply = cleanReply(data && data.reply) || lines[1];
    const ids = (data && data.recommendedIds || []).filter((id) => haunts.some((row) => row.id === id));
    const validIds = ids.length ? ids : ["howlOrlando"];
    setChatReply(reply);
    setChatIds(validIds);
    setAiSource(data && data.source === "claude" ? "claude" : "fallback");
    const first = haunts.find((row) => row.id === validIds[0]);
    if (first) {
      setActiveId(first.id);
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
    if (options.openFloatChat) {
      setChatOpen(true);
      setMinimized(false);
    }

    const activeContext = {
      region: regionFilter !== "all" ? regionFilter : undefined,
      category: filter !== "all" ? filter : undefined,
      scareBand: scareFilter !== "all" ? scareFilter : undefined,
      audience: audienceFilter !== "all" ? audienceFilter : undefined,
      budgetBand: budgetFilter !== "all" ? budgetFilter : undefined,
      dateWindow: dateFilter !== "all" ? dateFilter : undefined,
    };

    if (clientCacheRef.current.has(normKey)) {
      const cached = clientCacheRef.current.get(normKey);
      setKicker(cached.source === "claude" ? "BOO AI · VERIFIED CATALOG" : "VERIFIED CATALOG MATCH");
      showRecommendation(cached);
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
        body: JSON.stringify({ message, context: activeContext }),
        signal: controller ? controller.signal : undefined,
      });
      const data = await res.json();
      if (seq !== reqSeqRef.current) return;
      clientCacheRef.current.set(normKey, data);
      setKicker(data && data.source === "claude" ? "BOO AI · VERIFIED CATALOG" : "VERIFIED CATALOG MATCH");
      showRecommendation(data);
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
      showRecommendation({ reply: lines[1], recommendedIds: ["howlOrlando", "howlTampa"], source: "fallback" });
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

  // Pure local state: zero network calls, zero scroll side effects.
  const nextGag = () => {
    const next = (gagIndex + 1) % lines.length;
    setGagIndex(next);
    const tab = COSTUME_TABS[next % COSTUME_TABS.length];
    setCostume(tab.id);
    setEmote(tab.emote);
    setKicker(tab.kicker);
    speak(lines[next], 8000);
  };

  // Deterministic catalog ticket & fee explanation: zero network calls, zero scroll side effects.
  const roastPrice = () => {
    cancelPendingRequest();
    const pool = shown.length ? shown : haunts;
    const current = pool.find((row) => row.id === activeId) || pool[0];
    if (!current) return;
    setActiveId(current.id);
    emoteLock.current = Date.now() + 9000;
    setEmote("tongue");
    setCostume(costumeFor(current.id));
    setKicker("TICKET & FEE GUIDE");
    setAiSource("catalog");
    const note = current.priceNote ? " " + current.priceNote : "";
    speak(cleanReply(current.roast + note), 9000);
  };

  // Constraint-respecting deterministic suggestion: zero network calls, zero forced page jumps.
  const spinDeal = () => {
    cancelPendingRequest();
    const familyConstrained =
      filter === "family" ||
      selectedPickId === "kids" ||
      audienceFilter === "kids" ||
      audienceFilter === "families" ||
      scareFilter === "no-scare";
    const candidatePool = familyConstrained
      ? haunts.filter((row) => row.filters.includes("family"))
      : (shown.length ? shown : haunts);
    const nonCurrent = candidatePool.filter((row) => row.id !== activeId);
    const pool = nonCurrent.length ? nonCurrent : candidatePool;
    const pick = pool[Math.floor(Math.random() * pool.length)] || haunts[0];
    setActiveId(pick.id);
    setHotId(pick.id);
    setChatIds([pick.id]);
    emoteLock.current = Date.now() + 9000;
    setEmote(poseFor(pick.id));
    setCostume(costumeFor(pick.id));
    setKicker("BOO SUGGESTION · " + pick.city.toUpperCase());
    setAiSource("catalog");
    speak(cleanReply(pick.name + " in " + pick.city + ": " + pick.priceLabel + ". " + pick.timing + ". " + (pick.admissionNote || "")), 9000);
  };

  // Instant deterministic shortlist: zero network calls, zero forced page scroll.
  const pickScare = (item) => {
    cancelPendingRequest();
    const row = haunts.find((haunt) => haunt.id === item.hauntId);
    if (!row) return;
    setSelectedPickId(item.id);
    if (item.filterId) setFilter(item.filterId);
    setActiveId(row.id);
    emoteLock.current = Date.now() + 10000;
    setEmote(item.id === "terrify" ? "shades" : poseFor(row.id));
    setCostume(costumeFor(row.id));
    setKicker("SHORTLIST · " + item.label.toUpperCase());
    setAiSource("catalog");
    speak(item.pitch, 10000);
    trackHauntEvent("boo_preference_applied", {
      pick_id: item.id,
      filter_id: item.filterId || "all",
      shortlist_count: (item.shortlistIds || []).length,
    });
  };

  // Instant deterministic card insider verdict: zero network calls, zero scroll side effects.
  const askBoo = (row) => {
    cancelPendingRequest();
    const at = quipAt[row.id] || 0;
    setQuipAt({ ...quipAt, [row.id]: at + 1 });
    setActiveId(row.id);
    emoteLock.current = Date.now() + 10000;
    setEmote(poseFor(row.id));
    setCostume(costumeFor(row.id));
    setKicker("BOO'S VERIFIED TAKE");
    setAiSource("catalog");
    const quip = row.quips[at % row.quips.length];
    const detail = cleanReply(quip + (row.admissionNote ? " " + row.admissionNote + "." : ""));
    setCardPitches((prev) => ({ ...prev, [row.id]: detail }));
    speak(detail, 10000);
    trackHauntEvent("boo_haunt_inspected", { haunt_id: row.id, trigger: "ask_boo_button" });
  };

  const statusLabel = pending
    ? "Asking Boo..."
    : aiSource === "claude"
      ? "Boo AI · Verified Catalog"
      : aiSource === "fallback"
        ? "Verified Catalog Match"
        : "Verified Catalog · " + haunts.length + " Experiences";

  const categoryTabs = [
    ...filters,
    ...categories.filter((c) => !filters.some((f) => f.id === c.id)),
  ];

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
    <section
      className={"boo-page" + (motionPaused ? " is-motion-paused" : "")}
      aria-labelledby="boo-title"
      data-analytics-page="halloween_haunts"
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="boo-lights" aria-hidden="true">
        <svg className="boo-wire" viewBox="0 0 1200 80" preserveAspectRatio="none">
          <path d="M0 18 C40 18 70 52 110 52 C150 52 170 16 230 16 C290 16 310 56 370 56 C430 56 450 14 510 14 C570 14 590 58 650 58 C710 58 730 16 800 16 C860 16 880 54 950 54 C1010 54 1040 20 1200 28" fill="none" stroke="#FFD166" strokeWidth="2.5" />
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
            <button
              type="button"
              className="boo-home"
              aria-pressed={motionPaused}
              onClick={() => {
                setMotionPaused((prev) => {
                  const next = !prev;
                  persistSessionPref({ motionPaused: next });
                  return next;
                });
              }}
            >
              {motionPaused ? chrome.resumeMotion : chrome.pauseMotion}
            </button>
            {share}
          </div>
        </div>

        {/* 1. Hero & Immediate Discovery Controls */}
        <div id="boo-hero">
          <div className="boo-hero-grid">
            <div>
              <div className="boo-pill-row">
                <p className="boo-sheet-pill">FLORIDA HALLOWEEN DESTINATION · GOWAYFIND.COM</p>
                <p className="boo-eyebrow">{chrome.vip}</p>
              </div>
              <h1 id="boo-title">{chrome.heroPromise || chrome.title}</h1>
              <p className="boo-lede">{chrome.heroSubtitle} {chrome.lede}</p>
              <div className="boo-trust-strip">
                <p className="boo-note">{chrome.disclosure}</p>
                <p className="boo-note">{chrome.merit}</p>
              </div>

              <div className="boo-matcher-box">
                <p className="boo-who">{chrome.pick}</p>
                <p className="boo-matcher-sub">{chrome.helper || chrome.who}</p>
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

            {/* Right Column: Boo's Friendly Host Card */}
            <div className="boo-concierge-card">
              <div className="boo-stage-top">
                <p className="boo-badge">{chrome.vip}</p>
                <span className="boo-ai-status" data-boo-source={aiSource}>
                  <span className="boo-ai-dot" />
                  {statusLabel}
                </span>
              </div>

              <div className="boo-stage">
                <div className="boo-hero-sprite" onClick={nextGag} title="Tap Boo for a new tip and outfit">
                  <BooGhostSvg label={chrome.videoLabel} face={pending ? "shock" : emote} costume={costume} />
                </div>
                <div className="boo-copy">
                  <p className="boo-kicker">{kicker}</p>
                  <p key={pop} className="boo-bubble" data-boo-bubble="hero">{bubble}</p>
                </div>
              </div>

              <div className="boo-costume-bar" role="group" aria-label="Boo costume poses">
                {COSTUME_TABS.map((tab) => (
                  <button
                    type="button"
                    key={tab.id}
                    className={"boo-costume-btn" + (costume === tab.id ? " is-on" : "")}
                    onClick={() => {
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
                <a className="is-fill" href="#boo-vault">
                  {chrome.hauntScroll}
                </a>
              </div>

              {chatBox(false)}
            </div>
          </div>
        </div>

        {/* 2. Relevant Recommendations (Shortlist Panel when Visitor Selects a Preference) */}
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
                onClick={clearAllFilters}
              >
                Show All {haunts.length} Experiences
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
                      }}
                    >
                      Highlight Card
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* 3. Browsable Categories, Regions & Multi-Facet Discovery Controls */}
        <div id="boo-discovery-controls" className="boo-discovery-bar" aria-label="Florida Halloween discovery filters">
          <div className="boo-vault-header" style={{ marginBottom: 12 }}>
            <p className="boo-vault-title">Browse by Category, Florida Region & Date</p>
            <div className="boo-filters" role="toolbar" aria-label={chrome.eyebrow}>
              {categoryTabs.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={filter === item.id}
                  onClick={() => {
                    cancelPendingRequest();
                    setFilter(item.id);
                    trackHauntEvent("boo_preference_applied", { filter_id: item.id, pick_id: selectedPickId || "none" });
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="boo-facet-grid">
            <label className="boo-facet-group">
              <span className="boo-facet-label">Florida Region</span>
              <select
                className="boo-facet-select"
                aria-label="Filter by Florida region"
                value={regionFilter}
                onChange={(e) => setRegionFilter(e.target.value)}
              >
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>{r.label}</option>
                ))}
              </select>
            </label>

            <label className="boo-facet-group">
              <span className="boo-facet-label">Date or Window</span>
              <select
                className="boo-facet-select"
                aria-label="Filter by date or time window"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
              >
                <option value="all">Any Date or Window</option>
                <option value="2026-10-29">Thu Oct 29, 2026</option>
                <option value="2026-10-30">Fri Oct 30, 2026</option>
                <option value="2026-10-31">Halloween Night · Sat Oct 31</option>
                <option value="2026-11-01">Sun Nov 1, 2026</option>
                <option value="daytime">Daytime Plans Only</option>
                <option value="nighttime">After Dark Plans Only</option>
              </select>
            </label>

            <label className="boo-facet-group">
              <span className="boo-facet-label">Who Is Going</span>
              <select
                className="boo-facet-select"
                aria-label="Filter by group suitability"
                value={audienceFilter}
                onChange={(e) => setAudienceFilter(e.target.value)}
              >
                {audiences.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </select>
            </label>

            <label className="boo-facet-group">
              <span className="boo-facet-label">Scare Intensity</span>
              <select
                className="boo-facet-select"
                aria-label="Filter by scare intensity"
                value={scareFilter}
                onChange={(e) => setScareFilter(e.target.value)}
              >
                {scareBands.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </label>

            <label className="boo-facet-group">
              <span className="boo-facet-label">Budget</span>
              <select
                className="boo-facet-select"
                aria-label="Filter by budget"
                value={budgetFilter}
                onChange={(e) => setBudgetFilter(e.target.value)}
              >
                {budgetBands.map((b) => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </select>
            </label>
          </div>

          {hasActiveFilters ? (
            <div className="boo-active-filters" aria-live="polite">
              <span>Showing {shown.length} of {haunts.length} verified Florida experiences</span>
              {filter !== "all" ? <span className="boo-active-chip">Category: {filter}</span> : null}
              {regionFilter !== "all" ? <span className="boo-active-chip">Region: {regionFilter}</span> : null}
              {dateFilter !== "all" ? <span className="boo-active-chip">Window: {dateFilter}</span> : null}
              {audienceFilter !== "all" ? <span className="boo-active-chip">Group: {audienceFilter}</span> : null}
              {scareFilter !== "all" ? <span className="boo-active-chip">Scare: {scareFilter}</span> : null}
              {budgetFilter !== "all" ? <span className="boo-active-chip">Budget: {budgetFilter}</span> : null}
              <button type="button" className="boo-clear-btn" onClick={clearAllFilters}>
                Clear All Filters
              </button>
            </div>
          ) : null}
        </div>

        {/* 4. Event Details & Ticket Choices */}
        <div id="boo-vault" data-haunt-vault="">
          <div className="boo-vault-header">
            <p className="boo-vault-title">
              {shown.length === haunts.length
                ? haunts.length + " Verified Florida Halloween Experiences"
                : shown.length + " Matching Florida Halloween Experiences"}
            </p>
          </div>

          {shown.length ? (
            <div className="boo-vault-grid">
              {shown.map((row) => {
                const catObj = categories.find((c) => c.id === row.category);
                const catLabel = catObj
                  ? catObj.label
                  : row.filters.includes("family")
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
                    data-region={row.region}
                    data-category={row.category}
                    className={"boo-card" + (activeId === row.id ? " is-active" : "") + (hotId === row.id ? " is-hot" : "")}
                    onMouseEnter={() => focusHaunt(row)}
                    onFocus={() => focusHaunt(row)}
                    onClick={() => focusHaunt(row, true)}
                  >
                    {row.imageUrl ? (
                      <div className="boo-card-media">
                        <img
                          className="boo-card-img"
                          src={row.imageUrl}
                          alt={row.imageAlt || row.name}
                          loading="lazy"
                          decoding="async"
                        />
                        {(row.imageBadge || row.imageKind) ? <span className="boo-photo-badge">{row.imageBadge || row.imageKind}</span> : null}
                      </div>
                    ) : null}

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
            <div className="boo-empty-box" data-boo-empty="">
              <h3>No exact matches for that combination</h3>
              <p>{chrome.empty}</p>
              <div className="boo-empty-actions">
                {regionFilter !== "all" ? (
                  <button type="button" className="boo-clear-btn" onClick={() => setRegionFilter("all")}>
                    Broaden Region to All Florida
                  </button>
                ) : null}
                {dateFilter !== "all" ? (
                  <button type="button" className="boo-clear-btn" onClick={() => setDateFilter("all")}>
                    Include All Dates
                  </button>
                ) : null}
                {scareFilter !== "all" ? (
                  <button type="button" className="boo-clear-btn" onClick={() => setScareFilter("all")}>
                    Include All Scare Levels
                  </button>
                ) : null}
                <button type="button" className="boo-clear-btn" onClick={clearAllFilters}>
                  Reset All Filters ({haunts.length} Experiences)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 5. Practical Florida Halloween Planning Information */}
        <section id="boo-planning-guide" className="boo-planning" aria-label="Practical Florida Halloween planning guide">
          <h2>Florida Halloween Planning Guide</h2>
          <p className="boo-planning-sub">
            Honest logistics on separate nighttime tickets vs. daytime park admission, age suitability, and weather.
          </p>
          <div className="boo-planning-grid">
            <div className="boo-planning-card">
              <h3>1. Separate Ticket vs. Included Admission</h3>
              <p>
                Major nighttime haunts (Universal Horror Nights, Disney Not So Scary, Busch Gardens and SeaWorld Howl O Scream) require a separate evening ticket. Daytime fall events (SeaWorld Spooktacular, LEGOLAND Brick or Treat, Peppa Pig, ZooTampa, Zoo Miami, Clearwater Marine Aquarium) are included with regular admission.
              </p>
            </div>
            <div className="boo-planning-card">
              <h3>2. Age Guidance & Scare Intensity</h3>
              <p>
                Extreme haunts use intense fog, strobes, and startle actors and are recommended for ages 13 and up. Families with younger kids should filter by Kid Friendly (No Scares) or Mild Spooky Fun for trick or treat trails and costume parades.
              </p>
            </div>
            <div className="boo-planning-card">
              <h3>3. Timed Entry, Parking & Weather</h3>
              <p>
                Popular October nights sell out online ahead of the gate. Theme park parking runs $30 to $35 in Orlando and Tampa, while local trails like Sir Henry's and Scream A Geddon include free lot parking. Walking ghost tours run rain or shine.
              </p>
            </div>
            <div className="boo-planning-card">
              <h3>4. How Wayfind Ticket Links Work</h3>
              <p>
                When a verified partner (Undercover Tourist, Tiqets, or US Ghost Adventures) offers the exact admission type required, we link directly to that partner offer. When no partner carries the event, we link straight to the official venue box office or free community guide.
              </p>
            </div>
          </div>
          <a className="boo-home is-fill boo-bottom-home" href="/">{chrome.homeBottom}</a>
        </section>
      </div>

      {/* Non-Intrusive Floating Boo Companion Dock */}
      {dismissed ? (
        <button
          type="button"
          className="boo-show"
          onClick={() => {
            setDismissed(false);
            persistSessionPref({ dismissed: false });
          }}
        >
          {chrome.show}
        </button>
      ) : (
        <aside
          ref={flyRef}
          className={
            "boo-fly" +
            (chatOpen ? " is-chat" : "") +
            (minimized ? " is-minimized" : "") +
            (heroVisible && !chatOpen ? " is-hero-docked" : "") +
            (keyboardOpen ? " is-keyboard" : "")
          }
          data-boo-fly=""
          aria-label={chrome.floatLabel}
        >
          <div className="boo-fly-card">
            <div className="boo-fly-col">
              {/* Decorative mascot artwork: pointer-events: none so underlying page links remain clickable */}
              <div className="boo-fly-mascot" data-boo-decorative="true" aria-hidden="true">
                <BooGhostSvg label="" face={pending ? "shock" : emote} costume={costume} />
              </div>
              <div className="boo-fly-copy">
                {!minimized && !keyboardOpen ? (
                  <p className="boo-float-bubble" data-boo-bubble="float">{bubble}</p>
                ) : null}
                <div className="boo-fly-btns">
                  <button
                    type="button"
                    className="boo-open"
                    onClick={() => {
                      setChatOpen((open) => {
                        const next = !open;
                        if (next) setMinimized(false);
                        return next;
                      });
                    }}
                  >
                    {chatOpen ? "Close Chat" : chrome.openChat}
                  </button>
                  <button
                    type="button"
                    className="boo-min"
                    aria-pressed={minimized}
                    onClick={() => {
                      setMinimized((prev) => {
                        const next = !prev;
                        if (next) setChatOpen(false);
                        persistSessionPref({ minimized: next });
                        return next;
                      });
                    }}
                  >
                    {minimized ? chrome.expand : chrome.minimize}
                  </button>
                  <button
                    type="button"
                    className="boo-min"
                    aria-pressed={motionPaused}
                    onClick={() => {
                      setMotionPaused((prev) => {
                        const next = !prev;
                        persistSessionPref({ motionPaused: next });
                        return next;
                      });
                    }}
                  >
                    {motionPaused ? chrome.resumeMotion : chrome.pauseMotion}
                  </button>
                  <button
                    type="button"
                    className="boo-hide"
                    onClick={() => {
                      setChatOpen(false);
                      setDismissed(true);
                      persistSessionPref({ dismissed: true });
                    }}
                  >
                    {chrome.hide}
                  </button>
                </div>
              </div>
            </div>
            {chatOpen && !minimized ? chatBox(true) : null}
          </div>
        </aside>
      )}
    </section>
  );
}
