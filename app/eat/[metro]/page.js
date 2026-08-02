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
import CuisineMenu from "./CuisineMenu";
import FoodTourRail from "../../components/FoodTourRail";
import { METRO_DESTS, pickFoodTours } from "../../../lib/foodTours";

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

/**
 * The food tours for this metro. Read-only, anon, fail-soft to [].
 *
 * ANON, deliberately — the same reason chipsFor above uses it: the service-role
 * key is a legacy JWT and legacy keys 401 on every call (lib/envAudit.js).
 * wf_experiences carries wf_experiences_anon_read (SELECT USING true).
 *
 * SCOPED BY dest_id, NEVER by lat/lng: all 1,234 wf_experiences rows have a NULL
 * lat, so a geo filter returns nothing at all — silently. The dest set per metro
 * lives in lib/foodTours METRO_DESTS and mirrors the labels this page already
 * shows: "Tampa Bay" covers St. Pete and Clearwater, "Sarasota & Bradenton" does
 * not. Drawing wider than the label is the geo/entity mismatch class that shipped
 * the Dalí→Barcelona bug.
 */
async function foodToursFor(metro) {
  const dests = METRO_DESTS[metro];
  if (!dests || !dests.length) return [];
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anon) return [];
  const cols = "product_code,title,image,rating,reviews,from_price,product_url,dest_id,link_ok";
  const q = `${url}/rest/v1/wf_experiences?select=${cols}&dest_id=in.(${dests.join(",")})&limit=800`;
  try {
    const r = await fetch(q, {
      headers: { apikey: anon, Authorization: "Bearer " + anon },
      next: { revalidate: 3600 },
    });
    if (!r.ok) return [];
    const rows = await r.json();
    return pickFoodTours(Array.isArray(rows) ? rows : [], { metro, limit: 4 }).map((t) => ({
      code: t.product_code,
      title: t.title,
      image: t.image || null,
      rating: typeof t.rating === "number" ? t.rating : null,
      reviews: typeof t.reviews === "number" ? t.reviews : 0,
      fromPrice: typeof t.from_price === "number" ? t.from_price : null,
    }));
  } catch (e) {
    return [];
  }
}

export async function generateMetadata({ params }) {
  const meta = METROS[params.metro];
  if (!meta) return { title: "Wayfind" };
  return {
    title: `Pick your mood — ${meta.label} | Wayfind`,
    description: `Pick a kind of food and see the best of it near ${meta.near}, ranked on real reviews. No ads, no paid placement.`,
    alternates: { canonical: SITE_URL + "/eat/" + params.metro },
  };
}

/* ── The chooser, INSIDE the cream card ──────────────────────────────────────
   Values lifted from the owner-signed mock, docs/mocks/eat-hero-chips-mock-v3.html.
   Everything here is scoped to the wf-eat-premium prefix on purpose:
   EditorialLandingHero is SHARED with /best-beaches, so a global restyle would move
   a page this redesign has nothing to do with. Where the mock and the existing
   sheet disagree, the mock wins — but only inside this prefix.

   NO PILLS. The mock's stylesheet still carries a .chips/.chip pill block from v2
   (border-radius:999px), but its rendered body never uses it and the directive is
   explicit: no pills anywhere. That dead block is deliberately not ported. */
const MOCK = {
  ink: "#1e2430", cream: "#f7f1e6", paper: "#fffdf8",
  coral: "#e8632e", coralDeep: "#c94f1f",
  gold: "#b98a2f", goldSoft: "#d8c39a",
  line: "rgba(30,36,48,.12)", muted: "#6b6355",
  serif: "Georgia,'Times New Roman',serif",
};

