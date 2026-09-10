"use client";

import { useEffect, useMemo, useRef } from "react";
import RailCard, { RailDots, RailNav } from "./RailCard";
import { directionsUrl } from "./kit";
import { composeCreatorPicksRails, creatorPageAttemptKey, shouldAutoLoadCreatorPage } from "../../lib/creatorPicksRails.js";
import { PLATFORM } from "../../lib/creatorPlatforms.js";
import { cardImageSrc } from "../../lib/placePhoto.js";
import { priceLabel } from "../../lib/price.js";
import { toDisplayScore } from "../../lib/score.js";
import { wayfindScore } from "../../lib/wayfindScore.js";
import { toHookLine } from "../../lib/editorialHook.js";

const compact = (n) => Number(n) >= 1000 ? Math.round(Number(n) / 100) / 10 + "k" : String(Number(n) || 0);

export default function CreatorPicksRails({
  places = [], city = "", onOpenPlace,
  hasMore = false, loadingMore = false, loadFailed = false, pageScope = "", onLoadMore,
  isSaved, liked, disliked, isLiked, isDisliked,
  onSave, onLike, onDislike, onShare,
}) {
  const rails = useMemo(() => composeCreatorPicksRails(places), [places]);
  const lastAutoAttempt = useRef("");
  // The shared rails response deliberately ships a 12-card first window.
  // Grouping that mixed window would hide every creator whose first place
  // ranks below it, so opening Creators Pick drains its own ordered pages.
  // This remains lazy (nothing is fetched before the poster opens) while the
  // final shelves cover the complete eligible creator pool.
  useEffect(() => {
    const attemptKey = creatorPageAttemptKey(pageScope, places.length);
    if (!onLoadMore || !shouldAutoLoadCreatorPage({
      hasMore, loadingMore, loadFailed, attemptKey,
      lastAttemptKey: lastAutoAttempt.current,
    })) return;
    // Record BEFORE calling. A synchronous rejection/state transition must
    // never reopen the same automatic attempt and spin on a failed offset.
    lastAutoAttempt.current = attemptKey;
    onLoadMore();
  }, [hasMore, loadingMore, loadFailed, onLoadMore, pageScope, places.length]);
  if (!rails.length) return null;

  return <>
    {rails.map((rail) => {
      const platform = PLATFORM[rail.platform] || null;
      const railId = `creator-picks-${rail.id}`;
      return <section key={rail.id} aria-label={`@${rail.handle}'s picks`} style={{ marginTop: 22 }}>
        <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 800, color: "#F1F5F9" }}>@{rail.handle}&rsquo;s picks</h2>
        <p className="wf-rail-deck" style={{ color: "#AEB8C6" }}>
          Places @{rail.handle} posted about{city ? ` near ${city}` : ""}.
        </p>
        <RailNav railId={railId} count={rail.places.length} unit={rail.places.length === 1 ? "creator pick" : "creator picks"} />
        <div className="wf-rail wf-rail-exploding" data-rail={railId} tabIndex={0} role="region" aria-label={`@${rail.handle}'s picks`}>
          {rail.places.map((place, index) => {
            const rank = index + 1;
            const score = Number.isFinite(place.governed_score)
              ? place.governed_score
              : wayfindScore(place.rating, place.reviews);
            const facts = [
              place.reviews ? `${compact(place.reviews)} reviews` : null,
              priceLabel(place.priceLevel != null ? place.priceLevel : place.priceNum) || null,
              Number.isFinite(place.distMi) ? `${place.distMi} mi` : null,
            ].filter(Boolean);
            const directions = directionsUrl(place);
            return <RailCard
              key={place.id}
              className="wf-exploding-primary"
              photo={cardImageSrc(place, 640) || null}
              place={place}
              title={place.name}
              eyebrow="Creator pick"
              rank={rank}
              score={toDisplayScore(score)}
              facts={facts}
              award={{ tone: "creator", icon: "🎬", label: `@${rail.handle}${platform ? ` on ${platform.label}` : ""}` }}
              take={toHookLine(place.editorial, place.name) || null}
              cta={directions ? { label: "Directions ↗", href: directions, external: true } : null}
              ariaLabel={`Open ${place.name}`}
              onOpen={onOpenPlace ? () => onOpenPlace(place) : undefined}
              saved={isSaved ? !!isSaved(place.id) : undefined}
              liked={isLiked ? !!isLiked(place.id) : liked ? !!liked[place.id] : undefined}
              disliked={isDisliked ? !!isDisliked(place.id) : disliked ? !!disliked[place.id] : undefined}
              onSave={onSave ? (event) => onSave(event, place) : undefined}
              onLike={onLike ? (event) => onLike(event, place) : undefined}
              onDislike={onDislike ? (event) => onDislike(event, place) : undefined}
              onShare={onShare ? () => onShare(place, { city, creator: rail.handle }) : undefined}
            />;
          })}
        </div>
        {rail.places.length > 1 ? <RailDots railId={railId} count={rail.places.length} /> : null}
      </section>;
    })}
    {hasMore ? <>
      {loadFailed ? <p role="status" className="wf-rail-deck" style={{ color: "#AEB8C6" }}>
        Some creator picks could not be loaded. The picks above are still available.
      </p> : null}
      <button type="button" className="wf8-thinbtn" disabled={loadingMore} onClick={() => onLoadMore?.()}>
        {loadingMore ? "Loading every creator…" : loadFailed ? "Retry loading creators" : "Load every creator"}
      </button>
    </> : null}
  </>;
}
