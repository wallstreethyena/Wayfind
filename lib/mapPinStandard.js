// One reference-style teardrop for Apple Maps, MapLibre sprites and legends.
// Paths are monochrome vectors: no platform-dependent emoji fonts.
export const PIN_PATH = 'M17 45 C13 39 1 29 1 17 A16 16 0 1 1 33 17 C33 29 21 39 17 45Z';
export const PIN_CATEGORIES = {
  food: { label: 'Food & dining', color: '#F97316', path: 'M3 2V9Q3 12 6 12V22H8V12Q11 12 11 9V2H9V8H8V2H6V8H5V2ZM18 2Q14 7 14 13H18V22H21V2Z' },
  cafe: { label: 'Coffee & cafés', color: '#A66A3F', path: 'M3 9H17V15Q17 20 10 20Q3 20 3 15ZM17 10H20Q24 15 17 17V14Q21 13 19 12H17ZM2 21H20V23H2ZM7 1Q4 4 8 6V8H10V6Q6 3 9 1ZM13 1Q10 4 14 6V8H16V6Q12 3 15 1Z' },
  drinks: { label: 'Nightlife & bars', color: '#D92B83', path: 'M2 5H22L13 14V21H18V23H6V21H11V14ZM16 5L21 0L23 1L19 5Z' },
  shows: { label: 'Shows & events', color: '#8B3EE8', path: 'M9 4L22 1V17C22 22 15 23 15 19C15 16 18 15 20 16V7L11 9V20C11 25 3 25 3 21C3 18 7 17 9 18Z' },
  outdoors: { label: 'Outdoors & nature', color: '#3FA34D', path: 'M12 8Q7 0 1 4L7 8Q1 7 0 14L9 10Q6 14 7 17L12 11Q13 17 10 22H8V24H19V22H15Q17 16 14 10L22 16Q24 10 17 8L24 5Q19 0 13 7L15 1Q10 0 12 8Z' },
  water: { label: 'Beaches & water', color: '#04B5D8', path: 'M11 1H13V3Q22 4 24 13Q20 10 17 13Q13 10 12 13Q7 10 5 13Q2 10 0 13Q2 4 11 3ZM11 13H13V20H11ZM1 20Q5 17 9 20T17 20T24 20V23Q20 20 17 23T9 23T1 23Z' },
  culture: { label: 'Things to do', color: '#8354D9', path: 'M0 7L12 0L24 7V9H0ZM3 11H7V21H3ZM10 11H14V21H10ZM17 11H21V21H17ZM0 22H24V24H0Z' },
  stay: { label: 'Stays & hotels', color: '#058ADB', path: 'M1 3H4V15H23V22H20V19H4V22H1ZM6 6H11V12H6ZM13 7H19Q23 7 23 12V14H5V13H13Z' },
  shop: { label: 'Shopping', color: '#E6428A', path: 'M4 8H20L22 23H2ZM7 8V5C7 -1 17 -1 17 5V8H15V5C15 1 9 1 9 5V8Z' },
  wellness: { label: 'Spas & wellness', color: '#00ADAA', path: 'M12 1Q5 8 12 19Q19 8 12 1ZM1 8Q0 20 11 23Q10 12 1 8ZM23 8Q24 20 13 23Q14 12 23 8Z' },
  fitness: { label: 'Fitness & sports', color: '#7040CE', path: 'M1 8H4V16H1ZM5 4H8V20H5ZM9 10H15V14H9ZM16 4H19V20H16ZM20 8H23V16H20Z' },
  event: { label: 'Event venue', color: '#F97316', path: 'M12 0L15 8L24 9L17 15L19 24L12 19L5 24L7 15L0 9L9 8Z' },
  location: { label: 'Your location', color: '#008FFF', path: 'M12 1A11 11 0 1 1 11.99 1ZM12 6A6 6 0 1 0 12.01 6Z' },
  other: { label: 'More', color: '#6B7280', path: 'M4 9A3 3 0 1 1 3.99 9ZM12 9A3 3 0 1 1 11.99 9ZM20 9A3 3 0 1 1 19.99 9Z' },
};
export function pinCategory(family) { return PIN_CATEGORIES[family] || PIN_CATEGORIES.other; }
export function mapPinSvg(family, { selected = false } = {}) {
  const {color, path} = pinCategory(family);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="46" viewBox="0 0 34 46"><defs><linearGradient id="rim" x2=".8" y2="1"><stop stop-color="#fff"/><stop offset=".4" stop-color="${color}"/><stop offset="1" stop-color="#fff"/></linearGradient><radialGradient id="body" cx=".32" cy=".2" r=".85"><stop stop-color="${color}"/><stop offset=".65" stop-color="${color}"/><stop offset="1" stop-color="#07121d"/></radialGradient></defs><path d="${PIN_PATH}" fill="url(#rim)" ${selected ? 'stroke="white" stroke-width="2"' : ''}/><path d="${PIN_PATH}" transform="translate(2 2) scale(.88 .9)" fill="url(#body)"/><path d="${path}" transform="translate(8 8) scale(.75)" fill="white" fill-rule="evenodd"/></svg>`;
}
export function mapPinUrl(family, options) { return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(mapPinSvg(family, options))}`; }
export function applePinOptions(mapkit, family) {
  return { url: { 1: mapPinUrl(family) }, size: new mapkit.Size(34, 46), anchorOffset: new mapkit.DOMPoint(0, -23) };
}
export function paintMapPin(g, family, selected = false) {
  const { color, path } = pinCategory(family);
  const shape = new Path2D(PIN_PATH);
  const rim = g.createLinearGradient(0, 0, 30, 46);
  rim.addColorStop(0, '#fff'); rim.addColorStop(.4, color); rim.addColorStop(1, '#fff');
  g.fillStyle = rim; g.fill(shape);
  if (selected) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke(shape); }
  g.save(); g.translate(2, 2); g.scale(.88, .9);
  const body = g.createRadialGradient(10, 7, 0, 17, 17, 30);
  body.addColorStop(0, color); body.addColorStop(.65, color); body.addColorStop(1, '#07121d');
  g.fillStyle = body; g.fill(shape); g.restore();
  g.save(); g.translate(8, 8); g.scale(.75, .75); g.fillStyle = '#fff'; g.fill(new Path2D(path), 'evenodd'); g.restore();
}
