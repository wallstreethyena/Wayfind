// v5.42 (July 2026 audit follow-up): CSP violation collector. The
// report-only CSP shipped in v5.34 reported to nowhere, which made "a clean
// report-only period" unmeasurable. Browsers POST violations here; each one
// becomes a single structured log line in the Vercel function logs
// (search: "csp-violation"). Flip criterion, per next.config.js: seven days
// of production traffic with zero same-origin violations, then rename the
// header to Content-Security-Policy.
// Dependency-free by design: never throws, never stores, always 204.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 16 * 1024; // violation reports are ~1KB; cap hard

export async function POST(req) {
  try {
    const raw = (await req.text()).slice(0, MAX_BODY);
    const body = JSON.parse(raw);
    // Two wire shapes: legacy report-uri ({"csp-report": {...}}) and the
    // Reporting API (an array of {type:"csp-violation", body:{...}}).
    const reports = Array.isArray(body)
      ? body.map((r) => r && r.body).filter(Boolean)
      : [body["csp-report"] || body].filter(Boolean);
    for (const r of reports.slice(0, 10)) {
      console.log(
        "csp-violation",
        JSON.stringify({
          directive: r["violated-directive"] || r.effectiveDirective || r["effective-directive"] || "",
          blocked: String(r["blocked-uri"] || r.blockedURL || "").slice(0, 200),
          page: String(r["document-uri"] || r.documentURL || "").slice(0, 200),
          source: String(r["source-file"] || r.sourceFile || "").slice(0, 200),
          sample: String(r["script-sample"] || r.sample || "").slice(0, 100),
        })
      );
    }
  } catch (e) { /* malformed reports are dropped silently by design */ }
  return new Response(null, { status: 204 });
}
