// /date-night — hero-card destination page on the /best-beaches standard.
// Dynamic + personal (lat/lng/city params), so noindex; the shareable
// evergreen SEO surfaces remain the metro pages.
import { Suspense } from "react";
import Client from "./client";
export const metadata = {
  title: "The best of your town — Wayfind",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <Suspense fallback={null}><Client /></Suspense>;
}
