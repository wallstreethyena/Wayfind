// scripts/check-promote-metros-live-drift.mjs — the LIVE half of metro parity.
//
// WHY THIS EXISTS (2026-09-01). scripts/check-promote-metros-parity.mjs compares
// lib/promoteIndex.js PROMOTE_METROS against ONE FILE:
// supabase/migrations/20260813_wf_promote_metros.sql. That guard is offline by
// design (prebuild has no database, no network — check-guard-hermeticity.mjs
// enforces it), so it can only ever prove "the JS constant matches the SQL this
// repo committed once". It cannot see a row inserted straight into Supabase.
//
// That is exactly what happened. On 2026-08-23, five rows — miami-dade, broward,
// palm-beach, keys, and (2026-09-01) florida — were added to the LIVE
// public.wf_promote_metros table with no matching migration. The enqueue trigger
// (wf_bucket_metro, which reads the table directly) started tagging queue rows
// with the new metros immediately. PROMOTE_METROS — the JS mirror — did not
// move, and check-promote-metros-parity.mjs stayed green throughout, because
// its "expected" set never came from the table that actually changed.
// validateInventoryRow() rejects any metroKey PROMOTE_METROS doesn't recognize
// with reject_reason "unknown metro: <name>" — see lib/promoteIndex.js — so
// every place the drain route reached in a new metro was one write away from
// being silently thrown out.
//
// THE FIX (this PR): app/api/cron/promote-index/route.js and
// scripts/promote-worker.mjs now fetch public.wf_promote_metros LIVE at run
// start and decide against THAT, falling back to PROMOTE_METROS only when the
// fetch fails. That closes the production hole regardless of what this guard
// finds. This guard closes the OTHER hole: nothing was watching for the
// fallback drifting out of date, which matters because a stale fallback is
// exactly what turns "the DB is briefly unreachable" into "we silently reject
// a market's worth of good places" again the next time Supabase hiccups.
//
// SAME SHAPE AS check-inventory-integrity.mjs, same reasoning: this needs a
// live Supabase read, which prebuild does not have, so it SKIPS LOUDLY without
// credentials rather than reporting a false green, is declared in
// check-guard-hermeticity.mjs's EXEMPT list (the credentials are the
// CONNECTION, not the verdict) and in check-guard-manifest.mjs's EXCLUDED list
// (not wired into scripts/guards.txt — a live database row must never be able
// to block a code deploy), and runs on a clock in the canary workflow
// (ops/canary.workflow.yml — parked there until the owner installs it at
// .github/workflows/canary.yml; see ops/README-canary.md) instead of on push.
import { PROMOTE_METROS } from "../lib/promoteIndex.js";

const URL_ = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!URL_ || !KEY) {
  console.log("check-promote-metros-live-drift: SKIPPED — no Supabase credentials in env (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to enforce)");
  process.exit(0);
}

let bad = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { bad++; console.error("check-promote-metros-live-drift: FAIL — " + m); } };

const r = await fetch(`${URL_}/rest/v1/wf_promote_metros?select=metro,min_lat,max_lat,min_lng,max_lng,active`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
if (!r.ok) { console.error(`check-promote-metros-live-drift: FAIL — Supabase ${r.status}`); process.exit(1); }
const rows = await r.json();
ok(Array.isArray(rows) && rows.length > 0, "wf_promote_metros returned no rows — this guard has lost its subject");

const active = rows.filter((row) => row.active !== false);
const activeKeys = active.map((row) => row.metro).sort();
const jsKeys = Object.keys(PROMOTE_METROS).sort();

// The set must match exactly. A metro live in the table and absent from
// PROMOTE_METROS is the 2026-08-23 defect reproduced; a metro in PROMOTE_METROS
// and absent (or inactive) live is a fallback now promising geography the
// database no longer serves — either way, the fallback the route/worker fall
// back to on a failed fetch is lying about what "served" means.
const missingFromJs = activeKeys.filter((k) => !jsKeys.includes(k));
const missingFromDb = jsKeys.filter((k) => !activeKeys.includes(k));
ok(missingFromJs.length === 0,
  `${missingFromJs.length} ACTIVE metro(s) live in wf_promote_metros are missing from lib/promoteIndex.js PROMOTE_METROS: ${missingFromJs.join(", ")}. ` +
  `The route/worker fetch the live table now, so THIS RUN is not silently rejecting them — but the fallback PROMOTE_METROS falls back to is stale, and a DB outage during a drain would reproduce the 2026-08-23 defect. Add these boxes to PROMOTE_METROS (and mirror them into a migration) or confirm with the owner these metros are intentionally not yet served offline.`);
ok(missingFromDb.length === 0,
  `${missingFromDb.length} metro(s) in PROMOTE_METROS are not active in wf_promote_metros: ${missingFromDb.join(", ")}. The offline fallback is promising geography the live table no longer serves.`);

for (const row of active) {
  const a = PROMOTE_METROS[row.metro];
  if (!a) continue; // already reported above
  for (const [jsField, dbField] of [["minLat", "min_lat"], ["maxLat", "max_lat"], ["minLng", "min_lng"], ["maxLng", "max_lng"]]) {
    ok(a[jsField] === row[dbField],
      `${row.metro}.${jsField} differs — PROMOTE_METROS says ${a[jsField]}, wf_promote_metros says ${row[dbField]}.`);
  }
}

// Prove the check can fail: a deliberately wrong live row must be detected.
{
  const fakeActive = [{ metro: "not-a-real-metro", min_lat: 0, max_lat: 1, min_lng: 0, max_lng: 1, active: true }];
  const fakeMissing = fakeActive.map((row) => row.metro).filter((k) => !jsKeys.includes(k));
  ok(fakeMissing.length === 1, "self-test: an active DB metro absent from PROMOTE_METROS must be detected, or this guard is inert");
}

if (bad) { console.error(`check-promote-metros-live-drift: ${bad} failure(s)`); process.exit(1); }
console.log(`check-promote-metros-live-drift: OK — ${checks} assertions, ${activeKeys.length} active live metros match PROMOTE_METROS exactly`);
