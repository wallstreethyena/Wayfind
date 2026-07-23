// app/api/city/unlock/route.js — the "unlock" hook (spec STEP 3 #9→#10). The
// client has already written a wf_city_requests row (status 'requested'); this
// flips it to 'fetching' to signal the city is queued for population, and is
// where the on-demand multi-provider pull runs.
//
// STATUS: the status machine + demand capture ship here. The actual pull
// (#10 — Google Places → wf_inventory via the classify pipeline, + Viator for
// the destination, gated by wf_quality10) is the keys-dependent server work that
// hangs off this hook; wired next. Until then a request sits at 'fetching' and
// the owner/pull process drains it. Fail-soft: never throws to the client.
import { sbEnv } from "../../../../lib/serverCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch (e) {}
  const lat = Number(body.lat), lng = Number(body.lng);
  if (!isFinite(lat) || !isFinite(lng)) return Response.json({ ok: false, error: "bad coords" }, { status: 200 });
  const s = sbEnv();
  if (!s) return Response.json({ ok: false, error: "no service env" }, { status: 200 });

  // Mark the freshest matching request 'fetching' so the gate/UX + the pull queue
  // agree it's in progress. Bounded to a small geo box around the point.
  const h = { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json", Prefer: "return=minimal" };
  const box = 0.5; // ~35mi — a request within the same metro
  const q = `lat=gte.${(lat - box).toFixed(4)}&lat=lte.${(lat + box).toFixed(4)}&lng=gte.${(lng - box).toFixed(4)}&lng=lte.${(lng + box).toFixed(4)}&status=eq.requested`;
  try {
    await fetch(`${s.url}/rest/v1/wf_city_requests?${q}`, { method: "PATCH", headers: h, body: JSON.stringify({ status: "fetching" }), cache: "no-store" });
  } catch (e) {}

  // TODO(#10): run the on-demand pull here — Google Places → wf_inventory
  // (classify pipeline), then Viator for the resolved destination, each gated by
  // wf_quality10; then set status='live'. Needs GOOGLE_MAPS_SERVER_KEY +
  // VIATOR_API_KEY (both server-side) and is verified against a real unlock.
  return Response.json({ ok: true, status: "fetching", note: "queued for population" }, { headers: { "Cache-Control": "no-store" } });
}
