// lib/communityGuides.js — turn a member's itinerary into a public community
// guide, only when they publish it on purpose (owner order 2026-11-27).
//
// WHAT GOES PUBLIC: the places and events in the trip, their order, and how
// many days. WHAT NEVER DOES: the member's stop notes, the trip's own title,
// its dates, their name (unless they chose to show the public name they set
// for the leaderboard), or their account id. The text on the page is written
// by OpenAI from Wayfind's own facts about each stop (never from the member's
// notes), passed through OpenAI moderation, and cleaned of links, emails and
// phone numbers. If OpenAI or its moderation is unavailable, the guide is
// written by plain rules from Wayfind's own editorial instead, so a guide
// never appears with unchecked AI text.
//
// Every stop must be a real, open row in wf_inventory or a live wf_events row;
// anything else is dropped. The member can unpublish at any time.
//
// Pure helpers are exported for scripts/test-community-guides.mjs; the I/O
// functions take an injected fetch.
import { createHash, randomBytes } from "node:crypto";
import { engineJson, moderateText, cleanPublicText, takeUserGrant } from "./aiEngine.js";

export const MIN_STOPS = 3;
export const MAX_STOPS = 12;
export const MAX_DAYS = 14;
const REF_RX = /^[A-Za-z0-9_:.-]{3,200}$/;
const OPEN_LICENSE_RX = /\b(cc0|cc[\s-]*by(?:[\s-]*sa)?|public[\s-]*domain|^pd$)\b/i;
const CATEGORY_WORDS = {
  food: "Food", nightlife: "Nightlife", attractions: "Things to do", beach: "Beach", outdoors: "Outdoors",
  shopping: "Shopping", hotels: "Stay", coffee: "Coffee", event: "Event",
};

export function categoryLabel(cat) {
  const k = String(cat || "").toLowerCase();
  return CATEGORY_WORDS[k] || (k ? k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " ") : "Stop");
}

/** Slug from free text: lowercase words joined with single hyphens. */
export function slugify(text, max = 60) {
  const s = String(text || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s.slice(0, max).replace(/-+$/g, "") || "trip";
}

export function newGuideSlug(city, title, rand = randomBytes(3).toString("hex")) {
  return `${slugify(city, 24)}-${slugify(title, 48)}-${rand}`.replace(/-{2,}/g, "-").slice(0, 90).replace(/-+$/, "");
}

/**
 * The stops a member's itinerary would publish, in trip order, with day
 * numbers instead of dates. Notes are not read at all.
 * items: rows of wf_itinerary_items (kind, ref_id, sort_key, scheduled_on, day_index).
 */
export function stopsFromItinerary(items) {
  const rows = (Array.isArray(items) ? items : []).filter((it) => it && (it.kind === "place" || it.kind === "event") && REF_RX.test(String(it.ref_id || "")));
  const dates = [...new Set(rows.map((it) => (typeof it.scheduled_on === "string" ? it.scheduled_on.slice(0, 10) : "")).filter(Boolean))].sort();
  const dayOf = (it) => {
    const d = typeof it.scheduled_on === "string" ? it.scheduled_on.slice(0, 10) : "";
    if (d) return dates.indexOf(d) + 1;
    const di = Number(it.day_index);
    return Number.isInteger(di) && di >= 0 ? Math.min(MAX_DAYS, di + 1) : 1;
  };
  const sorted = rows.map((it, i) => ({ it, i, day: dayOf(it) })).sort((a, b) => a.day - b.day || String(a.it.sort_key || "").localeCompare(String(b.it.sort_key || "")) || a.i - b.i);
  const seen = new Set();
  const out = [];
  for (const { it, day } of sorted) {
    const key = it.kind + ":" + String(it.ref_id).replace(/__day_\d{4}-\d{2}-\d{2}$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: it.kind, ref_id: key.slice(it.kind.length + 1), day: Math.max(1, Math.min(MAX_DAYS, day)) });
    if (out.length >= MAX_STOPS) break;
  }
  // Renumber days so they run 1..N with no gaps.
  const used = [...new Set(out.map((s) => s.day))].sort((a, b) => a - b);
  for (const s of out) s.day = used.indexOf(s.day) + 1;
  return out;
}

