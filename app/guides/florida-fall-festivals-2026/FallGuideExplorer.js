"use client";

import { useMemo, useState } from "react";
import CreatorAppleMap from "../../components/CreatorAppleMap";
import MapCategoryPin from "../../components/MapCategoryPin";
import styles from "./page.module.css";

const FILTERS = [
  { id: "all", label: "Everything", family: "other" },
  { id: "pumpkins", label: "Pumpkin patches", family: "outdoors" },
  { id: "markets", label: "Markets", family: "shop" },
  { id: "family", label: "Family Halloween", family: "shows" },
  { id: "haunts", label: "Haunted + after dark", family: "drinks" },
  { id: "tastes", label: "Fall food + drinks", family: "food" },
  { id: "events", label: "Big fall events", family: "shows" },
];

const GROUP_LABEL = Object.fromEntries(FILTERS.map((filter) => [filter.id, filter.label]));

function isExternal(href) {
  return /^https?:\/\//i.test(String(href || ""));
}

function groupLabel(spot) {
  const key = Array.isArray(spot?.groups) ? spot.groups[0] : null;
  return GROUP_LABEL[key] || "Fall pick";
}

export default function FallGuideExplorer({ spots = [] }) {
  const [active, setActive] = useState("all");
  const [selectedId, setSelectedId] = useState(null);

  const rows = useMemo(
    () => (Array.isArray(spots) ? spots : []).filter((spot) =>
      spot && spot.id && spot.name && Number.isFinite(spot.lat) && Number.isFinite(spot.lng)
    ),
    [spots],
  );

  const counts = useMemo(() => {
    const next = { all: rows.length };
    for (const filter of FILTERS.slice(1)) {
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

  const selected = useMemo(() => {
    if (!visible.length) return null;
    return visible.find((spot) => String(spot.id) === String(selectedId)) || visible[0];
  }, [visible, selectedId]);

  if (!rows.length) return null;

  return (
    <section className={styles.explorer} aria-labelledby="fall-explorer-heading">
      <div className={styles.explorerIntro}>
        <div>
          <p className={styles.kicker}>The useful part</p>
          <h2 id="fall-explorer-heading">One map. Six ways into fall.</h2>
          <p>
            Filter the guide by what you actually want to do. Every pin is tied to a real place or verified event.
          </p>
        </div>
        <div className={styles.explorerProof}>
          <span>Verified picks</span>
          <span>Exact map pins</span>
          <span>No paid placement</span>
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

      <div className={styles.explorerGrid}>
        <div className={styles.explorerList} aria-label={(GROUP_LABEL[active] || "Fall") + " picks"}>
          {visible.map((spot) => {
            const current = selected && String(selected.id) === String(spot.id);
            return (
              <button
                type="button"
                key={spot.id}
                className={styles.explorerRow}
                data-selected={current ? "true" : "false"}
                onClick={() => setSelectedId(spot.id)}
              >
                <span className={styles.explorerRowPin}>
                  <MapCategoryPin family={spot.mapFamily || "other"} height={30} />
                </span>
                <span className={styles.explorerRowCopy}>
                  <strong>{spot.name}</strong>
                  <small>{[spot.city, spot.when].filter(Boolean).join(" • ")}</small>
                </span>
                <span className={styles.explorerArrow} aria-hidden="true">›</span>
              </button>
            );
          })}
        </div>

        <div className={styles.mapWrap}>
          <CreatorAppleMap places={visible} onSelect={setSelectedId} />
        </div>
      </div>

      {selected ? (
        <div className={styles.selectedSpot} aria-live="polite">
          <div>
            <span className={styles.selectedEyebrow}>{groupLabel(selected)}</span>
            <h3>{selected.name}</h3>
            <p>{selected.detail}</p>
            <small>{[selected.city, selected.when].filter(Boolean).join(" • ")}</small>
          </div>
          <div className={styles.selectedActions}>
            <a
              href={selected.href}
              target={isExternal(selected.href) ? "_blank" : undefined}
              rel={isExternal(selected.href) ? "noopener" : undefined}
              className={styles.primaryAction}
            >
              {selected.cta || "Open in Wayfind"} <span aria-hidden="true">→</span>
            </a>
            <a
              href={"https://maps.apple.com/?daddr=" + selected.lat + "," + selected.lng + "&dirflg=d"}
              target="_blank"
              rel="noopener"
              className={styles.secondaryAction}
            >
              Directions ↗
            </a>
          </div>
        </div>
      ) : null}

      <p className={styles.mapNote}>
        Tap a pin or a pick. Social posts are discovery leads, not proof. Wayfind keeps unverified dates and claims out of the guide until they are confirmed.
      </p>
    </section>
  );
}
