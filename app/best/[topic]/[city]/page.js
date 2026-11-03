// Linkable best-of pages. seo_bestof_pages is off until PostHog says otherwise
// (the flag does not exist yet). Flag off, an unknown topic, or a list with
// zero items is a 404. /budget and /best-of are different routes and stay
// noindex.
import { cache } from "react";
import { notFound } from "next/navigation";
import { SITE_URL } from "../../../../lib/site";
import { socialMeta } from "../../../../lib/socialMeta";
import { seoFlagOn } from "../../../../lib/seoFlags";
import { SEO_FLAGS } from "../../../../lib/seoFlagNames";
import { fetchCuratedEvents } from "../../../../lib/curatedEvents";
import { windowRange } from "../../../../lib/eventsList";
import {
  FREE_WEEKEND_CITIES,
  bestOfRouteDecision,
  freeWeekendPageModel,
  sunsetPageModel,
} from "../../../../lib/bestOfPages";
import BestOfArticle from "../../BestOfArticle";

export const dynamic = "force-dynamic";

const loadBestOf = cache(async (topic, city) => {
  const flagOn = await seoFlagOn(SEO_FLAGS.bestOfPages);
  if (flagOn !== true) return { flagOn: false, model: null };
  if (topic === "sunset-spots") {
    return { flagOn: true, model: city === "sarasota" ? sunsetPageModel() : null };
  }
  if (topic === "free-this-weekend" && FREE_WEEKEND_CITIES[city]) {
    const now = new Date();
    const { start } = windowRange("this-weekend", now);
    const events = await fetchCuratedEvents({ upcomingFrom: start });
    return { flagOn: true, model: freeWeekendPageModel(events, city, now) };
  }
  return { flagOn: true, model: null };
});

export async function generateMetadata({ params }) {
  const { topic, city } = await params;
  const loaded = await loadBestOf(topic, city);
  if (bestOfRouteDecision(loaded) !== "render") notFound();
  const url = SITE_URL + loaded.model.path;
  const title = loaded.model.title + " | Wayfind";
  const description = loaded.model.description;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: { index: true, follow: true },
    ...socialMeta({ title, description, url }),
  };
}

export default async function Page({ params }) {
  const { topic, city } = await params;
  const loaded = await loadBestOf(topic, city);
  if (bestOfRouteDecision(loaded) !== "render") notFound();
  return <BestOfArticle model={loaded.model} />;
}
