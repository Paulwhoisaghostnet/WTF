import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { DesktopWorldEdge } from "@shared/desktop";
import { clampFloatingPosition } from "../geometry";
import {
  PET_H,
  PET_W,
  distance,
  type DesktopObstacle,
  type EscapeTunnelState,
  type VisitingPetState,
} from "../DesktopPetModel";
import {
  FOOD_SERVINGS,
  WATER_ABSORB_MS,
  getDropCenter,
  getDropSize,
  type PetDrop,
} from "../drops";
import {
  BALL_SIZE,
  MAX_TOY_BALLS,
  getToyCenter,
  type PetToyState,
} from "./model";
import { toyEscapeEdge } from "./simulation";

type MutableRef<T> = { current: T };

interface DesktopToySimulationArgs {
  enabled: boolean;
  bounds: { width: number; height: number };
  petAlive: boolean | undefined;
  petAwayUntil: number;
  positionRef: MutableRef<{ x: number; y: number }>;
  dropsRef: MutableRef<PetDrop[]>;
  toysRef: MutableRef<PetToyState[]>;
  visitingPetsRef: MutableRef<VisitingPetState[]>;
  obstaclesRef: MutableRef<DesktopObstacle[]>;
  escapeTunnelRef: MutableRef<EscapeTunnelState | null>;
  toyEscapeRequestIdsRef: MutableRef<Set<string>>;
  setDrops: Dispatch<SetStateAction<PetDrop[]>>;
  setToys: Dispatch<SetStateAction<PetToyState[]>>;
  requestToyWorldEscape: (edge: DesktopWorldEdge, toy: PetToyState) => Promise<void>;
}

