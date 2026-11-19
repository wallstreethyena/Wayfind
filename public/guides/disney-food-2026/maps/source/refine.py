import json,pathlib,html,math,argparse
from render import render,point
parser=argparse.ArgumentParser(description='Render core and whole-area OSM maps with source-derived landmark labels.')
parser.add_argument('--data-dir',required=True);parser.add_argument('--output-dir',required=True);args=parser.parse_args()
root=pathlib.Path(__file__).parent;data=pathlib.Path(args.data_dir);config=json.load(open(root/'core-config.json'));manifest=json.load(open(data/'manifest.json'));out=pathlib.Path(args.output_dir);out.mkdir(parents=True,exist_ok=True)

def centroid(g):
 c=g['coordinates'];t=g['type']
 if t=='Polygon':ring=c[0]
 elif t=='MultiPolygon':ring=max((p[0] for p in c),key=lambda r:len(r))
 elif t=='LineString':return c[len(c)//2]
 else:raise ValueError(t)
 # planar centroid is adequate label anchoring within these tiny WGS84 polygons
 # Translate first to avoid catastrophic cancellation at large lon values.
 ox,oy=ring[0];ring=[(x-ox,y-oy) for x,y,*_ in ring];a=sx=sy=0
 for (x,y),(xx,yy) in zip(ring,ring[1:]):
  cross=x*yy-xx*y;a+=cross;sx+=(x+xx)*cross;sy+=(y+yy)*cross
 return [ox+sx/(3*a),oy+sy/(3*a)] if abs(a)>1e-15 else [ox,oy]

def label_markup(fc,v,ids):
 fs={f['id']:f for f in fc['features']};markup=[];audit=[];occupied=[]
 for id in ids:
  f=fs[id];name=f['properties']['name'];lon,lat=centroid(f['geometry']);x,y=point([lon,lat],v)
  if not 30<x<970 or not 30<y<v['height']-50:continue
  # Break long official names without renaming or asserting alternate locations.
  words=name.split();lines=['']
  for w in words:
   if len(lines[-1])+len(w)>23 and lines[-1]:lines.append(w)
   else:lines[-1]+=(' ' if lines[-1] else '')+w
  # Approximate glyph extent for a deterministic declutter check; omit, never shift.
  width=max(map(len,lines))*13;h=len(lines)*27
  rect=(x-width/2,y-h/2,x+width/2,y+h/2)
  if rect[0]<12 or rect[2]>988 or rect[1]<15 or rect[3]>v['height']-40:continue
  if any(rect[0]<q[2]+8 and rect[2]>q[0]-8 and rect[1]<q[3]+8 and rect[3]>q[1]-8 for q in occupied):continue
  occupied.append(rect)
  body=''.join(f'<tspan x="{x:.2f}" dy="{0 if i==0 else 27}">{html.escape(s)}</tspan>' for i,s in enumerate(lines))
  text=f'<text x="{x:.2f}" y="{y-(len(lines)-1)*13.5:.2f}" text-anchor="middle" font-family="Arial, sans-serif" font-size="25" font-weight="600" fill="#234a3b" stroke="#fffaf0" stroke-width="5" paint-order="stroke" stroke-linejoin="round">{body}</text>'
  markup.append(text+text.replace('stroke-width="5"','stroke-width="0"'))
  audit.append({'featureId':id,'label':name,'longitude':lon,'latitude':lat})
 return '<g aria-hidden="true">'+''.join(markup)+'</g>',audit

meta={};audits={}
for slug,cfg in config.items():
 fc=json.load(open(data/(slug+'.geojson')));audits[slug]={}
 for mode,bbox in [('core',cfg['bbox']),('whole',manifest['extracts'][slug]['bbox'])]:
  svg,v,stats=render(fc,bbox,slug.replace('-',' ').title());labels,audit=label_markup(fc,v,cfg['labels']);svg=svg.replace('</svg>',labels+'</svg>')
  svg=svg.replace('#c5d2b5','#b6c7a4').replace('#d5c5ad','#cdb99b').replace('#aa967b','#947e60').replace('#b6d8d7','#a4cccf').replace('stroke-width:2.5','stroke-width:3.5')
  filename=slug+('' if mode=='core' else '-whole')+'.svg';(out/filename).write_text(svg)
  meta[slug if mode=='core' else slug+'-whole']={**v,'featureCounts':stats,'attribution':'© OpenStreetMap contributors','license':'ODbL-1.0'};audits[slug][mode]=audit
(out/'viewports.json').write_text(json.dumps(meta,indent=2));(out/'label-provenance.json').write_text(json.dumps(audits,indent=2));print('10SVGs with source-derived labels generated')
