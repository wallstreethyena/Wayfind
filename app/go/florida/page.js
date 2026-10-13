// app/go/florida/page.js — /go/florida, the paid landing page for Florida
// Google Ads campaigns (Search + YouTube). A STATIC route, deliberately, so
// it takes precedence over the dynamic app/go/[city]/page.js segment — this
// is a statewide page, not a city, and it never resolves through
// lib/goShortlinks.resolveGoSlug. "florida" is still reserved in that
// module's RESERVED_GO_SLUGS (see lib/goShortlinks.js) so a future social
// shortlink can never be registered under a slug this static page already
// owns, even though it would never actually be reached.
//
// Server-rendered navigation, focus ordering and native expandable collections.
// The existing GuidePhoto component handles image load/decode failures.
//
// NO METERED GOOGLE PLACES CALLS. This route never imports lib/landing.js's
// rankedFor() or anything that reaches Google Places. Every place-shaped
// thing on this page is either a guide (lib/guides.js, already written), a
// curated event (lib/curatedEvents.js, a Supabase read, not a Places call)
// or a partner offer (lib/menuPartnerOffers.js, a static, hand-verified
// registry).
//
// NO PARTNER URL EVER APPEARS IN THIS FILE. Every outbound commerce link is
// built by commerceHref() / eventTicketCta() / experienceGoUrl(), each of
// which returns an /api/*/go path on this origin — the destination is
// resolved server-side, at click time, by the route the link points at.
import { cachedCuratedEventList } from "../../../lib/curatedEventsCache";
import ExperienceCatalog from "./ExperienceCatalog";
import ThemeParkRail from "../../components/ThemeParkRail";
import React from "react";
import FloridaSections from "./FloridaSections";
import LicensedPhoto from "../../components/LicensedPhoto";
import { SPRINGS_PHOTO, FLORIDA_PARK_PHOTOS } from "../../../lib/floridaPhotography";
import { floridaEventPhoto, floridaSearchPhoto } from "../../../lib/floridaEventPhotography";
import { isFallThemedEvent } from "../../../lib/fallTheme";
import styles from "./florida.module.css";
import CommerceClickBeacon from "../../components/CommerceClickBeacon";
import GuidePhoto from "../../components/GuidePhoto";
import PhotoCreditLink from "../../components/PhotoCreditLink";
import { guideHero } from "../../../lib/guideHero";
import { activeSeasonalMark, NORMAL_MARK } from "../../../lib/seasonalBrand";
import { SITE_URL } from "../../../lib/site";
import { GUIDES } from "../../../lib/guides";
import { commerceHref } from "../../../lib/commerce";
import {
  isFloridaEvent,
  isEligible,
  dateRangeLabel,
} from "../../../lib/curatedEvents";
import { eventTicketCta } from "../../../lib/eventTicketDeals";
import { experienceGoUrl } from "../../../lib/affiliates";
import { providerLabel } from "../../../lib/providerLabels";
import { isHotlinkRefusedImage } from "../../../lib/imageHostPolicy";
import {
  SURFACE,
  DISCLOSURE,
  HERO,
  orderedSections,
  HOT_SNAPSHOT_HEADING,
  HOT_SNAPSHOT_LABEL,
  INTEREST_LINKS,
  offerContext,
  landingOfferImage,
  HOT_GUIDES,
  liveGuides,
  GULF_COAST_HEADING,
  GULF_COAST_INTRO,
  GULF_COAST_GUIDES,
  HALLOWEEN_HEADING,
  HALLOWEEN_INTRO,
  HALLOWEEN_ALL_EVENTS_LABEL,
  HALLOWEEN_ALL_EVENTS_HREF,
  HALLOWEEN_FALLBACK_TEXT,
  ORLANDO_HEADING,
  ORLANDO_INTRO,
  TICKET_CTA_LABEL,
  THEME_PARK_OFFERS,
  NATURE_HEADING,
  NATURE_INTRO,
  AVAILABILITY_CTA_LABEL,
  NATURE_OFFERS,
  VIATOR_SEARCH_INTENTS,
  SHOWS_HEADING,
  SHOWS_INTRO,
  SHOW_OFFERS,
  STAYS_HEADING,
  STAYS_INTRO,
  STAYS_GUIDE_SLUG,
  STAYS_GUIDE_TITLE,
  FOOTER_LINKS,
} from "../../../lib/paidFloridaLanding";

