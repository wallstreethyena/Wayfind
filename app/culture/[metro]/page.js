// v4.16 — Indexable culture pages. Same editorial content the in-app culture
// cards render, served as real HTML so search engines can read it. These are
// the trust-and-authority pages in the middleman structure: they earn links
// and pass authority to the guides and the app through internal links.
import { notFound } from "next/navigation";
import { CULTURE, TOWN_PROFILES, TOWN_HUBS } from "../../../lib/culture";
import { SITE_URL } from "../../../lib/site";
import { experienceSearchUrl, viatorDirectUrl, experienceGoUrl } from "../../../lib/affiliates";
import { resolveViatorProduct } from "../../../lib/viatorServer";
import OpenAppCTA from "../../components/OpenAppCTA.js";

// v5.04: ISR so the render-time Viator product resolution below stays fresh.
export const revalidate = 86400;

export function generateStaticParams() {
  return Object.keys(CULTURE).map((metro) => ({ metro }));
}

export function generateMetadata({ params }) {
  const c = CULTURE[params.metro];
  if (!c) return { title: "Not found" };
  const url = `${SITE_URL}/culture/${params.metro}`;
  const title = `What ${c.title} Is Known For: Food, Sayings & Must-Do Experiences`;
  const description = `What to eat in ${c.title}, the experiences not to miss, how locals talk, and the one etiquette rule visitors should know.`;
  // THE SHARE-CARD RULE: a card unique to this page, never the homepage art.
  const ogImg = `${SITE_URL}/api/og?t=${encodeURIComponent("What " + c.title + " is known for")}&loc=${encodeURIComponent(c.title)}`;
  return { title: `${title} | Wayfind`, description, alternates: { canonical: url }, openGraph: { title, description, url, siteName: "Wayfind", type: "article", images: [{ url: ogImg, width: 1200, height: 630 }] }, twitter: { card: "summary_large_image", title, description, images: [ogImg] } };
}

const S = {
  page: { maxWidth: 760, margin: "0 auto", padding: "28px 18px 60px", background: "#0D1117", color: "#E6EDF3", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", lineHeight: 1.6 },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#2EC9A6" },
  h1: { fontSize: 30, lineHeight: 1.2, margin: "10px 0 8px", fontWeight: 800, color: "#FFFFFF" },
  sub: { fontSize: 16, color: "#8B949E", marginBottom: 22 },
  h2: { fontSize: 21, fontWeight: 800, color: "#FFFFFF", margin: "26px 0 10px" },
  item: { margin: "0 0 14px" },
  name: { fontSize: 16.5, fontWeight: 800, color: "#FFFFFF", margin: 0 },
  story: { fontSize: 15, color: "#C9D1D9", margin: "2px 0 0" },
  book: { display: "inline-block", marginTop: 6, padding: "6px 13px", borderRadius: 999, background: "#2EC9A6", color: "#0D1117", fontWeight: 800, fontSize: 13, textDecoration: "none" },
  phrase: { fontSize: 15.5, fontWeight: 800, color: "#FFFFFF" },
  meaning: { fontSize: 15, color: "#C9D1D9" },
  disclosure: { fontSize: 12, color: "#8B949E", margin: "22px 0 0", padding: "10px 14px", background: "#161B22", borderRadius: 10 },
  footerLink: { color: "#2EC9A6", textDecoration: "none", fontWeight: 700 },
};

