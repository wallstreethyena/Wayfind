import { mapPinUrl } from './mapPinStandard.js';

// Real geographic coordinates, rendered as ordinary keyboard-operable buttons.
// This guide owns its numbered index; the pin art remains the sitewide standard.
export function createDisneyFoodMap({ mapkit, container, places, onSelect, className }) {
  for (const place of places) {
    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) throw new Error('Missing geographic location: ' + place.id);
  }
  const map = new mapkit.Map(container, { showsMapTypeControl: false, isRotationEnabled: false,
    mapType: 'mutedStandard', colorScheme: 'light', tintColor: '#284e3d' });
  const elements = new Map();
  let selectedId = null;
  const annotations = places.map((place, index) => {
    return new mapkit.Annotation(new mapkit.Coordinate(place.lat, place.lng), () => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = className;
      button.dataset.foodPin = place.id;
      button.setAttribute('aria-label', `${index + 1}. ${place.name}: ${place.city}`);
      button.setAttribute('aria-pressed', String(selectedId === place.id));
      button.title = `${index + 1}. ${place.name}`;
      const image = document.createElement('img');
      image.src = mapPinUrl('food');
      image.alt = '';
      image.width = 34;
      image.height = 46;
      image.draggable = false;
      const number = document.createElement('span');
      number.textContent = String(index + 1);
      number.setAttribute('aria-hidden', 'true');
      button.append(image, number);
      // MapKit's gesture handling must not swallow the guide's click. Native
      // button activation also covers Enter/Space, repeated taps and VoiceOver.
      const stop = event => event.stopPropagation();
      button.addEventListener('pointerdown', stop);
      button.addEventListener('mousedown', stop);
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        onSelect(place.id);
      });
      elements.set(place.id, button);
      return button;
    }, { title: place.name, calloutEnabled: false, animates: false });
  });
  const fit = () => { if (annotations.length) map.showItems(annotations, { animate: false, padding: new mapkit.Padding(85, 65, 70, 65) }); };
  map.addAnnotations(annotations);
  fit();
  return {
    fit,
    select(id) {
      selectedId = id;
      for (const [key, button] of elements) button.setAttribute('aria-pressed', String(key === id));
    },
    destroy() { elements.clear(); map.destroy(); },
  };
}

export function revealFoodDestination(id) {
  const destination = document.getElementById(id);
  if (!destination) return;
  destination.scrollIntoView({ block: "start" });
  // FoodStop is programmatically focusable, never added to the tab sequence.
  destination.focus({ preventScroll: true });
}

