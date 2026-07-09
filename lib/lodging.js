// v4.66 — Lodging truth. Google hands the "lodging" type to canoe outposts
// with cabins, campgrounds, and RV parks; a Hotels label and a Booking.com
// rates button on a paddle outfitter is the iDalia bug wearing a different
// hat. A place is only lodging when its types say so AND its name does not
// identify it as primarily an outdoor operation.
const HOTEL_TYPES = /lodging|hotel|motel|resort|bed_and_breakfast|guest_house/;
const OUTDOOR_NAME = /canoe|kayak|paddle|outpost|outfitter|campground|camp\b|rv park|rv resort|marina|boat ramp|stables?\b|airboat/i;
const HOTEL_NAME = /hotel|resort|inn\b|suites|motel|lodge\b|b&b|bed and breakfast/i;

export function isTrueLodging(p) {
  if (!p) return false;
  const types = ((p.types || []).join(" ")).toLowerCase();
  const name = p.name || "";
  if (!HOTEL_TYPES.test(types)) return false;
  if (/campground|rv_park/.test(types) && !HOTEL_NAME.test(name)) return false;
  if (OUTDOOR_NAME.test(name) && !HOTEL_NAME.test(name)) return false;
  return true;
}
