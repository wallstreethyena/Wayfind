// lib/trendRights.js — THE LICENCE GATE. Nothing in the Exploding Topics
// pipeline runs until this module says which rights we actually hold.
//
// WHY A WHOLE MODULE FOR A CONFIG READ. The owner's plan is the $99 Semrush
// "Investor" tier with CSV export. That buys the EXPORT. It does not, on its
// face, buy: AI processing of the exported rows, integration into a paid
// consumer product, public display of topic names or metrics, a derived public
// ranking signal, indefinite caching, or redistribution to Wayfind's users.
// Semrush's terms describe ordinary use as INTERNAL BUSINESS USE and separately
// restrict commercial exploitation, making output available to third parties,
// and using output as AI/ML input. Commercial productisation is pointed at a
// custom arrangement.
//
// So the licence is not a footnote on this feature — it is the feature's
// on-switch, and the difference between the three modes is the difference
// between "a private report" and "a term in the ranking of a commercial app."
//
// AGENTS.md §5 — ABSENT CONFIGURATION FAILS LOUDLY, NEVER SILENTLY. There is no
// default. `unconfirmed` is not the fallback; it is a value someone has to
// choose and write down. An unset variable throws and names itself, because the
// failure this prevents is the §5(b) "plausible empty": a misconfiguration that
// renders as an ordinary quiet product state and is undiagnosable from outside.
//
// THE ASYMMETRY THAT SETS THE DEFAULT DIRECTION. Reading the CSV when we were
// allowed to costs nothing. Reading it when we were not is a licence breach that
// no later code change undoes. Every gate here therefore fails CLOSED.

/** The only three values this system recognises. Order is increasing permission. */
export const RIGHTS_MODES = ["unconfirmed", "internal_research", "commercial_approved"];

/** The only two cadences. Each carries its own staleness ceiling. */
export const CADENCES = {
  // Exploding Topics surfaces EMERGING trends — a signal that moves over weeks,
  // not hours. Weekly is the recommended starting cadence, and 8 days is one
  // week plus a day of slack so a Monday export is not stale on the next Monday
  // morning before the human gets to it.
  weekly: { maxAgeDays: 8, label: "weekly" },
  // Supported if the owner later chooses to export by hand every day. A shorter
  // ceiling is the whole point of choosing it.
  daily: { maxAgeDays: 2, label: "daily" },
};

/** Raised when required licence/cadence configuration is absent or unknown. */
export class TrendConfigError extends Error {
  constructor(variable, detail) {
    super(`${variable} ${detail}`);
    this.name = "TrendConfigError";
    this.variable = variable;
  }
}

