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
import RailCard from "../app/components/RailCard.js";
import { WF_PLACE_CARD_CSS } from "../app/components/css.js";
import { PartnerInquiryLink, PartnerEmailFallback } from "../app/components/PartnerInquiryControls";
import { siteTodayStr } from "./siteTime.js";
import { sponsorBySlug, sponsoredHref, sponsoredIsLive, sponsoredPublicScore, sponsoredSnapshotFresh } from "./sponsoredPlaces.js";

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

// One sentence, once, on the partners index. Same rule as the editorial pages.
// Plain words. No dotted separator. Individual partner pages keep their own
// wording. This constant is the index and its search description.
export const PARTNER_RANKINGS_LINE =
  "Rankings, list order, guide picks, and the Wayfind Score are never paid for, and a commission on a booking does not change them.";

// Who pays Wayfind is need to know. The public /partners page must not name a
// current advertiser, show a logo, or link a partner page. Their own URL can
// still exist. check-sponsored-places.mjs fails the build if a live advertiser
// name, slug, or photo lands in this page.
export const PARTNER_INDEX_NAMES_ARE_PRIVATE = true;

export function partnersIndexMetadata() {
  const url = `${SITE_URL}/partners`;
  // NOT a "<brand> partner" badge. lib/creatorRights.js bans that construction.
  // This page also must not name a current advertiser.
  const title = "Partners on Wayfind";
  const description =
    "This is what you are missing if you are not advertising with Wayfind. About 16,000 unique visitors in the last 90 days, about 3,900 of them in Florida. " +
    PARTNER_RANKINGS_LINE;
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

// No Stripe account, Payment Link, or other checkout provider exists in this
// repo. Pay now stays off until real server side URLs exist. Those URLs must
// live in server env, never in a NEXT_PUBLIC_ variable, and the button must
// go through an /api route the way other commercial links do.
export const PARTNER_CHECKOUT = null;

const PARTNER_CARD_BENEFITS = Object.freeze([
  "A sponsored card near your business",
  "A call button",
  "Google Maps directions",
  "Your own page with your photos and what you offer",
  "A link to your booking page",
]);

export const PARTNER_PACKAGES = Object.freeze([
  Object.freeze({
    id: "weekly",
    name: "Weekly plan",
    priceUsd: 99,
    priceDisplay: "$99",
    period: "week",
    periodDisplay: "/ week",
    durationLabel: "7 days",
    promoBadge: null,
    featured: false,
    summary: "Runs for 7 days.",
    benefits: PARTNER_CARD_BENEFITS,
    ctaLabel: "Email us about the weekly plan",
  }),
  Object.freeze({
    id: "monthly",
    name: "Monthly plan",
    priceUsd: 199,
    priceDisplay: "$199",
    period: "month",
    periodDisplay: "/ month",
    durationLabel: "30 days",
    promoBadge: null,
    featured: false,
    summary: "Runs for 30 days.",
    benefits: PARTNER_CARD_BENEFITS,
    ctaLabel: "Email us about the monthly plan",
  }),
  Object.freeze({
    id: "quarterly",
    name: "Quarterly plan",
    priceUsd: 299,
    priceDisplay: "$299",
    period: "quarter",
    periodDisplay: "/ quarter",
    durationLabel: "90 days",
    promoBadge: "Holiday Promo",
    featured: true,
    summary: "Runs for 90 days.",
    benefits: PARTNER_CARD_BENEFITS,
    ctaLabel: "Email us about the quarterly plan",
  }),
]);

export function partnerPackageMailto(pkg) {
  if (!pkg) {
    const subject = "Sponsored card on Wayfind";
    const body = [
      "Hi Wayfind team,",
      "",
      "I want to ask about a sponsored card on Wayfind.",
      "",
      "Plan I want (99 dollars a week, 199 dollars a month, or 299 dollars a quarter, Holiday Promo):",
      "Business name:",
      "City:",
      "Website or booking link:",
      "Phone:",
      "Preferred start date:",
      "",
      "Thanks!",
    ].join("\n");
    return `mailto:${PARTNER_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
  const promo = pkg.promoBadge ? `, ${pkg.promoBadge}` : "";
  const subject = `${pkg.name}, ${pkg.priceDisplay} per ${pkg.period}${promo}`;
  const body = [
    "Hi Wayfind team,",
    "",
    `I want the ${pkg.name}. It is ${pkg.priceDisplay} per ${pkg.period}, for ${pkg.durationLabel}${promo}.`,
    "",
    "Business name:",
    "City:",
    "Website or booking link:",
    "Phone:",
    "Preferred start date:",
    "",
    "Thanks!",
  ].join("\n");
  return `mailto:${PARTNER_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// Homepage tokens, copied from app/components/kit.js (C and TYPE):
// bg #040810, panel #161B22, card #1C2230, border #2D3748, accent #F97316,
// text #F1F5F9, muted #94A3B8, light #CBD5E1. Type is 15/17/21 at weight 700
// max, letter spacing normal. The fictional sample composes RailCard and
// WF_PLACE_CARD_CSS so its geometry stays identical to real sponsored cards.
const PARTNERS_INDEX_CSS = `
.wfp-page{max-width:760px;margin:0 auto;padding:28px 18px 80px;color:#F1F5F9;font-family:var(--wf-sans);letter-spacing:normal;box-sizing:border-box;overflow-wrap:break-word}
.wfp-page *,.wfp-page *::before,.wfp-page *::after{box-sizing:border-box}
.wfp-page a:focus-visible,.wfp-page button:focus-visible{outline:2px solid #F97316;outline-offset:2px}
.wfp-accent{width:48px;height:3px;border-radius:999px;background:#F97316;margin:0 0 18px}
.wfp-crumb{font-size:13px;color:#94A3B8;margin:0 0 22px}
.wfp-crumb a{color:#94A3B8;text-decoration:none}
.wfp-crumb a:hover{color:#F1F5F9}
.wfp-h1{font-size:32px;font-weight:700;line-height:1.2;letter-spacing:normal;margin:0 0 18px;color:#FFFFFF}
.wfp-stats{display:grid;gap:12px;margin:0 0 16px}
.wfp-stat{background:#161B22;border:1px solid #2D3748;border-radius:16px;padding:16px 18px}
.wfp-stat-num{font-size:32px;font-weight:700;line-height:1.1;color:#F97316;margin:0}
.wfp-stat-label{font-size:15px;font-weight:400;line-height:1.5;color:#CBD5E1;margin:6px 0 0}
.wfp-body{font-size:15px;font-weight:400;line-height:1.5;color:#CBD5E1;margin:0}
.wfp-policy{font-size:15px;font-weight:400;line-height:1.5;color:#F1F5F9;margin:18px 0 0}
.wfp-links{font-size:15px;line-height:1.5;color:#CBD5E1;margin:8px 0 0}
.wfp-links a{color:#F97316;font-weight:700;text-decoration:none}
.wfp-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px;align-items:center}
.wfp-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 18px;border-radius:12px;background:#F97316;color:#0D1117;font-size:15px;font-weight:700;text-align:center;text-decoration:none;border:0}
.wfp-btn:hover{background:#FB923C;color:#0D1117}
.wfp-btn-ghost{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:12px 18px;border-radius:12px;background:transparent;color:#F1F5F9;font-size:15px;font-weight:700;text-decoration:none;border:1.5px solid #2D3748}
.wfp-btn-ghost:hover{border-color:#F97316;color:#F1F5F9}
.wfp-section{margin-top:36px}
.wfp-h2{font-size:21px;font-weight:700;line-height:1.3;letter-spacing:normal;color:#FFFFFF;margin:0 0 8px}
.wfp-sample{margin-top:14px;background:#161B22;border:1px solid #2D3748;border-radius:16px;padding:16px}
.wfp-sample-flag{display:inline-block;margin:0 0 12px;padding:4px 10px;border-radius:999px;background:rgba(249,115,22,.16);color:#F97316;font-size:13px;font-weight:700}
.wfp-note{font-size:13px;line-height:1.5;color:#94A3B8;margin:12px 0 0}
.wfp-plans{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:16px}
.wfp-plan{display:flex;flex-direction:column;justify-content:space-between;background:#161B22;border:1px solid #2D3748;border-radius:16px;padding:18px 16px;min-width:0}
.wfp-plan.is-featured{border-color:#F97316;background:#1C2230}
.wfp-promo{display:inline-block;margin:0 0 8px;padding:4px 10px;border-radius:999px;background:rgba(249,115,22,.16);color:#FDBA74;font-size:13px;font-weight:700}
.wfp-plan-name{font-size:13px;font-weight:700;color:#94A3B8;margin:0 0 6px}
.wfp-plan.is-featured .wfp-plan-name{color:#FDBA74}
.wfp-price{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;margin:0 0 6px}
.wfp-price b{font-size:32px;font-weight:700;letter-spacing:normal;color:#FFFFFF;line-height:1}
.wfp-price span{font-size:15px;font-weight:700;color:#CBD5E1}
.wfp-plan-summary{font-size:15px;color:#CBD5E1;margin:0 0 12px}
.wfp-plan ul{margin:0 0 16px;padding:0 0 0 18px;color:#CBD5E1;font-size:15px;line-height:1.5}
.wfp-plan li{margin:0 0 6px}
.wfp-plan-next{font-size:13px;color:#94A3B8;margin:0 0 10px;line-height:1.45}
.wfp-plan-cta{display:inline-flex;align-items:center;justify-content:center;width:100%;min-height:48px;padding:12px 14px;border-radius:12px;background:#F97316;color:#0D1117;font-size:15px;font-weight:700;text-align:center;text-decoration:none}
.wfp-plan-cta:hover{background:#FB923C;color:#0D1117}
.wfp-email-fallback{margin-top:16px;padding:16px;border-radius:16px;background:#161B22;border:1px solid #2D3748}
.wfp-email-fallback-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}
.wfp-email-fallback-text{font-size:15px;color:#CBD5E1;line-height:1.5;flex:1 1 240px;min-width:0}
.wfp-email-code{font-size:14px;font-weight:700;color:#F97316;background:rgba(249,115,22,.12);border-radius:6px;padding:2px 6px}
.wfp-copy-email-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:10px 16px;border-radius:12px;background:#1C2230;border:1px solid #2D3748;color:#F1F5F9;font:inherit;font-size:15px;font-weight:700;cursor:pointer}
.wfp-copy-email-btn:hover{border-color:#F97316}
.wfp-points{margin:8px 0 0;padding:0 0 0 18px;color:#CBD5E1;font-size:15px;line-height:1.5}
.wfp-points li{margin:0 0 8px}
.wfp-close{margin-top:28px;background:#1C2230;border:1px solid #F97316;border-radius:16px;padding:18px 16px}
.wfp-close p{margin:0}
@media(max-width:800px){
  .wfp-plans{grid-template-columns:1fr}
}
@media(max-width:420px){
  .wfp-page{padding:20px 14px 64px}
  .wfp-h1{font-size:28px}
}
`;

export function PartnersIndexPage() {
  const generalMailto = partnerPackageMailto(null);
  return (
    <div className="wfp-page">
      <style dangerouslySetInnerHTML={{ __html: WF_PLACE_CARD_CSS + PARTNERS_INDEX_CSS }} />
      {jsonLd({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Partners on Wayfind",
        url: `${SITE_URL}/partners`,
        description: "This is what you are missing if you are not advertising with Wayfind.",
      })}
      <div className="wfp-accent" aria-hidden="true" />
      <nav className="wfp-crumb" aria-label="Breadcrumb">
        <a href="/">Wayfind</a>
        {" / "}
        Partners
      </nav>

      <h1 className="wfp-h1">This is what you are missing</h1>
      <p className="wfp-body">
        Put a clearly labeled sponsored card in front of people exploring your area.
      </p>
      <div className="wfp-stats">
        <div className="wfp-stat">
          <p className="wfp-stat-num">About 16,000</p>
          <p className="wfp-stat-label">unique visitors in the last 90 days</p>
        </div>
        <div className="wfp-stat">
          <p className="wfp-stat-num">About 3,900</p>
          <p className="wfp-stat-label">of them in Florida</p>
        </div>
      </div>
      <p className="wfp-body">
        Wayfind just started. Traffic is already huge, which is why the app store launch was delayed. The app store is launching this year.
      </p>

      <section className="wfp-section" aria-labelledby="wfp-why-heading">
        <h2 id="wfp-why-heading" className="wfp-h2">This is the place to be</h2>
        <ul className="wfp-points">
          <li>It runs on frontier AI models.</li>
          <li>The future of travel and discovery is AI based.</li>
          <li>Several kinds of AI agents work together as one, using billions of tokens of technology.</li>
          <li>A business could never build this on its own. It would take a lot of money, intellectual property, and code.</li>
          <li>The future is now. The AIs work around the clock so people in Florida get the best of what is available.</li>
          <li>A sponsored card gives your brand another way to be seen outside ranked lists.</li>
        </ul>
      </section>

      <p className="wfp-policy">{PARTNER_RANKINGS_LINE}</p>
      <p className="wfp-links">
        Read our <a href="/editorial-policy">editorial policy</a> and <a href="/how-wayfind-ranks">how we rank</a>.
      </p>
      <div className="wfp-actions">
        <a href="#plans" className="wfp-btn">See plans</a>
        <PartnerInquiryLink
          href={generalMailto}
          packageId="general"
          placement="hero"
          className="wfp-btn-ghost"
          ariaLabel={`Email ${PARTNER_CONTACT_EMAIL}`}
        >
          Email us
        </PartnerInquiryLink>
        <ShareButton url={pageShareUrl("/partners")} title="Partners on Wayfind"
          text="This is what you are missing if you are not advertising with Wayfind."
          label="Share" tone="dark" event="page_share" meta={{ surface: "partners_index", placement: "header" }} />
      </div>

      <section className="wfp-section" aria-labelledby="wfp-sample-heading">
        <h2 id="wfp-sample-heading" className="wfp-h2">A sample card</h2>
        <p className="wfp-body">One fictional example with the same card style your business gets.</p>
        <div className="wfp-sample" aria-label="Example of a sponsored card for a fictional business. Not a real business.">
          <p className="wfp-sample-flag">Example</p>
          <div inert="" data-partner-example="inert">
            <ul className="wf-place-card-slot-list">
              <RailCard
                title="Sample Harbor Cafe"
                eyebrow="Coffee"
                photoFallbackCategory="coffee"
                facts={["Sample City"]}
                badge={<span>Sponsored paid partner</span>}
                take="Example only."
                ariaLabel="Example of a fictional business card"
              />
            </ul>
          </div>
          <p className="wfp-note">Call and Directions are available on your business page.</p>
        </div>
        <p className="wfp-note">This sample is not a real business.</p>
      </section>

      <section id="plans" className="wfp-section" aria-labelledby="wfp-plans-heading">
        <h2 id="wfp-plans-heading" className="wfp-h2">Plans</h2>
        <p className="wfp-body">Same card on every plan. Only the number of days changes.</p>
        <div className="wfp-plans">
          {PARTNER_PACKAGES.map((pkg) => {
            const href = partnerPackageMailto(pkg);
            return (
              <div key={pkg.id} className={`wfp-plan${pkg.featured ? " is-featured" : ""}`}>
                <div>
                  {pkg.promoBadge ? <p className="wfp-promo">{pkg.promoBadge}</p> : null}
                  <p className="wfp-plan-name">{pkg.name}</p>
                  <p className="wfp-price">
                    <b>{pkg.priceDisplay}</b>
                    <span>{pkg.periodDisplay}</span>
                  </p>
                  <p className="wfp-plan-summary">{pkg.summary}</p>
                  <ul>
                    {pkg.benefits.map((benefit) => (
                      <li key={benefit}>{benefit}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="wfp-plan-next">Opens an email to {PARTNER_CONTACT_EMAIL}</p>
                  <PartnerInquiryLink
                    href={href}
                    packageId={pkg.id}
                    packageName={pkg.name}
                    priceUsd={pkg.priceUsd}
                    billingPeriod={pkg.period}
                    placement="pricing_card"
                    className="wfp-plan-cta"
                    ariaLabel={`${pkg.ctaLabel}. Opens an email to ${PARTNER_CONTACT_EMAIL}`}
                  >
                    {pkg.ctaLabel}
                  </PartnerInquiryLink>
                </div>
              </div>
            );
          })}
        </div>
        <PartnerEmailFallback email={PARTNER_CONTACT_EMAIL} placement="pricing_section" />
      </section>

      <section className="wfp-close" aria-label="What you lose if you wait">
        <h2 className="wfp-h2">What you lose if you wait</h2>
        <p className="wfp-body">Reach people exploring your area with a sponsored card. Email us to discuss your plan.</p>
      </section>
    </div>
  );
}
