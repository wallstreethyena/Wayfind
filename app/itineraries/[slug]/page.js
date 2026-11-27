// /itineraries/<slug> — a multi stop plan Wayfind drafts weekly from its own
// places and events (lib/itineraryTemplates.js). Events that already ended are
// dropped at read time; times show only where the event row has one.
import { notFound } from "next/navigation";
import CommunityTripPage from "../../components/CommunityTripPage";
import { SITE_URL } from "../../../lib/site";
import { siteTodayStr } from "../../../lib/siteTime";
import { tripLogEnv } from "../../../lib/tripLogServer";
import { readTemplate, liveStops } from "../../../lib/itineraryTemplates";
import { fetchCuratedEventBySlug, eventDetailTicketAction } from "../../../lib/curatedEvents";

export const revalidate = 600;

async function load(slug) {
  try { return await readTemplate(tripLogEnv(), slug); } catch { return null; }
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const t = await load(slug);
  if (!t) return { title: "Itinerary not found | Wayfind", robots: { index: false } };
  return {
    metadataBase: new URL(SITE_URL),
    title: `${t.title} | Wayfind itinerary`,
    description: t.intro || `A ${t.days > 1 ? t.days + " day" : "one day"} plan for ${t.city} from Wayfind.`,
    alternates: { canonical: `/itineraries/${t.slug}` },
    openGraph: { title: t.title, description: t.intro || undefined, url: `${SITE_URL}/itineraries/${t.slug}`, type: "article" },
  };
}

export default async function ItineraryTemplatePage({ params }) {
  const { slug } = await params;
  const t = await load(slug);
  if (!t) notFound();
  const today = siteTodayStr();
  const stops = liveStops(t, today);
  if (stops.length < 3) notFound();
  const tickets = new Map();
  for (const s of stops.filter((x) => x.kind === "event" && x.slug)) {
    try {
      const e = await fetchCuratedEventBySlug(s.slug);
      const a = e ? eventDetailTicketAction(e, { surface: "itinerary_template", today }) : null;
      if (a) tickets.set(s.ref_id, a);
    } catch {}
  }
  return <CommunityTripPage kind="template" doc={t} stops={stops} tickets={tickets} path={`/itineraries/${t.slug}`} />;
}
