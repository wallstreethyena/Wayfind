/**
 * Turn Promise.allSettled output into auditable read evidence.
 *
 * A rejected or malformed category is never represented as an empty array
 * with `truncated: false`: that would make an unknown source look like a
 * complete town with zero candidates.
 */
export function collectReadEvidence(categories, settled) {
  const requested = Array.isArray(categories) ? categories.map((value) => String(value)) : [];
  const results = Array.isArray(settled) ? settled : [];
  const rawByCat = {};
  const rowsRead = {};
  const perCategory = {};
  const failures = [];
  let sourceFailures = 0;
  let unknownFailures = 0;

  requested.forEach((category, index) => {
    const result = results[index];
    if (result?.status === "fulfilled"
        && result.value
        && Array.isArray(result.value.rows)
        && typeof result.value.truncated === "boolean") {
      rawByCat[category] = result.value.rows;
      rowsRead[category] = result.value.rows.length;
      perCategory[category] = {
        status: "fulfilled",
        rows: result.value.rows.length,
        truncated: result.value.truncated,
        error: null,
      };
      return;
    }

    rawByCat[category] = [];
    rowsRead[category] = null;
    sourceFailures++;
    unknownFailures++;
    const rejected = result?.status === "rejected";
    const error = rejected
      ? String(result.reason?.message || result.reason || "read rejected without a reason")
      : result == null
        ? "read result is missing"
        : `read returned invalid allSettled evidence (${String(result.status || "unknown status")})`;
    perCategory[category] = {
      status: rejected ? "rejected" : "unknown",
      rows: null,
      truncated: null,
      error,
    };
    failures.push({ category, error });
  });

  if (results.length > requested.length) {
    const extra = results.length - requested.length;
    unknownFailures += extra;
    failures.push({ category: null, error: `${extra} unexpected read result(s)` });
  }

  const fulfilled = Object.values(perCategory).filter((item) => item.status === "fulfilled");
  const anyTruncated = fulfilled.some((item) => item.truncated === true);
  const actualTruncated = anyTruncated ? true : unknownFailures ? null : false;
  const complete = requested.length > 0
    && Object.keys(perCategory).length === requested.length
    && sourceFailures === 0
    && unknownFailures === 0
    && actualTruncated === false;

  return {
    rawByCat,
    rowsRead,
    evidence: {
      perCategory,
      sourceFailures,
      unknownFailures,
      failures,
      actualTruncated,
      complete,
    },
  };
}
