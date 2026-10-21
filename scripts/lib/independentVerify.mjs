// scripts/lib/independentVerify.mjs — PURE logic for the 2026-10-21 GOOGLE-FREE
// re-verification of the 247 coordinates held from PR #1809 (counsel Q1).
// No network, no database. Used by scripts/verify-coords-independent.mjs and
// locked by scripts/test-coords-independent-verified.mjs.
//
// WHY. The 192 Wikidata rows (20261015180000_*) and the 55 Census rows
// (20261015180100_*) were accepted only after agreeing with a fresh Google
// coordinate, and the Wikidata rows were found through a Wikipedia search on
// the (Google-sourced) inventory name. Both files stay ON HOLD. This pass
// tries to rebuild each row from evidence that contains NO Google input:
//
//   LOCATION  two non-Google sources must agree:
//     wikidata rows  Wikidata P625 (CC0) vs the US Census geocode (public
//                    domain) of an address the venue itself publishes — its
//                    official website (Wikidata P856) or the organiser page a
//                    Wayfind editor linked in wf_events.
//     census rows    the organiser/venue page, fetched again today, still
//                    states the editor-typed address; its Census geocode then
//                    agrees with a second non-Google point: a Wikidata item
//                    for the venue (P625) or a second official page stating
//                    the same address.
//   IDENTITY  the place_id <-> venue link must come from a Wayfind-owned
//             field, never the Google name: an editor's wf_events link
//             (venue typed from the organiser page), the owner-supplied Atlas
//             sheet (data/atlas/atlas-590.tsv, Foursquare-derived names and
//             addresses), or a Wayfind-written editorial pick name. A row
//             whose only identity link is the Google-name -> Wikipedia match
//             is flagged identity_google_name and is NEVER written.
//
// Classes: VERIFIED_INDEPENDENT (both rules met), PARTIAL (one non-Google
// location source only, or location verified but identity only via a Google
// name), FAILED (sources disagree, or no usable source).

export const VERIFIED = "VERIFIED_INDEPENDENT";
export const PARTIAL = "PARTIAL";
export const FAILED = "FAILED";
export const WIKIDATA_VERIFIED_METHOD = "wikidata-p625-official-address-verified";
export const CENSUS_VERIFIED_METHOD = "census-geocoder-official-address-reverified";

// Identity bases that contain no Google content. Anything else is refused.
export const NON_GOOGLE_IDENTITY = new Set(["editor-event-link", "atlas-owner-sheet", "editorial-pick"]);

const WIDE = new Set(["attractions", "beach", "activities"]);
export function agreementLimitM(category) {
  return WIDE.has(String(category || "").toLowerCase()) ? 1500 : 250;
}

export function validLatLng(lat, lng) {
  return typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 90
    && typeof lng === "number" && Number.isFinite(lng) && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}
