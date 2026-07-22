export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
// FL Healthy Beaches water-quality cron (spec §2) — 2x/week. Station names
// come from wf_editorial.beach_extras.water_quality_program (the fleet's
// stable truth). While no stations are mapped this logs coverage and exits —
// it NEVER writes a guessed result. The DOH fetch lands when the first
// station names arrive; until then wf_beach_water stays empty and the UI
// renders no cleanliness claim at all (the honest default).
import { createClient } from "@supabase/supabase-js";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const svc = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !svc) return Response.json({ error: "no service key" }, { status: 200 });
  const db = createClient(url, svc, { auth: { persistSession: false } });
  const { data } = await db.from("wf_editorial").select("place_id,beach_extras").not("beach_extras", "is", null);
  const stations = (data || [])
    .map((r) => ({ place_id: r.place_id, station: r.beach_extras && r.beach_extras.water_quality_program }))
    .filter((r) => r.station && String(r.station).trim());
  const out = { stations_mapped: stations.length, fetched: 0, note: stations.length ? "DOH fetch pending station-format confirmation" : "no stations mapped yet — fleet still landing" };
  try { console.log(JSON.stringify({ tag: "beach_water_cron", ...out })); } catch (e) {}
  return Response.json(out, { status: 200 });
}
