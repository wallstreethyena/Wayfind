// v4.16 — SEO guide content. Server-rendered, indexable pages targeting the
// four affiliate keyword types (general "best of", branded comparison, review,
// trust-and-authority). Editorial rules match the app: honest picks, famous
// verifiable claims only, affiliate links disclosed. Each pick's bookQuery
// drives a Viator search link; hotel:true drives a Booking.com rate link.

// ⏳ SEASONAL (sunset 2026-08-30): the ten summer-2026 city guides live in
// their own module so removal is this import, the spread below, and the file.
import { SUMMER_2026_GUIDES } from "./guidesSummer2026.js";
import { GULF_COAST_2026_GUIDES } from "./guidesGulfCoast2026.js";

export const SITE_NAME = "Wayfind";

// v6.72 — TEASERS (open-loop, directive §2). One honest line per guide that the
// guide's own BODY resolves — Zeigarnik: an unresolved question above the fold
// carries a reader into the article. Every teaser is DERIVED FROM THAT GUIDE'S
// OWN TIPS and nothing else; scripts/check-guide-teasers.mjs proves the grounding
// by requiring each teaser's distinctive nouns to appear in the guide's own
// picks/tips/faq/intro, and fails on hype or manufactured urgency. A teaser that
// promises something the body does not deliver is a dark pattern, which is the one
// thing the directive rules out entirely.
export const GUIDES = {
  "swim-with-manatees-crystal-river": {
    teaser: "You reach the springs only by water, and the manatees crowd in when the Gulf turns cold, not in the warm summer.",
    region: "Crystal River",
    cluster: "nature-coast",
    title: "Swim With Manatees in Crystal River: The Complete Local Guide",
    description: "How and when to swim with wild manatees in Crystal River: Kings Bay and Three Sisters Springs, tours for swimmers and non-swimmers, the land boardwalk, and what to do in summer.",
    keyword: "swim with manatees crystal river",
    updated: "2026-08-07",
    intro: "Crystal River sits on Florida's Nature Coast about 90 minutes north of Tampa, and it is the only place in Florida where you can legally swim with wild manatees. When winter cold fronts arrive and the Gulf turns cold, hundreds of them crowd into the constant, warmer spring water of Kings Bay and Three Sisters Springs. Here is how to do it right, in the water or from the boardwalk, plus what the Nature Coast offers in the warm summer months, when the manatees thin out and the springs turn quiet.",
    picks: [
      { name: "Swim with the manatees in Kings Bay", indoor: false, appQuery: "Crystal River", blurb: "Crystal River is the only place in Florida where you can legally get in the water with wild manatees. The federal rule is passive observation: you float and let them come to you, with no touching, chasing, or splashing. Licensed guides supply the wetsuit and handle the rules, so a first-timer is covered.", tip: "Book the first departure on a weekday morning, when the water is calmest and the manatees are most active before the crowds arrive.", bookQuery: "Crystal River manatee swim tour" },
      { name: "Three Sisters Springs, from the water", indoor: false, appQuery: "Three Sisters Springs", blurb: "The postcard spring, a vivid blue bowl that fills with manatees on cold mornings. The catch: you can only reach it from the water, kayak or boat in from Kings Bay, because there is no way to walk in. That rule protects the spring banks from erosion.", tip: "On a hard winter cold front the springs can hit capacity early, so a guided paddle gets you there at first light.", bookQuery: "Three Sisters Springs kayak tour" },
      { name: "Three Sisters Springs boardwalk, stay dry", indoor: false, appQuery: "Three Sisters Springs", blurb: "For anyone who would rather not get in, the refuge has a land boardwalk that looks straight down into the same spring, reached by a trolley from downtown. It is ticketed and seasonal, and sections are periodically under construction, so buy online and check the status first.", tip: "Winter weekend mornings sell out; a weekday buys you the rail to yourself." },
      { name: "A manatee eco-cruise for non-swimmers", indoor: false, appQuery: null, blurb: "Not everyone wants to be in 68-degree water in January. Pontoon and eco-cruise operators keep you topside while still getting you to the manatees, which makes this the easy pick for young kids and grandparents.", tip: "Ask whether the boat has a clear viewing well before you book; it changes the trip for kids.", bookQuery: "Crystal River manatee boat tour" },
      { name: "Paddle Kings Bay by clear kayak", indoor: false, appQuery: null, blurb: "The spring runs of Kings Bay are calm, shallow, and clear, and a clear-bottom kayak turns the paddle into a moving window over the grass beds and the occasional manatee gliding beneath you.", tip: "Sunrise launches get the glassy water and the wildlife before the boat traffic wakes up.", bookQuery: "Crystal River clear kayak tour" },
      { name: "Homosassa Springs Wildlife State Park", indoor: false, appQuery: "Ellie Schiller Homosassa Springs Wildlife State Park", blurb: "Fifteen minutes south, this state-park refuge is the year-round answer: a spring-fed viewing setup with daily programs built around rehabbing manatees and a floating underwater observatory. It delivers a guaranteed sighting on the summer days when the wild springs are quiet.", tip: "It is the fallback that holds up when the season or the weather is against you." },
      { name: "The summer counterpart: bay scalloping", indoor: false, appQuery: null, blurb: "When the manatees thin out in the warm months, the area's summer tradition takes over: snorkeling the grass flats for bay scallops, roughly July into September. A guided scallop trip is the warm-weather reason to make the drive.", tip: "Scallop trips fill on summer weekends, so reserve before you set the date.", bookQuery: "Crystal River scalloping tour" },
    ],
    faq: [
      { q: "Can you really swim with manatees, and is it legal?", a: "Yes. Crystal River is the only place in Florida where you can legally swim with wild manatees, under federal passive-observation rules: you float and watch, with no touching or chasing. Licensed guides supply the gear and keep the encounter within the rules." },
      { q: "When is the best time to see manatees in Crystal River?", a: "The season runs November 15 through March 31, and the largest numbers gather from December to February, when Gulf temperatures drop and the manatees crowd into the warmer spring water. They are present year-round, but summer numbers are much smaller." },
      { q: "Can you see manatees without getting in the water?", a: "Yes. The Three Sisters Springs refuge has a land boardwalk, reached by trolley from downtown, for viewing from above, and Homosassa Springs Wildlife State Park offers year-round viewing of rehabbing manatees on dry land." },
    ],
  },
  "bioluminescence-kayak-tour-space-coast": {
    teaser: "The water only glows on a dark, moonless night, and what lights it up in summer is not what glows in winter.",
    region: "Cocoa Beach",
    cluster: "nature-coast",
    title: "Florida Bioluminescence Kayak Tours: The Space Coast Guide",
    description: "When and where to paddle Florida's glowing water on the Space Coast: summer dinoflagellates, winter comb jellies, clear kayaks on the Indian River Lagoon, and why a moonless night matters.",
    keyword: "florida bioluminescence kayak tour",
    updated: "2026-08-07",
    intro: "On a dark summer night the Indian River Lagoon behind the Space Coast lights up: every paddle stroke and darting fish trails electric blue. It is one of Florida's few genuinely once-you-see-it experiences, it changes with the season, and the darker the night the brighter it glows. Here is how to do it right, which months, which water, and why a clear kayak and a moonless sky make or break the trip.",
    picks: [
      { name: "A clear-kayak bioluminescence tour", indoor: false, appQuery: "Cocoa Beach", blurb: "The signature version: a see-through kayak over the lagoon so the glow surrounds you below as well as at the paddle, run by guides who launch from the Merritt Island and Cocoa Beach put-ins after dark.", tip: "Book a night with little or no moon; the glow reads far brighter in true darkness.", bookQuery: "Cocoa Beach bioluminescence clear kayak tour", viatorUrl: "https://www.viator.com/tours/Cocoa-Beach/Dinoflagellate-Bioluminescence-Kayak-Tour/d25319-65756P5" },
      { name: "Summer or winter: what actually glows", indoor: false, appQuery: null, blurb: "Two different shows share the same water. Roughly June through September it is dinoflagellates, a blue-green flash wherever the water is disturbed. Late fall through spring it is comb jellies, glowing orbs that pulse when they drift past your paddle.", tip: "Summer is the classic electric-water paddle; winter is the slower, jelly-lit one." },
      { name: "The dark water inside Merritt Island refuge", indoor: false, appQuery: "Merritt Island National Wildlife Refuge", blurb: "The least light-polluted water sits inside the wildlife refuge north of the Kennedy Space Center, which is exactly why the glow reads brightest there. It is also some of the calmest, shallowest paddling on the lagoon.", tip: "If a rocket launch lands on your night, the refuge gives you a dark-sky seat for both.", bookQuery: "Cocoa Beach bioluminescence kayak tour" },
      { name: "Come prepared for a warm, dark paddle", indoor: false, appQuery: null, blurb: "It is summer Florida on the water after sunset: bring bug spray, water shoes, and a dry bag, and expect to be warm and a little buggy. Guides keep every light off so your eyes fully dark-adapt, which is when the glow appears.", tip: "Leave the phone in the dry bag; cameras rarely capture it, and the screen wrecks your night vision and everyone else's." },
      { name: "Make it a Space Coast night", indoor: false, appQuery: "Kennedy Space Center Visitor Complex", blurb: "Pair the paddle with the rest of the Space Coast: the Kennedy Space Center, the Cocoa Beach Pier, and the refuge's wildlife drive fill the daylight hours before the water show starts.", tip: "Check the launch schedule; a night launch over glowing water is the rare Florida double feature." },
    ],
    faq: [
      { q: "What is the best time of year for bioluminescence in Florida?", a: "Summer, roughly June through September, is peak for the bright dinoflagellate glow that most people picture. Comb jellies take over from late fall into spring, a different and gentler show. Either way, the darker the night, the better." },
      { q: "Do I need a clear kayak?", a: "No, but it helps: a see-through hull lets you watch the glow move beneath you, not just off the paddle. Guided clear-kayak tours also handle the launch, the safety, and finding the darkest water." },
      { q: "Does the moon really matter?", a: "A lot. The glow is subtle, and bright moonlight washes it out. Book around the new moon and avoid the nights on either side of a full moon for the strongest show." },
    ],
  },
  "florida-scalloping-crystal-river-homosassa": {
    teaser: "The season runs only a few summer weeks, and the limit on what you can take home is enforced hard on the water.",
    region: "Crystal River",
    cluster: "nature-coast",
    title: "Florida Scalloping on the Nature Coast: Crystal River and Homosassa",
    description: "Summer bay scalloping in Crystal River, Homosassa and the Nature Coast: the season, the license, the bag limits, and how to snorkel the grass flats for your own dinner.",
    keyword: "florida scalloping crystal river",
    updated: "2026-08-07",
    intro: "For a few weeks each summer the Nature Coast fills its shallow grass flats with bay scallops, and anyone with a mask and a license can snorkel down and pick their own dinner off the sea floor. It is the region's warm-weather answer to the winter manatee season, it runs on a short calendar, and the rules are strict for good reason. Here is how to do it right: where, when, and what you are allowed to carry home.",
    picks: [
      { name: "A guided scallop trip from Crystal River or Homosassa", indoor: false, appQuery: "Crystal River", blurb: "The easy way in: a captain runs you to the productive flats, hands you a mask and a mesh bag, and already knows which grass beds are holding scallops that week. Best for anyone without their own boat.", tip: "Book early; summer weekend trips fill fast and the best captains sell out.", bookQuery: "Crystal River scalloping tour" },
      { name: "The season, and why you check the exact dates", indoor: false, appQuery: null, blurb: "The Citrus and Hernando zones, which cover Crystal River and Homosassa, run roughly July 1 to late September; Pasco is a shorter mid-summer window. Florida sets the exact dates by zone every year, so confirm before you drive.", tip: "Opening week is the most crowded and usually the most productive." },
      { name: "The license and the limits", indoor: false, appQuery: null, blurb: "You need a Florida saltwater fishing license, unless you are wading from shore with no boat, which a free shoreline license covers. Each person may take two gallons of whole scallops in the shell, and a boat is capped at ten gallons total.", tip: "The limits are enforced hard on the water; know them cold before you fill a bag." },
      { name: "How you actually catch them", indoor: false, appQuery: null, blurb: "You snorkel the warm, shallow grass flats and pick scallops off the bottom by hand or dip net, in a few feet of clear water. No spear, no dredge. They rest on the grass with their rows of blue eyes open.", tip: "Watch for the shells clapping shut as your shadow passes; that flash is how you spot them." },
      { name: "Off-season, swim with the manatees instead", indoor: false, appQuery: "Crystal River", blurb: "When scallop season closes, the same Crystal River water becomes the winter manatee capital, and it is the only place in Florida where you can legally swim with wild manatees. The Nature Coast gives you a reason to come in every season.", tip: "Cold fronts pack the springs with manatees; warm months belong to the scallops.", bookQuery: "Crystal River manatee swim tour" },
    ],
    faq: [
      { q: "When is scallop season in Crystal River and Homosassa?", a: "The Citrus and Hernando county zones run roughly July 1 through late September, with Pasco on a shorter window. The FWC sets the exact opening and closing dates by zone each year, so check the current dates before planning a trip." },
      { q: "Do I need a fishing license to go scalloping?", a: "Yes, a Florida saltwater fishing license, unless you are wading from shore with no vessel, which a no-cost shoreline license covers. A guided charter typically covers the license for you." },
      { q: "How many scallops can I keep?", a: "In the Crystal River and Homosassa zones, two gallons of whole scallops in the shell per person and ten gallons per boat. The limits are strictly enforced on the water." },
    ],
  },
  "weeki-wachee-kayak-mermaids-guide": {
    teaser: "The spring replaces the whole river every hour, but the paddle is capacity-capped, so you reserve weeks ahead or you do not go.",
    region: "Weeki Wachee",
    cluster: "nature-coast",
    title: "Weeki Wachee: Kayaking the Spring, the Mermaids, and Manatees",
    description: "How to do Weeki Wachee Springs State Park: the reservation-only kayak paddle down a crystal river, the live mermaid show, Buccaneer Bay, and when the manatees appear.",
    keyword: "weeki wachee kayak",
    updated: "2026-08-07",
    intro: "An hour north of Tampa, Weeki Wachee Springs pushes out so much clear water that it replaces the entire river roughly every hour, and you paddle it over white sand in water so transparent the kayak looks like it is floating on air. The park is also home to the live underwater mermaid show that has run since 1947 and a spring-fed water park. The catch: the paddle is reservation-only and capacity-capped, so the planning matters as much as the packing. Here is how to do the whole park right.",
    picks: [
      { name: "Paddle the Weeki Wachee River (reserve ahead)", indoor: false, appQuery: "Weeki Wachee Springs State Park", blurb: "The main event: a 2.8-mile paddle down a spring-clear river over white sand, shuttled back to the launch. The park caps launches at 280 people a day to protect the river, so it books out well ahead in summer.", tip: "Reserve your launch weeks ahead in season; walk-ups are routinely turned away once the cap is hit.", bookQuery: "Weeki Wachee kayak" },
      { name: "The live mermaid show", indoor: false, appQuery: "Weeki Wachee Springs State Park", blurb: "The 1947 underwater theater still runs: performers breathing from hidden air hoses inside the spring, on a first-come seating basis at set showtimes. It is the reason the park became a Florida landmark.", tip: "Seating is first-come; claim seats before the first show on a busy summer day." },
      { name: "Buccaneer Bay, the spring-fed water park", indoor: false, appQuery: "Weeki Wachee Springs State Park", blurb: "The only spring-fed water park in Florida: slides that drop you into 74-degree spring water and a sandy swimming beach, open in the summer season. Park admission covers it along with the mermaid show.", tip: "It is the built-in cool-down after the paddle; the spring water stays cold straight through August." },
      { name: "When the manatees come", indoor: false, appQuery: null, blurb: "West Indian manatees move into the warmer spring water in the cooler months and gather at Hospital Hole downstream, though the park's shortened paddle no longer reaches that far. Winter is the season to look for them here.", tip: "Summer is for the clear water and the slides; save the manatee hope for a winter cold snap." },
      { name: "The river rules that keep it this clear", indoor: false, appQuery: null, blurb: "A Springs Protection Zone keeps the river pristine: stay in your vessel, no beaching, anchoring, or grounding, and no alcohol or disposable containers. It is strict, and it is why the water still looks like glass.", tip: "Pack everything into a dry bag; loose disposable containers are not allowed on the water." },
    ],
    faq: [
      { q: "Do I need a reservation to kayak at Weeki Wachee?", a: "Yes. The state park caps launches at 280 people per day to protect the river, and even paddlers bringing their own kayak must reserve a launch time ahead. In summer it books out well in advance." },
      { q: "Can you see manatees at Weeki Wachee?", a: "Sometimes, mainly in the cooler months, when manatees move into the warm spring water and gather downstream at Hospital Hole. The park's current paddle route is shortened and does not reach that far, so a sighting is a bonus, not a guarantee." },
      { q: "What else is at Weeki Wachee Springs besides kayaking?", a: "The live underwater mermaid show that has run since 1947 and Buccaneer Bay, the only spring-fed water park in Florida, both covered by park admission. The mermaid show is first-come seating at set showtimes." },
    ],
  },
  "winter-park-scenic-boat-tour": {
    teaser: "The ticket window is cash or check only, and which side of the boat you sit on decides your canal photos.",
    region: "Orlando",
    title: "Winter Park Scenic Boat Tour: Is It Worth It? (Local's Review)",
    description: "Everything to know before the Winter Park Scenic Boat Tour: what you'll see, tickets, parking, the cash-only catch, and whether it earns your hour.",
    keyword: "winter park scenic boat tour",
    updated: "2026-07-07",
    intro: "Running continuously since 1938, the Winter Park Scenic Boat Tour is Orlando's oldest attraction and its least Orlando one: an hour gliding the Winter Park chain of lakes past mansions, moss canals, and rowing crews, narrated by drivers who've done it for decades. Short answer on worth it: yes, and here's how to do it right.",
    picks: [
      { name: "What the hour actually covers", indoor: false, appQuery: "Winter Park Scenic Boat Tour", blurb: "Three lakes and two hand-dug canals barely wider than the pontoon, with Spanish moss brushing overhead. The narration mixes mansion gossip, Rollins College history, and genuine old-Florida knowledge.", tip: "Left side of the boat gets the best canal shade and photo angles.", bookQuery: "Winter Park scenic boat tour" },
      { name: "Tickets, timing, and the cash catch", appQuery: "Winter Park Scenic Boat Tour", blurb: "Tours leave hourly from the Morse Boulevard dock; no reservations, first-come. The famous quirk: the ticket window is cash or check only, and the ATM walk will cost you your boat slot on busy days.", tip: "Weekday mornings walk right on; weekend afternoons can mean an hour wait." },
      { name: "Make it a Winter Park day", appQuery: "Winter Park, FL", blurb: "The dock sits two blocks off Park Avenue: Tiffany glass at the Morse Museum, lunch on the Avenue, and the boat tour makes the single best non-park day in Orlando.", tip: "SunRail from downtown stops three blocks from the dock, making this Orlando's easiest car-free outing." },
    ],
    faq: [
      { q: "How much does the Winter Park boat tour cost?", a: "Adult tickets run around $18 and children about $9, cash or check only at the dock window. Prices drift, so bring a cushion." },
      { q: "How long is the tour?", a: "One hour, narrated, departing hourly from 10am with the last tour at 4pm most days, weather permitting." },
      { q: "Do you see alligators?", a: "Occasionally, along with ospreys, herons, and the odd otter. It's a calm-water mansion-and-nature cruise, not a wildlife expedition; for gators, take an airboat instead." },
    ],
  },
  "siesta-key-drum-circle": {
    teaser: "The drums start at sunset, but a decent spot on a busy season Sunday means you arrive 90 minutes early.",
    region: "Sarasota",
    title: "Siesta Key Drum Circle: Times, Parking, and What to Expect",
    description: "The complete guide to Sarasota's Sunday sunset ritual: when the drum circle starts, where to park, what it's like, and the etiquette locals wish you knew.",
    keyword: "siesta key drum circle",
    updated: "2026-07-07",
    intro: "Every Sunday about two hours before sunset, a patch of Siesta Key's quartz sand turns into Florida's most reliable spontaneous festival: drummers, dancers, hoopers, and a few hundred strangers facing west. It's free, it's unorganized by design, and it's been happening for over two decades. Here's how to do it like you've been before.",
    picks: [
      { name: "When and exactly where", indoor: false, appQuery: "Siesta Key Beach", blurb: "Sundays year-round, starting roughly two hours before sunset and peaking as the sun drops. Walk south from the main Siesta Beach pavilion about 200 yards; follow the drums.", tip: "Check the sunset time for your date and arrive 90 minutes early for a decent spot on busy season Sundays." },
      { name: "Parking without the meltdown", blurb: "The free main lot fills by mid-afternoon on Sundays. The move is the free Siesta Key Breeze trolley, which runs the length of the island and drops at the beach entrance.", tip: "Park once in the Village, dinner after, trolley both ways." },
      { name: "The unwritten rules", blurb: "Anyone can drum, dance, or watch; the circle is participatory. What draws stink-eye: flash photography in people's faces, standing dead center, and leaving trash on the sand.", tip: "Bring a drum if you have one; nobody auditions." },
    ],
    faq: [
      { q: "Is the Siesta Key drum circle every Sunday?", a: "Yes, weekly on Sundays year-round, weather permitting, starting about two hours before sunset. Some holiday weeks draw bigger crowds and extra performers." },
      { q: "Is it family friendly?", a: "Before and through sunset, very; kids dance in the circle constantly. Later in the evening the vibe skews adult." },
      { q: "Does it cost anything?", a: "Nothing. It's an informal community gathering on a public beach; parking is the only cost if you miss the free lot." },
    ],
  },
  "pinecraft-sarasota-amish-village": {
    teaser: "Yoder's is closed Sundays, and the pie counter next door is the only way to skip the restaurant wait.",
    region: "Sarasota",
    title: "Pinecraft: Inside Sarasota's Amish Village (And Yoder's Famous Pie)",
    description: "Florida's most unexpected neighborhood: how Pinecraft became the Amish winter capital, what to eat at Yoder's and Der Dutchman, and how to visit respectfully.",
    keyword: "pinecraft sarasota",
    updated: "2026-07-07",
    intro: "Tucked off Bahia Vista Street sits a neighborhood where Amish and Mennonite snowbirds have wintered for a century: adult-sized tricycles instead of buggies, shuffleboard courts that fill at dusk, and restaurants whose pies have national reputations. Pinecraft is real, it's welcoming, and it's unlike anywhere else in Florida.",
    picks: [
      { name: "Yoder's Restaurant", indoor: true, blurb: "The anchor since 1975. Fried chicken, real mashed potatoes, and the peanut butter cream pie that draws the line out the door. Featured on national food TV and somehow still underrated.", tip: "Closed Sundays, cash-friendly, and the pie counter next door skips the restaurant wait." },
      { name: "Der Dutchman", indoor: true, blurb: "The bigger Amish kitchen up the street: broasted chicken, a bakery the size of a gift shop, and breakfast that ends any diet.", tip: "The bakery's cinnamon rolls sell out on winter weekends by late morning." },
      { name: "The village itself", indoor: false, blurb: "Walk Pinecraft Park at dusk in season and you'll find shuffleboard leagues, bocce, and tricycles parked twenty deep. Big Olaf's ice cream, founded by an Amish family, closes the evening properly.", tip: "Season peaks January through March, when the Pioneer Trails buses arrive from Ohio and Indiana weekly." },
      { name: "How to visit respectfully", appQuery: "Pinecraft, Sarasota", blurb: "This is a residential neighborhood, not an attraction. Photograph the place, not the people, without asking; dress modestly in the restaurants; and remember Sunday is genuinely quiet.", tip: "If you're respectful, conversation comes easy; residents are famously warm with visitors." },
    ],
    faq: [
      { q: "Is Pinecraft open to visitors?", a: "Yes. The restaurants, bakeries, and shops welcome everyone. It's a working neighborhood, so visit like a guest rather than a spectator." },
      { q: "When is the best time to visit Pinecraft?", a: "December through March, when the winter community is fully present and the park is lively at dusk. Summer is quiet with some businesses on reduced hours." },
      { q: "Do the Amish in Pinecraft use cars?", a: "Most travel to Sarasota by chartered bus and get around on adult tricycles and bikes, a Pinecraft signature. Rules relax somewhat in the winter community compared with northern settlements." },
    ],
  },
  "siesta-key-vs-lido-key": {
    teaser: "One of these has the better sand. The other has the quiet stretch locals keep to themselves.",
    region: "Sarasota",
    title: "Siesta Key vs Lido Key: Which Sarasota Beach Is Right for You?",
    description: "The honest comparison locals give visitors: sand, crowds, parking, food, and which key fits your kind of beach day.",
    keyword: "siesta key vs lido key",
    updated: "2026-07-07",
    intro: "Sarasota's two famous keys sit twenty minutes apart and deliver completely different days. Pick by what you want from the beach, not by which name you've heard more.",
    picks: [
      { name: "Siesta Key: the sand", indoor: false, blurb: "The 99% quartz sand is genuinely different, powder-cool even at noon, and the beach is vast. It's also the busy one: spring break energy, packed village bars, and a parking hunt after 10am.", tip: "The free lot fills early; ride the open-air Breeze trolley instead of circling." },
      { name: "Lido Key: the balance", indoor: false, blurb: "Softer crowds, easy parking, and St. Armands Circle's restaurants a five-minute walk from the sand. The sand is fine white, not quartz, and nobody sober complains.", tip: "North Lido is the quiet stretch locals keep to themselves." },
      { name: "The verdict", blurb: "First visit or beach-obsessed: Siesta, the sand earns the hassle once. Staying several days, dining well, or traveling with people who hate crowds: Lido wins the week.", tip: "Do Siesta's Sunday sunset drum circle regardless of where you base." },
    ],
    faq: [
      { q: "Which has better sunsets?", a: "Both face west and deliver; Siesta adds the drum circle on Sundays, Lido adds dinner at the Circle afterward." },
      { q: "Are either good for shelling?", a: "Neither compares to Venice Beach twenty minutes south, the shark tooth capital; bring a sifter there instead." },
    ],
  },
  "things-to-do-sarasota": {
    teaser: "The Ringling art museum is free on Mondays, and there is one spot in Myakka where the gators are close to a sure thing.",
    region: "Sarasota",
    title: "10 Best Things to Do in Sarasota Beyond the Beach",
    description: "The Ringling, Pinecraft's Amish village, kayaking with manatees: what fills a Sarasota trip when you're sandy enough.",
    keyword: "things to do in sarasota",
    updated: "2026-07-07",
    intro: "Sarasota calls itself Florida's Cultural Coast and, unusually for Florida marketing, the claim holds. Here's what earns your non-beach hours.",
    picks: [
      { name: "The Ringling", indoor: true, blurb: "John Ringling's 66-acre bayfront estate: a serious art museum, the Ca' d'Zan mansion, and the circus museum with the world's largest miniature circus.", tip: "Mondays the art museum is free; the grounds alone justify the trip.", bookQuery: "Ringling Museum" },
      { name: "Kayak Lido's mangrove tunnels", indoor: false, appQuery: "Ted Sperling Nature Park", blurb: "Paddle shaded tunnels where manatees and dolphins turn up regularly, minutes from downtown.", tip: "Morning glass-calm water beats afternoon wind.", bookQuery: "Sarasota mangrove kayak tour", viatorUrl: "https://www.viator.com/tours/Sarasota/Sarasota-Mangrove-Tunnel-Guided-Kayak-Adventure/d25738-68831P1" },
      { name: "Pinecraft", indoor: false, blurb: "A genuine Amish and Mennonite winter village inside the city, tricycles, shuffleboard, and Yoder's pie. One of Florida's most unexpected neighborhoods.", tip: "Yoder's is cash-friendly and closed Sundays." },
      { name: "Marie Selby Botanical Gardens", indoor: false, blurb: "Bayfront gardens with the world's best epiphyte collection, orchids and air plants in open air.", tip: "The banyan grove is the photo." },
      { name: "Mote Marine Laboratory", indoor: true, appQuery: "Mote SEA", blurb: "A working marine research lab with an aquarium attached; the shark tank and manatee rehab give it substance a tourist aquarium lacks.", tip: "Pair it with north Lido beach across the road.", bookQuery: "Mote Marine aquarium" },
      { name: "Sarasota Farmers Market", indoor: false, blurb: "Saturday mornings downtown since 1979, produce to live music; the town shows up." },
      // v5.36 picks 7–10 (owner-approved 2026-07-11). Same voice, real
      // operating places.
      { name: "Myakka River State Park", indoor: false, blurb: "One of Florida's oldest and largest state parks, twenty minutes east: a canopy walkway over the treetops, airboats on the Upper Lake, and more wild alligators than you'll count.", tip: "The weir near the south entrance is the reliable gator sighting when the lake boats aren't running.", bookQuery: "Myakka River State Park" },
      { name: "Sarasota Jungle Gardens", indoor: false, blurb: "Ten acres of old Florida running since 1939 — flamingos that eat from your hand, bird shows, and a mercifully un-modernized charm no new attraction can fake.", tip: "The flamingo feeding is the memory; buy the food cup on the way in.", bookQuery: "Sarasota Jungle Gardens" },
      { name: "Ride the Legacy Trail", indoor: false, appQuery: "The Legacy Trail", blurb: "A paved rail-trail rolling south from Sarasota toward Venice through parks and pine flatwoods. Locals commute-cruise it; visitors get the county without a windshield.", tip: "Rent at the Sarasota trailhead and turn around at Osprey Junction; the full run to Venice is a real ride.", bookQuery: "Legacy Trail Sarasota bike rental" },
      { name: "The Celery Fields", indoor: false, appQuery: "Celery Fields", blurb: "The county's birding mecca: boardwalks over restored wetlands where 200-plus species turn up, plus a climbable hill — a genuine rarity in flat Florida — with the best free view around.", tip: "Go at golden hour; the Audubon boardwalk on Palmer is where the spoonbills are." },
    ],
    faq: [
      { q: "Is Sarasota worth it without a car?", a: "Downtown, the bayfront, and Lido via trolley work car-free; the Ringling and Siesta realistically want wheels." },
      { q: "Best month to visit?", a: "April and May: post-snowbird, pre-summer humidity, water already warm." },
    ],
  },
  "best-cuban-sandwich-tampa": {
    teaser: "Three places in Tampa make a real one, and one phrase at the counter gets it pressed the way the city means it.",
    region: "Tampa",
    title: "The Best Cuban Sandwich in Tampa: Where the Original Still Lives",
    description: "Tampa invented the Cuban sandwich in Ybor City's cigar factories. Here's where to eat the real one, salami and all.",
    keyword: "best cuban sandwich tampa",
    updated: "2026-07-07",
    intro: "The Cuban sandwich was born in Tampa, built for Ybor City cigar workers, and the Tampa original includes Genoa salami, the Italian workers' contribution that Miami omits and Tampa defends with civic pride. These are the places that still do it justice.",
    picks: [
      { name: "Columbia Restaurant", indoor: true, blurb: "Florida's oldest restaurant, in Ybor since 1905, pressing Cubans on house-baked bread longer than almost anyone alive. The 1905 Salad alongside is mandatory.", tip: "Lunch at the original Ybor location, not the satellites, for the full room.", bookQuery: "Ybor City food tour" },
      { name: "La Segunda Central Bakery", indoor: true, blurb: "Baking Tampa's Cuban bread since 1915 with the palmetto leaf scored down each loaf; most great Cubans in town start here anyway, so go to the source.", tip: "Take a loaf to go; it doesn't survive the drive home uneaten." },
      { name: "West Tampa Sandwich Shop", indoor: true, blurb: "A no-frills counter that beat celebrity chefs in citywide Cuban contests; presidents have detoured here.", tip: "Cash, weekday mornings, order the Cuban with a cafe con leche." },
      { name: "The rules of a Tampa Cuban", appQuery: null, blurb: "Ham, mojo roast pork, Genoa salami, Swiss, pickles, mustard, on real Cuban bread, pressed. No mayo, no lettuce, no tomato, and anyone serving it cold owes Ybor an apology.", tip: "Order it 'pressed hard' if you like the crackle." },
    ],
    faq: [
      { q: "Tampa vs Miami Cuban: what's actually different?", a: "Salami. Tampa's original includes it from Ybor's Italian community; Miami's version drops it. Both cities are certain they're right; the sandwich was born in Tampa." },
      { q: "Is Ybor City safe to visit?", a: "The historic district is a daytime tourist staple and a lively nightlife strip; standard city awareness applies after dark." },
    ],
  },
  "st-armands-circle-restaurants": {
    teaser: "Sunset window tables go early on the Circle. Two of these six seat walk-ins the dining room cannot.",
    region: "Sarasota",
    cluster: "gulf-coast-food",
    title: "The 6 Best Restaurants on St. Armands Circle",
    description: "Where to actually eat on the Circle: the waterfront splurge, the locals' bistro, and the ice cream line worth joining.",
    keyword: "st armands circle restaurants",
    updated: "2026-07-07",
    intro: "St. Armands Circle has thirty-plus places to eat wrapped around one roundabout, which makes choosing feel random. It isn't. These six cover every kind of Circle evening, ranked by what each does best.",
    picks: [
      { name: "Columbia Restaurant", blurb: "The Sarasota outpost of Tampa's 1905 institution; the 1905 Salad tossed tableside and the Cuban bread travel perfectly across the bay.", tip: "The courtyard tables are the seat." },
      { name: "Café L'Europe", indoor: true, blurb: "The Circle's white-tablecloth anchor since 1973, continental classics done seriously; this is the anniversary table.", tip: "Bar dining takes walk-ins the dining room can't." },
      { name: "Shore", indoor: true, blurb: "Bright, modern, coastal; the grouper tacos and a rosé on the balcony is the platonic Lido lunch.", tip: "Sunset window tables go early; call ahead." },
      { name: "Crab & Fin", indoor: true, blurb: "The seafood splurge with the raw bar and live piano on the patio.", tip: "Stone crab in season is why you're here." },
      { name: "Kilwins", indoor: true, blurb: "Yes, the fudge chain, but the after-dinner waffle-cone stroll around the lit Circle is the actual Sarasota ritual.", tip: "One scoop; the cones are enormous." },
      { name: "Blue Dolphin Café", indoor: true, blurb: "The locals' breakfast counter hiding among the boutiques; beach-day fuel without resort pricing.", tip: "Before 9am on weekends beats the wait." },
    ],
    faq: [
      { q: "Is parking on the Circle bad?", a: "Free but competitive; the garage on Adams Drive and the side streets solve what the roundabout can't." },
      { q: "Dress code?", a: "Florida elegant: collars and sundresses at dinner, flip-flops forgiven everywhere before sunset." },
      { q: "What if I want brunch, or a date-night table that is not on the Circle?", a: "Use the Gulf Coast brunch and date night guide. It starts with Original Word of Mouth in Venice for morning and Ophelia's on the Bay for dinner, then a short rail of Atlas cards. On the Circle, Columbia is the one with a card." },
    ],
  },
  "best-restaurants-disney-springs": {
    teaser: "Reservations are gone weeks out. Three of these have a workaround the reservation page will not mention.",
    region: "Orlando",
    title: "The 7 Best Restaurants at Disney Springs, Ranked by a Local",
    description: "Where to actually eat at Disney Springs: the seven restaurants worth your reservation, what to order, and which tourist traps to skip.",
    keyword: "best restaurants disney springs",
    updated: "2026-07-07",
    intro: "Disney Springs has more than 60 places to eat, and most lists just copy the map. This one ranks the seven that earn a reservation, based on what each kitchen actually does best, when to go, and what to order. Every pick links into the Wayfind app for live hours, photos, and directions.",
    picks: [
      { name: "The Boathouse", indoor: true, blurb: "Steak and seafood on the water with the amphicar launch as dinner theater. The filet and the baked Alaska are the plays; ask for dock seating at sunset.", tip: "Walk-up bar seating is the locals' workaround when reservations are gone." },
      { name: "Morimoto Asia", indoor: true, blurb: "Iron Chef Masaharu Morimoto's pan-Asian flagship. The Peking duck for two is the signature and worth planning around.", tip: "Lunch menu carries several dinner items at lower prices." },
      { name: "Homecomin'", indoor: true, blurb: "Chef Art Smith's Florida comfort food. The fried chicken and doughnuts made this the Springs' hardest table; hummingbird cake to finish.", tip: "The bar pours moonshine cocktails without the dining wait." },
      { name: "Wine Bar George", indoor: true, blurb: "The only Master Sommelier-led wine bar in Florida, 140+ wines by the glass and ounce, and the frozen wine slushies are better than they have any right to be.", tip: "Go for the burger; it quietly competes with the wine." },
      { name: "Jaleo by José Andrés", indoor: true, blurb: "Spanish tapas from a legendary chef; the paella cooked over wood fire and the gin and tonics carry the menu.", tip: "Weekday lunch is the value window." },
      { name: "Gideon's Bakehouse", indoor: true, blurb: "The half-pound cookies with the cult line. The virtual queue opens in the morning and caps fast.", tip: "Join the virtual line before noon, then shop while you wait." },
      { name: "Chef Art Smith's take on brunch or T-REX for families", indoor: true, appQuery: "Homecomin Disney Springs", blurb: "If you're with kids who need spectacle, T-REX delivers animatronic dinosaurs and a menu built for them. Adults dining without kids should trade it for any pick above.", tip: "Ask for the Ice Cave room." },
    ],
    faq: [
      { q: "Do you need park tickets for Disney Springs?", a: "No. Disney Springs is free to enter, parking is free, and none of these restaurants require park admission." },
      { q: "How far ahead should you book?", a: "60 days for The Boathouse and Homecomin' on weekends; walk-ups are realistic on weekday afternoons." },
    ],
  },
  "best-hotels-near-magic-kingdom": {
    teaser: "At three of these resorts the room that costs less is the better room. You have to know which wing to ask for.",
    region: "Orlando",
    title: "Best Hotels Near Magic Kingdom for Families (2026 Guide)",
    description: "The hotels that actually shorten your Magic Kingdom mornings: monorail access, early entry, and the value plays most families miss.",
    keyword: "best hotels near magic kingdom",
    updated: "2026-07-07",
    intro: "Proximity to Magic Kingdom is measured in minutes-to-rope-drop, not miles. This guide ranks stays by how they get you to the gate: monorail, boat, walking path, or car, and flags where the value plays are for families who'd rather spend on the parks.",
    picks: [
      { name: "Disney's Contemporary Resort", indoor: true, blurb: "The only hotel you can walk to Magic Kingdom from, ten minutes gate to gate, with the monorail running through the lobby.", tip: "Garden wing rooms cost meaningfully less than the tower.", hotel: true },
      { name: "Disney's Polynesian Village Resort", indoor: true, blurb: "Monorail access, the best resort beach on Seven Seas Lagoon, and fireworks views from the sand with the soundtrack piped in.", tip: "Capt. Cook's quick service is a budget saver inside a deluxe resort.", hotel: true },
      { name: "Disney's Grand Floridian", indoor: true, blurb: "The flagship. Monorail plus a walking path to Magic Kingdom, afternoon tea, and the highest polish on property.", tip: "Outer building rooms beat main building on price.", hotel: true },
      { name: "Disney's Wilderness Lodge", indoor: true, blurb: "Boat to Magic Kingdom through pine forest; the lobby alone is an attraction. Usually the cheapest deluxe with direct water access.", tip: "Courtyard view rooms give the geyser show for less.", hotel: true },
      { name: "Disney's Fort Wilderness Cabins", indoor: true, blurb: "Full cabins with kitchens, boat access, and the campfire sing-along; the sleeper pick for families of five-plus.", tip: "The Hoop-Dee-Doo Revue here is Disney's longest-running show for a reason.", hotel: true },
      { name: "Four Seasons Orlando", indoor: true, blurb: "Off the monorail but the best pure hotel in the area, with a lazy river kids don't want to leave and adult luxury everywhere else.", tip: "Character breakfast here skips park crowds entirely.", hotel: true },
    ],
    faq: [
      { q: "Is staying on-site worth it for Magic Kingdom?", a: "For rope-drop families, usually yes: early theme park entry (30 minutes) plus transportation time saved compounds across a week." },
      { q: "What's the budget alternative?", a: "Good-neighbor hotels on Hotel Plaza Boulevard cost far less and sit minutes from the gates by car; you trade early entry for cash." },
    ],
  },
  "gatorland-vs-wild-florida": {
    teaser: "One has a zip line that sells out before admission does. The other is an airboat, and the hour you ride decides what you see.",
    region: "Orlando",
    title: "Gatorland vs Wild Florida: Which Orlando Gator Park Wins?",
    description: "A straight comparison of Orlando's two gator attractions: shows, airboats, price, drive time, and which one fits your day.",
    keyword: "gatorland vs wild florida",
    updated: "2026-07-07",
    intro: "Both parks deliver Florida's original theme: alligators, up close. They're built differently, and picking wrong wastes half a day. Here's the honest breakdown after considering what each does best.",
    picks: [
      { name: "Gatorland: the classic park", indoor: false, appQuery: "Gatorland", blurb: "The 'Alligator Capital of the World' since 1949. Stronger shows (Gator Jumparoo), a breeding marsh boardwalk with wild birds, the white leucistic gators, and a zip line over the alligator pens for the brave.", tip: "The Screamin' Gator zip line sells out; book it, not just admission.", viatorUrl: "https://www.viator.com/tours/Orlando/Gatorland-General-Admission-Ticket/d663-3458ENTRY" },
      { name: "Wild Florida: the airboat experience", indoor: false, appQuery: "Wild Florida Airboats", blurb: "Built around real airboat rides on Lake Cypress headwaters, wild gators in wild water, plus a compact gator park and drive-through safari. The airboat is the product; the park is the bonus.", tip: "Morning rides see more wildlife before boat traffic picks up.", bookQuery: "Wild Florida airboat", viatorUrl: "https://www.viator.com/tours/Orlando/Florida-Everglades-Airboat-Tour-and-Alligator-Encounter-with-Optional-Lunch/d663-5467OHEP" },
      { name: "The verdict", blurb: "Choose Gatorland for a fuller half-day park with better shows and shorter drive from the parks corridor. Choose Wild Florida if the airboat is the point, it's the better ride of the two, and you don't mind the longer drive south.", tip: "Doing both in one trip is overkill unless gators are the trip." },
    ],
    faq: [
      { q: "Which is closer to Disney?", a: "Gatorland, roughly 25 minutes from the parks corridor; Wild Florida runs 45 to 55 minutes south." },
      { q: "Are airboat rides safe for young kids?", a: "Both operators take young children with ear protection provided; infants are better suited to the parks than the boats." },
    ],
  },
  "things-to-do-orlando-not-theme-parks": {
    teaser: "Twelve of these, and one gets you Gideon's cookies without the Disney Springs line.",
    region: "Orlando",
    title: "12 Things to Do in Orlando That Aren't Theme Parks",
    description: "Airboats, springs, Winter Park, rocket launches: what locals actually do in Orlando when nobody's buying park tickets.",
    keyword: "things to do in orlando besides theme parks",
    updated: "2026-07-07",
    intro: "Orlando's best-kept secret is that locals rarely set foot in the parks. This is the non-park list worth building days around: real Florida nature, the elegant side of the city, and day trips that outdo any queue.",
    picks: [
      { name: "Airboat the Everglades headwaters", indoor: false, blurb: "Forty minutes from the parks, skimming marsh past wild gators and eagles. The single most Florida hour available to a visitor.", tip: "Sunset rides trade some wildlife for the best light.", bookQuery: "Orlando airboat tour", viatorUrl: "https://www.viator.com/tours/Orlando/Boggy-Creek-Airboat-Adventures-One-Hour-Airboat-Tour-near-Orlando-Florida/d663-5039P5" },
      { name: "Winter Park scenic boat tour", indoor: false, blurb: "A pontoon glide through chain-of-lakes mansions and moss canals, running since 1938. Pair it with Park Avenue lunch and the Morse Museum's Tiffany glass.", tip: "Cash or check only at the dock; it's part of the charm.", bookQuery: "Winter Park boat tour" },
      { name: "Kayak a natural spring", indoor: false, blurb: "Rock Springs at Kelly Park runs 68 degrees and crystal clear year-round; paddle it early before tubes fill the run.", tip: "County park capacity caps on weekends; arrive before 9am.", bookQuery: "Rock Springs kayak" },
      { name: "Watch a rocket launch", indoor: false, blurb: "Cape Canaveral is an hour east and launches are frequent now. Playalinda Beach and Titusville's waterfront give the clearest views.", tip: "Check the launch schedule the week of your trip and hold a flex morning." },
      { name: "Lake Eola and Thornton Park", indoor: false, blurb: "Downtown's swan boats, Sunday farmers market, and the city's best sunset walk, free.", tip: "Swan boats stop seating 45 minutes before close." },
      { name: "ICON Park's wheel at night", indoor: false, blurb: "The 400-foot observation wheel earns its ticket after dark when the parks corridor lights up.", tip: "Combo tickets with Madame Tussauds or SEA LIFE cut the per-attraction price.", bookQuery: "ICON Park wheel", viatorUrl: "https://www.viator.com/tours/Orlando/Orlando-Eye-Admission/d663-47668ORLEYE" },
      // v5.36 picks 7–12 (owner-approved 2026-07-11). Same voice, real
      // operating places.
      { name: "Kennedy Space Center Visitor Complex", indoor: true, blurb: "An hour east and the best full day in Central Florida that isn't a theme park: a real Saturn V, the shuttle Atlantis hanging mid-bank, and the bus out to the working launch pads.", tip: "Do the bus tour first — lines only grow — and save Atlantis for the afternoon.", bookQuery: "Kennedy Space Center tickets" },
      { name: "Blue Spring State Park in manatee season", months: [11, 12, 1, 2, 3], indoor: false, blurb: "November through March the spring run fills with hundreds of wild manatees escaping the cold St. Johns River — a boardwalk view of megafauna no aquarium can sell you.", tip: "Cold snaps bring the biggest counts; gates close by mid-morning on winter weekends.", bookQuery: "Blue Spring State Park" },
      { name: "Swim at Wekiwa Springs", indoor: false, blurb: "A 72-degree spring pool twenty minutes north of downtown, ringed by real Florida forest with canoes and kayaks for rent at the top of the run.", tip: "Summer weekends hit capacity before 10am; weekdays it's yours.", bookQuery: "Wekiwa Springs State Park" },
      { name: "Harry P. Leu Gardens", indoor: false, blurb: "Fifty acres of camellias, roses, and shaded lakefront paths minutes from downtown — the exhale Orlando doesn't advertise.", tip: "Camellia season peaks in the cooler months when everything else up north is grey.", bookQuery: "Leu Gardens Orlando" },
      { name: "Day-trip to Mount Dora", indoor: false, blurb: "A hilly (for Florida) lakefront town 45 minutes northwest: antique district, an inland lighthouse, and a downtown built for slow afternoons.", tip: "First Fridays and the fall festivals are the town at full wattage.", bookQuery: "Mount Dora" },
      { name: "East End Market", indoor: true, blurb: "Audubon Park's neighborhood food hall — a dozen local makers under one roof and the antidote to the I-Drive chain gauntlet.", tip: "Gideon's cookies here mean skipping the Disney Springs line for the same thing." },
    ],
    faq: [
      { q: "What's the best non-park day trip?", a: "Kennedy Space Center if a launch aligns; otherwise Winter Park for a slow day or the springs for an active one." },
      { q: "Is any of this doable without a car?", a: "Winter Park via SunRail and ICON Park via rideshare work car-free; airboats and springs realistically need wheels." },
    ],
  },
  // v5.04 — long-tail expansion, wave 1: the home-market topics with real
  // search volume that the big directories cover thinly. Editorial rules
  // unchanged: famous, verifiable claims only; no invented prices or hours.

  "sarasota-half-price-dining": {
    teaser: "Which certificate you buy is worth less than whether the restaurant is one you would have chosen anyway.",
    region: "Sarasota",
    title: "Sarasota Dinner at Half Price: Where the Certificates Actually Work",
    description: "Half-price dining certificates in Sarasota, and the free offers that need no certificate at all. What each one covers, and who should skip it.",
    keyword: "half price dining sarasota",
    updated: "2026-07-31",
    // The guide is ABOUT this registry offer, so it is the terminal. Read by id
    // from lib/coupons — never a URL written here.
    dealId: "cpn-clipp-fl-sarasota",
    // Registry ids only. The page resolves each against lib/coupons and drops
    // anything past its expiry, so this list cannot render a dead offer.
    dealCards: [
      "cpn-clipp-fl-sarasota",
      "cpn-geckos-happy-hour",
      "cpn-geckos-19th-hole",
      "cpn-geckos-bar-bingo-hillview",
      "cpn-pie-on-main-lunch",
    ],
    intro: "Prepaid restaurant certificates are the oldest trick in local dining and still the most misunderstood. The economics are simple — you buy a certificate for less than its face value and spend it like cash — and the catch is always in the conditions, not the discount. Here is what is actually live around Sarasota right now, certificate and otherwise.",
    picks: [
      { name: "Clipp half-price certificates", blurb: "The main event: prepaid certificates, typically $15 for $30 of food, at Sarasota-area restaurants. Inventory rotates weekly, which is the part worth planning around — the restaurant you want may not be listed today and may be listed on Friday. Buy on Clipp, redeem in the restaurant.", tip: "Check the list before you decide where to eat, not after. Choosing the restaurant first and hoping it is covered is how people end up eating somewhere they didn't want to." },
      { name: "Gecko's Grill & Pub", indoor: true, blurb: "Runs the most consistently useful free offers in the area, no certificate required. The Ultimate Happy Hour is daily 3–6pm: $1 off drafts, wells and wines, $5 off 750ml bottles, and $5 small plates. Local chain rather than a one-off, so the offer holds across locations.", tip: "The 19th Hole is the one people miss — a free well drink, domestic draft or house wine with any appetizer or entrée, if you bring a same-day golf scorecard." },
      { name: "Bar Bingo at Gecko's Hillview", indoor: true, blurb: "Mondays 7–9pm and free to play. Not a discount at all, which is the point of including it — a free Monday night out costs less than half price on a meal you were not going to buy.", tip: "Hillview location specifically, not the whole chain." },
      { name: "Pie On Main", indoor: true, blurb: "Weekday lunch special plus a sub of the day, on Main Street downtown. The most walkable of these if you are already in the city centre rather than driving out to Lakewood Ranch.", tip: "Weekdays only — the special does not run at weekends." },
    ],
    faq: [
      { q: "How do half-price dining certificates work?", a: "You buy a certificate in advance for less than its face value — typically $15 for $30 of food — and spend it at the restaurant like cash. The discount is real; the conditions vary by certificate, so read them before buying rather than at the table." },
      { q: "Which Sarasota restaurants are covered?", a: "Clipp's inventory rotates weekly, so the honest answer is that it changes. Check the current list before choosing where to eat — that ordering matters more than any single restaurant being on it." },
      { q: "Are there Sarasota dining deals that need no certificate?", a: "Yes, and some are better value. Gecko's runs a daily 3–6pm happy hour and a free-drink offer with a same-day golf scorecard, Bar Bingo at the Hillview location is free on Mondays, and Pie On Main runs a weekday lunch special." },
      { q: "Is a certificate worth it if I have to change restaurants?", a: "Usually not. A discount on a meal you didn't want is not a saving. The certificates are worth it when they cover somewhere you would have chosen anyway — otherwise the free offers above are the better play." },
    ],
  },
  "orlando-in-the-rain": {
    teaser: "Which of these you can reach without going outside is the only thing that matters in a storm.",
    region: "Orlando",
    title: "Orlando in the Rain: 9 Indoor Places That Aren't a Theme Park",
    description: "An afternoon storm just ate your plans. Nine Orlando places that are fully indoor, open in the rain, and don't need a park ticket.",
    keyword: "indoor things to do in orlando when it rains",
    updated: "2026-07-31",
    intro: "Central Florida summer storms arrive most afternoons, land hard, and are the reason half of Orlando's outdoor plans get abandoned around 3pm. Everything here is fully indoor — no outdoor queues, nothing that gets cancelled when the sky opens. Sorted by how long it will actually keep you dry.",
    picks: [
      { name: "SEA LIFE Orlando Aquarium", indoor: true, blurb: "The 360-degree ocean tunnel is the reason to come — you stand inside the tank while rays pass overhead. 4.4 stars across more than 13,000 reviews, the most-reviewed indoor attraction in the city. Skip it if you've been to a major coastal aquarium recently; this is a compact one, and the tunnel is the highlight rather than the standard.", tip: "It sits at ICON Park with Madame Tussauds and the wheel, and the combo ticket costs less than the three bought separately — worth it only if the rain is staying put.", bookQuery: "SEA LIFE Orlando Aquarium ticket", viatorUrl: "https://www.viator.com/tours/Orlando/SEA-LIFE-Orlando-Aquarium/d663-47668SEALIFE" },
      { name: "WonderWorks Orlando", indoor: true, blurb: "The upside-down building on International Drive, and the most reliable rainy-afternoon energy burn for restless kids — indoor and air-conditioned throughout. 4.3 from nearly 11,000 reviews. Worth knowing the ropes course, laser tag and the magic dinner show are separate add-ons, so the sticker price isn't the whole price.", tip: "If the kids still have energy, the ropes course is the part they'll talk about afterwards.", bookQuery: "WonderWorks Orlando ticket", viatorUrl: "https://www.viator.com/tours/Orlando/WonderWorks-Orlando/d663-3021WW" },
      { name: "Crayola Experience Orlando", indoor: true, blurb: "Sits inside The Florida Mall, which is the practical point in a storm: you park in the garage and never go outside again, with a food court and the rest of the mall as overflow if the rain outlasts the kids' patience. 4.4 from over 10,000 reviews. Some activities run on tokens.", tip: "Do Wrap It Up early — kids want to carry the crayon they named around for the rest of the visit. The Crayola store itself is free to walk into.", bookQuery: "Crayola Experience Orlando ticket", viatorUrl: "https://www.viator.com/tours/Orlando/Crayola-Experience-Orlando/d663-6932P2" },
      { name: "Museum of Illusions Orlando", indoor: true, blurb: "A compact, photo-driven hour rather than a half-day, 4.4 across roughly 3,500 reviews. Right size for a storm that's forecast to pass, wrong choice if you need to fill an entirely washed-out afternoon.", tip: "Best paired with something else on this list rather than treated as the whole plan.", bookQuery: "Museum of Illusions Orlando ticket" },
      { name: "Madame Tussauds Orlando", indoor: true, blurb: "Also at ICON Park, and the highest-rated of the I-Drive indoor cluster at 4.6. It's built entirely around the photograph — if nobody in your group wants pictures with wax celebrities, this is the one to skip without guilt.", tip: "Same ICON Park bundle logic as SEA LIFE: three tickets separately costs noticeably more.", bookQuery: "Madame Tussauds Orlando ticket", viatorUrl: "https://www.viator.com/tours/Orlando/Madame-Tussauds-Orlando/d663-47668MADAME" },
      { name: "Orlando Science Center", indoor: true, blurb: "Four floors in Loch Haven Park, 4.6 from more than 7,500 reviews, and the best value here for a genuinely long rainy day. The on-site parking garage matters more than it sounds when you're arriving in a downpour.", tip: "The Crosby Observatory opens for public viewing on select Saturday nights — check first, because the rooftop telescope is the one thing here you can't get at a mall science stop, and it needs clear sky.", bookQuery: "Orlando Science Center" },
      { name: "The Great Escape Room Orlando", indoor: true, blurb: "A straight 5.0 across more than 4,700 reviews, which is the most unusual number on this page — nothing else in Orlando's indoor set holds a perfect average at that volume. Books by time slot, so it works when you know roughly how long the rain has left.", tip: "Time-slotted rather than walk-in: check availability before you drive over.", bookQuery: "Orlando escape room" },
      { name: "Orange County Regional History Center", indoor: true, blurb: "Downtown, 4.7 from about 1,000 reviews, and the quietest room on this list. This is the adult option — if your group is mostly children, everything above will land better.", tip: "Downtown parking is garage-based, which is the point when it's raining.", bookQuery: "Orange County Regional History Center" },
      { name: "Arcade Monsters International Drive", indoor: true, blurb: "4.8 across roughly 3,000 reviews, and the cheapest way here to turn a washed-out hour into a good one. No timed ticket, no reservation — useful precisely when the storm wasn't in the plan.", tip: "Walk-in, so it's the fallback when everything else needs a booking you didn't make.", bookQuery: "Arcade Monsters Orlando" }
    ],
    faq: [
      { q: "How long do Orlando's afternoon storms last?", a: "Central Florida summer storms are typically short and heavy rather than all-day. Pick by duration: the Science Center or Crayola for a long washout, Museum of Illusions or Arcade Monsters for an hour." },
      { q: "Which of these can I reach without going outside?", a: "Crayola Experience is inside The Florida Mall and the Orlando Science Center has its own parking garage, so both work garage-to-door. SEA LIFE and Madame Tussauds sit together at ICON Park, but moving between them means a short walk outdoors." },
      { q: "Do I need to book ahead?", a: "SEA LIFE and Madame Tussauds use timed tickets, and escape rooms book by slot. WonderWorks, Crayola and Arcade Monsters are walk-in friendly, which is what you want when the rain wasn't forecast." },
      { q: "What if the rain stops?", a: "Our list of things to do in Orlando that aren't theme parks is the outdoor version of this page — springs, airboats and Winter Park, none of which appear here because none of them work wet." }
    ]
  },
  // v8.21 — THE BIRTHDAY FREEBIES GUIDE (owner brief, 2026-08-19). Every
  // offer below was verified against the BRAND'S OWN rewards/terms page on
  // 2026-08-19 — not blogs, not coupon roundups — and each blurb states the
  // honest classification in plain words: free with no purchase, free with a
  // purchase, or gated behind a loyalty tier. Two corrections the roundup
  // blogs still get wrong, stated in the FAQ so readers trust the page: Red
  // Robin discontinued its birthday burger on 2026-06-01, and Dairy Queen
  // promises only a "birthday surprise", not a specific free item. Krispy
  // Kreme is absent because there is no location within a reasonable drive
  // of Bradenton, and Red Robin because the offer is gone AND the nearest
  // location is out of the area. Every pick is a REAL nearby location by
  // placeId. Firehouse's current offer could not be verified on their public
  // site (app-only) — the blurb says exactly that.
  "birthday-freebies-bradenton-sarasota": {
    teaser: "The free popcorn is good for a month; the free scoop is good for your birthday only — the route works when the day-only offers anchor it.",
    region: "Bradenton",
    title: "23 Birthday Freebies in Bradenton & Sarasota: Free Treats Worth Signing Up For",
    description: "The birthday rewards that are actually free near Bradenton and Sarasota — verified against each brand's own terms: Starbucks, Sephora, AMC popcorn, a free Bundtlet, Chick-fil-A tiers, and what to skip.",
    keyword: "birthday freebies bradenton sarasota",
    updated: "2026-08-19",
    intro: "Chain birthday rewards are real money if you play them right — a handcrafted Starbucks drink, a Sephora gift set, a month of free AMC popcorn — and mostly noise if you don't, because half the offers need a sign-up weeks in advance, some need a purchase, and a few famous ones quietly ended this year. We verified every offer on this page against the brand's own rewards terms (last verified August 19, 2026), matched each one to a real location near Bradenton and Sarasota, and labeled every reward honestly: free with no purchase, free with a purchase, or gated behind a loyalty tier. The one rule that matters: sign up 30–45 days before your birthday, because the best programs check how early you joined — then plan the birthday-month offers around the ones that are good for a single day. Offers and participation change; confirm in each brand's app before you drive over.",
    picks: [
      { name: "Starbucks: a free handcrafted drink — if you set it up early", indoor: true, appQuery: "Starbucks Bradenton", placeId: "ChIJCTw8qAE9w4gRV4bsIMbQ2H8", blurb: "The highest-value coffee freebie going: Starbucks Rewards gives you one complimentary handcrafted beverage OR a food item OR a bottled drink. The catch is all setup: their terms require joining at least seven days before your birthday AND making at least one Star-earning purchase beforehand. At the entry tier the reward is valid on your birthday only; higher tiers get a longer window.", tip: "Join a month out, buy one coffee through the app to log the Star-earning purchase, and spend the reward on the most expensive handcrafted drink you actually want — it's the same one reward either way." },
      { name: "Sephora at UTC: a free beauty gift set, all month", indoor: true, appQuery: "Sephora University Town Center Sarasota", placeId: "ChIJVcT9hOc4w4gREnfUoBV42RA", blurb: "Beauty Insider members pick a free mini gift set any time during their birthday month — in store at the Mall at UTC, no minimum stated. Redeeming online is different: Sephora's own page says spend $25+ to claim it with an order. Sets rotate and run while supplies last, so early in the month beats late.", tip: "Walk in, redeem at the register with your account phone number, and buy nothing. That's the whole move." },
      { name: "AMC Bradenton 20: free large popcorn on the house", indoor: true, appQuery: "AMC Bradenton 20", placeId: "ChIJ1wH4N3QWw4gREDvfx8VmUSY", blurb: "AMC Stubs Insider — the free tier — gives you a free large popcorn for your birthday, and paid tiers add a large fountain drink. A large popcorn is the single most expensive snack in the building, which makes this the best pure freebie on the list. Enter your date of birth in your Stubs account well ahead and check the app for your reward's exact window.", tip: "Pair it with a matinee ticket you were buying anyway — the popcorn reward stacks on any showtime." },
      { name: "Nothing Bundt Cakes: a free Bundtlet, no purchase", indoor: true, appQuery: "Nothing Bundt Cakes Sarasota", placeId: "ChIJ2RTKm1tHw4gRK4xtJw-jqWI", blurb: "The simplest offer on this page: join Bundtastic Rewards and the birthday reward is a free Bundtlet — a personal-size frosted bundt cake — with no purchase requirement stated in the program terms. It's the rare freebie that's an actual dessert, not a discount wearing a costume.", tip: "The chocolate chocolate chip travels best in a Florida car. Eat the lemon one in the parking lot." },
      { name: "Baskin-Robbins: a free scoop, on the day itself", indoor: true, appQuery: "Baskin-Robbins Bradenton", placeId: "ChIJ16W70NY9w4gRG9cBamnCpn0", blurb: "The BR app drops your birthday coupon into your account on your birthday — their FAQ says to redeem it on your special day, so this is a day-of stop, not a month-long one. Baskin's own fine print also notes not every shop participates, which is worth one phone call before you drive.", tip: "This is the 'birthday-day only' anchor of the route — schedule everything month-long around it." },
      { name: "Chick-fil-A: the reward grows with your tier", indoor: true, appQuery: "Chick-fil-A Bradenton", placeId: "ChIJ_1KKw-oXw4gRGao51ByvSIc", blurb: "Chick-fil-A One scales the birthday gift by membership tier: entry members choose a chocolate chunk cookie or fudge brownie, Silver unlocks a dessert-variety reward including milkshakes, Red members get a sandwich or nuggets, and Signature members choose any entrée. All free — the tier just decides how big free is.", tip: "If you're close to the next tier in the weeks before your birthday, a couple of app orders can upgrade your gift from a cookie to an entrée." },
      { name: "The Cheesecake Factory at UTC: free slice with any purchase", indoor: true, appQuery: "The Cheesecake Factory Sarasota", placeId: "ChIJZ0W_vt04w4gRlbOczIeB2k0", blurb: "Cheesecake Rewards gives you a free slice of any cheesecake or layer cake for your birthday with any purchase — their words. A coffee counts. Given a slice runs about ten dollars, buying an iced tea to unlock one is still the best dessert math in the mall.", tip: "Order the slice to go if the wait is long — the reward works at the bakery counter without a table." },
      { name: "Crumbl: a free cookie — but only at Silver status", indoor: true, appQuery: "Crumbl Lakewood Ranch", placeId: "ChIJ_5OG3Z45w4gRbGmfLDXwT6A", blurb: "Crumbl's birthday voucher is real — a free single cookie on your birthday — but their loyalty page gates it behind Silver status, which unlocks at 500 Crumbs earned in the year. If you're an occasional Crumbl person, you likely won't qualify; if you're a regular, it's automatic.", tip: "Check your Crumbs balance a month out. Under 500, treat this as a skip rather than a plan." },
      { name: "IHOP: free birthday pancakes", indoor: true, appQuery: "IHOP Bradenton", placeId: "ChIJ6yU9i-IVw4gRo01we-1UEZU", blurb: "The International Bank of Pancakes lists free birthday pancakes as a member perk, no purchase requirement stated. It's the classic sit-down birthday breakfast freebie, and the 26th Street Bradenton location is the closest of the two in the area.", tip: "Make it the morning stop on a birthday-freebie day: pancakes here, then the month-window offers after." },
      { name: "Panera: a birthday treat from MyPanera", indoor: true, appQuery: "Panera Bread Bradenton", placeId: "ChIJz80-WhEWw4gRzOuwAzFVxag", blurb: "MyPanera celebrates your birthday with a reward — Panera's own FAQ keeps the exact item vague, and in practice it's typically a bakery treat. Honest label: a real freebie whose exact contents vary, so check the app for what lands in your account.", tip: "Panera rewards generally expire fast once issued — redeem it the same week it appears." },
      { name: "Ulta Beauty: birthday gift plus double points — with a purchase", indoor: true, appQuery: "Ulta Beauty Bradenton", placeId: "ChIJmyxjyZgXw4gRB3WmGve_TxY", blurb: "Ulta Beauty Rewards gives members a rotating birthday gift and 2x points all birthday month — but read the terms: online redemption requires a purchase, you must have your birthdate in your profile AND be opted in to marketing before your birthday month, and Platinum/Diamond members get an extra $10 off. Label it honestly: free with a purchase.", tip: "Flip the marketing opt-in on when you join, or the gift never triggers — that's the requirement people miss." },
      { name: "Dairy Queen: a birthday 'surprise' — don't count the Blizzard yet", indoor: true, appQuery: "Dairy Queen Bradenton", placeId: "ChIJQd5TVAgWw4gRtK1Eo_WdA9U", blurb: "DQ's rewards page promises exactly one thing: 'a birthday surprise' in the app. Blogs love to print 'free Blizzard'; the brand doesn't. Some years it's a BOGO, some a discount. Join the app, see what lands, and treat anything free as a bonus rather than a plan.", tip: "The 14th Street W location is a classic walk-up Treat stand — if the surprise is a BOGO, that's a two-person stop anyway." },
      { name: "Firehouse Subs: a birthday reward we couldn't fully verify", indoor: true, appQuery: "Firehouse Subs Bradenton", placeId: "ChIJ2SaIlRsWw4gRzGAwvP0eDaE", blurb: "Firehouse Rewards is widely reported to give a birthday sub — historically a free medium with a small purchase — but their public site wouldn't confirm the current terms when we checked, so we won't print a promise the brand doesn't. The app is the source of truth: join, and the birthday reward that appears in your account is the real offer.", tip: "Their rewards live entirely in the app — check it the week of your birthday rather than trusting any list, including this one." },
          // v8.23 (owner: "Anymore free birthday goodies? Give me 10 more places").
      // Same doctrine as the first 13: every claim below was read on the
      // brand's OWN rewards terms (verified 2026-08-19); where the brand does
      // not state the item, we say so rather than promising one. Each pick is
      // matched to a real location near Bradenton by place id.
      { name: "Auntie Anne's at Ellenton Premium Outlets: a free pretzel, no purchase", indoor: true, appQuery: "Auntie Anne's Ellenton", placeId: "ChIJHaxvqjIjw4gRAr21gNtVWBw", blurb: "Pretzel Perks gives you a free pretzel reward for your birthday with no purchase required — it lands in your birthday month and their terms give you a 30-day window to use it, which makes it one of the easiest anchors on this list.", tip: "It's inside the Ellenton outlets, so stack it with a shopping run — the reward sits in the app, no coupon to print." },
      { name: "Culver's: a free Create Your Own Dish — twice a year", indoor: true, appQuery: "Culver's Bradenton", placeId: "ChIJyUVHMkMRw4gRWxSSGDprdYQ", blurb: "MyCulver's is the sleeper of the list: a free single Create Your Own Dish with two toppings in your birthday month — and their terms grant the same reward again in your HALF-birthday month. Two free frozen custards a year from one sign-up.", tip: "Mark the half-birthday month in your calendar; almost nobody uses the second one." },
      { name: "Chili's: a free dessert that expires fast", indoor: true, appQuery: "Chili's Bradenton", placeId: "ChIJObBe1x8Ww4gRZocRz7u1X2g", blurb: "My Chili's Rewards issues a free birthday dessert — but unlike the month-long offers here, their terms expire it 10 days after it's issued. It's real and it's free; it's just the one you can't sit on.", tip: "Plan the visit inside the first week — this is the tightest window on this page." },
      { name: "Duck Donuts: a free donut for keeping the app warm", indoor: true, appQuery: "Duck Donuts Bradenton", placeId: "ChIJbQc50hEWw4gRekS45lcFEFU", blurb: "A free donut in your birthday month — with one catch their terms spell out: the account has to have been active in the past 365 days. A single order any time in the year before your birthday keeps the reward alive at the 4.7-star 14th Street shop.", tip: "If you signed up and never ordered, buy one donut a few weeks out to re-qualify the account." },
      { name: "Jersey Mike's: 72 Shore Points — with a purchase gate", indoor: true, appQuery: "Jersey Mike's Bradenton", placeId: "ChIJafhu4hYWw4gRyNie7mo17V4", blurb: "MyMike's credits your account 72 Shore Points for your birthday — enough for a free regular sub. The honest catch, straight from their terms: it requires having bought a regular or giant sub in the prior 12 months. The old 'free sub and drink' birthday promise you'll see on round-up sites is no longer what the program states.", tip: "One sub any time in the year before your birthday keeps the 72 points coming." },
      { name: "Moe's: the birthday burrito", indoor: true, appQuery: "Moe's Southwest Grill Bradenton", placeId: "ChIJiVUwo8Y9w4gRyfRSxgrLTps", blurb: "Moe Rewards drops a birthday burrito reward into the app — a full entrée rather than a side or dessert, which puts it near the top of this list on pure dollar value.", tip: "Check the app on the day: the reward appears in your account, and stacking it with free chips-and-salsa makes it a real meal." },
      { name: "Olive Garden: free dessert at the table", indoor: true, appQuery: "Olive Garden Bradenton", placeId: "ChIJ82ZQGhEWw4gRyW9_GZld-8I", blurb: "Tell them it's your birthday when you dine and dessert is on the house — this one is tied to eating in rather than an app, which makes it the easiest of the sit-down offers to actually claim.", tip: "It pairs with the never-ending breadsticks anyway; mention the birthday when you're seated, not at the check." },
      { name: "Smoothie King: $2 off — free only at the top tier", indoor: true, appQuery: "Smoothie King Bradenton", placeId: "ChIJ3TqagqwXw4gRSzSibPN094s", blurb: "Healthy Rewards' standard birthday offer is $2 off a smoothie — a discount, not a freebie. The fully free birthday smoothie exists, but their terms reserve it for the Champion loyalty tier. We list it because the $2 is real and automatic; just don't drive over expecting free.", tip: "If you're already a heavy Smoothie King user, check your tier in the app — Champions do get the free one." },
      { name: "Cold Stone: a two-week birthday window", indoor: true, appQuery: "Cold Stone Creamery Bradenton", placeId: "ChIJpR7FkLoWw4gRGsi3ogvZxw4", blurb: "My Cold Stone Club issues a birthday reward valid from 7 days before your birthday to 7 days after — a generous two-week window. Their terms don't pin down the exact item, so we won't promise the specific creation; the app shows what yours is.", tip: "The Cortez Road shop is minutes from the beaches — the two-week window means it can wait for a beach day." },
      { name: "First Watch: a birthday treat with brunch", indoor: true, appQuery: "First Watch Bradenton", placeId: "ChIJYfzA4SUlw4gRnPt72baj7pU", blurb: "First Watch's rewards program includes a birthday treat for members. The brand doesn't state the exact item in its public terms, so neither will we — members report it in the app around their birthday, and it rides along with the best daytime-only brunch room on this side of town.", tip: "They close at 2:30pm — this is a birthday breakfast play, not a dinner one." },
    ],
    faq: [
      { q: "Do you need to buy something to get birthday freebies?", a: "Depends on the brand, and the difference is the whole game. No purchase needed: AMC's popcorn, Sephora's in-store gift set, Nothing Bundt Cakes' Bundtlet, Baskin-Robbins' scoop, IHOP's pancakes, Chick-fil-A's tier gift. Purchase required: Cheesecake Factory's slice (any purchase), Ulta's gift online, Sephora online ($25). Tier or activity gated: Starbucks (a prior Star-earning purchase), Crumbl (Silver status)." },
      { q: "How early should you sign up for birthday rewards?", a: "Thirty to forty-five days before your birthday covers everything on this page. The hard floor is Starbucks: their terms require joining at least seven days ahead plus a Star-earning purchase before the day. Ulta requires your birthdate and a marketing opt-in before your birthday month starts, and AMC wants your date of birth in your Stubs account well in advance." },
      { q: "Can you get birthday freebies all month?", a: "Some, not all. Sephora and Ulta are birthday-month offers, and AMC's popcorn reward carries a window. Baskin-Robbins is explicitly your birthday only, and Starbucks' entry tier is birthday-day only too. Plan the month offers around the day-only ones, not the other way around." },
      { q: "Does Red Robin still do the free birthday burger?", a: "No. Red Robin's own terms discontinued the traditional birthday burger on June 1, 2026, replacing it with unspecified 'Surprise & Delight' offers — a kids' birthday discount remains. Most roundup lists haven't caught up. There's also no Red Robin close to Bradenton, so it didn't make our route regardless." },
      { q: "Why isn't Krispy Kreme on this list?", a: "Two reasons: there's no Krispy Kreme within a reasonable drive of Bradenton or Sarasota, and the brand's public pages promise only 'a sweet birthday gift' without specifying the item. A freebie you'd drive an hour for, sight unseen, isn't a freebie." },
      { q: "Do birthday freebies work at every location?", a: "Not always — participation can vary at franchised locations, and Baskin-Robbins says so outright in its FAQ. Every pick on this page is a real, currently-operating location near Bradenton or Sarasota, but the offer itself lives in each brand's app: if the reward shows in your account, the location listed will honor it or the app will say otherwise." },
    ],
  },
  "anna-maria-island-day-trip": {
    teaser: "The island's best beach has almost no parking, by design. The free trolley is how you get there anyway.",
    region: "Bradenton",
    title: "Anna Maria Island Day Trip: The Old-Florida Beach Day, Done Right",
    description: "How to do Anna Maria Island in a day: Bean Point at golden hour, Pine Avenue, the free trolley trick, and why there isn't a high-rise in sight.",
    keyword: "anna maria island day trip",
    updated: "2026-07-10",
    intro: "Anna Maria Island is what Florida beach towns looked like before the condo towers came: building heights are capped low by design, the streets end in sugar sand, and a free trolley runs the whole seven-mile island. It sits at the mouth of Tampa Bay off Bradenton, and it makes the best single beach day in the region if you sequence it right.",
    picks: [
      { name: "Bean Point, the island's secret-that-isn't", indoor: false, appQuery: "Bean Point Beach Anna Maria", blurb: "The northern tip where Tampa Bay meets the Gulf: no facilities, no crowds to speak of, and the best sunset vantage on the island. You reach it by walking in from quiet residential streets.", tip: "No restrooms and little parking by design — arrive on the trolley or by bike and pack out what you bring." },
      { name: "Pine Avenue and the City Pier", indoor: false, appQuery: "Pine Avenue Anna Maria", blurb: "The island's main street does old-Florida properly: local shops and cafés in cottage buildings, ending at the rebuilt Anna Maria City Pier looking back across the bay to the Skyway bridge.", tip: "Morning is the move — breakfast on Pine, pier walk after, beach by 11." },
      { name: "The free trolley, your parking cheat code", appQuery: "Anna Maria Island", blurb: "Beach parking on the island is a knife fight by mid-morning in season. The free trolley runs the length of the island from Coquina Beach to the north end, every 20 minutes or so, all day.", tip: "Park once at the big Coquina Beach lot on the south end and ride the trolley everywhere else." },
    ],
    faq: [
      { q: "How far is Anna Maria Island from Bradenton or Sarasota?", a: "About 20-30 minutes from Bradenton over the Manatee Avenue or Cortez Road bridges, and roughly 45 minutes from Sarasota depending on beach traffic." },
      { q: "Why are there no high-rise hotels?", a: "The island's communities cap building heights by ordinance, which is exactly why it still looks like 1950s Florida. Stays are cottages, small inns, and vacation rentals rather than resort towers." },
      { q: "Is the trolley really free?", a: "Yes — the island trolley is free to ride and runs the full length of the island daily. It connects Coquina Beach, Bradenton Beach, Holmes Beach, and the City of Anna Maria." },
    ],
  },
  "myakka-river-state-park-guide": {
    teaser: "The canopy walkway sways more with a crowd on it, and a summer afternoon storm decides the rest of your day.",
    region: "Sarasota",
    title: "Myakka River State Park: Gators, the Canopy Walk, and How to Do It in Half a Day",
    description: "A local's plan for Myakka River State Park: the canopy walkway, the deepest gator hole in Florida, airboat cruises, and when to go.",
    keyword: "myakka river state park",
    updated: "2026-07-10",
    intro: "Myakka is one of Florida's oldest and largest state parks — a wild river, prairie, and wetland system twenty minutes east of Sarasota where the alligators are genuinely wild and the birding is world class. It rewards a plan: the good stuff is spread out, and the light (and the wildlife) is best early.",
    picks: [
      { name: "The Canopy Walkway and tower", indoor: false, appQuery: "Myakka Canopy Walkway", blurb: "A suspension bridge through the oak-palm canopy that climbs to a tower above the treetops — one of the first public canopy walks in North America, and the park's signature view over the prairie.", tip: "Go early: the walkway sways more with a crowd on it, and the morning light over the prairie is the photo." },
      { name: "The lake, the birdwalk, and the gators", indoor: false, appQuery: "Myakka River State Park", blurb: "Upper Myakka Lake and the birdwalk boardwalk are where the park shows off: alligators sunning on the banks, roseate spoonbills and wood storks working the shallows.", tip: "Keep a respectful distance from any gator on land — they are faster than they look and this is not a zoo.", bookQuery: "Myakka airboat tour" },
      { name: "Paddle or pedal it", indoor: false, appQuery: "Myakka Outpost", blurb: "The flat park roads make an easy bike loop, and kayaking the Myakka puts you at water level with the wildlife. Rentals operate inside the park when conditions allow.", tip: "Summer afternoons bring storms fast — morning on the water, out by early afternoon." },
    ],
    faq: [
      { q: "Will I actually see alligators?", a: "Almost certainly, especially in the dry season (roughly November through May) when they concentrate around the lake and river. Sightings are wild-animal luck, but Myakka is about as reliable as Florida gets." },
      { q: "How much time do I need?", a: "Half a day covers the canopy walk, the birdwalk, and the lake. A full day adds a paddle or the deeper trails." },
      { q: "Is it good for kids?", a: "Yes — the canopy walkway, the boardwalks, and real gators make it an easy win. Keep kids close at the water's edge; these are wild animals." },
    ],
  },
  "ybor-city-tampa-guide": {
    teaser: "There are several Columbias. Only the original Ybor location is the one people actually come for.",
    region: "Tampa",
    title: "Ybor City: Cigars, Roosters, and the Best Afternoon in Tampa",
    description: "How to do Ybor City right: the cigar history that built Tampa, the 1905 Columbia Restaurant, the free streetcar, and yes — the wild roosters are protected.",
    keyword: "ybor city tampa",
    updated: "2026-07-10",
    intro: "Ybor City is the reason Tampa exists at scale: founded in the 1880s by cigar magnate Vicente Martinez-Ybor, it was once the cigar capital of the world, rolling hundreds of millions a year in brick factories that still line the streets. Today it's a National Historic Landmark District where you can eat in Florida's oldest restaurant, ride a free streetcar, and share the sidewalk with chickens that have more legal protection than your parking spot.",
    picks: [
      { name: "The Columbia Restaurant", indoor: true, appQuery: "Columbia Restaurant Ybor City", blurb: "Open since 1905 and still family-run — Florida's oldest restaurant, famous for the 1905 Salad tossed tableside, Cuban bread, and dining rooms that feel like Havana a century ago.", tip: "The original Ybor location is the one that matters; go for the salad and the sangria even if you only have time for the bar." },
      { name: "Seventh Avenue and the cigar legacy", indoor: false, appQuery: "Ybor City 7th Avenue", blurb: "La Séptima was once called one of the great streets of the South: wrought-iron balconies, social clubs built by immigrant communities, and cigar shops where rollers still work by hand.", tip: "Duck into a working cigar shop even if you don't smoke — watching a roller work is the point.", bookQuery: "Ybor City history walking tour", viatorUrl: "https://www.viator.com/tours/Tampa/Ybor-City-Historic-Walking-Tours/d666-5624P1" },
      { name: "The streetcar and the roosters", indoor: false, appQuery: "Tampa TECO streetcar", blurb: "The TECO Line streetcar connects Ybor to downtown and the waterfront in vintage cars, and it's free to ride. The wild chickens strutting the sidewalks are descendants of backyard flocks — and protected by city ordinance.", tip: "Streetcar in from downtown, walk Seventh Avenue end to end, late lunch at the Columbia." },
    ],
    faq: [
      { q: "Is Ybor City safe to visit?", a: "The historic district along Seventh Avenue is a well-trafficked tourist area by day and a busy nightlife strip on weekends. Standard city awareness applies late at night, as anywhere." },
      { q: "Why are there chickens everywhere?", a: "They're descendants of the neighborhood's backyard flocks from its immigrant-community days, and a city ordinance protects them. Locals treat them as the unofficial mascots." },
      { q: "Is the streetcar really free?", a: "Yes — the TECO Line streetcar between downtown Tampa and Ybor City has been fare-free for several years, running vintage Birney-style cars." },
    ],
  },
  "tampa-riverwalk-guide": {
    teaser: "Walk it one way and you have seen half of it. The other half is only from the water.",
    region: "Tampa",
    title: "Tampa Riverwalk: The 2.6-Mile Walk That Organizes the Whole City",
    description: "How to walk the Tampa Riverwalk like a local: Armature Works to Sparkman Wharf, the museums along the way, and the water taxi shortcut.",
    keyword: "tampa riverwalk",
    updated: "2026-07-10",
    intro: "The Tampa Riverwalk strings the city's best afternoon along 2.6 miles of the Hillsborough River — food halls, museums, parks, and skyline views, with zero cars and constant water. Start at one end hungry and finish at the other end happy; here's the sequence.",
    picks: [
      { name: "Armature Works, the north anchor", indoor: true, appQuery: "Armature Works Tampa", blurb: "A restored streetcar warehouse turned food hall and hangout — dozens of vendors, river-lawn seating, and the best people-watching in the city.", tip: "Weekend brunch hours are a crush; weekday afternoons are easy." },
      { name: "The museum middle", indoor: true, appQuery: "Tampa Museum of Art", blurb: "The riverwalk's midsection stacks the Tampa Museum of Art, the Glazer Children's Museum, and Curtis Hixon Waterfront Park — the lawn between them is downtown's living room.", tip: "Curtis Hixon at golden hour, with the University of Tampa's silver minarets lighting up across the river, is the postcard." },
      { name: "Sparkman Wharf and the water taxi", indoor: false, appQuery: "Sparkman Wharf Tampa", blurb: "The south end lands at Sparkman Wharf's shipping-container eateries and lawn, next to the Florida Aquarium. The Pirate Water Taxi turns the walk back into a boat ride.", tip: "Walk one way, boat the other — the skyline from the water is the view you came for.", bookQuery: "Tampa river cruise", viatorUrl: "https://www.viator.com/tours/Tampa/Tiki-Boat-Tampa-River-Cruise/d666-242020P4" },
    ],
    faq: [
      { q: "How long does the Riverwalk take?", a: "It's 2.6 miles end to end — about an hour of straight walking, but realistically half a day with food and museum stops." },
      { q: "Is it stroller and bike friendly?", a: "Fully — it's flat, paved, and car-free the entire way. Rental bikes and scooters are everywhere downtown." },
      { q: "Where should I park?", a: "Garages cluster near both anchors — Armature Works to the north and the Channel District near Sparkman Wharf to the south. Park at one end and make it a loop with the water taxi." },
    ],
  },
  "de-soto-national-memorial-bradenton": {
    teaser: "At high tide the shoreline trail is a mangrove tunnel; at low tide, wading birds on the flats. Which one you get is up to when you go.",
    region: "Bradenton",
    title: "De Soto National Memorial: Bradenton's Free National Park Site",
    description: "The small national memorial where Hernando de Soto's 1539 expedition landed: mangrove trails, winter living-history camp, and a kayak-friendly shoreline — free.",
    keyword: "de soto national memorial",
    updated: "2026-07-10",
    intro: "At the mouth of the Manatee River, De Soto National Memorial marks where Hernando de Soto's expedition came ashore in 1539 and began the first major European trek into the American South. It's one of the National Park Service's smallest units and one of Florida's best free outings: mangrove-tunnel trails, ranger programs, and a shoreline made for slow afternoons.",
    picks: [
      { name: "The mangrove shoreline trail", indoor: false, appQuery: "De Soto National Memorial", blurb: "A short nature trail loops through mangrove tunnels and along the river where the expedition landed — shady, flat, and genuinely pretty at high tide.", tip: "Go at high tide for the mangrove-tunnel effect; low tide trades it for wading birds on the flats." },
      { name: "Camp Uzita's living history", indoor: false, appQuery: "De Soto National Memorial", blurb: "In the winter season, rangers and volunteers in period kit demonstrate 16th-century weapons, armor, and camp life at the recreated Camp Uzita — history you can smell (the campfire) rather than read.", tip: "The living-history season runs roughly December into spring; check the park's calendar before making it the day's centerpiece." },
      { name: "Pair it with Robinson Preserve", indoor: false, appQuery: "Robinson Preserve", blurb: "The memorial sits minutes from Robinson Preserve's flats, towers, and kayak trails — together they make Bradenton's best free outdoor half-day.", tip: "Memorial first for the shade and history, preserve after for the miles." },
    ],
    faq: [
      { q: "Does De Soto National Memorial cost anything?", a: "No — admission and parking are free. It's one of the few national park sites with no entrance fee at all." },
      { q: "How much time do I need?", a: "An hour covers the trail and visitor center; add another for ranger programs in the winter living-history season." },
      { q: "Can you kayak there?", a: "The shoreline sits on the Manatee River near marked paddling routes, and adjacent Robinson Preserve has dedicated kayak trails and launches." },
    ],
  },
  "robinson-preserve-bradenton": {
    teaser: "The towers are the reason to come at sunset, and the tide decides whether you paddle at all.",
    region: "Bradenton",
    title: "Robinson Preserve: Bradenton's 600-Acre Playground of Trails, Towers, and Kayak Tunnels",
    description: "How to do Robinson Preserve: the observation tower views, mangrove kayak trails, flat miles for bikes and strollers, and the best times to go — all free.",
    keyword: "robinson preserve bradenton",
    updated: "2026-07-10",
    intro: "Robinson Preserve is what happens when a county turns more than 600 acres of former farmland back into coastal wetlands and hands it to everyone for free: miles of flat trails, mangrove kayak tunnels, boardwalks, and towers looking over Tampa Bay. It carries a 4.8-star rating across thousands of reviews for a reason — it's the best free outdoor day in Bradenton.",
    picks: [
      { name: "The observation towers", indoor: false, appQuery: "Robinson Preserve", blurb: "The preserve's towers — including the treehouse-like NEST structure — lift you above the mangroves for a panorama across the flats to the Skyway bridge and Tampa Bay.", tip: "Sunset from a tower is the signature Robinson moment; bring water, there's little shade on the open trails." },
      { name: "The kayak trails", indoor: false, appQuery: "Robinson Preserve kayak launch", blurb: "Marked paddling trails thread the preserve's tidal creeks and mangrove tunnels, with launches inside the preserve. Calm, protected water makes it a first-timer-friendly paddle.", tip: "Time your paddle with the tide — the creeks get skinny at dead low.", bookQuery: "Bradenton kayak tour" },
      { name: "Flat miles for wheels", indoor: false, appQuery: "Robinson Preserve", blurb: "The crushed-shell and paved paths are dead flat and stroller-, bike-, and wheelchair-friendly, connecting to the neighboring Perico Preserve and out toward the beaches.", tip: "Mornings beat the heat and own the wildlife: rays in the shallows, ospreys overhead, fiddler crabs everywhere." },
    ],
    faq: [
      { q: "Does Robinson Preserve cost anything?", a: "No — it's a free Manatee County preserve, open daily from early morning to evening." },
      { q: "Can you swim there?", a: "No — it's a wildlife preserve of tidal flats and mangroves, not a swimming beach. The Gulf beaches of Anna Maria Island are 15 minutes west." },
      { q: "Is it good for kids?", a: "One of the best free family outings in the area: towers to climb, crabs to spot, and flat, safe paths. Pack water and sun cover — shade is scarce on the open stretches." },
    ],
  },
  // Dated to Visit Orlando Magical Dining 2026 (Fri Aug 14–Wed Sep 30).
  // Third-party prix-fixe program, not a Wayfind-purchased ranking.
  "magical-dining-orlando-2026": {
    teaser: "The $60 Magical Dining menu is not the 16-seat tasting at ÔMO, and that is what decides which Winter Park table you book.",
    region: "Orlando",
    title: "Visit Orlando Magical Dining 2026: One Winter Park Table, One Orlando Table",
    description: "Visit Orlando Magical Dining runs Friday August 14 through Wednesday September 30, 2026. Two independent tables — ÔMO by Jônt in Winter Park and Kaya in Mills 50 — then a short rail of other sourced rooms. Not a 187-restaurant directory.",
    keyword: "magical dining orlando 2026",
    updated: "2026-08-19",
    intro: "Visit Orlando Magical Dining is a third-party prix-fixe program presented by Orlando Health, not a list Wayfind sold. Official criteria lock the window to Friday, August 14, 2026 through Wednesday, September 30, 2026. The official sitemap lists 187 restaurant pages. Each assigned room serves a three-course menu at $40 or $60; tax, gratuity, and beverages are extra, and a dollar or two per dinner is supposed to go to Visit Orlando's charity partner. Ranking here is not for sale. This page picks one Winter Park table and one Orlando table, then a short rail of other independents we could source from the official listing plus the restaurant's own site. It is not a directory of all 187. Which table you book decides the night — the 16-seat tasting and the $60 Magical Dining menu are not the same meal.",
    picks: [
      { name: "ÔMO by Jônt, Winter Park", indoor: true, appQuery: "Omo by Jont Winter Park", blurb: "The Winter Park rec is the 16-seat chef's counter at 115 E Lyman Ave. Official menus price The Journey at $195 a person — four snacks, four savory courses, one plated sweet, and a magic box, a little over two hours — and The Jaunt at $375 for more than 20 preparations. Visit Orlando's listing assigns the same address the $60 Magical Dining three-course menu. Those are different meals. Book the one you actually want.", tip: "Hours on the restaurant's information page are Wednesday–Sunday, 5:00pm–9:30pm; reservations are on OpenTable. The Salon next door is wine and à la carte small bites, not the tasting." },
      { name: "Kaya, Mills 50", indoor: true, appQuery: "Kaya Orlando", blurb: "The Orlando rec is the Filipino neighborhood restaurant at 618 N Thornton Ave. Official story names chef Lordfer Lalicon and GM Jamilyn Salonga Bailey. Visit Orlando lists the $60 Magical Dining option here. The homepage still defines kaya as capable and kaya natin as we can.", tip: "Printed summer hours: Tuesday–Thursday open 6pm with last kitchen at 9:30pm; Friday–Saturday open 5pm, last kitchen 10pm; Sunday open 5pm, last kitchen 8:45pm. Happy hour Tuesday–Thursday 6–7pm and Friday–Saturday 9pm–close." },
      { name: "AVA MediterrAegean, Park Avenue", indoor: true, appQuery: "AVA MediterrAegean Winter Park", blurb: "Official about dates the Winter Park Greek agora to 2022. Visit Orlando lists the $60 menu at 290 S Park Ave. The Winter Park menus page prints Golden Hour at the bar Sunday–Thursday 5–7pm and a $45 prix-fixe brunch Saturday and Sunday 11:30am–2:30pm.", tip: "The same CMS still carries Coconut Grove hours and a Miami phone — use the Winter Park listing number, (407) 794-9896." },
      { name: "The Pinery, Ivanhoe Village", indoor: true, appQuery: "The Pinery Orlando", blurb: "Official about: Carol Sizer Holladay opened this Lake Ivanhoe room after 26 years in hospitality, back in her native Orlando. Visit Orlando lists the $40 Magical Dining option at 295 NE Ivanhoe Blvd, Suite A.", tip: "Posted hours: Monday–Thursday 4–10pm, Friday–Saturday 4–11pm, Sunday 11am–9pm." },
      { name: "The Ravenous Pig, Winter Park", indoor: true, appQuery: "The Ravenous Pig Winter Park", blurb: "Visit Orlando lists the $40 menu at 565 West Fairbanks Avenue and calls the room a MICHELIN Bib Gourmand gastropub for dinner and brunch. The restaurant's own site did not load on this pass, so that is all this page will claim.", tip: "Listing phone (407) 628-2333. Confirm hours on a page you can actually open before you drive." },
      { name: "Kabooki Sushi, East Colonial", indoor: true, appQuery: "Kabooki Sushi East Colonial", blurb: "Visit Orlando lists the $60 menu at 3122 East Colonial Drive — the East Colonial room, not Sand Lake. Official location hours: Monday–Wednesday and Sunday 5–10pm, Thursday 5–11pm, Friday–Saturday 5pm–12am.", tip: "The official site also runs 7705 Turkey Lake Road. This listing and this rail are Colonial only." },
      { name: "Maxine's on Shine, Colonialtown", indoor: true, appQuery: "Maxine's on Shine", blurb: "The restaurant's own homepage advertises Magical Dining as three courses for $40, August 14–September 30, Tuesday–Saturday. Visit Orlando lists the same $40 option at 337 N Shine Ave. Dinner on that homepage is Wednesday–Saturday 5–9pm; brunch Friday–Sunday 10am–3pm.", tip: "The Magical Dining banner says Tuesday–Saturday; dinner hours on the same page start Wednesday. Confirm the night you want." },
      { name: "Otto's High Dive, Milk District", indoor: true, appQuery: "Otto's High Dive Orlando", blurb: "Visit Orlando lists the $40 menu at 2304 E Robinson St and calls the room a Cuban/Floridian neighborhood rum bar and restaurant. Official hours: dinner Monday–Thursday 4–10:30pm, Friday–Saturday 4–11:30pm, Sunday 4–9:30pm; lunch Friday–Saturday 11am–3:30pm; brunch Sunday 11am–3:30pm.", tip: "Official parking: a private lot first-come, plus street parking on Plaza Terrace, Bumby, and nearby side streets. Happy hour Monday–Friday 4–6pm." },
      { name: "Osteria Ester, Thornton Park", indoor: true, appQuery: "Osteria Ester Orlando", blurb: "Visit Orlando lists the $40 menu at 629 E Central Blvd. Official hours: dinner Tuesday–Saturday 5–10pm, brunch Sunday 11am–4pm. The dinner menu is Italian-American pasta and secondi — pappardelle Bolognese, spaghetti alle vongole, sea bream — not a hotel trattoria.", tip: "Official parking note: free and metered street parking around Thornton Park, or the paid Thornton Park Central Garage. Near E Central and Summerlin." },
      { name: "The Chapman, Park Avenue", indoor: true, appQuery: "The Chapman Winter Park", blurb: "Visit Orlando lists the $60 menu at 500 S Park Ave. Official copy is Florida steaks, fish, pasta, and cocktails. Happy hour is weekdays 3–6pm in the Chase Lounge. Dinner hours were not posted on the pages that loaded.", tip: "Phone (407) 635-1967. Confirm dinner hours before you treat the $60 menu as a walk-in." },
    ],
    faq: [
      { q: "What is Visit Orlando Magical Dining?", a: "A third-party prix-fixe event run by Visit Orlando, presented by Orlando Health. Participating member restaurants serve a three-course menu at $40 or $60 from Friday, August 14, 2026 through Wednesday, September 30, 2026. Tax, gratuity, and beverages are extra. It is not a ranking Wayfind sold." },
      { q: "How many restaurants are on the official list?", a: "The official Magical Dining sitemap has 187 listing URLs. This page is two recs and a short rail, not that directory." },
      { q: "Is the $60 menu the tasting at ÔMO?", a: "No. ÔMO's own menus price The Journey at $195 and The Jaunt at $375. Visit Orlando assigns the $60 three-course Magical Dining menu to the same address. Book the meal you mean." },
      { q: "Do you rank restaurants because they paid to be on Magical Dining?", a: "No. Restaurants pay Visit Orlando a program marketing fee to participate. Wayfind does not sell this ranking. Rooms that we could not source, or whose Google place ID we could not verify, are omitted from Atlas cards even if they appear on this rail." },
    ],
  },
  // ⏳ SEASONAL — remove with lib/guidesSummer2026.js on 2026-08-30.
  ...SUMMER_2026_GUIDES,

  // EVERGREEN — the Gulf Coast cluster (Parrish, Sarasota, Tampa). Unlike the
  // summer set these carry no sunset date.
  ...GULF_COAST_2026_GUIDES,
};
