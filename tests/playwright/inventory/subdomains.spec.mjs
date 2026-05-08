import { test, expect } from "@playwright/test";
import {
  assertInventoryShape,
  parseInteractionInventory,
} from "../../e2e/inventory/parser.mjs";

const inventoryRows = parseInteractionInventory();
const inventoryShapeFailures = assertInventoryShape(inventoryRows);

test.describe("interaction inventory — subdomain ownership", () => {
  test("inventory tables are parseable and canonical", async () => {
    expect(inventoryShapeFailures).toEqual([]);
    expect(inventoryRows.length).toBeGreaterThan(40);
  });

  for (const row of inventoryRows) {
    test(`${row.concern} / ${row.subdomain}`, async ({ request }) => {
      expect(row.handles.length, `${row.subdomain} should own at least one handle`).toBeGreaterThan(0);

      for (const handle of row.handles) {
        const res = await request.post("/__test/e2e/interaction", {
          data: {
            domain: row.concern,
            subdomain: row.subdomain,
            handle,
            metadata: {
              access: row.access,
              inventoryRowId: row.id,
            },
          },
        });
        expect(res.ok(), `${row.id} -> ${handle}`).toBeTruthy();
        const payload = await res.json();
        expect(payload.event).toMatchObject({
          eventType: handle,
          userId: 1,
          source: `${row.concern}/${row.subdomain}`,
        });
        expect(payload.event.id).toMatch(/^evt_/);
        expect(payload.event.timestamp).toBeTruthy();
      }
    });
  }
});
