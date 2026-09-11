import PlaceCardSkeleton from "./PlaceCardSkeleton";

export default function RailLoading({ label = "Loading places" }) {
  return (
    <div role="status" aria-busy="true" aria-label={label}>
      <div className="wf-rail wf-rail-exploding" aria-hidden="true">
        <PlaceCardSkeleton count={3} as="div" />
      </div>
    </div>
  );
}
