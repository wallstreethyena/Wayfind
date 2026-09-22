"use client";

// app/components/GuideMapExplorer.js — THE SHARED GUIDE MAP + HOUSE-CARD RAIL
// + CATEGORY-FILTER EXPLORER (2026-09-22).
//
// Generalized from the Florida Fall Guide's bespoke FallGuideExplorer.js
// (sol/fall-guide-house-cards-map, #1413) so any guide with >=3 mappable
// places gets the same look for free: an Apple Map synced to horizontal
// RailCard scroll, with category-filter chips, and NO bespoke per-guide
// component. A guide opts in purely with data — see lib/guides.js's
// `mapExplorer` field on a GUIDES entry, wired by app/guides/[slug]/page.js.
//
// Every place card here renders through RailCard (app/components/RailCard.js)
// — the one standard horizontal rail place card (score badge top-right, no
// Directions button) — never a bespoke card. scripts/check-guide-standard.mjs
// enforces that no guide route renders place cards any other way.
import { useEffect, useMemo, useRef, useState } from "react";
import CreatorAppleMap from "./CreatorAppleMap";
import MapCategoryPin from "./MapCategoryPin";
import RailCard, { RailDots, RailNav } from "./RailCard";
import styles from "./GuideMapExplorer.module.css";

function isExternal(href) {
  return /^https?:\/\//i.test(String(href || ""));
}

function isPlace(spot) {
  return /^ChIJ/.test(String(spot?.id || ""));
}

