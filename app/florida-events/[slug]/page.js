// v7.45 — The individual event page. Google is explicit that Event structured
// data belongs on a single-event page with its own URL, not on a roundup, and
// this is that page.
//
// Lives under /florida-events/ rather than /events/ because /events/[city]
// already exists and belongs to the live aggregator. Different job, different
// namespace.
//
// The answer box comes FIRST. Nobody wants 500 words before the date.
import EventPlacePhoto from "../../components/EventPlacePhoto.js";
import EventDetailShell from "../../components/EventDetailShell.js";
import EventExperienceStyles from "../../components/EventExperienceStyles.js";
import { notFound } from "next/navigation";
import { safeUrl } from "../../../lib/links.js";
import { SITE_URL } from "../../../lib/site";
import { fetchCuratedEvents, fetchCuratedEventBySlug, eventJsonLd, dateRangeLabel, eventWebsiteUrl } from "../../../lib/curatedEvents";
import { eventPhotos } from "../../../lib/eventPhotos";
import { addressLine, appleDirectionsUrl } from "../../../lib/placeWhere";
import ShareButton from "../../components/ShareButton";
import SaveEventButton from "./SaveEventButton.js";
import EventWhere from "../../components/EventWhere";
import ReturnToWayfind from "../../components/ReturnToWayfind.js";
import { eventPairings, pairingHref } from "../../../lib/eventPairings";
import { eventTicketCta } from "../../../lib/eventTicketDeals.js";
import { clockLabel } from "../../../lib/fallPool.js";
import { eventSocialPosts } from "../../../lib/eventSocial.js";
import VideoFacade from "../../components/VideoFacade.js";
import CreatorPlaybackDetails from "../../components/CreatorPlaybackDetails.js";
import { isEmbeddable } from "../../../lib/videoEmbed";

