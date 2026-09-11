"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { C, PlaceScoreChip } from "./kit";
import { SUBFILTERS, wayfindScore, distMeters } from "../../lib/google";
import { rankExperiences, experienceWayfindScore } from "../../lib/experiencesData";
import { chipCommerce, chipSearchQuery } from "../../lib/browseCommerceMap";
import { chipAffinityBonus } from "../../lib/experienceConcepts";
import { discountDepthBonus, timeOfDayBonus } from "../../lib/experienceNowRank";
import { siteHourFloat } from "../../lib/nowContext";
import { commerceHref } from "../../lib/commerce";
import { openExternal } from "../../lib/links";
import { resolveBrowseExperienceRows, shouldLiveSearchFallback } from "../../lib/browseExperienceLanes";
import { browseBookableMatches } from "../../lib/browseBookableMatch";
import { placePartnerPick } from "../../lib/placePartnerPicks";
import { usePinQuarantine } from "../../lib/pinQuarantine";
const NOLOG = () => {};
export const BOOKABLE_NEAR_LIMIT = 50;
const RESERVE_LIMIT = 100;
const REQUEST_MS = 15000;
const eligibleExperiences = (rows, cat, sub) => (Array.isArray(rows) ? rows : []).filter((row) => row?.image && row.link_ok !== false && (row.code || row.product_code) && browseBookableMatches(row, cat, sub));

