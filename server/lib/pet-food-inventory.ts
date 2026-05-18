import { sql } from "drizzle-orm";
import { db } from "../db";
import { inAppInventoryItems } from "@shared/schema";

export const PET_FOOD_SKU = "pet-food";
export const NEW_PET_STARTER_FOOD_QUANTITY = 2;
export const NEW_PET_STARTER_FOOD_GRANT_KEY = "newPetStarterFood20260506";

export async function grantNewPetStarterFood(
  queryDb: typeof db,
  userId: number,
  now = new Date()
) {
  const grantKey = sql`${NEW_PET_STARTER_FOOD_GRANT_KEY}::text`;
  await queryDb
    .insert(inAppInventoryItems)
    .values({
      userId,
      sku: PET_FOOD_SKU,
      quantity: NEW_PET_STARTER_FOOD_QUANTITY,
      metadata: {
        [NEW_PET_STARTER_FOOD_GRANT_KEY]: true,
        source: "new_pet_starter_food",
        sourceType: "starter_grant",
        sourceId: null,
        domain: "desktop",
        ownerType: "user",
        state: "owned",
        visibility: "user_inventory",
        quantity: NEW_PET_STARTER_FOOD_QUANTITY,
        traceRule: "P6.CA3/08",
      },
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [inAppInventoryItems.userId, inAppInventoryItems.sku],
      set: {
        quantity: sql`CASE
          WHEN COALESCE(${inAppInventoryItems.metadata}, '{}'::jsonb)
            ? ${grantKey}
            THEN ${inAppInventoryItems.quantity}
          ELSE ${inAppInventoryItems.quantity} + ${NEW_PET_STARTER_FOOD_QUANTITY}
        END`,
        metadata: sql`COALESCE(${inAppInventoryItems.metadata}, '{}'::jsonb)
          || jsonb_build_object(
            ${grantKey}, true,
            'source', COALESCE(${inAppInventoryItems.metadata}->>'source', 'new_pet_starter_food'),
            'sourceType', COALESCE(${inAppInventoryItems.metadata}->>'sourceType', 'starter_grant'),
            'sourceId', COALESCE(${inAppInventoryItems.metadata}->'sourceId', 'null'::jsonb),
            'domain', COALESCE(${inAppInventoryItems.metadata}->>'domain', 'desktop'),
            'ownerType', COALESCE(${inAppInventoryItems.metadata}->>'ownerType', 'user'),
            'state', COALESCE(${inAppInventoryItems.metadata}->>'state', 'owned'),
            'visibility', COALESCE(${inAppInventoryItems.metadata}->>'visibility', 'user_inventory'),
            'traceRule', COALESCE(${inAppInventoryItems.metadata}->>'traceRule', 'P6.CA3/08'),
            'starterFoodQuantity', ${NEW_PET_STARTER_FOOD_QUANTITY}::int
          )`,
        updatedAt: now,
      },
    });
}
