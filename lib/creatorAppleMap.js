import { categoryGlyph, pinColorFor } from "./mapPinGlyph.js";

// Every annotation is a verified creator place. No synthetic center pin.
export function createCreatorAppleMap({ mapkit, container, places, onSelect }) {
  const rows = places.filter(p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const map = new mapkit.Map(container, { showsMapTypeControl: false, isRotationEnabled: false });
  const pins = rows.map(p => {
    const annotation = new mapkit.MarkerAnnotation(new mapkit.Coordinate(p.lat, p.lng), {
      title: p.name, subtitle: p.city || "", glyphText: categoryGlyph(p), color: pinColorFor(p),
    });
    annotation.__wayfindId = String(p.id);
    return annotation;
  });
  map.addAnnotations(pins);
  if (pins.length) map.showItems(pins, { animate: false, padding: new mapkit.Padding(50, 35, 50, 35) });
  const select = event => onSelect?.(event?.annotation?.__wayfindId || null);
  map.addEventListener("select", select);
  return { destroy() { map.removeEventListener("select", select); map.destroy(); } };
}
