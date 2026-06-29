export const runtime = "nodejs";

// Unified local-events feed. Calls every configured provider in parallel,
// normalizes each to one shape, merges, and de-duplicates. Every provider is
// optional and gated by its own env key: a missing key simply skips that source
// and the others still work. Any provider error fails soft to an empty list, so
// the events screen never breaks. "unavailable" is only true when NO provider
// is configured at all.

function isoNowZ() {
  return new Date().toISOString().slice(0, 19) + "Z";
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

async function fromTicketmaster(lat, lng, radius, keyword) {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) return { configured: false, events: [] };
  try {
    const p = new URLSearchParams({
      apikey: key, latlong: `${lat},${lng}`, radius: String(radius || 60),
      unit: "miles", sort: "date,asc", size: "100", startDateTime: isoNowZ(),
    });
    if (keyword) p.set("keyword", keyword);
    const r = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?${p.toString()}`);
    if (!r.ok) return { configured: true, events: [] };
    const data = await r.json();
    const raw = (data._embedded && data._embedded.events) || [];
    const events = raw.map((e) => {
      const dates = e.dates && e.dates.start ? e.dates.start : {};
      const venue = e._embedded && e._embedded.venues && e._embedded.venues[0] ? e._embedded.venues[0] : null;
      const vloc = venue && venue.location ? venue.location : null;
      let img = null;
      if (Array.isArray(e.images) && e.images.length) {
        const wide = e.images.filter((i) => i.ratio === "16_9").sort((a, b) => (b.width || 0) - (a.width || 0));
        img = (wide[0] || e.images[0]).url;
      }
      const cls = Array.isArray(e.classifications) && e.classifications[0] ? e.classifications[0] : null;
      const seg = cls && cls.segment ? cls.segment.name : "";
      const genre = cls && cls.genre ? cls.genre.name : "";
      let price = null;
      if (Array.isArray(e.priceRanges) && e.priceRanges.length) {
        const pr = e.priceRanges[0];
        const cur = pr.currency === "USD" ? "$" : (pr.currency ? pr.currency + " " : "");
        if (pr.min != null && pr.max != null) price = pr.min === pr.max ? `${cur}${Math.round(pr.min)}` : `${cur}${Math.round(pr.min)} to ${cur}${Math.round(pr.max)}`;
      }
      return {
        id: "tm_" + e.id, name: e.name || "", date: dates.localDate || "", time: dates.localTime || "",
        venue: venue ? venue.name || "" : "", city: venue && venue.city ? venue.city.name || "" : "",
        lat: vloc && vloc.latitude != null ? Number(vloc.latitude) : null,
        lng: vloc && vloc.longitude != null ? Number(vloc.longitude) : null,
        segment: seg, genre, image: img, price, url: e.url || "", ticketed: true, source: "Ticketmaster",
      };
    });
    return { configured: true, events };
  } catch { return { configured: true, events: [] }; }
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
      per_page: "40", sort: "datetime_asc",
    });
    p.set("datetime_utc.gte", new Date().toISOString().slice(0, 19));
    if (keyword) p.set("q", keyword);
    const secret = process.env.SEATGEEK_CLIENT_SECRET;
    if (secret) p.set("client_secret", secret);
    const r = await fetch(`https://api.seatgeek.com/2/events?${p.toString()}`);
    if (!r.ok) return { configured: true, events: [] };
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
      };
    });
    return { configured: true, events };
  } catch { return { configured: true, events: [] }; }
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
    if (!r.ok) return { configured: true, events: [] };
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
      const url = `https://www.google.com/search?q=${encodeURIComponent((e.title || "") + " " + (venue || (e.country || "")))}`;
      return {
        id: "phq_" + e.id, name: e.title || "", date, time,
        venue, city: "", lat: loc ? loc[1] : null, lng: loc ? loc[0] : null,
        segment: phqSegment(e.category), genre: "", image: null, price: null, url, ticketed: false, source: "PredictHQ",
      };
    });
    return { configured: true, events };
  } catch { return { configured: true, events: [] }; }
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
    if (!r.ok) return { configured: true, events: [] };
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
      };
    });
    return { configured: true, events };
  } catch { return { configured: true, events: [] }; }
}

function dedupe(all) {
  const norm = (s) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40);
  const rank = { Ticketmaster: 5, SeatGeek: 4, Bandsintown: 3, PredictHQ: 2, Google: 1 };
  const map = new Map();
  for (const e of all) {
    if (!e || !e.name) continue;
    const k = norm(e.name) + "|" + (e.date || "");
    const ex = map.get(k);
    if (!ex) { map.set(k, e); continue; }
    // Keep the richer source; if the winner lacks coords/image the other has, borrow them.
    const keep = (rank[e.source] || 0) > (rank[ex.source] || 0) ? e : ex;
    const other = keep === e ? ex : e;
    if (keep.lat == null && other.lat != null) { keep.lat = other.lat; keep.lng = other.lng; }
    if (!keep.image && other.image) keep.image = other.image;
    if (!keep.price && other.price) keep.price = other.price;
    map.set(k, keep);
  }
  return Array.from(map.values());
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
    if (!r.ok) return { configured: true, events: [] };
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
      };
    }).filter((e) => e.name && e.date);
    return { configured: true, events };
  } catch { return { configured: true, events: [] }; }
}

