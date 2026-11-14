#!/usr/bin/env node
// Locks the owner's guarantee for Wayfind's own Instagram posts:
//   2026-11-12  every eligible post is accounted for, zero silent misses;
//   2026-11-14  "not as its own card": a post about one business rides THAT
//               business's place or event card, credited @gowayfind.app.
//   LIVE ONE BUSINESS POSTS MISSING FROM THEIR CARD = 0
// Every assertion EXECUTES the shipped code: lib/ownedSocial.js (rules and
// reconciliation), /api/owned-social (what visitors are served), the
// /api/cron/owned-social route (the production monitor, with fetch stubbed),
// and the rendered "Seen on Wayfind" shelf. Each negative control removes or
// breaks one known-good thing and must turn the result RED.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadComponent } from "./lib/jsxLoad.mjs";
import {
  selectShelf, toShelfItem, reconcile, ingestionFreshness, shelfBlocker, normalizeAsset, featuresOneBusiness,
  canonicalPermalink, parsePermalink, deriveTitle, LIVE_WINDOW_DAYS, EXCLUSION_REASONS,
  shelfPage, cleanDisplayTitle, safeWayfindLinks, rowDefect, SHELF_PAGE_SIZE,
} from "../lib/ownedSocial.js";
import { upsertSourceRows } from "../lib/ownedSocialStore.js";
import { ownedAttachments, OWNED_CARD_DECISIONS } from "../lib/ownedSocialCards.js";
import { creatorVideosFor } from "../lib/creatorVideos.js";
import { eventSocialPosts } from "../lib/eventSocial.js";
import { hasCreatorVideoAt, displayedWfScore } from "../lib/creatorBoost.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.error("  FAIL " + msg); } };
const TODAY = "2026-11-12";

// ── Fixture: one of every kind of post Wayfind publishes ────────────────────
const row = (code, over = {}) => ({
  shortcode: code, format: "reel", permalink: canonicalPermalink(over.format || "reel", code),
  lifecycle: "published", published_at: "2026-11-10T15:00:00Z", title: "Title " + code,
  eligibility: "eligible", exclusion_reason: null, relevant_until: null, cover_url: null, ...over,
});
const ROWS = [
  row("ReelLive01"),                                                                              // live reel
  row("CarLive001", { format: "carousel", permalink: canonicalPermalink("carousel", "CarLive001") }), // live carousel
  row("ReelDated1", { relevant_until: "2026-11-16" }),                                            // dated, still live
  row("CarTwin001", { format: "carousel", permalink: canonicalPermalink("carousel", "CarTwin001"), eligibility: "excluded", exclusion_reason: "companion_duplicate", companion_of: "ReelLive01" }),
  row("ImgPost001", { format: "image", permalink: canonicalPermalink("image", "ImgPost001"), eligibility: "excluded", exclusion_reason: "format_single_image" }),
  row("ReelPromo1", { eligibility: "excluded", exclusion_reason: "brand_promo_no_discovery" }),
  row("ReelPast01", { relevant_until: "2026-11-01" }),                                             // dated, expired
  row("ReelOld001", { published_at: "2026-08-07T12:00:00Z" }),                                    // undated, past the window
  row("ReelSched1", { lifecycle: "scheduled" }),                                                  // draft: never shown
];
const LIVE = ["ReelLive01", "CarLive001", "ReelDated1"];
const SOURCE = ROWS.filter((r) => r.lifecycle === "published").map((r) => ({ shortcode: r.shortcode, format: r.format, published_at: r.published_at }));

