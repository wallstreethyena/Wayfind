import { ticketmasterGoUrl } from "./affiliates.js";

// Tampa Bay Rays game day at Tropicana Field — drafted October 21, 2026.
// Shared /guides/[slug] template, same shape as lib/guidesFloridaTrending2026.js:
// no place rail, no editorialMode, no new component. Exact game tickets use the shared ticket slot.
//
// SOURCING RULE. Every row carries the URL it was checked against and the date
// that source was published or read (checked 2026-10-21). A claim with no
// source that could be opened on 2026-10-21 is not published (see the PR report
// for the dropped list). Player-hangout rows require a dated public source that
// names a Rays player or the team, AND a 2026 source showing the venue operates.

const SLUG = "tampa-bay-rays-game-day-tropicana-field";
const CHECKED = "2026-10-21";

// Ticketmaster event pages checked 2026-10-22: matchup, date and venue match.
// Milwaukee listings show 7 PM Central; all seven games are 8 PM Eastern.
export const RAYS_WORLD_SERIES_GAMES = [
  { game: 1, date: "2026-10-23", day: "Friday, October 23", eventId: "Z7r9jZ1AAZEj_", home: false },
  { game: 2, date: "2026-10-24", day: "Saturday, October 24", eventId: "Z7r9jZ1AAZEjO", home: false },
  { game: 3, date: "2026-10-26", day: "Monday, October 26", eventId: "Z7r9jZ1AAZsP9", home: true },
  { game: 4, date: "2026-10-27", day: "Tuesday, October 27", eventId: "Z7r9jZ1AAZsPb", home: true },
  { game: 5, date: "2026-10-28", day: "Wednesday, October 28", eventId: "Z7r9jZ1AAZsP_", home: true },
  { game: 6, date: "2026-10-30", day: "Friday, October 30", eventId: "Z7r9jZ1A7JpPs", home: false },
  { game: 7, date: "2026-10-31", day: "Saturday, October 31", eventId: "Z7r9jZ1AAZEj-", home: false },
].map((game) => ({ ...game, url: "https://www.ticketmaster.com/event/" + game.eventId })); // wf-affiliate-allow: official — verification source only; every ticket CTA below uses ticketmasterGoUrl.

const GAME_PICKS = RAYS_WORLD_SERIES_GAMES.map((game) => ({
  id: "rays-ws-game-" + game.game,
  name: "World Series Game " + game.game + (game.game >= 5 ? " — if necessary" : ""),
  eyebrow: game.home ? "Tropicana Field · St. Petersburg, Florida" : "American Family Field · Milwaukee, Wisconsin",
  appQuery: null,
  blurb: game.day + ", 2026 at 8 PM ET. " + (game.home ? "Milwaukee Brewers at Tampa Bay Rays. Tropicana Field, St. Petersburg, Florida." : "Tampa Bay Rays at Milwaukee Brewers. American Family Field, Milwaukee, Wisconsin (7 PM local Central time).")
    + (game.game >= 5 ? " Only played if necessary; check the series result before making plans." : "")
    + " Time and availability can change. This button opens this exact game's Ticketmaster listing. Wayfind may earn a commission on eligible purchases. Source: " + game.url + " (checked 2026-10-22).",
  ticket: {
    affiliate: true,
    href: ticketmasterGoUrl(game.url, { surface: "rays_ws_2026_g" + game.game, contentId: SLUG + ":game-" + game.game, offerId: "tm_" + game.eventId }),
    label: "Game " + game.game + " tickets on Ticketmaster" + (game.game >= 5 ? " · if necessary" : ""),
  },
}));

