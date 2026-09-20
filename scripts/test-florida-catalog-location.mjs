import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  nearbyCatalogCity,
  detectCatalogCity,
} from '../lib/floridaCatalogLocation.js';
import {
  FLORIDA_CATALOG_CATEGORIES,
  catalogQuery,
} from '../lib/floridaCatalog.js';

const ok = (condition, message) => assert.ok(condition, message);

// The complete catalog contract is five results for every valid category.
for (const category of FLORIDA_CATALOG_CATEGORIES) {
  const query = catalogQuery(new URLSearchParams(`city=Orlando&cat=${category.key}`));
  assert.deepEqual(query, {
    city: 'Orlando',
    cat: category.key,
    page: 0,
    limit: 5,
    completeCatalog: true,
  }, `valid ${category.key} query should carry the five-item complete-catalog contract`);
}
assert.equal(catalogQuery(new URLSearchParams('city=Orlando&page=3')).limit, 5);
assert.equal(catalogQuery(new URLSearchParams('city=NotAFloridaCity')), null);
assert.equal(catalogQuery(new URLSearchParams('cat=not-a-category')), null);
assert.equal(catalogQuery(new URLSearchParams('page=-1')), null);
assert.equal(catalogQuery(new URLSearchParams('page=1.5')), null);
assert.equal(catalogQuery(new URLSearchParams('page=501')), null);

// Red-proof the cap: loading a transient in-memory old fixture must make this
// guard's five-item assertion fail. The shared module is never modified.
const catalogSource = await readFile(new URL('../lib/floridaCatalog.js', import.meta.url), 'utf8');
const oldCatalogSource = catalogSource.replace(
  'return {city,cat,page,limit:5,completeCatalog:true};',
  'return {city,cat,page,limit:24,completeCatalog:true};',
);
ok(oldCatalogSource !== catalogSource, 'old limit fixture must actually differ from the live module');
const oldCatalog = await import(`data:text/javascript;base64,${Buffer.from(oldCatalogSource).toString('base64')}`);
assert.equal(oldCatalog.catalogQuery(new URLSearchParams('city=Orlando')).limit, 24);
assert.throws(
  () => assert.equal(oldCatalog.catalogQuery(new URLSearchParams('city=Orlando')).limit, 5),
  'the guard must fail against the old 24-item limit',
);

// Center and radius behavior, including invalid coordinate inputs.
for (const [city, lat, lng] of [
  ['Orlando', 28.5383, -81.3792],
  ['Tampa', 27.9506, -82.4572],
  ['St. Petersburg', 27.7676, -82.6403],
  ['Clearwater', 27.9659, -82.8001],
  ['Sarasota', 27.3364, -82.5307],
]) assert.equal(nearbyCatalogCity(lat, lng), city, `${city} center should resolve to itself`);
assert.equal(nearbyCatalogCity(28.292, -81.407), 'Orlando', 'Kissimmee should use the nearby Orlando catalog');
assert.equal(nearbyCatalogCity(40.7128, -74.006), '');
assert.equal(nearbyCatalogCity(33.749, -84.388), '');
assert.equal(nearbyCatalogCity(25.7617, -80.1918), '');
assert.equal(nearbyCatalogCity(Number.NaN, -81.3792), '');
assert.equal(nearbyCatalogCity(28.5383, Number.POSITIVE_INFINITY), '');
assert.equal(nearbyCatalogCity('28.5383', -81.3792), '');
assert.equal(nearbyCatalogCity(null, undefined), '');

const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalFetch = globalThis.fetch;
const setNavigator = value => Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  enumerable: true,
  writable: true,
  value,
});
const restoreGlobals = () => {
  if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
  else delete globalThis.navigator;
  if (originalFetch) globalThis.fetch = originalFetch;
  else delete globalThis.fetch;
};
const response = (geo, okResponse = true) => ({
  ok: okResponse,
  async json() { return geo; },
});

try {
  let fetchCalls = 0;
  let gpsCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return response({ ok: true, name: 'Orlando, FL', lat: 28.5383, lng: -81.3792 });
  };
  setNavigator({
    permissions: { query: async () => ({ state: 'prompt' }) },
    geolocation: { getCurrentPosition() { gpsCalls += 1; } },
  });
  assert.equal(await detectCatalogCity(), 'Orlando');
  assert.equal(fetchCalls, 1);
  assert.equal(gpsCalls, 0, 'automatic detection must not prompt for GPS permission');

  globalThis.fetch = async () => response({ ok: true, name: 'Atlanta, GA', lat: 33.749, lng: -84.388 });
  setNavigator({ permissions: { query: async () => ({ state: 'prompt' }) }, geolocation: {} });
  assert.equal(await detectCatalogCity(), '', 'non-Florida coarse location must not select a catalog city');

  let explicitGpsCalls = 0;
  globalThis.fetch = async () => { throw new Error('GPS success must not use coarse fallback'); };
  setNavigator({
    permissions: { query: async () => ({ state: 'prompt' }) },
    geolocation: {
      getCurrentPosition(resolve) {
        explicitGpsCalls += 1;
        resolve({ coords: { latitude: 28.292, longitude: -81.407 } });
      },
    },
  });
  assert.equal(await detectCatalogCity({ requestPermission: true }), 'Orlando');
  assert.equal(explicitGpsCalls, 1);

  let fallbackCalls = 0;
  globalThis.fetch = async () => {
    fallbackCalls += 1;
    return response({ ok: true, name: 'Tampa, FL', lat: 27.9506, lng: -82.4572 });
  };
  setNavigator({
    permissions: { query: async () => ({ state: 'granted' }) },
    geolocation: { getCurrentPosition(_resolve, reject) { reject(new Error('denied')); } },
  });
  assert.equal(await detectCatalogCity(), 'Tampa', 'denied GPS should fall back to coarse Florida location');
  assert.equal(fallbackCalls, 1);

  globalThis.fetch = async () => response({ ok: true, name: 'Orlando, FL', lat: 28.5383, lng: -81.3792 });
  setNavigator({
    permissions: { query: async () => ({ state: 'granted' }) },
    geolocation: { getCurrentPosition(_resolve, reject) { reject(new Error('timeout')); } },
  });
  assert.equal(await detectCatalogCity(), 'Orlando', 'GPS timeout should fall back to coarse Florida location');

  globalThis.fetch = async () => response({ ok: false }, false);
  setNavigator({ permissions: { query: async () => ({ state: 'prompt' }) }, geolocation: {} });
  assert.equal(await detectCatalogCity(), '');
} finally {
  restoreGlobals();
}

console.log('florida catalog location: all pure contract and mocked-location checks passed');
