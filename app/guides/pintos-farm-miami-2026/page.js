import GuideArticleHero from "../../components/GuideArticleHero";
import GuidePhoto from "../../components/GuidePhoto";
import PintosFarmMap from "./PintosFarmMap";
import { guideHero } from "../../../lib/guideHero";
import styles from "./page.module.css";

const SLUG = "pintos-farm-miami-2026";
const OFFICIAL_TICKETS = "https://pintosfarm.ticketspice.com/pintos-farm-2026";
const OFFICIAL_EVENTS = "https://pintofarm.com/upcoming-events";
const PINTOS_FARM_SITE = "https://pintofarm.com";

const heroPhoto = guideHero(SLUG);

// Pinto's Farm approved Wayfind's use of its own photographs from pintofarm.com
// (owner-confirmed 2026-09-22); credit to Pinto's Farm is the only condition.
// Owner decision, 2026-09-22: these credited photos replace the generic place
// card on this guide. Captions describe only what is visible in each photo.
const GALLERY = [
  {
    src: "/guides/pintos-farm-miami-2026/gallery-kids-pedal-go-karts-race-track.webp",
    width: 1200,
    height: 800,
    alt: "Kids riding pedal go-karts on Pinto's Farm race track",
    caption: "The race track: pedal go-karts."
  },
  {
    src: "/guides/pintos-farm-miami-2026/gallery-child-feeding-cow-fence.webp",
    width: 1200,
    height: 1604,
    alt: "A child feeding a cow over a wooden fence at the petting zoo",
    caption: "Feeding time at the petting zoo."
  },
  {
    src: "/guides/pintos-farm-miami-2026/gallery-baby-goat-grass.webp",
    width: 1200,
    height: 1286,
    alt: "A baby goat standing on the grass",
    caption: "One of the farm's baby goats."
  },
  {
    src: "/guides/pintos-farm-miami-2026/gallery-woman-petting-horse-fence.webp",
    width: 1200,
    height: 1551,
    alt: "A woman petting a horse at a fence",
    caption: "Horses at the fence line."
  },
  {
    src: "/guides/pintos-farm-miami-2026/gallery-goat-yoga.webp",
    width: 1200,
    height: 800,
    alt: "Goats standing on a person's back during Goat Yoga",
    caption: "Goat Yoga: goats climb on for photos."
  },
  {
    src: "/guides/pintos-farm-miami-2026/gallery-dog-bandana-paddle-boat.webp",
    width: 1200,
    height: 1449,
    alt: "A dog wearing a bandana on a blue paddle boat",
    caption: "Dog-friendly days include the boat ride."
  },
  {
    src: "/guides/pintos-farm-miami-2026/gallery-brewhouse-cups-toast.webp",
    width: 1200,
    height: 1441,
    alt: "Two Pinto's Brewhouse cups toasting",
    caption: "A toast at the Brewhouse."
  },
  {
    src: "/guides/pintos-farm-miami-2026/gallery-2026-pumpkin-patch-flyer.webp",
    width: 1080,
    height: 1350,
    alt: "Pinto's Farm official 2026 Pumpkin Patch flyer, September 19 through November 8",
    caption: "Pinto's official 2026 Pumpkin Patch flyer."
  }
];

const shareImage = "/api/og?t=Pinto%27s%20Farm%202026&loc=Miami&cta=OPEN%20THE%20GUIDE&sub=Rides%20%E2%80%A2%20animals%20%E2%80%A2%20pumpkins%20%E2%80%A2%20map&tone=fall";

export const metadata = {
  title: "Pinto's Farm Miami 2026: Fall Guide, Tickets & Farm Map",
  description: "Plan Pinto's Farm in Miami for Fall at the Farm 2026 with dates, hours, included rides and animals, ticket choices, dog-friendly dates, special events and a farm layout.",
  robots: { index: true, follow: true },
  alternates: { canonical: "/guides/pintos-farm-miami-2026" },
  openGraph: {
    title: "Pinto's Farm Miami 2026",
    description: "The useful Pinto's guide: tickets, rides, animals, fall dates, special events and a farm map.",
    url: "/guides/pintos-farm-miami-2026",
    images: [shareImage]
  },
  twitter: {
    card: "summary_large_image",
    title: "Pinto's Farm Miami 2026",
    description: "Tickets, rides, animals, fall dates, special events and a farm map.",
    images: [shareImage]
  }
};

const facts = [
  ["Fall season", "Sep 19 to Nov 8, 2026"],
  ["Thu + Fri", "2 PM to 7 PM"],
  ["Sat + Sun", "9 AM to 7 PM"],
  ["Animals", "Close at 6 PM"],
  ["Tickets", "Required age 2+"],
  ["Location", "Miami Redland"]
];

const included = [
  ["Boat ride", "Included"],
  ["Tractor ride", "Included"],
  ["Race track", "Included"],
  ["Petting zoo", "Included"],
  ["Bounce pad", "Included"],
  ["Fall photo spots", "Included"],
  ["Corn maze", "Included"],
  ["Pony rides", "Up to 75 lb and 48 in"]
];

