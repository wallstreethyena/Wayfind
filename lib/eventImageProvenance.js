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
// VENUE PHOTOS SAY SO (owner, 2026-10-08): "Keep venue photography
// distinguishable from event photography." A venue image's credit chip leads
// with "Venue photo", so the card never implies it shows the event itself.
export function eventPhotoCredit(event, image) {
  const credit = eventPhotoCreditBase(event, image);
  if (!eventImageIsVenue(event, image)) return credit;
  return credit ? { label: `Venue photo · ${credit.label}`, href: credit.href } : { label: "Venue photo", href: null };
}
function eventPhotoCreditBase(event, image) {
  if (event?.photoAttr) return { label: event.photoAttr, href: event.photoAttrHref || null };
  try {
    const url = new URL(image, 'https://www.gowayfind.com');
    if (url.pathname !== '/api/photo') return null;
    const id = event?.place_id || url.searchParams.get('place');
    return { label: 'Google Maps', href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event?.venue || event?.event_name || event?.name || 'venue')}${id ? '&query_place_id=' + encodeURIComponent(id) : ''}` };
  } catch { return null; }
}