// Same two-letter monogram convention as RailCard/IconicPlaceCard's card
// fallback (app/components/css.js .wf-place-card-monogram) — the letters an
// event with no photo shows instead of a blank panel (S.heroFallback below).
function heroInitials(name) {
  return String(name || "WF").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export const revalidate = 3600;

export async function generateStaticParams() {
  const all = await fetchCuratedEvents();
  return all.map((e) => ({ slug: e.slug }));
}

export async function generateMetadata({ params }) {
  // Throws on a failed read. Do not catch — an outage is not "this event
  // has no metadata", and catching would hide the same soft-fail the hub
  // used to cache as a successful empty page.
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
  // v9.00 — THE CONCISE REASON TO GO, right under the title. card_hook is a
  // line every curated row already carries (isTrusted requires one) and it
  // used to surface nowhere on this page until "Why it's worth going" much
  // further down — so a reader deciding whether to keep scrolling never saw
  // the one sentence written specifically to make that decision for them.
  hook: { fontSize: 16.5, lineHeight: 1.5, color: "#C9D1D9", margin: "0 0 18px", fontWeight: 600 },
  box: { background: "#161B22", border: "1px solid #21262D", borderRadius: 14, padding: "14px 16px", margin: "0 0 22px" },
  row: { display: "flex", gap: 10, fontSize: 14.5, margin: "2px 0" },
  k: { color: "#8B949E", minWidth: 100, fontWeight: 700 },
  v: { color: "#E6EDF3" },
  h2: { fontSize: 19, fontWeight: 800, color: "#FFFFFF", margin: "26px 0 6px" },
  p: { fontSize: 15.5, color: "#C9D1D9", margin: "0 0 12px" },
  note: { fontSize: 14.5, color: "#C9D1D9", background: "#161B22", borderLeft: "3px solid #FF8A3D", borderRadius: 8, padding: "10px 14px", margin: "0 0 14px" },
  link: { color: "#FF8A3D", textDecoration: "none", fontWeight: 700 },
  foot: { fontSize: 13.5, color: "#8B949E", marginTop: 30, borderTop: "1px solid #21262D", paddingTop: 14 },
  heroFallbackRing: {
    width: 84, height: 84, borderRadius: 22, display: "flex", alignItems: "center", justifyContent: "center",
    border: "1px solid rgba(255,142,61,.34)", background: "rgba(255,255,255,.02)",
    boxShadow: "0 18px 40px rgba(0,0,0,.35), inset 0 1px rgba(255,255,255,.06)",
  },
  heroFallbackMark: { fontSize: 28, fontWeight: 900, letterSpacing: ".06em", color: "#FFC08F" },
  credit: { fontSize: 12.5, color: "#8B949E", margin: "0 0 22px" },
  social: { margin: "22px 0", padding: "16px", border: "1px solid #26303B", borderRadius: 14, background: "#111821" },
  socialRail: { display: "flex", gap: 14, overflowX: "auto", overscrollBehaviorX: "contain", padding: "4px 2px 10px", scrollSnapType: "x proximity" },
  socialPost: { flex: "0 0 min(78vw, 300px)", maxWidth: 300, scrollSnapAlign: "start", borderRadius: 20, overflow: "hidden", border: "1px solid #65443d", background: "linear-gradient(180deg,#302021,#191415)" },
  socialLink: { display: "block", color: "#efd0a6", fontSize: 14, fontWeight: 800, textDecoration: "none", padding: "0 16px 18px" },
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
  addr: { color: "#C9D1D9", fontSize: 14, marginTop: 2 },
  // v9.00 (owner, 2026-09-07: "not a premium Wayfind event page … directions
  // are duplicated"). Directions now lives in EXACTLY ONE place — the shared
  // <EventWhere> block below — so this page no longer defines its own pill
  // for it (the old S.dirs is gone). The TICKET control is what stays here,
  // because it is the PRIMARY action on an event you have to buy your way
  // into: full width, the strongest weight on the page, so a reader's thumb
  // finds it before anything else. Directions is deliberately the SECONDARY
  // action, one level down inside EventWhere — the hierarchy the owner asked
  // for. scripts/check-event-hero-and-directions.mjs proves the count of one.
  ticketWrap: { margin: "16px 0 24px" },
  tix: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    width: "100%", boxSizing: "border-box", maxWidth: "100%", textAlign: "center", overflowWrap: "anywhere", padding: "16px 20px", borderRadius: 14,
    background: "linear-gradient(180deg,#FFA35C,#F97316)", border: "1px solid #F97316", color: "#111827",
    fontSize: 16, fontWeight: 850, textDecoration: "none", lineHeight: 1.4,
    boxShadow: "0 0 22px rgba(249,115,22,.30), 0 12px 36px rgba(249,115,22,.38), inset 0 1px 0 rgba(255,255,255,.3)",
  },
  disclosure: { margin: "10px 0 0", fontSize: 11.5, color: "#8B949E", textAlign: "center" },
  actionsRow: { display: "flex", gap: 10, flexWrap: "wrap" },
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

export default async function CuratedEventPage({ params }) {
  // Throws on a failed read. notFound() is only the honest miss (row
  // absent or not displayable). An outage must not 404 a live event.
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
  // 2026-09-08 — Apple, permanently (owner): the same ladder addressed to
  // Apple Maps, matching the in-page MapKit map and its Apple driving route.
  const dirs = appleDirectionsUrl(e);
  // v8.99 — the venue's own site, gated exactly like every other outbound
  // link on the row (link_ok, quarantine, safeUrl). Rendered as a BUTTON
  // beside directions, not a text link at the foot of the page — owner,
  // 2026-09-06: "does not have the address nor the website for the place".
  const site = eventWebsiteUrl(e) || null;
  const ticket = eventTicketCta(e.event_id, { surface: "florida_event_page" });
  const socialPosts = eventSocialPosts(e.event_id) || [];
  // The card's creator mark promises that the post is one tap away. Reuse the
  // event's already-cleared hero as the click-to-load cover so that promise is
  // visible before Instagram's third-party iframe is requested.
  const socialPoster = shots && shots.hero ? shots.hero.src : (e.hero_image || null);
  const socialPosterFallback = shots && shots.hero ? (e.hero_image || null) : null;
  const socialDetails = (post) => <>
    <div style={{ padding: "18px 16px 14px" }}>
      <h3 style={{ margin: "0 0 6px", color: "#fff", fontFamily: "Georgia,serif", fontSize: 22, lineHeight: 1.25 }}>{e.event_name}</h3>
      <p style={{ margin: "0 0 10px", color: "#aaa3a0", fontSize: 13 }}>{[e.venue, e.city].filter(Boolean).join(" · ")}</p>
      <p style={{ margin: 0, color: "#cbbab2", fontSize: 13, lineHeight: 1.5 }}>Seen by @{post.creator}. {socialPoster ? "Event cover shown." : "Open the creator’s post to see more."}</p>
    </div>
    <a href={post.url} target="_blank" rel="noopener" style={S.socialLink}
      aria-label={`View @${post.creator}'s Instagram post about ${e.event_name} (opens in a new tab)`}>
      View @{post.creator}&rsquo;s post on Instagram ↗
    </a>
  </>;
  // Real nearby places worth an outing, ranked by Wayfind — [] (and no section)
  // where there is nothing honestly nearby, so a page never shows a thin shelf.
  // They render inside <EventWhere> (numbered cards + the same numbers as pins).
  const pairings = (await eventPairings(e, {})).map((p) => ({ ...p, href: pairingHref(p) }));
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
    <main className="wf-event-experience"><EventExperienceStyles /><div className="wf-event-wrap">
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
      <div className="wf-event-brand"><a href="/" aria-label="Wayfind home"><img src="/brand/wayfind-official-white.png" alt="Wayfind" width="145" height="42" /></a><div style={S.backRow}>
        <ReturnToWayfind style={S.back} />
        <a style={S.back} href="/florida-events">&lsaquo; Florida Events</a>
      </div>

      </div>
      <EventDetailShell
        title={`${e.event_name} ${e.year}`}
        facts={[
          { label: "When", value: `${dateRangeLabel(e)}, ${e.year}${clockLabel(e.start_time) ? ` · ${clockLabel(e.start_time)}${clockLabel(e.end_time) ? "–" + clockLabel(e.end_time) : ""}` : ""}` },
          { label: "Where", value: <>{e.venue ? <div>{e.venue}</div> : null}{where && (e.venue ? where !== `${e.city}, ${e.state}` : true) ? <div style={S.addr}>{where}</div> : (!e.venue ? <div style={S.addr}>{e.city}, {e.state}</div> : null)}</> },
          { label: "Cost", value: e.is_free ? "Free" : (e.price_band || (e.is_free === false ? "Ticketed · see the organiser" : "See the organiser for admission details")) },
          { label: "Age", value: e.minimum_age ? `${e.minimum_age}+` : null },
          { label: "Time needed", value: e.duration_recommendation },
          { label: "Crowds", value: e.crowd_level },
          { label: "Verdict", value: e.wayfind_verdict },
        ]}
        story={<>
          {e.schedule_note ? <p style={S.note}>{e.schedule_note}</p> : null}
          {e.card_hook ? <p style={S.hook}>{e.card_hook}</p> : null}
          {e.editorial_summary ? <p style={S.p}>{e.editorial_summary}</p> : null}
          {e.why_go ? <><h2 style={S.h2}>Why it&rsquo;s worth going</h2><p style={S.p}>{e.why_go}</p></> : null}
        </>}
        actions={<>
      {ticket ? (
        <div style={S.ticketWrap}>
          <a style={S.tix} href={ticket.href} target="_blank" rel="sponsored nofollow noopener"
            aria-label={ticket.label.replace(" ↗", "") + " for " + e.event_name}>
            {"🎟️ " + ticket.label}
          </a>
          <p style={S.disclosure}>Ticket link is an affiliate link; Wayfind may earn a commission. It never changes what we recommend.</p>
        </div>
      ) : null}

      {/* Save + share, together, near the top — the owner's premium-event
          list (2026-09-07). Save runs through the SAME lib/contentCardActions
          store RailCard, IconicPlaceCard and the aggregator event page's
          EventActions all use, so a save made here shows up as saved
          everywhere else — no second save mechanism invented for this page.
          Two share controls is the guide rule applied to an event
          (scripts/check-guide-share.mjs): this one catches the reader who knew
          they wanted to send it the moment they saw the date, and the one at
          the foot catches the far larger group who only know after reading. An
          event is the strongest share case on the site — the whole point of
          "Friday, free, 7pm" is the person you are going with. */}
      <div className="wf-event-secondary-actions">
        <div style={S.actionsRow}>
          <SaveEventButton
            id={`wfc:${e.event_id}`}
            name={e.event_name}
            image={shots && shots.hero ? shots.hero.src : (e.hero_image || null)}
            url={shareUrl}
          />
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
      </div>

        </>}
        note={e.is_free ? "Confirm dates and availability on the official listing." : "Confirm availability and booking terms with the ticket provider before paying."}
        media={<>
      {shots && shots.hero ? (
        <div className="wf-event-photo"><EventPlacePhoto src={shots.hero.src} name={shots.hero.alt || e.event_name} /></div>
      ) : e.hero_image ? (
        <div className="wf-event-photo"><EventPlacePhoto src={e.hero_image} name={e.image_alt || `${e.event_name} at ${e.venue || e.city}`} /></div>
      ) : (
        <div className="wf-event-photo wf-event-photo-fallback" role="img" aria-label={`${e.event_name} — no photo available yet`}>
          <div style={S.heroFallbackRing}><span style={S.heroFallbackMark}>{heroInitials(e.short_title || e.event_name)}</span></div>
        </div>
      )}

      {shots && shots.photos.filter((p) => p.src !== shots.hero?.src).map((p) => (
        <div key={p.src} className="wf-event-photo">
          <EventPlacePhoto src={p.src} name={p.alt || e.event_name} />
        </div>
      ))}
        </>}
        credit={shots && shots.credit ? <p style={S.credit}>
          Photos: {shots.creditUrl ? <a style={S.link} href={shots.creditUrl} rel="nofollow noopener" target="_blank">{shots.credit}</a> : shots.credit}, shared with Wayfind for this listing.
        </p> : null}
      />

      {/* A Fall card that names a creator must pay that promise off before the
          map and nearby recommendations. The map can be more than a viewport
          tall on mobile; placing the post after it made the card marker look
          unrelated to the detail page. */}
      {socialPosts.length ? (
        <section style={{ ...S.social, maxWidth: 820, margin: "0 auto 40px" }} aria-label="Creator posts about this event">
          <h2 style={{ ...S.h2, marginTop: 0 }}>Seen from local creators</h2>
          <div style={S.socialRail}>
            {socialPosts.map((post) => (
              <article key={post.url} style={S.socialPost}>
                {/* The facade paints only Wayfind UI until the reader taps it;
                    Instagram's official iframe and third-party request are
                    created after that click. The native link below remains a
                    visible fallback when an embed is blocked or removed. */}
                {isEmbeddable(post.platform, post.url) ? <CreatorPlaybackDetails buttonStyle={{ color: "#efd0a6" }} details={socialDetails(post)}>
                  <VideoFacade
                    platform={post.platform}
                    url={post.url}
                    label={`@${post.creator}'s post about ${e.event_name}`}
                    poster={socialPoster}
                    fallbackPoster={socialPosterFallback}
                    coverTitle={e.event_name}
                    coverCity={e.city}
                    coverEyebrow={`THE @${post.creator} EDIT`}
                    fallbackLabel="Event cover shown"
                  />
                </CreatorPlaybackDetails> : socialDetails(post)}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {/* v8.99 — WHERE IT IS, ON A MAP, WITH YOUR ROUTE AND WHAT IS NEARBY.
          One shared block (app/components/EventWhere.js) — the rule for every
          event page, curated or live. Sits right under the answer box because
          "where" is part of the answer. */}
      <EventWhere
        venue={e.venue || e.event_name}
        address={where}
        directionsHref={dirs}
        website={site}
        lat={e.lat == null || e.lat === "" ? NaN : Number(e.lat)}
        lng={e.lng == null || e.lng === "" ? NaN : Number(e.lng)}
        picks={pairings}
      />

      <div className="wf-event-content">
      {e.skip_if ? (<><h2 style={S.h2}>Who should skip it</h2><p style={S.p}>{e.skip_if}</p></>) : null}
      {e.insider_tip ? (<><h2 style={S.h2}>The move</h2><p style={S.p}>{e.insider_tip}</p></>) : null}
      {e.parking_tip ? (<><h2 style={S.h2}>Getting there</h2><p style={S.p}>{e.parking_tip}</p></>) : null}
      {e.fun_fact ? (<><h2 style={S.h2}>One thing worth knowing</h2><p style={S.p}>{e.fun_fact}</p></>) : null}
      {/* v8.99 — the ranked nearby cards moved INTO <EventWhere> above (numbered
          to match the map pins). The editorial pairing sentence stays here as
          the outing note it always was. */}
      {e.pairing ? (<><h2 style={S.h2}>Make it an outing</h2><p style={S.p}>{e.pairing}</p></>) : null}

      {site ? (
        <p style={S.p}>
          <a style={S.link} href={site} rel="nofollow noopener" target="_blank">
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
        {safeUrl(e.source_url) ? <>{" "}<a style={S.link} href={safeUrl(e.source_url)} rel="nofollow noopener" target="_blank">Verification source</a>.</> : null}
        {" "}More in <a style={S.link} href="/florida-events">Florida Events</a>.
      </p>
      </div></div>
    </main>
  );
}
