// app/api/cron/photo-warm/route.js — PRODUCTION SELF-HEALS ITS OWN MISSING
// PHOTOS, HOURLY.
//
// WHY THIS EXISTS (2026-09-17). Today 2,959 of 4,448 visible rail places had
// no photo. A human fixed that gap with a one-off script that called
// production /api/photo once per missing place, and the script only knew
// about /api/rails — app/api/theme-parks (EPCOT included) was never crawled.
// This route is production doing that work itself, on a schedule, against
// EVERY surface lib/photoSurfaces.js knows about — so the next missed surface
// gets warmed the same hour it starts showing up empty, not the next time
// someone remembers to run a manual audit.
//
// THIN CALLER, same shape as app/api/cron/photo-repair/route.js: auth, the
// production-only gate, and the pulse write live HERE; every decision about
// which places to warm and when to stop lives in lib/photoWarm.js, which
// scripts/test-photo-warm.mjs exercises hermetically (injected fetch/clock,
// zero network).
//
// NEVER CALLS GOOGLE DIRECTLY. No import of lib/spendGate.js, no reference to
// the Places media host anywhere in this file OR in lib/photoWarm.js
// (scripts/test-photo-protection.mjs case 5, extended to name both). The ONE
// gated path this route touches is `${origin}/api/photo` — our own route,
// same as a browser loading a card — so the ledger, the daily quota breaker,
// fresh-name-first and the negative cache all apply exactly as they do for a
// real reader. lib/photoWarm.js's PAUSE_REASONS is what makes an exhausted
// quota or a shut gate stop this run immediately rather than hammering a
// closed door for its whole time budget.
//
// NEVER SPENDS OUTSIDE PRODUCTION. VERCEL_ENV !== "production" answers 200
// with a skipped pulse note and makes ZERO requests — not even a probe —
// because a preview/dev deployment hitting `${origin}/api/photo` would be
// hitting THAT deployment's own /api/photo, and lib/spendGate.js's
// spendAllowPhotos() already refuses non-production spend by itself, but this
// route does not rely on that second layer: it never dials at all.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same pairing as photo-repair: the platform may run for five minutes, the
// worker is held to a budget well inside it, and the gap is what a batch
// already in flight, its write, and this route's own recordPulse() need to
// land before Vercel's silent kill.
export const maxDuration = 300;
const WORK_BUDGET_MS = 270_000;
const SWEEP_BUDGET_MS = 45_000;

import { runPhotoWarm, DEFAULT_PHOTO_WARM_MAX } from "../../../../lib/photoWarm";
import { runPhotoLivenessSweep } from "../../../../lib/photoLivenessSweep";
import { sameOriginHeaders } from "../../../../lib/photoSurfaces";
import { recordPulse } from "../../../../lib/jobPulse";
import { SITE_URL } from "../../../../lib/site";
import { jobFailed } from "../../../../lib/jobFail";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return new Response("unauthorized", { status: 401 });

  // Production-only, checked BEFORE any other work and before a single
  // request is made — see this file's own header for why this is a first
  // layer, not a duplicate of spendAllowPhotos()'s own VERCEL_ENV check.
  if (process.env.VERCEL_ENV !== "production") {
    await recordPulse("photo-warm", { attempted: 0, succeeded: 0, note: "skipped: VERCEL_ENV is not production, zero requests made" });
    return Response.json({ ok: true, skipped: true, reason: "non-production" });
  }

  const startedAt = Date.now();
  // The canonical public site, not the per-deployment URL the cron request
  // arrives on (a *.vercel.app deployment host can sit behind deployment
  // protection). SITE_URL is lib/site.js's one canonical site constant.
  const origin = SITE_URL;
  const max = Math.max(1, Math.min(2000, Number(process.env.PHOTO_WARM_MAX) || DEFAULT_PHOTO_WARM_MAX));

  // DEAD-LINK SWEEP FIRST (v8.56.34): evict cached Google photo links the
  // host now refuses, so this same run's probes see those cards as missing
  // and refill them through the normal gated path. Bounded to 45 seconds.
  let sweep = null;
  try {
    sweep = await runPhotoLivenessSweep({ deadlineAt: startedAt + SWEEP_BUDGET_MS });
  } catch { sweep = null; }

  let result;
  try {
    result = await runPhotoWarm({
      origin,
      max,
      startedAt: Date.now(),
      // A round-robin rotation index, one step per quarter-hour run (the cron's
      // own cadence), over which surface/city starts a run. Not a daypart.
      offsetHour: Math.floor(startedAt / 900_000),
      endpointHeaders: sameOriginHeaders(origin),
      workBudgetMs: Math.max(60_000, WORK_BUDGET_MS - (Date.now() - startedAt)),
      paceMs: 650, // under lib/apiGuard.js 120 req/min per IP, with headroom
    });
  } catch (e) {
    return jobFailed("photo-warm", "worker threw: " + (e && e.message ? e.message : String(e)));
  }

  const statusBit = result.paused
    ? `paused=${result.pausedReason}`
    : result.stopReason
      ? `ok (${result.stopReason})`
      : "ok";
  const note = `${sweep ? `live ${sweep.checked}/${sweep.dead} dead; ` : ""}warm: visible=${result.visible} served=${result.alreadyServed} filled=${result.filled} free=${result.free} empty=${result.empty} known=${result.knownEmpty} unchecked=${result.unchecked} ${statusBit}`.slice(0, 200);

  await recordPulse("photo-warm", {
    attempted: result.attempted,
    succeeded: result.filled + result.free,
    note,
  });

  return Response.json({ ok: true, ...result, sweep });
}
