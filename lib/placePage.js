// lib/placePage.js — SERVER-ONLY JSX renderers for the durable /places/[id] pages
// and the /places directory. The data + metadata (allowlist gate, details merge,
// content-gated indexability) live in the JSX-free lib/placeData.js so they stay
// unit-testable; this file is presentation only.
//
// A place page is Wayfind's crawlable home for a single place (name, category,
// rating, address, hours, an honest description, map + "Open in Wayfind" deep link);
// the full interactive sheet is one tap away in the app.
import { notFound } from "next/navigation";
import { SITE_URL } from "./site";
import { loadPlace } from "./placeData";
import { listIndexedPlaces } from "./placeIndex";

// Re-export the data/metadata so the route files import everything from here.
export { placePageMetadata, placesIndexMetadata, loadPlace } from "./placeData";

const S = {
  wrap: { maxWidth: 720, margin: "0 auto", padding: "28px 18px 64px", color: "#F1F5F9", fontFamily: "system-ui, -apple-system, sans-serif" },
  crumb: { fontSize: 12.5, color: "#94A3B8", marginBottom: 14 },
  crumbLink: { color: "#94A3B8", textDecoration: "none" },
  h1: { fontSize: 27, fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.5px", margin: "0 0 6px" },
  meta: { fontSize: 13.5, color: "#CBD5E1", margin: "0 0 4px", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" },
  addr: { fontSize: 13, color: "#94A3B8", textDecoration: "none", display: "inline-block", margin: "2px 0 16px" },
  desc: { fontSize: 15, color: "#E2E8F0", lineHeight: 1.6, margin: "0 0 18px" },
  cta: { display: "inline-block", padding: "12px 20px", borderRadius: 999, background: "#F97316", color: "#0D1117", fontWeight: 800, fontSize: 14.5, textDecoration: "none", marginRight: 10 },
  cta2: { display: "inline-block", padding: "12px 18px", borderRadius: 999, background: "#161B22", border: "1px solid #26303B", color: "#F1F5F9", fontWeight: 700, fontSize: 14, textDecoration: "none" },
  hh: { fontSize: 13, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.5px", margin: "26px 0 8px" },
  hrow: { fontSize: 13.5, color: "#CBD5E1", lineHeight: 1.9 },
  disc: { fontSize: 11.5, color: "#6E7681", marginTop: 32, lineHeight: 1.5, borderTop: "1px solid #26303B", paddingTop: 16 },
};

function jsonLd(obj) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(obj) }} />;
}

export async function PlacePage({ id }) {
  const p = await loadPlace(id);
  if (!p || !p.name) notFound(); // allowlist gate -> real 404 (no Google call was made)

  const url = `${SITE_URL}/places/${id}`;
  const mapHref = p.mapsUri || (p.lat != null ? `https://www.google.com/maps/search/?api=1&query=${p.lat}%2C${p.lng}` : null);
  const openHref = "/?place=" + encodeURIComponent(id);

  const ld = { "@context": "https://schema.org", "@type": "LocalBusiness", "@id": url, name: p.name, url,
    address: p.address || undefined,
    geo: p.lat != null ? { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng } : undefined,
    aggregateRating: p.rating != null && p.reviews >= 5 ? { "@type": "AggregateRating", ratingValue: p.rating, reviewCount: p.reviews } : undefined,
    priceRange: p.price || undefined,
    description: p.description || undefined };
  const crumb = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "Wayfind", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Places", item: `${SITE_URL}/places` },
    { "@type": "ListItem", position: 3, name: p.name, item: url },
  ] };

  return (
    <div style={S.wrap}>
      {jsonLd(ld)}
      {jsonLd(crumb)}
      <nav style={S.crumb}><a href="/" style={S.crumbLink}>Wayfind</a> › <a href="/places" style={S.crumbLink}>Places</a> › {p.name}</nav>
      <h1 style={S.h1}>{p.name}</h1>
      <div style={S.meta}>
        {p.category && <span style={{ fontWeight: 700, color: "#F97316" }}>{p.category}</span>}
        {p.rating != null && <span><span style={{ color: "#F59E0B" }}>★</span> {p.rating}{p.reviews ? <span style={{ color: "#8B949E" }}> ({p.reviews.toLocaleString()})</span> : null}</span>}
        {p.price && <span style={{ color: "#22C55E", fontWeight: 700 }}>{p.price}</span>}
        {p.businessStatus && p.businessStatus !== "OPERATIONAL" && <span style={{ color: "#EF4444", fontWeight: 700 }}>{p.businessStatus === "CLOSED_TEMPORARILY" ? "Temporarily closed" : "Permanently closed"}</span>}
      </div>
      {p.address && (mapHref ? <a href={mapHref} target="_blank" rel="noopener" style={S.addr}>{p.address} ↗</a> : <div style={{ ...S.addr, textDecoration: "none" }}>{p.address}</div>)}
      {p.description && <p style={S.desc}>{p.description}</p>}
      <div>
        <a href={openHref} style={S.cta}>Open in Wayfind →</a>
        {mapHref && <a href={mapHref} target="_blank" rel="noopener" style={S.cta2}>Directions ↗</a>}
      </div>
      {p.hours.length > 0 && (
        <>
          <div style={S.hh}>Hours</div>
          {p.hours.map((h, i) => (<div key={i} style={S.hrow}>{h}</div>))}
        </>
      )}
      <p style={S.disc}>Wayfind is an independent guide, not affiliated with the places listed. Details come from Google and may change — confirm hours before you go.</p>
    </div>
  );
}

export async function PlacesIndexPage() {
  const places = await listIndexedPlaces(200); // directory cap; the sitemap covers the full set
  return (
    <div style={S.wrap}>
      <nav style={S.crumb}><a href="/" style={S.crumbLink}>Wayfind</a> › Places</nav>
      <h1 style={S.h1}>Places on Wayfind</h1>
      <p style={S.desc}>Real places, ranked on real reviews — not ads. Open any one for hours, directions, and what's nearby.</p>
      {places.length === 0 ? (
        <p style={{ fontSize: 14, color: "#8B949E" }}>The place directory fills as people search. Check back soon.</p>
      ) : (
        <div>
          {places.map((x) => (
            <a key={x.place_id} href={`/places/${encodeURIComponent(x.place_id)}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "11px 2px", borderBottom: "1px solid #1c232c", textDecoration: "none", color: "#F1F5F9" }}>
              <span style={{ fontSize: 14.5, fontWeight: 600 }}>{x.name}</span>
              <span style={{ fontSize: 12.5, color: "#8B949E", flexShrink: 0 }}>{x.category || ""} ›</span>
            </a>
          ))}
        </div>
      )}
      <p style={S.disc}>Wayfind is an independent guide, not affiliated with the places listed.</p>
    </div>
  );
}
