"use client";

/**
 * Shared outage state for Wayfind poster rails.
 *
 * A provider or inventory read failure is not an empty town. Show the branded
 * Critter, explain the temporary service problem in plain language, and give
 * the reader a safe next action instead of leaving a blank panel or skeleton.
 */
export function PosterCritter({ size = 52 }) {
  return (
    <svg
      width={size}
      height={Math.round((size * 38) / 40)}
      viewBox="28 22 40 38"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block" }}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="31" y="32" width="34" height="18" rx="3" fill="#F97316" />
      <rect x="41" y="26" width="14" height="7" rx="2" fill="#F97316" />
      <rect x="36.5" y="37.5" width="7" height="8" rx="1.5" fill="#0D1117" />
      <rect x="52.5" y="37.5" width="7" height="8" rx="1.5" fill="#0D1117" />
      <rect x="34" y="50" width="6" height="6" rx="1.5" fill="#F97316" />
      <rect x="45" y="50" width="6" height="6" rx="1.5" fill="#F97316" />
      <rect x="56" y="50" width="6" height="6" rx="1.5" fill="#F97316" />
    </svg>
  );
}

export default function PosterServiceState({
  label = "Wayfind recommendations",
  onRetry = null,
  textColor = "#FFF7ED",
  mutedColor = "#A8B0BE",
  borderColor = "rgba(249,115,22,.42)",
  background = "rgba(20,12,18,.72)",
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "18px 16px",
        border: `1px solid ${borderColor}`,
        borderRadius: 16,
        background,
      }}
    >
      <div style={{ flex: "0 0 auto" }}><PosterCritter /></div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: textColor, fontSize: 14, fontWeight: 850, marginBottom: 5 }}>
          {label} are taking a break
        </div>
        <p style={{ margin: 0, color: mutedColor, fontSize: 13, lineHeight: 1.45 }}>
          Wayfind is having trouble reaching its live recommendations right now. This is a temporary service issue, not an empty area. Please come back in a little while.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            style={{
              marginTop: 10,
              border: "1px solid #F97316",
              borderRadius: 999,
              background: "transparent",
              color: textColor,
              padding: "7px 12px",
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}
