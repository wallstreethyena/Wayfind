"use client";
// The insider-tips homepage mockup (see ./page.js). One "Where are you headed?"
// box, real tip cards with photos and a save heart, and one gentle sign-up
// nudge after the first save. Saves stay in this browser under a preview-only
// key so the mockup never touches anyone's real favorites.
import { useCallback, useEffect, useRef, useState } from "react";
import { styleHtml } from "../../../lib/styleHtml.js";
import { safeLocalStorage } from "../../../lib/safeStorage.js";
import { emitCommerce, mintClickId } from "../../../lib/commerce.js";
import { planRowOrganizerClick } from "../../../lib/partnerClick.js";
import { CHRISTMAS_WEEKEND_SURFACE } from "../../../lib/christmasWeekendTile.js";
import { TicketCard, XM_CARD_CSS } from "../../components/ChristmasTicketCard.js";

const SAVE_KEY = "wf_preview_insider_saves";
const NUDGE_KEY = "wf_preview_insider_nudge_dismissed";

const safe = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
const store = () => safeLocalStorage();
const readSaves = () => safe(() => new Set(JSON.parse((store() && store().getItem(SAVE_KEY)) || "[]")), new Set());

// "gemini-3-pro-preview" -> "Gemini 3 Pro": the reader sees which AI wrote the line.
function modelName(id) {
  const m = /^gemini-([\d.]+)-([a-z]+)/i.exec(String(id || ""));
  return m ? `Gemini ${m[1]} ${m[2].charAt(0).toUpperCase()}${m[2].slice(1)}` : "AI";
}

// Plain labels for the inventory's category slugs.
const KIND = { attractions: "Things to do", activities: "Things to do", beach: "Beach", beaches: "Beach", food: "Eat", restaurants: "Eat", nightlife: "Night out", shopping: "Shop", hotels: "Stay", parks: "Outdoors", outdoors: "Outdoors", museums: "Museum", culture: "Culture" };
const kindLabel = (c) => KIND[String(c || "").toLowerCase()] || (c ? String(c).replace(/[-_]/g, " ").replace(/^\w/, (m) => m.toUpperCase()) : "");

function openSignIn() {
  const door = safe(() => document.querySelector(".wf-signin-button"), null);
  if (door) { safe(() => door.click()); return; }
  window.location.href = "/?go=saved";
}

