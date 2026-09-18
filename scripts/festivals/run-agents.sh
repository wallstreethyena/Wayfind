#!/usr/bin/env bash
# scripts/festivals/run-agents.sh [parallel=4] [max_batches=all]
#
# Runs one headless Claude Code (Sonnet) agent per unverified queue batch,
# `parallel` at a time. Each agent reads scripts/festivals/AGENT_BRIEF.md and
# writes only scripts/festivals/verified/batch-NNN.json. Safe to stop and
# restart: finished batches are skipped. Logs: scripts/festivals/logs/.
set -u
cd "$(dirname "$0")/../.."
PAR="${1:-4}"; MAX="${2:-100000}"
mkdir -p scripts/festivals/verified scripts/festivals/logs
unset NODE_ENV

todo=()
for q in scripts/festivals/queue/batch-*.json; do
  v="scripts/festivals/verified/$(basename "$q")"
  [ -f "$v" ] && node scripts/festivals/validate.mjs "$v" >/dev/null 2>&1 && continue
  todo+=("$(basename "$q" .json)")
  [ "${#todo[@]}" -ge "$MAX" ] && break
done
echo "run-agents: ${#todo[@]} batch(es) to verify, $PAR at a time"

run_one() {
  b="$1"
  prompt="Read scripts/festivals/AGENT_BRIEF.md and follow it exactly for scripts/festivals/queue/$b.json. Write scripts/festivals/verified/$b.json, then run node scripts/festivals/validate.mjs scripts/festivals/verified/$b.json and fix problems until it prints OK. Do nothing else."
  claude -p "$prompt" --model sonnet \
    --allowedTools "Read" "Write" "Edit" "WebFetch" "WebSearch" "Bash(curl:*)" "Bash(node scripts/festivals/validate.mjs:*)" "Bash(sleep:*)" "Bash(date:*)" \
    > "scripts/festivals/logs/$b.log" 2>&1
  if node scripts/festivals/validate.mjs "scripts/festivals/verified/$b.json" >> "scripts/festivals/logs/$b.log" 2>&1; then
    echo "done $b"
  else
    echo "FAILED $b (see scripts/festivals/logs/$b.log)"
  fi
}
export -f run_one
printf '%s\n' "${todo[@]}" | xargs -P "$PAR" -I{} bash -c 'run_one {}'
node scripts/festivals/validate.mjs | tail -1
