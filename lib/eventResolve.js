// Events pipeline integrity, Phases 1-3 (EVENTS_PIPELINE_DIAGNOSIS.md).
// Server-side: (a) the shared provider helpers that both the aggregator
// route and the detail page need (LibCal iCal parsing, the curated local
// staples generator), and (b) resolveEventById -- given the id embedded in
// an internal /events/[city]/[slug] URL, re-fetch that one event from its
// provider so a shared/reloaded link renders real, current data. Only the
// providers in lib/eventsPipeline.js RESOLVABLE_ID are supported here, by
// design: an internal URL we can't re-resolve later is a future 404.

import { haversineMi } from "./eventsPipeline.js";

// --- LibCal iCal parsing (moved verbatim from app/api/events/route.js) ---
export function unfoldICS(text) {
  return text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}
export function unescapeICS(s) {
  return (s || "").replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}
export function parseICSDate(val) {
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
export function parseLibCalICS(text) {
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
export const LIBCAL_FEED = "https://manateelibrary.libcal.com/ical_subscribe.php?cid=14834";
export function libcalId(uid, normTitle) {
  return "lib_" + String(uid || normTitle).replace(/[^a-z0-9]/gi, "").slice(0, 40);
}

// --- Curated local staples (moved verbatim from app/api/events/route.js;
// the recurring events small towns actually run on, facts from the venues'
// own materials, geo-fenced to the Parrish / Manatee region) ---
export function localStaplesFor(lat, lng) {
  if (lat == null || lng == null) return { configured: false, events: [] };
  const near = (clat, clng, mi) => haversineMi(lat, lng, clat, clng) <= mi;
  const inParrishRegion = near(27.5859, -82.4254, 30);
  if (!inParrishRegion) return { configured: true, events: [] };
  return { configured: true, events: generateStaples() };
}
// opts.back (weeks in the past to also emit) is used ONLY by resolveEventById
// so a just-passed staple id still resolves to its page instead of 404-ing
// (owner-reported "Safari can't open" on The Market at Waterside — the feed's
// id embeds a date, and a tap a day later fell outside the forward-only
// window). The feed generator keeps back:0 (future only).
export function generateStaples(now = new Date(), opts = {}) {
  const back = Math.max(0, opts.back || 0);
  const out = [];
  const d = now;
  const pushOn = (target, ev) => {
    const date = target.toISOString().slice(0, 10);
    out.push({ ...ev, id: ev.id + "_" + date, date, time: "", price: ev.price || null, ticketed: !!ev.ticketed, civic: true, source: "Local staples" });
  };
  const days = (dow, weeks) => {
    const arr = [];
    for (let w = -back; w < weeks; w++) {
      const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + ((dow - d.getDay() + 7) % 7) + w * 7);
      const floor = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back * 7).getTime();
      if (t.getTime() >= floor) arr.push(t);
    }
    return arr;
  };
  for (const t of days(0, 3)) {
    pushOn(t, { id: "ls_waterside_market", name: "The Market at Waterside Place", venue: "Waterside Place, Lakewood Ranch", city: "Lakewood Ranch", lat: 27.3934, lng: -82.4415, segment: "Community", genre: "Farmers market", image: null, url: "https://mywatersideplace.com", ticketed: false });
    pushOn(t, { id: "ls_frm_sun", name: "Florida Railroad Museum scenic train ride", venue: "Florida Railroad Museum", city: "Parrish", lat: 27.5837, lng: -82.4273, segment: "Family", genre: "Heritage railroad", image: null, url: "https://frrm.org", ticketed: true });
  }
  for (const t of days(6, 3)) {
    pushOn(t, { id: "ls_frm_sat", name: "Florida Railroad Museum scenic train ride", venue: "Florida Railroad Museum", city: "Parrish", lat: 27.5837, lng: -82.4273, segment: "Family", genre: "Heritage railroad", image: null, url: "https://frrm.org", ticketed: true });
  }
  return out;
}

// --- By-id resolution -------------------------------------------------

