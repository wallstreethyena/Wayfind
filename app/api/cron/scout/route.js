// app/api/cron/scout/route.js — the 9.2 scout.
//
// OWNER DIRECTIVE (2026-08-22): "I want that to always be looking for places
// above 9.2 Wayfind score."
//
// WHAT IT ACTUALLY DOES, AND WHY THAT IS NOT WHAT IT SOUNDS LIKE.
//
// The Wayfind score is a pure function of rating and review count
// (lib/wayfindScore.js). Finding places above 9.2 is therefore arithmetic, and
// arithmetic belongs in SQL — public.wf_scout_candidates() does it for free.
// Paying a model to rank numbers would be theatre.
//
// The real blocker, measured 2026-08-22, sits upstream of ranking:
//
//   28,598 places indexed in wf_place_ids
//    8,168 servable in wf_inventory
//    6,650 unserved places ALREADY clear 9.2
//      294 were fetched from Google, PAID FOR, and rejected `unclassified`
//       40 of those clear 9.2; 19 clear 9.5
//
// In that rejected bucket, side by side:
//
//   Shore Thing Tiki Cruises          5.0 / 1,116  99   a real boat tour
//   SURFIT USA Kayaks & Paddleboards  4.9 / 3,229  98   a real rental
//   Westcoast Black Theatre Troupe    4.9 /   528  96   a real theatre
//   Mote Marine Laboratory            4.7 / 9,851  94   a real aquarium
//   Spunky Spirits Mobile Bartending  5.0 / 1,033  99   a bartender for hire
//   Top Lawn Pros                     4.9 /   650  96   a lawn service
//   Siesta Roofing                    4.9 /   155  92   a roofer
//
// Their Google types are identical — ["service","point_of_interest",
// "establishment"] — so lib/placeCategory.js abstains on all seven and the
// promoter bins all seven with the same message. A Google rating measures how
// well a business serves whoever hires it; it says nothing about whether a
// stranger would want to GO there. Telling those apart from a name and a
// sentence is a language problem, and it is the only thing a model is asked
// to do here.
//
// COSTS NO GOOGLE SPEND. Candidates arrive with their Place Details already in
// wf_places_cache — this re-reads a record bought months ago and binned. The
// only meter it moves is Anthropic, at roughly $0.0002 a place.
//
// THE MODEL CANNOT SHIP ANYTHING. It fills classify()'s abstention and nothing
// else (lib/scoutAdjudicate.js carries the full law). An accepted place is only
// RE-QUEUED; /api/cron/promote-index then re-fetches Details, re-validates, and
// lands the row needs_review=true with last_verified_at=null. A human ships.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

import { sbEnv } from "../../../../lib/serverCache";
import { recordPulse } from "../../../../lib/jobPulse";
import { jobCannotRun, jobFailed } from "../../../../lib/jobFail";
import { aiKey } from "../../../../lib/aiKey";
import { classify } from "../../../../lib/placeCategory";
import {
  SCOUT_FLOOR, ADJUDICATE_SYSTEM, buildAdjudicationBatch,
  parseAdjudication, adjudicationOutcome, clearsFloor,
} from "../../../../lib/scoutAdjudicate";

const MODEL = "claude-haiku-4-5";
const BATCH = 25;          // places per model call
const MAX_BATCHES = 4;     // hard ceiling per invocation: 100 places, ~$0.02
const MODEL_TIMEOUT_MS = 20000;

// The details blob cached under `pd1|<id>` is the app's own shape, not Google's
// wire shape. classify() wants types/primaryType/name; that is all we take.
function fromCache(details, row) {
  const d = details || {};
  return {
    place_id: row.place_id,
    name: d.name || row.name || null,
    google_types: Array.isArray(d.types) ? d.types : [],
    primary_type: d.primaryType || null,
    editorial: d.description || null,
    address: d.address || null,
    rating: row.rating ?? d.rating ?? null,
    reviews: row.reviews ?? d.reviews ?? 0,
  };
}

