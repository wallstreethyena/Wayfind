// /beaches/[metro] — the shareable beach ranking page (owner, 2026-07-21):
// "sexy, luxurious, show the power of the engine and the rating metric,
// without too many words." Server-rendered + ISR hourly; three metro groups.
// Every number is the real metric (rating × review depth through the ONE
// Bayesian formula); why-lines explain the rank, never invent sand or surf.
// Live water conditions render client-side for the #1 beach only (compact).
import { BEACH_METROS, BEACH_SHARE_PHOTO, rankBeaches, beachWhy } from "../../../lib/beaches";
import { mapWfEditorial } from "../../../lib/editorialRule";
import { toDisplayScore } from "../../../lib/score";
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
    const r = await fetch(url + "/rest/v1/wf_editorial?verified=is.true&place_id=in.(" + ids.map(encodeURIComponent).join(",") + ")", {
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
  if (!meta) return { title: "Beaches — Wayfind" };
  const beaches = await beachesFor(params.metro);
  const top3 = beaches.slice(0, 3).map((b) => b.name).join("|");
  const totalReviews = beaches.reduce((a, b) => a + (b.reviews || 0), 0);
  const og = SITE_URL + "/api/og/beaches?metro=" + encodeURIComponent(params.metro) + "&t=" + encodeURIComponent(top3) + "&n=" + beaches.length + "&rv=" + totalReviews;
  const near = NEAR_LABEL[params.metro] || meta.label;
  const title = "The Best Beaches Near " + near + " | Wayfind";
  const description = "Not every 4.8-star beach is equal. The beaches near " + meta.short + " actually worth your time — ranked by rating strength, review depth, and what each beach is genuinely best for. No paid placement.";
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

const C = { bg: "#040810", card: "#0B0E15", border: "rgba(255,255,255,.08)", text: "#F1F5F9", muted: "#8b93a1", accent: "#C9A961", gold: "#E8C97A", green: "#3ee08a" };
const MEDAL = ["#E8C97A", "#C7CCD6", "#B8804A"];

export default async function BeachesPage({ params }) {
  const meta = BEACH_METROS[params.metro];
  if (!meta) return <main style={{ background: C.bg, color: C.muted, minHeight: "100vh", padding: 40 }}>No such beach group.</main>;
  const beaches = await beachesFor(params.metro);
  const editorials = await editorialsFor(beaches.map((b) => b.id));
  const heroPhoto = BEACH_SHARE_PHOTO[params.metro];
  const heroImg = heroPhoto ? "/api/photo?ref=" + encodeURIComponent(heroPhoto.photo_ref) + "&w=800" : null;

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
    <main style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      {/* Hero — the group's most beautiful photo (curated by eye), few words */}
      <header style={{ position: "relative", height: 300, overflow: "hidden" }}>
        {heroImg && <img src={heroImg} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(4,8,16,.25) 0%, rgba(4,8,16,.55) 55%, #040810 100%)" }} />
        {/* Owner: no logo box over the hero photo — the brand lives in the
            footer line and the share card. Just a quiet home link. */}
        <BackControl fallback="/" />
        <a href="/" aria-label="Wayfind home" style={{ position: "absolute", top: 18, left: 0, right: 0, display: "block", maxWidth: 680, margin: "0 auto", padding: "0 20px", textAlign: "center", fontSize: 23, fontWeight: 800, color: "rgba(241,245,249,.95)", textDecoration: "none", textShadow: "0 1px 6px rgba(0,0,0,.7)", letterSpacing: "-0.3px" }}>way<span style={{ position: "relative", display: "inline-block" }}>f<span style={{ position: "relative", display: "inline-block" }}>ı<span aria-hidden="true" style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: "0.04em", width: "0.22em", height: "0.22em", borderRadius: "50%", background: "#C9A961" }} /></span></span>nd</a>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 18 }}>
          <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.4px", textTransform: "uppercase", color: C.gold }}>The definitive beach ranking</div>
            <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.8px", lineHeight: 1.08, margin: "8px 0 6px", textShadow: "0 2px 12px rgba(0,0,0,.6)" }}>The Best Beaches Near {NEAR_LABEL[params.metro] || meta.label}</h1>
            <p style={{ fontSize: 13.5, color: "rgba(241,245,249,.88)", margin: 0, maxWidth: 460 }}>Not every 4.8-star beach is equal. These are the beaches actually worth your time — ranked by rating strength, review depth, and what each is genuinely best for.</p>
            <p style={{ fontSize: 12, color: "rgba(241,245,249,.7)", margin: "6px 0 0" }}>No paid placement. No sponsored rankings. Just the beach that fits your day.</p>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "18px 20px 60px" }}>
        {beaches.length ? (
          <section style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 16, padding: "14px 16px", marginTop: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Looking for a quick answer?</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ fontSize: 12.5, color: "rgba(241,245,249,.85)" }}><span style={{ fontWeight: 800, color: C.gold }}>Best overall:</span> {beaches[0].name}</div>
              {beaches.filter((b) => QUICK_LABEL[b.id]).map((b) => (
                <div key={b.id} style={{ fontSize: 12.5, color: "rgba(241,245,249,.85)" }}><span style={{ fontWeight: 800, color: C.gold }}>{QUICK_LABEL[b.id]}:</span> {b.name}</div>
              ))}
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 8 }}>Explore the full ranking below.</div>
          </section>
        ) : null}

        <BeachPageClient topBeach={beaches[0] ? { id: beaches[0].id, name: beaches[0].name, lat: beaches[0].lat, lng: beaches[0].lng } : null} metro={params.metro} label={meta.label} />

        <ol style={{ listStyle: "none", margin: "18px 0 0", padding: 0 }}>
          {beaches.map((b, i) => (
            <li key={b.id} style={{ margin: "14px 0 0" }}>
              {/* v6.60 (owner): image-forward — the photo IS the card (it is
                  what sells). Name, Score and Best-for ride the image; one hook
                  line below; everything else collapses. Live water conditions
                  moved OFF the list (they live in the detail sheet). */}
              <a href={"/p/" + encodeURIComponent(b.id)} style={{ display: "block", borderRadius: 16, overflow: "hidden", border: "1px solid " + C.border, background: C.card, textDecoration: "none", color: "inherit" }}>
                <div style={{ position: "relative", aspectRatio: "16 / 10", background: "#10141d" }}>
                  {b.photo_ref ? <img src={"/api/photo?ref=" + encodeURIComponent(b.photo_ref) + "&w=640"} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(4,8,16,0) 40%, rgba(4,8,16,.5) 66%, rgba(4,8,16,.92) 100%)" }} />
                  <div style={{ position: "absolute", top: 10, left: 10, width: 30, height: 30, borderRadius: "50%", background: "rgba(4,8,16,.55)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {i < 3
                      ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={MEDAL[i]} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label={"Rank " + (i + 1)}><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v6a5 5 0 0 1-10 0V4z" /><path d="M7 6H4a1 1 0 0 0-1 1c0 2.2 1.8 4 4 4" /><path d="M17 6h3a1 1 0 0 1 1 1c0 2.2-1.8 4-4 4" /></svg>
                      : <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{i + 1}</span>}
                  </div>
                  <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "14px 15px 13px" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 21, fontWeight: 800, color: "#fff", textShadow: "0 1px 8px rgba(0,0,0,.75)", letterSpacing: "-0.4px" }}>{b.name}</span>
                      <span style={{ fontSize: 15, fontWeight: 800, color: C.green, textShadow: "0 1px 5px rgba(0,0,0,.7)" }}>{toDisplayScore(b.wf)}</span>
                    </div>
                    {(() => { const bf = (BEST_FOR[params.metro] || {})[b.id] || null; return bf ? <div style={{ fontSize: 12.5, color: "rgba(255,255,255,.92)", marginTop: 3, textShadow: "0 1px 5px rgba(0,0,0,.75)" }}><span style={{ fontWeight: 800, color: C.gold }}>Best for: </span>{bf}</div> : null; })()}
                  </div>
                </div>
                {(() => { const ed = editorials[b.id];
                  if (!ed) return (<div style={{ padding: "11px 15px 13px" }}><p style={{ fontSize: 12.5, color: "rgba(241,245,249,.82)", lineHeight: 1.5, margin: 0 }}>{beachWhy(b, meta.short)}</p></div>);
                  return (<div style={{ padding: "11px 15px 13px" }}>
                    {ed.knownFor ? <p style={{ fontSize: 13, fontWeight: 700, color: C.gold, lineHeight: 1.45, margin: 0 }}>{ed.knownFor}</p> : null}
                    <details style={{ margin: "8px 0 0" }}>
                      <summary style={{ fontSize: 11, fontWeight: 700, color: "rgba(139,147,161,.9)", cursor: "pointer", listStyle: "none" }}>How we verified this ›</summary>
                      {ed.why ? <p style={{ fontSize: 12, color: "rgba(241,245,249,.8)", lineHeight: 1.55, margin: "6px 0 0" }}>{ed.why}</p> : null}
                      {(ed.watchOut || ed.goodToKnow) ? <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5, margin: "5px 0 0" }}><span style={{ fontWeight: 800, color: "rgba(241,245,249,.7)" }}>Know before you go: </span>{[ed.watchOut, ed.goodToKnow].filter(Boolean).join(" ")}</p> : null}
                      {ed.sources && ed.sources.length ? <p style={{ fontSize: 10, color: "rgba(139,147,161,.7)", margin: "5px 0 0" }}>Sourced: {ed.sources.join(" · ")}</p> : null}
                    </details>
                  </div>);
                })()}
              </a>
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
