export const runtime = "nodejs";
import { aiKey } from "../../../lib/aiKey";
import { cget, cset, DAY } from "../../../lib/serverCache";
import { validateWhyParagraph, filterSupportedItems, containsBannedPhrase, repeatsCardFacts, repeatsPlaceName } from "../../../lib/editorialValidator";

// v6.9x (owner, editorial-quality audit 2026-08-01) — this route used to ask
// for an 18-field grab-bag (verdict/oneWord/bestTime/bestFor/goWhen/skipIf/
// whyPicked/caution/tip in compact; goodFor/loves/cautions/tips/keywords/vibe
// alongside mustTry/pairing in full), and PR #548 only ever validated 3 of
// those 18 fields (why, mustTry, pairing) — the other 15 rendered straight to
// the page unchecked, across THREE separate UI blocks, with mustTry itself
// rendered twice. That's why the detail page still read like an AI dump after
// the CARD_SUMMARY work: DETAIL_EDITORIAL as a contract never actually
// shipped here. It ships now — exactly the shape the owner asked for:
//   compact -> { why_wayfind_picked_this }
//   full    -> { what_to_order: [], pairs_well, caveat }
// Nothing else. Every field that ships passes through the validator; nothing
// rides along unchecked.
export async function POST(req) {
  let stored = null;
  try {
    const p = await req.json();
    const mode = p.mode === "full" ? "full" : "compact";
    const kind = p.kind === "event" ? "event" : p.kind === "attraction" ? "attraction" : "dining";
    // v6.55 shared pool (same wf_places_cache table as blurbs/search/events):
    // one generation per place+mode+kind sitewide. No place id in this payload,
    // so identity = normalized name+city. Events get a short TTL (their
    // arrival/parking guidance rots fastest); places get 14 days.
    // Namespace bumped insight1| -> insight2|: the shape changed (18 loose
    // fields -> the 4-field DETAIL_EDITORIAL contract), so the old pool must
    // not be read as if it were the new one — same reasoning as CARD_SUMMARY's
    // blurb1| -> cardsum1| move in PR #548.
    const ckey = "insight2|" + String(p.name || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim() + "|" + String(p.city || "").toLowerCase().slice(0, 30) + "|" + mode + "|" + kind;
    // Editorial is an owned Wayfind asset, not disposable response-cache data.
    // Keep expired rows readable as a fallback and refresh only after 21 days.
    // A provider outage or rejected rewrite can therefore never erase good copy.
    stored = p.name ? await cget(ckey, { staleMs: 10 * 365 * DAY }) : null;
    if (stored && !stored.stale && stored.v && typeof stored.v === "object") {
      return Response.json({ ...stored.v, cached: true }, { status: 200 });
    }
    const key = aiKey();
    if (!key) return Response.json(stored?.v && typeof stored.v === "object" ? { ...stored.v, cached: true, stale: true } : { unavailable: true }, { status: 200 });
    // v6.9x — one universal field name, `what_to_order`, across all three
    // kinds (matches lib/editorialValidator.js's validateDetailEditorial
    // contract exactly, and keeps Detail.js from needing a kind-conditional
    // field lookup). itemDesc is what actually varies by kind — the
    // description told to the model of what belongs in that array.
    const itemDesc = kind === "dining" ? "specific dishes or drinks reviewers single out as SIGNATURE — exceptional, memorable, or worth going back for, never just what gets mentioned most" : kind === "event" ? "specific things reviewers say help when attending this event (arrival timing, parking, nearby stops), the most useful first" : "specific things reviewers say not to miss (rides, areas, shows, or signature items), the most distinctive first";
    const _dining = kind === "dining";
    const exNouns = _dining ? "the actual dish, the patio, the bartender, the view, the crowd, the wait" : kind === "event" ? "the act, the stage, the crowd, arrival timing, parking, the wait" : "the view, the setting, the exhibit or show, the walk, the crowd, the wait";
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
      "Never invent prices in dollars, wait times, menu item percentages, hours, or comparisons to other named places; if a detail is not supported by the facts, omit it or use an empty value. " +
      "Never name an individual staff member, server, bartender, host, manager, or employee, even if a review names them — describe the service in general terms instead ('friendly, attentive service') without the person's name. " +
      "Never write like a reviewer digest — no 'one reviewer said...', 'another visitor noted...', or any other attribution to an individual reviewer; report the PATTERN across all the evidence with the confidence of a sharp local friend who has read everything and is telling you what actually matters, not summarizing each review in turn. ";
    const voice =
      "You are a sharp local insider writing for Wayfind. Be specific to THIS place and genuinely useful for deciding whether to go. " +
      "Every line must say something that could NOT be copied onto just any place, for example " + exNouns + ". " +
      "No generic filler, no marketing adjectives, no restating the star rating. If the facts do not support a specific, useful point, leave that field empty rather than padding it. ";

    // v6.9x (owner, editorial-quality audit 2026-08-01) — DETAIL_EDITORIAL,
    // for real this time. compact asks for exactly one field (the paragraph
    // that used to be buried as one of ten); full asks for exactly three.
    // Nothing else rides along. Every field that ships passes through
    // lib/editorialValidator.js before caching.
    let system;
    let maxTokens;
    if (mode === "full") {
      maxTokens = 500;
      system =
        voice +
        (hasReviews ? "Base every point on what the real visitor reviews actually say. " : "Using ONLY the facts provided, be specific and concrete. ") +
        guard +
        "Return ONLY valid JSON (no markdown, no code fences) with exactly these keys: " +
        (hasReviews
          ? "what_to_order (a JSON array of 3 to 5 " + itemDesc + "; rank by how memorable or exceptional reviewers say it is, NOT by how often it is simply mentioned — a dish two reviewers call unforgettable outranks one mentioned five times in passing with no real reaction; ONLY items a review actually names, never invented; empty array if fewer than 3 clearly stand out), "
          : "what_to_order (empty array), ") +
        (hasReviews
          ? "pairs_well (one short, specific phrase on what genuinely goes well together if the reviews suggest a real combination, e.g. 'the brisket with a cold cider'; empty string if nothing specific stands out), "
          : "pairs_well (empty string), ") +
        (hasReviews
          ? "caveat (ONE honest, specific thing to know before going that would change someone's decision — a real wait, cash only, loud at peak times, limited parking — ONLY if reviewers actually say it; empty string if nothing stands out)."
          : "caveat (empty string).");
    } else {
      maxTokens = 400;
      system =
        voice +
        (hasReviews ? "Base every point on what the real visitor reviews actually say. " : "Using ONLY the facts provided, be specific and concrete. ") +
        guard +
        "Return ONLY valid JSON (no markdown, no code fences) with exactly this key: " +
        (hasReviews
          ? "why_wayfind_picked_this (ONE tight paragraph, 90 to 150 words: open with what this place genuinely IS in a specific, non-generic way; name the signature " + exSig + " or experience it is actually known for; say who it is genuinely best for; close with one honest caveat — price, wait, a drive, limited hours — ONLY if the evidence supports one. Grounded ONLY in the facts and reviews provided, written with the confidence of a sharp local friend reporting the pattern across everything they read, not a list of individual reviews. No bullet fragments, no generic praise, no restating the rating, review count, price symbols, or open/closed status. Empty string if the evidence is too thin to support a genuine, specific recommendation.)"
          : "why_wayfind_picked_this (empty string — there is not enough evidence yet to write a grounded recommendation).");
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
    if (!r || !r.ok) return Response.json(stored?.v && typeof stored.v === "object" ? { ...stored.v, cached: true, stale: true } : { error: true }, { status: 200 });

    const data = await r.json();
    let text = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    text = text.replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = { error: true }; }
    // v5.75 (accuracy): geographic-claim guard. The model was asserting things
    // like "waterfront location … sunset waterfront views" for The Oar & Iron —
    // an inland bar/grill — with ZERO grounding (empty reviews/editorial). Strip
    // any water/waterfront/view-over-water claim UNLESS the provided facts
    // (editorial + real review text) actually contain that evidence. Belt-and-
    // suspenders on top of the prompt's honesty rule, which silently failed.
    parsed = scrubUngroundedGeo(parsed, factsText);

    // Editor-in-chief pass. Anthropic wrote it; this is the gate before it's
    // cached or served. Weak/invalid content is dropped, never repaired —
    // the render side already treats an empty field as "omit the block", so
    // dropping here is enough to keep the rule good evidence -> sharp copy,
    // weak evidence -> nothing.
    if (parsed && !parsed.error && !parsed.unavailable) {
      if (mode === "compact") {
        const whyVerdict = validateWhyParagraph(parsed.why_wayfind_picked_this, { name: p.name });
        parsed.why_wayfind_picked_this = whyVerdict.ok ? whyVerdict.text : "";
      }
      if (mode === "full") {
        parsed.what_to_order = filterSupportedItems(parsed.what_to_order, factsText, 5);
        // pairs_well / caveat are short phrases, not full sentences ("the
        // brisket with a cold cider" is valid) — same shape of check
        // validateDetailEditorial applies to these two fields.
        let pairsWell = String(parsed.pairs_well || "").trim();
        parsed.pairs_well = pairsWell && pairsWell.split(/\s+/).length >= 2 && !containsBannedPhrase(pairsWell) && !repeatsCardFacts(pairsWell) && !repeatsPlaceName(pairsWell, p.name) ? pairsWell : "";
        let caveat = String(parsed.caveat || "").trim();
        parsed.caveat = caveat && caveat.split(/\s+/).length >= 2 && !containsBannedPhrase(caveat) && !repeatsCardFacts(caveat) ? caveat : "";
      }
    }

    const useful = mode === "compact"
      ? !!String(parsed?.why_wayfind_picked_this || "").trim()
      : !!(parsed && ((Array.isArray(parsed.what_to_order) && parsed.what_to_order.length) || String(parsed.pairs_well || "").trim() || String(parsed.caveat || "").trim()));
    if (!useful && stored?.v && typeof stored.v === "object") {
      return Response.json({ ...stored.v, cached: true, stale: true }, { status: 200 });
    }
    try { if (p.name && useful && !parsed.error && !parsed.unavailable) await cset(ckey, parsed, 21 * DAY); } catch (e) {}
    return Response.json(parsed, { status: 200 });
  } catch (e) {
    return Response.json(stored?.v && typeof stored.v === "object" ? { ...stored.v, cached: true, stale: true } : { error: true }, { status: 200 });
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
