export const runtime = "nodejs";
import { aiKey } from "../../../lib/aiKey";
import { CURATED } from "../../../lib/curated";

// v6.01 — EVIDENCE-FIRST place blurbs. The card already shows the name, star rating,
// review count, distance, price, and open/closed status, so those are NOT fed to the
// model and MUST NOT be restated. The model writes a line ONLY when it has a real
// place-specific fact (Wayfind's curated funFact, the editorialSummary, or recurring
// review specifics); with nothing concrete to say it OMITS the place, and the card
// falls back to a clean local template instead of situational filler ("sunny Monday
// morning perfection"). Curated places already render a hand-written hook on the card,
// so they're skipped here (client uses the hook; no tokens spent). Fails soft: no key
// or any error returns {} and every card uses its local template.
const _norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
const CUR = new Map(CURATED.map((c) => [_norm(c.name), c]));
function curatedOf(name) {
  const n = _norm(name);
  if (!n) return null;
  if (CUR.has(n)) return CUR.get(n);
  for (const [k, v] of CUR) { if ((k.length >= 6 && n.startsWith(k)) || (n.length >= 8 && k.startsWith(n))) return v; }
  return null;
}

export async function POST(req) {
  try {
    const { places, city } = await req.json();
    const key = aiKey();
    if (!key) return Response.json({ unavailable: true, blurbs: {} }, { status: 200 });
    if (!Array.isArray(places) || !places.length) return Response.json({ blurbs: {} }, { status: 200 });

    // Feed ONLY evidence the card doesn't already show. Deliberately NO rating /
    // reviews / price / distance — the model can't restate what it never sees.
    const list = [];
    for (const p of places.slice(0, 20)) {
      const cur = curatedOf(p.name);
      if (cur && cur.hook) continue; // client renders the curated hook; don't spend tokens
      list.push({
        id: p.id,
        name: p.name,
        type: p.type || "",
        curated_fact: (cur && cur.funFact) || "",
        editorial: p.editorial || "",
        review_signals: Array.isArray(p.reviewText) ? p.reviewText.slice(0, 6) : [],
        features: Array.isArray(p.labels) ? p.labels.slice(0, 4) : [],
      });
    }
    if (!list.length) return Response.json({ blurbs: {} }, { status: 200 });

    const system =
      "You write one-line place recommendations for Wayfind, an independent Gulf Coast discovery app (no ads, ranked on real reviews). " +
      "THE JOB: for each place, tell someone who has never heard of it WHY it is worth their time, in 16 words or fewer, using a concrete place-specific fact. A verdict, not a description. " +
      "THE CARD ALREADY SHOWS the name, star rating, review count, distance, price, and open/closed status. You are NOT given those on purpose. NEVER restate or imply them: no 'closest', 'shortest drive', 'nearby', 'highly rated', 'well reviewed', 'trusted by', no star counts, no review counts, no mile distances. " +
      "GROUND every line in the input, in this order of strength: curated_fact (Wayfind's own hand-checked fact), then review_signals (what people actually praise, restated in your own words, never quoted), then editorial, then type and features. Lead with the hardest concrete fact you have (a named dish, a specific setting, a method, a bit of history), then, only if it adds something, what it means for the visit. " +
      "BANNED, no exceptions: time or weather filler ('perfect for your Monday', 'sunny morning', 'fresh start to the week'); category tautology ('great breakfast spot', 'solid Italian', 'quality coffee'); empty hype (hidden gem, must-try, foodie, iconic, world-class, something for everyone, a variety of, elevate, vibe, unforgettable, nestled, boasts); invented specifics (dollar amounts, wait times, awards, percentages); dashes of any kind (use commas, colons, or periods); and exclamation points. " +
      "REFUSE RATHER THAN PAD: if a place has no concrete place-specific fact in its input (only its type and features), OMIT it entirely from the output. An honest blank (the card then shows a clean template) beats generic filler. " +
      "THE SWAP TEST decides every line: if your sentence could sit word-for-word under a different business of the same type in the same town, it is worthless. Rewrite it or omit the place. " +
      "Return ONLY valid JSON (no markdown): an object mapping place id to its line, INCLUDING ONLY the places you could ground in a real fact. Omit every place you could not.";

    const reqInit = {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 900,
        system,
        messages: [{ role: "user", content: `City: ${city || ""}\nPlaces:\n${JSON.stringify(list)}` }],
      }),
    };

    let r;
    for (let attempt = 0; attempt < 2; attempt++) {
      r = await fetch("https://api.anthropic.com/v1/messages", reqInit);
      if (r.ok) break;
      if (![429, 500, 502, 503, 529].includes(r.status)) break;
      await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
    }
    if (!r || !r.ok) return Response.json({ error: true, blurbs: {} }, { status: 200 });

    const data = await r.json();
    let text = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    text = text.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    let blurbs = {};
    try { blurbs = JSON.parse(text); } catch { blurbs = {}; }
    return Response.json({ blurbs }, { status: 200 });
  } catch (e) {
    return Response.json({ error: true, blurbs: {} }, { status: 200 });
  }
}
