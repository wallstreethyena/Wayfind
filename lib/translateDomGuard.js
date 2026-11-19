// lib/translateDomGuard.js — keep React alive when the BROWSER rewrites our text.
//
// WAYFIND-1X (2026-11-18): "NotFoundError: Failed to execute 'removeChild' on
// 'Node': The node to be removed is not a child of this node." 5 events on
// /florida-events/holiday-fantasy-of-lights-2026, every one Chrome Mobile 157 on
// Android with the fr-CA locale on our English page, a stack entirely inside
// React's commit (react-dom chunk, no Wayfind frame). That is Chrome's built in
// page translation: it replaces each React-owned text node with a <font> holding
// the translation. When React later updates or removes the ORIGINAL node, the
// node's parent is no longer the one React recorded, the DOM throws, and the
// whole route unmounts into the error page for that visitor.
// (facebook/react#11538; the fix React's own maintainers published.)
//
// The guard only changes the two calls in the exact case the platform would
// THROW (child not actually under this parent). Every valid call goes straight
// to the native method, so correct code behaves byte for byte as before. When it
// does step in, the stale node is simply left where the translator put it.
//
// Inline in app/layout.js so it runs before React's first commit (hydration
// can already hit translated text). Dependency free, < 400 bytes.
export const TRANSLATE_DOM_GUARD_SCRIPT =
  "(function(){try{if(typeof Node!=='function'||!Node.prototype||Node.prototype.__wfTranslateGuard)return;var P=Node.prototype;P.__wfTranslateGuard=1;" +
  "var rc=P.removeChild;P.removeChild=function(c){if(c&&c.parentNode!==this)return c;return rc.apply(this,arguments)};" +
  "var ib=P.insertBefore;P.insertBefore=function(n,r){if(r&&r.parentNode!==this)return n;return ib.apply(this,arguments)}}catch(_){}})();";
