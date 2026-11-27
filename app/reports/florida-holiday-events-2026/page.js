import { SITE_URL } from "../../../lib/site";
import ShareButton from "../../components/ShareButton";
import { pageShareUrl } from "../../../lib/pageShareUrl";
import { holidayReportData } from "../../../lib/holidayReportData";
import {
  HOLIDAY_REPORT_CSV_PATH, HOLIDAY_REPORT_PATH, HOLIDAY_REPORT_PUBLISHED, HOLIDAY_REPORT_TITLE,
  holidayReportSchema, reportDayLabel, reportLongDate, reportShortDay,
} from "../../../lib/holidayReport";
import styles from "./report.module.css";

// 2026-11-27 (owner: "Yes, all four"): a citable data report built only from
// Wayfind's own listings, for reporters and bloggers to link. Every number is
// computed per request from the cached Christmas collection read (the same
// list /christmas-in-florida shows) by lib/holidayReport.js; nothing is typed
// in by hand. A build time read is a skip, so the page renders at request time.
export const dynamic = "force-dynamic";

const URL_ = SITE_URL + HOLIDAY_REPORT_PATH;
const title = HOLIDAY_REPORT_TITLE;
const description = "How many holiday events Florida has this season, where they are, how many are free and which days are busiest. Wayfind's 2026 report, built from its own verified event listings and updated daily.";
const OG_URL = SITE_URL + "/api/og?t=" + encodeURIComponent(title);

export const metadata = {
  title: title + ": Christmas Events by the Numbers",
  description,
  alternates: { canonical: URL_ },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  openGraph: { title, description, url: URL_, type: "article", siteName: "Wayfind", publishedTime: HOLIDAY_REPORT_PUBLISHED, images: [{ url: OG_URL, width: 1200, height: 630, alt: title }] },
  twitter: { card: "summary_large_image", title, description, images: [OG_URL] },
};

function Bars({ items, labelOf, valueOf, max, label }) {
  const top = Math.max(1, max ?? Math.max(...items.map(valueOf)));
  return <ul className={styles.bars} aria-label={label}>
    {items.map((it) => {
      const v = valueOf(it);
      return <li className={styles.bar} key={labelOf(it)}>
        <span className={styles.barLabel}>{labelOf(it)}</span>
        <span className={styles.barTrack}>
          <span className={styles.barFill} style={{ width: `${Math.max(1, (v / top) * 82)}%` }} aria-hidden="true" />
          <span className={styles.barValue}>{v}</span>
        </span>
      </li>;
    })}
  </ul>;
}

function DayChart({ daily, busiest }) {
  const n = daily.length;
  if (!n) return null;
  const max = Math.max(1, ...daily.map((d) => d.count));
  const cols = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
  const isSat = (day) => new Date(day + "T12:00:00Z").getUTCDay() === 6;
  return <figure style={{ margin: 0 }}>
    <div className={styles.dayChart} style={cols} role="img" aria-label={`Holiday listings open each day from ${reportShortDay(daily[0].day)} to ${reportShortDay(daily[n - 1].day)}. The busiest day is ${reportDayLabel(busiest.day)} with ${busiest.count}.`}>
      {daily.map((d) => <span key={d.day} title={`${reportDayLabel(d.day)}: ${d.count}`}
        className={`${styles.dayCol} ${d.day === busiest.day ? styles.dayColTop : isSat(d.day) ? styles.dayColSat : ""}`}
        style={{ height: `${Math.max(1, (d.count / max) * 100)}%` }} />)}
    </div>
    <div className={styles.dayTicks} style={cols} aria-hidden="true">
      {daily.map((d) => <span key={d.day} className={styles.dayTick}>{isSat(d.day) ? reportShortDay(d.day) : ""}</span>)}
    </div>
    <ul className={styles.legend}>
      <li><span className={styles.swatch} style={{ background: "#f6a36c" }} />Saturday</li>
      <li><span className={styles.swatch} style={{ background: "#ffd2ad" }} />Busiest day</li>
      <li><span className={styles.swatch} style={{ background: "#3a4a5c" }} />Other days</li>
    </ul>
  </figure>;
}

function NumbersTable({ caption, rows }) {
  return <details className={styles.details}>
    <summary>{caption}</summary>
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr><th scope="col">Item</th><th scope="col">Listings</th></tr></thead>
        <tbody>{rows.map(([k, v]) => <tr key={k}><td>{k}</td><td>{v}</td></tr>)}</tbody>
      </table>
    </div>
  </details>;
}

