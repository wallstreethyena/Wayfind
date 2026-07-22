export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
// Viator link watchdog (owner, 2026-07-22 — the Coquina->Mumbai safety net).
// The bug: a non-bookable place (beach/natural feature) leaked a geo-less
// "Search Viator" CTA that defaulted to Viator's featured cities. The code
// fix gates every CTA on isTicketyPlace; this cron is the runtime guard that
// sweeps live inventory and records any place that WOULD leak a booking CTA,
// so a data drift (a beach mis-typed as bookable) is caught before a user.
// CRON_SECRET-gated. Writes anomalies to wf_booking_audit; never throws.
import { createClient } from "@supabase/supabase-js";
import { isTicketyPlace } from "../../../../lib/affiliates";

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const svc = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !svc) return Response.json({ error: "no service key" }, { status: 200 });
  const db = createClient(url, svc, { auth: { persistSession: false } });

  // The at-risk set: beaches + natural features. A CTA must NEVER render here.
  const { data } = await db.from("wf_inventory")
    .select("place_id,name,category,google_types,status")
    .or("category.eq.beach,google_types.cs.{natural_feature},google_types.cs.{beach}")
    .neq("status", "CLOSED")
    .limit(500);

  const out = { checked: (data || []).length, leaks: 0 };
  const rows = [];
  for (const p of data || []) {
    // isTicketyPlace consumes google types as `types` — the exact input the CTA uses.
    if (isTicketyPlace({ types: p.google_types || [], category: p.category, name: p.name })) {
      out.leaks++;
      rows.push({ place_id: p.place_id, name: p.name, category: p.category, issue: "nonbookable_cta_leak", detail: "isTicketyPlace=true for a beach/natural feature — would render a Viator CTA (Coquina->Mumbai class)", checked_at: new Date().toISOString() });
    }
  }
  if (rows.length) { try { await db.from("wf_booking_audit").insert(rows); } catch (e) {} }
  try { console.log(JSON.stringify({ tag: "booking_audit_cron", ...out })); } catch (e) {}
  return Response.json(out, { status: 200 });
}
