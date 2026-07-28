// scripts/test-analytics.mjs — prebuild gate for the Google measurement bridge.
//
// The account previously reported a LANDING-PAGE LOAD as its primary conversion
// while no real conversion could ever fire. Both halves of that are regressions
// waiting to happen again, so they are pinned here:
//   - a page view / result impression is NEVER a primary conversion
//   - one user action produces at most one PostHog event and one Google event
//   - a missing or placeholder conversion label degrades to "skip", never to a
//     guessed label reporting into the wrong action
//
// Runs in plain Node with no DOM: importing these modules at all is itself the
// SSR test, since any module-scope `window` access would throw on import.
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0;
const fail = (m) => { console.error("test-analytics: FAIL — " + m); failures++; };
const ok = (c, m) => { if (!c) fail(m); };

/* ── env for the module under test (set BEFORE import) ─────────────────── */
process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID = "G-TEST123456";
process.env.NEXT_PUBLIC_ADS_LABEL_SIGNUP = "sIgnUpLabel123";
process.env.NEXT_PUBLIC_ADS_LABEL_AFFILIATE = "affLabel456789";
// save/detail labels deliberately LEFT UNSET — the "fails safely" path.

const A = await import("../lib/analytics.js");
const AT = await import("../lib/attribution.js");

// SSR: importing succeeded with no `window` in scope. Also assert the public
// entry points are callable server-side without throwing.
{
  ok(typeof window === "undefined", "test harness really has no window (SSR-like)");
  let threw = null;
  try { A.forwardToGoogle("save", { place_id: "x" }); A.trackPageView("/x"); AT.readAttribution(); AT.decorateHref("/a"); }
  catch (e) { threw = e; }
  ok(!threw, "analytics + attribution entry points are SSR-safe (threw: " + (threw && threw.message) + ")");
  const rep = A.forwardToGoogle("save", { place_id: "ssr" });
  ok(rep.ga4 === false && rep.ads === false, "no gtag on the server => nothing is reported");
}

/* ── classification: a page view is never a conversion ─────────────────── */
{
  ok(A.classify("signup_completed") === "primary", "signup_completed is primary");
  for (const e of A.AFFILIATE_EVENTS) ok(A.classify(e) === "primary", e + " is primary");
  ok(A.AFFILIATE_EVENTS.length === 7, "all seven affiliate events are classified");
  ok(A.classify("save") === "secondary", "save is secondary");
  ok(A.classify("detail_open") === "secondary", "detail_open is secondary");
  for (const e of ["$pageview", "page_view", "search", "result_count_shown", "hero_impression", "signup_started", "login_completed"]) {
    ok(A.classify(e) === "analytics", e + " is analytics-only, NEVER a conversion");
  }
  ok(A.PRIMARY_EVENTS.indexOf("$pageview") < 0 && A.PRIMARY_EVENTS.indexOf("page_view") < 0, "no page view is in the primary set");
  ok(A.PRIMARY_EVENTS.indexOf("result_count_shown") < 0, "a result impression is not a primary conversion");
  ok(A.PRIMARY_EVENTS.indexOf("signup_started") < 0, "starting a signup is not a completed signup");
}

/* ── label validation: never invent, never accept junk ─────────────────── */
{
  ok(A.isValidConversionLabel("AbC-D_efGh12345678") === true, "a real-shaped label validates");
  for (const bad of ["", "   ", "xxx", "TODO", "tbd", "none", "your-label", "replace_me",
                     "AW-18342267447/abc", "AW-123456789", "has space", "ab", "a".repeat(41)]) {
    ok(A.isValidConversionLabel(bad) === false, "rejects junk label: " + JSON.stringify(bad));
  }
  ok(A.isValidGa4Id("G-ABC1234567") === true, "valid GA4 id accepted");
  for (const bad of ["", "UA-12345-1", "G-", "AW-18342267447", "g-abc"]) {
    ok(A.isValidGa4Id(bad) === false, "rejects bad GA4 id: " + JSON.stringify(bad));
  }
  ok(A.isValidAdsId("AW-18342267447") === true, "valid Ads id accepted");
  ok(A.adsId() === "AW-18342267447", "falls back to the live account id when env is unset");
  const labels = A.conversionLabels();
  ok(labels.signup === "sIgnUpLabel123", "configured signup label is exposed");
  ok(labels.save === null && labels.detail === null, "UNSET labels read as null, never as a guess");
}

/* ── the bridge: one action, one event ─────────────────────────────────── */
function harness() {
  const calls = [];
  const gtag = (...args) => { calls.push(args); };
  return { calls, gtag };
}

