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
import { sendGuideEmail } from "../../../lib/guideEmail.js";

// Mailing is stricter than saving. (1) The browser-set Sec-Fetch-Site header
// must say same-origin: a cross-site page can never send it and a naive
// script will not, so the looser Referer fallback the photo route accepts is
// not used here. A determined script CAN set any header, so (2) the send is
// also capped by volume read from the durable table: at most
// GUIDE_EMAIL_MAX_PER_ADDRESS_DAY guide emails to one address per day and
// GUIDE_EMAIL_MAX_PER_HOUR in total. The list had one guide signup ever when
// this shipped, so the caps never touch a real reader. Over a cap: row saved,
// no email.
const GUIDE_EMAIL_MAX_PER_ADDRESS_DAY = 3;
const GUIDE_EMAIL_MAX_PER_HOUR = 40;
async function underSendCaps(email) {
  const raw = cleanEnv(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : "https://" + raw) : "";
  const key = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) return false;
  const count = async (filter) => {
    const r = await fetch(url + "/rest/v1/wf_email_signups?select=id&source=eq.guide&" + filter, {
      method: "HEAD", cache: "no-store",
      headers: { apikey: key, Authorization: "Bearer " + key, Prefer: "count=exact" },
    });
    const m = /\/(\d+)$/.exec(r.headers.get("content-range") || "");
    return r.ok && m ? Number(m[1]) : Infinity; // unknown → treat as over the cap
  };
  const hourAgo = new Date(Date.now() - 3600e3).toISOString();
  const dayAgo = new Date(Date.now() - 86400e3).toISOString();
  const [perAddress, perHour] = await Promise.all([
    count("email=eq." + encodeURIComponent(email) + "&created_at=gte." + encodeURIComponent(dayAgo)),
    count("created_at=gte." + encodeURIComponent(hourAgo)),
  ]);
  // The row just inserted is included in both counts.
  return perAddress <= GUIDE_EMAIL_MAX_PER_ADDRESS_DAY && perHour <= GUIDE_EMAIL_MAX_PER_HOUR;
}
function emailableRequest(headers) {
  const sfs = String((headers && headers.get && headers.get("sec-fetch-site")) || "").toLowerCase();
  return sfs === "same-origin";
}

function cleanEnv(v) { return String(v || "").trim().replace(/^['"]+|['"]+$/g, ""); }

async function persistSignup(entry) {
  const raw = cleanEnv(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL).replace(/\/+$/, "");
  const url = raw ? (/^https?:\/\//i.test(raw) ? raw.replace(/^http:\/\//i, "https://") : "https://" + raw) : "";
  const key = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key) return { ok: false, isNew: false };
  const row = {
    email: entry.email,
    source: entry.source || null,
    // slug is NOT NULL DEFAULT '' in the table — the (email, slug) unique
    // constraint needs a real value to dedupe non-guide signups against.
    slug: entry.slug || "",
    region: entry.region || null,
    likes: entry.likes || 0,
    signals: entry.signals || 0,
  };
  const post = (prefer) => fetch(url + "/rest/v1/wf_email_signups?on_conflict=email,slug", {
    method: "POST",
    headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: prefer },
    body: JSON.stringify(row),
    cache: "no-store",
  });
  // 2026-10-20: first an ignore-duplicates insert that RETURNS the row only
  // when it is new — that is what decides whether the guide email goes out
  // (one email per address per guide, never one per click). A re-submission
  // then takes the original merge-duplicates path so counts stay current and
  // the same reader re-submitting never 409s or double-counts.
  const first = await post("resolution=ignore-duplicates,return=representation");
  if (!first.ok) return { ok: false, isNew: false };
  let inserted = [];
  try { inserted = await first.json(); } catch (e) { inserted = []; }
  if (Array.isArray(inserted) && inserted.length > 0) return { ok: true, isNew: true };
  const again = await post("resolution=merge-duplicates,return=minimal");
  return { ok: again.ok, isNew: false };
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
    let saved = { ok: false, isNew: false };
    try {
      saved = await persistSignup(entry);
      if (!saved.ok) console.error("[wayfind signup persist] not configured or refused");
    } catch (e) {
      console.error("[wayfind signup persist error]", e?.message);
    }
    // The guide form promises "Sent. Check your inbox" — keep that promise.
    // Only for a NEW (address, guide) row, so the endpoint can never be used
    // to mail the same address over and over. Never fails the request.
    if (saved.isNew && entry.source === "guide" && emailableRequest(req.headers) && typeof entry.slug === "string" && entry.slug) {
      try {
        if (await underSendCaps(entry.email)) await sendGuideEmail({ email: entry.email, slug: entry.slug });
        else console.error("[guide-email] send cap reached; row saved, no email");
      } catch (e) {
        console.error("[guide-email] cap check failed; no email", e?.message);
      }
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