const S = {
  postseason: { label: "Rays postseason results (MLB.com)", url: "https://www.mlb.com/rays/history/postseason-results", date: "read " + CHECKED },
  wsPreview: { label: "Brewers vs. Rays World Series preview (MLB.com)", url: "https://www.mlb.com/news/brewers-vs-rays-world-series-preview", date: "October 2026" },
  timeline: { label: "Rays franchise timeline (MLB.com)", url: "https://www.mlb.com/rays/history/timeline", date: "read " + CHECKED },
  nameHistory: { label: "Tampa Bay Rays team name history (MLB.com)", url: "https://www.mlb.com/news/tampa-bay-rays-team-name-history", date: "read " + CHECKED },
  tropHistory: { label: "Tropicana Field history (MLB.com)", url: "https://www.mlb.com/rays/ballpark/information/tropicana-field-history", date: "read " + CHECKED },
  retro: { label: "Tropicana Field firsts (Retrosheet)", url: "https://www.retrosheet.org/ballparks/tropicana_field.htm", date: "read " + CHECKED },
  roofDone: { label: "Tropicana Field roof restored (MLB.com)", url: "https://www.mlb.com/news/tropicana-field-roof-restored-in-repair-effort", date: "November 2025" },
  returnTrop: { label: "Rays set to return to repaired Tropicana Field (MLB.com)", url: "https://www.mlb.com/news/rays-set-to-return-to-repaired-tropicana-field", date: "April 2026" },
  newFeatures: { label: "Rays highlight new features, spaces, experiences and partners (MLB.com press release)", url: "https://www.mlb.com/press-release/rays-highlight-new-features-spaces-experiences-and-partners", date: "2026-04-06" },
  opener: { label: "Rays open the 2026 season at Tropicana Field (MLB.com press release)", url: "https://www.mlb.com/press-release/rays-open-the-2026-season-at-tropicana-field-with-a-two-team-six-game-homestand", date: "2026 season" },
  summer: { label: "Rays announce Best Summer Ever at Tropicana Field (MLB.com press release)", url: "https://www.mlb.com/press-release/rays-announce-best-summer-ever-at-tropicana-field", date: "2026-05-26" },
  guide: { label: "Tropicana Field policies and procedures A-Z (MLB.com)", url: "https://www.mlb.com/rays/ballpark/information/guide", date: "read " + CHECKED },
  access: { label: "Tropicana Field accessibility guide (MLB.com)", url: "https://www.mlb.com/rays/ballpark/information/accessibility-guide", date: "read " + CHECKED },
  concessions: { label: "Concessions A-Z guide (MLB.com)", url: "https://www.mlb.com/rays/ballpark/concessions/guide", date: "read " + CHECKED },
  mlbGuide: { label: "Tropicana Field guide: capacity, seating chart, parking (MLB.com)", url: "https://www.mlb.com/news/featured/tropicana-field-guide-capacity-seating-chart-parking-and-more", date: "read " + CHECKED },
  cowbell: { label: "#Shortstops: Rays ring the bell (National Baseball Hall of Fame)", url: "https://baseballhall.org/discover/shortstops/tampa-bay-rays-world-series-cowbell", date: "read " + CHECKED },
  vspcWs: { label: "Tampa Bay Rays World Series games (Visit St. Pete/Clearwater)", url: "https://www.visitstpeteclearwater.com/event/tampa-bay-rays-home-game-schedule/43936", date: "October 2026" },
  vspcNear: { label: "Activities near Tropicana Field (Visit St. Pete/Clearwater)", url: "https://www.visitstpeteclearwater.com/things-to-do/sports/before-after-rays-game", date: "October 2026" },
  fergs: { label: "Ferg's Sports Bar & Grill (official site)", url: "https://fergssportsbar.com/", date: "read " + CHECKED },
  greenBench: { label: "Green Bench Brewing Co. (official site)", url: "https://greenbenchbrewing.com/", date: "read " + CHECKED },
  gcb: { label: "Grand Central Brewhouse (official site)", url: "https://www.grandcentralbrew.com/", date: "read " + CHECKED },
  cage: { label: "Cage Brewing (official site)", url: "https://cagebrewing.com/", date: "read " + CHECKED },
  casita: { label: "Casita Taqueria, Central Ave (official site)", url: "https://www.casitatacos.com/central-ave", date: "read " + CHECKED },
  longoria: { label: "Ask The Locals: Evan Longoria (Creative Loafing Tampa Bay)", url: "https://www.cltampa.com/news/ask-the-locals-evan-longoria-12280058/", date: "2015-09-24" },
};

