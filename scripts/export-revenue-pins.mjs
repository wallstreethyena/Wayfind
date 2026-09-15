// Export actual current-code references, not guessed ticket eligibility.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { placePartnerPick } from '../lib/placePartnerPicks.js';
import { eventTicketDeal } from '../lib/eventTicketDeals.js';
import { unmappedSellableEvents } from '../lib/affiliateLibrary.js';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: export-revenue-pins.mjs snapshot.json pins.json');
const raw = readFileSync(input);
const data = JSON.parse(raw);
if (data.schema_version !== 'revenue-1') throw new Error('Expected revenue snapshot');
const pins = [];
for (const row of data.datasets.places) {
  const pick = placePartnerPick({ ...row, id: row.place_id });
  if (pick) pins.push({ entity_type: 'place', entity_id: row.place_id, provider: pick.provider, offer_id: String(pick.offerId) });
}
for (const row of data.datasets.events) {
  const pick = eventTicketDeal(row.event_id);
  if (pick) pins.push({ entity_type: 'event', entity_id: row.event_id, provider: 'undercover_tourist', offer_id: String(pick.deal), product_type: pick.product });
}
// 2026-09-15: the same census also names the LEAK state — a wf_events row at a
// merchant a partner already sells, with no mapping in lib/eventTicketDeals.js
// (lib/affiliateLibrary.js). This is the daily, DB-aware sibling of
// scripts/check-affiliate-coverage.mjs; app/api/cron/affiliate-coverage is
// the one that emails. Listed here so the revenue report carries the gap.
const gaps = unmappedSellableEvents(data.datasets.events).map((c) => ({
  entity_type: 'event', entity_id: c.eventId, merchant: c.merchant.key, url: c.url,
  admission_offer_id: String(c.merchant.admission.offerId), state: 'unmapped_sellable_event',
}));
writeFileSync(output, JSON.stringify({ snapshot_sha256: createHash('sha256').update(raw).digest('hex'),
  source_sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), pins, gaps }, null, 2), { flag: 'wx' });
console.log(`Exported ${pins.length} current-code pin references; rendered-surface eligibility remains unverified.`);
if (gaps.length) console.log(`WARNING: ${gaps.length} sellable event(s) with no affiliate mapping: ${gaps.map((g) => g.entity_id).join(', ')}`);