const CSS = `
.it-page{--it-bg:#05080F;--it-card:#0B1220;--it-card2:#0F182A;--it-line:#1B2537;--it-line2:#26334A;--it-text:#F6F2EA;--it-soft:#A7B1C0;--it-faint:#6E7A8C;--it-warm:#FF8A3D;--it-warm2:#FFB15E;--it-pink:#FF4F8B;
  color:var(--it-text);background:radial-gradient(900px 420px at 50% -120px,rgba(255,138,61,.18),transparent 70%),radial-gradient(700px 380px at 90% 30%,rgba(138,60,255,.07),transparent 70%),var(--it-bg);
  min-height:100dvh;font-family:var(--wf-sans);padding:0 16px 150px;box-sizing:border-box;overflow-x:clip;-webkit-font-smoothing:antialiased}
.it-page *{box-sizing:border-box}
.it-wrap{max-width:1120px;margin:0 auto}
.it-hero{padding:44px 0 0;text-align:center}
.it-eyebrow{display:inline-flex;align-items:center;gap:10px;font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--it-soft);margin:0 0 18px;padding:7px 14px;border:1px solid var(--it-line);border-radius:999px;background:rgba(255,255,255,.02)}
.it-dot{width:8px;height:8px;border-radius:50%;background:linear-gradient(135deg,#FFC23D,var(--it-warm),var(--it-pink),#8A3CFF);box-shadow:0 0 12px rgba(255,138,61,.6)}
.it-h1{font-family:var(--wf-display),Georgia,serif;font-weight:600;font-size:clamp(34px,6vw,62px);line-height:1.02;letter-spacing:-.025em;margin:0 0 10px}
.it-sub{margin:0 auto 22px;max-width:520px;color:var(--it-soft);font-size:clamp(15px,2vw,17px);line-height:1.5}
.it-form{position:relative;max-width:660px;margin:0 auto}
.it-form svg.it-pin{position:absolute;left:22px;top:50%;transform:translateY(-50%);width:20px;height:20px;color:var(--it-warm);pointer-events:none}
.it-input{width:100%;height:64px;border-radius:999px;border:1px solid var(--it-line2);background:linear-gradient(180deg,#0F1729,#0B1322);color:var(--it-text);font:500 17px/1 var(--wf-sans);padding:0 140px 0 54px;outline:none;transition:border-color .2s,box-shadow .2s;box-shadow:0 10px 40px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.04);-webkit-appearance:none;appearance:none}
.it-input::-webkit-search-cancel-button{-webkit-appearance:none}
.it-input::placeholder{color:var(--it-faint)}
.it-input:focus{border-color:var(--it-warm);box-shadow:0 0 0 4px rgba(255,138,61,.16),0 10px 40px rgba(0,0,0,.35)}
.it-go{position:absolute;right:7px;top:7px;height:50px;padding:0 24px;border-radius:999px;border:0;background:linear-gradient(180deg,var(--it-warm2),var(--it-warm));color:#1A0E05;font:700 16px/1 var(--wf-sans);cursor:pointer;box-shadow:0 6px 18px rgba(255,138,61,.35);transition:transform .15s,box-shadow .15s}
.it-go:hover{transform:translateY(-1px);box-shadow:0 8px 22px rgba(255,138,61,.45)}
.it-go:disabled{opacity:.75;cursor:progress;transform:none}
.it-go:focus-visible,.it-chip:focus-visible,.it-heart:focus-visible,.it-nudge button:focus-visible,.it-join button:focus-visible{outline:3px solid #FFC23D;outline-offset:2px}
.it-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin:18px auto 0;max-width:660px}
.it-chip{border:1px solid var(--it-line);background:rgba(255,255,255,.02);color:var(--it-soft);border-radius:999px;padding:9px 15px;font:600 14px/1 var(--wf-sans);cursor:pointer;transition:color .15s,border-color .15s,background .15s}
.it-chip:hover{color:var(--it-text);border-color:var(--it-line2)}
.it-chip[aria-pressed="true"]{color:#1A0E05;border-color:var(--it-warm);background:var(--it-warm)}
.it-trust{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 18px;margin:22px 0 0;color:var(--it-faint);font-size:13px}
.it-trust span{display:inline-flex;align-items:center;gap:6px}
.it-trust svg{width:15px;height:15px;color:#3CCB7F}
.it-head{display:flex;flex-direction:column;align-items:center;gap:10px;margin:52px 0 22px;text-align:center}
.it-kicker{font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--it-warm)}
.it-intro{min-height:30px;margin:0;font-family:var(--wf-display),Georgia,serif;font-weight:500;font-size:clamp(22px,3.4vw,30px);line-height:1.2;letter-spacing:-.01em;max-width:760px;transition:opacity .25s}
.it-intro.dim{opacity:.45}
.it-ai{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--it-soft);padding:5px 10px;border-radius:999px;border:1px solid var(--it-line);background:rgba(138,60,255,.08)}
.it-ai svg{width:13px;height:13px;color:#B98CFF}
.it-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px;transition:opacity .25s}
.it-grid.dim{opacity:.5}
@media (max-width:980px){.it-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:640px){.it-hero{padding:26px 0 0}.it-eyebrow{margin-bottom:12px}.it-grid{grid-template-columns:1fr;gap:16px}.it-input{height:58px;font-size:16px;padding-right:118px;padding-left:48px}.it-form svg.it-pin{left:18px}.it-go{height:46px;top:6px;right:6px;padding:0 18px;font-size:15px}.it-head{margin-top:40px}}
.it-card{position:relative;display:flex;flex-direction:column;background:linear-gradient(180deg,var(--it-card2),var(--it-card));border:1px solid var(--it-line);border-radius:20px;overflow:hidden;transition:transform .25s,border-color .25s,box-shadow .25s;box-shadow:0 1px 0 rgba(255,255,255,.03) inset,0 14px 40px rgba(0,0,0,.28)}
.it-card:hover{transform:translateY(-3px);border-color:var(--it-line2);box-shadow:0 1px 0 rgba(255,255,255,.04) inset,0 22px 50px rgba(0,0,0,.4)}
.it-card a{color:inherit;text-decoration:none;display:flex;flex-direction:column;flex:1}
.it-card a:focus-visible{outline:3px solid #FFC23D;outline-offset:-3px;border-radius:20px}
.it-media{position:relative;overflow:hidden;background:#111A2B}
.it-photo{display:block;width:100%;height:auto;aspect-ratio:4/3;object-fit:cover;transition:transform .6s ease}
.it-card:hover .it-photo{transform:scale(1.03)}
.it-media::after{content:"";position:absolute;inset:auto 0 0 0;height:45%;background:linear-gradient(180deg,transparent,rgba(5,8,15,.55));pointer-events:none}
.it-place{position:absolute;left:12px;bottom:12px;z-index:1;display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:rgba(5,8,15,.6);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:#fff;font-size:12.5px;font-weight:600;border:1px solid rgba(255,255,255,.12)}
.it-place svg{width:13px;height:13px;color:var(--it-warm2)}
.it-body{padding:16px 18px 18px;display:flex;flex-direction:column;gap:10px;flex:1}
.it-titlerow{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.it-name{font-weight:700;font-size:18px;line-height:1.25;margin:0;letter-spacing:-.005em}
.it-kind{flex:none;font-size:11.5px;font-weight:600;letter-spacing:.04em;color:var(--it-soft);padding:3px 8px;border-radius:6px;background:rgba(255,255,255,.05)}
.it-tipbox{position:relative;margin:2px 0 0;padding:12px 14px 12px 16px;border-radius:12px;background:rgba(255,138,61,.07);border:1px solid rgba(255,138,61,.16)}
.it-tipbox::before{content:"";position:absolute;left:0;top:12px;bottom:12px;width:3px;border-radius:3px;background:linear-gradient(180deg,var(--it-warm2),var(--it-pink))}
.it-tiplabel{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--it-warm2);margin:0 0 5px}
.it-tiplabel svg{width:13px;height:13px}
.it-tip{font-size:15.5px;line-height:1.5;margin:0;color:var(--it-text)}
.it-ai.working svg{animation:it-pulse 1.4s ease-in-out infinite}
@keyframes it-pulse{50%{opacity:.35;transform:scale(.85)}}
@keyframes it-shim{to{background-position:-200% 0}}
.it-foot{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-top:auto;padding-top:4px}
.it-credit{font-size:11px;color:var(--it-faint);margin:0;line-height:1.35;overflow-wrap:anywhere}
.it-more{flex:none;display:inline-flex;align-items:center;gap:4px;font-size:13.5px;font-weight:700;color:var(--it-warm2)}
.it-more svg{width:15px;height:15px;transition:transform .2s}
.it-card:hover .it-more svg{transform:translateX(3px)}
.it-heart{position:absolute;top:12px;right:12px;width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.14);background:rgba(5,8,15,.55);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:grid;place-items:center;cursor:pointer;z-index:2;transition:transform .15s}
.it-heart:active{transform:scale(.9)}
.it-heart svg{width:22px;height:22px}
.it-heart[aria-pressed="true"]{background:rgba(255,79,139,.18);border-color:rgba(255,79,139,.5)}
.it-heart[aria-pressed="true"] svg{animation:it-pop .35s ease}
@keyframes it-pop{40%{transform:scale(1.25)}}
@media (prefers-reduced-motion:reduce){.it-ai.working svg,.it-heart[aria-pressed="true"] svg{animation:none}.it-card,.it-card:hover,.it-photo,.it-card:hover .it-photo{transition:none;transform:none}}
.it-sell{margin:6px 0 0}
.it-sellhead{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:4px 14px;margin:0 0 12px}
.it-sellhead h2{margin:0;font-family:var(--wf-display),Georgia,serif;font-weight:600;font-size:clamp(22px,3vw,28px);line-height:1.15;letter-spacing:-.01em}
.it-sellhead p{margin:0;color:var(--it-soft);font-size:13.5px}
.it-tiles{display:flex;gap:14px;margin:0 -16px;padding:4px 16px 14px;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;list-style:none;scrollbar-width:none}
.it-tiles::-webkit-scrollbar{display:none}
.it-tile{flex:0 0 min(76vw,284px);scroll-snap-align:start;display:flex;min-width:0}
.it-tcard{position:relative;display:flex;flex-direction:column;width:100%;min-width:0;border-radius:18px;overflow:hidden;background:linear-gradient(180deg,var(--it-card2),var(--it-card));border:1px solid var(--it-line2);box-shadow:0 14px 34px rgba(0,0,0,.32)}
.it-topen{display:flex;flex-direction:column;flex:1;color:inherit;text-decoration:none}
.it-topen:focus-visible,.it-tbuy:focus-visible{outline:3px solid #FFC23D;outline-offset:-3px}
.it-tmedia{position:relative;background:#111A2B}
.it-tphoto{display:block;width:100%;height:auto;aspect-ratio:16/10;object-fit:cover}
.it-tbadge{position:absolute;left:10px;top:10px;z-index:1;display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:999px;background:linear-gradient(180deg,#FFE7A3,#F5C451);color:#3A2200;font-size:11.5px;font-weight:800;letter-spacing:.01em;box-shadow:0 4px 12px rgba(0,0,0,.35)}
.it-tbadge svg{width:12px;height:12px}
.it-turgent{position:absolute;left:10px;bottom:10px;z-index:1;padding:4px 9px;border-radius:999px;background:#E8343F;color:#fff;font-size:11.5px;font-weight:800}
.it-tbody{display:flex;flex-direction:column;gap:5px;padding:12px 14px 10px}
.it-ttitle{margin:0;font-size:16.5px;font-weight:750;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.it-tmeta{margin:0;color:var(--it-soft);font-size:13px;line-height:1.35}
.it-trate{display:flex;align-items:center;gap:5px;margin:0;font-size:13px;color:var(--it-text);font-weight:700}
.it-trate span{color:var(--it-faint);font-weight:500}
.it-trate svg{width:14px;height:14px;color:#F5B83D}
.it-tfoot{margin-top:auto;display:grid;gap:7px;padding:2px 14px 14px}
.it-tbuy{display:flex;align-items:center;justify-content:center;gap:8px;min-height:48px;border-radius:12px;background:linear-gradient(180deg,var(--it-warm2),var(--it-warm));color:#1A0E05;font:800 15.5px/1 var(--wf-sans);text-decoration:none;box-shadow:0 8px 20px rgba(255,138,61,.3)}
.it-tbuy svg{width:16px;height:16px}
.it-tprice{margin:0;text-align:center;color:var(--it-soft);font-size:13px}
.it-tprice b{color:var(--it-text)}
.it-tcard .it-heart{width:40px;height:40px;top:10px;right:10px}
.it-trustbar{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 18px;margin:16px 0 26px;color:var(--it-soft);font-size:13px}
.it-trustbar span{display:inline-flex;align-items:center;gap:6px}
.it-trustbar svg{width:15px;height:15px;color:#3CCB7F}
.it-signup{margin:26px 0 0}
.it-signup > section{margin:0 auto !important;max-width:none !important;padding:0 !important}
.it-find{margin:54px 0 0;padding:34px 0 0;border-top:1px solid var(--it-line);text-align:center}
.it-find .it-h2{font-family:var(--wf-display),Georgia,serif;font-weight:600;font-size:clamp(30px,5vw,48px);line-height:1.05;letter-spacing:-.02em;margin:0 0 10px}
.it-xmas{margin:56px 0 0}
.it-xmas .it-sellhead{margin-bottom:14px}
.it-xgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;list-style:none;margin:0;padding:0}
@media (max-width:980px){.it-xgrid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:640px){.it-xgrid{grid-template-columns:1fr}.it-find{margin-top:40px;padding-top:28px}}
.it-skel{border-radius:20px;border:1px solid var(--it-line);background:var(--it-card);overflow:hidden}
.it-skel div{background:linear-gradient(90deg,#111A2B 0%,#1A2540 50%,#111A2B 100%);background-size:200% 100%;animation:it-shim 1.2s infinite}
.it-join{display:flex;align-items:center;justify-content:space-between;gap:18px;margin:36px 0 0;padding:22px 24px;border-radius:20px;border:1px solid var(--it-line);background:linear-gradient(120deg,rgba(255,138,61,.10),rgba(138,60,255,.08))}
.it-join h3{margin:0 0 4px;font-family:var(--wf-display),Georgia,serif;font-weight:600;font-size:22px;line-height:1.2}
.it-join p{margin:0;color:var(--it-soft);font-size:14.5px;line-height:1.45}
.it-join button{flex:none;border:0;border-radius:999px;background:var(--it-text);color:#0B1220;font:700 15px/1 var(--wf-sans);padding:14px 20px;cursor:pointer}
@media (max-width:640px){.it-join{flex-direction:column;align-items:flex-start}.it-join button{width:100%}}
.it-note{margin:22px auto 0;text-align:center;font-size:12.5px;color:var(--it-faint);max-width:600px;line-height:1.55}
.it-nudge{position:fixed;left:50%;bottom:calc(14px + var(--it-bar,0px));transform:translateX(-50%);width:min(560px,calc(100vw - 32px));background:#111A2A;border:1px solid var(--it-line2);border-radius:18px;padding:14px 16px;display:flex;align-items:center;gap:12px;box-shadow:0 18px 40px rgba(0,0,0,.5);z-index:2147483000;animation:it-up .3s ease}
@keyframes it-up{from{opacity:0;transform:translate(-50%,12px)}}
.it-nudge p{margin:0;flex:1;font-size:14.5px;line-height:1.4;color:var(--it-text)}
.it-nudge p span{color:var(--it-soft)}
.it-nudge .yes{border:0;border-radius:999px;background:var(--it-warm);color:#1A0E05;font:700 14px/1 var(--wf-sans);padding:11px 14px;cursor:pointer;white-space:nowrap}
.it-nudge .no{border:0;background:transparent;color:var(--it-soft);font:500 13px/1 var(--wf-sans);padding:8px 4px;cursor:pointer}
@media (max-width:420px){.it-nudge{flex-wrap:wrap}.it-nudge p{flex-basis:100%}}
.it-empty{text-align:center;color:var(--it-soft);padding:30px 0}
.it-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
`;

