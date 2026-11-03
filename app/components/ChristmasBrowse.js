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
import { storedPinFresh } from "../../lib/locationHonesty.js";
import { TicketCard } from "./ChristmasTicketCard.js";
import { GuideCommissionLine } from "./GuideCommissionLine.js";
import { CHRISTMAS_CARD_LABELS, CHRISTMAS_PRICE_UNKNOWN_TEXT, CHRISTMAS_SEASON_UNDATED_TEXT, christmasCopy, christmasPriceLabel } from "../../lib/christmasCardCopy.js";

const C = { text: "#FFF7ED", muted: "#C9B8B0", line: "rgba(232,180,138,.45)", panel: "#2A0A12", accent: "#E8B48A" };
const FILTER_KEYS = ["region", "category", "when", "date", "price", "audience", "undated", "q", "lat", "lng"];
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
    chip: isPlace ? (PLACE_CHIP[card.christmasRail] || "Christmas") : ticket ? ticket.chip : sentenceCase(CHRISTMAS_CARD_LABELS[card.christmasRail]),
    city: christmasCopy(card.city || ""),
    when: isPlace ? christmasCopy(card.seasonalWhen || "") : ticket ? ticket.when : christmasCopy(card.when || season || ""),
    price,
    photos: Array.isArray(card.photos) && card.photos.length ? card.photos.slice(0, 14) : (ticket && Array.isArray(ticket.photos) && ticket.photos.length ? ticket.photos.slice(0, 14) : browsePhotos(card)),
    placeholder: card.placeholder || null,
    cta: ticket ? ticket.cta : null,
    eventHref: card.detailHref || null,
    pageLabel: isPlace ? "View place" : null,
    sourceHref: !card.detailHref && /^https:\/\//.test(card.url || card.sourceUrl || "") ? (card.url || card.sourceUrl) : null,
  };
}

export function ChristmasBrowseCard({ card, rank = 0, today }) {
  return <TicketCard row={browseRowFor(card)} chrome={CHROME} idPrefix="xb-" headingLevel={3} priority={false} />;
}

const selectStyle = { minHeight: 44, borderRadius: 12, border: "1px solid " + C.line, background: "rgba(24,2,8,.72)", color: C.text, padding: "0 12px", fontSize: 16, maxWidth: "100%", minWidth: 0 };

