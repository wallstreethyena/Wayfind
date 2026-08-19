#!/usr/bin/env node
/**
 * check-guide-share — every guide can be shared, and sharing actually works.
 *
 * Owner, 2026-08-19, on a live guide: "why is it that none of these blog has a
 * share button ... i want a share button on all of them." He was right: 39
 * guides, ~46% of external entries (AUDIT F2), and not one share control on any
 * of them. A reader who wanted to send a guide to the person it was for had to
 * select the address bar.
 *
 * The button is the easy half. The half that breaks silently is the ORDER: on
 * iOS a clipboard write consumes the tap's transient user activation, so a
 * navigator.share() called after it is rejected with NotAllowedError — the
 * "copied" toast appears and the sheet never opens. This codebase shipped that
 * bug once and fixed it in app/home.js (v4.06 -> v4.07). lib/shareOut.js is a
 * second implementation, for pages outside the app shell, so section 2 pins the
 * ordering in BOTH — the only thing the two copies must agree about.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GUIDES } from "../lib/guides.js";
import { shareOut, canShareNatively, isTouchDevice } from "../lib/shareOut.js";

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let n = 0;
const fails = [];
const ok = (c, m) => { n++; if (!c) fails.push(m); };
const read = (rel) => readFileSync(path.join(REPO, rel), "utf8");
// Comments are stripped before every source assertion. A guard that can be
// satisfied — or failed — by its own rationale in a comment is a guard someone
// deletes; this file's first draft failed on the word "window.location" inside
// a note explaining why window.location must never be used.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ── 1. EVERY GUIDE RENDERS ONE, TWICE ──────────────────────────────────────
{
  const raw = read("app/guides/[slug]/page.js");
  const page = strip(raw);
  ok(/import ShareButton from/.test(page), "the guide template does not import a share control");
  const uses = (page.match(/<ShareButton/g) || []).length;
  ok(uses >= 2, "the guide template renders " + uses + " share control(s) — the hero catches a reader who already knew they wanted to send it, the end-of-article one catches the far larger group who only know after reading");
  // Rendered UNCONDITIONALLY: one template, 39 guides, no per-guide opt-in.
  // An opt-in is exactly how dealCards ended up on 2 guides out of 39.
  ok(!/&&\s*<ShareButton/.test(page),
     "the share control is behind a condition — it must render on every guide, not on the ones somebody remembered to flag");
  ok(Object.keys(GUIDES).length >= 20, "the guide corpus looks wrong — this guard would prove nothing about 0 pages");
  // The URL is resolved SERVER-side from SITE_URL. Built from window.location it
  // would carry a preview host the recipient cannot open (lib/site.js).
  ok(/const shareUrl = SITE_URL \+ "\/guides\/" \+ params\.slug/.test(page),
     "the shared URL must be built from SITE_URL on the server, never from the browser's address bar");
  ok((page.match(/url=\{shareUrl\}/g) || []).length >= 2, "both controls must share the canonical URL");
  ok(page.indexOf("<GuideConversion") < page.lastIndexOf("<ShareButton"),
     "the end-of-article share must sit AFTER the monetized CTA — GuideConversion keeps first position");
}
{
  const raw = read("app/components/ShareButton.js");
  const btn = strip(raw);
  ok(/"use client"/.test(raw), "ShareButton must be a client component or its handler never runs");
  ok(/<button/.test(btn) && /type="button"/.test(btn), "the share control must be a real <button>");
  ok(/aria-live/.test(btn), "the copied confirmation must be announced, not only drawn — that state IS the feedback");
  ok(!/window\.location/.test(btn), "ShareButton must not build its own URL");
  ok(/track\(/.test(btn), "a share must be measurable");
  ok(/path: how/.test(btn),
     "the share event must record WHICH path ran — 'shares are flat' and 'the sheet never opens on iOS' look identical in one counter, and only one of them is a bug");
}

// ── 2. THE SHEET COMES BEFORE THE CLIPBOARD, IN BOTH IMPLEMENTATIONS ───────
// WHAT THE INVARIANT ACTUALLY IS. Both implementations DEFINE their copy
// helper as a closure at the top of the function and only INVOKE it after the
// native attempt — which is correct, and which a naive
// indexOf("clipboard.writeText") comparison reports as a failure. This guard's
// own first draft did exactly that and failed on two correct implementations.
// What matters is the first activation-CONSUMING CALL, so that is what is
// measured: the first native attempt must precede the first copy() invocation.
const firstNativeAttempt = (body) => {
  const at = ["nativeShare(", "navigator.share("].map((k) => { const i = body.indexOf(k); return i < 0 ? Infinity : i; });
  return Math.min.apply(null, at);
};
const firstCopyCall = (body) => {
  // An invocation, not the definition: "const copy = () =>" has a space and an
  // "=" between the name and the parens, so it cannot match.
  const m = body.match(/(?<![\w.])(doCopy|copy)\(\)/);
  return m ? m.index : Infinity;
};
{
  const so = strip(read("lib/shareOut.js"));
  const body = so.slice(so.indexOf("export function shareOut"));
  ok(body.indexOf("navigator.share(") > -1 && body.indexOf("clipboard.writeText") > -1, "lib/shareOut.js must have both paths");
  ok(firstNativeAttempt(body) < firstCopyCall(body),
     "lib/shareOut.js calls the clipboard before attempting the native sheet — on iOS that consumes the tap's activation and the sheet is then refused (v4.07)");
  ok(/AbortError/.test(so), "a user who cancels the sheet has not failed — cancelling must not fall through to a silent copy");
  ok(/execCommand/.test(so), "no legacy fallback: on an insecure origin navigator.clipboard is simply absent");
  ok(!/window\.location/.test(so), "shareOut must share the url it is handed, never one it reads off the page");
}
{
  const home = strip(read("app/home.js"));
  const i = home.indexOf("function shareLink(");
  ok(i > -1, "app/home.js shareLink is gone — this guard is pinning the wrong thing");
  const body = home.slice(i, i + 4000);
  ok(body.indexOf("navigator.share(") > -1 && body.indexOf("clipboard.writeText") > -1, "app/home.js shareLink must have both paths");
  // In the app shell the FIRST attempt is the Capacitor sheet (lib/native.js),
  // with navigator.share behind it — both are native attempts and either one
  // satisfies the rule, which is why firstNativeAttempt() looks for both.
  ok(firstNativeAttempt(body) < firstCopyCall(body),
     "app/home.js shareLink calls the clipboard before attempting a native sheet — the v4.06 bug is back");
}

// ── 3. IT RUNS, AND IT NEVER THROWS ────────────────────────────────────────
// A share handler that throws kills the tap with no message at all.
ok(shareOut(null) === "failed", "a null payload must return failed rather than throw");
ok(shareOut({}) === "failed", "no url means nothing to share");
ok(typeof isTouchDevice() === "boolean", "isTouchDevice must answer off-DOM — it is evaluated during SSR");
ok(canShareNatively() === false, "with no navigator there is no native sheet, and asking must not throw");
{
  let threw = false, out = null;
  try { out = shareOut({ url: "https://www.gowayfind.com/guides/x", title: "x" }); } catch (e) { threw = true; }
  ok(!threw, "shareOut threw in a headless environment — it runs inside a click handler, where that is fatal and silent");
  ok(out === "copied", 'shareOut returned "' + out + '" with no sheet available — the caller relies on "copied" to know it must say so itself');
}

// ── 4. THE HERO SLOT IS ADDITIVE ───────────────────────────────────────────
// /culture/[metro] mounts the same hero and passes nothing.
{
  const hero = strip(read("app/components/PremiumIntentHero.js"));
  ok(/actions = null/.test(hero), "PremiumIntentHero's actions slot must default to null so its other consumer is unchanged");
  ok(/\{actions\}/.test(hero), "the actions slot is declared but never rendered");
  const culture = strip(read("app/culture/[metro]/page.js"));
  ok(!/actions=/.test(culture), "the culture page now passes actions — make that call deliberately before allowing it");
}

if (fails.length) {
  console.error("check-guide-share: FAIL — " + fails.length + "/" + n);
  for (const f of fails) console.error("  · " + f);
  process.exit(1);
}
console.log("check-guide-share: OK — " + n + " assertions; every one of " + Object.keys(GUIDES).length
  + " guides renders two share controls over a server-built canonical URL, and both share implementations open the native sheet before touching the clipboard");
