export { AntActor, PheromoneDot } from "./AntActors";
export {
  ANT_SIZE,
  MAX_DESKTOP_ANTS,
  MAX_PHEROMONES,
  PHEROMONE_LIFETIME_MS,
  getPheromoneAge,
  type AntColony,
  type AntColonySide,
  type AntPhase,
  type AntState,
  type PheromonePoint,
} from "./model";
export {
  buildAntExploreRoute,
  buildAntRoute,
  buildTrailRoute,
  chooseDiscoveredFood,
  createAntColony,
  spawnDesktopAnt,
  spawnWorldAnt,
} from "./simulation";
export { useDesktopAntSimulation } from "./useDesktopAntSimulation";
