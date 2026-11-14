// lib/christmasPlanVotes.js: friend votes on a shared Christmas plan.
// SERVER ONLY. Storage is public.wf_christmas_plan_votes (migration
// 20261112120000_wf_christmas_plan_votes.sql), read and written with the
// service role through PostgREST, like the Group Vote repository
// (lib/groupPlanRepository.js). It FAILS CLOSED: if the table does not exist
// yet (migration not applied), the key is missing, the request fails or the
// reply is not the expected shape, every function answers { available: false }
// and the page hides the vote buttons. Sharing a plan never needs this file.
import { CHRISTMAS_VOTER_RX } from "./christmasPlan.js";

const TABLE = "wf_christmas_plan_votes";
const PLAN_RX = /^[a-f0-9]{16}$/;

export function planVoteConfig(env = process.env) {
  const url = String(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return /^https:\/\/[^\s/]+$/.test(url) && key ? { url, key } : null;
}

const UNAVAILABLE = Object.freeze({ available: false });

async function call(config, fetchImpl, resource, init = {}) {
  const response = await fetchImpl(config.url + "/rest/v1/" + resource, {
    ...init, cache: "no-store", signal: AbortSignal.timeout(4000),
    headers: { apikey: config.key, authorization: "Bearer " + config.key, "content-type": "application/json", ...(init.headers || {}) },
  });
  return response;
}

// { available: true, counts: { itemId: n }, mine: [itemId] } or { available: false }.
export async function readPlanVotes(planId, voter, { env = process.env, fetchImpl = fetch } = {}) {
  try {
    const config = planVoteConfig(env);
    if (!config || !PLAN_RX.test(planId)) return UNAVAILABLE;
    const response = await call(config, fetchImpl, TABLE + "?plan_id=eq." + planId + "&select=item_id,voter_token&limit=5000");
    if (!response.ok) return UNAVAILABLE; // 404 PGRST205 / 42P01: the table is not there yet
    const rows = await response.json();
    if (!Array.isArray(rows)) return UNAVAILABLE;
    const counts = {};
    const mine = [];
    for (const row of rows) {
      if (!row || typeof row.item_id !== "string") continue;
      counts[row.item_id] = (counts[row.item_id] || 0) + 1;
      if (voter && row.voter_token === voter) mine.push(row.item_id);
    }
    return { available: true, counts, mine };
  } catch { return UNAVAILABLE; }
}

// on=true adds the vote (a repeat is ignored by the unique key), on=false removes it.
export async function castPlanVote({ planId, itemId, voter, on }, { env = process.env, fetchImpl = fetch } = {}) {
  try {
    const config = planVoteConfig(env);
    if (!config || !PLAN_RX.test(planId) || !itemId || !CHRISTMAS_VOTER_RX.test(voter)) return UNAVAILABLE;
    const response = on
      ? await call(config, fetchImpl, TABLE + "?on_conflict=plan_id,item_id,voter_token", {
        method: "POST", headers: { prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify({ plan_id: planId, item_id: itemId, voter_token: voter }),
      })
      : await call(config, fetchImpl, TABLE + "?plan_id=eq." + planId + "&item_id=eq." + encodeURIComponent(itemId) + "&voter_token=eq." + voter, { method: "DELETE", headers: { prefer: "return=minimal" } });
    return response.ok ? { available: true } : UNAVAILABLE;
  } catch { return UNAVAILABLE; }
}
