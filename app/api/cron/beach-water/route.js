export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
// FL Healthy Beaches water-quality cron (spec §2) — 2x/week. Station names
// live in wf_editorial.beach_extras (water_quality_program + wq_county,
// mapped 2026-07-22 from the DOH sampling-sites layer by proximity). One
// Caspio fetch per county — the SAME datapage floridahealth.gov's widget
// uses — then DOH's own bands classify each reading (lib/beachWater).
// HONESTY RULES: 'NR'/blank readings are skipped (never written); a beach
// with no fresh reading keeps its previous row and the UI labels staleness;
// nothing is ever guessed.
import { createClient } from "@supabase/supabase-js";
import { fetchDohCounty, normStation } from "../../../../lib/beachWater";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const svc = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !svc) return Response.json({ error: "no service key" }, { status: 200 });
  const db = createClient(url, svc, { auth: { persistSession: false } });

  const { data } = await db.from("wf_editorial").select("place_id,beach_extras").not("beach_extras", "is", null);
  const mapped = (data || [])
    .map((r) => ({
      place_id: r.place_id,
      station: normStation(r.beach_extras && r.beach_extras.water_quality_program),
      county: (r.beach_extras && r.beach_extras.wq_county) || null,
    }))
    .filter((r) => r.station && r.county);

  const counties = [...new Set(mapped.map((r) => r.county))];
  const out = { stations_mapped: mapped.length, counties: counties.length, fetched: 0, matched: 0, upserts: 0, skipped_nr: 0 };
  const rows = [];

  const doFetch = (u) => fetch(u, { headers: { "user-agent": "wayfind-beach-water/1.0 (+https://www.gowayfind.com)" }, cache: "no-store" });
  for (const county of counties) {
    let readings = [];
    try {
      readings = await fetchDohCounty(county, doFetch); // paginates (Caspio: 10 rows/page)
      if (readings.length) out.fetched++;
    } catch (e) { continue; }
    const byStation = new Map(readings.map((x) => [x.station, x]));
    for (const m of mapped.filter((x) => x.county === county)) {
      const hit = byStation.get(m.station);
      if (!hit) continue;
      out.matched++;
      if (!hit.result || !hit.sampled_at) { out.skipped_nr++; continue; } // NR — never write a guess
      rows.push({
        beach_place_id: m.place_id,
        station: hit.station,
        sampled_at: hit.sampled_at,
        result: hit.result,
        advisory: hit.advisory,
        fetched_at: new Date().toISOString(),
      });
    }
  }

  if (rows.length) {
    const { error } = await db.from("wf_beach_water").upsert(rows, { onConflict: "beach_place_id" });
    if (!error) out.upserts = rows.length;
    else out.upsert_error = String(error.message || error).slice(0, 200);
  }
  try { console.log(JSON.stringify({ tag: "beach_water_cron", ...out })); } catch (e) {}
  return Response.json(out, { status: 200 });
}
