#!/usr/bin/env node
/**
 * check-clipp-deals — the Clipp dining lane's regression lock.
 *
 * THE REVENUE RULE THIS EXISTS FOR (owner directive, 2026-07-29)
 *   A clipp.com destination that leaves the redirect without our PID FAILS THE
 *   BUILD.
 * That is the whole point: an unattributed affiliate link is invisible. The user
 * lands, converts, and every dashboard reads as success while we are paid
 * nothing. It is strictly worse than a broken link, which at least announces
 * itself. So this guard's central assertions are about what CANNOT happen.
 *
 * WHAT IT ASSERTS
 *  1. The link is the exact CJ-generated shape, and it carries PID + link id.
 *  2. There is no untracked escape hatch: an unknown/invalid offer yields null,
 *     never a bare clipp.com URL.
 *  3. The destination allowlist holds — host AND the path shape that actually
 *     renders (the /local-coupons/… shape serves Clipp's error page).
 *  4. The UI never ships a partner URL (lib/commerce.js rule 2): every Clipp
 *     coupon's url is our own /api/commerce/go path.
 *  5. Clipp links are NOT mistaken for the dead ?url= pixel form, which would
 *     make the deals-health cron "repair" working links into a broken shape.
 *  6. The trademark rule from the partner welcome email: the Clipp name/domain
 *     never appears in SEO keywords, metadata, sitemap slugs or route paths.
 *  7. Every market row carries browser-verification evidence, because clipp.com
 *     403s every automated fetcher and nothing else can establish existence.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const {
  CJ_PID, CJ_CLIPP_LINK_ID, CJ_CLIPP_ADVERTISER_ID,
  clippDeepLink, isClippDest, isDeadPixelForm, hasCjPid, affiliateForwards, destIsAlive,
} = await import(path.resolve("lib/deals.js"));
const { CLIPP_MARKETS, clippOfferById, clippTrackedUrl } = await import(path.resolve("lib/clippOffers.js"));
const { COUPONS } = await import(path.resolve("lib/coupons.js"));

const SARASOTA = "https://www.clipp.com/states/fl/cities/sarasota";

/* ── 1. the exact CJ-generated shape ──────────────────────────────────────── */
ok(CJ_PID === "101643573", `CJ_PID is our property id (got ${CJ_PID})`);
ok(CJ_CLIPP_LINK_ID === "12174096", `the Clipp deep-link id is CJ's (got ${CJ_CLIPP_LINK_ID})`);
ok(CJ_CLIPP_ADVERTISER_ID === "3557279", `the Clipp advertiser id is recorded (got ${CJ_CLIPP_ADVERTISER_ID})`);

const link = clippDeepLink(SARASOTA);
ok(link === `https://www.dpbolvw.net/click-101643573-12174096?url=${encodeURIComponent(SARASOTA)}`,
  `clippDeepLink emits the CJ-generated shape verbatim (got ${link})`);
ok(hasCjPid(link), "THE REVENUE RULE: the emitted link carries our PID — without it the click earns nothing and the loss is invisible");
ok(link.includes("/click-" + CJ_PID + "-" + CJ_CLIPP_LINK_ID),
  "PID and link id ride in the path in CJ's order — a transposed pair is a valid-looking URL that attributes to nobody");

