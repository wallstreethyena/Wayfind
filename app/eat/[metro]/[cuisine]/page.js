// app/eat/[metro]/[cuisine]/page.js — WHAT A CHIP TAP OPENS.
//
// ────────────────────────────────────────────────────────────────────────────
// THE BUG THIS FIXES (owner-reported, P0). The chips on /eat/[metro] linked to
// /?cat=food&cuisine=<slug>. Nothing in the app read a `cuisine` param —
// app/home.js reads only go/date/cat, and its mount effect STRIPS unknown params
// — so every chip returned the user to the plain home page. Dead UI on the newest
// monetized surface.
//
// I shipped a URL contract with no consumer, and check-cuisine-sheet asserted the
// link SHAPE (`cuisine=` present, no `q=`) without asserting that anything on the
// other end read it. That is the same text-presence-instead-of-behaviour mistake
// that three earlier break-tests caught today. The guard now resolves the target
// route and fails if it does not exist.
// ────────────────────────────────────────────────────────────────────────────
//
// STILL A FILTER, NEVER A QUERY. wf_cuisine_places(metro, cuisine) reads rows
// already inside the metro's inventory and filters on a stored label. No radius,
// no text search, nothing reaches Google.
//
// SSG intact: generateStaticParams enumerates only (metro, cuisine) pairs that
// actually have places, so there is no dynamic fan-out and no route that renders
// an empty list.
import { notFound } from "next/navigation";
import { SITE_URL } from "../../../../lib/site";
import { CUISINE_METROS } from "../../../../lib/cuisine";
import CuisineListClient from "./parts";
import FoodTourRail from "../../../components/FoodTourRail";
import { METRO_DESTS, pickFoodTours } from "../../../../lib/foodTours";
import { resolveRowCta, secondaryCta, directionsUrl } from "../../../../lib/rowCta";
import { couponForPlaceName, couponEndsLabel } from "../../../../lib/coupons";
import { hasBookingCTA, bookingTargets } from "../../../../lib/bookingResolve";
import * as Aff from "../../../../lib/affiliates";
import { siteTodayStr } from "../../../../lib/siteTime";

export const revalidate = 3600;

const C = { bg: "#0B0F14", text: "#F4F6F8", muted: "#8A97A6", line: "#1C2530", gold: "#E8C97A", card: "#111823" };

const PRETTY = {
  "puerto-rican": "Puerto Rican", "middle-eastern": "Middle Eastern",
  "latin-american": "Latin American", "soul-food": "Soul food",
  barbecue: "Barbecue", steakhouse: "Steakhouse", bbq: "Barbecue",
};
const pretty = (c) => PRETTY[c] || String(c).charAt(0).toUpperCase() + String(c).slice(1);

const sb = () => ({
  url: (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, ""),
  anon: (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim(),
});

async function rpc(fn, body) {
  const { url, anon } = sb();
  if (!url || !anon) return null;
  try {
    const r = await fetch(url + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: { apikey: anon, Authorization: "Bearer " + anon, "content-type": "application/json" },
      body: JSON.stringify(body),
      next: { revalidate: 3600 },
    });
    if (!r.ok) return null;
    const j = await r.json();
    return Array.isArray(j) ? j : null;
  } catch (e) { return null; }
}

// Only pairs that HAVE places get a route. A chip cannot link to an empty page,
// because the chip only exists when the coverage query returned at least one.
/**
 * Food tours for this metro — the rail's inventory. Anon, read-only, fail-soft.
 * Scoped by dest_id, never lat/lng: all wf_experiences rows have a NULL lat, so a
 * geo filter returns nothing at all, silently.
 */
async function foodToursFor(metro) {
  const dests = METRO_DESTS[metro];
  if (!dests || !dests.length) return [];
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anon) return [];
  const cols = "product_code,title,image,rating,reviews,from_price,product_url,dest_id,link_ok";
  try {
    const r = await fetch(`${url}/rest/v1/wf_experiences?select=${cols}&dest_id=in.(${dests.join(",")})&limit=800`, {
      headers: { apikey: anon, Authorization: "Bearer " + anon },
      next: { revalidate: 3600 },
    });
    if (!r.ok) return [];
    const rowsX = await r.json();
    return pickFoodTours(Array.isArray(rowsX) ? rowsX : [], { metro, limit: 3 }).map((t) => ({
      code: t.product_code, title: t.title, image: t.image || null,
      rating: typeof t.rating === "number" ? t.rating : null,
      reviews: typeof t.reviews === "number" ? t.reviews : 0,
      fromPrice: typeof t.from_price === "number" ? t.from_price : null,
    }));
  } catch (e) { return []; }
}

