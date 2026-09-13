// /beaches/[metro] — the shareable beach ranking page (owner, 2026-07-21):
// "sexy, luxurious, show the power of the engine and the rating metric,
// without too many words." Server-rendered + ISR hourly; three metro groups.
// Every number is the real metric (rating × review depth through the ONE
// Bayesian formula); why-lines explain the rank, never invent sand or surf.
// Live water conditions render client-side for the #1 beach only (compact).
import { notFound } from "next/navigation";
import { BEACH_METROS, rankBeaches, beachWhy } from "../../../lib/beaches";
import { mapWfEditorial } from "../../../lib/editorialRule";
import EditorialLandingHero, { editorialHeroCss } from "../../components/EditorialLandingHero";
import IconicPlaceCard from "../../components/IconicPlaceCard";
import { WF_PLACE_CARD_CSS } from "../../components/css";
import { SITE_URL } from "../../../lib/site";
import BeachPageClient, { BackControl } from "./parts";
import TourStrip from "../../components/TourStrip";

export const revalidate = 3600;

const CENTROID = {
  "manatee-sarasota": { lat: 27.4, lng: -82.55 },
  tampa: { lat: 27.85, lng: -82.6 },
  orlando: { lat: 28.54, lng: -81.38 },
};

// THE RULE (docs/editorial-standard.md): verified fleet editorial replaces
// metric prose wherever it exists. One REST in() call for the whole page.
async function editorialsFor(ids) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anon || !ids.length) return {};
  try {
    const r = await fetch(url + "/rest/v1/wf_editorial_servable?verified=is.true&place_id=in.(" + ids.map(encodeURIComponent).join(",") + ")", {
      headers: { apikey: anon, Authorization: "Bearer " + anon },
      next: { revalidate: 3600 },
    });
    if (!r.ok) return {};
    const rows = await r.json();
    const out = {};
    for (const row of Array.isArray(rows) ? rows : []) { const m = mapWfEditorial(row); if (m) out[row.place_id] = m; }
    return out;
  } catch (e) { return {}; }
}

async function beachesFor(metro) {
  const c = CENTROID[metro];
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!c || !url || !anon) return [];
  try {
    const r = await fetch(url + "/rest/v1/rpc/wf_nearest_beaches", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: anon, Authorization: "Bearer " + anon },
      body: JSON.stringify({ p_lat: c.lat, p_lng: c.lng, p_radius_mi: 60, p_max: 40 }),
      next: { revalidate: 3600 },
    });
    if (!r.ok) return [];
    const rows = await r.json();
    return rankBeaches((Array.isArray(rows) ? rows : [])
      .filter((b) => b.metro === metro)
      .map((b) => ({
        id: b.place_id, name: b.name, photo_ref: b.photo_ref, editorial: b.editorial,
        lat: b.lat, lng: b.lng,
        rating: b.signals && Number(b.signals.rating) > 0 ? Number(b.signals.rating) : null,
        reviews: b.signals && Number(b.signals.reviews) > 0 ? Number(b.signals.reviews) : 0,
      }))).slice(0, 12);
  } catch (e) { return []; }
}

export function generateStaticParams() {
  return Object.keys(BEACH_METROS).map((metro) => ({ metro }));
}

