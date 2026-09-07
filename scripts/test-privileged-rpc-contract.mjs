// CALL: positive and negative permission controls; live checks run in canary.
// Red proof: granting either unprivileged role must fail the production predicate.
import assert from 'node:assert/strict';
import { privilegedRpcFailures } from './lib/privilegedRpcContract.mjs';
const safe = { signature: 'wf_verify_affiliate_links(integer,integer)', function_name: 'wf_verify_affiliate_links', security_definer: true, anon_execute: false, authenticated_execute: false, service_execute: true };
assert.deepEqual(privilegedRpcFailures([safe]), []);
for (const role of ['anon_execute', 'authenticated_execute']) assert.ok(privilegedRpcFailures([{...safe, [role]: true}]).length);
assert.ok(privilegedRpcFailures([{...safe, service_execute: false}]).length);
assert.ok(privilegedRpcFailures([]).length);
assert.ok(privilegedRpcFailures(null).length);
assert.ok(privilegedRpcFailures([safe, safe]).length);
assert.ok(privilegedRpcFailures([{...safe, anon_execute: null}]).length);
assert.ok(privilegedRpcFailures([safe, {...safe, function_name:'wf_new_privileged_writer', anon_execute:true}]).length);
assert.deepEqual(privilegedRpcFailures([safe, {...safe, function_name:'wf_join_waitlist', anon_execute:true, authenticated_execute:true}]), []);
assert.ok(privilegedRpcFailures([{...safe, security_definer:false, anon_execute:true}]).length);
console.log('test-privileged-rpc-contract: OK — public/authenticated exposure, missing service access, missing/duplicate/malformed evidence all fail');
