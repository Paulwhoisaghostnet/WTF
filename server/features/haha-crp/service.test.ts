import test from "node:test";
import assert from "node:assert/strict";

const A = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const B = "tz1UakcrmXD82EinyTmZ4qLYE9ZGQwcXPt79";

test("standings preserve database vote precision for the earlier-final-nomination tie rule", async () => {
  process.env.DATABASE_URL ||= "postgresql://localhost/haha_test";
  const [{ pool }, { hahaStandings }] = await Promise.all([
    import("../../db"),
    import("./service"),
  ]);
  const queryPool = pool as unknown as { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> };
  const originalQuery = queryPool.query;
  queryPool.query = async (sql, params) => {
    assert.match(sql, /SS\.US/);
    assert.match(sql, /ORDER BY created_at, id/);
    assert.deepEqual(params, ["current-2026"]);
    return { rows: [
      { category_id: "trailblazer-trader", nominee_address: B, nominee_display_name: "Mare Force", nomination_at: "2026-11-03T12:00:00.123789Z" },
      { category_id: "trailblazer-trader", nominee_address: A, nominee_display_name: "Canter", nomination_at: "2026-11-03T12:00:00.123456Z" },
    ] };
  };
  try {
    const standings = await hahaStandings();
    const riders = standings.categories.find((category) => category.id === "trailblazer-trader")?.nominees;
    assert.deepEqual(riders?.map((rider) => [rider.address, rider.rank]), [[A, 1], [B, 2]]);
  } finally {
    queryPool.query = originalQuery;
    await pool.end();
  }
});
