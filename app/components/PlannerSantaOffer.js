"use client";

// app/components/PlannerSantaOffer.js — the planner's proactive offer, told by
// Santa during Santa season (owner 2026-11-13: "there are two bubbles here,
// make Santa appear and point to the button that opens a chat with Santa").
//
// One message, not two (2026-11-13 follow up: "have the message pop up at the
// bottom Santa and have Santa come out of it"): while this is up, the Santa
// dock's own row steps aside (html class `wf-planner-offer-up`, visibility
// only so the page never jumps) and this bar takes its exact place. Santa
// rises out of the bar, the offer pops out of him as an iMessage style gray
// bubble, and his candy cane wand points at the button. The button opens the planner chat (WayfindPlannerSheet). Lazy loaded
// by WayfindPlannerLoader only when an offer shows in Santa season, so the
// Santa artwork never rides in the first paint bundle.

import { useEffect } from "react";
import { styleHtml } from "../../lib/styleHtml.js";
import { SantaSvg } from "./santaArt.js";

export const OFFER_UP_CLASS = "wf-planner-offer-up";

const CSS = `
html.${OFFER_UP_CLASS} .wf-sd{visibility:hidden!important}
.wfp-so{--wfp-lift:0px;position:fixed;left:0;right:0;bottom:var(--wfp-lift);z-index:936;box-sizing:border-box;padding:0 max(10px,env(safe-area-inset-right)) env(safe-area-inset-bottom) max(10px,env(safe-area-inset-left));background:rgba(10,15,24,.97);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-top:1px solid rgba(255,255,255,.08);box-shadow:0 -10px 28px rgba(0,0,0,.3);font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",var(--wf-sans),system-ui,sans-serif}
.wfp-so::before{content:"";position:absolute;left:0;right:0;top:-1px;height:2px;background:linear-gradient(90deg,#D92C37,#F5C451 50%,#3FBF7F);opacity:.85}
html.wf-has-bottom-nav .wfp-so{--wfp-lift:78px}
@media(min-width:1024px){html.wf-has-bottom-nav .wfp-so{--wfp-lift:118px}}
.wfp-so-in{position:relative;max-width:760px;height:var(--wf-santa-dock,64px);margin:0 auto;display:flex;align-items:center;gap:10px;padding-left:84px}
.wfp-so-santa{all:unset;position:absolute;left:0;bottom:2px;width:78px;height:104px;cursor:pointer;z-index:2;transform-origin:50% 100%;animation:wfp-so-rise .7s cubic-bezier(.2,.9,.3,1.35) both;-webkit-tap-highlight-color:transparent}
.wfp-so-santa svg .s-rarm{transform-box:view-box;transform-origin:184px 222px;animation:wfp-so-point 2.8s cubic-bezier(.45,0,.3,1) .7s infinite both}
.wfp-so-santa svg .s-star{transform-box:fill-box;transform-origin:50% 50%;animation:wfp-so-twinkle 1.3s ease-in-out 1s infinite}
.wfp-so-santa svg .s-body{transform-box:fill-box;transform-origin:50% 100%;animation:wfp-so-breathe 3.6s ease-in-out infinite}
@keyframes wfp-so-rise{0%{transform:translateY(70%) scale(.6);opacity:0}60%{transform:translateY(-8%) scale(1.06);opacity:1}100%{transform:none;opacity:1}}
@keyframes wfp-so-point{0%,100%{transform:rotate(0)}20%,80%{transform:rotate(64deg)}35%{transform:rotate(56deg)}50%{transform:rotate(66deg)}65%{transform:rotate(58deg)}}
@keyframes wfp-so-twinkle{0%,100%{transform:scale(1)}50%{transform:scale(1.25)}}
@keyframes wfp-so-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.015,1.03)}}
.wfp-so-bub{position:absolute;left:70px;bottom:calc(100% + 14px);max-width:min(300px,calc(100vw - 100px));padding:8px 13px;border-radius:18px;background:#26252A;color:#fff;font-size:15.5px;line-height:1.3;box-shadow:0 10px 26px rgba(0,0,0,.5);transform-origin:0 100%;animation:wfp-so-pop .36s cubic-bezier(.2,.9,.3,1.3) .45s both}
.wfp-so-tail{position:absolute;left:-6px;bottom:0;width:17px;height:21px;display:block}
.wfp-so-cta{all:unset;box-sizing:border-box;cursor:pointer;flex:1 1 auto;min-width:0;display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:44px;padding:0 16px;border-radius:999px;background:#0A84FF;color:#fff;font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;animation:wfp-so-glow 2.8s ease-in-out 1.2s infinite}
.wfp-so-cta:focus-visible,.wfp-so-x:focus-visible,.wfp-so-santa:focus-visible{outline:2px solid #fff;outline-offset:2px}
.wfp-so-x{all:unset;box-sizing:border-box;cursor:pointer;flex:0 0 auto;width:36px;height:36px;border-radius:50%;display:grid;place-items:center;color:#8E8E93;font-size:20px;line-height:1}
@keyframes wfp-so-pop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:none}}
@keyframes wfp-so-glow{0%,100%{box-shadow:0 0 0 0 rgba(10,132,255,0)}30%,70%{box-shadow:0 0 0 5px rgba(10,132,255,.3)}}
@media (prefers-reduced-motion:reduce){.wfp-so *{animation:none!important}.wfp-so-santa svg .s-rarm{transform:rotate(64deg)}}
`;

export default function PlannerSantaOffer({ message, ctaLabel, onOpen, onDismiss }) {
  // One bubble at a time: the dock hides while Santa makes this offer.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add(OFFER_UP_CLASS);
    return () => root.classList.remove(OFFER_UP_CLASS);
  }, []);

  return (
    <>
      <style dangerouslySetInnerHTML={styleHtml(CSS)} />
      <aside className="wfp-so" data-wf-planner-santa-offer="1" aria-label="Santa, Wayfind's trip planner">
        <div className="wfp-so-in">
          <button type="button" className="wfp-so-santa" onClick={onOpen} aria-label={`Chat with Santa: ${ctaLabel}`}>
            <SantaSvg face="happy" arm="wand" glow={false} />
          </button>
          <div className="wfp-so-bub" role="status">
            <svg className="wfp-so-tail" viewBox="0 0 17 21" aria-hidden="true"><path d="M17 0v21H4.5C2 21 .6 20.6 0 20.2 4 18.8 6.5 15 6.5 9V0z" fill="#26252A" /></svg>
            {message}
          </div>
          <button type="button" className="wfp-so-cta" data-wf-planner-santa-cta="1" onClick={onOpen}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3C6.5 3 2 6.8 2 11.5c0 2.6 1.4 4.9 3.6 6.5L5 21.5l4-2.1c.9.2 1.9.3 3 .3 5.5 0 10-3.8 10-8.5S17.5 3 12 3z" /></svg>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{ctaLabel}</span>
          </button>
          <button type="button" className="wfp-so-x" data-wf-proactive-dismiss="1" aria-label="Dismiss Santa's suggestion" onClick={onDismiss}>
            ×
          </button>
        </div>
      </aside>
    </>
  );
}
