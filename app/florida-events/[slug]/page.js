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
import { safeUrl } from "../../../lib/links.js";
import { SITE_URL } from "../../../lib/site";
import { fetchCuratedEvents, fetchCuratedEventBySlug, eventJsonLd, dateRangeLabel } from "../../../lib/curatedEvents";
import { eventPhotos } from "../../../lib/eventPhotos";
import { addressLine, directionsUrl } from "../../../lib/placeWhere";
import ShareButton from "../../components/ShareButton";
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
  // THE SHARE CARD. An event that has owned, consent-cleared photography
  // previews with the PHOTOGRAPH; everything else keeps the generated text
  // card. This is deliberately NOT a photo inside /api/og: scripts/check-share-
  // card.mjs bans photography in the generated card and is right to — the
  // owner deleted a stock sunset that decorated every card, and an <img> is
  // the only thing in a Satori render that can fail a fetch mid-response. The
  // distinction that guard itself draws is between stock borrowed to decorate
  // a claim and the object actually being shared. A photo of THIS market,
  // handed to us by the organiser, is the second thing, and pointing metadata
  // straight at the static file gets it with no renderer and nothing to fail.
  // Built on SITE_URL because a scraper does not resolve a relative path
  // (scripts/check-og-absolute.mjs).
  const shots = eventPhotos(e.event_id);
  const og = shots && shots.hero
    ? SITE_URL + shots.hero.src
    : SITE_URL + "/api/og?t=" + encodeURIComponent(`${e.event_name} — ${dateRangeLabel(e)}`);
  const ogW = shots && shots.hero ? shots.hero.w : 1200;
  const ogH = shots && shots.hero ? shots.hero.h : 630;
  return {
    title: title + " | Wayfind",
    description: desc.slice(0, 300),
    openGraph: { title, description: desc.slice(0, 300), url: `${SITE_URL}/florida-events/${e.slug}`, siteName: "Wayfind", images: [{ url: og, width: ogW, height: ogH, alt: shots && shots.hero ? shots.hero.alt : title }] },
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
  // v8.70 — THE RAIL, REBUILT SO IT CANNOT STRETCH.
  //
  // The first version put width + aspect-ratio directly on the <img> inside a
  // flex row. Two things then went wrong together on desktop: a flex row's
  // default `align-items: stretch` overrides an item's own computed height, and
  // the intrinsic width/height attributes (853x1280) give the box something
  // enormous to stretch to. The result was four full-viewport-height slabs.
  //
  // The fix is to stop asking the image to size itself at all. Each photo sits
  // in a wrapper with an EXPLICIT px width AND height; the <img> just fills it
  // with object-fit: cover. No aspect-ratio maths, no intrinsic-size influence,
  // and `alignItems: flex-start` means nothing can be stretched by the row.
  strip: {
    display: "flex", alignItems: "flex-start", gap: 10,
    overflowX: "auto", overscrollBehaviorX: "contain",
    padding: "2px 0 10px", margin: "0 0 6px",
    WebkitOverflowScrolling: "touch", scrollSnapType: "x mandatory",
  },
  shotBox: {
    flex: "0 0 auto", width: 172, height: 258,
    borderRadius: 12, overflow: "hidden", background: "#161B22",
    scrollSnapAlign: "start",
  },
  shot: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  credit: { fontSize: 12.5, color: "#8B949E", margin: "0 0 22px" },
  // v8.88 — the way back. Byte-identical to the pill on /guides and
  // /guides/[slug] (check-guides pins that anchor) because a reader who has
  // seen it once should not have to learn a second control: this page simply
  // never got one, so every route into it — the paid rail card, the augtober
  // drop, a shared link — was a terminal page.
  back: {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px",
    borderRadius: 999, background: "#161B22", border: "1px solid #21262D",
    color: "#FF8A3D", fontSize: 13.5, fontWeight: 800, textDecoration: "none",
    marginBottom: 18,
  },
  backRow: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" },
  // v8.88 — the DIRECTIONS control. A pill, not a text link, because the owner
  // asked for "the little button that allows you to click on it and get
  // directions" and because this is the one action on the page a reader takes
  // with their body. Full-width on a phone: it is the last thing you tap
  // before you drive.
  dirs: {
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
    marginTop: 12, padding: "11px 18px", borderRadius: 12,
    background: "#F97316", border: "1px solid #F97316", color: "#0D1117",
    fontSize: 14.5, fontWeight: 800, textDecoration: "none", lineHeight: 1,
  },
  addr: { color: "#C9D1D9", fontSize: 14, marginTop: 2 },
  shareTop: { margin: "-8px 0 22px" },
  shareEnd: { margin: "28px 0 4px", padding: "18px 20px", borderRadius: 16, background: "#0E1520", border: "1px solid #1F2A3A" },
  shareAsk: { margin: "0 0 12px", fontSize: 15.5, lineHeight: 1.5, color: "#C9D1D9" },
  // "Nearby & worth it" — compact place cards (thumbnail + text), the same
  // visual language as the hub, linking into the app shell at /p/[id].
  pgrid: { display: "grid", gridTemplateColumns: "1fr", gap: 10, margin: "6px 0 6px" },
  pcard: { display: "flex", gap: 12, alignItems: "stretch", background: "#161B22", border: "1px solid #21262D", borderRadius: 12, overflow: "hidden", textDecoration: "none" },
  pthumb: { width: 76, minWidth: 76, background: "linear-gradient(145deg,#1B2433,#0E1520)", objectFit: "cover", display: "block", alignSelf: "stretch" },
  pbody: { flex: 1, minWidth: 0, padding: "10px 12px 10px 2px" },
  pname: { fontSize: 15, fontWeight: 800, color: "#FFFFFF", lineHeight: 1.25, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  pmetarow: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  pscore: { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12.5, fontWeight: 800, color: "#0D1117", background: "#8ED6C4", borderRadius: 999, padding: "2px 8px" },
  pmeta: { fontSize: 12.5, color: "#8B949E", fontWeight: 600 },
};

// A real thumbnail for every nearby place: the stored Google photo ref when we
// have one, otherwise the venue's first photo by place_id (the same reliable,
// cached /api/photo path the event heroes use). Falls back to the gradient the
// <img> background paints if a place genuinely has no photo.
const thumbUrl = (p) => (p.photoRef
  ? "/api/photo?ref=" + encodeURIComponent(p.photoRef) + "&w=220"
  : "/api/photo?place=" + encodeURIComponent(p.id) + "&w=220");

export default async function CuratedEventPage({ params }) {
  const e = await fetchCuratedEventBySlug(params.slug);
  if (!e) notFound();

  const shots = eventPhotos(e.event_id);
  // SERVER-resolved, never window.location — on a preview deploy that is a host
  // the recipient cannot open (lib/site.js canonicalShareUrl).
  const shareUrl = SITE_URL + "/florida-events/" + params.slug;
  const shareText = `${e.event_name} — ${dateRangeLabel(e)}${e.is_free ? ", free" : ""}. Found this on Wayfind.`;
  // v8.88 — WHERE IT IS, AND HOW TO GET THERE (owner, 2026-08-29, on this very
  // page): "how are people gonna be able to find it?"
  //
  // The answer box printed `{venue}, {city}, {state}` — "Möbius Sarasota,
  // Sarasota, FL" — for a row that has held
  // "2211 Whitfield Park Loop, Ste 101, Sarasota, FL 34243" since it was
  // created. `address` is in EVENT_COLUMNS and is SELECTed on every read; the
  // page just never printed it.
  //
  // AND THE SHARPEST PART: eventJsonLd() below has always emitted that street
  // address as PostalAddress.streetAddress, plus GeoCoordinates. So Google has
  // had the address on this page all along and the reader has not. Structured
  // data was better informed than the human it was describing.
  //
  // Both values come from lib/placeWhere.js, the ONE rule, so this page and
  // /events/[city]/[slug] cannot drift into two answers about where something
  // is. directionsUrl returns null when the row cannot honestly send anyone
  // anywhere (7 of 89 rows), and the button is simply not rendered — a dead
  // "Directions" that drops you in the middle of a city is worse than none.
  const where = addressLine(e);
  const dirs = directionsUrl(e);
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

      {/* v8.88 — THE WAY BACK (owner: "you need to put a way to go back to
          Wayfind from that page … there's no way to get back").
          Every route into this page was one-way: the paid rail card on the
          homepage, the augtober drop, /florida-events, and every shared link.
          Browser back covers the first three and covers NOTHING for the reader
          who arrived from a text message — which, for an event page, is most of
          them, because sharing is the whole point of the surface (there are two
          share controls on this page and were zero ways out).

          Two doors, because they answer different questions: the product, and
          the shelf this event sits on. */}
      <div style={S.backRow}>
        <a style={S.back} href="/">&lsaquo; Back to Wayfind</a>
        <a style={S.back} href="/florida-events">&lsaquo; Florida Events</a>
      </div>

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
        <div style={S.row}>
          <span style={S.k}>Where</span>
          <span style={S.v}>
            {e.venue ? <div>{e.venue}</div> : null}
            {/* The street, on its own line. When we hold no street address
                this falls back to "City, ST" — the same fact the venue line
                already implies, so it is only printed when it ADDS something
                (no venue name to carry it). Never a fabricated precision. */}
            {where && (e.venue ? where !== `${e.city}, ${e.state}` : true)
              ? <div style={S.addr}>{where}</div>
              : (!e.venue ? <div style={S.addr}>{e.city}, {e.state}</div> : null)}
          </span>
        </div>
        <div style={S.row}><span style={S.k}>Cost</span><span style={S.v}>{e.is_free ? "Free" : (e.price_band || "Ticketed — see the organiser")}</span></div>
        {e.minimum_age ? <div style={S.row}><span style={S.k}>Age</span><span style={S.v}>{e.minimum_age}+</span></div> : null}
        {e.duration_recommendation ? <div style={S.row}><span style={S.k}>Time needed</span><span style={S.v}>{e.duration_recommendation}</span></div> : null}
        {e.crowd_level ? <div style={S.row}><span style={S.k}>Crowds</span><span style={S.v}>{e.crowd_level}</span></div> : null}
        {e.wayfind_verdict ? <div style={S.row}><span style={S.k}>Verdict</span><span style={S.v}>{e.wayfind_verdict}</span></div> : null}
      </div>

      {/* The button you tap right before you drive. It opens turn-by-turn
          DIRECTIONS (maps/dir), not a map search that then asks the reader to
          find the Directions button themselves — the owner asked for the
          second tap to be gone, and those are two different Google endpoints.
          Absent entirely when the row cannot name a destination. */}
      {dirs ? (
        <p style={{ margin: "-12px 0 22px" }}>
          <a style={S.dirs} href={dirs} target="_blank" rel="noopener nofollow"
            aria-label={"Get directions to " + (e.venue || e.event_name)}>
            {"\u2192 Get directions"}
          </a>
        </p>
      ) : null}

      {/* Two share controls, the guide rule applied to an event
          (scripts/check-guide-share.mjs): this one catches the reader who knew
          they wanted to send it the moment they saw the date, and the one at
          the foot catches the far larger group who only know after reading. An
          event is the strongest share case on the site — the whole point of
          "Friday, free, 7pm" is the person you are going with. */}
      <div style={S.shareTop}>
        <ShareButton
          url={shareUrl}
          title={`${e.event_name} ${e.year}`}
          text={shareText}
          label="Share"
          tone="dark"
          event="event_share"
          meta={{ slug: params.slug, event_id: e.event_id || null, city: e.city || null, placement: "hero" }}
        />
      </div>

      {e.schedule_note ? <p style={S.note}>{e.schedule_note}</p> : null}
      {e.editorial_summary ? <p style={S.p}>{e.editorial_summary}</p> : null}

      {e.why_go ? (<><h2 style={S.h2}>Why it&rsquo;s worth going</h2><p style={S.p}>{e.why_go}</p></>) : null}

      {shots && shots.photos.length ? (
        <>
          <h2 style={S.h2}>What it looks like</h2>
          <div style={S.strip}>
            {shots.photos.map((p) => (
              <div key={p.src} style={S.shotBox}>
                {/* No width/height attributes: the wrapper is the box, and the
                    intrinsic 853x1280 is exactly what the row stretched to. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.src} alt={p.alt} loading="lazy" style={S.shot} />
              </div>
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
                    <img src={thumbUrl(p)} alt="" loading="lazy" style={S.pthumb} />
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

      {safeUrl(e.official_event_url) ? (
        <p style={S.p}>
          <a style={S.link} href={safeUrl(e.official_event_url)} rel="nofollow noopener" target="_blank">
            Official site — confirm dates and tickets before you travel
          </a>
        </p>
      ) : null}

      <section style={S.shareEnd}>
        <p style={S.shareAsk}>
          Going? Send it to whoever you&rsquo;d go with — they&rsquo;ll get the dates, the hours and where to park.
        </p>
        <ShareButton
          url={shareUrl}
          title={`${e.event_name} ${e.year}`}
          text={shareText}
          label="Share this event"
          tone="solid"
          event="event_share"
          meta={{ slug: params.slug, event_id: e.event_id || null, city: e.city || null, placement: "page_end" }}
        />
      </section>

      <p style={S.foot}>
        Verified {e.last_verified_at ? String(e.last_verified_at).slice(0, 10) : "recently"} against the organiser&rsquo;s own listing.
        {" "}More in <a style={S.link} href="/florida-events">Florida Events</a>.
      </p>
    </main>
  );
}
