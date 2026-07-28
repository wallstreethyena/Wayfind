// app/api/cron/atlas-build/route.js — bulk-builds the Wayfind "Atlas" editorial
// (atlas-590-v1) for places that don't have one yet. Sources facts from the
// Google Places Details API, writes each entry with Claude, and upserts to
// wf_editorial ON CONFLICT (place_id) DO NOTHING — idempotent + resumable, so the
// owner just re-triggers it until a category reads 0 missing.
//
// Cost: metered (Google Places Details + Anthropic per place). CRON_SECRET-gated
// (fail-closed). Bounded per call (?limit, ≤25) so each invocation is cheap and
// safe to loop. Never fabricates: every facts[].claim cites a real source; if a
// place can't be sourced it's stored issues=['PENDING SOURCE'] with empty facts.
// Ride-level rows (individual rides inside a park) are stored as RIDE-LEVEL, not
// written. NOTE: model is claude-haiku-4-5 by default (cheap/fast over ~2k rows);
// set ATLAS_MODEL=claude-sonnet-5 in the env for higher editorial quality.
//
// v2 — sourced + verified. Two changes, both measured on an 8-place Orlando batch:
//   1. We fetch the official site's homepage and hand the model its TEXT, not just
//      a link. Places Details alone is ten shallow fields; the page is where the
//      admission gotcha, the tour name and the current exhibit actually live.
//   2. Every card goes through lib/atlasVerify before it is written. A card whose
//      numbers or proper nouns don't appear literally in the sources is stored
//      issues=['FAILED VERIFICATION'] instead of published. This is what stops the
//      invented founding date (three seen across two runs) reaching a row.
import { aiKey } from "../../../../lib/aiKey";
import { sbEnv } from "../../../../lib/serverCache";
import { pageText, verifyAtlasEditorial } from "../../../../lib/atlasVerify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CATS = ["attractions", "nightlife", "hotels", "food"]; // owner's order
const METROS = ["tampa", "orlando", "manatee-sarasota"];
const MODEL = () => (process.env.ATLAS_MODEL || "claude-haiku-4-5").trim();
const GKEY = () => (process.env.GOOGLE_MAPS_SERVER_KEY || "").trim();
const PLACE_FIELDS = "id,displayName,formattedAddress,rating,userRatingCount,websiteUri,regularOpeningHours,editorialSummary,types,priceLevel,googleMapsUri";

// Individual rides inside a park — the spec says skip these (merge into parent).
const RIDE_RX = /soarin|river adventure|roller ?coaster|\bcoaster\b|log flume|water ?slide|drop tower|\bthe ride\b|flight of|expedition everest|space mountain|tower of terror|rock ?n ?roller|mako|kraken|montu|cheetah hunt|cobra's curse|sheikra/i;

const SYSTEM =
  "You write the Wayfind \"Atlas\" editorial for ONE place, to the atlas-590-v1 standard. " +
  "Voice: specific, honest, a little wry, second person, no marketing fluff — give an OPINION, not a description. " +
  "Return ONLY compact JSON, no prose, no code fence: " +
  '{"hook":"one punchy concrete sentence — the single most distinctive thing",' +
  '"why_here":"2-4 sentences on what actually makes it worth it, honest about who it is for",' +
  '"know_before":"logistics: location, hours/closures, tickets/requirements",' +
  '"best_time":"a specific, reasoned time to go",' +
  '"local_tip":"one insider move",' +
  '"facts":[{"claim":"...","source":"https://..."}]}. ' +
  "Every facts[].claim MUST cite a REAL source URL — the official website you are given, or the place’s Google Maps URL. " +
  "NEVER invent a fact, a source, a price, or hours you were not given. " +
  "When official_page_text is present, prefer it: it is the venue's own words. " +
  "Every number (price, year, time, count) and every proper name you write MUST appear literally in the context you were given — " +
  "if a founding date is not there, do not state one. Omit rather than guess; an omitted detail is correct, an invented one is not. " +
  "Ignore hygiene, cookie, privacy and accessibility boilerplate — it is not editorial. " +
  'If you cannot source anything concrete about THIS specific place, return exactly {"pending":true}.';

