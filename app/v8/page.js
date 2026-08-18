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
import { LANDING_CITIES } from "../../lib/landing";
import { railMenuData } from "../../lib/railsData";
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

// RAILS is passed straight across the server/client boundary. It can be,
// because lib/rails.js is metadata only — the `pick` FUNCTIONS that used to
// live on it moved to lib/railSelect.js, and a function on a prop throws at
// render. scripts/check-rail-routes.mjs asserts the whole array stays
// JSON-serialisable so re-adding one fails the build instead of the page.
const DEFAULT_CITY = "sarasota";

export default async function Page({ searchParams }) {
  const asked = searchParams && typeof searchParams.city === "string" ? searchParams.city : "";
  const citySlug = LANDING_CITIES[asked] ? asked : DEFAULT_CITY;
  const city = LANDING_CITIES[citySlug];
  const railMenu = await railMenuData(citySlug);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: WF_PLACE_CARD_CSS + WF_RAIL_MENU_CSS }} />
      <h1 style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 }}>
        Wayfind — find the best things to do near {city.name}, {city.state}, right now
      </h1>
      <DaypartRail
        rails={RAILS}
        places={railMenu.places}
        thin={railMenu.thin}
        guides={railMenu.guides}
        region={railMenu.region}
        citySlug={railMenu.citySlug}
        cityLabel={railMenu.cityLabel}
        lat={railMenu.lat}
        lng={railMenu.lng}
        initialDaypart={railMenu.daypart}
      />
    </>
  );
}
