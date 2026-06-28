// Wayfind AI Hook Generator — uses Claude to write provocative, specific,
// data-grounded discovery hooks from real nearby place data.
// Each hook is tied to a real place and includes a themed "detail sheet" body.
export async function POST(req) {
  try {
    const { places, locName, hour, weather, signals } = await req.json();
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key || !places || places.length < 3) return Response.json({ hooks: [] });

    const city = (locName || "your area").split(",")[0];
    const h = Number(hour) || new Date().getHours();
    const timeLabel = h < 11 ? "morning" : h < 15 ? "afternoon" : h < 21 ? "evening" : "late night";
    const weatherLine = weather ? `${weather.temp}°F, ${weather.label}` : "";

    // Separate local (≤15 miles) and far places.
    // City-framed hooks must only reference local places.
    const localPlaces = places.filter((p) => p.distMi == null || p.distMi <= 15);
    const drivePlaces = places.filter((p) => p.distMi != null && p.distMi > 14 && p.distMi <= 50);

    // Build a compact place list for the prompt — real data only, nothing invented
    const placeList = places.slice(0, 20).map((p) =>
      [
        `id:${p.id}`,
        p.name,
        p.rating ? `${p.rating}★` : "",
        p.reviews ? `${p.reviews} reviews` : "",
        p.distMi != null ? `${p.distMi.toFixed(1)} mi` : "",
        p.openNow === true ? "OPEN" : p.openNow === false ? "CLOSED" : "",
        p.price || "",
        p.type || "",
      ].filter(Boolean).join(" | ")
    ).join("\n");

    // Signal summary for personalization
    const likedCats = {};
    const likedBadges = {};
    for (const s of (signals || [])) {
      if (s.action === "like" || s.action === "save") {
        if (s.cat) likedCats[s.cat] = (likedCats[s.cat] || 0) + 1;
        for (const b of (s.badges || [])) likedBadges[b] = (likedBadges[b] || 0) + 1;
      }
    }
    const prefLine = Object.keys(likedCats).length
      ? `User preference signals: likes ${Object.entries(likedCats).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}(${v})`).join(", ")}`
      : "";

    const systemPrompt = `You are Wayfind's editorial voice: sharp, confident, a little provocative, like a local friend who always knows the move. You write short discovery hooks that make people stop scrolling and tap. Rules: every hook leads with a real place name or a real number from the data. Be specific and take a stance. Ban generic filler ("great spot", "check it out", "hidden gem" unless the data earns it). Never fabricate facts, ratings, distances, or claims; use only what the data supports. Vary the emotional angle so no two hooks feel alike. Return only valid JSON, no markdown.`;

    const localList = localPlaces.slice(0, 15).map((p) =>
      [`id:${p.id}`, p.name, p.rating ? `${p.rating}★` : "", p.reviews ? `${p.reviews} reviews` : "", p.distMi != null ? `${p.distMi.toFixed(1)} mi` : "", p.openNow === true ? "OPEN" : p.openNow === false ? "CLOSED" : "", p.price || ""].filter(Boolean).join(" | ")
    ).join("\n");
    const driveList = drivePlaces.slice(0, 5).map((p) =>
      [`id:${p.id}`, p.name, p.rating ? `${p.rating}★` : "", p.distMi != null ? `${p.distMi.toFixed(1)} mi away` : ""].filter(Boolean).join(" | ")
    ).join("\n");

    const userPrompt = `Write 8 hook cards for places near ${city} right now (${timeLabel}${weatherLine ? ", " + weatherLine : ""}).
${prefLine}

LOCAL places in ${city} (≤15 miles) — use for city-specific hooks like "most overrated in ${city}":
${localList || placeList}

FAR places (15+ miles) — ONLY use for "Worth the drive?" hooks:
${driveList || "none"}

Vary the emotional angle across the 8 hooks — use: curiosity, FOMO, controversy, local pride, value, hidden discovery, timing urgency, worth-it validation. Each must reference a real place by name or use its real data points.

Return a JSON array of exactly 8 objects:
[
  {
    "id": "h1",
    "emoji": "one emoji",
    "label": "2-3 word label",
    "hook": "Punchy hook headline, max 12 words, use the real place name or a specific number",
    "detail": "One specific supporting sentence with real data",
    "cta": "3-word CTA →",
    "accent": "#hex (use: gem=#A78BFA, value=#22C55E, skip=#EF4444, drive=#38BDF8, popular=#F472B6, best=#FBBF24, open=#22C55E, itinerary=#F97316)",
    "placeId": "the exact id from the list above",
    "theme": "gem|skip|drive|value|open|popular|best|itinerary|latenight",
    "highlightWord": "one key word or short phrase from the hook text to highlight in the accent color — the most provocative/emotional word (e.g. overrated, waste, hidden, drive, tonight)",
    "themeTitle": "3-5 word punchy sheet title",
    "themeBody": "2 bold sentences. Why this matters. Opinion-forward, specific, makes the reader feel something."
  }
]`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 2500,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    const data = await res.json();
    const raw = (data.content || [])[0]?.text || "";
    // Strip any accidental markdown fences
    const clean = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    let hooks = [];
    try { hooks = JSON.parse(clean); } catch {
      // Try extracting just the array
      const m = clean.match(/\[[\s\S]*\]/);
      if (m) try { hooks = JSON.parse(m[0]); } catch {}
    }

    if (!Array.isArray(hooks)) hooks = [];
    // Validate: keep only hooks with required fields and a real place ID
    const validIds = new Set(places.map((p) => p.id));
    hooks = hooks.filter((h) => h.id && h.hook && h.placeId && validIds.has(h.placeId));

    console.log(`[wayfind hooks] Generated ${hooks.length} for ${city}`);
    return Response.json({ hooks });
  } catch (e) {
    console.error("[wayfind hooks error]", e?.message);
    return Response.json({ hooks: [] });
  }
}
