// Evergreen search destinations. Dated editions expire from promotion, never
// roll into another year automatically. No paid provider calls on these pages.
export const SEASONAL_SEARCH_HUBS = [
  {
    slug: "fall-in-florida", label: "Fall in Florida", accent: "#fdba74",
    title: "Fall in Florida: Pumpkin Patches and Festivals",
    description: "Plan fall in Florida with pumpkin patches, corn mazes, festivals and food stops. Find the right guide for your city, budget and weekend.",
    intro: "Fall in Florida is a choice between a farm day, a festival weekend and an evening out. Start with the kind of outing you want, then check the guide for your area and the exact date. Use the statewide festival guide for pumpkin patches and corn mazes, the Orlando roundup for Central Florida events, and the Halloween guide when scares are the main attraction.",
    sections: [
      { id: "pumpkins", title: "Pumpkin patches, corn mazes and farm days", text: "For a day with kids, compare what admission includes before comparing ticket prices. A pumpkin purchase, hayride or animal encounter may be separate. Choose one farm as the main stop, check its weekday opening calendar and leave time for food, shade and the drive home.", links: [
        { href: "/guides/florida-fall-festivals-2026", label: "Florida fall festivals and pumpkin patches 2026", endsOn: "2026-11-30" },
        { href: "/guides/pintos-farm-miami-2026", label: "Pinto's Farm in Miami", endsOn: "2026-11-08" }
      ] },
      { id: "festivals", title: "Fall festivals and weekend plans", text: "Decide whether you want a full festival day or a short stop before dinner. Check the event's actual operating dates, parking arrangements and admission rules. A season running through November does not mean the venue opens every weekday.", links: [
        { href: "/guides/fall-events-orlando-2026", label: "Orlando fall events, festivals and food", endsOn: "2026-11-30" },
        { href: "/florida-events", label: "Upcoming Florida events" }
      ] },
      { id: "after-dark", title: "Fall after dark", text: "A haunted attraction and a relaxed fall dinner make very different nights. If anyone in your group dislikes jump scares, start with food, a market or a garden outing. For a haunt, check the age guidance and whether admission requires a separate evening ticket.", links: [
        { href: "/halloween-in-florida", label: "Halloween in Florida" },
        { href: "/guides/orlando-halloween-food-2026", label: "Orlando Halloween food and drinks", endsOn: "2026-11-01" }
      ] }
    ],
    checklist: ["Choose your city and your maximum drive before picking a festival.", "Check the date, opening hours and weather policy on the organizer's listing.", "Compare the total for admission, parking, food and optional activities."]
  },
  {
    slug: "halloween-in-florida", label: "Halloween in Florida", accent: "#d8b4fe",
    title: "Halloween in Florida: Haunts, Food and Family Fun",
    description: "Find your Halloween in Florida: haunted attractions, family outings and seasonal food. Compare scare levels, ticket rules and plans by destination.",
    intro: "The right Halloween plan in Florida starts with scare level. Choose haunted nights for a group that wants intensity, a daytime farm or family event for a gentler outing, or Halloween food for a night built around dinner. These guides help you compare the options and check ticket requirements before making the drive.",
    sections: [
      { id: "haunts", title: "Haunted attractions and Halloween nights", text: "Use the Orlando guide to compare the major Halloween nights and the statewide guide for other areas. Check minimum ages or recommended ages, bag and costume rules, entry times and whether regular park admission includes the event. Leave room in the budget for parking and any optional queue upgrade.", links: [
        { href: "/guides/fall-events-orlando-2026", label: "Compare Orlando Halloween events", endsOn: "2026-11-30" },
        { href: "/guides/florida-fall-festivals-2026", label: "Florida haunted attractions and fall events", endsOn: "2026-11-30" }
      ] },
      { id: "families", title: "Halloween with kids and fewer scares", text: "Look for an event that explicitly describes its family program. A pumpkin patch during the day can become a separate haunted experience after dark. Check which activities your child's ticket includes and choose an arrival time that fits their bedtime.", links: [
        { href: "/fall-in-florida", label: "Pumpkin patches and fall family plans" },
        { href: "/guides/orlando-in-the-rain", label: "Orlando indoor backup plans" }
      ] },
      { id: "food", title: "Halloween food, drinks and a date night", text: "Keep the food stop in the same area as the rest of your night. A seasonal menu inside a ticketed park is a different commitment from dinner in a public dining district. Our food guide separates the locations and access rules so you can plan the meal before booking admission.", links: [
        { href: "/guides/orlando-halloween-food-2026", label: "Orlando Halloween food 2026", endsOn: "2026-11-01" },
        { href: "/guides/best-restaurants-disney-springs", label: "Where to eat at Disney Springs" }
      ] }
    ],
    checklist: ["Agree on the scare level before choosing the venue.", "Check costume, age and admission rules for the specific event.", "Plan your ride home and an indoor alternative before buying tickets."]
  },
  {
    slug: "christmas-in-florida", label: "Christmas in Florida", accent: "#86efac",
    title: "Christmas in Florida: Lights and Holiday Events",
    description: "Plan Christmas in Florida with garden lights, boat parades and theme park celebrations. Read the holiday guides for dates, closed nights and ticket details.",
    intro: "Christmas in Florida can mean a garden light walk, a boat parade on the coast or a full theme park day. Choose the format that fits your group, then check the exact evening. Our holiday guides separate light displays, boat parades and park celebrations so you can compare the practical details without mixing three different kinds of outing.",
    sections: [
      { id: "lights", title: "Christmas lights and holiday nights out", text: "A garden light show is a good starting point for an evening rather than a whole day. Check timed entry, walking distance, accessibility and closed nights. Build dinner around the admission time, and check the weather policy before assuming a rainy evening can be moved.", links: [
        { href: "/guides/florida-holiday-nights-out-2026", label: "Florida Christmas lights and holiday nights 2026", endsOn: "2027-01-06" }
      ] },
      { id: "boat-parades", title: "Christmas boat parades and coastal traditions", text: "For a boat parade, the viewing location matters as much as the date. Compare the route, public viewing areas, parking and any reserved seating. Confirm the parade's departure time and allow for the boats to reach your part of the route later.", links: [
        { href: "/guides/florida-christmas-boat-parades-2026", label: "Florida Christmas boat parades 2026", endsOn: "2027-01-06" }
      ] },
      { id: "parks", title: "Theme park Christmas and family celebrations", text: "Choose whether you want rides with a holiday atmosphere or a specific evening celebration. Check if the holiday program comes with regular admission or needs its own ticket. Compare parking, food and opening times before choosing the cheapest advertised admission.", links: [
        { href: "/guides/florida-theme-park-christmas-2026", label: "Florida theme park Christmas guide 2026", endsOn: "2027-01-06" },
        { href: "/guides/best-hotels-near-magic-kingdom", label: "Compare hotels near Magic Kingdom" }
      ] },
      { id: "new-year", title: "Staying through New Year's?", text: "Christmas programming and New Year's Eve admission are not interchangeable. Check December 31 separately, including restaurant reservations, event tickets and transport after midnight.", links: [
        { href: "/new-years-in-florida", label: "Plan New Year's in Florida" }
      ] }
    ],
    checklist: ["Check Christmas Eve and Christmas Day separately from regular holiday opening hours.", "Book the date and time you want, not just the general holiday season.", "For boat parades, choose the viewing point before planning parking or dinner."]
  },
  {
    slug: "new-years-in-florida", label: "New Year's in Florida", accent: "#fde68a",
    title: "New Year's in Florida: Fireworks and Countdown Plans",
    description: "Plan New Year's in Florida with a family countdown, fireworks or a night out. Check current announcements, ticket inclusions and transport before booking.",
    intro: "For New Year's in Florida, choose your city and your kind of countdown first: an early family celebration, a public fireworks outing or a ticketed night out. Then plan dinner and the trip home in the same area. December 31 event details change by edition, so this page distinguishes a current announcement from general planning advice.",
    feature: {
      heading: "Announced for the countdown to 2027",
      text: "Visit Panama City Beach is promoting its New Year's Eve Beach Ball Drop to welcome 2027, with music and fireworks. Its page still says the schedule is coming soon. Check the organizer's latest program before relying on a start time, and remember Panama City Beach uses Central Time.",
      label: "Check the official Panama City Beach announcement",
      href: "https://www.visitpanamacitybeach.com/events/holiday-events/new-years-eve/",
      checkedAt: "2026-10-09", endsOn: "2027-01-01"
    },
    sections: [
      { id: "families", title: "New Year's Eve with kids", text: "Look for an explicitly advertised early countdown and confirm whether its fireworks are separate from the midnight show. Check toilets, parking, stroller access and the walk back to your car. An early meal nearby makes the evening simpler than crossing the city between dinner and the countdown.", links: [
        { href: "/guides", label: "Choose a Florida city guide" }
      ] },
      { id: "night-out", title: "A New Year's night out", text: "For a ticketed party, compare the full offer: entry time, age restriction, seating, food, drinks and reentry. A general nightlife guide is useful for choosing an area, but it does not confirm a venue is hosting a New Year's event. Verify the December 31 program directly before paying.", links: [
        { href: "https://blog.gowayfind.com/best-bars-nightlife-orlando", label: "Orlando nightlife guide for choosing an area" },
        { href: "/florida-events", label: "Browse current Florida event listings" }
      ] },
      { id: "fireworks", title: "Fireworks and public countdowns", text: "Choose a designated viewing area rather than assuming any waterfront spot is open. Read the organizer's road closure, parking and weather notices. In the Panhandle, check the local time zone before coordinating with friends elsewhere in Florida. Arrange the return trip before the celebration starts.", links: [
        { href: "/guides", label: "Explore Florida destinations" }
      ] },
      { id: "new-years-day", title: "New Year's Day without a rushed start", text: "Pick one relaxed outing near where you are staying. Check January 1 opening hours directly, even if a restaurant or attraction normally opens that weekday. If you want holiday lights during the trip, use the Christmas guide to check the published end date and closed nights.", links: [
        { href: "/christmas-in-florida", label: "Christmas lights and holiday outings" }
      ] }
    ],
    checklist: ["Confirm that the listing is for December 31 of the year you intend to visit.", "Check the event's local time zone and the difference between early and midnight countdowns.", "Compare the full ticket inclusions and arrange transport before the night begins."]
  }
];

export function seasonalSearchHub(slug) {
  return SEASONAL_SEARCH_HUBS.find((hub) => hub.slug === slug) || null;
}

export function seasonalSearchSections(hub, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today || "")) throw new Error("seasonalSearchSections requires an Eastern calendar date");
  return hub.sections.map((section) => ({ ...section, links: section.links.filter((link) => !link.endsOn || link.endsOn >= today) }));
}

export function seasonalHubsForGuide(slug) {
  return SEASONAL_SEARCH_HUBS.filter((hub) => hub.sections.some((section) => section.links.some((link) => link.href === "/guides/" + slug)));
}
