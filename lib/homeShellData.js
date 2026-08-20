// lib/homeShellData.js — SERVER ONLY. The server data the app shell needs to
// be a PAGE and not just a chrome.
//
// THE BUG THIS EXISTS FOR (owner, 2026-08-20): "when i go back to the home page
// from different screens the amazon rail cards are gone ... no matter what i do
// i cannot get the amazon rail cards now", with a screenshot of the homepage
// showing a header, one promo card and nothing else.
//
// app/home.js renders the rail band as `railMenu ? <DaypartRail .../> : null` —
// deliberately, so a regeneration with no data cannot paint a blank band. Only
// app/page.js ever passed that prop. app/p/[id]/page.js renders the SAME shell
// for a share link or a ?action= deep link and passed nothing, so /p/<id> was a
// homepage with its entire card surface missing — and because every in-app
// destination (Home, Events, Coupons, Map) is a state change inside that shell
// rather than a route, tapping "Home" from there kept the reader on /p/<id> and
// the rails never came back. "No matter what I do" was literally true.
//
// So the shell's server data is ONE function that every route rendering <Home>
// calls, and scripts/check-shell-routes.mjs fails the build if a route renders
// the shell without it. A second entry point to the same screen cannot quietly
// serve two-thirds of it again.
//
// COST: railMenuData() is the same call app/page.js makes at regeneration; it
// reads pools that lib/landing.js keeps Supabase-cached for 30 days, so this is
// a cache read, not a Places bill (see lib/railsData.js's cost note). /p/<id>
// is dynamic — it reads searchParams — so it cannot be covered by `revalidate`.
// The one-hour in-process memo below is what keeps a warm instance from
// repeating the read on every share-link visit; it matches app/page.js's
// `revalidate = 3600` on purpose, so both entry points to the homepage can show
// the same rails rather than two versions an hour apart.
import { railMenuData } from "./railsData.js";
import { GUIDES } from "./guides.js";
import { localEditIndex } from "./localEdit.js";

const TTL_MS = 60 * 60 * 1000;
let memo = null;

export async function homeShellData() {
  const now = Date.now();
  if (memo && now - memo.at < TTL_MS) return memo.value;
  let railMenu = null;
  try { railMenu = await railMenuData(null); } catch (e) { railMenu = null; }
  const value = { railMenu, localEditGuides: localEditIndex(GUIDES) };
  // Only a REAL result is memoised. Caching a failure would turn one bad minute
  // upstream into an hour of the exact empty homepage this file exists to end.
  if (railMenu) memo = { at: now, value };
  return value;
}
