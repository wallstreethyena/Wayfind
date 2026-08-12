// scripts/check-awin-links.mjs
//
// THE ONE PLACE AN AWIN MISTAKE CAN BE CAUGHT.
//
// awin1.com/cread.php redirects correctly WHETHER OR NOT WE ARE APPROVED. A
// link built for an unjoined programme 302s, lands the user on exactly the right
// page, converts — and pays nothing, while reading as a success in every
// dashboard we own. There is no runtime symptom, no error, no broken page. On
// Travelpayouts a missing promo_id produces a visibly wrong link; here it
// produces an invisibly worthless one.
//
// Everything below therefore runs the real builder against real inputs rather
// than grepping the source.
import { readFileSync } from "node:fs";

let pass = 0;
const fail = (m) => { console.error("check-awin-links: FAIL — " + m); process.exit(1); };
const ok = (c, m) => { if (!c) fail(m); pass += 1; };

const { AWIN_PROGRAMMES, AWIN_CONFLICTS, AWIN_AFFID, awinDeepLink, isAwinLive, liveAwinKeys } =
  await import("../lib/awin.js");

// ── 1. THE SHIPS-DARK CONTRACT, EXECUTED ──────────────────────────────────
const keys = Object.keys(AWIN_PROGRAMMES);
ok(keys.length >= 25, `the applied-for programme set is present (got ${keys.length})`);
ok(/^\d+$/.test(AWIN_AFFID), "the publisher id is a bare numeric awinaffid");

for (const k of keys) {
  const p = AWIN_PROGRAMMES[k];
  ok(/^\d+$/.test(String(p.mid)), `${k}: mid is numeric (got ${p.mid})`);
  ok(!!p.host && !/^https?:/.test(p.host), `${k}: host is a bare hostname, not a URL (got ${p.host})`);
  ok(["pending", "approved", "declined"].includes(p.status), `${k}: status is one of pending/approved/declined (got ${p.status})`);
  // An "approved" with no date is how a guess gets shipped as a fact.
  if (p.status === "approved") {
    ok(/^\d{4}-\d{2}-\d{2}$/.test(String(p.approvedOn || "")), `${k}: approved programmes MUST record approvedOn (got ${p.approvedOn})`);
  }
  // A PENDING programme must emit NOTHING, even given a perfect destination.
  if (p.status !== "approved") {
    const probe = awinDeepLink(k, "https://" + p.host + "/some/real/page");
    ok(probe === null, `${k}: status is "${p.status}" but awinDeepLink returned a link — this is the failure mode that pays nothing and looks fine`);
    ok(isAwinLive(k) === false, `${k}: isAwinLive must be false while ${p.status}`);
  }
}

// ── 2. THE HOST GATE, EXECUTED ────────────────────────────────────────────
// `ued` is an arbitrary URL Awin will redirect to. Without a host gate, one
// mis-tagged offer row sends a user anywhere while claiming a commission under
// this advertiser's MID.
const live = liveAwinKeys();
ok(live.length >= 1, `at least one programme is live (got ${live.length}) — if this is 0 the module is inert and the guard proves nothing`);
for (const k of live) {
  const p = AWIN_PROGRAMMES[k];
  const good = awinDeepLink(k, "https://www." + p.host + "/a/real/page", "surface:test");
  ok(typeof good === "string" && good.startsWith("https://www.awin1.com/cread.php?"), `${k}: a valid destination produces a cread.php link`);
  ok(good.includes("awinmid=" + p.mid), `${k}: the link carries THIS programme's mid`);
  ok(good.includes("awinaffid=" + AWIN_AFFID), `${k}: the link carries our awinaffid`);
  ok(good.includes("clickref=surface%3Atest"), `${k}: the sub-id rides as clickref`);
  ok(good.includes("ued=" + encodeURIComponent("https://www." + p.host + "/a/real/page")), `${k}: the destination is encoded into ued`);

  // Wrong host, look-alike host, and junk must all fail closed.
  for (const bad of [
    "https://evil.example.com/page",
    "https://" + p.host + ".evil.example.com/page",
    "https://" + p.host.replace(/\./g, "-") + ".com/page",
    "javascript:alert(1)",
    "not-a-url",
    "",
  ]) {
    ok(awinDeepLink(k, bad) === null, `${k}: refused a destination off the programme host (${bad || "empty"})`);
  }
  // A subdomain of the advertiser IS allowed — us.trip.com, ui.example.
  ok(typeof awinDeepLink(k, "https://sub." + p.host + "/x") === "string", `${k}: a subdomain of the advertiser is allowed`);
}

// ── 3. NO DOUBLE-CLAIMING A BRAND ACROSS NETWORKS ────────────────────────
// Two networks claiming one conversion loses money rather than making it.
const conflictKeys = Object.keys(AWIN_CONFLICTS);
ok(conflictKeys.length >= 4, "the do-not-join list is present");
for (const k of conflictKeys) {
  ok(!!AWIN_CONFLICTS[k].why, `${k}: the conflict records WHY, or the next person re-adds it`);
  ok(!AWIN_PROGRAMMES[k] || AWIN_PROGRAMMES[k].status !== "approved",
     `${k} is on the do-not-join list AND approved in AWIN_PROGRAMMES — one conversion cannot pay two networks`);
}
// The brands we earn from elsewhere must not appear as live Awin hosts either.
const liveHosts = new Set(live.map((k) => AWIN_PROGRAMMES[k].host));
for (const h of ["tiqets.com", "viator.com", "gocity.com", "klook.com", "ticketnetwork.com"]) {
  ok(!liveHosts.has(h), `${h} is live on another network — it must not also emit Awin links`);
}

// ── 4. EVERY WIRED AWIN OFFER POINTS AT AN APPROVED PROGRAMME ────────────
// A destination row for a pending programme is the exact silent-loss case.
const reg = readFileSync(new URL("../lib/partnerOfferRegistry.js", import.meta.url), "utf8");
const rows = [...reg.matchAll(/"([a-z0-9-]+)": offer\("awin_([a-z_]+)", "([^"]+)"/g)];
for (const [, id, key, dest] of rows) {
  ok(!!AWIN_PROGRAMMES[key], `offer ${id} names awin_${key}, which is not a known programme`);
  ok(isAwinLive(key), `offer ${id} is wired to awin_${key}, which is NOT approved — it would redirect correctly and pay nothing`);
  ok(awinDeepLink(key, dest) !== null, `offer ${id}: destination ${dest} is not on ${key}'s host, so the link would be refused at runtime`);
}
// The loop above is vacuous if nothing is wired, so assert it ran over real
// rows — and that the regex still matches the registry's actual shape. If
// partnerOfferRegistry changes how a provider is written, this catches it
// instead of silently checking zero rows and reporting green.
ok(rows.length >= 1, "no awin_* offer rows were found in partnerOfferRegistry — either nothing is wired (then remove the live programme) or the row shape changed and this guard is now checking nothing");
{
  const declared = (reg.match(/offer\("awin_/g) || []).length;
  ok(declared === rows.length, `found ${declared} awin_ offer( occurrences but only parsed ${rows.length} — the registry row shape drifted from what this guard reads`);
}

console.log(`check-awin-links: OK — ${pass} assertions; ${keys.length} programmes (${live.length} live, ${keys.length - live.length} dark), host gate and ships-dark contract both proven BY CALL`);
