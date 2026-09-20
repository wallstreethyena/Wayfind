import GuideArticleHero from "../../components/GuideArticleHero";
import PosterEventCard from "../../components/PosterEventCard";
import styles from "./page.module.css";

export const metadata = {
  title: "Florida Fall Festivals 2026 | Wayfind",
  description: "A verified Wayfind guide to Florida fall festivals, pumpkin weekends, Oktoberfest, music, food and Halloween events.",
  robots: { index: false, follow: false },
};

const hero = {
  src: "/cards-v8/augtober-760.webp",
  alt: "",
};

const pumpkin = [
  {
    id: "fruitville-grove-pumpkin-2026",
    name: "Fruitville Grove Pumpkin Festival",
    date: "2026-10-03",
    venue: "Fruitville Grove",
    city: "Sarasota",
    genre: "Pumpkin & Harvest",
    ticketed: false,
    thumb: "/api/photo?place=ChIJhWqZvoVHw4gRehUSFsbZARo&w=800",
    dest: "/florida-events/fruitville-grove-pumpkin-festival-2026",
    destKind: "internal",
  },
  {
    id: "dakin-harvest-festival-2026",
    name: "Dakin Dairy Farms Harvest Festival",
    date: "2026-10-10",
    venue: "Dakin Dairy Farms",
    city: "Myakka City",
    genre: "Pumpkin & Harvest",
    thumb: "/api/photo?place=ChIJB_GKfW81w4gRsCQHi5hjasA&w=640",
    dest: "/florida-events/dakin-dairy-harvest-festival-2026",
    destKind: "internal",
  },
  {
    id: "hunsader-pumpkin-2026",
    name: "Hunsader Farms Pumpkin Festival",
    date: "2026-10-10",
    venue: "Hunsader Farms",
    city: "Bradenton",
    genre: "Pumpkin & Harvest",
    price: "$5–$15",
    dest: "/florida-events/hunsader-farms-pumpkin-festival-2026",
    destKind: "internal",
  },
  {
    id: "amber-brooke-fall-festival-2026",
    name: "Amber Brooke Farms Fall Festival",
    date: "2026-09-19",
    venue: "Amber Brooke Farms",
    city: "Eustis",
    genre: "Pumpkin & Harvest",
    price: "$19.95–$23.95",
    thumb: "/api/photo?place=ChIJkyg5UW6654gRECAKyCherD8&w=800",
    dest: "/florida-events/amber-brooke-farms-fall-festival-2026",
    destKind: "internal",
  },
];

const food = [
  {
    id: "oktoberfest-tampa-curtis-hixon-2026",
    name: "Oktoberfest Tampa",
    date: "2026-10-09",
    venue: "Curtis Hixon Waterfront Park",
    city: "Tampa",
    genre: "Food & Oktoberfest",
    thumb: "/api/photo?place=ChIJlRUlG4nEwogRJOgu0Hf2n54&w=800",
    dest: "/florida-events/oktoberfest-tampa-curtis-hixon-2026",
    destKind: "internal",
  },
  {
    id: "johns-pass-seafood-2026",
    name: "John's Pass Seafood Festival",
    date: "2026-10-23",
    venue: "John's Pass Village",
    city: "Madeira Beach",
    genre: "Food Festival",
    thumb: "/api/photo?place=ChIJsSzTxNr9wogRj9Du3yLgZLU&w=800",
    dest: "/florida-events/johns-pass-seafood-festival-2026",
    destKind: "internal",
  },
];

