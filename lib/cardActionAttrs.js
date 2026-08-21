// lib/cardActionAttrs.js — the contract between a card's action controls and
// the inline script that catches taps before React can hear them.
//
// NOT a "use client" module on purpose: app/layout.js is a server component and
// needs these as real strings to build the inline script. Everything here is
// plain data plus one string builder — no React, no browser.
//
// WHY ANY OF THIS EXISTS (measured on production, 2026-08-21, Playwright with
// CDP throttling to a normal 1.5 Mbps phone):
//
//     /guides/things-to-do-sarasota   Like button PAINTED at 1,186 ms
//                                     React handler ATTACHED at 7,572 ms
//
// Guide pages are prerendered, so their place cards ship inside the HTML. For
// 6.4 seconds those Like / Not-for-me / Save controls are visible, tappable,
// and connected to nothing. Every tap in that window was discarded in silence
// — the owner's "I click the like button and nothing happens", still true
// after v8.29 fixed what the control DOES once it is alive.
//
// The homepage never showed this because it renders its rail client-side: the
// button does not exist until it works. A guide page cannot do that without
// giving up the server-rendered card, which is the point of the card being
// there.

export const PENDING_ACTIONS_KEY = "__wfPendingActions";
export const LIVE_ATTR = "data-wf-live";      // set by useActionBridge once a card's handlers exist
export const ACTION_ATTR = "data-wf-act";     // "like" | "dislike" | "save"
export const PLACE_ATTR = "data-wf-act-place";
export const WAS_ATTR = "data-wf-was";  // what React rendered, before the optimistic paint
export const MAX_PENDING = 24;

// The inline script. Parsed with the document, so it is listening from the
// first byte — long before any bundle lands.
//
//   capture phase   so it can take the tap before the card's own open-the-place
//                   handler or an anchor's default ever sees it
//   [LIVE_ATTR]     the stand-down flag; once a card's real handlers exist the
//                   bridge ignores its controls entirely, so a live tap is
//                   never double-counted
//   toggle, not add tapping twice removes the queued intent and un-paints, so
//                   the queue and the pixels can never disagree
//   [WAS_ATTR]      what React had rendered before the optimistic paint. React
//                   diffs against its OWN last value, not the DOM, so a control
//                   whose true post-replay state equals its pre-tap state would
//                   never be written back and the optimistic pixels would stick
//                   — "liked" and "not for me" both lit at once (seen on
//                   like-then-dislike). useActionBridge restores this stashed
//                   value before replaying, so React and the DOM start level.
//
// It paints aria-pressed + .is-active immediately because the reader has to see
// their tap land; lib/cardActions.js replays the queue into the real handler in
// the same commit that attaches React's onClick.
export function cardActionBridgeScript() {
  return `(function(){try{var Q=window.${PENDING_ACTIONS_KEY}=window.${PENDING_ACTIONS_KEY}||[];document.addEventListener('click',function(e){try{var t=e.target;if(!t||!t.closest)return;var el=t.closest('[${ACTION_ATTR}]');if(!el)return;if(el.closest('[${LIVE_ATTR}="1"]'))return;var id=el.getAttribute('${PLACE_ATTR}');var a=el.getAttribute('${ACTION_ATTR}');if(!id||!a)return;e.preventDefault();e.stopPropagation();var k=a+':'+id,at=-1;for(var i=0;i<Q.length;i++){if(Q[i]&&Q[i].k===k){at=i;break}}var on;if(at>=0){Q.splice(at,1);on=false}else if(Q.length<${MAX_PENDING}){Q.push({k:k,action:a,id:id});on=true}else{return}if(!el.hasAttribute('${WAS_ATTR}'))el.setAttribute('${WAS_ATTR}',el.getAttribute('aria-pressed')==='true'?'true':'false');el.setAttribute('aria-pressed',on?'true':'false');if(el.classList)el.classList[on?'add':'remove']('is-active')}catch(_){}} ,true)}catch(_){}})();`;
}
