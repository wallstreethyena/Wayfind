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
// v7.08 — setLocal() (lib/localStore.js) replaced the bare setItem here.
// Same requirement, finally met: the production store was measured five
// characters under its 5MB quota, so the bare write was throwing
// QuotaExceededError into a silent catch while this guard stayed green,
// because the CALL was present and only the WRITE was failing. The
// assertion is about persistence, not about which function performs it.
ok(/(?:localStorage\.setItem|setLocal)\("wf_center"/.test(home), "home.js persists the resolved location to wf_center");
// v8.46 — the gate grew a third clause. A finite center and a real locName are
// still required, and now the two must also DESCRIBE THE SAME PLACE: the owner's
// browser held { lat:35.26, lng:-81.13, loc:"Parrish, FL" } — a North Carolina
// pin under a Florida name — and this page prints metroCity from saved.loc, so
// it would have said "Parrish" over North Carolina restaurants.
ok(/isFinite\(center\.lat\)[\s\S]{0,140}locName[\s\S]{0,140}(?:setItem|setLocal)\("wf_center"/.test(home),
  "home.js gates the persist on a finite center AND a real locName (never the initial default)");
ok(/centerAgreesWithLabel\(center, locName\)[\s\S]{0,240}(?:setItem|setLocal)\("wf_center"/.test(home),
  "home.js will not persist a center and a label that describe different places");
ok(/centerAgreesWithLabel\(/.test(oi),
  "OrderInClient validates the stored pair before adopting it as this page's location");

// OrderInClient reads it, in the right precedence: URL params -> wf_center -> geolocation.
ok(/localStorage\.getItem\("wf_center"/.test(oi), "OrderInClient reads the app's last-known location (wf_center)");
const iUrl = oi.indexOf('searchParams.get("lat")');
const iSaved = oi.indexOf('getItem("wf_center")');
const iGeo = oi.indexOf("getCurrentPosition");
ok(iUrl >= 0 && iSaved >= 0 && iGeo >= 0 && iUrl < iSaved && iSaved < iGeo,
  "location precedence in OrderInClient: URL params -> wf_center -> geolocation");

console.log(`test-orderin-location: OK — ${pass} assertions (Order In inherits the app's metro on direct entry)`);
