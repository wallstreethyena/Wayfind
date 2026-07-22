// /family — hero-card destination page on the /best-beaches standard.
// Dynamic + personal (lat/lng/city params), so noindex; the shareable
// evergreen SEO surfaces remain the metro pages.
import { Suspense } from "react";
import Client from "./client";
export async function generateMetadata({ searchParams }) {
  const city = String((searchParams && searchParams.city) || "").slice(0, 32);
  const ref = String((searchParams && searchParams.img) || ""); const refOk = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(ref);
  const og = "/api/og/intent?intent=family" + (city ? "&city=" + encodeURIComponent(city) : "") + (refOk ? "&img=" + encodeURIComponent(ref) : "");
  const title = ("family" === "date-night" ? "Date night, decided" : "Family day, decided") + (city ? " — " + city : "") + " | Wayfind";
  const description = "The most-loved family spots in " + (city || "your town") + " — proven by thousands of real reviews, ranked by the Wayfind Score.";
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
