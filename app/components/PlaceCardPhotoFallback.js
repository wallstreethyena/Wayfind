export function placeInitials(name) {
  return String(name || "").trim().split(/\s+/, 2)
    .map((word) => Array.from(word)[0]).join("").toUpperCase() || "WF";
}

export default function PlaceCardPhotoFallback({ name }) {
  return (
    <div className="wf-place-card-monogram wf-place-photo-unavailable">
      <span aria-hidden="true">{placeInitials(name)}</span>
      <span>Photo unavailable</span>
    </div>
  );
}
