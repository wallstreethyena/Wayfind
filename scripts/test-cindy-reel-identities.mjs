// Exact source-to-venue acceptance for the owner's 28-Reel batch. The intake
// preserves held URLs; only reviewed assignments may reach cards or the page.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadComponent } from './lib/jsxLoad.mjs';
import { __CURATED_FOR_CODEGEN__ as CURATED, creatorVideosFor, allCreators } from '../lib/creatorVideos.js';
import { CAPTIONS, captionFor } from '../lib/creatorCaptions.js';
import { embedSrc } from '../lib/videoEmbed.js';

const repo = fileURLToPath(new URL('..', import.meta.url));
const { sources } = JSON.parse(readFileSync(new URL('../docs/curation/cindy-reels-2026-10-29.json', import.meta.url)));
const submitted = `DfBTb96CFZQ DfA_fXppK6r DfAz7qIpxOC De4TQPHibq8 Dewd4hwiVIE DeX0q3ZJmYA Dc44pPUiNHZ DeVNmyypnUU DeR1pO4i1Ef DePUUmXCRYy DeN61B-CAJX DeFxig6p1Oa DeVj71Miy2c Dd5S1XViNoA DdzvudupUdo DdmEL0_JrDW DdJuoujCqvS DdHA6GCq4Ym DczhpPGp5-b DcuNn9JpJUx Dcrv8nJpg2Y Dcj4cnpJSDx DchZaJ0JIeh DccTV0rJaHI DfCcRklCSOC De0TPJ-pRSI DevB7D0JXlF Dcwuyx8p6Bo`.split(' ');
assert.equal(sources.length, 28, 'account for every original submission');
assert.deepEqual(sources.map(s => s.shortcode).sort(), submitted.sort(), 'no dropped, duplicated or substituted sources');
assert.equal(sources.filter(s => s.status === 'held_identity').length, 1);
assert.equal(sources.filter(s => s.status === 'assigned').length, 23);
assert.equal(sources.filter(s => s.status === 'already_live').length, 4);

const { CreatorPage, creatorProfile } = await loadComponent(fileURLToPath(new URL('../lib/creatorPages.js', import.meta.url)), repo);
const profile = creatorProfile('cindy.selects');
const html = renderToStaticMarkup(await CreatorPage({ handle: 'cindy.selects', mapPlaces: [] }));
assert(html.length > 2000 && profile.spots.length > 28, 'render a real creator page, not an empty positive');
assert.equal(profile.platform, 'tiktok', 'retain the avatar/profile platform contract');

