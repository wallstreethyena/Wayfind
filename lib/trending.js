// lib/trending.js — SERVER-ONLY. The indexable /trending/[city] pages (Phase 2a).
//
// These are Wayfind's real SEO surface for creator videos: unique, crawlable
// city pages that aggregate the video-tagged places in that city, each with a
// click-to-load facade player and a FOLLOWED link out to the creator (the
// backlink — never noreferrer/nofollow). Emits ItemList + BreadcrumbList JSON-LD.
// VideoObject is deferred to Phase 2b (it needs a durable, self-hosted thumbnail
// + a real uploadDate; a signed/expiring oEmbed thumbnail would be invalid schema).
//
// This module holds the place BLURBS + addresses on purpose (not creatorVideos.js),
// so that client-bundled Phase-1 code never ships this copy. Blurbs are ALWAYS
// Wayfind's own words; where we lack grounded facts we stay honest and lean on the
// creator feature rather than fabricate specifics.
import { SITE_URL } from "./site";
import { videosByKey, PLATFORM } from "./creatorVideos";
import VideoFacade from "../app/components/VideoFacade";

export const TRENDING = {
  bradenton: {
    name: "Bradenton",
    state: "FL",
    places: [
      {
        key: "spinning-coffee-bradenton",
        title: "Spinning Coffee",
        address: "515 36th St W, Bradenton, FL 34205",
        blurb:
          "A locally loved coffee stop in west Bradenton, currently making the rounds on TikTok. Watch creator @cindy.selects's visit below, then open it in Wayfind for hours, directions, and what's worth pairing it with nearby.",
      },
    ],
  },
  "fort-lauderdale": {
    name: "Fort Lauderdale",
    state: "FL",
    places: [
      {
        key: "mai-kai-fort-lauderdale",
        title: "Mai-Kai Restaurant & Polynesian Show",
        address: "3599 N Federal Hwy, Fort Lauderdale, FL 33308",
        blurb:
          "A Fort Lauderdale institution since 1956, Mai-Kai pairs a Polynesian dinner show with tiki cocktails in a genuine landmark setting. Reservations are required and there's a per-guest entrée minimum, so plan it as a full night out rather than a quick stop.",
      },
    ],
  },
};

export function trendingCitySlugs() {
  return Object.keys(TRENDING);
}

export function trendingMetadata(slug) {
  const c = TRENDING[slug];
  if (!c) return { title: "Not found", robots: { index: false } };
  const url = `${SITE_URL}/trending/${slug}`;
  const title = `TikTok-Famous & Trending Spots in ${c.name}, ${c.state} — Wayfind`;
  const description = `Real places in ${c.name}, ${c.state} that are trending on social right now — each with the creator's video and an honest Wayfind take. Watch, then open it in Wayfind for hours, directions, and nearby picks.`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, siteName: "Wayfind", type: "website" } };
}

export function trendingIndexMetadata() {
  const url = `${SITE_URL}/trending`;
  const title = "Trending & TikTok-Famous Places — Wayfind";
  const description = "Real, worth-your-time places that are trending on TikTok and social, organized by city — each with the creator's video and an honest Wayfind take.";
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, siteName: "Wayfind", type: "website" } };
}

// ── styles (inline, dark theme tokens) ──────────────────────────────────────
const S = {
  wrap: { maxWidth: 760, margin: "0 auto", padding: "28px 18px 64px", color: "#F1F5F9", fontFamily: "system-ui, -apple-system, sans-serif" },
  crumb: { fontSize: 12.5, color: "#94A3B8", marginBottom: 14 },
  crumbLink: { color: "#94A3B8", textDecoration: "none" },
  h1: { fontSize: 27, fontWeight: 800, lineHeight: 1.15, letterSpacing: "-0.5px", margin: "0 0 8px" },
  lede: { fontSize: 14.5, color: "#CBD5E1", lineHeight: 1.55, margin: "0 0 26px", maxWidth: 620 },
  card: { background: "#161B22", border: "1px solid #26303B", borderRadius: 16, padding: 16, marginBottom: 18 },
  place: { fontSize: 18, fontWeight: 800, color: "#F8FAFC", margin: "0 0 3px" },
  addr: { fontSize: 12.5, color: "#8B949E", margin: "0 0 10px" },
  blurb: { fontSize: 14, color: "#CBD5E1", lineHeight: 1.55, margin: "0 0 14px" },
  credit: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 800, textDecoration: "none", marginTop: 12 },
  open: { display: "inline-block", marginTop: 12, marginLeft: 14, fontSize: 13, fontWeight: 700, color: "#F97316", textDecoration: "none" },
  cityLink: { display: "inline-block", marginRight: 14, fontSize: 14, fontWeight: 700, color: "#F97316", textDecoration: "none" },
  disc: { fontSize: 11.5, color: "#6E7681", marginTop: 30, lineHeight: 1.5, borderTop: "1px solid #26303B", paddingTop: 16 },
};

