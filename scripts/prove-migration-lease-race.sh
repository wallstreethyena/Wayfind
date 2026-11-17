#!/usr/bin/env bash
# prove-migration-lease-race.sh — proves against a REAL, throwaway Postgres that
# the migration lease (supabase/migrations/20261114170000_wf_migration_lease.sql +
# buildLeaseAcquireSql in scripts/lib/migrationApply.mjs) admits exactly one of N
# concurrent appliers, expires, and only releases for its holder.
# Isolated fixture: a temporary cluster in a temp dir on a private port; it never
# touches any other database. Needs PostgreSQL 14+ binaries (initdb, pg_ctl, psql).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
[ -x "$BIN/initdb" ] || { echo "prove-migration-lease-race: no PostgreSQL binaries found"; exit 2; }
DIR="$(mktemp -d)"; PORT=55432; N="${N:-24}"
RUN=(); if [ "$(id -u)" = 0 ]; then chown postgres "$DIR"; RUN=(runuser -u postgres --); fi
cleanup() { "${RUN[@]}" "$BIN/pg_ctl" -D "$DIR/db" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
"${RUN[@]}" "$BIN/initdb" -D "$DIR/db" -A trust -U postgres >/dev/null
"${RUN[@]}" "$BIN/pg_ctl" -D "$DIR/db" -o "-p $PORT -k $DIR -c listen_addresses=''" -l "$DIR/log" start >/dev/null
PSQL=("${RUN[@]}" "$BIN/psql" -h "$DIR" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -qtAX)
"${PSQL[@]}" -c "create role anon; create role authenticated;"
"${PSQL[@]}" -f "$REPO/supabase/migrations/20261114170000_wf_migration_lease.sql"
"${PSQL[@]}" -f "$REPO/supabase/migrations/20261114170000_wf_migration_lease.sql"   # idempotent re-apply
sqlfor() { node --input-type=module -e "import { buildLeaseAcquireSql } from '$REPO/scripts/lib/migrationApply.mjs'; process.stdout.write(buildLeaseAcquireSql({ holder: process.argv[1], migration: 'race_test' }))" "$1"; }
for i in $(seq 1 "$N"); do sqlfor "racer-$i" > "$DIR/acq-$i.sql"; done
chmod a+r "$DIR"/acq-*.sql
for i in $(seq 1 "$N"); do ("${PSQL[@]}" -f "$DIR/acq-$i.sql" > "$DIR/out-$i" 2>&1) & done; wait
WINNERS=$(cat "$DIR"/out-* | grep -c '^racer-' || true)
HOLDER=$("${PSQL[@]}" -c "select holder from public.wf_migration_lease")
echo "concurrent acquirers=$N winners=$WINNERS table_holder=$HOLDER"
[ "$WINNERS" = 1 ] && grep -qx "$HOLDER" "$DIR"/out-* || { echo "FAIL: expected exactly one winner"; exit 1; }
NOT_ME="$("${PSQL[@]}" -c "$(node --input-type=module -e "import { buildLeaseReleaseSql } from '$REPO/scripts/lib/migrationApply.mjs'; process.stdout.write(buildLeaseReleaseSql({ holder: 'someone-else' }))")")"
STILL=$("${PSQL[@]}" -c "select holder from public.wf_migration_lease")
[ -z "$NOT_ME" ] && [ "$STILL" = "$HOLDER" ] || { echo "FAIL: a non-holder released the lease"; exit 1; }
echo "non-holder release: refused (lease still held by $STILL)"
"${PSQL[@]}" -c "update public.wf_migration_lease set expires_at = now() - interval '1 second'"
LATE="$("${PSQL[@]}" -f "$DIR/acq-1.sql")"; [ "$HOLDER" = racer-1 ] && LATE="$("${PSQL[@]}" -f "$DIR/acq-2.sql")"
[ -n "$LATE" ] || { echo "FAIL: an expired lease was not reclaimable"; exit 1; }
echo "expired lease reclaimed by: $LATE"
REL="$("${PSQL[@]}" -c "$(node --input-type=module -e "import { buildLeaseReleaseSql } from '$REPO/scripts/lib/migrationApply.mjs'; process.stdout.write(buildLeaseReleaseSql({ holder: process.argv[1] }))" "$LATE")")"
FREE=$("${PSQL[@]}" -c "select coalesce(holder,'<free>') from public.wf_migration_lease")
[ "$REL" = 1 ] && [ "$FREE" = "<free>" ] || { echo "FAIL: holder could not release"; exit 1; }
echo "holder release: lease free"
GRANTS=$("${PSQL[@]}" -c "select count(*) from information_schema.role_table_grants where table_name='wf_migration_lease' and grantee in ('anon','authenticated')")
RLS=$("${PSQL[@]}" -c "select relrowsecurity from pg_class where relname='wf_migration_lease'")
[ "$GRANTS" = 0 ] && [ "$RLS" = t ] || { echo "FAIL: lease table not service-only"; exit 1; }
echo "prove-migration-lease-race: OK — 1 of $N concurrent appliers won; non-holder release refused; expiry reclaimable; holder release frees; RLS on, 0 anon/authenticated grants"
