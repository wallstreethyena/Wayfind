// v5.32 — the homepage is now a SERVER component (audit #2): the interactive
// app (app/home.js, unchanged) renders exactly as before, and BELOW it we
// server-render real recommendation proof — an actual ranked answer in the
// initial HTML, before JavaScript, geolocation, or sign-in. Crawlers and
// link previews see the decision engine's output, not just its description.
// Data comes cache-first from the same ranked/gated engine as the landing
// pages (lib/landing.js); if no data is cached the block simply doesn't
// render and the page is byte-identical to the old client-only homepage.
import { Suspense } from "react";
import Home from "./home";
import ProofVeil from "./components/ProofVeil";
import { homeProofCopy } from "../lib/locationHonesty";
import { rankedFor, whyLine } from "../lib/landing";
import { TOWN_HUBS, TOWN_PROFILES } from "../lib/culture";
// v7.29 PERF: the "Read the local edit" index is built HERE, on the server,
// once per revalidation. app/components/LocalEdit.js used to import the whole
// GUIDES corpus to compute each guide's read time, which put 52.8KB of guide
// prose into the homepage's client bundle to render three titles. See
// lib/localEdit.js for why the split is safe.
import { GUIDES } from "../lib/guides";
import { localEditIndex } from "../lib/localEdit";
// v8 — the rail menu's places are ranked HERE, on the server, at regeneration.
// lib/railsData.js reaches lib/landing.js, which holds the Places call, the junk
// filter, the quality floor and the Bayesian rank; none of that may ship to a
// browser. Four ranked pools per metro answer all fifteen rails, and every one
// of those calls is Supabase-cached for 30 days, so an hourly revalidate is a
// cache read and not a bill. See lib/railsData.js for the cost note.
import { railMenuData } from "../lib/railsData";

export const revalidate = 3600;

// v6.43 LCP: the "Happening near you" hero image is the largest thing on the
// mobile first screen (68,178px^2). It used to be fetched entirely client-side,
// so its URL was not even KNOWN until /api/events resolved — measured on
// production at resourceLoadDelay 11,342ms, elementRenderDelay 9ms. Its
// fetchpriority="high" was decorative: you cannot prioritise an element that
// does not exist yet.
//
// So the events come from the server now, into the initial HTML, where the
// preload scanner can see the <img> immediately.
//
// WHY THIS IS FREE:
//  - /api/events is Ticketmaster/SeatGeek/etc — NOT the paid Google Places API.
//    This does not re-open the v6.41 "billed loads on every page view" incident;
//    scripts/test-map-cost.mjs still guards that separately.
//  - `revalidate = 3600` means this runs at REGENERATION, roughly once an hour,
//    not per request. TTFB (measured ~120ms) is unchanged. Deliberately NOT
//    using headers() to derive the origin the way the city pages do — that
//    opts the route into dynamic rendering and would put a live aggregation on
//    the critical path of every single visit.
//  - DEFAULT_CENTER (Parrish, FL) is exactly what the client itself assumes on
//    its first render, so the server HTML matches what the client would compute
//    before geolocation resolves. Not a guess: the same query.
//
// Fail-soft: any error returns null, the client seeds `foryouEvents` to null,
// the skeleton shows, and behaviour is byte-identical to before this change.
const CANON = process.env.NEXT_PUBLIC_SITE_URL || "https://www.gowayfind.com";
const SSR_EVENTS_CENTER = { lat: 27.5689, lng: -82.4393, city: "Parrish, FL" }; // == DEFAULT_CENTER in app/home.js

