// lib/sponsorPage.js — SERVER-ONLY JSX for /partners and /partners/[slug].
//
// WHY A PAID CARD NEEDS A PAGE (owner, 2026-08-23: "make sure this is featured
// and easy to find"). The in-app card is hard-gated to 15 miles around the
// advertiser's own front door, which is correct and is also its limit: it can
// only ever reach someone who already has Wayfind open, standing in Gaston
// County. This page has no gate. It is a permanent, crawlable URL that answers
// "brazilian wax gastonia" for anyone, from anywhere, long after a campaign
// window closes — and it is the link the business can put in its own bio, on a
// card at the desk, or behind a QR code.
//
// THE RULE THAT KEEPS IT FROM POISONING THE DOMAIN. A thin page does not rank,
// and a site that publishes thin pages FOR MONEY stops ranking for everything
// else too. sponsorHasPage() is the floor: a lede, at least two real paragraphs
// and at least three real services, or there is no page and no sitemap entry.
// Everything this page renders is the advertiser's own published material or
// their own Google record — nothing was written to fill a section.
//
// WHAT IS DELIBERATELY ABSENT
//   • aggregateRating in the JSON-LD. /places/[id] carries it, but this page is
//     PAID, and Google's structured-data policy is that aggregate ratings
//     should be ones the site itself collected. Borrowed stars in the schema of
//     a page someone bought is the exact combination worth not defending. The
//     rating is SHOWN only while the Google snapshot is inside 30 days, and
//     attributed to Google in words. Past that window the page names the
//     Wayfind Score and says it is withheld. It never prints a number the
//     snapshot can no longer support.
//   • Opening hours. Google and the brand's own book-now page disagreed on
//     2026-08-23. The page says hours vary and sends people to the live
//     calendar, which is both honest and the higher-converting move.
//   • The "not affiliated with the places listed" line every /places page
//     carries. On a paid page that sentence would be false, so this page
//     carries its own disclosure instead, twice.
// No `notFound` import on purpose — lib/creatorPages.js does the same thing for
// the same two reasons. `dynamicParams = false` on the route already turns an
// unknown slug into a real 404 before this function is ever called, and keeping
// next/navigation out of this module is what lets the guard render the page in
// plain node instead of asserting against source text.
import { SITE_URL } from "./site";
import { pageShareUrl } from "./pageShareUrl";
import ShareButton from "../app/components/ShareButton";
import SafeImg from "../app/components/SafeImg";
import {
  PartnersFunnelBeacon,
  PartnerSectionJumpLink,
  PartnerLiveExampleLink,
  PartnerInquiryLink,
  PartnerEmailFallback,
  PartnerOutboundLink,
} from "../app/components/PartnerInquiryControls";
import { siteTodayStr } from "./siteTime.js";
import { COVERED_CITIES } from "./landingCities.js";
import { GUIDES } from "./guides.js";
import { currentGuides } from "./guideLifecycle.js";
import {
  SPONSORED_PLACES,
  sponsorBySlug,
  sponsorHasPage,
  sponsoredHref,
  partnerOutboundHref,
  sponsoredIsLive,
  sponsoredPublicScore,
  sponsoredSnapshotFresh,
} from "./sponsoredPlaces.js";
import { styleHtml } from "./styleHtml.js";

const FONT = "var(--wf-sans), system-ui, -apple-system, sans-serif";

// Verified live counts derived directly from the repository's own registries —
// never hardcoded vanity guesses.
export const VERIFIED_FLORIDA_CITY_COUNT = Object.values(COVERED_CITIES).filter(
  (c) => c && c.state === "FL"
).length;
export const VERIFIED_LIVE_GUIDE_COUNT = Object.keys(currentGuides(GUIDES)).length;

const S = {
  wrap: { maxWidth: 720, margin: "0 auto", padding: "22px 18px 72px", color: "#F1F5F9", fontFamily: FONT },
  crumb: { fontSize: 12.5, color: "#94A3B8", marginBottom: 16 },
  crumbLink: { color: "#94A3B8", textDecoration: "none" },
  h1: { fontSize: 32, fontWeight: 800, lineHeight: 1.12, letterSpacing: "-0.7px", margin: "0 0 6px" },
  lede: { fontSize: 16.5, color: "#CBD5E1", lineHeight: 1.55, margin: "12px 0 0" },
  body: { fontSize: 15.5, color: "#E2E8F0", lineHeight: 1.65, margin: "0 0 14px" },
  hh: { fontSize: 11, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.8px", margin: "34px 0 12px" },
  disc: { fontSize: 11.5, color: "#6E7681", marginTop: 34, lineHeight: 1.6, borderTop: "1px solid #26303B", paddingTop: 16 },
};

function jsonLd(obj) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(obj) }} />;
}

