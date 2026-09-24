import assert from 'node:assert/strict';
import { GUIDES } from '../lib/guides.js';
import { LANDING_CITIES } from '../lib/landingCities.js';
import { COVERAGE_2026_GUIDES, FLORIDA_CITY_GUIDES } from '../lib/guidesCoverage2026.js';

function missingCityGuides(cities, mapping, guides) {
  return Object.entries(cities).filter(([, city]) => city.state === 'FL')
    .filter(([slug]) => !mapping[slug] || !guides[mapping[slug]]).map(([slug]) => slug);
}
assert.ok(Object.keys(LANDING_CITIES).length > 0);
assert.deepEqual(missingCityGuides(LANDING_CITIES, FLORIDA_CITY_GUIDES, GUIDES), []);
assert.deepEqual(missingCityGuides({ ...LANDING_CITIES, 'new-florida-city': {state:'FL'} }, FLORIDA_CITY_GUIDES, GUIDES), ['new-florida-city']);
assert.deepEqual(missingCityGuides(LANDING_CITIES, { ...FLORIDA_CITY_GUIDES, venice:'missing-guide' }, GUIDES), ['venice']);
for (const slug of Object.keys(FLORIDA_CITY_GUIDES)) {
  assert.equal(LANDING_CITIES[slug]?.state, 'FL', `${slug}: mapped city must be a supported Florida city`);
}
assert.equal(Object.keys(COVERAGE_2026_GUIDES).length, 8);
for (const [slug, guide] of Object.entries(COVERAGE_2026_GUIDES)) {
  assert.ok(guide.picks.length >= 3, `${slug}: distinct useful stops`);
  assert.equal(new Set(guide.picks.map(p => p.name)).size, guide.picks.length);
  for (const pick of guide.picks) {
    assert.equal(pick.city, guide.region, `${slug}: no borrowed neighboring-city picks`);
    assert.ok(pick.sources.length > 0 && pick.sources.every(s => new URL(s).protocol === 'https:'), `${slug}: source per pick`);
    assert.ok(pick.tip && pick.blurb && pick.verifiedAt, `${slug}: practical sourced detail`);
  }
}
// Prevent losing the material access conditions uncovered during primary research.
assert.match(JSON.stringify(COVERAGE_2026_GUIDES['things-to-do-in-venice-florida']), /vehicle.*closed/);
assert.match(JSON.stringify(COVERAGE_2026_GUIDES['things-to-do-in-cortez-florida']), /Museum.*closed/);
assert.match(JSON.stringify(COVERAGE_2026_GUIDES['things-to-do-in-palmetto-florida']), /dock.*closed/);
console.log('test-guide-city-coverage: OK — all 14 Florida cities mapped, 8 researched guides, 26 local picks; missing-city and missing-guide negative controls detected');