async function resolveTicketmaster(rawId) {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) return null;
  try {
    const r = await fetch(`https://app.ticketmaster.com/discovery/v2/events/${encodeURIComponent(rawId)}.json?apikey=${encodeURIComponent(key)}`, { next: { revalidate: 600 } });
    if (!r.ok) return null;
    const e = await r.json();
    if (!e || !e.id) return null;
    const dates = e.dates && e.dates.start ? e.dates.start : {};
    const status = e.dates && e.dates.status && e.dates.status.code ? e.dates.status.code : "";
    const venue = e._embedded && e._embedded.venues && e._embedded.venues[0] ? e._embedded.venues[0] : null;
    const vloc = venue && venue.location ? venue.location : null;
    let img = null;
    if (Array.isArray(e.images) && e.images.length) {
      const wide = e.images.filter((i) => i.ratio === "16_9").sort((a, b) => (b.width || 0) - (a.width || 0));
      img = (wide[0] || e.images[0]).url;
    }
    const cls = Array.isArray(e.classifications) && e.classifications[0] ? e.classifications[0] : null;
    let price = null;
    if (Array.isArray(e.priceRanges) && e.priceRanges.length) {
      const pr = e.priceRanges[0];
      const cur = pr.currency === "USD" ? "$" : (pr.currency ? pr.currency + " " : "");
      if (pr.min != null && pr.max != null) price = pr.min === pr.max ? `${cur}${Math.round(pr.min)}` : `${cur}${Math.round(pr.min)} to ${cur}${Math.round(pr.max)}`;
    }
    return {
      id: "tm_" + e.id, name: e.name || "", date: dates.localDate || "", time: dates.localTime || "",
      venue: venue ? venue.name || "" : "", city: venue && venue.city ? venue.city.name || "" : "",
      address: venue && venue.address && venue.address.line1 ? venue.address.line1 : "",
      lat: vloc && vloc.latitude != null ? Number(vloc.latitude) : null,
      lng: vloc && vloc.longitude != null ? Number(vloc.longitude) : null,
      segment: cls && cls.segment ? cls.segment.name : "", genre: cls && cls.genre ? cls.genre.name : "",
      image: img, price, url: e.url || "", ticketed: true, source: "Ticketmaster",
      status, description: e.info || e.pleaseNote || "",
    };
  } catch { return null; }
}

async function resolveLibCal(fullId) {
  try {
    const r = await fetch(LIBCAL_FEED, { headers: { "User-Agent": "Wayfind/1.0 (+https://www.gowayfind.com)" }, next: { revalidate: 3600 } });
    if (!r.ok) return null;
    const raw = parseLibCalICS(await r.text());
    for (const e of raw) {
      if (!e.summary) continue;
      const title = e.summary.replace(/^cancelled:?\s*/i, "").trim();
      const norm = title.toLowerCase();
      if (libcalId(e.uid, norm) !== fullId) continue;
      const ds = e.start ? parseICSDate(e.start) : null;
      if (!ds) return null;
      return {
        id: fullId, name: title, date: ds.date, time: ds.time,
        venue: e.location || "", city: "Bradenton", address: "",
        lat: null, lng: null, segment: "Community", genre: e.categories || "",
        image: null, price: null,
        url: e.url || "https://manateelibrary.libcal.com/calendar/events",
        ticketed: false, civic: true, source: "Manatee County Library",
        status: /^cancelled/i.test(e.summary) ? "cancelled" : "",
        description: e.description || "",
      };
    }
    return null;
  } catch { return null; }
}

function resolveStaple(fullId) {
  // Resolve against a wider window (2 weeks back) than the feed emits, so a
  // staple tapped a day or two after the feed loaded still resolves to its
  // page instead of 404-ing.
  const hit = generateStaples(new Date(), { back: 2 }).find((e) => e.id === fullId);
  if (!hit) return null;
  return { ...hit, address: "", status: "", description: "" };
}

// The one entry point the detail page uses. Returns the normalized event
// (with `status` populated so a cancelled event can render an explicit
// cancelled state instead of a normal page) or null -> the page 404s.
export async function resolveEventById(id) {
  const safe = String(id || "").trim();
  if (!safe || safe.length > 120) return null;
  if (safe.startsWith("tm_")) return resolveTicketmaster(safe.slice(3));
  if (safe.startsWith("lib_")) return resolveLibCal(safe);
  if (safe.startsWith("ls_")) return resolveStaple(safe);
  return null;
}

// Parse "/events/[city]/[slug]" slug: "<title-slug>--<encoded-id>".
export function idFromSlug(slug) {
  const s = String(slug || "");
  const idx = s.lastIndexOf("--");
  if (idx === -1) return null;
  try { return decodeURIComponent(s.slice(idx + 2)); } catch { return null; }
}
