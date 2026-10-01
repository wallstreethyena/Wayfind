// lib/landingPage.js — the RENDER half of the /things-to-do, /restaurants,
// /beaches and /nightlife landing pages, split out of lib/landing.js (2026-10-01).
//
// WHY THIS IS ITS OWN FILE. lib/landing.js is also the ranking/data module the
// homepage (app/page.js, lib/railsData.js), /go/[city], /culture/[metro] and
// /florida/[town] import for rankedFor/whyLine. Next's flight client-entry
// loader turns every "use client" module reachable from a route's SERVER module
// graph into an eager client entry for that route. While LandingPage lived in
// lib/landing.js, its client components (IconicPlaceCard, IntentPartnerPick,
// TourStrip, ThemeParkRail, plus PremiumIntentHero's client imports) — and
// IconicPlaceCard's ~34KB-gz creator-video registry — shipped in route "/"'s
// initial JS although the home page only ever loads IconicPlaceCard lazily
// (DaypartRail's next/dynamic).
// Measured (local next build, check-bundle's level-6 gzip): 509,653 -> 449,596
// gz bytes on route "/" (-60,057). The full registry now loads lazily with the
// detail sheet / daypart drop, as WO9 (2026-09-02) intended.
//
// So: lib/landing.js imports NO client component, and only the four category
// route files import this module. scripts/check-landing-data-client-free.mjs
// enforces both directions.
import { wayfindScore, governedWayfindScore } from "./wayfindScore.js";
import DiscoveryPaths from "../app/components/DiscoveryPaths.js";
import { hasCreatorVideoAt } from "./creatorBoost.js";
import { groupByContainment, childrenLabel } from "./venueContainment";
import { landingRailSeeds } from "./landingRails.js";
import IntentPartnerPick from "../app/components/IntentPartnerPick";
import { landingRailIntent } from "./railPlacement";
import { resolveMetro } from "./culture";
import { CULTURE } from "./cultureCorpus";
import { SITE_URL } from "./site";
import { getInsider } from "./insiderServer";
import TourStrip from "../app/components/TourStrip";
import PremiumIntentHero from "../app/components/PremiumIntentHero";
import IconicPlaceCard from "../app/components/IconicPlaceCard";
import ThemeParkRail from "../app/components/ThemeParkRail";
import { atlasEditorialForPlace, landingWhyFits } from "./rankingWhy.js";
import { landingCardPhotoSrc, landingHeroSrc } from "./placePhoto.js";
import { fetchDeadline } from "./fetchDeadline.js";
import { listIndexedIds } from "./placeIndex.js";
import { selectEligiblePlaceLinks } from "./hubPlaceLinks.js";
import { WF_PLACE_CARD_CSS } from "../app/components/css";
import { LANDING_CATS, LANDING_CITIES, cityProfile, rankedFor } from "./landing.js";

const S = {
  page: { maxWidth: 1080, margin: "0 auto", padding: "0 18px 72px", background: "#040810", color: "#F1F5F9", fontFamily: "var(--wf-sans)", lineHeight: 1.6 },
  kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", color: "#F97316" },
  h1: { fontSize: 30, lineHeight: 1.2, margin: "10px 0 8px", fontWeight: 800, color: "#FFFFFF" },
  sub: { fontSize: 16, color: "#94A3B8", marginBottom: 8 },
  h2: { fontSize: 21, fontWeight: 800, color: "#FFFFFF", margin: "26px 0 10px" },
  why: { fontSize: 14.5, color: "#CBD5E1", margin: "3px 0 0" },
  addr: { fontSize: 12.5, color: "#94A3B8", margin: "4px 0 0" },
  cta: { display: "inline-block", marginTop: 18, padding: "12px 22px", borderRadius: 999, background: "#F97316", color: "#0D1117", fontWeight: 800, fontSize: 15, textDecoration: "none" },
  link: { color: "#F97316", textDecoration: "none", fontWeight: 700 },
  note: { fontSize: 12, color: "#94A3B8", margin: "18px 0 0", padding: "10px 14px", background: "#161B22", borderRadius: 10 },
};

// Hero chrome: landingHeroSrc — owner concert-crowd / category art, never a
// Pexels named bar in another city (live /nightlife/parrish hero was Brettos
// in Athens, pexels 14698219). Cards: landingCardPhotoSrc only.
function landingPhoto(p) {
  return landingCardPhotoSrc(p);
}

