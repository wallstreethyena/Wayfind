"use client";
import { hospitalityDateChipLabel } from "../../lib/seasonalHospitalityCopy.js";
// The statewide Christmas browse (/christmas-in-florida, lead packet v4,
// 2026-10-13). The server renders the first page (app/christmas-in-florida/page.js);
// every filter change asks /api/christmas/browse, which reads the same merged
// data. Cards are the STANDARD RailCard in the standard list layout
// (.wf-place-card-list) wearing the Christmas skin (.wf-christmas): no second
// card component. Honesty labels come from lib/christmasCardCopy.js.
import { useEffect, useRef, useState } from "react";
import RailCard from "./RailCard";
import { WF_PLACE_CARD_CSS } from "./css.js";
import { CHRISTMAS_CARD_LABELS, christmasCardChips } from "../../lib/christmasCardCopy.js";
import { toDisplayScore } from "../../lib/score.js";

const C = { text: "#FFF7ED", muted: "#C9B8B0", line: "rgba(232,180,138,.45)", panel: "#2A0A12", accent: "#E8B48A" };
const FILTER_KEYS = ["region", "category", "when", "date", "price", "audience", "undated", "q", "lat", "lng"];

function distanceFact(card) {
  if (!Number.isFinite(Number(card.distMi)) || card.distMi == null) return null;
  const mi = Number(card.distMi);
  const shown = (card.approxLocation ? "~" : "") + (mi >= 10 ? Math.round(mi) : Math.round(mi * 10) / 10) + " mi";
  return card.distanceNote ? shown + " · " + card.distanceNote : shown;
}

export function ChristmasBrowseCard({ card, rank, today }) {
  const isPlace = card.kind === "place";
  const place = isPlace ? { ...card, photo: card.image || null, hook: card.take || card.hook || null } : null;
  const chips = isPlace ? [
    card.seasonalWhen ? { key: "season", icon: "🗓", label: hospitalityDateChipLabel(card.seasonalWhen), title: card.seasonalWhen } : null,
    card.sourceUrl ? { key: "proof", icon: "↗", label: "Source", title: "Open source", onClick: () => window.open(card.sourceUrl, "_blank", "noopener,noreferrer") } : null,
  ].filter(Boolean) : christmasCardChips(card, today);
  return <RailCard className="wf-exploding-primary"
    photo={card.image || null} placeholder={!card.image ? card.placeholder || null : null} photoFallbackCategory="christmas"
    photoAttr={card.photoAttr || null} photoAttrHref={card.photoAttrHref || null}
    place={place} visitFacts={isPlace ? null : card} title={card.title || card.name} eyebrow={CHRISTMAS_CARD_LABELS[card.christmasRail] || "CHRISTMAS"} rank={rank}
    score={isPlace ? toDisplayScore(card.wfScore) : null}
    when={isPlace ? null : card.when || null} facts={[card.city || null, distanceFact(card) || card.region || null].filter(Boolean)}
    chips={chips.slice(0, 4)} take={card.hook || null}
    href={card.detailHref || card.url || null} external={!card.detailHref}
    ariaLabel={`Open ${card.title || card.name}`}
    actionItem={isPlace ? null : { id: card.id, type: "event", title: card.title || card.name, image: card.image || null, url: card.detailHref || card.url || "" }} />;
}

const selectStyle = { minHeight: 44, borderRadius: 12, border: "1px solid " + C.line, background: C.panel, color: C.text, padding: "0 10px", fontSize: 14, maxWidth: "100%" };

export default function ChristmasBrowse({ initial, facets, today, initialQuery = {} }) {
  const [query, setQuery] = useState(() => ({ ...initialQuery }));
  const [data, setData] = useState(initial);
  const [cards, setCards] = useState(initial.cards || []);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const first = useRef(true);
  const typing = useRef(null);

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

  return <section id="browse" aria-labelledby="browse-title" style={{ margin: "8px 0 28px" }} data-christmas-browse="">
    <style dangerouslySetInnerHTML={{ __html: WF_PLACE_CARD_CSS }} />
    <h2 id="browse-title" style={{ fontSize: 24, margin: "0 0 6px", color: C.text }}>Verified Christmas outings in Florida</h2>
    <p style={{ margin: "0 0 14px", color: C.muted, fontSize: 15 }}>Filter by region, kind of outing, date, price and who it is for. Each listing links to its page with the map, schedule and official source.</p>
    <form role="search" onSubmit={(e) => e.preventDefault()} style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
      <input type="search" aria-label="Search by name or city" placeholder="Search by name or city" defaultValue={query.q || ""}
        onChange={(e) => { const v = e.target.value; clearTimeout(typing.current); typing.current = setTimeout(() => set("q", v), 300); }}
        style={{ ...selectStyle, flex: "1 1 220px" }} />
      <select aria-label="Region" value={query.region || ""} onChange={(e) => set("region", e.target.value)} style={selectStyle}>
        <option value="">All regions</option>{facets.regions.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
      <select aria-label="Kind of outing" value={query.category || ""} onChange={(e) => set("category", e.target.value)} style={selectStyle}>
        <option value="">Every kind</option>{facets.categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      <select aria-label="When" value={query.when || ""} onChange={(e) => set("when", e.target.value)} style={selectStyle}>
        <option value="">Any date</option>{facets.dates.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
      </select>
      <input type="date" aria-label="A specific date" min="2026-11-01" max="2027-01-31" value={query.date || ""} onChange={(e) => set("date", e.target.value)} style={selectStyle} />
      <select aria-label="Price" value={query.price || ""} onChange={(e) => set("price", e.target.value)} style={selectStyle}>
        <option value="">Any price</option>{facets.prices.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      <select aria-label="Who it is for" value={query.audience || ""} onChange={(e) => set("audience", e.target.value)} style={selectStyle}>
        <option value="">Everyone</option>{facets.audiences.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
      </select>
      <label style={{ ...selectStyle, display: "inline-flex", alignItems: "center", gap: 8 }}>
        <input type="checkbox" checked={!!query.undated} onChange={(e) => set("undated", e.target.checked)} /> Dates not announced
      </label>
      <button type="button" onClick={nearMe} style={{ ...selectStyle, fontWeight: 800 }}>{query.lat ? "Sorted nearest first" : "Sort nearest to me"}</button>
    </form>
    <p role="status" aria-live="polite" style={{ margin: "0 0 12px", color: C.muted, fontSize: 14 }}>
      {failed ? "We could not load these listings. Try again in a moment." : loading ? "Updating…" : `${data.total} ${data.total === 1 ? "listing" : "listings"}${query.undated ? " with a confirmed 2026 season and no dates yet" : ""}`}
    </p>
    <ol className="wf-place-card-list wf-christmas" style={{ listStyle: "none", margin: 0, padding: 0 }} data-browse-total={data.total}>
      {cards.map((card, i) => <li key={card.id} className="wf-place-card-slot"><ChristmasBrowseCard card={card} rank={i + 1} today={today} /></li>)}
    </ol>
    {data.hasMore ? <button type="button" onClick={more} disabled={loading} style={{ ...selectStyle, marginTop: 14, fontWeight: 800, padding: "0 18px" }}>{loading ? "Loading…" : "Show more"}</button> : null}
  </section>;
}
