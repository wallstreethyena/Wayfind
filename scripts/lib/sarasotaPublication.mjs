import { readFileSync } from "node:fs";

// The September 10 publication supersedes older seed facts for these IDs.
// Derive this set from the reviewed manifest so the two cannot drift.
const audit = JSON.parse(readFileSync(new URL("../fixtures/fall-sarasota-publication-2026-09-10.json", import.meta.url), "utf8"));
export const supersededSarasotaIds = new Set([...audit.rows, ...audit.patches].map((row) => row.event_id));
export const currentSarasotaSeed = "scripts/seed-sarasota-fall-2026-publication.mjs";
