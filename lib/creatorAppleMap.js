import { applePinOptions } from "./mapPinStandard.js";
import { eventMapFamily } from "./eventMapPlaces.js";
import { categoryGlyph, pinFamily, NEUTRAL_GLYPH } from "./mapPinGlyph.js";

export function creatorMapGlyph(place) {
  const glyph = categoryGlyph(place);
  if (glyph !== NEUTRAL_GLYPH) return glyph;
  return ({ cafe: "☕", food: "🍽️", drinks: "🍸", shows: "🎭", outdoors: "🌳", water: "🌊", culture: "🏛️", stay: "🛏️", shop: "🛍️" })[pinFamily(place)] || "📍";
}

// Every annotation is a verified creator place. No synthetic center pin.
export function createCreatorAppleMap({ mapkit, container, places, onSelect }) {
  const rows = places.filter(p => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const map = new mapkit.Map(container, { showsMapTypeControl: false, isRotationEnabled: false });
  const pins = rows.map(p => {
    const annotation = new mapkit.ImageAnnotation(new mapkit.Coordinate(p.lat, p.lng), {
      title: p.name, subtitle: p.city || "", ...applePinOptions(mapkit, eventMapFamily(p)),
    });
    annotation.__wayfindId = String(p.id);
    return annotation;
  });
  map.addAnnotations(pins);
  if (pins.length) map.showItems(pins, { animate: false, padding: new mapkit.Padding(50, 35, 50, 35) });
  const select = event => onSelect?.(event?.annotation?.__wayfindId || null);
  map.addEventListener("select", select);

  // Guide/map parity: selecting a card may select the matching Apple Maps
  // annotation without rebuilding the map or inventing a second marker style.
  // MapKit JS selectedAnnotation is the platform-native selected state, so the
  // pin/callout is visually elevated by Apple Maps itself.
  const selectById = id => {
    const key = id == null ? "" : String(id);
    const annotation = key ? pins.find(pin => pin.__wayfindId === key) || null : null;
    // MapKit JS annotations own their selected state. Clear the previous one,
    // then select the card's pin so the native pin/callout is elevated.
    for (const pin of pins) {
      try { pin.selected = pin === annotation; } catch (e) {}
    }
    return !!annotation;
  };

  return {
    select: selectById,
    destroy() { map.removeEventListener("select", select); map.destroy(); },
  };
}
