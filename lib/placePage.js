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
import { pageShareUrl } from "./pageShareUrl";
import ShareButton from "../app/components/ShareButton";
import { loadPlace, placePagePartner, cityOf } from "./placeData";
import { listEligiblePlaces } from "./placeIndex";
import { featuredInFor } from "./placeFeaturedIn";
import PlacePageBookLink from "../app/components/PlacePageBookLink";
import { placeLocalBusinessLd } from "./placeSchema";

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
  guideNote: { background: "#161B22", border: "1px solid #26303B", borderRadius: 12, padding: "14px 16px", margin: "4px 0 18px" },
  guideKicker: { display: "block", fontSize: 11.5, fontWeight: 800, color: "#F97316", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 },
  guideText: { fontSize: 14, color: "#E2E8F0", lineHeight: 1.6, margin: "0 0 8px" },
  guideLink: { fontSize: 13, fontWeight: 700, color: "#F97316", textDecoration: "none" },
  guideAlso: { fontSize: 13, color: "#94A3B8", lineHeight: 1.6, margin: "8px 0 0" },
  featRow: { fontSize: 13.5, color: "#CBD5E1", lineHeight: 1.9, margin: "0 0 6px" },
  featNearby: { fontSize: 13.5, color: "#CBD5E1", lineHeight: 1.7, display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderBottom: "1px solid #1c232c" },
  featCat: { fontSize: 12, color: "#8B949E", flexShrink: 0 },
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
  const partner = placePagePartner(p);
  const bookable = !!(partner && partner.provider && partner.offerId);
  // When the guide blurb IS the page's only description (mergePlacePage had
  // nothing else), don't print it twice — once plain, once in the attributed
  // guide box below. A page that also has its own Google/Atlas description
  // still gets the guide box (its own text, a real internal link back).
  const usingGuideDescription = !!(p.guide && p.guide.blurb && p.description === p.guide.blurb);
  // "On Wayfind" — real, verified internal connections built ONLY from facts
  // Wayfind already holds (lib/placeFeaturedIn.js): a creator's video, a
  // culture-hub mention, a city hub link, and up to six other durably
  // eligible places nearby. null when none of it applies to this place, so
  // no empty heading ever renders. City is computed here (not inside
  // placeFeaturedIn.js) so that module stays importable by plain `node` —
  // see its own header for why.
  const featured = featuredInFor(p, { city: cityOf(p.address) || p.guideCity || null });
  const ld = placeLocalBusinessLd(p, url);
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
      {p.description && !usingGuideDescription && <p style={S.desc}>{p.description}</p>}
      {p.guide && (
        <div style={S.guideNote}>
          <span style={S.guideKicker}>From the Wayfind guide</span>
          {p.guide.blurb && <p style={S.guideText}>{p.guide.blurb}</p>}
          <a href={"/guides/" + encodeURIComponent(p.guide.slug)} style={S.guideLink}>
            Read the full {p.guide.title || "guide"} →
          </a>
          {p.guide.alsoIn && p.guide.alsoIn.length > 0 && (
            <p style={S.guideAlso}>
              Also featured in{" "}
              {p.guide.alsoIn.map((g, i) => (
                <span key={g.slug}>
                  {i > 0 ? ", " : ""}
                  <a href={"/guides/" + encodeURIComponent(g.slug)} style={S.guideLink}>{g.title || "a Wayfind guide"}</a>
                </span>
              ))}
            </p>
          )}
        </div>
      )}
      <div>
        {bookable ? (
          <PlacePageBookLink
            provider={partner.provider}
            offerId={partner.offerId}
            contentId={id}
            merchant={partner.merchant}
            style={S.cta}
          />
        ) : null}
        <a href={openHref} style={bookable ? S.cta2 : S.cta}>Open in Wayfind →</a>
        {mapHref && <a href={mapHref} target="_blank" rel="noopener" style={S.cta2}>Directions ↗</a>}
        <span style={{ display: "inline-block", verticalAlign: "middle", margin: "10px 0 0", marginLeft: mapHref ? 10 : 0 }}>
          <ShareButton url={pageShareUrl("/places/" + id)} title={p.name + " on Wayfind"}
            text={p.name + (p.guideCity ? " in " + p.guideCity : "") + ". Found on Wayfind."}
            label="Share" tone="dark" event="page_share" meta={{ surface: "place_page", place_id: id, placement: "actions" }} />
        </span>
      </div>
      {bookable ? (
        <p style={{ fontSize: 11.5, color: "#94A3B8", margin: "10px 0 0" }}>
          We may earn a commission when you book through partner links. It never changes our rankings.
        </p>
      ) : null}
      {p.bestTime && (
        <>
          <div style={S.hh}>Best time to go</div>
          <p style={S.guideText}>{p.bestTime}</p>
        </>
      )}
      {p.localTip && (
        <>
          <div style={S.hh}>Local tip</div>
          <p style={S.guideText}>{p.localTip}</p>
        </>
      )}
      {p.hours.length > 0 && (
        <>
          <div style={S.hh}>Hours</div>
          {p.hours.map((h, i) => (<div key={i} style={S.hrow}>{h}</div>))}
        </>
      )}
      {featured && (
        <>
          <div style={S.hh}>On Wayfind</div>
          {featured.creators.length > 0 && (
            <p style={S.featRow}>
              Featured by{" "}
              {featured.creators.map((c, i) => (
                <span key={c.handle}>
                  {i > 0 ? ", " : ""}
                  <a href={"/creators/" + encodeURIComponent(c.handle)} style={S.guideLink}>@{c.handle}</a>
                </span>
              ))}
            </p>
          )}
          {featured.culture.length > 0 && (
            <p style={S.featRow}>
              In the local edit for{" "}
              {featured.culture.map((c, i) => (
                <span key={c.metro}>
                  {i > 0 ? ", " : ""}
                  <a href={"/culture/" + encodeURIComponent(c.metro)} style={S.guideLink}>{c.title}</a>
                </span>
              ))}
            </p>
          )}
          {featured.city && featured.city.landing && (
            <p style={S.featRow}><a href={featured.city.landing.href} style={S.guideLink}>{featured.city.landing.label} ›</a></p>
          )}
          {featured.city && featured.city.florida && (
            <p style={S.featRow}><a href={featured.city.florida.href} style={S.guideLink}>{featured.city.florida.label} ›</a></p>
          )}
          {featured.nearby.length > 0 && (
            <>
              <p style={S.featRow}>Nearby on Wayfind</p>
              {featured.nearby.map((n) => (
                <a key={n.id} href={"/places/" + encodeURIComponent(n.id)} style={{ ...S.featNearby, textDecoration: "none", color: "#F1F5F9" }}>
                  <span>{n.name}</span>
                  <span style={S.featCat}>{n.category || ""} ›</span>
                </a>
              ))}
            </>
          )}
        </>
      )}
      <p style={S.disc}>Wayfind is an independent guide, not affiliated with the places listed. Details come from Google and may change — confirm hours before you go.</p>
    </div>
  );
}

export async function PlacesIndexPage() {
  // Only DURABLY ELIGIBLE places (see lib/placeEligibility.js) — the same
  // set the sitemap lists — sorted by name, still capped. Previously this
  // rendered off the raw recently-searched wf_place_ids set, so the
  // directory (itself indexable) could link straight to pages the site was
  // simultaneously telling Google to noindex.
  const places = await listEligiblePlaces(200); // directory cap; the sitemap covers the full set
  return (
    <div style={S.wrap}>
      <nav style={S.crumb}><a href="/" style={S.crumbLink}>Wayfind</a> › Places</nav>
      <h1 style={S.h1}>Places on Wayfind</h1>
      <p style={S.desc}>Real places, ranked on real reviews — not ads. Open any one for hours, directions, and what's nearby.</p>
      <div style={{ margin: "0 0 16px" }}>
        <ShareButton url={pageShareUrl("/places")} title="Places on Wayfind"
          text="Real places, ranked on real reviews, not ads. On Wayfind."
          label="Share" tone="dark" event="page_share" meta={{ surface: "places_index", placement: "header" }} />
      </div>
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
