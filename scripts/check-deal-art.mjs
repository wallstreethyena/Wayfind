#!/usr/bin/env node
/**
 * check-deal-art — every ACTIVE wf_deals row must have real art.
 *
 * WHAT A FAILURE MEANS. The deal card's art is a CSS background with a three-step
 * ternary: image_url, else a Google photo_ref via /api/photo, else a gradient.
 * The gradient reads as a designed choice, so a row with neither image_url nor
 * photo_ref does not look broken — it looks finished. That is exactly why three
 * of them shipped on 2026-07-22 and stayed live until 2026-07-30 without anyone
 * noticing. A placeholder that looks intentional is the kind of defect a human
 * eye will not catch, which is what a guard is for.
 *
 * ALSO CHECKED: a local row may not carry a partner-hosted image. lib/coupons.js
 * already requires "OUR OWN committed asset, never a partner or merchant image",
 * and check-deal-sheet asserts dealArtwork() refuses a remote merchant image. The
 * deal rails should not hold the opposite standard to the deal sheet. Three rows
 * carried Undercover Tourist Facebook-share assets (one literally named
 * facebookoct2021.jpg, reused across two different cards); they now use Google
 * photo refs for the real places.
 *
 * NO CREDENTIALS -> SKIP LOUDLY, NEVER PASS SILENTLY. This guard needs the
 * database. When the env is absent it prints a skip and exits 0, the same way
 * test-detail-render-smoke skips without a build — but it says so, because a
 * check that reports nothing for everything is broken, not clean.
 */
const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";

if (!URL_BASE || !KEY) {
  console.log("check-deal-art: no Supabase env present — SKIPPING the live-data assertions (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to run them)");
  process.exit(0);
}

let pass = 0;
const fail = [];
const ok = (c, m) => { if (c) pass++; else fail.push(m); };

const res = await fetch(
  `${URL_BASE}/rest/v1/wf_deals?active=eq.true&select=id,title,scope,image_url,photo_ref,maps_to`,
  { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, cache: "no-store" },
);
// CREDENTIALS PRESENT BUT REJECTED IS A SKIP, NOT A PASS — AND NOT A BUILD BREAK.
// We could not read the response, so we know nothing about the data. Reporting OK
// here would be precisely the defect filed as #511 (link_ok:true recorded against
// http_status:403 — "OK" asserted for a response nobody read). Failing the whole
// prebuild is also wrong: a rotated local key is an environment problem, not a
// code defect. So: exit 0, but say COULD NOT READ, loudly and in those words.
// Verified real: the local SUPABASE_SERVICE_ROLE_KEY currently 401s.
if (!res.ok) {
  console.log(`check-deal-art: COULD NOT READ wf_deals (HTTP ${res.status}) — assertions SKIPPED, nothing verified. This is NOT a pass.`);
  process.exit(0);
}
const rows = await res.json();

// A positive control. If the table came back empty, every "no row violates X"
// assertion below would pass vacuously — the exact shape of a check that cannot fail.
ok(Array.isArray(rows) && rows.length > 0, `there are active deals to check (got ${Array.isArray(rows) ? rows.length : "non-array"})`);

const PARTNER_HOST = /^https?:\/\/(?:[a-z0-9-]+\.)*(?:undercovertourist\.com|amazonaws\.com|cloudfront\.net)/i;
const REF_RX = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

for (const r of rows) {
  const tag = `deal ${r.id} "${r.title}"`;
  ok(!!(r.image_url || r.photo_ref),
    `${tag}: has real art — image_url or photo_ref. A gradient-only card is a placeholder that shipped.`);
  if (r.photo_ref) {
    ok(REF_RX.test(r.photo_ref),
      `${tag}: photo_ref is a well-formed Google resource name (/api/photo refuses anything else, so a malformed ref renders NOTHING)`);
  }
  if (r.image_url) {
    ok(!PARTNER_HOST.test(r.image_url),
      `${tag}: image_url is not a partner-hosted asset (${r.image_url.slice(0, 60)}) — they rotate without warning and the card has no onError fallback`);
    ok(/^\//.test(r.image_url) || !/^https?:/i.test(r.image_url),
      `${tag}: image_url is one of OUR committed assets, served from our own origin`);
  }
  ok(r.scope === "local" || r.scope === "national",
    `${tag}: scope is explicit ('${r.scope}') — NULL was ambiguous between "no location" and "location unknown"`);
}

if (fail.length) {
  console.error("check-deal-art: FAIL");
  fail.forEach((f) => console.error("  - " + f));
  process.exit(1);
}
console.log(`check-deal-art: OK — ${pass} assertions across ${rows.length} active deals (every one has real art, no partner-hosted images, scope explicit)`);
