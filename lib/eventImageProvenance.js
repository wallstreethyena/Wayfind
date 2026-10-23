// Reviewed venue photographs for data-only wf_events additions. Bind credits
// to BOTH the event identity and exact asset, so a future hero cannot inherit
// another photographer's credit. Source pages carry the full CC licence terms.
export const LICENSED_EVENT_VENUE_PHOTOS = Object.freeze({
  "wekiva-tooting-otter-trick-or-treat-2026": {
    image: "https://upload.wikimedia.org/wikipedia/commons/c/c5/Wekiva_Island_canoes.jpg",
    credit: "inazakira · CC BY-SA 2.0 · Cropped to fit",
    license: "CC BY-SA 2.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Wekiva_Island_canoes.jpg",
  },
  "wekiva-halloween-costume-party-2026": {
    image: "https://upload.wikimedia.org/wikipedia/commons/c/c5/Wekiva_Island_canoes.jpg",
    credit: "inazakira · CC BY-SA 2.0 · Cropped to fit",
    license: "CC BY-SA 2.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Wekiva_Island_canoes.jpg",
  },
  "elliott-monster-mash-2026": {
    image: "https://upload.wikimedia.org/wikipedia/commons/5/5d/Elliott_Museum%2C_North_Facade.JPG",
    credit: "Jennifer Esler · CC BY-SA 4.0 · Cropped to fit",
    license: "CC BY-SA 4.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Elliott_Museum,_North_Facade.JPG",
  },
  "vero-monster-mash-on-main-2026": {
    image: "https://upload.wikimedia.org/wikipedia/commons/c/cd/Vero_Beach_FL_Arcade_Theater_Cabaret01.jpg",
    credit: "Ebyabe · CC BY-SA 3.0 · Cropped to fit",
    license: "CC BY-SA 3.0",
    creditHref: "https://commons.wikimedia.org/wiki/File:Vero_Beach_FL_Arcade_Theater_Cabaret01.jpg",
  },
});

export function withLicensedEventPhotoCredit(row) {
  const photo = LICENSED_EVENT_VENUE_PHOTOS[row?.event_id];
  if (!photo || row.hero_image !== photo.image) return row;
  return { ...row, photoAttr: photo.credit, photoAttrHref: photo.creditHref };
}

// Lean provenance contract shared by all event-card consumers. This does not
// infer an event scene from the presence of an image URL.
export function eventImageIsVenue(event, image = event?.hero_image) {
  if (!image) return false;
  // hero_image_kind (wf_events, 2026-10-08) records what the hero depicts.
  if (event?.image_is_venue === true || event?.imageIsVenue === true || event?.hero_image_kind === 'venue') return true;
  try {
    const url = new URL(image, 'https://www.gowayfind.com');
    return url.pathname === '/api/photo' && (!!url.searchParams.get('place') || !!url.searchParams.get('ref'));
  } catch { return false; }
}
export function eventPhotoCredit(event, image) {
  if (event?.photoAttr) return { label: event.photoAttr, href: event.photoAttrHref || null };
  try {
    const url = new URL(image, 'https://www.gowayfind.com');
    if (url.pathname !== '/api/photo') return null;
    const id = event?.place_id || url.searchParams.get('place');
    return { label: 'Google Maps', href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event?.venue || event?.event_name || event?.name || 'venue')}${id ? '&query_place_id=' + encodeURIComponent(id) : ''}` };
  } catch { return null; }
}
