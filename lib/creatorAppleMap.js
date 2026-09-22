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
    const family = eventMapFamily(p);
    const annotation = new mapkit.ImageAnnotation(new mapkit.Coordinate(p.lat, p.lng), {
      title: p.name, subtitle: p.city || "", ...applePinOptions(mapkit, family),
    });
    // NO CALLOUT. The card beside the map is this pin's detail view, so Apple's
    // bubble would only repeat it -- and asking for one is not free. Our pins are
    // SVG data-URL images with no declared size, so MapKit cannot measure them
    // until they load; positioning a callout for an unmeasured image throws
    // inside mapkit.core (positionForCallout reads size.width). MapKit
    // re-positions the selected callout every time it adds another annotation,
    // so one selected pin aborts the add loop for all the rest. On
    // 2026-09-22 /guides/florida-fall-festivals-2026 shipped with a selected
    // card on load and rendered ONE pin of nine. Selection still works and the
    // map still emits select, so the card still follows the pin.
    annotation.calloutEnabled = false;
    annotation.__wayfindId = String(p.id);
    annotation.__wayfindFamily = family;
    annotation.__wayfindLifted = false;
    return annotation;
  });
  map.addAnnotations(pins);
  if (pins.length) map.showItems(pins, { animate: false, padding: new mapkit.Padding(50, 35, 50, 35) });
  // With no callout, a selected ImageAnnotation looks exactly like every other
  // pin, so nothing on the map showed which pin belonged to the card in view.
  // Paint the pin standard's own selected treatment on whichever pin is
  // selected and restore the plain pin when it is not. Only pins whose state
  // changed are repainted, so swiping never redraws the whole map.
  const lift = (annotation, lifted) => {
    if (!annotation || !annotation.__wayfindFamily || annotation.__wayfindLifted === lifted) return;
    try {
      Object.assign(annotation, applePinOptions(mapkit, annotation.__wayfindFamily, { selected: lifted }));
      annotation.__wayfindLifted = lifted;
    } catch (e) {}
  };

  // Card-to-pin sync selects pins in code, and MapKit answers every such
  // selection with the same select event a tap produces, synchronously inside
  // the `selected` assignment. Reporting those as taps made the card and the
  // map fight: a tapped pin started the rail moving, the first scroll frame
  // re-selected the card still in view, that selection came back as a "tap"
  // and sent the rail home. Tapping a pin never brought its card forward
  // (/guides/florida-fall-festivals-2026, 2026-09-22). Only real taps reach
  // onSelect now.
  let syncing = false;
  const select = event => {
    lift(event?.annotation, true);
    if (!syncing) onSelect?.(event?.annotation?.__wayfindId || null);
  };
  const deselect = event => lift(event?.annotation, false);
  map.addEventListener("select", select);
  map.addEventListener("deselect", deselect);

  // Guide/map parity: selecting a card selects the matching Apple Maps
  // annotation without rebuilding the map or inventing a second marker style.
  const selectById = id => {
    const key = id == null ? "" : String(id);
    const annotation = key ? pins.find(pin => pin.__wayfindId === key) || null : null;
    syncing = true;
    try {
      // MapKit JS annotations own their selected state. Clear the previous one,
      // then select the card's pin.
      for (const pin of pins) {
        try { pin.selected = pin === annotation; } catch (e) {}
      }
    } finally {
      syncing = false;
    }
    for (const pin of pins) lift(pin, pin === annotation);
    return !!annotation;
  };

  return {
    select: selectById,
    destroy() { map.removeEventListener("select", select); map.removeEventListener("deselect", deselect); map.destroy(); },
  };
}
