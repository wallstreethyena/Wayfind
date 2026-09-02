// app/api/feedback/route.js — user feedback -> the DATABASE, never an inbox.
//
// OWNER DIRECTIVE (2026-08-22): a feedback control that does NOT go to email —
// something the team reads later in one place. This writes to public.wf_feedback
// with the service role. There is deliberately NO mail send here: adding one
// would reintroduce exactly the thing the owner ruled out. scripts/
// check-community-footer.mjs fails the build if this route ever imports a mailer
// or references a mailto/RESEND path.
//
// Untrusted input, treated as such: the message is length-capped and stored as
// data (never interpolated into anything executable), the fields the client may
// set are an allow-list, and everything identifying (build, ua, user location)
// is truncated. A warm-instance limiter stops a single client hammering it.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sb() {
  const raw = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^['"]+|['"]+$/g, "").replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:/i, "https:") : "https://" + raw) : "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
}

// Warm-instance rate limit: at most 5 submissions per key per 10 minutes. Keyed
// by a coarse client hint, not stored, not logged — just a backstop against spam.
const HITS = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
function limited(k) {
  const now = Date.now();
  const arr = (HITS.get(k) || []).filter((t) => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) { HITS.set(k, arr); return true; }
  arr.push(now); HITS.set(k, arr); return false;
}

const str = (v, n) => (typeof v === "string" ? v.trim().slice(0, n) : null);

export async function POST(req) {
  let body;
  try { body = await req.json(); } catch { return Response.json({ ok: false, error: "bad json" }, { status: 400 }); }

  const message = str(body && body.message, 2000);
  if (!message) return Response.json({ ok: false, error: "empty" }, { status: 400 });

  const sentiment = body && (body.sentiment === "up" || body.sentiment === "down") ? body.sentiment : null;

  const s = sb();
  // A configuration gap is not the user's fault: accept gracefully so the UI can
  // still say "thanks" rather than throwing, but report ok:false so a monitor can
  // tell stored-nothing from stored-something.
  if (!s) return Response.json({ ok: false, stored: false, error: "unconfigured" }, { status: 200 });

  const ipHint = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "anon";
  if (limited(ipHint)) return Response.json({ ok: true, stored: false, error: "rate_limited" }, { status: 200 });

  const row = {
    message,
    sentiment,
    path: str(body && body.path, 200),
    place: str(body && body.place, 200),
    loc_name: str(body && body.loc, 120),
    build: str(body && body.build, 40),
    user_id: /^[0-9a-f-]{36}$/i.test(String(body && body.userId || "")) ? body.userId : null,
    ua: str(req.headers.get("user-agent"), 300),
  };

  try {
    const r = await fetch(`${s.url}/rest/v1/wf_feedback`, {
      method: "POST", cache: "no-store",
      headers: { apikey: s.key, authorization: "Bearer " + s.key, "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify(row),
    });
    if (!r.ok) {
      console.error(`[feedback] insert ${r.status}: ${(await r.text()).slice(0, 160)}`);
      return Response.json({ ok: false, stored: false }, { status: 200 });
    }
    return Response.json({ ok: true, stored: true }, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error(`[feedback] insert failed: ${String(e && e.message).slice(0, 160)}`);
    return Response.json({ ok: false, stored: false }, { status: 200 });
  }
}