{
  A._resetDedupe();
  const h = harness();
  const rep = A.forwardToGoogle("tickets_out", { place_id: "p1", provider: "viator" }, { gtag: h.gtag });
  ok(rep.tier === "primary" && rep.ga4 === true && rep.ads === true, "affiliate click reports GA4 + Ads");
  ok(h.calls.length === 2, "exactly two gtag calls (one GA4 event, one Ads conversion), got " + h.calls.length);
  const ga4Call = h.calls.find((c) => c[1] === "tickets_out");
  ok(!!ga4Call, "GA4 keeps the SPECIFIC event name (tickets_out)");
  const adsCall = h.calls.find((c) => c[1] === "conversion");
  ok(!!adsCall, "an Ads conversion fired");
  ok(adsCall && adsCall[2].send_to === "AW-18342267447/affLabel456789", "Ads send_to is account/label");
  ok(adsCall && adsCall[2].event_label === "affiliate_click", "affiliate actions consolidate to one Ads action");
  ok(adsCall && adsCall[2].provider === "viator", "the specific partner survives on the conversion");
}

// Secondary with NO configured label: GA4 still fires, Ads is skipped safely.
{
  A._resetDedupe();
  const h = harness();
  const rep = A.forwardToGoogle("save", { place_id: "p2" }, { gtag: h.gtag });
  ok(rep.tier === "secondary", "save is secondary");
  ok(rep.ga4 === true, "GA4 still receives the event without an Ads label");
  ok(rep.ads === false, "no label => NO Ads conversion (never a guessed one)");
  ok(String(rep.skipped).indexOf("no_label") === 0, "the skip reason is explicit, got " + rep.skipped);
  ok(h.calls.length === 1, "only the GA4 call fired, got " + h.calls.length);
}

// Analytics-only events never produce an Ads conversion.
{
  for (const e of ["search", "result_count_shown", "signup_started", "login_completed"]) {
    A._resetDedupe();
    const h = harness();
    const rep = A.forwardToGoogle(e, { place_id: "z" }, { gtag: h.gtag });
    ok(rep.ads === false, e + " must not produce an Ads conversion");
    ok(h.calls.every((c) => c[1] !== "conversion"), e + " fired no conversion call");
  }
}

/* ── duplicate suppression: Strict Mode, re-render, double tap ─────────── */
{
  A._resetDedupe();
  const h = harness();
  const first = A.forwardToGoogle("tickets_out", { place_id: "same" }, { gtag: h.gtag, now: 1000 });
  const second = A.forwardToGoogle("tickets_out", { place_id: "same" }, { gtag: h.gtag, now: 1100 });
  ok(first.ads === true, "first outbound click converts");
  ok(second.ads === false && second.skipped === "duplicate", "the immediate repeat is suppressed");
  ok(h.calls.length === 2, "still only one action's worth of gtag calls, got " + h.calls.length);

  // A genuinely different place is NOT a duplicate.
  const other = A.forwardToGoogle("tickets_out", { place_id: "different" }, { gtag: h.gtag, now: 1150 });
  ok(other.ads === true, "a different place is a separate conversion");

  // Past the window, the same action may convert again (a real second visit).
  const later = A.forwardToGoogle("tickets_out", { place_id: "same" }, { gtag: h.gtag, now: 1000 + 60000 });
  ok(later.ads === true, "the same action converts again well after the dedupe window");
}

// Route changes must not re-report a page_view for the same path.
{
  A._resetDedupe();
  ok(A.shouldFire("page_view|/a", 0) === true, "first page_view for a path fires");
  ok(A.shouldFire("page_view|/a", 10) === false, "the Strict-Mode repeat does not");
  ok(A.shouldFire("page_view|/b", 20) === true, "a different route does fire");
}

/* ── no personal data leaves the app ───────────────────────────────────── */
{
  const clean = A.sanitizeParams({
    place_id: "p", place_name: "Museum", provider: "viator",
    email: "someone@example.com", password: "hunter2",
    note: "free text the user typed", utm_source: "google",
    contact: "reach me at a@b.com",
  });
  ok(clean.place_id === "p" && clean.provider === "viator", "allowed keys survive");
  ok(clean.utm_source === "google", "campaign metadata survives");
  ok(clean.email === undefined && clean.password === undefined, "email/password are dropped");
  ok(clean.note === undefined, "unlisted free-text keys are dropped");
  ok(clean.contact === undefined, "email-shaped values are dropped even on allowed keys");
}

/* ── missing env fails safely ──────────────────────────────────────────── */
{
  // No gtag on the page at all (blocked by an ad blocker, or not yet loaded).
  A._resetDedupe();
  const rep = A.forwardToGoogle("tickets_out", { place_id: "x" }, { gtag: null });
  ok(rep.skipped === "no_gtag" && rep.ga4 === false && rep.ads === false, "no gtag => clean no-op, no throw");
  let threw = null;
  try { A.forwardToGoogle("", {}, {}); A.forwardToGoogle(null, null, null); } catch (e) { threw = e; }
  ok(!threw, "garbage input does not throw (" + (threw && threw.message) + ")");
}

