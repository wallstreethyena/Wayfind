// v5.30 — Florida destination hubs (SEO audit items 9-12). One indexable,
// server-rendered page per town: the honest TOWN_PROFILES content that used
// to be buried inside the Sarasota culture page, PLUS live ranked listings
// (real places with ratings and review counts in the initial HTML — not
// after geolocation or JS). Every CTA deep-links the exact place with its
// town, so location intent survives the jump into the app.
import { notFound } from "next/navigation";
import { TOWN_PROFILES, TOWN_HUBS } from "../../../lib/culture";
import { rankedFor, whyLine, LANDING_CITIES } from "../../../lib/landing";
import { SITE_URL } from "../../../lib/site";

export const revalidate = 86400;
export const dynamicParams = false;

const KEY_BY_SLUG = Object.fromEntries(Object.entries(TOWN_HUBS).map(([k, slug]) => [slug, k]));

export function generateStaticParams() { return Object.values(TOWN_HUBS).map((town) => ({ town })); }

export function generateMetadata({ params }) {
  const t = TOWN_PROFILES[KEY_BY_SLUG[params.town]];
  if (!t) return { title: "Not found" };
  const url = `${SITE_URL}/florida/${params.town}`;
  const title = `Things to Do in ${t.title}, Florida (${new Date().getFullYear()}) — An Honest Local Guide`;
  const description = `${t.tag}. What ${t.title} actually is, what's worth your time, and the top-rated places right now — ranked by real reviews, no ads, no paid placement.`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url, siteName: "Wayfind", type: "article" } };
}

const S = {
  page: { maxWidth: 760, margin: "0 auto", padding: "28px 18px 60px", background: "#0D1117", color: "#E6EDF3", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", lineHeight: 1.6 },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#F97316" },
  h1: { fontSize: 30, lineHeight: 1.2, margin: "10px 0 6px", fontWeight: 800, color: "#FFFFFF" },
  tag: { fontSize: 15, color: "#8B949E", margin: "0 0 12px" },
  one: { fontSize: 15.5, color: "#E6EDF3", background: "#161B22", borderRadius: 12, padding: "12px 14px", margin: "0 0 18px" },
  h2: { fontSize: 21, fontWeight: 800, color: "#FFFFFF", margin: "26px 0 8px" },
  p: { fontSize: 14.5, color: "#C9D1D9", margin: "0 0 10px" },
  card: { background: "#161B22", borderRadius: 12, padding: "12px 14px", margin: "0 0 10px" },
  name: { fontSize: 15.5, fontWeight: 800, color: "#FFFFFF", margin: 0 },
  story: { fontSize: 13.5, color: "#C9D1D9", margin: "4px 0 8px" },
  open: { display: "inline-block", fontSize: 12.5, fontWeight: 800, color: "#F97316", textDecoration: "none" },
  mistake: { fontSize: 13, color: "#E8B84B", margin: "6px 0 0" },
  rowWhy: { fontSize: 13, color: "#8B949E", margin: "3px 0 0" },
  links: { fontSize: 14, color: "#C9D1D9", margin: "10px 0 0" },
  a: { color: "#F97316", fontWeight: 700, textDecoration: "none" },
  disclosure: { fontSize: 12, color: "#8B949E", background: "#161B22", borderRadius: 10, padding: "10px 12px", margin: "22px 0 0" },
};

const appUrl = (q) => "/?q=" + encodeURIComponent(q);
const SECTIONS = [["todo", "Things to do"], ["food", "Food & drink"], ["night", "Tonight"], ["beach", "Beaches & outdoors"], ["shop", "Shopping"], ["stays", "Where to stay"], ["events", "Events & seasons"]];

