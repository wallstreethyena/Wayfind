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
import { PartnerInquiryLink, PartnerEmailFallback } from "../app/components/PartnerInquiryControls";
import { siteTodayStr } from "./siteTime.js";
import { SPONSORED_PLACES, sponsorBySlug, sponsorHasPage, sponsoredHref, sponsoredIsLive, sponsoredPublicScore, sponsoredSnapshotFresh } from "./sponsoredPlaces.js";

const FONT = "var(--wf-sans), system-ui, -apple-system, sans-serif";

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
  const title = "Partners on Wayfind — sponsorships, labelled and kept out of our rankings";
  const description =
    "Rio Body Wax in Gastonia is a labeled sponsor. Rankings, list order, guide picks, and the Wayfind Score are never paid for, and affiliate commission never changes them. The label is Sponsored · Paid partner, and the card sits outside ranked lists.";
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
    <div style={S.wrap}>
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
            <a
              href={book}
              target="_blank"
              rel="sponsored nofollow noopener"
              style={{
                display: "inline-flex", alignItems: "center", gap: 9, minHeight: 50, padding: "13px 24px", borderRadius: 12,
                background: accent, color: "#FFFFFF", fontWeight: 800, fontSize: 15, textDecoration: "none",
                boxShadow: `0 8px 22px -10px ${accent}`,
              }}
            >
              {s.cta} <span aria-hidden="true">→</span>
            </a>
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
    durationLabel: "1 week (7-day flight)",
    promoBadge: null,
    featured: false,
    summary: "A 7-day sponsored placement for weekend events, night markets, pop-ups, or a one-week local feature.",
    benefits: Object.freeze([
      "7-day geo-gated Sponsored · Paid partner card in your local area (15–20 mi radius)",
      "Unlimited photos & service menu on a dedicated, crawlable /partners page",
      "Direct booking or event link stamped with utm_source=wayfind",
      "Seen in-app by visitors exploring Florida within your local service radius",
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
    durationLabel: "1 month (30-day flight)",
    promoBadge: null,
    featured: false,
    summary: "A 30-day sponsored placement for charters, restaurants, studios, and local experiences.",
    benefits: Object.freeze([
      "30-day geo-gated Sponsored · Paid partner card in your local area (15–20 mi radius)",
      "Unlimited photos & service menu on a dedicated, crawlable /partners page",
      "Direct booking link, phone call button & Google Maps directions",
      "Seen in-app by visitors exploring Florida within your local service radius",
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
    durationLabel: "1 quarter (90-day flight)",
    promoBadge: "Holiday Promo",
    featured: true,
    summary: "A 90-day sponsored placement for continuous seasonal visibility across a full 3-month quarter.",
    benefits: Object.freeze([
      "90-day geo-gated Sponsored · Paid partner card in your local area (15–20 mi radius)",
      "Unlimited photos & service menu on a dedicated, crawlable /partners page",
      "Direct booking link, phone call button & Google Maps directions",
      "Seen in-app by visitors exploring Florida within your local service radius",
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
.wfp-page{max-width:1060px;margin:0 auto;padding:28px 20px 84px;color:#F1F5F9;font-family:var(--wf-sans),system-ui,-apple-system,sans-serif;box-sizing:border-box;overflow-wrap:break-word}
.wfp-page *,.wfp-page *::before,.wfp-page *::after{box-sizing:border-box}
.wfp-crumb{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px 16px;font-size:12.5px;color:#94A3B8;margin-bottom:20px}
.wfp-crumb a{color:#94A3B8;text-decoration:none;transition:color .16s ease}
.wfp-crumb a:hover{color:#F1F5F9}
.wfp-hero{position:relative;border-radius:24px;padding:40px 36px 36px;background:radial-gradient(120% 120% at 88% 0%,rgba(20,184,166,.16) 0%,rgba(249,115,22,.08) 42%,rgba(18,22,31,.96) 78%),linear-gradient(180deg,#111827 0%,#0B101B 100%);border:1px solid rgba(45,212,191,.24);box-shadow:0 24px 60px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08);overflow:hidden}
.wfp-eyebrow{display:inline-flex;align-items:center;gap:8px;padding:6px 13px;border-radius:999px;background:rgba(20,184,166,.12);border:1px solid rgba(45,212,191,.32);color:#5EEAD4;font-size:11px;font-weight:800;letter-spacing:1.1px;text-transform:uppercase;margin-bottom:16px;max-width:100%}
.wfp-eyebrow-dot{width:7px;height:7px;flex-shrink:0;border-radius:50%;background:#14B8A6;box-shadow:0 0 10px #14B8A6}
.wfp-h1{font-size:clamp(30px,4.5vw,46px);font-weight:850;line-height:1.08;letter-spacing:-1px;margin:0 0 10px;color:#FFFFFF}
.wfp-hero-sub{font-size:clamp(17px,2.2vw,21px);font-weight:700;line-height:1.38;color:#E2E8F0;max-width:740px;margin:0 0 14px;letter-spacing:-.2px}
.wfp-hero-lede{font-size:15.5px;color:#CBD5E1;line-height:1.62;max-width:720px;margin:0}
.wfp-hero-actions{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:24px}
.wfp-btn-primary{display:inline-flex;align-items:center;justify-content:center;gap:9px;min-height:48px;padding:12px 22px;border-radius:999px;background:linear-gradient(180deg,#14B8A6 0%,#0D9488 100%);color:#FFFFFF;font-size:14.5px;font-weight:800;text-align:center;text-decoration:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.28),0 10px 24px -6px rgba(13,148,136,.55);transition:transform .16s ease,filter .16s ease;max-width:100%}
.wfp-btn-primary:hover{transform:translateY(-1px);filter:brightness(1.06)}
.wfp-btn-secondary{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:12px 20px;border-radius:999px;background:rgba(255,255,255,.05);border:1.5px solid #2D3748;color:#F1F5F9;font-size:14px;font-weight:800;text-align:center;text-decoration:none;transition:background .16s ease,border-color .16s ease;max-width:100%}
.wfp-btn-secondary:hover{background:rgba(255,255,255,.09);border-color:#4A5568}
.wfp-pillars-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:28px;padding-top:24px;border-top:1px solid rgba(255,255,255,.08)}
.wfp-pillar-mini{display:flex;align-items:flex-start;gap:11px;min-width:0}
.wfp-pillar-mini-icon{flex:0 0 34px;width:34px;height:34px;border-radius:10px;background:rgba(20,184,166,.12);border:1px solid rgba(45,212,191,.25);color:#2DD4BF;display:grid;place-items:center}
.wfp-pillar-mini-title{font-size:13.5px;font-weight:800;color:#F8FAFC;margin:0 0 2px}
.wfp-pillar-mini-desc{font-size:12.5px;color:#94A3B8;line-height:1.45;margin:0}

.wfp-pkg-section{margin-top:44px;border-radius:24px;padding:40px 32px;background:linear-gradient(180deg,#0E1522 0%,#0A0F19 100%);border:1px solid #1E293B;box-shadow:0 20px 50px rgba(0,0,0,.38)}
.wfp-sec-header{text-align:center;max-width:720px;margin:0 auto 36px}
.wfp-sec-kicker{font-size:11px;font-weight:800;letter-spacing:1.3px;text-transform:uppercase;color:#2DD4BF;margin-bottom:8px}
.wfp-sec-title{font-size:clamp(22px,3.4vw,34px);font-weight:850;line-height:1.14;letter-spacing:-.6px;color:#FFFFFF;margin:0 0 10px}
.wfp-sec-sub{font-size:15px;color:#94A3B8;line-height:1.55;margin:0}

.wfp-showcase-grid{display:grid;grid-template-columns:1fr 304px 1fr;gap:26px;align-items:center}
.wfp-feature-col{display:flex;flex-direction:column;gap:20px;min-width:0}
.wfp-feature-card{background:rgba(18,24,36,.85);border:1px solid #26303B;border-radius:18px;padding:22px 20px;transition:border-color .18s ease,transform .18s ease;min-width:0}
.wfp-feature-card:hover{border-color:rgba(45,212,191,.4);transform:translateY(-2px)}
.wfp-feature-icon{width:52px;height:52px;border-radius:14px;background:rgba(13,148,136,.14);border:1px solid rgba(45,212,191,.28);color:#2DD4BF;display:grid;place-items:center;margin-bottom:14px}
.wfp-feature-title{font-size:17.5px;font-weight:800;color:#FFFFFF;margin:0 0 7px;letter-spacing:-.2px}
.wfp-feature-desc{font-size:14px;color:#CBD5E1;line-height:1.55;margin:0}

.wfp-phone-wrap{display:flex;flex-direction:column;align-items:center;min-width:0;max-width:100%}
.wfp-phone-example-tag{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:rgba(148,163,184,.12);border:1px solid rgba(148,163,184,.28);color:#CBD5E1;font-size:10.5px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;margin-bottom:10px;text-align:center}
.wfp-phone{width:288px;max-width:100%;border-radius:40px;padding:10px;background:linear-gradient(145deg,#2D3748 0%,#111827 50%,#1E293B 100%);border:2px solid #334155;box-shadow:0 28px 64px rgba(0,0,0,.65),0 0 0 1px rgba(255,255,255,.06)}
.wfp-phone-screen{border-radius:30px;background:#F8FAFC;color:#0F172A;overflow:hidden;padding-bottom:14px}
.wfp-phone-notch{width:82px;height:20px;background:#090D16;border-radius:999px;margin:9px auto 8px}
.wfp-phone-topbar{display:flex;align-items:center;justify-content:space-between;padding:4px 14px 10px}
.wfp-phone-brand{display:inline-flex;align-items:center;gap:6px;font-size:15px;font-weight:850;color:#0F172A;letter-spacing:-.3px}
.wfp-phone-card{margin:0 10px;border-radius:16px;overflow:hidden;background:#FFFFFF;border:1px solid #E2E8F0;box-shadow:0 10px 25px rgba(15,23,42,.08)}
.wfp-phone-media{position:relative;height:180px;background:linear-gradient(180deg,#1E3A5F 0%,#C2410C 52%,#F59E0B 82%,#0F172A 100%);overflow:hidden}
.wfp-phone-badge{position:absolute;top:10px;left:10px;z-index:2;padding:4px 10px;border-radius:999px;background:#0F766E;color:#FFFFFF;font-size:10px;font-weight:800;letter-spacing:.3px}
.wfp-phone-overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(9,13,22,.1) 0%,rgba(9,13,22,.22) 45%,rgba(9,13,22,.82) 100%);display:flex;flex-direction:column;justify-content:flex-end;padding:12px}
.wfp-phone-card-title{font-size:17px;font-weight:850;line-height:1.15;color:#FFFFFF;margin:0 0 3px;text-shadow:0 2px 8px rgba(0,0,0,.45)}
.wfp-phone-card-loc{font-size:12px;font-weight:600;color:#E2E8F0;margin:0}
.wfp-phone-body{padding:12px 12px 13px}
.wfp-phone-meta{display:flex;align-items:center;gap:5px;font-size:12px;font-weight:750;color:#0F172A;margin-bottom:6px}
.wfp-phone-copy{font-size:12px;color:#475569;line-height:1.45;margin:0 0 11px}
.wfp-phone-cta{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:9px 12px;border-radius:999px;background:#0F766E;color:#FFFFFF;font-size:12.5px;font-weight:800;text-align:center}
.wfp-phone-caption{font-size:11.5px;color:#94A3B8;text-align:center;margin-top:11px;max-width:260px;line-height:1.45}

.wfp-pricing-divider{display:flex;align-items:center;justify-content:center;gap:14px;margin:40px 0 10px}
.wfp-pricing-line{flex:1;max-width:140px;height:1.5px;background:linear-gradient(90deg,transparent,rgba(45,212,191,.5),transparent)}
.wfp-pricing-heading{font-size:20px;font-weight:850;color:#FFFFFF;letter-spacing:-.3px;margin:0;text-align:center}
.wfp-pricing-intro{text-align:center;font-size:13.5px;color:#94A3B8;line-height:1.55;max-width:680px;margin:0 auto 24px}
.wfp-pricing-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;align-items:stretch}
.wfp-price-card{display:flex;flex-direction:column;justify-content:space-between;border-radius:20px;padding:24px 20px;background:#121824;border:1px solid #26303B;transition:transform .18s ease,border-color .18s ease;min-width:0}
.wfp-price-card:hover{transform:translateY(-2px);border-color:#3B4A5E}
.wfp-price-card.is-featured{background:linear-gradient(165deg,#0F766E 0%,#0B4F4A 55%,#092E2E 100%);border:1.5px solid #2DD4BF;box-shadow:0 20px 44px -12px rgba(20,184,166,.4),inset 0 1px 0 rgba(255,255,255,.22);position:relative}
.wfp-promo-pill{display:inline-flex;align-self:flex-start;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.16);color:#CCFBF1;font-size:10.5px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;margin-bottom:10px}
.wfp-tier-name{font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#94A3B8;margin:0 0 8px}
.wfp-price-card.is-featured .wfp-tier-name{color:#99F6E4}
.wfp-price-row{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;margin-bottom:6px}
.wfp-price-amount{font-size:38px;font-weight:900;letter-spacing:-1.2px;color:#FFFFFF;line-height:1}
.wfp-price-period{font-size:16px;font-weight:700;color:#CBD5E1}
.wfp-price-card.is-featured .wfp-price-period{color:#E6FFFA}
.wfp-price-duration{display:inline-block;font-size:12px;font-weight:700;color:#5EEAD4;background:rgba(20,184,166,.12);border:1px solid rgba(45,212,191,.24);border-radius:8px;padding:3px 9px;margin-bottom:10px}
.wfp-price-card.is-featured .wfp-price-duration{color:#E6FFFA;background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.28)}
.wfp-price-sub{font-size:13px;color:#94A3B8;line-height:1.45;margin:0 0 14px}
.wfp-price-card.is-featured .wfp-price-sub{color:#CCFBF1}
.wfp-price-list{list-style:none;padding:0;margin:0 0 18px;display:grid;gap:9px;font-size:13px;color:#E2E8F0;line-height:1.45}
.wfp-price-list li{display:flex;align-items:flex-start;gap:8px}
.wfp-price-check{color:#2DD4BF;font-weight:900;flex-shrink:0}
.wfp-price-card.is-featured .wfp-price-check{color:#A7F3D0}
.wfp-price-next{font-size:11.5px;color:#94A3B8;margin:0 0 12px;line-height:1.4}
.wfp-price-card.is-featured .wfp-price-next{color:#CCFBF1}
.wfp-price-cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:46px;padding:11px 14px;border-radius:12px;background:#1E293B;border:1px solid #334155;color:#F8FAFC;font-size:13.5px;font-weight:800;text-align:center;text-decoration:none;transition:background .16s ease,border-color .16s ease}
.wfp-price-cta:hover{background:#283548;border-color:#475569}
.wfp-price-card.is-featured .wfp-price-cta{background:#FFFFFF;border-color:#FFFFFF;color:#0F4C46;box-shadow:0 8px 20px rgba(0,0,0,.25)}
.wfp-price-card.is-featured .wfp-price-cta:hover{background:#F0FDFA}

.wfp-email-fallback{margin-top:20px;padding:16px 18px;border-radius:16px;background:rgba(18,24,36,.9);border:1px solid #26303B}
.wfp-email-fallback-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px}
.wfp-email-fallback-text{font-size:13px;color:#CBD5E1;line-height:1.55;flex:1 1 280px;min-width:0}
.wfp-email-code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12.5px;font-weight:700;color:#5EEAD4;background:rgba(20,184,166,.12);border:1px solid rgba(45,212,191,.28);border-radius:6px;padding:2px 7px;word-break:break-all}
.wfp-copy-email-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;padding:9px 16px;border-radius:999px;background:#1E293B;border:1px solid #334155;color:#F8FAFC;font:inherit;font-size:13px;font-weight:800;cursor:pointer;transition:background .16s ease,border-color .16s ease;flex-shrink:0;max-width:100%}
.wfp-copy-email-btn:hover{background:#283548;border-color:#475569}

.wfp-steps-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin-top:32px}
.wfp-step-card{background:#12161F;border:1px solid #26303B;border-radius:18px;padding:20px;min-width:0}
.wfp-step-num{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:rgba(249,115,22,.14);border:1px solid rgba(249,115,22,.35);color:#FB923C;font-size:12px;font-weight:800;margin-bottom:10px}
.wfp-step-title{font-size:15.5px;font-weight:800;color:#F8FAFC;margin:0 0 6px}
.wfp-step-body{font-size:13.5px;color:#94A3B8;line-height:1.55;margin:0}

.wfp-two-col{display:grid;grid-template-columns:1.05fr .95fr;gap:22px;margin-top:36px;align-items:stretch}
.wfp-panel{background:#12161F;border:1px solid #26303B;border-radius:20px;padding:26px 24px;display:flex;flex-direction:column;justify-content:space-between;min-width:0}
.wfp-panel-kicker{font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#94A3B8;margin-bottom:8px}
.wfp-panel-title{font-size:21px;font-weight:850;color:#FFFFFF;margin:0 0 10px;letter-spacing:-.3px}
.wfp-partner-card{display:flex;gap:14px;align-items:stretch;border:1px solid #2D3748;background:#161C28;border-radius:16px;overflow:hidden;text-decoration:none;color:inherit;margin-top:14px;transition:border-color .18s ease,transform .18s ease;min-width:0}
.wfp-partner-card:hover{border-color:#2DD4BF;transform:translateY(-2px)}
.wfp-partner-thumb{position:relative;width:132px;flex-shrink:0;background:#10141d}
.wfp-cta-banner{margin-top:36px;border-radius:22px;padding:30px 28px;background:linear-gradient(135deg,#131C2E 0%,#0D131F 100%);border:1px solid #26303B;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:20px}

@media(max-width:920px){
  .wfp-showcase-grid{grid-template-columns:1fr;gap:22px}
  .wfp-phone-wrap{order:-1;margin-bottom:6px}
  .wfp-pricing-grid{grid-template-columns:1fr}
  .wfp-pillars-strip{grid-template-columns:1fr}
  .wfp-steps-grid{grid-template-columns:1fr}
  .wfp-two-col{grid-template-columns:1fr}
}
@media(max-width:540px){
  .wfp-page{padding:18px 14px 64px}
  .wfp-hero{padding:24px 18px 22px;border-radius:20px}
  .wfp-pkg-section{padding:24px 16px;border-radius:20px;margin-top:28px}
  .wfp-partner-thumb{width:96px}
  .wfp-cta-banner{padding:22px 18px}
  .wfp-panel{padding:22px 18px}
}
@media(max-width:360px){
  .wfp-page{padding:14px 10px 56px}
  .wfp-hero{padding:20px 14px 18px}
  .wfp-pkg-section{padding:20px 12px}
  .wfp-partner-card{flex-direction:column}
  .wfp-partner-thumb{width:100%;height:140px}
}
`;

export function PartnersIndexPage() {
  const rows = SPONSORED_PLACES.filter(sponsorHasPage);
  const generalMailto = partnerPackageMailto(null);
  return (
    <div className="wfp-page">
      <style dangerouslySetInnerHTML={{ __html: PARTNERS_INDEX_CSS }} />
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
          Partner inquiries: {PARTNER_CONTACT_EMAIL} →
        </PartnerInquiryLink>
      </nav>

      {/* ── EXECUTIVE HERO ─────────────────────────────────────────────────── */}
      <section className="wfp-hero">
        <div className="wfp-eyebrow">
          <span className="wfp-eyebrow-dot" aria-hidden="true" />
          <span>Florida &amp; Local Discovery · Labeled Sponsorships</span>
        </div>
        <h1 className="wfp-h1">Partners on Wayfind</h1>
        <p className="wfp-hero-sub">
          Put your venue or experience in front of visitors and locals exploring your area — clearly labeled and kept outside ranked lists.
        </p>
        <p className="wfp-hero-lede">
          Wayfind connects local experiences, charters, studios, restaurants, and events with people deciding where to go next.
          Each sponsorship pairs a geo-gated in-app discovery card with a dedicated, crawlable partner page — while keeping our editorial rankings and Wayfind Scores 100% independent.
        </p>
        <div className="wfp-hero-actions">
          <a href="#partner-packages" className="wfp-btn-primary">
            View Sponsored Packages <span aria-hidden="true">↓</span>
          </a>
          <PartnerInquiryLink
            href={generalMailto}
            packageId="general"
            placement="hero_secondary"
            className="wfp-btn-secondary"
            ariaLabel={`Email ${PARTNER_CONTACT_EMAIL} to inquire about becoming a Sponsored Partner`}
          >
            Email to Inquire ({PARTNER_CONTACT_EMAIL}) <span aria-hidden="true">→</span>
          </PartnerInquiryLink>
          <ShareButton url={pageShareUrl("/partners")} title="Partners on Wayfind"
            text="The local businesses that have sponsored a labelled card on Wayfind, and what that never buys."
            label="Share" tone="dark" event="page_share" meta={{ surface: "partners_index", placement: "header" }} />
        </div>

        <div className="wfp-pillars-strip">
          <div className="wfp-pillar-mini">
            <div className="wfp-pillar-mini-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12Z"/><circle cx="12" cy="9" r="2.5"/></svg>
            </div>
            <div>
              <div className="wfp-pillar-mini-title">15–20 Mile Geo-Gated Reach</div>
              <p className="wfp-pillar-mini-desc">Your in-app card only serves to readers browsing inside your local service radius.</p>
            </div>
          </div>
          <div className="wfp-pillar-mini">
            <div className="wfp-pillar-mini-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            </div>
            <div>
              <div className="wfp-pillar-mini-title">Direct Booking &amp; UTM Attribution</div>
              <p className="wfp-pillar-mini-desc">Every outbound tap goes straight to your booking page stamped with <code>utm_source=wayfind</code>.</p>
            </div>
          </div>
          <div className="wfp-pillar-mini">
            <div className="wfp-pillar-mini-icon" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
            </div>
            <div>
              <div className="wfp-pillar-mini-title">Transparent Labeling</div>
              <p className="wfp-pillar-mini-desc">Clearly labeled <em>Sponsored · Paid partner</em> outside ranked lists so reader trust stays intact.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── PACKAGE ILLUSTRATION & SHOWCASE ────────────────────────────────── */}
      <section id="partner-packages" className="wfp-pkg-section" aria-labelledby="wfp-pkg-heading">
        <div className="wfp-sec-header">
          <div className="wfp-sec-kicker">Wayfind · Florida Local Discovery</div>
          <h2 id="wfp-pkg-heading" className="wfp-sec-title">What You Get as a Wayfind Sponsored Partner</h2>
          <p className="wfp-sec-sub">
            Clear local sponsorship flights that pair an in-app discovery card with a dedicated partner page and direct link to your booking calendar.
          </p>
        </div>

        <div className="wfp-showcase-grid">
          {/* Left column features */}
          <div className="wfp-feature-col">
            <div className="wfp-feature-card">
              <div className="wfp-feature-icon" aria-hidden="true">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              </div>
              <h3 className="wfp-feature-title">Featured Sponsored Card</h3>
              <p className="wfp-feature-desc">
                A clearly labeled card shown alongside Wayfind&rsquo;s picks, outside ranked lists — visible in-app to visitors browsing inside your local area.
              </p>
            </div>

            <div className="wfp-feature-card">
              <div className="wfp-feature-icon" aria-hidden="true">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="18" x="3" y="3" rx="3" ry="3"/>
                  <circle cx="9" cy="9" r="2"/>
                  <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                </svg>
              </div>
              <h3 className="wfp-feature-title">Unlimited Photos</h3>
              <p className="wfp-feature-desc">
                Showcase your experience with as many photos as you want, presented alongside your service menu on a dedicated <code>/partners</code> page.
              </p>
            </div>
          </div>

          {/* Center phone preview */}
          <div className="wfp-phone-wrap" role="img" aria-label="Illustrative example of how a Sponsored · Paid partner card looks on mobile. Fictional sample business.">
            <span className="wfp-phone-example-tag">Example Illustration · Sample Business</span>
            <div className="wfp-phone" aria-hidden="true">
              <div className="wfp-phone-screen">
                <div className="wfp-phone-notch" />
                <div className="wfp-phone-topbar">
                  <span className="wfp-phone-brand">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#0F766E"><path d="M12 2C7.58 2 4 5.58 4 10c0 5.25 8 12 8 12s8-6.75 8-12c0-4.42-3.58-8-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/></svg>
                    Wayfind
                  </span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth="2.2" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>
                </div>
                <div className="wfp-phone-card">
                  <div className="wfp-phone-media">
                    {/* Coastal sunset sailboat illustration */}
                    <svg viewBox="0 0 300 200" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0 }}>
                      <defs>
                        <linearGradient id="wfpSky" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#1E293B" />
                          <stop offset="38%" stopColor="#9A3412" />
                          <stop offset="68%" stopColor="#F59E0B" />
                          <stop offset="100%" stopColor="#FDE68A" />
                        </linearGradient>
                        <linearGradient id="wfpSea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#7C2D12" />
                          <stop offset="40%" stopColor="#1E293B" />
                          <stop offset="100%" stopColor="#090D16" />
                        </linearGradient>
                      </defs>
                      <rect width="300" height="118" fill="url(#wfpSky)" />
                      <circle cx="115" cy="96" r="24" fill="#FEF08A" opacity="0.85" />
                      <rect y="114" width="300" height="86" fill="url(#wfpSea)" />
                      <ellipse cx="115" cy="128" rx="42" ry="3" fill="#FDE047" opacity="0.45" />
                      <ellipse cx="115" cy="138" rx="28" ry="2" fill="#FDBA74" opacity="0.35" />
                      {/* Sailboat */}
                      <polygon points="195,34 195,108 160,108" fill="#0F172A" />
                      <polygon points="199,42 199,108 226,108" fill="#1E293B" />
                      <polygon points="154,112 232,112 222,122 164,122" fill="#090D16" />
                    </svg>
                    <span className="wfp-phone-badge">Sponsored · Paid partner</span>
                    <div className="wfp-phone-overlay">
                      <div className="wfp-phone-card-title">Sunset Sailing Charter</div>
                      <p className="wfp-phone-card-loc">Key West, Florida</p>
                    </div>
                  </div>
                  <div className="wfp-phone-body">
                    <div className="wfp-phone-meta">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="#0F766E"><path d="M12 2C7.58 2 4 5.58 4 10c0 5.25 8 12 8 12s8-6.75 8-12c0-4.42-3.58-8-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/></svg>
                      Waterfront · Adventure
                    </div>
                    <p className="wfp-phone-copy">Relaxing sunset sail with drinks and snacks included.</p>
                    <div className="wfp-phone-cta">
                      Book Now <span>›</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="wfp-phone-caption">
              Illustrative preview only — not an active sponsor or customer result. See the live directory below for active placements.
            </div>
          </div>

          {/* Right column features */}
          <div className="wfp-feature-col">
            <div className="wfp-feature-card">
              <div className="wfp-feature-icon" aria-hidden="true">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                </svg>
              </div>
              <h3 className="wfp-feature-title">Direct Booking Link</h3>
              <p className="wfp-feature-desc">
                Send visitors straight to your booking page. More bookings, less friction — stamped with <code>utm_source=wayfind</code> so you can verify traffic in your own analytics.
              </p>
            </div>

            <div className="wfp-feature-card">
              <div className="wfp-feature-icon" aria-hidden="true">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <h3 className="wfp-feature-title">Seen by Visitors Planning Their Florida Trip</h3>
              <p className="wfp-feature-desc">
                Your business appears in-app for travelers exploring Florida right now when they are browsing inside your local service radius.
              </p>
            </div>
          </div>
        </div>

        {/* ── PRICING TIERS ────────────────────────────────────────────────── */}
        <div className="wfp-pricing-divider">
          <span className="wfp-pricing-line" aria-hidden="true" />
          <h3 className="wfp-pricing-heading">Simple Pricing. Great Value.</h3>
          <span className="wfp-pricing-line" aria-hidden="true" />
        </div>
        <p className="wfp-pricing-intro">
          Every package includes all four benefits above for your chosen flight duration. Selecting a package below opens a pre-filled email inquiry to <strong>{PARTNER_CONTACT_EMAIL}</strong> — our team replies directly to confirm your venue details and launch date.
        </p>

        <div className="wfp-pricing-grid">
          {PARTNER_PACKAGES.map((pkg) => {
            const href = partnerPackageMailto(pkg);
            return (
              <div key={pkg.id} className={`wfp-price-card${pkg.featured ? " is-featured" : ""}`}>
                <div>
                  {pkg.promoBadge ? (
                    <span className="wfp-promo-pill">{pkg.promoBadge}</span>
                  ) : null}
                  <div className="wfp-tier-name">{pkg.name}</div>
                  <div className="wfp-price-row">
                    <span className="wfp-price-amount">{pkg.priceDisplay}</span>
                    <span className="wfp-price-period">{pkg.periodDisplay}</span>
                  </div>
                  <div className="wfp-price-duration">Duration: {pkg.durationLabel}</div>
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
                    Next step: Opens an email inquiry to {PARTNER_CONTACT_EMAIL}
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

        <PartnerEmailFallback email={PARTNER_CONTACT_EMAIL} placement="pricing_section" />
      </section>

      {/* ── HOW IT WORKS IN 3 STEPS ────────────────────────────────────────── */}
      <section aria-label="How partnering works">
        <div className="wfp-steps-grid">
          <div className="wfp-step-card">
            <div className="wfp-step-num">01</div>
            <h3 className="wfp-step-title">Inquire by Email with Your Package</h3>
            <p className="wfp-step-body">
              Select the $99/week, $199/month, or $299/quarter Holiday Promo package above to email <code>{PARTNER_CONTACT_EMAIL}</code> with your business name, location, and booking URL.
            </p>
          </div>
          <div className="wfp-step-card">
            <div className="wfp-step-num">02</div>
            <h3 className="wfp-step-title">We Build Your Card &amp; Partner Page</h3>
            <p className="wfp-step-body">
              Our team prepares your geo-gated in-app card and your dedicated <code>/partners</code> page using your verified service menu, photos, and booking link.
            </p>
          </div>
          <div className="wfp-step-card">
            <div className="wfp-step-num">03</div>
            <h3 className="wfp-step-title">Go Live for Your Scheduled Flight</h3>
            <p className="wfp-step-body">
              Your labeled placement goes live for your 1-week, 1-month, or 1-quarter flight. Outbound clicks carry <code>utm_source=wayfind</code> so you can see traffic in your own analytics.
            </p>
          </div>
        </div>
      </section>

      {/* ── LIVE SPONSORS & EDITORIAL INTEGRITY ────────────────────────────── */}
      <div className="wfp-two-col">
        <section className="wfp-panel" aria-labelledby="wfp-live-sponsors">
          <div>
            <div className="wfp-panel-kicker">Active Directory</div>
            <h2 id="wfp-live-sponsors" className="wfp-panel-title">Live Sponsored Partners</h2>
            <p style={{ ...S.body, fontSize: 14.5, marginBottom: 14 }}>
              Rio Body Wax in Gastonia is a labeled sponsor on Wayfind. The label is &ldquo;Sponsored · Paid partner.&rdquo;
              The card sits outside ranked lists, and this page names that sponsorship.
            </p>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {rows.map((s) => {
              const branch = branchOf(s);
              const score = sponsoredPublicScore(s);
              const thumb = photoUrl(s, 480);
              return (
                <a
                  key={s.id}
                  href={`/partners/${s.id}`}
                  className="wfp-partner-card"
                >
                  <div className="wfp-partner-thumb">
                    {thumb ? (
                      <SafeImg
                        src={thumb}
                        alt={`${s.advertiser}${branch ? " " + branch : ""} storefront`}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: s.photoPosition || "50% 50%" }}
                      />
                    ) : null}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, padding: "14px 16px" }}>
                    <div style={{ display: "inline-block", fontSize: 9.5, fontWeight: 800, letterSpacing: "0.8px", textTransform: "uppercase", color: "#5EEAD4", background: "rgba(20,184,166,.12)", border: "1px solid rgba(45,212,191,.28)", borderRadius: 999, padding: "3px 9px", marginBottom: 7 }}>
                      {s.label}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 850, color: "#FFFFFF", lineHeight: 1.25 }}>{s.advertiser}</div>
                    <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 3 }}>
                      {branch}
                      {score != null ? ` · Wayfind Score ${(score / 10).toFixed(1)}` : ""}
                    </div>
                    {s.headline ? (
                      <div style={{ fontSize: 12.5, color: "#CBD5E1", marginTop: 6, lineHeight: 1.4 }}>{s.headline}</div>
                    ) : null}
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: "#2DD4BF", marginTop: 8 }}>
                      View live partner page →
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </section>

        <section className="wfp-panel" aria-labelledby="wfp-editorial-trust">
          <div>
            <div className="wfp-panel-kicker">Editorial Independence</div>
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
          </div>
          <div style={{ marginTop: 14, padding: "14px 16px", borderRadius: 14, background: "rgba(15,23,42,.65)", border: "1px solid #1E293B", fontSize: 13, color: "#94A3B8", lineHeight: 1.55 }}>
            <strong style={{ color: "#E2E8F0" }}>Clear separation of editorial &amp; sponsorship:</strong> Every paid card is labeled <em>Sponsored · Paid partner</em> and appears only on supported sponsorship surfaces outside ranked lists.
          </div>
        </section>
      </div>

      {/* ── PARTNER INQUIRY BANNER ─────────────────────────────────────────── */}
      <section className="wfp-cta-banner" aria-label="Inquire about a sponsored placement">
        <div style={{ maxWidth: 620 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase", color: "#FB923C", marginBottom: 6 }}>
            Direct Sponsorship Inquiries
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 850, color: "#FFFFFF", margin: "0 0 6px", letterSpacing: "-.3px" }}>
            Have questions before choosing a package?
          </h2>
          <p style={{ fontSize: 14, color: "#CBD5E1", lineHeight: 1.55, margin: 0 }}>
            Email us at <strong>{PARTNER_CONTACT_EMAIL}</strong> with your venue name, Florida or local market, and the package you are considering ($99/week, $199/month, or $299/quarter Holiday Promo).
          </p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <PartnerInquiryLink
            href={generalMailto}
            packageId="general"
            placement="bottom_banner"
            className="wfp-btn-primary"
            ariaLabel={`Email ${PARTNER_CONTACT_EMAIL} to inquire about a sponsored placement`}
          >
            Email {PARTNER_CONTACT_EMAIL} <span aria-hidden="true">→</span>
          </PartnerInquiryLink>
          <a href="/about" className="wfp-btn-secondary">
            About Wayfind
          </a>
        </div>
      </section>

      <p style={S.disc}>
        Wayfind does not sell placement in its lists, guides or rankings. The card on this page is a labeled sponsorship
        (Sponsored · Paid partner). It is not a place on those lists.
      </p>
    </div>
  );
}