async function fromOpenWebNinja(lat, lng, keyword, city) {
  const key = process.env.OPENWEBNINJA_KEY;
  if (!key) return { configured: false, events: [] };
  if (!city) return { configured: true, events: [] };
  try {
    const q = (keyword ? keyword + " events" : "events") + " in " + city;
    const p = new URLSearchParams({ query: q, date: "month", is_virtual: "false" });
    const r = await fetch(`https://api.openwebninja.com/realtime-events-data/search-events?${p.toString()}`, { headers: { "x-api-key": key } });
    if (!r.ok) return { configured: true, events: [] };
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
      };
    }).filter((e) => e.name && e.date);
    return { configured: true, events };
  } catch { return { configured: true, events: [] }; }
}

// --- Manatee County Public Library (LibCal) ---------------------------------
// Public iCal feed, no key required (cid 14834). Parsed, curated, and gated by
// proximity so we never show Manatee events to someone exploring elsewhere.
// Fail-soft like every other source: any error yields an empty list.
function haversineMi(lat1, lng1, lat2, lng2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function unfoldICS(text) {
  // RFC 5545 line unfolding: a line break followed by space or tab continues the prior line.
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}
function unescapeICS(s) {
  return (s || "").replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}
function parseICSDate(val) {
  const m = (val || "").match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?/);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const hasTime = m[4] != null;
  const hh = hasTime ? m[4] : null, mi = hasTime ? m[5] : null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  const time = hasTime ? `${hh}:${mi}` : "";
  let dt;
  if (hasTime) dt = m[7] ? new Date(Date.UTC(y, mo - 1, d, +hh, +mi)) : new Date(y, mo - 1, d, +hh, +mi);
  else dt = new Date(y, mo - 1, d);
  return { date, time, dt };
}
function parseLibCalICS(text) {
  const lines = unfoldICS(text).split(/\r\n|\n|\r/);
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).split(";")[0].toUpperCase();
    const val = line.slice(idx + 1);
    if (key === "SUMMARY") cur.summary = unescapeICS(val);
    else if (key === "DTSTART") cur.start = val;
    else if (key === "LOCATION") cur.location = unescapeICS(val);
    else if (key === "DESCRIPTION") cur.description = unescapeICS(val);
    else if (key === "URL") cur.url = val.trim();
    else if (key === "UID") cur.uid = val.trim();
    else if (key === "CATEGORIES") cur.categories = unescapeICS(val);
  }
  return events;
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
  const inRegion = haversineMi(lat, lng, 27.4799, -82.5748) <= 35;
  if (!inRegion) return { configured: true, events: [] };
  try {
    const r = await fetch("https://manateelibrary.libcal.com/ical_subscribe.php?cid=14834", { headers: { "User-Agent": "Wayfind/1.0 (+https://wayfind-xi.vercel.app)" } });
    if (!r.ok) return { configured: true, events: [] };
    const text = await r.text();
    const raw = parseLibCalICS(text);
    const now = new Date();
    const horizon = new Date(now.getTime() + 21 * 86400000);
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
        id: "lib_" + (e.uid || norm).replace(/[^a-z0-9]/gi, "").slice(0, 40),
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
      });
      if (out.length >= 12) break;
    }
    return { configured: true, events: out };
  } catch { return { configured: true, events: [] }; }
}

// Pull a 2-letter US state out of a "City, ST" style string. Used to keep
// coordinate-less event results (Google) in the user's own region.
function stateOf(s) {
  if (!s) return "";
  const parts = String(s).split(",").map((x) => x.trim()).filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const m = parts[i].match(/^([A-Za-z]{2})$/);
    if (m) return m[1].toUpperCase();
  }
  return "";
}

export async function POST(req) {
  try {
    const { lat, lng, keyword, radius, city } = await req.json();
    if (lat == null || lng == null) return Response.json({ events: [] }, { status: 200 });

    const results = await Promise.all([
      fromTicketmaster(lat, lng, radius, keyword),
      fromSeatGeek(lat, lng, radius, keyword),
      fromPredictHQ(lat, lng, radius, keyword),
      fromBandsintown(lat, lng, radius, keyword),
      fromSerpEvents(lat, lng, keyword, city),
      fromOpenWebNinja(lat, lng, keyword, city),
      fromLibCal(lat, lng),
    ]);

    const configuredCount = results.filter((r) => r.configured).length;
    if (configuredCount === 0) return Response.json({ unavailable: true, events: [], sources: [] }, { status: 200 });

    let merged = dedupe(results.flatMap((r) => r.events || []));
    // Proximity guard: tiny towns make the city-string event search (Google) return
    // far, national results, e.g. California events for a Florida user. Drop anything
    // clearly outside the user's region before ranking. Coord-bearing events must be
    // within range; coord-less ones (Google) must at least share the user's state.
    const userState = stateOf(city);
    const maxMi = Math.min(Math.max(Number(radius) || 30, 5), 100); // enforce the user's search radius, no wide floor
    merged = merged.filter((e) => {
      if (e.lat != null && e.lng != null) return haversineMi(lat, lng, e.lat, e.lng) <= maxMi;
      const es = stateOf(e.city);
      return userState && es ? es === userState : false;
    });
    merged = merged.filter((e) => e.date).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || ""))).slice(0, 90);

    const labels = ["Ticketmaster", "SeatGeek", "PredictHQ", "Bandsintown", "Google", "Google", "Manatee County Library"];
    const sources = [...new Set(labels.filter((_, i) => results[i] && results[i].configured))];
    const counts = {};
    labels.forEach((lab, i) => { if (results[i] && results[i].configured) counts[lab] = (counts[lab] || 0) + ((results[i].events && results[i].events.length) || 0); });
    return Response.json({ events: merged, sources, counts }, { status: 200 });
  } catch (e) {
    return Response.json({ error: true, events: [] }, { status: 200 });
  }
}
