// Boo's arrival lines. The first thing a visitor hears is a witty one liner for
// the Florida metro nearest to the center the home page stored (wf_center),
// never the exact location, only the metro name. Plain module on purpose: the
// companion imports it and scripts/check-boo-companion.mjs calls it directly.
// Rules: Halloween witty, at most 14 words, no dashes anywhere.

// [key, label, lat, lng] for the 12 Florida metros Wayfind serves.
export const METRO_POINTS = [
  ["tampa", "Tampa", 27.9506, -82.4572],
  ["stpete", "St Pete", 27.7676, -82.6403],
  ["sarasota", "Sarasota", 27.3364, -82.5307],
  ["bradenton", "Bradenton", 27.4989, -82.5748],
  ["orlando", "Orlando", 28.5384, -81.3789],
  ["miami", "Miami", 25.7617, -80.1918],
  ["fortlauderdale", "Fort Lauderdale", 26.1224, -80.1373],
  ["clearwater", "Clearwater", 27.9659, -82.8001],
  ["lakeland", "Lakeland", 28.0395, -81.9498],
  ["naples", "Naples", 26.142, -81.7948],
  ["fortmyers", "Fort Myers", 26.6406, -81.8723],
  ["jacksonville", "Jacksonville", 30.3322, -81.6557],
];

export const OPENERS_CITY = {
  tampa: "Tampa! Bold. Even the ghosts here demand a Cuban sandwich.",
  stpete: "St Pete? Sunshine City. I tan straight through the sheet.",
  sarasota: "Sarasota? Fancy. Even the ghosts here have boat shoes.",
  bradenton: "Bradenton! Floated up 40ft. Zero steps taken. Vacation achieved.",
  orlando: "Orlando! Mouse ears by day, screams by night. Respect the range.",
  miami: "Miami? I came for the haunts and stayed for the cafecito.",
  fortlauderdale: "Fort Lauderdale! Boats, beaches, and one very sunburnt ghost. Hi.",
  clearwater: "Clearwater! Sugar sand and spooky sunsets. I float here professionally.",
  lakeland: "Lakeland! Swan city. I am the other white bird with attitude.",
  naples: "Naples? Posh. Do ghosts here get valet or just float in?",
  fortmyers: "Fort Myers! Edison invented the light bulb. I just haunt them.",
  jacksonville: "Jacksonville! Big river, bigger screams. Welcome, mortal. Sea for yourself.",
};

export const OPENERS_GENERIC = [
  "Boo! Floated up 40ft. Zero steps taken. What are we haunting?",
  "I am Boo, your ghost guide. Ask me anything, I float fast.",
  "Welcome, mortal! Spooky season is short. Plans should not be.",
  "Florida has haunts, I have opinions. Sea for yourself?",
  "Don't ghost me! I know where the real screams are.",
  "New here? Perfect. I love fresh company. Kidding. Mostly.",
];

const R = 3958.8;
function miles(la1, lo1, la2, lo2) {
  const t = (d) => (d * Math.PI) / 180;
  const a = Math.sin(t(la2 - la1) / 2) ** 2 + Math.cos(t(la1)) * Math.cos(t(la2)) * Math.sin(t(lo2 - lo1) / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Nearest of the 12 metros within 45 miles, else null. Takes the raw
// localStorage string for wf_center ({lat,lng,...}) or an object.
export function metroFromCenter(raw) {
  let c = raw;
  try { if (typeof raw === "string") c = JSON.parse(raw); } catch { return null; }
  const lat = c && Number(c.lat), lng = c && Number(c.lng);
  if (!c || !isFinite(lat) || !isFinite(lng)) return null;
  let best = null, bestD = Infinity;
  for (const m of METRO_POINTS) {
    const d = miles(lat, lng, m[2], m[3]);
    if (d < bestD) { bestD = d; best = m[0]; }
  }
  return bestD <= 45 ? best : null;
}

export function openerFor(raw, seed = 0) {
  const key = metroFromCenter(raw);
  if (key && OPENERS_CITY[key]) return OPENERS_CITY[key];
  return OPENERS_GENERIC[Math.abs(Math.floor(seed)) % OPENERS_GENERIC.length];
}