export function useDesktopToySimulation({
  enabled,
  bounds,
  petAlive,
  petAwayUntil,
  positionRef,
  dropsRef,
  toysRef,
  visitingPetsRef,
  obstaclesRef,
  escapeTunnelRef,
  toyEscapeRequestIdsRef,
  setDrops,
  setToys,
  requestToyWorldEscape,
}: DesktopToySimulationArgs) {
  useEffect(() => {
    if (!enabled || bounds.width <= 1 || bounds.height <= 1) return;
    let raf = 0;
    let last = performance.now();
    let frame = 0;

    const resolveIconCollision = (toy: PetToyState, obstacle: DesktopObstacle) => {
      const radius = BALL_SIZE / 2;
      const center = getToyCenter(toy);
      const nearestX = Math.max(obstacle.x, Math.min(center.x, obstacle.x + obstacle.width));
      const nearestY = Math.max(obstacle.y, Math.min(center.y, obstacle.y + obstacle.height));
      let dx = center.x - nearestX;
      let dy = center.y - nearestY;
      let dist = Math.hypot(dx, dy);
      if (dist >= radius || dist === 0) {
        if (dist !== 0) return toy;
        const distances = [
          { nx: -1, ny: 0, amount: Math.abs(center.x - obstacle.x) },
          { nx: 1, ny: 0, amount: Math.abs(obstacle.x + obstacle.width - center.x) },
          { nx: 0, ny: -1, amount: Math.abs(center.y - obstacle.y) },
          { nx: 0, ny: 1, amount: Math.abs(obstacle.y + obstacle.height - center.y) },
        ].sort((a, b) => a.amount - b.amount);
        const normal = distances[0] ?? { nx: 1, ny: 0 };
        dx = normal.nx;
        dy = normal.ny;
        dist = 1;
      }

      const nx = dx / dist;
      const ny = dy / dist;
      const penetration = radius - dist + 0.8;
      const dot = toy.vx * nx + toy.vy * ny;
      return {
        ...toy,
        x: toy.x + nx * penetration,
        y: toy.y + ny * penetration,
        vx: dot < 0 ? toy.vx - 1.72 * dot * nx : toy.vx,
        vy: dot < 0 ? toy.vy - 1.72 * dot * ny : toy.vy,
      };
    };

    const pushFromPet = (
      toy: PetToyState,
      actor: { x: number; y: number; width: number; height: number },
      now: number,
      strength: number
    ) => {
      const center = getToyCenter(toy);
      const actorCenter = {
        x: actor.x + actor.width / 2,
        y: actor.y + actor.height * 0.52,
      };
      const dx = center.x - actorCenter.x;
      const dy = center.y - actorCenter.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const reach = BALL_SIZE / 2 + Math.min(actor.width, actor.height) * 0.42;
      if (dist > reach) return toy;
      const nx = dx / dist;
      const ny = dy / dist;
      return {
        ...toy,
        x: toy.x + nx * Math.max(1, reach - dist),
        y: toy.y + ny * Math.max(1, reach - dist),
        vx: toy.vx + nx * strength,
        vy: toy.vy + ny * strength,
        lastPetHitAt: now,
      };
    };

    const splashOrSpill = (toy: PetToyState, now: number) => {
      if (now - toy.lastMessAt < 850) return toy;
      const center = getToyCenter(toy);
      const hitDrop = dropsRef.current.find((drop) => {
        if (drop.kind !== "food" && drop.kind !== "water") return false;
        return distance(center, getDropCenter(drop)) < BALL_SIZE / 2 + getDropSize(drop.kind) * 0.45;
      });
      if (!hitDrop) return toy;

      if (hitDrop.kind === "water") {
        const nextDrops = dropsRef.current.map((drop) => {
          if (drop.id !== hitDrop.id) return drop;
          const jittered = clampFloatingPosition(
            {
              x: drop.x + (Math.random() - 0.5) * 22,
              y: drop.y + (Math.random() - 0.5) * 18,
            },
            bounds,
            getDropSize("water"),
            getDropSize("water")
          );
          return {
            ...drop,
            ...jittered,
            createdAt: Math.max(now - WATER_ABSORB_MS * 0.82, (drop.createdAt ?? now) - 18_000),
          };
        });
        dropsRef.current = nextDrops;
        setDrops(nextDrops);
        return { ...toy, vx: toy.vx * 0.78, vy: toy.vy * 0.78, lastMessAt: now };
      }

      const servings = Math.max(1, hitDrop.servings ?? FOOD_SERVINGS);
      if (servings <= 1) return { ...toy, lastMessAt: now };
      const spilled = Math.max(1, Math.min(6, Math.floor(servings * 0.28)));
      const spillPosition = clampFloatingPosition(
        {
          x: hitDrop.x + (Math.random() - 0.5) * 56,
          y: hitDrop.y + (Math.random() - 0.5) * 42,
        },
        bounds,
        getDropSize("food"),
        getDropSize("food")
      );
      const nextDrops = [
        ...dropsRef.current.map((drop) =>
          drop.id === hitDrop.id
            ? { ...drop, servings: Math.max(1, servings - spilled), createdAt: now }
            : drop
        ),
        {
          id: `spill-${now}-${Math.round(Math.random() * 9999)}`,
          kind: "food" as const,
          createdAt: now,
          servings: spilled,
          ...spillPosition,
        },
      ].slice(-36);
      dropsRef.current = nextDrops;
      setDrops(nextDrops);
      return { ...toy, vx: toy.vx * 0.84, vy: toy.vy * 0.84, lastMessAt: now };
    };

    const tick = (nowPerf: number) => {
      const now = Date.now();
      const dt = Math.min(0.05, Math.max(0.012, (nowPerf - last) / 1000));
      last = nowPerf;
      const tunnel =
        escapeTunnelRef.current && now < escapeTunnelRef.current.openUntil
          ? escapeTunnelRef.current
          : null;

      let nextToys = toysRef.current.map((currentToy) => {
        if (toyEscapeRequestIdsRef.current.has(currentToy.id)) return currentToy;
        let toy = {
          ...currentToy,
          x: currentToy.x + currentToy.vx * dt,
          y: currentToy.y + currentToy.vy * dt,
          vx: currentToy.vx * Math.pow(0.985, dt * 60),
          vy: currentToy.vy * Math.pow(0.985, dt * 60),
        };

        if (petAlive && petAwayUntil <= now) {
          toy = pushFromPet(
            toy,
            { x: positionRef.current.x, y: positionRef.current.y, width: PET_W, height: PET_H },
            now,
            48
          );
        }
        for (const visitor of visitingPetsRef.current) {
          toy = pushFromPet(
            toy,
            { x: visitor.x, y: visitor.y, width: PET_W, height: PET_H },
            now,
            42
          );
        }

        const escapeEdge = toyEscapeEdge(toy, bounds);
        if (
          escapeEdge &&
          tunnel?.edge === escapeEdge &&
          now - toy.lastPetHitAt < 5_200
        ) {
          void requestToyWorldEscape(escapeEdge, toy);
          return toy;
        }

        if (toy.x < 0) {
          toy = { ...toy, x: 0, vx: Math.abs(toy.vx) * 0.82 };
        } else if (toy.x > bounds.width - BALL_SIZE) {
          toy = { ...toy, x: bounds.width - BALL_SIZE, vx: -Math.abs(toy.vx) * 0.82 };
        }
        if (toy.y < 0) {
          toy = { ...toy, y: 0, vy: Math.abs(toy.vy) * 0.82 };
        } else if (toy.y > bounds.height - BALL_SIZE) {
          toy = { ...toy, y: bounds.height - BALL_SIZE, vy: -Math.abs(toy.vy) * 0.82 };
        }

        for (const obstacle of obstaclesRef.current) {
          toy = resolveIconCollision(toy, obstacle);
        }
        toy = splashOrSpill(toy, now);
        if (Math.hypot(toy.vx, toy.vy) < 1.5) {
          toy = { ...toy, vx: 0, vy: 0 };
        }
        return toy;
      });

      nextToys = nextToys.slice(-(MAX_TOY_BALLS * 3));
      toysRef.current = nextToys;
      frame += 1;
      if (frame % 2 === 0) setToys(nextToys);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    bounds,
    bounds.height,
    bounds.width,
    petAlive,
    enabled,
    petAwayUntil,
    requestToyWorldEscape,
  ]);
}
