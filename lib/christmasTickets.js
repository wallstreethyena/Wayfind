// lib/christmasTickets.js: SERVER ONLY. The featured ticket cards on
// /christmas-in-florida (app/components/ChristmasTickets.js), built from the
// SAME listings the statewide browse reads (christmasBrowseCached().listings),
// so a ticket card is never a second source of truth.
//
// What makes a listing a ticket card:
//   1. it is dated and upcoming or ongoing for `today` (siteTodayStr), and
//   2. it has a real way in: a partner ticket from the registry
//      (lib/eventTicketDeals.js, always our /api/*/go href exactly as the
//      registry builds it, never an affiliate URL built here) or the
//      organizer's own ticket page (eventOrganizerTicketUrl).
//
// Order is merit and data only: Wayfind headliner flag, a real photo, a stated
// price, an event page of our own, then the soonest date. The partner and any
// commission never enter the sort (locked by scripts/test-christmas-tickets.mjs).
// Photos are real or absent: the card's own photo, then free stored Google and
// vaulted venue photos. No stock, no generated art; a card with no photo paints
// the designed tile.
import { SITE_URL } from "./site.js";
import { christmasCopy } from "./christmasCardCopy.js";
import { christmasEventTicket, CHRISTMAS_TICKET_DEAL_IDS } from "./christmasPool.js";
import { isServableDeal } from "./eventTicketDeals.js";
import { eventOrganizerTicketUrl } from "./curatedEvents.js";
import { eventPhotoCredit } from "./eventImageProvenance.js";
import { readStoredGooglePhoto } from "./googlePhotoStore.js";
import { readVaultedPlacePhotos, dedupeVaultEntries } from "./halloweenHauntPhotos.js";
import { CHRISTMAS_MAX_PHOTOS, christmasPlaceFor, readChristmasEventPhotos } from "./christmasPlacePhotos.js";
import { supabaseLive } from "./supabase.js";
import { reminderFactsFor } from "./eventReminderFacts.js";

export const CHRISTMAS_TICKETS_SURFACE = "christmas_tickets";
export const CHRISTMAS_TICKETS_MAX = 24;
export const CHRISTMAS_TICKETS_BUCKET_CAP = 5;
// Untagged cards keep the venue rail at 6. Tagged holiday photos use CHRISTMAS_MAX_PHOTOS.
export const CHRISTMAS_TICKETS_MAX_PHOTOS = 6;
export const CHRISTMAS_TICKETS_TITLE = "Florida Christmas Lights, Shows and Parties";

export const CHRISTMAS_TICKET_FILTERS = Object.freeze([
  Object.freeze({ id: "all", label: "All" }),
  Object.freeze({ id: "lights", label: "Light shows" }),
  Object.freeze({ id: "parks", label: "Theme parks" }),
  Object.freeze({ id: "parades", label: "Parades and boats" }),
  Object.freeze({ id: "shows", label: "Shows and ballet" }),
  Object.freeze({ id: "family", label: "Family friendly" }),
  Object.freeze({ id: "free", label: "Free" }),
]);

const TICKET_MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TICKET_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

// No punctuation dash in anything a reader sees (owner rule). A hyphen inside
// a word stays a spelling.
export function plain(text) {
  if (text === null || text === undefined) return "";
  return christmasCopy(String(text))
    .replace(/\s+,/g, ",")
    .replace(/[–—]/g, " to ")
    .replace(/\s-\s/g, ", ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const parts = (d) => d.split("-").map(Number);
const mdOf = (d, todayYear) => {
  const [y, m, day] = parts(d);
  return TICKET_MONTHS[m] + " " + day + (todayYear && y !== todayYear ? ", " + y : "");
};
const dowOf = (d) => { const [y, m, day] = parts(d); return TICKET_WEEKDAYS[new Date(Date.UTC(y, m - 1, day)).getUTCDay()]; };

function clockOf(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ""));
  if (!m) return "";
  const h = Number(m[1]);
  const min = m[2] === "00" ? "" : ":" + m[2];
  return (h % 12 || 12) + min + " " + (h >= 12 ? "PM" : "AM");
}