export function haversineM(a, b) {
  const R = 6371000, r = (d) => (d * Math.PI) / 180;
  const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// A URL is Google-hosted (maps links, Places photos, goo.gl short links) ->
// never acceptable as evidence.
export function isGoogleUrl(u) {
  try {
    const h = new URL(String(u)).hostname.toLowerCase();
    return /(^|\.)google\.[a-z.]+$/.test(h) || /(^|\.)goo\.gl$/.test(h) || /(^|\.)googleapis\.com$/.test(h) || /(^|\.)googleusercontent\.com$/.test(h) || h === "g.page" || h === "maps.app.goo.gl";
  } catch { return false; }
}

// Registrable-ish domain (last two labels; good enough for venue sites).
export function siteDomain(u) {
  try {
    const parts = new URL(String(u)).hostname.toLowerCase().split(".").filter(Boolean);
    return parts.slice(-2).join(".") || null;
  } catch { return null; }
}

// ── names ───────────────────────────────────────────────────────────────────
const STOP = new Set(["the", "of", "at", "and", "a", "an", "in", "on", "for", "to", "fl", "florida", "inc", "llc", "co", "&"]);
export function nameTokens(s) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/['’`]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter((t) => t && !STOP.has(t))
    .map((t) => (t === "st" ? "saint" : t === "mt" ? "mount" : t === "ft" ? "fort" : t));
}
// Overlap of significant tokens over the SHORTER name; at least one shared
// token of 4+ characters so "Park" vs "Park" alone never links two places.
export function nameMatchScore(a, b) {
  const A = new Set(nameTokens(a)), B = new Set(nameTokens(b));
  if (!A.size || !B.size) return 0;
  let shared = 0, long = false;
  for (const t of A) if (B.has(t)) { shared++; if (t.length >= 4) long = true; }
  if (!long) return 0;
  return shared / Math.min(A.size, B.size);
}
export const NAME_MATCH_FLOOR = 0.75;
export function bestNameMatch(name, candidates) {
  let best = { score: 0, label: null };
  for (const c of candidates || []) {
    const s = nameMatchScore(name, c);
    if (s > best.score) best = { score: s, label: c };
  }
  return best;
}

// ── addresses ───────────────────────────────────────────────────────────────
const SUFFIX = "(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Hwy|Highway|Trl|Trail|Way|Ln|Lane|Pkwy|Parkway|Pl|Place|Ct|Court|Cir|Circle|Ter|Terrace|Sq|Square|Plaza|Plz|Loop|Pike|Causeway|Cswy|Row|Pt|Point|Path|Pass|Run|Walk|Bay|Isle|Key|Xing|Crossing|Expy|Expressway|Fwy|Freeway|Byp|Bypass|Bnd|Bend|Cv|Cove|Holw|Hollow|Mall|Ests?|Estates|Grn|Green|Ldg|Landing|Rte?|Route|Aly|Alley|Cres|Crescent|Ctr|Center|Centre|Park|Pier|Wharf|Ridge|Rdg|Dr\.)";
const STATES = "(?:AL|AK|AZ|AR|CA|CO|CT|DE|DC|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|Florida|Texas|Georgia|Alabama|California|New York|Massachusetts|Tennessee|Louisiana|North Carolina|South Carolina|Virginia|Maine|Colorado|Arizona|Washington|Pennsylvania|Illinois|Michigan|Ohio|Oregon|Nevada|Utah|Hawaii|Mississippi)";
const ADDR_RE = new RegExp(
  "\\b(\\d{1,6}[A-Z]?\\s+(?:(?:N|S|E|W|NE|NW|SE|SW|North|South|East|West)\\.?\\s+)?[A-Za-z0-9.'\\- ]{1,40}?\\b" + SUFFIX + "\\b\\.?(?:\\s+\\d{1,4}[A-Z]?\\b)?(?:\\s+(?:N|S|E|W|NE|NW|SE|SW|North|South|East|West)\\b\\.?)?)"
  + "(?:[,\\s]+(?:Suite|Ste\\.?|Unit|Bldg|Building|#)\\s*[\\w-]+)?"
  + "[,\\s]+([A-Za-z][A-Za-z.'\\- ]{1,30}?)[,\\s]+(" + STATES + ")\\.?,?\\s+(\\d{5})(?:-\\d{4})?\\b", "g");

export function extractAddresses(text) {
  const out = [], seen = new Set();
  const t = String(text || "").replace(/\s+/g, " ");
  for (const m of t.matchAll(ADDR_RE)) {
    let street = m[1].replace(/\s+/g, " ").trim();
    const city = m[2].replace(/\s+/g, " ").trim();
    // The regex can start on an earlier number ("PO Box 5 ... 999 Main St"):
    // restart at the last house-number-looking token not preceded by a route word.
    for (const mm of [...street.matchAll(/(^|[^A-Za-z0-9-])(\d{1,6}[A-Z]?\s+[A-Za-z])/g)].reverse()) {
      const before = street.slice(0, mm.index + mm[1].length).trim();
      if (mm.index + mm[1].length === 0) break;
      if (/\b(Hwy|Highway|Route|Rte|SR|US|CR|County|Road|I|Interstate|State)\s*$/i.test(before)) continue;
      street = street.slice(mm.index + mm[1].length).trim();
      break;
    }
    if (/^\d+\s+(am|pm|years?|days?|minutes?|acres?|miles?)\b/i.test(street)) continue;
    const key = (street + "|" + m[4]).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ street, city, state: stateAbbrev(m[3]), zip: m[4], oneline: `${street}, ${city}, ${stateAbbrev(m[3])} ${m[4]}` });
  }
  return out;
}
const STATE_NAMES = { florida: "FL", texas: "TX", georgia: "GA", alabama: "AL", california: "CA", "new york": "NY", massachusetts: "MA", tennessee: "TN", louisiana: "LA", "north carolina": "NC", "south carolina": "SC", virginia: "VA", maine: "ME", colorado: "CO", arizona: "AZ", washington: "WA", pennsylvania: "PA", illinois: "IL", michigan: "MI", ohio: "OH", oregon: "OR", nevada: "NV", utah: "UT", hawaii: "HI", mississippi: "MS" };
function stateAbbrev(s) { const k = String(s).toLowerCase(); return STATE_NAMES[k] || String(s).toUpperCase(); }

