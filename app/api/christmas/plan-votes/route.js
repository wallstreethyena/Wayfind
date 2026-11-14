export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /api/christmas/plan-votes: friend votes on a shared Christmas plan.
// GET  ?plan=id,id&voter=<32 hex>  -> { available, counts, mine }
// POST { plan: "id,id", item, voter, on }  -> { available }
// FAILS CLOSED: until public.wf_christmas_plan_votes exists (migration
// 20261112120000), every answer is { available: false } and the page hides the
// vote buttons; sharing a plan never calls this route. The plan's ids are
// checked against the real listings, and the item must be one of them.
// Guarded in middleware.js (same origin + per IP rate limit).
import { fetchCuratedEvents } from "../../../../lib/curatedEvents.js";
import { siteTodayStr } from "../../../../lib/siteTime.js";
import { christmasBrowseCached, parseChristmasBrowseQuery } from "../../../../lib/christmasBrowse.js";
import { christmasPlanItems, christmasPlanKey, CHRISTMAS_VOTER_RX } from "../../../../lib/christmasPlan.js";
import { castPlanVote, readPlanVotes } from "../../../../lib/christmasPlanVotes.js";

const HEADERS = { "cache-control": "no-store" };
const closed = (status = 200) => Response.json({ available: false }, { status, headers: HEADERS });

async function knownPlan(planValue) {
  const { listings } = await christmasBrowseCached(parseChristmasBrowseQuery({}), siteTodayStr(), () => fetchCuratedEvents({ signal: AbortSignal.timeout(4000) }));
  const items = christmasPlanItems(listings, planValue);
  return { ids: items.map((c) => c.id) };
}

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const { ids } = await knownPlan(params.get("plan"));
    if (!ids.length) return closed();
    const voter = CHRISTMAS_VOTER_RX.test(params.get("voter") || "") ? params.get("voter") : "";
    const result = await readPlanVotes(christmasPlanKey(ids), voter);
    return Response.json(result.available ? { ...result, ids } : result, { headers: HEADERS });
  } catch { return closed(); }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { ids } = await knownPlan(body && body.plan);
    const item = String((body && body.item) || "");
    if (!ids.length || !ids.includes(item)) return closed(400);
    const result = await castPlanVote({ planId: christmasPlanKey(ids), itemId: item, voter: String(body.voter || ""), on: body.on !== false });
    return result.available ? Response.json(result, { headers: HEADERS }) : closed(503);
  } catch { return closed(503); }
}