const CSS = editorialHeroCss("wf-eat-premium") + `
/* min-width:0 on the grid children is DEFENSIVE, not a fix for an observed bug.
   A grid/flex child defaults to min-width:auto and refuses to shrink below its
   content, which is the standard way a card grid overflows a narrow screen. It
   costs nothing here and removes that failure mode.
   Stated honestly because I briefly believed the opposite: a 390px headless
   screenshot showed the card clipped, and I diagnosed a real overflow. It was an
   artefact — headless Chrome enforces a ~500px minimum window, so the 390px image
   was a CROP of a 500px render. At 500px the layout is complete and correct. True
   ≤420px behaviour is therefore NOT verified locally and is the owner's
   real-device check. */
.wf-eat-menu{margin-top:2px;min-width:0}
.wf-eat-featured>li,.wf-eat-index>li{min-width:0}
.wf-eat-featured a,.wf-eat-index a{min-width:0;max-width:100%}
.wf-eat-fname,.wf-eat-iname{overflow-wrap:anywhere}

/* Tier headers: fleuron, italic serif label, gold gradient rule, small-caps hint. */
.wf-eat-tierhead{display:flex;align-items:baseline;gap:12px;margin-bottom:14px}
.wf-eat-tierhead + .wf-eat-featured{margin-bottom:26px}
.wf-eat-orn{color:${MOCK.gold};font-size:13px;letter-spacing:.05em}
.wf-eat-tiert{font-family:${MOCK.serif};font-size:19px;font-style:italic;color:#3c3628}
.wf-eat-tierrule{height:1px;background:linear-gradient(to right,${MOCK.goldSoft},transparent);flex:1;align-self:center}
.wf-eat-tierhint{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#9a9080;font-weight:700}

/* Featured — six gold-framed menu cards, two rows of three. The double hairline is
   the border plus a ::before inset rule, exactly as the mock draws it. */
.wf-eat-featured{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:0 0 26px;padding:0;list-style:none}
.wf-eat-featured a{
  position:relative;display:block;text-decoration:none;
  background:linear-gradient(165deg,${MOCK.paper} 0%,#f4ecdc 100%);
  border:1px solid rgba(185,138,47,.35);border-radius:14px;padding:16px 16px 14px;
  box-shadow:0 1px 2px rgba(30,36,48,.05);
  transition:transform .14s ease,box-shadow .14s ease;
}
.wf-eat-featured a::before{content:"";position:absolute;inset:6px;border:1px solid rgba(185,138,47,.18);border-radius:9px;pointer-events:none}
.wf-eat-featured a:hover{transform:translateY(-2px);box-shadow:0 14px 30px rgba(30,36,48,.16)}
.wf-eat-featured a:active{transform:translateY(0);box-shadow:0 1px 2px rgba(30,36,48,.08)}
.wf-eat-featured a:focus-visible{outline:2px solid ${MOCK.coral};outline-offset:3px}
.wf-eat-fnum{display:block;font-family:${MOCK.serif};font-size:30px;line-height:1;color:${MOCK.coralDeep};margin-bottom:6px;font-variant-numeric:tabular-nums}
.wf-eat-fnum small{font-family:inherit;font-size:13px;color:#8a7a55;font-style:italic;margin-left:4px}
.wf-eat-fname{display:block;font-family:${MOCK.serif};font-size:19px;color:${MOCK.ink};margin-bottom:5px}
.wf-eat-fgo{display:block;font-size:11px;letter-spacing:.14em;font-weight:700;text-transform:uppercase;color:${MOCK.coral}}
.wf-eat-fgo::after{content:" \\2192"}

/* Index — menu-style dotted leaders. CSS columns, as the mock uses, with
   break-inside:avoid so a row never splits across a column. */
.wf-eat-index{columns:3;column-gap:34px;margin:0 0 4px;padding:0;list-style:none}
.wf-eat-index li{break-inside:avoid}
.wf-eat-index a{
  display:flex;align-items:baseline;gap:8px;text-decoration:none;
  padding:7px 2px;border-bottom:1px solid rgba(30,36,48,.08);
  transition:color .12s ease;
}
.wf-eat-iname{font-family:${MOCK.serif};font-size:14.5px;color:#5c5546;flex-shrink:0}
.wf-eat-idots{flex:1;border-bottom:1px dotted rgba(107,99,85,.45);transform:translateY(-3px)}
.wf-eat-in{font-family:${MOCK.serif};font-style:italic;font-size:13px;color:#9a8a60;font-variant-numeric:tabular-nums}
.wf-eat-index a:hover .wf-eat-iname{color:${MOCK.coralDeep}}
.wf-eat-index a:hover .wf-eat-in{color:${MOCK.coral}}
.wf-eat-index a:focus-visible{outline:2px solid ${MOCK.coral};outline-offset:2px}

/* The trust line is the card's footer. The mock's treatment (13px, gold dot,
   hairline above) differs from the shared template's 10.5px SVG lockup — the mock
   wins, scoped here so /best-beaches keeps its own. */
.wf-eat-premium-footer{display:block;margin-top:22px;padding-top:0}
.wf-eat-premium-trust{
  border-top:1px solid ${MOCK.line};padding-top:16px;
  color:${MOCK.muted};font-size:13px;line-height:1.5;
}
.wf-eat-premium-trust svg{color:${MOCK.gold};flex:none}

.wf-eat-note{font-size:13px;color:${C.muted};line-height:1.55;margin:22px 0 0}

/* Mobile: featured 2-up, index 2 columns, and 46px tap targets. The mock's index
   rows are ~30px tall — a deliberate deviation, because the directive requires a
   46px target and a design mock is not a touch spec. */
@media (max-width:900px){
  .wf-eat-featured{grid-template-columns:1fr 1fr}
  .wf-eat-index{columns:2}
}
@media (max-width:520px){
  .wf-eat-tiert{font-size:17px}
  .wf-eat-featured{gap:10px}
  .wf-eat-featured a{padding:13px 12px 12px;min-height:46px}
  .wf-eat-featured a::before{inset:5px}
  .wf-eat-fnum{font-size:26px}
  .wf-eat-fname{font-size:17px}
  /* Slightly tighter tracking so "See the shortlist" sits comfortably in a 2-up
     card. The label itself is NOT hidden or abbreviated — it is the card's only
     call to action. */
  .wf-eat-fgo{letter-spacing:.10em}
  .wf-eat-index{column-gap:18px}
  .wf-eat-index a{min-height:46px;align-items:center;padding:10px 2px}
  .wf-eat-iname{font-size:14px}
}
`;