// Parse a one-line "street, city, ST zip" (zip optional) into Census batch fields.
export function parseOneLine(a) {
  const s = String(a || "").replace(/,?\s*(USA|United States)\s*$/i, "").trim();
  const m = /^(.+?),\s*([^,]+?),\s*([A-Za-z .]+?)\.?\s*(\d{5})?(?:-\d{4})?\s*$/.exec(s);
  if (!m) return null;
  return { street: m[1].trim(), city: m[2].trim(), state: stateAbbrev(m[3].trim()), zip: m[4] || "" };
}

export function houseNumber(a) {
  const m = /^\s*(\d+)/.exec(String(a || ""));
  return m ? m[1] : null;
}
const DIRS = new Set(["n", "s", "e", "w", "ne", "nw", "se", "sw", "north", "south", "east", "west"]);
export function streetKeyword(a) {
  const words = String(a || "").replace(/^\s*\d+[A-Z]?\s+/, "").split(/[\s,]+/).map((w) => w.replace(/\.$/, ""));
  for (const w of words) if (w && !DIRS.has(w.toLowerCase())) return w;
  return null;
}
// Does a page's text state this street address? House number followed within
// a short window by the street's first non-directional word.
export function pageStatesAddress(text, address) {
  const num = houseNumber(address), kw = streetKeyword(address);
  if (!num || !kw) return false;
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const kwPat = /^\d+(st|nd|rd|th)$/i.test(kw) ? esc(kw) : esc(kw).replace(/^(\w)/, "$1");
  return new RegExp("\\b" + esc(num) + "\\b[^0-9]{0,40}?\\b" + kwPat + "\\b", "i").test(String(text || "").replace(/\s+/g, " "));
}

export function htmlToText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?>/gi, ", ").replace(/<\/(p|div|li|span|address|h\d|td)>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/&#0?39;|&apos;|&rsquo;|&#8217;/gi, "'").replace(/&quot;/gi, '"').replace(/&#8211;|&#8212;|&ndash;|&mdash;/gi, " ")
    .replace(/\s+/g, " ").trim();
}
// JSON-LD PostalAddress blocks -> one-line addresses (venues often publish these).
export function jsonLdAddresses(html) {
  const out = [];
  for (const m of String(html || "").matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let j; try { j = JSON.parse(m[1].trim()); } catch { continue; }
    const walk = (o) => {
      if (!o || typeof o !== "object") return;
      if (Array.isArray(o)) return o.forEach(walk);
      if (o.streetAddress && (o.addressLocality || o.postalCode)) {
        const street = String(Array.isArray(o.streetAddress) ? o.streetAddress[0] : o.streetAddress).split(/\n/)[0].trim();
        if (/^\d/.test(street)) out.push({ street, city: String(o.addressLocality || "").trim(), state: stateAbbrev(String(o.addressRegion || "").trim()), zip: String(o.postalCode || "").slice(0, 5), oneline: `${street}, ${o.addressLocality || ""}, ${stateAbbrev(String(o.addressRegion || ""))} ${String(o.postalCode || "").slice(0, 5)}`.trim() });
      }
      for (const v of Object.values(o)) walk(v);
    };
    walk(j);
  }
  return out;
}

// ── classification ──────────────────────────────────────────────────────────
// Evidence is checked for Google content before anything is written: no
// Google-hosted URL, no google_* corroboration, no wikipedia-title match.
export function evidenceHasGoogle(obj) {
  let bad = false;
  const walk = (k, v) => {
    if (bad) return;
    if (typeof k === "string" && /google|wikipedia_title|match_confidence|corroboration/i.test(k)) { bad = true; return; }
    if (typeof v === "string") { if (/google/i.test(v) || isGoogleUrl(v)) bad = true; return; }
    if (v && typeof v === "object") for (const [kk, vv] of Object.entries(v)) walk(kk, vv);
  };
  walk(null, obj);
  return bad;
}

