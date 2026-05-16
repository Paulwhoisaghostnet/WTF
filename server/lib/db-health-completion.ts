import { pool } from "../db";
import type { JobResult } from "./scheduler";

export const DB_HEALTH_COMPLETION_JOB_NAME = "db-health-completion";
export const DB_HEALTH_COMPLETION_INTERVAL_MS = 24 * 60 * 60 * 1000;

type TableRow = {
  table_schema: string;
  table_name: string;
};

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export async function runDbHealthCompletion(): Promise<JobResult> {
  const tablesResult = await pool.query<TableRow>(`
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);

  const tableCounts: Array<{ table: string; rowCount: number }> = [];

  for (const table of tablesResult.rows) {
    const result = await pool.query<{ row_count: string }>(
      `SELECT COUNT(*)::bigint AS row_count FROM ${quoteIdent(table.table_schema)}.${quoteIdent(table.table_name)}`
    );
    const raw = result.rows[0]?.row_count ?? "0";
    const rowCount = Number(raw);
    tableCounts.push({
      table: `${table.table_schema}.${table.table_name}`,
      rowCount: Number.isFinite(rowCount) ? rowCount : 0,
    });
  }

  const totalPublicTables = tableCounts.length;
  const populatedTables = tableCounts.filter((row) => row.rowCount > 0);
  const zeroRowTables = tableCounts.filter((row) => row.rowCount === 0);

  return {
    itemsIn: totalPublicTables,
    itemsOut: populatedTables.length,
    cursorAfter: {
      sampledAt: new Date().toISOString(),
      totalPublicTables,
      populatedTables: populatedTables.length,
      zeroRowTables: zeroRowTables.length,
      largestTables: [...populatedTables]
        .sort((a, b) => b.rowCount - a.rowCount)
        .slice(0, 10),
      zeroRowSample: zeroRowTables.slice(0, 25).map((row) => row.table),
      fullReportCommand: "npm run db:health:completion",
    },
  };
}
