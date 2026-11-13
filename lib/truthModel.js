// lib/truthModel.js — Wayfind Unified Truth Model, Volatility Policy,
// Automatic Source Escalation, UI Certainty Mapping, and "Why This?" Trace.
//
// Answers four questions for every volatile local decision fact:
// 1. What do we believe? (`value`, `status`)
// 2. Why? (`source`, `source_type`, `verification_method`, `confidence`)
// 3. How fresh is it? (`verified_at`, `expires_at`, `volatilityTier`, `certainty`)
// 4. Can we safely show or execute it? (`usable`, `uiCopy`, `failClosed`)

export const VOLATILITY_TIERS = Object.freeze({
  VERY_VOLATILE: "VERY_VOLATILE",
  MODERATELY_VOLATILE: "MODERATELY_VOLATILE",
  LOW_VOLATILITY: "LOW_VOLATILITY",
});

// Defensible freshness windows grounded in Wayfind's actual provider SLAs and
// legal/cache constraints (e.g., 30-day Google coordinate ceiling, 7-day offer
// verification TTL, 24h scarcity re-verification, real-time clock checks).
export const FACT_VOLATILITY_POLICY = Object.freeze({
  // VERY_VOLATILE — changes intraday or as inventory depletes
  open_now: {
    tier: VOLATILITY_TIERS.VERY_VOLATILE,
    freshMs: 15 * 60 * 1000, // 15 min clock evaluation
    usableMs: 60 * 60 * 1000, // 1 hour
    failClosedOnExpired: true,
  },
  sold_out: {
    tier: VOLATILITY_TIERS.VERY_VOLATILE,
    freshMs: 6 * 60 * 60 * 1000, // 6h
    usableMs: 24 * 60 * 60 * 1000, // 24h
    failClosedOnExpired: true,
  },
  almost_gone: {
    tier: VOLATILITY_TIERS.VERY_VOLATILE,
    freshMs: 12 * 60 * 60 * 1000, // 12h
    usableMs: 24 * 60 * 60 * 1000, // 24h max before recheck required
    failClosedOnExpired: true,
  },
  offer_availability: {
    tier: VOLATILITY_TIERS.VERY_VOLATILE,
    freshMs: 3 * 24 * 60 * 60 * 1000, // 3d fresh
    usableMs: 14 * 24 * 60 * 60 * 1000, // 14d hard audit fuse (e.g. CLIPP_AUDIT_EXPIRY)
    failClosedOnExpired: true,
  },
  discount_price: {
    tier: VOLATILITY_TIERS.VERY_VOLATILE,
    freshMs: 24 * 60 * 60 * 1000, // 24h
    usableMs: 7 * 24 * 60 * 60 * 1000, // 7d
    failClosedOnExpired: true,
  },
  same_day_event: {
    tier: VOLATILITY_TIERS.VERY_VOLATILE,
    freshMs: 2 * 60 * 60 * 1000, // 2h
    usableMs: 12 * 60 * 60 * 1000, // 12h
    failClosedOnExpired: true,
  },
  weather_suitability: {
    tier: VOLATILITY_TIERS.VERY_VOLATILE,
    freshMs: 30 * 60 * 1000, // 30m
    usableMs: 3 * 60 * 60 * 1000, // 3h
    failClosedOnExpired: false,
  },

  // MODERATELY_VOLATILE — weekly schedules, menus, prices, seasonal rules
  opening_hours: {
    tier: VOLATILITY_TIERS.MODERATELY_VOLATILE,
    freshMs: 14 * 24 * 60 * 60 * 1000, // 14d -> "Open until X"
    usableMs: 45 * 24 * 60 * 60 * 1000, // 45d -> "Usually open until X · check before heading out"
    failClosedOnExpired: false,
  },
  admission_price: {
    tier: VOLATILITY_TIERS.MODERATELY_VOLATILE,
    freshMs: 30 * 24 * 60 * 60 * 1000,
    usableMs: 90 * 24 * 60 * 60 * 1000,
    failClosedOnExpired: false,
  },
  official_tickets: {
    tier: VOLATILITY_TIERS.MODERATELY_VOLATILE,
    freshMs: 14 * 24 * 60 * 60 * 1000,
    usableMs: 60 * 24 * 60 * 60 * 1000,
    failClosedOnExpired: true,
  },
  menu: {
    tier: VOLATILITY_TIERS.MODERATELY_VOLATILE,
    freshMs: 30 * 24 * 60 * 60 * 1000,
    usableMs: 90 * 24 * 60 * 60 * 1000,
    failClosedOnExpired: false,
  },
  reservation_url: {
    tier: VOLATILITY_TIERS.MODERATELY_VOLATILE,
    freshMs: 30 * 24 * 60 * 60 * 1000,
    usableMs: 90 * 24 * 60 * 60 * 1000,
    failClosedOnExpired: true,
  },
  parking_information: {
    tier: VOLATILITY_TIERS.MODERATELY_VOLATILE,
    freshMs: 60 * 24 * 60 * 60 * 1000,
    usableMs: 180 * 24 * 60 * 60 * 1000,
    failClosedOnExpired: false,
  },
  seasonal_availability: {
    tier: VOLATILITY_TIERS.MODERATELY_VOLATILE,
    freshMs: 14 * 24 * 60 * 60 * 1000,
    usableMs: 45 * 24 * 60 * 60 * 1000,
    failClosedOnExpired: true,
  },
  event_date: {
    tier: VOLATILITY_TIERS.MODERATELY_VOLATILE,
    freshMs: 7 * 24 * 60 * 60 * 1000,
    usableMs: 30 * 24 * 60 * 60 * 1000,
    failClosedOnExpired: true,
  },
  event_status: {
    tier: VOLATILITY_TIERS.VERY_VOLATILE,
    freshMs: 6 * 60 * 60 * 1000,
    usableMs: 48 * 60 * 60 * 1000,
    failClosedOnExpired: true,
  },

  // LOW_VOLATILITY — identity, street address, website, coordinates
  official_website: {
    tier: VOLATILITY_TIERS.LOW_VOLATILITY,
    freshMs: 90 * 24 * 60 * 60 * 1000,
    usableMs: 365 * 24 * 60 * 60 * 1000,
    failClosedOnExpired: false,
  },
  street_address: {
    tier: VOLATILITY_TIERS.LOW_VOLATILITY,
    freshMs: 180 * 24 * 60 * 60 * 1000,
    usableMs: 365 * 24 * 60 * 60 * 1000,
    failClosedOnExpired: false,
  },
  venue_identity: {
    tier: VOLATILITY_TIERS.LOW_VOLATILITY,
    freshMs: 180 * 24 * 60 * 60 * 1000,
    usableMs: 365 * 24 * 60 * 60 * 1000,
    failClosedOnExpired: false,
  },
  coordinates: {
    tier: VOLATILITY_TIERS.LOW_VOLATILITY,
    freshMs: 25 * 24 * 60 * 60 * 1000,
    usableMs: 30 * 24 * 60 * 60 * 1000, // Google 30d ceiling unless independent_coords
    failClosedOnExpired: true,
  },
  category: {
    tier: VOLATILITY_TIERS.LOW_VOLATILITY,
    freshMs: 180 * 24 * 60 * 60 * 1000,
    usableMs: 365 * 24 * 60 * 60 * 1000,
    failClosedOnExpired: false,
  },
});

