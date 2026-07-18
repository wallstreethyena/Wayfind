// Owner-approved canonical Wayfind brand lockup. The source PNGs remain
// independent, transparent assets; this component only controls composition.
export function BrandLockup({ size = "clamp(28px, 7vw, 34px)", ariaLabel = "Wayfind" }) {
  const lockupSize = typeof size === "number" ? `${size}px` : size;
  return (
    <span
      role="img"
      aria-label={ariaLabel}
      data-wayfind-brand-lockup="canonical"
      style={{
        "--wf-brand-lockup-size": lockupSize,
        display: "inline-flex",
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "nowrap",
        gap: "calc(var(--wf-brand-lockup-size) * .16)",
        maxWidth: "100%",
        lineHeight: 0,
        background: "transparent",
      }}
    >
      <img
        src="/wordmark.png"
        alt=""
        aria-hidden="true"
        draggable={false}
        width={255}
        height={85}
        style={{ display: "block", width: "auto", height: "var(--wf-brand-lockup-size)", flexShrink: 0 }}
      />
      <img
        src="/pin.png"
        alt=""
        aria-hidden="true"
        draggable={false}
        width={256}
        height={256}
        style={{ display: "block", width: "auto", height: "var(--wf-brand-lockup-size)", flexShrink: 0 }}
      />
    </span>
  );
}
