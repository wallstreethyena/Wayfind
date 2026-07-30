// app/eat/[metro]/page.js — the cuisine chooser sheet.
//
// ────────────────────────────────────────────────────────────────────────────
// THE RULE. A cuisine is a FILTER on already-geofenced local inventory, NEVER a
// search query. If "Puerto Rican" reaches a Places text search, Google returns
// restaurants in Puerto Rico — 1,100 miles from Orlando, with real names, real
// ratings and real photos, which is exactly what would let it pass review.
//
// This page therefore never composes a query. It reads wf_cuisine_chips(metro),
// which counts rows we already hold, and every chip links to the existing
// browse surface with a cuisine FILTER parameter.
// scripts/check-cuisine-never-queried.mjs fails the build if that changes.
// ────────────────────────────────────────────────────────────────────────────
//
// THE CHIP LIST IS DERIVED, never a static array. wf_cuisine_chips returns the
// tiers and the honest counts; this file renders what it is given, in the order
// it is given. Ordering is by real LOCAL coverage — national search volume would
// bury cuban, puerto-rican and brazilian, which are the three that matter most in
// these metros and the reason the feature exists. Measured: cuban is a full chip
// in Tampa (8) and absent in Orlando (0); puerto-rican is a thin chip in Orlando
// (2 places). A national list inverts both.
//
// THE FLOOR (owner):
//   3+ high-confidence places -> full chip, primary row
//   1-2                       -> secondary row, WITH the count ("2 nearby")
//   0                         -> absent; the RPC returns no row at all
// The middle tier is shown rather than hidden on a revenue argument: an honest
// thin chip still routes a user to a bookable place, a hidden one routes them to
// Google.
//
// Layout is app/components/EditorialLandingHero with its own class prefix —
// /best-beaches is the reference implementation and this passes `prefix` rather
// than copying its markup.
import EditorialLandingHero, { editorialHeroCss } from "../../components/EditorialLandingHero";
import { notFound } from "next/navigation";
import { SITE_URL } from "../../../lib/site";
import CuisineChips from "./chips";

export const revalidate = 3600;

const C = { bg: "#0B0F14", text: "#F4F6F8", muted: "#8A97A6", line: "#1C2530", gold: "#E8C97A" };

// Only the metros with real food inventory get a sheet. Tampa 296,
// Manatee-Sarasota 261, Orlando 243; every other metro sits at exactly 40, which
// is a seed and not coverage. The chooser works anywhere, but outside these three
// most cuisines honestly gate out — that is an inventory problem, not a UI one.
const METROS = {
  orlando: { label: "Orlando", near: "Orlando" },
  tampa: { label: "Tampa Bay", near: "Tampa" },
  "manatee-sarasota": { label: "Sarasota & Bradenton", near: "Sarasota" },
};

// Display names. The stored labels are slugs so they can be compared and
// filtered; these are what a person reads.
const PRETTY = {
  "puerto-rican": "Puerto Rican", "middle-eastern": "Middle Eastern",
  "latin-american": "Latin American", "soul-food": "Soul food",
  bbq: "Barbecue", barbecue: "Barbecue", steakhouse: "Steakhouse",
};
const pretty = (c) => PRETTY[c] || c.charAt(0).toUpperCase() + c.slice(1);

/**
 * The derived chip list. Read-only, and it counts LOCAL rows — there is no
 * radius parameter to widen and no query to compose.
 *
 * Uses the anon/publishable key, same as /best-beaches. Note the service_role
 * key cannot be used here anyway: Supabase disabled legacy JWTs on 2026-07-16 and
 * that key has not been rotated (see lib/envAudit.legacySupabaseKeys).
 */
async function chipsFor(metro) {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anon) return null;   // null = could not ask, which is NOT the same as "no cuisines"
  try {
    const r = await fetch(url + "/rest/v1/rpc/wf_cuisine_chips", {
      method: "POST",
      headers: { apikey: anon, Authorization: "Bearer " + anon, "content-type": "application/json" },
      body: JSON.stringify({ p_metro: metro }),
      next: { revalidate: 3600 },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) ? rows : null;
  } catch (e) {
    return null;
  }
}

export async function generateMetadata({ params }) {
  const meta = METROS[params.metro];
  if (!meta) return { title: "Wayfind" };
  return {
    title: `What are you in the mood for? — ${meta.label} | Wayfind`,
    description: `Pick a kind of food and see the best of it near ${meta.near}, ranked on real reviews. No ads, no paid placement.`,
    alternates: { canonical: SITE_URL + "/eat/" + params.metro },
  };
}