export async function generateStaticParams() {
  const out = [];
  for (const metro of Object.keys(CUISINE_METROS)) {
    const chips = await rpc("wf_cuisine_chips", { p_metro: metro });
    for (const c of chips || []) out.push({ metro, cuisine: c.cuisine });
  }
  return out;
}

export async function generateMetadata({ params }) {
  const meta = CUISINE_METROS[params.metro];
  if (!meta) return { title: "Wayfind" };
  const name = pretty(params.cuisine);
  return {
    title: `The best ${name} near ${meta.label} | Wayfind`,
    description: `Every ${name} place near ${meta.label} we hold real reviews for, ranked on rating strength and review depth. No ads, no paid placement.`,
    alternates: { canonical: `${SITE_URL}/eat/${params.metro}/${params.cuisine}` },
  };
}

const M = {
  ink: "#1e2430", cream: "#f7f1e6", paper: "#fffdf8",
  coral: "#e8632e", coralDeep: "#c94f1f", gold: "#b98a2f", goldSoft: "#d8c39a",
  line: "rgba(30,36,48,.12)", muted: "#6b6355", serif: "Georgia,'Times New Roman',serif",
};

/* Values lifted from the owner-signed mock, docs/mocks/eat-cuisine-list-mock.html.
   This page no longer renders the photo hero: the mock's contract is a CREAM
   HEADER CARD over a cream list card, and the shared EditorialLandingHero is a
   different object entirely (and belongs to /best-beaches and the chooser). */
