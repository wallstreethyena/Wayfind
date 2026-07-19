// lib/commandCenter/supabaseAdmin.js — server-only Supabase access for the
// Command Center. Service-role key NEVER leaves this module; routes get data,
// not credentials. Mirrors the sb() resolver pattern used across api routes
// (metrics/share, signals/likes) so a messy env value can't break anything.
//
// All reads go through the wf_cc_* aggregate RPCs (supabase/command-center.sql)
// — SECURITY DEFINER functions whose EXECUTE is granted to service_role only.
// No raw table rows, no device ids, no user ids, no emails ever come back.

function clean(v) { return String(v || "").trim().replace(/^['"]+|['"]+$/g, ""); }

export function sbAdmin(env = process.env) {
  const raw = clean(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : "https://" + raw) : "";
  const key = clean(env.SUPABASE_SERVICE_ROLE_KEY);
  return url && key ? { url, key } : null;
}

// Call one aggregate RPC. Throws on transport/HTTP errors (caller maps to a
// srcError block); returns parsed JSON rows on success.
export async function rpc(name, args = {}, opts = {}) {
  const s = opts.sb || sbAdmin(opts.env);
  if (!s) throw new Error("supabase_not_configured");
  const fetchImpl = opts.fetchImpl || fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 8000);
  try {
    const r = await fetchImpl(`${s.url}/rest/v1/rpc/${encodeURIComponent(name)}`, {
      method: "POST",
      headers: {
        apikey: s.key,
        Authorization: `Bearer ${s.key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(args),
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`rpc ${name} ${r.status}: ${t.slice(0, 140)}`);
    }
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}
