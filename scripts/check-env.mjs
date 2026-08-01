import { isPlaceholderCredential } from "../lib/envPlaceholder.js";
// Build advisor: environment sanity. NON-FATAL by design (the hardened
// Supabase client and API routes degrade gracefully), but a missing or
// malformed key now prints a clear line in the build log instead of costing
// hours of silent-feature debugging. Always exits 0.
const checks = [
  ["NEXT_PUBLIC_SUPABASE_URL", (v) => /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(v || ""), "expected https://<ref>.supabase.co"],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", (v) => (v || "").length > 20, "expected the anon key (eyJ... JWT or sb_publishable_...)"],
  ["NEXT_PUBLIC_GOOGLE_MAPS_KEY", (v) => (v || "").length > 20, "Places/Maps features need this"],
  // v6.79: absence must be LOUD. Every viator link is attributed through this
  // PID; with it unset, ticketsUrl()/experienceSearchUrl() correctly return null
  // and every Viator CTA silently disappears — revenue going to zero with a
  // green build. Six other revenue vars were in exactly this "happens to be set"
  // state on 2026-07-30.
  ["NEXT_PUBLIC_VIATOR_PID", (v) => (v || "").trim().length > 3, "every Viator CTA is attributed through this; unset means all Viator revenue silently stops"],
];
// v6.80: PRESENT BUT FAKE is its own state, and every check above would have
// passed it. `vercel env pull` writes the literal "[SENSITIVE]" for any var
// flagged Sensitive in the dashboard, and "[SENSITIVE]".trim().length > 3 is
// true — so a sourced .env.production.local reported "env looks sane" while
// NEXT_PUBLIC_VIATOR_PID was a placeholder and every Viator URL shipped
// ?pid=%5BSENSITIVE%5D. It gets its own louder line because the fix is different
// from "set the var": the var IS set, in the wrong way. See lib/envPlaceholder.js.
let warned = 0;
for (const [name, ok, hint] of checks) {
  const v = process.env[name];
  if (!v) { console.log(`ENV WARNING  ${name} is not set — ${hint}. Related features will be disabled.`); warned++; }
  else if (isPlaceholderCredential(v)) { console.log(`ENV WARNING  ${name} is a PLACEHOLDER (${JSON.stringify(String(v).trim())}), not a real value — ${hint}. If this came from \`vercel env pull\`, the var is flagged Sensitive in Vercel and cannot be read back; NEXT_PUBLIC_* vars ship to the browser anyway, so un-flag it.`); warned++; }
  else if (!ok(v)) { console.log(`ENV WARNING  ${name} looks malformed — ${hint}.`); warned++; }
}
console.log(warned ? `${warned} env warning(s) — build continues (features degrade gracefully)` : "env looks sane");
process.exit(0);
