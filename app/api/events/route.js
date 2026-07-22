export const runtime = "nodejs";

// Unified local-events feed. Calls every configured provider in parallel,
// normalizes each to one shape, then hands EVERYTHING to
// lib/eventsPipeline.js (Phase 1, EVENTS_PIPELINE_DIAGNOSIS.md):
// validation -> cross-provider dedup (title+venue+start) -> geo guard ->
// destination check -> sort/cap. An event without a working destination is
// excluded there, so the returned list IS the usable list and the client
// can count what it renders. Every provider is optional (own env key),
// isolated behind its own timeout, and fail-soft: one provider timing out
// or erroring never touches another provider's events. "unavailable" is
// only true when NO provider is configured at all.

import { processEvents, siteTodayStr } from "../../../lib/eventsPipeline.js";
import { localStaplesFor, parseLibCalICS, parseICSDate, libcalId, LIBCAL_FEED } from "../../../lib/eventResolve.js";
import { getBusinessFeeds, businessEventsFrom } from "../../../lib/businessFeeds.js";
import { cget, cset, DAY } from "../../../lib/serverCache";

function isoNowZ() {
  return new Date().toISOString().slice(0, 19) + "Z";
}
function today() {
  // Venue-local (US Eastern) calendar day, not the server's UTC day -- otherwise the
  // stale-cache `upcoming()` filter drops tonight's events after ~8 PM ET. See
  // siteTodayStr in lib/eventsPipeline.js.
  return siteTodayStr();
}

