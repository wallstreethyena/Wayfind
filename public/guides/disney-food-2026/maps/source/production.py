import argparse
import xml.etree.ElementTree as E,json,pathlib,hashlib,collections
from shapely.geometry import Polygon,LineString,mapping,box
from shapely.ops import polygonize_full,unary_union
from shapely.validation import explain_validity
parser=argparse.ArgumentParser(description='Assemble OSM XML ways and complete multipolygon relations; requires Shapely.')
parser.add_argument('input_dir');parser.add_argument('output_dir');args=parser.parse_args()
out=pathlib.Path(args.input_dir);dest=pathlib.Path(args.output_dir);dest.mkdir(parents=True,exist_ok=True)
manifest=json.loads((out/'manifest.json').read_text());missing=json.loads((out/'missing-relations.json').read_text());audit={}
def tags(x):return {a.get('k'):a.get('v') for a in x.findall('tag')}
def relevant(t):return any(k in t for k in ['natural','building','landuse','highway','waterway']) or t.get('leisure') in ['park','garden','pitch','swimming_pool','playground']
for name,meta in manifest['extracts'].items():
 root=E.parse(out/(name+'.osm')).getroot();els={k:{x.get('id'):x for x in root.findall(k)} for k in ['node','way','relation']};errors=[]
 for rid in missing[name]:
  p=out/'relations'/(rid+'.osm')
  if not p.exists():errors.append('Missing required relation/full '+rid);continue
  for x in E.parse(p).getroot():
   if x.tag in els:els[x.tag][x.get('id')]=x
 ns={id:(float(n.get('lon')),float(n.get('lat'))) for id,n in els['node'].items()};ws=els['way'];features=[];consumed=set();viewport=box(*meta['bbox'])
 def coords(w):return [ns[n.get('ref')] for n in w.findall('nd')]
 def feature(id,t,g):
  if g.is_empty or not g.intersects(viewport):return
  if not g.is_valid:errors.append(id+': '+explain_validity(g));return
  features.append({'type':'Feature','id':id,'properties':t,'geometry':mapping(g)})
 for rid,r in els['relation'].items():
  t=tags(r)
  if t.get('type')!='multipolygon' or not relevant(t):continue
  members=[m for m in r.findall('member') if m.get('type')=='way'];groups={'outer':[],'inner':[]};bad=False
  for m in members:
   role=m.get('role') or 'outer'
   if role not in groups:continue
   try:groups[role].append(LineString(coords(ws[m.get('ref')])) )
   except (KeyError,ValueError):bad=True
  if bad:errors.append('relation/'+rid+': missing member or node');continue
  polys={}
  for role,lines in groups.items():
   p,cuts,dangles,invalid=polygonize_full(lines);polys[role]=p
   if not cuts.is_empty or not dangles.is_empty or not invalid.is_empty:bad=True;errors.append('relation/'+rid+': unclosed '+role+' topology')
  if bad:continue
  geom=unary_union(polys['outer'])
  inn=unary_union(polys['inner'])
  if not inn.is_empty and not geom.covers(inn):errors.append('relation/'+rid+': inner outside outer');continue
  geom=geom.difference(inn)
  feature('relation/'+rid,t,geom)
  consumed.update(m.get('ref') for m in members)
 for wid,w in ws.items():
  t=tags(w)
  if not relevant(t):continue
  if wid in consumed:continue
  try:c=coords(w)
  except KeyError:errors.append('way/'+wid+': missing node');continue
  if len(c)<2:continue
  area=len(c)>3 and c[0]==c[-1] and (t.get('area')=='yes' or any(k in t for k in ['building','landuse']) or t.get('natural') not in [None,'coastline','cliff','ridge','tree_row'] or t.get('leisure') in ['park','garden','pitch','swimming_pool','playground'])
  feature('way/'+wid,t,Polygon(c) if area else LineString(c))
 data={'type':'FeatureCollection','attribution':'© OpenStreetMap contributors','license':'ODbL-1.0','source':meta['source_url'],'bbox':meta['bbox'],'features':features}
 (dest/(name+'.geojson')).write_text(json.dumps(data,separators=(',',':')))
 audit[name]={'features':len(features),'errors':errors,'types':dict(collections.Counter(f['geometry']['type'] for f in features))};print(name,len(features),'errors',len(errors),flush=True)
(dest/'audit.json').write_text(json.dumps(audit,indent=2));(dest/'manifest.json').write_text(json.dumps(manifest,indent=2));print(json.dumps(audit,indent=2))
