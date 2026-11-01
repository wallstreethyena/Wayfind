// Client-safe published offering ends. These are complete calendar dates,
// never annual month/day rules: an ended overlay must not return next fall.
// The retirement guard compares these against every dated fallPool record.
export const FALL_OFFERING_ENDS = Object.freeze({
  "ChIJYVbXKAC32YgRUVddTqA46Kg": "2026-11-29", // Crema Gourmet
  "ChIJwZ_GK-d-54gRm5Ahg7PZYeY": "2026-11-01", // Dead Coconut Club
  "ChIJUczTK5XC2YgRRt4Jp6N3B70": "2026-11-08", // Pinto's Farm
});

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

export function fallOfferingDateLive(placeId, today) {
  if (!Object.hasOwn(FALL_OFFERING_ENDS, placeId)) return true;
  return validDate(today) && today <= FALL_OFFERING_ENDS[placeId];
}

export function fallOfferingRetired(placeId, today) {
  return Object.hasOwn(FALL_OFFERING_ENDS, placeId)
    && validDate(today) && today > FALL_OFFERING_ENDS[placeId];
}
