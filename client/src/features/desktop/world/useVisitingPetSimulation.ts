import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { VisitingPetState } from "../DesktopPetModel";

type MutableRef<T> = { current: T };

interface VisitingPetSimulationArgs {
  enabled: boolean;
  bounds: { width: number; height: number };
  visitingPetsRef: MutableRef<VisitingPetState[]>;
  setVisitingPets: Dispatch<SetStateAction<VisitingPetState[]>>;
}

export function useVisitingPetSimulation({
  enabled,
  bounds,
  visitingPetsRef,
  setVisitingPets,
}: VisitingPetSimulationArgs) {
  useEffect(() => {
    if (!enabled || bounds.width <= 1 || bounds.height <= 1) return;
    let raf = 0;
    let last = performance.now();
    let frame = 0;

    const tick = (nowPerf: number) => {
      const now = Date.now();
      const dt = Math.min(0.05, Math.max(0.012, (nowPerf - last) / 1000));
      last = nowPerf;
      let changed = false;
      const nextPets = visitingPetsRef.current
        .map((petVisitor) => {
          const target = petVisitor.path[petVisitor.pathIndex];
          if (!target || now - petVisitor.createdAt > petVisitor.ttlMs + 4_000) {
            changed = true;
            return null;
          }
          const dx = target.x - petVisitor.x;
          const dy = target.y - petVisitor.y;
          const remaining = Math.hypot(dx, dy);
          if (remaining < 3) {
            changed = true;
            return {
              ...petVisitor,
              x: target.x,
              y: target.y,
              pathIndex: petVisitor.pathIndex + 1,
            };
          }
          const step = Math.min(remaining, 58 * dt);
          changed = true;
          return {
            ...petVisitor,
            x: petVisitor.x + (dx / remaining) * step,
            y: petVisitor.y + (dy / remaining) * step,
            facing: dx < 0 ? "left" as const : "right" as const,
          };
        })
        .filter((petVisitor): petVisitor is VisitingPetState => Boolean(petVisitor))
        .filter((petVisitor) => petVisitor.pathIndex <= petVisitor.path.length);

      frame += 1;
      if (changed && frame % 2 === 0) {
        visitingPetsRef.current = nextPets;
        setVisitingPets(nextPets);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bounds.height, bounds.width, enabled, setVisitingPets, visitingPetsRef]);
}
