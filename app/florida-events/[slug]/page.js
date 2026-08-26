// v7.45 — The individual event page. Google is explicit that Event structured
// data belongs on a single-event page with its own URL, not on a roundup, and
// this is that page.
//
// Lives under /florida-events/ rather than /events/ because /events/[city]
// already exists and belongs to the live aggregator. Different job, different
// namespace.
//
// The answer box comes FIRST. Nobody wants 500 words before the date.
import { notFound } from "next/navigation";
import { SITE_URL } from "../../../lib/site";
import { fetchCuratedEvents, fetchCuratedEventBySlug, eventJsonLd, dateRangeLabel } from "../../../lib/curatedEvents";
import { eventPhotos } from "../../../lib/eventPhotos";

export const revalidate = 3600;

export async function generateStaticParams() {
  const all = await fetchCuratedEvents();
  return all.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }) {
  const e = await fetchCuratedEventBySlug(params.slug);
  if (!e) return {};
  const title = `${e.event_name} ${e.year}: Dates, Tickets & What to Know`;
  const desc = `${e.event_name} runs ${dateRangeLabel(e)} in ${e.city}. ${e.card_hook || ""} Wayfind's verdict, timing, parking and what to pair it with.`.trim();
  const og = SITE_URL + "/api/og?t=" + encodeURIComponent(`${e.event_name} — ${dateRangeLabel(e)}`);
  return {
    title: title + " | Wayfind",
    description: desc.slice(0, 300),
    openGraph: { title, description: desc.slice(0, 300), url: `${SITE_URL}/florida-events/${e.slug}`, siteName: "Wayfind", images: [{ url: og, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, images: [og] },
    alternates: { canonical: `${SITE_URL}/florida-events/${e.slug}` },
  };
}

const S = {
  page: { maxWidth: 720, margin: "0 auto", padding: "28px 18px 60px", background: "#0D1117", color: "#E6EDF3", fontFamily: "var(--wf-sans)", lineHeight: 1.65 },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#FF8A3D" },
  h1: { fontSize: 30, lineHeight: 1.2, margin: "10px 0 14px", fontWeight: 800, color: "#FFFFFF" },
  box: { background: "#161B22", border: "1px solid #21262D", borderRadius: 14, padding: "14px 16px", margin: "0 0 22px" },
  row: { display: "flex", gap: 10, fontSize: 14.5, margin: "2px 0" },
  k: { color: "#8B949E", minWidth: 100, fontWeight: 700 },
  v: { color: "#E6EDF3" },
  h2: { fontSize: 19, fontWeight: 800, color: "#FFFFFF", margin: "26px 0 6px" },
  p: { fontSize: 15.5, color: "#C9D1D9", margin: "0 0 12px" },
  note: { fontSize: 14.5, color: "#C9D1D9", background: "#161B22", borderLeft: "3px solid #FF8A3D", borderRadius: 8, padding: "10px 14px", margin: "0 0 14px" },
  link: { color: "#FF8A3D", textDecoration: "none", fontWeight: 700 },
  foot: { fontSize: 13.5, color: "#8B949E", marginTop: 30, borderTop: "1px solid #21262D", paddingTop: 14 },
  // v8.69 — owned event photography (see lib/eventPhotos.js for the consent
  // rule that gates it). The hero is a wide band; the strip below it scrolls
  // horizontally and shows phone photos at the portrait aspect they were shot
  // at, because letterboxing a 2:3 photo into a 2:1 slot crops the subject out.
  hero: { width: "100%", height: "auto", aspectRatio: "1200 / 631", objectFit: "cover", borderRadius: 14, display: "block", margin: "0 0 16px", background: "#161B22" },
  strip: { display: "flex", gap: 10, overflowX: "auto", overscrollBehaviorX: "contain", padding: "2px 0 8px", margin: "0 0 6px", WebkitOverflowScrolling: "touch", scrollSnapType: "x mandatory" },
  shot: { flex: "0 0 auto", width: 168, aspectRatio: "853 / 1280", objectFit: "cover", borderRadius: 12, display: "block", background: "#161B22", scrollSnapAlign: "start" },
  credit: { fontSize: 12.5, color: "#8B949E", margin: "0 0 22px" },
};

export default async function CuratedEventPage({ params }) {
  const e = await fetchCuratedEventBySlug(params.slug);
  if (!e) notFound();

  const shots = eventPhotos(e.event_id);
  const ld = eventJsonLd(e, { siteUrl: SITE_URL });
  const crumbs = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Wayfind", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Florida Events", item: SITE_URL + "/florida-events" },
      { "@type": "ListItem", position: 3, name: e.event_name },
    ],
  };

  return (
    <main style={S.page}>
      {ld ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} /> : null}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crumbs) }} />

      <div style={S.kicker}>Wayfind Events</div>
      <h1 style={S.h1}>{e.event_name} {e.year}</h1>

      {/* Owned photography only. eventPhotos() fails closed when there is no
          consent record, so an event without one renders no photo at all
          rather than falling back to someone else's image. */}
      {shots && shots.hero ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shots.hero.src} alt={shots.hero.alt} width={shots.hero.w} height={shots.hero.h} style={S.hero} />
      ) : null}

      {/* The answer box. Date first, always. */}
      <div style={S.box}>
        <div style={S.row}><span style={S.k}>When</span><span style={S.v}>{dateRangeLabel(e)}, {e.year}</span></div>
        <div style={S.row}><span style={S.k}>Where</span><span style={S.v}>{e.venue ? e.venue + ", " : ""}{e.city}, {e.state}</span></div>
        <div style={S.row}><span style={S.k}>Cost</span><span style={S.v}>{e.is_free ? "Free" : (e.price_band || "Ticketed — see the organiser")}</span></div>
        {e.minimum_age ? <div style={S.row}><span style={S.k}>Age</span><span style={S.v}>{e.minimum_age}+</span></div> : null}
        {e.duration_recommendation ? <div style={S.row}><span style={S.k}>Time needed</span><span style={S.v}>{e.duration_recommendation}</span></div> : null}
        {e.crowd_level ? <div style={S.row}><span style={S.k}>Crowds</span><span style={S.v}>{e.crowd_level}</span></div> : null}
        {e.wayfind_verdict ? <div style={S.row}><span style={S.k}>Verdict</span><span style={S.v}>{e.wayfind_verdict}</span></div> : null}
      </div>

      {e.schedule_note ? <p style={S.note}>{e.schedule_note}</p> : null}
      {e.editorial_summary ? <p style={S.p}>{e.editorial_summary}</p> : null}

      {e.why_go ? (<><h2 style={S.h2}>Why it&rsquo;s worth going</h2><p style={S.p}>{e.why_go}</p></>) : null}

      {shots && shots.photos.length ? (
        <>
          <h2 style={S.h2}>What it looks like</h2>
          <div style={S.strip}>
            {shots.photos.map((p) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={p.src} src={p.src} alt={p.alt} width={p.w} height={p.h} loading="lazy" style={S.shot} />
            ))}
          </div>
          {shots.credit ? (
            <p style={S.credit}>
              {"Photos: "}
              {shots.creditUrl
                ? <a style={S.link} href={shots.creditUrl} rel="nofollow noopener" target="_blank">{shots.credit}</a>
                : shots.credit}
              {", shared with Wayfind for this listing."}
            </p>
          ) : null}
        </>
      ) : null}
      {e.skip_if ? (<><h2 style={S.h2}>Who should skip it</h2><p style={S.p}>{e.skip_if}</p></>) : null}
      {e.insider_tip ? (<><h2 style={S.h2}>The move</h2><p style={S.p}>{e.insider_tip}</p></>) : null}
      {e.parking_tip ? (<><h2 style={S.h2}>Getting there</h2><p style={S.p}>{e.parking_tip}</p></>) : null}
      {e.fun_fact ? (<><h2 style={S.h2}>One thing worth knowing</h2><p style={S.p}>{e.fun_fact}</p></>) : null}
      {e.pairing ? (<><h2 style={S.h2}>Make a day of it</h2><p style={S.p}>{e.pairing}</p></>) : null}

      {e.official_event_url ? (
        <p style={S.p}>
          <a style={S.link} href={e.official_event_url} rel="nofollow noopener" target="_blank">
            Official site — confirm dates and tickets before you travel
          </a>
        </p>
      ) : null}

      <p style={S.foot}>
        Verified {e.last_verified_at ? String(e.last_verified_at).slice(0, 10) : "recently"} against the organiser&rsquo;s own listing.
        {" "}More in <a style={S.link} href="/florida-events">Florida Events</a>.
      </p>
    </main>
  );
}