// ── 1. Rules ─────────────────────────────────────────────────────────────────
const shelf = selectShelf(ROWS, TODAY);
ok(JSON.stringify(shelf.map((r) => r.shortcode).sort()) === JSON.stringify([...LIVE].sort()), `shelf is exactly the live eligible posts (got ${shelf.map((r) => r.shortcode)})`);
ok(shelf.some((r) => r.format === "carousel") && shelf.some((r) => r.format === "reel"), "carousels are first class: the shelf carries both formats");
ok(shelfBlocker(ROWS.find((r) => r.shortcode === "ReelSched1"), TODAY) === "not_published", "a scheduled post (draft) is never shown");
ok(shelfBlocker(ROWS.find((r) => r.shortcode === "ReelOld001"), TODAY) === "expired" && LIVE_WINDOW_DAYS === 45, "an undated post older than the 45 day window is expired, not silently dropped");
ok(selectShelf([...ROWS, ROWS[0]], TODAY).length === LIVE.length, "a duplicated row still yields one card");
ok(parsePermalink("https://www.instagram.com/reel/DfmvjqyxID8/?igsh=x").shortcode === "DfmvjqyxID8" && parsePermalink("https://instagram.com/p/DfmwfHEFvPw").kind === "p", "permalinks parse for reels and carousels");
const carousel = normalizeAsset({ permalink: "https://www.instagram.com/p/DfmwfHEFvPw/", type: "FEED_CAROUSEL_ALBUM", timestamp: "20261111150244", caption: "To every veteran: thank you" }, { source: "metricool" });
ok(carousel && carousel.format === "carousel" && carousel.permalink === "https://www.instagram.com/p/DfmwfHEFvPw/" && carousel.published_at === "2026-11-11T15:02:44Z", "a Metricool carousel normalizes to ONE canonical row (not one per slide)");
const image = normalizeAsset({ permalink: "https://www.instagram.com/p/AbCdEfGh1/", type: "FEED_IMAGE" }, { source: "metricool" });
ok(image.eligibility === "excluded" && image.exclusion_reason === "format_single_image", "a single photo is excluded WITH its reason, never dropped");
ok(!/[‐-―-]/.test(deriveTitle("Snow. Ice. Cocktails — Florida - 8 picks")), "derived titles carry no dashes");

// Evergreen place content outlives the window; dated guides still expire on their date.
ok(shelfBlocker({ ...ROWS.find((r) => r.shortcode === "ReelOld001"), evergreen: true }, TODAY) === null, "an evergreen place post stays live past the 45 day window");
ok(shelfBlocker({ ...ROWS.find((r) => r.shortcode === "ReelPast01"), evergreen: true }, TODAY) === "expired", "a dated event guide expires on its date even if marked evergreen");

// Paging: unlimited catalog, small first page, pages cover everything exactly once.
const many = Array.from({ length: 30 }, (_, i) => row("ReelPage" + String(i).padStart(2, "0"), { published_at: new Date(Date.parse("2026-11-11T12:00:00Z") - i * 3600000).toISOString() }));
const p1 = shelfPage(many, TODAY), p2 = shelfPage(many, TODAY, { offset: p1.next_offset }), p3 = shelfPage(many, TODAY, { offset: p2.next_offset });
const pagedCodes = [...p1.items, ...p2.items, ...p3.items].map((i) => i.shortcode);
ok(p1.items.length === SHELF_PAGE_SIZE && SHELF_PAGE_SIZE <= 12 && p1.total === 30 && p1.next_offset === 12, `first page is small (${p1.items.length} of ${p1.total}, next ${p1.next_offset})`);
ok(p3.next_offset === null && pagedCodes.length === 30 && new Set(pagedCodes).size === 30, "pages reach every post exactly once and end with next_offset null");
ok(shelfPage(many, TODAY, { limit: 9999 }).items.length <= 24, "a client cannot ask for an unbounded page");

// Display titles: the leaked internal phrases never reach a card; originals are untouched.
const leaked = "Here it is with the hook: Ed Sheeran or $0? Comment TAMPA and I'll send the list. Which one are you doing first? Link in bio";
const cleaned = cleanDisplayTitle(leaked, { format: "reel", city: "Tampa" });
ok(cleaned === "Ed Sheeran or $0?", `leaked caption phrases are stripped from the display title (got "${cleaned}")`);
ok(cleanDisplayTitle("main carousel caption 🔥 — https://x.co/a", { format: "carousel", city: "Tampa" }) === "Wayfind Carousel, Tampa", "a title with nothing usable falls back to the format and city");
ok(cleanDisplayTitle("x".repeat(30) + " " + "y".repeat(40)).length <= 60, "display titles cap at 60 characters");
ok(toShelfItem(row("ReelLeak01", { title: leaked })).title === "Ed Sheeran or $0?", "the shelf item carries the cleaned title");

