// /plan-my-day — Wayfind's itinerary builder (owner, 2026-11-27). Paste trip
// notes or tap three quick picks, get a day by day plan of real Wayfind places
// and events with travel estimates and ticket links, then add, remove and
// reorder stops. Server page: metadata, the fixed pick lists and the crawlable
// intro; everything interactive lives in ItineraryBuilder.js.
import ItineraryBuilder from "./ItineraryBuilder.js";
import ShareButton from "../components/ShareButton";
import { pageShareUrl } from "../../lib/pageShareUrl";
import { SITE_URL } from "../../lib/site";
import { siteTodayStr } from "../../lib/siteTime.js";
import { PLAN_DAY_AREAS, PLAN_DAY_WHEN, vibesFor } from "../../lib/planMyDay.js";

export const revalidate = 3600;

const title = "Plan My Day in Florida: Free Itinerary Builder";
const description = "Build a Florida day trip or weekend plan in seconds. Paste your notes or pick a city and vibe, then reorder stops, see travel times and get tickets.";

export const metadata = {
  title: title + " | Wayfind",
  description,
  alternates: { canonical: SITE_URL + "/plan-my-day" },
  robots: { index: true, follow: true },
  openGraph: {
    title, description, url: SITE_URL + "/plan-my-day", siteName: "Wayfind", type: "website",
    images: [{ url: SITE_URL + "/api/og?t=" + encodeURIComponent("Plan my day") + "&loc=" + encodeURIComponent("Florida"), width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", title, description },
};

const S = {
  page: { maxWidth: 760, margin: "0 auto", padding: "26px 16px 70px", background: "#0D1117", color: "#E6EDF3", fontFamily: "var(--wf-sans)", lineHeight: 1.55, minHeight: "70vh" },
  eyebrow: { color: "#F97316", fontSize: 11, fontWeight: 900, letterSpacing: ".14em", textTransform: "uppercase", margin: 0 },
  h1: { fontSize: 30, lineHeight: 1.15, margin: "6px 0 8px", color: "#F8FAFC", fontWeight: 900 },
  lede: { color: "#94A3B8", fontSize: 15, margin: "0 0 18px" },
};

export default function Page() {
  const today = siteTodayStr();
  const schema = {
    "@context": "https://schema.org", "@type": "WebApplication", name: "Wayfind itinerary builder",
    url: SITE_URL + "/plan-my-day", applicationCategory: "TravelApplication", operatingSystem: "Any",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, description,
  };
  return (
    <main className="wf-page-canvas" style={S.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
      <p style={S.eyebrow}>Wayfind planner</p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <h1 style={S.h1}>Plan my day</h1>
        <div style={{ marginTop: 8 }}><ShareButton url={pageShareUrl("/plan-my-day")} title={title} text={description} tone="dark" label="Share" /></div>
      </div>
      <p style={S.lede}>Paste your trip notes or pick a city, a day and a vibe. You get a plan built from real Wayfind places and events, with travel times between stops and ticket links. Then make it yours: add, remove or reorder anything.</p>
      <ItineraryBuilder areas={PLAN_DAY_AREAS} whens={PLAN_DAY_WHEN} vibes={vibesFor(today).map(({ id, label }) => ({ id, label }))} />
    </main>
  );
}
