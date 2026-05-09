import type { CasinoGameStub } from "../types";
import { RUG_PULL_GAME_KEY, RUG_PULL_RULES } from "./rules";

export const RUG_PULL_GAME_STUB: CasinoGameStub = {
  key: RUG_PULL_GAME_KEY,
  title: "Rug Pull: The Game",
  tagline: "Everyone sees the button. Everyone says don't press it. Someone always does.",
  summary:
    "A live multiplayer Tezos pressure game where players buy into a growing pot, earn time-based shares, and race to lock their payout when the public button gets pressed.",
  mode: "multi_player",
  status: "mocked_playable",
  tableKind: "live_multiplayer",
  wagerAsset: "XTZ",
  wageringEnabled: false,
  minPlayers: 1,
  maxPlayers: null,
  defaultHouseTakeBps: 2_000,
  requiredContracts: [
    "WtfCasinoMembership",
    "WtfRugPullGame",
    "WtfRugPullSettlementVerifier",
  ],
  highlights: [
    "Public button pressure loop",
    "Panic Mode share bleed",
    "Witness votes alter the detonation",
  ],
  subdomains: [
    "round scheduler",
    "share engine",
    "button lock guard",
    "witness voting",
    "settlement verifier",
  ],
  monitoringHandles: [
    "rug_pull.rules.viewed",
    "rug_pull.round.join_intent_created",
    "rug_pull.button.delay_intent_created",
    "rug_pull.button.press_intent_created",
    "rug_pull.witness.join_intent_created",
    "rug_pull.witness.vote_cast",
    "rug_pull.round.settled",
    "rug_pull.wager.rejected",
  ],
  rules: {
    version: RUG_PULL_RULES.version,
    entryFeeMutez: RUG_PULL_RULES.entryFeeMutez,
    entryPotMutez: RUG_PULL_RULES.entryPotMutez,
    entryPlatformMutez: RUG_PULL_RULES.entryPlatformMutez,
    pressFeeMutez: RUG_PULL_RULES.pressFeeMutez,
    pressNextPotMutez: RUG_PULL_RULES.pressNextPotMutez,
    pressPlatformMutez: RUG_PULL_RULES.pressPlatformMutez,
    witnessFeeMutez: RUG_PULL_RULES.witnessFeeMutez,
    witnessPotMutez: RUG_PULL_RULES.witnessPotMutez,
    witnessPlatformMutez: RUG_PULL_RULES.witnessPlatformMutez,
    joinButtonLockSeconds: RUG_PULL_RULES.joinButtonLockSeconds,
    delayLockSeconds: RUG_PULL_RULES.delayLockSeconds,
    maxButtonLockFromNowSeconds: RUG_PULL_RULES.maxButtonLockFromNowSeconds,
    panicSeconds: RUG_PULL_RULES.panicSeconds,
    delayCostMutezByUse: RUG_PULL_RULES.delayCostMutezByUse,
    joinOrderMultipliers: RUG_PULL_RULES.joinOrderMultipliers,
    pressureMultipliers: RUG_PULL_RULES.pressureMultipliers,
    witnessVoteOptions: RUG_PULL_RULES.witnessVoteOptions,
    contractEntrypointsNeeded: RUG_PULL_RULES.contractEntrypointsNeeded,
  },
};

export * from "./rules";
