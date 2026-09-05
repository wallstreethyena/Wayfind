import assert from "node:assert/strict";
import { qualifySocialPost, creatorQualified, observedCount, seasonalEvidence, safeSocialJson, sourceRetryDue } from "../lib/socialQualification.js";
const now = Date.parse("2026-09-05T12:00:00Z");
const post = { platform: "instagram", handle: "fixture", caption: "Florida pumpkin patch opens soon", like_count: 1001 };
const creator = { platform: "instagram", handle: "fixture", status: "approved", evidence_url: "https://example.org/review", reviewed_at: "2026-09-01", expires_at: "2026-10-01" };
assert.equal(qualifySocialPost(post, { now }).eligible, true);
assert.equal(qualifySocialPost(post, { now }).publish, false);
assert.equal(qualifySocialPost(post, { now }).next, "verify_florida_destination");
for (const likes of [0, 999, 1000, null, undefined, "2000", NaN, Infinity, -1]) {
  assert.equal(qualifySocialPost({ ...post, like_count: likes }, { now }).eligible, false, `unqualified likes ${likes}`);
}
assert.equal(qualifySocialPost({ ...post, like_count: 0 }, { now, creator }).eligible, true);
assert.equal(creatorQualified({ ...creator, platform: "tiktok" }, "instagram", "fixture", now), false);
assert.equal(creatorQualified({ ...creator, expires_at: "2026-09-04" }, "instagram", "fixture", now), false);
assert.equal(creatorQualified({ ...creator, reviewed_at: "2026-09-06" }, "instagram", "fixture", now), false);
assert.equal(qualifySocialPost({ ...post, caption: "fall vibes #fall" }, { now, creator }).eligible, false);
assert.equal(observedCount(null), null);
assert.equal(observedCount(0), 0);
assert.throws(() => qualifySocialPost(post), /observation time/);
for (const caption of ["fall menu", "Halloween party", "hayride", "corn maze", "Oktoberfest", "ghost tour", "harvest festival", "pumpkin spice latte", "halloween pop-up"]) {
  const result = seasonalEvidence(caption);
  assert.ok(result.length, caption);
  assert.ok(result.every(e => caption.includes(e.quote)));
}
assert.equal(sourceRetryDue({ ok: false, fail_count: 3, last_checked_at: "2026-09-05T11:00:00Z" }, now), false);
assert.equal(sourceRetryDue({ ok: false, fail_count: 3, last_checked_at: "2026-09-03" }, now), true);
const success = await safeSocialJson("https://example.org", { fetcher: async () => Response.json({ data: [] }) });
assert.equal(success.ok, true);
const failed = await safeSocialJson("https://example.org", { fetcher: async () => { throw new Error("secret-token"); } });
assert.equal(failed.ok, false);
assert.equal(JSON.stringify(failed).includes("secret-token"), false);
assert.equal((await safeSocialJson("https://example.org", { fetcher: async () => Response.json({ error: { message: "secret-token" } }, { status: 429 }) })).ok, false);
assert.equal((await safeSocialJson("https://example.org", { fetcher: async () => new Response("not json") })).ok, false);
console.log("check-social-qualification: OK; boundary, creator, evidence, privacy and recovery controls executed");
