export const runtime = "nodejs";
import { aiKey } from "../../../lib/aiKey";
import { CURATED } from "../../../lib/curated";
import { cget, cset, DAY } from "../../../lib/serverCache";
import { validateCardSummary } from "../../../lib/editorialValidator";

// v6.87 — CARD_SUMMARY contract. The card already shows the name, star rating,
// review count, rank, score, distance, price, and open/closed status, so those
// are NOT fed to the model and MUST NOT be restated. Anthropic writes the copy;
// validateCardSummary (lib/editorialValidator.js) is the editor-in-chief — it
// enforces the two-sentence "Known for / Best for" shape, rejects generic
// ranking language and fragments, and rejects any line that leaks card data.
// A place that fails validation, or that the model had nothing concrete to say
// about, is OMITTED — the card then renders NOTHING in that slot rather than a
// generic fallback line. Good evidence -> sharp copy. Weak evidence -> nothing.
// Curated places already render a hand-written hook on the card, so they're
// skipped here (client uses the hook; no tokens spent). Fails soft: no key or
// any error returns {} and every card hides the block.
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
    // v6.63 — cacheOnly is the RENDER-PATH contract. The shared 30-day pool
    // meant a WARM area cost nothing, but a COLD one generated while the user
    // waited: an LLM call sitting in front of a page view. Callers that render
    // (IntentPageClient) pass cacheOnly:true and receive only what the pool
    // already holds, plus a `pending` count so a warmer can be scheduled.
    // Callers allowed to spend (cron, an explicit warm) omit it and behave
    // exactly as before.
    const { places, city, cacheOnly } = await req.json();
    const key = aiKey();
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

    // v6.55 shared cache: every user's generation feeds ONE pool (same
    // wf_places_cache table the search/events routes use). A summary is
    // written once per place per 30 days for the WHOLE site instead of once
    // per device. A model OMISSION is cached too ('' for 3 days) — an honest
    // blank must not re-bill Anthropic on every fresh device that scrolls
    // past it. Cache namespace is "cardsum1|" (was "blurb1|") — the shape
    // changed from a single string to the {card_line_1, card_line_2}
    // contract, so the old pool must not be read as if it were the new one.
    const cachedBlurbs = {};
    const need = [];
    for (const p of list) {
      const hit = await cget("cardsum1|" + p.id);
      if (hit && hit.v && typeof hit.v === "object") { if (hit.v.card_line_1) cachedBlurbs[p.id] = hit.v; continue; }
      if (hit && hit.v === "") continue; // cached omission
      need.push(p);
    }
    if (!need.length) return Response.json({ blurbs: cachedBlurbs, cached: true }, { status: 200 });
    // RENDER PATH STOPS HERE. Everything below this line can call the model, so
    // a caller that renders must never reach it. `pending` reports how many
    // places the pool is missing, so a warm job can be scheduled off it without
    // the user paying the latency.
    if (cacheOnly) return Response.json({ blurbs: cachedBlurbs, cached: true, pending: need.length }, { status: 200 });
    // No key: the shared pool still serves what it has (no invention, no spend).
    if (!key) return Response.json({ unavailable: true, blurbs: cachedBlurbs }, { status: 200 });

    const system =
      "You write CARD_SUMMARY copy for Wayfind, an independent Gulf Coast discovery app (no ads, ranked on real reviews). " +
      "THE JOB: for each place, help someone understand it in two seconds. Exactly two lines per place: " +
      "card_line_1 starts with 'Known for' and names what the business is SPECIFICALLY known for (a named dish, a signature product, a setting, a method). " +
      "card_line_2 starts with 'Best for' and names who it's best for, or the best occasion/time to visit. " +
      "Each line is exactly ONE sentence. The two lines together must be 190 characters or fewer, ideally under 145. " +
      "THE CARD ALREADY SHOWS the name, star rating, review count, rank, score, distance, price, and open/closed status. You are NOT given those on purpose. NEVER restate or imply any of them, and never repeat the business name. " +
      "GROUND every line in the input, in this order of strength: curated_fact (Wayfind's own hand-checked fact), then review_signals (what people actually praise, restated in your own words, never quoted), then editorial, then type and features. " +
      "BANNED, no exceptions: 'and it holds up', 'worth a look', 'a solid choice', 'one of the better-reviewed spots', 'our #1 pick', 'locals love it'; time or weather filler ('perfect for your Monday'); category tautology ('great breakfast spot', 'solid Italian'); empty hype (hidden gem, must-try, foodie, iconic, world-class, something for everyone, a variety of, elevate, vibe, unforgettable, nestled, boasts); invented specifics (dollar amounts, wait times, awards, percentages); dashes of any kind (use commas or periods); and exclamation points. " +
      "REFUSE RATHER THAN PAD: if a place has no concrete place-specific fact in its input, OMIT it entirely from the output. An honest blank (the card then hides this block) beats generic filler. " +
      "THE SWAP TEST decides every line: if a sentence could sit word-for-word under a different business of the same type in the same town, it is worthless. Rewrite it or omit the place. " +
      "Return ONLY valid JSON (no markdown): an object mapping place id to { \"card_line_1\": \"Known for ...\", \"card_line_2\": \"Best for ...\" }, INCLUDING ONLY the places you could ground in a real fact. Omit every place you could not.";

    const reqInit = {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1200,
        system,
        messages: [{ role: "user", content: `City: ${city || ""}\nPlaces:\n${JSON.stringify(need)}` }],
      }),
    };

    let r;
    for (let attempt = 0; attempt < 2; attempt++) {
      r = await fetch("https://api.anthropic.com/v1/messages", reqInit);
      if (r.ok) break;
      if (![429, 500, 502, 503, 529].includes(r.status)) break;
      await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
    }
    if (!r || !r.ok) return Response.json({ error: true, blurbs: cachedBlurbs }, { status: 200 });

    const data = await r.json();
    let text = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    text = text.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    let raw = {};
    try { raw = JSON.parse(text); } catch { raw = {}; }

    // The model is the writer; validateCardSummary is the editor-in-chief.
    // Anything that fails validation is dropped, not repaired — a repaired
    // line is a second, unvalidated line in disguise.
    const byId = new Map(need.map((p) => [p.id, p]));
    const blurbs = {};
    for (const p of need) {
      const candidate = raw[p.id];
      const verdict = validateCardSummary(candidate, byId.get(p.id));
      if (verdict.ok) blurbs[p.id] = { card_line_1: verdict.card_line_1, card_line_2: verdict.card_line_2 };
    }

    // Feed the shared pool: validated summaries for 30 days, honest
    // omissions (including validator rejections) for 3.
    try {
      for (const p of need) {
        const v = blurbs[p.id] || "";
        await cset("cardsum1|" + p.id, v, v ? 30 * DAY : 3 * DAY);
      }
    } catch (e) {}
    return Response.json({ blurbs: { ...cachedBlurbs, ...blurbs } }, { status: 200 });
  } catch (e) {
    return Response.json({ error: true, blurbs: {} }, { status: 200 });
  }
}
