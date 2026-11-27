// /community — trips Wayfind members chose to publish, newest first, plus a
// door to this month's leaderboard and Wayfind's own itineraries.
import Link from "next/link";
import CommunityTripList from "../components/CommunityTripList";
import { SITE_URL } from "../../lib/site";
import ShareButton from "../components/ShareButton";
import { pageShareUrl } from "../../lib/pageShareUrl";
import { tripLogEnv } from "../../lib/tripLogServer";
import { listPublishedGuides } from "../../lib/communityGuides";

export const revalidate = 300;

export const metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Community trip guides | Wayfind",
  description: "Real Florida trips Wayfind members planned and chose to share, stop by stop. Save any of them to your own itinerary.",
  alternates: { canonical: "/community" },
};

const page = { minHeight: "100vh", background: "#0D1117", color: "#F1F5F9", fontFamily: "var(--wf-sans, system-ui, -apple-system, sans-serif)" };
const wrap = { maxWidth: 960, margin: "0 auto", padding: "28px 16px 64px", boxSizing: "border-box" };
const pill = { display: "inline-flex", alignItems: "center", minHeight: 44, padding: "0 16px", borderRadius: 999, border: "1px solid #2D3748", color: "#CBD5E1", textDecoration: "none", fontWeight: 700, fontSize: 14 };

export default async function CommunityPage() {
  let guides = [];
  try { guides = await listPublishedGuides(tripLogEnv(), { limit: 36 }); } catch { guides = []; }
  return (
    <main style={page}>
      <div style={wrap}>
        <h1 style={{ fontSize: "clamp(26px, 6vw, 36px)", fontWeight: 800, margin: "0 0 8px" }}>Community trip guides</h1>
        <div style={{ margin: "0 0 12px" }}><ShareButton url={pageShareUrl("/community")} title="Wayfind" text="Found this on Wayfind" event="community_hub_share" /></div>
        <p style={{ fontSize: 16, color: "#CBD5E1", lineHeight: 1.55, margin: "0 0 16px", maxWidth: 640 }}>Florida trips Wayfind members planned and chose to share. Open one, save it to your itinerary, make it yours.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, margin: "0 0 22px" }}>
          <Link href="/leaderboard" style={pill}>This month's top explorers</Link>
          <Link href="/itineraries" style={pill}>Wayfind itineraries</Link>
        </div>
        <CommunityTripList items={guides} base="/community" empty="No community guides yet. Plan a trip in your itinerary and tap Publish as a guide to be the first." />
      </div>
    </main>
  );
}