export function sourceHash(stops) {
  return createHash("sha256").update(JSON.stringify((stops || []).map((s) => [s.kind, s.ref_id, s.day]))).digest("hex");
}

/** First openly licensed photo in a gallery, with its credit, for the shareable video. */
export function openLicensePhoto(gallery) {
  for (const g of Array.isArray(gallery) ? gallery : []) {
    if (!g || typeof g.url !== "string" || !/^https:\/\//.test(g.url)) continue;
    const lic = String(g.license || "");
    if (!OPEN_LICENSE_RX.test(lic)) continue;
    const who = cleanPublicText(g.attribution_text || g.author || g.source || "", 70);
    const credit = cleanPublicText(`${who || "Photo"} (${lic})`, 90);
    return { url: g.url, credit, license: lic.slice(0, 40) };
  }
  return null;
}

function firstSentence(text, max = 200) {
  const s = cleanPublicText(text, 600);
  const m = s.match(/^.{20,}?[.!?](\s|$)/);
  return cleanPublicText(m ? m[0] : s, max);
}

/** Turn database rows into the facts we hold about each stop. Missing stops are dropped. */
export function hydrateStops(stops, placeRows, eventRows, todayStr = "") {
  const places = new Map((placeRows || []).map((r) => [String(r.place_id), r]));
  const events = new Map();
  for (const r of eventRows || []) { if (r.event_id) events.set(String(r.event_id), r); if (r.slug) events.set(String(r.slug), r); }
  const out = [];
  for (const s of stops || []) {
    if (s.kind === "place") {
      const r = places.get(s.ref_id);
      if (!r || r.excluded === true) continue;
      if (String(r.status || "OPERATIONAL").toUpperCase() !== "OPERATIONAL") continue;
      const sig = r.signals && typeof r.signals === "object" ? r.signals : {};
      out.push({
        kind: "place", ref_id: s.ref_id, day: s.day,
        name: cleanPublicText(r.name, 90),
        category: String(r.category || ""),
        area: cleanPublicText(r.postal_city || r.locality || "", 60),
        facts: firstSentence(r.editorial || (r.editorial_card && r.editorial_card.why) || "", 240),
        photo: openLicensePhoto(sig.photo_gallery),
      });
    } else {
      const r = events.get(s.ref_id);
      if (!r) continue;
      const st = String(r.event_status || "").toLowerCase();
      if (!["", "scheduled", "sold_out", "completed"].includes(st)) continue;
      if (String(r.state || "FL").toUpperCase() !== "FL") continue;
      out.push({
        kind: "event", ref_id: String(r.event_id || s.ref_id), day: s.day,
        name: cleanPublicText(r.event_name || r.short_title, 90),
        category: "event",
        area: cleanPublicText(r.city || "", 60),
        facts: firstSentence(r.why_go || r.editorial_summary || r.card_hook || "", 240),
        slug: r.slug ? String(r.slug) : null,
        city_slug: r.city ? slugify(r.city, 40) : null,
        ended: Boolean(todayStr && (r.end_date || r.start_date) && String(r.end_date || r.start_date) < todayStr),
        photo: null,
      });
    }
  }
  return out.filter((s) => s.name);
}

export function guideCity(hydrated, fallback = "") {
  const counts = new Map();
  for (const s of hydrated) if (s.area) counts.set(s.area, (counts.get(s.area) || 0) + 1);
  let best = "", n = 0;
  for (const [k, v] of counts) if (v > n) { best = k; n = v; }
  return best || cleanPublicText(fallback, 60) || "Florida";
}

function daysLabel(days, city) {
  return days > 1 ? `${days} days in ${city}` : `A day in ${city}`;
}

/** The plain rules writer: Wayfind's own editorial, no AI. Always available. */
export function rulesWrite(hydrated, { city, days }) {
  return {
    title: cleanPublicText(daysLabel(days, city), 80),
    intro: cleanPublicText(`${hydrated.length} stops a Wayfind member put together for ${days > 1 ? `${days} days` : "a day"} in ${city}, in the order they planned them.`, 300),
    blurbs: Object.fromEntries(hydrated.map((s) => [s.ref_id, s.facts || `${categoryLabel(s.category)} stop${s.area ? " in " + s.area : ""}.`])),
  };
}

export const GUIDE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "intro", "stops"],
  properties: {
    title: { type: "string" },
    intro: { type: "string" },
    stops: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "blurb"],
        properties: { id: { type: "string" }, blurb: { type: "string" } },
      },
    },
  },
};

