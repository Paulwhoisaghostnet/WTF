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
mapfile -t migration_files < <(find drizzle -maxdepth 1 -type f -name '0[0-9][0-9][0-9]_*.sql' | sort)

if [[ "${#migration_files[@]}" -eq 0 ]]; then
  echo "[deploy-migrations] no numbered drizzle migrations found"
  exit 0
fi

if [[ "$ledger_count" == "0" ]]; then
  echo "[deploy-migrations] fresh database detected with no production ledger; refusing implicit bootstrap."
  echo "[deploy-migrations] Initialize the base schema through a reviewed bootstrap path with checksum verification and create the ledger before using production deploy automation."
  exit 1
fi

for sql_file in "${migration_files[@]}"; do
  filename="$(basename "$sql_file")"
  sha256="$(sha256sum "$sql_file" | awk '{print $1}')"
  safe_filename="$(escape_sql_literal "$filename")"
  safe_sha256="$(escape_sql_literal "$sha256")"

  stored_sha256="$(
    psql_query -Atqc "SELECT sha256 FROM ${LEDGER_TABLE} WHERE filename = '${safe_filename}' LIMIT 1;" | tr -d '[:space:]'
  )"
  if [[ -n "$stored_sha256" ]]; then
    if [[ "$stored_sha256" != "$sha256" ]]; then
      echo "[deploy-migrations] checksum mismatch for applied migration ${filename}" >&2
      echo "[deploy-migrations] ledger=${stored_sha256} file=${sha256}; refusing to rewrite migration history" >&2
      exit 1
    fi
    echo "[deploy-migrations] skip ${filename}"
    continue
  fi

  echo "[deploy-migrations] apply ${filename}"
  psql_file "$sql_file"
  psql_query -c "
    INSERT INTO ${LEDGER_TABLE} (filename, sha256, note)
    VALUES ('${safe_filename}', '${safe_sha256}', 'applied-by-server-deploy')
  "
done