const src = (s) => s.url + " (" + s.date + ")";

// Each row: section, name, text, sources (keys of S). Rendered as one pick.
const ROWS = [
  // ── Where the Rays stand right now ──────────────────────────────────────
  { section: "2026 status", name: "The 2026 World Series comes to the Trop", text: "The Rays swept the Yankees 3–0 in the ALDS and beat the Guardians 4–2 in the ALCS to win the 2026 AL pennant. They play the Milwaukee Brewers in the World Series. Games 1 and 2 are in Milwaukee; Games 3 (Monday, October 26) and 4 (Tuesday, October 27) are at Tropicana Field, with Game 5 there on Wednesday, October 28 only if necessary. All three are scheduled for 8 PM ET. The Brewers hold home-field advantage. Check the result of every game before you plan around Game 5.", sources: ["postseason", "wsPreview", "vspcWs"] },
  { section: "2026 status", name: "The Rays are home at the Trop again in 2026", text: "Hurricane Milton tore open Tropicana Field's roof on October 9, 2024, and the Rays played the entire 2025 season at George M. Steinbrenner Field in Tampa. The 24th and final new roof panel went up on November 21, 2025, and the Rays reopened the Trop for the April 6, 2026 home opener against the Cubs, their first game there in 561 days. The new roof is a PTFE-coated fiberglass membrane in 24 panels. The Rays' use agreement keeps them at the Trop through the 2028 season, and the club's ownership has said it is pursuing a long-term home with a goal of Opening Day 2029.", sources: ["roofDone", "returnTrop", "newFeatures"] },

  // ── Franchise history and fun facts ─────────────────────────────────────
  { section: "History", name: "Born as the Devil Rays", text: "MLB owners approved the Tampa Bay Devil Rays and Arizona Diamondbacks as expansion teams on March 9, 1995. The first regular-season game was March 31, 1998 at Tropicana Field: Tigers 11, Devil Rays 6, before 45,369 fans. Hall of Famers Ted Williams, Stan Musial, Al Lopez and Monte Irvin threw ceremonial first pitches, and Wilson Alvarez threw the first pitch in franchise history. The first win came the next night, 11–8 over Detroit, with Rolando Arrojo earning it in his MLB debut.", sources: ["timeline", "retro"] },
  { section: "History", name: "They almost were the Stingrays", text: "Ownership first wanted 'Tampa Bay Stingrays', but the name was already trademarked by a winter-league team in Hawaii, so the club became the Devil Rays.", sources: ["nameHistory"] },
  { section: "History", name: "2008: drop the Devil, win the pennant", text: "After the 2007 season the team dropped 'Devil' and became the Tampa Bay Rays; MLB.com notes the name now also refers to rays of sunshine. In their first season as the Rays they went from last to first in the AL East with 97 wins, beat the White Sox and Red Sox, and reached the franchise's first World Series, losing to the Phillies in five games. Evan Longoria was AL Rookie of the Year and Joe Maddon AL Manager of the Year.", sources: ["nameHistory", "timeline", "postseason"] },
  { section: "History", name: "2020: the second pennant", text: "The Rays went 40–20 in the 60-game 2020 season, the AL's best record, and reached their second World Series, losing to the Dodgers in six games. Randy Arozarena hit 10 postseason home runs, a postseason record at the time.", sources: ["timeline", "postseason"] },
  { section: "History", name: "2026: the third pennant", text: "2026 is the franchise's third World Series trip (after 2008 and 2020), and the Rays have never won a World Series.", sources: ["postseason"] },

  // ── Tropicana Field facts ───────────────────────────────────────────────
  { section: "The Trop", name: "Older than the team", text: "The building opened March 3, 1990 as the Florida Suncoast Dome, built to lure an MLB team. It became the ThunderDome in 1993 when the NHL's Lightning played there, and was renamed Tropicana Field on October 4, 1996. It has also hosted the 1999 NCAA Final Four and the 2008 World Series.", sources: ["tropHistory"] },
  { section: "The Trop", name: "The tilted roof and the catwalks", text: "The Trop's slanted white roof is its signature look, and MLB.com's 2026 reopening story notes the long-running complaints about its catwalks and commute. The same firm that helped build the dome in 1990 (AECOM Hunt) led the 2025 roof rebuild using the original shop drawings.", sources: ["returnTrop", "roofDone"] },
  { section: "The Trop", name: "Touch a ray: the Cownose Clubhouse", text: "Seven cownose rays from The Florida Aquarium live in a 35-foot, 10,000-gallon touch tank just beyond the right-center field wall on the second level. They rode out Hurricane Milton inside the Trop, and the renovated Cownose Clubhouse reopened April 6, 2026. Reach it by the Gate 1 elevator or stairs. It opens with the gates, stays open through the top of the ninth, and closes for 10 minutes at the top of each hour so the rays can rest.", sources: ["newFeatures", "summer", "guide"] },

  // ── Game-day atmosphere and traditions ──────────────────────────────────
  { section: "Traditions", name: "More cowbell", text: "Cowbells started in 2006, when the Rays played Saturday Night Live's 'More Cowbell' sketch on the video board, and became nationally famous during the 2008 ALCS. The Rays' cowbell rules call for ringing when a Rays player reaches base or scores, when an opposing batter has two strikes, or when 'More Cowbell' flashes on the board. In 2026 the Trop still bans most noisemakers but keeps an explicit exception for small cowbells.", sources: ["cowbell", "access"] },
  { section: "Traditions", name: "2026 in-game promotions", text: "Before select Friday games a fan is picked as Budweiser's 'First Bud' to start the game with the crack of a can. If the Rays score in the third inning, fans get free Culver's cheese curds the next day through the Culver's app. A Rays home run triggers Colony Grill's buy-one-get-one 'hot oil' pizza offer for seven days with your game ticket. The 50/50 raffle supports the Rays Up Foundation. Each offer has its own terms on the source page.", sources: ["opener"] },
  { section: "Traditions", name: "First game or birthday? Get a button", text: "Guest Services at Gates 1, 3, 4 and the MaintenX SkyDeck hands out birthday and first-game buttons, and lends sensory bags with noise-canceling headphones.", sources: ["access"] },
  { section: "Traditions", name: "Chants and between-innings bits", text: "We could not find an official, dated 2026 source describing a current Rays chant or between-innings routine, so this guide does not list any. The cowbell rules above are the documented crowd tradition.", sources: [] },

  // ── Drinks ──────────────────────────────────────────────────────────────
  { section: "Drinks", name: "The Ballpark Mojito", text: "The Rays' signature cocktail for 2026 is the Ballpark Mojito, presented by Rums of Puerto Rico (the team's official rum partner), with brands including Don Q and Bacardi at bars around the ballpark.", sources: ["newFeatures"] },
  { section: "Drinks", name: "Local beer and other pours inside", text: "Tampa's Coppertail Brewing pours Florida Special, Free Dive IPA, Strawberry Jam Lager and Unholy Trippel from its draft cart (sections 113 and 120). The concessions guide also lists daiquiris at the Daiquiri Deck Bar (section 128) and Hall of Fame Bar & Grill, a boozy milkshake at Epic Milkshakes (107), Jai Alai and Champagne at Taste of October on the Budweiser Porch. Menus change, so check the guide on the day.", sources: ["concessions"] },
  { section: "Drinks", name: "Free water, the legal way", text: "You may bring one sealed water bottle (20 ounces or less) per ticketed fan, or an empty plastic refillable bottle or cup for the hydration stations. Metal, glass and ceramic bottles are not allowed.", sources: ["access"] },

  // ── First-timer and returning-fan tips ──────────────────────────────────
  { section: "Tips", name: "Gates, lots and timing", text: "For regular-season games, gates open 90 minutes before first pitch on weekdays and two hours before on weekends; parking lots open 2.5 hours before on weekdays and three hours before on weekends. For the World Series, Visit St. Pete/Clearwater says gates open three hours early, lots four to five hours early, parking in the Trop lots is prepaid only, and pregame ceremonies start about 90 minutes before first pitch.", sources: ["guide", "vspcWs"] },
  { section: "Tips", name: "Bag policy and cash", text: "Clear bags only: one single-compartment clear PVC, plastic or vinyl bag up to 12 x 6 x 12 inches, or a small non-clear bag up to 5 x 7 inches. No backpacks or hard-sided bags. The Trop is cashless (it became North America's first cash-free sports venue in 2019), so bring a card or use the Rays wallet.", sources: ["opener", "guide", "mlbGuide"] },
  { section: "Tips", name: "Value plays", text: "The new MaintenX SkyDeck is an all-inclusive area (food, beer, wine and soft drinks). Season members get concession and merchandise discounts. Summer 2026 family packages bundled tickets, meals and parking. Prices and availability change, so check the Rays' site before you buy.", sources: ["newFeatures", "opener", "summer"] },
  { section: "Tips", name: "Sensory and accessibility", text: "Postseason games are louder and include light displays. There is a quiet room (20-minute limit), sensory bags at Guest Services, and elevators at Gates 1, 2, 4 and 6.", sources: ["vspcWs", "access"] },
  { section: "Tips", name: "Best seats", text: "We did not find an official, dated source ranking seats at the Trop, so this guide does not name a 'best seat'. The Rays' own seating chart is linked from their ballpark pages.", sources: [] },

  // ── Near the Trop: game-night spots (official sites, checked 2026-10-21) ─
  { section: "Near the Trop", name: "Ferg's Sports Bar & Grill", text: "Across from Tropicana Field at 1320 Central Ave since 1992, spanning nearly two city blocks. Visit St. Pete/Clearwater calls it the official gathering spot for Rays fans.", sources: ["fergs", "vspcNear"] },
  { section: "Near the Trop", name: "Green Bench Brewing Co.", text: "A beer garden and tasting room at 1133 Baum Ave N in the EDGE District, a short walk from the Trop.", sources: ["greenBench", "vspcNear"] },
  { section: "Near the Trop", name: "Grand Central District breweries", text: "Grand Central Brewhouse (2340 Central Ave) and Cage Brewing (2001 1st Ave S) are both named by Visit St. Pete/Clearwater as Grand Central District stops reachable by walking, bike or trolley from the Trop.", sources: ["gcb", "cage", "vspcNear"] },
  { section: "Near the Trop", name: "St. Pete Pier after the game", text: "For a waterfront drink after the final out, Visit St. Pete/Clearwater points to the St. Pete Pier District and Doc Ford's Rum Bar & Grille there.", sources: ["vspcNear"] },

  // ── Player hangouts (dated sources only) ────────────────────────────────
  { section: "Player hangouts", name: "Casita Taqueria (Longoria's taco stop, 2015)", text: "In a September 2015 Creative Loafing interview, then-Rays third baseman Evan Longoria named Casita Taqueria as one of his taco stops. Its Central Ave location (2663 Central Ave) is open in 2026, per its site, and Visit St. Pete/Clearwater lists it near the Trop. That is one player's 2015 habit, not a current clubhouse hangout.", sources: ["longoria", "casita", "vspcNear"] },
  { section: "Player hangouts", name: "No current player hangout is documented", text: "We could not find a dated public source naming a bar or restaurant that current (2026) Rays players frequent, so this guide does not name one.", sources: [] },
];