async function adjudicateBatch(key, rows) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), MODEL_TIMEOUT_MS);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: ctrl.signal, cache: "no-store",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 1600, system: ADJUDICATE_SYSTEM,
        messages: [{ role: "user", content: buildAdjudicationBatch(rows) }],
      }),
    });
    if (!r.ok) return { verdicts: null, error: `anthropic ${r.status}: ${(await r.text()).slice(0, 140)}` };
    const data = await r.json();
    const text = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    return { verdicts: parseAdjudication(text, rows.map((x) => x.place_id)), error: null };
  } catch (e) {
    return { verdicts: null, error: `anthropic call failed: ${String(e && e.message).slice(0, 140)}` };
  } finally { clearTimeout(timer); }
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return new Response("unauthorized", { status: 401 });

  const url = new URL(req.url);
  const floor = Math.max(0, Math.min(parseInt(url.searchParams.get("floor") || String(SCOUT_FLOOR), 10) || SCOUT_FLOOR, 100));
  const limit = Math.max(1, Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, BATCH * MAX_BATCHES));
  const dryRun = url.searchParams.get("dry") === "1";

  const s = sbEnv();
  if (!s || !s.url || !s.key) return jobCannotRun("scout", "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is missing");
  const key = aiKey();
  // No key is a CONFIGURATION failure, not an empty queue. Conflating those is
  // the exact shape that hid atlas-build for five days (lib/jobPulse.js).
  if (!key) return jobCannotRun("scout", "ANTHROPIC_API_KEY is missing — the scout cannot adjudicate");

  const H = { apikey: s.key, authorization: "Bearer " + s.key, "content-type": "application/json" };
  // cache:"no-store" on EVERY call, POSTs included. A cached RPC response hands
  // back the previous run's rows and the job reports success while doing
  // nothing — measured in production on promote-index, 2026-08-13.
  const rest = async (p, init) => {
    const r = await fetch(`${s.url}/rest/v1/${p}`, { ...(init || {}), cache: "no-store", headers: { ...H, ...(init?.headers || {}) } });
    const body = await r.text();
    if (!r.ok) throw new Error(`${r.status} ${body.slice(0, 160)}`);
    // MEASURED ON THE FIRST LIVE RUN (2026-08-22). `prefer: return=minimal`
    // answers 201 with an EMPTY body, not 204. Branching on 204 alone left
    // r.json() parsing "" and throwing "Unexpected end of JSON input" — AFTER
    // the write had already landed. The job then reported a failure for work it
    // had completed and skipped the requeue, which was the entire point of the
    // run. Read the body once and let emptiness mean empty.
    return body ? JSON.parse(body) : null;
  };

  let rows;
  try {
    rows = await rest("rpc/wf_scout_candidates", {
      method: "POST", body: JSON.stringify({ p_limit: limit, p_floor: floor }),
    });
  } catch (e) {
    const why = `candidate select failed: ${String(e && e.message).slice(0, 160)}`;
    console.error(`[scout] ${why}`);
    return jobFailed("scout", why);
  }
  if (!Array.isArray(rows) || !rows.length) {
    await recordPulse("scout", { attempted: 0, succeeded: 0, note: `no candidates at floor ${floor}` });
    return Response.json({ ok: true, done: true, floor, note: `no unadjudicated places clear ${floor}` });
  }

  const now = new Date().toISOString();
  const verdictRows = [], accepted = [], rejected = [], skipped = [], recovered = [], excluded = [];
  let modelError = null;

  for (let i = 0; i < rows.length && i < BATCH * MAX_BATCHES; i += BATCH) {
    const slice = rows.slice(i, i + BATCH).map((r) => fromCache(r.details, r));
    // DEFENCE IN DEPTH. The RPC says the promoter abstained on these, but that
    // was a past run against a past classifier. Re-derive it here, and drop any
    // place classify() can now decide for itself — a model must never be asked
    // about a place the rules already answer.
    const live = [];
    for (const p of slice) {
      const src = rows.find((r) => r.place_id === p.place_id);
      const c = classify({ types: p.google_types, primaryType: p.primary_type, name: p.name });

      // FREE LANE 1 — classify() EXCLUDES it (Top Lawn Pros, Landis Pools, The
      // Shop: general_contractor / car_repair behind five stars). Store the
      // verdict so this place leaves the candidate set permanently. Without
      // this row it would be re-selected, and re-billed, on every single run.
      if (c.excluded) {
        verdictRows.push({
          place_id: p.place_id, name: p.name, score: src?.score ?? null,
          rating: src?.rating ?? null, reviews: src?.reviews ?? 0,
          section: null, accepted: false, reason: `classify(): ${c.reason}`.slice(0, 300),
          model: "classify", adjudicated_at: now,
        });
        excluded.push({ place_id: p.place_id, name: p.name, score: src?.score, why: c.reason });
        continue;
      }

      // FREE LANE 2 — classify() can DECIDE it today. The stored `unclassified`
      // rejection is STALE: the classifier has moved since the row was binned.
      // Westcoast Black Theatre Troupe (4.9 / 528) is this case — types carry
      // `event_venue`, which resolves to attractions now and did not then. No
      // model call, no verdict, no judgement: just reopen the queue and let the
      // promoter re-derive it from a fresh fetch, exactly as it would any place.
      if (c.section) {
        recovered.push({ place_id: p.place_id, name: p.name, score: src?.score, section: c.section, category: c.category });
        continue;
      }

      live.push({ p, c });
    }
    if (!live.length) continue;

    // A dry run still ADJUDICATES — it just writes nothing. A preview that
    // skips the model call previews the plumbing, not the judgement, and the
    // judgement is the only part worth previewing.
    const { verdicts, error } = await adjudicateBatch(key, live.map(({ p }) => p));
    // FAIL CLOSED. No verdicts means nothing moves; the places stay exactly as
    // they were and are picked up again next run. Nothing is written, so
    // nothing is billed twice and nothing is wrongly binned.
    if (!verdicts) { modelError = error; break; }

    for (const { p, c } of live) {
      const src = rows.find((r) => r.place_id === p.place_id);
      const out = adjudicationOutcome(c, verdicts[p.place_id]);
      // The floor is re-asserted here against THE score function, not against
      // the SQL that selected the row. Two independent statements of the same
      // rule, which is what keeps a future SQL edit from lowering it silently.
      if (out.accept && !clearsFloor(src?.rating, src?.reviews, floor)) {
        skipped.push({ place_id: p.place_id, name: p.name, why: "below floor on re-check" });
        continue;
      }
      // AN OMISSION IS NOT A VERDICT. If the model simply did not mention this
      // place, leave it exactly where it is so the next run asks again. Writing
      // a rejection here would permanently bin a good place on a dropped line —
      // it dropped Sarasota Kayak Rentals (5.0 / 193) on the first live run.
      if (!out.answered) {
        skipped.push({ place_id: p.place_id, name: p.name, score: src?.score, why: out.reason });
        continue;
      }
      verdictRows.push({
        place_id: p.place_id, name: p.name, score: src?.score ?? null,
        rating: src?.rating ?? null, reviews: src?.reviews ?? 0,
        section: out.accept ? out.section : null, accepted: out.accept,
        reason: out.reason.slice(0, 300), model: MODEL, adjudicated_at: now,
      });
      (out.accept ? accepted : rejected).push({ place_id: p.place_id, name: p.name, score: src?.score, section: out.section, why: out.reason });
    }
  }

  // A dry run reports and writes NOTHING — not the verdicts, not the requeue.
  // Half-dry would be worse than either: it would store judgements nobody
  // reviewed while claiming the run was a preview.
  let writeErr = null;
  if (verdictRows.length && !dryRun) {
    try {
      // Verdicts first, and they are the memory: a place recorded here is never
      // adjudicated (or billed) again, whichever way it went.
      await rest("wf_scout_verdicts?on_conflict=place_id", {
        method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(verdictRows),
      });
    } catch (e) { writeErr = `verdict write failed: ${String(e && e.message).slice(0, 160)}`; }
  }

  // Only now reopen the queue. Ordering matters for the ADJUDICATED ones: if
  // the verdict write failed we must not requeue them, or the promoter
  // re-fetches Details for places whose verdict was never stored and bins them
  // again — paid work with a guaranteed-wrong outcome. The RECOVERED ones carry
  // no verdict and depend on nothing, so they always go.
  const toRequeue = dryRun ? [] : [...recovered, ...(writeErr ? [] : accepted)];
  let requeued = 0;
  if (toRequeue.length) {
    try {
      const ids = toRequeue.map((a) => `"${a.place_id}"`).join(",");
      await rest(`wf_promotion_queue?place_id=in.(${ids})`, {
        method: "PATCH", headers: { prefer: "return=minimal" },
        body: JSON.stringify({ status: "pending", attempts: 0, reject_reason: null, last_error: null, next_attempt_at: now, claimed_at: null }),
      });
      requeued = toRequeue.length;
    } catch (e) { writeErr = `requeue failed: ${String(e && e.message).slice(0, 160)}`; }
  }

  // succeeded = places handed BACK TO THE PROMOTER, not places looked at. A run
  // that adjudicates 40 places and reopens none has done its job and produced
  // nothing servable, and job-watch must be able to see that difference.
  const note = modelError || writeErr ||
    (requeued === 0 ? `0 requeued of ${rows.length} candidates` : null);
  await recordPulse("scout", { attempted: rows.length, succeeded: requeued, note });

  if (modelError) {
    console.error(`[scout] ${modelError}`);
    return jobFailed("scout", modelError, { attempted: rows.length, succeeded: requeued });
  }
  if (writeErr) {
    console.error(`[scout] ${writeErr}`);
    return jobFailed("scout", writeErr, { attempted: rows.length, succeeded: requeued });
  }
  return Response.json({
    ok: true, floor, model: MODEL, dryRun,
    candidates: rows.length, adjudicated: verdictRows.length, requeued,
    accepted: accepted.length, rejected: rejected.length,
    recovered: recovered.length, excluded: excluded.length, skipped: skipped.length,
    // Full lists, not counts. A rejected gem and an admitted roofer are both
    // things the owner must be able to see without opening the database — and
    // a count cannot show either.
    acceptedPlaces: accepted, rejectedPlaces: rejected,
    recoveredPlaces: recovered, excludedPlaces: excluded, skippedPlaces: skipped,
  }, { headers: { "cache-control": "no-store" } });
}