// v6.61 (owner build order #5): the ranking ROWS consume the editorial too.
// One anon in() call for the verified Wayfind cards; where one exists we render
// hook + why_here + local_tip. Atlas whyGo fills only the gap — it never
// overwrites a fleet why_here. No sourced why → the row shows no why block.
async function landingEditorials(places) {
  const list = Array.isArray(places) ? places : [];
  const ids = list.map((p) => p && p.id).filter(Boolean);
  const out = {};
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (url && anon && ids.length) {
    try {
      const r = await fetchDeadline(url + "/rest/v1/wf_editorial_servable?verified=is.true&select=place_id,hook,why_here,local_tip&place_id=in.(" + ids.map(encodeURIComponent).join(",") + ")", { headers: { apikey: anon, Authorization: "Bearer " + anon }, next: { revalidate: 3600 } });
      if (r.ok) {
        const rows = await r.json();
        for (const e of Array.isArray(rows) ? rows : []) out[e.place_id] = e;
      }
    } catch (e) { /* fleet join is best-effort; Atlas still fills below */ }
  }
  for (const p of list) {
    if (!p || !p.id) continue;
    const prev = out[p.id];
    if (prev && prev.why_here) continue;
    const row = atlasEditorialForPlace(p);
    if (!row) continue;
    out[p.id] = {
      place_id: p.id,
      hook: (prev && prev.hook) || row.hook,
      why_here: row.why_here || null,
      local_tip: (prev && prev.local_tip) || row.local_tip,
    };
  }
  return out;
}


// v6.71 (Wave 2): the same wf_beach_water / wf_place_popularity_scored reads
// every other beach surface uses (PlaceCard, Detail sheet, Best Beaches, Best
// Nearby, Things To Do, date-night/family), server-baked here exactly like
// landingEditorials() above rather than client-hydrated — this route is a
// 1-day ISR page and the rest of its "live" content (rankings, editorials)
// already lives on that same cadence, so a client fetch would buy freshness
// this page doesn't otherwise have while adding a hydration mismatch risk to
// a page whose whole point is being crawlable server HTML. Called ONLY for
// catSlug === "beaches" below — the other three categories never have rows
// in either table, so skip the request rather than firing it for nothing.
async function landingBeachSignals(ids) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anon || !ids.length) return {};
  const idList = ids.map(encodeURIComponent).join(",");
  try {
    const [wRes, pRes] = await Promise.all([
      fetchDeadline(url + "/rest/v1/wf_beach_water?select=beach_place_id,result,advisory,sampled_at&beach_place_id=in.(" + idList + ")", { headers: { apikey: anon, Authorization: "Bearer " + anon }, next: { revalidate: 3600 } }),
      fetchDeadline(url + "/rest/v1/wf_place_popularity_scored?select=place_id,tier2_popularity&place_id=in.(" + idList + ")", { headers: { apikey: anon, Authorization: "Bearer " + anon }, next: { revalidate: 3600 } }),
    ]);
    const out = {};
    if (wRes.ok) { for (const r of await wRes.json()) out[r.beach_place_id] = { ...(out[r.beach_place_id] || {}), water: r }; }
    if (pRes.ok) { for (const r of await pRes.json()) out[r.place_id] = { ...(out[r.place_id] || {}), popularityPct: r.tier2_popularity }; }
    return out;
  } catch (e) { return {}; }
}