const tickets = [
  ["Thu + Fri regular", "$18.69 before fee", "Best lower-cost full farm visit", "2 PM to 7 PM"],
  ["Weekend regular", "$26.16 to $33.64 before fee", "Full Saturday or Sunday visit", "9 AM to 7 PM"],
  ["Weekend Early Bird", "$22.42 to $28.60 before fee", "Cooler morning and lighter crowds", "Check in 9 AM to 10 AM"],
  ["Pumpkins & Pints", "$12 before fee", "Evening Brewhouse stop", "6 PM to 9 PM, not full farm"],
  ["Oktoberfest", "$51 plus listed fee", "Beer tasting, live music, age 21+", "Oct 3, 4 PM to 9 PM"],
  ["Oktoberfest + farm", "$68 plus listed fee", "Do both on Oct 3", "Pumpkin patch plus Oktoberfest"]
];

const magicShows = [
  ["Sep 19, 20, 26 + 27", "1 PM"],
  ["Oct 10 + 11", "12 PM + 2 PM"],
  ["Oct 17 + 24", "12 PM + 2 PM + 4 PM"],
  ["Oct 18 + 25", "12 PM + 2 PM + 4 PM + 6 PM"],
  ["Oct 31 + Nov 1", "12 PM + 2 PM"],
  ["Nov 7 + 8", "1 PM"]
];

const otherSeasons = [
  ["Winterland / Christmas at the Farm", "Pinto's other major family season, built around holiday decor, photo scenes, animals and the farm's core attractions. Check the current ticket page when 2026 to 2027 dates go live."],
  ["Spring at the Farm / Easter", "The spring version pairs the farm's core rides and animals with Easter and spring programming. Exact dates and special activities change by year."],
  ["Lattes & Llamas", "A lighter morning format built around coffee, breakfast and llama time. Treat dates as limited and check the current event calendar before driving."],
  ["Brewhouse + llama evenings", "Craft beer, food, live music and llama time give adults and families a reason to visit outside the main seasonal ticket windows."]
];

