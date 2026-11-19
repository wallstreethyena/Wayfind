// Regression for the 2026-11-18 alerts:
//   WAYFIND-1X  Chrome page translation -> React removeChild/insertBefore throw.
//   WAYFIND-1Y  early-buffer replay lost the source of a stackless parse error.
//   owned-social-reconcile missing=2 (Df2AyPHtNtK Snowcat Ridge, Df0ryLrMX-m Vintage Roost).
// Executes the real inline guard and the real replay context helper.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { TRANSLATE_DOM_GUARD_SCRIPT } from "../lib/translateDomGuard.js";
import { earlyErrorContext, DENY_URLS } from "../lib/sentryShared.js";
import { ownedAttachments, OWNED_CARD_DECISIONS } from "../lib/ownedSocialCards.js";

let assertions = 0;
const ok = (condition, message) => { assert.ok(condition, message); assertions++; };
const read = (file) => readFileSync(new URL("../" + file, import.meta.url), "utf8");

// ── WAYFIND-1X: a DOM that throws exactly like the browser does. ───────────
function makeDom() {
  class NotFoundError extends Error {}
  class Node {
    constructor(name) { this.name = name; this.parentNode = null; this.childNodes = []; }
    removeChild(c) {
      const i = this.childNodes.indexOf(c);
      if (i < 0) throw new NotFoundError("Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.");
      this.childNodes.splice(i, 1); c.parentNode = null; return c;
    }
    insertBefore(n, r) {
      if (r == null) { if (n.parentNode) n.parentNode.removeChild(n); this.childNodes.push(n); n.parentNode = this; return n; }
      const i = this.childNodes.indexOf(r);
      if (i < 0) throw new NotFoundError("Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is not a child of this node.");
      if (n.parentNode) n.parentNode.removeChild(n);
      this.childNodes.splice(i, 0, n); n.parentNode = this; return n;
    }
  }
  return { Node, NotFoundError };
}

{
  const { Node, NotFoundError } = makeDom();
  // Before the guard: the translator moved React's text node under a <font>.
  const p = new Node("p"); const text = new Node("#text"); p.insertBefore(text, null);
  const font = new Node("font"); p.removeChild(text); font.insertBefore(text, null); p.insertBefore(font, null);
  assert.throws(() => p.removeChild(text), NotFoundError); assertions++;

  const ctx = { Node };
  vm.runInNewContext(TRANSLATE_DOM_GUARD_SCRIPT, ctx);
  ok(Node.prototype.__wfTranslateGuard === 1, "guard installs on Node.prototype");
  const patched = Node.prototype.removeChild;
  vm.runInNewContext(TRANSLATE_DOM_GUARD_SCRIPT, ctx);
  ok(Node.prototype.removeChild === patched, "guard is idempotent (second run does not double wrap)");

  ok(p.removeChild(text) === text, "removeChild of a translator-moved node no longer throws, returns the node");
  ok(text.parentNode === font, "the stale node is left where the translator put it");
  const n = new Node("span");
  ok(p.insertBefore(n, text) === n && n.parentNode === null, "insertBefore against a moved reference no longer throws");

  // Valid calls are untouched: native behaviour, including its own errors.
  const a = new Node("a"); const b = new Node("b");
  p.insertBefore(a, null); p.insertBefore(b, a);
  ok(p.childNodes.indexOf(b) === p.childNodes.indexOf(a) - 1, "valid insertBefore still inserts in order");
  ok(p.removeChild(a) === a && a.parentNode === null && !p.childNodes.includes(a), "valid removeChild still removes");
  ok(p.insertBefore(new Node("c"), null).parentNode === p, "insertBefore(n, null) still appends");
}
{
  // No Node global (server / worker): the script is a silent no-op.
  assert.doesNotThrow(() => vm.runInNewContext(TRANSLATE_DOM_GUARD_SCRIPT, {})); assertions++;
}

const layout = read("app/layout.js");
const guardAt = layout.indexOf("__html: TRANSLATE_DOM_GUARD_SCRIPT");
const shimAt = layout.indexOf("if(window.__wfSentryInit)");
ok(guardAt > 0 && /from "\.\.\/lib\/translateDomGuard\.js"/.test(layout), "layout inlines the translation guard");
ok(shimAt > guardAt, "guard is inlined in the document head path before the Sentry shim (runs before React's first commit)");
ok(TRANSLATE_DOM_GUARD_SCRIPT.length < 400, "guard stays under 400 bytes");

// ── WAYFIND-1Y: replay keeps the source and drops denied origins. ──────────
const savedLocation = globalThis.location;
globalThis.location = { origin: "https://www.gowayfind.com" };
try {
  const ext = earlyErrorContext({ error: new SyntaxError("Invalid or unexpected token"), filename: "chrome-extension://abcdef/content.js", lineno: 1 });
  ok(ext.denied === true, "parse error from an extension script is dropped before it reaches Sentry");
  const own = earlyErrorContext({ error: new SyntaxError("Invalid or unexpected token"), filename: "https://www.gowayfind.com/_next/static/chunks/app/p/page.js", lineno: 3 });
  ok(own.denied === false && own.tags.early_source === "same", "our own chunk's parse error still reports, tagged same origin");
  ok(own.extra.early_filename.endsWith("/page.js") && own.extra.early_lineno === 3, "the event now carries the file and line that failed to parse");
  ok(own.tags.early_buffer === true, "early_buffer tag preserved");
  const third = earlyErrorContext({ message: "x", filename: "https://cdn.example.net/widget.js", lineno: 9 });
  ok(third.denied === false && third.tags.early_source === "cross", "a non-denied third party still reports, marked cross origin");
  const none = earlyErrorContext({ reason: new Error("r"), unhandledrejection: 1 });
  ok(none.denied === false && none.tags.early_source === "none" && Object.keys(none.extra).length === 0, "a rejection with no source reports unchanged");
  ok(earlyErrorContext({ filename: "https://scripts.stay22.com/x.js" }, DENY_URLS).denied === true, "every shared DENY_URLS entry applies to the replay");
} finally {
  globalThis.location = savedLocation;
}
const client = read("app/components/SentryClient.js");
ok(/shared\.earlyErrorContext\(item\)/.test(client) && /if \(ctx\.denied\) continue;/.test(client), "SentryClient replay uses earlyErrorContext and skips denied items");
ok(/captureException\(err, \{ tags: ctx\.tags, extra: ctx\.extra \}\)/.test(client), "SentryClient replay sends the source context");

// ── owned-social-reconcile: both Nov 18 shortcodes resolved. ───────────────
const at = ownedAttachments();
const snow = at.get("Df2AyPHtNtK");
ok(snow && snow.places.includes("snowcat-ridge-dade-city"), "Snowcat Ridge Reel Df2AyPHtNtK rides the Snowcat Ridge place card");
ok(snow && snow.events.includes("snowcat-ridge-2026"), "Snowcat Ridge Reel Df2AyPHtNtK rides the Snowcat Ridge event card");
ok(!at.has("Df0ryLrMX-m") && OWNED_CARD_DECISIONS["Df0ryLrMX-m"] === "business_not_on_wayfind", "Vintage Roost Reel carries a recorded decision instead of an invented card");
ok(!Object.prototype.hasOwnProperty.call(OWNED_CARD_DECISIONS, "Df2AyPHtNtK"), "an attached post never also carries a no-card decision");

console.log("test-nov18-alerts: OK — " + assertions + " assertions");