export default async function Page() {
  const data = await holidayReportData();
  const asOf = reportLongDate(data.today);
  const header = <>
    <p className={styles.crumbs}><a href="/christmas-in-florida">Christmas in Florida</a></p>
    <p className={styles.eyebrow}>Wayfind data report</p>
    <h1 className={styles.title}>{title}</h1>
    <p className={styles.lede}>How many holiday events Florida has this season, where they are, how many are free and which days are busiest. Built from Wayfind&rsquo;s own verified event listings.</p>
    <p className={styles.meta}>Data as of <strong>{asOf}</strong>. Updated daily. Published {reportLongDate(HOLIDAY_REPORT_PUBLISHED)}.</p>
  </>;
  if (!data.ok) {
    return <main className={styles.page} data-wf-own-theme="holiday-report">
      {header}
      <p className={styles.notice}>The live numbers are refreshing right now. Please check back in a few minutes. Every holiday listing is on <a href="/christmas-in-florida" style={{ color: "#fde68a" }}>Christmas in Florida</a>.</p>
    </main>;
  }
  const m = data.model;
  const schema = holidayReportSchema(m, { siteUrl: SITE_URL, description });
  const citeText = `Wayfind, "${title}," gowayfind.com${HOLIDAY_REPORT_PATH}, data as of ${asOf}.`;
  const pctOf = (n) => (m.total ? Math.round((n / m.total) * 100) : 0);
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
    <main className={styles.page} data-wf-own-theme="holiday-report" data-holiday-report="">
      {header}
      <div className={styles.actions}>
        <ShareButton url={pageShareUrl("/reports/florida-holiday-events-2026")} title={title} text={description} tone="dark" event="page_share" meta={{ surface: "holiday_report" }} />
        <a className={styles.button} href={HOLIDAY_REPORT_CSV_PATH} download>Download the data (CSV)</a>
      </div>

      <ul className={styles.stats} aria-label="Report at a glance">
        <li className={styles.stat}><span className={styles.statValue}>{m.total}</span><span className={styles.statLabel}>holiday events and experiences through {reportShortDay(m.seasonEnd)}</span></li>
        <li className={styles.stat}><span className={styles.statValue}>{m.cityCount}</span><span className={styles.statLabel}>Florida cities and towns with a listing</span></li>
        {m.freeShareOfPriced != null ? <li className={styles.stat}><span className={styles.statValue}>{m.freeShareOfPriced}%</span><span className={styles.statLabel}>of events with a published price are free</span></li> : null}
        {m.busiestDay ? <li className={styles.stat}><span className={styles.statValue}>{reportShortDay(m.busiestDay.day)}</span><span className={styles.statLabel}>busiest day, {m.busiestDay.count} listings open</span></li> : null}
      </ul>

      <section className={styles.section} id="findings" aria-labelledby="findings-h">
        <h2 id="findings-h">Key findings</h2>
        <p className={styles.sub}>Each line is computed from the listings below and can be quoted with the citation at the end of this page.</p>
        <ol className={styles.findings}>{m.findings.map((f) => <li className={styles.finding} id={"finding-" + f.id} key={f.id}>{f.text}</li>)}</ol>
      </section>

      {m.busiestDay ? <section className={styles.section} id="busiest-days" aria-labelledby="days-h">
        <h2 id="days-h">The busiest days</h2>
        <p className={styles.sub}>Holiday listings open on each day through {reportShortDay(m.seasonEnd)}, counting only listings with a confirmed date for that day.</p>
        <DayChart daily={m.daily} busiest={m.busiestDay} />
        {m.saturdays.length ? <><h3 style={{ margin: "22px 0 8px", fontSize: 16 }}>Saturdays</h3><Bars items={m.saturdays} labelOf={(d) => reportDayLabel(d.day)} valueOf={(d) => d.count} label="Holiday listings open each Saturday" /></> : null}
        <NumbersTable caption="See every day" rows={m.daily.map((d) => [reportDayLabel(d.day), d.count])} />
      </section> : null}

      <section className={styles.section} id="where" aria-labelledby="where-h">
        <h2 id="where-h">Where the holiday events are</h2>
        <p className={styles.sub}>Listings by region and by city. {m.cityCount} cities and towns have at least one.</p>
        <div className={styles.grid2}>
          <div><h3 style={{ margin: "0 0 8px", fontSize: 16 }}>By region</h3><Bars items={m.regions} labelOf={(r) => r.name} valueOf={(r) => r.count} label="Holiday listings by Florida region" /></div>
          <div><h3 style={{ margin: "0 0 8px", fontSize: 16 }}>Top 10 cities</h3><Bars items={m.topCities} labelOf={(c) => c.city} valueOf={(c) => c.count} label="Holiday listings in the top 10 cities" /></div>
        </div>
        <NumbersTable caption="See every city" rows={m.cities.map((c) => [c.city, c.count])} />
      </section>

      {m.types.length ? <section className={styles.section} id="types" aria-labelledby="types-h">
        <h2 id="types-h">What kind of events</h2>
        <p className={styles.sub}>A listing can fit more than one type, so these numbers add up to more than {m.total}.</p>
        <Bars items={m.types} labelOf={(t) => t.label} valueOf={(t) => t.count} max={m.total} label="Holiday listings by type" />
      </section> : null}

      <section className={styles.section} id="price" aria-labelledby="price-h">
        <h2 id="price-h">Free, ticketed or not announced</h2>
        <p className={styles.sub}>What organizers have published about price. A listing is free only when the organizer says so.</p>
        <div className={styles.split} role="img" aria-label={`${m.free} free, ${m.paid} ticketed, ${m.unannounced} with no price announced`}>
          <span className={styles.free} style={{ width: pctOf(m.free) + "%" }} />
          <span className={styles.paid} style={{ width: pctOf(m.paid) + "%" }} />
          <span className={styles.unknown} style={{ width: pctOf(m.unannounced) + "%" }} />
        </div>
        <ul className={styles.legend}>
          <li><span className={`${styles.swatch} ${styles.free}`} />Free: {m.free} ({pctOf(m.free)}%)</li>
          <li><span className={`${styles.swatch} ${styles.paid}`} />Ticketed: {m.paid} ({pctOf(m.paid)}%)</li>
          <li><span className={`${styles.swatch} ${styles.unknown}`} />No price announced: {m.unannounced} ({pctOf(m.unannounced)}%)</li>
        </ul>
        <p className={styles.barNote}>{m.family} listings ({m.familyShare}%) are marked family friendly by their organizers and {m.adultsOnly} are adults only. {m.undated ? `${m.undated} have a confirmed 2026 season with dates not announced yet.` : ""}</p>
      </section>

      {m.nye ? <section className={styles.section} id="new-years-eve" aria-labelledby="nye-h">
        <h2 id="nye-h">New Year&rsquo;s Eve</h2>
        <p className={styles.prose} style={{ margin: 0 }}>Wayfind lists <strong>{m.nye.total}</strong> New Year&rsquo;s Eve plans across {m.nye.areas} parts of Florida, {m.nye.free} of them free. These are counted on their own and are not part of the {m.total} above. <a href="/new-years-in-florida" style={{ color: "#fde68a" }}>See every New Year&rsquo;s Eve plan</a>.</p>
      </section> : null}

      <section className={styles.section} id="cite" aria-labelledby="cite-h">
        <h2 id="cite-h">How to cite this report</h2>
        <p className={styles.cite}>{citeText}</p>
        <p className={styles.barNote}>Please link to this page. Numbers change as organizers announce events, so include the date. Questions about the data: <a href="mailto:hello@gowayfind.com" style={{ color: "#fde68a" }}>hello@gowayfind.com</a>.</p>
      </section>

      <section className={`${styles.section} ${styles.prose}`} id="method" aria-labelledby="method-h">
        <h2 id="method-h">How we counted</h2>
        <ul>
          <li><strong>Source:</strong> Wayfind&rsquo;s own Florida holiday listings, the same collection shown on <a href="/christmas-in-florida">Christmas in Florida</a>. Every listing carries a verified source for its 2026 dates, and traditions not yet confirmed for 2026 are left out.</li>
          <li><strong>Date range:</strong> listings open on or after {asOf} through {reportLongDate(m.seasonEnd)}. Events that already ended are not counted, so the total moves as the season goes on.</li>
          <li><strong>What counts:</strong> holiday events and seasonal experiences such as light displays, parades, boat parades, markets, tree lightings, shows and holiday pop up bars. Each event is counted once, even when it runs many nights. Third party tours sold online are not counted.</li>
          <li><strong>Days:</strong> a listing counts toward a day only when its schedule confirms that day. Listings with a confirmed season but no announced dates count toward the total, not toward any day.</li>
          <li><strong>Price:</strong> free and ticketed come from the organizer. When an organizer has not published a price, we say so instead of guessing.</li>
          <li><strong>Not included:</strong> comparisons with past years. Wayfind has no comparable count from an earlier season, so this report makes no year over year claim.</li>
        </ul>
        <p>Wayfind ranks and lists on merit and never for money. See <a href="/how-wayfind-ranks">how Wayfind ranks</a> and our <a href="/editorial-policy">editorial policy</a>.</p>
      </section>

      <section className={styles.section} id="more" aria-labelledby="more-h">
        <h2 id="more-h">Plan your holidays</h2>
        <ul className={styles.links}>
          <li><a href="/christmas-in-florida">Christmas in Florida 2026: every event, light show and parade</a></li>
          <li><a href="/new-years-in-florida">New Year&rsquo;s Eve in Florida 2026: fireworks, countdowns and parties</a></li>
          <li><a href="/spring-break-in-florida">Spring break 2027 in Florida: festivals and events in March</a></li>
        </ul>
      </section>
    </main>
  </>;
}
