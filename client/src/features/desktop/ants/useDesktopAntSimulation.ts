import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import {
  distance,
  type DesktopObstacle,
} from "../DesktopPetModel";
import {
  FOOD_SERVINGS,
  getDropCenter,
  type PetDrop,
} from "../drops";
import {
  MAX_DESKTOP_ANTS,
  MAX_PHEROMONES,
  PHEROMONE_LIFETIME_MS,
  type AntColony,
  type AntState,
  type PheromonePoint,
} from "./model";
import {
  buildAntExploreRoute,
  buildAntRoute,
  buildTrailRoute,
  chooseDiscoveredFood,
  createAntColony,
  spawnDesktopAnt,
} from "./simulation";
import type { DesktopItemState } from "../items/model";
import { applyAntItemInteractions } from "./itemInteractions";

type MutableRef<T> = { current: T };

interface DesktopAntSimulationArgs {
  enabled: boolean;
  bounds: { width: number; height: number };
  dropsRef: MutableRef<PetDrop[]>;
  antsRef: MutableRef<AntState[]>;
  pheromonesRef: MutableRef<PheromonePoint[]>;
  itemsRef: MutableRef<DesktopItemState[]>;
  obstaclesRef: MutableRef<DesktopObstacle[]>;
  setDrops: Dispatch<SetStateAction<PetDrop[]>>;
  setAnts: Dispatch<SetStateAction<AntState[]>>;
  setPheromones: Dispatch<SetStateAction<PheromonePoint[]>>;
}

