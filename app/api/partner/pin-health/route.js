// app/api/partner/pin-health/route.js — the live verdict that lets a dead
// founder pin stop painting a Book button WITHOUT a deploy.
//
// WHY (2026-09-10 review of #1238): "Monitoring detects the problem; it does not
// currently quarantine it." #1238's credentialed sweep turns a newly dead pin
// into a red build, but between that red build and a human shipping the
// retirement, customers can still click a Book button whose product is gone.
// This route closes that window.
//
// WHAT IT RETURNS. Only POSITIVE death verdicts:
//   { ok: true, dead: [{ code, reason }], pinned, checkedAt }
// A code's ABSENCE from `dead` never means anything. lib/pinQuarantine reads it
// that way on purpose — see lib/pinHealth.js for why the inverse shape (ship
// the live set, refuse anything missing) would turn one Supabase hiccup into
// every Book button on the site disappearing at once.
//
// ON FAILURE it returns { ok: false, error } with NO list and no-store, and the
// client keeps serving exactly what it served before. Unknown is not dead.
//
// STATUS IS ALWAYS 200. This is an advisory feed, not an operation: a non-2xx
// would make the client's own fetch wrapper treat a well-formed "I could not
// check" as a transport failure, and both land in the same place anyway
// (nothing is quarantined). The honest signal is the `ok` field, which the
// client reads. lib/jobFail's 5xx contract is for CRON JOBS, whose failure has
// to page someone; this one degrades to the previous behaviour by design.
//
// READS WITH THE ANON KEY, via the resolver's own readEnv(). Two reasons, both
// already documented in lib/commerceProviders: the service-role key in this
// project is a legacy JWT and legacy keys 401 on every call, and this is a
// public read of an affiliate catalogue (wf_experiences carries
// wf_experiences_anon_read). A health feed has no business holding write
// authority.
//
// NOT in middleware.js's same-origin matcher on purpose: it proxies no paid API
// and reveals nothing a scraper does not already get from our client bundle,
// where every pinned product code ships in plain text.
import { readEnv } from "../../../../lib/commerceProviders.js";
import { readPinHealth } from "../../../../lib/pinHealth.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const out = await readPinHealth({ env: readEnv });
  return Response.json(out, {
    headers: {
      // Five minutes at the edge. A pin that dies is contained within one cache
      // generation, and stale-while-revalidate means a slow catalogue never
      // becomes a slow card. no-store on failure so a transient "I could not
      // check" is not cached as the answer for the next five minutes.
      "Cache-Control": out.ok
        ? "public, s-maxage=300, stale-while-revalidate=900"
        : "no-store",
    },
  });
}
