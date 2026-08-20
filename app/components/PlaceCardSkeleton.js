// Place-card-shaped loading skeleton — the first-paint stand-in for a
// .wf-place-card, not a blank color slab.
//
// THE DEFECT. Homepage rails (DaypartRail drop, intent rails, browse) used to
// reserve space with a single rounded wf-sk / wf-skeleton rectangle. On a
// phone that reads as an empty colored block while the ranked cards hydrate.
// The live card is a 268px two-column layout (media + copy + action row);
// this component paints that same geometry with shimmer bars and no copy.
//
// No invented card text. No ranking. toHookLine / isUsableCardHook are not
// in this file — a skeleton must not invent a take.
export default function PlaceCardSkeleton({ count = 3, as = "li" }) {
  const Tag = as === "div" ? "div" : "li";
  const n = Math.max(1, Number(count) || 1);
  return Array.from({ length: n }, (_, i) => (
    <Tag
      key={i}
      className="wf-place-card wf-place-card-sk"
      aria-hidden="true"
      style={Tag === "li" ? { listStyle: "none" } : undefined}
    >
      <div className="wf-place-card-layout">
        <div className="wf-sk wf-place-card-sk-media" />
        <div className="wf-place-card-content">
          <div className="wf-sk wf-place-card-sk-line" style={{ width: "34%" }} />
          <div className="wf-sk wf-place-card-sk-line is-title" style={{ width: "78%" }} />
          <div className="wf-sk wf-place-card-sk-line" style={{ width: "56%" }} />
          <div className="wf-place-card-sk-actions">
            <div className="wf-sk" />
            <div className="wf-sk" />
            <div className="wf-sk" />
            <div className="wf-sk" />
          </div>
        </div>
      </div>
    </Tag>
  ));
}