async function placeDetails(placeId, key, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      signal: ctrl.signal,
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": PLACE_FIELDS },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Fetch the official homepage so the model writes from the venue's own words.
// Fail-soft and tightly bounded: this runs inside a 60s function alongside the
// Places call and the model call, so one slow site must never sink the batch.
// On failure we fall through to Places-only — exactly the v1 behaviour.
async function officialPage(url, timeoutMs = 5000) {
  if (!/^https?:\/\//i.test(String(url || ""))) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal, redirect: "follow", cache: "no-store",
      headers: { "user-agent": "Mozilla/5.0 (compatible; WayfindEditorial/1.0; +https://gowayfind.com)" },
    });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "";
    if (!/text\/html|text\/plain/i.test(ct)) return null;
    const text = pageText(await r.text());
    return text.length > 200 ? { url, text } : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Everything the model was shown, as one string — the corpus the verifier checks
// each number and proper noun against. Google's own fields count as sources.
function corpusOf(ctx, sources) {
  return [
    ctx.name, ctx.address, ctx.google_summary,
    Array.isArray(ctx.hours) ? ctx.hours.join(" ") : "",
    ctx.rating != null ? `rated ${ctx.rating} from ${ctx.reviews} reviews` : "",
    ...(sources || []).map((s) => s.text),
  ].filter(Boolean).join(" ");
}

async function writeEditorial(place, d, key, sources, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const ctx = {
    name: place.name,
    category: place.category,
    address: d.formattedAddress || null,
    website: d.websiteUri || null,
    google_maps_url: d.googleMapsUri || null,
    rating: typeof d.rating === "number" ? d.rating : null,
    reviews: typeof d.userRatingCount === "number" ? d.userRatingCount : null,
    hours: (d.regularOpeningHours && d.regularOpeningHours.weekdayDescriptions) || null,
    google_summary: (d.editorialSummary && d.editorialSummary.text) || null,
    types: Array.isArray(d.types) ? d.types.slice(0, 8) : null,
    price_level: d.priceLevel || null,
    official_page_text: (sources || []).map((s) => `--- ${s.url}\n${s.text}`).join("\n\n") || null,
  };
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL(), max_tokens: 700, temperature: 0.4, system: SYSTEM,
        messages: [{ role: "user", content: "Write the atlas-590-v1 editorial for this place. Source every claim from the website or Google Maps URL provided; invent nothing.\n\n" + JSON.stringify(ctx) }],
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const txt = (j && j.content && j.content[0] && j.content[0].text) || "";
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return null;
    return JSON.parse(m[0]);
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function pool(items, limit, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, async () => {
    while (i < items.length) { const j = i++; out[j] = await fn(items[j], j); }
  }));
  return out;
}

