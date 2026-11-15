// lib/christmasPlan.js: "My Christmas plan" share links (/christmas-in-florida?plan=id,id).
// PURE and server safe. The ids in a link are untrusted: they are shaped,
// deduped, capped and then checked against the real Christmas listings, so an
// unknown id is dropped and nothing else ever reaches a query or a page.
import { createHash } from "node:crypto";

export const CHRISTMAS_PLAN_MAX_ITEMS = 12;
const ID_RX = /^[A-Za-z0-9][A-Za-z0-9:_.\-]{0,119}$/;

// "a,b,c" (or an array) -> unique well formed ids, in order, at most 12.
export function parseChristmasPlanIds(value) {
  const raw = Array.isArray(value) ? value : String(value == null ? "" : value).split(",");
  const out = [];
  for (const part of raw) {
    const id = String(part || "").trim();
    if (ID_RX.test(id) && !out.includes(id)) out.push(id);
    if (out.length >= CHRISTMAS_PLAN_MAX_ITEMS) break;
  }
  return out;
}

// The listings a plan may hold: real Christmas events and tours (a place has no
// Save, so it is never in a plan). Unknown ids are dropped; order is kept.
export function christmasPlanItems(listings, ids) {
  const byId = new Map((Array.isArray(listings) ? listings : []).filter((c) => c && c.id && c.kind !== "place").map((c) => [c.id, c]));
  return parseChristmasPlanIds(ids).map((id) => byId.get(id)).filter(Boolean);
}

// A stable key for a plan: the same set of items always gives the same key,
// whatever order they were shared in. 16 hex chars.
export function christmasPlanKey(ids) {
  const sorted = parseChristmasPlanIds(ids).slice().sort();
  return createHash("sha256").update("christmas-plan:" + sorted.join("|")).digest("hex").slice(0, 16);
}

export const CHRISTMAS_VOTER_RX = /^[a-f0-9]{32}$/;
