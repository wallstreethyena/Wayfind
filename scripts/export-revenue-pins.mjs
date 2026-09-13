// Export actual current-code references, not guessed ticket eligibility.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { placePartnerPick } from '../lib/placePartnerPicks.js';
import { eventTicketDeal } from '../lib/eventTicketDeals.js';

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
writeFileSync(output, JSON.stringify({ snapshot_sha256: createHash('sha256').update(raw).digest('hex'),
  source_sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), pins }, null, 2), { flag: 'wx' });
console.log(`Exported ${pins.length} current-code pin references; rendered-surface eligibility remains unverified.`);
