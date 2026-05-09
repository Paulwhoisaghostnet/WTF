import type { ConsoleTokenProvenance } from "@shared/console-provenance";

export type ConsoleAuthUser = {
  id: number;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  role?: string | null;
};

export type ConsoleCartridgeKind =
  | "html5"
  | "dos-game"
  | "dos-installer"
  | "vite-project"
  | "rom";

export type ConsoleCartridge = {
  id: string;
  slug: string;
  title: string;
  description: string;
  mimeType: string;
  thumbnailUri: string | null;
  artifactUri: string;
  tokenContract: string;
  tokenId: string;
  isDemo: boolean;
  isPublished?: boolean;
  kind?: ConsoleCartridgeKind;
  category?: string;
  builderName?: string | null;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
  licenseName?: string | null;
  provenance?: ConsoleTokenProvenance | null;
  status?: string;
  playCount?: number;
  playerCount?: number;
  leaderboardEnabled?: boolean;
  maxPossibleScore?: number | null;
  maxScorePerSecond?: number | null;
};

export type ConsoleLeaderboardEntry = {
  rank: number;
  userId: number;
  username: string;
  displayName: string | null;
  score: number;
  submittedAt: string | null;
};

export type ConsoleRecentScoreEntry = {
  id: number;
  slug: string;
  title: string;
  gameSlug: string;
  gameTitle: string;
  category: string;
  userId: number;
  username: string;
  displayName: string | null;
  score: number;
  submittedAt: string;
};

export type ConsolePlayerLeaderboardEntry = {
  rank: number;
  userId: number;
  username: string;
  displayName: string | null;
  gamesPlayed: number;
  totalPlays: number;
  totalScore: number;
  bestScore: number;
  firstPlaceCount: number;
  consoleXp: number;
  lastPlayedAt: string | null;
};

export type ConsoleDiscoveryShelfItem = {
  id: number;
  slug: string;
  title: string;
  description: string;
  category: string;
  coverUri: string | null;
  builderName: string | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  licenseName: string | null;
  playCount: number;
  playerCount: number;
  updatedAt: string;
};

export type ConsoleDiscoveryShelves = {
  popular: ConsoleDiscoveryShelfItem[];
  newest: ConsoleDiscoveryShelfItem[];
  sourceArcade: ConsoleDiscoveryShelfItem[];
  creator: ConsoleDiscoveryShelfItem[];
  studio: ConsoleDiscoveryShelfItem[];
};

export type ConsolePublishedGame = {
  id: number;
  slug: string;
  title: string;
  description: string;
  category: string;
  embedPath: string;
  coverUri: string | null;
  builderName: string | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  licenseName: string | null;
  provenance?: ConsoleTokenProvenance | null;
  status: string;
  active: boolean;
  playCount: number;
  playerCount: number;
  maxPossibleScore: number | null;
  maxScorePerSecond: number | null;
};
