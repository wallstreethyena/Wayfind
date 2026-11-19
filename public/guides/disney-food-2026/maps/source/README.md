# Wayfind Disney geographic reference maps

Map data © OpenStreetMap contributors, available under ODbL 1.0:
https://www.openstreetmap.org/copyright
https://opendatacommons.org/licenses/odbl/1-0/

The adjacent ../data directory provides the derivative GeoJSON, original API acquisition URLs, SHA-256 hashes, relation download provenance, geometry audit and explicit exclusions. Map coordinates were not fabricated or relocated. SVG visuals are an independent Wayfind presentation, not official Disney artwork. Six malformed source relation surfaces were excluded rather than guessed. These maps do not establish current access, closures, accessibility, or complete pedestrian routing.

render.py builds SVGs from GeoJSON. Its viewport definition controls the same Mercator transform used by the React marker overlay. label-provenance.json identifies the exact source features and centroid coordinates behind the orientation labels. production.py and relations.py document the XML-to-GeoJSON assembly. Published data is downloadable without authentication at /guides/disney-food-2026/maps/data/{park}.geojson.

To reproduce the published core and whole-area SVGs from the adjacent data: `python3 refine.py --data-dir ../data --output-dir ./rendered`. This uses core-config.json, complete GeoJSON and the published source feature labels.