export const revalidate = 3600;

export const metadata = {
  title: "Florida Trip Planner: Tickets, Tours, Stays and Events | Wayfind",
  description: "Wayfind's Florida trip planner: guides, tickets, tours, stays and events for your next Florida plan, in one place.",
  // A paid landing page must never compete with the organic page for the
  // same query, same rule as app/go/[city]/page.js. Canonical points at the
  // indexable Florida hub; this route stays out of the index entirely.
  robots: { index: false, follow: true },
  alternates: { canonical: SITE_URL + "/florida-events" },
  openGraph: {
    title: 'Your next “how did you find this?” | Wayfind',
    description: "Discover Florida places worth the detour.",
    url: SITE_URL + "/go/florida",
    siteName: "Wayfind",
    type: "website",
    images: [{
      url: SITE_URL + "/og/florida-discovery-wayfind-v2.png",
      width: 1732,
      height: 908,
      alt: "Wayfind: Your next how did you find this? Discover Florida places worth the detour.",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: 'Your next “how did you find this?” | Wayfind',
    description: "Discover Florida places worth the detour.",
    images: [SITE_URL + "/og/florida-discovery-wayfind-v2.png"],
  },
};

// The curated-events read, cached the SAME way app/florida-events/page.js
// caches it: `fresh: true` so this landing page never serves a stale Data
// Cache entry shared with another route (see lib/curatedEvents.js's own
// "THE LIVE READER" note), wrapped in unstable_cache so the ?focus= search
// param making this page dynamic does not turn into a Supabase read on
// every single request.
// Packed + scrubbed (lib/curatedEventsCache.js): the raw row list passed
// Next's 2 MB data-cache limit, so the hourly refresh never saved and one old
// entry was served for good. New key retires that pinned entry.
const fetchLandingEvents = cachedCuratedEventList("fetchLandingEvents", ["go-florida-landing-events-packed-v2"]);

async function loadHalloweenEvents() {
  try {
    // Explicit local preview mode uses the site's public, read-only fall feed.
    // Production continues to read its own database; never proxy back to itself.
    const publicPreview = process.env.WAYFIND_PREVIEW_PUBLIC_EVENTS === "1" && !process.env.VERCEL;
    let rows;
    if (publicPreview) {
      const response = await fetch("https://www.gowayfind.com/api/events/fall?lat=28.5383&lng=-81.3792&full=1", { cache: "no-store", signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error("Public preview event feed unavailable");
      const feed = await response.json();
      if (!Array.isArray(feed.rails)) throw new Error("Invalid public preview event feed");
      rows = [...new Map(feed.rails.flatMap((rail) => rail.cards || []).filter((event) => event.event_id).map((event) => [event.event_id, event])).values()];
    } else {
      rows = await fetchLandingEvents();
    }
    const now = new Date();
    const items = (Array.isArray(rows) ? rows : [])
      .filter(isFloridaEvent)
      .filter((e) => isFallThemedEvent(e) || String(e.event_id || "").replace(/^wfc:/, "") === "epcot-food-wine-2026")
      .filter((e) => isEligible(e, { now }))
      .map((e) => ({ event: e, cta: eventTicketCta(e.event_id, { surface: SURFACE }) }))
      .filter((x) => Boolean(x.cta))
      .sort((a, b) => String(a.event.start_date || "").localeCompare(String(b.event.start_date || "")));
    return { ok: true, items };
  } catch (err) {
    // A failed curated-events read must not take the whole landing page
    // down. isFloridaEvent/isEligible/eventTicketCta already run entirely
    // off the row shape and the static EVENT_TICKET_DEALS registry, so the
    // only thing that can throw here is the Supabase read itself.
    return { ok: false, items: [] };
  }
}

const COAST_ART = guideHero("siesta-key-vs-lido-key");

function PhotoCredit({ art }) {
  if (!art?.src) return null;
  return <span className={styles.credit}>
    <PhotoCreditLink href={art.source}>{art.credit}</PhotoCreditLink> · <PhotoCreditLink href={art.licenseUrl}>{art.license}</PhotoCreditLink> · Cropped for display
  </span>;
}

function Collection({ children, label, preview = 5 }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : [children];
  return <>
    <div className={styles.grid}>{items.slice(0, preview)}</div>
    {items.length > preview ? <details className={styles.collection}>
      <summary><span>{`Explore all ${items.length} ${label}`}</span><span className={styles.expand} aria-hidden="true">+</span></summary>
      <div className={styles.grid}>{items.slice(preview)}</div>
    </details> : null}
  </>;
}

function SectionHead({ eyebrow, title, intro, titleNote }) {
  return <div className={styles.sectionHead}>
    {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
    <h2 title={titleNote}>{title}</h2>
    {intro ? <p className={styles.intro}>{intro}</p> : null}
  </div>;
}

function GuideCard({ slug, title, blurb, rank }) {
  if (!GUIDES[slug]) return null;
  const art = guideHero(slug);
  return <article className={`${styles.guideCard} ${styles.photoGuideCard}`}>
    {art?.src ? <figure className={styles.cardFigure}><div className={styles.media}><LicensedPhoto {...art} sizes="(max-width:700px) 100vw, 400px" className={styles.offerImage} /></div><figcaption className={styles.cardCaption}>{art.cardCaption || art.caption} {art.source ? <PhotoCredit art={art} /> : null}</figcaption></figure> : null}
    <div className={styles.cardBody}>
    {rank ? <span className={styles.rank} aria-label={"Reader rank " + rank}>{String(rank).padStart(2, "0")}</span> : <span className={styles.editorialLabel}>The local guide</span>}
    <h3><a href={"/guides/" + slug}>{title}</a></h3>
    <p>{blurb}</p>
    <a className={styles.textLink} href={"/guides/" + slug}>Read the guide <span aria-hidden="true">↗</span></a>
    </div>
  </article>;
}

function GuideGrid({ items, ranked = false }) {
  return <Collection label="guides">{liveGuides(items).map((g, i) => <GuideCard key={g.slug} {...g} rank={ranked ? i + 1 : null} />)}</Collection>;
}

function OfferImage({ offer, caption }) {
  const selectedPhoto = FLORIDA_PARK_PHOTOS[offer.offerId];
  // Brand marks stay identifiable as marks, rather than pretending to be venue photos.
  const isLogo = /logo|LECOM_Park\.PNG/i.test(offer.image || "");
  const src = selectedPhoto?.src || (isHotlinkRefusedImage(offer.image) ? null : landingOfferImage(offer.image));
  return <div className={styles.media}>
    <GuidePhoto src={src} alt={selectedPhoto?.alt || (isLogo ? offer.title + " logo" : offer.title)}
      loading="lazy" width={640} height={400}
      className={isLogo ? styles.logoImage : styles.offerImage}
      fallbackClassName={styles.photoFallback} fallbackText={offer.title + " · " + offer.market} />
    {isLogo ? <span className={styles.mediaLabel}>Venue identity</span> : null}
    {caption ? <div className={styles.photoCaption}>{caption}</div> : null}
  </div>;
}

function OfferCard({ offer, ctaLabel, contentPrefix }) {
  const href = commerceHref({ provider: offer.provider, offerId: offer.offerId, surface: SURFACE, contentId: contentPrefix + "-" + offer.offerId });
  if (!href) return null;
  return <article className={styles.offerCard}>
    <OfferImage offer={offer} />
    <div className={styles.cardBody}>
      <p className={styles.meta}>{offer.market}</p>
      <h3>{offer.title}</h3>
      <p className={styles.cardBlurb}>{offerContext(offer)}</p>
      <div className={styles.cardActionRow}>
        <a className={styles.cardAction} href={href} rel="sponsored noopener" target="_blank">{ctaLabel}<span className={styles.srOnly}> for {offer.title}, opens a new tab</span></a>
        <span className={styles.seller}>via {providerLabel(offer.provider)}</span>
      </div>
    </div>
  </article>;
}

function SearchIntentCard({ item }) {
  const href = experienceGoUrl(item.query, item.city, item.kind, null, { surface: SURFACE, contentId: "florida-nature-" + item.id });
  const art = floridaSearchPhoto(item);
  if (!href) return null;
  return <article className={styles.offerCard}>
    {art?.src ? <figure className={styles.cardFigure}><div className={styles.media}><GuidePhoto {...art} loading="lazy" className={styles.offerImage} fallbackClassName={styles.photoFallback} fallbackText={item.title} /></div><figcaption className={styles.cardCaption}>{art.cardCaption || art.caption} {art.source ? <PhotoCredit art={art} /> : art.credit}</figcaption></figure> : null}
    <div className={styles.cardBody}><p className={styles.meta}>{item.city}</p><h3>{item.title}</h3><p className={styles.cardBlurb}>{item.blurb}</p>
      <span className={styles.editorialLabel}>Compare tour options</span>
      <a className={styles.textLink} href={href} rel="sponsored noopener" target="_blank">{AVAILABILITY_CTA_LABEL}<span className={styles.srOnly}> for {item.title}, opens a new tab</span></a>
    </div>
  </article>;
}

function BoatRentalChoices({ offers }) {
  if (!offers.length) return null;
  return <aside className={styles.rentalChoices}><div className={styles.rentalContent}><div><p className={styles.eyebrow}>Choose your departure city</p><h3>Rent a boat for your own kind of day</h3><p>Compare local boats, captained trips and rental requirements with SamBoat.</p></div><nav aria-label="Boat rental cities">{offers.map((offer) => <a key={offer.offerId} className={styles.textLink} href={commerceHref({ provider: offer.provider, offerId: offer.offerId, surface: SURFACE, contentId: "florida-nature-" + offer.offerId })} rel="sponsored noopener" target="_blank">{offer.market} ↗<span className={styles.srOnly}> boat rentals, opens a new tab</span></a>)}</nav></div></aside>;
}

function EventCard({ event, cta }) {
  const art = floridaEventPhoto(event);
  return <article className={`${styles.guideCard} ${styles.photoGuideCard}`} data-event-id={event.event_id}>
    {art?.src ? <figure className={styles.cardFigure}><div className={styles.media}><GuidePhoto {...art} loading="lazy" className={styles.offerImage} fallbackClassName={styles.photoFallback} fallbackText={event.event_name} /></div>{art.caption ? <figcaption className={styles.cardCaption}>{art.caption} {art.source ? <PhotoCredit art={art} /> : art.credit}</figcaption> : null}</figure> : null}
    <div className={styles.cardBody}>
    <p className={styles.meta}>{dateRangeLabel(event)} · {event.city}</p>
    <h3>{event.event_name}</h3>
    {event.card_hook ? <p>{event.card_hook}</p> : null}
    <a className={styles.textLink} href={cta.href} rel="sponsored noopener" target="_blank">{cta.label}<span className={styles.srOnly}> for {event.event_name}, opens a new tab</span></a>
    </div>
  </article>;
}

function HotSection() {
  return <section id="hot" className={styles.section}>
    <SectionHead title={HOT_SNAPSHOT_HEADING} titleNote={HOT_SNAPSHOT_LABEL} />
    <GuideGrid items={HOT_GUIDES} ranked />
  </section>;
}

async function HalloweenSection() {
  const { ok, items } = await loadHalloweenEvents();
  return <section id="halloween" className={`${styles.section} ${styles.season}`}>
    <SectionHead eyebrow="Make a seasonal plan" title={HALLOWEEN_HEADING} intro={HALLOWEEN_INTRO} />
    {ok && items.length ? <Collection label="seasonal events">{items.map(({ event, cta }) => <EventCard key={event.event_id} event={event} cta={cta} />)}</Collection>
      : <p className={styles.empty}>{!ok ? "Event listings are temporarily unavailable here. " : ""}{HALLOWEEN_FALLBACK_TEXT}</p>}
    <a className={styles.textLink} href={HALLOWEEN_ALL_EVENTS_HREF}>{HALLOWEEN_ALL_EVENTS_LABEL} <span aria-hidden="true">↗</span></a>
  </section>;
}

// THEME_PARK_OFFERS is MENU_PARTNER_OFFERS filtered to "attractions:
// themeparks" - a hand-verified, same-venue-photo registry that has no Walt
// Disney World row (see lib/paidFloridaLanding.js's THEME_PARK_OFFERS
// comment: Disney sells nothing through any registered Florida theme-park
// partner and no substitute photo has been HEAD-verified). Disney DOES have
// a real, resolver-backed ticket
// path - lib/placePartnerPicks.js pick "5" (Undercover Tourist) - it simply
// never reached this specific carousel. ThemeParkRail reads every park
// through that same resolver, Disney included, off owned inventory rather
// than the photo-gated registry above, so this is the one Florida-wide
// surface where every major park (Disney and Universal both) shows a
// ticket path.
//
// NOTE for the next editor: do not wrap this comment, or any new one placed
// inside OrlandoSection's JSX below, in a block-comment delimiter pair. This
// file has a latent landmine at its own top-of-file comment describing the
// commerce redirect path (search this file for "go path on this origin") -
// that line-comment text contains an unmatched block-comment OPENER with no
// closer of its own (harmless on its own). The instant a real block comment
// (JSX curly-brace or otherwise) exists anywhere later in this file,
// scripts/check-lib-call-imports.mjs's naive comment-stripping regex latches
// its lazy match onto that later closer instead, and everything in between,
// every import statement included, reads as commented out - which is how
// this guard once falsely reported orderedSections and activeSeasonalMark as
// unimported. Keep documentation here as double-slash line comments, exactly
// as this note is written, with no block-comment delimiter characters
// anywhere in the text, to avoid retriggering it.
function OrlandoSection() {
  return <section id="orlando" className={styles.section}>
    <SectionHead eyebrow="Make a day of it" title={ORLANDO_HEADING} intro={ORLANDO_INTRO} />
    <Collection label="park experiences">{THEME_PARK_OFFERS.map((o) => <OfferCard key={o.offerId} offer={o} ctaLabel={TICKET_CTA_LABEL} contentPrefix="florida-orlando" />)}</Collection>
    <ThemeParkRail mode="flagship" />
  </section>;
}

function NatureSection() {
  return <section id="nature" className={styles.section}>
    <SectionHead eyebrow="Take the scenic route" title={NATURE_HEADING} intro={NATURE_INTRO} />
    <Collection label="outdoor experiences">{[
      ...VIATOR_SEARCH_INTENTS.map((item) => <SearchIntentCard key={item.id} item={item} />),
      ...NATURE_OFFERS.filter((o) => o.provider !== "awin_samboat").map((o) => <OfferCard key={o.offerId} offer={o} ctaLabel={AVAILABILITY_CTA_LABEL} contentPrefix="florida-nature" />),
    ]}</Collection>
    <BoatRentalChoices offers={NATURE_OFFERS.filter((o) => o.provider === "awin_samboat")} />
  </section>;
}

function ShowsSection() {
  return <section id="shows" className={styles.section}>
    <SectionHead eyebrow="After the sun goes down" title={SHOWS_HEADING} intro={SHOWS_INTRO} />
    <Collection label="venues">{SHOW_OFFERS.map((o) => <OfferCard key={o.offerId} offer={o} ctaLabel={TICKET_CTA_LABEL} contentPrefix="florida-shows" />)}</Collection>
  </section>;
}

function StaysSection() {
  const g = GUIDES[STAYS_GUIDE_SLUG];
  return <section id="stays" className={`${styles.section} ${styles.stay}`}>
    <SectionHead eyebrow="Stay a little longer" title={STAYS_HEADING} intro={STAYS_INTRO} />
    {g ? <div className={styles.stayGuide}><h3>{STAYS_GUIDE_TITLE}</h3><p>{g.description}</p><a className={styles.textLink} href={"/guides/" + STAYS_GUIDE_SLUG}>Compare the places to stay <span aria-hidden="true">↗</span></a></div> : null}
  </section>;
}

function GulfCoastSection() {
  return <section id="gulf-coast" className={styles.section}>
    <div className={styles.coastIntro}>
      <SectionHead eyebrow="Follow the Gulf" title={GULF_COAST_HEADING} intro={GULF_COAST_INTRO} />
      <figure className={styles.coastFigure}>
        <GuidePhoto src={COAST_ART.src} alt={COAST_ART.alt} width={COAST_ART.width} height={COAST_ART.height} loading="lazy" className={styles.coastPhoto} fallbackClassName={styles.photoFallback} fallbackText="Explore the Gulf Coast" />
        <figcaption>Lido Key Beach, Sarasota. <PhotoCredit art={COAST_ART} /></figcaption>
      </figure>
    </div>
    <GuideGrid items={GULF_COAST_GUIDES} />
  </section>;
}

const SECTION_RENDERERS = { hot: HotSection, halloween: HalloweenSection, orlando: OrlandoSection, nature: NatureSection, shows: ShowsSection, stays: StaysSection, "gulf-coast": GulfCoastSection };

export default async function GoFloridaPage({ searchParams }) {
  const params = await searchParams;
  const focus = (params && params.focus) || "";
  const order = orderedSections(focus);
  const mark = activeSeasonalMark() || NORMAL_MARK;
  return <main id="go-florida" className={styles.page}>
    <CommerceClickBeacon surface={SURFACE} />
    <div className={styles.opening}>
    <header className={styles.header}>
      <a href="/" aria-label="Wayfind home"><img className={styles.wordmark} src={mark.png} alt="Wayfind" width={mark.width} height={mark.height} /></a>
      <nav aria-label="Florida navigation"><a href="#experiences">Activities</a><a href="#hot">Guides</a><a href="#halloween">Events</a><a href="#shows">Nights out</a><a className={styles.headerAction} href="/">Find an outing <span aria-hidden="true">↗</span></a></nav>
    </header>
    <div className={styles.hero}>
      <div className={styles.heroCopy}>
        <p className={styles.eyebrow}>{HERO.kicker}</p>
        <h1>Less searching.<br />More <em>Florida.</em></h1>
        <p className={styles.heroSub}>{HERO.sub}</p>
        <div className={styles.heroActions}><a className={styles.primary} href={HERO.primaryHref}>{HERO.primaryLabel} <span aria-hidden="true">↗</span></a><a className={styles.textLink} href={HERO.secondaryHref}>{HERO.secondaryLabel} <span aria-hidden="true">↓</span></a></div>
        <p className={styles.disclosure}>{DISCLOSURE}</p>
      </div>
      <figure className={styles.heroFigure}><div className={styles.heroMedia}><LicensedPhoto {...SPRINGS_PHOTO} sizes="(max-width:700px) 100vw, 50vw" priority className={styles.heroPhoto} /></div><figcaption>{SPRINGS_PHOTO.caption}</figcaption></figure>
    </div>
    </div>
    <FloridaSections sections={[
      { id: 'experiences', label: 'Top experiences', title: 'Top experiences', content: <ExperienceCatalog /> },
      ...order.map(key => ({ id: key, title: ({ hot: HOT_SNAPSHOT_HEADING, halloween: HALLOWEEN_HEADING, orlando: ORLANDO_HEADING, nature: NATURE_HEADING, shows: SHOWS_HEADING, stays: STAYS_HEADING, 'gulf-coast': GULF_COAST_HEADING })[key], label: ({ hot: 'Popular guides', halloween: 'Fall events', orlando: 'Park tickets', nature: 'On the water', shows: 'Nights out', stays: 'Stays', 'gulf-coast': 'Gulf Coast' })[key], content: SECTION_RENDERERS[key] ? React.createElement(SECTION_RENDERERS[key]) : null })),
    ]} />
    <footer className={styles.footer}>
      <div className={styles.trust}><div><p className={styles.eyebrow}>Know before you go</p><h2>A little local knowledge goes a long way.</h2></div><div><p>Guides for the details that matter. Booking options when you are ready. Clear labels so you know where every link takes you.</p><p>{DISCLOSURE}</p><a href="/editorial-policy">Our editorial approach ↗</a></div></div>
      <nav className={styles.footerLinks} aria-label="More from Wayfind">{FOOTER_LINKS.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}</nav>
      <div className={styles.footerBottom}><a href="/">Wayfind</a><span>Make time for a good day.</span><nav aria-label="Legal and company"><a href="/about">About</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav></div>
    </footer>
  </main>;
}
