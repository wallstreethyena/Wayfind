// /seasonal — Seasonal Picks on the intent-page template (the /family and
// /date-night standard), v6.57.
//
// Before this, the Summer Picks hero opened a SHEET: a hero card, a sort
// control and a single detail card — a different object from every other list
// surface on the site. It now renders the same template: eyebrow, headline,
// subhead, Share this list, ranked rows.
//
// Dynamic + personal (lat/lng/city params) like its siblings, so noindex; the
// shareable evergreen SEO surfaces remain the metro pages.
import { Suspense } from "react";
import Client from "./client";
import { SEASON_META, currentSeason } from "../../lib/seasons";

export async function generateMetadata({ searchParams }) {
  const city = String((searchParams && searchParams.city) || "").slice(0, 32);
  const ref = String((searchParams && searchParams.img) || "");
  const refOk = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(ref);
  const og = "/api/og/intent?intent=seasonal" + (city ? "&city=" + encodeURIComponent(city) : "") + (refOk ? "&img=" + encodeURIComponent(ref) : "");
  const season = SEASON_META[currentSeason()].label;
  const title = season + " picks near you" + (city ? " — " + city : "") + " | Wayfind";
  const description = "Ranked for " + currentSeason() + " in " + (city || "your town") + " — what's open, close, and worth the trip today, by the Wayfind Score.";
  return {
    title, description,
    robots: { index: false, follow: false },
    openGraph: { title, description, images: [{ url: og, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [og] },
  };
}

export default function Page() {
  return <Suspense fallback={null}><Client /></Suspense>;
}
