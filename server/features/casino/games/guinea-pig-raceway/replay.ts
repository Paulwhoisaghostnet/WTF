import { GUINEA_PIG_RACEWAY_RULES } from "./rules";

type RacewayTrack = (typeof GUINEA_PIG_RACEWAY_RULES.tracks)[number];

export type RacewayReplayEffectEvent = {
  second: number;
  walletAddressHash: string;
  racerId: string;
  effectKey: string;
};

export type RacewayReplayManifestDraft = {
  raceId: string;
  trackKey: string;
  winnerRacerId: string;
  cameraAngles: string[];
  keyframeCount: number;
  effectTimeline: RacewayReplayEffectEvent[];
  settlementHash: string;
};

export function buildReplayCameraAngles(track: RacewayTrack): string[] {
  return Array.from(
    new Set([
      ...track.replayAngles,
      ...GUINEA_PIG_RACEWAY_RULES.replayCameraAngles,
    ])
  );
}

export function buildRacewayReplayManifestDraft(input: {
  raceId: string;
  track: RacewayTrack;
  winnerRacerId: string;
  settlementHash: string;
  effectTimeline?: RacewayReplayEffectEvent[];
}): RacewayReplayManifestDraft {
  const raceId = input.raceId.trim();
  const winnerRacerId = input.winnerRacerId.trim();
  const settlementHash = input.settlementHash.trim();
  if (!raceId) throw new RangeError("raceId is required");
  if (!winnerRacerId) throw new RangeError("winnerRacerId is required");
  if (!settlementHash) throw new RangeError("settlementHash is required");

  return {
    raceId,
    trackKey: input.track.key,
    winnerRacerId,
    cameraAngles: buildReplayCameraAngles(input.track),
    keyframeCount: GUINEA_PIG_RACEWAY_RULES.raceSeconds + 1,
    effectTimeline: [...(input.effectTimeline ?? [])].sort((a, b) => a.second - b.second),
    settlementHash,
  };
}

export function isReplayManifestComplete(manifest: RacewayReplayManifestDraft): boolean {
  const angles = new Set(manifest.cameraAngles);
  return (
    Boolean(manifest.raceId.trim()) &&
    Boolean(manifest.trackKey.trim()) &&
    Boolean(manifest.winnerRacerId.trim()) &&
    Boolean(manifest.settlementHash.trim()) &&
    manifest.keyframeCount >= GUINEA_PIG_RACEWAY_RULES.raceSeconds &&
    angles.has("finish_line") &&
    angles.has("winner_closeup") &&
    angles.size >= 4
  );
}
