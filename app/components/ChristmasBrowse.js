"use client";
// The statewide Christmas browse (/christmas-in-florida, lead packet v4,
// 2026-10-13). The server renders the first page (app/christmas-in-florida/page.js);
// every filter change asks /api/christmas/browse, which reads the same merged
// data. ONE CARD LOOK ON THE PAGE (owner direction 2026-11-01, "I like the one
// from image 1 better but add the background similar to image 2"): every
// result is the same TicketCard the top ticket grid uses, in its red
// Christmas background. This replaced the RailCard in the red .wf-christmas
// skin; there is no second card component. Honesty labels come from
// lib/christmasCardCopy.js and from the server built `ticketRow`
// (lib/christmasTickets.js attachBrowseTickets), so an unknown price says
// "Price not announced" and a ticket button exists only where the existing
// data has a real ticket or official link.
import { useEffect, useRef, useState } from "react";
import ChristmasFilter from "./ChristmasFilter.js";
import { TicketCard } from "./ChristmasTicketCard.js";
import { GuideCommissionLine } from "./GuideCommissionLine.js";
import { reminderFactsFor } from "../../lib/eventReminderFacts.js";
import { CHRISTMAS_CARD_LABELS, CHRISTMAS_PRICE_UNKNOWN_TEXT, CHRISTMAS_SEASON_UNDATED_TEXT, christmasCopy, christmasPitch, christmasPriceLabel } from "../../lib/christmasCardCopy.js";

const FILTER_KEYS = ["region", "category", "when", "date", "price", "audience", "undated", "q", "lat", "lng", "sort"];
// A location found quietly on load (auto) ranks the list but never goes into
// the shareable address bar: a shared link must not carry the sharer's spot.
const PRIVATE_KEYS = new Set(["lat", "lng"]);
const CHROME = { eventPage: "Full event page" };
const PLACE_CHIP = { "popup-bars": "Bars and dining", "seasonal-food": "Festive bites" };

function sentenceCase(label) {
  const t = String(label || "").toLowerCase();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Christmas";
}