export const SOURCE_AUTHORITY_RANK = Object.freeze({
  manual_override: 1.0,
  verified_wayfind_record: 0.95,
  official_venue_data: 0.92,
  authorized_provider_api: 0.88,
  trusted_structured_source: 0.8,
  public_first_party_page: 0.75,
  cached_provider_record: 0.65,
  unverified_inference: 0.3,
});

function toEpochMs(val) {
  if (val == null || val === "") return null;
  if (typeof val === "number" && Number.isFinite(val)) return val;
  if (val instanceof Date) return Number.isFinite(val.getTime()) ? val.getTime() : null;
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const parsed = Date.parse(`${trimmed}T23:59:59Z`);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (/^\d{4}-\d{2}$/.test(trimmed)) {
      const parsed = Date.parse(`${trimmed}-15T12:00:00Z`);
      return Number.isFinite(parsed) ? parsed : null;
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Create a normalized truth-fact envelope with provenance and freshness metadata.
 */
export function createTruthFact({
  factType,
  value,
  source = "wayfind",
  source_type = "verified_wayfind_record",
  verified_at = null,
  expires_at = null,
  confidence = null,
  verification_method = "deterministic",
  last_changed_at = null,
  failure_count = 0,
  status = "ACTIVE",
  manual_override = false,
  specificity = 1.0,
} = {}) {
  const policy = FACT_VOLATILITY_POLICY[factType] || FACT_VOLATILITY_POLICY.opening_hours;
  const verifiedMs = toEpochMs(verified_at);
  let expiresMs = toEpochMs(expires_at);
  if (expiresMs == null && verifiedMs != null && policy?.usableMs) {
    expiresMs = verifiedMs + policy.usableMs;
  }
  const baseAuthority = manual_override
    ? SOURCE_AUTHORITY_RANK.manual_override
    : SOURCE_AUTHORITY_RANK[source_type] ?? 0.7;
  const resolvedConfidence =
    typeof confidence === "number" && Number.isFinite(confidence)
      ? Math.max(0, Math.min(1, confidence))
      : baseAuthority;

  return {
    factType: factType || "unknown",
    value: value ?? null,
    source,
    source_type,
    verified_at: verifiedMs != null ? new Date(verifiedMs).toISOString() : null,
    expires_at: expiresMs != null ? new Date(expiresMs).toISOString() : null,
    confidence: resolvedConfidence,
    verification_method,
    last_changed_at: toEpochMs(last_changed_at) != null ? new Date(toEpochMs(last_changed_at)).toISOString() : null,
    failure_count: Number.isFinite(Number(failure_count)) ? Math.max(0, Number(failure_count)) : 0,
    status: status || "ACTIVE",
    manual_override: Boolean(manual_override),
    specificity: typeof specificity === "number" ? specificity : 1.0,
  };
}

/**
 * Evaluate a fact's freshness and operational safety at `now`.
 */
export function evaluateFactFreshness(fact, now = Date.now()) {
  if (!fact || fact.value == null || fact.value === "") {
    return {
      usable: false,
      certainty: "missing",
      volatilityTier: VOLATILITY_TIERS.MODERATELY_VOLATILE,
      ageMs: null,
      reason: "fact_missing",
    };
  }

  const nowMs = toEpochMs(now) ?? Date.now();
  const policy = FACT_VOLATILITY_POLICY[fact.factType] || FACT_VOLATILITY_POLICY.opening_hours;
  const st = String(fact.status || "ACTIVE").toUpperCase();

  // Terminal / quarantined statuses always fail closed
  if (
    st === "SOLD_OUT" ||
    st === "EXPIRED" ||
    st === "QUARANTINED" ||
    st === "REDIRECTED" ||
    st === "WRONG_PRODUCT" ||
    st === "WRONG_LOCATION" ||
    st === "TERMS_CHANGED" ||
    st === "CANCELLED" ||
    st === "POSTPONED"
  ) {
    return {
      usable: false,
      certainty: "quarantined",
      volatilityTier: policy.tier,
      ageMs: null,
      reason: `status_${st.toLowerCase()}`,
    };
  }

  if (fact.manual_override) {
    return {
      usable: true,
      certainty: "verified",
      volatilityTier: policy.tier,
      ageMs: 0,
      reason: "manual_override",
    };
  }

  const expiresMs = toEpochMs(fact.expires_at);
  if (expiresMs != null && nowMs > expiresMs) {
    return {
      usable: !policy.failClosedOnExpired,
      certainty: policy.failClosedOnExpired ? "expired" : "likely",
      volatilityTier: policy.tier,
      ageMs: toEpochMs(fact.verified_at) != null ? Math.max(0, nowMs - toEpochMs(fact.verified_at)) : null,
      reason: "past_expires_at",
    };
  }

  const verifiedMs = toEpochMs(fact.verified_at);
  if (verifiedMs == null) {
    return {
      usable: fact.confidence >= 0.7,
      certainty: fact.confidence >= 0.85 ? "likely" : "uncertain",
      volatilityTier: policy.tier,
      ageMs: null,
      reason: "unverified_timestamp",
    };
  }

  const ageMs = Math.max(0, nowMs - verifiedMs);
  if (ageMs <= policy.freshMs) {
    return {
      usable: true,
      certainty: "verified",
      volatilityTier: policy.tier,
      ageMs,
      reason: "within_fresh_window",
    };
  }
  if (ageMs <= policy.usableMs) {
    return {
      usable: true,
      certainty: "likely",
      volatilityTier: policy.tier,
      ageMs,
      reason: "within_usable_window",
    };
  }

  return {
    usable: !policy.failClosedOnExpired,
    certainty: policy.failClosedOnExpired ? "expired" : "likely",
    volatilityTier: policy.tier,
    ageMs,
    reason: "beyond_usable_window",
  };
}

/**
 * Phase 9: Automatic Source Escalation & Conflict Resolution.
 * Given candidate facts from multiple sources (e.g. verified_wayfind_record,
 * official_venue_data, authorized_provider_api, cached_provider_record),
 * picks the winning fact using authority, freshness, specificity, and confidence.
 */
export function resolveFactFromSources(candidates, factType, now = Date.now()) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return {
      winner: null,
      certainty: "missing",
      usable: false,
      conflictDetected: false,
      rejected: [],
      escalationPath: [],
    };
  }

  const nowMs = toEpochMs(now) ?? Date.now();
  const normalized = [];
  const rejected = [];

  for (const raw of candidates) {
    if (!raw) continue;
    const fact = raw.factType ? raw : createTruthFact({ ...raw, factType });
    const evalResult = evaluateFactFreshness(fact, nowMs);
    if (!evalResult.usable) {
      rejected.push({
        source: fact.source,
        source_type: fact.source_type,
        status: fact.status,
        reason: evalResult.reason,
      });
      continue;
    }
    const authority = fact.manual_override
      ? 1.0
      : SOURCE_AUTHORITY_RANK[fact.source_type] ?? 0.65;
    const freshnessScore =
      evalResult.certainty === "verified" ? 1.0 : evalResult.certainty === "likely" ? 0.78 : 0.5;
    const specificity = typeof fact.specificity === "number" ? fact.specificity : 1.0;
    const compositeScore =
      authority * 0.45 +
      freshnessScore * 0.25 +
      specificity * 0.15 +
      (fact.confidence ?? 0.75) * 0.15;

    normalized.push({
      fact,
      evalResult,
      compositeScore: Math.round(compositeScore * 1000) / 1000,
    });
  }

  if (normalized.length === 0) {
    return {
      winner: null,
      certainty: "missing",
      usable: false,
      conflictDetected: false,
      rejected,
      escalationPath: candidates.map((c) => c?.source || "unknown"),
    };
  }

  normalized.sort((a, b) => b.compositeScore - a.compositeScore);
  const distinctValues = new Set(
    normalized.map((n) =>
      typeof n.fact.value === "object" ? JSON.stringify(n.fact.value) : String(n.fact.value)
    )
  );
  const conflictDetected = distinctValues.size > 1;
  const top = normalized[0];
  const runnerUp = normalized[1] || null;

  // If top two conflicting sources are nearly tied (< 0.04 apart), downgrade certainty to "likely"
  const closeConflict =
    conflictDetected && runnerUp && Math.abs(top.compositeScore - runnerUp.compositeScore) < 0.04;

  return {
    winner: top.fact,
    certainty: closeConflict ? "likely" : top.evalResult.certainty,
    usable: true,
    compositeScore: top.compositeScore,
    conflictDetected,
    closeConflict: Boolean(closeConflict),
    rejected: [
      ...rejected,
      ...normalized.slice(1).map((n) => ({
        source: n.fact.source,
        source_type: n.fact.source_type,
        compositeScore: n.compositeScore,
        reason: "superseded_by_higher_authority_or_freshness",
      })),
    ],
    escalationPath: normalized.map((n) => `${n.fact.source}(${n.compositeScore})`),
  };
}

