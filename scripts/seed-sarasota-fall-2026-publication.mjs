#!/usr/bin/env node
// Reviewed 2026-09-10 publication. --dry validates; --sql emits one transaction
// for the authenticated database connector. No credentials, paid calls, or
// link-health writes. Existing event IDs and slugs stay canonical.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const audit = JSON.parse(readFileSync(new URL("./fixtures/fall-sarasota-publication-2026-09-10.json", import.meta.url), "utf8"));
const { rows, patches, selected, provider_records: providerRecords } = audit;
const ids = [...rows, ...patches].map((row) => row.event_id);
assert.equal(rows.length, 4);
assert.equal(patches.length, 25);
assert.equal(providerRecords.length, 1);
assert.equal(new Set(ids).size, 29);
assert.equal(selected.length, 30);
assert(!ids.includes(providerRecords[0].event_id));
const protectedFields = new Set(["link_ok", "link_verdict", "link_checked_at", "link_final_url", "created_at", "updated_at"]);
for (const row of [...rows, ...patches.map((patch) => patch.set)]) {
  assert(Object.keys(row).every((key) => /^[a-z_]+$/.test(key) && !protectedFields.has(key)));
  assert(/^https:\/\//.test(row.official_event_url));
  assert(row.source_url && row.verify_note && row.verification_confidence === "high");
  assert(Number.isFinite(row.lat) && Number.isFinite(row.lng));
  assert(row.start_date >= "2026-09-01" && row.end_date >= row.start_date);
}
for (const patch of patches) {
  assert(!("event_id" in patch.set) && !("slug" in patch.set), "patch cannot rename a canonical event");
}
const literal = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const json = (value) => literal(JSON.stringify(value)) + "::jsonb";
const statements = ["BEGIN;", "SET LOCAL lock_timeout = '5s';"];
statements.push(`SELECT event_id FROM public.wf_events WHERE event_id IN (${ids.map(literal).join(",")}) FOR UPDATE;`);
// A seed that silently patches zero rows is not a publication. Protect the
// complete reviewed target set and every new slug before changing anything.
statements.push(`DO $srq_publication$ BEGIN
  IF (SELECT count(*) FROM public.wf_events WHERE event_id IN (${patches.map((p) => literal(p.event_id)).join(",")})) <> 25 THEN
    RAISE EXCEPTION 'Sarasota publication: canonical patch target missing';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_populate_recordset(NULL::public.wf_events, ${json(rows)}) incoming JOIN public.wf_events live ON live.slug = incoming.slug OR live.event_id = incoming.event_id WHERE live.slug IS DISTINCT FROM incoming.slug OR live.event_id IS DISTINCT FROM incoming.event_id) THEN
    RAISE EXCEPTION 'Sarasota publication: identity or slug collision';
  END IF;
END $srq_publication$;`);
// Hold row locks while comparing the exact reviewed fields. A concurrent
// editorial correction is never overwritten with our older snapshot. Values
// already equal to this publication are allowed, making retries idempotent.
statements.push(`DO $srq_publication$ BEGIN
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(${json(patches)}) patch(value)
    CROSS JOIN LATERAL jsonb_populate_record(NULL::public.wf_events, patch.value->'before') baseline
    CROSS JOIN LATERAL jsonb_populate_record(NULL::public.wf_events, patch.value->'set') expected
    JOIN public.wf_events live ON live.event_id=patch.value->>'event_id'
    CROSS JOIN LATERAL jsonb_object_keys(patch.value->'set') field(key)
    WHERE to_jsonb(live)->field.key IS DISTINCT FROM to_jsonb(baseline)->field.key
      AND to_jsonb(live)->field.key IS DISTINCT FROM to_jsonb(expected)->field.key
  ) THEN
    RAISE EXCEPTION 'Sarasota publication: reviewed fields changed concurrently; re-review before writing';
  END IF;
END $srq_publication$;`);
for (const row of rows) {
  const columns = Object.keys(row);
  statements.push(`INSERT INTO public.wf_events (${columns.join(",")})
SELECT ${columns.join(",")} FROM jsonb_populate_record(NULL::public.wf_events, ${json(row)})
ON CONFLICT (event_id) DO NOTHING;`);
}
for (const patch of patches) {
  statements.push(`UPDATE public.wf_events live SET ${Object.keys(patch.set).map((key) => `${key}=incoming.${key}`).join(",")}
FROM jsonb_populate_record(NULL::public.wf_events, ${json(patch.set)}) incoming
WHERE live.event_id=${literal(patch.event_id)};`);
}
const expectedRows = [...rows, ...patches.map((patch) => ({ event_id: patch.event_id, ...patch.set }))];
statements.push(`DO $srq_publication$ BEGIN
  IF (SELECT count(*) FROM public.wf_events WHERE event_id IN (${ids.map(literal).join(",")})) <> 29 THEN
    RAISE EXCEPTION 'Sarasota publication: incomplete write';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(${json(expectedRows)}) raw(value)
    CROSS JOIN LATERAL jsonb_populate_record(NULL::public.wf_events, raw.value) expected
    JOIN public.wf_events live ON live.event_id=expected.event_id
    CROSS JOIN LATERAL jsonb_object_keys(raw.value) field(key)
    WHERE to_jsonb(live)->field.key IS DISTINCT FROM to_jsonb(expected)->field.key
  ) THEN
    RAISE EXCEPTION 'Sarasota publication: field readback mismatch; transaction rolled back';
  END IF;
END $srq_publication$;`);
statements.push("COMMIT;");
if (process.argv.includes("--sql")) console.log(statements.join("\n\n"));
else if (process.argv.includes("--dry")) console.log("Sarasota publication validated: 4 rows, 25 corrections, 1 retained provider; health and canonical identities protected.");
else throw new Error("Use --dry to validate or --sql to prepare the authorized transaction.");
