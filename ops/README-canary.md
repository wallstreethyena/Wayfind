# Parked: ops/canary.workflow.yml

This belongs at `.github/workflows/canary.yml`. It is parked here because GitHub
refuses any push that creates or edits a workflow file unless the pushing token
carries the `workflow` OAuth scope, and neither credential on this machine has it
(both are `gist, read:org, repo`).

To install it:

    gh auth refresh -s workflow          # approve in the browser
    git mv ops/canary.workflow.yml .github/workflows/canary.yml
    git commit -m "ops: install the canary workflow"
    git push

Nothing it runs is blocked. All three checks are on this branch and run standalone:

    E2E_BASE_URL=https://www.gowayfind.com npx playwright test tests/e2e/shell-route-contract.spec.js
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/check-inventory-integrity.mjs
    SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/check-promote-metros-live-drift.mjs

The last one is currently RED against production — see its own header comment
and its entry in check-guard-manifest.mjs's EXCLUDED list for why, and what
closes it.