function titleCase(id) {
  return String(id || "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Derive filter chips from spots' own `groups` when a guide does not supply
 * its own — every distinct group becomes a chip, in first-seen order, plus
 * "All" appended last. A guide with a single group renders no filter row at
 * all (nothing to filter). */
function deriveFilters(spots) {
  const seen = [];
  for (const spot of spots) {
    for (const g of Array.isArray(spot.groups) ? spot.groups : []) {
      if (g && !seen.includes(g)) seen.push(g);
    }
  }
  const filters = seen.map((id) => ({ id, label: titleCase(id), family: "other" }));
  if (filters.length > 1) filters.push({ id: "all", label: "Everything", family: "other" });
  return filters;
}

export default function GuideMapExplorer({
  spots = [],
  filters = null,
  kicker = "Pick a category, then swipe",
  heading = "The card and the map stay together.",
  description = "Swipe through a category and the matching map pin follows the card you are viewing. Tap a pin to bring that card into view.",
  proof = ["Verified picks", "Exact locations", "Mapped together"],
  note = "Swipe the cards to move the selected pin. Tap a pin to jump back to its card.",
  accent = "#f97316",
  railIdPrefix = "guide-map",
}) {
  const FILTERS = useMemo(() => (Array.isArray(filters) && filters.length ? filters : deriveFilters(spots)), [filters, spots]);
  const GROUP_LABEL = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, f.label])), [FILTERS]);
  const hasFilters = FILTERS.length > 1;
  const [active, setActive] = useState(() => (FILTERS[0] && FILTERS[0].id) || "all");
  const [selectedId, setSelectedId] = useState(null);
  const railRef = useRef(null);
  const cardNodes = useRef(new Map());
  const scrollFrame = useRef(0);
  // The card a pin tap is carrying the rail to. While it is set, the scroll
  // handler holds the tapped pin instead of re-selecting every card the rail
  // passes on the way; the viewer touching the rail cancels it.
  const followMap = useRef(null);
  const railZone = useRef(null);

  const rows = useMemo(
    () => (Array.isArray(spots) ? spots : []).filter((spot) =>
      spot && spot.id && spot.name && Number.isFinite(spot.lat) && Number.isFinite(spot.lng)
    ),
    [spots],
  );

  const counts = useMemo(() => {
    const next = { all: rows.length };
    for (const filter of FILTERS.filter((f) => f.id !== "all")) {
      next[filter.id] = rows.filter((spot) => Array.isArray(spot.groups) && spot.groups.includes(filter.id)).length;
    }
    return next;
  }, [rows, FILTERS]);

  const visible = useMemo(
    () => (!hasFilters || active === "all")
      ? rows
      : rows.filter((spot) => Array.isArray(spot.groups) && spot.groups.includes(active)),
    [rows, active, hasFilters],
  );

  const selected = useMemo(
    () => visible.find((spot) => String(spot.id) === String(selectedId)) || visible[0] || null,
    [visible, selectedId],
  );

  useEffect(() => {
    if (!visible.length) {
      setSelectedId(null);
      return;
    }
    if (!visible.some((spot) => String(spot.id) === String(selectedId))) {
      setSelectedId(visible[0].id);
    }
  }, [visible, selectedId]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail || !visible.length) return undefined;
    followMap.current = null;

    const readViewedCard = () => {
      cancelAnimationFrame(scrollFrame.current);
      scrollFrame.current = requestAnimationFrame(() => {
        const box = rail.getBoundingClientRect();
        const center = box.left + box.width / 2;
        let best = null;
        let bestDistance = Infinity;
        for (const spot of visible) {
          const node = cardNodes.current.get(String(spot.id));
          if (!node) continue;
          const rect = node.getBoundingClientRect();
          if (rect.right <= box.left || rect.left >= box.right) continue;
          const distance = Math.abs((rect.left + rect.right) / 2 - center);
          if (distance < bestDistance) {
            bestDistance = distance;
            best = spot.id;
          }
        }
        const follow = followMap.current;
        if (follow) {
          // Arrived at the tapped card, or at the end of the rail (the last card
          // cannot centre): release the hold but keep the tapped pin selected.
          if ((best != null && String(best) === follow.id) || (follow.left != null && Math.abs(rail.scrollLeft - follow.left) < 2)) {
            followMap.current = null;
          }
          return;
        }
        if (best != null) setSelectedId((current) => String(current) === String(best) ? current : best);
      });
    };
    // Any hand on the rail or its arrows means the viewer is steering again.
    const takeOver = () => { followMap.current = null; };
    const zone = railZone.current || rail;
    const takeOverEvents = ["pointerdown", "touchstart", "wheel", "keydown"];

    rail.addEventListener("scroll", readViewedCard, { passive: true });
    for (const type of takeOverEvents) zone.addEventListener(type, takeOver, { passive: true });
    readViewedCard();
    return () => {
      rail.removeEventListener("scroll", readViewedCard);
      for (const type of takeOverEvents) zone.removeEventListener(type, takeOver);
      cancelAnimationFrame(scrollFrame.current);
    };
  }, [visible]);

  const selectFromMap = (id) => {
    if (id == null) return;
    followMap.current = { id: String(id), left: null };
    setSelectedId(id);
    requestAnimationFrame(() => {
      const rail = railRef.current;
      const node = cardNodes.current.get(String(id));
      if (!rail || !node) return;
      const railBox = rail.getBoundingClientRect();
      const cardBox = node.getBoundingClientRect();
      const left = rail.scrollLeft
        + (cardBox.left - railBox.left)
        - Math.max(0, (rail.clientWidth - cardBox.width) / 2);
      const target = Math.min(Math.max(0, rail.scrollWidth - rail.clientWidth), Math.max(0, left));
      // Already there: no scroll event will come to release the hold.
      if (Math.abs(target - rail.scrollLeft) < 2) {
        followMap.current = null;
        return;
      }
      if (followMap.current) followMap.current.left = target;
      rail.scrollTo({ left: target, behavior: "smooth" });
    });
  };

  if (rows.length < 3) return null;

  const railId = railIdPrefix + "-" + active;

  return (
    <section className={styles.explorer} style={{ "--gme-accent": accent }} aria-labelledby={railIdPrefix + "-heading"}>
      <div className={styles.explorerIntro}>
        <div>
          <p className={styles.kicker}>{kicker}</p>
          <h2 id={railIdPrefix + "-heading"}>{heading}</h2>
          <p>{description}</p>
        </div>
        {proof && proof.length ? (
          <div className={styles.explorerProof}>
            {proof.map((line) => <span key={line}>{line}</span>)}
          </div>
        ) : null}
      </div>

      {hasFilters ? (
        <div className={styles.filterRow} aria-label="Filter this guide">
          {FILTERS.map((filter) => {
            const pressed = active === filter.id;
            const count = counts[filter.id] || 0;
            if (filter.id !== "all" && count === 0) return null;
            return (
              <button
                type="button"
                key={filter.id}
                className={styles.filterChip}
                data-active={pressed ? "true" : "false"}
                aria-pressed={pressed}
                onClick={() => {
                  setActive(filter.id);
                  setSelectedId(null);
                }}
              >
                <MapCategoryPin family={filter.family || "other"} height={24} />
                <span>{filter.label}</span>
                <b>{count}</b>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className={styles.mapRailStage}>
        <div className={styles.mapWrap}>
          <CreatorAppleMap places={visible} selectedId={selected?.id || null} onSelect={selectFromMap} />
        </div>

        <div ref={railZone} className={styles.activeRail}>
          <div className={styles.activeRailHead}>
            <div>
              <span className={styles.activeRailKicker}>{GROUP_LABEL[active] || "Picks"}</span>
              <strong>{visible.length} {visible.length === 1 ? "pick" : "picks"}</strong>
            </div>
            <RailNav railId={railId} count={visible.length} total={visible.length} loaded={visible.length} unit="picks" />
          </div>

          <div ref={railRef} className={"wf-rail " + styles.houseRail} data-rail={railId} role="region" aria-label={(GROUP_LABEL[active] || "Guide") + " picks"}>
            {visible.map((spot, index) => {
              const photo = spot.image || spot.photo || null;
              const place = isPlace(spot) ? {
                id: spot.id,
                name: spot.name,
                lat: spot.lat,
                lng: spot.lng,
                category: spot.category || null,
                primaryType: spot.primary_type || null,
                types: spot.primary_type ? [spot.primary_type] : [],
                photo,
                hook: spot.detail || null,
              } : null;
              const cta = spot.href ? {
                label: isExternal(spot.href) ? "Official details ↗" : "View details ↗",
                href: spot.href,
                external: isExternal(spot.href),
              } : null;
              return (
                <RailCard
                  key={spot.id}
                  className="wf-exploding-primary"
                  domRef={(node) => {
                    const key = String(spot.id);
                    if (node) {
                      cardNodes.current.set(key, node);
                      node.dataset.guideSpotId = key;
                    } else {
                      cardNodes.current.delete(key);
                    }
                  }}
                  photo={photo}
                  place={place}
                  title={spot.name}
                  eyebrow={GROUP_LABEL[Array.isArray(spot.groups) ? spot.groups[0] : active] || "Guide pick"}
                  rank={index + 1}
                  facts={[spot.city || null, spot.when || null].filter(Boolean)}
                  take={spot.detail || null}
                  chips={spot.tip ? [{ key: "tip", icon: "✓", label: "Insider tip", title: spot.tip }] : []}
                  cta={cta}
                  href={spot.href || null}
                  external={isExternal(spot.href)}
                  ariaLabel={"Open " + spot.name}
                  actionItem={!place ? { id: spot.id, type: "event", title: spot.name, image: photo, url: spot.href || "" } : null}
                  eagerMedia={index < 2}
                />
              );
            })}
          </div>
          {visible.length > 1 ? <RailDots railId={railId} count={visible.length} /> : null}

          {selected?.tip ? (
            <div className={styles.viewedTip} aria-live="polite">
              <b>Good to know</b>
              <span>{selected.tip}</span>
            </div>
          ) : null}
        </div>
      </div>

      {note ? <p className={styles.mapNote}>{note}</p> : null}
    </section>
  );
}
