// scripts/test-place-products.mjs — locks the verified-product lookup that gates
// the place-card booking button (owner: no verified product, no button). Guards
// the route's robustness (id sanitization, batch cap, verified-product rule,
// server-only read, fail-soft) and the hook's batching + session cache.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-place-products: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const route = readFileSync(new URL("../app/api/place-products/route.js", import.meta.url), "utf8");
const hook = readFileSync(new URL("../lib/placeProduct.js", import.meta.url), "utf8");

// Route — security + correctness.
ok(/const SAFE_ID = \/\^\[A-Za-z0-9_-\]/.test(route), "route hard-filters ids to the google place-id charset (no PostgREST injection)");
ok(/\.slice\(0, 80\)/.test(route), "route caps the batch at 80 ids");
ok(/new Set\(/.test(route), "route dedupes ids before querying");
ok(/rn=eq\.1/.test(route) && /wf_place_products/.test(route), "route applies the verified-product rule (wf_place_products, rn=1)");
ok(/SUPABASE_SERVICE_ROLE_KEY/.test(route) && !/NEXT_PUBLIC_SUPABASE_ANON/.test(route), "route reads via the service role only (server-only, anti-scraping)");
ok(/select=place_id,provider,product_title,product_url/.test(route), "route selects exactly the fields the button needs");
ok((route.match(/products: \{\} \}/g) || []).length >= 2 || /\{ products: \{\} \}/.test(route), "route fail-soft returns { products: {} } (no button beats a wrong button)");
ok(/if \(!s\)/.test(route), "route returns empty when Supabase env is absent (never throws)");

// Hook — batching + cache + fail-soft.
ok(/const mem = new Map\(\)/.test(hook), "hook caches verdicts per place_id for the session");
ok(/let pending = new Map\(\)/.test(hook) && /setTimeout\(flush, 60\)/.test(hook), "hook coalesces a frame of cards into ONE POST");
ok(/\.catch\(\(\) => \{[\s\S]*mem\.set\(id, null\)/.test(hook), "hook fail-soft: on error every waiter resolves null (no button)");
ok(/export function usePlaceProduct/.test(hook), "hook exports usePlaceProduct");
ok(/"use client"/.test(hook), "hook is a client module");

console.log(`test-place-products: OK — ${pass} assertions (sanitized, batched, verified-product-only, fail-soft)`);
