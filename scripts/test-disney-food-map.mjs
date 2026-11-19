import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { createDisneyFoodMap, revealFoodDestination } from '../lib/disneyFoodMapController.js';
import { mapPinUrl } from '../lib/mapPinStandard.js';
const locations = JSON.parse(readFileSync(new URL('../lib/disneyChristmasFoodLocations2026.json', import.meta.url)));
const dom = new JSDOM('<div id="map"></div>');
globalThis.document = dom.window.document;
let instance;
class MapFixture {
  constructor(container, options) { this.container = container; this.options = options; instance = this; }
  addAnnotations(annotations) { this.annotations = annotations; for (const annotation of annotations) this.container.append(annotation.element); }
  showItems(items, options) { this.fitted = items; this.padding = options.padding; }
  destroy() { this.destroyed = true; this.container.replaceChildren(); }
}
class Annotation {
  constructor(coordinate, factory, options) { this.coordinate = coordinate; this.options = options; this.element = factory(); }
}
const mapkit = { Map: MapFixture, Annotation, Coordinate: class { constructor(lat,lng) { this.latitude=lat; this.longitude=lng; } }, Padding: class { constructor(...values) { this.values=values; } } };
const places = Object.entries(locations).map(([id,p]) => ({ id, lat:p.lat, lng:p.lng, name:p.label, city:'Test food' }));
const chosen = [];
const host = document.getElementById('map');
const controller = createDisneyFoodMap({ mapkit, container:host, places, className:'food-pin', onSelect:id => chosen.push(id) });
assert.equal(instance.options.mapType,'mutedStandard');
assert.equal(instance.annotations.length,7);
assert.equal(host.querySelectorAll('button').length,7);
for (let i=0;i<places.length;i++) {
  const pin=instance.annotations[i];
  const button=pin.element;
  assert.equal(pin.coordinate.latitude,places[i].lat);
  assert.equal(pin.coordinate.longitude,places[i].lng);
  assert.equal(pin.options.calloutEnabled,false);
  assert.equal(button.type,'button');
  assert.equal(button.dataset.foodPin,places[i].id);
  assert.equal(button.querySelector('span').textContent,String(i+1));
  assert.equal(button.querySelector('img').getAttribute('src'),mapPinUrl('food'));
  button.click(); button.click();
  assert.deepEqual(chosen.slice(-2),[places[i].id,places[i].id], 'repeated taps must activate the same stop');
}
controller.select(places[2].id);
assert.equal(host.querySelectorAll('[aria-pressed="true"]').length,1);
assert.equal(host.querySelector('[aria-pressed="true"]').dataset.foodPin,places[2].id);
controller.select(null);
assert.equal(host.querySelectorAll('[aria-pressed="true"]').length,0);
controller.fit(); assert.equal(instance.fitted.length,7);
assert.ok(instance.padding.values.every(n=>n>=65),'room for pins at each map edge');
controller.destroy(); assert.equal(instance.destroyed,true); assert.equal(host.children.length,0);
assert.throws(()=>createDisneyFoodMap({mapkit,container:host,places:[{id:'bad'}]}),/Missing geographic/);
const destination = document.createElement('section');
destination.id = 'food-destination'; destination.tabIndex = -1;
let scrolled = 0;
destination.scrollIntoView = options => { assert.equal(options.block, 'start'); scrolled++; };
document.body.append(destination);
const trigger = document.createElement('button'); document.body.append(trigger); trigger.focus();
revealFoodDestination(destination.id);
assert.equal(document.activeElement, destination, 'pin activation must hand keyboard focus to food');
trigger.focus(); revealFoodDestination(destination.id);
assert.equal(document.activeElement, destination, 'repeat activation restores food focus');
assert.equal(scrolled, 2);
assert.equal(destination.tabIndex, -1, 'food section must not add an extra tab stop');
assert.doesNotThrow(() => revealFoodDestination('missing-food'));
delete globalThis.document;
console.log('PASS: seven sourced coordinate associations, numbered shared pin art, native button activation and repeated clicks, selection/reset, fit and cleanup. Provider/browser rendering is a separate acceptance check.');