function editorialRow(place, parsed, nowIso, issues) {
  const facts = parsed && Array.isArray(parsed.facts)
    ? parsed.facts.filter((f) => f && f.claim && typeof f.source === "string" && /^https?:\/\//.test(f.source)).slice(0, 6)
    : [];
  return {
    place_id: place.place_id,
    hook: (parsed && parsed.hook) || null,
    why_here: (parsed && parsed.why_here) || null,
    know_before: (parsed && parsed.know_before) || null,
    best_time: (parsed && parsed.best_time) || null,
    local_tip: (parsed && parsed.local_tip) || null,
    facts,
    verified: false,
    issues: issues || null,
    standard_version: "atlas-590-v1",
    written_at: nowIso,
  };
}

export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const url = new URL(req.url);
  const auth = req.headers.get("authorization") || "";
  if (!secret || (auth !== "Bearer " + secret && url.searchParams.get("key") !== secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const s = sbEnv();
  const gkey = GKEY();
  const akey = aiKey();
  if (!s) return Response.json({ ok: false, error: "no supabase service env" }, { status: 200 });
  if (!gkey || !akey) return Response.json({ ok: false, error: "missing GOOGLE_MAPS_SERVER_KEY or ANTHROPIC key" }, { status: 200 });
  const svcH = { apikey: s.key, Authorization: `Bearer ${s.key}`, "Content-Type": "application/json" };

  const limit = Math.max(1, Math.min(parseInt(url.searchParams.get("limit") || "10", 10) || 10, 25));
  const reqCat = (url.searchParams.get("category") || "").trim();

  // Pick the category to work: the requested one, else the first (in owner order)
  // that still has missing rows.
  async function missing(cat) {
    try {
      const r = await fetch(`${s.url}/rest/v1/rpc/wf_atlas_missing`, {
        method: "POST", headers: svcH, cache: "no-store",
        body: JSON.stringify({ p_category: cat, p_metros: METROS, p_limit: limit }),
      });
      return r.ok ? await r.json() : [];
    } catch (e) { return []; }
  }

  let category = reqCat, places = [];
  if (category) {
    places = await missing(category);
  } else {
    for (const c of CATS) { const rows = await missing(c); if (Array.isArray(rows) && rows.length) { category = c; places = rows; break; } }
  }
  if (!category || !places.length) return Response.json({ ok: true, done: true, note: "no missing rows in target categories/metros" });

  const nowIso = new Date().toISOString();
  const rows = [];
  let rides = 0, sourced = 0, pending = 0, unverified = 0, withPage = 0;

  await pool(places, 6, async (place) => {
    // ride-level → store as RIDE-LEVEL, never written/sourced
    if (RIDE_RX.test(String(place.name || ""))) {
      rides++;
      rows.push(editorialRow(place, null, nowIso, ["RIDE-LEVEL — merge into parent park"]));
      return;
    }
    const d = await placeDetails(place.place_id, gkey);
    if (!d) { pending++; rows.push(editorialRow(place, null, nowIso, ["PENDING SOURCE"])); return; }

    // The venue's own words, when we can get them. Fail-soft → Places-only.
    const page = await officialPage(d.websiteUri);
    const sources = page ? [page] : [];
    if (page) withPage++;

    const parsed = await writeEditorial(place, d, akey, sources);
    if (!parsed || parsed.pending === true || !parsed.hook) {
      pending++;
      rows.push(editorialRow(place, null, nowIso, ["PENDING SOURCE"]));
      return;
    }

    // The honesty gate. A claim we cannot trace to what the model was shown does
    // not get published — it is parked for the owner with the reason attached.
    const ctxForCheck = {
      name: place.name, address: d.formattedAddress,
      google_summary: (d.editorialSummary && d.editorialSummary.text) || "",
      hours: (d.regularOpeningHours && d.regularOpeningHours.weekdayDescriptions) || [],
      rating: typeof d.rating === "number" ? d.rating : null,
      reviews: typeof d.userRatingCount === "number" ? d.userRatingCount : null,
    };
    const allowed = [d.websiteUri, d.googleMapsUri, ...(sources.map((s) => s.url))].filter(Boolean);
    const problems = verifyAtlasEditorial(parsed, corpusOf(ctxForCheck, sources), allowed);
    if (problems.length) {
      unverified++;
      const detail = problems.slice(0, 6).map((p) => `${p.check}:${p.field}:${p.value}`.slice(0, 90));
      rows.push(editorialRow(place, null, nowIso, ["FAILED VERIFICATION", ...detail]));
      return;
    }

    sourced++;
    rows.push(editorialRow(place, parsed, nowIso, null));
  });

  // Upsert — ON CONFLICT (place_id) DO NOTHING keeps the 373 existing rows safe.
  let written = 0, upErr = null;
  if (rows.length) {
    const h = { ...svcH, Prefer: "resolution=ignore-duplicates,return=minimal" };
    const r = await fetch(`${s.url}/rest/v1/wf_editorial?on_conflict=place_id`, { method: "POST", headers: h, body: JSON.stringify(rows), cache: "no-store" });
    if (r.ok) written = rows.length; else upErr = `upsert http ${r.status}: ${(await r.text()).slice(0, 160)}`;
  }

  // Affiliate opportunities: bookable places (attractions/hotels) with no verified
  // product yet get flagged for follow-up. Bounded to this batch. Fail-soft.
  let opps = 0;
  if (!upErr && (category === "attractions" || category === "hotels")) {
    try {
      const ids = rows.filter((r) => !r.issues).map((r) => r.place_id);
      if (ids.length) {
        const pr = await fetch(`${s.url}/rest/v1/wf_place_products?rn=eq.1&place_id=in.(${ids.join(",")})&select=place_id`, { headers: svcH, cache: "no-store" });
        const have = new Set((pr.ok ? await pr.json() : []).map((x) => x.place_id));
        const oppRows = places
          .filter((p) => ids.includes(p.place_id) && !have.has(p.place_id))
          .map((p) => ({ place_id: p.place_id, name: p.name, category: p.category, reason: "atlas: bookable, no verified product", suggested_partner: category === "hotels" ? "stay22" : "viator" }));
        if (oppRows.length) {
          const or = await fetch(`${s.url}/rest/v1/wf_affiliate_opportunities?on_conflict=place_id`, { method: "POST", headers: { ...svcH, Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify(oppRows), cache: "no-store" });
          if (or.ok) opps = oppRows.length;
        }
      }
    } catch (e) {}
  }

  const left = await missing(category);
  return Response.json({
    ok: !upErr, category, processed: places.length, written, sourced, pending, rides,
    unverified, with_page: withPage, opportunities: opps,
    remaining_after: Array.isArray(left) ? left.length + "+ (paged)" : "?", error: upErr, model: MODEL(),
  }, { headers: { "Cache-Control": "no-store" } });
}
