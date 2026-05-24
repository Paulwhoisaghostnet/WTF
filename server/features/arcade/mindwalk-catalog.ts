/**
 * MindWalk catalog entry — static metadata for the MindWalk arcade game.
 *
 * The live catalog is DB-driven (consoleGames table + manifest.json).
 * This module provides the canonical static descriptor that can be:
 *   - Used as a seed/default for DB insertion scripts
 *   - Referenced by admin tools to detect / re-register the entry
 *   - Imported by tests that need a known arcade entry fixture
 */

export const MINDWALK_SLUG = "mindwalk" as const;
export const MINDWALK_CREATOR_USERNAME = "skllzrmy" as const;

export interface MindWalkCatalogEntry {
  readonly slug: typeof MINDWALK_SLUG;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly artifactUri: string;
  readonly kind: string;
  readonly creditsPerPlay: number;
  readonly creator: {
    readonly username: typeof MINDWALK_CREATOR_USERNAME;
    readonly tezosIdentity: string;
    readonly xHandle: string;
  };
  readonly arcadeCreditsRequired: boolean;
  readonly arcadeCreditPrice: number;
  readonly leaderboardEnabled: boolean;
  readonly isDemo: boolean;
}

export const MINDWALK_CATALOG_ENTRY: MindWalkCatalogEntry = {
  slug: MINDWALK_SLUG,
  title: "MindWalk",
  description:
    "AI-guided word-cloud exploration — follow concept trails powered by your own BYOK AI key. " +
    "Gemini, GPT, and Claude supported. All API calls stay client-side; keys in your browser only.",
  category: "puzzle",
  artifactUri: "/games/mindwalk/index.html",
  kind: "html5",
  creditsPerPlay: 1,
  creator: {
    username: MINDWALK_CREATOR_USERNAME,
    tezosIdentity: "skllzrmy",
    xHandle: "skllzrmy",
  },
  arcadeCreditsRequired: true,
  arcadeCreditPrice: 1,
  leaderboardEnabled: false,
  isDemo: true,
} as const;