// v4.87 — full Discovery API breadth. A single date-sorted query skews to
// whatever is soonest (usually sports); fanning out per segment (Music,
// Sports, Arts & Theatre, Family, Film, Miscellaneous) plus one unfiltered
// pass guarantees every classification is represented. Seven parallel calls
// per unique geo, so results are memory-cached 10 minutes to protect the
// Discovery API daily quota.
const TM_SEGMENTS = ["Music", "Sports", "Arts & Theatre", "Family", "Film", "Miscellaneous"];
const _tmMem = new Map();
const TM_TTL = 10 * 60 * 1000;
async function fromTicketmaster(lat, lng, radius, keyword) {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) return { configured: false, events: [] };
  try {
    const ck = [Number(lat).toFixed(2), Number(lng).toFixed(2), radius || "", keyword || ""].join("|");
    const hit = _tmMem.get(ck);
    if (hit && hit.exp > Date.now()) return { configured: true, events: hit.events };
    const baseParams = (extra) => {
      const p = new URLSearchParams({
        apikey: key, latlong: `${lat},${lng}`, radius: String(radius || 60),
        unit: "miles", sort: "date,asc", size: extra ? "100" : "200", startDateTime: isoNowZ(),
      });
      if (keyword) p.set("keyword", keyword);
      if (extra) p.set("classificationName", extra);
      return p;
    };
    const calls = [null, ...(keyword ? [] : TM_SEGMENTS)].map((seg) =>
      fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${baseParams(seg).toString()}`)
        .then((r) => (r.ok ? r.json() : null)).catch(() => null)
    );
    const pages = await Promise.all(calls);
    const seen = new Set();
    const raw = [];
    for (const data of pages) {
      for (const e of (data && data._embedded && data._embedded.events) || []) {
        if (e && e.id && !seen.has(e.id)) { seen.add(e.id); raw.push(e); }
      }
    }
    const events = raw.map((e) => {
      const dates = e.dates && e.dates.start ? e.dates.start : {};
      const venue = e._embedded && e._embedded.venues && e._embedded.venues[0] ? e._embedded.venues[0] : null;
      const vloc = venue && venue.location ? venue.location : null;
      let img = null;
      if (Array.isArray(e.images) && e.images.length) {
        // v6.43 LCP: this used to sort widest-FIRST and take [0], which shipped
        // Ticketmaster's 2048x1152 / ~503KB JPEG into a hero slot that is 388px
        // wide on mobile and ~780px on desktop — a 5x oversized download that
        // measured as the mobile LCP element at 8.4s on a throttled connection.
        // Take the SMALLEST 16:9 variant that still covers the slot at ~2x DPR
        // (1024x576 is ~168KB, a 67% saving with no visible quality loss at
        // these sizes); fall back to the largest available if none reach it.
        const HERO_MIN_W = 1024;
        const wide = e.images.filter((i) => i.ratio === "16_9").sort((a, b) => (a.width || 0) - (b.width || 0));
        img = (wide.find((i) => (i.width || 0) >= HERO_MIN_W) || wide[wide.length - 1] || e.images[0]).url;
      }
      const cls = Array.isArray(e.classifications) && e.classifications[0] ? e.classifications[0] : null;
      const seg = cls && cls.segment ? cls.segment.name : "";
      const genre = cls && cls.genre ? cls.genre.name : "";
      // v6.43 Sports rail (§2): the SPORT is in `genre` (Baseball/Football/...), but the
      // LEAGUE (MLB vs NCAA baseball, NFL vs College) is only in subGenre. Without it
      // lib/sportsRail.leagueOf() degrades to the sport name — honest, but imprecise.
      // Additive: nothing reads this field yet except the v2 rail.
      const subGenre = cls && cls.subGenre ? cls.subGenre.name : "";
      let price = null;
      if (Array.isArray(e.priceRanges) && e.priceRanges.length) {
        const pr = e.priceRanges[0];
        const cur = pr.currency === "USD" ? "$" : (pr.currency ? pr.currency + " " : "");
        if (pr.min != null && pr.max != null) price = pr.min === pr.max ? `${cur}${Math.round(pr.min)}` : `${cur}${Math.round(pr.min)} to ${cur}${Math.round(pr.max)}`;
      }
      return {
        id: "tm_" + e.id, name: e.name || "", date: dates.localDate || "", time: dates.localTime || "",
        subGenre,
        venue: venue ? venue.name || "" : "", city: venue && venue.city ? venue.city.name || "" : "",
        lat: vloc && vloc.latitude != null ? Number(vloc.latitude) : null,
        lng: vloc && vloc.longitude != null ? Number(vloc.longitude) : null,
        segment: seg, genre, image: img, price, url: e.url || "", ticketed: true, source: "Ticketmaster",
        // Phase 1: cancelled/postponed events used to flow into cards
        // unchecked -- the pipeline now excludes on this field.
        status: e.dates && e.dates.status && e.dates.status.code ? e.dates.status.code : "",
      };
    });
    _tmMem.set(ck, { events, exp: Date.now() + TM_TTL });
    return { configured: true, events };
  } catch { return { configured: true, ok: false, events: [] }; }
}

function seatgeekSegment(type) {
  const t = (type || "").toLowerCase();
  if (t.includes("comedy")) return { segment: "Arts & Theatre", genre: "Comedy" };
  if (t.includes("concert") || t.includes("music")) return { segment: "Music", genre: "" };
  if (t.includes("theater") || t.includes("theatre") || t.includes("broadway") || t.includes("dance") || t.includes("classical") || t.includes("opera")) return { segment: "Arts & Theatre", genre: "" };
  if (t.includes("mlb") || t.includes("nba") || t.includes("nfl") || t.includes("nhl") || t.includes("ncaa") || t.includes("soccer") || t.includes("sport") || t.includes("mls") || t.includes("wnba") || t.includes("tennis") || t.includes("golf") || t.includes("racing")) return { segment: "Sports", genre: "" };
  if (t.includes("family") || t.includes("circus")) return { segment: "Family", genre: "" };
  if (t.includes("film") || t.includes("movie")) return { segment: "Film", genre: "" };
  return { segment: "", genre: "" };
}

async function fromSeatGeek(lat, lng, radius, keyword) {
  const id = process.env.SEATGEEK_CLIENT_ID;
  if (!id) return { configured: false, events: [] };
  try {
    const p = new URLSearchParams({
      client_id: id, lat: String(lat), lon: String(lng), range: `${radius || 60}mi`,
      per_page: "100", sort: "datetime_asc", // v4.87: maximize the feed
    });
    p.set("datetime_utc.gte", new Date().toISOString().slice(0, 19));
    if (keyword) p.set("q", keyword);
    const secret = process.env.SEATGEEK_CLIENT_SECRET;
    if (secret) p.set("client_secret", secret);
    const r = await fetch(`https://api.seatgeek.com/2/events?${p.toString()}`);
    if (!r.ok) return { configured: true, ok: false, events: [] };
    const data = await r.json();
    const raw = data.events || [];
    const events = raw.map((e) => {
      const v = e.venue || {};
      const loc = v.location || {};
      const dl = (e.datetime_local || "").split("T");
      const perf = Array.isArray(e.performers) && e.performers[0] ? e.performers[0] : null;
      let img = null;
      if (perf) img = perf.image || (perf.images && (perf.images.huge || perf.images.large)) || null;
      const stats = e.stats || {};
      const lo = stats.lowest_price, hi = stats.highest_price;
      let price = null;
      if (lo != null && hi != null) price = lo === hi ? `$${Math.round(lo)}` : `$${Math.round(lo)} to $${Math.round(hi)}`;
      else if (lo != null) price = `From $${Math.round(lo)}`;
      const sm = seatgeekSegment(e.type);
      return {
        id: "sg_" + e.id, name: e.short_title || e.title || "", date: dl[0] || "", time: dl[1] || "",
        venue: v.name || "", city: v.city || "",
        lat: loc.lat != null ? loc.lat : null, lng: loc.lon != null ? loc.lon : null,
        segment: sm.segment, genre: sm.genre, image: img, price, url: e.url || "", ticketed: true, source: "SeatGeek",
        status: (e.status || "") === "normal" ? "" : (e.status || ""),
      };
    });
    return { configured: true, events };
  } catch { return { configured: true, ok: false, events: [] }; }
}

