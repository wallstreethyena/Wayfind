// /itineraries — Wayfind's multi stop plans for Florida cities, refreshed
// weekly from the places and events Wayfind tracks (lib/itineraryTemplates.js).
import Link from "next/link";
import CommunityTripList from "../components/CommunityTripList";
import { SITE_URL } from "../../lib/site";
import ShareButton from "../components/ShareButton";
import { pageShareUrl } from "../../lib/pageShareUrl";
import { siteTodayStr } from "../../lib/siteTime";
import { tripLogEnv } from "../../lib/tripLogServer";
import { listTemplates, liveStops } from "../../lib/itineraryTemplates";

export const revalidate = 600;

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Florida itineraries: a perfect day and this weekend | Wayfind",
  description: "Ready made Florida itineraries for Tampa, St. Petersburg, Sarasota, Orlando, Miami and the Keys, built from real places and this week's events.",
  alternates: { canonical: "/itineraries" },
};

export default async function ItinerariesPage() {
  const today = siteTodayStr();
  let items = [];
  try { items = (await listTemplates(tripLogEnv())).map((t) => ({ ...t, stops: liveStops(t, today) })).filter((t) => t.stops.length >= 3); } catch { items = []; }
  return (
    <main style={{ minHeight: "100vh", background: "#0D1117", color: "#F1F5F9", fontFamily: "var(--wf-sans, system-ui, -apple-system, sans-serif)" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 16px 64px", boxSizing: "border-box" }}>
        <h1 style={{ fontSize: "clamp(26px, 6vw, 36px)", fontWeight: 800, margin: "0 0 8px" }}>Florida itineraries</h1>
        <div style={{ margin: "0 0 12px" }}><ShareButton url={pageShareUrl("/itineraries")} title="Wayfind" text="Found this on Wayfind" event="itineraries_hub_share" /></div>
        <p style={{ fontSize: 16, color: "#CBD5E1", lineHeight: 1.55, margin: "0 0 16px", maxWidth: 640 }}>A perfect day and this weekend, city by city. Every stop is a real place or event on Wayfind. Save one and change it however you like.</p>
        <p style={{ margin: "0 0 22px" }}><Link href="/community" style={{ color: "#FBBF24", fontWeight: 700, textDecoration: "none" }}>See trips from the community ›</Link></p>
        <CommunityTripList items={items} base="/itineraries" empty="New itineraries are on the way. Check back soon." />
      </div>
    </main>
  );
}
