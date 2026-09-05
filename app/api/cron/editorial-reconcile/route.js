export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
// app/api/cron/editorial-reconcile — LAYER THREE of the editorial servability
// rule. Demotes published rows whose place has stopped being servable.
//
// THE THREE LAYERS, and why none of them is redundant:
//
//   1. WRITE TRIGGER (wf_editorial_servable_place). Refuses to publish editorial
//      for a place with no OPERATIONAL wf_inventory row. Answers "was this place
//      open when we printed the guide". CANNOT answer "is it open now" — a venue
//      closing is an UPDATE to wf_inventory, a table the trigger never sees.
//   2. READ VIEW (wf_editorial_servable). Every serving path reads it, and it
//      re-checks status on EVERY read, so a place that closes after publication
//      stops serving instantly. This is the layer that actually protects the
//      reader, and it is why this cron is a cleanup job and not a safety net.
//   3. THIS JOB. The view hides a stale row; it does not correct it. Without
//      this, wf_editorial's `verified` column drifts permanently out of step
//      with reality: counts lie, coverage reporting lies, and the row is never
//      re-queued for rewriting because nothing marks it as needing work.
//
// So: the view keeps users safe, this keeps the DATA honest. Owner's standard
// (2026-09-04) is that a bug is not fixed until the immediate problem, the root
// cause, and the regression protection are all handled — this is the third.
//
// Deliberately NOT a Google or Anthropic spender: it reads two tables we already
// own and writes a boolean. Free-first, per the 2026-09-04 directive.
import { createClient } from "@supabase/supabase-js";
import { jobCannotRun } from "../../../../lib/jobFail";
import { recordPulse } from "../../../../lib/jobPulse";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const svc = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !svc) return jobCannotRun("editorial-reconcile", "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing");
  const db = createClient(url, svc, { auth: { persistSession: false } });

  // Published rows, and the set that is still servable. The difference is the
  // drift. Read both from the DATABASE's own definitions — wf_editorial for
  // what claims to be published, the view for what genuinely is — so this job
  // can never disagree with the rule the serving path enforces.
  const { data: published, error: pErr } = await db
    .from("wf_editorial").select("place_id").eq("verified", true);
  if (pErr) {
    await recordPulse("editorial-reconcile", { attempted: 0, succeeded: 0, note: ("read failed: " + pErr.message).slice(0, 200) });
    return Response.json({ ok: false, error: "published read failed" }, { status: 500 });
  }
  const { data: servable, error: sErr } = await db
    .from("wf_editorial_servable").select("place_id");
  if (sErr) {
    await recordPulse("editorial-reconcile", { attempted: 0, succeeded: 0, note: ("view read failed: " + sErr.message).slice(0, 200) });
    return Response.json({ ok: false, error: "servable read failed" }, { status: 500 });
  }

  const live = new Set((servable || []).map((r) => r.place_id));
  const stale = (published || []).map((r) => r.place_id).filter((id) => !live.has(id));

  let demoted = 0;
  if (stale.length) {
    // Chunked: a place_id list of a few thousand exceeds a practical URL length.
    for (let i = 0; i < stale.length; i += 200) {
      const batch = stale.slice(i, i + 200);
      const { error } = await db.from("wf_editorial")
        .update({ verified: false, issues: ["not-servable-inventory"] })
        .in("place_id", batch);
      if (!error) demoted += batch.length;
    }
  }

  // ALWAYS pulse, including on a clean run. A job that only reports when it
  // finds something is indistinguishable from a job that stopped running — the
  // exact failure that left three canary guards silent for weeks.
  await recordPulse("editorial-reconcile", {
    attempted: (published || []).length,
    succeeded: (published || []).length - stale.length + demoted,
    note: stale.length
      ? `demoted ${demoted}/${stale.length} published row(s) whose place is no longer OPERATIONAL`
      : `clean: ${(published || []).length} published, all still servable`,
  });

  return Response.json({
    ok: true, published: (published || []).length, servable: live.size,
    stale: stale.length, demoted,
    // Bounded sample so an operator can eyeball WHICH places drifted without
    // this response becoming a data dump.
    sample: stale.slice(0, 10),
  });
}