/* ── attribution ───────────────────────────────────────────────────────── */
{
  const p = AT.parseAttribution("?gclid=abc123&utm_source=google&utm_medium=cpc&utm_campaign=orlando&nope=x");
  ok(p.gclid === "abc123", "gclid is captured");
  ok(p.utm_source === "google" && p.utm_medium === "cpc" && p.utm_campaign === "orlando", "utm params are captured");
  ok(p.nope === undefined, "unrelated params are ignored");
  ok(AT.ATTRIBUTION_KEYS.length === 8, "all eight required attribution keys are covered");
  for (const k of ["gclid", "gbraid", "wbraid", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    ok(AT.ATTRIBUTION_KEYS.indexOf(k) >= 0, k + " is in the captured set");
  }
  ok(AT.isPaid({ gclid: "x" }) === true, "a gclid means paid");
  ok(AT.isPaid({ gbraid: "x" }) === true, "a gbraid means paid");
  ok(AT.isPaid({ utm_medium: "cpc" }) === true, "medium=cpc means paid");
  ok(AT.isPaid({ utm_source: "newsletter" }) === false, "an organic utm is not paid");
  ok(AT.parseAttribution("").gclid === undefined, "empty search yields nothing");
  ok(AT.parseAttribution("?gclid=" + "a".repeat(500)).gclid === undefined, "absurdly long values are dropped");

  // Preserved through navigation.
  const attr = { gclid: "abc123", utm_source: "google", utm_medium: "cpc" };
  const href = AT.decorateHref("/?place=xyz", attr);
  ok(href.indexOf("place=xyz") >= 0, "the original param survives decoration");
  ok(href.indexOf("gclid=abc123") >= 0, "gclid is carried through navigation");
  ok(href.indexOf("utm_source=google") >= 0, "utm_source is carried through navigation");
  ok(AT.decorateHref("https://example.com/x", attr) === "https://example.com/x", "external URLs are untouched");
  ok(AT.decorateHref("/a#b", attr).indexOf("#b") > 0, "the hash survives decoration");
  // An href that already carries a value keeps its own.
  ok(AT.decorateHref("/?gclid=own", attr).indexOf("gclid=own") >= 0, "an explicit param is not overwritten");
  ok(AT.attributionParams(attr).gclid === undefined, "click IDs are NOT attached to events");
  ok(AT.attributionParams(attr).utm_source === "google", "campaign shape IS attached to events");
}

/* ── source guarantees ─────────────────────────────────────────────────── */
{
  const layout = readFileSync(join(ROOT, "app/layout.js"), "utf8");
  ok(layout.indexOf("GoogleTags") >= 0, "layout mounts the GoogleTags component");
  ok(!/gtag\('config', 'AW-/.test(layout), "the old inline config snippet is gone from layout");

  const tags = readFileSync(join(ROOT, "app/components/GoogleTags.js"), "utf8");
  ok(tags.indexOf('"use client"') === 0, "GoogleTags is a client component");
  ok(tags.indexOf("send_page_view: false") >= 0, "the Ads config does NOT auto-report page views as conversions");

  const analytics = readFileSync(join(ROOT, "lib/analytics.js"), "utf8");
  // Every window/gtag touch must sit inside a function, never at module scope.
  const moduleScope = analytics.split("\n").filter((l) => /^(const|let|var)\s+\w+\s*=.*\bwindow\b/.test(l));
  ok(moduleScope.length === 0, "lib/analytics.js never reads window at module scope");

  const home = readFileSync(join(ROOT, "app/home.js"), "utf8");
  ok(home.indexOf("forwardToGoogle(action") >= 0, "home.js logEvent forwards to Google");
  ok((home.match(/logEvent\("signup_completed"/g) || []).length >= 1, "signup_completed is fired on real completion");
  ok(home.indexOf('logEvent("signup_started")') >= 0, "signup_started is fired as intent");
  // The confirmation-email branch creates an account WITHOUT a session — it is
  // not a completed signup and must not convert.
  const emailBranch = home.indexOf("Account created. Check your email to confirm");
  ok(emailBranch > 0, "the unconfirmed-signup branch still exists");
  const around = home.slice(emailBranch - 400, emailBranch);
  ok(around.indexOf("signup_completed") < 0, "an unconfirmed signup does NOT report a conversion");
}

if (failures) { console.error(`test-analytics: ${failures} failure(s)`); process.exit(1); }
console.log("test-analytics: OK");
