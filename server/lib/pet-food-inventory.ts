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
  await queryDb
    .insert(inAppInventoryItems)
    .values({
      userId,
      sku: PET_FOOD_SKU,
      quantity: NEW_PET_STARTER_FOOD_QUANTITY,
      metadata: {
        [NEW_PET_STARTER_FOOD_GRANT_KEY]: true,
        source: "new_pet_starter_food",
        quantity: NEW_PET_STARTER_FOOD_QUANTITY,
      },
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [inAppInventoryItems.userId, inAppInventoryItems.sku],
      set: {
        quantity: sql`CASE
          WHEN COALESCE(${inAppInventoryItems.metadata}, '{}'::jsonb)
            ? ${NEW_PET_STARTER_FOOD_GRANT_KEY}
            THEN ${inAppInventoryItems.quantity}
          ELSE ${inAppInventoryItems.quantity} + ${NEW_PET_STARTER_FOOD_QUANTITY}
        END`,
        metadata: sql`COALESCE(${inAppInventoryItems.metadata}, '{}'::jsonb)
          || jsonb_build_object(
            ${NEW_PET_STARTER_FOOD_GRANT_KEY}, true,
            'source', COALESCE(${inAppInventoryItems.metadata}->>'source', 'new_pet_starter_food'),
            'starterFoodQuantity', ${NEW_PET_STARTER_FOOD_QUANTITY}
          )`,
        updatedAt: now,
      },
    });
}
