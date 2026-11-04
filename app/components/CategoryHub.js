import ShareButton from "../components/ShareButton";
import { SITE_URL } from "../../lib/site";
import { LANDING_CATS, landingCityParams, landingPair } from "../../lib/landing";

// One shared server component behind the category hub pages (/restaurants,
// /things-to-do, /nightlife, /beaches). A bare category URL used to 404; the
// hub gives it a crawlable index of every PUBLISHED city page and nothing else.
// "Published" is the sitemap's own test (landingCityParams + landingPair), so a
// withheld pair can never be linked from here.

const S = {
  page: { maxWidth: 760, margin: "0 auto", padding: "28px 18px 60px", background: "#0D1117", color: "#E6EDF3", fontFamily: "var(--wf-sans)", lineHeight: 1.6 },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#FF8A3D" },
  h1: { fontSize: 30, lineHeight: 1.2, margin: "10px 0 8px", fontWeight: 800, color: "#FFFFFF" },
  sub: { fontSize: 16, color: "#8B949E", marginBottom: 16 },
  h2: { fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#8ED6C4", margin: "28px 0 10px" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10, listStyle: "none", padding: 0, margin: 0 },
  link: { display: "block", padding: "12px 14px", borderRadius: 12, background: "#161B22", border: "1px solid #21262D", color: "#FFFFFF", fontWeight: 700, fontSize: 15, textDecoration: "none" },
};

function cityRow(cat, slug) {
  const pair = landingPair(cat, slug);
  if (!pair) return null;
  // landingPair resolves LANDING_CITIES and the published evergreen towns alike.
  return { slug, name: pair.city.name, state: pair.city.state || "" };
}

/** Published city rows for one category: Florida first, then everywhere else (Hawaii), each in table order. */
export function hubCities(cat) {
  const rows = landingCityParams(cat).map(({ city }) => cityRow(cat, city)).filter(Boolean);
  return [...rows.filter((r) => r.state === "FL"), ...rows.filter((r) => r.state !== "FL")];
}

/**
 * path: the hub's own route, e.g. "/restaurants".
 * cat: a LANDING_CATS key; its published cities link to `${path}/${slug}`.
 * extras: optional [{ title, links: [{ href, label }] }] sections after the grid.
 */
export default function CategoryHub({ path, cat, h1, intro, extras = [] }) {
  const shareUrl = SITE_URL + path;
  const rows = hubCities(cat);
  const fl = rows.filter((r) => r.state === "FL");
  const other = rows.filter((r) => r.state !== "FL");
  const label = LANDING_CATS[cat].label;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: h1,
    numberOfItems: rows.length,
    itemListElement: rows.map((r, i) => ({ "@type": "ListItem", position: i + 1, name: `${label} in ${r.name}`, url: `${SITE_URL}${path}/${r.slug}` })),
  };
  return (
    <div style={S.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div style={S.kicker}>Wayfind {label}</div>
      <h1 style={S.h1}>{h1}</h1>
      <p style={S.sub}>{intro}</p>
      <ShareButton url={shareUrl} title={h1} text={`${h1}. Found on Wayfind.`} label="Share" tone="dark" event="page_share" meta={{ surface: "category_hub", placement: "header" }} />

      <h2 style={S.h2}>Florida</h2>
      <ul style={S.grid}>
        {fl.map((r) => <li key={r.slug}><a style={S.link} href={`${path}/${r.slug}`}>{r.name}</a></li>)}
      </ul>
      {other.length ? (
        <>
          <h2 style={S.h2}>Hawaii</h2>
          <ul style={S.grid}>
            {other.map((r) => <li key={r.slug}><a style={S.link} href={`${path}/${r.slug}`}>{r.name}</a></li>)}
          </ul>
        </>
      ) : null}

      {extras.map((x) => (
        <section key={x.title}>
          <h2 style={S.h2}>{x.title}</h2>
          <ul style={S.grid}>
            {x.links.map((l) => <li key={l.href}><a style={S.link} href={l.href}>{l.label}</a></li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}
