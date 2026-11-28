import { cityLabel } from "../../lib/locationHonesty.js";

export default function KeyWestOpeningPick({ locName, resolved, live }) {
  if (!resolved || cityLabel(locName).toLowerCase() !== "key west" || live?.citySlug !== "key-west") return null;
  const pick = live.places?.today?.find((place) =>
    place?.id && place.name && cityLabel(place.city).toLowerCase() === "key west"
  );
  if (!pick) return null;

  return (
    <a data-local-opening-pick href={`/p/${encodeURIComponent(pick.id)}`}
      style={{ display: "block", padding: "11px 4px", lineHeight: "22px", fontSize: 15, fontWeight: 700, color: "inherit" }}>
      Key West pick · {pick.name}
    </a>
  );
}
