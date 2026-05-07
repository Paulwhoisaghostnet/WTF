import { useEffect, type Dispatch, type SetStateAction } from "react";
import {
  type DesktopWorldEdge,
  type DesktopWorldFoodSmell,
  type HamsterAction,
  type HamsterState,
} from "@shared/desktop";
import { clampFloatingPosition } from "../geometry";
import {
  PET_H,
  PET_W,
  clamp01,
  type DesktopObstacle,
  type ScentScratchState,
  type VisitingPetState,
  type WalkaboutSignpostState,
} from "../DesktopPetModel";
import {
  chooseDefensiveTarget,
  randomHamsterTarget,
} from "../DesktopPetSimulation";
import type { PetActionMutationInput } from "../DesktopPetTypes";
import {
  FOOD_SERVINGS,
  type PetDrop,
} from "../drops";
import {
  buildAntRoute,
  type AntState,
} from "../ants";
import type { PetToyState } from "../toys";
import type { DesktopItemState } from "../items/model";
import { applyPetItemInteractions } from "./itemInteractions";
import {
  isAtEdgeForTarget,
  isOffscreenTarget,
  offscreenTargetForEdge,
  randomWorldEdge,
  scratchCuePosition,
  sniffTargetForEdge,
} from "../world";

type MutableRef<T> = { current: T };

interface DesktopPetLocomotionArgs {
  enabled: boolean;
  bounds: { width: number; height: number };
  pet: HamsterState | undefined;
  petAwayUntil: number;
  positionRef: MutableRef<{ x: number; y: number }>;
  dropsRef: MutableRef<PetDrop[]>;
  antsRef: MutableRef<AntState[]>;
  toysRef: MutableRef<PetToyState[]>;
  itemsRef: MutableRef<DesktopItemState[]>;
  visitingPetsRef: MutableRef<VisitingPetState[]>;
  obstaclesRef: MutableRef<DesktopObstacle[]>;
  homePositionRef: MutableRef<{ x: number; y: number }>;
  wanderTargetRef: MutableRef<{ x: number; y: number }>;
  escapeEdgeRef: MutableRef<DesktopWorldEdge | null>;
  neighborFoodSmellRef: MutableRef<DesktopWorldFoodSmell | null>;
  scentScratchRef: MutableRef<ScentScratchState | null>;
  nextPetEscapeAtRef: MutableRef<number>;
  nextHomeReturnAtRef: MutableRef<number>;
  defenseCooldownRef: MutableRef<number>;
  digestionRef: MutableRef<{ pendingPoops: number; nextPoopAt: number }>;
  sleepRef: MutableRef<{ nextPillowSleepAt: number; nextFloorRestAt: number }>;
  sicknessExposureRef: MutableRef<{ nextAt: number }>;
  mutatePetActionRef: MutableRef<(request: PetActionMutationInput) => void>;
  requestPetWorldEscape: (edge: DesktopWorldEdge, pet: HamsterState) => void | Promise<void>;
  setPosition: Dispatch<SetStateAction<{ x: number; y: number }>>;
  setFacing: Dispatch<SetStateAction<"left" | "right">>;
  setMoving: Dispatch<SetStateAction<boolean>>;
  setDrops: Dispatch<SetStateAction<PetDrop[]>>;
  setAnts: Dispatch<SetStateAction<AntState[]>>;
  setToys: Dispatch<SetStateAction<PetToyState[]>>;
  setItems: Dispatch<SetStateAction<DesktopItemState[]>>;
  setVisitingPets: Dispatch<SetStateAction<VisitingPetState[]>>;
  setScentScratchCue: Dispatch<
    SetStateAction<(WalkaboutSignpostState & { edge: DesktopWorldEdge }) | null>
  >;
}

