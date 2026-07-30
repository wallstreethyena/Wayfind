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
import EditorialLandingHero, { editorialHeroCss } from "../../../components/EditorialLandingHero";
import { SITE_URL } from "../../../../lib/site";
import { CUISINE_METROS } from "../../../../lib/cuisine";
import CuisineListClient from "./parts";

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

const CSS = editorialHeroCss("wf-eat-premium") + `
.wf-cl-list{list-style:none;margin:20px 0 0;padding:0}
.wf-cl-row{display:block;text-decoration:none;color:inherit;background:${C.card};border:1px solid ${C.line};border-radius:16px;padding:14px 16px;margin:0 0 10px;transition:border-color .15s ease,transform .12s ease}
.wf-cl-row:hover{border-color:${C.gold};transform:translateY(-1px)}
.wf-cl-top{display:flex;align-items:baseline;justify-content:space-between;gap:12px}
.wf-cl-name{font-size:16px;font-weight:750;line-height:1.25}
.wf-cl-score{flex:none;font-size:13px;font-weight:750;color:${C.gold}}
.wf-cl-meta{font-size:12.5px;color:${C.muted};margin-top:4px}
.wf-cl-hook{font-size:13.5px;color:${C.gold};line-height:1.45;margin-top:7px;font-weight:650}
.wf-cl-note{font-size:13px;color:${C.muted};line-height:1.5;margin:20px 0 0}
.wf-cl-back{display:inline-block;font-size:13px;color:${C.muted};text-decoration:none;margin:0 0 4px}
.wf-cl-back:hover{color:${C.text}}
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
  const places = rows.map((r) => ({
    id: r.place_id, name: r.name,
    rating: r.rating != null ? Number(r.rating) : null,
    reviews: Number(r.reviews) || 0,
    hook: r.hook || null,
    // 0-100 -> /10, one decimal. Null stays NULL: a missing base score must never
    // coerce to 0, which renders as a fake red 0.1/10.
    score: r.wf_score == null ? null : Math.round((Number(r.wf_score) / 10) * 10) / 10,
  }));

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
    <main style={{ background: C.bg, minHeight: "100vh", color: C.text, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <EditorialLandingHero
        prefix="wf-eat-premium"
        heroImg="/cards/food-choices-adobestock-301125732.jpeg"
        imageKicker="The Wayfind table edition"
        imageTitle={`${name}, ranked.`}
        toplineLeft={`${places.length} ${places.length === 1 ? "place" : "places"} near you`}
        toplineRight={meta.label}
        headlineId="wf-eat-cuisine-title"
        headline={<>The Best {name} Near {meta.label}</>}
        dekLead="Ranked on real reviews, not on who paid."
        dekBody={` Every place here is one we already hold reviews for near ${meta.label} — this is a filter over what is actually around you, not a search we ran on your behalf.`}
        trustLines={["No paid placement. No sponsored rankings.", `Just the best ${name.toLowerCase()} near you.`]}
      />
      <div style={{ maxWidth: 680, margin: "0 auto", padding: "18px 20px 60px" }}>
        <a className="wf-cl-back" href={`/eat/${params.metro}`}>&larr; All kinds of food</a>
        <CuisineListClient places={places} metro={params.metro} cuisine={params.cuisine} />
        <p className="wf-cl-note">
          Scores weigh rating strength against review depth — a 4.8 from thousands outranks a 5.0 from a
          handful. Places without enough reviews to score honestly show no score rather than a guess.
        </p>
      </div>
    </main>
  );
}
