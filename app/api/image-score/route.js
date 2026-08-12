export const runtime = "nodejs";
// /api/image-score — rate a candidate card photo with a vision model so cards
// show the best, most "Instagrammable" shot and NEVER lead with a photo of
// people (owner: no human faces on cards). Returns { people, aesthetic } and
// CACHES the verdict per photo ref for 30 days — each photo is scored at most
// once, ever. METERED Anthropic proxy → MUST stay in middleware.js's matcher.
import { aiKey } from "../../../lib/aiKey";
import { cget, cgetMany, cset, DAY } from "../../../lib/serverCache";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.gowayfind.com").replace(/\/+$/, "");
const PHOTO_REF = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

const SYSTEM =
  "You rate a single photo for a travel app's place card. Return ONLY compact JSON, no prose: " +
  '{"people": <true|false>, "aesthetic": <number 0.0-1.0>}. ' +
  "people = true if a person, face, or group is a PROMINENT subject (a tiny distant figure in a landscape is false). " +
  "aesthetic = how appealing/Instagrammable the shot is for a card: composition, light, clarity, and an attractive subject (food, architecture, scenery, interior). A blurry, cluttered, dark, or screenshot-like image scores low.";

// v7.21 — BATCH. The single-ref path below is unchanged and still supported
// (older clients, and it is the shape the vision call needs anyway); what is new
// is that ONE request can now ask for many verdicts.
//
// THE BOTTLENECK THIS FIXES, measured on production: tapping a category asked
// for 85 verdicts as 85 separate POSTs. The browser capped itself at 3 in
// flight, so that was ~29 sequential waves, and the last response landed 13.3
// SECONDS after the tap. Every one of those verdicts was already cached — the
// scoring was never the slow part, the per-item round-trip was.
//
// Now: one request, one cgetMany (a single PostgREST query for every key), and
// only genuine misses reach the vision model. A batch that is entirely cached —
// which is the steady state, since verdicts live 30 days — costs one round-trip
// instead of eighty-five.
//
// MISSES STAY BOUNDED. A cold batch could otherwise fire 85 concurrent metered
// vision calls. At most MAX_SCORE_PER_BATCH are scored per request, oldest-first
// in the order the client asked; the rest come back absent, which the client
// already treats as "no verdict yet" and simply keeps the primary photo. The
// next batch picks them up, so the cache still fills — just never in one
// expensive burst.
const MAX_SCORE_PER_BATCH = 8;
const MAX_REFS_PER_BATCH = 120;

async function scoreOne(ref, key) {
  const imageUrl = SITE + "/api/photo?ref=" + encodeURIComponent(ref) + "&w=400";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: "claude-haiku-4-5", max_tokens: 40, temperature: 0, system: SYSTEM,
      messages: [{ role: "user", content: [
        { type: "image", source: { type: "url", url: imageUrl } },
        { type: "text", text: "Rate this photo." },
      ] }],
    }),
  });
  if (!r.ok) return null;
  const d = await r.json();
  const txt = (d && d.content && d.content[0] && d.content[0].text) || "";
  const m = txt.match(/\{[^}]*\}/);
  if (!m) return null;
  const parsed = JSON.parse(m[0]);
  const verdict = { people: parsed.people === true, aesthetic: Math.max(0, Math.min(1, Number(parsed.aesthetic) || 0)) };
  await cset("imgscore|" + ref, verdict, 30 * DAY);
  return verdict;
}

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch (e) {}

  // ── batch path ──────────────────────────────────────────────────────────
  if (Array.isArray(body.refs)) {
    const refs = [...new Set(body.refs.filter((r) => typeof r === "string" && PHOTO_REF.test(r)))].slice(0, MAX_REFS_PER_BATCH);
    if (!refs.length) return Response.json({ ok: true, scores: {} }, { status: 200 });
    const hits = await cgetMany(refs.map((r) => "imgscore|" + r));
    const scores = {};
    const misses = [];
    for (const r of refs) {
      const h = hits.get("imgscore|" + r);
      if (h && h.v && typeof h.v === "object") scores[r] = h.v; else misses.push(r);
    }
    const key = aiKey();
    if (key && misses.length) {
      const todo = misses.slice(0, MAX_SCORE_PER_BATCH);
      const done = await Promise.all(todo.map((r) => scoreOne(r, key).catch(() => null)));
      todo.forEach((r, i) => { if (done[i]) scores[r] = done[i]; });
    }
    return Response.json({ ok: true, scores, scored: Object.keys(scores).length, asked: refs.length }, { status: 200 });
  }

  // ── single-ref path (unchanged) ─────────────────────────────────────────
  const ref = String(body.ref || "").trim();
  if (!PHOTO_REF.test(ref)) return Response.json({ ok: false }, { status: 200 });

  const ckey = "imgscore|" + ref;
  const hit = await cget(ckey);
  if (hit && hit.v && typeof hit.v === "object") return Response.json({ ok: true, cached: true, ...hit.v }, { status: 200 });

  const key = aiKey();
  if (!key) return Response.json({ ok: false, unavailable: true }, { status: 200 });
  const imageUrl = SITE + "/api/photo?ref=" + encodeURIComponent(ref) + "&w=400";

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5", max_tokens: 40, temperature: 0, system: SYSTEM,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "url", url: imageUrl } },
          { type: "text", text: "Rate this photo." },
        ] }],
      }),
    });
    if (!r.ok) return Response.json({ ok: false }, { status: 200 });
    const d = await r.json();
    const txt = (d && d.content && d.content[0] && d.content[0].text) || "";
    const m = txt.match(/\{[^}]*\}/);
    if (!m) return Response.json({ ok: false }, { status: 200 });
    const parsed = JSON.parse(m[0]);
    const verdict = { people: parsed.people === true, aesthetic: Math.max(0, Math.min(1, Number(parsed.aesthetic) || 0)) };
    await cset(ckey, verdict, 30 * DAY);
    return Response.json({ ok: true, ...verdict }, { status: 200 });
  } catch (e) {
    return Response.json({ ok: false }, { status: 200 });
  }
}