export function useDesktopPetLocomotion({
  enabled,
  bounds,
  pet,
  petAwayUntil,
  positionRef,
  dropsRef,
  antsRef,
  toysRef,
  itemsRef,
  visitingPetsRef,
  obstaclesRef,
  homePositionRef,
  wanderTargetRef,
  escapeEdgeRef,
  neighborFoodSmellRef,
  scentScratchRef,
  nextPetEscapeAtRef,
  nextHomeReturnAtRef,
  defenseCooldownRef,
  digestionRef,
  sleepRef,
  sicknessExposureRef,
  mutatePetActionRef,
  requestPetWorldEscape,
  setPosition,
  setFacing,
  setMoving,
  setDrops,
  setAnts,
  setToys,
  setItems,
  setVisitingPets,
  setScentScratchCue,
}: DesktopPetLocomotionArgs) {
  useEffect(() => {
    if (
      !enabled ||
      !pet?.alive ||
      petAwayUntil > Date.now() ||
      bounds.width <= 1 ||
      bounds.height <= 1
    ) {
      setMoving(false);
      return;
    }

    let raf = 0;
    let last = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.01, (now - last) / 1000));
      last = now;
      const current = positionRef.current;
      const clockNow = Date.now();
      const liveDrops = dropsRef.current;
      const localFoodAvailable = liveDrops.some(
        (drop) => drop.kind === "food" && (drop.servings ?? FOOD_SERVINGS) > 0
      );
      const hungryDrop =
        pet.hunger < 92 ? liveDrops.find((drop) => drop.kind === "food") : undefined;
      const waterDrop = liveDrops.find((drop) => drop.kind === "water");
      const bathDrop =
        waterDrop && (pet.poopExposure > 0 || pet.sick || pet.hygiene < 62)
          ? waterDrop
          : undefined;
      const thirstyDrop = !bathDrop && pet.thirst < 92 ? waterDrop : undefined;
      const pursuit = hungryDrop ?? bathDrop ?? thirstyDrop;
      const pillowDrop =
        !pursuit && pet.energy < 74
          ? liveDrops.find((drop) => drop.kind === "pillow")
          : undefined;
      const genes = pet.genetics.effectiveStats;
      const itemReaction = applyPetItemInteractions({
        current,
        pet,
        items: itemsRef.current,
        bounds,
        now: clockNow,
      });
      if (itemReaction.changed) {
        itemsRef.current = itemReaction.items;
        setItems(itemReaction.items);
      }
      const careTarget = pursuit ?? pillowDrop;
      const defensiveTarget =
        !careTarget && clockNow >= defenseCooldownRef.current
          ? chooseDefensiveTarget(
              current,
              pet.trauma,
              antsRef.current,
              toysRef.current,
              visitingPetsRef.current
            )
          : null;
      const neighborFoodSmell = neighborFoodSmellRef.current;
      const scentPull =
        neighborFoodSmell && !careTarget && !localFoodAvailable && pet.hunger < 82
          ? clamp01(((82 - pet.hunger) / 82) * neighborFoodSmell.intensity)
          : 0;
      let scentTarget: { edge: DesktopWorldEdge; target: { x: number; y: number } } | null = null;
      if (!careTarget && !defensiveTarget && neighborFoodSmell && scentPull > 0) {
        const currentScratch = scentScratchRef.current;
        const keepFocus =
          currentScratch &&
          currentScratch.edge === neighborFoodSmell.edge &&
          clockNow < currentScratch.focusUntil;
        if (keepFocus || Math.random() < 0.008 + scentPull * 0.055) {
          let scratch = currentScratch;
          const targetDistance = scratch
            ? Math.hypot(current.x - scratch.target.x, current.y - scratch.target.y)
            : Number.POSITIVE_INFINITY;
          if (!scratch || scratch.edge !== neighborFoodSmell.edge || targetDistance < 16) {
            scratch = {
              edge: neighborFoodSmell.edge,
              target: sniffTargetForEdge(neighborFoodSmell.edge, bounds),
              focusUntil: clockNow + 3200 + scentPull * 14_000,
              nextScratchAt: 0,
              nextEscapeAttemptAt: clockNow + Math.max(3200, 13_000 - scentPull * 8500),
            };
            scentScratchRef.current = scratch;
          }
          scentTarget = { edge: scratch.edge, target: scratch.target };
        }
      } else if (!neighborFoodSmell || localFoodAvailable || pet.hunger >= 86) {
        scentScratchRef.current = null;
      }
      if (careTarget || defensiveTarget || scentTarget) escapeEdgeRef.current = null;
      const target = careTarget
        ? { x: careTarget.x - PET_W * 0.22, y: careTarget.y - PET_H * 0.35 }
        : defensiveTarget
          ? { x: defensiveTarget.x - PET_W / 2, y: defensiveTarget.y - PET_H * 0.52 }
          : scentTarget
            ? scentTarget.target
            : itemReaction.target ?? wanderTargetRef.current;
      const dx = target.x - current.x;
      const dy = target.y - current.y;
      const distance = Math.hypot(dx, dy);

      if (pursuit && distance < 18) {
        const remainingDrops = liveDrops.filter((drop) => drop.id !== pursuit.id);
        dropsRef.current = remainingDrops;
        setDrops(remainingDrops);
        // Ants ration desktop food into 20 crumbs; non-ant pets eat the whole plate once.
        const action: HamsterAction =
          pursuit.kind === "food"
            ? "feed"
            : bathDrop && pursuit.id === bathDrop.id
              ? "clean"
              : "water";
        mutatePetActionRef.current(
          action === "clean"
            ? { action, metadata: { cleanSource: "desktop_water_drop" } }
            : action
        );
        if (action === "clean") sicknessExposureRef.current.nextAt = 0;
        if (pursuit.kind === "food") {
          const digestion = digestionRef.current;
          digestion.pendingPoops += 1;
          digestion.nextPoopAt =
            digestion.nextPoopAt || Date.now() + 24_000 + Math.random() * 46_000;
        }
      } else if (pillowDrop && distance < 18) {
        const clock = Date.now();
        const sleepTimers = sleepRef.current;
        if (clock >= sleepTimers.nextPillowSleepAt && pet.energy < 96) {
          sleepTimers.nextPillowSleepAt = clock + 45_000;
          mutatePetActionRef.current({
            action: "nap",
            metadata: { sleepQuality: "pillow" },
          });
        }
        wanderTargetRef.current = randomHamsterTarget(bounds);
      } else if (defensiveTarget && distance < 20) {
        defenseCooldownRef.current = clockNow + Math.max(5200, 14_000 - pet.trauma * 70);
        const petCenter = { x: current.x + PET_W / 2, y: current.y + PET_H * 0.5 };
        const dxStrike = defensiveTarget.x - petCenter.x;
        const dyStrike = defensiveTarget.y - petCenter.y;
        const strikeDistance = Math.max(1, Math.hypot(dxStrike, dyStrike));
        const nx = dxStrike / strikeDistance;
        const ny = dyStrike / strikeDistance;
        if (defensiveTarget.kind === "ant") {
          const nextAnts = antsRef.current.map((ant) =>
            ant.id === defensiveTarget.id
              ? {
                  ...ant,
                  carrying: false,
                  targetFoodId: null,
                  phase: "returning" as const,
                  phaseStartedAt: clockNow,
                  path: buildAntRoute(
                    { x: ant.x + nx * 20, y: ant.y + ny * 20 },
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
        } else if (defensiveTarget.kind === "toy") {
          const nextToys = toysRef.current.map((toy) =>
            toy.id === defensiveTarget.id
              ? {
                  ...toy,
                  vx: toy.vx + nx * (180 + pet.trauma * 3),
                  vy: toy.vy + ny * (180 + pet.trauma * 3),
                  lastPetHitAt: clockNow,
                }
              : toy
          );
          toysRef.current = nextToys;
          setToys(nextToys);
        } else {
          const nextVisitors = visitingPetsRef.current.map((visitor) =>
            visitor.id === defensiveTarget.id
              ? {
                  ...visitor,
                  x: visitor.x + nx * 18,
                  y: visitor.y + ny * 14,
                  pathIndex: Math.max(visitor.pathIndex, visitor.path.length - 1),
                }
              : visitor
          );
          visitingPetsRef.current = nextVisitors;
          setVisitingPets(nextVisitors);
        }
        wanderTargetRef.current = homePositionRef.current;
      } else if (scentTarget && distance < 14) {
        const scratch = scentScratchRef.current;
        if (scratch) {
          if (clockNow >= scratch.nextScratchAt) {
            const cue = scratchCuePosition(scentTarget.edge, current, bounds);
            setScentScratchCue({ ...cue, edge: scentTarget.edge, until: clockNow + 900 });
            scratch.nextScratchAt = clockNow + 750 + Math.random() * 850;
          }
          if (clockNow >= scratch.nextEscapeAttemptAt) {
            scratch.nextEscapeAttemptAt =
              clockNow + Math.max(9_500, 42_000 - scentPull * 28_000);
            void requestPetWorldEscape(scentTarget.edge, pet);
          } else if (clockNow + 900 >= scratch.focusUntil) {
            scratch.target = sniffTargetForEdge(scentTarget.edge, bounds);
            scratch.focusUntil = clockNow + 2200 + scentPull * 10_000;
          }
        }
      } else if (!careTarget && distance < 12) {
        const clock = Date.now();
        const homeTarget = homePositionRef.current;
        const farFromHome = Math.hypot(current.x - homeTarget.x, current.y - homeTarget.y) > 72;
        const shouldReturnHome =
          farFromHome &&
          (clock >= nextHomeReturnAtRef.current || pet.trauma >= 45 || pet.energy < 42);
        if (
          !shouldReturnHome &&
          clock >= nextPetEscapeAtRef.current &&
          pet.energy > 58 &&
          pet.hunger > 35 &&
          pet.thirst > 35 &&
          !pet.sick &&
          pet.trauma < 65
        ) {
          const edge = randomWorldEdge();
          escapeEdgeRef.current = edge;
          wanderTargetRef.current = offscreenTargetForEdge(edge, bounds);
        } else if (shouldReturnHome) {
          escapeEdgeRef.current = null;
          wanderTargetRef.current = homeTarget;
          nextHomeReturnAtRef.current =
            clock + 70_000 + Math.random() * 75_000 + pet.bondLevel * 650;
        } else {
          escapeEdgeRef.current = null;
          wanderTargetRef.current = randomHamsterTarget(bounds);
          if (
            Math.hypot(
              wanderTargetRef.current.x - homeTarget.x,
              wanderTargetRef.current.y - homeTarget.y
            ) > 140 &&
            pet.trauma >= 28
          ) {
            wanderTargetRef.current = homeTarget;
          }
        }
      } else if (distance > 0.5) {
        const baseSpeed = careTarget || defensiveTarget
          ? 38 + genes.speed * 0.52 + genes.stamina * 0.08
          : 14 + pet.energy * 0.14 + genes.speed * 0.28 + genes.stamina * 0.08;
        const speed = baseSpeed * itemReaction.speedMultiplier;
        const step = Math.min(distance, speed * dt);
        const next = clampFloatingPosition(
          {
            x: current.x + (dx / distance) * step,
            y: current.y + (dy / distance) * step,
          },
          bounds,
          PET_W,
          PET_H + 22
        );
        positionRef.current = next;
        frame += 1;
        if (frame % 2 === 0) setPosition(next);
        setFacing(dx < 0 ? "left" : "right");
        setMoving(true);
        const escapeEdge = escapeEdgeRef.current;
        if (
          !careTarget &&
          escapeEdge &&
          isOffscreenTarget(target, bounds) &&
          isAtEdgeForTarget(next, escapeEdge, bounds)
        ) {
          escapeEdgeRef.current = null;
          wanderTargetRef.current = randomHamsterTarget(bounds);
          void requestPetWorldEscape(escapeEdge, pet);
        }
      } else {
        setMoving(false);
      }

      if (!pursuit && (!pillowDrop || itemReaction.stickyRestItemId) && pet.energy < 28) {
        const clock = Date.now();
        const sleepTimers = sleepRef.current;
        if (clock >= sleepTimers.nextFloorRestAt) {
          sleepTimers.nextFloorRestAt = clock + 130_000;
          mutatePetActionRef.current({
            action: "nap",
            metadata: { sleepQuality: itemReaction.stickyRestItemId ? "sticky_note" : "floor" },
          });
        }
      }

      if (pet.poopExposure > 0 && !pet.sick) {
        const clock = Date.now();
        const exposure = sicknessExposureRef.current;
        if (clock >= exposure.nextAt) {
          exposure.nextAt =
            clock + Math.max(44_000, 92_000 - Math.min(38_000, pet.poopExposure * 5500));
          mutatePetActionRef.current({
            action: "poop",
            metadata: { source: "unbathed_poop_exposure", recurringExposure: true },
          });
        }
      } else {
        sicknessExposureRef.current.nextAt = 0;
      }

      const digestion = digestionRef.current;
      if (digestion.pendingPoops > 0 && digestion.nextPoopAt && Date.now() >= digestion.nextPoopAt) {
        const poopPosition = clampFloatingPosition(
          {
            x: positionRef.current.x + 26 + Math.random() * 16,
            y: positionRef.current.y + 42 + Math.random() * 12,
          },
          bounds,
          30,
          30
        );
        const nextDrops = [
          ...dropsRef.current.slice(-31),
          {
            id: `poop-${Date.now()}-${Math.round(Math.random() * 9999)}`,
            kind: "poop" as const,
            ...poopPosition,
          },
        ];
        dropsRef.current = nextDrops;
        setDrops(nextDrops);
        mutatePetActionRef.current({
          action: "poop",
          metadata: { source: "desktop_digestive_cycle" },
        });
        sicknessExposureRef.current.nextAt = Date.now() + 70_000 + Math.random() * 28_000;
        digestion.pendingPoops -= 1;
        digestion.nextPoopAt =
          digestion.pendingPoops > 0
            ? Date.now() + 30_000 + Math.random() * 60_000
            : 0;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    bounds,
    bounds.height,
    bounds.width,
    enabled,
    pet,
    pet?.alive,
    pet?.energy,
    pet?.genetics,
    pet?.hunger,
    pet?.thirst,
    petAwayUntil,
    requestPetWorldEscape,
    itemsRef,
    setAnts,
    setDrops,
    setFacing,
    setMoving,
    setPosition,
    setScentScratchCue,
    setItems,
    setToys,
    setVisitingPets,
  ]);
}
