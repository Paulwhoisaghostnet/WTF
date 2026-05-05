import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { DesktopWorldEdge, DesktopWorldToyEscapeResponse } from "@shared/desktop";
import { api } from "../../../lib/api";
import { clampFloatingPosition } from "../geometry";
import {
  BALL_SIZE,
  MAX_TOY_BALLS,
  TOY_WORLD_SLOT_RESERVE_MS,
  type EscapedBallSlot,
  type PetToyState,
} from "./model";
import { seededBallColor } from "./storage";

type MutableRef<T> = { current: T };
type MarketStatusSetter = Dispatch<SetStateAction<{ text: string; error?: boolean }>>;

interface DesktopToyActionsArgs {
  bounds: { width: number; height: number };
  ballQty: number;
  toysRef: MutableRef<PetToyState[]>;
  escapedBallSlotsRef: MutableRef<EscapedBallSlot[]>;
  toyEscapeRequestIdsRef: MutableRef<Set<string>>;
  setToys: Dispatch<SetStateAction<PetToyState[]>>;
  setEscapedBallSlots: Dispatch<SetStateAction<EscapedBallSlot[]>>;
  setMarketStatus: MarketStatusSetter;
}

export function useDesktopToyActions({
  bounds,
  ballQty,
  toysRef,
  escapedBallSlotsRef,
  toyEscapeRequestIdsRef,
  setToys,
  setEscapedBallSlots,
  setMarketStatus,
}: DesktopToyActionsArgs) {
  const activeLocalBallSlotCount = useCallback(() => {
    const now = Date.now();
    return (
      toysRef.current.filter((toy) => toy.kind === "ball" && toy.owner === "local").length +
      escapedBallSlotsRef.current.filter((slot) => slot.until > now).length
    );
  }, [escapedBallSlotsRef, toysRef]);

  const addBallToy = useCallback(
    (x: number, y: number) => {
      const activeLocalBallCount = activeLocalBallSlotCount();
      if (activeLocalBallCount >= Math.min(ballQty, MAX_TOY_BALLS)) {
        setMarketStatus({ text: "Ball limit reached.", error: true });
        return;
      }
      const now = Date.now();
      const nextToy: PetToyState = {
        id: `ball-${now}-${Math.round(Math.random() * 9999)}`,
        kind: "ball",
        color: seededBallColor(now + activeLocalBallCount),
        owner: "local",
        createdAt: now,
        lastPetHitAt: 0,
        lastMessAt: 0,
        vx: (Math.random() - 0.5) * 80,
        vy: -20 + Math.random() * 40,
        ...clampFloatingPosition({ x: x - BALL_SIZE / 2, y: y - BALL_SIZE / 2 }, bounds, BALL_SIZE, BALL_SIZE),
      };
      const nextToys = [...toysRef.current, nextToy].slice(-(MAX_TOY_BALLS * 3));
      toysRef.current = nextToys;
      setToys(nextToys);
      setMarketStatus({ text: "Ball dropped." });
    },
    [activeLocalBallSlotCount, ballQty, bounds, setMarketStatus, setToys, toysRef]
  );

  const moveToy = useCallback((id: string, next: { x: number; y: number }) => {
    const nextToys = toysRef.current.map((toy) =>
      toy.id === id ? { ...toy, ...next, vx: 0, vy: 0 } : toy
    );
    toysRef.current = nextToys;
    setToys(nextToys);
  }, [setToys, toysRef]);

  const flingToy = useCallback((id: string, velocity: { vx: number; vy: number }) => {
    const nextToys = toysRef.current.map((toy) =>
      toy.id === id
        ? {
            ...toy,
            vx: velocity.vx,
            vy: velocity.vy,
          }
        : toy
    );
    toysRef.current = nextToys;
    setToys(nextToys);
  }, [setToys, toysRef]);

  const requestToyWorldEscape = useCallback(
    async (edge: DesktopWorldEdge, toy: PetToyState) => {
      if (toyEscapeRequestIdsRef.current.has(toy.id)) return;
      toyEscapeRequestIdsRef.current.add(toy.id);
      try {
        const response = await api.post<DesktopWorldToyEscapeResponse>(
          "/api/desktop/world/toy-escape",
          {
            edge,
            toy: {
              kind: "ball",
              color: toy.color,
              sourceVisitorId: toy.worldVisitorId,
            },
          }
        );
        if (response.accepted) {
          if (toy.owner === "local") {
            const until = Date.now() + Math.max(response.awayMs, TOY_WORLD_SLOT_RESERVE_MS);
            const nextSlots = [
              ...escapedBallSlotsRef.current.filter((slot) => slot.until > Date.now() && slot.id !== toy.id),
              { id: toy.id, until },
            ].slice(-MAX_TOY_BALLS);
            escapedBallSlotsRef.current = nextSlots;
            setEscapedBallSlots(nextSlots);
          }
          const nextToys = toysRef.current.filter((entry) => entry.id !== toy.id);
          toysRef.current = nextToys;
          setToys(nextToys);
          setMarketStatus({ text: "Ball went through the tunnel." });
          return;
        }
        const nextToys = toysRef.current.map((entry) => {
          if (entry.id !== toy.id) return entry;
          const clamped = clampFloatingPosition(entry, bounds, BALL_SIZE, BALL_SIZE);
          return {
            ...entry,
            ...clamped,
            vx: -entry.vx * 0.62,
            vy: -entry.vy * 0.62,
          };
        });
        toysRef.current = nextToys;
        setToys(nextToys);
      } catch {
        const nextToys = toysRef.current.map((entry) =>
          entry.id === toy.id
            ? {
                ...entry,
                ...clampFloatingPosition(entry, bounds, BALL_SIZE, BALL_SIZE),
                vx: -entry.vx * 0.5,
                vy: -entry.vy * 0.5,
              }
            : entry
        );
        toysRef.current = nextToys;
        setToys(nextToys);
      } finally {
        window.setTimeout(() => {
          toyEscapeRequestIdsRef.current.delete(toy.id);
        }, 2200);
      }
    },
    [
      bounds,
      escapedBallSlotsRef,
      setEscapedBallSlots,
      setMarketStatus,
      setToys,
      toyEscapeRequestIdsRef,
      toysRef,
    ]
  );

  return {
    activeLocalBallSlotCount,
    addBallToy,
    flingToy,
    moveToy,
    requestToyWorldEscape,
  };
}