// "Nov 20 to Jan 3 · Select nights · 6 PM to 10 PM". Honest about the three
// shapes the data has: started (Now through), future (range or one day), and a
// run whose closing date is not announced.
export function ticketDatesText(card, today) {
  const todayYear = parts(today)[0];
  const start = DATE_RX.test(card.start_date || "") ? card.start_date : "";
  const end = DATE_RX.test(card.end_date || "") ? card.end_date : "";
  let range = "";
  if (start && start > today) {
    range = end && end !== start ? mdOf(start, todayYear) + " to " + mdOf(end, todayYear) : dowOf(start) + ", " + mdOf(start, todayYear);
  } else if (end) {
    range = "Now through " + mdOf(end, todayYear);
  } else if (start) {
    range = "Now, closing date not announced";
  }
  const nights = Array.isArray(card.occurrence_dates) ? card.occurrence_dates.filter((d) => d >= today) : [];
  const label = plain(card.schedule && card.schedule.label ? card.schedule.label : "");
  const lead = label.split(" to ")[0].split("·")[0].trim();
  const sched = /^(select nights|select dates|daily|weekends|nightly)$/i.test(lead) ? lead : "";
  const hours = card.start_time ? (clockOf(card.start_time) + (card.end_time ? " to " + clockOf(card.end_time) : "")) : "";
  const next = card.select_nights && nights.length && !(start && start > today && nights[0] === start) ? "next " + mdOf(nights[0], todayYear) : "";
  return plain([range, sched, next, hours].filter(Boolean).join(" · "));
}

// Lowest stated admission figure, or null. Conservative on purpose: a note
// that says the price is unannounced, comes from a resale or third party
// listing, or is a past estimate yields no number, and add-on fees (booking,
// parking, ride wristbands) never become the "from" price.
const NO_PRICE_RX = /resale|third party|third-party|unannounced|not announced|not stated|not read|estimate|last year|prior|coming soon|not yet/i;
const ADDON_AFTER_RX = /^\s*(?:booking|service|parking|fee|ride|wristband|tax|processing)/i;
export function ticketPrice(card) {
  if (card.price_kind === "free" || card.is_free === true) {
    const label = plain(card.price_label);
    return { kind: "free", text: /^free$/i.test(label) || !label ? "Free" : label };
  }
  const note = String(card.price_note || "");
  if (note && !NO_PRICE_RX.test(note)) {
    const head = note.split(/\bplus\b|\+/i)[0];
    const figures = [];
    for (const m of head.matchAll(/\$\s?(\d{1,4}(?:,\d{3})*(?:\.\d{1,2})?)(?![\d,])/g)) {
      if (ADDON_AFTER_RX.test(head.slice(m.index + m[0].length))) continue;
      const value = Number(m[1].replace(/,/g, ""));
      if (value > 0) figures.push({ value, text: "$" + m[1].replace(/\.00$/, "") });
    }
    if (figures.length) {
      figures.sort((a, b) => a.value - b.value);
      const unit = /\bper ((?:passenger )?(?:vehicle|car|person|row|ticket|guest|adult|couple))/i.exec(head);
      return { kind: "from", amount: figures[0].value, text: figures[0].text, unit: unit ? "per " + unit[1].toLowerCase() : "" };
    }
  }
  if (card.price_kind === "paid" || card.is_free === false) return { kind: "note", text: "See price on the ticket page" };
  return { kind: "note", text: "Price not announced" };
}

const CHIP_BY_RAIL = Object.freeze({
  lights: "Light show", "theme-parks": "Theme park", parades: "Parade", "boat-parades": "Boat parade",
  "shows-outings": "Show", parties: "Party", "towns-markets": "Market", "popup-bars": "Pop up bar", "seasonal-food": "Dining",
});
// The rail names the kind; categories only refine the two catch all rails
// (secondary categories such as "santa" are tagged on almost everything).
const REFINE = {
  "shows-outings": [["ballet", "Ballet"], ["theater", "Theater"], ["historic-home", "Home tour"], ["train", "Train"], ["cruise", "Cruise"], ["snow-ice", "Snow and ice"]],
  lights: [["drive-thru", "Drive thru lights"], ["gardens", "Garden lights"]],
};
function chipOf(card) {
  const cats = card.browse_categories || [];
  const hit = (REFINE[card.christmasRail] || []).find(([id]) => cats.includes(id));
  const base = hit ? hit[1] : CHIP_BY_RAIL[card.christmasRail] || "Christmas";
  return card.audience === "adults-only" ? base + ", adults only" : base;
}
const LIGHT_CATS = ["lights", "neighborhood-lights", "drive-thru", "gardens"];
const SHOW_CATS = ["concert", "ballet", "theater"];

