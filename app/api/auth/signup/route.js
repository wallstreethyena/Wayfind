// v5.05 — Server-side account creation. Live testing caught signup returning
// 500 "Error sending confirmation email": Supabase's built-in mailer is
// rate-limited/unreliable, which meant NOBODY could create an account. This
// route creates the user via the Supabase Admin API with the email marked
// confirmed, so signup works instantly and never depends on an email being
// deliverable. The client signs the user in with their password right after.
// If custom SMTP is configured in Supabase later, email confirmation can be
// re-enabled and the client falls back gracefully (route keeps working).
// Service-role key stays server-only; nothing sensitive returns to the browser.
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
  const password = String(body.password || "");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({ error: "valid email required" }, { status: 400 });
  if (password.length < 8) return Response.json({ error: "password must be at least 8 characters" }, { status: 400 });
  try {
    const r = await fetch(`${s.url}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.ok) return Response.json({ ok: true });
    const msg = String((d && (d.msg || d.message || d.error_description || d.error)) || "");
    if (r.status === 422 || /already.*(registered|exists)/i.test(msg)) return Response.json({ exists: true }, { status: 409 });
    return Response.json({ error: msg || "could not create account" }, { status: 502 });
  } catch (e) {
    return Response.json({ error: "could not create account" }, { status: 502 });
  }
}
