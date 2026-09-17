// app/go/florida/page.js — /go/florida, the paid landing page for Florida
// Google Ads campaigns (Search + YouTube). A STATIC route, deliberately, so
// it takes precedence over the dynamic app/go/[city]/page.js segment — this
// is a statewide page, not a city, and it never resolves through
// lib/goShortlinks.resolveGoSlug. "florida" is still reserved in that
// module's RESERVED_GO_SLUGS (see lib/goShortlinks.js) so a future social
// shortlink can never be registered under a slug this static page already
// owns, even though it would never actually be reached.
//
// SERVER COMPONENT, NO CLIENT JS. Every interactive-looking thing here (the
// ?focus= section reorder, every outbound link) is plain HTML — an anchor
// tag and a server-side reorder of which <section> renders first. There is
// no "use client" anywhere in this route's own files.
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
import { unstable_cache } from "next/cache";
import { SITE_URL } from "../../../lib/site";
import { GUIDES } from "../../../lib/guides";
import { commerceHref } from "../../../lib/commerce";
import {
  fetchCuratedEvents,
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
};

// The curated-events read, cached the SAME way app/florida-events/page.js
// caches it: `fresh: true` so this landing page never serves a stale Data
// Cache entry shared with another route (see lib/curatedEvents.js's own
// "THE LIVE READER" note), wrapped in unstable_cache so the ?focus= search
// param making this page dynamic does not turn into a Supabase read on
// every single request.
const fetchLandingEvents = unstable_cache(
  () => fetchCuratedEvents({ fresh: true, signal: AbortSignal.timeout(8000) }),
  ["go-florida-landing-events-v1"],
  { revalidate: 3600, tags: ["curated-events"] },
);

async function loadHalloweenEvents() {
  try {
    const rows = await fetchLandingEvents();
    const now = new Date();
    const items = (Array.isArray(rows) ? rows : [])
      .filter(isFloridaEvent)
      .filter((e) => isEligible(e, { now }))
      .map((e) => ({ event: e, cta: eventTicketCta(e.event_id, { surface: SURFACE }) }))
      .filter((x) => Boolean(x.cta))
      .sort((a, b) => String(a.event.start_date || "").localeCompare(String(b.event.start_date || "")))
      .slice(0, 6);
    return { ok: true, items };
  } catch (err) {
    // A failed curated-events read must not take the whole landing page
    // down. isFloridaEvent/isEligible/eventTicketCta already run entirely
    // off the row shape and the static EVENT_TICKET_DEALS registry, so the
    // only thing that can throw here is the Supabase read itself.
    return { ok: false, items: [] };
  }
}

const C = {
  bg: "#0A0F17",
  panel: "#111827",
  border: "#1F2937",
  ink: "#F8FAFC",
  sub: "#94A3B8",
  accent: "#FF8A3D",
  accent2: "#F97316",
};