function bucketOf(card) {
  if (card.christmasRail === "theme-parks") return "parks";
  if (card.christmasRail === "lights" || (card.browse_categories || []).some((c) => LIGHT_CATS.includes(c))) return "lights";
  if (card.christmasRail === "parades" || card.christmasRail === "boat-parades") return "parades";
  if (card.christmasRail === "shows-outings" || (card.browse_categories || []).some((c) => SHOW_CATS.includes(c))) return "shows";
  return card.christmasRail || "other";
}

export function ticketFilterIds(card) {
  const ids = new Set();
  const bucket = bucketOf(card);
  if (bucket === "lights") ids.add("lights");
  if (bucket === "parks") ids.add("parks");
  if (bucket === "parades") ids.add("parades");
  if (bucket === "shows") ids.add("shows");
  if (card.audience === "family") ids.add("family");
  if (card.price_kind === "free" || card.is_free === true) ids.add("free");
  return [...ids];
}

function stillOn(card, today) {
  if (card.season_undated === true) return false;
  const start = card.start_date;
  if (!DATE_RX.test(start || "")) return false;
  const nights = Array.isArray(card.occurrence_dates) ? card.occurrence_dates : [];
  if (nights.length) return nights.some((d) => d >= today);
  const end = DATE_RX.test(card.end_date || "") ? card.end_date : (card.closing_unannounced ? "9999-12-31" : start);
  return end >= today;
}

const hasRealPhoto = (card) => !!card.image && !/\/cards-v8\//.test(card.image);

// The way in. Partner ticket first (the registry owns the href and label
// inputs), else the organizer's own ticket page. null means not a ticket card.
export function ticketAction(card, dealsById = new Map()) {
  const partner = christmasEventTicket(card.id, dealsById);
  if (partner && typeof partner.href === "string" && /^\/api\/[a-z0-9/_-]+\/go\?/i.test(partner.href)) {
    const viator = partner.provider === "viator";
    const label = viator ? "See availability ↗" : partner.product === "park-admission" ? "Book Now & Save" : "Get Tickets";
    const via = viator ? "Tour tickets at Viator" : (partner.product === "park-admission" ? "Park tickets at " : "Event tickets at ") + partner.via;
    return { kind: "affiliate", href: partner.href, label, via, provider: partner.provider, product: partner.product };
  }
  const organizer = eventOrganizerTicketUrl(card);
  if (organizer && /^https:\/\//.test(organizer)) {
    let host = "";
    try { host = new URL(organizer).hostname.replace(/^www\./, ""); } catch { host = ""; }
    if (!host) return null;
    return { kind: "organizer", href: organizer, label: "Official Tickets", via: "Official organizer tickets", provider: "organizer", host };
  }
  return null;
}

function primaryPhoto(card) {
  if (!hasRealPhoto(card)) return null;
  const credit = eventPhotoCredit(card, card.image);
  const venue = plain(card.venue || card.title || card.name);
  return {
    src: card.image,
    alt: plain("Photo of " + venue),
    credit: credit ? (credit.label === "Google Maps" ? "Photo from Google Maps" : plain(credit.label)) : "",
    creditHref: credit && credit.href && /^https:\/\//.test(credit.href) ? credit.href : null,
    source: card.photoAttr ? "licensed" : "venue",
  };
}

// Merit sort key. Never reads the partner, the ticket or any price a partner
// sets: only editorial and data quality signals.
function merit(card) {
  return (card.exceptional ? 4 : 0) + (hasRealPhoto(card) ? 2 : 0) + (ticketPrice(card).kind === "from" ? 1 : 0) + (card.detailHref ? 1 : 0);
}
const firstDay = (card, today) => {
  const nights = (card.occurrence_dates || []).filter((d) => d >= today);
  if (nights.length) return nights[0];
  return card.start_date > today ? card.start_date : today;
};
function byMerit(today) {
  return (a, b) => (b.merit - a.merit)
    || firstDay(a.card, today).localeCompare(firstDay(b.card, today))
    || String(a.card.title).localeCompare(String(b.card.title));
}

