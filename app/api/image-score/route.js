export const runtime = "nodejs";
// /api/image-score — rate a candidate card photo with a vision model so cards
// show the best, most "Instagrammable" shot and NEVER lead with a photo of
// people (owner: no human faces on cards). Returns { people, aesthetic } and
// CACHES the verdict per photo ref for 30 days — each photo is scored at most
// once, ever. METERED Anthropic proxy → MUST stay in middleware.js's matcher.
import { aiKey } from "../../../lib/aiKey";
import { cget, cset, DAY } from "../../../lib/serverCache";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://www.gowayfind.com").replace(/\/+$/, "");
const PHOTO_REF = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

const SYSTEM =
  "You rate a single photo for a travel app's place card. Return ONLY compact JSON, no prose: " +
  '{"people": <true|false>, "aesthetic": <number 0.0-1.0>}. ' +
  "people = true if a person, face, or group is a PROMINENT subject (a tiny distant figure in a landscape is false). " +
  "aesthetic = how appealing/Instagrammable the shot is for a card: composition, light, clarity, and an attractive subject (food, architecture, scenery, interior). A blurry, cluttered, dark, or screenshot-like image scores low.";

export async function POST(req) {
  let body = {};
  try { body = await req.json(); } catch (e) {}
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
