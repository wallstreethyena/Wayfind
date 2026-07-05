// Curated "unique finds": venues Google's prominence ranking structurally
// buries (small, new, niche, or outside the radius) that define the Wayfind
// wow. Zero passive cost: the rail renders from this static data and a gem
// only triggers one cached place lookup when tapped. Awards are seeded ONLY
// with entries verified against sources in-session (never from memory); the
// quarterly compile pipeline expands this table post-launch.

function normName(s) {
  return String(s || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

export const GEMS = [
  { key: "twentyphohour", name: "Twenty Pho Hour", area: "International Drive", cat: "food", note: "America's first 2D noodle bar \u2014 the room is a walk-in comic strip and the short-rib pho arrives with the bone standing out of the bowl. Go late; it runs to 2am.", award: { label: "MICHELIN Guide", year: 2026, source: "guide.michelin.com" } },
  { key: "domu", name: "Domu", area: "East End Market, Audubon Park", cat: "food", note: "Hand-made ramen and kimchi-butter wings, Netflix-featured and a four-time Bib Gourmand. No reservations \u2014 the line is part of it.", award: { label: "MICHELIN Bib Gourmand", year: 2025, source: "rosencentre.com" } },
  { key: "bayridgesushi", name: "Bayridge Sushi", area: "Kissimmee", cat: "food", note: "Brooklyn-rooted sushi 25 years deep, now in a showpiece room 3 miles from Disney. The $1 happy-hour menu and theatrical presentation are the draw." },
  { key: "helenamodernriviera", name: "Helena Modern Riviera", area: "Icon Park", cat: "nightout", note: "Riviera-meets-Bali room where brunch rolls into nightlife and the cocktails are theater. Go for the scene; the kitchen is not the star.", boost: 0 },
  { key: "ceiba", name: "Ceiba", area: "Conrad Orlando, Lake Buena Vista", cat: "food", note: "Rooftop contemporary Mexican with Disney fireworks over Evermore Bay and a serious agave list. Book ahead; dinner only, Wednesday through Sunday." },
  { key: "museumofillusions", name: "Museum of Illusions Orlando", area: "International Drive", cat: "things", note: "Interactive illusion rooms built for the camera \u2014 every exhibit is a photo op. An indoor hour that beats the heat." },
  { key: "matherssocialgathering", name: "Mathers Social Gathering", area: "Downtown", cat: "nightout", note: "Speakeasy hidden above a vintage furniture store \u2014 Prohibition cocktails in a room that feels borrowed from 1920." },
  { key: "cocktailsandscreams", name: "Cocktails & Screams", area: "Downtown", cat: "nightout", note: "Orlando's Halloween bar, 365 days a year. Camp-horror cocktails and decor that does the talking." },
  { key: "cafetututango", name: "Caf\u00e9 Tu Tu Tango", area: "International Drive", cat: "food", note: "Tapas inside a working artist's loft \u2014 live painting and performers while you eat, and the art on the walls is for sale." },
  { key: "theglassknife", name: "The Glass Knife", area: "Winter Park", cat: "food", note: "Jewel-box bakery where the desserts are the architecture. The case alone is the photo." },
  { key: "yellowdogeats", name: "Yellow Dog Eats", area: "Gotha", cat: "food", note: "Funky BBQ in an old general store with a VW bus out back. Order the Rufus: pulled pork, brie, raspberry." },
  { key: "pretzland", name: "Pretzland", area: "Kissimmee", cat: "food", note: "Tiny Kissimmee pretzel shop locals swear by \u2014 small-batch and easy to miss. Check hours before the drive." },
  { key: "yalahabakery", name: "Yalaha Bakery", area: "Yalaha", cat: "food", note: "Destination German bakery 45 minutes northwest \u2014 outside the app's normal radius, which is exactly why it never surfaces. Worth the drive for the strudel." },
  { key: "discoverycove", name: "Discovery Cove", area: "SeaWorld area", cat: "things", note: "All-inclusive swim day capped at a few thousand guests: snorkel a reef, float the lazy river, and with the upgrade, meet a dolphin. The opposite of a rides park \u2014 slow, warm, and worth the price as a reset day." },
  { key: "se7enbites", name: "Se7en Bites", area: "Milk District", cat: "food", note: "Southern comfort with a bakery soul \u2014 a Guy Fieri Triple D tournament champion where the 7th Trimester and Minnie Pearl earn the hype. Thursday through Sunday only, gone by 3pm.", award: { label: "MICHELIN Guide", year: 2026, source: "guide.michelin.com" } },
  { key: "henandhog", name: "The Hen & Hog", area: "Winter Park", cat: "food", note: "A classically trained chef doing Southern comfort in a tiny Winter Park storefront \u2014 the homemade mac and cheese and fried chicken are why locals whisper about it." },
  { key: "delidesires", name: "Deli Desires", area: "Mills 50", cat: "food", note: "Hidden takeout-window Jewish deli from a Michelin-trained chef \u2014 fresh bialys, corned beef Big Macs, candied orange lattes. The New York Times put it in 36 Hours in Orlando." },
  { key: "lakenonasculpturegarden", name: "Lake Nona Sculpture Garden", area: "Lake Nona", cat: "things", note: "50,000 square feet of world-class sculpture, free and open, next to Boxi Park. The futuristic side of Orlando." },
];

export function gemFor(name) {
  const n = normName(name);
  if (!n) return null;
  for (const g of GEMS) {
    const k = g.key;
    if (n === k) return g;
    if (k.length >= 4 && n.startsWith(k)) return g;
    if (n.length >= 8 && k.startsWith(n)) return g;
    if (k.length >= 8 && n.includes(k)) return g;
  }
  return null;
}