export function guidePrompt(hydrated, { city, days }) {
  const system = [
    "You write short public trip guides for Wayfind, a Florida local discovery site.",
    "Use ONLY the facts given for each stop. Never invent hours, prices, dates, menu items, awards or claims.",
    "If a stop has no facts, write one neutral line from its name and category only.",
    "Never mention the person who made the trip. No links, no phone numbers, no emojis, no dashes.",
    "Title: under 60 characters, specific to the city and the kind of trip. Intro: one or two sentences, under 260 characters.",
    "One blurb per stop, under 180 characters, keyed by the exact id given. Return JSON only.",
  ].join(" ");
  const user = JSON.stringify({
    city, days,
    stops: hydrated.map((s) => ({ id: s.ref_id, day: s.day, name: s.name, category: categoryLabel(s.category), area: s.area, facts: s.facts })),
  });
  return { system, user };
}

/** Validate a model reply against the exact stops we sent. null when unusable. */
export function validateGuideReply(data, hydrated) {
  if (!data || typeof data !== "object") return null;
  const title = cleanPublicText(data.title, 80);
  const intro = cleanPublicText(data.intro, 300);
  if (title.length < 3) return null;
  const ids = new Set(hydrated.map((s) => s.ref_id));
  const blurbs = {};
  for (const row of Array.isArray(data.stops) ? data.stops : []) {
    const id = row && String(row.id || "");
    if (!ids.has(id) || blurbs[id]) continue;
    const b = cleanPublicText(row.blurb, 220);
    if (b.length >= 8) blurbs[id] = b;
  }
  // The model must cover at least most of the stops; the rest use rules text.
  if (Object.keys(blurbs).length < Math.ceil(hydrated.length * 0.6)) return null;
  return { title, intro, blurbs };
}

/** The stored stop rows: facts we own plus the written blurb. */
export function storedStops(hydrated, blurbs) {
  return hydrated.map((s) => ({
    kind: s.kind, ref_id: s.ref_id, day: s.day, name: s.name, category: s.category, area: s.area,
    blurb: cleanPublicText(blurbs[s.ref_id] || s.facts || `${categoryLabel(s.category)} stop.`, 220),
    photo: s.photo || null,
    ...(s.kind === "event" ? { slug: s.slug || null, city_slug: s.city_slug || null } : {}),
  }));
}

/**
 * Write the guide text: OpenAI first (moderated), else the rules writer.
 * Resolves { title, intro, blurbs, writer, moderation }.
 */
export async function writeGuide(hydrated, meta, deps = {}) {
  const rules = rulesWrite(hydrated, meta);
  const json = deps.engineJson || engineJson;
  const moderate = deps.moderateText || moderateText;
  if (deps.allowAi !== false) {
    const { system, user } = guidePrompt(hydrated, meta);
    const r = await json({ system, user, schema: GUIDE_SCHEMA, schemaName: "community_guide", maxTokens: 1100 });
    const v = r && r.ok ? validateGuideReply(r.data, hydrated) : null;
    if (v) {
      const merged = { ...rules.blurbs, ...v.blurbs };
      const text = [v.title, v.intro, ...hydrated.map((s) => merged[s.ref_id])].join("\n");
      const m = await moderate(text);
      if (m && m.ok && !m.flagged) return { title: v.title, intro: v.intro || rules.intro, blurbs: merged, writer: "openai", moderation: "passed" };
      if (m && m.ok && m.flagged) {
        // Flagged AI text is thrown away; our own editorial is used instead.
        return { ...rules, writer: "rules", moderation: "passed" };
      }
    }
  }
  // Wayfind's own editorial: already reviewed text, published as such.
  return { ...rules, writer: "rules", moderation: "passed" };
}

