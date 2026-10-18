#!/usr/bin/env node
// scripts/test-viator-campaign.mjs — hermetic proof of Viator attribution
// behaviour as documented by Viator (partnerresources.viator.com, attribution
// and links-tool pages, read 2026-10-18):
//   * pid + mcid=42383 always; medium is PRESERVED per link type (an API
//     productUrl keeps medium=api, a link-built URL gets medium=link);
//   * campaign is optional, [A-Za-z0-9-] only, ADDED and never changed;
//   * our campaign is wf-<page>-<placement>-<offer>: no click token, no utm,
//     no gclid, nothing personal;
//   * acquisition (utm / paid) rides on the PostHog click event, never a URL.
// Fixture pid, set unconditionally so the verdict never depends on the shell.
process.env.NEXT_PUBLIC_VIATOR_PID = "P00000123"; // not a real credential
const { viatorCampaign, viatorPageKey, viatorPageHint, viatorPlacementCode, withViatorTracking } = await import("../lib/affiliates.js");
const { resolveOffer } = await import("../lib/commerceProviders.js");
const { commerceHref, withPageParam, withAcquisition } = await import("../lib/commerce.js");

let pass = 0; const fails = [];
const ok = (c, m) => { pass++; if (!c) fails.push(m); };
const RAW = "https://www.viator.com/tours/Sarasota/Mangrove-Tunnel-Kayak-Tour/d25738-108117P1?mcid=42383&pid=P00000123&medium=api&api_version=2.0";
const BUILT = "https://www.viator.com/tours/Orlando/x/d663-5467OHEP";

// 1. campaign shape: page + placement + offer
const tag = viatorCampaign({ page: "/guides/things-to-do-sarasota", surface: "intent_partner_rail", offerId: "108117P1" });
ok(tag === "wf-g-things-to-do-sarasota-rail-108117p1", `tag shape (got ${tag})`);
ok(/^[a-z0-9-]{1,100}$/.test(tag), "tag uses only Viator-safe characters");
ok(viatorCampaign({ page: "g-swim-with-manatees-crystal-river", surface: "guide", offerId: "7336P2" }) === "wf-g-swim-with-manatees-crystal-river-cta-7336p2", "explicit page key + guide CTA");
ok(viatorCampaign({}) === "wf-na-other-na", "no inputs -> a safe placeholder tag, never a malformed one");
ok(viatorCampaign({ page: "x".repeat(500), surface: "y".repeat(500), offerId: "z".repeat(500) }).length <= 100, "length capped at 100");
ok(viatorCampaign({ page: "/guides/a?email=me@x.com", surface: "a&b#c", offerId: "1P1" }).indexOf("@") < 0, "query strings never reach the tag");
ok(!/[0-9a-f]{8}-?[0-9a-f]{4}/.test(viatorCampaign({ page: "/places/abc", surface: "place_page", offerId: "1P1" })), "no click token in the tag");
ok(viatorPageKey("/places/ChIJ123") === "place", "place pages collapse to one key (no place id)");
ok(viatorCampaign({ page: viatorPageHint({ surface: "detail_primary" }), surface: "detail_primary", offerId: "108117P1" }) === "wf-place-detail-108117p1", "a noreferrer place-page click still names the page from its surface");
ok(viatorCampaign({ page: viatorPageHint({ page: "g-foo", surface: "guide" }), surface: "guide", offerId: "1P1" }) === "wf-g-foo-cta-1p1", "an explicit page param wins over the surface fallback");
ok(viatorPageHint({ refererPath: "/guides/things-to-do-sarasota", surface: "intent_partner_rail" }) === "/guides/things-to-do-sarasota", "a same-host referer path is used when no page param was sent");
ok(viatorPageHint({ refererPath: "https://evil.example/guides/x", surface: "intent_partner_rail" }) === "", "a non-path referer is ignored");
ok(viatorPageKey("") === "na" && viatorPageKey("/") === "home", "missing/root page");
ok(viatorPlacementCode("iconic_place_card") === "card" && viatorPlacementCode("home_rail") === "home", "placement codes");

