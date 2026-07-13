export const runtime = "nodejs";
import { aiKey } from "../../../lib/aiKey";

// Generates a grounded "Wayfind AI" take on a single place using Claude Haiku.
// Two modes keep cost down: "compact" runs on open and returns just enough for
// the Good to know summary; "full" runs only when the user expands a place.
// The model is told never to invent prices, hours, waits, or menu items.
export async function POST(req) {
  try {
    const p = await req.json();
    const key = aiKey();
    if (!key) return Response.json({ unavailable: true }, { status: 200 });
    const mode = p.mode === "full" ? "full" : "compact";
    const kind = p.kind === "event" ? "event" : p.kind === "attraction" ? "attraction" : "dining";
    const mustTryDesc = kind === "dining" ? "specific dishes or drinks reviewers repeatedly name" : kind === "event" ? "things reviewers say help when attending an event here (arrival timing, parking, nearby stops)" : "specific things reviewers say not to miss (rides, areas, shows, or signature items)";
    const _dining = kind === "dining";
    const exNouns = _dining ? "the actual dish, the patio, the bartender, the view, the crowd, the wait" : kind === "event" ? "the act, the stage, the crowd, arrival timing, parking, the wait" : "the view, the setting, the exhibit or show, the walk, the crowd, the wait";
    const exSkip = _dining ? "you want quiet or upscale food" : "you want something indoors, quiet, or a sit-down meal instead";
    const exSig = _dining ? "dish" : "thing";

    const facts = [
      `Name: ${p.name}`,
      ...(kind === "event" ? ["Context: the user is viewing this venue for an UPCOMING EVENT. Never mention the venue being currently closed or its regular hours; frame the tip and any caution for someone attending the event (arrival, parking, what to know)."] : []),
      `Type: ${p.type || "unknown"}`,
      `Area: ${p.city || "unknown"}`,
      `Rating: ${p.rating || "n/a"} from ${p.reviewCount || 0} reviews`,
      `Price level: ${p.price || "unknown"}`,
      `Currently: ${p.openNow == null ? "unknown" : p.openNow ? "open" : "closed"}`,
      `Browsing category: ${p.category || ""} ${p.sub && p.sub !== "all" ? "/ " + p.sub : ""}`,
    ];
    if (p.editorial) facts.push(`Google description: ${p.editorial}`);
    if (Array.isArray(p.attributes) && p.attributes.length) facts.push(`Known features: ${p.attributes.join(", ")}`);
    if (Array.isArray(p.reviews) && p.reviews.length) {
      facts.push("Recent visitor reviews:");
      p.reviews.forEach((rv, i) => facts.push(`Review ${i + 1}: ${rv}`));
    }
    const factsText = facts.join("\n");
    const hasReviews = Array.isArray(p.reviews) && p.reviews.length > 0;

    const guard =
      "Never invent prices in dollars, wait times, menu item percentages, hours, or comparisons to other named places; if a detail is not supported by the facts, omit it or use an empty value. ";
    const voice =
      "You are a sharp local insider writing for Wayfind. Be specific to THIS place and genuinely useful for deciding whether to go. " +
      "Every line must say something that could NOT be copied onto just any place, for example " + exNouns + ". " +
      "No generic filler, no marketing adjectives, no restating the star rating. If the facts do not support a specific, useful point, leave that field empty rather than padding it. ";

    let system;
    let maxTokens;
    if (mode === "full") {
      maxTokens = 700;
      system =
        voice +
        (hasReviews ? "Base every point on what the real visitor reviews actually say. " : "Using ONLY the facts provided, be specific and concrete. ") +
        guard +
        "Return ONLY valid JSON (no markdown, no code fences) with these keys: " +
        "goodFor (array of up to 4 specific occasions or people this genuinely suits, drawn from what reviews describe, e.g. 'solo lunch at the bar' or 'big celebrations'; empty array if unclear), " +
        (hasReviews ? "loves (array of up to 4 specific things reviewers single out, in concrete terms; empty array if unclear), " : "loves (empty array), ") +
        (hasReviews ? "cautions (array of up to 3 honest, specific things that would change someone's decision, e.g. long weekend waits, cash only, loud, slow service, ONLY if reviewers mention them; empty array if none), " : "cautions (empty array), ") +
        (hasReviews ? "mustTry (a JSON array of up to 3 " + mustTryDesc + ", most praised first; empty array if none clearly stand out), " : "mustTry (empty array), ") +
        (hasReviews ? "pairing (one short phrase on what goes well together if reviews suggest it, e.g. 'the brisket with a cold cider'; empty string if none), " : "pairing (empty string), ") +
        (hasReviews ? "tips (array of up to 4 concrete insider moves a regular would share, like when to arrive, where to sit, what to order, parking, grounded in the reviews; empty array if none), " : "tips (empty array), ") +
        (hasReviews ? "keywords (array of 3 to 5 short lowercase words reviewers most commonly use; empty array if unclear), " : "keywords (empty array), ") +
        "vibe (2 to 4 words that capture the actual atmosphere).";
    } else {
      maxTokens = 900;
      system =
        voice +
        (hasReviews ? "Base every point on what the real visitor reviews actually say. " : "Using ONLY the facts provided, be specific and concrete. ") +
        guard +
        "Return ONLY valid JSON (no markdown, no code fences) with these keys: " +
        "verdict (one specific, decision-useful sentence naming the single best reason to go that is particular to THIS place, not generic praise; attribute taste or service claims to reviewers, e.g. reviewers rave about the ceviche, while staying decisive), " +
        "oneWord (exactly ONE word capturing the overall sentiment, e.g. 'Lively', 'Cozy', 'Reliable'), " +
        "bestTime (short specific phrase for when to go if reviews indicate it, e.g. 'Weekday evenings, before 7'; empty string if unclear), " +
        "bestFor (array of up to 4 short audience or occasion labels this genuinely suits, e.g. 'Families', 'Date night', 'Solo work', grounded in what reviews describe; empty array if unclear), " +
        "goWhen (short phrase for the best time or use case to go, e.g. 'Before 6 PM', 'Weekday lunch'; empty string if unclear), " +
        (hasReviews ? "skipIf (one honest tradeoff naming who should skip it or when not to go, e.g. '" + exSkip + "', grounded in reviews; empty string if unclear), " : "skipIf (empty string), ") +
        (hasReviews ? "whyPicked (one concrete sentence of evidence for why this is a solid pick, drawn from what reviewers emphasize, not generic praise; empty string if unclear), " : "whyPicked (empty string), ") +
        (hasReviews ? "why (one flowing paragraph of 5 to 8 real sentences that truly makes the case: open with what this place IS in one vivid line, then why it earned the pick right now, the specific things reviewers praise by name, the signature move or " + exSig + " not to miss, who it is best for and when to go, when to skip it, and one honest caveat such as price, wait, park admission or a drive; grounded ONLY in the provided reviews and facts, written with the confidence of a sharp local friend, never bullet fragments, never generic praise; empty string if the evidence is thin), " : "why (empty string), ") +
        (hasReviews ? "caution (ONE specific honest thing to know or common complaint that would change a decision; empty string if none stands out), " : "caution (empty string), ") +
        (hasReviews ? "tip (ONE concrete insider tip a regular would actually give; empty string if none)." : "tip (empty string).");
    }

    const reqInit = {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: maxTokens, temperature: 0.35, system, messages: [{ role: "user", content: factsText }] }),
    };

    let r;
    for (let attempt = 0; attempt < 3; attempt++) {
      r = await fetch("https://api.anthropic.com/v1/messages", reqInit);
      if (r.ok) break;
      if (![429, 500, 502, 503, 529].includes(r.status)) break;
      await new Promise((res) => setTimeout(res, 400 * (attempt + 1)));
    }
    if (!r || !r.ok) return Response.json({ error: true }, { status: 200 });

    const data = await r.json();
    let text = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    text = text.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = mode === "full" ? { error: true } : { verdict: text.slice(0, 200) }; }
    // v5.75 (accuracy): geographic-claim guard. The model was asserting things
    // like "waterfront location … sunset waterfront views" for The Oar & Iron —
    // an inland bar/grill — with ZERO grounding (empty reviews/editorial). Strip
    // any water/waterfront/view-over-water claim UNLESS the provided facts
    // (editorial + real review text) actually contain that evidence. Belt-and-
    // suspenders on top of the prompt's honesty rule, which silently failed.
    parsed = scrubUngroundedGeo(parsed, factsText);
    return Response.json(parsed, { status: 200 });
  } catch (e) {
    return Response.json({ error: true }, { status: 200 });
  }
}