const Icon = {
  pin: <svg className="it-pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>,
  place: <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a7 7 0 0 0-7 7c0 5.3 7 13 7 13s7-7.7 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" /></svg>,
  check: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>,
  spark: <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2zm7 12 .9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9L19 14z" /></svg>,
  bulb: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" /></svg>,
  star: <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" /></svg>,
  award: <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 14.4l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z" opacity=".9" /><path d="M8 17.5L6.5 22l3-1.2L12 23l-1-4.6zM16 17.5l1.5 4.5-3-1.2L12 23l1-4.6z" /></svg>,
  ticket: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8a2 2 0 0 0 2-2h14a2 2 0 0 0 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0-2 2H5a2 2 0 0 0-2-2v-2a2 2 0 0 0 0-4z" /><path d="M13 6v12" strokeDasharray="2 2.5" /></svg>,
  arrow: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
};

function Heart({ on }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 7.9 3.6 4.5 7 4.5c2 0 3.6 1.1 5 2.9 1.4-1.8 3-2.9 5-2.9 3.4 0 5.6 3.4 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" fill={on ? "#FF4F8B" : "none"} stroke={on ? "#FF4F8B" : "#fff"} strokeWidth="1.8" strokeLinejoin="round" /></svg>
  );
}

function TipCard({ c, saved, onSave, onBroken }) {
  return (
    <article className="it-card" data-insider-card={c.id}>
      <button type="button" className="it-heart" aria-pressed={saved ? "true" : "false"} aria-label={(saved ? "Remove " : "Save ") + c.name} onClick={() => onSave(c.id)}>
        <Heart on={saved} />
      </button>
      <a href={c.href} aria-label={c.name + ", " + c.town}>
        <div className="it-media">
          <img className="it-photo" src={c.photo} alt={c.name} loading="lazy" decoding="async" width="640" height="480" onError={() => onBroken(c.id)} />
          {c.town ? <span className="it-place">{Icon.place}{c.town}</span> : null}
        </div>
        <div className="it-body">
          <div className="it-titlerow">
            <h2 className="it-name">{c.name}</h2>
            {kindLabel(c.category) ? <span className="it-kind">{kindLabel(c.category)}</span> : null}
          </div>
          <div className="it-tipbox" title={c.ai ? "Wayfind's verified tip: " + c.tip : undefined}>
            <p className="it-tiplabel">{Icon.bulb}Insider tip</p>
            <p className="it-tip">{c.line}</p>
          </div>
          <div className="it-foot">
            {c.credit ? <p className="it-credit">Photo: {c.credit}</p> : <span />}
            <span className="it-more">See it{Icon.arrow}</span>
          </div>
        </div>
      </a>
    </article>
  );
}

