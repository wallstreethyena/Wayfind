// lib/itineraryBuilderServer.js — SERVER ONLY. Builds the interactive
// itinerary for /plan-my-day from Wayfind's own inventory (owner, 2026-11-27).
//
// One data model: the stops come out of the existing grounded planner
// (lib/wayfindPlanner.js: buildGroundedCandidatePool -> buildDeterministicPlan
// -> enrichPlanDays), the same proposedPlan shape the Santa trip planner uses,
// flattened here into a small client shape. Nothing here can create a stop
// that is not a real Wayfind place or event:
//   - candidates come only from Wayfind's owned search, the Christmas browse
//     (with its server built partner ticket buttons) and curated events;
//   - a place the visitor names is used only when Wayfind already has it and
//     its name matches (lib/planMyDay.js nameMatches); otherwise it is listed
//     back as "not on Wayfind yet", never guessed;
//   - a ticket button is published only for Wayfind's own partner routes
//     (/api/<partner>/go?…), so affiliate tracking stays exactly as the cards
//     already do it. Everything else opens the stop's Wayfind page.
import {
  buildGroundedCandidatePool, plannerInventoryQueries, buildDeterministicPlan, enrichPlanDays,
  isEntityInDestinationMetro, normalizeGroundedCandidate,
} from "./wayfindPlanner.js";
import { canScheduleOnDate } from "./plannerGeo.js";
import { fetchCuratedEvents } from "./curatedEvents.js";
import { siteTodayStr } from "./siteTime.js";
import { nameMatches } from "./planMyDay.js";
import { travelEstimate, legDirectionsUrl } from "./travelEstimate.js";

export const PARTNER_GO_RX = /^\/api\/[a-z0-9/_-]+\/go\?[^\s"'<>]*$/i;
const INTERNAL_HREF_RX = /^\/(?:p|places|florida-events|events)\/[A-Za-z0-9%._~:/-]+$/;
export const MAX_STOPS_PER_DAY = 5;

// The route handlers are injected by the caller (app/api/plan-my-day/route.js
// passes /api/search's and /api/christmas/browse's GET), so this lib never
// imports app code and stays testable with fakes.
async function ownedSearch(deps, q, origin) {
  const siteSearch = deps && deps.siteSearch;
  if (typeof siteSearch !== "function") return [];
  const qs = new URLSearchParams({ q });
  if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)) {
    qs.set("lat", String(origin.lat));
    qs.set("lng", String(origin.lng));
  }
  try {
    const res = await siteSearch(new Request("https://wayfind.internal/api/search?" + qs.toString()));
    const data = await res.json();
    return [...(Array.isArray(data && data.cards) ? data.cards : []), ...(Array.isArray(data && data.places) ? data.places : [])];
  } catch {
    return [];
  }
}

// Christmas cards carry their partner ticket button on ticketRow.cta; expose it
// to the planner's normalizer as the candidate's ticket.
// Christmas cards also carry their rail (popup-bars, parties…) in camelCase;
// pass it through as christmas_rail so the planner's tags see it. An event card
// whose name is only its venue ("Tropicana Field") is shown by its own title.
export function withPartnerTicket(card) {
  if (!card || typeof card !== "object") return card;
  let out = card;
  if (card.christmasRail && !card.christmas_rail) out = { ...out, christmas_rail: String(card.christmasRail) };
  const title = typeof card.title === "string" ? card.title.trim() : "";
  if (card.kind === "event" && title && card.venue && card.name === card.venue && title !== card.venue) out = { ...out, name: title };
  const cta = card.ticketRow && card.ticketRow.cta;
  if (cta && typeof cta.href === "string" && PARTNER_GO_RX.test(cta.href)) {
    out = { ...out, ticketUrl: cta.href, ticketLabel: String(cta.label || "Get Tickets").slice(0, 40) };
  }
  return out;
}

// A trip with kids never gets a bar, club or adults night as a stop. Judged
// from the candidate's own category, primary type and tags.
const ADULT_TAGS = new Set(["night_club", "bar", "pub", "irish_pub", "cocktail_bar", "wine_bar", "sports_bar", "lounge", "hookah_bar", "liquor_store", "casino", "adult_entertainment_club", "popup-bars", "parties"]);
export function isAdultOnlyCandidate(c) {
  if (!c || typeof c !== "object") return false;
  if (String(c.category || "").toLowerCase() === "nightlife") return true;
  const primary = String(c.primaryType || c.type || "").toLowerCase();
  if (ADULT_TAGS.has(primary)) return true;
  const tags = Array.isArray(c.tags) ? c.tags : [];
  return tags.some((t) => t === "popup-bars" || t === "parties" || t === "21+" || t === "adults only");
}
export function wantsKidFriendly(parsed) {
  const p = (parsed && parsed.preferences) || {};
  return p.partyType === "family" || (Number(p.kids) || 0) > 0;
}