// The card's own photo plus its credit. A licensed photo keeps its provenance
// pair; a Google Maps photo says so, like the top grid.
function browsePhotos(card) {
  const src = card.image;
  if (!src || /\/cards-v8\//.test(src)) return [];
  const credit = card.photoAttr ? christmasCopy(card.photoAttr) : (/^\/api\/photo/.test(src) ? "Photo from Google Maps" : "");
  return [{
    src,
    alt: christmasCopy("Photo of " + (card.venue || card.title || card.name || "the event")),
    credit,
    creditHref: card.photoAttrHref && /^https:\/\//.test(card.photoAttrHref) ? card.photoAttrHref : null,
  }];
}

// Remind me facts: the server built them for every event (ticketRow.remind,
// lib/christmasTickets.js browseTicketFields). A card that reached the client
// without them (an older cached API page) derives them from its own fields
// with the same pure module. Places never carry a reminder.
function browseRemind(card, ticket) {
  if (card.kind === "place") return null;
  if (ticket && ticket.remind !== undefined) return ticket.remind || null;
  try { return reminderFactsFor(card, { href: card.detailHref || null }); } catch { return null; }
}

// Map a browse card (event or place) into the ticket card's row shape.
export function browseRowFor(card) {
  const isPlace = card.kind === "place";
  const name = christmasCopy(card.title || card.name || "");
  const ticket = !isPlace ? card.ticketRow || null : null;
  const season = card.season_undated === true ? CHRISTMAS_SEASON_UNDATED_TEXT : "";
  const price = isPlace ? null : ticket ? ticket.price : (() => {
    const label = christmasPriceLabel(card);
    return card.is_free === true || card.price_kind === "free" ? { kind: "free", text: christmasCopy(label) } : { kind: "note", text: christmasCopy(label || CHRISTMAS_PRICE_UNKNOWN_TEXT) };
  })();
  return {
    id: card.id,
    name,
    pitch: christmasPitch(card),
    chip: isPlace ? (PLACE_CHIP[card.christmasRail] || "Christmas") : ticket ? ticket.chip : sentenceCase(CHRISTMAS_CARD_LABELS[card.christmasRail]),
    city: christmasCopy(card.city || ""),
    when: isPlace ? christmasCopy(card.seasonalWhen || "") : ticket ? ticket.when : christmasCopy(card.when || season || ""),
    price,
    photos: Array.isArray(card.photos) && card.photos.length ? card.photos.slice(0, 14) : (ticket && Array.isArray(ticket.photos) && ticket.photos.length ? ticket.photos.slice(0, 14) : browsePhotos(card)),
    placeholder: card.placeholder || null,
    cta: ticket ? ticket.cta : null,
    secondaryCta: ticket ? ticket.secondaryCta : null,
    eventHref: card.detailHref || null,
    pageLabel: isPlace ? "View place" : null,
    isPlace,
    remind: browseRemind(card, ticket),
    remindTicketHref: ticket && ticket.remindTicketHref ? ticket.remindTicketHref : null,
    sourceHref: !card.detailHref && /^https:\/\//.test(card.url || card.sourceUrl || "") ? (card.url || card.sourceUrl) : null,
  };
}

export function ChristmasBrowseCard({ card, rank = 0, today }) {
  return <TicketCard row={browseRowFor(card)} chrome={CHROME} idPrefix="xb-" headingLevel={3} priority={false} />;
}

// The page is one cached copy for every visitor, so filters in a shared link
// (?region=, ?category=, ?sort=tickets, ...) are read here, after load. Only
// values the filter itself offers are kept, the same rules as the server's
// parseChristmasBrowseQuery, and /api/christmas/browse validates them again.
export function christmasUrlQuery(search, facets = {}) {
  let params;
  try { params = new URLSearchParams(String(search || "")); } catch { return {}; }
  const get = (k) => String(params.get(k) || "").trim();
  const ids = (list) => new Set((Array.isArray(list) ? list : []).map((item) => (item && typeof item === "object" ? item.id : item)).filter(Boolean));
  const out = {};
  const pick = (k, allowed) => { const v = get(k); if (v && allowed.has(v)) out[k] = v; };
  pick("region", ids(facets.regions));
  pick("category", new Set([...ids(facets.categories), ...ids(facets.pills)]));
  pick("when", ids(facets.dates));
  pick("price", ids(facets.prices));
  pick("audience", ids(facets.audiences));
  if (/^\d{4}-\d{2}-\d{2}$/.test(get("date"))) out.date = get("date");
  if (get("undated") === "1") out.undated = true;
  if (get("q")) out.q = get("q").slice(0, 60);
  const lat = Number.parseFloat(get("lat")), lng = Number.parseFloat(get("lng"));
  if (Number.isFinite(lat) && lat > 24 && lat < 31.2 && Number.isFinite(lng) && lng > -88 && lng < -79.5) { out.lat = String(lat); out.lng = String(lng); }
  if (get("sort") === "tickets") out.sort = "tickets";
  return out;
}

export default function ChristmasBrowse({ initial, facets, today, initialQuery = {} }) {
  const [query, setQuery] = useState(() => ({ ...initialQuery }));
  const [data, setData] = useState(initial);
  const [cards, setCards] = useState(initial.cards || []);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const first = useRef(true);
  // Owner 2026-11-11: the default order for every category is the best rated,
  // trending choices near the visitor. On load the page finds a location
  // without a permission prompt: the device position only when the visitor
  // already allowed it, else the coarse Florida-only city lookup (/api/geo,
  // the same one home uses). Nothing found means best rated statewide. A
  // link that already carries a location or sort=tickets is left alone.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    // The cached page passes no filters, so the link's own query decides.
    const linked = { ...initialQuery, ...christmasUrlQuery(window.location.search, facets) };
    if (linked.lat || linked.sort === "tickets") return undefined;
    let dead = false;
    const adopt = (lat, lng) => {
      if (dead || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
      setQuery((q) => (q.lat || q.sort === "tickets" ? q : { ...q, lat: lat.toFixed(3), lng: lng.toFixed(3), auto: true }));
    };
    const byCity = () => fetch("/api/geo", { cache: "no-store" }).then((r) => r.json()).then((j) => { if (j && j.ok) adopt(Number(j.lat), Number(j.lng)); }).catch(() => {});
    const byDevice = () => navigator.geolocation.getCurrentPosition((pos) => adopt(pos.coords.latitude, pos.coords.longitude), byCity, { timeout: 8000 });
    try {
      if (navigator.permissions && navigator.geolocation) navigator.permissions.query({ name: "geolocation" }).then((p) => (p.state === "granted" ? byDevice() : byCity()), byCity);
      else byCity();
    } catch { byCity(); }
    return () => { dead = true; };
  }, []);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const params = new URLSearchParams();
    const shown = new URLSearchParams();
    for (const k of FILTER_KEYS) if (query[k] !== undefined && query[k] !== "" && query[k] !== false && query[k] !== null) {
      const v = query[k] === true ? "1" : String(query[k]);
      params.set(k, v);
      if (!(query.auto && PRIVATE_KEYS.has(k))) shown.set(k, v);
    }
    try { window.history.replaceState(null, "", shown.toString() ? "?" + shown.toString() + "#browse" : location.pathname + "#browse"); } catch {}
    const controller = new AbortController();
    setLoading(true); setFailed(false);
    fetch("/api/christmas/browse?" + params.toString(), { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("status " + r.status))))
      .then((json) => { setData(json); setCards(json.cards || []); })
      .catch((error) => { if (error?.name !== "AbortError") setFailed(true); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [query]);
  useEffect(() => {
    const fromUrl = christmasUrlQuery(window.location.search, facets);
    if (Object.keys(fromUrl).length) setQuery((q) => ({ ...q, ...fromUrl }));
    // Once, on load: later filter changes write the URL themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k, v) => setQuery((q) => ({ ...q, [k]: v, ...(k === "when" ? { date: "", undated: false } : {}), ...(k === "date" && v ? { when: "", undated: false } : {}), ...(k === "undated" && v ? { when: "", date: "" } : {}) }));
  const more = () => {
    const params = new URLSearchParams();
    for (const k of FILTER_KEYS) if (query[k]) params.set(k, query[k] === true ? "1" : String(query[k]));
    params.set("page", String((data.page || 1) + 1));
    setLoading(true);
    fetch("/api/christmas/browse?" + params.toString()).then((r) => r.json()).then((json) => { setData(json); setCards((prev) => [...prev, ...(json.cards || [])]); }).catch(() => setFailed(true)).finally(() => setLoading(false));
  };
  // "Best near you" from the menu: back to the default order, and the precise
  // device location when the visitor taps it (the one place that may prompt).
  const nearMe = () => {
    setQuery((q) => ({ ...q, sort: "" }));
    try {
      navigator.geolocation.getCurrentPosition((pos) => setQuery((q) => ({ ...q, sort: "", auto: false, lat: pos.coords.latitude.toFixed(3), lng: pos.coords.longitude.toFixed(3) })), () => {}, { timeout: 8000 });
    } catch {}
  };

  const pills = Array.isArray(facets.pills) ? facets.pills : [];
  const dates = Array.isArray(facets.dates) ? facets.dates : [];
  const summary = [(pills.find((p) => p.id === query.category) || {}).label, (dates.find((d) => d.id === query.when) || {}).label, query.region].filter(Boolean).join(" · ");
  const ticketsFirst = query.sort === "tickets";
  const located = !ticketsFirst && query.lat != null && query.lat !== "";
  const anyFilter = !!(query.category || query.when || query.region || query.q || query.date || query.price || query.audience || query.undated || ticketsFirst || (located && !query.auto));
  // Reset clears the filters but keeps a quietly found location, so the list
  // stays on the default best near you order.
  const clearAll = () => setQuery((q) => (q.auto && q.lat ? { lat: q.lat, lng: q.lng, auto: true } : {}));
  const shownCards = cards.length;
  const hasPartner = cards.some((c) => c.ticketRow && c.ticketRow.cta && c.ticketRow.cta.kind === "affiliate");
  return <section id="browse" aria-label="Florida Christmas events" style={{ margin: "0 0 28px" }} data-christmas-browse="">
    <div className="xm-controls" data-boo-clear="" role="toolbar" aria-label="Filter Christmas events">
      <ChristmasFilter query={query} facets={facets} onSet={set} onNear={nearMe} onReset={clearAll} />
      <span className="xm-sort-note">{ticketsFirst ? "Tickets first" : located ? "Top rated near you" : "Top rated and trending"}</span>
      {anyFilter ? <button type="button" className="xm-clear" onClick={clearAll}>Reset</button> : null}
    </div>
    <p className="xm-count" role="status" aria-live="polite">
      {failed ? "We could not load these listings. Try again in a moment." : loading ? "Updating…" : `${data.total} ${data.total === 1 ? "Christmas plan" : "Christmas plans"}${summary ? " · " + summary : ""}`}
    </p>
    <div className="xm-grid" data-browse-total={data.total} data-browse-shown={shownCards}>
      {cards.map((card, i) => <ChristmasBrowseCard key={card.id} card={card} rank={i + 1} today={today} />)}
    </div>
    {!loading && !failed && !cards.length ? <p className="xm-empty">No Christmas events match this filter right now. Try another experience or region.</p> : null}
    {data.hasMore ? <button type="button" className="xm-more" onClick={more} disabled={loading}>{loading ? "Loading…" : "Show more"}</button> : null}
    {hasPartner ? <div className="xm-foot"><GuideCommissionLine /></div> : null}
  </section>;
}
