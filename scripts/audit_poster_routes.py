#!/usr/bin/env python3
"""Read-only public poster data audit. No provider credentials or writes.

Records response bodies only as counts, public ids, health flags and schema.
HTTP success is not UI verification, and empty inventory is not automatically
an outage. The manifest names every active poster and its actual data path.
"""
import argparse, concurrent.futures, datetime, json, time, urllib.request, urllib.error
from pathlib import Path

POSTERS = {
 'Summer Picks':['summer','summer-experiences'],
 "Today's Best Options":['today'], 'Trending Near You':['trending-fallback'],
 'Actually Worth Eating':['shared'], 'Beach Day':['shared'],
 'Family Day, Solved':['shared'], 'Creators Pick':['shared'],
 'Your Next Coffee Spot':['creator-page'], 'Night Out':['night-out'],
 'Date Night':['date-night'], 'The 30-Minute Break':['lunch-break'],
 'Best Breakfast Picks':['shared'], 'Birthday Plans, Solved':['birthday'],
 'Local Guides':['guides'], 'Fall in Florida':['fall'],
}
ROUTES = {
 'night-out':'/api/night-out', 'birthday':'/api/birthday', 'date-night':'/api/date-night',
 'today':'/api/today-discovery', 'fall':'/api/events/fall', 'summer':'/api/summer/places',
 'summer-experiences':'/api/experiences', 'shared':'/api/rails',
 'lunch-break':'/api/lunch-break', 'trending-fallback':'/api/trends/nearby',
}
SURFACE_NOTES = {
 'trending-fallback':'This is only the owner-list fallback. The poster first runs a browser-side Places walk, so this probe is not full Trending verification.',
 'summer-experiences':'Companion source for Summer Picks; /api/summer/places alone is not the complete poster answer.',
}
# Named town centres, not device coordinates or the owner's precise location.
METROS={'Parrish':(27.58,-82.43),'Tampa':(27.95,-82.46),'Miami':(25.76,-80.19)}

def flag(data, stats, *names):
    return any(bool(source.get(name)) for source in (data, stats) if isinstance(source,dict) for name in names)

def read_one(origin, city, route, coords, sample):
    from urllib.parse import urlencode
    query={'lat':coords[0],'lng':coords[1],'city':city}
    if route=='shared': query.update(v=2,band='evening')
    if route=='summer-experiences': query.update(mi=120,cat='all',limit=100,page=0)
    url=origin+ROUTES[route]+'?'+urlencode(query)
    start=time.monotonic()
    result={'city':city,'surface':route,'sample':sample,'url':url,'started':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    if route in SURFACE_NOTES: result['note']=SURFACE_NOTES[route]
    try:
        with urllib.request.urlopen(urllib.request.Request(url,headers={'Accept':'application/json'}),timeout=25) as response:
            body=response.read(); data=json.loads(body)
            cache_state=response.headers.get('x-wayfind-fast-cache')
            result.update(status=response.status,http_ok=response.status == 200,bytes=len(body),cache=cache_state,cache_state=cache_state,keys=sorted(data) if isinstance(data,dict) else ['array'])
            if not isinstance(data,dict): raise ValueError('expected a JSON object')
            result['error']=data.get('error')
            stats=data.get('sourceStats') if isinstance(data.get('sourceStats'),dict) else {}
            result['sourceFailures']=data.get('sourceFailures',stats.get('sourceFailures'))
            result['sourceStats']=stats or None
            result['failed']=bool(data.get('failed') or data.get('error'))
            result['degraded']=flag(data,stats,'degraded','partial') or bool(result['sourceFailures'])
            result['truncated']=flag(data,stats,'truncated','incomplete','capped','budgetExhausted')
            payload=data.get('data') if route=='shared' else data
            if not isinstance(payload,dict): payload={}
            result['failed']=result['failed'] or bool(payload.get('failed') or payload.get('error'))
            result['degraded']=result['degraded'] or flag(payload,{},'degraded','partial')
            result['truncated']=result['truncated'] or flag(payload,{},'truncated','incomplete','capped','budgetExhausted')
            if route=='shared': result['covered']=data.get('covered')
            rails=payload.get('rails',[])
            if isinstance(rails,list):
                result['rails']=[{'id':r.get('id'),'cards':len(r.get('places') or r.get('cards') or r.get('items') or []),'total':r.get('total')} for r in rails if isinstance(r,dict)]
            places=payload.get('places',[])
            if isinstance(places,dict): result['pools']={key:len(value) for key,value in places.items() if isinstance(value,list)}
            elif isinstance(places,list): result['places']=len(places)
            for key in ['items','results','rows','trends']:
                if isinstance(data.get(key),list): result[key]=len(data[key])
            counts=[]
            counts.extend(r['cards'] for r in result.get('rails',[]))
            counts.extend(result.get('pools',{}).values())
            counts.extend(result[key] for key in ['places','items','results','rows','trends'] if isinstance(result.get(key),int))
            result['content_count']=sum(counts)
            result['nonempty']=result['content_count'] > 0
            if result['failed']: result['validation']='failed'
            elif result['degraded']: result['validation']='degraded'
            elif result['truncated']: result['validation']='truncated'
            elif route=='shared' and result.get('covered') is not True: result['validation']='uncovered'
            elif not result['nonempty']: result['validation']='empty'
            else: result['validation']='healthy_nonempty'
            result['ui_verified']=False
    except urllib.error.HTTPError as exc: result.update(status=exc.code,http_ok=False,error=str(exc),failed=True,degraded=False,truncated=False,nonempty=False,validation='http_error')
    except Exception as exc: result.update(status=None,http_ok=False,error=f'{type(exc).__name__}: {exc}',failed=True,degraded=False,truncated=False,nonempty=False,validation='request_error')
    result['seconds']=round(time.monotonic()-start,3)
    return result

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin',default='https://www.gowayfind.com')
    parser.add_argument('--output',required=True)
    parser.add_argument('--surfaces',nargs='+',choices=list(ROUTES),default=list(ROUTES))
    parser.add_argument('--cities',nargs='+',choices=list(METROS),default=['Parrish'])
    parser.add_argument('--samples',type=int,default=1,choices=range(1,6),metavar='{1..5}',help='bounded repeated samples; labels observations only, not cold/warm or percentile claims')
    args=parser.parse_args()
    tasks=[(args.origin,city,route,METROS[city],sample) for sample in range(1,args.samples+1) for city in args.cities for route in args.surfaces]
    report={'generated':datetime.datetime.now(datetime.timezone.utc).isoformat(),'posters':POSTERS,'surface_notes':SURFACE_NOTES,'samples_per_surface':args.samples,'expected_probes':len(tasks),'results':[],
      'limits':['Public endpoint audit, not a browser or image-rendering certification.','Creator-page and guides flows require separate UI checks.','Samples are repeated observations, not isolated server latency, cold-cache labels or percentile estimates.','HTTP 200 and nonempty content are recorded separately; empty, failed, degraded or truncated output never validates as healthy.']}
    path=Path(args.output); path.parent.mkdir(parents=True,exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        for result in executor.map(lambda task:read_one(*task),tasks):
            report['results'].append(result)
            path.write_text(json.dumps(report,indent=2)+'\n')
            print(json.dumps(result),flush=True)
    assert len(report['results'])==len(tasks), 'incomplete audit'
    if any(r.get('validation')!='healthy_nonempty' for r in report['results']): raise SystemExit(1)
if __name__=='__main__':main()