export default function ChristmasBrowse({ initial, facets, today, initialQuery = {} }) {
  const [query, setQuery] = useState(() => ({ ...initialQuery }));
  const [draft, setDraft] = useState(initialQuery.q || ""); // what is typed in the search box (the query follows after a short pause)
  const [data, setData] = useState(initial);
  const [cards, setCards] = useState(initial.cards || []);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const first = useRef(true);
  const typing = useRef(null);

  // The reader's own location, without a tap (owner 2026-11-03: "based on
  // distance from the user current location, highest rated closest first").
  // The pin the home page already keeps (wf_center, fresh within its TTL) is
  // used at once with no prompt; otherwise the browser is asked once. A URL
  // that already carries lat/lng, or a reader who picked "Tickets first" in
  // this visit, is left alone.
  useEffect(() => {
    if (initialQuery.lat != null && initialQuery.lat !== "") return undefined;
    let dead = false;
    const use = (lat, lng) => { if (!dead && Number.isFinite(lat) && Number.isFinite(lng) && lat > 24 && lat < 31.2 && lng > -88 && lng < -79.5) setQuery((q) => (q.lat && q.lat !== "" ? q : { ...q, lat: lat.toFixed(3), lng: lng.toFixed(3) })); };
    try {
      const pin = JSON.parse(localStorage.getItem("wf_center") || "null");
      if (storedPinFresh(pin)) { use(Number(pin.lat), Number(pin.lng)); return () => { dead = true; }; }
    } catch { /* ignore */ }
    try {
      if (navigator.geolocation) navigator.geolocation.getCurrentPosition((pos) => use(pos.coords.latitude, pos.coords.longitude), () => {}, { timeout: 8000, maximumAge: 300000 });
    } catch { /* ignore */ }
    return () => { dead = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const params = new URLSearchParams();
    for (const k of FILTER_KEYS) if (query[k] !== undefined && query[k] !== "" && query[k] !== false && query[k] !== null) params.set(k, query[k] === true ? "1" : String(query[k]));
    try { window.history.replaceState(null, "", params.toString() ? "?" + params.toString() + "#browse" : location.pathname + "#browse"); } catch {}
    const controller = new AbortController();
    setLoading(true); setFailed(false);
    fetch("/api/christmas/browse?" + params.toString(), { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("status " + r.status))))
      .then((json) => { setData(json); setCards(json.cards || []); })
      .catch((error) => { if (error?.name !== "AbortError") setFailed(true); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [query]);

  const set = (k, v) => setQuery((q) => ({ ...q, [k]: v, ...(k === "when" && v ? { date: "", undated: false } : {}), ...(k === "date" && v ? { when: "", undated: false } : {}), ...(k === "undated" && v ? { when: "", date: "" } : {}) }));
  const more = () => {
    const params = new URLSearchParams();
    for (const k of FILTER_KEYS) if (query[k]) params.set(k, query[k] === true ? "1" : String(query[k]));
    params.set("page", String((data.page || 1) + 1));
    setLoading(true);
    fetch("/api/christmas/browse?" + params.toString()).then((r) => r.json()).then((json) => { setData(json); setCards((prev) => [...prev, ...(json.cards || [])]); }).catch(() => setFailed(true)).finally(() => setLoading(false));
  };
  const nearMe = () => {
    try {
      navigator.geolocation.getCurrentPosition((pos) => setQuery((q) => ({ ...q, lat: pos.coords.latitude.toFixed(3), lng: pos.coords.longitude.toFixed(3) })), () => {}, { timeout: 8000 });
    } catch {}
  };

  // ONE list and ONE control for the whole page (owner 2026-11-01, and
  // 2026-11-03: the horizontal chip rail was overwhelming and did not look
  // scrollable). The standard filter pill holds what to show, the order, the
  // dates and the region; beside it the search box. Under them one plain line
  // says what the list is showing right now, with a way to clear it.
  const pills = Array.isArray(facets.pills) ? facets.pills : [];
  const dates = Array.isArray(facets.dates) ? facets.dates : [];
  const catLabel = (pills.find((p) => p.id === query.category) || {}).label || "";
  const whenLabel = (dates.find((d) => d.id === query.when) || {}).label || "";
  const located = query.lat != null && query.lat !== "";
  const anyFilter = !!(query.category || query.when || query.region || query.q);
  const summary = [catLabel, whenLabel, query.region, located ? "closest first" : "tickets first"].filter(Boolean).join(" · ");
  const clearAll = () => { clearTimeout(typing.current); setDraft(""); setQuery((q) => ({ ...q, category: "", when: "", date: "", undated: false, region: "", q: "" })); };
  const shownCards = cards.length;
  const hasPartner = cards.some((c) => c.ticketRow && c.ticketRow.cta && c.ticketRow.cta.kind === "affiliate");
  return <section id="browse" aria-label="Florida Christmas events" style={{ margin: "0 0 28px" }} data-christmas-browse="">
    <form role="search" className="xm-controls" data-boo-clear="" onSubmit={(e) => e.preventDefault()}>
      <ChristmasFilter query={query} facets={facets} onSet={set} onNear={nearMe}
        onClearNear={() => setQuery((q) => ({ ...q, lat: "", lng: "" }))} />
      <input type="search" aria-label="Search by name or city" placeholder="Search by name or city" value={draft}
        onChange={(e) => { const v = e.target.value; setDraft(v); clearTimeout(typing.current); typing.current = setTimeout(() => set("q", v), 300); }}
        style={{ ...selectStyle, flex: "1 1 180px", borderRadius: 999, minHeight: 46, padding: "0 16px" }} />
    </form>
    <p className="xm-count" role="status" aria-live="polite" data-boo-clear="">
      {failed ? "We could not load these listings. Try again in a moment." : loading ? "Updating…" : <>
        <b>{data.total} {data.total === 1 ? "listing" : "listings"}</b>
        <span className="xm-count-what"> · {summary}</span>
        {anyFilter ? <button type="button" className="xm-clear" onClick={clearAll}>Clear</button> : null}
      </>}
    </p>
    <div className="xm-grid" data-browse-total={data.total} data-browse-shown={shownCards}>
      {cards.map((card, i) => <ChristmasBrowseCard key={card.id} card={card} rank={i + 1} today={today} />)}
    </div>
    {!loading && !failed && !cards.length ? <p className="xm-empty">No Christmas events match this filter right now. Try another category or region.</p> : null}
    {data.hasMore ? <button type="button" className="xm-more" onClick={more} disabled={loading}>{loading ? "Loading…" : "Show more"}</button> : null}
    {hasPartner ? <div className="xm-foot"><GuideCommissionLine /></div> : null}
  </section>;
}
