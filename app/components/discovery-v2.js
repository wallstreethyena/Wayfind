"use client";

import { useEffect, useState } from "react";
import {
  BrandedImageFallback,
  C,
  Icon,
  MOTION,
  NavIcon,
  RADII,
  RATIO,
  SHADOW,
  SPACE,
  TARGET,
  TYPE,
  WayfindScoreBadge,
  imageDisplayState,
  offerLabel,
} from "./kit";
import { isValidScore, toDisplayScore } from "../../lib/score";
import { DISCOVERY_V2_ENABLED } from "../../lib/discoveryV2";
import { SocialPlatformBadgeV2 } from "./SocialReviewCardV2";

export const DISCOVERY_V2_CATEGORIES = [
  { key: "food", label: "Food", icon: "food" },
  { key: "nightlife", label: "Night out", icon: "nightlife" },
  { key: "attractions", label: "Things to do", icon: "attractions" },
  { key: "family", label: "Family", icon: "family" },
  { key: "hotels", label: "Stays", icon: "hotels" },
  { key: "shopping", label: "Shopping", icon: "shopping" },
];

const stop = (handler) => (event) => {
  event.stopPropagation();
  if (handler) handler(event);
};

const controlStyle = {
  minWidth: TARGET,
  minHeight: TARGET,
  border: `1px solid ${C.border}`,
  borderRadius: RADII.control,
  background: C.panel,
  color: C.light,
  cursor: "pointer",
};

/** Mount new discovery surfaces through this boundary so the absent flag is OFF. */
export function DiscoveryV2Boundary({ children, fallback = null, enabled = DISCOVERY_V2_ENABLED }) {
  return enabled ? children : fallback;
}

export function DiscoveryImage({ src, alt = "", style, eager = false }) {
  const [errored, setErrored] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setErrored(false);
    setLoaded(false);
  }, [src]);

  const state = imageDisplayState({ src, errored, loaded });
  if (state === "fallback") return <BrandedImageFallback style={style} />;

  return (
    <div style={{ ...style, position: "relative", overflow: "hidden", background: C.card }}>
      {state === "skeleton" && <div className="wf-skeleton" aria-hidden="true" style={{ position: "absolute", inset: 0 }} />}
      <img
        src={src}
        alt={alt}
        decoding="async"
        loading={eager ? "eager" : "lazy"}
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: state === "image" ? 1 : 0, transition: `opacity ${MOTION.base} ${MOTION.ease}` }}
      />
    </div>
  );
}

export function CategoryNav({ activeKey, onSelect, categories = DISCOVERY_V2_CATEGORIES, ariaLabel = "Primary categories" }) {
  return (
    <nav aria-label={ariaLabel} data-discovery-v2="category-nav">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: SPACE.xs, width: "100%" }}>
        {categories.slice(0, 6).map((category) => {
          const active = activeKey === category.key;
          return (
            <button
              type="button"
              key={category.key}
              aria-pressed={active}
              onClick={() => onSelect && onSelect(category.key)}
              style={{
                width: "100%",
                height: 76,
                minWidth: 0,
                padding: `${SPACE.xs}px 2px`,
                border: `1px solid ${active ? C.accent : C.border}`,
                borderRadius: RADII.control,
                background: active ? C.adim : C.panel,
                color: active ? C.accent : C.light,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: SPACE.xs,
                overflow: "hidden",
              }}
            >
              <NavIcon name={category.icon} color="currentColor" size={21} />
              <span style={{ fontSize: 11, lineHeight: 1.1, fontWeight: 800, textAlign: "center", whiteSpace: "normal", overflowWrap: "anywhere", maxWidth: "100%" }}>
                {category.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function DealsButton({ active = false, count, onClick, label = "Deals", style }) {
  const countLabel = Number.isFinite(count) && count > 0 ? ` (${count})` : "";
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={`${label}${countLabel}`}
      onClick={onClick}
      style={{
        ...controlStyle,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: SPACE.s,
        padding: `0 ${SPACE.l}px`,
        borderColor: active ? C.accent : C.border,
        background: active ? C.adim : C.panel,
        color: active ? C.accent : C.text,
        fontSize: TYPE.meta.fontSize,
        fontWeight: 800,
        ...style,
      }}
    >
      <Icon name="ticket" size={19} />
      <span>{label}{countLabel}</span>
    </button>
  );
}

export function LocalPulse({ title, detail, eyebrow = "Local pulse", updatedLabel, actionLabel, onAction }) {
  if (!title) return null;
  return (
    <aside
      aria-label={eyebrow}
      data-discovery-v2="local-pulse"
      style={{ display: "flex", alignItems: "center", gap: SPACE.m, padding: `${SPACE.m}px ${SPACE.l}px`, background: C.panel, border: "1px solid rgba(45,212,191,.42)", borderRadius: RADII.card, boxShadow: SHADOW.card }}
    >
      <span aria-hidden="true" style={{ width: 34, height: 34, flex: "0 0 34px", display: "grid", placeItems: "center", borderRadius: "50%", background: C.adim, color: C.accent }}>
        <Icon name="activity" size={18} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...TYPE.eyebrow, color: C.accent }}>{eyebrow}</div>
        <div style={{ color: C.text, fontSize: 14, lineHeight: 1.3, fontWeight: 800 }}>{title}</div>
        {detail && <div style={{ color: C.muted, fontSize: 12, lineHeight: 1.35, marginTop: 2 }}>{detail}</div>}
        {updatedLabel && <div style={{ color: C.muted, fontSize: 10.5, marginTop: SPACE.xs }}>{updatedLabel}</div>}
      </div>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} style={{ ...controlStyle, minWidth: 0, padding: `0 ${SPACE.m}px`, color: C.accent, fontWeight: 800 }}>
          {actionLabel}
        </button>
      )}
    </aside>
  );
}

