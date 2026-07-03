export const runtime = "nodejs";

// Generates a grounded "Wayfind AI" take on a single place using Claude Haiku.
// Two modes keep cost down: "compact" runs on open and returns just enough for
// the Good to know summary; "full" runs only when the user expands a place.
// The model is told never to invent prices, hours, waits, or menu items.
export async function POST(req) {
  try {
    const p = await req.json();
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return Response.json({ unavailable: true }, { status: 200 });
    const mode = p.mode === "full" ? "full" : "compact";

    const facts = [
      `Name: ${p.name}`,
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
      "Every line must say something that could NOT be copied onto just any place: name the actual dish, the patio, the bartender, the view, the crowd, the wait. " +
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
        (hasReviews ? "mustTry (a JSON array of up to 3 specific dishes or drinks reviewers repeatedly name, most praised first; empty array if none clearly stand out), " : "mustTry (empty array), ") +
        (hasReviews ? "tips (array of up to 4 concrete insider moves a regular would share, like when to arrive, where to sit, what to order, parking, grounded in the reviews; empty array if none), " : "tips (empty array), ") +
        (hasReviews ? "keywords (array of 3 to 5 short lowercase words reviewers most commonly use; empty array if unclear), " : "keywords (empty array), ") +
        "vibe (2 to 4 words that capture the actual atmosphere).";
    } else {
      maxTokens = 280;
      system =
        voice +
        (hasReviews ? "Base every point on what the real visitor reviews actually say. " : "Using ONLY the facts provided, be specific and concrete. ") +
        guard +
        "Return ONLY valid JSON (no markdown, no code fences) with these keys: " +
        "verdict (one specific, decision-useful sentence naming the single best reason to go that is particular to THIS place, not generic praise), " +
        "oneWord (exactly ONE word capturing the overall sentiment, e.g. 'Lively', 'Cozy', 'Reliable'), " +
        "bestTime (short specific phrase for when to go if reviews indicate it, e.g. 'Weekday evenings, before 7'; empty string if unclear), " +
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
    return Response.json(parsed, { status: 200 });
  } catch (e) {
    return Response.json({ error: true }, { status: 200 });
  }
}