export async function generateMetadata({ params }) {
  const meta = BEACH_METROS[params.metro];
  // SOFT-404 FIX. This used to return a bare { title } for an unknown metro,
  // which meant /best-beaches/<anything> answered HTTP 200, INDEXABLE, with no
  // `alternates` — so it inherited the layout's canonical:"/" and told Google it
  // was a duplicate of the homepage. An unbounded indexable URL space pointing
  // at the root. Verified: /best-beaches/sarasota (not a real metro key; the
  // real one is "manatee-sarasota") returned 200 + canonical
  // "https://www.gowayfind.com" + no robots meta.
  //
  // notFound() in BOTH generateMetadata and the component: metadata runs first
  // and independently, so returning here alone would still render the page body.
  if (!meta) notFound();
  const beaches = await beachesFor(params.metro);
  const top3 = beaches.slice(0, 3).map((b) => b.name).join("|");
  const totalReviews = beaches.reduce((a, b) => a + (b.reviews || 0), 0);
  const og = SITE_URL + "/api/og/beaches?metro=" + encodeURIComponent(params.metro) + "&t=" + encodeURIComponent(top3) + "&n=" + beaches.length + "&rv=" + totalReviews;
  const near = NEAR_LABEL[params.metro] || meta.label;
  const title = "The Best Beaches Near " + near + " | Wayfind";
  const description = "Stop searching and start choosing. Wayfind's shortlist reveals the beaches near " + meta.short + " that fit the day you actually want — clear winners, honest tradeoffs, and no paid placement.";
  return {
    title, description,
    alternates: { canonical: SITE_URL + "/best-beaches/" + params.metro },
    openGraph: { title, description, images: [{ url: og, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [og] },
  };
}

// v6.58 (owner editorial rewrite): decision-first. Search-language labels,
// and the owner-approved best-for calls (manatee-sarasota only; a label only
// renders when that beach is actually present and serving).
const NEAR_LABEL = { "manatee-sarasota": "Sarasota & Anna Maria Island", tampa: "Tampa Bay", orlando: "Orlando" };
const BEST_FOR = {
  "manatee-sarasota": {
    "ChIJjfu2YPBBw4gRo41o9hwHfmg": "The softest sand — quartz so fine it squeaks",
    "ChIJFy96TuUPw4gRr3IUjLXDXfM": "A quiet escape at the island's north tip",
    "ChIJg7BBe7URw4gRIQTacN1Cla8": "Families — lifeguards 365 days a year",
    "ChIJ1-Da3XpZw4gRyPAkVf4SSAo": "Shells and shark teeth",
    "ChIJ5eLMVXE9w4gR15l0tMZGkMY": "A full, easy beach day on Anna Maria Island",
  },
};
const QUICK_LABEL = {
  "ChIJjfu2YPBBw4gRo41o9hwHfmg": "Best sand",
  "ChIJFy96TuUPw4gRr3IUjLXDXfM": "Best quiet escape",
  "ChIJg7BBe7URw4gRIQTacN1Cla8": "Best for families",
  "ChIJ1-Da3XpZw4gRyPAkVf4SSAo": "Best for shells and shark teeth",
};
const firstSentence = (t) => { const m = String(t || "").match(/^.*?[.!?](\s|$)/); return m ? m[0].trim() : (t || null); };

const C = { bg: "#040810", card: "#0B0E15", border: "rgba(255,255,255,.08)", text: "#F1F5F9", muted: "#8b93a1", accent: "#F97316", gold: "#E8C97A", green: "#3ee08a" };
// The editorial-landing look now lives in app/components/EditorialLandingHero.
// This page is its REFERENCE IMPLEMENTATION: it keeps the original class
// prefix so the extraction could be proven byte-identical, and any future
// surface passes its own prefix instead of copying this markup.
const BEACH_PREMIUM_CSS = editorialHeroCss();

export default async function BeachesPage({ params }) {
  const meta = BEACH_METROS[params.metro];
  // A styled "No such beach group." body was still an HTTP 200. notFound()
  // makes it a real 404 — see the note in generateMetadata above.
  if (!meta) notFound();
  const beaches = await beachesFor(params.metro);
  const editorials = await editorialsFor(beaches.map((b) => b.id));
  const heroImg = "/cards/beach-adobestock-216195684.jpeg";
  const quickPicks = beaches.length
    ? [
        { label: "Best overall:", name: beaches[0].name },
        ...beaches.filter((b) => QUICK_LABEL[b.id]).map((b) => ({ label: QUICK_LABEL[b.id], name: b.name })),
      ].slice(0, 6)
    : [];

  // Structured data (v6.55 SEO sweep) — same house pattern as lib/landing.js:
  // Breadcrumb + ItemList(Beach) + FAQ, every number the real metric or omitted.
  const pageUrl = SITE_URL + "/best-beaches/" + params.metro;
  const ld = [
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Wayfind", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Best beaches — " + meta.label, item: pageUrl },
    ] },
  ];
  if (beaches.length) {
    ld.push({ "@context": "https://schema.org", "@type": "ItemList", name: "The best beaches — " + meta.label, numberOfItems: beaches.length, itemListElement: beaches.map((b, i) => ({ "@type": "ListItem", position: i + 1, item: { "@type": "Beach", name: b.name, geo: b.lat != null ? { "@type": "GeoCoordinates", latitude: b.lat, longitude: b.lng } : undefined, aggregateRating: b.rating != null && b.reviews >= 15 ? { "@type": "AggregateRating", ratingValue: b.rating, reviewCount: b.reviews } : undefined } })) });
    ld.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [
      { "@type": "Question", name: "What is the best beach near " + meta.short + "?", acceptedAnswer: { "@type": "Answer", text: beaches[0].name + " currently ranks #1" + (beaches[0].rating != null ? " with a " + beaches[0].rating + "★ rating across " + (beaches[0].reviews || 0).toLocaleString() + " reviews" : "") + ", based on the Wayfind Score — rating strength × review depth, no ads, no paid placement." } },
      { "@type": "Question", name: "How does Wayfind rank beaches?", acceptedAnswer: { "@type": "Answer", text: "One Bayesian formula weighs each beach's rating by how many people stand behind it — a 4.8 from thousands outranks a 5.0 from a handful. The method is published in full at " + SITE_URL + "/how-wayfind-ranks." } },
    ] });
  }

  return (
    <main style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "var(--wf-sans)" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <style dangerouslySetInnerHTML={{ __html: BEACH_PREMIUM_CSS + WF_PLACE_CARD_CSS }} />
      <EditorialLandingHero
        backControl={<BackControl fallback="/" />}
        heroImg={heroImg}
        backHref="/"
        backLabel="Wayfind"
        imageKicker="The Wayfind coastal edition"
        imageTitle="The right beach changes the whole day."
        toplineLeft="The definitive beach ranking"
        toplineRight={NEAR_LABEL[params.metro] || meta.label}
        headlineId="wf-beach-title"
        headline={<>The Best Beaches Near {NEAR_LABEL[params.metro] || meta.label}</>}
        dekLead="Stop searching. Start choosing."
        dekBody="This isn’t another list of beaches—it’s the shortlist we’d send a friend, with clear winners, honest tradeoffs, and the right shoreline for the day you actually want."
        quickTitle="Looking for a quick answer?"
        quickPicks={quickPicks}
        actionSlot={<BeachPageClient topBeach={beaches[0] ? { id: beaches[0].id, name: beaches[0].name, lat: beaches[0].lat, lng: beaches[0].lng } : null} metro={params.metro} label={meta.label} variant="premium" />}
        trustLines={["No paid placement. No sponsored rankings.", "Just the beach that fits your day."]}
      />

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "18px 20px 60px" }}>
        {params.metro === "manatee-sarasota" ? <a href="/beach-conditions" style={{ display: "block", padding: 18, border: "1px solid #2dd4bf", borderRadius: 14, color: "#2dd4bf", textDecoration: "none" }}><strong>Beach conditions ↗</strong><br /><span style={{ fontSize: 13 }}>Weather, swimming reports and red tide for five local beaches. See sources and sample dates.</span></a> : null}
        <ol className="wf-place-card-list" style={{ listStyle: "none", margin: "18px 0 0", padding: 0 }}>
          {beaches.map((b, i) => (
            <li className="wf-place-card-slot" key={b.id}>
              {(() => { const ed = editorials[b.id]; const bestFor = (BEST_FOR[params.metro] || {})[b.id] || null; return <>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  <IconicPlaceCard place={{ ...b, photoRef: b.photo_ref, wfScore: b.wf, cardCategory: "Beach" }} rank={i + 1}
                    href={"/p/" + encodeURIComponent(b.id)} editorial={(ed && ed.knownFor) || beachWhy(b, meta.short)} editorialTier="known"
                    rankingNote={bestFor ? "Best for: " + bestFor : null} surface="best_beaches" />
                </ul>
                {ed ? <details style={{ margin: "8px 0 0" }}>
                  <summary style={{ fontSize: 11, fontWeight: 700, color: "rgba(139,147,161,.9)", cursor: "pointer", listStyle: "none" }}>How we verified this ›</summary>
                  {ed.why ? <p style={{ fontSize: 12, color: "rgba(241,245,249,.8)", lineHeight: 1.55, margin: "6px 0 0" }}>{ed.why}</p> : null}
                  {(ed.watchOut || ed.goodToKnow) ? <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5, margin: "5px 0 0" }}><span style={{ fontWeight: 800, color: "rgba(241,245,249,.7)" }}>Know before you go: </span>{[ed.watchOut, ed.goodToKnow].filter(Boolean).join(" ")}</p> : null}
                  {ed.sources && ed.sources.length ? <p style={{ fontSize: 10, color: "rgba(139,147,161,.7)", margin: "5px 0 0" }}>Sourced: {ed.sources.join(" · ")}</p> : null}
                </details> : null}
              </>; })()}
              {i === 2 && beaches.length > 3 ? (
                <section style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 16, padding: "14px 16px", margin: "4px 0 16px" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 800, marginBottom: 6 }}>Why Wayfind ranked them this way</div>
                  <p style={{ fontSize: 12.5, color: "rgba(241,245,249,.82)", lineHeight: 1.55, margin: 0 }}>A perfect rating from a handful of people should not outrank a great beach backed by thousands. The Wayfind Score weighs rating quality against review depth, then pairs the number with what each beach is actually best for. Rankings are never bought, and partner links never affect placement.</p>
                  <a href="/how-wayfind-ranks" style={{ display: "inline-block", marginTop: 8, fontSize: 12, fontWeight: 800, color: C.gold, textDecoration: "none" }}>See how Wayfind ranks places →</a>
                </section>
              ) : null}
            </li>
          ))}
        </ol>

        <TourStrip lat={CENTROID[params.metro] ? CENTROID[params.metro].lat : 27.4} lng={CENTROID[params.metro] ? CENTROID[params.metro].lng : -82.55} title="Make it a beach day" subtitle="Bookable on-the-water experiences near these beaches — ranked by the same Score." waterOnly />

        {beaches[0] ? (
          /* Stay lane (owner-approved #1): the house hotel pattern — a PLAIN
             Booking.com area search; Stay22's site-wide LinkSwap (app/layout)
             rewrites it to the best-paying provider with our attribution.
             We never rank or name specific hotels here — no invented superlatives. */
          <a href={"https://www.booking.com/searchresults.html?ss=" + encodeURIComponent(beaches[0].name + " Florida")} target="_blank" rel="noreferrer nofollow sponsored" style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, background: C.card, border: "1px solid " + C.border, borderRadius: 14, padding: "13px 15px", textDecoration: "none", color: "inherit" }}>
            <span aria-hidden="true" style={{ fontSize: 20 }}>🏨</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 800 }}>Stay near {beaches[0].name}</span>
              <span style={{ display: "block", fontSize: 11.5, color: C.muted, marginTop: 2 }}>Partner stay option — it does not affect this ranking.</span>
            </span>
            <span style={{ flexShrink: 0, background: C.accent, color: "#0D1117", borderRadius: 999, padding: "7px 14px", fontSize: 12, fontWeight: 800 }}>Check rates ↗</span>
          </a>
        ) : null}

        <p style={{ fontSize: 11, color: C.muted, marginTop: 26, lineHeight: 1.5 }}>
          The Wayfind Score weighs each rating by how many people stand behind it — a 4.8 from thousands outranks a 5.0 from a handful. Live water data from NOAA and Open-Meteo. Rankings recompute as reviews grow.
        </p>
      </div>
    </main>
  );
}