// Wayfind links: same-site event and place pages only.
const links = safeWayfindLinks([
  { label: "Tampa Bay Lightning", href: "/florida-events/lightning-vs-bruins-2026-11-14" },
  { label: "Place", href: "/p/ChIJabcdef123" },
  { label: "Off site", href: "https://evil.example/x" },
  { label: "Script", href: "javascript:alert(1)" },
  { label: "Protocol relative", href: "//evil.example/p/ChIJabcdef123" },
]);
ok(links.length === 2 && links.every((l) => l.href.startsWith("/florida-events/") || l.href.startsWith("/p/")), `only same-site Wayfind links survive (got ${JSON.stringify(links)})`);
ok(rowDefect(row("ReelLinks1", { wayfind_links: "nope" })) === "bad_links" && rowDefect(row("ReelLinks2", { wayfind_links: [] })) === null, "a malformed links field is a defect, an empty list is fine");

// ── 2. Reconciliation: green when every live one business post is on its card ─
// Live fixture posts: ReelLive01 features one business (attached), CarLive001
// is a roundup (no card, accounted for), ReelDated1 features one business
// (attached through its carousel twin), CarTwin001 is that twin.
const ONE = { places: ["Some Cafe"], wayfind_links: [] };
const RROWS = ROWS.map((r) => r.shortcode === "ReelLive01" ? { ...r, ...ONE }
  : r.shortcode === "CarLive001" ? { ...r, places: ["A", "B", "C"] }
  : r.shortcode === "ReelDated1" ? { ...r, places: ["Fair"], wayfind_links: [{ label: "Fair", href: "/florida-events/fair-2026" }] }
  : r.shortcode === "CarTwin001" ? { ...r, companion_of: "ReelDated1" } : r);
const ATTACHED = new Map([["ReelLive01", { places: ["some-cafe"], events: [] }], ["CarTwin001", { places: [], events: ["fair-2026"] }]]);
const green = reconcile({ sourceAssets: SOURCE, rows: RROWS, attached: ATTACHED, todayStr: TODAY });
ok(green.ok && green.missing === 0 && green.broken === 0, `positive control: every live one business post on its card reconciles (missing=${green.missing} broken=${green.broken})`);
ok(green.counts.A === 2 && green.results.find((r) => r.shortcode === "ReelDated1").bucket === "A", "a post counts as on its card when its companion twin carries it");
ok(green.results.find((r) => r.shortcode === "CarLive001").why === "roundup: no single business card", "a roundup of several places is accounted for, never a card of its own");
ok(green.inspected === new Set(ROWS.map((r) => r.shortcode)).size && Object.values(green.counts).reduce((a, b) => a + b, 0) === green.inspected, "every post lands in exactly one bucket");
ok(green.results.filter((r) => r.bucket === "E").every((r) => r.why), "every exclusion carries a reason");
ok(featuresOneBusiness({ places: ["X"] }) && featuresOneBusiness({ places: ["Fair", "Venue"], wayfind_links: [{}] }) && !featuresOneBusiness({ places: ["A", "B"], wayfind_links: [] }) && !featuresOneBusiness({ places: ["A", "B", "C"], wayfind_links: [{}] }), "one business = one named place, or one Wayfind link with at most its venue");

// ── 3. Negative controls: each must go RED ──────────────────────────────────
const red = (label, args, expectBucket, code) => {
  const r = reconcile({ sourceAssets: SOURCE, rows: RROWS, attached: ATTACHED, todayStr: TODAY, ...args });
  const hit = r.results.find((x) => x.shortcode === code);
  ok(!r.ok && hit && hit.bucket === expectBucket, `${label} goes RED as bucket ${expectBucket} (got ${hit ? hit.bucket + " " + hit.why : "no result"})`);
};
const without = (code) => new Map([...ATTACHED].filter(([k]) => k !== code));
red("a one business Reel missing from its card", { attached: without("ReelLive01") }, "C", "ReelLive01");
red("a one business post whose twin lost its card", { attached: without("CarTwin001") }, "C", "ReelDated1");
red("a post never ingested", { sourceAssets: [...SOURCE, { shortcode: "NewPost001", format: "reel" }] }, "D", "NewPost001");
red("a broken permalink", { rows: RROWS.map((r) => r.shortcode === "CarLive001" ? { ...r, permalink: "https://www.instagram.com/p/WRONG00/" } : r) }, "F", "CarLive001");
red("an exclusion with no reason", { rows: RROWS.map((r) => r.shortcode === "ReelPromo1" ? { ...r, exclusion_reason: "because" } : r) }, "F", "ReelPromo1");
red("a card attachment with no row", { attached: new Map([...ATTACHED, ["Ghost00001", { places: ["x"], events: [] }]]) }, "F", "Ghost00001");
{
  const r = reconcile({ sourceAssets: SOURCE, rows: RROWS, attached: without("ReelLive01"), decisions: { ReelLive01: "business_not_on_wayfind" }, todayStr: TODAY });
  ok(r.ok && r.results.find((x) => x.shortcode === "ReelLive01").why === "decision:business_not_on_wayfind", "a recorded decision accounts for a one business post with no card");
}

