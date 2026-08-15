// app/v8/page.js — the rail menu on real data.
//
// This route exists so the new homepage design can be verified against the
// SAME ranking engine, the SAME place cards and the SAME build the live site
// runs, on a preview URL, BEFORE it replaces anything on /. It is noindex: it
// is a staging surface, not a second homepage competing with the real one.
//
// SERVER COMPONENT on purpose. lib/railsData.js reaches lib/landing.js, which
// holds the Google Places call, the junk filter, the quality floor and the
// Bayesian rank. None of that may ever ship to a browser.
import { RAILS } from "../../lib/rails";
import { loadRailPlaces } from "../../lib/railsData";
import { LANDING_CITIES } from "../../lib/landing";
import { regionFor, partForHour } from "../../lib/dayparts";
import { siteHourFloat, tzForPoint } from "../../lib/nowContext";
import { GUIDES } from "../../lib/guides";
import { readMinutes } from "../../lib/localEdit";
import DaypartRail from "../components/DaypartRail";
import { WF_RAIL_MENU_CSS } from "../components/railMenuCss";
import { WF_PLACE_CARD_CSS } from "../components/css";

// Hourly, like the homepage. Every Google call behind this is Supabase-cached
// for 30 days, so a regeneration is a cache read, not a bill.
export const revalidate = 3600;

export const metadata = {
  title: "Wayfind — what to do right now",
  robots: { index: false, follow: false },
};

const DEFAULT_CITY = "sarasota";

// A rail definition carries a `pick` FUNCTION. Functions cannot cross the
// server/client boundary — passing RAILS straight to the client component
// throws at render. Only the fields the UI reads go over the wire.
function serialisableRail(r) {
  return {
    id: r.id, title: r.title, axis: r.axis, short: r.short, sub: r.sub,
    cta: r.cta, art: r.art, href: r.href,
    regional: r.regional || null,
    guides: !!r.guides,
  };
}

// Every guide, newest first — "wire it to all of the blogs", not the three
// nearest. lib/localEdit.js localEditIndex() drops any guide whose region has
// no coordinates, which is the right call for a proximity rail and the wrong
// one for a library.
function guideIndex() {
  return Object.entries(GUIDES)
    .map(([slug, g]) => ({
      slug,
      title: g.title,
      teaser: g.teaser || g.description || "",
      region: g.region || "Florida",
      updated: g.updated || "",
      mins: readMinutes(g),
    }))
    .sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
}

// The daypart the CITY is in at regeneration — a deterministic first paint the
// browser then corrects to the visitor's own clock. Through lib/nowContext.js,
// the one clock: the server runs in UTC and the city does not, and tzForPoint
// already knows which zone a coordinate is in (Hawaii included).
function cityDaypart(city) {
  return partForHour(siteHourFloat(new Date(), tzForPoint(city.lat, city.lng)));
}

export default async function Page({ searchParams }) {
  const asked = searchParams && typeof searchParams.city === "string" ? searchParams.city : "";
  const citySlug = LANDING_CITIES[asked] ? asked : DEFAULT_CITY;
  const city = LANDING_CITIES[citySlug];
  const region = regionFor(city.lat, city.lng);

  // Fail-soft: if every ranked pool is unavailable the rails still render, each
  // one linking to its own page. A homepage that loses its lists must not lose
  // its navigation too.
  const data = await loadRailPlaces(citySlug).catch(() => ({ places: {}, thin: RAILS.filter((r) => r.list).map((r) => r.id), citySlug }));

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: WF_PLACE_CARD_CSS + WF_RAIL_MENU_CSS }} />
      <h1 style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 }}>
        Wayfind — find the best things to do near {city.name}, {city.state}, right now
      </h1>
      <DaypartRail
        rails={RAILS.map(serialisableRail)}
        places={data.places}
        thin={data.thin}
        guides={guideIndex()}
        region={region}
        citySlug={data.citySlug || citySlug}
        cityLabel={city.name}
        initialDaypart={cityDaypart(city)}
        lat={city.lat}
        lng={city.lng}
      />
    </>
  );
}
