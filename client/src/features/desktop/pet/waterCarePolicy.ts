import type { HamsterState } from "@shared/desktop";
import type { PetActionMutationInput } from "../DesktopPetTypes";

const WATER_DRINK_THRESHOLD = 92;
const WATER_BATH_HYGIENE_THRESHOLD = 62;

type WaterCarePet = Pick<HamsterState, "thirst" | "hygiene" | "sick" | "poopExposure">;

function needsWaterBath(pet: WaterCarePet): boolean {
  return pet.poopExposure > 0 || pet.sick || pet.hygiene < WATER_BATH_HYGIENE_THRESHOLD;
}

export function needsWaterCare(pet: WaterCarePet): boolean {
  return pet.thirst < WATER_DRINK_THRESHOLD || needsWaterBath(pet);
}

export function selectWaterCareRequest(
  pet: WaterCarePet,
  cleanSource: string
): PetActionMutationInput {
  if (pet.thirst < WATER_DRINK_THRESHOLD) return "water";
  if (needsWaterBath(pet)) {
    return {
      action: "clean",
      metadata: { cleanSource },
    };
  }
  return "water";
}