// shareAction: the page's Share control, built by lib/landingShare.js and
// passed in by each route. It is NOT imported here: this module is reachable
// from the homepage (app/page.js -> lib/railsData.js -> here), and every client
// component imported by it ships in the homepage bundle whether or not the
// homepage renders it (measured 2026-09-23: ShareButton added ~4.4KB gz).
export async function LandingPage({ catSlug, citySlug, shareAction = null }) {
  const cat = LANDING_CATS[catSlug], city = LANDING_CITIES[citySlug];
  if (!cat || !city) return <main style={S.page}><h1 style={S.h1}>Not found</h1><p><a href="/" style={S.link}>Back to Wayfind</a></p></main>;
  const url = `${SITE_URL}/${catSlug}/${citySlug}`;
  const list = await rankedFor(catSlug, citySlug);
  // v5.22: insider intel for the top 5 (cache-first — the model runs at most
  // once per place per month; ISR re-renders read the cache). Doubles as
  // unique indexable content no directory has.
  const insiderByIdx = {};
  if (Array.isArray(list) && list.length) {
    await Promise.all(list.slice(0, 5).map(async (p, i) => {
      try { const ins = await getInsider({ id: p.id, name: p.name, city: city.name, type: (p.types || [])[0] || "", rating: p.rating, reviews: p.reviews }); if (ins && (ins.tip || ins.special)) insiderByIdx[i] = ins; } catch (e) {}
    }));
  }
  const prof = cityProfile(citySlug);
  const metro = resolveMetro(city.name + ", " + city.state);
  // A missing server key/upstream response intentionally returns null so the
  // landing page can render its honest live-rankings fallback. Keep the
  // editorial lookup equally fail-soft during static export.
  const eds = await landingEditorials(list || []);
  const beachSignals = catSlug === "beaches" ? await landingBeachSignals((list || []).map((p) => p.id).filter(Boolean)) : {};
  // Task A (SEO recovery, 2026-09-23) — durable /places/{id} ids for the
  // places actually shown on THIS list, built once per render. Card hrefs
  // (/?q=) are untouched; this only adds a small internal-links nav after the
  // list. Fail-soft: listIndexedIds() never throws (lib/placeIndex.js), but
  // an empty list means no fetch is worth making at all.
  const eligiblePlaceIds = (list && list.length)
    ? new Set(await listIndexedIds())
    : new Set();
  const culture = metro && CULTURE[metro] ? CULTURE[metro] : null;
  const profLine = prof && prof[cat.townKey] && prof[cat.townKey].line;
  // Declared per category in lib/railPlacement.js — null for nightlife, which
  // has no bookable partner inventory in any program we hold.
  const railIntent = landingRailIntent(catSlug);
  // Crawlable partner CTAs (2026-09-29): the three rails below are client
  // components that used to fill only from useEffect fetches, so the server HTML
  // carried none of their /api/*/go links. These are first-paint SEEDS from the
  // same owned-table reads the API routes serve (lib/landingRails.js). Never
  // throws; any field that could not be read is undefined and the rail keeps its
  // old client-only behavior.
  const railSeeds = await landingRailSeeds({ catSlug, city, metro, railIntent });
  // One destination, one card. Rides/shops inside a theme park render INSIDE
  // that park's card instead of as peer rows — a ride is not somewhere you can
  // go, it is a reason to pick the park. Ranking is untouched; this is purely
  // how the ranked list is presented.
  const grouped = (list && list.length) ? groupByContainment(list) : { groups: [], nestedIds: new Set() };
  const topLevel = grouped.groups;
  const ld = [];
  ld.push({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
    { "@type": "ListItem", position: 1, name: "Wayfind", item: SITE_URL },
    { "@type": "ListItem", position: 2, name: cat.label, item: `${SITE_URL}/${catSlug}/${citySlug}` },
    { "@type": "ListItem", position: 3, name: city.name + ", " + city.state, item: url },
  ] });
  if (list && list.length) {
    ld.push({ "@context": "https://schema.org", "@type": "ItemList", name: `Best ${cat.label} in ${city.name}, ${city.state}`, numberOfItems: topLevel.length, itemListElement: topLevel.map(({ place: p }, i) => ({ "@type": "ListItem", position: i + 1, item: { "@type": "LocalBusiness", name: p.name, address: p.address || undefined, geo: p.lat != null ? { "@type": "GeoCoordinates", latitude: p.lat, longitude: p.lng } : undefined } })) });
    ld.push({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: [
      { "@type": "Question", name: `What is the best ${cat.singular} in ${city.name}, ${city.state}?`, acceptedAnswer: { "@type": "Answer", text: `${list[0].name} currently ranks #1${list[0].rating != null ? ` with a ${list[0].rating}★ rating across ${(list[0].reviews || 0).toLocaleString()} reviews` : ""}, based on Wayfind's merit-only ranking (rating, review volume, and proximity — no ads, no paid placement).` } },
      { "@type": "Question", name: `What are the top 5 ${cat.label.toLowerCase()} in ${city.name}?`, acceptedAnswer: { "@type": "Answer", text: list.slice(0, 5).map((p, i) => `${i + 1}. ${p.name}`).join(" ") } },
    ] });
  }
  return (
    <main style={S.page}>
      <style dangerouslySetInnerHTML={{ __html: WF_PLACE_CARD_CSS }} />
      {ld.map((x, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(x) }} />)}
      {/* title keeps `, ${city.state}` so the visible H1 matches landingMetadata's
          <title> and the canonical. description states the METHOD, not just the
          promise — these pages carry Viator/Ticketmaster affiliate links and the
          structured description already tells search engines the list is ranked
          by rating and review volume with no paid placement, so the visible page
          must say at least as much. Both are asserted by
          scripts/test-ranking-editorial.mjs — this regression shipped green once
          because no guard read this copy. */}
      <PremiumIntentHero
        eyebrow={`${cat.icon} Your ${cat.label.toLowerCase()} compass`}
        location={`${city.name}, ${city.state}`}
        title={`The best ${cat.label.toLowerCase()} in ${city.name}, ${city.state}—without the endless search.`}
        description={`Wayfind turns “${cat.query} in ${city.name}” into a small, confident shortlist. Ranked by rating weighted by review volume, then proximity — no ads, no paid placement, updated daily.`}
        image={landingHeroSrc(catSlug)}
        primaryHref={"/?intent=" + encodeURIComponent(cat.query + " in " + city.name)}
        primaryLabel="Personalize my shortlist"
        secondaryHref="#wayfind-shortlist"
        secondaryLabel="See the ranked picks"
        actions={shareAction}
      />
      <section style={{ maxWidth: 920, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 28, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 24 }}>
        <div>
          <div style={S.kicker}>Chosen with context · Never sponsored</div>
          <h2 id="wayfind-shortlist" style={{ ...S.h1, fontFamily: "Georgia, 'Times New Roman', serif", fontSize: 42, lineHeight: 1.04 }}>Your {city.name} shortlist.</h2>
        </div>
        <p style={{ ...S.sub, maxWidth: 410, margin: 0 }}>Wayfind weighs rating quality, review depth, proximity, and local context—then tells you why each choice belongs.</p>
      </div>
      {/* AUDIT F3 (2026-08-02) — this template had ZERO commerce. Not a thin
          rail, not a dark one: `grep -c commerceHref|experienceGoUrl|
          BookingCTA|isTicketyPlace lib/landing.js` returned 0. It renders
          /things-to-do/[city], the most commercially-intended URL shape the
          site owns, on 31 visitors in 30 days, while Orlando alone had 193
          link-checked Viator products and 10 theme-park deals behind it.

          Placed BEFORE the ranked list and outside it on purpose. These picks
          never enter rankRows(), the Wayfind Score, or the durable place
          order — they are a separate partner layer, exactly as on the intent
          pages, and the component carries its own commission disclosure. The
          intent is declared per category in lib/railPlacement.js; nightlife
          resolves to null and renders nothing, because no partner program
          sells bar inventory. */}
      {railIntent ? (
        <IntentPartnerPick
          city={city.name}
          intent={railIntent}
          inventory={[]}
          initialInventory={railSeeds.partnerInventory}
          lat={city.lat}
          lng={city.lng}
          couponIntent={cat.townKey === "food" ? "cheapeats" : null}
        />
      ) : null}
      {/* Theme parks are Florida's single biggest attractions draw and this is
          the attractions landing page (gateCat "attractions"), yet before this
          the only theme-park surfaces were app/home.js's browse tab and
          FamilyDayPage — a visitor who lands here straight from search never
          saw a park. Orlando and Tampa are the two markets that actually hold
          major parks (see lib/themeParks.js `market`), so the rail only
          renders where it is true, never a generic filler on every city. The
          rail is entirely self-contained (its own /api/theme-parks fetch,
          its own resolver-backed ticket CTA via placePartnerPick) so it adds
          zero Places calls to this route's own SSR budget. */}
      {catSlug === "things-to-do" && (metro === "orlando" || metro === "tampa") ? (
        <ThemeParkRail mode={metro === "orlando" ? "orlando" : "flagship"} initialItems={railSeeds.themeParks} />
      ) : null}
      {profLine ? <p style={{ fontSize: 15, color: "#CBD5E1", padding: "15px 18px", borderRadius: 16, background: "#1C2230", border: "1px solid #2D3748" }}><b style={{ color: "#F97316" }}>{city.name}, decoded:</b> {profLine}</p> : null}
      {prof && prof.one ? <p style={{ fontSize: 14, color: "#CBD5E1", padding: "15px 18px", borderRadius: 16, background: "#1C2230", border: "1px solid #2D3748" }}><b style={{ color: "#FBBF24" }}>The one thing to know:</b> {prof.one}</p> : null}
      {list === null ? (
        <p style={{ fontSize: 15, color: "#CBD5E1" }}>Live rankings are loading — open <a href="/" style={S.link}>Wayfind</a> for the current list near you.</p>
      ) : list.length === 0 ? (
        <p style={{ fontSize: 15, color: "#CBD5E1" }}>{city.name} is a thin market for {cat.label.toLowerCase()} — <a href="/" style={S.link}>Wayfind</a> widens the search honestly and labels every distance.</p>
      ) : (
        <>
          <h2 style={S.h2}>The ranked list</h2>
          <ul className="wf-place-card-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {topLevel.map(({ place: p, children }, i) => {
            const q = wayfindScore(p.rating, p.reviews);
            const mi = p.distMi || 0;
            const governed = Number.isFinite(p.governed_score)
              ? p.governed_score
              : q == null ? null : governedWayfindScore(q, { hasCreatorVideo: hasCreatorVideoAt(p, city.name), distanceMi: isFinite(mi) && mi > 0 ? mi : null, trending: !!p.trending });
            const cardPlace = { ...p, governed_score: governed, photo: landingPhoto(p), cardCategory: cat.label };
            const why = landingWhyFits(p, eds[p.id]);
            const whyNote = (() => {
              if (!why) return null;
              if (why === ((eds[p.id] && eds[p.id].hook) || null)) return null;
              return <p style={{ ...S.why, marginTop: 8 }}><b>Why it fits: </b>{why}</p>;
            })();
            const tip = (eds[p.id] && eds[p.id].local_tip) || (insiderByIdx[i] && (insiderByIdx[i].tip || insiderByIdx[i].special));
            return <li className="wf-place-card-slot" key={p.id || i}>
              <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                <IconicPlaceCard place={cardPlace} rank={i + 1} href={"/?q=" + encodeURIComponent(p.name || "")}
                  editorial={eds[p.id] && eds[p.id].hook ? eds[p.id].hook : why || null} editorialTier="known" surface="seo_landing" />
              </ul>
              {(() => {
                const sig = beachSignals[p.id];
                // 2026-08-08: the 🔥 is the UNIFIED trend signal (lib/trendSignal.js,
                // attached in rankedFor) and the disclosure for the +0.6 governed
                // component; the beach-only popularity flame is folded into it.
                // Water quality stays a beach-signal read.
                // v8.19 — the same plain-language vocabulary as lib/beachChip.js
                // WATER_PLAIN (owner: a first-time reader must know what the
                // band MEANS for a swim; bare "Moderate" told them nothing).
                const wq = sig && sig.water ? (sig.water.advisory ? { t: "Water advisory — no swimming today", c: "#EF4444" } : sig.water.result === "Good" ? { t: "Water: clear — great for swimming", c: "#22C55E" } : sig.water.result === "Moderate" ? { t: "Water: fair — fine for a swim", c: "#FBBF24" } : sig.water.result ? { t: "Water: poor — skip the swim", c: "#EF4444" } : null) : null;
                const trending = !!(p.trending && p.trend_reason);
                if (!wq && !trending) return null;
                return (
                  <p style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 13, fontWeight: 700, margin: "4px 0 0" }}>
                    {trending ? <span style={{ color: "#FB923C" }} title={"Trending — " + p.trend_reason}>🔥 {p.trend_reason}</span> : null}
                    {wq ? <span style={{ color: wq.c }}>🏖️ {wq.t}</span> : null}
                  </p>
                );
              })()}
              {whyNote}
              {tip ? <p style={{ fontSize: 13.5, color: "#F1F5F9", margin: "6px 0 0", lineHeight: 1.5 }}>🗝️ <b>Insider:</b> {tip}</p> : null}
              {p.address ? <p style={S.addr}>{p.address}</p> : null}
              {/* 2026-08-26: the delivery link that lived here is gone with
                  the Uber Eats removal (owner directive; lib/affiliates.js
                  REMOVED note) — it redirected to an untracked partner search. */}
              {children && children.length ? (
                <div style={{ marginTop: 10, paddingTop: 9, borderTop: "1px solid #21262D" }}>
                  <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".5px", textTransform: "uppercase", color: "#94A3B8", margin: "0 0 7px" }}>
                    {childrenLabel(p, children)}
                  </p>
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                    {children.map((c) => (
                      <span key={c.id || c.name} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#0D1117", border: "1px solid #21262D", borderRadius: 999, padding: "5px 10px", fontSize: 12.5, color: "#CBD5E1" }}>
                        {c.name}
                        {c.rating != null ? <span style={{ color: "#F2C14E", fontWeight: 700 }}>{c.rating}{"\u2605"}</span> : null}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </li>;
          })}
          </ul>
          {(() => {
            // Task A (SEO recovery) — plain server-rendered links into the
            // durable /places/{id} pages for ids that are ACTUALLY in this
            // list and ACTUALLY in the durable-eligible set (the same set
            // the sitemap lists). No client JS, no change to the cards
            // above. Zero eligible ids -> render nothing.
            const { ids: navIds, names: navNames } = selectEligiblePlaceLinks(list, eligiblePlaceIds);
            if (!navIds.length) return null;
            return (
              <nav aria-label="Place pages in this list" style={{ marginTop: 14 }}>
                <h2 style={S.h2}>Place pages in this list</h2>
                <p style={{ fontSize: 13.5 }}>
                  {navIds.map((id, i) => (
                    <span key={id}>
                      <a href={`/places/${encodeURIComponent(id)}`} style={S.link}>{navNames.get(id)}</a>
                      {i < navIds.length - 1 ? " · " : ""}
                    </span>
                  ))}
                </p>
              </nav>
            );
          })()}
        </>
      )}
      {/* Tours mount ONLY where the tour inventory genuinely matches the page.
          things-to-do: attractions are what Viator sells. beaches: the same
          waterOnly strip already live on /best-beaches/[metro]. Restaurants get
          Order In per card instead (above); nightlife gets NOTHING — a generic
          day-tour rail on a bar page is the entity mismatch we refuse to ship,
          and a wrong recommendation costs more than the click is worth. */}
      {catSlug === "things-to-do" ? <TourStrip lat={city.lat} lng={city.lng} initialItems={railSeeds.tourItems} title={"Book an experience in " + city.name} subtitle="Bookable, top-reviewed things to do nearby — ranked by the same Wayfind Score." /> : null}
      {catSlug === "beaches" ? <TourStrip lat={city.lat} lng={city.lng} initialItems={railSeeds.tourItems} title={"Make it a beach day in " + city.name} subtitle="Bookable on-the-water experiences near these beaches — ranked by the same Wayfind Score." waterOnly /> : null}
      <a href="/" style={S.cta}>See live hours, photos &amp; today&apos;s picks on Wayfind →</a>
      <h2 style={S.h2}>More in {city.name}</h2>
      <p style={{ fontSize: 14.5 }}>
        {Object.keys(LANDING_CATS).filter((c) => c !== catSlug).map((c, i, arr) => (<span key={c}><a href={`/${c}/${citySlug}`} style={S.link}>Best {LANDING_CATS[c].label} in {city.name}</a>{i < arr.length - 1 ? " · " : ""}</span>))}
        {culture ? <> · <a href={`/culture/${metro}`} style={S.link}>What {culture.title} is known for</a></> : null}
      </p>
      <h2 style={S.h2}>Best {cat.label} in nearby cities</h2>
      <p style={{ fontSize: 14.5 }}>
        {Object.keys(LANDING_CITIES).filter((c) => c !== citySlug).map((c, i, arr) => (<span key={c}><a href={`/${catSlug}/${c}`} style={S.link}>{LANDING_CITIES[c].name}</a>{i < arr.length - 1 ? " · " : ""}</span>))}
      </p>
      <div style={S.note}>Rankings are merit-based and recomputed daily from live data. Wayfind never sells placement on this list.</div>
      {/* The rail intents were reachable from the homepage and nowhere
          else — 0 intent links on every page type, measured. */}
      <DiscoveryPaths region={metro === "orlando" ? "orlando" : "fl"} citySlug={citySlug} cityLabel={city.name} />
      </section>
    </main>
  );
}
