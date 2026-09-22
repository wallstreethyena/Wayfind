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
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { execSync } from "child_process";

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
  ok(/logEvent\(authMode === "signup" \? "signup_completed" : "login_completed"/.test(home), "signup_completed is fired only on a real session");
  ok(home.indexOf('logEvent("signup_started")') >= 0, "signup_started is fired as intent");
  // The confirmation-email branch creates an account WITHOUT a session — it is
  // not a completed signup and must not convert.
  const emailBranch = home.indexOf("Check your email to confirm your account");
  ok(emailBranch > 0, "the unconfirmed-signup branch still exists");
  const around = home.slice(emailBranch - 400, emailBranch);
  ok(around.indexOf("signup_completed") < 0, "an unconfirmed signup does NOT report a conversion");
}

/* ── partner_click is the ONE Ads-conversion event for verified partner
   hand-offs (2026-09-22 revision) ───────────────────────────────────────── */
// GUIDE PAGES reported zero Google Ads conversions: nothing on /guides/*
// forwarded a verified partner click to Google at all. The FIRST fix tried —
// treating commerce_cta_clicked + a caller-supplied monetized:true as the
// conversion — was itself unsafe: GuideConversion already calls
// track("commerce_cta_clicked", { monetized: !!cta.monetized }) for every
// guide CTA, and lib/track.js forwards every track() call to
// forwardToGoogle, so that rule DOUBLE-COUNTED the same click the beacon also
// reports, under a different dedupe key — and it counted clicks on
// lib/guideCta.js's $0 "courtesy" coupons (raw links to the partner's own
// site, monetized:true for PostHog's own reasons) as paid conversions. A
// verified click_id is required.
//
// So commerce_cta_clicked is now classified purely as "analytics" — never a
// conversion, whatever params it carries — and `partner_click` (sent from
// exactly one place, CommerceClickBeacon, only after verifying the clicked
// href resolves to one of our four partner redirect routes) is the only
// event that can produce an Ads conversion.
{
  ok(A.PARTNER_CLICK_EVENT === "partner_click", "PARTNER_CLICK_EVENT is the literal event name partner_click");
  ok(A.classify(A.PARTNER_CLICK_EVENT) === "primary", "partner_click is a primary conversion");
  ok(A.labelKeyFor(A.PARTNER_CLICK_EVENT) === "affiliate", "partner_click uses the single affiliate label (event_label affiliate_click)");
  ok(A.AFFILIATE_EVENTS.length === 7, "the legacy seven affiliate events are unchanged");
  ok(A.AFFILIATE_EVENTS.indexOf(A.PARTNER_CLICK_EVENT) < 0, "partner_click is NOT added to the legacy seven — isAffiliateClick treats it as its own, eighth case");

  // THE RINGLING / DOUBLE-COUNT PROTECTION. commerce_cta_clicked used to be a
  // conversion when monetized:true; it is now indistinguishable from any
  // other analytics-only event, on purpose, REGARDLESS of params.
  ok(A.classify("commerce_cta_clicked", { monetized: true }) === "analytics", "commerce_cta_clicked is no longer a conversion path, even monetized:true — this is the double-count / courtesy-coupon fix");
  ok(A.labelKeyFor("commerce_cta_clicked", { monetized: true }) === null, "commerce_cta_clicked never resolves to a label bucket any more");
  ok(A.classify("commerce_cta_clicked") === "analytics", "commerce_cta_clicked with no params at all is analytics-only, same as every other shape");
}

/* ── forwardToGoogle: partner_click sends exactly one conversion ───────── */
{
  A._resetDedupe();
  const h = harness();
  const rep = A.forwardToGoogle(A.PARTNER_CLICK_EVENT, { provider: "tiqets", surface: "guide", click_id: "should-not-reach-google" }, { gtag: h.gtag, dedupeKey: "partner_click|click-aaaaaaaa" });
  ok(rep.ads === true && rep.tier === "primary", "partner_click fires the Ads conversion, got " + JSON.stringify(rep));
  const convCalls = h.calls.filter((c) => c[1] === "conversion");
  ok(convCalls.length === 1, "exactly one conversion call, got " + convCalls.length);
  const conv = convCalls[0];
  ok(conv[2].send_to === "AW-18342267447/affLabel456789", "send_to is account/label");
  ok(conv[2].event_label === "affiliate_click", "event_label consolidates onto the one affiliate_click action");
  ok(conv[2].provider === "tiqets" && conv[2].surface === "guide", "provider + surface carry on the conversion");
  ok(!("click_id" in conv[2]), "click_id is NOT in the allowed param list — it never reaches Google, it only steers dedupe");

  const again = A.forwardToGoogle(A.PARTNER_CLICK_EVENT, { provider: "tiqets", surface: "guide" }, { gtag: h.gtag, dedupeKey: "partner_click|click-aaaaaaaa" });
  ok(again.ads === false && again.skipped === "duplicate", "a second call with the SAME click_id (same dedupeKey) within the window is skipped as a duplicate");

  const different = A.forwardToGoogle(A.PARTNER_CLICK_EVENT, { provider: "tiqets", surface: "guide" }, { gtag: h.gtag, dedupeKey: "partner_click|click-bbbbbbbb" });
  ok(different.ads === true, "a DIFFERENT click_id fires its own, separate conversion");
}

