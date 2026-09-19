'use client';
import { useEffect, useState } from 'react';
import MapCategoryPin from '../../components/MapCategoryPin';
import GuidePhoto from '../../components/GuidePhoto';
import { FLORIDA_CATALOG_CATEGORIES as categories, FLORIDA_CATALOG_CITIES as cities } from '../../../lib/floridaCatalog';
import { commerceHref } from '../../../lib/commerce';
import { experienceGoUrl } from '../../../lib/affiliates';
import styles from './florida.module.css';

export default function ExperienceCatalog() {
  const [city,setCity]=useState('');
  const [cat,setCat]=useState('all');
  const [page,setPage]=useState(0);
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState(false);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true);setError(false);
    const params=new URLSearchParams({city,cat,page:String(page)});
    fetch('/api/florida-experiences?'+params,{signal:controller.signal})
      .then(async r=>{if(!r.ok) throw new Error('Unavailable');return r.json();})
      .then(result=>{if(!controller.signal.aborted){setData(result);setLoading(false);}})
      .catch(()=>{if(!controller.signal.aborted){setError(true);setLoading(false);}});
    return ()=>controller.abort();
  },[city,cat,page,retry]);
  const allFlorida=experienceGoUrl('tours and activities','Florida','experiences',null,{surface:'paid_florida',contentId:'florida-catalog-statewide'});
  function choose(key){setCat(key);setPage(0);}
  return <section id="experiences" className={styles.section}>
    <div className={styles.sectionHead}><p className={styles.eyebrow}>Pick your kind of day</p><h2>Activities, tours & experiences</h2><p className={styles.intro}>Explore Viator experiences by interest, then choose where you want to go.</p></div>
    <div className={styles.catalogControls}><label>Where in Florida? <select value={city} onChange={e=>{setCity(e.target.value);setPage(0);setData(null);}}><option value="">All listed destinations</option>{cities.map(c=><option key={c}>{c}</option>)}</select></label><a href={allFlorida} rel="sponsored noopener" target="_blank">Search all Florida on Viator ↗</a></div>
    <div className={styles.pinMenu} role="group" aria-label="Filter experiences by activity">
      {categories.map(c=><button type="button" key={c.key} aria-pressed={cat===c.key} onClick={()=>choose(c.key)}><MapCategoryPin family={c.pin} height={38}/><span>{c.label}</span><b>{data?.chipCounts?.[c.key] ?? '—'}</b></button>)}
      <a href="#halloween"><MapCategoryPin family="shows" height={38}/><span>Shows & events</span></a>
    </div>
    <p className={styles.note}>Listed destinations: Orlando, Tampa, St. Petersburg, Clearwater and Sarasota. For Miami, the Keys and other Florida destinations, use the statewide Viator search. Category counts can overlap.</p>
    <div aria-live="polite" aria-atomic="true" className={styles.catalogStatus}>{loading ? 'Loading experiences…' : error ? 'The experience catalog is temporarily unavailable.' : `${data?.total || 0} experiences${city ? ' in '+city : ' across listed destinations'}${data?.total ? ' · Page '+(page+1)+' of '+Math.ceil(data.total/24) : ''}`}</div>
    {error ? <button className={styles.catalogButton} onClick={()=>setRetry(v=>v+1)}>Try again</button> : !loading && data?.items?.length ? <div className={styles.grid}>{data.items.map(item=><article key={item.code} className={styles.offerCard}>
      <div className={styles.media}><GuidePhoto src={item.image} alt={item.title} width={640} height={400} loading="lazy" className={styles.offerImage} fallbackClassName={styles.photoFallback} fallbackText="Photo unavailable"/></div>
      <div className={styles.cardBody}><p className={styles.meta}>{item.city}{item.duration ? ' · '+item.duration : ''}</p><h3>{item.title}</h3>
      {item.rating>0 && item.reviews>0 ? <p className={styles.catalogRating}>★ {item.rating.toFixed(1)} <span>({item.reviews.toLocaleString()} Viator reviews)</span></p> : null}
      <div className={styles.catalogTags}>{(item.chips||[]).map(c=><span key={c.key}>{c.label}</span>)}</div>
      <div className={styles.cardActionRow}><a className={styles.cardAction} rel="sponsored noopener" target="_blank" href={commerceHref({provider:'viator',offerId:item.code,surface:'paid_florida',contentId:'florida-catalog-'+item.code})}>See availability ↗<span className={styles.srOnly}> for {item.title}, opens a new tab</span></a><span className={styles.seller}>via Viator</span></div>
      </div></article>)}</div> : !loading && !error ? <p>No listed experiences match this category in this destination. Choose another category or search Viator statewide.</p> : null}
    {!loading && !error && data?.total>24 ? <nav className={styles.catalogPages} aria-label="Experience pages"><button className={styles.catalogButton} disabled={page===0} onClick={()=>setPage(p=>p-1)}>← Previous</button><span>Page {page+1} of {Math.ceil(data.total/24)}</span><button className={styles.catalogButton} disabled={!data.hasMore} onClick={()=>setPage(p=>p+1)}>Next →</button></nav> : null}
  </section>;
}