function rowPick(row, index) {
  const cites = row.sources.map((k) => src(S[k]));
  return {
    name: row.name,
    eyebrow: row.section,
    appQuery: null,
    blurb: row.text + (cites.length ? " Sources: " + cites.join("; ") + "." : " Status: no sourced material found; nothing is claimed."),
  };
}

export const RAYS_GAME_DAY_ROWS = ROWS;
export const RAYS_GAME_DAY_SOURCES = S;

export const RAYS_GAME_DAY_2026_GUIDES = {
  [SLUG]: {
    teaser: "Cowbells are still allowed and the touch-tank rays are back, but only one clear bag gets you through the gate for the World Series at the Trop.",
    region: "Tampa Bay",
    title: "Tampa Bay Rays Game Day at Tropicana Field",
    description: "A sourced game-day guide to Tropicana Field: Rays history, the 2026 World Series at the Trop, cowbells and the ray touch tank, drinks, bag and parking rules, and spots near the ballpark.",
    keyword: "rays game tropicana field",
    published: CHECKED,
    updated: "2026-10-22",
    authorBio: "Gabriel Pereira is the creator of Wayfind. His work focuses on helping people choose what to do in Florida based on where they are, who they are with, and the time they have.",
    methodology: "Every row was checked on October 21, 2026 against the MLB.com, team, organizer, venue or press source linked on that row, with the source's date. Where no dated source existed, the row says so instead of guessing.",
    facts: {
      heading: "GAME DAY AT A GLANCE",
      items: [
        { label: "Home", value: "Tropicana Field, St. Petersburg (reopened April 6, 2026)" },
        { label: "World Series at the Trop", value: "G3 Mon Oct 26, G4 Tue Oct 27, G5 Wed Oct 28 if necessary; 8 PM ET" },
        { label: "Bags", value: "Clear, up to 12 x 6 x 12 in; small clutch 5 x 7 in" },
        { label: "Payment", value: "Cashless" },
        { label: "Noise", value: "Small cowbells allowed" },
      ],
    },
    intro: "The 2026 World Series is over. The Brewers won Game 5 by 4 to 1 at Tropicana Field on Wednesday, October 28, so there is no Game 6 or Game 7. The Rays are back at Tropicana Field in 2026 after a season in Tampa while Hurricane Milton's roof damage was repaired, and they are hosting the World Series against the Brewers. This guide covers the franchise from the 1998 Devil Rays to the 2026 pennant, what makes a night at the Trop different (cowbells, the ray touch tank, the tilted roof), what to drink, how to get in smoothly, and where to go before and after. Every row lists the dated source it was checked against on October 21, 2026. Where we found no source, the row says so.",
    picks: ROWS.map(rowPick), // Series over Oct 28: no game ticket cards.
    faq: [
      { q: "Where do the Rays play in 2026?", a: "At Tropicana Field in St. Petersburg. They played 2025 at Steinbrenner Field in Tampa after Hurricane Milton and returned to the repaired Trop for the April 6, 2026 home opener." },
      { q: "Can I bring a cowbell to Tropicana Field?", a: "Yes, small cowbells. The Trop's prohibited-items list bans most noisemakers but keeps the long-held exception for small cowbells." },
      { q: "Can I still touch the rays at the Trop?", a: "Yes. The Cownose Clubhouse reopened April 6, 2026 beyond right-center field, reached from the Gate 1 elevator or stairs. It closes for 10 minutes at the top of each hour." },
      { q: "Is Tropicana Field cashless?", a: "Yes. Bring a card or use the Rays wallet for food, merchandise and parking." },
    ],
    sources: Object.values(S).map((s) => ({ label: s.label + " (" + s.date + ")", url: s.url })),
  },
};
