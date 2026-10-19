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

export function PartnersIndexPage() {
  const rows = SPONSORED_PLACES.filter(sponsorHasPage);
  return (
    <div style={S.wrap}>
      {jsonLd({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Partners on Wayfind",
        url: `${SITE_URL}/partners`,
        description: "Local businesses that have sponsored a labelled card on Wayfind, and what that never buys.",
      })}
      <nav style={S.crumb}>
        <a href="/" style={S.crumbLink}>Wayfind</a> › Partners
      </nav>
      <h1 style={S.h1}>Partners on Wayfind</h1>
      <p style={S.lede}>
        Rio Body Wax in Gastonia is a labeled sponsor on Wayfind. The label is &ldquo;Sponsored · Paid partner.&rdquo;
        The card sits outside ranked lists, and this page names that sponsorship.
      </p>
      <div style={{ margin: "14px 0 0" }}>
        <ShareButton url={pageShareUrl("/partners")} title="Partners on Wayfind"
          text="The local businesses that have sponsored a labelled card on Wayfind, and what that never buys."
          label="Share" tone="dark" event="page_share" meta={{ surface: "partners_index", placement: "header" }} />
      </div>
      <p style={{ ...S.body, marginTop: 16 }}>
        Rankings, list order, guide picks, and the Wayfind Score are never paid for, and affiliate commission never
        changes them. That card does not buy a place on any Wayfind list, guide or ranking, it does not move anyone up
        one, and it does not buy a Wayfind Score. Every score on this site — theirs included — comes from the same
        formula, applied to the same public review data, and no amount of money moves it. A labeled sponsorship has no
        effect on a Wayfind Score. List order and scores are covered by our{" "}
        <a href="/editorial-policy" style={{ color: "#CBD5E1" }}>editorial policy</a> and{" "}
        <a href="/how-wayfind-ranks" style={{ color: "#CBD5E1" }}>how we rank</a>.
      </p>

      <div style={{ marginTop: 26, display: "grid", gap: 12 }}>
        {rows.map((s) => {
          const branch = branchOf(s);
          const score = sponsoredPublicScore(s);
          const thumb = photoUrl(s, 480);
          return (
            <a
              key={s.id}
              href={`/partners/${s.id}`}
              style={{
                display: "flex", gap: 14, alignItems: "stretch", border: "1px solid #26303B", background: "#12161F",
                borderRadius: 14, overflow: "hidden", textDecoration: "none", color: "inherit",
              }}
            >
              <div style={{ position: "relative", width: 116, flexShrink: 0, background: "#10141d" }}>
                {thumb ? (
                  <SafeImg
                    src={thumb}
                    alt=""
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: s.photoPosition || "50% 50%" }}
                  />
                ) : null}
              </div>
              <div style={{ flex: 1, minWidth: 0, padding: "13px 14px 14px" }}>
                <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "0.8px", textTransform: "uppercase", color: "#94A3B8", marginBottom: 5 }}>
                  {s.label}
                </div>
                <div style={{ fontSize: 17, fontWeight: 800, color: "#F1F5F9", lineHeight: 1.25 }}>{s.advertiser}</div>
                <div style={{ fontSize: 12.5, color: "#94A3B8", marginTop: 3 }}>
                  {branch}
                  {score != null ? ` · Wayfind Score ${(score / 10).toFixed(1)}` : ""}
                </div>
              </div>
            </a>
          );
        })}
      </div>

      <p style={S.disc}>
        Wayfind does not sell placement in its lists, guides or rankings. The card on this page is a labeled sponsorship
        (Sponsored · Paid partner). It is not a place on those lists.
      </p>
    </div>
  );
}
