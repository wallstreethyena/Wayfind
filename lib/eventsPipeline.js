// Events pipeline integrity, Phase 1 (EVENTS_PIPELINE_DIAGNOSIS.md).
// The one rule, enforced here and nowhere else: an event may be displayed
// if and only if it passed validation AND has a working primary
// destination. No destination -> not in the output array -> not rendered
// and not counted. Every card surface renders from this pipeline's output,
// so the displayed count IS the usable count by construction.
//
// Pure module (no fetch, no env) so scripts/test-events-contract.mjs can
// exercise every rule against fixtures. The API route owns provider I/O
// and passes results in.

export function slugifyEvent(s) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

// Providers whose events can be re-resolved by id on a cold page load
// (lib/eventResolve.js): Ticketmaster (by-id API), Manatee LibCal (iCal
// UID scan), Local staples (recomputed from code). Only these get an
// internal detail page as their primary destination -- an internal URL we
// could not re-resolve later would 404 the moment it's shared, which is
// worse than an honest external link.
export const RESOLVABLE_ID = /^(tm_|lib_|ls_)/;

export function isSafeHttpUrl(u) {
  if (!u || typeof u !== "string") return false;
  let parsed;
  try { parsed = new URL(u); } catch { return false; }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  return true;
}

// The banned destination pattern (see the Phase 0 diagnosis: PredictHQ
// used to fabricate these): a search-engine results page is not an event
// destination, it's an admission that we don't have one.
export function isFabricatedSearchUrl(u) {
  return /(?:^|\.)google\.[a-z.]+\/search|(?:^|\.)bing\.com\/search|duckduckgo\.com\/\?q=/i.test(String(u || ""));
}

// Destination precedence, resolved at normalization time:
// (1) internal /events/[city]/[slug] detail page (resolvable providers);
// (2) the event's validated official/source or ticket URL.
// Returns null when nothing works -- the caller must then EXCLUDE the
// event, never render a dead card.
export function resolveDestination(e) {
  const citySlug = slugifyEvent(e.city) || "nearby";
  if (RESOLVABLE_ID.test(e.id || "")) {
    const slug = (slugifyEvent(e.name) || "event") + "--" + encodeURIComponent(e.id);
    return { dest: `/events/${citySlug}/${slug}`, destKind: "internal", slug, citySlug };
  }
  const url = String(e.url || "").trim();
  if (isSafeHttpUrl(url) && !isFabricatedSearchUrl(url)) {
    return { dest: url, destKind: e.ticketed ? "ticket" : "official", slug: null, citySlug };
  }
  return null;
}

// Wayfind's event inventory is Florida (US Eastern). "Today" must be anchored to
// the VENUE-local timezone, not the server's: Vercel serverless runs in UTC, which
// rolls the calendar day over at ~8 PM ET and would classify tonight's still-upcoming
// events as "past" (dropping them from the front page every evening). We never shift
// an event's own date/time string -- we only read the correct local calendar day for
// `now`. Intl is DST-aware (EDT vs EST); on a runtime without tz data we fall back to
// the previous server-local behavior rather than throw.
const SITE_TZ = "America/New_York";
export function siteTodayStr(now = new Date()) {
  try {
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: SITE_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
    const g = (t) => p.find((x) => x.type === t).value;
    return g("year") + "-" + g("month") + "-" + g("day");
  } catch (e) {
    const p2 = (n) => String(n).padStart(2, "0");
    return now.getFullYear() + "-" + p2(now.getMonth() + 1) + "-" + p2(now.getDate());
  }
}

// Boundary validation. Returns { ok: true } or { ok: false, reason }.
// `now` is injectable for tests; date/time strings are provider-LOCAL and treated as
// opaque -- the only tz-aware step is deriving TODAY (siteTodayStr) so the past-cutoff
// matches the venue's local day, never the server's UTC day.
export function validateEvent(e, now = new Date()) {
  if (!e || typeof e !== "object") return { ok: false, reason: "malformed" };
  if (!e.name || !String(e.name).trim()) return { ok: false, reason: "no_title" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || "")) return { ok: false, reason: "invalid_date" };
  const y = +e.date.slice(0, 4), mo = +e.date.slice(5, 7), d = +e.date.slice(8, 10);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return { ok: false, reason: "invalid_date" };
  if (e.date < siteTodayStr(now)) return { ok: false, reason: "past" };
  const status = String(e.status || "").toLowerCase();
  if (status === "cancelled" || status === "canceled" || status === "postponed") return { ok: false, reason: "cancelled" };
  if (e.url && !isSafeHttpUrl(e.url)) return { ok: false, reason: "invalid_url" };
  if (e.url && isFabricatedSearchUrl(e.url)) return { ok: false, reason: "fabricated_url" };
  return { ok: true };
}

