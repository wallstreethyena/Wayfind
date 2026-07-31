// /nearby — the orientation card's destination, on the intent-page template
// (v6.59). "Know what is around you" previously opened nothing: the card was a
// plain <article>, not a control. Dynamic + personal, so noindex.
import { Suspense } from "react";
import Client from "./client";
import { INTENT_PAGES, intentEyebrow, intentSub } from "../../lib/intentPages";
import { SITE_URL } from "../../lib/site";

export async function generateMetadata({ searchParams }) {
  const city = String((searchParams && searchParams.city) || "").slice(0, 32);
  const ref = String((searchParams && searchParams.img) || "");
  const refOk = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(ref);
  const og = SITE_URL + "/api/og/intent?intent=nearby" + (city ? "&city=" + encodeURIComponent(city) : "") + (refOk ? "&img=" + encodeURIComponent(ref) : "");
  const def = INTENT_PAGES.nearby;
  const title = intentEyebrow(def) + (city ? " — " + city : "") + " | Wayfind";
  const description = intentSub(def, city || "your town");
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
