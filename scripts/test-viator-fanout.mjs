// scripts/test-viator-fanout.mjs — Phase 2a lock: Viator candidate fanout.
// The geo-gated resolver (#196) is only as good as its candidate pool. With a
// top-3 pool, Viator's first results for real venues (Mote / Selby / Ca' d'Zan)
// were generic city tours, so the venue product never entered the candidate set
// and every CTA fell back to "Search Viator". Widen the pool to >=10 on /go, and
// on /tours decouple the SEARCH fanout from the caller's DISPLAY count — while
// keeping the display slice exactly verified.slice(0, count) so nothing the user
// sees changes size. The resolver stays default-deny, so a wider pool can only
// add correct product hits, never wrong-place ones.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-viator-fanout: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const go = readFileSync(new URL("../app/api/viator/go/route.js", import.meta.url), "utf8");
ok(go.includes("pagination: { start: 1, count: 10 }"), "/go resolver search requests a 10-candidate pool");
ok(!go.includes("pagination: { start: 1, count: 3 }"), "/go old 3-candidate pool is gone");

const tours = readFileSync(new URL("../app/api/viator/tours/route.js", import.meta.url), "utf8");
ok(tours.includes("pagination: { start: 1, count: Math.max(count, 10) }"), "/tours search fanout decoupled from the display count (>=10)");
ok(!/pagination: \{ start: 1, count \}/.test(tours), "/tours old display-coupled fanout is gone");
ok(tours.includes("verified.slice(0, count)"), "/tours display slice still honors the caller's count");

console.log(`test-viator-fanout: OK — ${pass} assertions (candidate pool >=10; display counts unchanged)`);
