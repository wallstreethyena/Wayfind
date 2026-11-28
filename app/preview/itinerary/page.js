// app/preview/itinerary/page.js — OWNER PREVIEW of the simplified itinerary
// (owner, 2026-11-28: "too many buttons", "it needs to look premium"). Not a
// live page: noindex, not linked, not in the sitemap. It loads a sample Tampa
// trip into this browser and opens the real Itinerary screen.
import ItineraryPreviewClient from "./ItineraryPreviewClient";

export const metadata = {
  title: "Itinerary preview · Wayfind",
  robots: { index: false, follow: false },
};

export default function ItineraryPreviewPage() {
  return <ItineraryPreviewClient />;
}
