// v4.16 — Server-rendered SEO guide pages. No "use client": these render to
// HTML at build time so search engines index the full content. Each pick can
// carry a Viator experience link (bookQuery) or a Booking.com rate link
// (hotel), both clearly disclosed. Pages cross-link into the app and back to
// the guide index for the middleman internal-link structure.
import { notFound } from "next/navigation";
import { GUIDES } from "../../../lib/guides";
import { SITE_URL } from "../../../lib/site";
import { experienceSearchUrl, hotelSearchUrl, viatorDirectUrl, experienceGoUrl } from "../../../lib/affiliates";
import OpenAppCTA from "../../components/OpenAppCTA.js";
import PremiumIntentHero from "../../components/PremiumIntentHero";
// The floating pill stays (it catches people who DO read to the end). This adds
// the above-the-fold handoff under a 50/50 experiment — measured dwell on these
// pages is 0-25s, so almost nobody reaches the pill. Control renders nothing.
import ExploreBridge from "../../components/ExploreBridge";
import { LANDING_CITIES, rankedFor, whyLine } from "../../../lib/landing";

export function generateStaticParams() {
  return Object.keys(GUIDES).map((slug) => ({ slug }));
}

export function generateMetadata({ params }) {
  const g = GUIDES[params.slug];
  if (!g) return { title: "Guide not found" };
  const url = `${SITE_URL}/guides/${params.slug}`;
  // THE SHARE-CARD RULE (owner, 2026-07-22): every page shares a card that is
  // unique to that page — never the generic homepage art.
  const ogImg = `${SITE_URL}/api/og?t=${encodeURIComponent(g.title)}`;
  return {
    title: `${g.title} | Wayfind`,
    description: g.description,
    alternates: { canonical: url },
    openGraph: { title: g.title, description: g.description, url, siteName: "Wayfind", type: "article", images: [{ url: ogImg, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title: g.title, description: g.description, images: [ogImg] },
  };
}

const S = {
  page: { maxWidth: 1080, margin: "0 auto", padding: "0 18px 72px", background: "#050B14", color: "#E6EDF3", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", lineHeight: 1.6 },
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
  pick: { margin: "0 0 16px", padding: "22px", borderRadius: 20, background: "linear-gradient(145deg,#101C2B,#0A1421)", border: "1px solid #26384B", boxShadow: "0 18px 45px rgba(0,0,0,.2)" },
};

function guideHero(g) {
  const haystack = `${g.title} ${g.keyword || ""}`.toLowerCase();
  if (/restaurant|food|cuban|pie/.test(haystack)) return "/cards/date-night-dining-hero.jpg";
  if (/beach|siesta|lido/.test(haystack)) return "/cards/beach-adobestock-216195684.jpeg";
  if (/night|bar|cocktail/.test(haystack)) return "/cards/night-out.jpg";
  if (/boat|kayak|spring|airboat/.test(haystack)) return "/brand/orlando-paddleboard-portrait.jpg";
  return g.region === "Orlando" ? "/brand/orlando-night-wheel-portrait.jpg" : "/cards/hidden-gems-adobestock-321810820.jpeg";
}

export default async function GuidePage({ params }) {
  const g = GUIDES[params.slug];
  // v5.75 (SEO): return a real 404 for unknown guide slugs instead of a
  // 200-status "not found" body — otherwise Google indexes infinite junk URLs.
  if (!g) notFound();
  const appUrl = (name) => "/?q=" + encodeURIComponent(name);
  // v4.18: FAQ structured data — makes these guides eligible for expanded
  // FAQ rich results in search, which lifts click-through beyond position.
  const faqLd = g.faq && g.faq.length ? {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: g.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  } : null;
  // Region -> landing city (all four guide regions exist as landing slugs).
  // rankedFor reuses the SAME 30-day cached rows as /go/[city], so this adds no
  // new metered Places spend beyond the first render per city.
  const bridgeSlug = String(g.region || "Orlando").toLowerCase().replace(/\s+/g, "-");
  const bridgeCity = LANDING_CITIES[bridgeSlug] || null;
  let bridgePicks = [];
  if (bridgeCity) {
    try {
      const ranked = await rankedFor("things-to-do", bridgeSlug, { withPhotos: true });
      bridgePicks = (Array.isArray(ranked) ? ranked : []).slice(0, 3).map((p) => ({
        id: p.id, name: p.name, rating: p.rating, reviews: p.reviews,
        distMi: p.distMi, openNow: p.openNow, photoRef: p.photoRef || null,
        // Honest, built only from the place's own numbers — same helper the
        // ranked landing pages use.
        reason: whyLine(p, "spot"),
      }));
    } catch (e) { bridgePicks = []; }
  }

  return (
    <main style={S.page}>
      <style dangerouslySetInnerHTML={{ __html: `
        .wf-guide-article{max-width:860px;margin:0 auto}
        .wf-guide-intro{max-width:760px;font-family:Georgia,"Times New Roman",serif;font-size:21px;line-height:1.55;color:#f1ede5}
        .wf-guide-disclosure{font-size:11px;color:#8f98a5;margin:12px 4px 28px;padding:0 0 12px;border-bottom:1px solid #263445}
        .wf-guide-pick{display:grid;grid-template-columns:76px minmax(0,1fr);gap:22px;position:relative;margin:0;padding:31px 4px;border-radius:0;background:transparent;border:0;border-top:1px solid #263445;box-shadow:none;color:#eef1f5}
        .wf-guide-pick:last-of-type{border-bottom:1px solid #263445}
        .wf-guide-number{font:600 49px/1 Georgia,"Times New Roman",serif;color:#68778d;letter-spacing:-2px;padding-top:3px;text-shadow:0 1px 18px rgba(104,119,141,.14)}
        .wf-guide-pick h2{font-size:31px;color:#f7f2ea!important}
        .wf-guide-pick>p{color:#aeb8c7!important}
        .wf-guide-pick .wf-guide-tip{color:#a64f1b!important}
        .wf-guide-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .wf-guide-actions a{border-radius:4px!important}
        @media(max-width:760px){
          .wf-guide-article{padding-top:2px}
          .wf-guide-intro{font-size:17px!important;line-height:1.5!important;margin:14px 2px 16px!important}
          .wf-guide-disclosure{margin:10px 2px 16px!important;padding:0 0 10px!important;font-size:10.5px!important;line-height:1.4!important}
          .wf-guide-pick{grid-template-columns:35px minmax(0,1fr);gap:11px;padding:21px 2px!important}
          .wf-guide-number{font-size:29px;letter-spacing:-1px;color:#7f8da1}
          .wf-guide-pick h2{font-size:22px!important;line-height:1.15!important;margin:3px 0 8px!important}
          .wf-guide-pick p{font-size:14px!important;line-height:1.5!important;margin-bottom:10px!important}
          .wf-guide-pick .wf-guide-tip{font-size:13px!important;margin:6px 0 2px!important}
          .wf-guide-actions a{margin:7px 0 0!important;padding:8px 13px!important;font-size:12.5px!important}
        }
      ` }} />
      {faqLd ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} /> : null}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "Article", headline: g.title, description: g.description, datePublished: g.updated || "2026-06-01", dateModified: g.updated || "2026-06-01", author: { "@type": "Person", name: "Gabriel Pereira", url: SITE_URL + "/about" }, publisher: { "@type": "Organization", name: "WAYFIND LLC", logo: { "@type": "ImageObject", url: SITE_URL + "/icon-512.png" } }, mainEntityOfPage: SITE_URL + "/guides/" + params.slug }) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Wayfind", item: SITE_URL }, { "@type": "ListItem", position: 2, name: "Guides", item: SITE_URL + "/guides" }, { "@type": "ListItem", position: 3, name: g.title, item: SITE_URL + "/guides/" + params.slug }] }) }} />
      <PremiumIntentHero
        eyebrow="Your local decision concierge"
        location={g.region || "Orlando"}
        title="Stop searching. Start choosing."
        description={`${g.title}—distilled into the few choices actually worth your time, with the context a map result leaves out.`}
        image={guideHero(g)}
        primaryHref={"/?intent=" + encodeURIComponent(g.keyword || g.title)}
        primaryLabel="Personalize these picks"
        secondaryHref="#guide"
        secondaryLabel="Read the local edit"
      />
      <article id="guide" className="wf-guide-article">
      <div style={S.meta}>Written by the Wayfind team, led by <a href="/about" style={{ color: "#CBD5E1", textDecoration: "none", fontWeight: 700 }}>Gabriel Pereira</a> · Last verified {g.updated} · <a href="/how-wayfind-ranks" style={{ color: "#CBD5E1", textDecoration: "none", fontWeight: 700 }}>How we rank ›</a></div>
      <p className="wf-guide-intro" style={S.p}>{g.intro}</p>
      <ExploreBridge city={bridgeCity} picks={bridgePicks} entryPage={"/guides/" + params.slug} pageType="guide" />
      <div className="wf-guide-disclosure">Wayfind may earn a commission from partner links in this guide. It never changes our rankings: every pick is here on merit, and we say so when something isn&apos;t worth your money.</div>
      {g.picks.map((pick, i) => {
        const book = pick.viatorUrl ? viatorDirectUrl(pick.viatorUrl) : (pick.bookQuery ? experienceGoUrl(pick.bookQuery, g.region || "Orlando") : null);
        const rates = pick.hotel ? hotelSearchUrl(pick.name + " " + (g.region || "Orlando")) : null;
        return (
          <section key={i} className="wf-guide-pick">
            <div className="wf-guide-number">{String(i + 1).padStart(2, "0")}</div>
            <div>
              <div style={{ fontSize: 9.5, fontWeight: 900, letterSpacing: "1.7px", textTransform: "uppercase", color: "#FF8A3D" }}>{i === 0 ? "The essential" : "The local edit"}</div>
              <h2 style={{ ...S.h2, marginTop: 5, fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 28 }}>{pick.name}</h2>
              <p style={S.p}>{pick.blurb}</p>
              {pick.tip ? <p className="wf-guide-tip" style={S.tip}>Insider note — {pick.tip}</p> : null}
              <div className="wf-guide-actions">
                {book ? <a href={book} target="_blank" rel="noreferrer sponsored" style={S.btn}>Check tours &amp; tickets ↗</a> : null}
                {rates ? <a href={rates} target="_blank" rel="noreferrer sponsored" style={S.btn}>Check rates ↗</a> : null}
                {(pick.appQuery !== null) ? <a href={appUrl(pick.appQuery || pick.name)} style={{ ...S.btnGhost, marginLeft: 0 }}>Open in Wayfind</a> : null}
              </div>
            </div>
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
      <OpenAppCTA to="/" label="Open Wayfind" />
      </article>
    </main>
  );
}
