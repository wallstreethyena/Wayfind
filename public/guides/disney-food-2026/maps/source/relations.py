import pathlib,json,urllib.request,time,argparse
parser=argparse.ArgumentParser(description='Fetch missing OSM relation members listed in missing-relations.json.')
parser.add_argument('input_dir');args=parser.parse_args()
out=pathlib.Path(args.input_dir);(out/'relations').mkdir(exist_ok=True)
for rid in sorted(set(sum(json.loads((out/'missing-relations.json').read_text()).values(),[]))):
 p=out/'relations'/(rid+'.osm')
 if p.exists():continue
 try:
  with urllib.request.urlopen('https://api.openstreetmap.org/api/0.6/relation/'+rid+'/full',timeout=45) as r:p.write_bytes(r.read())
  print(rid,p.stat().st_size,flush=True)
 except Exception as e:print('ERROR',rid,str(e),flush=True)
 time.sleep(.3)