// ── I/O ───────────────────────────────────────────────────────────────────

const svc = (cfg, extra = {}) => ({ apikey: cfg.service, Authorization: "Bearer " + cfg.service, ...extra });

async function json(r) { try { return await r.json(); } catch { return null; } }

/** The member's own itinerary, read with THEIR token so RLS decides. */
export async function readOwnItinerary(cfg, token, localKey, fetchImpl = fetch) {
  const q = `${cfg.url}/rest/v1/wf_itineraries?local_key=eq.${encodeURIComponent(localKey)}&select=id,local_key,city,state,wf_itinerary_items(kind,ref_id,day_index,sort_key,scheduled_on)&limit=1`;
  const r = await fetchImpl(q, { headers: { apikey: cfg.anon, Authorization: "Bearer " + token }, cache: "no-store" });
  if (!r.ok) return { ok: false, status: 502 };
  const rows = await json(r);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return { ok: false, status: 404 };
  return { ok: true, itinerary: row };
}

export async function readStopRows(cfg, stops, fetchImpl = fetch) {
  const placeIds = stops.filter((s) => s.kind === "place").map((s) => s.ref_id);
  const eventIds = stops.filter((s) => s.kind === "event").map((s) => s.ref_id);
  const [pr, er] = await Promise.all([
    placeIds.length
      ? fetchImpl(`${cfg.url}/rest/v1/wf_inventory?place_id=in.(${placeIds.map((id) => `"${id}"`).map(encodeURIComponent).join(",")})&select=place_id,name,category,locality,postal_city,status,excluded,editorial,editorial_card,signals`, { headers: svc(cfg), cache: "no-store" })
      : null,
    eventIds.length
      ? fetchImpl(`${cfg.url}/rest/v1/wf_events?or=${encodeURIComponent("(" + eventIds.flatMap((id) => [`event_id.eq."${id}"`, `slug.eq."${id}"`]).join(",") + ")")}&select=event_id,slug,event_name,short_title,city,state,event_status,start_date,end_date,why_go,editorial_summary,card_hook`, { headers: svc(cfg), cache: "no-store" })
      : null,
  ]);
  if ((pr && !pr.ok) || (er && !er.ok)) return null;
  return { places: pr ? (await json(pr)) || [] : [], events: er ? (await json(er)) || [] : [] };
}

async function existingGuide(cfg, userId, localKey, fetchImpl) {
  const r = await fetchImpl(`${cfg.url}/rest/v1/wf_community_guides?user_id=eq.${userId}&itinerary_key=eq.${encodeURIComponent(localKey)}&select=id,slug,status,source_hash,show_author&limit=1`, { headers: svc(cfg), cache: "no-store" });
  if (!r.ok) return { ok: false };
  const rows = await json(r);
  return { ok: true, row: Array.isArray(rows) ? rows[0] || null : null };
}

const LOCAL_KEY_RX = /^[\s\S]{1,80}$/;

/**
 * Publish (or refresh) the member's guide. Returns { status, body }.
 * `member` is the verified session user; `token` their bearer.
 */
