import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import {
  type DesktopWorldEdge,
  type DesktopWorldEscapeResponse,
  type DesktopWorldFoodDrop,
  type DesktopWorldFoodSmell,
  type DesktopWorldHeartbeatResponse,
  type DesktopWorldVisitor,
  type HamsterState,
} from "@shared/desktop";
import { api } from "../../../lib/api";
import { clampFloatingPosition } from "../geometry";
import {
  PET_H,
  PET_W,
  type DesktopObstacle,
  type EscapeTunnelState,
  type VisitingPetState,
  type WalkaboutSignpostState,
} from "../DesktopPetModel";
import {
  FOOD_SERVINGS,
  type PetDrop,
} from "../drops";
import {
  MAX_DESKTOP_ANTS,
  spawnWorldAnt,
  type AntState,
  type PheromonePoint,
} from "../ants";
import {
  MAX_TOY_BALLS,
  spawnWorldBall,
  type PetToyState,
} from "../toys";
import { spawnVisitingPet } from "./simulation";

type MutableRef<T> = { current: T };

interface DesktopWorldGatewayArgs {
  enabled: boolean;
  userId: number | null;
  bounds: { width: number; height: number };
  pet: HamsterState | undefined;
  petAwayUntil: number;
  positionRef: MutableRef<{ x: number; y: number }>;
  homePositionRef: MutableRef<{ x: number; y: number }>;
  dropsRef: MutableRef<PetDrop[]>;
  antsRef: MutableRef<AntState[]>;
  pheromonesRef: MutableRef<PheromonePoint[]>;
  obstaclesRef: MutableRef<DesktopObstacle[]>;
  visitingPetsRef: MutableRef<VisitingPetState[]>;
  toysRef: MutableRef<PetToyState[]>;
  spawnedWorldVisitorsRef: MutableRef<Set<string>>;
  neighborFoodSmellRef: MutableRef<DesktopWorldFoodSmell | null>;
  escapeRequestCooldownRef: MutableRef<number>;
  nextPetEscapeAtRef: MutableRef<number>;
  setAnts: Dispatch<SetStateAction<AntState[]>>;
  setVisitingPets: Dispatch<SetStateAction<VisitingPetState[]>>;
  setToys: Dispatch<SetStateAction<PetToyState[]>>;
  setPetAwayUntil: Dispatch<SetStateAction<number>>;
  setEscapeTunnel: Dispatch<SetStateAction<EscapeTunnelState | null>>;
  setWalkaboutSignpost: Dispatch<SetStateAction<WalkaboutSignpostState | null>>;
  setPosition: Dispatch<SetStateAction<{ x: number; y: number }>>;
}