async function christmasCards(deps, destination) {
  const christmasBrowseGet = deps && deps.christmasBrowseGet;
  if (typeof christmasBrowseGet !== "function") return [];
  try {
    const qs = new URLSearchParams();
    if (destination && destination.name) qs.set("q", destination.name);
    const res = await christmasBrowseGet(new Request("https://wayfind.internal/api/christmas/browse?" + qs.toString()));
    if (!res.ok) return [];
    const data = await res.json();
    return (Array.isArray(data && data.cards) ? data.cards : []).map(withPartnerTicket);
  } catch {
    return [];
  }
}

/** Gather the grounded candidate pool for a parsed request. */
export async function gatherCandidates(parsed, deps = {}) {
  const today = siteTodayStr();
  const destination = parsed.destination;
  const origin = destination ? { lat: destination.lat, lng: destination.lng } : null;
  const ints = new Set((parsed.preferences && parsed.preferences.interests) || []);
  const inSeason = today.slice(5) >= "10-15" || today.slice(5) <= "01-05";
  const isFlorida = !destination || destination.state === "FL";
  const [lists, xmas, curated] = await Promise.all([
    Promise.all(plannerInventoryQueries(parsed).map((q) => ownedSearch(deps, q, origin))),
    isFlorida && (inSeason || ints.has("christmas") || ints.has("lights")) ? christmasCards(deps, destination) : Promise.resolve([]),
    isFlorida && deps.curated !== false ? (deps.fetchCuratedEvents || fetchCuratedEvents)({ signal: AbortSignal.timeout(2500), upcomingFrom: today }).catch(() => []) : Promise.resolve([]),
  ]);
  return buildGroundedCandidatePool([
    { sourceKind: "christmas", items: xmas },
    ...lists.map((items) => ({ sourceKind: "owned_search", items })),
    { sourceKind: "curated_events", items: curated },
  ], { destination, maxRadiusKm: 58, today }).filter((c) => !wantsKidFriendly(parsed) || !isAdultOnlyCandidate(c));
}

/** Find each named place in the pool, or in Wayfind's own search near the city. */
export async function resolveNamedStops(names, pool, destination, deps = {}) {
  const matched = [];
  const unmatched = [];
  const origin = destination ? { lat: destination.lat, lng: destination.lng } : null;
  for (const name of names || []) {
    let hit = pool.find((c) => nameMatches(name, c.name));
    if (!hit) {
      const found = await ownedSearch(deps, name, origin);
      for (const raw of found) {
        const cand = normalizeGroundedCandidate(raw, "owned_search");
        if (cand && nameMatches(name, cand.name) && isEntityInDestinationMetro(cand, destination, 58)) { hit = cand; pool.push(cand); break; }
      }
    }
    if (hit && !matched.some((m) => m.id === hit.id)) matched.push(hit);
    else if (!hit) unmatched.push(name);
  }
  return { matched, unmatched };
}

function quality(c) {
  return (c.wfScore || (c.rating ? c.rating * 18 : 50)) + (c.ticketUrl && PARTNER_GO_RX.test(c.ticketUrl) ? 4 : 0);
}

// Raw Google type tokens ("peruvian_restaurant") read as plain words on the
// card ("Peruvian restaurant"); generic tokens that say nothing are dropped.
const GENERIC_TYPES = new Set(["point_of_interest", "establishment", "premise", "food", "store", "tourist_attraction"]);
/** "peruvian_restaurant" -> "Peruvian restaurant"; null for generic or empty. PURE. */
export function stopTypeLabel(raw) {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!key || GENERIC_TYPES.has(key)) return null;
  const words = key.replace(/_+/g, " ").trim();
  return words ? (words.charAt(0).toUpperCase() + words.slice(1)).slice(0, 50) : null;
}

// The shared planner's slot fillers ("…for dinner", "Easy morning start…")
// can land on a stop at another hour once the day is ordered by time, so on a
// card they read wrong. The stop's own Wayfind line, or a plain one, replaces them.
const PLANNER_SLOT_LINES = new Set([
  "Easy morning start in the same neighborhood cluster.",
  "Grouped nearby so you are not driving across town for dinner.",
  "Nearby stop in the same area.",
]);
function stopWhy(s, c) {
  const why = s && s.why ? String(s.why).trim() : "";
  if (why && !PLANNER_SLOT_LINES.has(why)) return why.slice(0, 200);
  if (c && c.take) return String(c.take).slice(0, 200);
  return why ? "Close to your other stops." : null;
}

