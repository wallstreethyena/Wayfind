// Discovery v2 is opt-in. Next.js replaces this direct NEXT_PUBLIC reference
// at build time; an absent, empty, or unrecognised value is always OFF.
export function isDiscoveryV2Enabled(value) {
  return ["1", "true", "on"].includes(String(value || "").trim().toLowerCase());
}

export const DISCOVERY_V2_ENABLED = isDiscoveryV2Enabled(process.env.NEXT_PUBLIC_DISCOVERY_V2);
