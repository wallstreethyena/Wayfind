// lib/deepLinkAction.js — a link may OPEN a place. It may never CHANGE a
// visitor's saved / liked / disliked state on its own.
//
// THE INCIDENT (PostHog, week of 2026-10-19 ET). 300 `save` events. Every one of
// them fired within 15 seconds of session start, on a session whose entry URL
// was /p/<the same place id>, with referrer https://www.gowayfind.com/ — the
// signature of the /p/{id}?action=save deep-link replay, not of a heart tap.
// 201 came from Singapore (102 devices, Chrome 148-150 desktop UAs that carry
// no "headless" token). Cause: IconicPlaceCard rendered its save control as a
// plain <a href="/p/<id>?action=save"> until hydration, so anything that
// followed links on a server-rendered page (crawlers, headless QA, link
// prefetchers) loaded that URL, and app/home.js applied the save — firing
// `save` and `signup_offer_shown` for a visitor who never pressed anything.
//
// THE RULE (owner): a GET, a link preview or a crawler visit must never change
// state. So a link-originated action is only ever a PROPOSAL:
//   automated  (navigator.webdriver, or lib/crawler.js isCrawler(UA))
//              -> nothing is applied, nothing is prompted, no save event.
//   otherwise  -> a one-tap "Save <place>?" prompt. The state changes only on
//              a trusted user click on that prompt (event.isTrusted), and the
//              resulting event is labelled trigger:'deep_link',
//              traffic_class:'human'.
//
// WHY NOT "auto-apply when same-site referrer + existing session": the
// automation above HAD a same-site referrer (it followed our own cards), and a
// persistent headless profile has an "existing session". Neither signal can
// tell a tap from a fetch. A user gesture can, and it costs a real person one
// tap on a link that, after this change, our own cards no longer produce.
//
// Pure module: no React, no browser globals read at import time, so guards can
// CALL it (scripts/test-deep-link-no-mutation.mjs).
import { isCrawler } from "./crawler.js";

export const DEEP_LINK_ACTIONS = Object.freeze(["save", "like", "dislike"]);

/** "automated" for an identifiable bot, "unknown" for everyone else — a page
 *  load alone never proves a human. "human" is only ever minted by
 *  humanConfirmed() from a trusted click. */
export function deepLinkTrafficClass({ userAgent, webdriver } = {}) {
  if (webdriver === true) return "automated";
  if (isCrawler(userAgent)) return "automated";
  return "unknown";
}

/** What the boot effect may do with ?action=. It NEVER returns apply:true —
 *  applying is the prompt's job, after a trusted click. */
export function planDeepLinkAction({ action, userAgent, webdriver } = {}) {
  const valid = DEEP_LINK_ACTIONS.includes(action) ? action : null;
  const trafficClass = deepLinkTrafficClass({ userAgent, webdriver });
  if (!valid) return { action: null, trafficClass, prompt: false, apply: false };
  if (trafficClass === "automated") return { action: valid, trafficClass, prompt: false, apply: false };
  return { action: valid, trafficClass, prompt: true, apply: false };
}

/** True only for a real user activation: a trusted DOM event, from a browser
 *  that is not driven by automation. Synthetic .click()/dispatchEvent calls are
 *  isTrusted:false; CDP-injected input under webdriver is refused here too. */
export function humanConfirmed(event, { userAgent, webdriver } = {}) {
  // React hands a SyntheticEvent; read the browser's own flag off nativeEvent.
  const ev = event && event.nativeEvent ? event.nativeEvent : event;
  if (!ev || ev.isTrusted !== true) return false;
  return deepLinkTrafficClass({ userAgent, webdriver }) !== "automated";
}

/** Analytics props every deep-link-context event carries. */
export function deepLinkEventProps(trafficClass, action) {
  const tc = trafficClass === "human" || trafficClass === "automated" ? trafficClass : "unknown";
  const out = { trigger: "deep_link", traffic_class: tc };
  if (action) out.requested_action = action;
  return out;
}

export function deepLinkPromptLabel(action, name) {
  const n = String(name || "this place");
  if (action === "like") return "Like " + n + "?";
  if (action === "dislike") return "Not for you: " + n + "?";
  return "Save " + n + "?";
}
