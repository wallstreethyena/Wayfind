'use client';
import { useEffect, useRef, useState } from 'react';
import MapCategoryPin from '../../components/MapCategoryPin';
import GuidePhoto from '../../components/GuidePhoto';
import { WayfindScoreBadge } from '../../components/kit';
import { experienceWayfindScore } from '../../../lib/experiencesData';
import { toDisplayScore } from '../../../lib/score';
import { FLORIDA_CATALOG_CATEGORIES as categories, FLORIDA_CATALOG_CITIES as cities } from '../../../lib/floridaCatalog';
import { detectCatalogCity } from '../../../lib/floridaCatalogLocation';
import { commerceHref } from '../../../lib/commerce';
import styles from './florida.module.css';

export default function ExperienceCatalog() {
  const [city,setCity]=useState('');
  const [cat,setCat]=useState('all');
  const [page,setPage]=useState(0);
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState(false);
  const [retry,setRetry]=useState(0);
  const [locating,setLocating]=useState(true);
  const manualCity=useRef(false);
  const locationRequest=useRef(0);

  useEffect(()=>{
    let active=true;
    const request=++locationRequest.current;
    detectCatalogCity().then(found=>{
      if(!active || request!==locationRequest.current || manualCity.current) return;
      if(found) setCity(found);
    }).finally(()=>{if(active && request===locationRequest.current) setLocating(false);});
    return ()=>{active=false;};
  },[]);

  useEffect(()=>{
    if(!city){setLoading(false);setError(false);return;}
    const controller=new AbortController();
    setLoading(true);setError(false);
    const params=new URLSearchParams({city,cat,page:String(page)});
    fetch('/api/florida-experiences?'+params,{signal:controller.signal})
      .then(async r=>{if(!r.ok) throw new Error('Unavailable');return r.json();})
      .then(result=>{
        if(controller.signal.aborted) return;
        setData(previous=>page===0 ? result : {
          ...result,
          items:[...(previous?.items || []),...result.items.filter(item=>!previous?.items?.some(current=>current.code===item.code))],
        });
        setLoading(false);
      })
      .catch(()=>{if(!controller.signal.aborted){setError(true);setLoading(false);}});
    return ()=>controller.abort();
  },[city,cat,page,retry]);

  function resetResults(){setPage(0);setData(null);setError(false);setRetry(value=>value+1);}
  function choose(key){setCat(key);resetResults();}
  function chooseCity(nextCity){locationRequest.current+=1;manualCity.current=true;setCity(nextCity);setLocating(false);resetResults();}
  async function useLocation(){
    const request=++locationRequest.current;
    manualCity.current=false;setLocating(true);
    const found=await detectCatalogCity({requestPermission:true});
    if(request!==locationRequest.current || manualCity.current) return;
    setLocating(false);
    if(found){setCity(found);resetResults();}
  }

  const selectedCategory=categories.find(category=>category.key===cat)?.label || 'All activities';
  const loaded=data?.items?.length || 0;
  return <section id="experiences" className={styles.section}>
    <div className={styles.sectionHead}><h2>Top experiences</h2></div>
    <div className={styles.catalogControls}>
      <label htmlFor="florida-catalog-city">Location <select id="florida-catalog-city" value={city} onChange={e=>chooseCity(e.target.value)}><option value="">Choose a destination</option>{cities.map(c=><option key={c}>{c}</option>)}</select></label>
      <button type="button" className={styles.locationButton} onClick={useLocation} disabled={locating}>{locating ? 'Finding your location…' : 'Use my location'}</button>
    </div>
    <div className={styles.catalogLayout}>
      <aside className={styles.catalogCategories} aria-label="Experience categories">
        <div className={styles.categoryHeading}><h3>Categories</h3>{cat!=='all' ? <button type="button" onClick={()=>choose('all')}>Clear category</button> : null}</div>
        <p className={styles.mobileSwipeHint}>Swipe to see more categories →</p>
        <div className={styles.pinMenu} role="group" aria-label="Filter experiences by activity">
          {categories.map(c=><button type="button" key={c.key} aria-pressed={cat===c.key} onClick={()=>choose(c.key)}><MapCategoryPin family={c.pin} height={38}/><span>{c.label}</span><b>{data?.chipCounts?.[c.key] ?? '—'}</b></button>)}
          <a href="#halloween"><MapCategoryPin family="shows" height={38}/><span>Shows & events</span></a>
        </div>
      </aside>
      <div className={styles.catalogResults}>
        <div aria-live="polite" aria-atomic="true" className={styles.catalogStatus}>{!city ? '' : loading && !data ? `Finding the top 5 ${selectedCategory.toLowerCase()} in ${city}…` : error ? 'The experience catalog is temporarily unavailable.' : `${loaded} of ${data?.total || 0} ${selectedCategory.toLowerCase()} shown in ${city}${loading ? ' · Loading 5 more…' : ''}`}</div>
        {error ? <button className={styles.catalogButton} onClick={()=>setRetry(v=>v+1)}>Try again</button> : null}
        {data?.items?.length ? <div className={styles.grid}>{data.items.map(item=><article key={item.code} className={styles.offerCard}>
          <div className={styles.media}><GuidePhoto src={item.image} alt={item.title} width={640} height={400} loading="lazy" className={styles.offerImage} fallbackClassName={styles.photoFallback} fallbackText="Photo unavailable"/></div>
          <div className={styles.cardBody}><p className={styles.meta}>{item.city}{item.duration ? ' · '+item.duration : ''}</p><h3>{item.title}</h3>
          <div className={styles.catalogRating}>{toDisplayScore(experienceWayfindScore(item)) != null ? <WayfindScoreBadge score={toDisplayScore(experienceWayfindScore(item))} staticRoot /> : <span aria-label="Wayfind Score pending">Score pending</span>}{item.reviews>0 ? <span>{item.reviews.toLocaleString()} Viator reviews</span> : null}</div>
          <div className={styles.catalogTags}>{(item.chips||[]).map(c=><span key={c.key}>{c.label}</span>)}</div>
          <div className={styles.cardActionRow}><a className={styles.cardAction} rel="sponsored noopener" target="_blank" href={commerceHref({provider:'viator',offerId:item.code,surface:'paid_florida',contentId:'florida-catalog-'+item.code})}>See availability ↗<span className={styles.srOnly}> for {item.title}, opens a new tab</span></a><span className={styles.seller}>via Viator</span></div>
          </div></article>)}</div> : city && !loading && !error ? <p>No listed experiences match this category in {city}. Choose another category.</p> : null}
        {!error && data?.hasMore ? <div className={styles.catalogPages}><button type="button" className={styles.catalogButton} disabled={loading} onClick={()=>setPage(p=>p+1)}>{loading ? 'Loading…' : 'See 5 more'}</button></div> : null}
      </div>
    </div>
  </section>;
}
