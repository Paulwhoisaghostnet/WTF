import { useEffect, type Dispatch, type SetStateAction } from "react";
import { clampFloatingPosition } from "../geometry";
import {
  PET_H,
  PET_W,
} from "../DesktopPetModel";
import { randomHamsterTarget } from "../DesktopPetSimulation";
import {
  normalizePetDrops,
  type PetDrop,
} from "../drops";
import {
  normalizeEscapedBallSlots,
  normalizePetToys,
  type EscapedBallSlot,
  type PetToyState,
} from "../toys";
import { petStorageKey } from "./storage";

type MutableRef<T> = { current: T };

interface DesktopPetPersistenceArgs {
  enabled: boolean;
  userId: number | null;
  bounds: { width: number; height: number };
  position: { x: number; y: number };
  homePosition: { x: number; y: number };
  drops: PetDrop[];
  toys: PetToyState[];
  escapedBallSlots: EscapedBallSlot[];
  positionRef: MutableRef<{ x: number; y: number }>;
  homePositionRef: MutableRef<{ x: number; y: number }>;
  setPosition: Dispatch<SetStateAction<{ x: number; y: number }>>;
  setHomePosition: Dispatch<SetStateAction<{ x: number; y: number }>>;
  setDrops: Dispatch<SetStateAction<PetDrop[]>>;
  setToys: Dispatch<SetStateAction<PetToyState[]>>;
  setEscapedBallSlots: Dispatch<SetStateAction<EscapedBallSlot[]>>;
}

export function useDesktopPetPersistence({
  enabled,
  userId,
  bounds,
  position,
  homePosition,
  drops,
  toys,
  escapedBallSlots,
  positionRef,
  homePositionRef,
  setPosition,
  setHomePosition,
  setDrops,
  setToys,
  setEscapedBallSlots,
}: DesktopPetPersistenceArgs) {
  useEffect(() => {
    if (!enabled) return;
    try {
      const raw = window.localStorage.getItem(petStorageKey(userId));
      if (!raw) {
        const next = randomHamsterTarget(bounds);
        positionRef.current = next;
        homePositionRef.current = next;
        setPosition(next);
        setHomePosition(next);
        setDrops([]);
        setToys([]);
        setEscapedBallSlots([]);
        return;
      }
      const parsed = JSON.parse(raw) as {
        position?: { x: number; y: number };
        home?: { x: number; y: number };
        drops?: unknown;
        toys?: unknown;
        escapedBallSlots?: unknown;
      };
      const nextPosition = clampFloatingPosition(
        parsed.position ?? randomHamsterTarget(bounds),
        bounds,
        PET_W,
        PET_H + 22
      );
      const nextHome = clampFloatingPosition(
        parsed.home ?? nextPosition,
        bounds,
        PET_W,
        PET_H + 22
      );
      positionRef.current = nextPosition;
      homePositionRef.current = nextHome;
      setPosition(nextPosition);
      setHomePosition(nextHome);
      setDrops(normalizePetDrops(parsed.drops, bounds));
      setToys(normalizePetToys(parsed.toys, bounds));
      setEscapedBallSlots(normalizeEscapedBallSlots(parsed.escapedBallSlots));
    } catch {
      const next = randomHamsterTarget(bounds);
      positionRef.current = next;
      homePositionRef.current = next;
      setPosition(next);
      setHomePosition(next);
      setDrops([]);
      setToys([]);
      setEscapedBallSlots([]);
    }
  }, [
    bounds.height,
    bounds.width,
    enabled,
    homePositionRef,
    positionRef,
    setDrops,
    setEscapedBallSlots,
    setHomePosition,
    setPosition,
    setToys,
    userId,
  ]);

  useEffect(() => {
    if (!enabled) return;
    try {
      window.localStorage.setItem(
        petStorageKey(userId),
        JSON.stringify({ position, home: homePosition, drops, toys, escapedBallSlots })
      );
    } catch {
      // Desktop toys should never break the desktop if storage is unavailable.
    }
  }, [drops, enabled, escapedBallSlots, homePosition, position, toys, userId]);
}
