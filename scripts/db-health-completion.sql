-- Database cell-completion health report (PostgreSQL)
--
-- Purpose:
--   Compare row/column population density table-by-table and rank the sparsest
--   places in the public schema. The script is read-only for business tables
--   and writes only temporary session tables.
--
-- Usage:
--   psql "postgresql://user:pass@host:5432/db" -v TOP_N=25 -f scripts/db-health-completion.sql
--
-- Optional:
--   Set TOP_N to control how many rows are returned in each ranked list.
\set TOP_N 25
\set ON_ERROR_STOP on

CREATE TEMP TABLE IF NOT EXISTS _db_health_table_cells (
  table_schema text NOT NULL,
  table_name text NOT NULL,
  row_count bigint NOT NULL,
  column_count int NOT NULL,
  non_empty_cells bigint NOT NULL,
  empty_cells bigint NOT NULL,
  completion_pct numeric(9,2),
  empty_pct numeric(9,2),
  sampled_at timestamptz NOT NULL DEFAULT now()
);

CREATE TEMP TABLE IF NOT EXISTS _db_health_column_cells (
  table_schema text NOT NULL,
  table_name text NOT NULL,
  column_name text NOT NULL,
  row_count bigint NOT NULL,
  non_empty_cells bigint NOT NULL,
  empty_cells bigint NOT NULL,
  completion_pct numeric(9,2),
  empty_pct numeric(9,2),
  sampled_at timestamptz NOT NULL DEFAULT now()
);

TRUNCATE TABLE _db_health_table_cells;
TRUNCATE TABLE _db_health_column_cells;

DO $$
DECLARE
  t record;
  c record;
  v_row_count bigint;
  v_col_count int;
  v_non_empty bigint;
  v_filled bigint;
  v_total_cells bigint;
  v_empty_cells bigint;
  v_completion_pct numeric(9,2);
  v_empty_pct numeric(9,2);
  v_col_completion_pct numeric(9,2);
  v_col_empty_pct numeric(9,2);
  v_cond text;
  v_sql text;
BEGIN
  FOR t IN
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  LOOP
    EXECUTE format('SELECT COUNT(*)::bigint FROM %I.%I', t.table_schema, t.table_name)
      INTO v_row_count;

    SELECT COUNT(*)::int
      INTO v_col_count
      FROM information_schema.columns
      WHERE table_schema = t.table_schema
        AND table_name = t.table_name;

    v_non_empty := 0;

    IF v_row_count > 0 THEN
      FOR c IN
        SELECT column_name, data_type, udt_name
        FROM information_schema.columns
        WHERE table_schema = t.table_schema
          AND table_name = t.table_name
        ORDER BY ordinal_position
      LOOP
        v_cond := CASE
          WHEN lower(c.data_type) IN (
            'character varying',
            'character',
            'text',
            'citext',
            'character varying[]',
            'text[]',
            'character[]',
            'uuid'
          ) THEN
            format('COALESCE(char_length(trim(BOTH FROM %I.%I.%I::text)),0) > 0',
              t.table_schema, t.table_name, c.column_name)
          WHEN lower(c.data_type) = 'bytea' THEN
            format('COALESCE(octet_length(%I.%I.%I), 0) > 0',
              t.table_schema, t.table_name, c.column_name)
          WHEN lower(c.data_type) IN ('json', 'jsonb') THEN
            format('COALESCE(char_length(%I.%I.%I::text), 0) > 2',
              t.table_schema, t.table_name, c.column_name)
          WHEN left(c.udt_name, 1) = '_' THEN
            format('COALESCE(cardinality(%I.%I.%I), 0) > 0',
              t.table_schema, t.table_name, c.column_name)
          ELSE
            format('%I.%I.%I IS NOT NULL',
              t.table_schema, t.table_name, c.column_name)
        END;

        v_sql := format(
          'SELECT COUNT(*)::bigint FROM %I.%I WHERE %s',
          t.table_schema,
          t.table_name,
          v_cond
        );

        EXECUTE v_sql INTO v_filled;

        v_non_empty := v_non_empty + v_filled;

        IF v_row_count = 0 THEN
          v_col_completion_pct := NULL;
          v_col_empty_pct := NULL;
        ELSE
          v_col_completion_pct := ROUND((v_filled::numeric / NULLIF(v_row_count, 0)) * 100, 2);
          v_col_empty_pct := ROUND((1 - (v_filled::numeric / NULLIF(v_row_count, 0))) * 100, 2);
        END IF;

        INSERT INTO _db_health_column_cells (
          table_schema,
          table_name,
          column_name,
          row_count,
          non_empty_cells,
          empty_cells,
          completion_pct,
          empty_pct
        ) VALUES (
          t.table_schema,
          t.table_name,
          c.column_name,
          v_row_count,
          v_filled,
          GREATEST(v_row_count - v_filled, 0),
          v_col_completion_pct,
          v_col_empty_pct
        );
      END LOOP;
    END IF;

    IF v_row_count > 0 AND v_col_count > 0 THEN
      v_total_cells := v_row_count * v_col_count;
      v_empty_cells := v_total_cells - v_non_empty;
      v_completion_pct := ROUND((v_non_empty::numeric / NULLIF(v_total_cells, 0)) * 100, 2);
      v_empty_pct := ROUND((v_empty_cells::numeric / NULLIF(v_total_cells, 0)) * 100, 2);
    ELSE
      v_total_cells := 0;
      v_empty_cells := 0;
      v_completion_pct := NULL;
      v_empty_pct := NULL;
    END IF;

    INSERT INTO _db_health_table_cells (
      table_schema,
      table_name,
      row_count,
      column_count,
      non_empty_cells,
      empty_cells,
      completion_pct,
      empty_pct
    ) VALUES (
      t.table_schema,
      t.table_name,
      v_row_count,
      v_col_count,
      v_non_empty,
      v_empty_cells,
      v_completion_pct,
      v_empty_pct
    );
  END LOOP;
