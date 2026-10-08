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