// v5.75 (accuracy): remove water/waterfront/water-view claims from model output
// when the input facts don't support them. A "claim" is any sentence (in a
// string field) or any array item asserting proximity to / a view of water. If
// the facts (editorial + reviews) genuinely mention water, we trust the model
// and leave it alone — this only fires on ungrounded invention.
const WATER_CLAIM_RX = /(waterfront|water[\s-]?view|water[\s-]?views|on the water|by the water|near the water|steps from the water|beachfront|ocean[\s-]?front|ocean view|gulf[\s-]?front|gulf view|bay[\s-]?front|bay view|river[\s-]?front|river view|dockside|harbor view|overlooking the (?:water|bay|gulf|river|ocean)|views? of the (?:water|bay|gulf|ocean)|sunset over the (?:water|bay|gulf))/i;
const WATER_FACT_RX = /(waterfront|water view|on the water|beachfront|ocean|gulf|\briver\b|\bbay\b|harbor|marina|\bdock|lagoon|lakefront|riverwalk|\bpier\b|intracoastal|canal)/i;

function scrubUngroundedGeo(obj, factsText) {
  try {
    if (!obj || typeof obj !== "object") return obj;
    // Grounded? Then the model has real evidence — don't touch it.
    if (WATER_FACT_RX.test(String(factsText || ""))) return obj;
    const cleanStr = (s) => {
      if (typeof s !== "string" || !s) return s;
      if (!WATER_CLAIM_RX.test(s)) return s;
      // Drop only the offending sentence(s), keep the rest of the field.
      const kept = s.split(/(?<=[.!?])\s+/).filter((sent) => !WATER_CLAIM_RX.test(sent));
      return kept.join(" ").replace(/\s+/g, " ").trim();
    };
    const walk = (v) => {
      if (typeof v === "string") return cleanStr(v);
      if (Array.isArray(v)) return v.map(walk).filter((x) => !(typeof x === "string" && x === ""));
      if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v)) o[k] = walk(v[k]); return o; }
      return v;
    };
    return walk(obj);
  } catch (e) { return obj; }
}
