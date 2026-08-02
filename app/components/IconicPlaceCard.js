"use client";

// Portable renderer for the canonical home PlaceCard visual contract. The
// classes and geometry come from WF_PLACE_CARD_CSS; keeping those names here
// means collection cards cannot quietly become a second, taller card system.
import { WayfindScoreBadge } from "./kit";
import { businessStatus } from "../../lib/businessStatus";
import { coarseCat } from "../../lib/ranking";
import { toDisplayScore } from "../../lib/score";
import { wayfindScore } from "../../lib/google";
import { priceLabel } from "../../lib/price";
import { commerceHref, emitCommerce, mintClickId } from "../../lib/commerce";
import { placePartnerPick } from "../../lib/placePartnerPicks";
import { cuisineLabel } from "../../lib/dining";
import { overrideFor } from "../../lib/placeOverrides";
import * as Tags from "../../lib/tags";

// ---------------------------------------------------------------------------
// Experience-tag chips (owner: "I need the cards to look like the cards from
// the main menu" — home.js's canonical PlaceCard shows a row of clickable
// tag chips like "☕ Coffee ›", "💰 Great value ›", "⭐ Crowd favorite ›" and
// this card had nothing computing them). This is a portable adaptation of
// app/home.js's `experienceBadges(p, selectedKey, max, audit)` — same visual
// contract and the same evidence discipline (nothing invented) — but it is a
// LOCAL, independently-owned copy, not an import.
//
// Two reasons it must not import experienceBadges: (1)
// scripts/check-collection-look.mjs asserts `experienceBadges` stays
// physically declared inside app/home.js — home.js is a client component
// module with its own closure (EXPERIENCES, HINTS, faveTier/isLocalFave/
// isBestOf, the curated BEST_OF/LOCAL_FAVE name lists) and none of that is
// exported; and (2) it is not this codebase's pattern anyway — every other
// surface outside that closure (ThingsToDoList.js's Card, HookDetail.js when
// rendered as its own module) already carries its own adapted chip logic
// rather than reaching across the module boundary, and this follows suit.
//
// Signal availability differs from home.js's PlaceCard because the rows that
// reach this component (IntentPageClient's toRow(), TrendingNowClient's buzz
// rows) never carry Google's `labels` attribute array (Live music, Cocktails,
// Wine, Beer via label, Sports, Breakfast, Good for groups, Dog friendly) or
// the curated BEST_OF/LOCAL_FAVE name lists (home.js-local, geo-gated, not
// exported anywhere). So "bestof", "livemusic", "cocktails", "wine", "sports",
// "breakfast", "groups" and "dog" cannot be produced here — there is no real
// signal to ground them in, and nothing here is allowed to invent one. Every
// other key IS grounded in data these rows really carry: reputation
// (localfav/gem/value from rating + reviews + price), setting (waterfront,
// gated on the same lib/placeOverrides.js noWater override home.js reads;
// name-evident rooftop/romantic/instagram), real Google place types
// (family/outdoor/museum/nature/entertainment, gated through lib/tags.js's
// identity/compatibility map — the same v2.0 trust layer home.js's
// experienceBadges applies) and cuisine (via the shared lib/dining.js
// cuisineLabel, the exact source home.js's badge engine already uses).
const EXP_META = {
  localfav: { icon: "⭐", label: "Crowd favorite" },
  gem: { icon: "💎", label: "Hidden gem" },
  value: { icon: "💰", label: "Great value" },
  waterfront: { icon: "🌊", label: "Waterfront" },
  rooftop: { icon: "🌆", label: "Rooftop" },
  romantic: { icon: "💕", label: "Romantic" },
  instagram: { icon: "📸", label: "Instagrammable" },
  outdoor: { icon: "🌳", label: "Outdoor" },
  family: { icon: "👨‍👩‍👧", label: "Best for families" },
  museum: { icon: "🏛️", label: "Museum" },
  nature: { icon: "🌿", label: "Nature & trails" },
  entertainment: { icon: "🎢", label: "Attractions & fun" },
  pizza: { icon: "🍕", label: "Pizza" },
  sushi: { icon: "🍣", label: "Sushi" },
  steak: { icon: "🥩", label: "Steakhouse" },
  seafood: { icon: "🦐", label: "Seafood" },
  burgers: { icon: "🍔", label: "Burgers" },
  mexican: { icon: "🌮", label: "Mexican" },
  italian: { icon: "🍝", label: "Italian" },
  dessert: { icon: "🍰", label: "Bakery & sweets" },
  coffee: { icon: "☕", label: "Coffee" },
  beer: { icon: "🍺", label: "Great beer" },
};
// Same display precedence as home.js's `order` array in experienceBadges,
// minus the keys this surface cannot ground in real data (see comment above).
const EXP_ORDER = ["museum", "nature", "entertainment", "waterfront", "instagram", "rooftop", "romantic", "outdoor", "pizza", "sushi", "steak", "seafood", "burgers", "mexican", "italian", "dessert", "beer", "coffee", "family", "gem", "value", "localfav"];

