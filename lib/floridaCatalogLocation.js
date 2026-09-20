// Only covered destinations close enough to be useful may be selected automatically.
const CENTERS = [
  ['Orlando',28.5383,-81.3792], ['Tampa',27.9506,-82.4572],
  ['St. Petersburg',27.7676,-82.6403], ['Clearwater',27.9659,-82.8001],
  ['Sarasota',27.3364,-82.5307],
];
export function nearbyCatalogCity(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return '';
  const rad = n => n * Math.PI / 180;
  const distance = ([,a,b]) => {
    const h = Math.sin(rad(a-lat)/2)**2 + Math.cos(rad(lat))*Math.cos(rad(a))*Math.sin(rad(b-lng)/2)**2;
    return 3958.7613 * 2 * Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
  };
  const nearest = CENTERS.map(c=>({city:c[0],mi:distance(c)})).sort((a,b)=>a.mi-b.mi)[0];
  return nearest.mi <= 30 ? nearest.city : '';
}
export async function detectCatalogCity({ requestPermission = false } = {}) {
  // Reuse permission if granted; first visit uses the free coarse-location endpoint.
  let permission;
  try { permission = await navigator.permissions?.query({name:'geolocation'}); } catch {}
  if (navigator.geolocation && (requestPermission || permission?.state === 'granted')) {
    try {
      const position = await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{timeout:7000,maximumAge:300000}));
      return nearbyCatalogCity(position.coords.latitude,position.coords.longitude);
    } catch { /* Denied or unavailable: allow the coarse location fallback. */ }
  }
  try {
    const response = await fetch('/api/geo',{cache:'no-store',signal:AbortSignal.timeout(5000)});
    if (!response.ok) return '';
    const geo = await response.json();
    if (!geo.ok || !/,\s*FL$/i.test(geo.name || '')) return '';
    return nearbyCatalogCity(geo.lat,geo.lng);
  } catch { return ''; }
}