// A tap on an organizer's own ticket page leaves our site, so it is recorded
// here, the same way the Christmas weekend row records it. Partner /go links
// are recorded by the server route itself.
function organizerTap(tile) {
  try {
    const plan = planRowOrganizerClick(
      { id: tile.slug || tile.id, slug: tile.slug || null, cta: { href: tile.cta.href } },
      CHRISTMAS_WEEKEND_SURFACE,
      { locationHost: typeof location !== "undefined" ? location.host : undefined, mint: mintClickId },
    );
    if (plan) emitCommerce("commerce_cta_clicked", plan.ctx);
  } catch { /* ignore */ }
}

function SellTile({ t, saved, onSave, onBroken }) {
  const partner = t.cta.partner === "Official Tickets" ? "the official site" : t.cta.partner;
  const affiliate = t.cta.kind === "affiliate";
  const head = (
    <>
      <div className="it-tmedia">
        <img className="it-tphoto" src={t.photo} alt={t.title} loading="lazy" decoding="async" width="640" height="400" onError={() => onBroken(t.id)} />
        {t.topRated ? <span className="it-tbadge">{Icon.award}Top rated on Wayfind</span> : null}
        {t.urgency ? <span className="it-turgent">{t.urgency}</span> : null}
      </div>
      <div className="it-tbody">
        <h3 className="it-ttitle">{t.title}</h3>
        <p className="it-tmeta">{[t.city, t.when].filter(Boolean).join(" · ")}</p>
        {t.rating ? <p className="it-trate">{Icon.star}{t.rating.stars.toFixed(1)}{t.rating.reviews ? <span>({t.rating.reviews.toLocaleString("en-US")} reviews)</span> : null}</p> : null}
      </div>
    </>
  );
  return (
    <li className="it-tile" data-sell-tile={t.id}>
      <article className="it-tcard">
        <button type="button" className="it-heart" aria-pressed={saved ? "true" : "false"} aria-label={(saved ? "Remove " : "Save ") + t.title} onClick={() => onSave(t.id)}>
          <Heart on={saved} />
        </button>
        {t.href ? <a className="it-topen" href={t.href}>{head}</a> : <div className="it-topen">{head}</div>}
        <div className="it-tfoot">
          <a className="it-tbuy" href={t.cta.href} target="_blank"
            rel={affiliate ? "sponsored nofollow noopener" : "nofollow noopener"}
            data-commerce-owner={affiliate ? undefined : "InsiderTipsPreview"}
            onClick={affiliate ? undefined : () => organizerTap(t)}
            aria-label={"Get tickets for " + t.title + " on " + partner + ", opens in a new tab"}>{Icon.ticket}Get tickets</a>
          <p className="it-tprice">{t.price ? <><b>{t.price}</b>{" · "}</> : null}on {partner}</p>
        </div>
      </article>
    </li>
  );
}