/**
 * Phase 10: Connect Freshness Directly to Systematic UI Copy.
 */
export function formatHoursCertaintyCopy({
  openState,
  closesAt,
  opensAt,
  todayHours,
  proseHours,
  certainty = "verified",
  is24h = false,
} = {}) {
  if (openState === true) {
    if (is24h) {
      return certainty === "verified"
        ? "Open 24 hours"
        : "Usually open 24 hours · check before heading out";
    }
    if (closesAt) {
      return certainty === "verified"
        ? `Open until ${closesAt}`
        : `Usually open until ${closesAt} · check before heading out`;
    }
    return certainty === "verified"
      ? "Open now"
      : "Usually open now · check before heading out";
  }

  if (openState === false) {
    if (opensAt) {
      return certainty === "verified"
        ? `Closed · Opens at ${opensAt}`
        : `Usually closed now · opens around ${opensAt}`;
    }
    if (todayHours && !/^closed$/i.test(todayHours)) {
      return `Closed now · Today: ${todayHours}`;
    }
    return "Closed now";
  }

  // openState is null — we do NOT fabricate Open Now
  if (todayHours && !/^closed$/i.test(todayHours)) {
    return `Usually ${todayHours} · check before heading out`;
  }
  if (proseHours) {
    return "See schedule · check before heading out";
  }
  return "Hours not confirmed";
}