function jsonLd(obj) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(obj) }} />;
}

function placeCard(p) {
  const vids = videosByKey(p.key);
  const openHref = "/?q=" + encodeURIComponent(p.title);
  return (
    <div key={p.key} style={S.card}>
      <h2 style={S.place}>{p.title}</h2>
      <div style={S.addr}>{p.address}</div>
      <p style={S.blurb}>{p.blurb}</p>
      {vids.map((v, i) => {
        const pl = PLATFORM[v.platform] || {};
        const handle = v.creator ? "@" + v.creator : null;
        const label = `${p.title} on ${pl.label || v.platform}`;
        return (
          <div key={i}>
            <VideoFacade platform={v.platform} url={v.url} label={label} />
            <div>
              {/* FOLLOWED backlink to the creator — deliberately no noreferrer/nofollow. */}
              <a href={v.url} target="_blank" rel="noopener" style={{ ...S.credit, color: pl.color || "#F97316" }} aria-label={`Watch ${label} on ${pl.label || v.platform} (opens in a new tab)`}>
                Watch {handle ? handle + " " : ""}on {pl.label || v.platform} ↗
              </a>
              <a href={openHref} style={S.open}>Open in Wayfind →</a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TrendingCityPage({ slug }) {
  const c = TRENDING[slug];
  if (!c) return <div style={S.wrap}><h1 style={S.h1}>City not found</h1><p style={S.lede}><a href="/trending" style={S.cityLink}>See all trending cities →</a></p></div>;
  const url = `${SITE_URL}/trending/${slug}`;
  const others = trendingCitySlugs().filter((s) => s !== slug);
  const breadcrumb = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "Wayfind", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: "Trending", item: `${SITE_URL}/trending` },
    { "@type": "ListItem", position: 3, name: `${c.name}, ${c.state}`, item: url },
  ] };
  const itemList = { "@context": "https://schema.org", "@type": "ItemList", name: `Trending places in ${c.name}, ${c.state}`, numberOfItems: c.places.length,
    itemListElement: c.places.map((p, i) => ({ "@type": "ListItem", position: i + 1, item: { "@type": "LocalBusiness", name: p.title, address: p.address } })) };
  return (
    <div style={S.wrap}>
      {jsonLd(breadcrumb)}
      {jsonLd(itemList)}
      <nav style={S.crumb}><a href="/" style={S.crumbLink}>Wayfind</a> › <a href="/trending" style={S.crumbLink}>Trending</a> › {c.name}</nav>
      <h1 style={S.h1}>Trending &amp; TikTok-Famous Spots in {c.name}, {c.state}</h1>
      <p style={S.lede}>Real places in {c.name} that are getting attention on TikTok and social right now. Each one has the creator's video and an honest Wayfind take — watch, then open it in Wayfind for hours, directions, and what's nearby.</p>
      {c.places.map((p) => placeCard(p))}
      {others.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: "#94A3B8", marginBottom: 8 }}>Trending in other cities</div>
          {others.map((s) => (<a key={s} href={`/trending/${s}`} style={S.cityLink}>{TRENDING[s].name} →</a>))}
        </div>
      )}
      <p style={S.disc}>Wayfind is an independent guide, not affiliated with the venues or creators listed. Creator videos are linked to their original posts; we don't host or modify them. Place descriptions are Wayfind's own.</p>
    </div>
  );
}

export function TrendingIndexPage() {
  const slugs = trendingCitySlugs();
  const itemList = { "@context": "https://schema.org", "@type": "ItemList", name: "Trending places by city", numberOfItems: slugs.length,
    itemListElement: slugs.map((s, i) => ({ "@type": "ListItem", position: i + 1, name: `${TRENDING[s].name}, ${TRENDING[s].state}`, url: `${SITE_URL}/trending/${s}` })) };
  return (
    <div style={S.wrap}>
      {jsonLd(itemList)}
      <nav style={S.crumb}><a href="/" style={S.crumbLink}>Wayfind</a> › Trending</nav>
      <h1 style={S.h1}>Trending &amp; TikTok-Famous Places</h1>
      <p style={S.lede}>Worth-your-time places that are trending on TikTok and social, organized by city — each with the creator's video and an honest Wayfind take.</p>
      {slugs.map((s) => (
        <a key={s} href={`/trending/${s}`} style={{ ...S.card, display: "block", textDecoration: "none" }}>
          <div style={S.place}>{TRENDING[s].name}, {TRENDING[s].state}</div>
          <div style={S.addr}>{TRENDING[s].places.length} trending {TRENDING[s].places.length === 1 ? "place" : "places"} →</div>
        </a>
      ))}
      <p style={S.disc}>Wayfind is an independent guide, not affiliated with the venues or creators listed.</p>
    </div>
  );
}
