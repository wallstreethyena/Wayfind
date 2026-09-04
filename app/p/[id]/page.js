import Home from "../../home";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SITE_URL } from "../../../lib/site";
import { placeCanonical } from "../../../lib/locationHonesty";
import { retiredLunchLaunchTarget } from "../../../lib/lunchLaunch";
// v8.29 — the shell's server data, the SAME call app/page.js makes. Without it
// this route rendered the homepage with its entire rail band missing, and since
// every in-app destination is a state change inside the shell rather than a
// route, a reader who arrived here could not navigate back to a populated home.
// See lib/homeShellData.js for the measurement and the cost note.
import { homeShellData } from "../../../lib/homeShellData";
// v8.82 — the season has to survive the link. A fall place wears the skin in
// the feed; before this, the link it produced arrived in a text thread as the
// ordinary near-black card, so the season stopped at the app boundary. Owner,
// 2026-08-27: "when we share them, they gotta have some sort of a fall theme
// through it as well … when we share it as a text message."
//
// DECIDED HERE, FROM THE ID AND THE DATE — the same two conditions that put
// the skin on the card — and never from a query parameter, so a link copied
// today and opened in December arrives in the ordinary ink instead of wearing
// a season that is over.
import { FALL_CARD_IDS, fallSkinLive } from "../../../lib/fallSkin";
import { siteTodayStr } from "../../../lib/siteTime";

function s(v) {
  if (Array.isArray(v)) return v[0] || "";
  return v || "";
}

export async function generateMetadata({ params, searchParams }) {
  const id = s(params.id);
  const t = s(searchParams.t) || "A spot worth your time";
  const loc = s(searchParams.loc);
  const r = s(searchParams.r);
  const rev = s(searchParams.rev);
  const mi = s(searchParams.mi);
  const cat = s(searchParams.cat);
  const sc = s(searchParams.sc);
  const hk = s(searchParams.hk).slice(0, 110);
  const bits = [];
  if (cat) bits.push(cat);
  if (r) bits.push(r + "\u2605");
  if (loc) bits.push("in " + loc);
  const isFall = FALL_CARD_IDS.has(id) && fallSkinLive(siteTodayStr());
  // The preview text under the image is the other half of what lands in the
  // thread. A fall place says so there too, in one word, before the facts.
  const desc = (isFall ? "Fall on Wayfind \u00b7 " : "") + (hk ? hk + " \u00b7 " : "") + (bits.length ? bits.join(" \u00b7 ") : "A great nearby spot") + " \u00b7 Tap to open on Wayfind";
  // v6.72: ABSOLUTE. Relative worked only because metadataBase resolved it,
  // and several scrapers (iMessage among them) fetch the raw value instead.
  // Only the base is prefixed; the += query appends below are unaffected.
  let og = SITE_URL + "/api/og?kind=place&t=" + encodeURIComponent(t);
  if (loc) og += "&loc=" + encodeURIComponent(loc);
  if (r) og += "&r=" + encodeURIComponent(r);
  if (rev) og += "&rev=" + encodeURIComponent(rev);
  if (mi) og += "&mi=" + encodeURIComponent(mi);
  if (cat) og += "&cat=" + encodeURIComponent(cat);
  if (sc) og += "&sc=" + encodeURIComponent(sc);
  if (hk) og += "&hk=" + encodeURIComponent(hk);
  if (isFall) og += "&tone=fall";
  return {
    robots: { index: false, follow: true }, // share/app-state URLs: infinite query space, not for the index (SEO audit July 2026)
    metadataBase: new URL(SITE_URL),
    alternates: { canonical: placeCanonical(id, SITE_URL) || (SITE_URL + "/p/" + encodeURIComponent(id)) },
    title: t + " \u00b7 Wayfind",
    description: desc,
    openGraph: {
      title: t,
      description: desc,
      type: "website",
      siteName: "Wayfind",
      images: [{ url: og, width: 1200, height: 630, alt: t }],
    },
    twitter: {
      card: "summary_large_image",
      title: t,
      description: desc,
      images: [og],
    },
  };
}

export default async function PlaceSharePage({ params, searchParams }) {
  const id = s(params.id);
  // A short-lived release accidentally made the Lunch in My City homepage
  // poster a direct Gatorland link. Safari can keep that old anchor alive in
  // a restored tab even after the corrected bundle deploys. Recover only the
  // exact same-origin homepage hop at the server boundary; shared, searched,
  // guide, and Summer Picks links to Gatorland remain real Gatorland pages.
  const recoveredLunch = retiredLunchLaunchTarget({
    placeId: id,
    referrer: headers().get("referer") || "",
    siteUrl: SITE_URL,
  });
  if (recoveredLunch) redirect(recoveredLunch);
  const requestedAction = s(searchParams.action);
  const action = ["save", "like", "dislike"].includes(requestedAction) ? requestedAction : "";
  // Overlay may be the presentation; URL + canonical stay /p/{id}. What is
  // BEHIND the overlay has to be the real homepage — closing the detail is the
  // most common next move a share-link visitor makes, and landing them on an
  // empty shell is how a shared place became a dead end.
  const { railMenu, localEditGuides } = await homeShellData();
  return <Home initialPlaceId={id} initialPlaceAction={action || null} railMenu={railMenu} localEditGuides={localEditGuides} />;
}