function readEnv(name, env) {
  const src = env || (typeof process !== "undefined" ? process.env : {}) || {};
  const raw = src[name];
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * The configured rights mode. Throws TrendConfigError naming the variable when
 * it is missing or not one of RIGHTS_MODES.
 *
 * An EMPTY string is treated as missing, not as a value. `EXPLODING_TOPICS_RIGHTS_MODE=`
 * in a .env file is somebody having half-configured it, which is exactly the
 * state §5 says must not read as a working configuration.
 */
export function rightsMode(env) {
  const v = readEnv("EXPLODING_TOPICS_RIGHTS_MODE", env);
  if (!v) {
    throw new TrendConfigError(
      "EXPLODING_TOPICS_RIGHTS_MODE",
      `is not set. There is no default — set it to one of: ${RIGHTS_MODES.join(" | ")}. ` +
        `Until Semrush confirms in writing what the Investor plan permits, the correct value is "unconfirmed" ` +
        `(see docs/exploding-topics-rights.md for the questions that must be answered first).`
    );
  }
  if (!RIGHTS_MODES.includes(v)) {
    throw new TrendConfigError(
      "EXPLODING_TOPICS_RIGHTS_MODE",
      `is "${v}", which is not a recognised rights mode. Valid values: ${RIGHTS_MODES.join(" | ")}. ` +
        `A typo must never be read as permission.`
    );
  }
  return v;
}

/**
 * The configured import cadence and its staleness ceiling. Throws naming the
 * variable when absent or unknown.
 *
 * Cadence is a LICENCE-ADJACENT fact, not a tuning knob: it declares how often a
 * human is expected to re-export, and therefore how long a snapshot may be
 * trusted. An implicit default here would mean nobody ever decided.
 */
export function importCadence(env) {
  const v = readEnv("EXPLODING_TOPICS_IMPORT_CADENCE", env);
  if (!v) {
    throw new TrendConfigError(
      "EXPLODING_TOPICS_IMPORT_CADENCE",
      `is not set. There is no default — set it to one of: ${Object.keys(CADENCES).join(" | ")}. ` +
        `Start with "weekly": Exploding Topics measures emerging interest over weeks, and a daily manual ` +
        `export cadence nobody sustains produces a permanently stale snapshot.`
    );
  }
  if (!Object.prototype.hasOwnProperty.call(CADENCES, v)) {
    throw new TrendConfigError(
      "EXPLODING_TOPICS_IMPORT_CADENCE",
      `is "${v}", which is not a recognised cadence. Valid values: ${Object.keys(CADENCES).join(" | ")}.`
    );
  }
  return { cadence: v, ...CADENCES[v] };
}

/**
 * The written-approval reference. REQUIRED whenever the mode is raised above
 * `unconfirmed`.
 *
 * WHY A SECOND VARIABLE. Without this, raising the licence is a one-word edit
 * that nobody reviews and nothing records — and six months later the only
 * evidence that Semrush ever approved anything is that somebody typed
 * "commercial_approved" once. This forces the operator to name the ticket,
 * contract or email reference at the same moment, in the same place, and the
 * value flows into every snapshot row so an audit can trace a piece of data back
 * to the permission it was ingested under.
 *
 * It is NOT a secret — it is a reference like "semrush-support-#84213" or
 * "MSA-2026-11 §4.2", and it is safe to log. Placeholder-shaped values are
 * rejected, because a variable set to "TODO" is the same as unset while looking
 * configured.
 */
export function rightsReference(env) {
  const mode = rightsMode(env);
  if (mode === "unconfirmed") return null;
  const ref = readEnv("EXPLODING_TOPICS_RIGHTS_REF", env);
  if (!ref) {
    throw new TrendConfigError(
      "EXPLODING_TOPICS_RIGHTS_REF",
      `is not set, but EXPLODING_TOPICS_RIGHTS_MODE is "${mode}". Raising the licence mode requires naming the written ` +
        `confirmation it rests on (a Semrush support ticket, contract clause, or email reference). ` +
        `Record the full answers in docs/exploding-topics-rights.md and put the reference here.`
    );
  }
  if (/^(todo|tbd|xxx|placeholder|none|n\/?a|\?+)$/i.test(ref) || /^<.*>$/.test(ref)) {
    throw new TrendConfigError(
      "EXPLODING_TOPICS_RIGHTS_REF",
      `is "${ref}", which is a placeholder, not a reference. A licence that cannot be traced to a document is not a licence.`
    );
  }
  return ref;
}

// ── The capability questions every caller asks ──────────────────────────────
//
// These are deliberately separate predicates rather than one numeric permission
// level. "May we run the file through an LLM" and "may we print the topic name
// on a card" are different contractual questions, and a single ladder would let
// one imply the other. They only happen to be nested TODAY; if Semrush grants
// internal AI processing without public display, only this block changes.

/** May we open, parse or otherwise read the real licensed export at all? */
export function mayReadSourceData(mode) {
  return mode === "internal_research" || mode === "commercial_approved";
}

/** May the exported rows be passed to an LLM / used as AI input? */
export function mayProcessWithAi(mode) {
  // Semrush's terms restrict using output as AI/ML input. Only an explicit
  // written commercial arrangement clears this, and `internal_research` does NOT
  // — reading a CSV yourself and feeding it to a model are separate permissions.
  return mode === "commercial_approved";
}

/** May a derived signal influence the ORDER of a public, user-facing list? */
export function mayInfluencePublicRanking(mode) {
  return mode === "commercial_approved";
}

/** May a topic name or metric be rendered to an end user? */
export function mayDisplayPublicly(mode) {
  return mode === "commercial_approved";
}

/** May we spend metered Google Places calls on concepts derived from the CSV? */
export function mayRunDiscovery(mode) {
  // Discovery is downstream of reading the data, so it inherits that gate. It is
  // listed separately because it is the only capability that spends MONEY, and a
  // future mode might read data without authorising spend.
  return mayReadSourceData(mode);
}

/**
 * One structured verdict, for a caller that wants to log or report the whole
 * posture rather than ask five questions.
 *
 * Never returns a partial object on bad config — it throws, so a report cannot
 * render a confident-looking capability table built on an unset variable.
 */
export function rightsPosture(env) {
  const mode = rightsMode(env);
  return {
    mode,
    readSourceData: mayReadSourceData(mode),
    processWithAi: mayProcessWithAi(mode),
    influencePublicRanking: mayInfluencePublicRanking(mode),
    displayPublicly: mayDisplayPublicly(mode),
    runDiscovery: mayRunDiscovery(mode),
  };
}

/**
 * Assert a named capability, or throw an error a human can act on.
 *
 * The message names the mode we are in, the capability that was refused, and
 * where the answer has to come from — because the remedy for "unconfirmed" is a
 * conversation with Semrush, not a code change, and an error that merely says
 * "forbidden" sends the next person looking in the wrong place.
 */
export function requireCapability(capability, env) {
  const posture = rightsPosture(env);
  if (posture[capability] === undefined) {
    throw new TrendConfigError("capability", `"${capability}" is not a known Exploding Topics capability`);
  }
  if (!posture[capability]) {
    throw new TrendConfigError(
      "EXPLODING_TOPICS_RIGHTS_MODE",
      `is "${posture.mode}", which does not permit "${capability}". ` +
        `This is a LICENSING limit, not a bug — no code change grants it. ` +
        `See docs/exploding-topics-rights.md; the mode may only be raised after Semrush confirms the ` +
        `specific use in writing and the confirmation is recorded there.`
    );
  }
  return posture;
}

/**
 * Snapshot freshness. Returns the decay factor the ordering term uses AND the
 * stale verdict the operator surface reads.
 *
 * `freshnessFactor` decays LINEARLY from 1 at import to 0 at the cadence
 * ceiling. It is not a cliff on purpose: a snapshot one hour past its ceiling
 * and one hour before it are the same quality of evidence, and a step function
 * there would make the boost jump discontinuously for no measured reason.
 *
 * A stale snapshot returns factor 0 AND stale:true. Callers must treat those as
 * one fact — zero boost and no label. "Stale" is an OPERATOR incident (the human
 * stopped exporting), never a quiet product state.
 */
export function snapshotFreshness(observedAtMs, nowMs, cadenceCfg) {
  const maxAgeMs = cadenceCfg.maxAgeDays * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(observedAtMs) || !Number.isFinite(nowMs)) {
    return { ageDays: null, freshnessFactor: 0, stale: true, reason: "snapshot has no usable observation date" };
  }
  const ageMs = nowMs - observedAtMs;
  const ageDays = ageMs / (24 * 60 * 60 * 1000);
  // A snapshot dated in the FUTURE is corrupt, not fresh. Trusting it would let
  // a bad export date pin freshness at 1.0 forever.
  if (ageMs < 0) {
    return { ageDays, freshnessFactor: 0, stale: true, reason: "snapshot observation date is in the future — the export is not trustworthy" };
  }
  if (ageMs >= maxAgeMs) {
    return {
      ageDays,
      freshnessFactor: 0,
      stale: true,
      reason: `snapshot is ${ageDays.toFixed(1)}d old, past the ${cadenceCfg.maxAgeDays}d ceiling for ${cadenceCfg.label} cadence — a new export is required`,
    };
  }
  return { ageDays, freshnessFactor: Math.max(0, Math.min(1, 1 - ageMs / maxAgeMs)), stale: false, reason: null };
}
