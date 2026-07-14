// scripts/atlas-fixtures.mjs — freeze REAL Google type signatures from wf_inventory
// into a fixture file, so the classifier tests are pinned to what Google ACTUALLY
// returns, never to what we assume it returns. (The Mote lesson: the mapper was
// almost tested against an assumed `aquarium` type Mote does not have.)
// Read-only. Run once; commit the output.
import fs from "node:fs";
for (const line of fs.readFileSync(".env.local","utf8").split("\n")) { const m=line.match(/^([A-Z0-9_]+)=(.*)$/); if(m&&!process.env[m[1]]) process.env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const U=String(process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL||"").trim().replace(/^['"]+|['"]+$/g,"").replace(/\/+$/,"");
const K=String(process.env.SUPABASE_SERVICE_ROLE_KEY||"").trim();
const rows=[]; for(let f=0;;f+=1000){const r=await fetch(`${U}/rest/v1/wf_inventory?select=place_id,name,category,google_types,primary_type,signals`,{headers:{apikey:K,Authorization:`Bearer ${K}`,Range:`${f}-${f+999}`}}); const j=await r.json(); rows.push(...j); if(j.length<1000)break;}
// Keep the cases that DECIDE the rules — every one is a real row, verbatim.
const pick = (name) => { const r = rows.find(x => x.name === name); if (!r) { console.error("MISSING fixture row:", name); process.exit(1); } return { name: r.name, types: r.google_types, primaryType: r.primary_type, storedCategory: r.category, reviews: (r.signals||{}).reviews ?? 0 }; };
const NAMES = [
  // service / trade — must be EXCLUDED (today they are admitted)
  "Cabinetree", "Ideal Classic Cars", "MarineMax Venice",
  // residential / parking — must be EXCLUDED
  "Bay Indies", "Park Store Go", "Camelot Lakes Village", "Vizcaya Lakes",
  // scraped short-term rentals — generic `lodging` only, must be EXCLUDED
  "Beautiful 3-bedroom house in Florida", "Private Waterfront Cottage with pool on 5 Acres Lakewood Ranch Area in Myakka FL - Entire Place",
  // REAL hotels — must SURVIVE (negative controls; a name-based rule wrongly killed these)
  "Island Sun Inn & Suites - Historic Venice & Beach Getaway", "Venice Beach Villas", "A Beach Retreat On Casey Key", "Siesta Heron Suites & Villas",
  "EVEN Hotel Sarasota-Lakewood Ranch by IHG",     // array-order bug: spa listed before hotel
  // genuine marinas — Activities + on-the-water, NOT beach
  "Venice Yacht Club", "Royal Palm Marina", "Freedom Boat Club - Venice La Guna",
  // a legit tackle SHOP that carries a marina type — Shopping, not on-the-water
  "Island Discount Tackle",
  // grocery — Food identity, Markets sub-tab only
  "Whole Foods Market", "Detwiler's Farm Market",
  // bars buried in Food
  "Seasons 52", "The End Zone Sports Grille",
];
const out = {};
for (const n of NAMES) out[n] = pick(n);
// also every distinct primary_type actually present, for coverage
out.__primaryTypesPresent = [...new Set(rows.map(r=>r.primary_type).filter(Boolean))].sort();
fs.writeFileSync("data/atlas/fixtures-real-types.json", JSON.stringify(out, null, 2) + "\n");
console.log("wrote data/atlas/fixtures-real-types.json —", NAMES.length, "real rows +", out.__primaryTypesPresent.length, "distinct primary_types");