export function ExperienceRail({ experiences = [], title = "Experiences", onSelect, ariaLabel = title }) {
  if (!experiences.length) return null;
  return (
    <section aria-label={ariaLabel} data-discovery-v2="experience-rail">
      {title && <h2 style={{ ...TYPE.title, color: C.text, margin: `0 0 ${SPACE.m}px` }}>{title}</h2>}
      <div role="list" style={{ display: "flex", gap: SPACE.m, overflowX: "auto", padding: `0 0 ${SPACE.s}px`, scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}>
        {experiences.map((experience) => {
          const image = experience.image || experience.photo || "";
          return (
            <article role="listitem" key={experience.id || experience.key || experience.title} style={{ flex: "0 0 clamp(220px, 72vw, 320px)", padding: 0, border: `1px solid ${C.border}`, borderRadius: RADII.card, background: C.card, overflow: "hidden", color: C.text, textAlign: "left", scrollSnapAlign: "start", boxShadow: SHADOW.card }}>
              <button type="button" onClick={() => onSelect && onSelect(experience)} aria-label={`Open ${experience.title}`} style={{ display: "block", width: "100%", padding: 0, border: 0, background: "transparent", color: "inherit", cursor: "pointer", textAlign: "left" }}>
                <DiscoveryImage src={image} alt={experience.imageAlt || experience.title || ""} style={{ width: "100%", aspectRatio: RATIO.hero }} />
                <span style={{ display: "block", padding: `${SPACE.m}px ${SPACE.l}px ${SPACE.l}px` }}>
                  {experience.eyebrow && <span style={{ ...TYPE.eyebrow, display: "block", color: C.accent, marginBottom: SPACE.xs }}>{experience.eyebrow}</span>}
                  <span style={{ ...TYPE.title, display: "block" }}>{experience.title}</span>
                  {experience.meta && <span style={{ ...TYPE.meta, display: "block", color: C.muted, marginTop: SPACE.xs }}>{experience.meta}</span>}
                </span>
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ActionButton({ label, icon, active = false, activeColor = C.accent, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={label === "Share" ? undefined : active}
      onClick={stop(onClick)}
      style={{ ...controlStyle, flex: "1 1 0", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: SPACE.xs, color: active ? activeColor : C.light, borderColor: active ? activeColor : C.border, background: active ? `${activeColor}18` : C.panel, fontSize: 11, fontWeight: 800 }}
    >
      <Icon name={icon} size={17} />
      <span>{label}</span>
    </button>
  );
}

export function PlaceCardV2({
  place,
  score,
  scoreConfidence,
  curatorPick = false,
  experienceTags = [],
  deal,
  saved = false,
  liked = false,
  disliked = false,
  showSocialBadge = false,
  socialReviewLocName,
  onOpen,
  onSave,
  onLike,
  onDislike,
  onShare,
}) {
  if (!place || !place.name) return null;
  const photo = place.photo || place.image || place.imageUrl || "";
  // `place.wfScore` follows the existing stored 0–100 contract. An explicit
  // `score` prop is display-scale (0–10), matching WayfindScoreBadge.
  const numericScore = typeof score === "string" && score.trim() ? Number(score) : score;
  const displayScore = score == null ? toDisplayScore(place.wfScore) : (isValidScore(numericScore) ? numericScore : null);
  const isCuratorPick = curatorPick || place.curatorPick === true || !!(place._members && place._members.ownerPick);
  const tags = experienceTags.map((tag) => typeof tag === "string" ? { key: tag, label: tag } : tag).filter((tag) => tag && tag.label).slice(0, 4);
  const dealText = typeof deal === "string" ? deal : deal && (deal.label || offerLabel(deal));

  return (
    <article data-discovery-v2="place-card" style={{ overflow: "hidden", background: C.card, border: `1px solid ${C.border}`, borderRadius: RADII.card, boxShadow: SHADOW.card }}>
      <button type="button" onClick={onOpen} aria-label={`Open ${place.name}`} style={{ position: "relative", display: "block", width: "100%", padding: 0, border: 0, background: C.card, cursor: onOpen ? "pointer" : "default", color: C.text, textAlign: "left" }}>
        <DiscoveryImage src={photo} alt={place.imageAlt || place.name} style={{ width: "100%", aspectRatio: RATIO.card }} />
        {isCuratorPick && (
          <span style={{ position: "absolute", top: SPACE.m, left: SPACE.m, padding: `5px ${SPACE.s}px`, borderRadius: RADII.chip, background: "rgba(13,17,23,.86)", border: `1px solid ${C.accent}`, color: C.accent, fontSize: 10.5, fontWeight: 800, letterSpacing: ".35px" }}>
            Curator&apos;s Pick
          </span>
        )}
        {dealText && (
          <span style={{ position: "absolute", right: SPACE.m, bottom: SPACE.m, display: "inline-flex", alignItems: "center", gap: SPACE.xs, padding: `5px ${SPACE.s}px`, borderRadius: RADII.chip, background: C.accent, color: C.bg, fontSize: 11, fontWeight: 900 }}>
            <Icon name="ticket" size={14} /> {dealText}
          </span>
        )}
      </button>

      <div style={{ padding: SPACE.l }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: SPACE.s }}>
          <button type="button" onClick={onOpen} style={{ flex: 1, minWidth: 0, padding: 0, border: 0, background: "transparent", color: C.text, cursor: onOpen ? "pointer" : "default", textAlign: "left", ...TYPE.title }}>
            {place.name}
          </button>
          {displayScore != null && <WayfindScoreBadge score={displayScore} confidence={scoreConfidence} size={0.9} />}
        </div>

        {(place.context || place.neighborhood || place.category) && (
          <div style={{ ...TYPE.meta, color: C.muted, marginTop: SPACE.xs }}>{place.context || place.neighborhood || place.category}</div>
        )}

        {showSocialBadge && <div style={{ marginTop: SPACE.s }}><SocialPlatformBadgeV2 place={place} locName={socialReviewLocName} /></div>}

        {tags.length > 0 && (
          <div aria-label="Experience tags" style={{ display: "flex", flexWrap: "wrap", gap: SPACE.xs, marginTop: SPACE.m }}>
            {tags.map((tag) => <span key={tag.key || tag.label} style={{ padding: `3px ${SPACE.s}px`, border: `1px solid ${C.border}`, borderRadius: RADII.chip, color: C.light, background: C.panel, fontSize: 11, fontWeight: 700 }}>{tag.label}</span>)}
          </div>
        )}

        <div aria-label={`${place.name} actions`} style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: SPACE.xs, marginTop: SPACE.l }}>
          <ActionButton label="Save" icon="bookmark" active={saved} onClick={onSave} />
          <ActionButton label="Like" icon="thumbup" active={liked} activeColor={C.green} onClick={onLike} />
          <ActionButton label="Dislike" icon="thumbdown" active={disliked} activeColor={C.red} onClick={onDislike} />
          <ActionButton label="Share" icon="share" onClick={onShare} />
        </div>
      </div>
    </article>
  );
}
