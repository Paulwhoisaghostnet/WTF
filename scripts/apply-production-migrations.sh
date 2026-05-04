#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LEDGER_TABLE="production_schema_migrations"

psql_query() {
  docker compose exec -T postgres psql -U wtf -d wtf -v ON_ERROR_STOP=1 "$@"
}

psql_file() {
  docker compose exec -T postgres psql -U wtf -d wtf -v ON_ERROR_STOP=1 < "$1"
}

escape_sql_literal() {
  printf "%s" "$1" | sed "s/'/''/g"
}

psql_query -c "
CREATE TABLE IF NOT EXISTS ${LEDGER_TABLE} (
  filename text PRIMARY KEY,
  sha256 text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  note text
);
"

ledger_count="$(
  psql_query -Atqc "SELECT count(*)::int FROM ${LEDGER_TABLE};" | tr -d '[:space:]'
)"
schema_present="$(
  psql_query -Atqc "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users');" | tr -d '[:space:]'
)"

mapfile -t migration_files < <(find drizzle -maxdepth 1 -type f -name '0[0-9][0-9][0-9]_*.sql' | sort)

if [[ "${#migration_files[@]}" -eq 0 ]]; then
  echo "[deploy-migrations] no numbered drizzle migrations found"
  exit 0
fi

if [[ "$ledger_count" == "0" && "$schema_present" == "t" ]]; then
  echo "[deploy-migrations] existing production schema detected with empty ledger; bootstrapping migration records"
  for sql_file in "${migration_files[@]}"; do
    filename="$(basename "$sql_file")"
    sha256="$(sha256sum "$sql_file" | awk '{print $1}')"
    safe_filename="$(escape_sql_literal "$filename")"
    safe_sha256="$(escape_sql_literal "$sha256")"
    psql_query -c "
      INSERT INTO ${LEDGER_TABLE} (filename, sha256, note)
      VALUES ('${safe_filename}', '${safe_sha256}', 'bootstrap-existing-db')
      ON CONFLICT (filename) DO NOTHING;
    "
  done
  echo "[deploy-migrations] bootstrap complete"
  exit 0
fi

if [[ "$ledger_count" == "0" && "$schema_present" != "t" ]]; then
  echo "[deploy-migrations] fresh database detected with no production ledger; refusing implicit bootstrap."
  echo "[deploy-migrations] Initialize the base schema through a reviewed bootstrap path before using production deploy automation."
  exit 1
fi

for sql_file in "${migration_files[@]}"; do
  filename="$(basename "$sql_file")"
  sha256="$(sha256sum "$sql_file" | awk '{print $1}')"
  safe_filename="$(escape_sql_literal "$filename")"
  safe_sha256="$(escape_sql_literal "$sha256")"

  already_applied="$(
    psql_query -Atqc "SELECT 1 FROM ${LEDGER_TABLE} WHERE filename = '${safe_filename}' LIMIT 1;" | tr -d '[:space:]'
  )"
  if [[ "$already_applied" == "1" ]]; then
    echo "[deploy-migrations] skip ${filename}"
    continue
  fi

  echo "[deploy-migrations] apply ${filename}"
  psql_file "$sql_file"
  psql_query -c "
    INSERT INTO ${LEDGER_TABLE} (filename, sha256, note)
    VALUES ('${safe_filename}', '${safe_sha256}', 'applied-by-server-deploy')
    ON CONFLICT (filename) DO UPDATE
      SET sha256 = EXCLUDED.sha256,
          applied_at = now(),
          note = EXCLUDED.note;
  "
done