export default async function EatPage({ params }) {
  const meta = METROS[params.metro];
  // A real 404, not a 200 with an apology. /eat/nowhere returning 200 would let
  // Google index one indexable URL per typo, all with the same empty body.
  if (!meta) notFound();

  // Both reads run CONCURRENTLY — the rail must not add its latency to the chips,
  // which are the page's primary content. Started before either is awaited, so
  // this is parallel despite reading sequentially.
  //
  // Deliberately NOT Promise.all: scripts/check-cuisine-sheet.mjs (#479) asserts
  // the literal `await chipsFor(params.metro)`, because a defined-but-uncalled
  // fetch still contains the RPC name and would pass a text check. Promise.all is
  // semantically identical but removes that literal, so it would have silently
  // disarmed another lane's guard to save nothing. Their assertion protects a real
  // property; the fix is to keep the shape it checks, not to loosen the check.
  const toursPromise = foodToursFor(params.metro);
  const chips = await chipsFor(params.metro);
  const foodTours = await toursPromise;
  // Three distinct states, kept distinct. `null` means we could not ask; an empty
  // array means we asked and this metro genuinely has nothing. Collapsing those
  // into one "no cuisines" message is the conflation that hid a five-day outage.
  const unavailable = chips === null;
  const full = (chips || []).filter((c) => c.tier === "full");
  const thin = (chips || []).filter((c) => c.tier === "thin");

  // ONE list, both former tiers, ordered by count desc — the RPC already returns
  // it that way (order by places_hi desc, cuisine), so this is a pass-through, not
  // a second ordering authority that could disagree with the SQL.
  //
  // The old `quickPicks` stat grid is gone: it restated counts the chips already
  // carry, and two surfaces answering one question is the duplication the redesign
  // exists to remove. `full`/`thin` survive only for structured data and the
  // empty-state test, where the 3+/1-2 distinction still means something.
  const menuChips = (chips || []).map((c) => ({ ...c, display: pretty(c.cuisine) }));

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
        backHref="/"
        backLabel="Wayfind"
        heroImg="/cards/food-choices-adobestock-301125732.jpeg"
        imageKicker="The Wayfind table edition"
        imageTitle="Deciding what to eat is the hard part."
        toplineLeft="Pick your mood"
        toplineRight={meta.near}
        headlineId="wf-eat-title"
        headline={<>What to Eat Near {meta.near}</>}
        dekLead="Pick a kind of food. We already did the ranking."
        dekBody="Every option below is somewhere near you that we hold real reviews for — not a search we ran on your behalf. Choose the food, and the shortlist is already built."
        // The stat grid is deliberately EMPTY: the chooser below replaces it, and
        // the template renders nothing when picks are empty.
        quickPicks={[]}
        // The chooser rides in actionSlot, which the template places inside the
        // cream panel directly above the trust line — so the card becomes the whole
        // decision surface without the shared template changing at all.
        actionSlot={
          unavailable ? null : <CuisineMenu chips={menuChips} metro={params.metro} />
        }
        trustLines={[
          "No paid placement. No sponsored rankings.",
          `Counts are places near ${meta.near} we hold enough signal on to stand behind — we never widen the search to pad the list.`,
        ]}
      />

      {/* The money surface sits DIRECTLY under the hero and OUTSIDE the 680px
          reading column — this is the highest position available without
          restructuring the shared editorial template, which /best-beaches also
          renders. On a phone the hero collapses to a 280px image plus its text
          panel, so whether this clears the fold is a real-device question, not
          one a resized desktop window can answer. It renders nothing at all when
          there are no real tours: an empty "tours near you" frame costs trust and
          would still measure as a viewed surface. */}
      <FoodTourRail offers={foodTours} metro={params.metro} />

      {/* The below-card chip section is GONE — it was the same chooser a second
          time, in a second visual language. What remains here is only the state
          copy, which has no home inside the card because the card is not rendered
          as a chooser when there is nothing to choose. */}
      {unavailable || (!full.length && !thin.length) ? (
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "18px 20px 60px" }}>
          {unavailable ? (
            <p className="wf-eat-note">
              Cuisine coverage is unavailable right now. This is a temporary problem on our side, not an
              empty neighbourhood — please try again shortly.
            </p>
          ) : (
            <p className="wf-eat-note">
              We do not hold enough restaurants near {meta.near} yet to sort them by kind of food. Rather
              than guess, we would rather say so.
            </p>
          )}
        </div>
      ) : null}
    </main>
  );
}
