export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return Response.json({ error: "unconfigured" }, { status: 503 });
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db.from("wf_social_trend_reports").select("region,window_start,window_end,policy_version,report,qualified_leads,generated_at").eq("region", "FL").order("window_end", { ascending: false }).limit(1).maybeSingle();
  if (error) return Response.json({ error: "report_read_failed" }, { status: 503 });
  return Response.json({ private: true, publication_enabled: false, report: data || null }, { headers: { "cache-control": "no-store" } });
}