// The DEFAULT dedupe key (no explicit dedupeKey option): PARTNER_CLICK_EVENT
// + a non-empty params.click_id composes "partner_click|<click_id>" on its
// own, exactly like the explicit key above — CommerceClickBeacon relies on
// this so it does not have to hand-build the string itself.
{
  A._resetDedupe();
  const h = harness();
  const rep1 = A.forwardToGoogle(A.PARTNER_CLICK_EVENT, { provider: "viator", surface: "guide", click_id: "click-1111" }, { gtag: h.gtag });
  ok(rep1.ads === true, "partner_click with a click_id converts on its own default dedupe key");
  const rep2 = A.forwardToGoogle(A.PARTNER_CLICK_EVENT, { provider: "viator", surface: "guide", click_id: "click-1111" }, { gtag: h.gtag });
  ok(rep2.skipped === "duplicate", "the same click_id, with NO explicit dedupeKey passed, still dedupes correctly under its own default key");
  const rep3 = A.forwardToGoogle(A.PARTNER_CLICK_EVENT, { provider: "viator", surface: "guide", click_id: "click-2222" }, { gtag: h.gtag });
  ok(rep3.ads === true, "a different click_id converts again under the default key");
}

/* ── planPartnerClick: the pure decision behind the beacon, CALLED ─────── */
// Per CLAUDE.md's "assert on the CALL, not on the string" — the pure logic
// lives in lib/partnerClick.js precisely so it can be imported and invoked
// here under plain Node (a "use client" React component cannot be).
{
  const PC = await import("../lib/partnerClick.js");
  let minted = 0;
  const mint = () => "minted-click-" + (++minted);

  // Unowned /api/commerce/go, no click_id on the href: mints one, rewrites
  // the href to carry it (so the redirect can join on it), and tells the
  // beacon to ALSO record commerce_cta_clicked to PostHog itself.
  {
    minted = 0;
    const plan = PC.planPartnerClick({ href: "/api/commerce/go?provider=viator&offer=abc", owned: false, locationHost: "www.gowayfind.com", fallbackSurface: "guide", mint });
    ok(!!plan && plan.clickId === "minted-click-1", "unowned commerce/go with no click_id mints one, got " + JSON.stringify(plan));
    ok(!!plan && typeof plan.rewriteHref === "string" && plan.rewriteHref.indexOf("click_id=minted-click-1") >= 0, "rewriteHref carries the minted click_id, got " + (plan && plan.rewriteHref));
    ok(!!plan && plan.emitPostHog === true, "an UNOWNED link asks the beacon to also emit PostHog itself");
  }

  // Owned: the rendering component already records commerce_cta_clicked
  // itself — the beacon must not touch the href or double-emit.
  {
    const plan = PC.planPartnerClick({ href: "/api/commerce/go?provider=viator&offer=abc", owned: true, locationHost: "www.gowayfind.com", fallbackSurface: "guide", mint });
    ok(!!plan && plan.emitPostHog === false, "an OWNED link is never double-recorded to PostHog by the beacon");
    ok(!!plan && plan.rewriteHref === null, "an OWNED link's href is left alone — the owner mints and stamps its own click_id");
  }

  // A valid click_id already on the href is reused, never re-minted.
  {
    minted = 0;
    const plan = PC.planPartnerClick({ href: "/api/commerce/go?provider=viator&offer=abc&click_id=existingId123", owned: false, locationHost: "www.gowayfind.com", mint });
    ok(!!plan && plan.clickId === "existingId123", "an existing valid click_id in the href is reused, got " + (plan && plan.clickId));
    ok(minted === 0, "the minter is never called when the href already carries a valid click_id");
  }

  // /api/viator/go (and the other two non-joinable routes) are never
  // rewritten, even when unowned — only /api/commerce/go joins on click_id.
  {
    const plan = PC.planPartnerClick({ href: "/api/viator/go?placeId=x&q=museum", owned: false, locationHost: "www.gowayfind.com", mint });
    ok(!!plan && plan.rewriteHref === null, "/api/viator/go is never rewritten");
    ok(!!plan && plan.googleParams.provider === "viator", "the route's own provider is used when the href carries none");
  }

  // Non-partner content paths never plan a click.
  ok(PC.planPartnerClick({ href: "/guides/orlando-things-to-do", owned: false, locationHost: "www.gowayfind.com", mint }) === null, "a guide's own content path is never a partner click");
  ok(PC.planPartnerClick({ href: "https://www.ringling.org/tickets", owned: false, locationHost: "www.gowayfind.com", mint }) === null, "a courtesy link straight to a partner's own site (no commission, no /go route) is never a partner click");

  // HOST VERIFICATION — the path alone is not proof of origin.
  ok(PC.planPartnerClick({ href: "https://evil.example/api/viator/go?placeId=x&q=museum", owned: false, locationHost: "www.gowayfind.com", mint }) === null, "an absolute link to a FOREIGN host that merely reuses our path is refused");

  // Our own absolute host (apex or www) counts exactly like a relative link.
  {
    const plan = PC.planPartnerClick({ href: "https://www.gowayfind.com/api/hotels/go?provider=stay22&offer=abc", owned: false, locationHost: "gowayfind.com", mint });
    ok(!!plan && plan.googleParams.provider === "stay22", "an absolute link to our OWN host (www.gowayfind.com) still counts, got " + JSON.stringify(plan));
  }
}

