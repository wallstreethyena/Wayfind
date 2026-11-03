// /family — hero-card destination page on the /best-beaches standard.
// Dynamic + personal (lat/lng/city params), so noindex; the shareable
// evergreen SEO surfaces remain the metro pages.
import { Suspense } from "react";
import Client from "./client";
import { SITE_URL } from "../../lib/site";
export async function generateMetadata({ searchParams }) {
  searchParams = await searchParams;
  const city = String((searchParams && searchParams.city) || "").slice(0, 32);
  const ref = String((searchParams && searchParams.img) || ""); const refOk = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(ref);
  const og = SITE_URL + "/api/og/intent?intent=family" + (city ? "&city=" + encodeURIComponent(city) : "") + (refOk ? "&img=" + encodeURIComponent(ref) : "");
  const title = ("family" === "date-night" ? "Date night, decided" : "Family day, solved") + (city ? " in " + city : "") + " | Wayfind";
  const description = "Explore beach days, attractions, animals, indoor play and more near " + (city || "your Florida location") + ", ranked by Wayfind Score.";
  return {
    title, description,
    alternates: { canonical: SITE_URL + "/family" },
    robots: { index: false, follow: true },
    openGraph: { title, description, images: [{ url: og, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [og] },
  };
}
export default function Page() {
  return <Suspense fallback={null}><Client /></Suspense>;
}
