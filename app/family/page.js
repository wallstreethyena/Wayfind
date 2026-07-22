// /family — hero-card destination page on the /best-beaches standard.
// Dynamic + personal (lat/lng/city params), so noindex; the shareable
// evergreen SEO surfaces remain the metro pages.
import { Suspense } from "react";
import Client from "./client";
export async function generateMetadata({ searchParams }) {
  const city = String((searchParams && searchParams.city) || "").slice(0, 32);
  const og = "/api/og/intent?intent=family" + (city ? "&city=" + encodeURIComponent(city) : "");
  const title = ("family" === "date-night" ? "Date night, decided" : "Family day, decided") + (city ? " — " + city : "") + " | Wayfind";
  return {
    title,
    robots: { index: false, follow: false },
    openGraph: { title, images: [{ url: og, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, images: [og] },
  };
}
export default function Page() {
  return <Suspense fallback={null}><Client /></Suspense>;
}