// row: { place_id, category, wd:{qid,lat,lng,labels[],website[]}|null,
//        identity:{basis,ref,detail}|null, googleNameOnly:bool,
//        official:[{kind,url,address,census:{lat,lng,matched,tiger}|null}] }
export function classifyWikidataRow(row, verifiedAt) {
  const out = { place_id: row.place_id, file: "wikidata", category: row.category, reasons: [], identity_basis: row.identity ? row.identity.basis : "google-name-wikipedia-match", identity_google_name: !row.identity };
  if (!row.wd || !validLatLng(row.wd.lat, row.wd.lng)) return { ...out, class: FAILED, reasons: ["wikidata-coordinate-missing-now"] };
  const limit = agreementLimitM(row.category);
  const usable = (row.official || []).filter((o) => o.census && validLatLng(o.census.lat, o.census.lng) && !isGoogleUrl(o.url)
    && houseNumber(o.census.matched) === houseNumber(o.address));
  if (!usable.length) return { ...out, class: PARTIAL, reasons: [row.official && row.official.length ? "official-address-not-geocoded" : "no-official-address-found"], limit_m: limit };
  let best = null;
  for (const o of usable) { const d = haversineM(row.wd, o.census); if (!best || d < best.d) best = { d, o }; }
  out.distance_m = Math.round(best.d); out.limit_m = limit; out.second = best.o;
  if (best.d > limit) return { ...out, class: FAILED, reasons: ["official-address-disagrees"] };
  if (!row.identity || !NON_GOOGLE_IDENTITY.has(row.identity.basis)) return { ...out, class: PARTIAL, reasons: ["identity-google-name-only"] };
  const entry = {
    source: "wikidata", lat: row.wd.lat, lng: row.wd.lng, observed_at: verifiedAt, attribution: null, verified: true,
    method: WIKIDATA_VERIFIED_METHOD, ref: row.wd.qid, license: "CC0-1.0",
    evidence: {
      wikidata_item: `https://www.wikidata.org/wiki/${row.wd.qid}`,
      official_address: best.o.address, official_address_url: best.o.url, official_address_kind: best.o.kind,
      census_matched_address: best.o.census.matched, census_lat: best.o.census.lat, census_lng: best.o.census.lng,
      distance_m: Math.round(best.d), limit_m: limit,
      identity_basis: row.identity.basis, identity_ref: row.identity.ref, identity_detail: row.identity.detail,
      verified_at: verifiedAt,
    },
  };
  if (evidenceHasGoogle(entry)) return { ...out, class: FAILED, reasons: ["evidence-contains-google"] };
  return { ...out, class: VERIFIED, entry };
}

// row: { place_id, category, event:{event_id,venue,address,source_url,source_type},
//        primary:{url,stated:bool,fetched:bool}, census:{lat,lng,matched,tiger}|null,
//        second:[{kind,ref,url,lat,lng}] }
export function classifyCensusRow(row, verifiedAt) {
  const out = { place_id: row.place_id, file: "census", category: row.category, reasons: [], identity_basis: "editor-event-link", identity_google_name: false };
  const ev = row.event || {};
  if (isGoogleUrl(ev.source_url)) return { ...out, class: FAILED, reasons: ["source-url-google"] };
  if (!row.census || !validLatLng(row.census.lat, row.census.lng) || houseNumber(row.census.matched) !== houseNumber(ev.address))
    return { ...out, class: FAILED, reasons: ["census-no-match-now"] };
  if (!row.primary || !row.primary.stated) return { ...out, class: PARTIAL, reasons: [row.primary && row.primary.fetched ? "official-page-no-longer-states-address" : "official-page-unreachable"] };
  const limit = agreementLimitM(row.category);
  // A same-named Wikidata item more than 25 km away is a name collision (another
  // "Cypress Grove Park"), not a disagreeing measurement of this venue.
  const seconds = (row.second || []).filter((s) => validLatLng(s.lat, s.lng) && !isGoogleUrl(s.url) && haversineM(row.census, s) <= 25000);
  if (!seconds.length) return { ...out, class: PARTIAL, reasons: ["no-second-non-google-source"], limit_m: limit };
  let best = null;
  for (const s of seconds) { const d = haversineM(row.census, s); if (!best || d < best.d) best = { d, s }; }
  out.distance_m = Math.round(best.d); out.limit_m = limit; out.second = best.s;
  if (best.d > limit) return { ...out, class: FAILED, reasons: ["second-source-disagrees"] };
  const entry = {
    source: "official_venue", lat: row.census.lat, lng: row.census.lng, observed_at: verifiedAt, attribution: null, verified: true,
    method: CENSUS_VERIFIED_METHOD, ref: ev.event_id,
    license: "public-domain (US Census Bureau geocoder; address from the venue/organiser page)",
    evidence: {
      address: ev.address, source_url: ev.source_url, source_type: ev.source_type,
      address_stated_at_url: row.primary.stated_url || ev.source_url, page_states_address_at: verifiedAt,
      census_matched_address: row.census.matched, tiger_line_id: row.census.tiger || null,
      second_source: best.s.kind, second_ref: best.s.ref, second_url: best.s.url || null,
      distance_m: Math.round(best.d), limit_m: limit,
      identity_basis: "editor-event-link", identity_ref: ev.event_id, identity_detail: `wf_events venue "${ev.venue || ""}"`,
      verified_at: verifiedAt,
    },
  };
  if (evidenceHasGoogle(entry)) return { ...out, class: FAILED, reasons: ["evidence-contains-google"] };
  return { ...out, class: VERIFIED, entry };
}
