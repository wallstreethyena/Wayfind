// SeaWorld Orlando Christmas Celebration 2026.
// Facts read November 23, 2026 from SeaWorld's own pages:
//   https://seaworld.com/orlando/events/christmas-celebration/
//   https://seaworld.com/orlando/events/christmas-celebration/shows/
//   the October 30, 2026 press release PDF on seaworld.com
//   https://seaworld.com/orlando/park-info/directions/
//   https://seaworld.com/orlando/rides/
//   https://seaworld.com/orlando/park-info/park-policies/
// The park hours calendar did not expose day tags on November 23. The day
// list below is the November 19 read of that same official calendar, already
// on file in lib/eventOccurrencesVerified202611.js. A detail those pages did
// not state is left out.
//
// Photos: every pick that renders has a registered photo. Miracles stays in
// the record and off the page, and it is not in the photo-order list. The
// official stills are 357 by 229, too small for a card, so it must not render
// a placeholder. No prices. No dashes in reader copy.

const PARK = "ChIJfyPWjCh-54gR1SvWozmef5k";
const ADDRESS = "7007 Sea World Drive, Orlando, FL 32821";

function spot(id, name, eyebrow, blurb, tip) {
  const row = {
    id,
    name,
    eyebrow,
    blurb,
    address: ADDRESS,
    placeId: PARK,
    appQuery: null,
    indoor: false,
    declinePlacePhotoReuse: true,
  };
  if (tip) row.tip = tip;
  return row;
}

