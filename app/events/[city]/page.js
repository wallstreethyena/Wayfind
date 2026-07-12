// v5.62 (audit Phase 5): /events/[city] defaults to the this-weekend listing.
import { redirect, notFound } from "next/navigation";
import { LANDING_CITIES } from "../../../lib/landing.js";

export const runtime = "nodejs";

// This route only ever redirects (to /events/[city]/this-weekend) or 404s — it
// renders no crawlable body, so it must not be indexed. Without this it inherits
// the root layout's canonical "/" and reads as a homepage duplicate (check-seo).
export const metadata = { robots: { index: false, follow: true } };

export default function CityEventsIndex({ params }) {
  if (!LANDING_CITIES[params.city]) notFound();
  redirect(`/events/${params.city}/this-weekend`);
}
