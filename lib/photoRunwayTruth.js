// lib/photoRunwayTruth.js — pure operator-facing truth for photo allowance/runway.
//
// A historical ledger cap is not proof that paid photo fetching is currently
// armed. When WAYFIND_PHOTOS_PAID is off, any remaining headroom is a reserve,
// not an automatic countdown. Keep that distinction in one helper so the
// health API and generated OS state cannot disagree.

function positiveInteger(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!/^[1-9]\d*$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

export function photosPaidConfigured({ gate, paid, cap } = {}) {
  const mode = String(gate == null ? "" : gate).trim().toLowerCase();
  if (mode === "shut") return false;
  if (String(paid == null ? "" : paid).trim() !== "1") return false;
  return positiveInteger(cap) != null;
}

export function describePhotoRunway({ runway, allowance, paidEnabled } = {}) {
  const used = Number(allowance && allowance.used);
  const cap = Number(allowance && allowance.cap);
  const allowanceReadable = Number.isFinite(used) && used >= 0 && Number.isFinite(cap) && cap >= 0;
  const allowanceUsed = allowanceReadable ? used : null;
  const allowanceCap = allowanceReadable ? cap : null;
  const reserve = allowanceReadable ? Math.max(0, cap - used) : null;
  const enabled = paidEnabled === true;

  if (!allowanceReadable) {
    return {
      paidEnabled: enabled,
      allowanceUsed: null,
      allowanceCap: null,
      reserve: null,
      runwayDays: enabled && Number.isFinite(runway && runway.runwayDays) ? runway.runwayDays : null,
      burn24h: Number.isFinite(runway && runway.burn24h) ? runway.burn24h : null,
      text: enabled
        ? "enabled — allowance unreadable; runway not measured"
        : "disabled — allowance unreadable; no automatic paid spend",
    };
  }

  const burn24h = Number.isFinite(runway && runway.burn24h) ? runway.burn24h : null;
  const runwayDays = enabled && Number.isFinite(runway && runway.runwayDays) ? runway.runwayDays : null;

  if (!enabled) {
    return {
      paidEnabled: false,
      allowanceUsed,
      allowanceCap,
      reserve,
      runwayDays: null,
      burn24h,
      text: `disabled — reserve ${reserve} of ${cap}, not auto-spent`,
    };
  }

  if (runwayDays != null && burn24h != null) {
    return {
      paidEnabled: true,
      allowanceUsed,
      allowanceCap,
      reserve,
      runwayDays,
      burn24h,
      text: `~${Math.round(runwayDays)}d left at ~${Math.round(burn24h)} grants/24h`,
    };
  }

  return {
    paidEnabled: true,
    allowanceUsed,
    allowanceCap,
    reserve,
    runwayDays: null,
    burn24h,
    text: `enabled — reserve ${reserve} of ${cap}; runway not measured`,
  };
}