export function experienceTags(place, max) {
  if (!place) return [];
  const lim = max || 3;
  const q = new Set();
  const nm = (place.name || "").toLowerCase();
  const said = (arr) => arr.some((w) => nm.includes(w));
  const types = Array.isArray(place.types) ? place.types : [];
  const ts = types.join(" ").toLowerCase();
  const tokens = types.map((x) => String(x).toLowerCase());
  const rating = Number(place.rating) || 0;
  const reviews = Number(place.reviews) || 0;
  const priceNum = place.priceLevel != null ? Number(place.priceLevel) : (place.priceNum != null ? Number(place.priceNum) : null);
  // v5.75 parity: an override can hard-disable the waterfront read for an
  // inland place whose name merely mentions water words (same source home.js
  // reads through Ranking.overrideFor).
  const ov = overrideFor(place);
  const noWater = !!(ov && ov.noWater);

  if (rating >= 4.6 && reviews >= 800) q.add("localfav");
  if (rating >= 4.5 && reviews >= 2500) q.add("localfav");
  if (rating >= 4.4 && reviews >= 15 && reviews < 800) q.add("gem");
  if (rating >= 4.2 && priceNum != null && priceNum <= 2) q.add("value");

  if (!noWater && said(["waterfront", "riverfront", "riverwalk", "on the river", "bayfront", "beachfront", "lakefront", "wharf", "dockside", "boathouse", "on the bay", "on the water"])) q.add("waterfront");
  if (said(["rooftop", "roof top", "sky bar", "skybar", "skyline"])) q.add("rooftop");
  if (said(["romantic", "date night", "intimate", "candlelit", "special occasion"])) q.add("romantic");
  if (said(["instagram", "instagrammable", "photo spot", "photogenic", "aesthetic", "scenic", "great views", "amazing views", "beautiful views", "stunning views", "picturesque", "mural"])) q.add("instagram");

  if (["zoo", "aquarium", "amusement_park", "water_park", "theme_park"].some((x) => ts.includes(x))) q.add("family");
  if (tokens.some((x) => ["zoo", "national_park", "state_park", "botanical_garden", "campground", "beach", "park", "garden", "rv_park", "hiking_area"].includes(x))) q.add("outdoor");
  if (["museum", "art_gallery"].some((x) => ts.includes(x)) || said(["museum", "gallery"])) q.add("museum");
  if (tokens.some((x) => ["national_park", "state_park", "natural_feature", "botanical_garden", "campground", "hiking_area", "park", "garden"].includes(x)) || said(["preserve", "nature trail", "trailhead"])) q.add("nature");
  if (["amusement_park", "theme_park", "water_park", "bowling_alley", "movie_theater", "aquarium", "zoo"].some((x) => ts.includes(x))) q.add("entertainment");
  if (said(["skyway", "overlook", "lookout", "lighthouse", "observation deck"]) || tokens.includes("natural_feature")) q.add("instagram");

  const cz = (cuisineLabel(place) || "").toLowerCase();
  const CUIS = [["pizza", "pizza"], ["sushi", "sushi"], ["steak", "steak"], ["seafood", "seafood"], ["hamburger", "burgers"], ["burger", "burgers"], ["mexican", "mexican"], ["taco", "mexican"], ["italian", "italian"]];
  for (const [needle, key] of CUIS) { if (cz.includes(needle) || nm.includes(needle)) q.add(key); }
  if ((tokens.includes("bakery") && !cz) || cz.includes("bakery") || cz.includes("dessert") || /bakery|dessert|donut|doughnut|ice cream|gelato|patisserie|pastry/.test(nm)) q.add("dessert");
  if (tokens.includes("coffee_shop") || (tokens.includes("cafe") && !cz) || cz.includes("coffee") || cz.includes("cafe") || /coffee|café|cafe\b|espresso|roaster/.test(nm)) q.add("coffee");
  if (tokens.some((x) => x.includes("brew")) || /brewery|brewing|brewpub|brew pub|taproom/.test(nm)) q.add("beer");

  let keys = EXP_ORDER.filter((k) => q.has(k) && EXP_META[k]);
  // Same v2.0 trust gate as home.js: a tag must ALSO be compatible with the
  // place's resolved identity, or it is dropped even with real evidence.
  const identity = Tags.resolveIdentity(types, false);
  keys = Tags.filterAllowed(identity, keys).shown;
  return keys.slice(0, lim).map((k) => ({ key: k, icon: EXP_META[k].icon, label: EXP_META[k].label }));
}

