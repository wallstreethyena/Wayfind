// Daily dispatcher cron. One Vercel cron slot fires this every morning; the
// handler routes by date. Every day: build and send the digest (health
// canaries + activity counts). Date-routed notes: Nov 1 giveaway draw
// reminder; quarterly awards-refresh reminders (the automated compile ships
// post-launch). Every external dependency is optional and degrades
// gracefully: no Resend key -> findings returned as JSON (visible in Vercel
// logs); no service-role key -> events counts are skipped (the events table
// is insert-only under RLS by design).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE = "https://wayfind-xi.vercel.app";

async function check(name, url) {
  try {
    const r = await fetch(url, { cache: "no-store" });
    return { name, ok: r.ok, status: r.status };
  } catch (e) {
    return { name, ok: false, status: 0 };
  }
}

async function sbCount(table, sinceIso, key) {
  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^http:\/\//i, "https://").replace(/\/+$/, ""); // v4.13: http-> https, see places route note
  const apikey = key || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !apikey) return null;
  try {
    const u = base + "/rest/v1/" + table + "?select=id" + (sinceIso ? "&created_at=gte." + encodeURIComponent(sinceIso) : "") + "&limit=1";
    const r = await fetch(u, { headers: { apikey, Authorization: "Bearer " + apikey, Prefer: "count=exact" }, cache: "no-store" });
    if (!r.ok) return null;
    const cr = r.headers.get("content-range") || "";
    const total = cr.includes("/") ? parseInt(cr.split("/")[1], 10) : null;
    return Number.isFinite(total) ? total : null;
  } catch (e) {
    return null;
  }
}

async function userStats(svc) {
  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/^http:\/\//i, "https://").replace(/\/+$/, ""); // v4.13: http-> https, see places route note
  if (!base || !svc) return null;
  try {
    const r = await fetch(base + "/rest/v1/rpc/user_stats", { method: "POST", headers: { apikey: svc, Authorization: "Bearer " + svc, "Content-Type": "application/json" }, body: "{}", cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== "Bearer " + secret) return new Response("unauthorized", { status: 401 });
  }

  const now = new Date();
  const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
  const dateKey = now.toISOString().slice(0, 10);

  const checks = await Promise.all([
    check("homepage", SITE + "/"),
    check("og card", SITE + "/api/og?kind=list"),
    check("weather", SITE + "/api/weather?lat=28.54&lng=-81.38"),
  ]);

  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY || null;
  const [comments24, shares24, events24, users] = await Promise.all([
    sbCount("comments", since),
    sbCount("shared_lists", since),
    svc ? sbCount("events", since, svc) : Promise.resolve(null),
    svc ? userStats(svc) : Promise.resolve(null),
  ]);

  const notes = [];
  const md = dateKey.slice(5);
  if (md === "11-01") notes.push("Giveaway draw day: run supabase/giveaway-draw.sql and announce the winner.");
  if (["01-15", "04-15", "07-15", "10-15"].includes(md)) notes.push("Quarterly awards refresh: verify Michelin/Beard/local award lists and update lib/gems.js (compile pipeline ships post-launch).");

  const failing = checks.filter((c) => !c.ok);
  const lines = [
    "Wayfind daily digest \u2014 " + dateKey,
    "",
    "Health: " + (failing.length ? "ISSUES \u2014 " + failing.map((c) => c.name + " (" + c.status + ")").join(", ") : "all checks passing (" + checks.map((c) => c.name).join(", ") + ")"),
    "Signups: " + (users ? users.confirmed + " confirmed of " + users.total + " total (+" + users.new_24h + " in 24h)" : "needs user_stats SQL function + service key"),
    "Last 24h: " + [
      comments24 != null ? comments24 + " community takes" : "takes n/a",
      shares24 != null ? shares24 + " shared lists" : "shared lists n/a",
      events24 != null ? events24 + " events (shares/saves)" : "events count needs SUPABASE_SERVICE_ROLE_KEY",
    ].join(" \u00b7 "),
    "Traffic: PostHog dashboard \u2014 https://us.posthog.com (subscription email covers visitor counts)",
  ];
  if (notes.length) lines.push("", "Today: " + notes.join(" | "));
  const body = lines.join("\n");

  let emailed = false;
  const rk = process.env.RESEND_API_KEY;
  if (rk) {
    try {
      const to = process.env.DIGEST_EMAIL || "gabrielpereira@me.com";
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + rk, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "Wayfind <onboarding@resend.dev>", to: [to], subject: "Wayfind digest \u2014 " + dateKey + (failing.length ? " \u26a0\ufe0f" : " \u2713"), text: body }),
      });
      emailed = r.ok;
    } catch (e) {}
  }

  return Response.json({ ok: failing.length === 0, emailed, checks, users, comments24, shares24, events24, notes });
}