export function christmasTicketsModel(listings, today, { dealsById = new Map(), max = CHRISTMAS_TICKETS_MAX } = {}) {
  const candidates = [];
  for (const card of Array.isArray(listings) ? listings : []) {
    if (!card || card.kind === "place" || !card.id || !stillOn(card, today)) continue;
    const cta = ticketAction(card, dealsById);
    if (!cta) continue;
    candidates.push({ card, cta, merit: merit(card), bucket: bucketOf(card) });
  }
  candidates.sort(byMerit(today));
  const used = new Map();
  const picked = [];
  for (const c of candidates) {
    if (picked.length >= max) break;
    const n = used.get(c.bucket) || 0;
    if (n >= CHRISTMAS_TICKETS_BUCKET_CAP) continue;
    used.set(c.bucket, n + 1);
    picked.push(c);
  }
  picked.sort(byMerit(today));
  const rows = picked.map(({ card, cta }) => {
    const photo = primaryPhoto(card);
    const price = ticketPrice(card);
    const filters = ticketFilterIds(card);
    return {
      id: card.id,
      placeId: card.place_id || null,
      name: plain(card.title || card.name),
      chip: chipOf(card),
      city: plain(card.city),
      venue: plain(card.venue),
      when: ticketDatesText(card, today),
      startDate: card.start_date,
      endDate: card.end_date || null,
      price,
      priceNote: price.kind === "from" ? plain(card.price_note).slice(0, 160) : "",
      filters,
      photos: photo ? [photo] : [],
      placeholder: { icon: (card.placeholder && card.placeholder.icon) || "✨", label: plain((card.placeholder && card.placeholder.label) || chipOf(card)) },
      cta,
      eventHref: card.detailHref || null,
      ...reminderFields(card, cta, today),
    };
  });
  const present = new Set(rows.flatMap((r) => r.filters));
  const filters = CHRISTMAS_TICKET_FILTERS.filter((f) => f.id === "all" || (present.has(f.id) && rows.filter((r) => r.filters.includes(f.id)).length < rows.length));
  return {
    today,
    chrome: {
      title: CHRISTMAS_TICKETS_TITLE,
      lede: "Every Florida Christmas light show, parade, party and tradition in one list, tickets first. Pick a pill to narrow it down.",
      honest: "Prices come from each organizer. When a price is not announced yet, we say so.",
      ask: "Ask Santa",
      eventPage: "Full event page",
      allHeading: "Every Christmas event in Florida",
    },
    filters,
    rows,
    hasAffiliate: rows.some((r) => r.cta.kind === "affiliate"),
  };
}

// Remind me on the one card (owner 2026-11-01): the facts come from the full
// listing on the server (lib/eventReminderFacts.js, the same module the rails
// and the event page use), so the card and the .ics agree. null for an
// undated season, a watchlist twin, a past or called off event, or a card with
// no /florida-events page. The Google Calendar link only ever carries our own
// /go route, never an organizer URL.
function reminderFields(card, cta, today) {
  let remind = null;
  try { remind = reminderFactsFor(card, { href: card.detailHref || null, today }); } catch { remind = null; }
  return { remind, remindTicketHref: cta && cta.kind === "affiliate" ? cta.href : null };
}

// ── The same ticket card for the statewide browse (owner 2026-11-01) ─────────
// One card look on the whole page: every browse event carries the SAME fields a
// top grid row has (chip, dates text, honest price, and the ticket way in) so
// ChristmasBrowse can hand it to the one TicketCard. Built here, on the
// server, from the full listing, because the organizer ticket URL, the price
// note and the partner registry never leave the server. The way in is exactly
// ticketAction (one of our go routes or the organizer page); a listing
// with no ticket gets cta null and the card falls back to its event page.
export function browseTicketFields(card, today, dealsById = new Map()) {
  const when = ticketDatesText(card, today)
    || (card.season_undated === true ? "2026 season confirmed, dates not announced yet" : plain(card.when));
  const cta = ticketAction(card, dealsById);
  return {
    chip: chipOf(card),
    when,
    price: ticketPrice(card),
    cta,
    ...reminderFields(card, cta, today),
  };
}

