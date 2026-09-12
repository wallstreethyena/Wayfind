"use client";

// Paid inventory uses the canonical place renderer. The purchased position,
// advertiser copy and links live in the slot around it; score, facts, frame,
// typography, spacing and card actions remain the shared place-card system.
import IconicPlaceCard from "./IconicPlaceCard";
import { useCommerceImpression } from "./useCommerceImpression";
import { emitCommerce } from "../../lib/commerce";
import { C } from "./kit";
import { useCardActions, toggleSave as fallbackSave, toggleLike as fallbackLike, toggleDislike as fallbackDislike, shareCard as fallbackShare } from "../../lib/cardActions";
import { useContentCardActions } from "../../lib/contentCardActions";
import { stayOnRailReaction } from "../../lib/railReaction.js";

function miles(distance) {
  if (!Number.isFinite(distance)) return null;
  return distance < 10 ? distance.toFixed(1) + " mi" : Math.round(distance) + " mi";
}

function branchOf(pick) {
  const parts = String(pick.venueLine || "").split("·");
  return parts.length > 1 ? parts[parts.length - 1].trim() : "";
}

export default function SponsoredPlaceCard({ pick, onLog }) {
  const ctx = pick ? {
    surface: "home_sponsored_card",
    provider: "direct",
    merchant: pick.advertiser,
    offer_id: pick.id,
    canonical_place_id: pick.placeId,
    disclosure_version: "sponsored-v1",
  } : null;
  const seenRef = useCommerceImpression(ctx);
  const hasStoreKey = !!(pick && pick.placeId);
  const place = hasStoreKey ? {
    id: pick.placeId,
    name: pick.advertiser,
    lat: pick.lat,
    lng: pick.lng,
    rating: pick.rating,
    reviews: pick.reviews,
    photo: pick.photo || null,
    cardCategory: pick.category || "Local business",
    distMi: pick.distMi,
  } : null;
  const fb = useCardActions(hasStoreKey);
  const content = useContentCardActions(!hasStoreKey && pick ? {
    id: pick.id,
    type: "experience",
    title: pick.advertiser,
    image: pick.photo || null,
    url: pick.pagePath || pick.outboundHref || "",
  } : null);
  if (!pick) return null;

  const actionPlace = place || { id: pick.id, name: pick.advertiser, photo: pick.photo || null };
  const doSave = hasStoreKey ? (fb.hydrated ? () => fallbackSave(actionPlace, { surface: "home_sponsored_card" }) : null) : content.toggleSave;
  const doLike = hasStoreKey ? (fb.hydrated ? () => fallbackLike(actionPlace, { surface: "home_sponsored_card" }) : null) : content.toggleLike;
  const doDislike = hasStoreKey ? (fb.hydrated ? () => fallbackDislike(actionPlace, { surface: "home_sponsored_card" }) : null) : content.toggleDislike;
  const doShare = hasStoreKey ? (fb.hydrated ? () => fallbackShare(actionPlace, { surface: "home_sponsored_card" }) : null) : content.share;
  const saved = hasStoreKey ? (fb.hydrated && !!fb.saved[pick.placeId]) : content.saved;
  const liked = hasStoreKey ? (fb.hydrated && !!fb.liked[pick.placeId]) : content.liked;
  const disliked = hasStoreKey ? (fb.hydrated && !!fb.disliked[pick.placeId]) : content.disliked;
  const branch = branchOf(pick);
  const distance = miles(pick.distMi);
  const accent = pick.accent || C.purple;

  const log = (action, extra) => {
    try { onLog && onLog(action, null, { sponsor: pick.id, merchant: pick.advertiser, ...extra }); } catch (error) {}
  };
  const onBook = () => {
    try { emitCommerce("commerce_cta_clicked", ctx); } catch (error) {}
    log("sponsor_out", { to: "booking" });
  };
  const quiet = [
    pick.phone ? { key: "call", label: "Call", href: "tel:" + pick.phone } : null,
    pick.mapsHref ? { key: "map", label: "Directions", href: pick.mapsHref, external: true } : null,
    pick.pagePath ? { key: "share", label: "Share", onTap: () => {
      const url = "https://www.gowayfind.com" + pick.pagePath + "?utm_source=wayfind&utm_medium=sponsored_card_share";
      try { if (navigator.share) { const result = navigator.share({ title: pick.name, url }); if (result && result.catch) result.catch(() => {}); return; } } catch (error) {}
      try { navigator.clipboard && navigator.clipboard.writeText(url); } catch (error) {}
    } } : null,
    pick.pagePath ? { key: "page", label: "Full details", href: pick.pagePath } : null,
  ].filter(Boolean);

  return (
    <section ref={seenRef} className="wf-place-card-slot" aria-label={"Sponsored — " + pick.advertiser} style={{ marginBottom: 16 }}>
      <ul className="wf-place-card-slot-list">
      <IconicPlaceCard
        place={place || actionPlace}
        href={pick.pagePath || pick.outboundHref}
        editorial={pick.claim || null}
        editorialTier="known"
        rankingNote={pick.headline || null}
        badge={<span className="wf-sponsor-chip">{pick.label || "Sponsored"}</span>}
        surface="home_sponsored_card"
        saved={saved}
        liked={liked}
        disliked={disliked}
        onSave={(event) => { if (doSave) doSave(event); log("save"); }}
        onLike={(event) => { stayOnRailReaction(event, doLike, actionPlace); log("like"); }}
        onDislike={(event) => { stayOnRailReaction(event, doDislike, actionPlace); log("dislike"); }}
        onShare={() => { if (doShare) doShare(); log("share"); }}
      />
      </ul>
      <div className="wf-place-card-attachment" style={{ "--wf-place-card-accent": accent, "--wf-place-card-accent-light": pick.accentLight || C.light }}>
        {pick.person ? <div className="wf-place-card-attachment-person">
          {pick.person.name}{pick.person.role ? " · " + pick.person.role : ""}
        </div> : null}
        <div className="wf-place-card-attachment-meta">
          {branch || pick.advertiser}{distance ? " · " + distance + " away" : ""}{Number.isFinite(Number(pick.rating)) ? " · " + Number(pick.rating).toFixed(1) + "★" : ""}{Number.isFinite(Number(pick.reviews)) ? " · " + Number(pick.reviews).toLocaleString() + " Google reviews" : ""}
        </div>
        {pick.body ? <p className="wf-place-card-attachment-body">{pick.body}</p> : null}
        <a href={pick.outboundHref} target="_blank" rel="sponsored nofollow noopener" onClick={onBook}
          aria-label={pick.cta + " at " + pick.advertiser + (branch ? " " + branch : "")}
          className="wf-place-card-attachment-primary">
          {pick.cta} <span aria-hidden="true">→</span>
        </a>
        {quiet.length ? <div className="wf-place-card-attachment-links">
          {quiet.map((item) => <a key={item.key} href={item.href || "#"} {...(item.external ? { target: "_blank", rel: "noopener" } : {})}
            onClick={(event) => { if (item.onTap) { event.preventDefault(); item.onTap(); } log("sponsor_secondary", { to: item.key }); }}
            className="wf-place-card-attachment-link">{item.label}</a>)}
        </div> : null}
        <div className="wf-place-card-attachment-disclosure">
          Sponsored · Paid placement near this location. The Wayfind Score and Google review count were not part of the deal.{distance ? " " + distance + " away." : ""}
        </div>
      </div>
    </section>
  );
}