END $$;

\echo '=== TABLE SUMMARY (all tables) ==='
SELECT
  table_schema || '.' || table_name AS table_name,
  row_count,
  column_count,
  completion_pct,
  empty_pct,
  non_empty_cells,
  empty_cells
FROM _db_health_table_cells
ORDER BY
  (row_count = 0) DESC,
  completion_pct ASC NULLS LAST,
  row_count DESC,
  table_schema,
  table_name
LIMIT :TOP_N;

\echo '=== TABLE SUMMARY (populated tables only) ==='
SELECT
  table_schema || '.' || table_name AS table_name,
  row_count,
  column_count,
  completion_pct,
  empty_pct,
  non_empty_cells,
  empty_cells
FROM _db_health_table_cells
WHERE row_count > 0
ORDER BY completion_pct ASC NULLS LAST, row_count DESC
LIMIT :TOP_N;

\echo '=== ZERO-ROW TABLES ==='
SELECT
  table_schema || '.' || table_name AS table_name,
  column_count
FROM _db_health_table_cells
WHERE row_count = 0
ORDER BY table_schema, table_name
LIMIT :TOP_N;

\echo '=== WORST COLUMNS (populated rows only) ==='
SELECT
  table_schema || '.' || table_name || '.' || column_name AS column_fq,
  row_count,
  non_empty_cells,
  empty_cells,
  completion_pct,
  empty_pct
FROM _db_health_column_cells
WHERE row_count > 0
ORDER BY empty_pct DESC NULLS LAST, row_count DESC, table_schema, table_name, column_name
LIMIT :TOP_N;

\echo '=== WHOLE-DB SNAPSHOT ==='
SELECT
  (SELECT COUNT(*) FILTER (WHERE table_schema='public' AND table_type='BASE TABLE')
   FROM information_schema.tables) AS total_public_tables,
  (SELECT COUNT(*)
   FROM _db_health_table_cells
   WHERE row_count > 0) AS populated_tables,
  (SELECT COUNT(*)
   FROM _db_health_table_cells
   WHERE row_count = 0) AS zero_row_tables;