const compactCount = (n) => Number(n) >= 1000
  ? (Math.round(Number(n) / 100) / 10) + "k"
  : String(Number(n) || 0);

const photoUrl = (p) => {
  if (p && p.photoRef) return "/api/photo?ref=" + encodeURIComponent(p.photoRef) + "&w=640";
  if (p && typeof p.photo === "string") return p.photo;
  return null;
};

const ThumbIcon = ({ down = false }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {down
      ? <><path d="M8 4v10H4V4h4Z" /><path d="M8 6h8.5a2 2 0 0 1 1.9 1.4l1.3 4a2 2 0 0 1-1.9 2.6H14l.6 3.1a2.4 2.4 0 0 1-2.4 2.9L8 14V6Z" /></>
      : <><path d="M8 10v10H4V10h4Z" /><path d="M8 18h8.5a2 2 0 0 0 1.9-1.4l1.3-4a2 2 0 0 0-1.9-2.6H14l.6-3.1A2.4 2.4 0 0 0 12.2 4L8 10v8Z" /></>}
  </svg>
);

export default function IconicPlaceCard({ place, rank, href, editorial, aiSummary, badge, rankingNote, onShare, saved, liked, disliked, onSave, onLike, onDislike, onBadge }) {
  if (!place) return null;
  const expTags = experienceTags(place, 3);
  const score = toDisplayScore(place.wfScore != null ? place.wfScore : wayfindScore(place.rating, place.reviews));
  const category = coarseCat(place) || place.primaryType || place.type || "Local pick";
  const status = businessStatus({
    ...place,
    oh: place.oh || place.regularOpeningHours || null,
    utcOffset: place.utcOffset != null ? place.utcOffset : place.utcOffsetMinutes,
  });
  const state = status.open === true ? "Open" : status.open === false ? "Closed" : null;
  const distance = Number.isFinite(Number(place.distMi))
    ? (Number(place.distMi) < 10 ? Number(place.distMi).toFixed(1) : Math.round(Number(place.distMi))) + " mi"
    : null;
  const isCuratorPick = !!(place._members && place._members.ownerPick);
  const facts = [
    place.reviews ? compactCount(place.reviews) + " reviews" : null,
    priceLabel(place.priceLevel ?? place.price_level ?? place.priceNum),
    state,
    distance,
  ].filter(Boolean);
  const award = isCuratorPick ? "Wayfind curator's pick" : rank <= 3 ? (rank === 1 ? "Best " : "Top ") + String(category).toLowerCase() + " pick" : null;
  // v6.87 (owner): the rank-summary fallback ("Our #1 pick — 4.9★ with 921
  // reviews, and it holds up.") is GONE — rating, reviews, rank, price,
  // status and distance already render above in `facts`/`award`, and
  // restating them here was the generic filler this rule exists to kill.
  // `editorial` (a verified wf_editorial hook) still wins when present;
  // `aiSummary` is a validated { card_line_1, card_line_2 } CARD_SUMMARY
  // (lib/editorialValidator.js already rejected anything generic, a
  // fragment, or card-data-repeating before this ever reached the client).
  // If NEITHER exists, nothing renders in this slot — no template fallback.
  const validAiSummary = !editorial && aiSummary && typeof aiSummary === "object" && aiSummary.card_line_1 && aiSummary.card_line_2 ? aiSummary : null;
  const initials = String(place.name || "WF").split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();
  const actionHref = (action) => "/p/" + encodeURIComponent(place.id) + "?action=" + action;
  const partner = placePartnerPick(place);
  const partnerHref = partner ? commerceHref({
    provider: partner.provider,
    offerId: partner.offerId,
    surface: "iconic_place_card",
    contentId: place.id,
  }) : null;
  const openCard = (event) => {
    const target = event && event.target;
    if (target && typeof target.closest === "function" && target.closest("a,button,input,select,textarea,[role='button']")) return;
    if (href && typeof window !== "undefined") window.location.assign(href);
  };

  return (
    <li data-iconic-place-card data-card-opens-detail onClick={openCard} className={`wf-place-card${isCuratorPick ? " is-curator-pick" : ""}${liked ? " is-liked" : ""}${disliked ? " is-disliked" : ""}`} style={{ listStyle: "none", cursor: href ? "pointer" : "default" }}>
      <div className="wf-place-card-layout">
        {photoUrl(place)
          ? <img src={photoUrl(place)} alt="" loading="lazy" style={{ objectFit: "cover" }} />
          : <div className="wf-place-card-monogram" aria-hidden="true">{initials}</div>}
        <div className="wf-place-card-content" style={{ position: "relative" }}>
          <div className="wf-place-card-title-row" style={{ display: "flex", alignItems: "flex-start" }}>
            <span className="wf-place-card-rank" aria-label={"Rank " + rank}>{rank}</span>
            <div className="wf-place-card-heading">
              <span className="wf-place-card-category">{category}</span>
              <a className="wf-place-card-name" href={href} style={{ display: "block", color: "#F8F5EE", textDecoration: "none" }}>{place.name}</a>
            </div>
            {score != null ? <div className="wf-place-card-score"><WayfindScoreBadge score={score} /></div> : null}
          </div>

          <div className="wf-place-card-meta" style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}>
            {facts.map((fact) => <span key={fact} style={{ color: fact === "Open" ? "#22C55E" : fact === "Closed" ? "#EF4444" : undefined }}>{fact}</span>)}
          </div>

          {award ? (
            <div className={`wf-place-card-award${isCuratorPick ? " is-curator" : ` is-rank-${rank}`}`} aria-label={isCuratorPick ? "Personally selected by Wayfind's curator" : undefined}>
              <span className="wf-place-card-award-icon" aria-hidden="true">{isCuratorPick ? "✦" : rank === 1 ? "🏆" : rank}</span>
              <span>{award}</span>
            </div>
          ) : null}

          {/* v6.88 (owner): `intentLabel` used to render an inert <span> here
              repeating the page's own eyebrow text ("Best of", "Trending now",
              ...) on every single card — not a link, not a badge about the
              place, just the list's own name stamped on each row for no
              reason. The user already sees what list they're looking at from
              the page header; removed entirely rather than replaced. This row
              is for real per-card badges only, matching home.js's canonical
              PlaceCard (clickable category chips, never decorative repeats). */}
          <div className="wf-place-card-highlights" style={{ display: "flex", flexWrap: "wrap" }}>
            {/* v6.89 (owner: "I need the cards to look like the cards from the
                main menu"): real experience-tag chips, computed by
                experienceTags() above from data this row actually carries —
                see that function's header comment for exactly what it can and
                cannot ground. Direct <button> children of
                .wf-place-card-highlights so they inherit the SAME orange-pill
                CSS (app/components/css.js) home.js's canonical PlaceCard chips
                use — no separate styling to drift. stopPropagation matches
                every other action in this card (Save/Like/Dislike/Share
                below): the outer <li> navigates to the detail page on click,
                and a chip tap must not also trigger that. Falls back to the
                same ?exp=<key> deep link ThingsToDoList/HookDetail already use
                when no onBadge callback is wired, since this card is portable
                and cannot assume an in-app navigation handler exists. */}
            {expTags.map((tag) => (
              <button
                key={tag.key}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  if (onBadge) onBadge(tag.key, place);
                  else if (typeof window !== "undefined") window.location.href = "/?exp=" + tag.key;
                }}
              >{tag.icon} {tag.label} ›</button>
            ))}
            {badge || null}
            {partnerHref ? (
              <a
                href={partnerHref}
                target="_blank"
                rel="sponsored noopener"
                aria-label={`Partner tickets for ${place.name} via ${partner.merchant}`}
                title="Partner link. Wayfind may earn a commission; rankings never change."
                onClick={(event) => {
                  const clickId = mintClickId();
                  const live = commerceHref({ provider: partner.provider, offerId: partner.offerId, surface: "iconic_place_card", contentId: place.id, clickId });
                  if (live && event.currentTarget) event.currentTarget.href = live;
                  try { emitCommerce("commerce_cta_clicked", { surface: "iconic_place_card", provider: partner.provider, merchant: partner.merchant, offer_id: partner.offerId, content_id: place.id, click_id: clickId, disclosure_version: "partner-place-v1" }); } catch {}
                }}
                style={{ color: "#FDBA74", textDecoration: "none" }}
              >🎟️ Partner tickets via {partner.merchant} ↗</a>
            ) : null}
          </div>
          {editorial ? (
            <div className="wf-place-card-take">{editorial}</div>
          ) : validAiSummary ? (
            <div className="wf-place-card-take">
              <div>{validAiSummary.card_line_1}</div>
              <div style={{ marginTop: 2 }}>{validAiSummary.card_line_2}</div>
            </div>
          ) : null}
          {rankingNote ? <div style={{ color: "#8791A4", fontSize: 9.5, marginTop: 4 }}>{rankingNote}</div> : null}

          <div className="wf-place-card-actions wf-sheet-card-actions">
            {onSave ? (
              <button
                type="button"
                className={"wf-place-card-save" + (saved ? " is-active" : "")}
                aria-label={saved ? "Remove from saved: " + place.name : "Save " + place.name}
                aria-pressed={!!saved}
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); onSave(e, place); }}
              >{saved ? "♥ Saved" : "♡ Save"}</button>
            ) : (
              <a className="wf-place-card-save" href={actionHref("save")} aria-label={"Save " + place.name}>♡ Save</a>
            )}
            {/* Like/Dislike: an in-place toggle when the caller wires onLike/
                onDislike (IntentPageClient.js, TrendingNowClient.js, both
                2026-08-01) — stopPropagation + preventDefault so the tap
                never falls through to the surrounding list's own navigation,
                matching the pattern app/home.js's PlaceCard and
                ThingsToDoList's Card already use. is-active applies the CSS
                that has shipped since this card existed but nothing here
                ever triggered, because liked/disliked was never a prop.
                Falls back to the original navigate-to-detail link for any
                caller that has not wired the props — never a dead button. */}
            {onLike ? (
              <button
                type="button"
                className={"wf-place-card-like" + (liked ? " is-active" : "")}
                aria-label={liked ? "Remove like: " + place.name : "Like " + place.name}
                aria-pressed={!!liked}
                title={liked ? "Remove like" : "Like this place"}
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); onLike(e, place); }}
              ><ThumbIcon /></button>
            ) : (
              <a className="wf-place-card-like" href={actionHref("like")} aria-label={"Like " + place.name} title="Like this place"><ThumbIcon /></a>
            )}
            {onDislike ? (
              <button
                type="button"
                className={"wf-place-card-dislike" + (disliked ? " is-active" : "")}
                aria-label={disliked ? "Remove dislike: " + place.name : "Not for me: " + place.name}
                aria-pressed={!!disliked}
                title={disliked ? "Remove dislike" : "Not for me"}
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); onDislike(e, place); }}
              ><ThumbIcon down /></button>
            ) : (
              <a className="wf-place-card-dislike" href={actionHref("dislike")} aria-label={"Not for me: " + place.name} title="Not for me"><ThumbIcon down /></a>
            )}
            <button className="wf-place-card-share" type="button" aria-label={"Share " + place.name} onClick={(e) => { e.stopPropagation(); e.preventDefault(); if (onShare) onShare(place); }}>↗ Share</button>
          </div>
        </div>
      </div>
    </li>
  );
}
