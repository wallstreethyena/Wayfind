// /community/<slug> — a trip a Wayfind member chose to publish (owner order
// 2026-11-27). Only published guides render; an unpublished one is a 404 the
// moment its owner unpublishes it (ISR window 5 minutes). Read with the
// service role, safe columns only (lib/communityGuides.js publicGuideView).
import { notFound } from "next/navigation";
import CommunityTripPage from "../../components/CommunityTripPage";
import { SITE_URL } from "../../../lib/site";
import { socialMeta } from "../../../lib/socialMeta";
import { siteTodayStr } from "../../../lib/siteTime";
import { tripLogEnv } from "../../../lib/tripLogServer";
import { readPublishedGuide } from "../../../lib/communityGuides";
import { fetchCuratedEventBySlug, eventDetailTicketAction } from "../../../lib/curatedEvents";

export const revalidate = 300;

async function load(slug) {
  try { return await readPublishedGuide(tripLogEnv(), slug); } catch { return null; }
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const g = await load(slug);
  if (!g) return { title: "Guide not found | Wayfind", robots: { index: false } };
  return {
    metadataBase: new URL(SITE_URL),
    title: `${g.title} | Wayfind community guide`,
    description: g.intro || `${g.stops.length} stops in ${g.city}, shared by a Wayfind member.`,
    alternates: { canonical: `/community/${g.slug}` },
    ...socialMeta({ title: g.title, description: g.intro || "A Florida trip on Wayfind.", url: `${SITE_URL}/community/${g.slug}` }),
  };
}

export default async function CommunityGuidePage({ params }) {
  const { slug } = await params;
  const g = await load(slug);
  if (!g) notFound();
  const today = siteTodayStr();
  const tickets = new Map();
  for (const s of g.stops.filter((x) => x.kind === "event" && x.slug)) {
    try {
      const e = await fetchCuratedEventBySlug(s.slug);
      const t = e ? eventDetailTicketAction(e, { surface: "community_guide", today }) : null;
      if (t) tickets.set(s.ref_id, t);
    } catch {}
  }
  return <CommunityTripPage kind="guide" doc={g} stops={g.stops} tickets={tickets} path={`/community/${g.slug}`} />;
}
