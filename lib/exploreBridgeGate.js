// lib/exploreBridgeGate.js — paint ExploreBridge at its final size, in the
// treatment arm only, before hydration (2026-10-01, issue #1602).
//
// THE DEFECT. ExploreBridge (the explore-bridge-v1 treatment) rendered null on
// the server, because the arm lives in localStorage. The browser painted the
// guide without it, then hydration inserted the whole block (chips + up to
// three picks + CTA) ABOVE the partner rail and pick 1. That pushed everything
// the reader was already looking at down the page. It was measured in
// production as a large layout shift on the Orlando guide for a reader parked
// at #pick-1.
//
// THE REPAIR keeps the experiment's meaning. The server now renders the
// bridge's markup for everyone (its content is server-known: city + picks), but
// CSS hides it unless <html data-wf-bridge="treatment">. The tiny script below
// sets that attribute while the HTML is still being parsed, before the bridge
// is painted, using EXACTLY the assignment lib/experiment.js uses:
//   - automation (looksAutomated)  -> no attribute -> nothing shown
//   - a sticky stored arm          -> that arm
//   - otherwise                    -> variantForId(wf_exp_id) at TREATMENT_PCT,
//                                     written back exactly as getVariant() does
// Control sees what it saw before: nothing. Treatment sees the same block, just
// painted at its final size instead of inserted. Exposure is still recorded
// ONLY by recordExposure() at mount, and the block takes no taps until then
// (pointer-events, released by data-ready), so no conversion can happen before
// its exposure exists. Assignment, split, key and exposure counting are all
// unchanged; scripts/test-explore-bridge-gate.mjs executes this script against
// lib/experiment.js across thousands of ids and fails on any disagreement.
//
// Server-only: imported by app/components/ExploreBridgeGate.js, never by a
// client module, so none of this ships in a client bundle.
import { EXPERIMENT_KEY, TREATMENT_PCT } from "./experiment.js";

export const BRIDGE_ARM_ATTR = "data-wf-bridge";

// Mirrors lib/experiment.js: hashString, looksAutomated, randomId, getVariant.
// Kept as a literal (not Function#toString) so bundling/minification can never
// change what runs in the browser; the guard proves the two stay identical.
export function exploreBridgeGateScript() {
  const k = JSON.stringify(EXPERIMENT_KEY);
  return "(function(){try{" +
    "var n=navigator,d=document.documentElement;" +
    "if(n.webdriver===true||/bot|crawler|spider|crawling|headless|phantom|puppeteer|playwright|lighthouse/i.test(String(n.userAgent||'')))return;" +
    "var s=window.localStorage,K=" + k + ",A='wf_exp_'+K,v=s.getItem(A);" +
    "if(v!=='control'&&v!=='treatment'){" +
      "var id=s.getItem('wf_exp_id');" +
      "if(!id){var c=window.crypto;" +
        "if(c&&c.randomUUID)id=c.randomUUID();" +
        "else if(c&&c.getRandomValues){var a=new Uint32Array(4);c.getRandomValues(a);id=Array.from(a).map(function(x){return x.toString(16).padStart(8,'0')}).join('')}" +
        "else id='weak-'+String(Date.now())+'-'+String(Math.floor(Math.random()*1e9));" +
        "s.setItem('wf_exp_id',id)}" +
      "var t=String(id)+'|'+K,h=0x811c9dc5;" +
      "for(var i=0;i<t.length;i++){h^=t.charCodeAt(i);h=(h+((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24)))>>>0}" +
      "h^=h>>>16;h=Math.imul(h,0x85ebca6b)>>>0;h^=h>>>13;h=Math.imul(h,0xc2b2ae35)>>>0;h^=h>>>16;" +
      "v=(h>>>0)%100<" + Number(TREATMENT_PCT) + "?'treatment':'control';s.setItem(A,v)}" +
    "d.setAttribute('" + BRIDGE_ARM_ATTR + "',v)" +
  "}catch(e){}})();";
}

// Hidden by default (control, SSR without JS, crawlers); shown only for the
// treatment arm; inert until the client has recorded exposure (data-ready).
export const EXPLORE_BRIDGE_GATE_CSS =
  "[data-explore-bridge]{display:none}" +
  "html[" + BRIDGE_ARM_ATTR + "=\"treatment\"] [data-explore-bridge]{display:block}" +
  "html[" + BRIDGE_ARM_ATTR + "=\"treatment\"] [data-explore-bridge]:not([data-ready]){pointer-events:none}";