/* ── wiring: syntactic ROLE, not substring (CLAUDE.md) ──────────────────── */
{
  const layout = readFileSync(join(ROOT, "app/guides/layout.js"), "utf8");
  ok(/from ["']\.\.\/components\/CommerceClickBeacon["']/.test(layout), "app/guides/layout.js imports CommerceClickBeacon");
  ok(/<CommerceClickBeacon[\s/>]/.test(layout), "app/guides/layout.js actually RENDERS the beacon — a rendered element, not merely an import");
  ok(!/^["']use client["']/.test(layout.trim()), "the guides layout stays a server component (no \"use client\" of its own)");

  const beacon = readFileSync(join(ROOT, "app/components/CommerceClickBeacon.js"), "utf8");
  ok(/^["']use client["']/.test(beacon.trim()), "CommerceClickBeacon is a client component");
  ok(/import\s*\{[^}]*\bPARTNER_CLICK_EVENT\b[^}]*\}\s*from\s*["']\.\.\/\.\.\/lib\/analytics["']/.test(beacon), "PARTNER_CLICK_EVENT is imported by name from lib/analytics");
  ok(/forwardToGoogle\(\s*PARTNER_CLICK_EVENT\b/.test(beacon), "the beacon CALLS forwardToGoogle with PARTNER_CLICK_EVENT as the event (role: the actual call site, not just the import)");
  ok(!/forwardToGoogle\(\s*"commerce_cta_clicked"/.test(beacon), "the beacon no longer forwards the OLD commerce_cta_clicked/monetized shape to Google");
  ok(/emitCommerce\(\s*"commerce_cta_clicked"/.test(beacon), "the beacon can still record the PostHog commerce event through emitCommerce, for links nobody else owns");
  ok(/analyticsSuppressionReason\(/.test(beacon), "the beacon checks the SAME suppression predicate lib/track.js uses");
  ok(/__WF_ANALYTICS_SUPPRESSED/.test(beacon), "the beacon also honors the owner/internal override flag, same as lib/track.js");

  for (const f of ["app/go/florida/page.js", "app/florida-events/page.js"]) {
    const src = readFileSync(join(ROOT, f), "utf8");
    ok(/<CommerceClickBeacon\s+surface=/.test(src), f + " still mounts CommerceClickBeacon (unchanged by this revision)");
  }

  const commerce = readFileSync(join(ROOT, "lib/commerce.js"), "utf8");
  ok(commerce.indexOf("forwardToGoogle") < 0, "emitCommerce never forwards to Google by itself (would double count legacy *_out surfaces)");
}

/* ── completeness: every commerce_cta_clicked emitter owns its anchor(s) ── */
// data-commerce-owner is how a component tells the beacon "I already record
// this click to PostHog myself — don't do it again." A file that emits
// commerce_cta_clicked from an anchor with NO such marker is a silent
// double-count waiting for the beacon to be mounted on its page.
//
// RAILCARD_ALLOWLIST: BestNearby.js / IntentRail.js / FallIntentRails.js pass
// a `cta` object (with its own onClick) into the SHARED app/components/
// RailCard.js, which renders the one <a> that actually fires it — these
// three files contain no anchor of their own to mark, and RailCard.js mixes
// tracked and untracked `cta` callers, so ownership cannot be expressed
// there without a wider change to RailCard's contract. None of the three is
// reachable from any page CommerceClickBeacon is mounted on today (home.js /
// /eat, not /guides or /go/florida), so this is a documented gap, not a live
// double-count.
const RAILCARD_ALLOWLIST = new Set([
  "app/components/BestNearby.js",
  "app/components/IntentRail.js",
  "app/components/FallIntentRails.js",
]);
const OWNER_ATTR_RX = /\sdata-commerce-owner=(?:"[^"]*"|\{[^}]*\})/; // a real JSX attribute, not a substring anywhere in the file

function scanCommerceOwnership() {
  const raw = execSync(
    `grep -rlE 'emitCommerce\\("commerce_cta_clicked"|track\\("commerce_cta_clicked"' app`,
    { cwd: ROOT, encoding: "utf8" },
  );
  const hits = raw.split("\n").map((s) => s.trim()).filter(Boolean).sort();
  const checked = hits.filter((f) => f !== "app/components/CommerceClickBeacon.js" && !RAILCARD_ALLOWLIST.has(f));
  const violations = checked.filter((f) => !OWNER_ATTR_RX.test(readFileSync(join(ROOT, f), "utf8")));
  return { hits, checked, violations };
}

{
  const { hits, checked, violations } = scanCommerceOwnership();
  // Positive control: prove the scan itself finds the real emitters before
  // trusting a "0 violations" result — a broken grep pattern would report a
  // false-clean scan that proves nothing (CLAUDE.md's known failure mode).
  ok(hits.length === 20, "completeness scan finds the expected 20 commerce_cta_clicked-emitting files under app/ (a new emitter changes this count on purpose — update it here AND give the new anchor ownership), got " + hits.length + ": " + hits.join(", "));
  ok(checked.length === hits.length - 1 - RAILCARD_ALLOWLIST.size, "the beacon itself + the 3-file RailCard allowlist are excluded; every other emitter is held to the check");
  ok(violations.length === 0, "every non-excluded commerce_cta_clicked emitter carries data-commerce-owner on the anchor whose onClick fires it: " + violations.join(", "));
}

// RED-PROVE. A check that reads real source and stays green on the exact
// mutation it exists to catch is decoration (CLAUDE.md). Sabotage ONE real
// marker on disk, confirm the mutation actually landed (not a silent no-op),
// re-run THIS GUARD'S OWN scan and watch it go red, then restore byte-for-
// byte — in a try/finally so a crash mid-probe can never leave the repo
// dirty.
{
  const target = join(ROOT, "app/guides/[slug]/GuideConversion.js");
  const original = readFileSync(target, "utf8");
  const needle = ' data-commerce-owner="GuideConversion"';
  const foundCount = original.split(needle).length - 1;
  ok(foundCount === 1, "red-prove setup: GuideConversion.js carries exactly one data-commerce-owner marker to sabotage, found " + foundCount);

  let redResult = null;
  try {
    const mutated = original.replace(needle, "");
    ok(mutated.length === original.length - needle.length, "red-prove: the sabotage removed exactly the marker's own length from the in-memory copy");
    writeFileSync(target, mutated);
    const onDisk = readFileSync(target, "utf8");
    ok(onDisk.indexOf(needle) < 0 && onDisk === mutated, "red-prove: the sabotage actually landed on disk — read back and confirmed, not assumed");
    redResult = scanCommerceOwnership();
  } finally {
    writeFileSync(target, original);
  }
  const restored = readFileSync(target, "utf8");
  ok(restored === original, "red-prove: GuideConversion.js was restored byte-for-byte after the probe");
  ok(!!redResult && redResult.violations.indexOf("app/guides/[slug]/GuideConversion.js") >= 0, "red-prove: with the marker removed, THIS GUARD'S OWN scan reports GuideConversion.js as a violation — proves the check is not decoration");
}

if (failures) { console.error(`test-analytics: ${failures} failure(s)`); process.exit(1); }
console.log("test-analytics: OK");
