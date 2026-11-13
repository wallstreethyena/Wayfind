// Worth the Drive? vote API.
// GET  /api/vote?placeId=...         — returns current vote totals for a place
// POST /api/vote  { placeId, vote }  — records a vote and returns updated totals
//
// In-memory store: totals accumulate across requests on the same Vercel instance.
// Resets on cold start (acceptable for MVP). All votes are logged to console
// (visible in Vercel → your project → Functions → Logs) and forwarded to
// SIGNUP_WEBHOOK_URL if configured, so you have permanent records.
import { evaluateProductionWrite, isSyntheticRequest } from "../../../lib/productionWriteFirewall.js";

const store = new Map();

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const placeId = url.searchParams.get("placeId");
    if (!placeId) return Response.json({ error: "placeId required" }, { status: 400 });
    const v = store.get(placeId) || { yes: 0, no: 0 };
    return Response.json(v);
  } catch (e) {
    return Response.json({ yes: 0, no: 0 });
  }
}

export async function POST(req) {
  try {
    if (isSyntheticRequest(req)) {
      return Response.json({ blocked: true, error: "synthetic_write_blocked" }, { status: 403 });
    }
    const body = await req.json();
    const { placeId, vote, placeName, distMi } = body || {};
    if (!placeId || !["yes", "no"].includes(vote)) {
      return Response.json({ error: "invalid" }, { status: 400 });
    }
    const cur = store.get(placeId) || { yes: 0, no: 0 };
    const updated = { ...cur, [vote]: (cur[vote] || 0) + 1 };
    store.set(placeId, updated);

    const entry = { type: "worthTheDrive", placeId, placeName: placeName || placeId, vote, distMi, totals: updated, ts: new Date().toISOString() };
    console.log("[wayfind vote]", JSON.stringify(entry));

    const webhook = process.env.SIGNUP_WEBHOOK_URL;
    if (webhook && evaluateProductionWrite({ surface: "vote_webhook", table: "signup_webhook", method: "POST", req }).allowed) {
      try {
        await fetch(webhook, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(entry),
        });
      } catch {}
    }
    return Response.json(updated);
  } catch (e) {
    console.error("[wayfind vote error]", e?.message);
    return Response.json({ error: "failed" }, { status: 500 });
  }
}
