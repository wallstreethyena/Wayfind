// Scheduled research must prove it evaluated the current complete registry.
export function validateDiscoveryReport(report, today) {
  if (!report || report.ok !== true || report.skipped === true) throw new Error("discovery report did not complete");
  if (report.today !== today) throw new Error("discovery report is for a different day");
  if (!Array.isArray(report.results) || report.results.length === 0) throw new Error("discovery report evaluated no candidates");
  if (report.coverage?.candidates_evaluated !== report.results.length) throw new Error("discovery report candidate count disagrees with its results");
  if (!Array.isArray(report.registry_members_not_evaluated_this_run) || report.registry_members_not_evaluated_this_run.length) {
    throw new Error("discovery report did not evaluate every registry member");
  }
  return report.results.length;
}
