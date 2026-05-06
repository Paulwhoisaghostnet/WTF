import { useCallback, useRef } from "react";
import type { BumperPoolItem } from "./types";

type UseTVBumperDeckArgs = {
  bumperPool: BumperPoolItem[] | null | undefined;
};

export function useTVBumperDeck({ bumperPool }: UseTVBumperDeckArgs) {
  const bumperDeckRef = useRef<BumperPoolItem[]>([]);
  const bumperDeckPoolIdRef = useRef("");
  const gateCategoryRef = useRef<"personal" | "community">("personal");

  const pickNextBumper = useCallback((): BumperPoolItem | null => {
    const pool = bumperPool || [];
    if (pool.length === 0) return null;
    const poolId = pool.map((b) => b.id).sort().join(",");
    if (
      poolId !== bumperDeckPoolIdRef.current ||
      bumperDeckRef.current.length === 0
    ) {
      const shuffled = [...pool];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
      }
      bumperDeckRef.current = shuffled;
      bumperDeckPoolIdRef.current = poolId;
    }
    return bumperDeckRef.current.shift()!;
  }, [bumperPool]);

  const pickGateBumper = useCallback((): BumperPoolItem | null => {
    const pool = bumperPool || [];
    if (pool.length === 0) return null;
    const target = gateCategoryRef.current;
    const matches = pool.filter((b) => b.category === target);
    const chosen =
      matches.length > 0
        ? matches[Math.floor(Math.random() * matches.length)]!
        : pool[Math.floor(Math.random() * pool.length)]!;
    gateCategoryRef.current =
      target === "personal" ? "community" : "personal";
    return chosen;
  }, [bumperPool]);

  return { pickNextBumper, pickGateBumper };
}
