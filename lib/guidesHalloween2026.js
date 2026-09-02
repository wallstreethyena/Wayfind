const ART = "/guides/orlando-halloween-food-2026";
const NOTE = "Wayfind editorial visualization; the serving and presentation may differ.";

function pick(name, image, blurb, tip, eyebrow, appQuery = null) {
  return { name, image: `${ART}/${image}.webp`, imageAlt: `${name}, photographed for Wayfind's Orlando Halloween food guide`, imageNote: NOTE, blurb, tip, eyebrow, appQuery, indoor: true };
}

export const HALLOWEEN_2026_GUIDES = {
  "orlando-halloween-food-2026": {
    teaser: "HHN 35 needs separate event admission, but Raglan Road at Disney Springs does not require a theme-park ticket.",
    region: "Orlando",
    cluster: "orlando-fall-2026",
    title: "Orlando Halloween Food 2026: HHN 35 and Disney Springs",
    description: "A verified 2026 guide to Orlando Halloween food at Universal Orlando's Halloween Horror Nights 35 and Raglan Road at Disney Springs, with locations, access rules, drinks and fall desserts.",
    keyword: "Orlando Halloween food 2026",
    relatedKeywords: ["Orlando Halloween food 2026", "Halloween Horror Nights food 2026", "HHN 35 food menu", "Disney Springs Halloween food", "Raglan Road Halloween menu", "fall food Orlando", "pumpkin spice Orlando"],
    updated: "2026-09-02",
    intro: "Orlando's 2026 Halloween food scene splits across two very different nights out. Halloween Horror Nights 35 runs on select nights from August 28 through November 1 inside Universal Studios Florida and requires separate event admission. Raglan Road Irish Pub & Restaurant is at Disney Springs, where no theme-park ticket is required and reservations are strongly recommended. This guide separates the locations, flags adult drinks, and uses only items we could verify for Orlando. Seasonal menus, ingredients and availability can change, so confirm before making a special trip.",
    picks: [
      pick("Jack & Odd Dog", "jack-odd-dog", "Universal's carnival-style footlong layers an all-beef hot dog with peppers, onions, cheese sauce and spicy cheese-puff crunch on a purple ube bun.", "Find it during Halloween Horror Nights 35 inside Universal Studios Florida; regular daytime park admission does not include the event.", "HHN 35 · Universal Studios Florida", "Universal Studios Florida"),
      pick("Deathbringer Tempura Shrimp", "deathbringer-tempura-shrimp", "A crispy shrimp-tempura roll finished with sriracha mayo and eel sauce—one of the savory, shareable bites on the HHN 35 event menu.", "Treat this as an event-night snack rather than a full dinner if you are balancing food booths with house wait times.", "HHN 35 · Universal Studios Florida"),
      pick("CarnEVIL Smash Tacos", "carn-evil-smash-tacos", "Smashed cheeseburger tacos with American cheese, shredded lettuce, pickles, secret sauce and sesame turn the smash-burger idea into handheld midway food.", "Two tacos make this easy to split, but the sauce and lettuce are best eaten immediately.", "HHN 35 · Universal Studios Florida"),
      pick("Death by Cheesestick", "death-by-cheesestick", "A giant hand-breaded mozzarella stick served with spicy marinara. It is deliberately oversized, crisp and built for the event's theatrical midway mood.", "Let it cool briefly before the first cheese pull, then eat it while the crust is still crisp.", "HHN 35 · Universal Studios Florida"),
      pick("Burnt Sando", "burnt-sando", "This sweet sandwich combines crisp brioche, pastry cream and a crackly burnt-sugar crust for a portable crème-brûlée effect.", "It is dessert-rich; sharing leaves room for another booth.", "HHN 35 · Universal Studios Florida"),
      pick("Rigatoni Ritual Pie", "rigatoni-ritual-pie", "At Louie's Italian Restaurant, garlic-butter cheese pizza is topped with baked rigatoni alla vodka, crispy sausage and pesto—a maximalist slice made for carb weather.", "Get it fresh: pasta-topped pizza loses its contrast as it sits.", "HHN 35 · Louie's Italian Restaurant", "Louie's Italian Restaurant"),
      pick("Elote with spicy cheese-puff crunch", "hot-cheetos-elote", "The HHN 35 elote offering dresses corn with a choice of classic cotija-and-Tajín flavor or a vivid spicy cheese-puff coating.", "Ask which finish is available at the booth; seasonal service can change during the run.", "HHN 35 · Universal Studios Florida"),
      pick("Meat Grinder Red Velvet", "meat-grinder-red-velvet", "A horror-prop dessert of ground red-velvet cake, cream-cheese icing, raspberry sauce and puffed-rice 'maggots.' The joke is gruesome; the flavors are familiar.", "Choose this when you want a photo-ready dessert without committing to another frozen drink.", "HHN 35 · Universal Studios Florida"),
      pick("Walking Taco", "fritos-walking-taco", "The event's walking taco piles picadillo beef, cheese sauce, lettuce and sour cream into a corn-chip bag. A vegan version is also listed with vegan chili and dairy-free toppings.", "It is one of the easier foods to carry between zones, but stop somewhere lit before digging to the bottom.", "HHN 35 · Universal Studios Florida"),
      pick("Jack and Oddfellow Shakes", "jack-oddfellow-shakes", "Two carnival-inspired frozen shakes lean into the orange-and-green visual language of HHN 35 and work as non-alcoholic dessert breaks.", "Frozen drinks melt quickly in late-summer Orlando; buy one when you can pause rather than before a long queue.", "HHN 35 · Universal Studios Florida"),
      pick("Ultimate Sin-Amon", "ultimate-sin-amon", "A 21-and-over cocktail built with cinnamon whiskey, lemon, apple, spiced brown sugar and red beet powder for a tart, warm-spice profile.", "Alcohol service requires valid identification; hydrate between sweet event cocktails.", "HHN 35 · 21+"),
      pick("Jack and Oddfellow Cocktail Cans", "jack-oddfellow-cans", "The 2026 canned lineup includes fruit-forward vodka spritzes and a carnival-themed sour ale, offering a faster alternative to mixed-drink lines.", "Check the label before buying: the flavor and alcohol base differ by can.", "HHN 35 · 21+"),
      pick("Frostbite", "frostbite", "Blanco tequila, blue curaçao, lime, simple syrup and spicy bitters make this an icy-looking cocktail with real heat, finished with gummy dentures.", "The spice is part of the recipe, not just the garnish; skip it if chile heat is not your thing.", "HHN 35 · 21+"),
      pick("Keyholder Bar: Frank's Fizz and Bleeding Eye", "keyholder-bar-drinks", "The HHN 35 Keyholder Bar serves exclusive cocktails including Frank's Fizz and Bleeding Eye, but access is limited to qualifying Universal Orlando hotel guests, annual passholders and Universal Rewards cardmembers.", "Eligibility does not replace Halloween Horror Nights admission—you still need the event ticket and should carry proof of qualification.", "HHN 35 · Restricted bar access"),
      pick("Twisted Tater Chips", "twisted-tater-chips", "A fan-favorite cone of thin, crisp potato chips seasoned with ranch-and-vinegar flavor: salty, tangy and practical for walking.", "Eat from the top and keep the cone upright; the best-seasoned pieces settle toward the bottom.", "HHN 35 · Universal Studios Florida"),
      pick("Fried Pickles", "fried-pickles", "Crisp fried pickle spears arrive with sriracha aioli, landing between bright acidity, crunch and creamy heat.", "Share them while hot; fried pickles soften faster than most midway snacks.", "HHN 35 · Universal Studios Florida"),
      pick("Booo! Pumpkin Cream Ale", "raglan-pumpkin-cream-ale", "Raglan Road's nitro pumpkin cream ale brings light beer together with pumpkin, cinnamon, nutmeg and vanilla notes for an autumn pint.", "This is an alcoholic seasonal pour; availability can change and valid identification is required.", "Disney Springs · Raglan Road · 21+", "Raglan Road Irish Pub"),
      pick("Raglan Ghostly Guinness Pie", "raglan-ghostly-guinness-pie", "A savory pie with braised beef, wild mushrooms and Guinness gravy, presented with a Halloween grin for a hearty fall dinner.", "Order it when you want the most traditionally pub-like main on the seasonal list.", "Disney Springs · Raglan Road"),
      pick("Samhain Sangria", "raglan-samhain-sangria", "A fruit-led seasonal sangria designed to balance sweetness and acidity rather than drink like a heavy dessert cocktail.", "Samhain is pronounced roughly 'sow-in'; this one is for guests 21 and older.", "Disney Springs · Raglan Road · 21+"),
      pick("Proper Little Pumpkin", "raglan-proper-little-pumpkin", "Raglan Road's signature cheesecake gets a pumpkin-spice twist and a petite pumpkin presentation over chocolate crumbs.", "A compact dessert is useful after the richer Guinness pie or whiskey-glazed ribs.", "Disney Springs · Raglan Road"),
      pick("Black Barrel Whiskey Ribs", "raglan-black-barrel-ribs", "A half rack of slow-cooked pork ribs is coated in Jameson Black Barrel whiskey glaze and served with Guinness glaze.", "This is a full entrée rather than a tasting bite; plan your other seasonal orders around it.", "Disney Springs · Raglan Road"),
      pick("Bandaged Bangers", "raglan-bandaged-bangers", "Mini sausages wrapped in golden pastry become edible mummies, served with a bright cherry-buffalo dipping sauce.", "The shareable format makes this a strong starter for a table ordering several Halloween specials.", "Disney Springs · Raglan Road"),
      pick("Irish Pumpkin Shake", "raglan-irish-pumpkin-shake", "The pub's signature Baileys shake is chilled with pumpkin spice and topped with creamy cinnamon cold foam.", "Because the shake contains Baileys, it is for guests 21 and older; ask the restaurant about alternatives for younger guests.", "Disney Springs · Raglan Road · 21+"),
    ],
    faq: [
      { q: "Where is the Halloween Horror Nights 35 food in Orlando?", a: "It is served during Halloween Horror Nights 35 inside Universal Studios Florida at Universal Orlando Resort. The event runs on select nights from August 28 through November 1, 2026, and requires separate event admission." },
      { q: "Is the Raglan Road Halloween menu inside a Disney theme park?", a: "No. Raglan Road Irish Pub & Restaurant is at Disney Springs, so a theme-park ticket is not required. Restaurant reservations are strongly recommended." },
      { q: "Are all 26 screenshot items in this Orlando guide?", a: "No. Wayfind included only items and locations that could be verified for Orlando. For example, the Pumpkin Spice Cold Boo was documented for Universal Studios Hollywood, so it is not presented here as an Orlando item." },
      { q: "Do seasonal Halloween menus stay the same all fall?", a: "Not necessarily. Dates, ingredients, booth locations and availability can change or sell out. Check the official event or restaurant menu on the day you visit." },
      { q: "Which Orlando Halloween food location does not require a park ticket?", a: "Raglan Road at Disney Springs does not require theme-park admission. Halloween Horror Nights food at Universal Studios Florida requires a separately ticketed event admission." },
    ],
    sources: [
      { label: "Universal Orlando Blog — Top Food and Merchandise at Halloween Horror Nights 2026", url: "https://blog.discoveruniversal.com/events/top-food-merch-at-halloween-horror-nights-2026-at-universal-studios-florida/" },
      { label: "Universal Orlando — Halloween Horror Nights", url: "https://www.universalorlando.com/hhn/en/us" },
      { label: "ThrillGeek — HHN 35 Food Guide", url: "https://thrillgeek.com/hhnfoodie" },
      { label: "LaughingPlace — Halloween Horror Nights 35 Food and Beverage", url: "https://www.laughingplace.com/parks/food-bev-hhn-35/" },
      { label: "Raglan Road — Official Site", url: "https://www.raglanroad.com/" },
      { label: "Disney Springs — Raglan Road", url: "https://www.disneysprings.com/dining/raglan-road-irish-pub-and-restaurant/" },
      { label: "MickeyBlog — Raglan Road Halloween Eats and Drinks", url: "https://mickeyblog.com/2026/09/01/grab-some-halloween-eats-drinks-at-raglan-road-in-disney-springs/" },
    ],
  },
};
