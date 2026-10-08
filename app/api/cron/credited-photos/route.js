// app/api/cron/credited-photos/route.js — keep blog + guide venues supplied
// with a Google photo that is cached AND credited under the same photo name.
//
// WHY: see lib/creditedPhotoWarm.js. Thin caller: auth, target list, budget
// gate, pulse. The work (idempotency, ledger grants, Google calls through the
// shared helper) lives in lib/, which scripts/test-credited-photo-warm.mjs
// exercises hermetically.
//
// AUTH: CRON_SECRET bearer or 401 (scripts/check-cron-failclosed.mjs).
//
// MODES (query string):
//   (none)        DRY RUN. Builds the target list, reads which venues already
//                 hold a live cached+credited pair, prints the counts and the
//                 cost upper bound. Makes NO Google request and takes NO grant.
//   ?run=1        REAL RUN, at most `limit` venues (default 120, hard max 150).
//                 Needs CREDITED_PHOTO_WARM_MONTH_CAP, WAYFIND_GATE != shut,
//                 production, and the shared photos ledger to allow it.
//   ?ids=a,b,c    restrict the target list to these place ids (smoke test).
//
// SCHEDULE: daily (vercel.json). Idempotent: a venue with a live pair is
// skipped, so a normal day refreshes only the ~1/21 of venues whose pair is
// within 10 days of its 30-day end, and one-time warming is just this route
// called repeatedly until `toWarm` reaches 0.
//
// UNSET CAP = SKIPPED, NOT FAILED: the schedule can ship before the owner sets
// CREDITED_PHOTO_WARM_MONTH_CAP; until then every run answers 200 "skipped" and
// spends nothing.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const WORK_BUDGET_MS = 240_000;
const DEFAULT_LIMIT = 120;

import { warmCreditedPhotos, blockedReason, HARD_MAX_PER_RUN } from "../../../../lib/creditedPhotoWarm";
import { loadBlogTargets, guideTargets, mergeTargets, viewedFirst, loadReaderViews, backfillScope, loadPhotosUsed, PLACE_ID_RX } from "../../../../lib/creditedPhotoTargets";
import { photosCeiling } from "../../../../lib/spendGate";
import { GUIDES } from "../../../../lib/guides";
import { GUIDE_PLACE_RAILS } from "../../../../lib/guidePlaceRails";
import { guidePickMayResolvePlaceCard } from "../../../../lib/guidePlaceIdentity";
import { recordPulse } from "../../../../lib/jobPulse";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail";

function sbEnv() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : "https://" + raw) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return new Response("unauthorized", { status: 401 });

  const startedAt = Date.now();
  const u = new URL(req.url);
  const wantRun = u.searchParams.get("run") === "1";
  const limit = Math.max(1, Math.min(HARD_MAX_PER_RUN, Number(u.searchParams.get("limit")) || DEFAULT_LIMIT));
  const only = String(u.searchParams.get("ids") || "").split(",").map((x) => x.trim()).filter((x) => PLACE_ID_RX.test(x));

  const s = sbEnv();
  if (!s) return jobCannotRun("credited-photos", "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing");

  // A real run that cannot spend is a clean skip, not a failure.
  if (wantRun) {
    const why = blockedReason({ env: s });
    if (why) {
      await recordPulse("credited-photos", { attempted: 0, succeeded: 0, note: `skipped: ${why}` });
      return Response.json({ ok: true, skipped: true, reason: why }, { headers: { "cache-control": "no-store" } });
    }
  }

  let targets;
  let stats;
  let scope = null;
  try {
    const blog = await loadBlogTargets({ url: s.url, key: s.key });
    const guide = guideTargets(GUIDES, GUIDE_PLACE_RAILS, guidePickMayResolvePlaceCard);
    targets = mergeTargets(blog.ids, guide.ids);
    // 2026-10-08: places real readers recently failed to see go first. A failed
    // read is not a reason to stop: the list just keeps its placeId order.
    let views = new Map();
    try { views = await loadReaderViews(targets.map((t) => t.placeId), { url: s.url, key: s.key }); } catch { views = new Map(); }
    targets = viewedFirst(targets, views);
    // Budget-aware scope: when this month's headroom does not cover the everyday
    // reserve, only places real readers recently viewed are backfilled.
    let used = null;
    try { used = await loadPhotosUsed({ url: s.url, key: s.key }); } catch { used = null; }
    scope = backfillScope({ used, cap: photosCeiling() });
    if (scope.viewedOnly) targets = targets.filter((t) => (views.get(t.placeId) || 0) > 0);
    stats = { blog: blog.stats, guide: guide.stats };
  } catch (e) {
    return jobFailed("credited-photos", "target list failed: " + (e && e.message ? e.message : String(e)));
  }
  let ids = targets.map((t) => t.placeId);
  if (only.length) ids = ids.filter((id) => only.includes(id));

  let result;
  try {
    result = await warmCreditedPhotos({ placeIds: ids, max: limit, dryRun: !wantRun, deadlineAt: startedAt + WORK_BUDGET_MS });
  } catch (e) {
    return jobFailed("credited-photos", "worker threw: " + (e && e.message ? e.message : String(e)));
  }

  // Honest pulse: a stop on a quota line is a "quota:" note on purpose (pages
  // after one dead run); everything else is a plain description.
  const stop = result.stopped || result.blocked;
  const note = `${result.dryRun ? "dry-run " : ""}${scope && scope.viewedOnly ? `scope=viewed(room=${scope.headroom}<reserve=${scope.reserve}) ` : ""}targets=${result.targets} paired=${result.alreadyPaired} todo=${result.toWarm} tried=${result.attempted} ok=${result.warmed} nophoto=${result.noPhoto} nocredit=${result.noCredit} credfail=${result.creditFailed} cachefail=${result.cacheFailed}${stop ? " stop=" + stop : ""}`.slice(0, 190);
  if (result.dryRun) {
    await recordPulse("credited-photos", { attempted: 0, succeeded: 0, note });
  } else {
    await recordPulse("credited-photos", {
      attempted: result.attempted,
      succeeded: result.warmed,
      note: result.stopped === "quota" ? "quota: " + note : note,
    });
  }
  return Response.json({ ok: true, ...result, scope, targetStats: stats, sample: targets.slice(0, 5) }, { headers: { "cache-control": "no-store" } });
}