// 2. tracking: medium preserved per link type, campaign only added
const u = new URL(withViatorTracking(RAW, undefined, { campaign: tag }));
ok(u.searchParams.get("medium") === "api", "API productUrl KEEPS medium=api (was forced to link)");
ok(u.searchParams.get("api_version") === "2.0", "api_version untouched");
ok(u.searchParams.get("campaign") === tag, "campaign param set");
ok(u.searchParams.get("mcid") === "42383", "mcid unchanged");
ok(u.searchParams.get("pid") === "P00000123", "pid set");
ok(u.searchParams.getAll("pid").length === 1 && u.searchParams.getAll("medium").length === 1 && u.searchParams.getAll("campaign").length === 1, "no duplicated params");
const b = new URL(withViatorTracking(BUILT));
ok(b.searchParams.get("medium") === "link" && b.searchParams.get("mcid") === "42383", "link-built URL gets medium=link");
ok(new URL(withViatorTracking(BUILT + "?medium=email")).searchParams.get("medium") === "link", "undocumented medium is corrected to link");
ok(new URL(withViatorTracking(BUILT + "?medium=banner")).searchParams.get("medium") === "link", "a stale banner medium on a URL we built becomes link (we serve no banners)");
ok(new URL(withViatorTracking(RAW + "&campaign=partner-set", undefined, { campaign: tag })).searchParams.get("campaign") === "partner-set", "an existing campaign is never changed");
ok(!new URL(withViatorTracking(RAW, undefined, { campaign: "bad#tag" })).searchParams.has("campaign"), "invalid campaign is dropped, not sent");
ok(!new URL(withViatorTracking(RAW)).searchParams.has("campaign"), "legacy call (no opts) emits no campaign");

// 3. resolveOffer threads ctx.campaign to viator only
const fakeFetch = async () => ({ ok: true, json: async () => [{ product_code: "108117P1", product_url: RAW, link_ok: true }] });
const env = () => ({ url: "https://example.supabase.co", key: "anon" });
const r = await resolveOffer("viator", "108117P1", { subId: "intent_partner_rail", campaign: tag, fetch: fakeFetch, env });
ok(r.dest && new URL(r.dest).searchParams.get("campaign") === tag, "resolveOffer(viator) dest carries campaign");
ok(r.dest && new URL(r.dest).searchParams.get("medium") === "api", "resolveOffer(viator) dest keeps medium=api");
ok(r.dest && new URL(r.dest).hostname === "www.viator.com", "dest host still viator.com");
const r2 = await resolveOffer("viator", "108117P1", { fetch: fakeFetch, env });
ok(r2.dest && !new URL(r2.dest).searchParams.has("campaign"), "no campaign when caller passes none");

// 4. page plumbing on OUR hrefs only
ok(new URLSearchParams(commerceHref({ provider: "viator", offerId: "1P1", surface: "guide", page: "g-Foo Bar?x=1" }).split("?")[1]).get("page") === "g-foo-bar-x-1", "commerceHref page is sanitized");
ok(withPageParam("https://www.viator.com/x?a=1", "g-x") === "https://www.viator.com/x?a=1", "withPageParam never decorates a partner URL");
ok(/[?&]page=g-x(&|$)/.test(withPageParam("/api/viator/go?product=x", "g-x")), "withPageParam decorates our redirect");

// 5. acquisition on the click event, not the URL
const acq = withAcquisition("commerce_cta_clicked", { surface: "guide" }, { utm_source: "google", utm_medium: "cpc", utm_campaign: "fl", gclid: "abc" });
ok(acq.utm_source === "google" && acq.utm_campaign === "fl" && acq.paid_click === true, "utm + paid flag on commerce_cta_clicked");
ok(!("gclid" in acq), "gclid VALUE stays session-level, not on the event");
ok(!("utm_source" in withAcquisition("commerce_impression", { surface: "guide" }, { utm_source: "google" })), "only the click event gets acquisition");
ok(!/utm_|gclid/.test(new URL(withViatorTracking(RAW, undefined, { campaign: tag })).search), "no acquisition params in the partner URL");

if (fails.length) { console.error("test-viator-campaign: FAIL\n - " + fails.join("\n - ")); process.exit(1); }
console.log(`test-viator-campaign: OK — ${pass} assertions`);