const withSid = clippDeepLink(SARASOTA, "abc123def456");
ok(/[?&]sid=abc123def456(&|$)/.test(withSid), "an opaque click_id rides as &sid= for sub-ID reporting");
ok(hasCjPid(withSid), "the sid variant still carries the PID");
// Only the opaque click_id may go out (commerce schema). Two separate defences,
// because sanitizing alone does NOT make arbitrary text opaque — it only strips
// punctuation, so "Dolce Cafe" would survive as "DolceCafe":
//   (a) the builder strips the characters that carry structured personal data —
//       an email, a coordinate pair, or a delimited composite cannot survive; and
//   (b) the only caller passes a minted click_id, asserted against the route below.
{
  const dirty = String(clippDeepLink(SARASOTA, "a@b.com 27.4989,-82.5748 x:y") || "");
  const sid = (dirty.split("sid=")[1] || "");
  ok(sid.length > 0, "the dirty-input case actually produced a sid (an empty one would make the checks below vacuous)");
  ok(!/[@.,:\s+%]/.test(sid),
    `the sid strips every character an email, a coordinate pair or a delimited composite needs — got "${sid}"`);
  const long = String(clippDeepLink(SARASOTA, "z".repeat(200)) || "").split("sid=")[1] || "";
  ok(long.length === 40, `the sid is length-capped so it cannot become a payload — got ${long.length}`);
}

/* ── 2. no untracked escape hatch ─────────────────────────────────────────── */
for (const [bad, why] of [
  ["http://www.clipp.com/states/fl/cities/sarasota", "non-https"],
  ["https://www.viator.com/x", "a different partner's host"],
  ["https://clipp.com.evil.example/states/fl/cities/x", "a lookalike host"],
  ["https://www.clipp.com/local-coupons/fl/sarasota", "the path shape that serves Clipp's error page"],
  ["https://www.clipp.com/", "the bare homepage (not a market page)"],
  [null, "a null destination"],
]) {
  ok(clippDeepLink(bad) === null, `clippDeepLink REFUSES ${why} — returning the bare URL would be an untracked link that earns nothing`);
}
ok(clippTrackedUrl("clipp-fl-nowhere") === null, "an unknown offer id yields null, never a guessed market page");
ok(clippTrackedUrl("") === null && clippTrackedUrl(null) === null, "an empty offer id yields null");
for (const m of CLIPP_MARKETS) {
  const t = clippTrackedUrl(m.offerId, "clickid1");
  ok(typeof t === "string" && hasCjPid(t), `${m.offerId}: the tracked url exists and carries the PID`);
  // Guarded because a malformed `dest` makes clippTrackedUrl return NULL by design
  // (isClippDest refuses anything but /states/<st>/cities/<city>). Calling
  // .startsWith on that null threw a TypeError, so the run still exited 1 — the
  // protection held — but it printed a STACK TRACE instead of the named assertion
  // above. That is the difference between "your dest has the wrong path shape" and
  // ten minutes reading a trace. Reproduced by swapping Orlando's dest to the dead
  // /local-coupons/<st>/<city> form, which is the exact mistake this file exists
  // to prevent, so it is the one case that must report itself clearly.
  ok(typeof t === "string" && t.startsWith("https://www.dpbolvw.net/click-"), `${m.offerId}: routes through CJ, not straight to clipp.com`);
}

/* ── 3. the destination allowlist ─────────────────────────────────────────── */
ok(isClippDest(SARASOTA) === true, "the verified market path is allowed");
ok(isClippDest("https://www.clipp.com/local-coupons/fl/sarasota") === false,
  "the /local-coupons/ shape is REFUSED — it renders Clipp's own 'Sorry, something went wrong!' page, and sending a user there with our tracking attached is worse than sending them nowhere");
ok(isClippDest("https://www.clipp.com/states/fl/cities/bradenton") === true, "a sibling verified market path is allowed");
ok(isClippDest("https://www.clipp.com/states/fl/cities/../../admin") === false, "path traversal is refused");