export const SEAWORLD_CHRISTMAS_2026_GUIDES = {
  "seaworld-orlando-christmas-celebration-2026": {
    endsOn: "2027-01-06",
    neutralPickFallback: true,
    // The one day ticket is Undercover Tourist deal 62 (the merchant's
    // dayTickets row). The button names that partner. Tiqets is the
    // merchant's other partner and is the second button.
    eventTicket: "seaworld-orlando-christmas-2026",
    partnerButton: true,
    merchantKey: "seaworld-orlando",
    teaser: "Santa is near Expedition Odyssey, but the page prints no price for ice skating.",
    region: "Orlando",
    cluster: "christmas-florida-2026",
    title: "SeaWorld Orlando Christmas Celebration 2026",
    description: "SeaWorld Orlando's Christmas Celebration on select dates from November 6, 2026 to January 4, 2027, included with park admission, with the shows, Santa, ice skating and a photo order.",
    keyword: "seaworld orlando christmas celebration 2026",
    relatedKeywords: [
      "seaworld orlando christmas celebration 2026",
      "seaworld orlando christmas shows 2026",
      "seaworld orlando ice skating",
      "holiday reflections seaworld",
    ],
    published: "2026-11-23",
    updated: "2026-11-23",
    intro: "SeaWorld Orlando's Christmas Celebration runs on select dates from November 6, 2026 to January 4, 2027, and SeaWorld says it is included with theme park admission. The park is at 7007 Sea World Drive, Orlando, FL 32821, and the main entrance is on Central Florida Parkway. The shows page lists Miracles, a nighttime orca presentation the press release says is back for the first time since 2019; O Wondrous Night; Winter Wonderland on Ice; Clyde and Seamore's Countdown to Christmas at Sea Lion and Otter Stadium; Mrs. Claus' Magic Kitchen; Elmo's Christmas Wish Show at Seaport Theater; the Sesame Street Christmas Parade; and Big Bird's Christmas Storytime at Big Bird's nest. Holiday Reflections fireworks close the night. Food and drinks are an additional purchase. Public ice skating at Bayside Stadium is an additional charge, and the page prints no price. Santa meet and greets are near Expedition Odyssey Fire and Ice. The list under Best photo spots, in order, is the order to shoot them. Park admission buttons on this page name Undercover Tourist and Tiqets.",
    facts: {
      heading: "Best photo spots, in order",
      items: [
        { label: "1 Main entrance", value: "Morning. The directions page puts the entrance on Central Florida Parkway." },
        { label: "2 Holiday train", value: "Late morning. A miniature train display just outside Dolphin Nursery." },
        { label: "3 Mako and Manta", value: "Midday. The rides page lists both coasters. Mako has deep dives." },
        { label: "4 Sesame parade", value: "Afternoon. The shows page does not print a parade clock time." },
        { label: "5 Ice skating", value: "Golden hour. Bayside Stadium, beside the lagoon. Additional charge, no price printed." },
        { label: "6 Rudolph", value: "Dusk. Rudolph's Christmastown, with storybook scenes and meet and greets." },
        { label: "7 Sea of Trees", value: "Just after dark. Lit trees in the lagoon, with a 70 foot centerpiece." },
        { label: "8 Winter Wonderland on Ice", value: "Evening. The ice skating show, on select dates." },
        { label: "9 Holiday Reflections", value: "At close. Fireworks over the lagoon. The two SeaWorld pages do not share one end date." },
      ],
    },
    picks: [
      spot(
        "entrance-morning",
        "Main entrance",
        "Orlando · morning",
        "SeaWorld's directions page says the main entrance is on Central Florida Parkway, at the sign for SeaWorld Orlando. The mailing address on that page is 7007 Sea World Drive, Orlando, FL 32821. Come in the morning, before the lagoon lights are the point of the visit.",
        "The directions page does not mention a lighthouse.",
      ),
      spot(
        "holiday-train",
        "Holiday train by Dolphin Nursery",
        "Orlando · late morning",
        "The shows page says to marvel at a miniature Christmas train set, with lights and villages, just outside Dolphin Nursery. The press release calls it a miniature Holiday Train display near Dolphin Nursery.",
        "The pages describe a display, not a ride you board.",
      ),
      spot(
        "mako-manta",
        "Mako and Manta",
        "Orlando · midday",
        "The rides page lists Mako as a hyper coaster with high speeds and deep dives, and it lists Manta with it. Both have a 54 inch height minimum. SeaWorld does not call either coaster part of the Christmas show lineup. Midday is the time to be at the ride, before the evening entertainment.",
        "Check the ride's own height rule before you queue.",
      ),
      spot(
        "sesame-parade",
        "Sesame Street Christmas Parade",
        "Orlando · afternoon",
        "The shows page says Elmo, Cookie Monster and friends lead a holiday parade with decorated floats that fills Sesame Street with cheer. It does not print a clock time. Use the afternoon, and check the park hours page for that day's parade.",
        "Hanukkah menorah lightings, December 4 to 12, are also in Sesame Street Land.",
      ),
      spot(
        "bayside-skating",
        "Public ice skating at Bayside Stadium",
        "Orlando · golden hour",
        "The shows page says guests can skate at Bayside Stadium alongside the central lagoon, through the day. An additional charge is required and it includes skate rental. SeaWorld does not print the price. Guests must wear crew length socks and gloves, cannot bring their own skates, and are taken first come, first served.",
        "This is the public skate. Winter Wonderland on Ice is the show, and the page does not put that show at Bayside Stadium.",
      ),
      spot(
        "rudolphs-christmastown",
        "Rudolph's Christmastown",
        "Orlando · dusk",
        "The press release says guests can meet Rudolph the Red Nosed Reindeer in Rudolph's Christmastown. The shows page calls it Rudolph's Christmas Town and says life size storybook scenes and meet and greets with Rudolph and friends bring the story to life. Dusk is the time to be there, before the lagoon lights.",
        "The event page also says Rudolph and Bumble are part of the celebration.",
      ),
      {
        id: "sea-of-trees",
        name: "Sea of Trees",
        eyebrow: "Orlando · just after dark",
        blurb: "The shows page says the Sea of Trees is in SeaWorld's lagoon: sparkling trees dance to holiday music and are crowned by a 70 foot Christmas centerpiece. This is the seventh stop in the photo order above. Go just after dark.",
        tip: "The same lagoon is where Holiday Reflections is viewed at park close.",
        address: ADDRESS,
        placeId: PARK,
        appQuery: null,
        indoor: false,
      },
      spot(
        "winter-wonderland-on-ice",
        "Winter Wonderland on Ice",
        "Orlando · evening",
        "The shows page calls it an ice skating show, with skaters, ice, lights and music. Its FAQ says the show returns on select dates from November 6 to January 4. The event page FAQ says select dates from November 7 to January 5. Check the show schedule for the night you go.",
        "The page does not name a theater or a stadium for this show.",
      ),
      // Not rendered. No sharp official still exists, so this pick stays out of
      // the page and out of the photo-order list rather than showing a placeholder.
      spot(
        "miracles",
        "Miracles",
        "Orlando · night",
        "The press release says Miracles is an inspirational nighttime orca presentation, returning for the first time since 2019. The shows page says it fills the night with majestic orcas, lights and holiday music. Pass Members have an exclusive showing on Friday, November 6 at 5:30pm, and SeaWorld says to scan a pass at the stadium entrance.",
        "The shows page does not name the stadium. Park policies do not print a separate filming rule for Miracles. They do say guest photos and videos may not be used for commercial purposes without SeaWorld's written consent.",
      ),
      spot(
        "holiday-reflections",
        "Holiday Reflections",
        "Orlando · at close",
        "The shows page says Holiday Reflections is fireworks, lights and holiday music at park close on Christmas Celebration nights through December 31, viewed as the night sky over the lagoon. The event page FAQ says the same finale runs until January 1 and can be viewed around the lagoon at park close. Use the park hours page for your night.",
        "New Year's Eve on December 31 is listed separately, with its own fireworks.",
      ),
    ],
    faq: [
      {
        q: "Which dates is Christmas Celebration actually on?",
        a: "SeaWorld's event pages say select dates from November 6, 2026 to January 4, 2027, and they send you to the park hours page for the day. A read of that calendar on November 19, 2026 tagged Christmas Celebration on November 6, 7 and 8, November 13, 14 and 15, every day from November 20 through November 29, December 4, 5 and 6, and every day from December 11, 2026 through January 4, 2027. It did not tag November 9 to 12, November 16 to 19, November 30, December 1 to 3, or December 7 to 10. The hours page did not show those day tags when checked on November 23, 2026, so confirm your date there.",
      },
      {
        q: "Is the celebration included with park admission?",
        a: "Yes. SeaWorld says Christmas Celebration is included with theme park admission. Food and drinks are an additional purchase. Public ice skating and Dinner with Santa have an additional fee. The pages do not print those prices.",
      },
      {
        q: "Where is Santa, and what does ice skating cost?",
        a: "Santa meet and greets and photo opportunities are near Expedition Odyssey Fire and Ice, and professional photographers are available. Dinner with Santa is separate, at Sea Harbor Pavilions, on select dates excluding opening weekend, and it has an additional fee. Public ice skating at Bayside Stadium is an additional charge that includes skate rental. SeaWorld does not print a dollar amount for either fee.",
      },
      {
        q: "When do the fireworks end?",
        a: "The shows page says Holiday Reflections is at park close on Christmas Celebration nights through December 31. The event page FAQ says until January 1. Check the park hours page for the night you go.",
      },
      {
        q: "Can I film Miracles?",
        a: "SeaWorld's park policies page does not print a separate rule for Miracles. It says no guest photos, videos or other recordings may be used for commercial purposes without SeaWorld's written consent. Recording on rides is a different rule: securely mounted cameras are allowed, and filming is subject to the ride operator.",
      },
      {
        q: "What if it rains?",
        a: "SeaWorld says many Christmas Celebration entertainment options are indoors and happen rain or shine. The schedule still varies, so use the park hours page.",
      },
    ],
    sources: [
      { label: "SeaWorld Orlando: Christmas Celebration", url: "https://seaworld.com/orlando/events/christmas-celebration/" },
      { label: "SeaWorld Orlando: Christmas shows", url: "https://seaworld.com/orlando/events/christmas-celebration/shows/" },
      { label: "SeaWorld Orlando press release, October 30, 2026", url: "https://seaworld.com/orlando/-/media/commercial/seaworld-orlando/files/pdfs/press-releases/swo_2026-1030_pr-christmas-celebration-final-(2).pdf" },
      { label: "SeaWorld Orlando: directions and address", url: "https://seaworld.com/orlando/park-info/directions/" },
      { label: "SeaWorld Orlando: park hours", url: "https://seaworld.com/orlando/park-info/theme-park-hours/" },
      { label: "SeaWorld Orlando: rides", url: "https://seaworld.com/orlando/rides/" },
      { label: "SeaWorld Orlando: park policies", url: "https://seaworld.com/orlando/park-info/park-policies/" },
    ],
  },
};
