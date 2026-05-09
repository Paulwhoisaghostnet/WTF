import { GUINEA_PIG_RACEWAY_GAME_STUB } from "./guinea-pig-raceway";
import { RUG_PULL_GAME_STUB } from "./rug-pull";
import type { CasinoGameStub } from "./types";
import { WTF_BUTTON_GAME_STUB } from "./wtf-button";

export const CASINO_GAME_REGISTRY: CasinoGameStub[] = [
  WTF_BUTTON_GAME_STUB,
  RUG_PULL_GAME_STUB,
  GUINEA_PIG_RACEWAY_GAME_STUB,
];

export function getCasinoGameByKey(key: string): CasinoGameStub | null {
  return CASINO_GAME_REGISTRY.find((game) => game.key === key) ?? null;
}

export type { CasinoGameStub } from "./types";