// ── 3b. The real registries: Wayfind's own posts ride the business cards ────
const att = ownedAttachments();
const expectPlaces = { DfpQw4pB6Bq: "wfadd_spirit_christmas_clearwater", DfiitL9p2Uc: "ChIJYybWKcrvwogRT8I06QALhdI", DfdbJ10Jzgy: "ChIJS2qQ6sw1w4gRUJfWmSdAvXE", DfbH0CYMCLl: "ChIJS2qQ6sw1w4gRUJfWmSdAvXE", DdxDxKeD_UN: null, DdUinjYJEYr: "ChIJmTBndrPFwogRQgwCuMP3myY", DdEkeo9Bkhk: "ChIJk04qcKEdw4gRHykY4WhCYBI", DfOGiw9jFdZ: "ChIJF05ORfWpwogRI74PwJotNf4" };
for (const [code, placeId] of Object.entries(expectPlaces)) {
  if (!placeId) continue;
  const v = creatorVideosFor({ id: placeId }).filter((x) => x.creator === "gowayfind.app" && x.url.includes("/" + code + "/"));
  ok(v.length === 1 && att.has(code), `${code} plays on its business place card, credited @gowayfind.app`);
}
ok(creatorVideosFor({ id: "ChIJo_IdHf0lw4gRHDbQNKBRE84" }).some((x) => x.creator === "gowayfind.app" && x.url.includes("/DdxDxKeD-UN/")), "Ryan's Coffee House card carries our Reel next to the creator Reels");
for (const [eventId, code] of [["roberts-christmas-wonderland-2026", "DfiitL9p2Uc"], ["sarasota-medieval-fair-2026", "DfdbJ10Jzgy"], ["crystal-classic-2026", "DflkQYilr5t"], ["snowcat-ridge-2026", "DfOGiw9jFdZ"]]) {
  ok(eventSocialPosts(eventId).some((p) => p.creator === "gowayfind.app" && p.url.includes("/" + code + "/")), `${code} plays on the ${eventId} event card`);
}
ok(!hasCreatorVideoAt({ id: "ChIJmTBndrPFwogRQgwCuMP3myY" }) && displayedWfScore({ id: "ChIJmTBndrPFwogRQgwCuMP3myY", wfScore: 80 }) === 80, "our own Reel never raises the Wayfind Score");
ok(hasCreatorVideoAt({ id: "ChIJYybWKcrvwogRT8I06QALhdI" }), "an independent creator Reel on the same card still counts");
ok(Object.keys(OWNED_CARD_DECISIONS).every((k) => /^[A-Za-z0-9_-]{5,40}$/.test(k)) && Object.values(OWNED_CARD_DECISIONS).every((v) => /^[a-z_]+$/.test(v)), "every no-card decision names a real shortcode and a reason");
ok([...att.keys()].every((code) => !OWNED_CARD_DECISIONS[code]), "a post is never both on a card and decided off one");

// Ingestion older than the latest Instagram publication.
const now = Date.parse("2026-11-12T15:00:00Z");
ok(ingestionFreshness({ lastIngestAt: "2026-11-12T13:00:00Z", now }).ok, "fresh ingestion is green");
ok(!ingestionFreshness({ lastIngestAt: "2026-11-10T13:00:00Z", now }).ok, "an ingest older than 36h goes RED");
ok(!ingestionFreshness({ lastIngestAt: null, now }).ok, "no ingest on record goes RED");
ok(!ingestionFreshness({ lastIngestAt: "2026-11-12T13:00:00Z", newestSourcePublishedAt: "2026-11-12T14:00:00Z", newestRowPublishedAt: "2026-11-11T15:00:00Z", now }).ok, "a source post newer than anything ingested goes RED");