export default async function CulturePage({ params }) {
  const c = CULTURE[params.metro];
  // v5.75 (crash fix): the old not-found branch referenced c.title while c was
  // undefined — a guaranteed TypeError → HTTP 500 on any unknown metro slug (bad
  // for users and for how Google reads these URLs). Return a real 404.
  if (!c) notFound();
  return (
    <main style={S.page}>
      {/* v5.75: the Article + Breadcrumb JSON-LD used to sit ONLY in the
          not-found branch (which crashed), so the REAL culture pages shipped
          with no structured data. Moved here, onto the actual page Google reads. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "Article", headline: "What " + c.title + " Is Known For", description: "What to eat in " + c.title + ", must-do experiences, and how locals talk.", author: { "@type": "Organization", name: "Wayfind" }, publisher: { "@type": "Organization", name: "WAYFIND LLC", logo: { "@type": "ImageObject", url: SITE_URL + "/icon-512.png" } }, mainEntityOfPage: SITE_URL + "/culture/" + params.metro }) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Wayfind", item: SITE_URL }, { "@type": "ListItem", position: 2, name: "Cities", item: SITE_URL }, { "@type": "ListItem", position: 3, name: c.title, item: SITE_URL + "/culture/" + params.metro }] }) }} />
      <div style={S.kicker}>Know before you go · {c.tag}</div>
      <h1 style={S.h1}>What {c.title} Is Known For</h1>
      <p style={S.sub}>The local food, the experiences you shouldn&apos;t leave without, the sights worth your eyes, and how the locals actually talk.</p>
      <h2 style={S.h2}>Eat like a local</h2>
      {c.eat.map((x, i) => (<div key={i} style={S.item}><p style={S.name}>{x.name}</p><p style={S.story}>{x.story}</p></div>))}
      <h2 style={S.h2}>Don&apos;t leave without</h2>
      {/* v5.04: query-only items resolve their EXACT Viator product at render
          time (region-validated, affiliate-attributed) so the baked link
          lands on the product page. /go stays only as the last resort. */}
      {(await Promise.all(c.do.map(async (x) => {
        if (x.viatorUrl) return [x, viatorDirectUrl(x.viatorUrl)];
        if (!x.query) return [x, null];
        const direct = await resolveViatorProduct(x.query + " " + c.title, c.title).catch(() => null);
        return [x, direct || experienceGoUrl(x.query, c.title)];
      }))).map(([x, url], i) => (
        <div key={i} style={S.item}><p style={S.name}>{x.name}</p><p style={S.story}>{x.story}</p>{url ? <a href={url} target="_blank" rel="noreferrer sponsored" style={S.book}>See related tours &amp; tickets ↗</a> : null}</div>
      ))}
      <h2 style={S.h2}>Worth your eyes</h2>
      {c.see.map((x, i) => (<div key={i} style={S.item}><p style={S.name}>{x.name}</p><p style={S.story}>{x.story}</p></div>))}
      <h2 style={S.h2}>Talk like a local</h2>
      {c.say.map((x, i) => (<p key={i} style={S.item}><span style={S.phrase}>{x.phrase}</span><span style={S.meaning}> — {x.meaning}</span></p>))}
      <h2 style={S.h2}>Good to know</h2>
      <p style={S.story}>{c.know}</p>
      {(() => {
        // v4.82 — town profiles as crawlable HTML. Zero-API-cost editorial
        // content per town; the metro's namesake city is excluded from its
        // own page (anchor: true) since the page above already covers it.
        const towns = Object.entries(TOWN_PROFILES).filter(([, t]) => t.metro === params.metro && !t.anchor);
        if (!towns.length) return null;
        const CATS = [["food", "Food"], ["night", "Night out"], ["todo", "Things to do"], ["beach", "Beaches & outdoors"], ["stays", "Stays"], ["shop", "Shopping"]];
        return (
          <>
            <h2 style={S.h2}>The towns around {c.title}</h2>
            <p style={S.story}>Honest, local profiles of the towns nearby — what each one actually is, and the one thing worth knowing.</p>
            {towns.map(([k, t]) => TOWN_HUBS[k] ? (
              /* v5.30 — towns with a dedicated /florida hub get a short card
                 here; the full profile lives on its own indexable page. */
              <div key={k} style={{ margin: "14px 0 0", padding: "13px 16px", background: "#161B22", borderRadius: 12 }}>
                <h3 style={{ fontSize: 17, fontWeight: 800, color: "#FFFFFF", margin: 0 }}><a href={"/florida/" + TOWN_HUBS[k]} style={{ color: "#FFFFFF", textDecoration: "none" }}>{t.title}</a></h3>
                <p style={{ fontSize: 13.5, color: "#8B949E", margin: "2px 0 6px" }}>{t.tag}</p>
                <p style={{ fontSize: 14, color: "#E6EDF3", margin: "0 0 8px" }}><b style={{ color: "#F2C14E" }}>⭐ The one thing:</b> {t.one}</p>
                <a href={"/florida/" + TOWN_HUBS[k]} style={{ fontSize: 13, fontWeight: 800, color: "#CBD5E1", textDecoration: "none" }}>Full {t.title} guide ›</a>
              </div>
            ) : (
              <div key={k} style={{ margin: "18px 0 0", padding: "14px 16px", background: "#161B22", borderRadius: 12 }}>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: "#FFFFFF", margin: 0 }}>{t.title}</h3>
                <p style={{ fontSize: 13.5, color: "#8B949E", margin: "2px 0 8px" }}>{t.tag}</p>
                <p style={{ fontSize: 14, color: "#E6EDF3", margin: "0 0 10px" }}><b style={{ color: "#F2C14E" }}>⭐ The one thing:</b> {t.one}</p>
                {CATS.map(([ck, cl]) => t[ck] && t[ck].line ? (
                  <p key={ck} style={{ fontSize: 13.5, color: "#C9D1D9", margin: "0 0 7px" }}>
                    <b style={{ color: "#FFFFFF" }}>{cl}:</b> {t[ck].line}
                    {Array.isArray(t[ck].items) && t[ck].items.length ? <span style={{ color: "#8B949E" }}> Don&apos;t miss: {t[ck].items.map((x) => x.name).join(" · ")}.</span> : null}
                  </p>
                ) : null)}
              </div>
            ))}
          </>
        );
      })()}
      <div style={S.disclosure}>Wayfind may earn a commission from partner links on this page.</div>
      <p style={{ fontSize: 14, color: "#C9D1D9", marginTop: 22 }}>
        More cities: {Object.keys(CULTURE).filter((k) => k !== params.metro).map((k, i, arr) => (<span key={k}><a href={"/culture/" + k} style={S.footerLink}>{CULTURE[k].title}</a>{i < arr.length - 1 ? " · " : ""}</span>))}
      </p>
      <p style={{ fontSize: 15, color: "#C9D1D9", marginTop: 26 }}>
        Visiting {c.title}? <a href="/" style={S.footerLink}>Wayfind</a> ranks every restaurant, attraction, and hotel near you with live hours and honest scores{params.metro === "orlando" ? <>, and our <a href="/guides/things-to-do-orlando-not-theme-parks" style={S.footerLink}>non-theme-park Orlando guide</a> covers the days between parks</> : null}.
      </p>
      <OpenAppCTA to="/" label="Open Wayfind" />
    </main>
  );
}