// page: the object christmasBrowsePage returns. Returns a copy whose event
// cards carry `ticketRow` (places are mapped by the client, they have no
// ticket). Never mutates the cached page.
export function attachBrowseTickets(page, listings, today, dealsById = new Map()) {
  const byId = new Map((Array.isArray(listings) ? listings : []).map((c) => [c.id, c]));
  return {
    ...page,
    cards: (page.cards || []).map((card) => {
      const full = byId.get(card.id);
      if (!full || full.kind === "place") return card;
      return { ...card, ticketRow: browseTicketFields(full, today, dealsById) };
    }),
  };
}

// The ticketed cards keep their photo galleries in the one list: the same
// readers the featured strip used (tagged Christmas photos, static galleries,
// free stored Google and vault photos) run for the page's ticketed events and
// the result rides on ticketRow.photos. A failed read leaves the card's own
// single photo, never an empty slot.
export async function withBrowseTicketPhotos(page, listings, today, dealsById = new Map(), deps = {}) {
  try {
    const byId = new Map((Array.isArray(listings) ? listings : []).map((c) => [c.id, c]));
    const wanted = (page.cards || []).filter((c) => c.ticketRow && c.ticketRow.cta).map((c) => byId.get(c.id)).filter(Boolean);
    if (!wanted.length) return page;
    const model = await withChristmasTicketPhotos(christmasTicketsModel(wanted, today, { dealsById, max: wanted.length + 1 }), deps);
    const photosById = new Map(model.rows.map((row) => [row.id, row.photos]));
    return {
      ...page,
      cards: page.cards.map((card) => (card.ticketRow && photosById.get(card.id) && photosById.get(card.id).length
        ? { ...card, ticketRow: { ...card.ticketRow, photos: photosById.get(card.id) } }
        : card)),
    };
  } catch {
    return page;
  }
}

// ── Free stored photos (no Google call, no ledger grant) ─────────────────────
const VAULT_URL_RX = /^(?:https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/place-photos|https:\/\/www\.gowayfind\.com\/place-photos\/batch-\d{4}-\d{2})\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/;
// Photos tied to another season, or not a picture of the place itself.
const SKIP_REF_RX = /halloween|haunt|spooky|scare|\b(?:menu|logo|map|selfie|selfies)\b/i;

export function christmasVaultPhoto(row, entry) {
  if (!entry || typeof entry !== "object" || entry.haunt_key) return null;
  const ref = String(entry.source_ref || entry.original_url || entry.image_url || "").replace(/[_.-]+/g, " ");
  if (SKIP_REF_RX.test(ref)) return null;
  const src = String(entry.url || entry.vault_url || "").trim();
  if (!VAULT_URL_RX.test(src)) return null;
  const raw = plain(entry.attribution_text || entry.credit || "");
  if (!raw) return null;
  return {
    src,
    width: Number.isFinite(entry.width) && entry.width > 0 ? entry.width : 1280,
    height: Number.isFinite(entry.height) && entry.height > 0 ? entry.height : 853,
    alt: plain("Photo of " + (row.venue || row.name)),
    credit: /^photo\b/i.test(raw) ? raw : "Photo by " + raw,
    creditHref: /^https:\/\//.test(String(entry.attribution_url || "")) ? entry.attribution_url : null,
    source: "vault",
  };
}

export function christmasGooglePhoto(row, stored) {
  if (!stored || stored.source !== "google" || !/^\/api\/photo\/stored\/[A-Za-z0-9_-]+\?v=[a-f0-9]{64}$/.test(stored.src || "")) return null;
  const c = stored.credit || {};
  const authors = Array.isArray(c.authors) ? c.authors : [];
  const author = plain((authors[0] && (authors[0].name || authors[0].displayName)) || c.name || "");
  if (!author) return null;
  const href = (authors[0] && authors[0].uri) || c.uri || c.mapsUri || null;
  return {
    src: stored.src, width: stored.width, height: stored.height,
    alt: plain("Photo of " + (row.venue || row.name) + " from Google Maps"),
    credit: "Photo by " + author + " on Google Maps",
    creditHref: href && /^https:\/\//.test(href) ? href : null,
    source: "google",
  };
}

const PHOTO_MEMO = new Map();
const PHOTO_TTL_MS = 10 * 60 * 1000;

