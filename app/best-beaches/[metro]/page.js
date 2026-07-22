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
  const heroPhoto = BEACH_SHARE_PHOTO[params.metro];
  const heroImg = heroPhoto ? "/api/photo?ref=" + encodeURIComponent(heroPhoto.photo_ref) + "&w=800" : null;

  return (
    <main style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      {/* Hero — the group's most beautiful photo (curated by eye), few words */}
      <header style={{ position: "relative", height: 300, overflow: "hidden" }}>
        {heroImg && <img src={heroImg} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(4,8,16,.25) 0%, rgba(4,8,16,.55) 55%, #040810 100%)" }} />
        {/* Owner: no logo box over the hero photo — the brand lives in the
            footer line and the share card. Just a quiet home link. */}
        <BackControl fallback="/" />
        <a href="/" aria-label="Wayfind home" style={{ position: "absolute", top: 18, left: 0, right: 0, display: "block", maxWidth: 680, margin: "0 auto", padding: "0 20px", fontSize: 15, fontWeight: 800, color: "rgba(241,245,249,.92)", textDecoration: "none", textShadow: "0 1px 6px rgba(0,0,0,.7)", letterSpacing: "-0.2px" }}>wayfind<span style={{ color: "#F97316" }}>.</span></a>
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

        <p style={{ fontSize: 11, color: C.muted, marginTop: 26, lineHeight: 1.5 }}>
          The Wayfind Score weighs each rating by how many people stand behind it — a 4.8 from thousands outranks a 5.0 from a handful. Live water data from NOAA and Open-Meteo. Rankings recompute as reviews grow.
        </p>
      </div>
    </main>
  );
}