export function useDesktopAntSimulation({
  enabled,
  bounds,
  dropsRef,
  antsRef,
  pheromonesRef,
  itemsRef,
  obstaclesRef,
  setDrops,
  setAnts,
  setPheromones,
}: DesktopAntSimulationArgs) {
  const nextAntSpawnAtRef = useRef(0);
  const antColonyRef = useRef<AntColony | null>(null);

  useEffect(() => {
    if (enabled) return;
    nextAntSpawnAtRef.current = 0;
    antColonyRef.current = null;
  }, [enabled]);

  useEffect(() => {
    if (!enabled || bounds.width <= 1 || bounds.height <= 1) {
      return;
    }

    let raf = 0;
    let last = performance.now();
    let frame = 0;

    const takeFoodServing = (foodId: string) => {
      let tookServing = false;
      const nextDrops = dropsRef.current.flatMap((drop) => {
        if (drop.id !== foodId || drop.kind !== "food") return [drop];
        const servings = Math.max(0, (drop.servings ?? FOOD_SERVINGS) - 1);
        tookServing = true;
        return servings > 0 ? [{ ...drop, servings }] : [];
      });
      if (tookServing) {
        dropsRef.current = nextDrops;
        setDrops(nextDrops);
      }
      return tookServing;
    };

    const retargetAnt = (ant: AntState, foods: PetDrop[], now: number) => {
      if (foods.length === 0) {
        return {
          ...ant,
          targetFoodId: null,
          carrying: false,
          phase: "returning" as const,
          phaseStartedAt: now,
          path: buildAntRoute(
            { x: ant.x, y: ant.y },
            { x: ant.spawnX, y: ant.spawnY },
            obstaclesRef.current,
            bounds
          ),
          pathIndex: 0,
          lastRetargetAt: now,
        };
      }
      return {
        ...ant,
        targetFoodId: null,
        phase: "exploring" as const,
        phaseStartedAt: now,
        path: buildAntExploreRoute(
          { x: ant.x, y: ant.y },
          foods,
          pheromonesRef.current,
          obstaclesRef.current,
          bounds
        ),
        pathIndex: 0,
        carrying: false,
        lastRetargetAt: now,
      };
    };

    const moveAlongPath = (ant: AntState, speed: number, dt: number) => {
      const target = ant.path[ant.pathIndex];
      if (!target) return ant;
      const dx = target.x - ant.x;
      const dy = target.y - ant.y;
      const remaining = Math.hypot(dx, dy);
      if (remaining < 2.2) {
        return { ...ant, x: target.x, y: target.y, pathIndex: ant.pathIndex + 1 };
      }
      const step = Math.min(remaining, speed * dt);
      return {
        ...ant,
        x: ant.x + (dx / remaining) * step,
        y: ant.y + (dy / remaining) * step,
        angle: Math.atan2(dy, dx),
      };
    };

    const moveWithItemRules = (ant: AntState, speed: number, dt: number, now: number) => {
      const reaction = applyAntItemInteractions({
        ant,
        items: itemsRef.current,
        bounds,
        now,
      });
      if (reaction.stuck || reaction.speedMultiplier <= 0) return reaction.ant;
      return moveAlongPath(reaction.ant, speed * reaction.speedMultiplier, dt);
    };

    const tick = (nowPerf: number) => {
      const now = Date.now();
      const dt = Math.min(0.05, Math.max(0.012, (nowPerf - last) / 1000));
      last = nowPerf;

      const foods = dropsRef.current.filter(
        (drop) => drop.kind === "food" && (drop.servings ?? FOOD_SERVINGS) > 0
      );
      let nextPheromones = pheromonesRef.current.filter(
        (point) => now - point.createdAt < PHEROMONE_LIFETIME_MS
      );
      let nextAnts = antsRef.current;
      let colony = antColonyRef.current;
      if (
        !colony ||
        colony.boundsWidth !== bounds.width ||
        colony.boundsHeight !== bounds.height
      ) {
        colony = createAntColony(bounds);
        antColonyRef.current = colony;
      }

      if (foods.length > 0 && nextAnts.length < MAX_DESKTOP_ANTS && now >= nextAntSpawnAtRef.current) {
        const spawned = spawnDesktopAnt(foods, nextPheromones, obstaclesRef.current, bounds, colony);
        if (spawned) nextAnts = [...nextAnts, spawned];
        nextAntSpawnAtRef.current = now + 2600 + Math.random() * 6200;
      } else if (foods.length === 0) {
        nextAntSpawnAtRef.current = now + 3000 + Math.random() * 5000;
      }

      const currentFoodsById = new Map(
        dropsRef.current
          .filter((drop) => drop.kind === "food" && (drop.servings ?? FOOD_SERVINGS) > 0)
          .map((drop) => [drop.id, drop])
      );
      const liveFoods = [...currentFoodsById.values()];

      nextAnts = nextAnts
        .map((currentAnt) => {
          let ant = currentAnt;
          const targetFood = ant.targetFoodId ? currentFoodsById.get(ant.targetFoodId) : null;
          const preMoveReaction = applyAntItemInteractions({
            ant,
            items: itemsRef.current,
            bounds,
            now,
          });
          ant = preMoveReaction.ant;
          if (preMoveReaction.stuck) return ant;

          if ((ant.phase === "seeking" || ant.phase === "dancing" || ant.phase === "harvesting") && !targetFood) {
            ant = retargetAnt(ant, liveFoods, now);
          }

          const liveFood = ant.targetFoodId ? currentFoodsById.get(ant.targetFoodId) : null;
          if (ant.phase === "passing") {
            ant = moveWithItemRules(ant, 48 + Math.random() * 12, dt, now);
          } else if (ant.phase === "exploring") {
            const discoveredFood = chooseDiscoveredFood(ant, liveFoods, nextPheromones);
            if (discoveredFood) {
              ant = {
                ...ant,
                targetFoodId: discoveredFood.id,
                phase: "seeking",
                phaseStartedAt: now,
                path: buildTrailRoute(
                  { x: ant.x, y: ant.y },
                  discoveredFood,
                  nextPheromones,
                  obstaclesRef.current,
                  bounds
                ),
                pathIndex: 0,
                carrying: false,
                lastRetargetAt: now,
              };
            } else {
              ant = moveWithItemRules(ant, 34 + Math.random() * 8, dt, now);
              if (ant.pathIndex >= ant.path.length) {
                if (liveFoods.length === 0) {
                  ant = {
                    ...ant,
                    phase: "returning",
                    phaseStartedAt: now,
                    path: buildAntRoute(
                      { x: ant.x, y: ant.y },
                      { x: ant.spawnX, y: ant.spawnY },
                      obstaclesRef.current,
                      bounds
                    ),
                    pathIndex: 0,
                    lastRetargetAt: now,
                  };
                } else {
                  ant = {
                    ...ant,
                    path: buildAntExploreRoute(
                      { x: ant.x, y: ant.y },
                      liveFoods,
                      nextPheromones,
                      obstaclesRef.current,
                      bounds
                    ),
                    pathIndex: 0,
                    lastRetargetAt: now,
                  };
                }
              }
            }
          } else if (ant.phase === "seeking" && liveFood) {
            const foodCenter = getDropCenter(liveFood);
            const routeEnd = ant.path[ant.path.length - 1];
            if (
              routeEnd &&
              distance(routeEnd, foodCenter) > 28 &&
              now - ant.lastRetargetAt > 1200
            ) {
              ant = {
                ...ant,
                path: buildTrailRoute(
                  { x: ant.x, y: ant.y },
                  liveFood,
                  nextPheromones,
                  obstaclesRef.current,
                  bounds
                ),
                pathIndex: 0,
                lastRetargetAt: now,
              };
            }

            ant = moveWithItemRules(ant, 42 + Math.random() * 10, dt, now);

            if (now - ant.lastTrailAt > 560) {
              nextPheromones = [
                ...nextPheromones,
                {
                  id: `trail-${now}-${Math.round(Math.random() * 99999)}`,
                  foodId: liveFood.id,
                  x: ant.x,
                  y: ant.y,
                  foodDistance: distance({ x: ant.x, y: ant.y }, foodCenter),
                  createdAt: now,
                },
              ].slice(-MAX_PHEROMONES);
              ant = { ...ant, lastTrailAt: now };
            }

            if (distance({ x: ant.x, y: ant.y }, foodCenter) < 10) {
              ant = {
                ...ant,
                x: foodCenter.x,
                y: foodCenter.y,
                phase: "dancing",
                phaseStartedAt: now,
                path: [],
                pathIndex: 0,
              };
            }
          } else if (ant.phase === "dancing") {
            if (now - ant.phaseStartedAt > 1500) {
              ant = { ...ant, phase: "harvesting", phaseStartedAt: now };
            }
          } else if (ant.phase === "harvesting") {
            if (liveFood) {
              const foodCenter = getDropCenter(liveFood);
              ant = { ...ant, x: foodCenter.x, y: foodCenter.y };
            }
            if (now - ant.phaseStartedAt > 15_000) {
              const carrying = liveFood ? takeFoodServing(liveFood.id) : false;
              ant = {
                ...ant,
                carrying,
                phase: "returning",
                phaseStartedAt: now,
                path: buildAntRoute(
                  { x: ant.x, y: ant.y },
                  { x: ant.spawnX, y: ant.spawnY },
                  obstaclesRef.current,
                  bounds
                ),
                pathIndex: 0,
              };
            }
          } else if (ant.phase === "returning") {
            ant = moveWithItemRules(ant, ant.carrying ? 32 : 46, dt, now);
            if (ant.carrying && ant.targetFoodId && now - ant.lastTrailAt > 620) {
              const food = currentFoodsById.get(ant.targetFoodId);
              const foodCenter = food ? getDropCenter(food) : { x: ant.x, y: ant.y };
              nextPheromones = [
                ...nextPheromones,
                {
                  id: `trail-${now}-${Math.round(Math.random() * 99999)}`,
                  foodId: ant.targetFoodId,
                  x: ant.x,
                  y: ant.y,
                  foodDistance: distance({ x: ant.x, y: ant.y }, foodCenter),
                  createdAt: now,
                },
              ].slice(-MAX_PHEROMONES);
              ant = { ...ant, lastTrailAt: now };
            }
          }

          return ant;
        })
        .filter((ant) => {
          if (ant.phase === "passing") {
            return ant.pathIndex <= ant.path.length && now - ant.phaseStartedAt < 26_000;
          }
          if (ant.phase !== "returning") return true;
          const target = { x: ant.spawnX, y: ant.spawnY };
          return distance({ x: ant.x, y: ant.y }, target) > 5;
        });

      frame += 1;
      antsRef.current = nextAnts;
      pheromonesRef.current = nextPheromones;
      if (frame % 2 === 0) {
        setAnts(nextAnts);
        setPheromones(nextPheromones);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bounds, bounds.height, bounds.width, enabled, itemsRef]);
}
