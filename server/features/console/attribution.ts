import { isArcadeSourceStorageMode } from "../arcade/source-constants";

export type ConsoleSourceAttributionInput = {
  storageMode?: string | null;
  sourceUrl?: string | null;
  creationSource?: string | null;
};

export type ConsoleSourceAttribution = {
  sourceUrl: string | null;
  sourceLabel: string | null;
  licenseName: string | null;
};

export function getConsoleSourceAttribution(
  input: ConsoleSourceAttributionInput
): ConsoleSourceAttribution {
  if (isArcadeSourceStorageMode(input.storageMode)) {
    return {
      sourceUrl: input.sourceUrl ?? null,
      sourceLabel: "Built on hack.tez",
      licenseName: "MIT",
    };
  }

  if (input.creationSource === "game_studio_project") {
    return {
      sourceUrl: input.sourceUrl ?? null,
      sourceLabel: "Built with WTF Game Studio",
      licenseName: null,
    };
  }

  if (input.sourceUrl) {
    return {
      sourceUrl: input.sourceUrl,
      sourceLabel: "Creator source",
      licenseName: null,
    };
  }

  return {
    sourceUrl: null,
    sourceLabel: null,
    licenseName: null,
  };
}
