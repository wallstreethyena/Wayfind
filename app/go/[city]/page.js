// /go/[city] — the PAID landing route.
//
// Deliberately separate from /things-to-do/[city] rather than a "paid mode" on
// it. Two reasons:
//   1. The organic page earns its traffic with long-form ranked content and
//      structured data. Restructuring it around a conversion CTA would put that
//      at risk for a campaign that currently sends ~89 clicks a month.
//   2. A paid landing page should be noindex — it must not compete with the
//      organic page for the same query. Splitting the routes lets each be
//      optimized honestly for what it is.
//
// The organic content is untouched and linked from the bottom of this page, so
// nothing of SEO value is deleted or hidden.
import { LANDING_CITIES, LANDING_CATS, rankedFor } from "../../../lib/landing";
import { SITE_URL } from "../../../lib/site";
import PaidLanding from "../../components/PaidLanding";

export const revalidate = 86400;
// On-demand for any city we are NOT currently buying traffic to. Prebuilding
// all 21 landing cities would spend ~42 metered Places calls (the paid field
// mask includes photos) generating pages no campaign points at. Orlando is the
// live campaign, so it is the one that gets built ahead of the first visitor.
export const dynamicParams = true;

// Cities with live paid campaigns. Add a slug here when a campaign starts
// pointing at it and the page gets prebuilt instead of cold-rendered.
const PAID_CITIES = ["orlando"];

// Local-only preview rows. The live route always uses the current ranked
// inventory; these simply keep the design review useful when a developer does
// not have the metered Places key in their local environment.
const DEV_PREVIEW = [
  { id: "ChIJu3hNU-N654gR0x0I9_3iNvc", name: "Lake Eola Park", rating: 4.7, reviews: 24666, openNow: true, distMi: 0.6, types: ["park", "tourist_attraction"] },
  { id: "ChIJdd8VlMN-54gRoaU0d_zYhfk", name: "Universal Studios Florida", rating: 4.7, reviews: 161138, openNow: null, distMi: 6.8, types: ["amusement_park", "tourist_attraction"] },
  { id: "ChIJCRCYGrx654gR3G9qoVbWlpY", name: "Harry P Leu Gardens", rating: 4.7, reviews: 5757, openNow: null, distMi: 2.4, types: ["park", "tourist_attraction"] },
  { id: "ChIJgWr-M_x654gRRd7J_Abj-SY", name: "The Great Escape Room Orlando", rating: 5, reviews: 4769, openNow: null, distMi: 0.2, types: ["amusement_park"] },
];

export function generateStaticParams() {
  return PAID_CITIES.filter((c) => LANDING_CITIES[c]).map((city) => ({ city }));
}

export function generateMetadata({ params }) {
  const city = LANDING_CITIES[params.city];
  if (!city) return { title: "Not found", robots: { index: false, follow: false } };
  const title = `Things to do in ${city.name} right now — Wayfind`;
  const description = `Real guest reviews, ranked on merit. No ads and no paid placement — find something worth doing in ${city.name}, ${city.state} today.`;
  return {
    title,
    description,
    // A paid landing page must never compete with the organic page for the same
    // query. Canonical points at the indexable one; this route stays out of the
    // index entirely.
    robots: { index: false, follow: true },
    alternates: { canonical: `${SITE_URL}/things-to-do/${params.city}` },
  };
}

export default async function Page({ params }) {
  const citySlug = params.city;
  const city = LANDING_CITIES[citySlug];
  if (!city) {
    return (
      <main style={{ padding: 28, background: "#040810", color: "#E6EDF3", minHeight: "100dvh" }}>
        <h1>Not found</h1>
        <p><a href="/" style={{ color: "#F97316" }}>Back to Wayfind</a></p>
      </main>
    );
  }

  // Photos + open-now come from the paid-only field mask (see lib/landing.js).
  // A null list means no server key / upstream down — PaidLanding renders its
  // honest "open Wayfind" fallback rather than an empty shell.
  let list = null;
  try { list = await rankedFor("things-to-do", citySlug, { withPhotos: true }); } catch (e) { list = null; }

  // Eight is the most a phone can show before the page becomes the wall of text
  // this route exists to replace. The full ranked list lives on the organic page.
  const picks = Array.isArray(list) && list.length ? list.slice(0, 8) : process.env.NODE_ENV === "development" ? DEV_PREVIEW : [];

  return (
    <>
      <PaidLanding city={city} places={picks} />
      {/* Link walls and long-form SEO stay BELOW the interactive experience. */}
      <div style={{ background: "#040810", color: "#94A3B8", padding: "0 16px 48px", fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", fontSize: 13.5, lineHeight: 1.7 }}>
          <p style={{ margin: "0 0 8px" }}>
            <a href={`/things-to-do/${citySlug}`} style={{ color: "#F97316", fontWeight: 700, textDecoration: "none" }}>
              Read the full ranked guide to {city.name} →
            </a>
          </p>
          <p style={{ margin: "0 0 8px" }}>
            {Object.keys(LANDING_CATS).filter((c) => c !== "things-to-do").map((c, i, arr) => (
              <span key={c}>
                <a href={`/${c}/${citySlug}`} style={{ color: "#94A3B8", textDecoration: "none" }}>Best {LANDING_CATS[c].label} in {city.name}</a>
                {i < arr.length - 1 ? " · " : ""}
              </span>
            ))}
          </p>
          <p style={{ margin: 0 }}>
            {/* Other cities link to their ORGANIC pages, not to /go/. Those are
                the indexable ones with the full guide, and pointing here would
                cold-render a metered paid page for a city with no campaign. */}
            {Object.keys(LANDING_CITIES).filter((c) => c !== citySlug).slice(0, 12).map((c, i, arr) => (
              <span key={c}>
                <a href={`/things-to-do/${c}`} style={{ color: "#94A3B8", textDecoration: "none" }}>{LANDING_CITIES[c].name}</a>
                {i < arr.length - 1 ? " · " : ""}
              </span>
            ))}
          </p>
        </div>
      </div>
    </>
  );
}
