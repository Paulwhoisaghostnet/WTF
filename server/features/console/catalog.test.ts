import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgresql://wtf:wtf@localhost:5432/wtf_test";

test("console catalog dedupes installed and DB-backed stock by slug", async () => {
  const { dedupeConsoleCatalogCartridges } = await import("./catalog");
  const { FALLBACK_DEMO_CARTRIDGES } = await import("./manifest");

  const installedStock = FALLBACK_DEMO_CARTRIDGES.find(
    (cart) => cart.slug === "inverse-snake"
  );
  assert.ok(installedStock);

  const dbBackedStock = {
    ...installedStock,
    id: "published-inverse-snake",
    tokenContract: "published",
    tokenId: "inverse-snake-db",
    isPublished: true,
  };

  assert.deepEqual(
    dedupeConsoleCatalogCartridges([installedStock, dbBackedStock]).map((cart) => cart.id),
    [installedStock.id]
  );
});
