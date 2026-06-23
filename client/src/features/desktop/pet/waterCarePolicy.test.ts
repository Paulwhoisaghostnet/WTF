import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_HAMSTER_STATE } from "@shared/desktop";
import {
  needsWaterCare,
  selectWaterCareRequest,
} from "./waterCarePolicy";

test("water care hydrates a thirsty sick or dirty pet before bathing", () => {
  const urgentPet = {
    ...DEFAULT_HAMSTER_STATE,
    thirst: 0,
    hygiene: 18,
    sick: true,
    poopExposure: 2,
  };

  assert.equal(needsWaterCare(urgentPet), true);
  assert.equal(selectWaterCareRequest(urgentPet, "water_tool"), "water");
  assert.equal(selectWaterCareRequest(urgentPet, "desktop_water_drop"), "water");
});

test("water care only becomes bath care after thirst is satisfied", () => {
  const cleanablePet = {
    ...DEFAULT_HAMSTER_STATE,
    thirst: 96,
    hygiene: 18,
    sick: false,
    poopExposure: 1,
  };

  assert.equal(needsWaterCare(cleanablePet), true);
  assert.deepEqual(selectWaterCareRequest(cleanablePet, "water_tool"), {
    action: "clean",
    metadata: { cleanSource: "water_tool" },
  });
});
