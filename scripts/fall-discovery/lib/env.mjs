// scripts/fall-discovery/lib/env.mjs — resolves Supabase READ credentials for
// the discovery script only. This module NEVER writes to Supabase (the
// pipeline only writes local report files — see run.mjs's header comment),
// so it accepts either a service-role key (the periodic GitHub Actions job,
// same secret names as .github/workflows/canary.yml) or an anon/publishable
// key (a local manual run, or the CLI-only credential supply the operator
// runbook calls for — see the WS4 task brief: "supply ONLY on the command
// line ... never write it into a repo file"). wf_inventory is anon-readable,
// so a read-only key is always enough for this script's job.
//
// Mirrors lib/serverCache.sbEnv()'s URL normalization (http -> https, no
// trailing slash) so the two never disagree about what a "clean" URL looks
// like, without importing serverCache.js itself (that module pulls in the
// server cache's warm-lambda memory map, which this standalone script has no
// use for).
function cleanUrl(raw) {
  const s = String(raw || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  if (!s) return "";
  if (/^http:\/\//i.test(s)) return s.replace(/^http:\/\//i, "https://");
  if (/^https:\/\//i.test(s)) return s;
  return "https://" + s;
}

export function resolveSupabaseRead(env = process.env) {
  const url = cleanUrl(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL);
  const key = env.SUPABASE_SERVICE_ROLE_KEY
    || env.SUPABASE_ANON_KEY
    || env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    || env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return { url, key, mode: env.SUPABASE_SERVICE_ROLE_KEY ? "service_role" : "read_only" };
}