export default function PintosFarmGuidePage() {
  return (
    <main className={styles.page}>
      <GuideArticleHero
        title="Pinto's Farm Miami: Fall 2026"
        description="Rides, animals, pumpkins, a corn maze, photo spots and the ticket details that matter, plus a Wayfind map for planning the farm."
        image={heroPhoto}
        region="Miami"
        category="Farm guide"
        updatedLabel="Checked September 22, 2026"
        jumpHref="#guide"
        jumpLabel="Plan your visit"
      />

      <article id="guide" className={styles.article}>
        <section className={styles.lead}>
          <p className={styles.kicker}>The useful answer</p>
          <h2>A full young-family fall day, not just a pumpkin stop.</h2>
          <p>
            Pinto's Farm runs Fall at the Farm from <strong>September 19 through November 8, 2026</strong>.
            Regular admission includes the boat ride, tractor ride, race track, petting zoo, bounce pad,
            fall photo spots, corn maze and pony rides for children who meet the posted limits.
            The strongest plan is simple: arrive early, do animals first, then rides, photos and the maze.
          </p>
        </section>

        <div className={styles.factGrid}>
          {facts.map(([label, value]) => <div className={styles.fact} key={label}><small>{label}</small><strong>{value}</strong></div>)}
        </div>

        <section className={styles.cardSection} aria-labelledby="gallery-heading">
          <div className={styles.sectionHead}>
            <div><p className={styles.kicker}>Photo gallery</p><h2 id="gallery-heading">See Pinto's Farm</h2></div>
            <a href={OFFICIAL_TICKETS} target="_blank" rel="noopener" className={styles.primaryAction}>Official tickets ↗</a>
          </div>
          <div className={styles.galleryGrid}>
            {GALLERY.map((photo) => (
              <figure className={styles.galleryItem} key={photo.src}>
                <GuidePhoto
                  src={photo.src}
                  alt={photo.alt}
                  width={photo.width}
                  height={photo.height}
                  sizes="(max-width: 700px) 47vw, (max-width: 1000px) 31vw, 23vw"
                  loading="lazy"
                  decoding="async"
                  className={styles.galleryImg}
                  fallbackClassName={styles.galleryFallback}
                />
                <figcaption className={styles.galleryCaption}>{photo.caption}</figcaption>
              </figure>
            ))}
          </div>
          <p className={styles.galleryCredit}>
            Photos courtesy of{" "}
            <a href={PINTOS_FARM_SITE} target="_blank" rel="noopener">Pinto's Farm</a>
          </p>
        </section>

        <PintosFarmMap />

        <section className={styles.section}>
          <p className={styles.kicker}>What your ticket covers</p>
          <h2>Eight included fall activities</h2>
          <div className={styles.includedGrid}>
            {included.map(([name, detail]) => <div className={styles.includedItem} key={name}><strong>{name}</strong><span>{detail}</span></div>)}
          </div>
          <p className={styles.smallPrint}>All animal encounters close at 6 PM. Pony rides are limited to children up to 75 pounds and 48 inches tall.</p>
        </section>

        <section className={styles.section}>
          <p className={styles.kicker}>Pick the right admission</p>
          <h2>2026 ticket choices</h2>
          <div className={styles.ticketTable} role="table" aria-label="Pinto's Farm 2026 fall tickets">
            {tickets.map(([name, price, fit, timing]) => (
              <div className={styles.ticketRow} role="row" key={name}>
                <div role="cell"><strong>{name}</strong><small>{fit}</small></div>
                <div role="cell"><b>{price}</b><small>{timing}</small></div>
              </div>
            ))}
          </div>
          <p className={styles.smallPrint}>Ticket prices are the amounts displayed on Pinto's 2026 ticket page before the listed ticketing fees and can vary by selected weekend date.</p>
        </section>

        <section className={styles.split}>
          <div className={styles.panel}>
            <p className={styles.kicker}>Best family plan</p>
            <h2>Go early and front-load the animals.</h2>
            <ol>
              <li>Weekend: check in before 10 AM if you bought Early Bird.</li>
              <li>Do the petting zoo and pony rides before anything else.</li>
              <li>Move to the tractor, boat and race track before peak heat.</li>
              <li>Take photos before everyone is tired.</li>
              <li>Finish with the corn maze, bounce pad and a shake or smoothie.</li>
            </ol>
          </div>
          <div className={styles.panel}>
            <p className={styles.kicker}>Know before you go</p>
            <h2>The rules that change the day.</h2>
            <ul>
              <li>Every guest age 2 and older needs a ticket.</li>
              <li>Outside food, drinks and coolers are not allowed.</li>
              <li>Tickets are nonrefundable under the posted policy.</li>
              <li>Wear secure shoes for outdoor farm terrain.</li>
              <li>Early Bird arrivals after 10 AM pay the regular-price difference.</li>
            </ul>
          </div>
        </section>

        <section className={styles.section}>
          <p className={styles.kicker}>Special dates</p>
          <h2>Dog days, Goat Yoga and Oktoberfest</h2>
          <div className={styles.eventGrid}>
            <article><strong>Dog-friendly fall days</strong><p>September 26 and 27, every Thursday and Friday during the fall run, and November 7 and 8. Service dogs are always welcome under the posted policy.</p></article>
            <article><strong>Goat Yoga</strong><p>The 2026 fall ticket page lists a September 27 session at 9 AM: a 40-minute beginner class plus goat photo time. Children must be at least 5 and accompanied by an adult.</p></article>
            <article><strong>Oktoberfest, October 3</strong><p>4 PM to 9 PM, age 21+. The ticket includes beer tastings from participating local breweries, a souvenir tasting glass and live music. The standalone ticket does not include the pumpkin patch.</p></article>
          </div>
          <div className={styles.magicBlock}>
            <div>
              <p className={styles.kicker}>Magic show calendar</p>
              <h3>Choose the date around the show.</h3>
            </div>
            <div className={styles.magicGrid}>
              {magicShows.map(([dates, times]) => <div key={dates}><span>{dates}</span><strong>{times}</strong></div>)}
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <p className={styles.kicker}>Night option</p>
          <h2>Pumpkins & Pints is a different experience.</h2>
          <p className={styles.bodyCopy}>
            Pumpkins & Pints runs Friday through Sunday from 6 PM to 9 PM. It gives you the Brewhouse area and one small or medium pumpkin.
            It does <strong>not</strong> include the rest of the farm, rides or animal attractions. Choose it for an easy evening, not as a cheaper substitute for regular admission.
          </p>
        </section>

        <section className={styles.section}>
          <p className={styles.kicker}>Beyond fall</p>
          <h2>Pinto's has more than pumpkin season.</h2>
          <div className={styles.eventGrid}>
            {otherSeasons.map(([name, detail]) => <article key={name}><strong>{name}</strong><p>{detail}</p></article>)}
          </div>
        </section>

        <section className={styles.cta}>
          <div><p className={styles.kicker}>Ready to go?</p><h2>Check your exact date before driving.</h2><p>Ticket inventory, weekend pricing and limited-date experiences can change.</p></div>
          <div className={styles.ctaActions}>
            <a href={OFFICIAL_TICKETS} target="_blank" rel="noopener" className={styles.primaryAction}>Check tickets ↗</a>
            <a href={OFFICIAL_EVENTS} target="_blank" rel="noopener" className={styles.secondaryAction}>Current events ↗</a>
          </div>
        </section>

        <p className={styles.method}>Facts on this page were checked against Pinto's current 2026 ticketing and event information on September 22, 2026. Seasonal operations can change with weather and farm conditions.</p>
      </article>
    </main>
  );
}
