export type CasinoGameStub = {
  key: string;
  title: string;
  tagline: string;
  summary: string;
  mode: "single_player" | "multi_player";
  status: "planned" | "mocked_playable";
  tableKind: "live_multiplayer" | "single_table";
  wagerAsset: "XTZ" | "WTF";
  wageringEnabled: false;
  minPlayers: number;
  maxPlayers: number | null;
  defaultHouseTakeBps: number;
  requiredContracts: string[];
  monitoringHandles: string[];
  highlights?: string[];
  subdomains?: string[];
  rules: Record<string, unknown>;
};