const CSS = `
.wf-sl-sheet{max-width:980px;margin:0 auto;padding:28px 20px 60px}
.wf-sl-head{background:${M.cream};border-radius:22px;padding:36px 44px 30px;box-shadow:0 24px 60px rgba(0,0,0,.4);margin-bottom:18px;position:relative;overflow:hidden}
.wf-sl-head::after{content:"❧";position:absolute;right:34px;bottom:18px;font-size:44px;color:rgba(185,138,47,.14)}
.wf-sl-crumb{font-size:12px;letter-spacing:.18em;font-weight:700;text-transform:uppercase;color:${M.muted};margin-bottom:16px}
.wf-sl-crumb a{color:${M.coral};text-decoration:none}
.wf-sl-crumb a:hover{text-decoration:underline}
.wf-sl-crumb span{color:#b3aa98;margin:0 8px}
.wf-sl-h1{font-family:${M.serif};font-weight:600;font-size:46px;line-height:1.05;margin:0 0 8px;color:${M.ink}}
.wf-sl-h1 em{font-style:italic;color:${M.coralDeep}}
.wf-sl-sub{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap}
.wf-sl-count{font-family:${M.serif};font-style:italic;font-size:17px;color:#7a6a45}
.wf-sl-rulewrap{flex:1;height:1px;background:linear-gradient(to right,${M.goldSoft},transparent);min-width:40px}
.wf-sl-ranked{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#9a9080;font-weight:700}

.wf-sl-list{background:${M.cream};border-radius:22px;box-shadow:0 24px 60px rgba(0,0,0,.4);overflow:hidden}
.wf-sl-row{display:grid;grid-template-columns:64px 1fr auto;gap:20px;padding:26px 40px;border-bottom:1px solid ${M.line};align-items:center;transition:background .15s ease}
.wf-sl-row:hover{background:rgba(255,253,248,.85)}
.wf-sl-row:last-child{border-bottom:none}
.wf-sl-rank{font-family:${M.serif};font-size:34px;color:rgba(30,36,48,.28);text-align:center;line-height:1}
.wf-sl-first .wf-sl-rank{color:${M.coralDeep}}
.wf-sl-info{min-width:0}
.wf-sl-name{display:block;font-family:${M.serif};font-size:23px;color:${M.ink};margin-bottom:5px;text-decoration:none}
.wf-sl-name:hover{color:${M.coralDeep}}
.wf-sl-name:focus-visible{outline:2px solid ${M.coral};outline-offset:3px}
.wf-sl-badges{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:7px}
.wf-sl-stars{color:${M.gold};font-size:13px;letter-spacing:1px}
.wf-sl-rating{font-weight:700;font-size:14px;color:${M.ink}}
.wf-sl-reviews{color:${M.muted};font-size:13.5px}
.wf-sl-dot{color:#c4bba8}
.wf-sl-price{font-size:13.5px;color:#7a6a45;font-weight:700}
.wf-sl-known{font-size:14.5px;color:#4a4438;line-height:1.5;max-width:52ch}
.wf-sl-known b{color:${M.coralDeep};font-weight:700}
.wf-sl-deal{display:inline-flex;align-items:center;gap:7px;margin-top:9px;background:rgba(232,99,46,.09);border:1px solid rgba(232,99,46,.3);color:${M.coralDeep};font-size:12.5px;font-weight:700;border-radius:999px;padding:5px 12px}
.wf-sl-exp{font-weight:500;color:#a06a4a;font-style:italic}
.wf-sl-actions{display:flex;flex-direction:column;gap:9px;align-items:stretch;min-width:172px}
.wf-sl-cta{border-radius:12px;padding:13px 18px;font-size:14.5px;font-weight:700;text-align:center;text-decoration:none;transition:transform .12s ease,box-shadow .12s ease;min-height:46px;display:flex;align-items:center;justify-content:center}
.wf-sl-primary{background:linear-gradient(170deg,${M.coral},${M.coralDeep});color:#fff;box-shadow:0 6px 16px rgba(201,79,31,.35);border:none}
.wf-sl-primary:hover{transform:translateY(-1px);box-shadow:0 10px 22px rgba(201,79,31,.45)}
.wf-sl-quiet{background:transparent;border:1px solid ${M.line};color:#4a4438;font-weight:600}
.wf-sl-quiet:hover{border-color:rgba(232,99,46,.45);color:${M.coralDeep}}
.wf-sl-cta:focus-visible{outline:2px solid ${M.coral};outline-offset:3px}
.wf-sl-ftc{font-size:10.5px;color:#9a9080;text-align:center;line-height:1.4}

.wf-sl-trust{color:#8b93a2;font-size:13px;text-align:center;margin-top:22px;line-height:1.6}
.wf-sl-trust b{color:#b7c0cf}

@media (max-width:760px){
  .wf-sl-head{padding:26px 24px}
  .wf-sl-h1{font-size:34px}
  .wf-sl-row{grid-template-columns:40px 1fr;padding:20px 22px}
  .wf-sl-rank{font-size:26px}
  .wf-sl-actions{grid-column:1 / -1;flex-direction:row;flex-wrap:wrap;min-width:0}
  .wf-sl-cta{flex:1}
  .wf-sl-ftc{flex-basis:100%}
}
`;

