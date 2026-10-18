#!/usr/bin/env node
// Audit 2026-10-18: a paid snapshot older than 30 days publishes no Wayfind
// Score, a fresh snapshot uses wayfindScore and ignores a baked number, the
// affiliate sentence is visible text, and a definitive photo miss is not
// fetched again after navigation clears the in-memory map.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  hydrateSponsoredPlace, sponsoredPublicScore, sponsoredSnapshotFresh, SPONSORED_PLACES,
} from "../lib/sponsoredPlaces.js";
import { wayfindScore } from "../lib/wayfindScore.js";
import { AFFILIATE_DISCLOSURE_TEXT } from "../lib/affiliateDisclosure.js";
import { getPlacePhoto, resetPhotoAnswers } from "../lib/photoAnswers.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0, pass = 0;
const ok = (c, m) => { if (c) pass++; else { console.error("  FAIL: " + m); fails++; } };

const rio = SPONSORED_PLACES.find((s) => s.id === "rio-body-wax-gastonia");
ok(rio && rio.scoreSnapshotOn === "2026-08-23", "Rio's Google snapshot date is 2026-08-23");
ok(sponsoredSnapshotFresh(rio, "2026-08-23") && sponsoredSnapshotFresh(rio, "2026-09-22"), "day 0 and day 30 are fresh");
ok(!sponsoredSnapshotFresh(rio, "2026-09-23") && !sponsoredSnapshotFresh(rio, "2026-10-18"), "day 31 and the audit day withhold");
ok(sponsoredPublicScore(rio, "2026-08-23") === wayfindScore(4.9, 384) && sponsoredPublicScore(rio, "2026-08-23") === 92,
  "a fresh day publishes the organic formula, 92");
ok(sponsoredPublicScore({ ...rio, wfScore: 100 }, "2026-08-23") === 92, "a baked wfScore cannot override the formula");
const stale = hydrateSponsoredPlace(rio, { lat: rio.lat, lng: rio.lng }, "2026-10-18");
ok(stale.wfScore === null && stale.rating === null && stale.reviews === null && stale.scoreWithheld === true && stale.rank == null,
  "a stale hydrate publishes no score, no Google stars, and no rank");
ok(!/4\.9 stars across 384/.test(JSON.stringify(rio.page.about)), "the partner page does not repeat the expired star claim");

ok(AFFILIATE_DISCLOSURE_TEXT === "Some links on this page are affiliate links. We may earn a commission if you book through them.",
  "the disclosure sentence is the required visible text");
ok(!/at no extra cost/i.test(AFFILIATE_DISCLOSURE_TEXT), "the disclosure makes no unverified price claim");
for (const file of ["app/layout.js", "app/home.js", "app/terms/page.js", "app/privacy/page.js", "app/about/page.js", "app/components/ThingsToDoList.js", "app/components/IntentPartnerPick.js"]) {
  const src = readFileSync(join(ROOT, file), "utf8");
  ok(!/at no (extra )?cost/i.test(src), file + " does not make an unverified price claim");
}
const about = readFileSync(join(ROOT, "app/about/page.js"), "utf8");
ok(!/no paid placement — ever|there is no product for that/i.test(about),
  "the about page does not deny that a labeled paid placement exists");

const rail = readFileSync(join(ROOT, "app/components/RailCard.js"), "utf8");
const iconic = readFileSync(join(ROOT, "app/components/IconicPlaceCard.js"), "utf8");
ok(/ev\.currentTarget\.src\s*=/.test("ev.currentTarget.src = fallback"),
  "positive control: the img.src probe matches a real assignment");
ok(!/ev\.currentTarget\.src\s*=/.test(rail) && !/ev\.currentTarget\.src\s*=/.test(iconic),
  "card image errors do not assign an uncredited URL to img.src");

const store = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
};
const PLACE = "ChIJV12TgcJbw4gR710nwEnWcTs";
function jsonResponse(body, status, why) {
  return { ok: status < 400, status, headers: { get: (h) => (String(h).toLowerCase() === "x-wayfind-photo-result" ? why : null) }, json: async () => body };
}
let calls = 0;
resetPhotoAnswers();
store.clear();
await getPlacePhoto(PLACE, { surface: "card", fetchImpl: async () => { calls++; return jsonResponse({}, 200, "no-photo"); } });
resetPhotoAnswers();
await getPlacePhoto(PLACE, { surface: "card", fetchImpl: async () => { calls++; return jsonResponse({}, 200, "no-photo"); } });
ok(calls === 1, "a definitive no-photo is not fetched again after the in-memory map is cleared (got " + calls + ")");
ok(JSON.stringify(store.get("wf_photo_miss_v1") || "").includes(PLACE) && !/lat|lng|-?[0-9]{2}\.[0-9]/.test(store.get("wf_photo_miss_v1") || ""),
  "the remembered miss is the place id only");

calls = 0;
store.clear();
resetPhotoAnswers();
const okFetch = async () => { calls++; return jsonResponse({ src: "https://example.com/photo.jpg", source: "owned" }, 200, ""); };
await getPlacePhoto("ChIJSuccessPhotoAudit18", { surface: "card", fetchImpl: okFetch });
resetPhotoAnswers();
await getPlacePhoto("ChIJSuccessPhotoAudit18", { surface: "card", fetchImpl: okFetch });
ok(calls === 2, "a successful photo is not stored as a miss (got " + calls + ")");

calls = 0;
store.clear();
resetPhotoAnswers();
const boom = async () => { calls++; return jsonResponse({}, 503, ""); };
await getPlacePhoto("ChIJTransientPhotoAudit1", { surface: "card", fetchImpl: boom });
resetPhotoAnswers();
await getPlacePhoto("ChIJTransientPhotoAudit1", { surface: "card", fetchImpl: boom });
ok(calls === 2, "a transient error is not remembered across a navigation (got " + calls + ")");

if (fails) {
  console.error("test-audit-trust-20261018: FAIL — " + fails);
  process.exit(1);
}
console.log("test-audit-trust-20261018: OK — " + pass + " assertions");
