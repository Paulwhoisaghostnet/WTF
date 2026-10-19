import { DESKTOP_APP_LABELS } from "./types";

/** The requested contestant workspace, not a general role/app grant interface. */
export const GAMESHOW_TOOL_APP_KEYS = ["studio", "wtf-subdomains", "pasta-protocol"] as const;
export type GameshowToolAppKey = (typeof GAMESHOW_TOOL_APP_KEYS)[number];
export const GAMESHOW_TOOL_OPTIONS = GAMESHOW_TOOL_APP_KEYS.map((appKey) => ({ appKey, label: DESKTOP_APP_LABELS[appKey] }));

export interface GameshowProvisioningResult {
  seasonId: number;
  userId: number;
  roles: string[];
  grantedRole: boolean;
  grantedAppKeys: GameshowToolAppKey[];
  tools: Array<{ appKey: GameshowToolAppKey; sku: string; owned: boolean; globallyAvailable: boolean }>;
}