export async function publishGuide({ cfg, member, token, body, todayStr = "", fetchImpl = fetch, deps = {} }) {
  const b = body && typeof body === "object" ? body : {};
  if (b.consent !== true) return { status: 400, body: { ok: false, code: "consent", error: "Tick the box to confirm you want this trip public." } };
  const localKey = typeof b.localKey === "string" ? b.localKey : "";
  if (!LOCAL_KEY_RX.test(localKey) || /[\u0000-\u001F]/.test(localKey)) return { status: 400, body: { ok: false, code: "invalid", error: "Pick one of your trips to publish." } };
  const showAuthor = b.showAuthor === true;

  const own = await readOwnItinerary(cfg, token, localKey, fetchImpl);
  if (!own.ok) {
    return own.status === 404
      ? { status: 404, body: { ok: false, code: "not_synced", error: "This trip has not saved to your account yet. Give it a moment and try again." } }
      : { status: 502, body: { ok: false, code: "unavailable", error: "We could not read your trip. Please try again." } };
  }
  const stops = stopsFromItinerary(own.itinerary.wf_itinerary_items);
  if (stops.length < MIN_STOPS) return { status: 400, body: { ok: false, code: "too_few", error: `Add at least ${MIN_STOPS} places to publish a guide.` } };
  const rows = await readStopRows(cfg, stops, fetchImpl);
  if (!rows) return { status: 502, body: { ok: false, code: "unavailable", error: "We could not check your stops. Please try again." } };
  const hydrated = hydrateStops(stops, rows.places, rows.events, todayStr);
  if (hydrated.length < MIN_STOPS) return { status: 400, body: { ok: false, code: "too_few", error: `At least ${MIN_STOPS} of your stops need to be Wayfind places or events to publish.` } };

  const hash = sourceHash(hydrated);
  const prev = await existingGuide(cfg, member.id, localKey, fetchImpl);
  if (!prev.ok) return { status: 502, body: { ok: false, code: "unavailable", error: "Please try again." } };
  const prior = prev.row;

  // Same stops as the live guide: no new AI call (cache), just the author toggle.
  if (prior && prior.source_hash === hash && prior.status === "published") {
    if (prior.show_author !== showAuthor) {
      await fetchImpl(`${cfg.url}/rest/v1/wf_community_guides?id=eq.${prior.id}`, { method: "PATCH", headers: svc(cfg, { "content-type": "application/json", Prefer: "return=minimal" }), body: JSON.stringify({ show_author: showAuthor, updated_at: new Date().toISOString() }), cache: "no-store" });
    }
    return { status: 200, body: { ok: true, slug: prior.slug, status: "published", cached: true, pointsAwarded: 0 } };
  }

  const days = Math.max(1, ...hydrated.map((s) => s.day));
  const city = guideCity(hydrated, own.itinerary.city);
  const grant = deps.takeUserGrant || takeUserGrant;
  const allowAi = await grant(member.id, "guide_write");
  const written = await writeGuide(hydrated, { city, days }, { ...deps, allowAi });

  const now = new Date().toISOString();
  const record = {
    user_id: member.id,
    itinerary_key: localKey,
    slug: prior ? prior.slug : newGuideSlug(city, written.title, deps.rand),
    status: written.moderation === "flagged" ? "held" : "published",
    title: written.title,
    intro: written.intro,
    city,
    days,
    stops: storedStops(hydrated, written.blurbs),
    show_author: showAuthor,
    source_hash: hash,
    writer: written.writer,
    moderation: written.moderation,
    updated_at: now,
    published_at: now,
  };
  const up = await fetchImpl(`${cfg.url}/rest/v1/wf_community_guides?on_conflict=user_id,itinerary_key`, {
    method: "POST",
    headers: svc(cfg, { "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" }),
    body: JSON.stringify(record),
    cache: "no-store",
  });
  if (!up.ok) return { status: 502, body: { ok: false, code: "unavailable", error: "We could not publish your guide. Please try again." } };
  const saved = ((await json(up)) || [])[0];
  if (!saved || !saved.id) return { status: 502, body: { ok: false, code: "unavailable", error: "We could not publish your guide. Please try again." } };

  let pointsAwarded = 0;
  let profile = null;
  if (record.status === "published") {
    try {
      const ar = await fetchImpl(`${cfg.url}/rest/v1/rpc/wf_award_guide`, { method: "POST", headers: svc(cfg, { "content-type": "application/json" }), body: JSON.stringify({ p_user_id: member.id, p_guide_id: saved.id }), cache: "no-store" });
      const aj = ar.ok ? await json(ar) : null;
      if (aj && aj.awarded) { pointsAwarded = Number(aj.points_awarded) || 0; profile = aj.profile || null; }
    } catch {}
  }
  return { status: 200, body: { ok: true, slug: saved.slug, status: record.status, writer: record.writer, pointsAwarded, profile } };
}