export function UnifiedBrowseCommerceRail({ cat: browseCat = "attractions", sub, includeExperiences = true, initialExperiences, categories = [], places = [], lat, lng, onSave, onLog = NOLOG, city, region }) {
  const plan = chipCommerce(browseCat, sub || "all");
  const cat = plan.catalogParam;
  const [experiences, setExperiences] = useState(() => includeExperiences && !plan.noExperiences ? eligibleExperiences(initialExperiences, browseCat, sub || "all") : []);
  const [failedImages, setFailedImages] = useState(() => new Set());
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const pinQ = usePinQuarantine();
  const [deals, setDeals] = useState(null);

  useEffect(() => {
    // Reuse #1272's independent source merge: an empty parent is not done.
    if (!includeExperiences || plan.noExperiences || browseCat === "hotels" || browseCat === "shopping" || !Number.isFinite(lat) || !Number.isFinite(lng)) { setExperiences([]); return; }
    let dead = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_MS);
    const seed = eligibleExperiences(initialExperiences, browseCat, sub || "all");
    setExperiences(seed);
    setError(false);
    const read = async (url) => {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error("Bookable inventory unavailable");
      const data = await response.json();
      if (data?.dark && data.reason !== "empty") throw new Error("Bookable inventory unavailable");
      return data;
    };
    const liveSearch = async () => {
      if (!city) return [];
      const searchText = chipSearchQuery(browseCat, sub || "all", city);
      const live = await read("/api/viator/tours?q=" + encodeURIComponent(searchText) + "&region=" + encodeURIComponent(region || city) + "&lat=" + encodeURIComponent(lat) + "&lng=" + encodeURIComponent(lng) + "&intent=" + encodeURIComponent(sub || "all"));
      return eligibleExperiences(live?.items, browseCat, sub || "all");
    };
    (async () => {
      try {
        const q = new URLSearchParams({ lat: String(lat), lng: String(lng), mi: "60", cat: cat || "all", limit: String(RESERVE_LIMIT), page: "0", browseCat, browseSub: sub || "all" });
        const response = cat === null ? { items: [] } : await read("/api/experiences?" + q.toString());
        const cachedRows = eligibleExperiences(response?.items, browseCat, sub || "all");
        let rows = resolveBrowseExperienceRows({ includeExperiences, noExperiences: plan.noExperiences, initialExperiences: seed, cachedRows });
        if (shouldLiveSearchFallback({ includeExperiences, noExperiences: plan.noExperiences, initialExperiences, cachedCount: cachedRows.length })) rows = await liveSearch();
        if (!dead) setExperiences(rankExperiences(rows).slice(0, RESERVE_LIMIT));
      } catch { if (!dead) setError(true); }
      finally { clearTimeout(timer); }
    })();
    return () => { dead = true; clearTimeout(timer); controller.abort(); };
  }, [initialExperiences, includeExperiences, cat, browseCat, sub, lat, lng, city, region, retry]);

  useEffect(() => {
    // The deals lane never consulted `plan`. `categories` is a literal and `sub`
    // was not even in the dep array, so every Activities chip fetched the same
    // theme-park tickets and painted them under a heading naming that chip:
    // "SPA & WELLNESS - BOOKABLE NEAR PARRISH" over LEGOLAND and Busch Gardens,
    // on a live screenshot. The heading comment below already called this exact
    // shape "a bug you can SEE". A chip that declares no bookable catalog now
    // sells nothing here rather than the wrong thing under its own name.
    const chipSellsNothing = !!(sub && sub !== "all" && plan.catalogParam === null);
    // plan.noExperiences (Food, 2026-09-07) belt-and-suspenders: Food already
    // passes categories=[] above, which alone short-circuits this effect, but
    // a future call site that adds a `categories` prop for Food must not
    // silently regain the deals lane on a category declared to sell nothing.
    if ((chipSellsNothing && browseCat !== "hotels") || plan.noExperiences || !categories.length || !Number.isFinite(lat) || !Number.isFinite(lng)) { setDeals([]); return; }
    let dead = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_MS);
    const geo = "&lat=" + lat.toFixed(3) + "&lng=" + lng.toFixed(3);
    Promise.all(categories.map(async (category) => {
      const response = await fetch("/api/deals?category=" + encodeURIComponent(category) + geo, { signal: controller.signal });
      if (!response.ok) throw new Error("Bookable deals unavailable");
      return response.json();
    })).then((payloads) => {
      if (dead) return;
      const rows = [];
      for (const payload of payloads) for (const rail of (payload && Array.isArray(payload.rails) ? payload.rails : [])) for (const deal of (Array.isArray(rail.items) ? rail.items : [])) rows.push(deal);
      setDeals(rows);
    }).catch(() => { if (!dead) setError(true); }).finally(() => clearTimeout(timer));
    return () => { dead = true; clearTimeout(timer); controller.abort(); };
  }, [categories.join("|"), lat, lng, sub, plan.catalogParam, plan.noExperiences, browseCat, retry]);

  // v6.90 — owner: "make sure they are displayed by rating and discount,
  // point based on the activity time of today." Same small, capped, order-
  // only bonuses as IntentPartnerPick.js's evidenceScore, kept in sync so the
  // two mixed-provider rails behave consistently — see
  // lib/experienceNowRank.js. Rating/quality10 stays the base term; unrated
  // deals keep the exact -1 sentinel (sorts last, untouched by any bonus).
  const nowHour = siteHourFloat();
  const cards = useMemo(() => {
    const rows = [];
    for (const t of (Array.isArray(experiences) ? experiences : [])) {
      if (!t?.image || t.link_ok === false || !(t.code || t.product_code) || !browseBookableMatches(t, browseCat, sub || "all")) continue;
      const offerId = t.code || t.product_code;
      // THE WAYFIND SCORE, not a second opinion (owner: "they are not being
      // displayed by highest to lowest score", 2026-08-05).
      //
      // rankExperiences() had already ordered these correctly — by
      // experienceWayfindScore, the Bayesian blend that weights review DEPTH.
      // This line then re-sorted them by `rating * 2 + log10(reviews)`, where
      // reviews contribute at most 0.4, so rating dominates and the correct
      // order was destroyed immediately after being computed. Measured:
      //
      //   4.7 with 2000 reviews  ->  Score 94, railBase 9.73  (shown 3rd)
      //   5.0 with 3 reviews     ->  Score 79, railBase 10.06 (shown 1st)
      //
      // A 5.0 from three people outranked a 4.7 from two thousand. Divided by
      // 10 so the 0-100 Score shares the 0-10 scale the deal rows and the
      // capped bonuses already use — the bonuses stay proportionally what they
      // were, and merit still decides the order.
      const base = experienceWayfindScore(t) / 10;
      // chipAffinityBonus is ORDER-ONLY and capped at 0.5 on the same ~0-10
      // scale as `base`. It exists because every Food sub-chip draws from one
      // pool of food tours — Viator sells no "dessert catalogue" — so Dessert
      // used to render the identical list as Food/All. This lets a chocolate
      // tour edge past an EQUALLY-rated generic food tour under Dessert without
      // ever leapfrogging a clearly better one, which is what keeps the owner's
      // "ranked from highest score" true.
      rows.push({ key: `viator:${offerId}`, provider: "viator", merchant: "Viator", offerId, title: t.title, image: t.image, rating: Number(t.rating || 0), reviews: Number(t.reviews || 0), price: t.fromPrice ? `from $${Math.round(t.fromPrice)}` : "", duration: t.duration || "", score: base, rankBonus: timeOfDayBonus(String(t.title || ""), nowHour) + chipAffinityBonus(browseCat, sub || "all", t.title), kind: "experience" });
    }
    for (const d of (Array.isArray(deals) ? deals : [])) {
      const image = d.image || (d.photoRef ? "/api/photo?ref=" + encodeURIComponent(d.photoRef) + "&w=600" : "");
      if (!image || !d.id) continue;
      if (!browseBookableMatches(d, browseCat, sub || "all", { kind: "deal" })) continue;
      const dBase = Number(d.quality10 || 0);
      const discountText = d.discount || d.badge || "";
      const dScore = dBase > 0 ? dBase + discountDepthBonus(discountText) + timeOfDayBonus(String(d.title || "") + " " + discountText, nowHour) : -1;
      // ATTRIBUTION, not cosmetics. lib/dealsData.js shapes every row with
      // surface:"deal_rail" baked into the href, because that is where deals
      // were first served. Rendering that href here reported every browse-rail
      // deal click as an intent-rail click, so the two surfaces could not be
      // told apart in any revenue comparison. Same provider, same offer id,
      // same redirect — only the surface tag differs, and it is now the tag of
      // the rail that actually rendered it. Falls back to the server's href if
      // the row somehow lacks a provider, so a re-tag can never lose the link.
      const dealHref = commerceHref({ provider: d.provider, offerId: d.id, surface: "browse_partner_rail", contentId: sub || "all" }) || d.href;
      // v8.22 (owner: "some of them have no wayfind score"): a deal matched to
      // a scored place (quality10, the SAME number its rank already uses)
      // now SHOWS that score; a national deal with no place keeps no chip —
      // we never invent a score — and still sorts last.
      rows.push({ key: `${d.provider || "deal"}:${d.id}`, provider: d.provider, merchant: d.providerLabel || "Verified partner", offerId: d.id, title: d.title, image, discount: discountText, score: dBase > 0 ? dBase : -1, rankBonus: dScore - (dBase > 0 ? dBase : -1), quality10: dBase > 0 ? dBase : null, href: dealHref, kind: "deal" });
    }
    // Exact, already-loaded place pins add Klook/Tiqets without a new search.
    for (const place of places) {
      if (!Number.isFinite(place?.lat) || !Number.isFinite(place?.lng) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const meters = distMeters({ lat, lng }, place);
      if (!Number.isFinite(meters) || meters > 60 * 1609.344) continue;
      const pin = placePartnerPick(place, pinQ);
      if (!pin || !["klook", "tiqets"].includes(pin.provider)) continue;
      const types = [place.primaryType, ...(place.types || [])].join(" ");
      const d = { title: place.name, subcategory: /museum|art_gallery/.test(types) ? "museum" : "theme_parks" };
      if (!browseBookableMatches(d, browseCat, sub || "all", { kind: "deal" })) continue;
      const image = typeof place.photo === "string" ? place.photo : place.photo_url || place.photos?.[0]?._directUri || (place.photos?.[0]?.name ? "/api/photo?ref=" + encodeURIComponent(place.photos[0].name) + "&w=600" : "");
      if (!image) continue;
      const href = commerceHref({ provider: pin.provider, offerId: pin.offerId, surface: "browse_partner_rail", contentId: sub || "all" });
      if (!href) continue;
      const quality10 = Number(place.rating) > 0 ? wayfindScore(place.rating, place.reviews || 0) / 10 : null;
      rows.push({ key: `${pin.provider}:${pin.offerId}`, provider: pin.provider, merchant: pin.merchant, offerId: pin.offerId, title: place.name, image, quality10, score: quality10 ?? -1, rankBonus: 0, href, kind: "deal" });
    }
    const seen = new Set();
    const seenOffers = new Set();
    return rows.filter((row) => {
      if (failedImages.has(row.image)) return false;
      const name = String(row.title || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (seen.has(name) || seenOffers.has(row.key)) return false;
      seen.add(name); seenOffers.add(row.key); return true;
    }).sort((a, b) => b.score - a.score || (b.rankBonus || 0) - (a.rankBonus || 0)).slice(0, BOOKABLE_NEAR_LIMIT);
  }, [experiences, deals, places, pinQ, failedImages, nowHour, sub, browseCat, lat, lng]);

  // v8.22 (owner, live screenshots: "the rail starts mid-way … starting at the
  // cards with no score on all of the submenus"). ROOT CAUSE: the scroller
  // <div> is the same DOM node across chip/submenu switches — React re-renders
  // its children but never touches scrollLeft, so one right-swipe in any
  // submenu leaves EVERY later submenu's rail opened mid-track. That reads as
  // "unranked first" because unscored deals sort last (rightward). The rail
  // must open at its own #1 whenever its content identity changes. GLOBAL
  // RULE for horizontal rails whose content swaps under a persistent node;
  // locked by scripts/check-rail-scroll-reset.mjs.
  const laneRef = useRef(null);
  const laneSig = (cards.length && cards[0].key) || "";
  useEffect(() => { const el = laneRef.current; if (el) el.scrollLeft = 0; }, [browseCat, sub, laneSig]);

  if (!cards.length) return error ? <div style={{ color: C.muted, fontSize: 12, marginBottom: 12 }}>Bookable options couldn’t load. <button type="button" onClick={() => setRetry((n) => n + 1)}>Retry</button></div> : null;
  // The heading NAMES THE FILTER. It used to read "Bookable highlights near
  // {city}" — byte-identical to IntentPartnerPick's heading on the intent
  // pages, so two rails with different inventory, different ranking and
  // different providers were indistinguishable to a user and to anyone reading
  // a screenshot. Naming the active chip also makes a mismatch self-evident:
  // "Spa & wellness — bookable near Sarasota" over a dolphin cruise is a bug
  // you can SEE, where the old generic heading hid exactly that.
  const chipLabel = (() => {
    if (!sub || sub === "all") return null;
    const hit = ((SUBFILTERS[browseCat] || SUBFILTERS.attractions) || []).find((x) => x && x.id === sub);
    return hit ? hit.label : null;
  })();
  return (
    <aside data-unified-browse-commerce-rail style={{ margin: "2px 0 14px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: C.muted, textTransform: "uppercase", letterSpacing: ".4px" }}>{chipLabel ? `${chipLabel} — bookable near ${city || "you"}` : `Bookable near ${city || "you"}`}</span>
        <span style={{ fontSize: 9.5, color: C.muted }}>{cards.length} options · Verified partners</span>
      </div>
      <div ref={laneRef} style={{ display: "flex", gap: 10, overflowX: "auto", overscrollBehaviorX: "contain", paddingBottom: 4, scrollSnapType: "x proximity" }}>
        {cards.map((card) => {
          const href = card.kind === "experience" ? commerceHref({ provider: "viator", offerId: card.offerId, surface: "browse_partner_rail", contentId: sub || "all" }) : card.href;
          if (!href) return null;
          return (
            <a key={card.key} href={href} target="_blank" rel="sponsored nofollow noopener" onClick={(e) => { e.preventDefault(); const live = (e.currentTarget && e.currentTarget.href) || href; try { onLog("tickets_out", null, { kind: "unified_browse_rail", provider: card.provider, id: card.offerId }); } catch (er) {} openExternal(live); }} style={{ flex: "0 0 200px", scrollSnapAlign: "start", background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, overflow: "hidden", textDecoration: "none", color: "inherit" }}>
              <div style={{ position: "relative", height: 86, overflow: "hidden", borderBottom: `1px solid ${C.border}` }}>
                <img src={card.image} alt="" loading="lazy" onError={() => setFailedImages((old) => new Set([...old, card.image]))} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <span style={{ position: "absolute", top: 7, right: 7, padding: "3px 7px", borderRadius: 999, background: "rgba(7,12,20,.82)", border: "1px solid rgba(255,255,255,.24)", color: "#fff", fontSize: 8.5, fontWeight: 800 }}>via {card.merchant}</span>
              </div>
              <div style={{ padding: "8px 10px" }}>
                <div style={{ fontSize: 12.5, fontWeight: 750, color: C.text, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{card.title}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 4, flexWrap: "wrap" }}>
                  {card.rating > 0 && card.reviews > 0 ? <PlaceScoreChip p={{ rating: card.rating, reviews: card.reviews }} size={12} />
                    : card.quality10 != null ? <PlaceScoreChip p={{ governed_score: Math.round(card.quality10 * 10) }} size={12} /> : null}
                  <span style={{ fontSize: 11, fontWeight: card.discount ? 800 : 500, color: card.discount ? "#7DD3A8" : C.muted }}>{card.discount || card.price}{card.duration ? ` · ${card.duration}` : ""}</span>
                  <button aria-label={"Save " + card.title} onClick={(e) => { e.preventDefault(); e.stopPropagation(); try { onSave && onSave({ item_type: card.kind, item_id: card.offerId, item_title: card.title, item_image: card.image, item_url: href, provider: card.provider }); } catch (er) {} }} style={{ marginLeft: "auto", border: `1px solid ${C.border}`, background: "transparent", borderRadius: 999, color: C.light, fontSize: 12, padding: "3px 8px", cursor: "pointer" }}>♡</button>
                </div>
              </div>
            </a>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 7, lineHeight: 1.4 }}>Wayfind may earn a commission when you book through these links, at no extra cost to you. It never changes our scores or rankings.</div>
    </aside>
  );
}

export default UnifiedBrowseCommerceRail;
