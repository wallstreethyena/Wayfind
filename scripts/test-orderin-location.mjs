// scripts/test-orderin-location.mjs — locks A1. Order In must inherit the app's
// last-known location so a direct/bookmarked visit shows the SAME metro as the
// rest of the app, instead of re-geolocating or defaulting to Orlando.
import { readFileSync } from "fs";

let pass = 0;
const fail = (m) => { console.error("test-orderin-location: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass++; };

const home = readFileSync(new URL("../app/home.js", import.meta.url), "utf8");
const oi = readFileSync(new URL("../app/order-in/OrderInClient.js", import.meta.url), "utf8");

// home.js persists the RESOLVED location (gated on a real locName, not the default).
ok(/localStorage\.setItem\("wf_center"/.test(home), "home.js persists the resolved location to wf_center");
ok(/isFinite\(center\.lat\)[\s\S]{0,60}locName\)[\s\S]{0,40}setItem\("wf_center"/.test(home),
  "home.js gates the persist on a finite center AND a real locName (never the initial default)");

// OrderInClient reads it, in the right precedence: URL params -> wf_center -> geolocation.
ok(/localStorage\.getItem\("wf_center"/.test(oi), "OrderInClient reads the app's last-known location (wf_center)");
const iUrl = oi.indexOf('searchParams.get("lat")');
const iSaved = oi.indexOf('getItem("wf_center")');
const iGeo = oi.indexOf("getCurrentPosition");
ok(iUrl >= 0 && iSaved >= 0 && iGeo >= 0 && iUrl < iSaved && iSaved < iGeo,
  "location precedence in OrderInClient: URL params -> wf_center -> geolocation");

console.log(`test-orderin-location: OK — ${pass} assertions (Order In inherits the app's metro on direct entry)`);
