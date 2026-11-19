// Load the versioned selector map. The committed map is a PLACEHOLDER.

import { readFileSync } from "node:fs";

let cached = null;

export function loadSelectorMap() {
  if (cached) return cached;
  const raw = JSON.parse(readFileSync(new URL("./selectors/opentable.v1.json", import.meta.url), "utf8"));
  if (!raw || raw.version !== "opentable.v1" || !raw.fields || !raw.submit) throw new Error("selector map is incomplete");
  cached = raw;
  return raw;
}