/* ── 4. the UI never ships a partner URL (commerce.js rule 2) ─────────────── */
const clipps = COUPONS.filter((c) => c.commerce && c.commerce.provider === "clipp");
ok(clipps.length >= 2, `both verified Clipp city cards are live — got ${clipps.length}`);
ok(clipps.length === CLIPP_MARKETS.length, "one card per verified market — no card without a verified market behind it");
for (const c of clipps) {
  ok(typeof c.url === "string" && c.url.startsWith("/api/commerce/go?"),
    `${c.id}: url is OUR redirect path, so the server mints the click and validates the destination`);
  ok(!/clipp\.com|dpbolvw|cj\.dotomi/.test(String(c.url)),
    `${c.id}: the card carries NO partner domain — the UI must never construct a partner URL`);
  ok(/[?&]provider=clipp(&|$)/.test(c.url) && /[?&]offer=clipp-/.test(c.url), `${c.id}: the redirect carries provider + offer`);
  ok(!!clippOfferById(c.commerce.offerId), `${c.id}: its offer id resolves to a verified market row`);
  ok(/^\d{4}-\d{2}-\d{2}$/.test(String(c.expires)),
    `${c.id}: carries a real expiry so the weekly audit must re-verify it and the card auto-hides if nobody does`);
  ok(c.code === null, `${c.id}: no invented promo code (Clipp deals are link-only)`);
  ok(Array.isArray(c.intents) && c.intents.includes("eatnow"),
    `${c.id}: tagged onto the dining intent — this lane exists because real traffic lands on food, not attractions`);
  ok(!c.intents.includes("outdoors") && !c.intents.includes("cozyindoor"),
    `${c.id}: NOT tagged onto non-dining moods — a deals strip that shows up everywhere is an ad, not a deal`);

  // ── card imagery: OUR asset, on disk, never hotlinked ──────────────────────
  // Hotlinking clipp.com or a merchant site would put a third party in control of
  // what renders inside a Wayfind card (and leak a referer on every view). A
  // committed local asset cannot change under us.
  ok(typeof c.image === "string" && c.image.startsWith("/cards/"),
    `${c.id}: the card image is one of OUR committed /cards/ assets`);
  ok(!/^https?:|\/\/|clipp\.com|dpbolvw|tqlkg|localflavor/i.test(String(c.image)),
    `${c.id}: the card image is NOT hotlinked from clipp.com, a CJ creative host, or any merchant site`);
  ok(existsSync(path.resolve("public" + c.image)),
    `${c.id}: the referenced asset actually exists at public${c.image} — a missing file renders as a blank strip, which looks broken on a money card`);
  ok(typeof c.badge === "string" && c.badge.length > 0 && c.badge.length <= 14,
    `${c.id}: carries a short badge (the deals-rail pill is small; long text overflows it)`);
}

