// app/api/cron/breaker-reset/route.js — the guarded reset for a latched
// provider circuit breaker (lib/providerHealth.js).
//
// WHY THIS EXISTS (WO-C, 2026-09-04). lib/providerHealth's breaker
// self-clears after BREAKER_COOLDOWN_MS (30 min) — good for a transient
// blip, but a breaker latched on a STALE reason (credits that have since
// been topped up, a key that has since been fixed) means the fleet sits
// idle for up to 30 minutes past the point the fix actually landed, and
// every run in between silently re-reports "circuit open" instead of
// re-testing the provider. The owner's own account state
// ($49.95 available, $3.54 spent this month, per the 2026-09-03 report)
// is exactly that shape: if a breaker had latched on the OLD dead-credits
// reason, credits being fine again does not clear it — only time or this
// route does.
//
// This is the ONE supported way to clear it. Not a raw DELETE run by hand
// against wf_places_cache (no record of who did it, when, or why), and not
// a code change (a breaker is operational state, not a bug). Every call:
//   - is CRON_SECRET-gated, same fail-closed contract as job-watch and
//     schema-watch;
//   - reports what it found BEFORE clearing (so a reset accidentally fired
//     against an already-closed breaker is visibly a no-op, not silently
//     "successful");
//   - files its own wf_job_pulse row, so a reset is auditable the same way
//     every other operational action on this fleet is (grep wf_job_pulse
//     for job='breaker-reset').
//
// Cost: zero. This never touches Google or Anthropic — it only reads and
// writes one row in the shared server cache (wf_places_cache).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { breakerOpen, resetBreaker } from "../../../../lib/providerHealth.js";
import { recordPulse } from "../../../../lib/jobPulse.js";

// Known breaker keys only — this must never become a way to write an
// arbitrary cache key from a URL param.
const KNOWN_PROVIDERS = new Set(["anthropic"]);

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const url = new URL(req.url);
  if (!secret || (auth !== "Bearer " + secret && url.searchParams.get("key") !== secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const provider = String(url.searchParams.get("provider") || "anthropic").trim().toLowerCase();
  if (!KNOWN_PROVIDERS.has(provider)) {
    return Response.json({ ok: false, error: `unknown provider "${provider}"`, known: [...KNOWN_PROVIDERS] }, { status: 400 });
  }

  // status-only: report the breaker without touching it. Lets an operator
  // (or job-watch) check "is it latched" before deciding to reset.
  if (url.searchParams.get("mode") === "status") {
    const state = await breakerOpen(provider);
    return Response.json({ ok: true, provider, open: !!state, state });
  }

  const result = await resetBreaker(provider);
  await recordPulse("breaker-reset", {
    attempted: 1,
    succeeded: result.ok ? 1 : 0,
    note: result.ok
      ? (result.wasOpen ? `cleared ${provider}: was ${result.before?.kind || "?"} — ${String(result.before?.reason || "").slice(0, 120)}` : `${provider} was already closed — no-op`)
      : `reset FAILED: ${result.error || "unknown error"}`,
  });

  return Response.json(
    { ok: result.ok, provider, wasOpen: result.wasOpen, before: result.before || null, error: result.error || null },
    result.ok ? { headers: { "cache-control": "no-store" } } : { status: 500, headers: { "cache-control": "no-store" } }
  );
}
