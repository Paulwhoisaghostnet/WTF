export {
  FOOD_SERVINGS,
  WATER_ABSORB_MS,
  getDropCenter,
  getDropSize,
  type PetDrop,
  type PetDropKind,
} from "./model";
export { normalizePetDrops } from "./storage";
export { useDesktopDropActions } from "./useDesktopDropActions";
export {
  applyToolItemCleaning,
  cleanDesktopMessesAtPoint,
  cleanMessDropWithTool,
  createDesktopMessDrop,
  diluteMessesWithWater,
  type DesktopCleaningTool,
} from "./itemInteractions";
