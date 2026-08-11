"use client";
// app/components/IntentRail.js — the BODY of a home-menu section that renders
// one INTENT destination's real ranked list as a horizontal rail.
//
// It is a body, not a section: the accordion row around it (header, chevron,
// collapse, persisted choice) belongs to BestNearby's SectionShell, which is
// the one place the menu's chrome is defined.
//
// WHY IT IS THE REAL LIST AND NOT A FILTER OVER WHAT IS ALREADY LOADED
// (owner call, 2026-08-09): hidden gems, tonight, worth the drive and big fun
// small budget already exist as ranked pages. A rail showing a cheap
// approximation of each — the nearby pool re-sorted with a different floor —
// would put two lists on the site that disagree about the same question, which
// is the bug class this codebase keeps deleting (wayfindScore once had five
// implementations, and the ranked list ignored a boost the grid below it
// applied). So this runs the SAME query bank, through the SAME toRow and
// rankRows, against the SAME floor as app/<intent>/page.js. A card here and
// the card you land on after tapping through are the same card.
//
// WHAT KEEPS THAT AFFORDABLE — this is the whole reason default-expanded is
// not reckless:
//   · Nothing is fetched until the section is OPEN and within 300px of the
//     viewport. A reader who closed this rail, or who never scrolls to it,
//     costs zero Places searches. Eight open sections are not eight requests
//     on first paint; they are one request each, at the moment of approach.
//   · RAIL_QUERIES caps the bank at the intent's first three queries. The
//     destination page runs the full bank because it renders a full page; a
//     twelve-card rail does not need the tail, and every query is paid.
//   · One module-level pool keyed by (intent, rounded centre, daypart), so
//     collapsing and reopening, or scrolling past twice, never re-queries.
//
// HONEST THIN STATE. Under MIN_ROWS this says what it found and offers the
// wider page rather than dressing two cards as a shortlist — the same rule
// RANKING_AND_FEATURING_SPEC.md §4 already applies to the creator row.
import { useCallback, useEffect, useRef, useState } from "react";
import RailCard, { RailNav } from "./RailCard";
import { experienceTags } from "./IconicPlaceCard";
import { INTENT_PAGES, toRow, rankRows, composeQueries } from "../../lib/intentPages";
import { nowContext } from "../../lib/nowContext";
import { attachTrendSignals } from "../../lib/trendSignal";
import { toDisplayScore } from "../../lib/score";
import { wayfindScore } from "../../lib/google";
import { coarseCat } from "../../lib/ranking";
import { priceLabel } from "../../lib/price";
import { businessStatus } from "../../lib/businessStatus";
import { placePartnerPick } from "../../lib/placePartnerPicks";
import { commerceHref, emitCommerce, mintClickId } from "../../lib/commerce";
import { couponForPlaceName } from "../../lib/coupons";
import { recommendationIds, uniqueRecommendations } from "../../lib/recommendationDedupe.js";
import { lawfulSort } from "../../lib/lawfulOrder.js";

