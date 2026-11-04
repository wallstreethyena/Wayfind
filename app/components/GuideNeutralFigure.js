import PhotoFallbackTile from "./PhotoFallbackTile.js";

// The neutral "no approved photo" figure for a guide pick (lib/guideNeutralFallback.js).
// Same 16:9 box as a pick photograph, so nothing shifts, and it carries Wayfind's
// established fallback tile: no photograph, no credit, no "Illustrative" caption.
// Pure and presentational, so it renders on the server like the rest of the figure.
export default function GuideNeutralFigure({ name, className }) {
  return (
    <figure className={className} data-guide-figure="pick-neutral" style={{ margin: 0, minWidth: 0 }}>
      <div style={{ position: "relative", overflow: "hidden", borderRadius: 3, aspectRatio: "16 / 9", width: "100%" }}>
        <PhotoFallbackTile name={name} caption="Photo unavailable" style={{ position: "absolute", inset: 0, minHeight: 0 }} />
      </div>
    </figure>
  );
}
