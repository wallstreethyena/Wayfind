"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CreatorAppleMap from "../../components/CreatorAppleMap";
import MapCategoryPin from "../../components/MapCategoryPin";
import RailCard, { RailDots, RailNav } from "../../components/RailCard";
import styles from "./page.module.css";

const FILTERS = [
  { id: "pumpkins", label: "Pumpkin patches", family: "outdoors" },
  { id: "markets", label: "Markets", family: "shop" },
  { id: "family", label: "Family Halloween", family: "shows" },
  { id: "haunts", label: "Haunted + after dark", family: "drinks" },
  { id: "tastes", label: "Fall food + drinks", family: "food" },
  { id: "events", label: "Big fall events", family: "shows" },
  { id: "all", label: "Everything", family: "other" },
];

const GROUP_LABEL = Object.fromEntries(FILTERS.map((filter) => [filter.id, filter.label]));

const EVENT_PHOTO_PLACE_IDS = Object.freeze({
  "st-pete-pier-fall-fest-2026": "ChIJX-E766nhwogR8u_Re6nJTyk",
  "fox-squirrel-maze-2026": "ChIJFwrRu7o33YgRIuZ-0QgeCVQ",
  "keel-farms-harvest-days-2026": "ChIJ_5yVrBY13YgRwSgyH1hrRjg",
  "hunsader-pumpkin-2026": "ChIJuSnFvF8xw4gRt0WOWL_cqRc",
  "tampa-riverwalk-trick-or-treat-2026": "ChIJc8QsSADFwogRH9awG-1qaCs",
  "howl-o-scream-tampa-2026": "ChIJhRo4DU_GwogRUgjhMAj-pag",
  "screamageddon-2026": "ChIJ7zRUJ9CowogRM70pcoqrdUM",
  "oktoberfest-tampa-curtis-hixon-2026": "ChIJlRUlG4nEwogRJOgu0Hf2n54",
  "tampa-pig-jig-2026": "ChIJ-U84wHnEwogR9ry4KMSoZW8",
  "fantasy-fest-2026": "ChIJs_tsm0ix0YgRmYbIX_M5CT8",
  "mount-dora-craft-fair-2026": "ChIJGSMzu2Oi54gR-rlDDL6V3Qs",
  "florida-coffee-festival-2026": "ChIJcQyYH85654gRPh6gV_UpsDY",
  "southern-hill-farms-fall-festival-2026": "ChIJ-aI9NvSI54gRrVByB84z-AY",
  "great-scott-fall-fest-2026": "ChIJ68SLYriZ54gRaJgw169KqYA",
  "fruitville-grove-pumpkin-2026": "ChIJhWqZvoVHw4gRehUSFsbZARo",
  "gatorland-ghosts-goblins-2026": "ChIJ9RHZGx6H3YgRnWVYIWsHNPM",
});

function isExternal(href) {
  return /^https?:\/\//i.test(String(href || ""));
}

function isPlace(spot) {
  return /^ChIJ/.test(String(spot?.id || ""));
}

function groupLabel(spot, active) {
  if (active !== "all" && GROUP_LABEL[active]) return GROUP_LABEL[active];
  const key = Array.isArray(spot?.groups) ? spot.groups[0] : null;
  return GROUP_LABEL[key] || "Fall pick";
}

function cardPhoto(spot) {
  if (spot?.image) return spot.image;
  const placeId = isPlace(spot) ? spot.id : EVENT_PHOTO_PLACE_IDS[spot?.id];
  return placeId ? "/api/photo?place=" + encodeURIComponent(placeId) + "&g=2&w=800" : null;
}

function whenBadge(spot) {
  if (isPlace(spot) || !spot?.when) return null;
  const first = String(spot.when).split("•")[0].trim();
  return { label: "WHEN", value: first, tone: "later" };
}

export default function FallGuideExplorer({ spots = [] }) {
  const [active, setActive] = useState("pumpkins");
  const [selectedId, setSelectedId] = useState(null);
  const railRef = useRef(null);
  const cardNodes = useRef(new Map());
  const scrollFrame = useRef(0);

  const rows = useMemo(
    () => (Array.isArray(spots) ? spots : []).filter((spot) =>
      spot && spot.id && spot.name && Number.isFinite(spot.lat) && Number.isFinite(spot.lng)
    ),
    [spots],
  );

  const counts = useMemo(() => {
    const next = { all: rows.length };
    for (const filter of FILTERS.filter((filter) => filter.id !== "all")) {
      next[filter.id] = rows.filter((spot) => Array.isArray(spot.groups) && spot.groups.includes(filter.id)).length;
    }
    return next;
  }, [rows]);

  const visible = useMemo(
    () => active === "all"
      ? rows
      : rows.filter((spot) => Array.isArray(spot.groups) && spot.groups.includes(active)),
    [rows, active],
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
        if (best != null) setSelectedId((current) => String(current) === String(best) ? current : best);
      });
    };

    rail.addEventListener("scroll", readViewedCard, { passive: true });
    readViewedCard();
    return () => {
      rail.removeEventListener("scroll", readViewedCard);
      cancelAnimationFrame(scrollFrame.current);
    };
  }, [visible]);

  const selectFromMap = (id) => {
    if (id == null) return;
    setSelectedId(id);
    requestAnimationFrame(() => {
      const node = cardNodes.current.get(String(id));
      node?.scrollIntoView?.({ behavior: "smooth", block: "nearest", inline: "center" });
    });
  };

  if (!rows.length) return null;

  const railId = "fall-guide-" + active;

  return (
    <section className={styles.explorer} aria-labelledby="fall-explorer-heading">
      <div className={styles.explorerIntro}>
        <div>
          <p className={styles.kicker}>Pick a category, then swipe</p>
          <h2 id="fall-explorer-heading">The card and the map stay together.</h2>
          <p>
            Swipe through a category and the matching map pin follows the card you are viewing. Tap a pin to bring that card into view.
          </p>
        </div>
        <div className={styles.explorerProof}>
          <span>2026 dates</span>
          <span>Exact locations</span>
          <span>Tips before you go</span>
        </div>
      </div>

      <div className={styles.filterRow} aria-label="Filter the Florida fall guide">
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
              <MapCategoryPin family={filter.family} height={24} />
              <span>{filter.label}</span>
              <b>{count}</b>
            </button>
          );
        })}
      </div>

      <div className={styles.mapRailStage}>
        <div className={styles.mapWrap}>
          <CreatorAppleMap places={visible} selectedId={selected?.id || null} onSelect={selectFromMap} />
        </div>

        <div className={styles.activeRail}>
          <div className={styles.activeRailHead}>
            <div>
              <span className={styles.activeRailKicker}>{GROUP_LABEL[active] || "Fall picks"}</span>
              <strong>{visible.length} {visible.length === 1 ? "pick" : "picks"}</strong>
            </div>
            <RailNav railId={railId} count={visible.length} total={visible.length} loaded={visible.length} unit="picks" />
          </div>

          <div ref={railRef} className={"wf-rail " + styles.houseRail} data-rail={railId} role="region" aria-label={(GROUP_LABEL[active] || "Fall") + " picks"}>
            {visible.map((spot, index) => {
              const photo = cardPhoto(spot);
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
                  eyebrow={groupLabel(spot, active)}
                  rank={index + 1}
                  when={whenBadge(spot)}
                  facts={[spot.city || null, isPlace(spot) ? spot.when || null : null].filter(Boolean)}
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

      <p className={styles.mapNote}>
        Swipe the cards to move the selected pin. Tap a pin to jump back to its card.
      </p>
    </section>
  );
}
