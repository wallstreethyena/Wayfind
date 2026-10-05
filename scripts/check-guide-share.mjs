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
import { shareOut, shareNatively, canShareNatively, isTouchDevice } from "../lib/shareOut.js";

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

// ── 2. ONE TEXT-FIRST POLICY, NATIVE ONLY FROM ITS OWN CHOICE ────────────
// Runtime transport and activation controls live in test-unified-share-flow.
{
  const so = strip(read("lib/shareOut.js"));
  const chooser = strip(read("lib/shareChooser.js"));
  const body = so.slice(so.indexOf("export function shareOut"));
  const native = so.slice(so.indexOf("export function shareNatively"), so.indexOf("export function shareOut"));
  ok(/openShareChooser\(/.test(body) && !/navigator\.share\(/.test(body), "opening a share must offer explicit text-first choices rather than silently choose a native/clipboard path");
  ok(/navigator\.share\(/.test(native) && !/clipboard\.writeText/.test(native), "the explicit native choice must invoke Web Share without an earlier clipboard write");
  ok(/AbortError/.test(native), "cancelling a native sheet must not start another action");
  ok(/execCommand/.test(chooser), "explicit Copy needs a legacy fallback on insecure origins");
  ok(/import\s+.*openShareChooser.*shareChooser/.test(so) && !/import\("\.\/shareChooser\.js"\)/.test(so), "the visible text chooser must ship synchronously with the transport");
  ok(!/window\.location/.test(so), "shareOut must share the handed URL, never the page address");
  const home = strip(read("app/home.js"));
  const at = home.indexOf("function shareLink(");
  const shell = home.slice(at, home.indexOf("function randCode", at));
  ok(at > -1 && /inShareChoice\(\) \? shareOut : openShareFlow/.test(shell), "the shell must delegate to the same menu/transport policy, avoiding nested menus");
  ok(!/navigator\.share|clipboard\.writeText|execCommand/.test(shell), "the shell must not regain a divergent copy of share transport");
}

// Each newly forbidden source shape has an injected regression fixture using
// the same actual probe. Their absence is measured, not assumed from a grep.
{
  const directWebShare = /navigator\.share\(/;
  const clipboardWrite = /clipboard\.writeText/;
  const lazyChooser = /import\("\.\/shareChooser\.js"\)/;
  const shellTransport = /navigator\.share|clipboard\.writeText|execCommand/;
  ok(directWebShare.test("navigator.share(payload)"), "the direct-share detector must find an injected transport bypass");
  ok(clipboardWrite.test("navigator.clipboard.writeText(url)"), "the clipboard detector must find an activation-consuming regression");
  ok(lazyChooser.test('import("./shareChooser.js")'), "the lazy-chooser detector must find the delayed-visible-fallback regression");
  ok(shellTransport.test("document.execCommand('copy')"), "the shell transport detector must find a divergent legacy-copy implementation");
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
  ok(out === "failed", 'a headless caller without a DOM cannot claim that a link was copied');
}

// Native is an explicit secondary choice: exercise the real synchronous
// transport and cancellation callbacks with a controlled browser dependency.
{
  const priorNavigator = globalThis.navigator;
  let calls = 0, copies = 0, completions = 0, received = null;
  try {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {
      share(data) { calls++; received = data; return Promise.reject(Object.assign(new Error("cancelled"), { name: "AbortError" })); },
      clipboard: { writeText() { copies++; return Promise.resolve(); } },
    } });
    const payload = { title: "A Wayfind guide", text: "Check out this guide", url: "https://www.gowayfind.com/guides/fixture" };
    const result = shareNatively(payload, null, { onShared() { completions++; } });
    ok(result === "native", "the explicitly selected native transport reports its actual attempted path");
    ok(calls === 1, "Web Share must execute synchronously from the native-choice tap");
    ok(received && received.url === payload.url && received.text === payload.text, "native transport retains the caller's canonical URL and authored message");
    ok(copies === 0, "no clipboard API may consume activation before the native choice");
    await Promise.resolve(); await Promise.resolve();
    ok(completions === 0 && copies === 0, "native cancellation must earn no completion and trigger no automatic copy");
  } finally {
    if (priorNavigator === undefined) delete globalThis.navigator;
    else Object.defineProperty(globalThis, "navigator", { configurable: true, value: priorNavigator });
  }
}

// ── 4. THE HERO SLOT IS ADDITIVE ───────────────────────────────────────────
// /culture/[metro] mounts the same hero and passes nothing.
{
  const hero = strip(read("app/components/PremiumIntentHero.js"));
  ok(/actions = null/.test(hero), "PremiumIntentHero's actions slot must default to null so its other consumer is unchanged");
  ok(/\{actions\}/.test(hero), "the actions slot is declared but never rendered");
  // 2026-09-23, made deliberately (destination share audit): the culture page's
  // hero now carries the page Share in this slot, the same control the guides
  // mount here. What it passes must be exactly that, and nothing else.
  const culture = strip(read("app/culture/[metro]/page.js"));
  const cultureActions = culture.match(/actions=\{\s*<(\w+)\b/g) || [];
  ok(cultureActions.length === 1 && /<ShareButton$/.test(cultureActions[0]),
     "the culture hero's actions slot must hold exactly the standard ShareButton — found " + JSON.stringify(cultureActions));
}

// ── 5. NO DEAD-END CTA ON AN EDITORIAL PAGE ───────────────────────────────
// The owner reported the same button twice, seven days apart: "our blog's
// buttons don't work — they throw you to the main page and do nothing"
// (2026-08-12) and "this button makes no sense ... it went back to the main
// page" (2026-08-19). Both times it was "/?intent=" + an SEO keyword.
//
// v7.13 fixed the PARSER — the homepage now reads ?intent= and runs it as a
// search — and the button still did nothing, because the input was never
// answerable: 21 of 39 guide keywords name no place ("birthday freebies
// bradenton sarasota"), and the effect that runs the search is gated on
// `center`, so a visitor who has not granted location gets nothing at all.
//
// So this does not assert "the parser exists". It asserts that no editorial
// page hands a reader an action whose destination is the bare homepage.
{
  const DEAD = /(?:primaryHref|href)=\{?"?\/\?intent=/;
  for (const rel of ["app/guides/[slug]/page.js", "app/culture/[metro]/page.js"]) {
    const src = strip(read(rel));
    ok(!DEAD.test(src),
       rel + ': a hero CTA points at "/?intent=<keyword>" again — that feeds an SEO phrase into a place search, which cannot answer it, and drops the reader on the homepage (DEAD-END)');
  }
  // And the hero must tolerate having no primary, or removing one leaves the
  // panel with no action at all.
  const hero = strip(read("app/components/PremiumIntentHero.js"));
  ok(/primaryHref = null/.test(hero), "PremiumIntentHero must default primaryHref to null — a default of \"/\" silently restores the dead end for any caller that stops passing one");
  ok(/\{primaryHref \? <a className="wf-intent-primary"/.test(hero), "the hero must render its primary conditionally");
  ok(/className=\{primaryHref \? "wf-intent-secondary" : "wf-intent-primary"\}/.test(hero),
     "with no primary the secondary must BECOME the primary — an editorial page with no visible action is not an improvement on one with a broken action");
  // The guides' breadcrumb is the one back link. Two "All guides" stacked on
  // every guide page is what the hero's own copy produced.
  // ONE LINK PER DESTINATION. "All guides" shipped twice on every guide page —
  // once in the breadcrumb, once in the hero chrome, stacked. Both back
  // affordances are guard-required (check-guides pins the "Back to Wayfind"
  // anchor, check-hero-chrome pins the hero's backHref prop), so the fix is not
  // to delete one of them: it is to stop them pointing at the same place.
  const gp = strip(read("app/guides/[slug]/page.js"));
  // VISIBLE links only: href= and the hero's backHref=. The JSON-LD
  // BreadcrumbList also contains SITE_URL + "/guides", and counting structured
  // data as a second link is how this assertion first failed on a correct page.
  const toIndex = (gp.match(/(?:back)?[Hh]ref="\/guides"/g) || []).length;
  ok(toIndex === 1, 'the guide page links to /guides ' + toIndex + ' times — it must be exactly once, or "All guides" renders twice on every guide');
  const backControl = strip(read("app/components/ReturnToWayfind.js"));
  ok(/import ReturnToWayfind from "\.\.\/\.\.\/components\/ReturnToWayfind"/.test(gp) && /<ReturnToWayfind\b/.test(gp) && /<a\b[^>]*href="\/"[^>]*>‹ Back to Wayfind<\/a>/.test(backControl), "the guide must render the shared back-to-the-app anchor with its visible label and home fallback");
  ok(/backHref="\/guides"/.test(gp), "the hero chrome is where the index link lives");
}

if (fails.length) {
  console.error("check-guide-share: FAIL — " + fails.length + "/" + n);
  for (const f of fails) console.error("  · " + f);
  process.exit(1);
}
console.log("check-guide-share: OK — " + n + " assertions; every one of " + Object.keys(GUIDES).length
  + " guides renders two share controls over a server-built canonical URL, and all share entry points reuse the same explicit text-first policy");
