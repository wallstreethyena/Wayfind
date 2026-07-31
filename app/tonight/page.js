// /tonight — "Perfect for tonight" on the intent-page template.
//
// v6.58: the discovery tile used to call setScreen("events"), landing a user who
// asked for places on the events calendar. Wrong destination, not a styling
// problem. Same template as /family, /date-night, /seasonal and /hidden-gems.
//
// Dynamic + personal (lat/lng/city params) like its siblings, so noindex.
import { Suspense } from "react";
import Client from "./client";
import { SITE_URL } from "../../lib/site";

export async function generateMetadata({ searchParams }) {
  const city = String((searchParams && searchParams.city) || "").slice(0, 32);
  const ref = String((searchParams && searchParams.img) || "");
  const refOk = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(ref);
  const og = SITE_URL + "/api/og/intent?intent=tonight" + (city ? "&city=" + encodeURIComponent(city) : "") + (refOk ? "&img=" + encodeURIComponent(ref) : "");
  const title = "Perfect for tonight" + (city ? " — " + city : "") + " | Wayfind";
  const description = "The highest-scoring places in " + (city || "your town") + " within a short drive, ranked by the Wayfind Score.";
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
