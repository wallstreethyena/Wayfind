// Pure affiliate-tag scanner. No process.env reads: every required id is a
// literal imported from the module that already owns it, or a fallback literal
// parsed out of that module's source. A partner whose id is only an env read
// with no repo literal is a GAP — domain presence is reported, never a guessed id.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { WAYFIND_VIATOR_PID } from "../../lib/viatorPid.js";
import { AWIN_AFFID, AWIN_PROGRAMMES, isAwinLive } from "../../lib/awin.js";
import { CJ_PID } from "../../lib/deals.js";
import { CJ_PARTNERS } from "../../lib/cjPartners.js";
import { TP_PROGRAMS } from "../../lib/travelpayouts.js";

const URL_RE = /https?:\/\/[^\s"'`<>\\)]+/g;
const ALLOW_RE = /wf-affiliate-allow:\s*official\b/;
const BUILDER_CALL_RE = /withViatorTracking\s*\(|viatorDirectUrl\s*\(|viatorProductGoUrl\s*\(|pinViatorPid\s*\(|tpDeepLink\s*\(|awinDeepLink\s*\(|clippDeepLink\s*\(|rawPathDeepLink\s*\(|tnRawPathDeepLink\s*\(|tmImpactLink\s*\(|ticketOutUrl\s*\(|stay22HotelRedirectUrl\s*\(|cjPartnerDeepLink\s*\(|cityPassTrackedUrl\s*\(/;

function must(re, src, what) {
  const m = re.exec(src);
  if (!m) throw new Error(`affiliate-tag rules: ${what} is not a literal in the repo — refusing to invent it`);
  return m[1];
}

function hostOfHome(home) {
  try { return new URL(home).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return null; }
}

export function hostIs(hostname, domain) {
  const h = String(hostname || "").toLowerCase().replace(/\.$/, "");
  const d = String(domain || "").toLowerCase().replace(/^\*\./, "");
  return h === d || h.endsWith("." + d);
}

function read(root, rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

/**
 * Partner rules derived from the builders. `kind`:
 *   query    — required params live on this host
 *   merchant — a bare URL on this host is untracked; tracking is a wrapper
 *   wrapper  — this host IS the tracking hop and must carry the params
 *   short    — tracking is the short-link host itself (no query param defined)
 *   gap      — required value is not pinned in the repo; flag the domain only
 */
export function loadRules(root) {
  const affiliates = read(root, "lib/affiliates.js");
  const hotels = read(root, "lib/hotelRedirect.js");
  const tpSrc = read(root, "lib/travelpayouts.js");
  const providers = read(root, "lib/commerceProviders.js");

  const mcid = must(/searchParams\.set\("mcid", "(\d+)"\)/, affiliates, "Viator mcid");
  if (!/searchParams\.set\("medium", "link"\)/.test(affiliates) || !/existing !== "api"/.test(affiliates)) {
    throw new Error("affiliate-tag rules: withViatorTracking no longer preserves medium=api and sets medium=link");
  }
  const stayAid = must(/const STAY22_AID = "([a-z0-9]+)"/, hotels, "Stay22 aid");
  const marker = must(/NEXT_PUBLIC_TP_MARKER_ACCOUNT \|\| "(\d+)"/, tpSrc, "Travelpayouts marker");
  const trs = must(/export const TP_TRS = "(\d+)"/, tpSrc, "Travelpayouts trs");
  const tmSid = must(/NEXT_PUBLIC_IMPACT_SID \|\| "(\d+)"/, affiliates, "Impact SID");
  const tmCampaign = must(/NEXT_PUBLIC_TM_IMPACT_CAMPAIGN \|\| "(\d+)"/, affiliates, "Impact campaign");
  const tmAd = must(/NEXT_PUBLIC_TM_IMPACT_AD \|\| "(\d+)"/, affiliates, "Impact ad");
  if (!/partner_id=/.test(affiliates) || !/NEXT_PUBLIC_GYG_PID/.test(affiliates)) {
    throw new Error("affiliate-tag rules: GetYourGuide partner_id shape changed — re-read affiliates.js before flagging the domain");
  }
  if (!WAYFIND_VIATOR_PID || !/^P\d+$/.test(WAYFIND_VIATOR_PID)) {
    throw new Error("affiliate-tag rules: WAYFIND_VIATOR_PID is missing");
  }
  if (!CJ_PID || !/^\d+$/.test(CJ_PID)) throw new Error("affiliate-tag rules: CJ_PID is missing");
  if (!AWIN_AFFID || !/^\d+$/.test(AWIN_AFFID)) throw new Error("affiliate-tag rules: AWIN_AFFID is missing");

  const cjHostSrc = must(/CJ_REDIRECT_HOSTS = \[\/\(\^\|\\\.\)\(\?:([a-z0-9.|\\]+)\)\$\/i\]/, providers, "CJ redirect hosts");
  const cjHosts = cjHostSrc.split("|").map((h) => h.replace(/\\\./g, "."));
  if (cjHosts.length < 4) throw new Error("affiliate-tag rules: CJ redirect host list parsed too short");

  const gaps = [];
  const merchants = [];
  const wrappers = [];
  const hostTaken = () => new Set([
    ...merchants.flatMap((p) => p.hosts),
    ...gaps.flatMap((g) => g.hosts),
  ]);
  gaps.push({
    id: "getyourguide",
    hosts: ["getyourguide.com"],
    reason: "partner_id is appended only from credential(NEXT_PUBLIC_GYG_PID); the repo pins no publisher id. Flag the domain, do not invent one",
  });
  gaps.push({
    id: "booking",
    hosts: ["booking.com"],
    reason: "hotelUrl/bookingHotelSearchUrl emit a plain booking.com URL; Stay22 LinkSwap rewrites it in the browser. No affiliate query param is defined on booking.com. The pinned param is Stay22 aid=" + stayAid + " on stay22.com",
  });

  merchants.push({
    id: "viator",
    kind: "query",
    hosts: ["viator.com"],
    params: [
      { name: "pid", value: WAYFIND_VIATOR_PID },
      { name: "mcid", value: mcid },
      { name: "medium", values: ["link", "api"] },
    ],
    detail: `pid=${WAYFIND_VIATOR_PID}, mcid=${mcid}, medium=link|api (withViatorTracking)`,
  });

  merchants.push({
    id: "stay22",
    kind: "query",
    hosts: ["stay22.com"],
    params: [
      { name: "aid", value: stayAid },
      { name: "campaign", pattern: "^[A-Za-z0-9_-]{8,64}$" },
    ],
    detail: `aid=${stayAid} and campaign (stay22HotelRedirectUrl)`,
  });

  merchants.push({
    id: "ticketmaster",
    kind: "merchant",
    hosts: ["ticketmaster.com", "livenation.com", "ticketweb.com"],
    detail: `Impact redirect ticketmaster.evyy.net/c/${tmSid}/${tmCampaign}/${tmAd} (tmImpactLink) or /api/ticketmaster/go`,
  });

  const cjMerchants = [
    { id: "undercover-tourist", hosts: ["undercovertourist.com"], via: "rawPathDeepLink" },
    { id: "clipp", hosts: ["clipp.com"], via: "clippDeepLink" },
    { id: "citypass", hosts: ["citypass.com"], via: "cityPassTrackedUrl" },
    { id: "ticketnetwork", hosts: ["ticketnetwork.com"], via: "tnRawPathDeepLink" },
  ];
  for (const [key, row] of Object.entries(CJ_PARTNERS)) {
    cjMerchants.push({ id: `cj-${key}`, hosts: [row.host], via: "cjPartnerDeepLink" });
  }
  for (const row of cjMerchants) {
    merchants.push({
      id: row.id,
      kind: "merchant",
      hosts: row.hosts,
      detail: `CJ deep link containing publisher PID ${CJ_PID} (${row.via})`,
    });
  }

  for (const [key, prog] of Object.entries(AWIN_PROGRAMMES)) {
    if (!prog.host) continue;
    const host = String(prog.host).replace(/^www\./, "").toLowerCase();
    if (hostTaken().has(host)) continue;
    if (isAwinLive(key)) {
      merchants.push({
        id: `awin-${key}`,
        kind: "merchant",
        hosts: [host],
        detail: `awin1.com/cread.php?awinmid=${prog.mid}&awinaffid=${AWIN_AFFID} (awinDeepLink)`,
      });
    } else {
      gaps.push({
        id: `awin-${key}`,
        hosts: [host],
        reason: `Awin programme ${key} status=${prog.status || "unknown"}; awinDeepLink returns null until approved with a date, so no tracking param is defined`,
      });
    }
  }

  for (const [key, prog] of Object.entries(TP_PROGRAMS)) {
    const host = hostOfHome(prog.home);
    if (!host) continue;
    const live = !!(prog.promoId && prog.campaignId);
    if (hostTaken().has(host)) continue;
    if (!live) {
      gaps.push({
        id: `tp-${key}`,
        hosts: [host],
        reason: `Travelpayouts programme ${key} has no promoId/campaignId in lib/travelpayouts.js; tpDeepLink returns null`,
      });
      continue;
    }
    merchants.push({
      id: `tp-${key}`,
      kind: "merchant",
      hosts: [host],
      detail: `tp.media/r?campaign_id=${prog.campaignId}&marker=${marker}&p=${prog.promoId}&trs=${trs} (tpDeepLink)`,
    });
  }

  wrappers.push({
    id: "tp.media",
    kind: "wrapper",
    hosts: ["tp.media"],
    accept(url) {
      const missing = [];
      const campaign = url.searchParams.get("campaign_id");
      const p = url.searchParams.get("p");
      if (url.searchParams.get("marker") !== marker) missing.push(`marker=${marker}`);
      if (url.searchParams.get("trs") !== trs) missing.push(`trs=${trs}`);
      const live = Object.values(TP_PROGRAMS).filter((prog) => prog.promoId && prog.campaignId);
      const pairOk = live.some((prog) => prog.campaignId === campaign && prog.promoId === p);
      if (!pairOk) missing.push("campaign_id+p of a live Travelpayouts programme");
      return missing;
    },
    detail: `marker=${marker}, trs=${trs}, and a live programme campaign_id+p`,
  });

  wrappers.push({
    id: "awin1.com",
    kind: "wrapper",
    hosts: ["awin1.com"],
    accept(url) {
      const missing = [];
      if (url.searchParams.get("awinaffid") !== AWIN_AFFID) missing.push(`awinaffid=${AWIN_AFFID}`);
      const mid = url.searchParams.get("awinmid");
      const liveMids = Object.entries(AWIN_PROGRAMMES).filter(([k]) => isAwinLive(k)).map(([, prog]) => prog.mid);
      if (!liveMids.includes(mid)) missing.push("awinmid of a live programme");
      if (!url.searchParams.get("ued")) missing.push("ued");
      return missing;
    },
    detail: `awinaffid=${AWIN_AFFID}, live awinmid, ued`,
  });

  wrappers.push({
    id: "cj-redirect",
    kind: "wrapper",
    hosts: cjHosts,
    accept(url) {
      return String(url).includes(CJ_PID) ? [] : [`publisher PID ${CJ_PID}`];
    },
    detail: `URL contains CJ publisher PID ${CJ_PID}`,
  });

  wrappers.push({
    id: "ticketmaster-impact",
    kind: "wrapper",
    hosts: ["ticketmaster.evyy.net"],
    accept(url) {
      const want = `/c/${tmSid}/${tmCampaign}/${tmAd}`;
      return url.pathname.includes(want) ? [] : [`path ${want}`];
    },
    detail: `path /c/${tmSid}/${tmCampaign}/${tmAd}`,
  });

  wrappers.push({
    id: "tp-short",
    kind: "short",
    hosts: ["tpx.lu", "tp.st"],
    detail: "short-link host (tp.st / *.tpx.lu); no query param is defined — a non-empty path token is the link",
  });

  return {
    pid: WAYFIND_VIATOR_PID,
    mcid,
    stayAid,
    marker,
    trs,
    cjPid: CJ_PID,
    awinAffid: AWIN_AFFID,
    tm: { sid: tmSid, campaign: tmCampaign, ad: tmAd },
    merchants,
    wrappers,
    gaps,
  };
}

export function codeLines(src) {
  const out = [];
  let block = false;
  const lines = String(src).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    let code = "";
    let quote = null;
    for (let j = 0; j < raw.length; j++) {
      const c = raw[j];
      const n = raw[j + 1];
      if (block) {
        if (c === "*" && n === "/") { block = false; j++; code += "  "; continue; }
        code += " ";
        continue;
      }
      if (quote) {
        code += c;
        if (c === "\\" && quote !== "`") { code += n || ""; j++; continue; }
        if (c === quote) quote = null;
        continue;
      }
      if (c === "/" && n === "/") break;
      if (c === "/" && n === "*") { block = true; j++; code += "  "; continue; }
      if (c === "\"" || c === "'" || c === "`") { quote = c; code += c; continue; }
      code += c;
    }
    out.push({ lineNo: i + 1, raw, code });
  }
  return out;
}

function cleanUrlToken(token) {
  return String(token).replace(/[.,;:]+$/g, "").replace(/\\+$/g, "");
}

function findRule(hostname, rules) {
  for (const w of rules.wrappers) {
    if (w.hosts.some((h) => hostIs(hostname, h))) return w;
  }
  for (const m of rules.merchants) {
    if (m.hosts.some((h) => hostIs(hostname, h))) return m;
  }
  for (const g of rules.gaps) {
    if (g.hosts.some((h) => hostIs(hostname, h))) return { ...g, kind: "gap" };
  }
  return null;
}

function missingQuery(url, params) {
  const missing = [];
  for (const spec of params) {
    const got = url.searchParams.getAll(spec.name);
    if (got.length !== 1) {
      missing.push(spec.value ? `${spec.name}=${spec.value}` : spec.name);
      continue;
    }
    if (spec.value != null && got[0] !== spec.value) missing.push(`${spec.name}=${spec.value}`);
    else if (spec.values && !spec.values.includes(got[0])) missing.push(`${spec.name}=${spec.values.join("|")}`);
    else if (spec.pattern && !new RegExp(spec.pattern).test(got[0])) missing.push(`${spec.name} matching ${spec.pattern}`);
  }
  return missing;
}

export function judgeUrl(urlString, rules) {
  let url;
  try { url = new URL(urlString); }
  catch { return null; }
  if (urlString.includes("${")) return null;
  // Partner API hosts (api.viator.com/partner/...) are not click URLs.
  // hostIs() would otherwise treat api.viator.com as viator.com.
  if (url.hostname.toLowerCase().startsWith("api.")) return null;
  const rule = findRule(url.hostname, rules);
  if (!rule) return null;
  if (rule.kind === "gap") {
    return { outcome: "gap", partner: rule.id, gap: rule.reason, host: url.hostname };
  }
  if (rule.kind === "short") {
    const token = url.pathname.replace(/^\/+|\/+$/g, "");
    if (!token) return { outcome: "violation", partner: rule.id, detail: "short link has no path token" };
    return { outcome: "ok", partner: rule.id };
  }
  if (rule.kind === "wrapper") {
    const missing = rule.accept(url);
    if (missing.length) return { outcome: "violation", partner: rule.id, detail: "missing " + missing.join(", ") };
    return { outcome: "ok", partner: rule.id };
  }
  if (rule.kind === "query") {
    const missing = missingQuery(url, rule.params);
    if (missing.length) return { outcome: "violation", partner: rule.id, detail: "missing " + missing.join(", ") };
    return { outcome: "ok", partner: rule.id };
  }
  if (rule.kind === "merchant") {
    return { outcome: "violation", partner: rule.id, detail: "bare " + url.hostname + " URL; required tracking is " + rule.detail };
  }
  return null;
}

function lineContext(line) {
  if (ALLOW_RE.test(line.raw)) return "official";
  if (BUILDER_CALL_RE.test(line.code)) return "builder-arg";
  if (/\bviatorUrl\s*:/.test(line.code)) return "viator-input";
  return "outbound";
}

export function scanText(text, filename, rules) {
  const violations = [];
  const inputs = [];
  const official = [];
  const domainFlags = [];
  for (const line of codeLines(text)) {
    const ctx = lineContext(line);
    const seen = new Set();
    for (const hit of line.code.matchAll(URL_RE)) {
      const token = cleanUrlToken(hit[0]);
      if (seen.has(token)) continue;
      seen.add(token);
      const judged = judgeUrl(token, rules);
      if (!judged || judged.outcome === "ok") continue;
      const rec = { file: filename, line: line.lineNo, url: token, partner: judged.partner, detail: judged.detail || judged.gap || "" };
      if (ctx === "official") { official.push(rec); continue; }
      if (ctx === "builder-arg" || ctx === "viator-input") { inputs.push({ ...rec, via: ctx }); continue; }
      if (judged.outcome === "gap") { domainFlags.push(rec); continue; }
      violations.push(rec);
    }
  }
  return { violations, inputs, official, domainFlags };
}

export function scanFile(absPath, rules, root) {
  const rel = path.relative(root, absPath).split(path.sep).join("/");
  return scanText(readFileSync(absPath, "utf8"), rel, rules);
}

function walk(dir, acc, pred) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc, pred);
    else if (pred(p)) acc.push(p);
  }
}

export function contentFiles(root) {
  const files = [];
  const lib = path.join(root, "lib");
  if (existsSync(lib)) {
    for (const name of readdirSync(lib)) {
      if (!name.endsWith(".js")) continue;
      if (/^(guides|guide|culture|event|events|curatedEvents|posterEvents|frontEvents|familyDay|fallPool|fallEvent|christmas)/.test(name)) {
        files.push(path.join(lib, name));
      }
    }
  }
  const text = (p) => /\.(js|jsx|mjs|md|json)$/.test(p);
  for (const rel of ["app/guides", "app/events", "app/florida-events", "app/culture"]) {
    walk(path.join(root, rel), files, text);
  }
  walk(path.join(root, "data"), files, (p) => /guide|event/i.test(p) && text(p));
  return files;
}

function statementAt(lines, index) {
  let statement = lines[index].code;
  if (statement.includes(";")) return statement;
  for (let k = 1; k <= 8 && index + k < lines.length; k++) {
    statement += "\n" + lines[index + k].code;
    if (lines[index + k].code.includes(";")) break;
  }
  return statement;
}

export function auditViatorText(text, filename) {
  const violations = [];
  const lines = codeLines(text);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/\bviatorUrl\b/.test(line.code)) continue;
    const statement = statementAt(lines, i);
    if (BUILDER_CALL_RE.test(statement)) continue;
    if (/\bviatorUrl\s*:/.test(line.code)) continue;
    const assignsHref = /(?:const|let|var)\s+(?:href|book|link|cta)\s*=\s*[^;]*\bviatorUrl\b/.test(statement);
    const usesHref = /\bhref\b/.test(line.code) || /openExternal\s*\(/.test(line.code) || /window\.open\s*\(/.test(line.code);
    if (assignsHref || usesHref) {
      violations.push({
        file: filename,
        line: line.lineNo,
        partner: "viator",
        detail: "viatorUrl is used as a link without withViatorTracking/viatorProductGoUrl/viatorDirectUrl in the same statement",
        url: line.code.trim().slice(0, 180),
      });
    }
  }
  return violations;
}

export function auditViatorCallSites(root) {
  const violations = [];
  const files = [];
  const text = (p) => p.endsWith(".js") || p.endsWith(".jsx") || p.endsWith(".mjs");
  walk(path.join(root, "app"), files, text);
  walk(path.join(root, "lib"), files, text);
  for (const abs of files) {
    const rel = path.relative(root, abs).split(path.sep).join("/");
    violations.push(...auditViatorText(readFileSync(abs, "utf8"), rel));
  }
  return { files: files.length, violations };
}
