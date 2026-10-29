// Curated product attachments, independent of creatorSignals and ranking.
// Verified against the official operator and Viator's supplier/product fields.
// Supplier evidence: https://www.viator.com/tours/Orlando/Silver-Springs-Tour/d663-290298P1
// Never match a title, URL substring, location, or another operator's tour.
const OPERATOR_VIDEOS = Object.freeze({
  "290298P1": Object.freeze({
    platform: "instagram",
    url: "https://www.instagram.com/reel/De-lBfCIBGZ/",
    creator: "getupandgosilversprings",
    relationship: "operator",
    supplier: "Get Up And Go Kayaking - Silver Springs",
  }),
});

export function experienceVideoFor({ provider, id } = {}) {
  if (provider !== "viator" || typeof id !== "string") return null;
  return Object.prototype.hasOwnProperty.call(OPERATOR_VIDEOS, id) ? OPERATOR_VIDEOS[id] : null;
}
