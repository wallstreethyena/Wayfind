#!/usr/bin/env node
// Locks gowayfind.com/latest (the @gowayfind.app bio link, owner approved
// 2026-11-25): it must show the NEWEST Reel's Wayfind place or event, fall
// back to the hand-set entry when the catalog read fails or lags, never pick
// a carousel, an excluded post, an expired post or a post without a Wayfind
// link, and never carry a partner URL in source.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pickLatestReel, eventSlugOf, LATEST_REEL, LATEST_SURFACE } from "../lib/latestReel.js";
import { canonicalPermalink } from "../lib/ownedSocial.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL " + m); } };
const TODAY = "2026-11-25";
const row = (code, over = {}) => ({
  shortcode: code, format: "reel", permalink: canonicalPermalink(over.format || "reel", code),
  lifecycle: "published", eligibility: "eligible", exclusion_reason: null, relevant_until: null,
  published_at: "2026-11-20T12:00:00Z", title: "Title " + code, city: "Tampa", cover_url: null,
  wayfind_links: [{ href: "/florida-events/some-event-2026", label: "Some Event" }], ...over,
});
const OVERRIDE = { shortcode: "OverRide1", published_at: "2026-11-22T12:00:00Z", title: "Hand set", city: "Kissimmee",
  links: [{ href: "/florida-events/hand-set-2026", label: "Hand set event" }] };

// 1. Hand-set entry wins over an OLDER synced Reel.
let r = pickLatestReel([row("OlderReel1")], TODAY, { override: OVERRIDE });
ok(r && r.shortcode === "OverRide1" && r.source === "override", "hand-set entry beats an older synced Reel");
// 2. A NEWER synced Reel with a link takes over automatically.
r = pickLatestReel([row("NewerReel1", { published_at: "2026-11-24T12:00:00Z" })], TODAY, { override: OVERRIDE });
ok(r && r.shortcode === "NewerReel1" && r.source === "owned_social", "newer synced Reel beats the hand-set entry");
// 3. Newer posts that must not be featured are skipped.
const skipped = [
  row("Carousel01", { format: "carousel", published_at: "2026-11-25T01:00:00Z" }),
  row("Excluded01", { eligibility: "excluded", exclusion_reason: "brand_promo_no_discovery", published_at: "2026-11-25T02:00:00Z" }),
  row("Expired001", { relevant_until: "2026-11-20", published_at: "2026-11-25T03:00:00Z" }),
  row("NoLinks001", { wayfind_links: [], published_at: "2026-11-25T04:00:00Z" }),
  row("BadLink001", { wayfind_links: [{ href: "https://example.com/x", label: "Off site" }], published_at: "2026-11-25T05:00:00Z" }),
];
r = pickLatestReel(skipped, TODAY, { override: OVERRIDE });
ok(r && r.shortcode === "OverRide1", "carousel, excluded, expired, link-less and off-site posts are never featured");
// 4. Catalog read failed (null rows): the hand-set entry still renders.
r = pickLatestReel(null, TODAY, { override: OVERRIDE });
ok(r && r.shortcode === "OverRide1", "failed catalog read falls back to the hand-set entry");
// 5. Negative control: no override and no usable rows -> null (page shows its fallback copy).
ok(pickLatestReel([], TODAY, { override: null }) === null, "nothing usable returns null");
// 6. The shipped hand-set entry is valid and points at a Wayfind page.
r = pickLatestReel([], TODAY);
ok(r && r.shortcode === LATEST_REEL.shortcode && r.links.length >= 1, "shipped LATEST_REEL is a valid featured Reel");
ok(r && r.links.every((l) => l.href.startsWith("/florida-events/") || l.href.startsWith("/p/")), "shipped LATEST_REEL links are same-site Wayfind pages");
ok(r && r.permalink === "https://www.instagram.com/reel/" + LATEST_REEL.shortcode + "/", "permalink is the canonical Instagram Reel URL");
// 7. eventSlugOf.
ok(eventSlugOf("/florida-events/christmas-at-gaylord-palms-2026") === "christmas-at-gaylord-palms-2026", "eventSlugOf reads an event href");
ok(eventSlugOf("/p/abc12345") === null && eventSlugOf("https://x/florida-events/a-b-c") === null, "eventSlugOf rejects non-event hrefs");

// 8. Page source: partner links only through the shared ticket rule, surface constant, noindex.
const page = readFileSync(path.join(root, "app/latest/page.js"), "utf8");
ok(/eventDetailTicketAction\(e, \{ surface: LATEST_SURFACE/.test(page), "ticket button comes from eventDetailTicketAction with LATEST_SURFACE");
ok(!/https?:\/\/(?!\/)(?:www\.)?(?:viator|ticketmaster|tiqets|klook|undercovertourist|getyourguide|gaylordpalms)/i.test(page), "no partner URL in app/latest/page.js");
ok(/robots:\s*\{\s*index:\s*false/.test(page), "/latest is noindex (bio link, not search content)");
ok(LATEST_SURFACE === "bio_latest", "surface is bio_latest");
ok(/loadEventDetailPhotos\(link\.href/.test(page) && /eventRailPhotoCredit\(first\)/.test(page), "card photo is the event page rail photo, with its credit");
ok(/img: \{[^}]*height: "auto"[^}]*aspectRatio: "16 \/ 10"/.test(page), "card photo keeps a 16:10 box (height auto beats the height attribute) so the ticket button stays above the fold");
ok(!/[–—]/.test(page.replace(/\/\/.*$/gm, "")), "no dashes in /latest copy");

if (fail) { console.error(`test-latest-reel: ${fail} FAILED, ${pass} passed`); process.exit(1); }
console.log(`test-latest-reel: OK — ${pass} assertions passed`);