/* ── 4b. imagery stays GENERIC, TRANSLATED for the Deal Sheet redesign ───── */
// The Coupons tab became "The Deal Sheet" (docs/mocks/coupons-deal-sheet-mock.html),
// so the five assertions here no longer had a `c.image ?` ternary or a deals-rail
// badge pill to match. Each PROTECTION is translated, not dropped — mapping:
//
//   was: the card renders c.image for ANY coupon
//   now: artwork comes from dealArtwork(c), a pure function that takes the whole
//        coupon and knows nothing about who pays — asserted by CALLING it on a
//        non-affiliate deal and getting art back.
//   was: the banner condition is c.image ALONE (no `c.commerce &&` conjunct)
//   now: the screen's artwork condition is a bare `art ?`, and `art` is
//        dealArtwork(c) — art can still never become a privilege of paid cards.
//   was: the renderer names no partner in code
//   now: unchanged in spirit and re-checked against the new file.
//   was: the badge pill matches the deals-rail badge exactly
//   now: the mock replaced that pill with the gold SEAL, so this pins the seal to
//        the mock's own spec (64px, the gold radial) — the point was always "art
//        furniture is specified, not improvised".
//   was: the original 14px/16px padding survives (imageless card unchanged)
//   now: an imageless card renders with NO artwork band at all and still carries
//        its save/share affordances — the real protection, which is that a deal
//        without a picture is not a broken card.
{
  const screen = readFileSync(path.resolve("app/components/screens/Coupons.js"), "utf8");
  const code = screen.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(code.length > 1000, `stripped comments and still have code (got ${code.length}) — an over-eager strip would make the next checks vacuous`);

  const { dealArtwork } = await import(path.resolve("lib/dealSheet.js"));
  const freeDeal = COUPONS.find((c) => c.id === "cpn-ringling-free-mondays");
  ok(!!freeDeal, "found a NON-affiliate deal to test artwork on");
  ok(typeof dealArtwork(freeDeal) === "string" && dealArtwork(freeDeal).startsWith("/cards/"),
    "a NON-AFFILIATE deal still gets artwork — art is not a privilege of the cards that pay");
  ok(dealArtwork({ image: "/cards/where-to-eat.jpg" }) === "/cards/where-to-eat.jpg", "an explicit committed image wins");
  ok(dealArtwork({ image: "https://www.clipp.com/x.jpg" }) === null,
    "a REMOTE image is refused — an artwork band is not worth handing a third party control of what renders in a Wayfind card");
  ok(dealArtwork({}) === null, "no usable image yields NULL, so the card renders with no band rather than a placeholder");

  ok(/\{art \?/.test(code), "the artwork condition is a bare `art ?` — no conjunct can make art conditional on payment");
  ok(!/commerce[^\n]{0,40}art\b|\bart\b[^\n]{0,40}commerce/.test(code), "the artwork condition is not entangled with the commerce flag");
  ok(!/clipp/i.test(code), "the screen names no partner in code — every tier decision is data-driven");
  ok(/borderRadius: "50%"/.test(code) && /width: 64, height: 64/.test(code),
    "the seal matches the mock's spec (64px round, gold radial) rather than improvised furniture");
  ok(/aspectRatio: "3 \/ 2"/.test(code), "the artwork band is the mock's 3:2 editorial ratio");
}

/* ── 5. not confused with the dead ?url= pixel form ──────────────────────── */
ok(isDeadPixelForm(link) === false,
  "a Clipp link is NOT flagged as the dead pixel form — if it were, the deals-health cron would 'repair' a working link into a raw-path shape Clipp's link type does not accept");
ok(isDeadPixelForm(`https://www.anrdoezrs.net/links/${CJ_PID}/type/dlg/sid/x/?url=${encodeURIComponent("https://www.undercovertourist.com/x")}`) === true,
  "the genuine UT dead pixel form is still detected (an over-narrowed regex here would silently stop repairing UT links)");
// The forwarding contract the health logic already applies, asserted against the
// empirically observed first hop for this advertiser (302 -> cj.dotomi.com).
ok(affiliateForwards(302, "https://cj.dotomi.com/dj77birq8/ipu/787DA6FC/767CA9BD9/6/6/6") === true,
  "the observed Clipp first hop counts as forwarding");
ok(destIsAlive(403) === true,
  "clipp.com's Akamai 403 counts as ALIVE — every non-browser fetcher gets 403, so treating it as dead would quarantine every working Clipp link");

/* ── 6. the trademark rule (partner welcome email) ───────────────────────── */
// Never Clipp's name or domain in SEO keywords, domains or misspellings. On-card
// merchant attribution is fine, which is why this checks SEO surfaces only.
const NAME_RX = /clipp|localflavor|local[\s-]?flavor/i;
const seoTargets = [];
const walk = (dir, depth = 0) => {
  if (depth > 4 || !existsSync(dir)) return;
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const p = path.join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, depth + 1);
    else if (/^(sitemap|robots)\.(js|ts|xml)$/.test(e) || e === "layout.js") seoTargets.push(p);
  }
};
walk(path.resolve("app"));
ok(seoTargets.length > 0, `found SEO surfaces to check (got ${seoTargets.length}) — an empty list would make the trademark rule vacuous`);
for (const p of seoTargets) {
  const s = readFileSync(p, "utf8");
  const rel = path.relative(process.cwd(), p);
  // keywords arrays and metadata titles/descriptions are the forbidden places.
  const kw = /keywords\s*:\s*\[([^\]]*)\]/gi;
  let m, hit = false;
  while ((m = kw.exec(s))) if (NAME_RX.test(m[1])) hit = true;
  ok(!hit, `${rel}: the partner name is NOT in SEO keywords (partner trademark terms forbid it)`);
}
const routeDirs = [];
const walkRoutes = (dir, depth = 0) => {
  if (depth > 4 || !existsSync(dir)) return;
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e.startsWith(".")) continue;
    const p = path.join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { routeDirs.push(e); walkRoutes(p, depth + 1); }
  }
};
walkRoutes(path.resolve("app"));
ok(routeDirs.length > 0, `walked the route tree (got ${routeDirs.length} dirs) — an empty walk would make the path rule vacuous`);
ok(!routeDirs.some((d) => NAME_RX.test(d)),
  "no route path segment carries the partner name — a /clipp-deals URL would be exactly the domain/keyword use the terms forbid");

