// v4.16 — Server-rendered SEO guide pages. No "use client": these render to
// HTML at build time so search engines index the full content. Each pick can
// carry a Viator experience link (bookQuery) or a Booking.com rate link
// (hotel), both clearly disclosed. Pages cross-link into the app and back to
// the guide index for the middleman internal-link structure.
import { GUIDES } from "../../../lib/guides";
import { SITE_URL } from "../../../lib/site";
import { experienceSearchUrl, hotelSearchUrl, viatorDirectUrl, experienceGoUrl } from "../../../lib/affiliates";

export function generateStaticParams() {
  return Object.keys(GUIDES).map((slug) => ({ slug }));
}

export function generateMetadata({ params }) {
  const g = GUIDES[params.slug];
  if (!g) return { title: "Guide not found" };
  const url = `${SITE_URL}/guides/${params.slug}`;
  return {
    title: `${g.title} | Wayfind`,
    description: g.description,
    alternates: { canonical: url },
    openGraph: { title: g.title, description: g.description, url, siteName: "Wayfind", type: "article" },
  };
}

const S = {
  page: { maxWidth: 760, margin: "0 auto", padding: "28px 18px 60px", background: "#0D1117", color: "#E6EDF3", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", lineHeight: 1.6 },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#FF8A3D" },
  h1: { fontSize: 30, lineHeight: 1.2, margin: "10px 0 8px", fontWeight: 800, color: "#FFFFFF" },
  meta: { fontSize: 13, color: "#8B949E", marginBottom: 18 },
  p: { fontSize: 16, color: "#C9D1D9", margin: "0 0 18px" },
  h2: { fontSize: 21, fontWeight: 800, color: "#FFFFFF", margin: "26px 0 6px" },
  tip: { fontSize: 14, color: "#8ED6C4", margin: "6px 0 0" },
  btn: { display: "inline-block", marginTop: 10, padding: "9px 16px", borderRadius: 999, background: "#FF8A3D", color: "#0D1117", fontWeight: 800, fontSize: 14, textDecoration: "none" },
  btnGhost: { display: "inline-block", marginTop: 10, marginLeft: 8, padding: "9px 16px", borderRadius: 999, border: "1.5px solid #FF8A3D", color: "#FF8A3D", fontWeight: 800, fontSize: 14, textDecoration: "none" },
  disclosure: { fontSize: 12, color: "#8B949E", margin: "22px 0", padding: "10px 14px", background: "#161B22", borderRadius: 10 },
  faqQ: { fontSize: 16, fontWeight: 800, color: "#FFFFFF", margin: "14px 0 4px" },
  faqA: { fontSize: 15, color: "#C9D1D9", margin: 0 },
  footerLink: { color: "#FF8A3D", textDecoration: "none", fontWeight: 700 },
};

export default function GuidePage({ params }) {
  const g = GUIDES[params.slug];
  if (!g) return <main style={S.page}><h1 style={S.h1}>Guide not found</h1><p style={S.p}><a href="/" style={S.footerLink}>Back to Wayfind</a></p></main>;
  const appUrl = (name) => "/?q=" + encodeURIComponent(name);
  // v4.18: FAQ structured data — makes these guides eligible for expanded
  // FAQ rich results in search, which lifts click-through beyond position.
  const faqLd = g.faq && g.faq.length ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: g.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  } : null;
  return (
    <main style={S.page}>
      {faqLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} /> : null}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "Article", headline: g.title, description: g.description, datePublished: g.updated || "2026-06-01", dateModified: g.updated || "2026-06-01", author: { "@type": "Person", name: "Gabriel Pereira", url: SITE_URL + "/about" }, publisher: { "@type": "Organization", name: "WAYFIND LLC", logo: { "@type": "ImageObject", url: SITE_URL + "/icon-512.png" } }, mainEntityOfPage: SITE_URL + "/guides/" + params.slug }) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Wayfind", item: SITE_URL }, { "@type": "ListItem", position: 2, name: "Guides", item: SITE_URL + "/guides" }, { "@type": "ListItem", position: 3, name: g.title, item: SITE_URL + "/guides/" + params.slug }] }) }} />
      <div style={S.kicker}>Wayfind Guides · {g.region || "Orlando"}</div>
      <h1 style={S.h1}>{g.title}</h1>
      <div style={S.meta}>Written by the Wayfind team, led by <a href="/about" style={{ color: "#F97316", textDecoration: "none", fontWeight: 700 }}>Gabriel Pereira</a> · Last verified {g.updated} · <a href="/how-wayfind-ranks" style={{ color: "#F97316", textDecoration: "none", fontWeight: 700 }}>How we rank ›</a></div>
      <p style={S.p}>{g.intro}</p>
      <div style={S.disclosure}>Wayfind may earn a commission from partner links in this guide. It never changes our rankings: every pick is here on merit, and we say so when something isn&apos;t worth your money.</div>
      {g.picks.map((pick, i) => {
        const book = pick.viatorUrl ? viatorDirectUrl(pick.viatorUrl) : (pick.bookQuery ? experienceGoUrl(pick.bookQuery, g.region || "Orlando") : null);
        const rates = pick.hotel ? hotelSearchUrl(pick.name + " " + (g.region || "Orlando")) : null;
        return (
          <section key={i}>
            <h2 style={S.h2}>{i + 1}. {pick.name}</h2>
            <p style={S.p}>{pick.blurb}</p>
            {pick.tip ? <p style={S.tip}>Insider tip: {pick.tip}</p> : null}
            {book ? <a href={book} target="_blank" rel="noreferrer sponsored" style={S.btn}>Check tours &amp; tickets ↗</a> : null}
            {rates ? <a href={rates} target="_blank" rel="noreferrer sponsored" style={S.btn}>Check rates ↗</a> : null}
            {(pick.appQuery !== null) ? <a href={appUrl(pick.appQuery || pick.name)} style={S.btnGhost}>Open in Wayfind</a> : null}
          </section>
        );
      })}
      {g.faq && g.faq.length ? (
        <section>
          <h2 style={S.h2}>Good to know</h2>
          {g.faq.map((f, i) => (<div key={i}><p style={S.faqQ}>{f.q}</p><p style={S.faqA}>{f.a}</p></div>))}
        </section>
      ) : null}
      <section>
        <h2 style={S.h2}>More Wayfind guides</h2>
        {Object.keys(GUIDES).filter((k) => k !== params.slug).slice(0, 4).map((k) => (
          <p key={k} style={{ margin: "6px 0" }}><a href={"/guides/" + k} style={S.footerLink}>{GUIDES[k].title}</a></p>
        ))}
      </section>
      <p style={{ ...S.p, marginTop: 30 }}>
        Planning the rest of your trip? <a href="/" style={S.footerLink}>Wayfind</a> ranks every restaurant, attraction, and hotel near you with live hours and honest scores, and our <a href={"/culture/" + (g.region === "Tampa" ? "tampa" : g.region === "Sarasota" ? "sarasota" : "orlando")} style={S.footerLink}>{g.region || "Orlando"} culture guide</a> covers what to eat, say, and never skip.
      </p>
    </main>
  );
}
