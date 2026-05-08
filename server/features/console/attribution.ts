import { isArcadeSourceStorageMode } from "../arcade/source-constants";

export type ConsoleSourceAttributionInput = {
  storageMode?: string | null;
  sourceUrl?: string | null;
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