const S = {
  page: { background: C.bg, color: C.ink, fontFamily: "var(--wf-sans)", lineHeight: 1.6 },
  hero: { padding: "40px 16px 28px", textAlign: "center" },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", color: C.accent },
  h1: { fontSize: 32, lineHeight: 1.15, margin: "12px 0 10px", fontWeight: 900, color: "#FFFFFF" },
  sub: { fontSize: 16.5, color: C.sub, maxWidth: 620, margin: "0 auto 22px" },
  ctaRow: { display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", marginBottom: 18 },
  btnPrimary: { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 44, padding: "13px 26px", borderRadius: 999, background: C.accent2, color: "#0A0F17", fontWeight: 800, fontSize: 15.5, textDecoration: "none" },
  btnSecondary: { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 44, padding: "13px 26px", borderRadius: 999, background: "transparent", color: C.ink, fontWeight: 800, fontSize: 15.5, textDecoration: "none", border: `1px solid ${C.border}` },
  disclosure: { fontSize: 12.5, color: C.sub, maxWidth: 560, margin: "0 auto" },
  section: { padding: "34px 16px" },
  sectionHead: { maxWidth: 980, margin: "0 auto 16px" },
  h2: { fontSize: 22, fontWeight: 900, color: "#FFFFFF", margin: 0 },
  intro: { fontSize: 14.5, color: C.sub, margin: "6px 0 0", maxWidth: 640 },
  grid: { maxWidth: 980, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 14 },
  card: { display: "flex", flexDirection: "column", borderRadius: 14, background: C.panel, border: `1px solid ${C.border}`, overflow: "hidden" },
  cardBody: { padding: "14px 16px 16px", display: "flex", flexDirection: "column", flexGrow: 1 },
  cardTitle: { fontSize: 16, fontWeight: 800, color: "#FFFFFF", margin: 0 },
  cardBlurb: { fontSize: 13.5, color: C.sub, margin: "6px 0 0", flexGrow: 1 },
  cardMeta: { fontSize: 12, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase", color: C.accent, margin: "0 0 4px" },
  imgWrap: { position: "relative", width: "100%", aspectRatio: "16 / 9", background: "#0D1117" },
  img: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  imgFallback: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(145deg,#1B2433,#0E1520)", color: "#8ED6C4", fontSize: 30, fontWeight: 800 },
  cardLinkRow: { marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cardAction: { display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 44, padding: "10px 16px", borderRadius: 10, background: C.accent2, color: "#0A0F17", fontWeight: 800, fontSize: 13.5, textDecoration: "none" },
  seller: { fontSize: 11.5, color: C.sub, fontWeight: 700 },
  guideLink: { display: "inline-flex", alignItems: "center", gap: 4, minHeight: 44, color: C.accent, fontWeight: 800, fontSize: 13.5, textDecoration: "none", marginTop: 12 },
  allWrap: { maxWidth: 980, margin: "14px auto 0" },
  allLink: { display: "inline-flex", alignItems: "center", minHeight: 44, color: C.accent, fontWeight: 800, fontSize: 14, textDecoration: "none" },
  fallback: { maxWidth: 980, margin: "0 auto", padding: "16px", borderRadius: 12, background: C.panel, border: `1px solid ${C.border}`, color: C.sub, fontSize: 14 },
  footer: { padding: "36px 16px 56px", borderTop: `1px solid ${C.border}` },
  footerWrap: { maxWidth: 980, margin: "0 auto" },
  footerDisclosure: { fontSize: 13, color: C.sub, marginBottom: 16 },
  footerLinks: { display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 20 },
  footerLink: { color: C.sub, fontSize: 13.5, textDecoration: "none", fontWeight: 700 },
};

function GuideCard({ slug, title, blurb }) {
  // Existence is checked in GuideGrid (liveGuides) before this ever renders;
  // this is just the safety net so a bad call site fails silent, not loud.
  if (!GUIDES[slug]) return null;
  return (
    <article style={S.card}>
      <div style={S.cardBody}>
        <h3 style={S.cardTitle}>{title}</h3>
        <p style={S.cardBlurb}>{blurb}</p>
        <a style={S.guideLink} href={"/guides/" + slug}>
          Read the guide <span aria-hidden="true">↗</span>
        </a>
      </div>
    </article>
  );
}

function GuideGrid({ items }) {
  const live = liveGuides(items);
  if (!live.length) return null;
  return (
    <div className="gf-rail" style={S.grid}>
      {live.map((g) => (
        <GuideCard key={g.slug} slug={g.slug} title={g.title} blurb={g.blurb} />
      ))}
    </div>
  );
}

function OfferImage({ offer }) {
  const refused = isHotlinkRefusedImage(offer.image);
  if (!offer.image || refused) {
    return (
      <div style={S.imgFallback} aria-hidden="true">
        {(offer.venue || offer.title || "?").trim().charAt(0)}
      </div>
    );
  }
  return <img src={offer.image} alt={offer.title} loading="lazy" decoding="async" style={S.img} />;
}

function OfferCard({ offer, ctaLabel, contentPrefix }) {
  const href = commerceHref({
    provider: offer.provider,
    offerId: offer.offerId,
    surface: SURFACE,
    contentId: contentPrefix + "-" + offer.offerId,
  });
  if (!href) return null;
  return (
    <article style={S.card}>
      <div style={S.imgWrap}>
        <OfferImage offer={offer} />
      </div>
      <div style={S.cardBody}>
        <p style={S.cardMeta}>{offer.market}</p>
        <h3 style={S.cardTitle}>{offer.title}</h3>
        <div style={S.cardLinkRow}>
          <a style={S.cardAction} href={href} rel="sponsored noopener" target="_blank">
            {ctaLabel}
          </a>
          <span style={S.seller}>via {providerLabel(offer.provider)}</span>
        </div>
      </div>
    </article>
  );
}

function SearchIntentCard({ item }) {
  const href = experienceGoUrl(item.query, item.city, item.kind, null, {
    surface: SURFACE,
    contentId: "florida-nature-" + item.id,
  });
  if (!href) return null;
  return (
    <article style={S.card}>
      <div style={S.cardBody}>
        <p style={S.cardMeta}>{item.city}</p>
        <h3 style={S.cardTitle}>{item.title}</h3>
        <p style={S.cardBlurb}>{item.blurb}</p>
        <div style={S.cardLinkRow}>
          <a style={S.cardAction} href={href} rel="sponsored noopener" target="_blank">
            {AVAILABILITY_CTA_LABEL}
          </a>
        </div>
      </div>
    </article>
  );
}

function EventCard({ event, cta }) {
  return (
    <article style={S.card}>
      <div style={S.cardBody}>
        <p style={S.cardMeta}>{dateRangeLabel(event)} &middot; {event.city}</p>
        <h3 style={S.cardTitle}>{event.event_name}</h3>
        {event.card_hook ? <p style={S.cardBlurb}>{event.card_hook}</p> : null}
        <div style={S.cardLinkRow}>
          <a style={S.cardAction} href={cta.href} rel="sponsored noopener" target="_blank">
            {cta.label}
          </a>
        </div>
      </div>
    </article>
  );
}

function HotSection() {
  return (
    <section id="hot" style={S.section}>
      <div style={S.sectionHead}>
        <h2 style={S.h2}>{HOT_SNAPSHOT_HEADING}</h2>
        <p style={S.intro}>A dated snapshot of the Florida guides Wayfind readers actually opened. Not a paid placement.</p>
      </div>
      <GuideGrid items={HOT_GUIDES} />
    </section>
  );
}

async function HalloweenSection() {
  const { ok, items } = await loadHalloweenEvents();
  return (
    <section id="halloween" style={S.section}>
      <div style={S.sectionHead}>
        <h2 style={S.h2}>{HALLOWEEN_HEADING}</h2>
        <p style={S.intro}>{HALLOWEEN_INTRO}</p>
      </div>
      {ok && items.length ? (
        <div className="gf-rail" style={S.grid}>
          {items.map(({ event, cta }) => (
            <EventCard key={event.event_id} event={event} cta={cta} />
          ))}
        </div>
      ) : (
        <p style={S.fallback}>{HALLOWEEN_FALLBACK_TEXT}</p>
      )}
      <div style={S.allWrap}>
        <a style={S.allLink} href={HALLOWEEN_ALL_EVENTS_HREF}>
          {HALLOWEEN_ALL_EVENTS_LABEL} <span aria-hidden="true">↗</span>
        </a>
      </div>
    </section>
  );
}

function OrlandoSection() {
  return (
    <section id="orlando" style={S.section}>
      <div style={S.sectionHead}>
        <h2 style={S.h2}>{ORLANDO_HEADING}</h2>
        <p style={S.intro}>{ORLANDO_INTRO}</p>
      </div>
      <div className="gf-rail" style={S.grid}>
        {THEME_PARK_OFFERS.slice(0, 9).map((o) => (
          <OfferCard key={o.offerId} offer={o} ctaLabel={TICKET_CTA_LABEL} contentPrefix="florida-orlando" />
        ))}
      </div>
    </section>
  );
}

function NatureSection() {
  return (
    <section id="nature" style={S.section}>
      <div style={S.sectionHead}>
        <h2 style={S.h2}>{NATURE_HEADING}</h2>
        <p style={S.intro}>{NATURE_INTRO}</p>
      </div>
      <div className="gf-rail" style={S.grid}>
        {NATURE_OFFERS.slice(0, 8).map((o) => (
          <OfferCard key={o.offerId} offer={o} ctaLabel={AVAILABILITY_CTA_LABEL} contentPrefix="florida-nature" />
        ))}
        {VIATOR_SEARCH_INTENTS.map((item) => (
          <SearchIntentCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

function ShowsSection() {
  return (
    <section id="shows" style={S.section}>
      <div style={S.sectionHead}>
        <h2 style={S.h2}>{SHOWS_HEADING}</h2>
        <p style={S.intro}>{SHOWS_INTRO}</p>
      </div>
      <div className="gf-rail" style={S.grid}>
        {SHOW_OFFERS.slice(0, 10).map((o) => (
          <OfferCard key={o.offerId} offer={o} ctaLabel={TICKET_CTA_LABEL} contentPrefix="florida-shows" />
        ))}
      </div>
    </section>
  );
}

function StaysSection() {
  const g = GUIDES[STAYS_GUIDE_SLUG];
  return (
    <section id="stays" style={S.section}>
      <div style={S.sectionHead}>
        <h2 style={S.h2}>{STAYS_HEADING}</h2>
        <p style={S.intro}>{STAYS_INTRO}</p>
      </div>
      {g ? (
        <div className="gf-rail" style={S.grid}>
          <article style={S.card}>
            <div style={S.cardBody}>
              <h3 style={S.cardTitle}>{STAYS_GUIDE_TITLE}</h3>
              <p style={S.cardBlurb}>{g.description}</p>
              <a style={S.guideLink} href={"/guides/" + STAYS_GUIDE_SLUG}>
                Read the guide <span aria-hidden="true">↗</span>
              </a>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}

function GulfCoastSection() {
  return (
    <section id="gulf-coast" style={S.section}>
      <div style={S.sectionHead}>
        <h2 style={S.h2}>{GULF_COAST_HEADING}</h2>
        <p style={S.intro}>{GULF_COAST_INTRO}</p>
      </div>
      <GuideGrid items={GULF_COAST_GUIDES} />
    </section>
  );
}

const SECTION_RENDERERS = {
  hot: HotSection,
  halloween: HalloweenSection,
  orlando: OrlandoSection,
  nature: NatureSection,
  shows: ShowsSection,
  stays: StaysSection,
  "gulf-coast": GulfCoastSection,
};

// Visible focus for keyboard users: inline styles cannot express
// :focus-visible, and the page ships no other stylesheet. A raw-text style
// element child is a hydration trap the moment its CSS contains a quote (SSR
// escapes quotes in text children; that element never decodes them back), so
// this renders via dangerouslySetInnerHTML instead — see
// scripts/check-hydration-style.mjs.
const FOCUS_RING_CSS = `#go-florida a:focus-visible, #go-florida button:focus-visible { outline: 3px solid ${C.accent}; outline-offset: 2px; }
@media (max-width: 640px) {
  #go-florida .gf-rail { display: flex !important; overflow-x: auto; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; padding-bottom: 8px; }
  #go-florida .gf-rail > article { flex: 0 0 80%; scroll-snap-align: start; }
}`;

export default async function GoFloridaPage({ searchParams }) {
  const focus = (searchParams && searchParams.focus) || "";
  const order = orderedSections(focus);

  return (
    <main style={S.page}>
      <style dangerouslySetInnerHTML={{ __html: FOCUS_RING_CSS }} />
      <div id="go-florida">
        <div style={S.hero}>
          <div style={S.kicker}>{HERO.kicker}</div>
          <h1 style={S.h1}>{HERO.h1}</h1>
          <p style={S.sub}>{HERO.sub}</p>
          <div style={S.ctaRow}>
            <a style={S.btnPrimary} href={HERO.primaryHref}>{HERO.primaryLabel}</a>
            <a style={S.btnSecondary} href={HERO.secondaryHref}>{HERO.secondaryLabel}</a>
          </div>
          <p style={S.disclosure}>{DISCLOSURE}</p>
        </div>

        {order.map((key) => {
          const Section = SECTION_RENDERERS[key];
          return Section ? <Section key={key} /> : null;
        })}

        <footer style={S.footer}>
          <div style={S.footerWrap}>
            <p style={S.footerDisclosure}>{DISCLOSURE}</p>
            <nav style={S.footerLinks} aria-label="More from Wayfind">
              {FOOTER_LINKS.map((l) => (
                <a key={l.href} style={S.footerLink} href={l.href}>{l.label}</a>
              ))}
            </nav>
            <a style={S.btnPrimary} href="/">{HERO.primaryLabel}</a>
          </div>
        </footer>
      </div>
    </main>
  );
}