const music = [
  {
    id: "clearwater-jazz-2026",
    name: "Clearwater Jazz Holiday",
    date: "2026-10-15",
    venue: "Clearwater",
    city: "Clearwater",
    genre: "Music & Culture",
    thumb: "/api/photo?place=ChIJ9_6n_N7wwogR0_89wCluWV0&w=800",
    dest: "/florida-events/clearwater-jazz-holiday-2026",
    destKind: "internal",
  },
  {
    id: "tampa-pig-jig-2026",
    name: "Tampa Pig Jig",
    date: "2026-10-17",
    venue: "Julian B. Lane Riverfront Park",
    city: "Tampa",
    genre: "Music & Food",
    thumb: "/api/photo?place=ChIJ-U84wHnEwogR9ry4KMSoZW8&w=800",
    dest: "/florida-events/tampa-pig-jig-2026",
    destKind: "internal",
  },
  {
    id: "water-lantern-festival-sarasota-2026",
    name: "Sarasota Water Lantern Festival",
    date: "2026-10-17",
    venue: "Nathan Benderson Park",
    city: "Sarasota",
    genre: "Special Event",
    dest: "/florida-events/water-lantern-festival-sarasota-2026",
    destKind: "internal",
  },
];

const halloween = [
  {
    id: "gatorland-ghosts-goblins-2026",
    name: "Gators, Ghosts & Goblins",
    date: "2026-10-10",
    venue: "Gatorland",
    city: "Orlando",
    genre: "Halloween",
    thumb: "/api/photo?place=ChIJ9RHZGx6H3YgRnWVYIWsHNPM&w=800",
    dest: "/florida-events/gatorland-gators-ghosts-goblins-2026",
    destKind: "internal",
  },
  {
    id: "halloween-on-central-st-pete-2026",
    name: "Halloween on Central",
    date: "2026-10-25",
    venue: "Central Avenue",
    city: "St. Petersburg",
    genre: "Halloween",
    ticketed: false,
    dest: "/florida-events/halloween-on-central-st-pete-2026",
    destKind: "internal",
  },
];

const sections = [
  ["Pumpkin & Harvest", "Weekend farms, pumpkin patches and harvest festivals.", pumpkin],
  ["Food & Oktoberfest", "Beer gardens, seafood and fall food weekends.", food],
  ["Music & Culture", "Live music and memorable fall-night events.", music],
  ["Halloween", "Spooky season without mixing in cancelled or unverified listings.", halloween],
];

function EventRail({ title, description, events, id }) {
  if (!events.length) return null;
  return (
    <section className={styles.section} aria-labelledby={id}>
      <div className={styles.sectionHead}>
        <div>
          <p className={styles.kicker}>Wayfind picks</p>
          <h2 id={id}>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className={styles.rail} data-rail={id}>
        {events.map((event, index) => (
          <PosterEventCard key={event.id} event={event} rank={index + 1} surface="guide_florida_fall_2026" />
        ))}
      </div>
    </section>
  );
}

export default function FloridaFallFestivalsGuide() {
  return (
    <main className={styles.page}>
      <GuideArticleHero
        title="Florida Fall Festivals 2026"
        description="Pumpkin weekends, music, food and spooky season. One verified Florida fall guide, built around events worth leaving home for."
        image={hero}
        region="Florida"
        category="Seasonal guide"
        updatedLabel="Preview · verified event set in progress"
        backHref="/guides"
        backLabel="All guides"
        jumpHref="#guide"
        jumpLabel="Explore the events"
      />

      <div id="guide" className={styles.content}>
        <div className={styles.intro}>
          <p className={styles.kicker}>Find fall nearby</p>
          <h2>Pick the weekend first.</h2>
          <p>
            This preview turns the festival screenshots into Wayfind instead of copying a giant list.
            Repeated weekends are consolidated, cancelled events stay out, and every card hands off to
            the existing Wayfind event page for the map, schedule and any verified ticket action.
          </p>
        </div>

        {sections.map(([title, description, events], index) => (
          <EventRail
            key={title}
            title={title}
            description={description}
            events={events}
            id={`fall-section-${index + 1}`}
          />
        ))}

        <aside className={styles.note}>
          <strong>Preview rule:</strong> events still awaiting organizer confirmation or exact photo clearance are not
          promoted here yet. Hunsader is intentionally shown without an unrelated replacement photo.
        </aside>
      </div>
    </main>
  );
}
