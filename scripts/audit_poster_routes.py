#!/usr/bin/env python3
"""Read-only public poster data audit. No provider credentials or writes.

Records response bodies only as counts, public ids, health flags and schema.
HTTP success is not UI verification, and empty inventory is not automatically
an outage. The manifest names every active poster and its actual data path.
"""
import argparse, concurrent.futures, datetime, json, time, urllib.request, urllib.error
from pathlib import Path

POSTERS = {
 'Fall in Florida': 'fall', 'Night Out':'night-out', 'Trending Near You':'trending',
 'Date Night':'date-night', 'Summer Picks':'summer', "Today's Best Options":'today',
 'Lunch in My City':'lunch-challenge', 'Actually Worth Eating':'shared',
 "Chef Ron Duprat's Top 7":'curated', 'Locals Know':'shared', 'Worth the Drive':'shared',
 'Birthday Plans, Solved':'birthday', 'Family Day, Decided':'shared',
 'Beach Day':'shared', 'The 30-Minute Break':'lunch-break',
 'Best Breakfast Picks':'shared', 'Your Next Coffee Spot':'creator', 'Local Guides':'guides',
}
ROUTES = {
 'night-out':'/api/night-out', 'birthday':'/api/birthday', 'date-night':'/api/date-night',
 'today':'/api/today-discovery', 'fall':'/api/events/fall', 'summer':'/api/summer/places',
 'shared':'/api/rails', 'lunch-break':'/api/lunch-break', 'trending':'/api/trends/nearby',
}
# Named town centres, not device coordinates or the owner's precise location.
METROS={'Parrish':(27.58,-82.43),'Tampa':(27.95,-82.46),'Miami':(25.76,-80.19)}

def read_one(origin, city, route, coords):
    from urllib.parse import urlencode
    query={'lat':coords[0],'lng':coords[1],'city':city}
    if route=='shared': query.update(v=2,band='evening')
    url=origin+ROUTES[route]+'?'+urlencode(query)
    start=time.monotonic()
    result={'city':city,'surface':route,'url':url,'started':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    try:
        with urllib.request.urlopen(urllib.request.Request(url,headers={'Accept':'application/json'}),timeout=25) as response:
            body=response.read(); data=json.loads(body)
            result.update(status=response.status,bytes=len(body),cache=response.headers.get('x-wayfind-fast-cache'),keys=sorted(data) if isinstance(data,dict) else ['array'])
            if not isinstance(data,dict): raise ValueError('expected a JSON object')
            result['error']=data.get('error')
            result['sourceFailures']=data.get('sourceFailures',data.get('sourceStats',{}).get('sourceFailures'))
            result['sourceStats']=data.get('sourceStats')
            payload=data.get('data') if route=='shared' else data
            if not isinstance(payload,dict): payload={}
            if route=='shared': result['covered']=data.get('covered')
            rails=payload.get('rails',[])
            if isinstance(rails,list):
                result['rails']=[{'id':r.get('id'),'cards':len(r.get('places') or r.get('cards') or r.get('items') or []),'total':r.get('total')} for r in rails if isinstance(r,dict)]
            places=payload.get('places',[])
            if isinstance(places,dict): result['pools']={key:len(value) for key,value in places.items() if isinstance(value,list)}
            elif isinstance(places,list): result['places']=len(places)
            for key in ['items','results','rows','trends']:
                if isinstance(data.get(key),list): result[key]=len(data[key])
            result['ui_verified']=False
    except urllib.error.HTTPError as exc: result.update(status=exc.code,error=str(exc))
    except Exception as exc: result.update(status=None,error=f'{type(exc).__name__}: {exc}')
    result['seconds']=round(time.monotonic()-start,3)
    return result

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin',default='https://www.gowayfind.com')
    parser.add_argument('--output',required=True)
    parser.add_argument('--surfaces',nargs='+',choices=list(ROUTES),default=list(ROUTES))
    parser.add_argument('--cities',nargs='+',choices=list(METROS),default=['Parrish'])
    args=parser.parse_args()
    tasks=[(args.origin,city,route,METROS[city]) for city in args.cities for route in args.surfaces]
    report={'generated':datetime.datetime.now(datetime.timezone.utc).isoformat(),'posters':POSTERS,'expected_probes':len(tasks),'results':[],
      'limits':['Public endpoint audit, not a browser or image-rendering certification.','Curated, creator, guide and lunch-challenge flows require separate UI checks.','A 200 with zero cards requires investigation; it is not automatically success.']}
    path=Path(args.output); path.parent.mkdir(parents=True,exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        for result in executor.map(lambda task:read_one(*task),tasks):
            report['results'].append(result)
            path.write_text(json.dumps(report,indent=2)+'\n')
            print(json.dumps(result),flush=True)
    assert len(report['results'])==len(tasks), 'incomplete audit'
    if any(r['status']!=200 or r.get('error') for r in report['results']): raise SystemExit(1)
if __name__=='__main__':main()