/** The client shape of one stop. PURE. */
export function clientStop(s, catalogMap) {
  const c = catalogMap.get(String(s.id)) || s;
  const href = typeof c.detailHref === "string" && INTERNAL_HREF_RX.test(c.detailHref) ? c.detailHref : null;
  const ticketHref = typeof c.ticketUrl === "string" && PARTNER_GO_RX.test(c.ticketUrl) ? c.ticketUrl : null;
  const lat = Number(c.lat), lng = Number(c.lng);
  return {
    id: String(c.id),
    name: String(c.name || "").slice(0, 100),
    kind: c.itemType === "event" ? "event" : "place",
    type: stopTypeLabel(c.type),
    city: c.city ? String(c.city).slice(0, 50) : null,
    lat: Number.isFinite(lat) ? Number(lat.toFixed(5)) : null,
    lng: Number.isFinite(lng) ? Number(lng.toFixed(5)) : null,
    photo: typeof c.photo === "string" && (c.photo.startsWith("/") || c.photo.startsWith("https://")) ? c.photo : null,
    href,
    ticket: ticketHref ? { href: ticketHref, label: String(c.ticketLabel || "Get Tickets").replace(/\s*↗\s*$/, "").slice(0, 40) } : null,
    price: c.price || null,
    fixedTime: c.itemType === "event" && c.startTime ? String(c.startTime).slice(0, 12) : null,
    slot: s.slotLabel || null,
    why: stopWhy(s, c),
    hoursNote: s.confidence && s.confidence.level && s.confidence.level !== "confirmed" ? "Check hours before you go" : null,
  };
}

/** Travel lines between consecutive stops (labeled estimates + a real route link). PURE. */
export function withTravel(stops) {
  return stops.map((s, i) => {
    const next = stops[i + 1];
    if (!next) return { ...s, travelToNext: null };
    const est = travelEstimate(s, next);
    return { ...s, travelToNext: est ? { ...est, directions: legDirectionsUrl(s, next) } : null };
  });
}

/**
 * Build the itinerary. Returns { ok, itinerary, pool, unmatched } or { ok:false, reason }.
 * `pool` is the list the visitor can add stops from (real candidates not already planned).
 */
export async function buildItinerary(parsed, { mustInclude = [], deps = {} } = {}) {
  const candidates = await gatherCandidates(parsed, deps);
  const pool = [...candidates];
  const { matched, unmatched } = await resolveNamedStops(mustInclude, pool, parsed.destination, deps);
  if (!pool.length) return { ok: false, reason: "no_candidates" };
  const plan = buildDeterministicPlan(parsed, pool, { seedPlace: matched[0] || null });
  if (!plan || !Array.isArray(plan.days) || !plan.days.length) return { ok: false, reason: "no_plan" };
  const catalogMap = new Map(pool.map((c) => [String(c.id), c]));

  // Every other named place the visitor asked for goes into the day with the
  // most room on which Wayfind's data allows it.
  let rawDays = plan.days.map((d) => ({ date: d.date, areaSummary: d.areaSummary, stops: d.stops.map((s) => ({ id: s.id, why: s.why })) }));
  let changed = false;
  for (const m of matched.slice(1)) {
    if (rawDays.some((d) => d.stops.some((s) => String(s.id) === String(m.id)))) continue;
    const day = rawDays
      .filter((d) => d.stops.length < MAX_STOPS_PER_DAY && (!d.date || canScheduleOnDate(m, d.date).allowed))
      .sort((a, b) => a.stops.length - b.stops.length)[0];
    if (day) { day.stops.push({ id: m.id, why: m.take || "On your list." }); changed = true; }
    else unmatched.push(m.name + " (no open day in this plan)");
  }
  const days = changed ? enrichPlanDays(rawDays, catalogMap).days : plan.days;
  const used = new Set(days.flatMap((d) => d.stops.map((s) => String(s.id))));
  const outDays = days.map((d) => ({
    date: d.date,
    label: d.label || d.date,
    stops: withTravel(d.stops.map((s) => clientStop(s, catalogMap))),
  }));
  const addPool = pool
    .filter((c) => !used.has(String(c.id)))
    .sort((a, b) => quality(b) - quality(a))
    .slice(0, 16)
    .map((c) => clientStop({ id: c.id }, catalogMap));
  return {
    ok: true,
    itinerary: {
      v: 1,
      title: plan.title,
      city: plan.city,
      state: plan.state,
      startDate: plan.startDate,
      endDate: plan.endDate,
      days: outDays,
    },
    pool: addPool,
    unmatched,
  };
}
