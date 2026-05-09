import type { CasinoGameStub } from "../types";
import {
  WTF_BUTTON_GAME_KEY,
  WTF_BUTTON_PUBLIC_TITLE,
  WTF_BUTTON_RULES,
  WTF_BUTTON_SHORT_NAME,
} from "./rules";

export const WTF_BUTTON_GAME_STUB: CasinoGameStub = {
  key: WTF_BUTTON_GAME_KEY,
  title: WTF_BUTTON_PUBLIC_TITLE,
  tagline: "Everyone sees the button. Everyone says don't press it. Someone always does.",
  summary:
    "A three-table Tezos jackpot race where players press Red, Green, or Blue to seize leadership, grow the pot, and survive final-minute Rug Clash pressure.",
  mode: "multi_player",
  status: "mocked_playable",
  tableKind: "live_multiplayer",
  wagerAsset: "XTZ",
  wageringEnabled: false,
  minPlayers: 1,
  maxPlayers: null,
  defaultHouseTakeBps: 1_500,
  requiredContracts: [
    "WtfCasinoMembership",
    "WtfButtonEscrow",
    "WtfButtonRandomnessVerifier",
    "WtfButtonSettlementLedger",
  ],
  highlights: [
    "Three live jackpot buttons",
    "Wallet-specific press quotes",
    "Rug Clash anti-snipe windows",
    "Mocked XTZ balances until escrow is ready",
  ],
  subdomains: [
    "button round engine",
    "price protection quotes",
    "mocked payment adapter",
    "Rug Clash resolver",
    "settlement/refund ledger",
    "trial simulation runner",
  ],
  monitoringHandles: [
    "wtf_button.lobby.viewed",
    "wtf_button.table.viewed",
    "wtf_button.quote.created",
    "wtf_button.press.succeeded",
    "wtf_button.press.rejected",
    "wtf_button.price_protection.rejected",
    "wtf_button.danger_zone.entered",
    "wtf_button.rug_clash.started",
    "wtf_button.rug_clash.entered",
    "wtf_button.rug_clash.resolved",
    "wtf_button.round.settled",
    "wtf_button.round.refunded",
    "wtf_button.simulation.run",
  ],
  rules: {
    ...WTF_BUTTON_RULES,
    shortDisplayName: WTF_BUTTON_SHORT_NAME,
  },
};

export * from "./rules";
export * from "./simulation";