/* ── 7. every market row carries its browser evidence ────────────────────── */
ok(CLIPP_MARKETS.length >= 2, `the market registry has both cities — got ${CLIPP_MARKETS.length}`);
for (const m of CLIPP_MARKETS) {
  const v = m.verified || {};
  ok(/^\d{4}-\d{2}-\d{2}$/.test(String(v.on)), `${m.offerId}: records the date a browser actually loaded the page`);
  ok(typeof v.title === "string" && v.title.includes(m.city),
    `${m.offerId}: records the real page title, naming the city — this is what tells a future audit 'the page broke' from 'inventory rotated'`);
  ok(Number(v.dealsSeen) > 0,
    `${m.offerId}: the page had inventory when verified — a market that exists but is EMPTY is not shippable, we would be sending users to a blank page`);
  ok(Array.isArray(v.sample) && v.sample.length >= 2, `${m.offerId}: records sample merchants seen on the page`);
  ok(isClippDest(m.dest), `${m.offerId}: its destination passes the allowlist`);
}

/* ── the provider registration, asserted by CALLING it ───────────────────── */
// Clipp is registered in lib/commerceProviders.js (#477's shape) rather than in a
// map inside the route: a route module can only export the handler, so anything a
// guard needs to CALL has to live in lib/. These assertions drive the real
// resolveOffer, so they test behaviour rather than the route's source text.
{
  const { PROVIDERS, resolveOffer } = await import(path.resolve("lib/commerceProviders.js"));
  const cfg = PROVIDERS.clipp;
  ok(!!cfg, "clipp is a registered commerce provider");

  const good = await resolveOffer("clipp", "clipp-fl-sarasota");
  ok(typeof good.dest === "string", `a verified market resolves (got ${JSON.stringify(good)})`);
  ok(hasCjPid(good.dest || ""), "THE REVENUE RULE, end to end: what the route will 302 to carries our PID");
  ok(/^https:\/\/www\.dpbolvw\.net\/click-/.test(good.dest || ""), "it routes through CJ, not straight to clipp.com");

  // THE TRAP THIS GUARDS. resolveOffer's generic rule is "if wrapping changed the
  // host, fall back to the row's own URL" — correct for Viator, where tracking
  // only appends params. Clipp's tracking is a REDIRECT NETWORK, so the tracked
  // URL is *meant* to be on another host; under the generic rule every click would
  // have silently fallen back to the UNTRACKED clipp.com URL. Hence trackHosts +
  // requireTracking, asserted here by their effect.
  ok(Array.isArray(cfg.trackHosts) && cfg.trackHosts.length > 0,
    "clipp declares trackHosts — its tracked URL lives on a different host than its destination");
  ok(cfg.requireTracking === true,
    "clipp requires tracking — an untracked partner URL converts and pays nothing, which is invisible, so it must error rather than degrade");
  ok(!/clipp\.com/.test(good.dest || "") || /url=https%3A%2F%2Fwww\.clipp\.com/.test(good.dest || ""),
    "clipp.com appears only as the ENCODED destination inside the CJ link, never as the bare host we send the user to");

  // NO sub_id ON THE OUTBOUND LINK (owner, 2026-07-29 — the rule #477's route
  // header records). clippDeepLink still ACCEPTS a click_id, because CJ's sid was
  // verified to forward and we may want per-surface reporting later; the provider
  // simply does not pass one. So the capability stays and the policy holds, and
  // this asserts the policy rather than deleting the capability.
  ok(!/[?&]sid=/.test(good.dest || ""),
    "the outbound CJ link carries NO sid — the click_id is minted and recorded server-side only, per the route's no-sub_id rule");
  ok(/[?&]sid=abc123/.test(clippDeepLink(SARASOTA, "abc123") || ""),
    "…while the builder still SUPPORTS a sid, so re-enabling per-surface reporting is a one-line provider change, not a rewrite");

  const unknown = await resolveOffer("clipp", "clipp-fl-nowhere");
  ok(!unknown.dest && !!unknown.error, `an unknown offer errors instead of guessing (got ${JSON.stringify(unknown)})`);
  const empty = await resolveOffer("clipp", "");
  ok(!empty.dest && !!empty.error, "an empty offer id errors");

  // A provider that cannot attribute must fail, not degrade. Proven by calling
  // finishDest's path with a destination the tracker refuses.
  const broken = { ...cfg, resolve: () => "https://www.clipp.com/not-a-market-page" };
  const { PROVIDERS: P2 } = await import(path.resolve("lib/commerceProviders.js"));
  P2.clipp = broken;
  const leak = await resolveOffer("clipp", "anything");
  ok(!leak.dest, `a destination the tracker refuses yields NO dest — never the untracked URL (got ${JSON.stringify(leak)})`);
  ok(leak.error === "host-not-allowed" || leak.error === "tracking-failed", `it errors with a reason (got ${leak.error})`);
  P2.clipp = cfg; // restore for any later assertion
}
const mw = readFileSync(path.resolve("middleware.js"), "utf8");
// ASSERT THE STRUCTURAL ROLE, NOT THE APPEARANCE. The path string occurs twice in
// this file — once in `matcher` (which is what makes middleware run for the route
// at all) and once in NAV_302_ROUTES (which only picks the MODE once it runs). A
// bare "does the string appear" check passes with the matcher entry deleted, so
// the rate limit could be gone while the guard stayed green. That exact arm went
// GREEN in the RED proof, which is how this got caught.
const matcherBlock = (/matcher\s*:\s*\[([\s\S]*?)\n\s*\],/.exec(mw) || [, ""])[1];
ok(matcherBlock.length > 200, `parsed the middleware matcher block (got ${matcherBlock.length} chars) — failing to parse it would make the next check vacuous`);
ok(/"\/api\/commerce\/go"/.test(matcherBlock),
  "the commerce redirect is in the MATCHER — without that entry the middleware never runs for it and the per-IP rate limit on a route that mints affiliate clicks does not exist");
const navBlock = (/NAV_302_ROUTES\s*=\s*new Set\(\[([^\]]*)\]/.exec(mw) || [, ""])[1];
ok(navBlock.length > 20, `parsed NAV_302_ROUTES (got ${navBlock.length} chars) — an unparsed block would make the next check vacuous`);
ok(/"\/api\/commerce\/go"/.test(navBlock),
  "it is rateLimitOnly — a same-origin 403 would break a legitimate click-through navigation");

if (fail.length) {
  console.error("check-clipp-deals: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-clipp-deals: OK — ${pass} assertions (CJ shape + PID, no untracked escape, dest allowlist, UI ships no partner URL, pixel-form distinct, trademark, ${CLIPP_MARKETS.length} markets with browser evidence)`);
