// Wayfind signup endpoint.
// Logs the email to Vercel function logs immediately (visible in your Vercel dashboard).
// Set SIGNUP_WEBHOOK_URL in Vercel env vars to forward to a Google Sheet, Zapier,
// Make.com, or any webhook that accepts a JSON POST — no extra code needed.
//
// 2026-08-07: emails are now DURABLE. A console.log line is not a mailing list —
// it scrolls out of Vercel's log retention and is gone. Every accepted email is
// upserted into public.wf_email_signups (RLS enabled, no policies: service-role
// only) so the list survives deploys and can actually be mailed. The log line
// and webhook forward both stay — additive, not a replacement. Insert failure
// does not fail the request: the visitor's signup was accepted the moment we
// logged it, and the log line remains the fallback record.
function cleanEnv(v) { return String(v || "").trim().replace(/^['"]+|['"]+$/g, ""); }

async function persistSignup(entry) {
  const raw = cleanEnv(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : "https://" + raw) : "";
  const key = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) return false;
  const r = await fetch(url + "/rest/v1/wf_email_signups?on_conflict=email,slug", {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      // merge-duplicates: the same reader re-submitting the same guide's form
      // must not 409 the request or double-count the list.
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      email: entry.email,
      source: entry.source || null,
      // slug is NOT NULL DEFAULT '' in the table — the (email, slug) unique
      // constraint needs a real value to dedupe non-guide signups against.
      slug: entry.slug || "",
      region: entry.region || null,
      likes: entry.likes || 0,
      signals: entry.signals || 0,
    }),
    cache: "no-store",
  });
  return r.ok;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { email, likes = 0, signals: sigCount = 0, source = null, slug = null, region = null } = body || {};
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return Response.json({ error: "Valid email required" }, { status: 400 });
    }
    const entry = { email: email.trim().toLowerCase(), likes, signals: sigCount, source, slug, region, ts: new Date().toISOString() };
    // Always log — visible in Vercel → your project → Functions → Logs
    console.log("[wayfind signup]", JSON.stringify(entry));
    // Durable row (service-role; RLS keeps clients out). Best-effort by design.
    try {
      const ok = await persistSignup(entry);
      if (!ok) console.error("[wayfind signup persist] not configured or refused");
    } catch (e) {
      console.error("[wayfind signup persist error]", e?.message);
    }
    // Forward to webhook if configured
    const webhook = process.env.SIGNUP_WEBHOOK_URL;
    if (webhook) {
      try {
        await fetch(webhook, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(entry),
        });
      } catch (e) {
        console.error("[wayfind signup webhook error]", e?.message);
      }
    }
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[wayfind signup error]", e?.message);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}