// Measured against the Top 40 rail, which renders the identical card with the
// identical chip and action rows. One constant so the skeleton and the live
// rail reserve the same box and the swap cannot shift the page.
export const INTENT_RAIL_CARD_H = 224;
const RAIL_MAX = 12;
const RAIL_CANDIDATE_MAX = 24;
// TWO queries on the first pass, not three. Measured on a cold Orlando: four
// rails x three queries x a second sweep is twenty-four paid Places searches
// for one scroll, and the rails sat on their skeletons long enough to read as
// broken.
//
// BUT NOT TWO FOREVER — that cut shipped an EMPTY "Big fun, small budget"
// (owner-reported live, "some of those categories not showing anything in it").
// Budget's bank is [free things to do, free admission park, cheap dinner], and
// its floor is maxPrice 2, which excludes anything with no price on record.
// Parks and trails carry no Google price, so the FOOD query — the third one —
// is the only one in that bank whose rows can survive the intent's own floor.
// Taking the first two silently removed the only query that could answer.
//
// So the bank ladders like the radius does: cheap first, wider only on nothing.
const RAIL_QUERIES = 2;
const MIN_ROWS = 3;
// The review depth rung 4 falls back to. Deliberately not zero: below this a
// rating is one enthusiastic afternoon, and "the strictest list we run" would
// stop being true in a different way.
const SOFT_FLOOR_REVIEWS = 60;
const SEARCH_N = 20;
// How long the rail waits on the trend signal before shipping without it.
const TREND_MS = 2500;
// How close to the viewport a rail has to get before it pays for its data.
// 160px, not the 300px the ranked sections use: at first paint every section is
// a short skeleton, so a wider margin put three intent rails inside the trigger
// zone at once and fired their searches before the reader had scrolled a pixel.
const REVEAL_PX = 160;
// How long an OPEN section waits on the observer before loading regardless.
const BACKSTOP_MS = 2500;
// THE RADIUS RULE (owner, 2026-08-09): "everything else should be 17 miles
// unless there is no result, in which case we will increase the distance to 25
// miles." Worth-the-drive is the deliberate exception — INTENT_PAGES gives it
// its own 30mi radiusM, because the drive IS the promise of that list, and an
// intent that carries its own radius is never widened past it.
const M_PER_MI = 1609.34;
const NEAR_M = Math.round(17 * M_PER_MI);
const WIDEN_M = Math.round(25 * M_PER_MI);

// Module-level on purpose: the menu unmounts whenever the reader switches to a
// browse category and comes back, and re-running three Places searches for that
// is real money.
const POOL = new Map();
const poolKey = (intent, lat, lng, bucket) => intent + "|" + lat.toFixed(2) + "," + lng.toFixed(2) + "|" + bucket;

const photoUrl = (r) => (r && r.photoRef ? "/api/photo?ref=" + encodeURIComponent(r.photoRef) + "&w=480" : null);
const compactReviews = (n) => (Number(n) >= 1000 ? Math.round(Number(n) / 100) / 10 + "k" : String(Number(n) || 0));
const milesLabel = (d) => (Number.isFinite(d) ? (d < 10 ? d.toFixed(1) : Math.round(d)) + " mi" : null);
// Same shape businessStatus reads on every other surface; toRow already carries
// both fields, so open/closed here is the real thing, not a guess.
const rowStatus = (r) => businessStatus({ ...r, oh: r.oh || r.regularOpeningHours || null, utcOffset: r.utcOffset != null ? r.utcOffset : r.utcOffsetMinutes });

