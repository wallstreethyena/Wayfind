// /hidden-gems — the "Hidden gems" hero destination. Dynamic + personal, noindex.
import { Suspense } from "react";
import Client from "./client";
export async function generateMetadata({ searchParams }) {
  const city = String((searchParams && searchParams.city) || "").slice(0, 32);
  const ref = String((searchParams && searchParams.img) || ""); const refOk = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(ref);
  const og = "/api/og/intent?intent=hidden-gems" + (city ? "&city=" + encodeURIComponent(city) : "") + (refOk ? "&img=" + encodeURIComponent(ref) : "");
  const title = "Hidden gems" + (city ? " — " + city : "") + " | Wayfind";
  const description = "The spots locals keep to themselves near " + (city || "you") + " — loved but not overrun, ranked by the Wayfind Score. No paid placement.";
  return { title, description, robots: { index: false, follow: false }, openGraph: { title, description, images: [{ url: og, width: 1200, height: 630 }] }, twitter: { card: "summary_large_image", title, description, images: [og] } };
}
export default function Page() { return <Suspense fallback={null}><Client /></Suspense>; }
