'use client';
import { useEffect, useState } from 'react';
import { BEACH_PILOT, BEACH_SOURCES, localBeachSources } from '../../lib/beachPlanning';
const stamp = value => value ? new Date(value).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : 'Unavailable';
function Source({ href, title, source, children }) {
  return <section className="evidence"><h3>{title}</h3>{children}<p className="source"><a href={href} target="_blank" rel="noreferrer">Official source ↗</a><br />Retrieved: {stamp(source?.retrievedAt)}</p></section>;
}
export default function Conditions({ initialSlug = 'coquina' }) {
  const [slug, setSlug] = useState(initialSlug);
  const [response, setData] = useState(null);
  const data = response?.beach?.slug === slug ? response : null;
  const [error, setError] = useState(false);
  useEffect(() => {
    let stopped = false, controller;
    setData(null); setError(false);
    async function load() {
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      try {
        const r = await fetch('/api/beach/planning?beach=' + slug, { signal: controller.signal, cache: 'no-store' });
        if (!r.ok) throw new Error('Unavailable');
        const result = await r.json();
        if (!stopped) { setData(result); setError(false); }
      } catch { if (!stopped) { setData(null); setError(true); } }
      finally { clearTimeout(timeout); }
    }
    load(); const timer = setInterval(load, 60000);
    return () => { stopped = true; controller?.abort(); clearInterval(timer); };
  }, [slug]);
  const beach = BEACH_PILOT.find(b => b.slug === slug);
  const local = localBeachSources(beach);
  const forecastUrl = `https://forecast.weather.gov/MapClick.php?lat=${beach.lat}&lon=${beach.lng}`;
  return <>
    <label className="beach-label" htmlFor="pilot-beach">Choose a beach</label>
    <select id="pilot-beach" value={slug} onChange={e => setSlug(e.target.value)}>{BEACH_PILOT.map(b => <option key={b.slug} value={b.slug}>{b.name}</option>)}</select>
    <div className="notice"><strong>Look, listen, and follow lifeguard instructions.</strong><p>If you hear thunder, get into a substantial building or enclosed vehicle. Remain sheltered for at least 30 minutes after the last thunder. An expired warning does not start that clock. <a href={BEACH_SOURCES.lightning}>NWS guidance ↗</a></p></div>
    <section className="evidence local-conditions"><h2>Local flags & closures</h2>
      <p className="unknown">Current flag: Unknown · Closure status: Unknown.</p>
      <p>{local.instructions}</p>
      <p>Live local flags are not connected to Wayfind yet. Open the local report before you travel.</p>
      <div className="local-links"><a href={local.conditionsUrl} target="_blank" rel="noreferrer">Check local beach report ↗</a><a href={local.url} target="_blank" rel="noreferrer">{local.title} ↗</a></div>
    </section>
    {!data ? <p role="status">{error ? 'Conditions unavailable. Check the official sources and local beach signs before you go.' : 'Loading official beach evidence…'}</p> : <>
      <div aria-live="polite">
        {data.hazards.length > 0 && <section className="hazards"><h2>Before you go</h2><ul>{data.hazards.map((h,i) => <li key={i}>{h}</li>)}</ul></section>}
      </div>
      <div className="evidence-grid">
        <Source title="Weather outlook" href={forecastUrl} source={data.sources.weather}>
          <p>{data.better ? `Lower forecast rain chance around ${stamp(data.better.start)}: ${data.better.rain}%.` : 'No better forecast period identified from the available evidence.'}</p>
          <p className="muted">Forecast issued: {stamp(data.sources.weather.issuedAt)}. Forecast periods are not swimming clearance.</p>
          {data.periods.length > 0 && <details><summary>Hourly forecast</summary><ul>{data.periods.slice(0,12).map(p => <li key={p.start}>{stamp(p.start)}: {p.summary}; rain {p.rain === null ? 'Unknown' : p.rain + '%'}; wind {p.wind}.</li>)}</ul></details>}
        </Source>
        <Source title="Weather alerts" href={forecastUrl} source={data.sources.alerts}>
          <p>{!data.alertsKnown ? 'Unknown. The alert feed is unavailable or out of date.' : data.alerts.length ? 'Official alerts reported. See the warnings above.' : 'No active alerts returned. This does not establish that lightning is absent.'}</p>
          {data.alerts?.map((a,i) => <p key={i}>{a.event} · Issued {stamp(a.issuedAt)}{a.instruction ? ': ' + a.instruction : ''}</p>)}
        </Source>
        <Source title="Swimming advisories & water samples" href={BEACH_SOURCES.water} source={data.sources.water}>
          {data.samples.map(s => <div className="sample" key={s.station}><strong>{s.station}</strong><p>Latest sample: {s.result} · Collected {s.sampledAt || 'Unknown'}{s.age === 'stale' ? ' · Older than 7 days' : s.age === 'unknown' ? ' · Age unknown' : ''}</p><p>Advisory in that report: {s.advisory === true ? 'Yes' : s.advisory === false ? 'No' : 'Unknown'}. Current swimming status: check the official report.</p></div>)}
          <p className="muted">A sample describes its collection location and date. It does not measure the whole beach today.</p>
        </Source>
        <Source title="Nearby red-tide evidence" href={BEACH_SOURCES.redTide} source={data.sources.redTide}>
          <p>{data.redTide ? `FWC category: ${data.redTide.label}. Sample at ${data.redTide.location}, collected ${data.redTide.sampledAt}, ${data.redTide.mi} miles from this beach.` : 'Unknown. No usable sample within 10 miles and the last 8 days was returned.'}</p>
          <p className="muted">Nearby sampling is not a measurement of this beach. A low result does not clear swimming hazards.</p>
        </Source>
      </div>
      <details className="method"><summary>Why these details?</summary><p>We keep water samples, advisory reports, weather and red tide separate. Reported hazards suppress better-weather suggestions. Unknown stays unknown. The weather comparison uses daylight hours with no storm wording and a rain probability of 30% or less, choosing the lowest available probability. This is a planning rule, not a validated comfort or safety score. Small waves never establish low rip-current risk.</p><p>Seaweed observations and a comfort score are not available in this pilot.</p></details>
    </>}
    <p className="source"><a href={BEACH_SOURCES.water}>Florida swimming reports</a> · <a href={BEACH_SOURCES.redTide}>FWC red tide</a> · <a href={forecastUrl}>NWS forecast</a></p>
  </>;
}