function weekendText(win) {
  if (!Array.isArray(win) || win.length !== 2) return "";
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const D = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const one = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "")); if (!m) return ""; return D[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()] + " " + M[+m[2] - 1] + " " + +m[3]; };
  return win[0] === win[1] ? one(win[0]) : [one(win[0]), one(win[1])].filter(Boolean).join(" to ");
}

export default function InsiderTipsClient({ initial, quickPicks = [], tipCount = 0, sell = null, signup = null }) {
  const [answer, setAnswer] = useState(initial);
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState("");
  // "plain": fetching the verified tips for a new town; "ai": verified tips on
  // screen while Gemini rewrites them; "done": settled.
  const [phase, setPhase] = useState("ai");
  const [saves, setSaves] = useState(() => new Set());
  const [nudge, setNudge] = useState(false);
  // A photo that fails to load takes its card with it: never a grey box.
  const [broken, setBroken] = useState(() => new Set());
  const onBroken = useCallback((id) => setBroken((prev) => (prev.has(id) ? prev : new Set(prev).add(id))), []);
  const seq = useRef(0);

  const ask = useCallback(async (text) => {
    const my = ++seq.current;
    const url = "/api/preview/insider-tips?q=" + encodeURIComponent(text);
    const get = async (u) => { try { const r = await fetch(u, { headers: { accept: "application/json" } }); const d = r.ok ? await r.json() : null; return d && Array.isArray(d.cards) ? d : null; } catch { return null; } };
    setAsked(text);
    // A new town: show its verified tips at once, then let the AI rewrite them.
    if (text) {
      setPhase("plain");
      const plain = await get(url + "&plain=1");
      if (my !== seq.current) return;
      if (plain) setAnswer(plain);
    }
    setPhase("ai");
    const data = await get(url);
    if (my !== seq.current) return;
    if (data) setAnswer(data);
    setPhase("done");
  }, []);

  useEffect(() => { setSaves(readSaves()); ask(""); }, [ask]);

  const onSave = useCallback((id) => {
    setSaves((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      safe(() => store() && store().setItem(SAVE_KEY, JSON.stringify([...next])));
      if (next.size > prev.size && !safe(() => store() && store().getItem(NUDGE_KEY), null)) setNudge(true);
      return next;
    });
  }, []);

  // The site shell can pin its own bar to the bottom of the screen (the
  // seasonal host card). Lift the nudge above whatever is pinned there.
  const nudgeRef = useRef(null);
  useEffect(() => {
    if (!nudge) return;
    const lift = () => safe(() => {
      const vh = window.innerHeight;
      let bar = 0;
      for (const el of document.body.querySelectorAll("body *")) {
        if (el === nudgeRef.current || (nudgeRef.current && nudgeRef.current.contains(el))) continue;
        const cs = window.getComputedStyle(el);
        if (cs.position !== "fixed" || cs.display === "none" || cs.visibility === "hidden") continue;
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.height < vh / 2 && r.bottom >= vh - 2 && r.width > window.innerWidth / 2) bar = Math.max(bar, vh - r.top);
      }
      if (nudgeRef.current) nudgeRef.current.style.setProperty("--it-bar", bar + "px");
    });
    lift();
    const t = setTimeout(lift, 600);
    window.addEventListener("resize", lift);
    return () => { clearTimeout(t); window.removeEventListener("resize", lift); };
  }, [nudge]);

  const dismiss = () => { setNudge(false); safe(() => store() && store().setItem(NUDGE_KEY, "1")); };
  const submit = (e) => { e.preventDefault(); ask(q.trim()); };
  const cards = (Array.isArray(answer && answer.cards) ? answer.cards : []).filter((c) => c && c.photo && !broken.has(c.id));
  const switching = phase === "plain";
  const polishing = phase === "ai";
  const loading = phase !== "done";
  const weekendTiles = (sell && Array.isArray(sell.weekend) ? sell.weekend : []).filter((t) => t && t.photo && !broken.has(t.id));
  const christmasRows = sell && Array.isArray(sell.christmas) ? sell.christmas : [];
  const area = answer && answer.metroLabel && answer.metroLabel !== "Florida" ? answer.metroLabel : "Florida";

  return (
    <main className="it-page" data-insider-preview="1" data-ai={answer && answer.ai ? "on" : "off"} data-model={(answer && answer.model) || ""}>
      <style dangerouslySetInnerHTML={styleHtml(XM_CARD_CSS + CSS)} />
      <div className="it-wrap">
        <header className="it-hero">
          <p className="it-eyebrow"><span className="it-dot" aria-hidden="true" />Picked by Florida locals</p>
          <h1 className="it-h1">Your Florida weekend, sorted.</h1>
          <p className="it-sub">Top rated things to do this weekend, with real prices and tickets in one tap.</p>
        </header>

        {weekendTiles.length ? (
          <section className="it-sell" aria-labelledby="it-sell-h" data-sell-weekend="">
            <div className="it-sellhead">
              <h2 id="it-sell-h">Book for this weekend</h2>
              {weekendText(sell && sell.window) ? <p>{weekendText(sell.window)}</p> : null}
            </div>
            <ul className="it-tiles">
              {weekendTiles.map((t) => <SellTile key={t.id} t={t} saved={saves.has(t.id)} onSave={onSave} onBroken={onBroken} />)}
            </ul>
          </section>
        ) : null}

        <div className="it-trustbar">
          <span>{Icon.check}Tickets from official sellers</span>
          <span>{Icon.check}Real photos of the actual place</span>
          <span>{Icon.check}Ranked on merit, never paid placement</span>
        </div>

        {signup ? <div className="it-signup">{signup}</div> : null}

        <div className="it-find">
          <h2 className="it-h2">Where are you headed?</h2>
          <p className="it-sub">Tell us the town. We&apos;ll hand you the tips locals actually use.</p>
          <form className="it-form" role="search" onSubmit={submit}>
            <label htmlFor="it-q" className="it-sr">Where are you headed?</label>
            {Icon.pin}
            <input id="it-q" className="it-input" type="search" enterKeyHint="search" autoComplete="off" maxLength={80}
              placeholder="Try Sarasota or Key West" value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="it-go" type="submit" disabled={switching}>{switching ? "Looking…" : "Show me"}</button>
          </form>
          <div className="it-chips" role="group" aria-label="Popular places">
            {quickPicks.map((p) => (
              <button key={p} type="button" className="it-chip" aria-pressed={asked === p ? "true" : "false"} onClick={() => { setQ(p); ask(p); }}>{p}</button>
            ))}
          </div>
          {tipCount ? <div className="it-trust"><span>{Icon.check}{tipCount} insider tips checked by Wayfind</span></div> : null}
        </div>

        <section aria-live="polite" aria-busy={loading ? "true" : "false"}>
          <div className="it-head">
            <span className="it-kicker">Local picks · {area}</span>
            <p className={"it-intro" + (switching ? " dim" : "")}>{answer && answer.intro}</p>
            {polishing ? <span className="it-ai working">{Icon.spark}Rewriting these tips in plain words…</span>
              : answer && answer.ai && !switching ? <span className="it-ai" title={answer.model || undefined}>{Icon.spark}Said simply by {modelName(answer.model)}, from Wayfind&apos;s checked tips</span> : null}
          </div>
          {cards.length ? (
            <div className={"it-grid" + (switching ? " dim" : "")}>
              {cards.map((c) => <TipCard key={c.id} c={c} saved={saves.has(c.id)} onSave={onSave} onBroken={onBroken} />)}
            </div>
          ) : (
            <p className="it-empty">No insider tips there yet. Try a Florida town or one of the picks above.</p>
          )}
        </section>

        {christmasRows.length ? (
          <section className="it-xmas" aria-labelledby="it-xmas-h" data-sell-christmas="">
            <div className="it-sellhead">
              <h2 id="it-xmas-h">Christmas events worth the ticket</h2>
              <a className="it-more" href="/christmas-in-florida">See all Christmas events{Icon.arrow}</a>
            </div>
            <ul className="it-xgrid">
              {christmasRows.map((row, i) => <li key={row.id}><TicketCard row={row} chrome={(sell && sell.chrome) || { eventPage: "Full event page" }} idPrefix="it-x-" headingLevel={3} priority={i < 2} /></li>)}
            </ul>
          </section>
        ) : null}

        <aside className="it-join" aria-label="Free account">
          <div>
            <h3>Keep the good ones.</h3>
            <p>Tap the heart on anything you like. A free account keeps your saves on every device.</p>
          </div>
          <button type="button" onClick={openSignIn}>Create free account</button>
        </aside>

        <p className="it-note">Every place, event, tip and photo here is a real Wayfind pick. Prices come from the ticket seller. The friendly tip wording is written by AI from our checked tip, never from scratch.</p>
      </div>

      {nudge ? (
        <div className="it-nudge" role="dialog" aria-label="Keep your saves" ref={nudgeRef}>
          <p>Nice pick. <span>Want it on every device? It&apos;s free.</span></p>
          <button type="button" className="yes" onClick={() => { dismiss(); openSignIn(); }}>Keep my saves</button>
          <button type="button" className="no" onClick={dismiss}>Not now</button>
        </div>
      ) : null}
    </main>
  );
}