export default function IntentRailBody({
  intent, href, label, unit, active, center, weather, city,
  excludePlaceIds, onVisibleIds,
  onOpenPlace, onLog, onExperience,
  isSaved, liked, disliked, onSave, onLike, onDislike, onShare,
}) {
  const def = INTENT_PAGES[intent];
  // null = never asked for. "loading" = in flight. Array = the answer, which
  // may legitimately be short or empty.
  const [rows, setRows] = useState(null);
  const inFlight = useRef(null);
  const rootRef = useRef(null);

  // THE STALE-TOWN BUG (owner-reported, 2026-08-09, and the worst defect this
  // rail has had): "I am in Parrish and it is showing me Tacos My Guey for
  // perfect tonight" — a restaurant on N Orange Ave in ORLANDO, ninety miles
  // away, under a heading that says near you.
  //
  // The distance cap was working. The rows were fetched while the reader was in
  // Orlando, measured against Orlando, and passed the cap honestly. Then the
  // reader moved to Parrish and this rail never asked again: the approach gate
  // bails on `rows !== null`, so once a rail has ANY answer it keeps it for the
  // life of the mount, whatever town the reader is standing in now.
  //
  // A ranked list that survives the question it was ranked for is not stale
  // data, it is a wrong answer with a confident label. So the centre is part of
  // this component's identity: when it changes, the previous town's answer is
  // dropped and the gate re-arms.
  const centerKey = center && isFinite(center.lat) && isFinite(center.lng)
    ? Number(center.lat).toFixed(2) + "," + Number(center.lng).toFixed(2)
    : "";
  const seenCenter = useRef(centerKey);
  useEffect(() => {
    if (seenCenter.current === centerKey) return;
    seenCenter.current = centerKey;
    inFlight.current = null;
    setRows(null);
  }, [centerKey]);

  const load = useCallback(() => {
    if (!def) return;
    if (!center || !isFinite(center.lat) || !isFinite(center.lng)) return;
    const lat = Number(center.lat);
    const lng = Number(center.lng);
    // ONE CLOCK: the hour, the daypart bucket and the outdoor gate all come
    // from nowContext, the same source the ranking reads. A rail bucketed on a
    // different clock than its own sort makes a claim about what was ranked
    // that is not true.
    const ctx = nowContext({ lat, lng, city: city || null, weather: weather || null });
    const key = poolKey(intent, lat, lng, ctx.timeBucket);
    const cached = POOL.get(key);
    if (cached) { setRows(cached); return; }
    if (inFlight.current === key) return;
    inFlight.current = key;
    setRows("loading");
    (async () => {
      try {
        const bankRaw = typeof def.queries === "function" ? def.queries(ctx) : def.queries;
        const bank = Array.isArray(bankRaw) ? bankRaw : [];
        const sweep = async (radiusM, queries, floor) => {
          const results = await Promise.all(queries.map(async ({ cat, q }) => {
            try {
              const u = "/api/places/search?q=" + encodeURIComponent(q)
                + "&lat=" + lat.toFixed(2) + "&lng=" + lng.toFixed(2)
                + "&radius=" + radiusM + "&n=" + SEARCH_N
                + "&cat=" + encodeURIComponent(cat);
              const r = await fetch(u);
              const j = r.ok ? await r.json() : null;
              return (j && Array.isArray(j.places) ? j.places : []).map(toRow);
            } catch (e) { return []; }
          }));
          const flat = results.flat().filter(Boolean);
          // The unified trend signal decorates rows BEFORE ranking so rankRows'
          // trending term can apply — and whatever it applies is disclosed on
          // the card. Fails soft: no popularity rows, no term, no claim.
          // RACED, not merely try/caught. attachTrendSignals reads Supabase, and
          // a try/catch does nothing about a promise that never settles — which
          // is exactly what left all four rails sitting on their skeletons on a
          // cold Orlando load while /api/places/search itself answered in 772ms.
          // The trend bump is an enrichment; the list is the product. If the
          // signal has not arrived in TREND_MS the rail ships without it, which
          // costs a flame nobody was promised and saves the whole section.
          try { await Promise.race([attachTrendSignals(flat, {}), new Promise((res) => setTimeout(res, TREND_MS))]); } catch (e) {}
          // THE CAP, and why the radius alone is not one. Google Places treats
          // `radius` as a BIAS, not a filter — measured live on this rail:
          // worth-the-drive asked for 30 miles and came back with an 83-mile
          // row, tonight asked for 25 and returned 26. A card that prints
          // "83 mi" under a heading that promised the reader a radius is the
          // list lying about its own rule, so the rule is enforced here, on the
          // distance rankRows actually computed.
          //
          // A row with no distance is DROPPED rather than kept: we cannot say a
          // place is within seventeen miles when we do not know where it is.
          const capMi = radiusM / M_PER_MI + 0.5;
          return rankRows(flat, floor, {
            origin: { lat, lng },
            penalty: def.distancePenalty || null,
            ctx: def.timeless ? null : ctx,
            // THE COMPOSITION LAW. See lib/intentPages.js — a heading that names
            // a kind of place admits only that kind, and one that names a mood
            // may mix but may not be one category in disguise.
            compose: def.compose || null,
            planAhead: !!def.planAhead,
            minDistanceMi: def.minDistanceMi,
          }).filter((r) => Number.isFinite(r.distMi)
            && r.distMi <= capMi)
            .slice(0, RAIL_CANDIDATE_MAX);
        };
        // THE LADDER. Cheapest thing that can answer, first; each rung only
        // runs when the one before it returned NOTHING (the owner's rule:
        // "unless there is no result"). A thin-but-real list is still the
        // honest answer to "near you" — only an empty one is worth paying more
        // for. An intent with its own radiusM (worth-the-drive's 30mi) states
        // its reach in its own copy and is never quietly stretched past it.
        const near = def.radiusM || NEAR_M;
        // v7.09 — SPEND THE CALLS ON QUERIES THIS LIST IS ALLOWED TO SHOW.
        // Taking the first two of the bank meant worth-the-drive spent one of
        // its two nightly calls on "destination restaurant dinner" — rows the
        // composition then threw away — while "iconic landmark" and "state park
        // springs" further down the bank never ran at all.
        const first = composeQueries(bank, def.compose, RAIL_QUERIES);
        const whole = composeQueries(bank, def.compose, bank.length);
        let ranked = await sweep(near, first, def.floor);
        if (ranked.length === 0 && whole.length > first.length) {
          const full = await sweep(near, whole, def.floor);          // rung 2: the whole eligible bank
          if (full.length > ranked.length) ranked = full;
        }
        if (ranked.length === 0 && !def.radiusM) {
          const wider = await sweep(WIDEN_M, whole, def.floor);      // rung 3: 25 miles
          if (wider.length > ranked.length) ranked = wider;
        }
        // RUNG 4 — RELAX THE FLOOR, NEVER THE KIND. A composed list can come
        // back short simply because a market has three landmarks worth the
        // drive and not twelve. When that happens the honest lever is the
        // REVIEW DEPTH we demanded, not the promise we made: a landmark with
        // 120 reviews is still a landmark, and a steakhouse with 5,000 is still
        // not one. rating is untouched — that is the quality bar, not a
        // volume bar — and the rail never widens `sections`.
        if (ranked.length < MIN_ROWS && def.floor && def.floor.reviews > SOFT_FLOOR_REVIEWS) {
          const soft = { ...def.floor, reviews: SOFT_FLOOR_REVIEWS };
          const relaxed = await sweep(def.radiusM || WIDEN_M, whole, soft);
          if (relaxed.length > ranked.length) ranked = relaxed;
        }
        POOL.set(key, ranked);
        setRows(ranked);
      } catch (e) {
        setRows([]);
      } finally {
        inFlight.current = null;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, center && center.lat, center && center.lng, city, weather && weather.temp, weather && weather.label]);

  // THE APPROACH GATE — and the bug it was rewritten for.
  //
  // The first version observed the section as soon as it mounted. On a real
  // load `center` arrives AFTER the first paint (saved wf_center, then the URL,
  // then geolocation), so the observer fired against a centre that did not
  // exist yet, called load(), load() bailed, and the observer had already
  // disconnected itself — the rail then sat on its skeleton forever with no
  // error and no network request. Measured on a cold Orlando: zero
  // /api/places/search calls for four expanded rails.
  //
  // Two changes fix the class, not the instance:
  //   1. The effect does not arm until there IS a centre, so a reveal can never
  //      be spent on a load that cannot run.
  //   2. If the section is ALREADY inside the trigger zone when the effect
  //      arms, it loads directly. An IntersectionObserver created over an
  //      element that is already on screen is a promise about the next
  //      intersection change, and "it is already here" is not a change.
  useEffect(() => {
    if (!active || rows !== null) return;
    if (!center || !isFinite(center.lat) || !isFinite(center.lng)) return;
    const el = rootRef.current;
    const inZone = () => {
      if (!el || typeof el.getBoundingClientRect !== "function" || typeof window === "undefined") return true;
      const r = el.getBoundingClientRect();
      return r.top < (window.innerHeight || 0) + REVEAL_PX && r.bottom > -REVEAL_PX;
    };
    if (inZone()) { load(); return; }
    // No observer (older Safari, and the plain-node render harness) means the
    // honest fallback is to load rather than never to load.
    if (typeof IntersectionObserver === "undefined") { load(); return; }
    // THE TIMER IS A BACKSTOP, NOT THE MECHANISM. The observer is still what
    // normally fires, and it fires the moment the reader approaches. But an
    // expanded section that never loads is indistinguishable from a broken
    // product — measured on a cold Orlando, four rails sat on their skeletons
    // and never made a single request — so an open section gives the observer
    // BACKSTOP_MS to do its job and then loads anyway. It costs one search set
    // per open section per visit, which is the price the reader already agreed
    // to by leaving the section open.
    let done = false;
    const fire = () => { if (done) return; done = true; load(); };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.disconnect();
        fire();
        return;
      }
    }, { rootMargin: REVEAL_PX + "px 0px" });
    io.observe(el);
    const backstop = setTimeout(() => { io.disconnect(); fire(); }, BACKSTOP_MS);
    return () => { clearTimeout(backstop); io.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, rows === null, load, center && center.lat, center && center.lng]);

  // Dedupe can remove rows but may never change the governing order. Reapply
  // the one lawful comparator so every sheet reads highest visible score first.
  const list = lawfulSort(
    uniqueRecommendations(Array.isArray(rows) ? rows : [], excludePlaceIds, RAIL_MAX),
    null,
    city
  );
  const visibleIdKey = recommendationIds(list).join("|");
  useEffect(() => {
    if (onVisibleIds) onVisibleIds(visibleIdKey ? visibleIdKey.split("|") : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIdKey]);
  if (!def) return null;
  const thin = Array.isArray(rows) && list.length < MIN_ROWS;
  const hasPartner = list.some((r) => placePartnerPick(r));

  return (
    <div ref={rootRef} style={{ minHeight: rows === null || rows === "loading" ? INTENT_RAIL_CARD_H : undefined }}>
      {rows === "loading" || rows === null ? (
        <div role="status" aria-busy="true" aria-label={"Ranking " + (unit || "picks")}>
          <div className="wf-sk" style={{ height: 16, width: 170, borderRadius: 6, marginBottom: 8 }} />
          <div className="wf-rail" aria-hidden="true" style={{ minHeight: INTENT_RAIL_CARD_H }}>
            <div className="wf-sk" style={{ width: "100%", height: INTENT_RAIL_CARD_H, borderRadius: 17, flexShrink: 0 }} />
          </div>
        </div>
      ) : thin ? (
        <div style={{ padding: "2px 1px 4px" }}>
          <div style={{ fontSize: 12.5, color: "#8D9AAB", lineHeight: 1.45 }}>
            {"Only " + list.length + " near you clear this bar right now."}
          </div>
          <a href={href} className="wf-railsec-more" onClick={() => { try { if (onLog) onLog("home_rail_thin_open", null, { rail: intent, found: list.length }); } catch (e) {} }}>
            {"Widen the search →"}
          </a>
        </div>
      ) : (
        <>
          <RailNav railId={intent} count={list.length} unit={unit} />
          <div className={"wf-rail wf-rail-" + intent} data-rail={intent} tabIndex={0} role="region" aria-label={label || unit} style={{ minHeight: INTENT_RAIL_CARD_H }}>
            {list.map((r, i) => {
              const st = rowStatus(r);
              const partner = placePartnerPick(r);
              const coupon = couponForPlaceName(r.name);
              const facts = [
                r.reviews ? compactReviews(r.reviews) + " reviews" : null,
                priceLabel(r.priceLevel),
                st.open === true ? "Open" : st.open === false ? "Closed" : null,
                milesLabel(r.distMi),
                // The trend bump is DISCLOSED wherever it is applied — the same
                // rule the Top 40 rail and the ranked rows follow.
                r.trending && r.trend_reason ? "🔥 " + r.trend_reason : null,
              ].filter(Boolean);
              // experienceTags is IconicPlaceCard's portable, evidence-bound tag
              // engine — the same one the reference card uses. Nothing here is
              // invented: it derives only from rating, review volume, price and
              // the place's real Google types, all of which toRow carries.
              const chips = [
                coupon ? { key: "deal", icon: "🏷️", label: "Deal" } : null,
                ...experienceTags(r, 4).map((t) => ({
                  key: t.key, icon: t.icon, label: t.label,
                  onClick: onExperience ? () => onExperience(t.key, r) : undefined,
                })),
              ].filter(Boolean).slice(0, 4);
              const place = {
                id: r.id, name: r.name, lat: r.lat, lng: r.lng, rating: r.rating, reviews: r.reviews,
                types: r.types, priceLevel: r.priceLevel, photo: photoUrl(r), photoRef: r.photoRef,
                distMi: r.distMi, editorial: r.editorial || null,
              };
              return (
                <RailCard
                  key={r.id}
                  photo={photoUrl(r)}
                  title={r.name}
                  eyebrow={coarseCat(r) || null}
                  rank={i + 1}
                  score={toDisplayScore(Number.isFinite(r.governed_score) ? r.governed_score : wayfindScore(r.rating, r.reviews))}
                  facts={facts}
                  award={i < 3 ? { tone: i + 1, icon: i === 0 ? "🏆" : String(i + 1), label: i === 0 ? "Top pick" : "Top " + (i + 1) } : null}
                  chips={chips}
                  cta={partner ? {
                    label: "🎟️ Tickets via " + partner.merchant + " ↗",
                    href: commerceHref({ provider: partner.provider, offerId: partner.offerId, surface: "intent_rail", contentId: r.id }),
                    external: true,
                    onClick: (e) => {
                      const clickId = mintClickId();
                      const live = commerceHref({ provider: partner.provider, offerId: partner.offerId, surface: "intent_rail", contentId: r.id, clickId });
                      if (live && e && e.currentTarget) e.currentTarget.href = live;
                      try { emitCommerce("commerce_cta_clicked", { surface: "intent_rail", provider: partner.provider, merchant: partner.merchant, offer_id: partner.offerId, content_id: r.id, click_id: clickId, disclosure_version: "partner-place-v1" }); } catch (err) {}
                    },
                  } : null}
                  ariaLabel={"Open " + r.name}
                  saved={!!(isSaved && isSaved(place))}
                  liked={!!(liked && liked[r.id])}
                  disliked={!!(disliked && disliked[r.id])}
                  onOpen={() => { try { if (onLog) onLog("home_rail_open", { id: r.id, name: r.name }, { rail: intent, pos: i + 1 }); } catch (e) {} if (onOpenPlace) onOpenPlace(place); }}
                  onSave={(e) => { if (onSave) onSave(e, place); }}
                  onLike={(e) => { if (onLike) onLike(e, place); }}
                  onDislike={(e) => { if (onDislike) onDislike(e, place); }}
                  onShare={() => { if (onShare) onShare(place); }}
                />
              );
            })}
          </div>
          <a href={href} className="wf-railsec-more" onClick={() => { try { if (onLog) onLog("home_rail_see_all", null, { rail: intent, shown: list.length }); } catch (e) {} }}>
            {"See every one →"}
          </a>
          {hasPartner ? (
            <div style={{ marginTop: 7, fontSize: 10, color: "#6F7C8D" }}>Ticket links are affiliate links; Wayfind may earn a commission. Ranking never changes.</div>
          ) : null}
        </>
      )}
    </div>
  );
}
