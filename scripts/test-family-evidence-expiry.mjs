// test-family-evidence-expiry — Family-day verified facts expire in PRODUCTION on the real clock and fall back
// to "unknown" (null); this proves that behaviour with EXPLICIT reference instants, and that renewal works,
// so rail-composition tests (test-family-day-data) can run at a fixed in-window instant without hiding it.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { FAMILY_DAY_EVIDENCE, familyFilterFacts } from "../lib/familyDayEvidence.js";

let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error("  - " + m); } };

const entries = Object.entries(FAMILY_DAY_EVIDENCE);
ok(entries.length >= 10, `positive control: the evidence registry is populated (${entries.length})`);
const [id, raw] = entries.sort((a, b) => Date.parse(a[1].expiresAt) - Date.parse(b[1].expiresAt))[0];
const verified = Date.parse(raw.verifiedAt), expires = Date.parse(raw.expiresAt);
ok(Number.isFinite(verified) && Number.isFinite(expires) && expires > verified, "evidence dates parse and expiry is after verification");

// explicit reference instants: before verification, valid, last ms, exact expiry, after
ok(familyFilterFacts(id, { now: verified - 1 }) === null, "before verifiedAt -> null (a future-dated claim is never eligible)");
ok(familyFilterFacts(id, { now: verified + 86400000 }) !== null, "inside the window -> facts returned");
ok(familyFilterFacts(id, { now: expires - 1 }) !== null, "one ms before expiresAt -> still returned");
ok(familyFilterFacts(id, { now: expires }) === null, "at expiresAt (exclusive; parsed as 00:00Z) -> null");
ok(familyFilterFacts(id, { now: expires + 86400000 }) === null, "after expiry -> null (safe fallback: unknown facts, never expired claims)");
ok(familyFilterFacts(id, { now: Date.parse("2027-03-01T15:00:00Z") }) === null, "2027-03-01 -> null for every entry's window");
ok(entries.every(([k, e]) => familyFilterFacts(k, { now: Date.parse("2027-03-01T15:00:00Z") }) === null), "no entry stays eligible long after expiry");
ok(familyFilterFacts("ChIJ-not-in-registry", { now: verified + 1 }) === null && familyFilterFacts("", { now: verified + 1 }) === null, "unknown / empty id -> null");
ok(familyFilterFacts(id, { now: NaN }) === null, "a non-finite clock fails closed");

// PRODUCTION uses the REAL clock by default: the default `now` is Date.now() read at call time.
const realNow = Date.now;
try {
  Date.now = () => verified + 86400000; ok(familyFilterFacts(id) !== null, "default clock inside the window -> facts");
  Date.now = () => expires + 1;          ok(familyFilterFacts(id) === null, "default clock after expiry -> null (runtime follows the real clock)");
} finally { Date.now = realNow; }
ok(Date.now === realNow, "the clock override was restored");

// RENEWAL, executed: a copy of the module with a later expiry makes the same claim eligible again; the original stays expired.
const src = readFileSync(new URL("../lib/familyDayEvidence.js", import.meta.url), "utf8");
const renewedDate = "2026-11-10";
const renewedSrc = src.replace(/const EXPIRES_AT = "[0-9-]+";/, `const EXPIRES_AT = "${renewedDate}";`);
ok(renewedSrc !== src, "the renewal mutation applied (EXPIRES_AT was present and changed)");
const dir = mkdtempSync(join(tmpdir(), "fam-renew-")); const file = join(dir, "familyDayEvidence.mjs"); writeFileSync(file, renewedSrc);
const renewed = await import(pathToFileURL(file).href);
const afterOld = Date.parse("2026-10-20T16:00:00Z");
const target = Object.entries(renewed.FAMILY_DAY_EVIDENCE).find(([, e]) => e.expiresAt === renewedDate);
ok(!!target, "a renewed entry exists in the mutated copy");
if (target) {
  ok(renewed.familyFilterFacts(target[0], { now: afterOld }) !== null, "after renewal the claim is eligible at a date the ORIGINAL had expired");
  ok(familyFilterFacts(target[0], { now: afterOld }) === null, "the committed (unrenewed) evidence stays expired at that date — no silent extension");
}

if (bad) { console.error(`\ntest-family-evidence-expiry: FAIL — ${bad}/${n} assertions`); process.exit(1); }
console.log(`test-family-evidence-expiry: OK — ${n} assertions (explicit instants: before/valid/last-ms/exact/after, default clock is the real one, expired -> null, renewal executed on a module copy)`);