export default async function Page({ params }) {
  const key = KEY_BY_SLUG[params.town];
  const t = TOWN_PROFILES[key];
  // v5.76: hard 404 instead of a 200-status empty body. dynamicParams=false
  // already 404s slugs outside generateStaticParams; this covers the residual
  // in-params-but-no-profile edge so an unknown town never renders blank.
  if (!t) notFound();
  // Live top-rated list, rendered into the initial HTML (fails soft to the
  // editorial content alone if the upstream search is unavailable).
  const top = (await rankedFor("things-to-do", params.town).catch(() => null)) || [];
  const topTen = top.slice(0, 10);
  const inLanding = !!LANDING_CITIES[params.town];
  const nearby = Object.entries(TOWN_HUBS).filter(([k]) => k !== key);
  return (
    <main style={S.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Wayfind", item: SITE_URL }, { "@type": "ListItem", position: 2, name: "Florida", item: SITE_URL + "/culture/sarasota" }, { "@type": "ListItem", position: 3, name: t.title, item: SITE_URL + "/florida/" + params.town }] }) }} />
      {topTen.length >= 3 ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "ItemList", name: `Top things to do in ${t.title}, Florida`, itemListElement: topTen.map((p, i) => ({ "@type": "ListItem", position: i + 1, item: { "@type": "LocalBusiness", name: p.name, ...(p.rating != null && p.reviews >= 15 ? { aggregateRating: { "@type": "AggregateRating", ratingValue: p.rating, reviewCount: p.reviews } } : {}) } })) }) }} /> : null}
      <div style={S.kicker}>Wayfind · Florida destinations</div>
      <h1 style={S.h1}>{t.title}, Florida</h1>
      <p style={S.tag}>{t.tag}</p>
      <p style={S.one}><b style={{ color: "#F2C14E" }}>⭐ The one thing:</b> {t.one}</p>

      {topTen.length >= 3 ? (
        <>
          <h2 style={S.h2}>The top-rated places right now</h2>
          <p style={S.p}>Ranked by rating and review volume with Wayfind&apos;s junk filter — no ads, no paid placement. Live hours and the full list are in the app.</p>
          {topTen.map((p, i) => (
            <div key={p.id || i} style={S.card}>
              <p style={S.name}>{i + 1}. {p.name}</p>
              <p style={S.rowWhy}>{whyLine(p, "spot")}</p>
              <a style={S.open} href={appUrl(`${p.name} ${t.title} FL`)}>Open in Wayfind ›</a>
            </div>
          ))}
        </>
      ) : null}

      {SECTIONS.map(([ck, cl]) => { const sec = t[ck]; if (!sec || !sec.line) return null; return (
        <section key={ck}>
          <h2 style={S.h2}>{cl}</h2>
          <p style={S.p}>{sec.line}</p>
          {Array.isArray(sec.items) ? sec.items.map((x, i) => (
            <div key={i} style={S.card}>
              <p style={S.name}>{x.name}</p>
              <p style={S.story}>{x.story}</p>
              <a style={S.open} href={appUrl(x.place || x.query || `${x.name} ${t.title} FL`)}>Open in Wayfind ›</a>
            </div>
          )) : null}
          {sec.mistake ? <p style={S.mistake}>Common mistake: {sec.mistake}</p> : null}
        </section>
      ); })}

      {inLanding ? (
        <p style={S.links}><b style={{ color: "#FFFFFF" }}>Ranked lists for {t.title}:</b>{" "}
          <a style={S.a} href={`/things-to-do/${params.town}`}>Things to do</a> · <a style={S.a} href={`/restaurants/${params.town}`}>Restaurants</a> · <a style={S.a} href={`/beaches/${params.town}`}>Beaches</a> · <a style={S.a} href={`/nightlife/${params.town}`}>Nightlife</a>
        </p>
      ) : null}
      <p style={S.links}><b style={{ color: "#FFFFFF" }}>Nearby:</b>{" "}
        {nearby.map(([k, slug], i) => (<span key={slug}><a style={S.a} href={`/florida/${slug}`}>{TOWN_PROFILES[k].title}</a>{i < nearby.length - 1 ? " · " : ""}</span>))}
        {" "}· <a style={S.a} href="/culture/sarasota">Sarasota &amp; the Cultural Coast</a>
      </p>
      <div style={S.disclosure}>Researched from local sources, official venue information, and verified visitor data. Listings rank on merit — see <a style={S.a} href="/how-wayfind-ranks">how Wayfind ranks</a> and our <a style={S.a} href="/editorial-policy">editorial policy</a>. Wayfind may earn a commission from partner links; it never changes a ranking.</div>
    </main>
  );
}
