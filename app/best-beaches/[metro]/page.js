// /beaches/[metro] — the shareable beach ranking page (owner, 2026-07-21):
// "sexy, luxurious, show the power of the engine and the rating metric,
// without too many words." Server-rendered + ISR hourly; three metro groups.
// Every number is the real metric (rating × review depth through the ONE
// Bayesian formula); why-lines explain the rank, never invent sand or surf.
// Live water conditions render client-side for the #1 beach only (compact).
import { BEACH_METROS, BEACH_SHARE_PHOTO, rankBeaches, beachWhy } from "../../../lib/beaches";
import { mapWfEditorial } from "../../../lib/editorialRule";
import { toDisplayScore } from "../../../lib/score";
import { wayfindScore as wfTourScore } from "../../../lib/google";
import { viatorDirectUrl } from "../../../lib/affiliates";
import { SITE_URL } from "../../../lib/site";
import BeachPageClient, { BeachLiveChips, BackControl } from "./parts";

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

// "Make it a beach day" (owner liberty, 2026-07-22): the ONE revenue surface
// on these SEO pages. Server-only read (service role never reaches the client)
// of the SAME wf_experiences table the app rails use; water-themed only; the
// product_url is Viator's OWN link (the booking-integrity rule — we never
// build one). Fails soft to no section.
const METRO_TOUR_CITIES = { "manatee-sarasota": ["Sarasota"], tampa: ["Tampa", "St. Petersburg", "Clearwater"], orlando: ["Orlando"] };
const WATERY = "beach|dolphin|kayak|snorkel|boat|sail|paddle|jet ski|parasail|cruise|water|manatee|sunset";
async function toursFor(metro) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const svc = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const cities = METRO_TOUR_CITIES[metro];
  if (!url || !svc || !cities) return [];
  try {
    const r = await fetch(url + "/rest/v1/wf_experiences?select=product_code,title,city,rating,reviews,from_price,image,product_url&city=in.(" + cities.map((c) => '"' + c + '"').join(",") + ")&order=reviews.desc&limit=60", {
      headers: { apikey: svc, Authorization: "Bearer " + svc },
      next: { revalidate: 21600 },
    });
    if (!r.ok) return [];
    const rows = await r.json();
    const rx = new RegExp(WATERY, "i");
    const seen = new Set();
    return (Array.isArray(rows) ? rows : [])
      .filter((t) => t && t.product_url && rx.test(t.title || ""))
      .filter((t) => { const k = (t.title || "").toLowerCase().slice(0, 40); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => wfTourScore(b.rating || 0, b.reviews || 0) - wfTourScore(a.rating || 0, a.reviews || 0))
      .slice(0, 4);
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
  const title = "The best beaches — " + meta.label + " | Wayfind";
  const description = "Every beach near " + meta.short + ", ranked by the Wayfind Score: rating strength × review depth. No ads, no paid placement.";
  return {
    title, description,
    alternates: { canonical: SITE_URL + "/best-beaches/" + params.metro },
    openGraph: { title, description, images: [{ url: og, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [og] },
  };
}

const C = { bg: "#040810", card: "#0B0E15", border: "rgba(255,255,255,.08)", text: "#F1F5F9", muted: "#8b93a1", accent: "#F97316", gold: "#E8C97A", green: "#3ee08a" };
const MEDAL = ["#E8C97A", "#C7CCD6", "#B8804A"];

export default async function BeachesPage({ params }) {
  const meta = BEACH_METROS[params.metro];
  if (!meta) return <main style={{ background: C.bg, color: C.muted, minHeight: "100vh", padding: 40 }}>No such beach group.</main>;
  const beaches = await beachesFor(params.metro);
  const editorials = await editorialsFor(beaches.map((b) => b.id));
  const tours = await toursFor(params.metro);
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
        <a href="/" aria-label="Wayfind home" style={{ position: "absolute", top: 18, left: 0, right: 0, display: "block", maxWidth: 680, margin: "0 auto", padding: "0 20px", fontSize: 15, fontWeight: 800, color: "rgba(241,245,249,.92)", textDecoration: "none", textShadow: "0 1px 6px rgba(0,0,0,.7)", letterSpacing: "-0.2px" }}>way<span style={{ position: "relative", display: "inline-block" }}>f<span style={{ position: "relative", display: "inline-block" }}>ı<span aria-hidden="true" style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: "-0.14em", width: "0.24em", height: "0.24em", borderRadius: "50%", background: "#F97316" }} /></span></span>nd</a>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 18 }}>
          <div style={{ maxWidth: 680, margin: "0 auto", padding: "0 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.4px", textTransform: "uppercase", color: C.gold }}>The definitive ranking</div>
            <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.8px", lineHeight: 1.05, margin: "8px 0 6px", textShadow: "0 2px 12px rgba(0,0,0,.6)" }}>The best beaches<br />{meta.label}</h1>
            <p style={{ fontSize: 13.5, color: "rgba(241,245,249,.85)", margin: 0, maxWidth: 430 }}>Ranked by the Wayfind Score — rating strength × review depth, one formula, no ads, no paid placement.</p>
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "18px 20px 60px" }}>
        <BeachPageClient topBeach={beaches[0] ? { id: beaches[0].id, name: beaches[0].name, lat: beaches[0].lat, lng: beaches[0].lng } : null} metro={params.metro} label={meta.label} />

        <ol style={{ listStyle: "none", margin: "18px 0 0", padding: 0 }}>
          {beaches.map((b, i) => (
            <li key={b.id} style={{ borderTop: "1px solid " + C.border }}>
              <a href={"/p/" + encodeURIComponent(b.id)} style={{ display: "flex", gap: 14, padding: "16px 0", alignItems: "flex-start", textDecoration: "none", color: "inherit" }}>
              <div style={{ width: 30, flexShrink: 0, textAlign: "center", paddingTop: 2 }}>
                {i < 3
                  ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={MEDAL[i]} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-label={"Rank " + (i + 1)}><path d="M8 21h8" /><path d="M12 17v4" /><path d="M7 4h10v6a5 5 0 0 1-10 0V4z" /><path d="M7 6H4a1 1 0 0 0-1 1c0 2.2 1.8 4 4 4" /><path d="M17 6h3a1 1 0 0 1 1 1c0 2.2-1.8 4-4 4" /></svg>
                  : <span style={{ fontSize: 14, fontWeight: 800, color: C.muted }}>{i + 1}</span>}
              </div>
              {b.photo_ref ? <img src={"/api/photo?ref=" + encodeURIComponent(b.photo_ref) + "&w=240"} alt="" loading="lazy" style={{ width: 72, height: 72, borderRadius: 12, objectFit: "cover", flexShrink: 0, border: "1px solid " + C.border }} /> : null}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 17, fontWeight: 750 }}>{b.name}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: C.green }}>{toDisplayScore(b.wf)}</span>
                </div>
                {(() => { const ed = editorials[b.id]; if (ed) return (<>
                  {ed.knownFor ? <p style={{ fontSize: 12.5, fontWeight: 700, color: C.gold, lineHeight: 1.45, margin: "4px 0 0" }}>{ed.knownFor}</p> : null}
                  {ed.why ? <p style={{ fontSize: 12.5, color: "rgba(241,245,249,.8)", lineHeight: 1.55, margin: "5px 0 0" }}>{ed.why}</p> : null}
                  {(ed.watchOut || ed.goodToKnow) ? <p style={{ fontSize: 11.5, color: C.muted, lineHeight: 1.5, margin: "5px 0 0" }}><span style={{ fontWeight: 800, color: "rgba(241,245,249,.7)" }}>Plan it: </span>{[ed.watchOut, ed.goodToKnow].filter(Boolean).join(" ")}</p> : null}
                  {ed.sources && ed.sources.length ? <p style={{ fontSize: 10, color: "rgba(139,147,161,.7)", margin: "5px 0 0" }}>Sourced: {ed.sources.join(" · ")}</p> : null}
                </>); return (<>
                  <p style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.5, margin: "4px 0 0" }}>{beachWhy(b, meta.short)}</p>
                  {b.editorial ? <p style={{ fontSize: 12.5, color: "rgba(241,245,249,.75)", lineHeight: 1.5, margin: "5px 0 0" }}>{b.editorial}</p> : null}
                </>); })()}
                <BeachLiveChips id={b.id} lat={b.lat} lng={b.lng} />
              </div>
              <span aria-hidden="true" style={{ alignSelf: "center", color: "rgba(255,255,255,.3)", fontSize: 18, flexShrink: 0 }}>›</span>
              </a>
            </li>
          ))}
        </ol>

        {tours.length >= 2 ? (
          <section style={{ marginTop: 30 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <h2 style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.4px", margin: 0 }}>Make it a beach day</h2>
              <span style={{ fontSize: 10, color: C.muted }}>via Viator</span>
            </div>
            <p style={{ fontSize: 12, color: C.muted, margin: "4px 0 12px" }}>Bookable on-the-water experiences near these beaches — ranked by the same Score.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {tours.map((t) => (
                <a key={t.product_code} href={viatorDirectUrl(t.product_url) || t.product_url} target="_blank" rel="noreferrer nofollow sponsored" style={{ background: C.card, border: "1px solid " + C.border, borderRadius: 14, overflow: "hidden", textDecoration: "none", color: "inherit" }}>
                  {t.image ? <img src={t.image} alt="" loading="lazy" style={{ width: "100%", height: 92, objectFit: "cover", display: "block" }} /> : <div style={{ width: "100%", height: 92, background: "#10141d" }} />}
                  <div style={{ padding: "9px 11px 11px" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 750, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.title}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 4, flexWrap: "wrap" }}>
                      {t.rating > 0 && t.reviews > 0 ? <span style={{ fontSize: 13, fontWeight: 800, color: C.green }}>{toDisplayScore(wfTourScore(t.rating, t.reviews))}</span> : <span style={{ fontSize: 10.5, fontWeight: 700, color: C.muted }}>New</span>}
                      <span style={{ fontSize: 11, color: C.muted }}>{t.from_price != null ? "from $" + t.from_price : ""}</span>
                    </div>
                    <div style={{ marginTop: 8, display: "inline-block", background: C.accent, color: "#0D1117", borderRadius: 999, padding: "5px 12px", fontSize: 11, fontWeight: 800 }}>Book ↗</div>
                  </div>
                </a>
              ))}
            </div>
            <p style={{ fontSize: 10, color: C.muted, marginTop: 8, lineHeight: 1.4 }}>Wayfind may earn a commission when you book through this link, at no extra cost to you. It never changes our scores or rankings.</p>
          </section>
        ) : null}

        {beaches[0] ? (
          /* Stay lane (owner-approved #1): the house hotel pattern — a PLAIN
             Booking.com area search; Stay22's site-wide LinkSwap (app/layout)
             rewrites it to the best-paying provider with our attribution.
             We never rank or name specific hotels here — no invented superlatives. */
          <a href={"https://www.booking.com/searchresults.html?ss=" + encodeURIComponent(beaches[0].name + " Florida")} target="_blank" rel="noreferrer nofollow sponsored" style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, background: C.card, border: "1px solid " + C.border, borderRadius: 14, padding: "13px 15px", textDecoration: "none", color: "inherit" }}>
            <span aria-hidden="true" style={{ fontSize: 20 }}>🏨</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontSize: 14, fontWeight: 800 }}>Stay near {beaches[0].name}</span>
              <span style={{ display: "block", fontSize: 11.5, color: C.muted, marginTop: 2 }}>Compare rates by the #1-ranked beach — wake up already there.</span>
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
