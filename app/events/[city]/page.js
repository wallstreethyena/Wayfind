// v5.62 (audit Phase 5): /events/[city] defaults to the this-weekend listing.
import { redirect, notFound } from "next/navigation";
import { LANDING_CITIES } from "../../../lib/landing.js";

export const runtime = "nodejs";

export default function CityEventsIndex({ params }) {
  if (!LANDING_CITIES[params.city]) notFound();
  redirect(`/events/${params.city}/this-weekend`);
}
