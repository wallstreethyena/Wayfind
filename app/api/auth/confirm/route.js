// v5.05 — Rescue path for accounts created while Supabase's mailer was
// broken: they exist but sit unconfirmed forever, so sign-in fails with
// "Email not confirmed". When the client hits that error it calls this route,
// which marks the account confirmed via the Admin API, then retries the
// password sign-in. Confirming grants nothing by itself — access still
// requires the password — and new accounts are created pre-confirmed anyway
// (see /api/auth/signup), so this closes out the stranded middle group.
export const runtime = "nodejs";

function sb() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^http:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : (/^https:\/\//i.test(raw) ? raw : "https://" + raw)) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

export async function POST(req) {
  const s = sb();
  if (!s) return Response.json({ error: "not configured" }, { status: 501 });
  let body;
  try { body = await req.json(); } catch { return Response.json({ error: "bad request" }, { status: 400 }); }
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({ error: "valid email required" }, { status: 400 });
  try {
    const h = { apikey: s.key, Authorization: `Bearer ${s.key}` };
    const r = await fetch(`${s.url}/auth/v1/admin/users?page=1&per_page=1&email=${encodeURIComponent(email)}`, { headers: h });
    const d = await r.json().catch(() => ({}));
    const u = (d && Array.isArray(d.users) ? d.users : []).find((x) => String(x.email || "").toLowerCase() === email);
    if (!u) return Response.json({ error: "no such account" }, { status: 404 });
    if (u.email_confirmed_at) return Response.json({ ok: true, already: true });
    const r2 = await fetch(`${s.url}/auth/v1/admin/users/${u.id}`, { method: "PUT", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify({ email_confirm: true }) });
    if (!r2.ok) return Response.json({ error: "could not confirm" }, { status: 502 });
    return Response.json({ ok: true });
  } catch (e) { return Response.json({ error: "could not confirm" }, { status: 502 }); }
}
