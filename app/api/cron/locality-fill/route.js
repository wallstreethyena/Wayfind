// app/api/cron/locality-fill/route.js — once a day, give NEW places their city
// and county from the free US Census geocoder, add-only.
//
// Why and the rule: lib/localityFill.js. In short: the place-insert path writes
// no city or county, so every new place arrived city-less (all 30 added
// 2026-11-11 → 11-12). This reads up to DAILY_LIMIT city-less, county-less,
// unlocked Florida-box rows, newest first; asks the Census which city and
// county contain each point; writes only Florida answers, only while both
// fields are still empty. Held answers (not Florida, Bay Lake, no answer) are
// left alone and counted.
//
// Cost: the Census geocoder is a free public US government service with no
// key. No Google, no paid provider. One request per row, 4 at a time.
import { sbEnv } from "../../../../lib/serverCache";
import { recordPulse } from "../../../../lib/jobPulse";
import { jobCannotRun } from "../../../../lib/jobFail";
import {
  candidatesQuery, censusUrl, parseCensusGeographies, planLocalityWrite, writeQuery, writeBody, DAILY_LIMIT,
} from "../../../../lib/localityFill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 60;

const UA = { "user-agent": "wayfind-locality-fill/1.0 (+https://www.gowayfind.com)" };

async function lookup(row) {
  try {
    const r = await fetch(censusUrl(row.lat, row.lng), { headers: UA, cache: "no-store", signal: AbortSignal.timeout(12000) });
    if (!r.ok) return null;
    return parseCensusGeographies(await r.json());
  } catch {
    return null;
  }
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== "Bearer " + secret) return Response.json({ error: "unauthorized" }, { status: 401 });
  const s = sbEnv();
  if (!s) return jobCannotRun("locality-fill", "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL is missing");
  const headers = { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json" };

  const read = await fetch(`${s.url}/rest/v1/${candidatesQuery(DAILY_LIMIT)}`, { headers, cache: "no-store" });
  if (!read.ok) {
    const note = `read wf_inventory → ${read.status}`;
    await recordPulse("locality-fill", { attempted: 0, succeeded: 0, failed: 1, note });
    return Response.json({ ok: false, error: note });
  }
  const rows = await read.json();

  const out = { candidates: rows.length, written: 0, with_city: 0, county_only: 0, held: 0, lookup_failed: 0, raced: 0, write_errors: 0 };
  const holds = {};
  let i = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (i < rows.length) {
      const row = rows[i++];
      const geo = await lookup(row);
      if (!geo) out.lookup_failed++;
      const plan = planLocalityWrite(row, geo);
      if (plan.action !== "write") {
        out.held++;
        holds[plan.why] = (holds[plan.why] || 0) + 1;
        continue;
      }
      const w = await fetch(`${s.url}/rest/v1/${writeQuery(row.place_id)}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=representation" },
        cache: "no-store",
        body: JSON.stringify(writeBody(plan)),
      });
      if (!w.ok) { out.write_errors++; continue; }
      const got = await w.json();
      if (!Array.isArray(got) || got.length !== 1) { out.raced++; continue; }
      out.written++;
      if (plan.locality) out.with_city++; else out.county_only++;
    }
  }));

  const note = `wrote ${out.written} (city ${out.with_city}, county only ${out.county_only}); held ${out.held}`
    + (Object.keys(holds).length ? ` [${Object.entries(holds).map(([k, v]) => `${k}: ${v}`).join("; ")}]` : "")
    + (out.write_errors ? `; ${out.write_errors} write errors` : "");
  await recordPulse("locality-fill", {
    attempted: rows.length,
    succeeded: out.written,
    failed: out.write_errors || null,
    note: note.slice(0, 200),
  });
  return Response.json({ ok: out.write_errors === 0, ...out, holds });
}