export async function unpublishGuide({ cfg, member, slug, fetchImpl = fetch }) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(slug || "")) || String(slug).length > 90) return { status: 400, body: { ok: false, code: "invalid", error: "That guide could not be found." } };
  const r = await fetchImpl(`${cfg.url}/rest/v1/wf_community_guides?slug=eq.${slug}&user_id=eq.${member.id}`, {
    method: "PATCH",
    headers: svc(cfg, { "content-type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify({ status: "unpublished", updated_at: new Date().toISOString() }),
    cache: "no-store",
  });
  if (!r.ok) return { status: 502, body: { ok: false, code: "unavailable", error: "Please try again." } };
  const rows = (await json(r)) || [];
  if (!rows.length) return { status: 404, body: { ok: false, code: "not_found", error: "That guide could not be found." } };
  return { status: 200, body: { ok: true, slug, status: "unpublished" } };
}

/** The member's own guides (their token, RLS) so the trip screen can show status. */
export async function listOwnGuides(cfg, token, fetchImpl = fetch) {
  const r = await fetchImpl(`${cfg.url}/rest/v1/wf_community_guides?select=slug,itinerary_key,status,title,show_author,updated_at&order=updated_at.desc&limit=50`, { headers: { apikey: cfg.anon, Authorization: "Bearer " + token }, cache: "no-store" });
  if (!r.ok) return null;
  const rows = await json(r);
  return Array.isArray(rows) ? rows : [];
}

// ── public reads (service role, safe columns only) ────────────────────────

const PUBLIC_COLS = "slug,title,intro,city,days,stops,show_author,user_id,published_at,updated_at,writer";

async function authorNames(cfg, userIds, fetchImpl) {
  const ids = [...new Set(userIds.filter((id) => /^[0-9a-f-]{36}$/i.test(String(id || ""))))];
  if (!ids.length) return new Map();
  const r = await fetchImpl(`${cfg.url}/rest/v1/wf_rewards_profile?user_id=in.(${ids.join(",")})&select=user_id,public_name`, { headers: svc(cfg), cache: "no-store" });
  if (!r.ok) return new Map();
  return new Map(((await json(r)) || []).filter((x) => x.public_name).map((x) => [x.user_id, x.public_name]));
}

/** Strip the private column and resolve the author line. */
export function publicGuideView(row, names) {
  const name = row.show_author && names.get(row.user_id) ? names.get(row.user_id) : null;
  const { user_id, show_author, ...rest } = row;
  return { ...rest, author: name || "A Wayfind local" };
}

export async function readPublishedGuide(cfg, slug, fetchImpl = fetch) {
  if (!cfg || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(String(slug || "")) || String(slug).length > 90) return null;
  const r = await fetchImpl(`${cfg.url}/rest/v1/wf_community_guides?slug=eq.${slug}&status=eq.published&select=${PUBLIC_COLS}&limit=1`, { headers: svc(cfg), next: { revalidate: 300 } });
  if (!r.ok) return null;
  const row = ((await json(r)) || [])[0];
  if (!row) return null;
  const names = await authorNames(cfg, [row.user_id], fetchImpl);
  return publicGuideView(row, names);
}

export async function listPublishedGuides(cfg, { limit = 24 } = {}, fetchImpl = fetch) {
  if (!cfg) return [];
  const n = Math.max(1, Math.min(48, Number(limit) || 24));
  const r = await fetchImpl(`${cfg.url}/rest/v1/wf_community_guides?status=eq.published&select=${PUBLIC_COLS}&order=published_at.desc&limit=${n}`, { headers: svc(cfg), next: { revalidate: 300 } });
  if (!r.ok) return [];
  const rows = (await json(r)) || [];
  const names = await authorNames(cfg, rows.map((x) => x.user_id), fetchImpl);
  return rows.map((row) => publicGuideView(row, names));
}

/** A trip object the existing share codec understands, for "Save this trip". */
export function guideAsTrip(guide) {
  return {
    title: guide.title,
    city: guide.city,
    state: "FL",
    items: (guide.stops || []).filter((s) => s.kind === "place").map((s, i) => ({
      id: s.ref_id,
      order: i,
      place: { id: s.ref_id, name: s.name, type: categoryLabel(s.category) },
    })),
  };
}