async function initialEventsForFirstPaint() {
  try {
    const r = await fetch(`${CANON}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat: SSR_EVENTS_CENTER.lat, lng: SSR_EVENTS_CENTER.lng, city: SSR_EVENTS_CENTER.city, radius: 25 }),
      next: { revalidate: 3600 },
    });
    if (!r.ok) return null;
    const data = await r.json();
    const evs = (data && Array.isArray(data.events) ? data.events : []).filter((e) => e && e.dest);
    return evs.length ? evs.slice(0, 24) : null;
  } catch (e) {
    return null;
  }
}

const S = {
  wrap: { maxWidth: 760, margin: "0 auto", padding: "26px 18px 6px", color: "#E6EDF3", fontFamily: "var(--wf-sans)", lineHeight: 1.6 },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#CBD5E1" },
  h2: { fontSize: 22, fontWeight: 800, color: "#FFFFFF", margin: "8px 0 4px" },
  sub: { fontSize: 13.5, color: "#8B949E", margin: "0 0 14px" },
  card: { background: "#161B22", borderRadius: 12, padding: "12px 14px", margin: "0 0 10px" },
  name: { fontSize: 15.5, fontWeight: 800, color: "#FFFFFF", margin: 0 },
  why: { fontSize: 13, color: "#8B949E", margin: "3px 0 6px" },
  a: { color: "#CBD5E1", fontWeight: 700, textDecoration: "none", fontSize: 13 },
  links: { fontSize: 13.5, color: "#C9D1D9", margin: "12px 0 0" },
};

async function HomeProof() {
  // rankedFor stays so crawlers (and check-seo) still get a real ranked
  // sample. The heading is city-neutral: this ISR document is shared by
  // / and /?near=Orlando, so "Near Sarasota right now" is a lie.
  const copy = homeProofCopy();
  const top = ((await rankedFor("things-to-do", "sarasota").catch(() => null)) || []).slice(0, 5);
  if (top.length < 3) return null;
  return (
    <section style={S.wrap} aria-label="Example Wayfind picks">
      <div style={S.kicker}>{copy.kicker}</div>
      <h2 style={S.h2}>{copy.heading}</h2>
      <p style={S.sub}>{copy.sub}</p>
      {top.map((place, i) => (
        <div key={place.id || i} style={S.card}>
          <p style={S.name}>{i + 1}. {place.name}</p>
          <p style={S.why}>{whyLine({ ...place, distMi: null }, "spot")}</p>
          <a style={S.a} href={"/?q=" + encodeURIComponent(place.name)}>Open in Wayfind ›</a>
        </div>
      ))}
      <p style={S.links}>
        <b style={{ color: "#FFFFFF" }}>Nearby towns:</b>{" "}
        {Object.entries(TOWN_HUBS).slice(0, 5).map(([k, slug], i) => (<span key={slug}><a style={S.a} href={"/florida/" + slug}>{TOWN_PROFILES[k].title}</a>{i < 4 ? " · " : ""}</span>))}
      </p>
    </section>
  );
}

// Honest empty until the client knows the visitor's city. Passing the
// flagship slug made every first HTML — and every fail-open — claim Sarasota.

export default async function Page() {
  // v6.43 REVERT of the #218 seed (owner-reported bug): seeding events for
  // DEFAULT_CENTER made "Happening near you" paint PARRISH's events first, then
  // visibly swap to the visitor's real location a few seconds later. Content
  // changing under the reader is worse than a slower LCP, so the seed is off.
  // The image right-sizing from #218 (503KB -> 168KB) is untouched and still wins.
  // Re-enabling this requires the server and client to agree on ONE location and
  // ONE featured event first — see issue #219.
  const initialEvents = null;
  const railMenu = await railMenuData(null);
  return (
    <>
      {/* v5.38 a11y/SEO: one descriptive server-rendered H1, always present
          (the proof block below is conditional on cached data and stays an
          h2 under it). Visually hidden so the app design is untouched. */}
      <h1 style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 }}>
        Wayfind — find the best things to do, right now
      </h1>
      <Home initialEvents={initialEvents} localEditGuides={localEditIndex(GUIDES)} railMenu={railMenu} />
      {/* Suspense so the app shell streams immediately; the proof block
          follows without adding a byte to time-to-first-paint. ProofVeil keeps
          it in the DOM for crawlers but removes it from the interactive view
          once JS mounts, so it never bleeds in as a "loose footer" (v6.26). */}
      <Suspense fallback={null}><ProofVeil><HomeProof /></ProofVeil></Suspense>
    </>
  );
}