function phqSegment(category) {
  const c = (category || "").toLowerCase();
  if (c === "concerts") return "Music";
  if (c === "festivals") return "Festival";
  if (c === "performing-arts") return "Arts & Theatre";
  if (c === "sports") return "Sports";
  if (c === "community") return "Community";
  if (c === "expos") return "Expo";
  return "";
}

async function fromPredictHQ(lat, lng, radius, keyword) {
  const token = process.env.PREDICTHQ_TOKEN;
  if (!token) return { configured: false, events: [] };
  try {
    const p = new URLSearchParams({
      within: `${radius || 50}mi@${lat},${lng}`,
      "active.gte": today(), sort: "start", limit: "100",
      category: "concerts,festivals,performing-arts,sports,community,expos",
    });
    if (keyword) p.set("q", keyword);
    const r = await fetch(`https://api.predicthq.com/v1/events/?${p.toString()}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!r.ok) return { configured: true, ok: false, events: [] };
    const data = await r.json();
    const raw = data.results || [];
    const events = raw.map((e) => {
      const start = e.start || "";
      const ds = start.split("T");
      const date = ds[0] || "";
      const time = (ds[1] || "").slice(0, 8);
      const loc = Array.isArray(e.location) && e.location.length === 2 ? e.location : null;
      let venue = "";
      if (Array.isArray(e.entities)) { const ven = e.entities.find((x) => x.type === "venue"); if (ven) venue = ven.name || ""; }
      // Phase 1 (EVENTS_PIPELINE_DIAGNOSIS.md): this provider used to ship a
      // fabricated google.com/search URL as the "destination" -- the exact
      // banned pattern. PredictHQ's API genuinely carries no public event
      // URL at this tier, so these events have NO destination and the
      // pipeline excludes them. If PredictHQ coverage matters, that's a
      // data-enrichment conversation (owner), not a fake link.
      return {
        id: "phq_" + e.id, name: e.title || "", date, time,
        venue, city: "", lat: loc ? loc[1] : null, lng: loc ? loc[0] : null,
        segment: phqSegment(e.category), genre: "", image: null, price: null, url: "", ticketed: false, source: "PredictHQ",
        status: (e.state || "") === "deleted" ? "cancelled" : "",
      };
    });
    return { configured: true, events };
  } catch { return { configured: true, ok: false, events: [] }; }
}

// Bandsintown Partner Search API. Location-based concert discovery, gated by a
// partner key requested from api@bandsintown.com. Built to the documented shape
// at artists.bandsintown.com/support/partner-search-api. Stays inert until the
// key exists, and fails soft on any error so it never breaks the feed.
async function fromBandsintown(lat, lng, radius) {
  const key = process.env.BANDSINTOWN_PARTNER_KEY;
  if (!key) return { configured: false, events: [] };
  try {
    const q = {
      entities: [{ type: "event", order: "start_date", limit: 50, offset: 0 }],
      region: { latitude: Number(lat), longitude: Number(lng), radius: Math.min(Number(radius) || 50, 200) },
    };
    const url = `https://search.bandsintown.com/search?query=${encodeURIComponent(JSON.stringify(q))}`;
    const r = await fetch(url, { headers: { "x-api-key": key, Accept: "application/json" } });
    if (!r.ok) return { configured: true, ok: false, events: [] };
    const data = await r.json();
    const rawEvents = data.events || (Array.isArray(data) ? data : []) || [];
    const venuesById = {};
    (data.venues || []).forEach((v) => { if (v && v.id != null) venuesById[v.id] = v; });
    const artistsById = {};
    (data.artists || []).forEach((a) => { if (a && a.id != null) artistsById[a.id] = a; });
    const events = rawEvents.map((e) => {
      const v = e.venue_id != null && venuesById[e.venue_id] ? venuesById[e.venue_id] : (e.venue || null);
      const artist = e.artist_id != null && artistsById[e.artist_id] ? artistsById[e.artist_id] : null;
      const ds = (e.starts_at || "").split("T");
      return {
        id: "bit_" + e.id,
        name: e.title || (artist && artist.name) || "Live music",
        date: ds[0] || "",
        time: (ds[1] || "").slice(0, 8),
        venue: v ? v.name || "" : "",
        city: v ? v.location || "" : "",
        lat: v && v.latitude != null ? Number(v.latitude) : null,
        lng: v && v.longitude != null ? Number(v.longitude) : null,
        segment: "Music", genre: "",
        image: e.image_url || (artist && artist.image_url) || null,
        price: null,
        url: e.ticket_url || e.event_url || "",
        ticketed: !!e.ticket_available,
        source: "Bandsintown",
        status: "",
      };
    });
    return { configured: true, events };
  } catch { return { configured: true, ok: false, events: [] }; }
}


// v4.31 — Eventbrite, organizer-scoped. Eventbrite retired public event search
// in 2020, so the only sanctioned path is naming organizations you follow.
// EVENTBRITE_PRIVATE_TOKEN + EVENTBRITE_ORG_IDS (comma-separated organization
// ids) light this up; local orgs (museums, markets, chambers) are the win.
async function fromEventbriteOrgs(lat, lng, radius) {
  const token = (process.env["EVENTBRITE_PRIVATE_TOKEN"] || "").trim();
  const orgIds = (process.env["EVENTBRITE_ORG_IDS"] || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!token || !orgIds.length) return { configured: false, events: [] };
  try {
    const lists = await Promise.all(orgIds.slice(0, 10).map(async (org) => {
      try {
        const r = await fetch(`https://www.eventbriteapi.com/v3/organizations/${encodeURIComponent(org)}/events/?status=live&order_by=start_asc&expand=venue&page_size=50`, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) return [];
        const data = await r.json();
        return Array.isArray(data.events) ? data.events : [];
      } catch { return []; }
    }));
    const horizon = Date.now() + 60 * 86400000;
    const events = lists.flat().map((e) => {
      const startLocal = e.start && e.start.local ? e.start.local : "";
      const [date, time] = startLocal.split("T");
      const v = e.venue || null;
      const evLat = v && v.latitude != null ? Number(v.latitude) : null;
      const evLng = v && v.longitude != null ? Number(v.longitude) : null;
      return {
        id: "eb_" + e.id,
        name: e.name && e.name.text ? e.name.text : "",
        date: date || "", time: (time || "").slice(0, 8),
        venue: v && v.name ? v.name : "",
        city: v && v.address && v.address.city ? v.address.city : "",
        lat: evLat, lng: evLng,
        segment: "Community", genre: "",
        image: e.logo && e.logo.url ? e.logo.url : null,
        price: e.is_free ? "Free" : null,
        url: e.url || "",
        ticketed: !e.is_free,
        source: "Eventbrite",
        status: "",
      };
    }).filter((e) => {
      if (!e.name || !e.date) return false;
      const t = new Date(e.date + "T12:00:00").getTime();
      if (!(t >= Date.now() - 86400000 && t <= horizon)) return false;
      if (e.lat != null && e.lng != null && lat != null && lng != null) {
        return haversineMiLocal(lat, lng, e.lat, e.lng) <= Math.max(Number(radius) || 60, 60);
      }
      return true;
    });
    return { configured: true, events };
  } catch { return { configured: true, ok: false, events: [] }; }
}

// Google Events via SerpAPI. This is the long tail: markets, festivals, free
// community events, bar gigs, art walks, pulled from how Google aggregates local
// listings. Query based, so it needs a city string. Gated by SERPAPI_KEY, fail-soft.
function parseSerpDate(s) {
  if (!s) return "";
  const months = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const m = String(s).toLowerCase().match(/([a-z]{3,})\s+(\d{1,2})(?:,?\s*(\d{4}))?/);
  if (!m) return "";
  const mo = months[m[1].slice(0, 3)];
  if (mo == null) return "";
  const day = parseInt(m[2], 10);
  const now = new Date();
  const year = m[3] ? parseInt(m[3], 10) : now.getFullYear();
  let dt = new Date(year, mo, day);
  if (!m[3] && dt < new Date(now.getFullYear(), now.getMonth(), now.getDate())) dt = new Date(year + 1, mo, day);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}
async function fromSerpEvents(lat, lng, keyword, city) {
  const key = process.env.SERPAPI_KEY;
  if (!key) return { configured: false, events: [] };
  if (!city) return { configured: true, events: [] };
  try {
    const q = (keyword ? keyword + " events" : "events") + " in " + city;
    const p = new URLSearchParams({ engine: "google_events", q, hl: "en", gl: "us", api_key: key });
    const r = await fetch(`https://serpapi.com/search.json?${p.toString()}`);
    if (!r.ok) return { configured: true, ok: false, events: [] };
    const data = await r.json();
    const raw = data.events_results || [];
    const events = raw.map((e, i) => {
      const dd = e.date || {};
      const date = parseSerpDate(dd.start_date || dd.when || "");
      const addr = Array.isArray(e.address) ? e.address : [];
      const venue = (e.venue && e.venue.name) || addr[0] || "";
      const cityStr = addr.length > 1 ? addr[addr.length - 1] : "";
      let url = e.link || "";
      let ticketed = false;
      if (Array.isArray(e.ticket_info) && e.ticket_info.length) {
        const t = e.ticket_info.find((x) => (x.link_type || "").toLowerCase().includes("ticket")) || e.ticket_info[0];
        if (t && t.link) { url = t.link; ticketed = true; }
      }
      return {
        id: "ge_" + i + "_" + (date || "x"),
        name: e.title || "", date, time: "",
        venue, city: cityStr, lat: null, lng: null,
        segment: "Event", genre: "", image: e.thumbnail || e.image || null,
        price: null, url, ticketed, source: "Google",
        status: "",
      };
    }).filter((e) => e.name && e.date);
    return { configured: true, events };
  } catch { return { configured: true, ok: false, events: [] }; }
}

async function fromOpenWebNinja(lat, lng, keyword, city) {
  const key = process.env.OPENWEBNINJA_KEY;
  if (!key) return { configured: false, events: [] };
  if (!city) return { configured: true, events: [] };
  try {
    const q = (keyword ? keyword + " events" : "events") + " in " + city;
    const p = new URLSearchParams({ query: q, date: "month", is_virtual: "false" });
    const r = await fetch(`https://api.openwebninja.com/realtime-events-data/search-events?${p.toString()}`, { headers: { "x-api-key": key } });
    if (!r.ok) return { configured: true, ok: false, events: [] };
    const data = await r.json();
    const raw = data.data || data.events || (Array.isArray(data) ? data : []) || [];
    const events = raw.map((e, i) => {
      const start = e.start_time || e.start_time_utc || "";
      let date = "";
      let time = "";
      if (/\d{4}-\d{2}-\d{2}/.test(String(start))) {
        const parts = String(start).split(/[ T]/);
        date = parts[0];
        time = (parts[1] || "").slice(0, 8);
      } else {
        date = parseSerpDate(e.date_human_readable || start);
      }
      const ven = e.venue || {};
      let url = e.link || "";
      let ticketed = false;
      if (Array.isArray(e.ticket_links) && e.ticket_links.length && e.ticket_links[0].link) { url = e.ticket_links[0].link; ticketed = true; }
      return {
        id: "own_" + (e.event_id || i) + "_" + (date || "x"),
        name: e.name || "", date, time,
        venue: ven.name || "", city: ven.city || "",
        lat: ven.latitude != null ? Number(ven.latitude) : null,
        lng: ven.longitude != null ? Number(ven.longitude) : null,
        segment: "Event", genre: "", image: e.thumbnail || null,
        price: null, url, ticketed, source: "Google",
        status: "",
      };
    }).filter((e) => e.name && e.date);
    return { configured: true, events };
  } catch { return { configured: true, ok: false, events: [] }; }
}

// --- Manatee County Public Library (LibCal) ---------------------------------
// Public iCal feed, no key required (cid 14834). Parsed, curated, and gated by
// proximity so we never show Manatee events to someone exploring elsewhere.
// Fail-soft like every other source: any error yields an empty list.
// (ICS parsing + staples generation live in lib/eventResolve.js since Phase 1
// so the /events/[city]/[slug] detail page resolves the same records.)
function haversineMiLocal(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
// Routine recurring programs we curate OUT, so the card surfaces discovery-worthy
// events (author talks, special programs, all-ages) rather than a wall of repeats.
const LIBCAL_ROUTINE = ["story time", "storytime", "baby", "toddler", "lapsit", "mother goose", "tech help", "one-on-one", "one on one", "drop-in", "drop in", "playgroup", "open play", "stay and play", "study hall", "tax aide", "tax-aide", "book a librarian", "sensory", "homework help"];
function libcalIsRoutine(title) {
  const t = (title || "").toLowerCase();
  return LIBCAL_ROUTINE.some((k) => t.includes(k));
}
async function fromLibCal(lat, lng) {
  if (lat == null || lng == null) return { configured: false, events: [] };
  // Bradenton, center of Manatee County. Only serve this feed inside the region.
  const inRegion = haversineMiLocal(lat, lng, 27.4799, -82.5748) <= 35;
  if (!inRegion) return { configured: true, events: [] };
  try {
    const r = await fetch(LIBCAL_FEED, { headers: { "User-Agent": "Wayfind/1.0 (+https://www.gowayfind.com)" } });
    if (!r.ok) return { configured: true, ok: false, events: [] };
    const text = await r.text();
    const raw = parseLibCalICS(text);
    const now = new Date();
    const horizon = new Date(now.getTime() + 60 * 86400000); // v4.87: generous window
    const parsed = raw
      .map((e) => ({ e, ds: e.start ? parseICSDate(e.start) : null }))
      .filter((x) => x.ds && x.ds.dt);
    parsed.sort((a, b) => a.ds.dt - b.ds.dt);
    const seen = new Set();
    const out = [];
    for (const { e, ds } of parsed) {
      if (ds.dt < now || ds.dt > horizon) continue;
      if (!e.summary) continue;
      if (/^cancelled/i.test(e.summary)) continue;
      const title = e.summary.replace(/^cancelled:?\s*/i, "").trim();
      if (!title || libcalIsRoutine(title)) continue;
      const norm = title.toLowerCase();
      if (seen.has(norm)) continue;
      seen.add(norm);
      out.push({
        id: libcalId(e.uid, norm),
        name: title,
        date: ds.date,
        time: ds.time,
        venue: e.location || "",
        city: "",
        segment: "Community",
        genre: e.categories || "",
        image: null,
        price: null,
        url: e.url || "https://manateelibrary.libcal.com/calendar/events",
        ticketed: false,
        civic: true,
        source: "Manatee County Library",
        status: "",
      });
      if (out.length >= 40) break; // v4.87: raised from 12
    }
    return { configured: true, events: out };
  } catch { return { configured: true, ok: false, events: [] }; }
}

// --- Business events (v6.21) ------------------------------------------------
// Local businesses that publish a public calendar (iCal preferred, RSS best-
// effort). Fail-soft like every other provider, and configured:false when no
// feed exists yet, so the "unavailable" logic is unaffected until the owner
// adds the first business. Each feed is geo-fenced to its own coordinates.
async function fromBusinessFeeds(lat, lng, radius) {
  const feeds = getBusinessFeeds();
  if (!feeds.length) return { configured: false, events: [] };
  const R = Math.max(Number(radius) || 25, 25) + 10; // small buffer past the search radius
  const near = feeds.filter((f) => haversineMiLocal(lat, lng, Number(f.lat), Number(f.lng)) <= R);
  if (!near.length) return { configured: true, events: [] };
  const now = new Date();
  try {
    const lists = await Promise.all(near.map(async (f) => {
      try {
        const r = await fetch(f.url, { headers: { "User-Agent": "Wayfind/1.0 (+https://www.gowayfind.com)" } });
        if (!r.ok) return [];
        return businessEventsFrom(f, await r.text(), now);
      } catch { return []; }
    }));
    return { configured: true, events: [].concat(...lists) };
  } catch { return { configured: true, ok: false, events: [] }; }
}

// Phase 1: partial-failure isolation. Each provider runs behind its own
// deadline; a hung provider yields { timedOut } after `ms` instead of
// stalling the whole response, and never touches the other providers.
const PROVIDER_TIMEOUT_MS = 6000;
function withDeadline(provider, promise, ms = PROVIDER_TIMEOUT_MS) {
  const started = Date.now();
  return Promise.race([
    Promise.resolve(promise).then((r) => ({ provider, ...r, ms: Date.now() - started })),
    new Promise((resolve) => setTimeout(() => resolve({ provider, configured: true, ok: false, timedOut: true, events: [], ms }), ms)),
  ]).catch(() => ({ provider, configured: true, ok: false, events: [], ms: Date.now() - started }));
}

// v5.90: shared cache. Events are time-sensitive, so we ALWAYS prefer a fresh
// aggregation and only fall back to the cache when the live providers come back
// empty (e.g. SerpApi hit its cap). On any cache serve we FILTER OUT past events
// (never show an event whose date has passed) — that date filter is the
// freshness guard, so the TTL can be generous (21 days).
// v6.55: the aggregation body is shared between POST (interactive/keyworded,
// always fresh) and GET (the LCP-critical primer/default-feed call, which the
// CDN may cache for 15 min per rounded center — see GET below).
async function aggregateEvents({ lat, lng, keyword, radius, city }) {
  let evK = null;
  const todayStr = today();
  const upcoming = (evs) => (evs || []).filter((e) => e && (!e.date || e.date >= todayStr));
  const staleEvents = async () => {
    if (!evK) return null;
    const s = await cget(evK, { staleMs: 30 * DAY });
    if (!s) return null;
    const up = upcoming(s.v);
    return up.length ? { events: up, cached: true, stale: true, sources: [], counts: {}, health: [] } : null;
  };
  try {
    if (lat == null || lng == null) return { events: [] };
    evK = "ev1|" + Number(lat).toFixed(2) + "|" + Number(lng).toFixed(2) + "|" + (radius || 25) + "|" + String(city || "").toLowerCase().slice(0, 40) + "|" + String(keyword || "").toLowerCase().slice(0, 40);
    if (keyword === "__forceErr__") { const s = await staleEvents(); return s || { events: [] }; } // test hook

    const results = await Promise.all([
      withDeadline("Ticketmaster", fromTicketmaster(lat, lng, radius, keyword)),
      withDeadline("SeatGeek", fromSeatGeek(lat, lng, radius, keyword)),
      withDeadline("PredictHQ", fromPredictHQ(lat, lng, radius, keyword)),
      withDeadline("Bandsintown", fromBandsintown(lat, lng, radius, keyword)),
      withDeadline("Google (SerpAPI)", fromSerpEvents(lat, lng, keyword, city)),
      withDeadline("Google (OpenWebNinja)", fromOpenWebNinja(lat, lng, keyword, city)),
      withDeadline("Manatee County Library", fromLibCal(lat, lng)),
      withDeadline("Eventbrite", fromEventbriteOrgs(lat, lng, radius)),
      withDeadline("Business", fromBusinessFeeds(lat, lng, radius)),
      withDeadline("Local staples", Promise.resolve(localStaplesFor(lat, lng))),
    ]);

    const configuredCount = results.filter((r) => r.configured).length;
    if (configuredCount === 0) { const s = await staleEvents(); return s || { unavailable: true, events: [], sources: [] }; }

    const { events, usableCount, health, excludedByReason } = processEvents(results, { lat, lng, radius, city });

    // Provider health where the owner can see trends (Vercel function logs).
    try { console.log(JSON.stringify({ tag: "events_provider_health", health: health.filter((h) => h.configured), excludedByReason, usableCount })); } catch (e) {}

    const sources = [...new Set(results.filter((r) => r.configured).map((r) => r.provider))];
    // Per-source USABLE counts (post-validation/dedup/destination) -- the
    // old field reported raw provider totals, which never matched the feed.
    const counts = {};
    for (const e of events) counts[e.source] = (counts[e.source] || 0) + 1;
    // Fresh aggregation with events -> cache it (dates included) for the fallback, then return.
    if (events.length) { await cset(evK, events, 21 * DAY); return { events, usableCount, sources, counts, health: health.filter((h) => h.configured) }; }
    // Live returned nothing (providers limited/failed) -> serve cached UPCOMING events.
    const s = await staleEvents();
    return s || { events, usableCount, sources, counts, health: health.filter((h) => h.configured) };
  } catch (e) {
    const s = await staleEvents();
    return s || { error: true, events: [] };
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    return Response.json(await aggregateEvents(body || {}), { status: 200 });
  } catch (e) {
    return Response.json({ error: true, events: [] }, { status: 200 });
  }
}

// v6.55 perf: the edge-cacheable twin for the DEFAULT feed only (no keyword —
// the test hook and interactive searches stay on POST, always fresh). Callers
// round coords to 2dp (~1.1 km — the SAME granularity the server cache key
// already used), so nearby visitors share one CDN entry and a cold homepage
// gets its LCP-critical events without a function invocation. Past-event
// safety holds: 15 min s-maxage can never resurrect a finished event because
// the payload is date-filtered and TTL << a day.
export async function GET(req) {
  const sp = new URL(req.url).searchParams;
  const lat = parseFloat(sp.get("lat")), lng = parseFloat(sp.get("lng"));
  const radius = Math.max(1, Math.min(100, parseInt(sp.get("radius") || "25", 10) || 25));
  const city = String(sp.get("city") || "").slice(0, 40);
  const payload = await aggregateEvents({ lat: isFinite(lat) ? lat : null, lng: isFinite(lng) ? lng : null, keyword: null, radius, city });
  return Response.json(payload, {
    status: 200,
    headers: { "cache-control": "public, s-maxage=900, stale-while-revalidate=3600" },
  });
}