export function useDesktopWorldGateway({
  enabled,
  userId,
  bounds,
  pet,
  petAwayUntil,
  positionRef,
  homePositionRef,
  dropsRef,
  antsRef,
  pheromonesRef,
  obstaclesRef,
  visitingPetsRef,
  toysRef,
  spawnedWorldVisitorsRef,
  neighborFoodSmellRef,
  escapeRequestCooldownRef,
  nextPetEscapeAtRef,
  setAnts,
  setVisitingPets,
  setToys,
  setPetAwayUntil,
  setEscapeTunnel,
  setWalkaboutSignpost,
  setPosition,
}: DesktopWorldGatewayArgs) {
  const receiveWorldVisitors = useCallback(
    (visitors: DesktopWorldVisitor[]) => {
      if (bounds.width <= 1 || bounds.height <= 1) return;
      const newVisitors = visitors.filter((visitor) => {
        if (spawnedWorldVisitorsRef.current.has(visitor.id)) return false;
        spawnedWorldVisitorsRef.current.add(visitor.id);
        return true;
      });
      if (newVisitors.length === 0) return;

      const foods = dropsRef.current.filter(
        (drop) => drop.kind === "food" && (drop.servings ?? FOOD_SERVINGS) > 0
      );
      const nextAnts = [...antsRef.current];
      const nextPets = [...visitingPetsRef.current];
      const nextToys = [...toysRef.current];
      for (const visitor of newVisitors) {
        if (visitor.kind === "ant") {
          const ant = spawnWorldAnt(
            visitor,
            foods,
            pheromonesRef.current,
            obstaclesRef.current,
            bounds
          );
          if (ant) nextAnts.push(ant);
        } else if (visitor.kind === "guinea-pig") {
          const petVisitor = spawnVisitingPet(visitor, bounds);
          if (petVisitor) nextPets.push(petVisitor);
        } else if (visitor.kind === "ball") {
          const ballVisitor = spawnWorldBall(visitor, bounds);
          if (ballVisitor) nextToys.push(ballVisitor);
        }
      }
      antsRef.current = nextAnts.slice(-MAX_DESKTOP_ANTS - 12);
      visitingPetsRef.current = nextPets.slice(-4);
      toysRef.current = nextToys.slice(-(MAX_TOY_BALLS * 3));
      setAnts(antsRef.current);
      setVisitingPets(visitingPetsRef.current);
      setToys(toysRef.current);
    },
    [
      antsRef,
      bounds,
      dropsRef,
      obstaclesRef,
      pheromonesRef,
      setAnts,
      setToys,
      setVisitingPets,
      spawnedWorldVisitorsRef,
      toysRef,
      visitingPetsRef,
    ]
  );

  useEffect(() => {
    if (!enabled || !userId || bounds.width <= 1 || bounds.height <= 1) return;
    let cancelled = false;
    let timeout = 0;

    const sendHeartbeat = async () => {
      const foods: DesktopWorldFoodDrop[] = dropsRef.current
        .filter((drop) => drop.kind === "food" && (drop.servings ?? FOOD_SERVINGS) > 0)
        .slice(0, 24)
        .map((drop) => ({
          id: drop.id,
          x: drop.x,
          y: drop.y,
          servings: drop.servings ?? FOOD_SERVINGS,
        }));
      try {
        const response = await api.post<DesktopWorldHeartbeatResponse>(
          "/api/desktop/world/heartbeat",
          {
            viewport: bounds,
            foods,
            pet: pet
              ? {
                  x: positionRef.current.x,
                  y: positionRef.current.y,
                  alive: pet.alive,
                }
              : undefined,
          }
        );
        if (!cancelled) {
          neighborFoodSmellRef.current = response.activity.neighborFoodSmell ?? null;
          receiveWorldVisitors(response.visitors);
        }
      } catch {
        if (!cancelled) neighborFoodSmellRef.current = null;
        // World travel is ambient; a failed heartbeat should not break local care.
      } finally {
        if (!cancelled) timeout = window.setTimeout(sendHeartbeat, 5_000);
      }
    };

    sendHeartbeat();
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [bounds, dropsRef, enabled, neighborFoodSmellRef, pet, positionRef, receiveWorldVisitors, userId]);

  return useCallback(
    async (edge: DesktopWorldEdge, escapingPet: HamsterState) => {
      const now = Date.now();
      if (now < escapeRequestCooldownRef.current || now < petAwayUntil) return;
      escapeRequestCooldownRef.current = now + 35_000;
      try {
        const response = await api.post<DesktopWorldEscapeResponse>(
          "/api/desktop/world/escape",
          {
            edge,
            pet: {
              colorSchemeKey: escapingPet.colorSchemeKey,
            },
          }
        );
        if (response.accepted) {
          const clock = Date.now();
          const leavingSpot = positionRef.current;
          const sign = clampFloatingPosition(
            { x: leavingSpot.x + PET_W * 0.32, y: leavingSpot.y + PET_H * 0.72 },
            bounds,
            42,
            38
          );
          setPetAwayUntil(clock + response.awayMs);
          setEscapeTunnel({ edge, openUntil: clock + response.awayMs });
          setWalkaboutSignpost({ ...sign, until: clock + response.awayMs });
          nextPetEscapeAtRef.current = clock + 95_000 + Math.random() * 120_000;
          const next = homePositionRef.current;
          positionRef.current = next;
          setPosition(next);
        } else {
          nextPetEscapeAtRef.current = Date.now() + 50_000 + Math.random() * 80_000;
        }
      } catch {
        nextPetEscapeAtRef.current = Date.now() + 60_000 + Math.random() * 80_000;
      }
    },
    [
      bounds,
      escapeRequestCooldownRef,
      homePositionRef,
      nextPetEscapeAtRef,
      petAwayUntil,
      positionRef,
      setEscapeTunnel,
      setPetAwayUntil,
      setPosition,
      setWalkaboutSignpost,
    ]
  );
}