const CSS = editorialHeroCss("wf-eat-premium") + `
/* Chips, elevated to match the hero. The previous treatment was a flat pill with
   the count as trailing text — it read as system output next to a premium hero.
   Now: a card surface with a real border, generous tap target, and the count as a
   quiet badge. Thin-row chips are deliberately quieter so the two tiers read as a
   hierarchy at a glance rather than as one long list. */
.wf-eat-chips{display:flex;flex-wrap:wrap;gap:10px;margin:0;padding:0;list-style:none}
.wf-eat-chip{display:block}
.wf-eat-chip a{
  display:inline-flex;align-items:center;gap:10px;text-decoration:none;
  /* 46px min height keeps the tap target comfortable on mobile. */
  min-height:46px;padding:11px 14px;border-radius:14px;
  border:1px solid ${C.line};
  background:linear-gradient(180deg,#141c27 0%,#101720 100%);
  color:${C.text};font-size:15px;font-weight:680;letter-spacing:-.01em;
  box-shadow:0 1px 0 rgba(255,255,255,.03) inset,0 1px 2px rgba(0,0,0,.25);
  transition:border-color .16s ease,transform .12s ease,box-shadow .16s ease;
}
.wf-eat-chip a:hover{border-color:${C.gold};transform:translateY(-1px);box-shadow:0 1px 0 rgba(255,255,255,.05) inset,0 4px 12px rgba(0,0,0,.35)}
.wf-eat-chip a:active{transform:translateY(0);box-shadow:0 1px 2px rgba(0,0,0,.4) inset}
.wf-eat-chip a:focus-visible{outline:2px solid ${C.gold};outline-offset:2px}
.wf-eat-chip-name{line-height:1.15}
/* The count as a quiet badge rather than trailing prose. */
.wf-eat-chip-count{
  flex:none;min-width:22px;padding:2px 7px;border-radius:999px;
  background:rgba(232,201,122,.10);border:1px solid rgba(232,201,122,.20);
  color:${C.gold};font-size:11.5px;font-weight:750;line-height:1.5;text-align:center;
  font-variant-numeric:tabular-nums;
}
/* Thin tier: same shape, lower contrast. Hierarchy without a different component. */
.wf-eat-thin a{
  min-height:40px;padding:9px 12px;font-size:13.5px;font-weight:600;
  background:transparent;border-color:rgba(28,37,48,.75);color:${C.muted};
  box-shadow:none;
}
.wf-eat-thin a:hover{border-color:rgba(232,201,122,.45);color:${C.text};box-shadow:none;transform:translateY(-1px)}
.wf-eat-thin .wf-eat-chip-count{
  background:transparent;border-color:rgba(138,151,166,.28);color:${C.muted};font-weight:650;
}
.wf-eat-sub{font-size:12px;color:${C.muted};margin:26px 0 11px;letter-spacing:.9px;text-transform:uppercase;font-weight:750}
.wf-eat-sub:first-of-type{margin-top:20px}
.wf-eat-note{font-size:13px;color:${C.muted};line-height:1.55;margin:22px 0 0}
@media (max-width:420px){
  .wf-eat-chips{gap:8px}
  .wf-eat-chip a{font-size:14.5px;padding:11px 13px}
}
`;



export default async function EatPage({ params }) {
  const meta = METROS[params.metro];
  // A real 404, not a 200 with an apology. /eat/nowhere returning 200 would let
  // Google index one indexable URL per typo, all with the same empty body.
  if (!meta) notFound();

  const chips = await chipsFor(params.metro);
  // Three distinct states, kept distinct. `null` means we could not ask; an empty
  // array means we asked and this metro genuinely has nothing. Collapsing those
  // into one "no cuisines" message is the conflation that hid a five-day outage.
  const unavailable = chips === null;
  const full = (chips || []).filter((c) => c.tier === "full");
  const thin = (chips || []).filter((c) => c.tier === "thin");

  const quickPicks = full.slice(0, 6).map((c) => ({
    label: pretty(c.cuisine) + ":",
    name: c.places + (c.places === 1 ? " place" : " places"),
  }));

  const pageUrl = SITE_URL + "/eat/" + params.metro;
  const ld = [
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Wayfind", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "What to eat — " + meta.label, item: pageUrl },
    ] },
  ];
  // Only describe what actually exists. A thin cuisine is not advertised in
  // structured data as though it were a full category.
  if (full.length) {
    ld.push({
      "@context": "https://schema.org", "@type": "ItemList",
      name: "Kinds of food near " + meta.near, numberOfItems: full.length,
      itemListElement: full.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: pretty(c.cuisine) })),
    });
  }

  return (
    <main style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <EditorialLandingHero
        prefix="wf-eat-premium"
        heroImg="/cards/food-choices-adobestock-301125732.jpeg"
        imageKicker="The Wayfind table edition"
        imageTitle="Deciding what to eat is the hard part."
        toplineLeft="What are you in the mood for?"
        toplineRight={meta.near}
        headlineId="wf-eat-title"
        headline={<>What to Eat Near {meta.near}</>}
        dekLead="Pick a kind of food. We already did the ranking."
        dekBody="Every option below is somewhere near you that we hold real reviews for — not a search we ran on your behalf. Choose the food, and the shortlist is already built."
        quickTitle={quickPicks.length ? "The deepest choices here" : null}
        quickPicks={quickPicks}
        trustLines={["No paid placement. No sponsored rankings.", "Just the kind of food you actually want."]}
      />

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "18px 20px 60px" }}>
        {unavailable ? (
          <p className="wf-eat-note">
            Cuisine coverage is unavailable right now. This is a temporary problem on our side, not an
            empty neighbourhood — please try again shortly.
          </p>
        ) : !full.length && !thin.length ? (
          <p className="wf-eat-note">
            We do not hold enough restaurants near {meta.near} yet to sort them by kind of food. Rather
            than guess, we would rather say so.
          </p>
        ) : (
          <>
            {full.length ? (
              <>
                <div className="wf-eat-sub">Popular here</div>
                <CuisineChips chips={full.map((c) => ({ ...c, display: pretty(c.cuisine) }))} metro={params.metro} tier="full" />
              </>
            ) : null}

            {thin.length ? (
              <>
                {/* The 1-2 band, shown with its real count rather than hidden. An
                    honest thin chip still routes to a bookable place; hiding it
                    routes the user to Google. */}
                <div className="wf-eat-sub">Fewer nearby</div>
                <CuisineChips chips={thin.map((c) => ({ ...c, display: pretty(c.cuisine) }))} metro={params.metro} tier="thin" />
              </>
            ) : null}

            <p className="wf-eat-note">
              Counts are places near {meta.near} we hold enough signal on to stand behind. A kind of food
              with none nearby is not listed at all — we do not widen the search to pad the list.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
