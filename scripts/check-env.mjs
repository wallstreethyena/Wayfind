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
let warned = 0;
for (const [name, ok, hint] of checks) {
  const v = process.env[name];
  if (!v) { console.log(`ENV WARNING  ${name} is not set — ${hint}. Related features will be disabled.`); warned++; }
  else if (!ok(v)) { console.log(`ENV WARNING  ${name} looks malformed — ${hint}.`); warned++; }
}
console.log(warned ? `${warned} env warning(s) — build continues (features degrade gracefully)` : "env looks sane");
process.exit(0);
