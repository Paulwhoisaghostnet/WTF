import { useCallback, type Dispatch, type SetStateAction } from "react";
import { clampFloatingPosition } from "../geometry";
import {
  PET_H,
  PET_W,
  type DesktopObstacle,
} from "../DesktopPetModel";
import type { PetActionMutationInput } from "../DesktopPetTypes";
import {
  buildAntRoute,
  type AntState,
  type PheromonePoint,
} from "../ants";
import {
  FOOD_SERVINGS,
  getDropSize,
  type PetDrop,
} from "./model";

type MutableRef<T> = { current: T };

interface DesktopDropActionsArgs {
  bounds: { width: number; height: number };
  dropsRef: MutableRef<PetDrop[]>;
  antsRef: MutableRef<AntState[]>;
  pheromonesRef: MutableRef<PheromonePoint[]>;
  obstaclesRef: MutableRef<DesktopObstacle[]>;
  positionRef: MutableRef<{ x: number; y: number }>;
  sleepRef: MutableRef<{ nextPillowSleepAt: number; nextFloorRestAt: number }>;
  remainsClearedRef: MutableRef<boolean>;
  mutatePetActionRef: MutableRef<(request: PetActionMutationInput) => void>;
  setDrops: Dispatch<SetStateAction<PetDrop[]>>;
  setAnts: Dispatch<SetStateAction<AntState[]>>;
  setPheromones: Dispatch<SetStateAction<PheromonePoint[]>>;
}

export function useDesktopDropActions({
  bounds,
  dropsRef,
  antsRef,
  pheromonesRef,
  obstaclesRef,
  positionRef,
  sleepRef,
  remainsClearedRef,
  mutatePetActionRef,
  setDrops,
  setAnts,
  setPheromones,
}: DesktopDropActionsArgs) {
  const addDrop = useCallback(
    (kind: "food" | "water" | "pillow", x: number, y: number) => {
      const now = Date.now();
      const size = getDropSize(kind);
      const liveDrops =
        kind === "pillow"
          ? dropsRef.current.filter((drop) => drop.kind !== "pillow")
          : dropsRef.current;
      const nextDrops = [
        ...liveDrops.slice(-35),
        {
          id: `${kind}-${Date.now()}-${Math.round(Math.random() * 9999)}`,
          kind,
          createdAt: kind === "food" || kind === "water" ? now : undefined,
          servings: kind === "food" ? FOOD_SERVINGS : undefined,
          ...clampFloatingPosition({ x: x - size / 2, y: y - size / 2 }, bounds, size, size),
        },
      ];
      dropsRef.current = nextDrops;
      setDrops(nextDrops);
    },
    [bounds, dropsRef, setDrops]
  );

  const addSkeletonRemains = useCallback(() => {
    if (dropsRef.current.some((drop) => drop.kind === "skeleton")) return;
    const size = getDropSize("skeleton");
    const source = positionRef.current;
    const nextDrop: PetDrop = {
      id: `skeleton-${Date.now()}-${Math.round(Math.random() * 9999)}`,
      kind: "skeleton",
      ...clampFloatingPosition(
        { x: source.x + PET_W * 0.18, y: source.y + PET_H * 0.55 },
        bounds,
        size,
        36
      ),
    };
    const nextDrops = [...dropsRef.current.slice(-35), nextDrop];
    dropsRef.current = nextDrops;
    setDrops(nextDrops);
  }, [bounds, dropsRef, positionRef, setDrops]);

  const moveDrop = useCallback(
    (id: string, next: { x: number; y: number }) => {
      const nextDrops = dropsRef.current.map((drop) =>
        drop.id === id ? { ...drop, ...next } : drop
      );
      dropsRef.current = nextDrops;
      setDrops(nextDrops);
    },
    [dropsRef, setDrops]
  );

  const trashFood = useCallback(
    (id: string) => {
      const nextDrops = dropsRef.current.filter((drop) => drop.id !== id);
      dropsRef.current = nextDrops;
      setDrops(nextDrops);
      const nextAnts = antsRef.current.map((ant) =>
        ant.targetFoodId === id
          ? {
              ...ant,
              targetFoodId: null,
              carrying: false,
              phase: "returning" as const,
              phaseStartedAt: Date.now(),
              path: buildAntRoute(
                { x: ant.x, y: ant.y },
                { x: ant.spawnX, y: ant.spawnY },
                obstaclesRef.current,
                bounds
              ),
              pathIndex: 0,
            }
          : ant
      );
      antsRef.current = nextAnts;
      setAnts(nextAnts);
      const nextPheromones = pheromonesRef.current.filter((trail) => trail.foodId !== id);
      pheromonesRef.current = nextPheromones;
      setPheromones(nextPheromones);
    },
    [antsRef, bounds, dropsRef, obstaclesRef, pheromonesRef, setAnts, setDrops, setPheromones]
  );

  const putAwayPillow = useCallback(
    (id: string) => {
      const nextDrops = dropsRef.current.filter((drop) => drop.id !== id);
      dropsRef.current = nextDrops;
      setDrops(nextDrops);
      sleepRef.current.nextFloorRestAt = Date.now() + 18_000;
    },
    [dropsRef, setDrops, sleepRef]
  );

  const removeRemains = useCallback(
    (id: string) => {
      remainsClearedRef.current = true;
      const nextDrops = dropsRef.current.filter((drop) => drop.id !== id);
      dropsRef.current = nextDrops;
      setDrops(nextDrops);
    },
    [dropsRef, remainsClearedRef, setDrops]
  );

  const scoopDrop = useCallback(
    (id: string) => {
      const remainingDrops = dropsRef.current.filter((drop) => drop.id !== id);
      dropsRef.current = remainingDrops;
      setDrops(remainingDrops);
      mutatePetActionRef.current("scoop");
    },
    [dropsRef, mutatePetActionRef, setDrops]
  );

  return {
    addDrop,
    addSkeletonRemains,
    moveDrop,
    trashFood,
    putAwayPillow,
    removeRemains,
    scoopDrop,
  };
}