export async function withChristmasTicketPhotos(model, deps = {}) {
  const now = deps.now || Date.now();
  const readGoogle = deps.readGoogle || readStoredGooglePhoto;
  const readVault = deps.readVault || readVaultedPlacePhotos;
  const readTagged = deps.readTagged || readChristmasEventPhotos;
  const rows = await Promise.all(model.rows.map(async (row) => {
    // Event tagged Christmas photos win: they replace the year round venue
    // shots so the card opens on a holiday photo, cover first.
    let tagged = [];
    try { tagged = (await readTagged(row.id, row.placeId, { ...(deps.storeDeps || {}), label: row.venue || row.name })) || []; } catch { tagged = []; }
    if (tagged.length) return { ...row, placeId: christmasPlaceFor(row.id, row.placeId), photos: tagged.slice(0, CHRISTMAS_MAX_PHOTOS) };
    if (!row.placeId) return row;
    const memo = deps.noMemo ? null : PHOTO_MEMO.get(row.placeId);
    let extra;
    if (memo && now - memo.at < PHOTO_TTL_MS) extra = memo.value;
    else {
      let google = [], vault = [];
      try { google = [christmasGooglePhoto(row, await readGoogle(row.placeId, deps.storeDeps))].filter(Boolean); } catch { google = []; }
      try { vault = dedupeVaultEntries((await readVault(row.placeId, deps.storeDeps)) || []).map((v) => christmasVaultPhoto(row, v)).filter(Boolean); } catch { vault = []; }
      extra = [...google, ...vault];
      if (!deps.noMemo) PHOTO_MEMO.set(row.placeId, { at: now, value: extra });
    }
    const photos = [...row.photos];
    for (const p of extra) if (!photos.some((q) => q.src === p.src)) photos.push(p);
    const next = photos.slice(0, CHRISTMAS_TICKETS_MAX_PHOTOS);
    return { ...row, photos: next };
  }));
  return { ...model, rows };
}

// wf_deals health for the Undercover Tourist entries (owned read, no paid
// call). A failed read gives an empty map: those buttons simply do not show,
// the same rule the rails route follows.
export async function fetchChristmasTicketDeals({ client = supabaseLive, timeoutMs = 3000 } = {}) {
  if (!client || !CHRISTMAS_TICKET_DEAL_IDS.length) return new Map();
  try {
    const result = await client.from("wf_deals").select("id,affiliate_url,active,link_ok,provider")
      .in("id", CHRISTMAS_TICKET_DEAL_IDS).abortSignal(AbortSignal.timeout(timeoutMs));
    if (!result || result.error || !Array.isArray(result.data)) return new Map();
    return new Map(result.data.filter((deal) => isServableDeal(deal)).map((deal) => [deal.id, deal]));
  } catch {
    return new Map();
  }
}

// ── Structured data ──────────────────────────────────────────────────────────
export function christmasTicketsSchema(model) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: model.chrome.title,
    numberOfItems: model.rows.length,
    itemListElement: model.rows.map((row, index) => {
      const url = row.eventHref ? SITE_URL + row.eventHref : (row.cta.kind === "organizer" ? row.cta.href : SITE_URL + "/christmas-in-florida");
      const item = {
        "@type": "Event",
        name: row.name,
        description: plain(row.when + ". " + (row.price.kind === "from" ? "Tickets from " + row.price.text + "." : row.price.text + ".")),
        url,
        startDate: row.startDate,
        ...(row.endDate ? { endDate: row.endDate } : {}),
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        location: {
          "@type": "Place",
          name: row.venue || row.city,
          address: { "@type": "PostalAddress", addressLocality: row.city, addressRegion: "FL", addressCountry: "US" },
        },
      };
      const real = row.photos.find((p) => /^https:\/\//.test(p.src) || p.src.startsWith("/"));
      if (real) item.image = real.src.startsWith("/") ? SITE_URL + real.src : real.src;
      if (row.price.kind === "from") {
        item.offers = { "@type": "Offer", url, price: row.price.amount, priceCurrency: "USD", availability: "https://schema.org/InStock" };
      } else if (row.price.kind === "free") {
        item.offers = { "@type": "Offer", url, price: 0, priceCurrency: "USD", availability: "https://schema.org/InStock" };
      }
      return { "@type": "ListItem", position: index + 1, item };
    }),
  };
}