// Cross-provider dedup on normalized title + venue + start (date+time) --
// NOT provider id: the same concert arrives from two providers with two
// ids. Provider rank picks the richer record; missing coords/image/price
// are borrowed from the loser so the surviving card is the best of both.
const PROVIDER_RANK = { Ticketmaster: 6, SeatGeek: 5, Eventbrite: 4, Bandsintown: 3, "Manatee County Library": 3, "Local staples": 3, PredictHQ: 2, Google: 1 };
function dedupKey(e) {
  const n = String(e.name || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);
  const v = String(e.venue || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);
  return n + "|" + v + "|" + (e.date || "") + "|" + (e.time || "");
}
export function dedupeAcrossProviders(list) {
  const map = new Map();
  for (const e of list || []) {
    if (!e) continue;
    const k = dedupKey(e);
    const ex = map.get(k);
    if (!ex) { map.set(k, e); continue; }
    const keep = (PROVIDER_RANK[e.source] || 0) > (PROVIDER_RANK[ex.source] || 0) ? e : ex;
    const other = keep === e ? ex : e;
    if (keep.lat == null && other.lat != null) { keep.lat = other.lat; keep.lng = other.lng; }
    if (!keep.image && other.image) keep.image = other.image;
    if (!keep.price && other.price) keep.price = other.price;
    if (!keep.url && other.url) { keep.url = other.url; keep.ticketed = other.ticketed; }
    map.set(k, keep);
  }
  return Array.from(map.values());
}

export function haversineMi(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function stateOf(s) {
  if (!s) return "";
  const parts = String(s).split(",").map((x) => x.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const m = parts[i].match(/^([A-Za-z]{2})$/);
    if (m) return m[1].toUpperCase();
  }
  return "";
}

// The whole pipeline: validate -> dedup -> geo-guard -> destination-check
// -> sort -> cap. `results` is the per-provider array the route collected:
// [{ provider, configured, ok, ms, timedOut, events: [raw normalized] }].
// One provider failing (ok:false / timedOut / empty) only affects its own
// entries -- the others' events flow through untouched.
export function processEvents(results, { lat, lng, radius, city, now = new Date(), cap = 250 } = {}) {
  const health = [];
  const excludedByReason = {};
  let raw = [];
  for (const r of results || []) {
    const evs = (r && Array.isArray(r.events)) ? r.events : [];
    health.push({
      provider: r.provider,
      configured: !!r.configured,
      ok: r.ok !== false,
      timedOut: !!r.timedOut,
      ms: r.ms != null ? r.ms : null,
      received: evs.length,
    });
    raw = raw.concat(evs);
  }

  const valid = [];
  for (const e of raw) {
    const v = validateEvent(e, now);
    if (!v.ok) { excludedByReason[v.reason] = (excludedByReason[v.reason] || 0) + 1; continue; }
    valid.push(e);
  }

  let merged = dedupeAcrossProviders(valid);

  // Proximity guard (unchanged behavior from the pre-Phase-1 route): civic
  // sources are geo-fenced upstream; coord-bearing events must be in
  // radius; coord-less ones must share the user's state.
  const userState = stateOf(city);
  const maxMi = Math.min(Math.max(Number(radius) || 30, 5), 100);
  merged = merged.filter((e) => {
    if (e.civic) return true;
    if (e.lat != null && e.lng != null && lat != null && lng != null) return haversineMi(lat, lng, e.lat, e.lng) <= maxMi;
    const es = stateOf(e.city);
    return userState && es ? es === userState : false;
  });

  // Destination check LAST: an event that survives everything above but
  // has no working destination is excluded, not rendered defanged.
  const out = [];
  for (const e of merged) {
    const d = resolveDestination(e);
    if (!d) { excludedByReason.no_destination = (excludedByReason.no_destination || 0) + 1; continue; }
    out.push({ ...e, dest: d.dest, destKind: d.destKind, slug: d.slug, citySlug: d.citySlug });
  }

  out.sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
  const events = out.slice(0, cap);
  return { events, usableCount: events.length, health, excludedByReason };
}
