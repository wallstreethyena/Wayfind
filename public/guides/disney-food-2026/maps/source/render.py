#!/usr/bin/env python3
"""Render real WGS84 OSM GeoJSON. Python stdlib only; never modifies geography."""
import argparse,json,math,html,pathlib
R=6378137.0

def mercator(lon,lat):
    if not -85.05112878 <= lat <= 85.05112878: raise ValueError('Latitude outside Mercator domain')
    return R*math.radians(lon),R*math.log(math.tan(math.pi/4+math.radians(lat)/2))

def viewport(bbox,width=1000):
    west,south,east,north=bbox
    if not west<east or not south<north: raise ValueError('Invalid bbox')
    x0,y0=mercator(west,south);x1,y1=mercator(east,north)
    return dict(bbox=bbox,width=width,height=width*(y1-y0)/(x1-x0),xMin=x0,yMax=y1,scale=width/(x1-x0),projection='EPSG:3857')

def point(p,v):
    x,y=mercator(*p[:2]);return ((x-v['xMin'])*v['scale'],(v['yMax']-y)*v['scale'])

def path_line(points,v,closed=False):
    out=[]
    for i,p in enumerate(points):
        x,y=point(p,v);out.append(('M' if not i else 'L')+f'{x:.2f},{y:.2f}')
    return ' '.join(out)+('Z' if closed else '')

def geometry_path(g,v):
    t=g['type'];c=g['coordinates']
    if t=='Polygon':return ' '.join(path_line(r,v,True) for r in c)
    if t=='MultiPolygon':return ' '.join(path_line(r,v,True) for p in c for r in p)
    if t=='LineString':return path_line(c,v)
    if t=='MultiLineString':return ' '.join(path_line(l,v) for l in c)
    return ''

def classify(p,area):
    # Exact OSM tags, not guessed attraction boundaries.
    if area:
        if p.get('natural') in ('water','bay') or p.get('water') or p.get('waterway') in ('riverbank','dock') or p.get('landuse')=='reservoir':return 20,'water'
        if p.get('building') == 'construction':return 15,'construction'
        if p.get('building') or p.get('building:part'):return 40,'building'
        if p.get('natural') in ('wood','scrub','heath','grassland','wetland') or p.get('landuse') in ('forest','grass','meadow','recreation_ground','village_green') or p.get('leisure') in ('garden','park'):return 10,'green'
        if p.get('highway') or p.get('area:highway'):return 30,'plaza'
        if p.get('landuse')=='construction' or p.get('building')=='construction':return 15,'construction'
        return None
    if p.get('highway') in ('footway','pedestrian','path','steps','cycleway'):return 60, 'restricted' if p.get('access') in ('private','no') else 'footway'
    if p.get('highway') in ('service','residential','unclassified','tertiary','secondary','primary'):return 50,'road'
    if p.get('waterway') in ('stream','canal','river'):return 25,'waterline'
    if p.get('railway') in ('rail','monorail','miniature'):return 55,'rail'
    return None

def render(fc,bbox,title):
    v=viewport(bbox); shapes=[];stats={}
    for f in fc['features']:
        g=f.get('geometry')
        if not g:continue
        p=f.get('properties') or {};p=p.get('tags',p)
        kind=classify(p,g['type'] in ('Polygon','MultiPolygon'))
        if not kind:continue
        d=geometry_path(g,v)
        if not d:continue
        z,css=kind;stats[css]=stats.get(css,0)+1
        shapes.append((z,f'<path class="{css}" d="{d}"/>'))
    shapes.sort(key=lambda x:x[0]);h=v['height']
    # Geographic scale corrected for latitude; true ground distance locally.
    lat=(bbox[1]+bbox[3])/2;scale100=100/math.cos(math.radians(lat))*v['scale']
    svg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 {h:.3f}" role="img" aria-labelledby="title desc">
<title id="title">{html.escape(title)} geographic map</title><desc id="desc">Buildings, water, green areas and paths from OpenStreetMap. North is up. Reference only, not live directions or accessibility advice.</desc>
<style>.water{{fill:#b6d8d7;stroke:#8ebdbc;stroke-width:.65}}.green{{fill:#c5d2b5;stroke:#a6bb98;stroke-width:.4}}.building{{fill:#d5c5ad;stroke:#aa967b;stroke-width:.7}}.plaza{{fill:#e7dfcc;stroke:none}}.construction{{fill:#e3d8c5;stroke:#baa685;stroke-dasharray:3 3;stroke-width:1}}.footway{{fill:none;stroke:#fffaf0;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}}.restricted{{fill:none;stroke:#e2d7c4;stroke-width:1;stroke-dasharray:3 3}}.road{{fill:none;stroke:#d8d0bf;stroke-width:3.5;stroke-linejoin:round}}.waterline{{fill:none;stroke:#8ebdbc;stroke-width:1.8}}.rail{{fill:none;stroke:#9f9e8b;stroke-width:1;stroke-dasharray:4 3}}</style>
<defs><clipPath id="bounds"><rect width="1000" height="{h:.3f}"/></clipPath></defs>
<rect width="1000" height="{h:.3f}" fill="#f5f0e5"/>
<g clip-path="url(#bounds)" fill-rule="evenodd">{''.join(s for _,s in shapes)}</g>
<g transform="translate(950 42)" fill="#254a3d"><path d="M0 10L-7 29L0 25L7 29Z"/><text text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="700">N</text></g>
<g transform="translate(28 {h-32:.3f})" stroke="#254a3d" fill="#254a3d"><path d="M0 -5V0H{scale100:.3f}V-5" fill="none" stroke-width="2"/><text y="-9" font-size="12" font-family="sans-serif" stroke="none">100 m</text></g>
<a href="https://www.openstreetmap.org/copyright"><text x="980" y="{h-12:.3f}" text-anchor="end" fill="#254a3d" font-family="sans-serif" font-size="10">© OpenStreetMap contributors · ODbL</text></a>
</svg>'''
    return svg,v,stats

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--input-dir',required=True);ap.add_argument('--manifest',required=True);ap.add_argument('--output-dir',required=True);a=ap.parse_args()
    manifest=json.load(open(a.manifest));out=pathlib.Path(a.output_dir);out.mkdir(parents=True,exist_ok=True);metadata={}
    for slug,item in manifest['extracts'].items():
        src=pathlib.Path(a.input_dir)/(slug+'.geojson')
        if not src.exists():raise FileNotFoundError(src)
        fc=json.load(open(src));svg,v,stats=render(fc,item['bbox'],slug.replace('-',' ').title());(out/(slug+'.svg')).write_text(svg)
        metadata[slug]={**v,'featureCounts':stats,'attribution':'© OpenStreetMap contributors','license':'ODbL-1.0'}
    (out/'viewports.json').write_text(json.dumps(metadata,indent=2));print(json.dumps(metadata,indent=2))
if __name__=='__main__':main()