/**
 * Phase 11: Compact "Why This?" Operational Decision Trace.
 * Explains why a card appeared, why Wayfind said open/closed, why a CTA won,
 * why a deal was shown/hidden, why a city resolved, and why an event qualified.
 * Never includes private user PII.
 */
export function buildDecisionTrace({
  entityId = null,
  entityName = null,
  surface = "detail",
  cardReason = null,
  hoursTrace = null,
  ctaTrace = null,
  offerTrace = null,
  locationTrace = null,
  eventTrace = null,
  now = new Date(),
} = {}) {
  return {
    traceVersion: "wf-trace-v1",
    evaluatedAt: now instanceof Date ? now.toISOString() : new Date(now).toISOString(),
    entity: { id: entityId, name: entityName, surface },
    whyCardAppeared: cardReason || "matched_surface_ranking_and_filters",
    whyOpenVerdict: hoursTrace
      ? {
          openState: hoursTrace.openState ?? null,
          certainty: hoursTrace.certainty || (hoursTrace.openState != null ? "verified" : "uncertain"),
          source: hoursTrace.source || "unknown",
          hasStructuredPeriods: Boolean(hoursTrace.hasPeriods),
          hasProseSchedule: Boolean(hoursTrace.hasProse),
          timeZone: hoursTrace.timeZone || "America/New_York",
          summary: hoursTrace.summary || null,
        }
      : null,
    whyCtaChosen: ctaTrace
      ? {
          winningKind: ctaTrace.kind || "directions",
          winningLabel: ctaTrace.label || "Directions",
          provider: ctaTrace.provider || null,
          offerId: ctaTrace.offerId || null,
          rungsEvaluated: ctaTrace.rungsEvaluated || [],
        }
      : null,
    whyDealStatus: offerTrace
      ? {
          offerId: offerTrace.offerId || null,
          provider: offerTrace.provider || null,
          status: offerTrace.status || "UNKNOWN",
          serveable: Boolean(offerTrace.serveable),
          reason: offerTrace.reason || null,
        }
      : null,
    whyLocationResolved: locationTrace
      ? {
          stateKind: locationTrace.stateKind || "DEFAULT_BOOTSTRAP_CENTER",
          labelShown: locationTrace.labelShown || "Location",
          isActualUserLocation: locationTrace.stateKind === "ACTUAL_USER_LOCATION",
          persistedToStorage: Boolean(locationTrace.persisted),
        }
      : null,
    whyEventQualified: eventTrace
      ? {
          qualified: Boolean(eventTrace.qualified),
          window: eventTrace.window || null,
          effectiveDate: eventTrace.effectiveDate || null,
          dayRuleChecked: Boolean(eventTrace.dayRuleChecked),
          intradayClockChecked: Boolean(eventTrace.intradayClockChecked),
          reason: eventTrace.reason || null,
        }
      : null,
  };
}
