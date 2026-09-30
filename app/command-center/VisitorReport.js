"use client";

import { useState } from "react";
import { EmptyNote, SourceBadge, fmtNum } from "./charts";
import styles from "./command-center.module.css";

const asRows = (value) => Array.isArray(value) ? value : [];
const seconds = (value) => {
  if (value == null || !Number.isFinite(Number(value))) return "Not measured";
  const n = Number(value);
  if (n < 60) return `${Math.round(n)} sec`;
  const minutes = Math.floor(n / 60);
  const rest = Math.round(n % 60);
  return rest ? `${minutes} min ${rest} sec` : `${minutes} min`;
};

function simplePage(path) {
  const clean = String(path || "/").split(/[?#]/)[0];
  if (clean === "/") return "Home";
  return (clean.split("/").filter(Boolean).pop() || "Home")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function surfaceWords(surface) {
  const value = String(surface || "document");
  if (!value || value === "document") return "";
  return value.replace(/[:_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function pageName(path, surface) {
  const screen = surfaceWords(surface);
  if (screen && String(path || "/").split(/[?#]/)[0] === "/") return screen;
  return screen ? `${simplePage(path)} · ${screen}` : simplePage(path);
}

function journeyName(row) {
  if (asRows(row.titles).length) return row.titles.join(" → ");
  const paths = asRows(row.path);
  const surfaces = asRows(row.surfaces);
  return paths.map((path, index) => pageName(path, surfaces[index])).join(" → ");
}

function StoryCard({ number, title, note, children, wide = false }) {
  return (
    <article className={`${styles.storyCard}${wide ? ` ${styles.storyCardWide}` : ""}`}>
      <div className={styles.storyCardHeading}>
        <span aria-hidden="true">{number}</span>
        <div>
          <h3>{title}</h3>
          {note ? <p>{note}</p> : null}
        </div>
      </div>
      {children}
    </article>
  );
}

function RankedRows({ rows, empty, label, value, displayValue, detail }) {
  if (!rows.length) return <EmptyNote>{empty}</EmptyNote>;
  const max = Math.max(1, ...rows.map((row) => Number(value(row)) || 0));
  return (
    <ol className={styles.storyRows}>
      {rows.map((row, index) => {
        const amount = Number(value(row)) || 0;
        return (
          <li key={`${label(row)}-${index}`}>
            <div className={styles.storyRowTop}>
              <strong>{label(row)}</strong>
              <b>{displayValue ? displayValue(row) : fmtNum(amount)}</b>
            </div>
            {detail ? <div className={styles.storyRowDetail}>{detail(row)}</div> : null}
            <span className={styles.storyBar} aria-hidden="true"><i style={{ width: `${Math.max(3, (amount / max) * 100)}%` }} /></span>
          </li>
        );
      })}
    </ol>
  );
}

function exitWords(row) {
  if (row.classification === "partner_click_before_exit") return { title: "Partner click before this page ended", tone: "partner" };
  if (row.classification === "external_click_before_exit") return { title: "Outside-site click before this page ended", tone: "external" };
  if (row.classification === "internal_navigation") return { title: "Moved to another Wayfind page", tone: "internal" };
  if (row.classification === "internal_click_before_exit") return { title: "Wayfind link clicked; next page not seen", tone: "unknown" };
  return { title: "Page ended; next action unknown", tone: "unknown" };
}

function exitReason(row) {
  if (row.reason === "route_change") return "The next Wayfind page was measured.";
  if (row.reason === "pagehide") return "The page closed or moved away.";
  if (row.reason === "unmount") return "Wayfind stopped measuring this page.";
  if (row.reason === "hidden") return "The page was no longer in front.";
  if (row.reason) return row.reason;
  return row.classification === "unobserved_exit"
    ? "We did not see what happened after this page."
    : "Measured from the next action on this page.";
}

function depthLabel(bucket) {
  const depth = Math.max(0, Math.min(9, Number(bucket) || 0));
  if (depth === 0) return "Top of page";
  if (depth === 9) return "Bottom of page";
  return `${depth * 10}–${(depth + 1) * 10}% down`;
}

function Heatmap({ rows }) {
  const [chosenPage, setChosenPage] = useState("");
  if (!rows.length) return <EmptyNote>No measured time samples for these dates.</EmptyNote>;
  const pageTotals = new Map();
  for (const row of rows) {
    const key = JSON.stringify([row.page_path, row.page_surface || "document"]);
    const current = pageTotals.get(key) || { path: row.page_path, surface: row.page_surface, seconds: 0 };
    current.seconds += Number(row.active_s) || 0;
    pageTotals.set(key, current);
  }
  const pages = [...pageTotals.entries()].sort((a, b) => b[1].seconds - a[1].seconds);
  const pageKey = pageTotals.has(chosenPage) ? chosenPage : pages[0][0];
  const page = pageTotals.get(pageKey);
  const pageRows = rows.filter((row) => JSON.stringify([row.page_path, row.page_surface || "document"]) === pageKey);
  const byDepth = new Map();
  for (const row of pageRows) {
    const depth = Number(row.document_bucket) || 0;
    const current = byDepth.get(depth) || { active_s: 0, samples: 0, visits: 0 };
    current.active_s += Number(row.active_s) || 0;
    current.samples += Number(row.samples) || 0;
    current.visits += Number(row.visits) || 0;
    byDepth.set(depth, current);
  }
  const max = Math.max(1, ...[...byDepth.values()].map((row) => row.active_s));
  return (
    <div className={styles.attentionExplorer}>
      <div className={styles.attentionTabs} aria-label="Choose a page">
        {pages.slice(0, 8).map(([key, item]) => (
          <button type="button" key={key} aria-pressed={pageKey === key} onClick={() => setChosenPage(key)}>
            {pageName(item.path, item.surface)}
          </button>
        ))}
      </div>
      <div className={styles.attentionLayout}>
        <div className={styles.pageShape} role="table" aria-label={`Time on each part of ${pageName(page.path, page.surface)}`}>
          {Array.from({ length: 10 }, (_, depth) => {
            const row = byDepth.get(depth);
            const active = Number(row && row.active_s) || 0;
            const strength = active / max;
            return (
              <div className={styles.pageBand} role="row" key={depth} style={{ "--attention": strength }}>
                <span role="cell">{depthLabel(depth)}</span>
                <strong role="cell">{row ? seconds(active) : "No time measured"}</strong>
              </div>
            );
          })}
        </div>
        <div className={styles.attentionAside}>
          <span className={styles.eyebrow}>Selected page</span>
          <h4>{pageName(page.path, page.surface)}</h4>
          <strong>{seconds(page.seconds)}</strong>
          <p>total time with this page open in front across {fmtNum(pageRows.reduce((sum, row) => sum + (Number(row.samples) || 0), 0))} samples</p>
          <small>Darker parts had more measured time. This does not tell us where anyone's eyes looked.</small>
        </div>
      </div>
    </div>
  );
}

function clickDestination(row) {
  if (row.destination_type === "partner" || /^\/api\/[a-z0-9-]+\/go\/?$/i.test(row.destination_path || "")) return "a partner booking site";
  if (row.outbound_domain) return row.outbound_domain;
  if (row.destination_path) return simplePage(row.destination_path);
  if (row.destination_type === "none") return "No page change seen";
  return "Next page was not measured";
}

function Finding({ item }) {
  const kind = item.kind === "issue" ? "Measured issue" : item.kind === "opportunity" ? "Opportunity" : "Clue";
  return (
    <li className={`${styles.finding} ${styles[`finding_${item.kind || "clue"}`]}`}>
      <span className={styles.findingKind}>{kind}</span>
      <strong>{item.title}</strong>
      <p>{item.evidence}</p>
      {item.recommendation ? <p className={styles.findingRecommendation}><b>Try next:</b> {item.recommendation}</p> : null}
      <small>
        {item.metric ? `${item.metric}: ` : ""}{item.value != null ? fmtNum(item.value) : ""}
        {item.denominator != null ? ` of ${fmtNum(item.denominator)}` : ""}
        {item.sample_size != null ? ` · ${fmtNum(item.sample_size)} measured` : ""}
      </small>
    </li>
  );
}

const OUTCOME_WORDS = {
  partner: "Partner booking tap", directions: "Went for directions", photo_credit: "Left via photo credit",
  outbound: "Left for another site", one_page: "One page, no taps", left: "Browsed, then ended",
};

function PlainStory({ story }) {
  const diagnosis = asRows(story.diagnosis);
  const visits = asRows(story.visits);
  const traffic = story.traffic || {};
  const reasons = Object.entries(traffic.by_reason || {}).filter(([, n]) => n);
  const cmp = traffic.comparison || {};
  return (
    <section className={styles.findingsBlock} aria-labelledby="plain-story-title">
      <div>
        <span className={styles.eyebrow}>In plain English</span>
        <h3 id="plain-story-title">{story.headline}</h3>
        <p>Real people only. Automated traffic is counted separately below and never mixed in.</p>
      </div>
      {diagnosis.length ? (
        <ul className={styles.findingsList}>
          {diagnosis.map((item) => (
            <li key={item.id} className={`${styles.finding} ${styles[item.severity === "high" ? "finding_issue" : item.severity === "medium" ? "finding_opportunity" : "finding_clue"]}`}>
              <span className={styles.findingKind}>{item.severity === "high" ? "Fix first" : item.severity === "medium" ? "Worth fixing" : "Good to know"}</span>
              <strong>{item.title}</strong>
              <p>{item.what}</p>
              {item.why ? <p><b>Why:</b> {item.why}</p> : null}
              {item.fix ? <p className={styles.findingRecommendation}><b>Fix:</b> {item.fix}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <details className={styles.measurementDetails} open>
        <summary>Real visits, step by step ({visits.length} most recent)</summary>
        <ol className={styles.coverageNotes}>
          {visits.map((visit, index) => (
            <li key={index}>
              <strong>{[visit.when, visit.source, visit.device, visit.active_s ? seconds(visit.active_s) + " in front" : null].filter(Boolean).join(" · ")}</strong>
              {" "}<em>({OUTCOME_WORDS[visit.outcome] || visit.outcome})</em>
              <ol>{asRows(visit.steps).map((step, i) => <li key={i}>{step}</li>)}</ol>
              <p>{visit.ending}</p>
            </li>
          ))}
        </ol>
      </details>
      <details className={styles.measurementDetails}>
        <summary>Filtered vs unfiltered traffic ({fmtNum(traffic.people_sessions)} people · {fmtNum(traffic.automated_sessions)} automated · {fmtNum(traffic.raw_sessions)} raw)</summary>
        <p>Rule {traffic.rule_version}: a session is automated only on evidence it carries — a crawler user agent, PostHog's bot flag, no browser identity, or the same empty desktop visit (one page, no tap, under {traffic.thresholds ? traffic.thresholds.quick_exit_s : 10} s, no referrer) repeated at least {traffic.thresholds ? traffic.thresholds.repeat_min : 5} times. Country is never used to decide. Phone visits are never excluded by the repeat rule. {fmtNum(traffic.people_quick_bounces)} quick one-page bounces were kept as people.</p>
        {reasons.length ? <ul className={styles.coverageNotes}>{reasons.map(([reason, n]) => <li key={reason}>{reason.replace(/_/g, " ")}: {fmtNum(n)}</li>)}</ul> : null}
        <div className={styles.storyGrid}>
          {[["Unfiltered (everything)", cmp.unfiltered], ["Filtered (people)", cmp.filtered]].map(([label, rows]) => (
            <div key={label}>
              <h4>{label}</h4>
              <ol className={styles.coverageNotes}>
                {asRows(rows).map((row, i) => <li key={i}>{row.title}: {fmtNum(row.sessions)} visits · {row.left_without_tapping_pct}% left without tapping</li>)}
              </ol>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

export default function VisitorReport({ report }) {
  const coverage = report && report.coverage;
  const journeys = asRows(report && report.journeys);
  const attention = asRows(report && report.pageAttention);
  const clicks = asRows(report && report.lastClicks);
  const exits = asRows(report && report.exits);
  const heatmap = asRows(report && report.heatmap);
  const findings = asRows(report && report.findings);
  const unavailable = !report || !coverage || coverage.status === "unavailable";

  if (unavailable) {
    const source = report && report.source;
    const notConnected = source && source.connected === false && source.reason !== "error";
    const sourceError = source && source.reason === "error";
    return (
      <div className={styles.storyUnavailable}>
        <strong>{notConnected ? "The visit counter is not connected here yet." : sourceError ? "The visit counter could not load right now." : "There are no measured visits for these dates yet."}</strong>
        <p>{notConnected ? "Connect it to see where people went and what they did." : sourceError ? "Try again in a moment." : "When measured visits arrive, their story will appear here."}</p>
        {(source && (source.nextStep || source.note)) || asRows(coverage && coverage.notes).length ? (
          <details className={styles.measurementDetails}>
            <summary>Connection details</summary>
            {source ? <SourceBadge source={source} /> : null}
            {source && (source.nextStep || source.note) ? <p>{source.nextStep || source.note}</p> : null}
            {asRows(coverage && coverage.notes).length ? <ul className={styles.coverageNotes}>{coverage.notes.map((note, index) => <li key={index}>{note}</li>)}</ul> : null}
          </details>
        ) : null}
      </div>
    );
  }

  const topJourney = journeys[0];
  return (
    <div className={styles.visitorStory}>
      <div className={styles.storyLead}>
        <span className={styles.eyebrow}>The visit story</span>
        <h2>{topJourney ? `${fmtNum(topJourney.visits)} visits followed the most common path` : "See what people did, in order"}</h2>
        <p>
          {topJourney
            ? `${journeyName(topJourney)}. This is the most common measured path. It does not explain why someone chose it.`
            : "There were no measured paths for these dates. The sections below show which other parts of the visit were measured."}
        </p>
        <div className={styles.storyCoverage}>
          <span className={coverage.status === "partial" ? styles.coveragePartial : styles.coverageMeasured}>
            {coverage.status === "partial" ? "Partly measured" : "Measured"}
          </span>
        </div>
      </div>

      {report.story ? <PlainStory story={report.story} /> : null}

      <div className={styles.storyGrid}>
        <StoryCard number="1" title="Where people went" note="The most common page paths we measured.">
          <RankedRows rows={journeys.slice(0, 5)} empty="No complete page paths were measured."
            label={(row) => journeyName(row)} value={(row) => row.visits}
            detail={(row) => `${fmtNum(row.pages)} pages${row.truncated ? " · path was longer" : ""}`} />
        </StoryCard>

        <StoryCard number="2" title="How long they stayed" note="Time with the page open in front. Hidden tabs do not count.">
          <RankedRows rows={attention.slice(0, 6)} empty="We did not measure how long pages stayed in front."
            label={(row) => row.title || pageName(row.page_path, row.page_surface)} value={(row) => row.active_s_avg}
            displayValue={(row) => seconds(row.active_s_avg)}
            detail={(row) => `${seconds(row.active_s_avg)} on average · ${fmtNum(row.exits_measured)} measured ends${row.max_scroll_pct_avg != null ? ` · ${Math.round(Number(row.max_scroll_pct_avg))}% down the page` : ""}`} />
        </StoryCard>

        <StoryCard number="3" title="What they clicked next" note="The last measured click on a page.">
          <RankedRows rows={clicks.slice(0, 6)} empty="No next clicks were measured."
            label={(row) => row.words || row.element_label || row.destination_path || row.outbound_domain || row.element_type || "Unnamed click"}
            value={(row) => row.visits}
            detail={(row) => `on ${row.title || pageName(row.page_path, row.page_surface)} → ${clickDestination(row)}`} />
        </StoryCard>

        <StoryCard number="4" title="Where page visits ended" note="A partner click can be useful, but it does not prove a booking. When we did not see what happened next, the answer stays unknown.">
          {exits.length ? (
            <ul className={styles.exitList}>
              {exits.slice(0, 8).map((row, index) => {
                const words = exitWords(row);
                return (
                  <li key={`${row.page_path}-${row.classification}-${index}`} className={styles[`exit_${words.tone}`]}>
                    <span>{words.title}</span>
                    <strong>{row.title || pageName(row.page_path, row.page_surface)}</strong>
                    <p>{exitReason(row)}</p>
                    <b>{fmtNum(row.visits)} visits</b>
                  </li>
                );
              })}
            </ul>
          ) : <EmptyNote>No visit endings were measured.</EmptyNote>}
        </StoryCard>

        <StoryCard number="5" title="Time on each part of the page" note="Time with each part of a page open in front. This does not tell us where anyone's eyes looked." wide>
          <Heatmap rows={heatmap} />
        </StoryCard>
      </div>

      <section className={styles.findingsBlock} aria-labelledby="visitor-findings-title">
        <div>
          <span className={styles.eyebrow}>What the evidence says</span>
          <h3 id="visitor-findings-title">Issues, opportunities, and clues</h3>
          <p>A clue points to something worth checking. It does not tell us what a visitor thought or why they left.</p>
        </div>
        {findings.length ? <ul className={styles.findingsList}>{findings.map((item) => <Finding key={item.id} item={item} />)}</ul>
          : <EmptyNote>No evidence-based findings met the reporting rules for these dates.</EmptyNote>}
      </section>
      <details className={styles.measurementDetails}>
        <summary>How this story was measured</summary>
        {report.source ? <SourceBadge source={report.source} /> : null}
        <p>{report.source && report.source.note ? report.source.note : "This story uses the measured visitor events named in the coverage record."}</p>
        {asRows(coverage.notes).length ? (
          <ul className={styles.coverageNotes}>{coverage.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
        ) : null}
        {coverage.events ? (
          <dl>
            {Object.entries(coverage.events).map(([event, value]) => (
              <div key={event}><dt>{event.replace(/_/g, " ")}</dt><dd>{value === true ? "measured" : value === false ? "not measured" : fmtNum(value)}</dd></div>
            ))}
          </dl>
        ) : null}
      </details>
    </div>
  );
}
