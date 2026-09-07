// Production permissions, not migration prose, determine exposure.
export function privilegedRpcFailures(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return ['RPC permission audit returned no rows'];
  const intentionalPublic = new Set(['wf_join_waitlist', 'wf_log_coverage_gap', 'wf_register_push_token']);
  const failures = [];
  const verifier = rows.filter(r => r.function_name === 'wf_verify_affiliate_links');
  if (verifier.length !== 1) failures.push('Affiliate verifier must have exactly one signature');
  for (const r of rows) {
    if (![r.security_definer, r.anon_execute, r.authenticated_execute, r.service_execute].every(v => typeof v === 'boolean')) {
      failures.push(`Malformed permission evidence for ${r.signature}`);
      continue;
    }
    const privileged = r.security_definer && !intentionalPublic.has(r.function_name);
    if ((privileged || r.function_name === 'wf_verify_affiliate_links') && (r.anon_execute || r.authenticated_execute)) {
      failures.push(`${r.signature} is executable by an unprivileged role`);
    }
    if (r.function_name === 'wf_verify_affiliate_links' && !r.service_execute) failures.push('Service role cannot run affiliate verifier');
  }
  return failures;
}
