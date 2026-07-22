// /date-night — hero-card destination page on the /best-beaches standard.
// Dynamic + personal (lat/lng/city params), so noindex; the shareable
// evergreen SEO surfaces remain the metro pages.
import { Suspense } from "react";
import Client from "./client";
export async function generateMetadata({ searchParams }) {
  const city = String((searchParams && searchParams.city) || "").slice(0, 32);
  const ref = String((searchParams && searchParams.img) || ""); const refOk = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(ref);
  const og = "/api/og/intent?intent=date-night" + (city ? "&city=" + encodeURIComponent(city) : "") + (refOk ? "&img=" + encodeURIComponent(ref) : "");
  const title = ("date-night" === "date-night" ? "Date night, decided" : "Family day, decided") + (city ? " — " + city : "") + " | Wayfind";
  const description = "The best of " + (city || "your town") + " for two — ranked by the Wayfind Score, tuned to right now. No ads, no paid placement.";
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