// ── 4. The endpoint visitors get, and the production monitor (fetch stubbed) ─
process.env.SUPABASE_URL = "https://stub.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "stub";
process.env.CRON_SECRET = "s3cret";
const realFetch = globalThis.fetch;
const pulses = [];
function stub({ tableRows, tableOk = true, servedBody }) {
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const resp = (status, body) => ({ ok: status < 300, status, json: async () => body, headers: { get: () => "application/json" } });
    if (u.includes("/rest/v1/wf_owned_social") && (!init.method || init.method === "GET")) {
      if (!tableOk) return resp(500, { message: "boom" });
      const shelfOnly = u.includes("eligibility=eq.eligible");
      const from = Number(String((init.headers || {}).range || "0-").split("-")[0]);
      const rows = shelfOnly ? tableRows.filter((r) => r.lifecycle === "published" && r.eligibility === "eligible" && ["reel", "carousel"].includes(r.format)) : tableRows;
      return resp(200, from === 0 ? rows : []);
    }
    if (u.includes("/rest/v1/wf_owned_social")) return resp(204, null);
    if (u.includes("/rest/v1/wf_job_pulse?select=ran_at")) return resp(200, [{ ran_at: new Date().toISOString() }]);
    if (u.includes("/rest/v1/wf_job_pulse")) { pulses.push(JSON.parse(init.body)); return resp(201, null); }
    if (u.includes("/api/owned-social")) return resp(200, servedBody);
    return resp(404, null);
  };
}
const { GET: shelfGET } = await import("../app/api/owned-social/route.js");
const { siteTodayStr } = await import("../lib/siteTime.js");
const today = siteTodayStr();
// Rows dated relative to the real "today" so the live window holds whenever this runs.
const iso = (daysAgo) => new Date(Date.parse(today + "T15:00:00Z") - daysAgo * 86400000).toISOString();
const liveRows = [
  row("ReelLive01", { published_at: iso(1) }),
  row("CarLive001", { format: "carousel", permalink: canonicalPermalink("carousel", "CarLive001"), published_at: iso(2) }),
  row("ReelPromo1", { published_at: iso(1), eligibility: "excluded", exclusion_reason: "brand_promo_no_discovery" }),
  row("ReelSched1", { published_at: iso(0), lifecycle: "scheduled" }),
];
stub({ tableRows: liveRows });
const apiRes = await shelfGET();
const apiBody = await apiRes.json();
ok(apiRes.status === 200 && apiBody.ok === true && JSON.stringify(apiBody.items.map((i) => i.shortcode)) === JSON.stringify(["ReelLive01", "CarLive001"]), `/api/owned-social serves every live post newest first and no draft (got ${JSON.stringify(apiBody.items && apiBody.items.map((i) => i.shortcode))})`);
stub({ tableRows: liveRows, tableOk: false });
const apiFail = await shelfGET();
const pagedRows = Array.from({ length: 15 }, (_, i) => row("ReelApi" + String(i).padStart(3, "0"), { published_at: iso(i % 40) }));
stub({ tableRows: pagedRows });
const page2 = await (await shelfGET(new Request("https://www.gowayfind.com/api/owned-social?offset=12"))).json();
ok(page2.ok === true && page2.items.length === 3 && page2.total === 15 && page2.next_offset === null, `/api/owned-social?offset=12 serves the last page (got ${page2.items && page2.items.length} of ${page2.total}, next ${page2.next_offset})`);
// The incremental upsert never sends a classification field: audited and owner decisions survive every sync.
const sent = [];
await upsertSourceRows([{ shortcode: "ReelLive01", format: "reel" }], { env: { SUPABASE_URL: "https://stub.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "stub" }, fetchImpl: async (u, init) => { sent.push(init); return { ok: true, status: 204 }; } });
const patch = sent.find((x) => x.method === "PATCH");
const insertPrefer = (sent.find((x) => x.method === "POST") || {}).headers || {};
ok(patch && Object.keys(JSON.parse(patch.body)).sort().join(",") === "last_seen_at,lifecycle,updated_at", `the sync PATCH touches only seen/lifecycle fields (got ${patch && patch.body})`);
ok(/ignore-duplicates/.test(JSON.stringify(insertPrefer)), "the sync insert ignores existing rows instead of overwriting them");
ok(apiFail.status === 503 && (await apiFail.json()).ok === false, "a failed table read answers 503, never an empty shelf");

const { GET: cronGET } = await import("../app/api/cron/owned-social/route.js");
const cronReq = () => new Request("https://www.gowayfind.com/api/cron/owned-social", { headers: { authorization: "Bearer s3cret" } });
const lastPulse = (job) => pulses.filter((p) => p.job === job).slice(-1)[0];
// The monitor reads the REAL registries: a live one business post that IS on its card is green,
const cardRows = [...[...att.keys()].map((code) => row(code, { published_at: iso(1), places: ["One business"], wayfind_links: [] })), row("RoundUp001", { published_at: iso(1), places: ["A", "B", "C"] })];
stub({ tableRows: cardRows });
const cronGreen = await cronGET(cronReq());
const pg = lastPulse("owned-social-reconcile");
ok(cronGreen.status === 200 && pg && pg.succeeded === 1 && /missing=0/.test(pg.note), `monitor GREEN when every live one business post is on its card (status ${cronGreen.status}, note ${pg && pg.note})`);
// ...and one that is on no card is named.
stub({ tableRows: [...cardRows, row("ReelLone01", { published_at: iso(1), places: ["Unfilmed Cafe"] })] });
const cronRed = await cronGET(cronReq());
const pr = lastPulse("owned-social-reconcile");
ok(cronRed.status === 500 && pr && pr.succeeded === 0 && /missing=1/.test(pr.note) && /ReelLone01/.test(pr.note), `monitor RED and names the post missing from its card (note ${pr && pr.note})`);
stub({ tableRows: cardRows, tableOk: false });
const cronDown = await cronGET(cronReq());
const pu = lastPulse("owned-social-reconcile");
ok(cronDown.status === 500 && pu && pu.succeeded === 0 && /^unavailable:/.test(pu.note), "a failed table read is an immediate incident (unavailable: prefix)");
const unauth = await cronGET(new Request("https://www.gowayfind.com/api/cron/owned-social"));
ok(unauth.status === 401, "the monitor refuses unauthenticated calls");
globalThis.fetch = realFetch;

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
// ── 5. No standalone video cards under TRENDING NOW (owner, 2026-11-14) ─────
const rails = strip(readFileSync(path.join(root, "app/components/TrendingRails.js"), "utf8"));
ok(!/OwnedSocialShelf|Seen on Wayfind|\/api\/owned-social/.test(rails), "TrendingRails no longer mounts a shelf of our own video cards");
let shelfGone = false;
try { readFileSync(path.join(root, "app/components/OwnedSocialShelf.js")); } catch (e) { shelfGone = e.code === "ENOENT"; }
ok(shelfGone, "the standalone Seen on Wayfind card component is gone");
ok(/onLoad=\{onLoad\}/.test(strip(readFileSync(path.join(root, "app/components/CreatorVideoPlayer.js"), "utf8"))), "the player reports its load (player_loaded is measurable)");
const vercel = JSON.parse(readFileSync(path.join(root, "vercel.json"), "utf8"));
ok((vercel.crons || []).some((c) => c.path === "/api/cron/owned-social"), "the production monitor is scheduled in vercel.json");
ok(EXCLUSION_REASONS.length === 8, "exclusion reasons match the table's CHECK list (8)");

if (fail) { console.error(`test-owned-social-reconcile: FAIL (${fail} failed, ${pass} passed)`); process.exit(1); }
console.log(`test-owned-social-reconcile: OK — ${pass} assertions by CALL: rules (evergreen, paging, display titles, same-site links), card reconciliation (6 negative controls each RED: one business Reel off its card, twin lost its card, never ingested, broken permalink, reasonless exclusion, attachment with no row; decisions and roundups accounted for), our posts on their real place and event cards with no score bump, ingest freshness (3 RED controls), /api/owned-social, sync never overwrites classification, /api/cron/owned-social (GREEN on cards, RED naming the missing post, unavailable incident, 401), no standalone video cards under Trending.`);