for (const source of sources) {
  const url = `https://www.instagram.com/reel/${source.shortcode}/`;
  assert.equal(source.native_url, url, 'preserve the exact native source');
  assert.equal(source.creator, 'cindy.selects', 'preserve original attribution');
  assert(source.evidence.length > 30, `${source.shortcode}: keep review evidence`);
  const actual = CURATED.filter(e => e.videos.some(v => v.url === url));
  const spots = profile.spots.filter(s => s.video.url === url);
  if (source.status === 'held_identity') {
    assert.equal(source.shortcode, 'DeR1pO4i1Ef');
    assert.deepEqual(source.places, [], 'an identity hold cannot carry a publishable association');
    assert(source.needed && source.evidence_urls.length >= 2, 'retain the unblock requirement and sources');
    assert.equal(actual.length, 0, 'held Reel must not appear anywhere in the published registry');
    assert.equal(spots.length, 0, 'held Reel must not appear in creator-page data');
    assert(!html.includes('Mote Science Education Aquarium') && !html.includes('Mote Marine Laboratory'), 'held facility must not render on the actual Cindy page');
    assert(!Object.keys(CAPTIONS).some(k => k.includes(url)), 'no stale caption can claim a held facility');
    continue;
  }
  assert.equal(source.places.length, 1, `${source.shortcode}: a single venue, not a guessed roundup`);
  const place = source.places[0];
  assert.deepEqual(actual.map(e => [e.key, e.placeId]), [[place.key, place.place_id]], `${source.shortcode}: exactly one reviewed association`);
  const matches = creatorVideosFor({ id: place.place_id, name: place.name, city: place.city }, place.city).filter(v => v.url === url);
  assert.equal(matches.length, 1, `${source.shortcode}: the normal place resolver must find it once`);
  assert.equal(matches[0].creator, source.creator);
  assert(captionFor(matches[0]).length > 30, `${source.shortcode}: retained caption`);
  assert.equal(embedSrc('instagram', url), `${url}embed/`, 'retain native playback');
  assert.equal(spots.length, 1, `${source.shortcode}: exactly one creator-page spot`);
  assert.equal(spots[0].placeId, place.place_id || null);
  // The native URL is a lazy player's React prop, not an SSR link. Its exact
  // value is asserted above through the real page model; assert the rendered
  // place link and playback control separately rather than inventing markup.
  if (place.place_id) {
    assert(html.includes(`/p/${place.place_id}`), `${source.shortcode}: actual page includes the exact place link`);
    assert(!creatorVideosFor({ id: 'ChIJdifferentCindyVenue123', name: actual[0].match.name, city: place.city }, place.city).some(v => v.url === url), `${source.shortcode}: a different Google identity must not inherit a same-name video`);
  } else {
    // Pre-existing Rreal routing is outside this three-identity correction.
    // Do not invent an ID or call this name/city route an exact-ID assignment.
    assert.equal(source.status, 'already_live');
    assert.equal(source.shortcode, 'DevB7D0JXlF');
    assert.equal(place.key, 'rreal-tacos-downtown-tampa');
    assert.equal(place.city, 'Tampa');
    assert(html.includes('/?q=Rreal%20Tacos'), 'retain the existing Rreal place-search link');
  }
}

const project = sources.find(s => s.shortcode === 'Dcj4cnpJSDx');
assert.equal(project.places[0].place_id, 'ChIJy6vf9_dBw4gRGg1sXR5UTGU', 'Project Coffee footage belongs to Burns Court');
assert.equal(project.places[0].address, '538 S Pineapple Ave, Sarasota, FL 34236');
assert.equal(sources.find(s => s.shortcode === 'De4TQPHibq8').places[0].place_id, 'ChIJs8X39n07w4gR0NEp6j5PNdc', 'native tag corroborates the Bradenton branch');
const exclusions = [
  ['ChIJK4UHeR1Bw4gRBlMVPK7epPo', 'Project Coffee', 'Sarasota', 'Dcj4cnpJSDx'],
  ['ChIJYyfzl39Qw4gRRSr5_0Mz9qU', 'Cracker Barrel', 'Venice', 'De4TQPHibq8'],
  ['ChIJRyOEfAo5w4gR664aD_YYBLU', 'Mote Science Education Aquarium', 'Sarasota', 'DeR1pO4i1Ef'],
  ['ChIJrXZ3LLxqw4gRjYTBNBMgJnA', 'Mote Marine Laboratory', 'Sarasota', 'DeR1pO4i1Ef'],
];
for (const [id, name, city, code] of exclusions) {
  assert(!creatorVideosFor({ id, name, city }, city).some(v => v.url.includes(code)), `${code}: excluded sibling ${id}`);
}
// The correction must remove only Cindy's unsupported attachment, not another
// creator's supported video on the same card.
assert(creatorVideosFor({ id: 'ChIJK4UHeR1Bw4gRBlMVPK7epPo' }).some(v => v.creator === 'makayluhhhhh' && v.url.endsWith('/7228925232709471531')));
assert(creatorVideosFor({ id: 'ChIJRyOEfAo5w4gR664aD_YYBLU' }).some(v => v.creator === 'manateelittlelocals' && v.url.endsWith('/7647673425548430605')));
assert(allCreators().creators.some(c => c.handle === 'cindy.selects'), 'retain the public creator listing');
assert.equal((html.match(/data-creator-embed-action="play"/g) || []).length, profile.spots.length, 'every Cindy post has an actual rendered playback control');
console.log('test-cindy-reel-identities: PASS (28 sources; 26 exact-ID associations; 1 preserved existing name/city association; 1 explicit hold; resolver, siblings, captions and rendered Cindy page)');