const photoUrl = (s, w) => s.staticPhoto || (s.photoRef ? "/api/photo?ref=" + encodeURIComponent(s.photoRef) + "&g=2&w=" + w : null);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function reviewsAsOfLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!m) return "";
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}, ${m[1]}` : "";
}
const branchOf = (s) => {
  const parts = String(s.venueLine || "").split("·");
  return parts.length > 1 ? parts[parts.length - 1].trim() : "";
};

/* ── metadata ───────────────────────────────────────────────────────────── */

export function sponsorPageMetadata({ params }) {
  const s = sponsorBySlug(params && params.slug);
  if (!s) return { title: "Partner — Wayfind" };
  const url = `${SITE_URL}/partners/${s.id}`;
  const title = `${s.advertiser} ${branchOf(s)} — booking, services and reviews | Wayfind`;
  const description = s.page.lede;
  const img = photoUrl(s, 1200);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "article", images: img ? [{ url: SITE_URL + img }] : undefined },
    twitter: { card: "summary_large_image", title, description },
  };
}

export function partnersIndexMetadata() {
  const url = `${SITE_URL}/partners`;
  // NOT "<brand> partners" — lib/creatorRights.js bans that construction and
  // check-creator-rights.mjs fails the build on it. The badge is "Sponsored ·
  // Paid partner", which says money changed hands without claiming Wayfind
  // vouches for the business.
  // 2026-10-19 (owner): labeled sponsorships are real. This page names them,
  // says where the card sits, and keeps the rule that money never buys a
  // ranking, a list position, a guide pick, or a Wayfind Score.
  const title = "Partners on Wayfind — Florida Local Business Sponsorships & Direct Discovery";
  const description =
    "Put your Florida restaurant, charter, tour, studio, or venue in front of locals and visitors with 0% Wayfind commission on direct bookings. Rio Body Wax in Gastonia is a labeled sponsor. Rankings, list order, guide picks, and the Wayfind Score are never paid for, and affiliate commission never changes them. The label is Sponsored · Paid partner, and the card sits outside ranked lists.";
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url } };
}

/* ── the page ───────────────────────────────────────────────────────────── */

export function SponsorPage({ slug, today }) {
  const s = sponsorBySlug(slug);
  // Unreachable in production: dynamicParams=false means Next 404s an unknown
  // slug before this runs. Returning null rather than throwing keeps the guard
  // able to prove that too.
  if (!s) return null;

  const url = `${SITE_URL}/partners/${s.id}`;
  const branch = branchOf(s);
  const day = today || siteTodayStr();
  const score = sponsoredPublicScore(s, day);
  const showReviews = sponsoredSnapshotFresh(s, day);
  const book = sponsoredHref(s, "partner_page");
  const hero = photoUrl(s, 1200);
  const mapsHref =
    "https://www.google.com/maps/search/?api=1&query=" + s.lat + "%2C" + s.lng + (s.placeId ? "&query_place_id=" + s.placeId : "");
  const accent = s.accent || "#6D2E8E";
  const accentLight = s.accentLight || "#CBD5E1";
  const live = sponsoredIsLive(s);

  // LocalBusiness, without a borrowed aggregateRating — see the header note.
  const ld = {
    "@context": "https://schema.org",
    "@type": "HealthAndBeautyBusiness",
    "@id": url,
    name: s.advertiser + " " + branch,
    url,
    description: s.page.lede,
    address: s.address || undefined,
    telephone: s.phone || undefined,
    geo: { "@type": "GeoCoordinates", latitude: s.lat, longitude: s.lng },
    image: hero ? SITE_URL + hero : undefined,
    sameAs: s.href ? [s.href] : undefined,
  };
  const crumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Wayfind", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Partners", item: `${SITE_URL}/partners` },
      { "@type": "ListItem", position: 3, name: s.advertiser + " " + branch, item: url },
    ],
  };

  return (
    <div style={S.wrap} data-analytics-page="partner_page">
      {jsonLd(ld)}
      {jsonLd(crumb)}
      <nav style={S.crumb}>
        <a href="/" style={S.crumbLink}>Wayfind</a> › <a href="/partners" style={S.crumbLink}>Partners</a> › {s.advertiser}
      </nav>

      {/* HERO. The advertiser's colour appears as an edge and on the CTA, and
          nowhere else — the same restraint the in-app card uses. */}
      <div style={{ borderRadius: 18, overflow: "hidden", border: "1px solid #26303B", background: "#12161F" }}>
        <div aria-hidden="true" style={{ height: 4, background: `linear-gradient(90deg, ${accent} 0%, ${accentLight} 100%)` }} />
        <div style={{ position: "relative", width: "100%", aspectRatio: "16 / 9", background: "#10141d" }}>
          {hero ? (
            <SafeImg
              src={hero}
              alt={`${s.advertiser} in ${branch}`}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: s.photoPosition || "50% 50%" }}
            />
          ) : null}
          <div
            aria-hidden="true"
            style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(4,8,16,.70) 0%, rgba(4,8,16,0) 42%, rgba(4,8,16,.55) 100%)" }}
          />
          {/* DISCLOSURE #1 — before anything else on the page. */}
          <span
            style={{
              position: "absolute", top: 12, left: 12, fontSize: 10, fontWeight: 800, letterSpacing: "0.8px",
              textTransform: "uppercase", color: "#FFFFFF", background: "rgba(4,8,16,.74)",
              border: "1px solid rgba(255,255,255,.24)", borderRadius: 999, padding: "5px 11px",
            }}
          >
            {s.label}
          </span>
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        {s.person ? (
          <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.9px", textTransform: "uppercase", color: accentLight, marginBottom: 8 }}>
            {s.person.name}
            {s.person.full && s.person.full !== s.person.name ? ` (${s.person.full})` : ""}
            {s.person.role ? " · " + s.person.role : ""}
          </div>
        ) : null}
        <h1 style={S.h1}>
          {s.advertiser} <span style={{ color: "#94A3B8", fontWeight: 700 }}>{branch}</span>
        </h1>

        {/* The numbers, each labelled with whose number it is. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 12 }}>
          {score != null ? (
            <span
              style={{
                display: "inline-flex", alignItems: "baseline", gap: 6, background: "#12351F", border: "1px solid #1F6B3E",
                color: "#7BE8A8", borderRadius: 10, padding: "6px 11px", fontSize: 13.5, fontWeight: 800,
              }}
            >
              {(score / 10).toFixed(1)}
              <span style={{ fontSize: 10.5, fontWeight: 700, color: "#4FBF7F", letterSpacing: "0.4px" }}>WAYFIND SCORE</span>
            </span>
          ) : (
            <span style={{ fontSize: 13.5, fontWeight: 700, color: "#94A3B8" }}>Wayfind Score withheld</span>
          )}
          {showReviews && Number.isFinite(Number(s.rating)) && Number.isFinite(Number(s.reviews)) ? (
            <span style={{ fontSize: 13.5, color: "#CBD5E1" }}>
              <span style={{ color: "#FBBF24", fontWeight: 800 }}>{Number(s.rating).toFixed(1)}★</span>{" "}
              {Number(s.reviews).toLocaleString()} Google reviews
              {reviewsAsOfLabel(s.reviewsAsOf) ? `, as of ${reviewsAsOfLabel(s.reviewsAsOf)}` : ""}
            </span>
          ) : reviewsAsOfLabel(s.reviewsAsOf) ? (
            <span style={{ fontSize: 13.5, color: "#94A3B8" }}>
              Google review snapshot as of {reviewsAsOfLabel(s.reviewsAsOf)} is older than 30 days, so the stars are not shown.
            </span>
          ) : null}
        </div>

        <p style={S.lede}>{s.page.lede}</p>

        {/* THE ACTION. One filled button, the advertiser's own booking system. */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 22 }}>
          {live ? (
            <PartnerOutboundLink
              canonicalHref={book}
              trackHref={partnerOutboundHref(s, "partner_page")}
              sponsorId={s.id}
              medium="partner_page"
              style={{
                display: "inline-flex", alignItems: "center", gap: 9, minHeight: 50, padding: "13px 24px", borderRadius: 12,
                background: accent, color: "#FFFFFF", fontWeight: 800, fontSize: 15, textDecoration: "none",
                boxShadow: `0 8px 22px -10px ${accent}`,
              }}
            >
              {s.cta} <span aria-hidden="true">→</span>
            </PartnerOutboundLink>
          ) : null}
          {s.phone ? (
            <a
              href={"tel:" + s.phone}
              style={{
                display: "inline-flex", alignItems: "center", minHeight: 50, padding: "13px 20px", borderRadius: 12,
                background: "#161B22", border: "1px solid #26303B", color: "#F1F5F9", fontWeight: 700, fontSize: 14.5, textDecoration: "none",
              }}
            >
              Call the studio
            </a>
          ) : null}
          <ShareButton url={pageShareUrl("/partners/" + s.id)} title={`${s.advertiser} on Wayfind`}
            text={`${s.advertiser}${branch ? " " + branch : ""}. On Wayfind.`}
            label="Share" tone="dark" event="page_share" meta={{ surface: "partner_page", partner: s.id, placement: "actions" }} />
        </div>
        <div style={{ fontSize: 12, color: "#7C8797", marginTop: 10 }}>{s.page.hoursNote}</div>
      </div>

      <div style={S.hh}>About the studio</div>
      {s.page.about.map((para, i) => (
        <p key={i} style={S.body}>{para}</p>
      ))}

      {Array.isArray(s.page.waxes) && s.page.waxes.length ? (
        <>
          <div style={S.hh}>The four Brazilian formulas</div>
          <div style={{ display: "grid", gap: 10 }}>
            {s.page.waxes.map((w) => (
              <div key={w.name} style={{ border: "1px solid #26303B", background: "#12161F", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: "#F1F5F9", marginBottom: 3 }}>{w.name}</div>
                <div style={{ fontSize: 13.5, color: "#A9B4C4", lineHeight: 1.5 }}>{w.note}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11.5, color: "#6E7681", marginTop: 10, lineHeight: 1.55 }}>
            Formula descriptions are {s.advertiser}&rsquo;s own, from their published service menu.
          </p>
        </>
      ) : null}

      <div style={S.hh}>What they do</div>
      <ul style={{ margin: 0, padding: "0 0 0 18px", color: "#E2E8F0", fontSize: 15, lineHeight: 1.75 }}>
        {s.page.services.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>

      {s.page.firstTime ? (
        <>
          <div style={S.hh}>If it&rsquo;s your first time</div>
          <p style={S.body}>{s.page.firstTime}</p>
        </>
      ) : null}

      <div style={S.hh}>Finding it</div>
      <p style={{ ...S.body, marginBottom: 8 }}>
        <a href={mapsHref} target="_blank" rel="noopener" style={{ color: "#F1F5F9" }}>
          {s.address} ↗
        </a>
      </p>
      {s.phone ? (
        <p style={{ ...S.body, marginBottom: 0 }}>
          <a href={"tel:" + s.phone} style={{ color: "#F1F5F9" }}>
            {s.phone.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, "($1) $2-$3")}
          </a>
        </p>
      ) : null}

      {/* DISCLOSURE #2 — the long version, at the point a reader has decided
          they care. It names what was bought and what was not. */}
      <p style={S.disc}>
        <strong style={{ color: "#94A3B8" }}>Why you&rsquo;re seeing this.</strong> {s.advertiser} is a labeled sponsor
        on Wayfind. The label is Sponsored · Paid partner. This page and the card near the studio sit outside ranked
        lists and guides. What they did not buy: a place on a list, a guide pick, or a Wayfind Score. Rankings, list
        order, guide picks, and the Wayfind Score are never paid for, and affiliate commission never changes them.{" "}
        {score != null
          ? `The ${(score / 10).toFixed(1)} above uses the same formula as every unpaid place, from a review snapshot inside 30 days, and no advertiser can move it.`
          : "No score is shown because the review snapshot is older than 30 days. Payment cannot create one, and no advertiser can move it."}{" "}
        The service descriptions are the studio&rsquo;s own words, quoted as theirs. Booking links on this
        page go to {s.advertiser}&rsquo;s own booking system. Wayfind is operated by WAYFIND LLC —{" "}
        <a href="/editorial-policy" style={{ color: "#8B98A9" }}>editorial policy</a>
        {" · "}
        <a href="/how-wayfind-ranks" style={{ color: "#8B98A9" }}>how we rank</a>.
      </p>
    </div>
  );
}

/* ── the index ──────────────────────────────────────────────────────────── */

export const PARTNER_CONTACT_EMAIL = "hello@gowayfind.com";

export const PARTNER_PACKAGES = Object.freeze([
  Object.freeze({
    id: "weekly",
    name: "Weekly Sponsorship",
    priceUsd: 99,
    priceDisplay: "$99",
    period: "week",
    periodDisplay: "/ week",
    days: 7,
    perDayDisplay: "$14.14/day",
    durationLabel: "1 week (7-day flight)",
    promoBadge: null,
    featured: false,
    bestFor: "Pop-ups, weekend events & testing",
    summary: "Ideal for weekend markets, concerts, seasonal pop-ups, or testing local discovery in your market.",
    benefits: Object.freeze([
      "7-day geo-gated Sponsored · Paid partner card in your local area (15–20 mi radius)",
      "Unlimited photos & service menu on a dedicated, crawlable /partners page",
      "Direct booking or event link with 0% Wayfind commission (utm_source=wayfind)",
      "Eligible for active local event rails (such as Tonight) when hosting dated runs",
    ]),
    ctaLabel: "Inquire about Weekly ($99/wk)",
  }),
  Object.freeze({
    id: "monthly",
    name: "Monthly Sponsorship",
    priceUsd: 199,
    priceDisplay: "$199",
    period: "month",
    periodDisplay: "/ month",
    days: 30,
    perDayDisplay: "$6.63/day",
    durationLabel: "1 month (30-day flight)",
    promoBadge: null,
    featured: false,
    bestFor: "Restaurants, charters, tours & studios",
    summary: "Steady 30-day visibility for charters, restaurants, cafes, attractions, and local service studios.",
    benefits: Object.freeze([
      "30-day geo-gated Sponsored · Paid partner card in your local area (15–20 mi radius)",
      "Unlimited photos & service menu on a dedicated, crawlable /partners page",
      "Direct booking link, tap-to-call & Google Maps directions — 0% Wayfind commission",
      "Seen in-app by locals and visitors exploring Florida within your local radius",
    ]),
    ctaLabel: "Inquire about Monthly ($199/mo)",
  }),
  Object.freeze({
    id: "quarterly",
    name: "Quarterly Sponsorship",
    priceUsd: 299,
    priceDisplay: "$299",
    period: "quarter",
    periodDisplay: "/ quarter",
    days: 90,
    perDayDisplay: "$3.32/day",
    durationLabel: "1 quarter (90-day flight)",
    promoBadge: "Holiday Promo",
    featured: true,
    bestFor: "Full-season Florida visibility (~$3.32/day)",
    summary: "90 consecutive days of local discovery across peak Florida visitor and winter trip-planning season.",
    benefits: Object.freeze([
      "90-day geo-gated Sponsored · Paid partner card in your local area (15–20 mi radius)",
      "Unlimited photos & service menu on a dedicated, crawlable /partners page",
      "Direct booking link, tap-to-call & Google Maps directions — 0% Wayfind commission",
      "Works out to ~$3.32/day flat — keep 100% of every reservation on your own site",
    ]),
    ctaLabel: "Inquire about Quarterly ($299/qtr)",
  }),
]);

export function partnerPackageMailto(pkg) {
  if (!pkg) {
    const subject = "Sponsored Partner Inquiry — Wayfind";
    const body = [
      "Hi Wayfind team,",
      "",
      "I would like to inquire about a Sponsored · Paid partner placement on Wayfind.",
      "",
      "Package of interest ($99/week, $199/month, or $299/quarter Holiday Promo):",
      "Business name:",
      "City / address:",
      "Website or direct booking link:",
      "Preferred start date:",
      "",
      "Thanks!",
    ].join("\n");
    return `mailto:${PARTNER_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
  const promoSuffix = pkg.promoBadge ? ` (${pkg.promoBadge})` : "";
  const subject = `Sponsored Partner Inquiry — ${pkg.name} (${pkg.priceDisplay}/${pkg.period})${promoSuffix}`;
  const body = [
    "Hi Wayfind team,",
    "",
    `I would like to inquire about the ${pkg.name} package (${pkg.priceDisplay} per ${pkg.period}, ${pkg.durationLabel})${promoSuffix}.`,
    "",
    "Business name:",
    "City / address:",
    "Website or direct booking link:",
    "Preferred start date:",
    "",
    "Thanks!",
  ].join("\n");
  return `mailto:${PARTNER_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

const PARTNERS_INDEX_CSS = `
.wfp-page{max-width:1080px;margin:0 auto;padding:24px 20px 84px;color:#F1F5F9;font-family:var(--wf-sans),system-ui,-apple-system,sans-serif;box-sizing:border-box;overflow-wrap:break-word}
.wfp-page *,.wfp-page *::before,.wfp-page *::after{box-sizing:border-box}
.wfp-crumb{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 16px;font-size:12.5px;color:#94A3B8;margin-bottom:18px}
.wfp-crumb a{color:#94A3B8;text-decoration:none;transition:color .16s ease}
.wfp-crumb a:hover{color:#F1F5F9}

.wfp-hero{position:relative;border-radius:24px;padding:38px 36px 32px;background:radial-gradient(110% 110% at 88% 0%,rgba(20,184,166,.18) 0%,rgba(249,115,22,.08) 44%,rgba(13,18,28,.98) 78%),linear-gradient(180deg,#111827 0%,#090E18 100%);border:1px solid rgba(45,212,191,.28);box-shadow:0 24px 60px rgba(0,0,0,.48),inset 0 1px 0 rgba(255,255,255,.08);overflow:hidden}
.wfp-eyebrow{display:inline-flex;align-items:center;gap:8px;padding:6px 13px;border-radius:999px;background:rgba(20,184,166,.12);border:1px solid rgba(45,212,191,.34);color:#5EEAD4;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;margin-bottom:14px;max-width:100%}
.wfp-eyebrow-dot{width:7px;height:7px;flex-shrink:0;border-radius:50%;background:#14B8A6;box-shadow:0 0 10px #14B8A6}
.wfp-h1-kicker{font-size:13px;font-weight:800;color:#94A3B8;letter-spacing:.3px;margin:0 0 6px}
.wfp-h1{font-size:clamp(28px,4.4vw,46px);font-weight:850;line-height:1.08;letter-spacing:-1px;margin:0 0 12px;color:#FFFFFF;max-width:860px}
.wfp-h1-accent{color:#5EEAD4}
.wfp-hero-lede{font-size:clamp(15px,1.8vw,17px);color:#CBD5E1;line-height:1.58;max-width:780px;margin:0}
.wfp-hero-actions{display:flex;flex-wrap:wrap;align-items:center;gap:11px;margin-top:22px}
.wfp-btn-primary{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:12px 22px;border-radius:999px;background:linear-gradient(180deg,#14B8A6 0%,#0D9488 100%);color:#FFFFFF;font-size:14.5px;font-weight:800;text-align:center;text-decoration:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 10px 24px -6px rgba(13,148,136,.55);transition:transform .16s ease,filter .16s ease;max-width:100%}
.wfp-btn-primary:hover{transform:translateY(-1px);filter:brightness(1.06)}
.wfp-btn-live{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:12px 20px;border-radius:999px;background:rgba(249,115,22,.12);border:1.5px solid rgba(251,146,60,.45);color:#FED7AA;font-size:14px;font-weight:800;text-align:center;text-decoration:none;transition:background .16s ease,border-color .16s ease;max-width:100%}
.wfp-btn-live:hover{background:rgba(249,115,22,.2);border-color:#FB923C;color:#FFFFFF}
.wfp-btn-secondary{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:12px 18px;border-radius:999px;background:rgba(255,255,255,.05);border:1.5px solid #2D3748;color:#F1F5F9;font-size:13.5px;font-weight:800;text-align:center;text-decoration:none;transition:background .16s ease,border-color .16s ease;max-width:100%}
.wfp-btn-secondary:hover{background:rgba(255,255,255,.09);border-color:#4A5568}

.wfp-econ-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:26px;padding-top:22px;border-top:1px solid rgba(255,255,255,.09)}
.wfp-econ-stat{background:rgba(15,23,42,.62);border:1px solid rgba(51,65,85,.65);border-radius:14px;padding:13px 14px;min-width:0}
.wfp-econ-val{font-size:20px;font-weight:900;letter-spacing:-.5px;color:#FFFFFF;line-height:1.15;margin-bottom:4px}
.wfp-econ-val span{color:#5EEAD4}
.wfp-econ-lbl{font-size:12px;color:#94A3B8;line-height:1.4;margin:0}

.wfp-section{margin-top:36px;border-radius:24px;padding:36px 32px;background:linear-gradient(180deg,#0E1522 0%,#0A0F19 100%);border:1px solid #1E293B;box-shadow:0 20px 50px rgba(0,0,0,.38);scroll-margin-top:20px}
.wfp-sec-header{text-align:center;max-width:740px;margin:0 auto 30px}
.wfp-sec-kicker{font-size:11px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#2DD4BF;margin-bottom:8px}
.wfp-sec-title{font-size:clamp(22px,3.2vw,33px);font-weight:850;line-height:1.14;letter-spacing:-.6px;color:#FFFFFF;margin:0 0 10px}
.wfp-sec-sub{font-size:15px;color:#94A3B8;line-height:1.55;margin:0}

.wfp-showcase-grid{display:grid;grid-template-columns:1fr 316px 1fr;gap:24px;align-items:center}
.wfp-feature-col{display:flex;flex-direction:column;gap:18px;min-width:0}
.wfp-feature-card{background:rgba(18,24,36,.88);border:1px solid #26303B;border-radius:18px;padding:20px 18px;transition:border-color .18s ease,transform .18s ease;min-width:0}
.wfp-feature-card:hover{border-color:rgba(45,212,191,.42);transform:translateY(-2px)}
.wfp-feature-icon{width:46px;height:46px;border-radius:12px;background:rgba(13,148,136,.14);border:1px solid rgba(45,212,191,.28);color:#2DD4BF;display:grid;place-items:center;margin-bottom:12px}
.wfp-feature-title{font-size:17px;font-weight:800;color:#FFFFFF;margin:0 0 6px;letter-spacing:-.2px}
.wfp-feature-desc{font-size:13.5px;color:#CBD5E1;line-height:1.54;margin:0}

/* Authentic dark-mode Wayfind app phone preview */
.wfp-phone-wrap{display:flex;flex-direction:column;align-items:center;min-width:0;max-width:100%}
.wfp-phone-example-tag{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:rgba(148,163,184,.12);border:1px solid rgba(148,163,184,.28);color:#CBD5E1;font-size:10.5px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;margin-bottom:10px;text-align:center}
.wfp-phone{width:302px;max-width:100%;border-radius:42px;padding:10px;background:linear-gradient(145deg,#334155 0%,#0F172A 48%,#1E293B 100%);border:2px solid #3B495E;box-shadow:0 28px 64px rgba(0,0,0,.68),0 0 0 1px rgba(255,255,255,.08)}
.wfp-phone-screen{border-radius:32px;background:#070B12;color:#F1F5F9;overflow:hidden;padding-bottom:12px;border:1px solid #1E293B}
.wfp-phone-notch{width:80px;height:18px;background:#020409;border-radius:999px;margin:8px auto 7px;border:1px solid rgba(255,255,255,.05)}
.wfp-phone-topbar{display:flex;align-items:center;justify-content:space-between;padding:3px 13px 8px;gap:8px}
.wfp-phone-brand{display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:850;color:#FFFFFF;letter-spacing:-.3px}
.wfp-phone-locpill{font-size:10px;font-weight:700;color:#94A3B8;background:#111827;border:1px solid #1F2937;border-radius:999px;padding:3px 8px;white-space:nowrap}
.wfp-phone-rails{display:flex;gap:5px;padding:0 12px 9px;overflow:hidden}
.wfp-phone-rail-chip{font-size:9.5px;font-weight:750;padding:3px 8px;border-radius:999px;background:#111827;border:1px solid #1F2937;color:#94A3B8;white-space:nowrap}
.wfp-phone-rail-chip.is-on{background:rgba(249,115,22,.16);border-color:rgba(249,115,22,.45);color:#FDBA74}
.wfp-phone-card{margin:0 10px;border-radius:16px;overflow:hidden;background:#12161F;border:1px solid #26303B;box-shadow:0 14px 30px rgba(0,0,0,.5)}
.wfp-phone-card-edge{height:3px;background:linear-gradient(90deg,#0D9488 0%,#2DD4BF 65%,#F59E0B 100%)}
.wfp-phone-media{position:relative;height:152px;background:#0F172A;overflow:hidden}
.wfp-phone-sponsor-plate{position:absolute;top:9px;left:9px;z-index:2;padding:4px 8px;border-radius:6px;background:rgba(4,8,16,.86);border:1px solid rgba(255,255,255,.28);color:#F4F7FC;font-size:8.5px;font-weight:850;letter-spacing:.7px;text-transform:uppercase}
.wfp-phone-dist-pill{position:absolute;top:9px;right:9px;z-index:2;padding:3.5px 7px;border-radius:999px;background:rgba(4,8,16,.76);color:#E2E8F0;font-size:9.5px;font-weight:750}
.wfp-phone-overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,8,16,.18) 0%,rgba(4,8,16,.08) 42%,rgba(4,8,16,.88) 100%);display:flex;flex-direction:column;justify-content:flex-end;padding:10px 11px}
.wfp-phone-card-title{font-size:16px;font-weight:850;line-height:1.15;color:#FFFFFF;margin:0 0 2px}
.wfp-phone-card-loc{font-size:11px;font-weight:650;color:#CBD5E1;margin:0}
.wfp-phone-body{padding:10px 11px 11px}
.wfp-phone-score-row{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:7px}
.wfp-phone-score-badge{display:inline-flex;align-items:baseline;gap:4px;background:#12351F;border:1px solid #1F6B3E;color:#7BE8A8;border-radius:7px;padding:2.5px 7px;font-size:11px;font-weight:850}
.wfp-phone-score-badge small{font-size:8px;font-weight:800;color:#4FBF7F;letter-spacing:.3px}
.wfp-phone-stars{font-size:10.5px;color:#CBD5E1;font-weight:650}
.wfp-phone-copy{font-size:11.5px;color:#CBD5E1;line-height:1.42;margin:0 0 9px}
.wfp-phone-mini-actions{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-bottom:7px}
.wfp-phone-mini-btn{text-align:center;font-size:10px;font-weight:750;color:#CBD5E1;background:#18202D;border:1px solid #283446;border-radius:8px;padding:5px 4px}
.wfp-phone-cta{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:8.5px 10px;border-radius:10px;background:#0D9488;color:#FFFFFF;font-size:12px;font-weight:850;text-align:center}
.wfp-phone-utm{font-size:9.5px;color:#64748B;text-align:center;margin-top:6px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.wfp-phone-caption{font-size:11.5px;color:#94A3B8;text-align:center;margin-top:10px;max-width:276px;line-height:1.45}

/* Where your business appears 3-surface strip */
.wfp-surfaces-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:26px;padding-top:24px;border-top:1px solid #1E293B}
.wfp-surface-card{background:rgba(15,23,42,.6);border:1px solid #243042;border-radius:16px;padding:16px;min-width:0}
.wfp-surface-tag{display:inline-block;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#5EEAD4;margin-bottom:6px}
.wfp-surface-title{font-size:14.5px;font-weight:800;color:#FFFFFF;margin:0 0 5px}
.wfp-surface-desc{font-size:12.5px;color:#94A3B8;line-height:1.5;margin:0}

/* Live Partner Proof Showcase */
.wfp-proof-wrap{margin-top:32px;border-radius:24px;padding:30px;background:radial-gradient(90% 120% at 0% 0%,rgba(20,184,166,.12) 0%,rgba(18,22,31,.96) 65%),#111723;border:1px solid rgba(45,212,191,.3);box-shadow:0 18px 44px rgba(0,0,0,.36)}
.wfp-proof-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:24px;align-items:center}
.wfp-proof-checks{list-style:none;padding:0;margin:14px 0 20px;display:grid;gap:8px;font-size:13.5px;color:#E2E8F0;line-height:1.45}
.wfp-proof-checks li{display:flex;align-items:flex-start;gap:9px}
.wfp-proof-check-mark{color:#2DD4BF;font-weight:900;flex-shrink:0}
.wfp-live-card{display:flex;flex-direction:column;border:1px solid #2D3B4E;background:#151C28;border-radius:18px;overflow:hidden;text-decoration:none;color:inherit;transition:border-color .18s ease,transform .18s ease;min-width:0}
.wfp-live-card:hover{border-color:#2DD4BF;transform:translateY(-2px)}
.wfp-live-card-media{position:relative;width:100%;aspect-ratio:16/9;background:#0E131D;overflow:hidden}
.wfp-live-card-body{padding:16px 18px}
.wfp-rail-note{margin-top:16px;padding:12px 15px;border-radius:13px;background:rgba(15,23,42,.65);border:1px solid #243042;font-size:12.5px;color:#94A3B8;line-height:1.5}

/* Pricing Tiers */
.wfp-pricing-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;align-items:stretch}
.wfp-price-card{display:flex;flex-direction:column;justify-content:space-between;border-radius:20px;padding:24px 20px;background:#121824;border:1px solid #26303B;transition:transform .18s ease,border-color .18s ease;min-width:0}
.wfp-price-card:hover{transform:translateY(-2px);border-color:#3B4A5E}
.wfp-price-card.is-featured{background:linear-gradient(165deg,#0F766E 0%,#0B4F4A 55%,#092E2E 100%);border:1.5px solid #2DD4BF;box-shadow:0 20px 44px -12px rgba(20,184,166,.4),inset 0 1px 0 rgba(255,255,255,.22);position:relative}
.wfp-badge-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:10px}
.wfp-promo-pill{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.18);color:#ECFDF5;font-size:10.5px;font-weight:800;letter-spacing:.8px;text-transform:uppercase}
.wfp-tier-name{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8;margin:0 0 6px}
.wfp-price-card.is-featured .wfp-tier-name{color:#99F6E4}
.wfp-price-row{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;margin-bottom:8px}
.wfp-price-amount{font-size:40px;font-weight:900;letter-spacing:-1.3px;color:#FFFFFF;line-height:1}
.wfp-price-period{font-size:15.5px;font-weight:700;color:#CBD5E1}
.wfp-price-card.is-featured .wfp-price-period{color:#E6FFFA}
.wfp-perday-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:12px}
.wfp-price-duration{display:inline-block;font-size:11.5px;font-weight:750;color:#5EEAD4;background:rgba(20,184,166,.12);border:1px solid rgba(45,212,191,.24);border-radius:8px;padding:3px 8px}
.wfp-price-card.is-featured .wfp-price-duration{color:#FFFFFF;background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.3)}
.wfp-perday-pill{display:inline-block;font-size:11.5px;font-weight:800;color:#FDE68A;background:rgba(245,158,11,.14);border:1px solid rgba(251,191,36,.32);border-radius:8px;padding:3px 8px}
.wfp-price-card.is-featured .wfp-perday-pill{color:#FEF08A;background:rgba(4,8,16,.38);border-color:rgba(253,224,71,.42)}
.wfp-price-sub{font-size:13px;color:#94A3B8;line-height:1.48;margin:0 0 14px}
.wfp-price-card.is-featured .wfp-price-sub{color:#CCFBF1}
.wfp-price-list{list-style:none;padding:0;margin:0 0 18px;display:grid;gap:8.5px;font-size:13px;color:#E2E8F0;line-height:1.45}
.wfp-price-list li{display:flex;align-items:flex-start;gap:8px}
.wfp-price-check{color:#2DD4BF;font-weight:900;flex-shrink:0}
.wfp-price-card.is-featured .wfp-price-check{color:#A7F3D0}
.wfp-price-next{font-size:11.5px;color:#94A3B8;margin:0 0 10px;line-height:1.4}
.wfp-price-card.is-featured .wfp-price-next{color:#CCFBF1}
.wfp-price-cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:46px;padding:11px 14px;border-radius:12px;background:#1E293B;border:1px solid #334155;color:#F8FAFC;font-size:13.5px;font-weight:800;text-align:center;text-decoration:none;transition:background .16s ease,border-color .16s ease}
.wfp-price-cta:hover{background:#283548;border-color:#475569}
.wfp-price-card.is-featured .wfp-price-cta{background:#FFFFFF;border-color:#FFFFFF;color:#0F4C46;box-shadow:0 8px 20px rgba(0,0,0,.25)}
.wfp-price-card.is-featured .wfp-price-cta:hover{background:#F0FDFA}

.wfp-zero-comm-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 20px;margin-bottom:20px;padding:14px 18px;border-radius:14px;background:rgba(20,184,166,.09);border:1px solid rgba(45,212,191,.28);font-size:13.5px;color:#E2E8F0;line-height:1.5}

.wfp-email-fallback{margin-top:20px;padding:16px 18px;border-radius:16px;background:rgba(18,24,36,.92);border:1px solid #26303B}
.wfp-email-fallback-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px}
.wfp-email-fallback-text{font-size:13px;color:#CBD5E1;line-height:1.55;flex:1 1 280px;min-width:0}
.wfp-email-code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12.5px;font-weight:700;color:#5EEAD4;background:rgba(20,184,166,.12);border:1px solid rgba(45,212,191,.28);border-radius:6px;padding:2px 7px;white-space:nowrap}
.wfp-copy-email-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:9px 16px;border-radius:999px;background:#1E293B;border:1px solid #3B495E;color:#F8FAFC;font:inherit;font-size:13px;font-weight:800;cursor:pointer;transition:background .16s ease,border-color .16s ease;flex-shrink:0;max-width:100%}
.wfp-copy-email-btn:hover{background:#283548;border-color:#5EEAD4}

/* 5-Step What Happens Next Workflow */
.wfp-workflow-wrap{margin-top:32px;border-radius:22px;padding:30px 28px;background:#101622;border:1px solid #222D3D}
.wfp-steps-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-top:20px}
.wfp-step-card{background:#141B29;border:1px solid #263244;border-radius:16px;padding:16px 15px;min-width:0}
.wfp-step-num{display:inline-flex;align-items:center;justify-content:center;padding:3px 8px;border-radius:7px;background:rgba(20,184,166,.14);border:1px solid rgba(45,212,191,.32);color:#5EEAD4;font-size:11px;font-weight:850;letter-spacing:.5px;margin-bottom:9px}
.wfp-step-title{font-size:14.5px;font-weight:800;color:#FFFFFF;margin:0 0 5px;line-height:1.28}
.wfp-step-body{font-size:12.5px;color:#94A3B8;line-height:1.5;margin:0}

/* Authority + Editorial Independence */
.wfp-two-col{display:grid;grid-template-columns:1.05fr .95fr;gap:20px;margin-top:32px;align-items:stretch}
.wfp-panel{background:#12161F;border:1px solid #26303B;border-radius:20px;padding:26px 24px;display:flex;flex-direction:column;justify-content:space-between;min-width:0}
.wfp-panel-kicker{font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#2DD4BF;margin-bottom:8px}
.wfp-panel-title{font-size:21px;font-weight:850;color:#FFFFFF;margin:0 0 10px;letter-spacing:-.3px}
.wfp-auth-list{list-style:none;padding:0;margin:12px 0 0;display:grid;gap:11px}
.wfp-auth-item{padding:11px 13px;border-radius:12px;background:#161D2A;border:1px solid #242F40}
.wfp-auth-item strong{display:block;font-size:13.5px;color:#F8FAFC;margin-bottom:2px}
.wfp-auth-item span{font-size:12.5px;color:#94A3B8;line-height:1.45;display:block}

.wfp-cta-banner{margin-top:32px;border-radius:22px;padding:28px;background:linear-gradient(135deg,#131C2E 0%,#0D131F 100%);border:1px solid rgba(45,212,191,.28);display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:20px}

@media(max-width:980px){
  .wfp-steps-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(max-width:920px){
  .wfp-econ-strip{grid-template-columns:repeat(2,minmax(0,1fr))}
  .wfp-showcase-grid{grid-template-columns:1fr;gap:18px}
  .wfp-phone-wrap{order:-1;margin-bottom:4px}
  .wfp-surfaces-grid{grid-template-columns:1fr}
  .wfp-proof-grid{grid-template-columns:1fr}
  .wfp-pricing-grid{grid-template-columns:1fr}
  .wfp-price-card.is-featured{order:-1}
  .wfp-two-col{grid-template-columns:1fr}
}
@media(max-width:560px){
  .wfp-page{padding:12px 12px 60px}
  .wfp-crumb{margin-bottom:12px;font-size:12px}
  .wfp-hero{padding:20px 16px 18px;border-radius:20px}
  .wfp-eyebrow{font-size:10px;padding:5px 10px;margin-bottom:10px}
  .wfp-h1{font-size:26px;line-height:1.1;margin-bottom:9px}
  .wfp-hero-lede{font-size:14px;line-height:1.48}
  .wfp-hero-actions{gap:8px;margin-top:16px}
  .wfp-hero-actions .wfp-btn-primary,.wfp-hero-actions .wfp-btn-live{width:100%;min-height:45px;padding:10px 16px}
  .wfp-hero-actions .wfp-btn-secondary{flex:1 1 auto;min-height:44px;padding:9px 12px;font-size:12.5px}
  .wfp-econ-strip{gap:8px;margin-top:16px;padding-top:16px}
  .wfp-econ-stat{padding:10px 11px}
  .wfp-econ-val{font-size:17px}
  .wfp-econ-lbl{font-size:11.5px;line-height:1.35}
  .wfp-section{padding:22px 15px;border-radius:20px;margin-top:22px}
  .wfp-proof-wrap{padding:20px 15px;border-radius:20px;margin-top:22px}
  .wfp-workflow-wrap{padding:20px 15px;border-radius:20px;margin-top:22px}
  .wfp-steps-grid{grid-template-columns:1fr}
  .wfp-panel{padding:20px 15px}
  .wfp-cta-banner{padding:20px 15px}
}
@media(max-width:360px){
  .wfp-page{padding:10px 10px 52px}
  .wfp-hero{padding:18px 13px 16px}
  .wfp-h1{font-size:23px}
  .wfp-econ-strip{grid-template-columns:1fr}
  .wfp-section{padding:18px 12px}
  .wfp-proof-wrap{padding:18px 12px}
}
`;

export function PartnersIndexPage() {
  const rows = SPONSORED_PLACES.filter(sponsorHasPage);
  const primaryLivePartner = rows[0] || null;
  const generalMailto = partnerPackageMailto(null);
  return (
    <div className="wfp-page" data-analytics-page="partners_index">
      <style dangerouslySetInnerHTML={styleHtml(PARTNERS_INDEX_CSS)} />
      <PartnersFunnelBeacon pricingSectionId="partner-packages" />
      {jsonLd({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Partners on Wayfind",
        url: `${SITE_URL}/partners`,
        description: "Local businesses that have sponsored a labelled card on Wayfind, and what that never buys.",
      })}
      <nav className="wfp-crumb" aria-label="Breadcrumb">
        <span><a href="/">Wayfind</a> › Partners</span>
        <PartnerInquiryLink
          href={generalMailto}
          packageId="general"
          placement="breadcrumb"
          ariaLabel={`Email partner inquiries to ${PARTNER_CONTACT_EMAIL}`}
        >
          Direct inquiries: {PARTNER_CONTACT_EMAIL} →
        </PartnerInquiryLink>
      </nav>

      {/* ── 1. ABOVE-THE-FOLD BUSINESS-OWNER HERO (< 30s CLARITY) ─────────── */}
      <section className="wfp-hero">
        <div className="wfp-eyebrow">
          <span className="wfp-eyebrow-dot" aria-hidden="true" />
          <span>Florida Local Discovery · Web &amp; iOS · Labeled Sponsorships</span>
        </div>
        <div className="wfp-h1-kicker">Partners on Wayfind</div>
        <h1 className="wfp-h1">
          Put your Florida business in front of people deciding where to go next —{" "}
          <span className="wfp-h1-accent">with 0% Wayfind commission.</span>
        </h1>
        <p className="wfp-hero-lede">
          For Florida restaurants, charters, tours, attractions, cafes, studios, and venues.
          Get a 15–20 mile geo-gated card inside Wayfind plus a Google-crawlable{" "}
          <code>/partners</code> page linking straight to your own booking calendar — clearly labeled outside ranked lists.
        </p>

        <div className="wfp-hero-actions">
          <PartnerSectionJumpLink
            href="#partner-packages"
            placement="hero_primary"
            targetSection="partner_packages"
            className="wfp-btn-primary"
            ariaLabel="Jump to sponsorship packages and flat-rate pricing"
          >
            See Packages &amp; Pricing <span aria-hidden="true">↓</span>
          </PartnerSectionJumpLink>
          {primaryLivePartner ? (
            <PartnerLiveExampleLink
              href={`/partners/${primaryLivePartner.id}`}
              partnerSlug={primaryLivePartner.id}
              placement="hero_live_proof"
              className="wfp-btn-live"
              ariaLabel={`See a live partner page on Wayfind: ${primaryLivePartner.advertiser}`}
            >
              See a Live Partner <span aria-hidden="true">→</span>
            </PartnerLiveExampleLink>
          ) : null}
          <PartnerInquiryLink
            href={generalMailto}
            packageId="general"
            placement="hero_secondary"
            className="wfp-btn-secondary"
            ariaLabel={`Email ${PARTNER_CONTACT_EMAIL} to inquire about becoming a Sponsored Partner`}
          >
            Email {PARTNER_CONTACT_EMAIL}
          </PartnerInquiryLink>
          <ShareButton url={pageShareUrl("/partners")} title="Partners on Wayfind"
            text="Local business sponsorships on Wayfind — flat-rate local discovery, 0% Wayfind booking commission, and strict editorial independence."
            label="Share" tone="dark" event="page_share" meta={{ surface: "partners_index", placement: "header" }} />
        </div>

        <div className="wfp-econ-strip" aria-label="Key sponsorship facts">
          <div className="wfp-econ-stat">
            <div className="wfp-econ-val"><span>~$3.32</span> / day</div>
            <p className="wfp-econ-lbl">$299 for a full 90-day quarter (Holiday Promo), or $99/wk · $199/mo flat rate.</p>
          </div>
          <div className="wfp-econ-stat">
            <div className="wfp-econ-val"><span>0%</span> Commission</div>
            <p className="wfp-econ-lbl">Wayfind takes 0% on direct bookings. Taps go straight to your own booking system.</p>
          </div>
          <div className="wfp-econ-stat">
            <div className="wfp-econ-val"><span>15–20 mi</span> Gate</div>
            <p className="wfp-econ-lbl">In-app cards serve only to locals and visitors actively browsing inside your radius.</p>
          </div>
          <div className="wfp-econ-stat">
            <div className="wfp-econ-val"><span>{VERIFIED_FLORIDA_CITY_COUNT}</span> FL Markets</div>
            <p className="wfp-econ-lbl">Covered Florida cities &amp; coastal towns plus {VERIFIED_LIVE_GUIDE_COUNT} published Florida guides.</p>
          </div>
        </div>
      </section>

      {/* ── 2. PRODUCT DEMONSTRATION & DELIVERABLES ────────────────────────── */}
      <section id="what-you-get" className="wfp-section" aria-labelledby="wfp-pkg-heading">
        <div className="wfp-sec-header">
          <div className="wfp-sec-kicker">Product Demonstration · Exact Deliverables</div>
          <h2 id="wfp-pkg-heading" className="wfp-sec-title">What You Get as a Wayfind Sponsored Partner</h2>
          <p className="wfp-sec-sub">
            No vague ad impressions. You get a native dark-mode discovery card inside your local radius plus a structured, searchable business page built to convert visitors into direct customers.
          </p>
        </div>

        <div className="wfp-showcase-grid">
          {/* Left column features */}
          <div className="wfp-feature-col">
            <div className="wfp-feature-card">
              <div className="wfp-feature-icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              </div>
              <h3 className="wfp-feature-title">Featured Sponsored Card</h3>
              <p className="wfp-feature-desc">
                A clearly labeled card shown alongside Wayfind&rsquo;s picks, outside ranked lists — served in-app only when locals and travelers are browsing within 15–20 miles of your door.
              </p>
            </div>

            <div className="wfp-feature-card">
              <div className="wfp-feature-icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="18" x="3" y="3" rx="3" ry="3"/>
                  <circle cx="9" cy="9" r="2"/>
                  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                </svg>
              </div>
              <h3 className="wfp-feature-title">Unlimited Photos</h3>
              <p className="wfp-feature-desc">
                Showcase your dining room, boat, attraction, or studio with unlimited photos and your full service or experience menu on a permanent, Google-crawlable <code>/partners</code> page.
              </p>
            </div>
          </div>

          {/* Center authentic Wayfind dark-mode phone preview */}
          <div className="wfp-phone-wrap" role="img" aria-label="Illustrative example of how a Sponsored · Paid partner card looks inside Wayfind on mobile. Fictional sample business.">
            <span className="wfp-phone-example-tag">Example Illustration · Sample Business</span>
            <div className="wfp-phone" aria-hidden="true">
              <div className="wfp-phone-screen">
                <div className="wfp-phone-notch" />
                <div className="wfp-phone-topbar">
                  <span className="wfp-phone-brand">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="#F97316"><path d="M12 2C7.58 2 4 5.58 4 10c0 5.25 8 12 8 12s8-6.75 8-12c0-4.42-3.58-8-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/></svg>
                    Wayfind
                  </span>
                  <span className="wfp-phone-locpill">Key West, FL · 15 mi</span>
                </div>
                <div className="wfp-phone-rails">
                  <span className="wfp-phone-rail-chip is-on">Right Now</span>
                  <span className="wfp-phone-rail-chip">On the Water</span>
                  <span className="wfp-phone-rail-chip">Tonight</span>
                </div>
                <div className="wfp-phone-card">
                  <div className="wfp-phone-card-edge" />
                  <div className="wfp-phone-media">
                    {/* Detailed Florida Keys sunset catamaran scene */}
                    <svg viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0 }}>
                      <defs>
                        <linearGradient id="wfpSky2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0F172A" />
                          <stop offset="36%" stopColor="#7C2D12" />
                          <stop offset="72%" stopColor="#EA580C" />
                          <stop offset="100%" stopColor="#FDE68A" />
                        </linearGradient>
                        <linearGradient id="wfpSea2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#9A3412" />
                          <stop offset="35%" stopColor="#0F3A4A" />
                          <stop offset="100%" stopColor="#050911" />
                        </linearGradient>
                      </defs>
                      <rect width="320" height="106" fill="url(#wfpSky2)" />
                      <circle cx="96" cy="84" r="22" fill="#FEF08A" opacity="0.9" />
                      <circle cx="96" cy="84" r="34" fill="#FB923C" opacity="0.22" />
                      {/* Distant key & lighthouse silhouette */}
                      <path d="M0 105 Q42 98 84 105 Z" fill="#1E293B" opacity="0.85" />
                      <rect x="34" y="90" width="3" height="14" fill="#1E293B" />
                      <circle cx="35.5" cy="89" r="2" fill="#FDE047" />
                      <rect y="104" width="320" height="76" fill="url(#wfpSea2)" />
                      {/* Shimmering sunset water path */}
                      <ellipse cx="96" cy="114" rx="44" ry="2.5" fill="#FDE047" opacity="0.55" />
                      <ellipse cx="96" cy="122" rx="30" ry="2" fill="#FDBA74" opacity="0.4" />
                      <ellipse cx="96" cy="131" rx="18" ry="1.5" fill="#FED7AA" opacity="0.3" />
                      {/* Catamaran yacht silhouette with warm deck glow */}
                      <polygon points="208,24 208,98 168,98" fill="#0B1120" />
                      <polygon points="212,34 212,98 244,98" fill="#172033" />
                      <polygon points="158,101 254,101 244,111 168,111" fill="#090D16" />
                      <rect x="184" y="96" width="24" height="5" rx="2" fill="#1E293B" />
                      <circle cx="191" cy="98.5" r="1.3" fill="#FBBF24" />
                      <circle cx="197" cy="98.5" r="1.3" fill="#FBBF24" />
                      <circle cx="203" cy="98.5" r="1.3" fill="#FBBF24" />
                    </svg>
                    <span className="wfp-phone-sponsor-plate">Sponsored · Paid partner</span>
                    <span className="wfp-phone-dist-pill">1.4 mi away</span>
                    <div className="wfp-phone-overlay">
                      <div className="wfp-phone-card-title">Key West Sunset Charter</div>
                      <p className="wfp-phone-card-loc">Old Town Marina · Departs 5:30pm</p>
                    </div>
                  </div>
                  <div className="wfp-phone-body">
                    <div className="wfp-phone-score-row">
                      <span className="wfp-phone-score-badge">
                        9.1 <small>WAYFIND SCORE</small>
                      </span>
                      <span className="wfp-phone-stars">4.9★ · Google snapshot</span>
                    </div>
                    <p className="wfp-phone-copy">
                      Small-group catamaran sail on the reef edge with local crew and cold drinks aboard.
                    </p>
                    <div className="wfp-phone-mini-actions">
                      <span className="wfp-phone-mini-btn">Directions</span>
                      <span className="wfp-phone-mini-btn">Call</span>
                      <span className="wfp-phone-mini-btn">Full Menu</span>
                    </div>
                    <div className="wfp-phone-cta">
                      Book Your Sail Direct <span>→</span>
                    </div>
                    <div className="wfp-phone-utm">0% Wayfind commission · utm_source=wayfind</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="wfp-phone-caption">
              Illustrative preview only — not an active sponsor or customer result. Inspect our live partner page right below.
            </div>
          </div>

          {/* Right column features */}
          <div className="wfp-feature-col">
            <div className="wfp-feature-card">
              <div className="wfp-feature-icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
              </div>
              <h3 className="wfp-feature-title">Direct Booking Link</h3>
              <p className="wfp-feature-desc">
                Send customers straight to your own reservation calendar, ticketing checkout, or website with 0% Wayfind commission — stamped with <code>utm_source=wayfind</code> so you can verify clicks in your own dashboard.
              </p>
            </div>

            <div className="wfp-feature-card">
              <div className="wfp-feature-icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <h3 className="wfp-feature-title">Seen by Visitors Planning Their Florida Trip</h3>
              <p className="wfp-feature-desc">
                Reach locals and Florida travelers at the exact moment they open Wayfind on web or iOS to pick where to eat, book an excursion, or head out tonight.
              </p>
            </div>
          </div>
        </div>

        {/* Where your business appears across Wayfind */}
        <div className="wfp-surfaces-grid" aria-label="Where sponsored placements appear on Wayfind">
          <div className="wfp-surface-card">
            <span className="wfp-surface-tag">Surface 01 · Local Feed</span>
            <h3 className="wfp-surface-title">15–20 Mile Geo-Gated Card</h3>
            <p className="wfp-surface-desc">
              Appears in-app alongside local discovery results when a reader is inside your radius. Tagged <code>utm_medium=sponsored_card</code> so you see card taps separately.
            </p>
          </div>
          <div className="wfp-surface-card">
            <span className="wfp-surface-tag">Surface 02 · Search &amp; Share</span>
            <h3 className="wfp-surface-title">Permanent /partners Business Page</h3>
            <p className="wfp-surface-desc">
              Indexed in Wayfind&rsquo;s sitemap with Schema.org <code>LocalBusiness</code> markup and zero geo-gate — built to capture Google searches and social bio traffic (<code>utm_medium=partner_page</code>).
            </p>
          </div>
          <div className="wfp-surface-card">
            <span className="wfp-surface-tag">Surface 03 · Dated Runs</span>
            <h3 className="wfp-surface-title">Eligible Activity &amp; Tonight Rails</h3>
            <p className="wfp-surface-desc">
              Hosting a night market, festival, or weekend run? Flights can ride eligible time-of-day rails (such as <em>Tonight</em>) during active event hours — never sold on attributed chef or creator lists.
            </p>
          </div>
        </div>
      </section>

      {/* ── 3. LIVE PARTNER PROOF ("SEE A LIVE PARTNER") ───────────────────── */}
      <section id="live-partner-proof" className="wfp-proof-wrap" aria-labelledby="wfp-live-sponsors">
        <div className="wfp-proof-grid">
          <div>
            <div className="wfp-sec-kicker" style={{ textAlign: "left" }}>Real Shipped Proof · Inspect Before You Inquire</div>
            <h2 id="wfp-live-sponsors" className="wfp-sec-title" style={{ textAlign: "left", fontSize: "clamp(22px, 3vw, 30px)" }}>
              See a Live Partner on Wayfind
            </h2>
            <p style={{ ...S.body, fontSize: 14.5, marginBottom: 8 }}>
              Don&rsquo;t guess what your business page will look like — inspect a live partner implementation right now.{" "}
              Rio Body Wax in Gastonia is a labeled sponsor on Wayfind. The label is &ldquo;Sponsored · Paid partner.&rdquo;
              The card sits outside ranked lists, and their dedicated page shows the exact level of detail our team builds for every partner:
            </p>
            <ul className="wfp-proof-checks">
              <li>
                <span className="wfp-proof-check-mark" aria-hidden="true">✓</span>
                <span><strong>Real storefront photography &amp; brand accent bar</strong> framed cleanly in Wayfind&rsquo;s dark UI</span>
              </li>
              <li>
                <span className="wfp-proof-check-mark" aria-hidden="true">✓</span>
                <span><strong>Complete service &amp; formula breakdown</strong> written from verified business offerings — never thin filler copy</span>
              </li>
              <li>
                <span className="wfp-proof-check-mark" aria-hidden="true">✓</span>
                <span><strong>Direct booking button to their own Zenoti calendar</strong> with 0% Wayfind commission, plus tap-to-call &amp; Google Maps pin</span>
              </li>
              <li>
                <span className="wfp-proof-check-mark" aria-hidden="true">✓</span>
                <span><strong>Honest score &amp; review handling</strong> — computed by the exact same public formula as every unpaid venue</span>
              </li>
            </ul>
            {primaryLivePartner ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <PartnerLiveExampleLink
                  href={`/partners/${primaryLivePartner.id}`}
                  partnerSlug={primaryLivePartner.id}
                  placement="proof_section_button"
                  className="wfp-btn-primary"
                  ariaLabel={`See a Live Partner: inspect ${primaryLivePartner.advertiser} on Wayfind`}
                >
                  See a Live Partner ({primaryLivePartner.advertiser}) <span aria-hidden="true">→</span>
                </PartnerLiveExampleLink>
              </div>
            ) : null}
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {rows.map((s) => {
              const branch = branchOf(s);
              const score = sponsoredPublicScore(s);
              const thumb = photoUrl(s, 720);
              return (
                <PartnerLiveExampleLink
                  key={s.id}
                  href={`/partners/${s.id}`}
                  partnerSlug={s.id}
                  placement="proof_section_card"
                  className="wfp-live-card"
                >
                  <div className="wfp-live-card-media">
                    {thumb ? (
                      <SafeImg
                        src={thumb}
                        alt={`${s.advertiser}${branch ? " " + branch : ""} storefront`}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: s.photoPosition || "50% 50%" }}
                      />
                    ) : null}
                    <div
                      aria-hidden="true"
                      style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(4,8,16,.55) 0%, rgba(4,8,16,0) 45%, rgba(4,8,16,.7) 100%)" }}
                    />
                    <span
                      style={{
                        position: "absolute", top: 10, left: 10, fontSize: 9.5, fontWeight: 800, letterSpacing: "0.8px",
                        textTransform: "uppercase", color: "#FFFFFF", background: "rgba(4,8,16,.8)",
                        border: "1px solid rgba(255,255,255,.26)", borderRadius: 999, padding: "4px 10px",
                      }}
                    >
                      {s.label}
                    </span>
                  </div>
                  <div className="wfp-live-card-body">
                    <div style={{ fontSize: 19, fontWeight: 850, color: "#FFFFFF", lineHeight: 1.2 }}>{s.advertiser}</div>
                    <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 3 }}>
                      {branch} · 15-mile local gate + crawlable partner page
                      {score != null ? ` · Wayfind Score ${(score / 10).toFixed(1)}` : ""}
                    </div>
                    {s.headline ? (
                      <div style={{ fontSize: 13, color: "#CBD5E1", marginTop: 8, lineHeight: 1.45 }}>&ldquo;{s.headline}&rdquo;</div>
                    ) : null}
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 800, color: "#5EEAD4", marginTop: 11 }}>
                      Open live partner page <span>→</span>
                    </div>
                  </div>
                </PartnerLiveExampleLink>
              );
            })}

            <div className="wfp-rail-note">
              <strong style={{ color: "#E2E8F0" }}>Running a Florida night market or dated event?</strong>{" "}
              Wayfind also supports dated rail flights (such as <em>Möbius Sarasota</em> on Sarasota&rsquo;s 20-mile <em>Tonight</em> rail) that automatically close the morning after your final event night so readers never land on a closed venue.
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. PRICING & DEFENSIBLE ECONOMICS (#partner-packages) ──────────── */}
      <section id="partner-packages" className="wfp-section" aria-labelledby="wfp-pricing-heading">
        <div className="wfp-sec-header" style={{ marginBottom: 22 }}>
          <div className="wfp-sec-kicker">Flat-Rate Packages · Keep 100% of Every Booking</div>
          <h2 id="wfp-pricing-heading" className="wfp-sec-title">Simple Pricing. Clear Local Economics.</h2>
          <p className="wfp-sec-sub">
            One flat sponsorship fee for your flight window — zero commission, zero per-click markups, and zero middleman checkout.
            With peak Florida travel and winter trip planning underway, one extra charter, table, or appointment can pay for an entire season.
          </p>
        </div>

        <div className="wfp-zero-comm-bar">
          <div>
            <strong style={{ color: "#5EEAD4" }}>0% Wayfind Commission on Direct Bookings:</strong>{" "}
            Your placement links directly to your own booking system, OpenTable/Resy/Zenoti/FareHarbor calendar, or website. You keep 100% of customer revenue.
          </div>
          <span style={{ fontSize: 12, fontWeight: 800, color: "#99F6E4", whiteSpace: "nowrap" }}>
            Questions? {PARTNER_CONTACT_EMAIL}
          </span>
        </div>

        <div className="wfp-pricing-grid">
          {PARTNER_PACKAGES.map((pkg) => {
            const href = partnerPackageMailto(pkg);
            return (
              <div key={pkg.id} className={`wfp-price-card${pkg.featured ? " is-featured" : ""}`}>
                <div>
                  {pkg.promoBadge ? (
                    <div className="wfp-badge-row">
                      <span className="wfp-promo-pill">{pkg.promoBadge}</span>
                    </div>
                  ) : null}
                  <div className="wfp-tier-name">{pkg.name}</div>
                  <div className="wfp-price-row">
                    <span className="wfp-price-amount">{pkg.priceDisplay}</span>
                    <span className="wfp-price-period">{pkg.periodDisplay}</span>
                  </div>
                  <div className="wfp-perday-row">
                    <span className="wfp-price-duration">{pkg.durationLabel}</span>
                    <span className="wfp-perday-pill">≈ {pkg.perDayDisplay}</span>
                  </div>
                  <p className="wfp-price-sub">{pkg.summary}</p>
                  <ul className="wfp-price-list">
                    {pkg.benefits.map((b, i) => (
                      <li key={i}>
                        <span className="wfp-price-check" aria-hidden="true">✓</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="wfp-price-next">
                    Next step: Opens a pre-filled inquiry to {PARTNER_CONTACT_EMAIL}
                  </p>
                  <PartnerInquiryLink
                    href={href}
                    packageId={pkg.id}
                    packageName={pkg.name}
                    priceUsd={pkg.priceUsd}
                    billingPeriod={pkg.period}
                    placement="pricing_card"
                    className="wfp-price-cta"
                    ariaLabel={`${pkg.ctaLabel} — opens email inquiry to ${PARTNER_CONTACT_EMAIL}`}
                  >
                    {pkg.ctaLabel} <span aria-hidden="true">→</span>
                  </PartnerInquiryLink>
                </div>
              </div>
            );
          })}
        </div>

        <PartnerEmailFallback email={PARTNER_CONTACT_EMAIL} placement="pricing_section" defaultPackageId="quarterly" />
      </section>

      {/* ── 5. WHAT HAPPENS AFTER YOU CONTACT US (5-STEP CERTAINTY) ────────── */}
      <section className="wfp-workflow-wrap" aria-labelledby="wfp-workflow-heading">
        <div style={{ maxWidth: 680 }}>
          <div className="wfp-sec-kicker" style={{ textAlign: "left" }}>Zero Guesswork · Turnkey Onboarding</div>
          <h2 id="wfp-workflow-heading" style={{ fontSize: "clamp(20px, 2.8vw, 27px)", fontWeight: 850, color: "#FFFFFF", margin: "0 0 6px", letterSpacing: "-.4px" }}>
            What Happens After You Contact Us
          </h2>
          <p style={{ fontSize: 14, color: "#94A3B8", margin: 0, lineHeight: 1.55 }}>
            You don&rsquo;t need to design ad creatives or manage a dashboard. Our team handles the build from your existing photos and service details, and nothing publishes until you review it.
          </p>
        </div>

        <div className="wfp-steps-grid">
          <div className="wfp-step-card">
            <div className="wfp-step-num">STEP 01</div>
            <h3 className="wfp-step-title">You Tell Us About Your Business</h3>
            <p className="wfp-step-body">
              Email <code>{PARTNER_CONTACT_EMAIL}</code> or use the on-page form above with your venue name, Florida city, booking URL, and preferred flight.
            </p>
          </div>
          <div className="wfp-step-card">
            <div className="wfp-step-num">STEP 02</div>
            <h3 className="wfp-step-title">Wayfind Builds Your Placement</h3>
            <p className="wfp-step-body">
              We verify your Google record, configure your 15–20 mile radius gate, and build your card plus your full <code>/partners</code> page.
            </p>
          </div>
          <div className="wfp-step-card">
            <div className="wfp-step-num">STEP 03</div>
            <h3 className="wfp-step-title">You Review Everything First</h3>
            <p className="wfp-step-body">
              We send you your draft placement to check your photos, service descriptions, phone number, and direct booking link before launch.
            </p>
          </div>
          <div className="wfp-step-card">
            <div className="wfp-step-num">STEP 04</div>
            <h3 className="wfp-step-title">We Publish Your Flight</h3>
            <p className="wfp-step-body">
              Your labeled card goes live on your scheduled start date inside your local radius, and your crawlable partner page enters our sitemap.
            </p>
          </div>
          <div className="wfp-step-card">
            <div className="wfp-step-num">STEP 05</div>
            <h3 className="wfp-step-title">Customers Discover &amp; Book Direct</h3>
            <p className="wfp-step-body">
              Nearby locals and visitors tap straight to your booking system with <code>utm_source=wayfind</code> so you can track every click.
            </p>
          </div>
        </div>
      </section>

      {/* ── 6. VERIFIED SUBSTANCE + EDITORIAL INDEPENDENCE ─────────────────── */}
      <div className="wfp-two-col">
        <section className="wfp-panel" aria-labelledby="wfp-substance-heading">
          <div>
            <div className="wfp-panel-kicker">Verified Platform Substance</div>
            <h2 id="wfp-substance-heading" className="wfp-panel-title">Why Florida Businesses Partner With Wayfind</h2>
            <p style={{ ...S.body, fontSize: 14, color: "#CBD5E1", marginBottom: 4 }}>
              Wayfind is built specifically for high-intent local discovery — people opening their phone to choose a real place worth leaving home for today.
            </p>
            <ul className="wfp-auth-list">
              <li className="wfp-auth-item">
                <strong>{VERIFIED_FLORIDA_CITY_COUNT} Covered Florida Cities &amp; Coastal Hubs</strong>
                <span>Active local discovery across Tampa Bay, Sarasota &amp; the Gulf Coast islands, Orlando, Miami, Fort Lauderdale, Naples, St. Augustine, Destin, Pensacola, and more.</span>
              </li>
              <li className="wfp-auth-item">
                <strong>{VERIFIED_LIVE_GUIDE_COUNT} Published Florida Local Guides</strong>
                <span>Search-indexed Florida guides covering dining, boat tours, springs, beaches, rainy-day plans, date nights, and seasonal events.</span>
              </li>
              <li className="wfp-auth-item">
                <strong>Web + iOS Discovery Experience</strong>
                <span>Fast mobile web, desktop, and iOS Universal Links experience designed for travelers and locals making on-the-spot decisions.</span>
              </li>
              <li className="wfp-auth-item">
                <strong>Crawlable Schema.org Business Pages</strong>
                <span>Every full partner page ships with clean <code>LocalBusiness</code> structured data, sitemap inclusion, and direct outbound attribution.</span>
              </li>
            </ul>
          </div>
        </section>

        <section className="wfp-panel" aria-labelledby="wfp-editorial-trust">
          <div>
            <div className="wfp-panel-kicker">Editorial Independence · Why Readers Trust Us</div>
            <h2 id="wfp-editorial-trust" className="wfp-panel-title">What Sponsorship Never Buys</h2>
            <p style={{ ...S.body, fontSize: 14.5 }}>
              Rankings, list order, guide picks, and the Wayfind Score are never paid for, and affiliate commission never
              changes them. That card does not buy a place on any Wayfind list, guide or ranking, it does not move anyone up
              one, and it does not buy a Wayfind Score. Every score on this site — theirs included — comes from the same
              formula, applied to the same public review data, and no amount of money moves it. A labeled sponsorship has no
              effect on a Wayfind Score. List order and scores are covered by our{" "}
              <a href="/editorial-policy" style={{ color: "#5EEAD4", fontWeight: 700 }}>editorial policy</a> and{" "}
              <a href="/how-wayfind-ranks" style={{ color: "#5EEAD4", fontWeight: 700 }}>how we rank</a>.
            </p>
            <p style={{ ...S.body, fontSize: 14, color: "#94A3B8" }}>
              Why that matters for your business: when readers know our organic rankings cannot be bought, they actually trust Wayfind — which makes a clearly labeled sponsorship alongside our discovery surfaces far more credible than a pay-to-play directory.
            </p>
          </div>
          <div style={{ marginTop: 12, padding: "14px 16px", borderRadius: 14, background: "rgba(15,23,42,.65)", border: "1px solid #1E293B", fontSize: 13, color: "#94A3B8", lineHeight: 1.55 }}>
            <strong style={{ color: "#E2E8F0" }}>Clear separation of editorial &amp; sponsorship:</strong> Every paid card is labeled <em>Sponsored · Paid partner</em> and appears only on supported sponsorship surfaces outside ranked lists.
          </div>
        </section>
      </div>

      {/* ── 7. FINAL CONVERSION BANNER ─────────────────────────────────────── */}
      <section className="wfp-cta-banner" aria-label="Inquire about a sponsored placement">
        <div style={{ maxWidth: 620 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: "#5EEAD4", marginBottom: 6 }}>
            Ready to Feature Your Florida Business?
          </div>
          <h2 style={{ fontSize: 23, fontWeight: 850, color: "#FFFFFF", margin: "0 0 6px", letterSpacing: "-.3px" }}>
            Start your inquiry in under a minute.
          </h2>
          <p style={{ fontSize: 14, color: "#CBD5E1", lineHeight: 1.55, margin: 0 }}>
            Choose <strong>$99/week</strong>, <strong>$199/month</strong>, or the <strong>$299/quarter Holiday Promo (~$3.32/day)</strong> — or email{" "}
            <strong>{PARTNER_CONTACT_EMAIL}</strong> with your business name and Florida city and we&rsquo;ll help you pick the right flight.
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <PartnerInquiryLink
            href={partnerPackageMailto(PARTNER_PACKAGES[2])}
            packageId="quarterly"
            packageName="Quarterly Sponsorship"
            priceUsd={299}
            billingPeriod="quarter"
            placement="bottom_banner_quarterly"
            className="wfp-btn-primary"
            ariaLabel={`Inquire about Quarterly Sponsorship ($299/quarter) via ${PARTNER_CONTACT_EMAIL}`}
          >
            Inquire about $299/Quarter <span aria-hidden="true">→</span>
          </PartnerInquiryLink>
          <PartnerInquiryLink
            href={generalMailto}
            packageId="general"
            placement="bottom_banner"
            className="wfp-btn-secondary"
            ariaLabel={`Email ${PARTNER_CONTACT_EMAIL} with a general sponsorship question`}
          >
            Email {PARTNER_CONTACT_EMAIL}
          </PartnerInquiryLink>
        </div>
      </section>

      <p style={S.disc}>
        Wayfind does not sell placement in its lists, guides or rankings. The card on this page is a labeled sponsorship
        (Sponsored · Paid partner). It is not a place on those lists.
      </p>
    </div>
  );
}
