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
import { eventPairings, pairingHref } from "../../../lib/eventPairings";

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
  // "Nearby & worth it" — compact place cards (thumbnail + text), the same
  // visual language as the hub, linking into the app shell at /p/[id].
  pgrid: { display: "grid", gridTemplateColumns: "1fr", gap: 10, margin: "6px 0 6px" },
  pcard: { display: "flex", gap: 12, alignItems: "stretch", background: "#161B22", border: "1px solid #21262D", borderRadius: 12, overflow: "hidden", textDecoration: "none" },
  pthumb: { width: 76, minWidth: 76, background: "#0D1117", objectFit: "cover", display: "block" },
  pthumbFallback: (name) => ({ width: 76, minWidth: 76, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(145deg,#1B2433,#0E1520)", color: "#8ED6C4", fontSize: 26, fontWeight: 800 }),
  pbody: { flex: 1, minWidth: 0, padding: "10px 12px 10px 2px" },
  pname: { fontSize: 15, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.25, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  pmetarow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  pscore: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 800, color: "#0D1117", background: "#8ED6C4", borderRadius: 999, padding: "2px 8px" },
  pmeta: { fontSize: 12.5, color: "#8B949E", fontWeight: 600 },
};

const photoRefUrl = (ref) => (ref ? "/api/photo?ref=" + encodeURIComponent(ref) + "&w=220" : null);

export default async function CuratedEventPage({ params }) {
  const e = await fetchCuratedEventBySlug(params.slug);
  if (!e) notFound();

  // Real nearby places worth an outing, ranked by Wayfind — [] (and no section)
  // where there is nothing honestly nearby, so a page never shows a thin shelf.
  const pairings = await eventPairings(e, {});

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
      {e.skip_if ? (<><h2 style={S.h2}>Who should skip it</h2><p style={S.p}>{e.skip_if}</p></>) : null}
      {e.insider_tip ? (<><h2 style={S.h2}>The move</h2><p style={S.p}>{e.insider_tip}</p></>) : null}
      {e.parking_tip ? (<><h2 style={S.h2}>Getting there</h2><p style={S.p}>{e.parking_tip}</p></>) : null}
      {e.fun_fact ? (<><h2 style={S.h2}>One thing worth knowing</h2><p style={S.p}>{e.fun_fact}</p></>) : null}
      {(pairings.length > 0 || e.pairing) ? (
        <>
          <h2 style={S.h2}>Nearby &amp; worth it</h2>
          {e.pairing ? <p style={S.p}>{e.pairing}</p> : null}
          {pairings.length > 0 ? (
            <>
              <p style={{ ...S.p, marginBottom: 8 }}>Real places near {e.venue || e.city}, ranked by Wayfind &mdash; make it a full outing.</p>
              <div style={S.pgrid}>
                {pairings.map((p) => (
                  <a key={p.id} href={pairingHref(p)} style={S.pcard}>
                    {photoRefUrl(p.photoRef)
                      ? <img src={photoRefUrl(p.photoRef)} alt="" loading="lazy" style={S.pthumb} />
                      : <div style={S.pthumbFallback(p.name)} aria-hidden="true">{(p.name || "?").trim().charAt(0).toUpperCase()}</div>}
                    <div style={S.pbody}>
                      <div style={S.pname}>{p.name}</div>
                      <div style={S.pmetarow}>
                        <span style={S.pscore}>{(p.wfScore / 10).toFixed(1)}</span>
                        <span style={S.pmeta}>{p.cat}{p.distMi != null ? " · " + p.distMi.toFixed(1) + " mi" : ""}</span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </>
          ) : null}
        </>
      ) : null}

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