export default async function CuisineListPage({ params }) {
  const meta = CUISINE_METROS[params.metro];
  if (!meta) notFound();
  const rows = await rpc("wf_cuisine_places", { p_metro: params.metro, p_cuisine: params.cuisine });
  // A cuisine with no places has no chip, so this route should be unreachable.
  // If it is reached, 404 rather than render an empty page — a soft-404 with an
  // apology body is one indexable empty URL per guess.
  if (!rows || !rows.length) notFound();

  const name = pretty(params.cuisine);
  // The score arrives PRE-COMPUTED from wf_cuisine_places. It used to be derived
  // here via lib/google.wayfindScore, which broke the route at runtime
  // ("TypeError: m is not a function") — that module is built for the browser and
  // does not survive the server bundle. Computing it in SQL also means the list
  // ORDER and the displayed score come from one expression rather than two that
  // can drift apart.
  // ── the per-row action ladder, resolved SERVER-side ──────────────────────
  // deal > bookable > delivery > directions (lib/rowCta.js). Two rungs ship dark
  // today and are wired anyway, so they light up with zero code change here:
  //   deal      the coupon registry holds only MARKET-level offers so far; when
  //             per-merchant rows land, couponForPlaceName starts matching.
  //   bookable  hasBookingCTA is false for every restaurant kind (BOOKABLE_KINDS
  //             has no food kind) and no reservation partner exists yet.
  // Delivery is the only rung that fires now — and it EARNS NOTHING until
  // NEXT_PUBLIC_UBEREATS_TEMPLATE is set, which is why `monetized` is computed
  // from the template rather than from "a link exists". The FTC line follows that
  // flag, so it never appears under a link that cannot earn.
  //
  // siteTodayStr() is venue-local Eastern, never UTC — a UTC date expires a
  // coupon ~4h early for a Florida user.
  const today = siteTodayStr();
  const deliveryEarns = !!(process.env.NEXT_PUBLIC_UBEREATS_TEMPLATE || "").trim();

  const places = rows.map((r) => ({
    id: r.place_id, name: r.name,
    rating: r.rating != null ? Number(r.rating) : null,
    reviews: Number(r.reviews) || 0,
    hook: r.hook || null,
    // 0-100 -> /10, one decimal. Null stays NULL: a missing base score must never
    // coerce to 0, which renders as a fake red 0.1/10.
    score: r.wf_score == null ? null : Math.round((Number(r.wf_score) / 10) * 10) / 10,
    price: r.price_level || null,
    why: r.why_here || null,
  })).map((p) => {
    const detail = { id: p.id, name: p.name, address: null, types: ["restaurant"], primaryCategory: "restaurant" };
    const coupon = couponForPlaceName(p.name, today);
    const bookable = hasBookingCTA(detail, "food", {}, meta.label)
      ? bookingTargets(detail, "food", null, meta.label).tu
      : null;
    const delivery = Aff.uberEatsUrl(p.name, meta.label) || null;
    const maps = directionsUrl({ id: p.id, name: p.name, city: meta.label });
    const cta = resolveRowCta({
      deal: coupon ? {
        url: coupon.affiliateUrl || coupon.url || coupon.directUrl,
        id: coupon.id,
        provider: coupon.commerce && coupon.commerce.provider,
        offerId: coupon.commerce && coupon.commerce.offerId,
      } : null,
      bookingUrl: bookable, deliveryUrl: delivery, deliveryEarns, mapsUrl: maps,
    });
    return {
      ...p,
      cta,
      secondary: secondaryCta(cta, maps),
      deal: coupon ? { title: coupon.title || coupon.offer_title || "Deal available", ends: couponEndsLabel(coupon) } : null,
    };
  });

  // The rail's inventory for this metro. Absent inventory renders nothing at all.
  const foodTours = await foodToursFor(params.metro);

  const pageUrl = `${SITE_URL}/eat/${params.metro}/${params.cuisine}`;
  const ld = [
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Wayfind", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "What to eat — " + meta.label, item: `${SITE_URL}/eat/${params.metro}` },
      { "@type": "ListItem", position: 3, name: name + " near " + meta.label, item: pageUrl },
    ] },
    { "@context": "https://schema.org", "@type": "ItemList", name: `${name} near ${meta.label}`,
      numberOfItems: places.length,
      itemListElement: places.map((p, i) => ({
        "@type": "ListItem", position: i + 1,
        item: { "@type": "Restaurant", name: p.name,
          aggregateRating: p.rating != null && p.reviews >= 15
            ? { "@type": "AggregateRating", ratingValue: p.rating, reviewCount: p.reviews } : undefined },
      })) },
  ];

  return (
    <main style={{ background: "#141a24", minHeight: "100vh", color: "#1e2430", fontFamily: "var(--wf-sans)" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="wf-sl-sheet">
        <div className="wf-sl-head">
          <div className="wf-sl-crumb">
            <a href={`/eat/${params.metro}`}>What to Eat Near {meta.label}</a>
            <span aria-hidden="true">&rsaquo;</span>{name}
          </div>
          <h1 className="wf-sl-h1" id="wf-sl-title">The best <em>{name}</em> near {meta.label}</h1>
          <div className="wf-sl-sub">
            <span className="wf-sl-count">
              {places.length} {places.length === 1 ? "place" : "places"} &middot; ranked by real reviews, not ads
            </span>
            <span className="wf-sl-rulewrap" aria-hidden="true" />
            <span className="wf-sl-ranked">The shortlist is already built</span>
          </div>
        </div>

        <CuisineListClient places={places} metro={params.metro} cuisine={params.cuisine} />

        {/* The dark editorial interruption. Reuses the #485 rail component and
            renders NOTHING when this metro has no food-tour inventory — an empty
            frame would cost trust and still measure as a viewed surface. */}
        <FoodTourRail offers={foodTours} metro={params.metro} surface="cuisine_shortlist" />

        <p className="wf-sl-trust">
          <b>No paid placement. No sponsored rankings.</b> Order comes from real reviews and our own
          signal — a place can never pay to move up.
        </p>
      </div>
    </main>
  );
}
