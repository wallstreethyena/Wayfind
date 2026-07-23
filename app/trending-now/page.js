// /trending-now — the "Trending near you" hero destination (owner: the card
// must open a RANKED page of top picks). Dynamic + personal (lat/lng), so
// noindex; the evergreen SEO surfaces stay the metro pages.
import { Suspense } from "react";
import Client from "./client";
export async function generateMetadata({ searchParams }) {
  const city = String((searchParams && searchParams.city) || "").slice(0, 32);
  const ref = String((searchParams && searchParams.img) || ""); const refOk = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(ref);
  const og = "/api/og/intent?intent=trending" + (city ? "&city=" + encodeURIComponent(city) : "") + (refOk ? "&img=" + encodeURIComponent(ref) : "");
  const title = "Trending near you" + (city ? " — " + city : "") + " | Wayfind";
  const description = "The places near " + (city || "you") + " getting the most attention right now — ranked by the Wayfind Score, no paid placement.";
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
