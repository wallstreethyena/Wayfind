"use client";

// The home-sidebar map is now the same real, Google-free map used by the map
// screen. Keeping this as a component preserves the sidebar's small footprint
// and its existing pin → detail interaction, without reverting to the old
// decorative radar panel.
import dynamic from "next/dynamic";

const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => <div style={{ position: "absolute", inset: 0, background: "#E7EBEF" }} />,
});

export default function MapPreview({ places = [], center, deviceLoc, onSelect }) {
  return <div role="region" aria-label={`Map preview: ${(places || []).length} places`} style={{ position: "absolute", inset: 0 }}>
    <MapView compact fit places={places} center={center} deviceLoc={deviceLoc} onSelect={onSelect} />
  </div>;
}
