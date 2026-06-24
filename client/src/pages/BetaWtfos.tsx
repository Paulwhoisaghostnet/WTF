import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import styled from "styled-components";
import { Activity, ArrowRight, Bell, Compass, ExternalLink, Search, ShieldCheck, Users } from "lucide-react";
import type { LeaderboardEntry, RewardWtfLeaderboardEntry, XpRewardLeaderboardEntry } from "@shared/types";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import {
  BETA_AGENT_RUNS,
  BETA_AGENT_RETEST_SNAPSHOTS,
  BETA_PERSISTENT_AGENTS,
  BETA_PROD_SCAN,
  BETA_PUPPET_MEMORY_LEDGER,
  BETA_ROUTE_BRIDGES,
  BETA_VISIBILITY_SIGNALS,
  betaAgentRetestSummary,
  betaVisibilityScore,
  type BetaVisibilityStatus,
} from "../features/beta/beta-agent-loop";
import {
  BETA_NOW_SIGNAL_SOURCES,
  betaSessionNowSignalSources,
  findBetaPublicProofSource,
  findBetaNowSignalSource,
  type BetaNowSignalKey,
  type BetaNowSignalSource,
  type BetaPublicProofSource,
} from "../features/beta/beta-now-signals";
import {
  BETA_DISCOVERY_TRAILS,
  BETA_TRAIL_STATE_COPY,
  type BetaDiscoveryTrail,
} from "../features/beta/beta-discovery-trails";
import {
  BETA_COMMUNICATION_MAP,
  BETA_PEOPLE_DISCOVERY_BOARD,
  BETA_PEOPLE_PROOF_GAPS,
  type BetaPeopleDiscoveryCard,
  type BetaPeopleProofStatus,
} from "../features/beta/beta-social-map";
import {
  appsForPersona,
  BETA_APP_CATALOG,
  BETA_ATTENTION_QUEUE,
  BETA_COUNT_ADMIN_PUPPET,
  BETA_COUNT_ADMIN_SUMMARY_SOURCES,
  BETA_COUNT_ADMIN_STORIES,
  BETA_COUNT_ADMIN_WORKBENCH,
  BETA_COUNT_LIVEOPS_COMMANDS,
  BETA_COUNT_LIVEOPS_RECIPES,
  BETA_DAILY_RETURN_LOOPS,
  BETA_DESKTOP_MODEL_REVIEW,
  BETA_FRICTION_QUEUE,
  BETA_NOTIFICATION_CONTROL_GUIDE,
  BETA_NOTIFICATION_EVENTS,
  BETA_NOTIFICATION_GROUPS,
  BETA_PERSONAS,
  BETA_PERSONA_COMMAND_CENTER,
  BETA_RELATIONSHIP_NAVIGATOR,
  BETA_ROUTE_GROUP_GUIDE,
  BETA_RECOMMENDED_MODEL,
  BETA_SECTION_COMPASS,
  BETA_STAGE_LABELS,
  BETA_TIER_LABELS,
  BETA_UNLOCK_GOVERNANCE_MATRIX,
  BETA_UNLOCK_LADDER,
  BETA_UNLOCK_PASSPORTS,
  BETA_UNLOCK_QUESTLINES,
  BETA_WAYFINDER_ACTIONS,
  BETA_XP_LEVELS,
  type BetaAppCatalogEntry,
  type BetaAttentionCadence,
  type BetaCountAdminSummaryKey,
  type BetaCountAdminSummarySource,
  type BetaPersonaKey,
  type BetaRelationshipActorKey,
  type BetaRouteGroupGuide,
  type BetaSectionCompassAccess,
  type BetaSectionCompassItem,
  type BetaFrictionQueueStatus,
  type BetaStage,
  type BetaTier,
  type BetaWayfinderAction,
} from "../features/beta/beta-app-catalog";

type MarketplaceListing = {
  id?: number | string;
  tokenName?: string | null;
  title?: string | null;
  name?: string | null;
  sellerUsername?: string | null;
  sellerDisplayName?: string | null;
  priceWtf?: number | string | null;
  priceMutez?: string | number | null;
};

type BetaTradeBoardItem = {
  ownerWallet?: string | null;
  ownerUsername?: string | null;
  ownerDisplayName?: string | null;
  tokenContract?: string | null;
  tokenId?: string | number | null;
  tokenName?: string | null;
  collectionName?: string | null;
  creatorName?: string | null;
  tradeBoardQuantity?: number | string | null;
  tokenAmount?: string | number | null;
};

type BetaProfileActivity = {
  id?: number;
  amount?: number;
  reason?: string | null;
  createdAt?: string | null;
};

type BetaGameShelfItem = {
  id?: number;
  slug?: string;
  title?: string;
  description?: string;
  builderName?: string | null;
  playCount?: number;
  playerCount?: number;
};

type BetaGameDiscoveryResponse = {
  popular?: BetaGameShelfItem[];
  newest?: BetaGameShelfItem[];
  sourceArcade?: BetaGameShelfItem[];
  creator?: BetaGameShelfItem[];
  studio?: BetaGameShelfItem[];
};

type BetaRecentScoreResponse = {
  scores?: Array<{
    id?: number;
    username?: string;
    displayName?: string | null;
    gameTitle?: string;
    title?: string;
    score?: number;
  }>;
};

type BetaNotificationResponse = {
  unreadCount?: number;
  items?: Array<{ id?: number; title?: string; body?: string; createdAt?: string }>;
};

type BetaWtfLiveRoomResponse = {
  room?: {
    id?: string;
    title?: string;
    description?: string | null;
    presence?: {
      active?: boolean;
      participantCount?: number;
      audioOpenCount?: number;
      videoShareCount?: number;
      cameraShareCount?: number;
      screenShareCount?: number;
    };
  };
  roomPath?: string;
};

type BetaCalendarEvent = {
  id?: string | number;
  title?: string;
  startsAt?: string;
  location?: string | null;
  sourceProvider?: string;
  categories?: string[];
};

type BetaTvChannel = {
  id?: number;
  slug?: string;
  title?: string;
  description?: string | null;
  dialNumber?: number | null;
  ownerUsername?: string | null;
  ownerDisplayName?: string | null;
};

type BetaSignalState = "Loading" | "Live" | "Quiet" | "Unavailable" | "Protected";
type BetaAdminSummaryState = "Locked" | "Loading" | "Live" | "Unavailable";

type BetaRenderedNowSignal = {
  source: BetaNowSignalSource;
  state: BetaSignalState;
  value: string;
  detail: string;
  route?: string;
};

type BetaPublicProofCard = {
  source: BetaPublicProofSource;
  state: BetaSignalState;
  value: string;
  detail: string;
};

type BetaPeopleDiscoveryRendered = {
  source: BetaPeopleDiscoveryCard;
  signals: BetaRenderedNowSignal[];
  state: BetaSignalState;
  value: string;
  detail: string;
};

type BetaAdminStatsResponse = Partial<Record<
  "users" | "seasons" | "rounds" | "challenges" | "sideQuests" | "listings" | "threads" | "links" | "faq" | "rewardLedger",
  number
>>;

type BetaAdminRoleAccessResponse = {
  roles?: unknown[];
  surfaces?: unknown[];
  matrix?: unknown;
};

type BetaAdminMarketResponse = {
  items?: unknown[];
  sales?: unknown[];
  pricing?: {
    activeSales?: unknown[];
  } | null;
};

type BetaAdminAutomationResponse = {
  challenges?: unknown[];
};

type BetaAdminSummaryCard = {
  source: BetaCountAdminSummarySource;
  state: BetaAdminSummaryState;
  value: string;
  detail: string;
};

const answers = [
  ["What is WTFOS?", "A Tezos-native social operating system for collecting, creating, publishing, playing, earning, and coordinating with the WTF community."],
  ["What can I do here?", "Find people and art, complete side quests, earn EXP, unlock role-ready paths, join live rooms, make work, and return to what changed."],
  ["What should I do first?", "Browse public discovery, or sign in and start with Side Quests plus Mission Control."],
  ["What should I do next?", "Pick a puppet path. Each path opens an existing app, quest, challenge, or related tool."],
  ["Why return tomorrow?", "EXP progress, side quests, notifications, live rooms, creator updates, market motion, challenges, and digest cards."],
];

export function BetaWtfos() {
  const [, navigate] = useLocation();
  const { user, isAdmin } = useAuth();
  const [personaKey, setPersonaKey] = useState<BetaPersonaKey>("new-tezos-user");
  const [query, setQuery] = useState("");
  const [atlasTier, setAtlasTier] = useState<BetaTier | "all">("all");
  const [atlasStage, setAtlasStage] = useState<BetaStage | "all">("all");
  const [atlasPersona, setAtlasPersona] = useState<BetaPersonaKey | "all">("all");
  const persona = BETA_PERSONAS.find((item) => item.key === personaKey) ?? BETA_PERSONAS[0];
  const personaApps = appsForPersona(personaKey).slice(0, 5);
  const selectedAgent = BETA_PERSISTENT_AGENTS.find((agent) => agent.persona === personaKey) ?? BETA_PERSISTENT_AGENTS[0];
  const selectedRun = BETA_AGENT_RUNS.find((run) => run.agent === selectedAgent.key) ?? BETA_AGENT_RUNS[0];
  const selectedJourneyCommand = BETA_PERSONA_COMMAND_CENTER.find((command) => command.key === personaKey) ?? BETA_PERSONA_COMMAND_CENTER[0];
  const visibilityScore = betaVisibilityScore();
  const retestSummary = betaAgentRetestSummary();
  const queryOptions = { staleTime: 90_000, retry: 1, refetchOnWindowFocus: false };
  const holderQuery = useQuery({
    queryKey: ["beta", "now", "wtf-holders"],
    queryFn: () => betaReadOnlyGet<LeaderboardEntry[]>(findBetaNowSignalSource("wtf-holders").endpoint),
    ...queryOptions,
  });
  const xpQuery = useQuery({
    queryKey: ["beta", "now", "xp-leaders"],
    queryFn: () => betaReadOnlyGet<XpRewardLeaderboardEntry[]>(findBetaNowSignalSource("xp-leaders").endpoint),
    ...queryOptions,
  });
  const rewardQuery = useQuery({
    queryKey: ["beta", "now", "reward-earners"],
    queryFn: () => betaReadOnlyGet<RewardWtfLeaderboardEntry[]>(findBetaNowSignalSource("reward-earners").endpoint),
    ...queryOptions,
  });
  const profileSignalUsername =
    xpQuery.data?.[0]?.username || rewardQuery.data?.[0]?.username || holderQuery.data?.[0]?.username || "wtf-admin";
  const profileSignalReady = Boolean(holderQuery.data || xpQuery.data || rewardQuery.data || holderQuery.isError || xpQuery.isError || rewardQuery.isError);
  const marketplaceQuery = useQuery({
    queryKey: ["beta", "now", "market-listings"],
    queryFn: () => betaReadOnlyGet<unknown>(endpointForNowSignal("market-listings")),
    ...queryOptions,
  });
  const marketTradeBoardQuery = useQuery({
    queryKey: ["beta", "now", "market-trade-board"],
    queryFn: () => betaReadOnlyGet<unknown>(endpointForNowSignal("market-trade-board")),
    ...queryOptions,
  });
  const profileActivityQuery = useQuery({
    queryKey: ["beta", "now", "profile-activity", profileSignalUsername],
    queryFn: () => betaReadOnlyGet<BetaProfileActivity[]>(endpointForNowSignal("profile-activity", { username: profileSignalUsername })),
    enabled: profileSignalReady,
    ...queryOptions,
  });
  const liveRoomQuery = useQuery({
    queryKey: ["beta", "now", "live-room"],
    queryFn: () => betaReadOnlyGet<BetaWtfLiveRoomResponse>(endpointForNowSignal("live-room")),
    ...queryOptions,
  });
  const calendarQuery = useQuery({
    queryKey: ["beta", "now", "calendar-events"],
    queryFn: () => betaReadOnlyGet<BetaCalendarEvent[]>(endpointForNowSignal("calendar-events")),
    ...queryOptions,
  });
  const tvChannelsQuery = useQuery({
    queryKey: ["beta", "now", "tv-channels"],
    queryFn: () => betaReadOnlyGet<unknown>(endpointForNowSignal("tv-channels")),
    ...queryOptions,
  });
  const arcadeDiscoveryQuery = useQuery({
    queryKey: ["beta", "now", "arcade-discovery"],
    queryFn: () => betaReadOnlyGet<BetaGameDiscoveryResponse>(findBetaNowSignalSource("arcade-discovery").endpoint),
    ...queryOptions,
  });
  const arcadeRecentQuery = useQuery({
    queryKey: ["beta", "now", "arcade-recent"],
    queryFn: () => betaReadOnlyGet<BetaRecentScoreResponse>(findBetaNowSignalSource("arcade-recent").endpoint),
    ...queryOptions,
  });
  const consoleDiscoveryQuery = useQuery({
    queryKey: ["beta", "now", "console-discovery"],
    queryFn: () => betaReadOnlyGet<BetaGameDiscoveryResponse>(findBetaNowSignalSource("console-discovery").endpoint),
    ...queryOptions,
  });
  const notificationsQuery = useQuery({
    queryKey: ["beta", "now", "notifications"],
    queryFn: () => api.get<BetaNotificationResponse>(findBetaNowSignalSource("notifications").endpoint),
    enabled: Boolean(user),
    ...queryOptions,
  });
  const adminStatsQuery = useQuery({
    queryKey: ["beta", "count-admin-summary", "quest-challenge-load"],
    queryFn: () => api.get<BetaAdminStatsResponse>(countAdminSummarySource("quest-challenge-load").endpoint),
    enabled: isAdmin,
    ...queryOptions,
  });
  const adminUsersQuery = useQuery({
    queryKey: ["beta", "count-admin-summary", "user-needs"],
    queryFn: () => api.get<unknown[]>(countAdminSummarySource("user-needs").endpoint),
    enabled: isAdmin,
    ...queryOptions,
  });
  const adminRoleAccessQuery = useQuery({
    queryKey: ["beta", "count-admin-summary", "role-gates"],
    queryFn: () => api.get<BetaAdminRoleAccessResponse>(countAdminSummarySource("role-gates").endpoint),
    enabled: isAdmin,
    ...queryOptions,
  });
  const adminRewardsQuery = useQuery({
    queryKey: ["beta", "count-admin-summary", "reward-settlement"],
    queryFn: () => api.get<unknown[]>(countAdminSummarySource("reward-settlement").endpoint),
    enabled: isAdmin,
    ...queryOptions,
  });
  const adminMarketQuery = useQuery({
    queryKey: ["beta", "count-admin-summary", "market-operations"],
    queryFn: () => api.get<BetaAdminMarketResponse>(countAdminSummarySource("market-operations").endpoint),
    enabled: isAdmin,
    ...queryOptions,
  });
  const adminAutomationQuery = useQuery({
    queryKey: ["beta", "count-admin-summary", "automation-definitions"],
    queryFn: () => api.get<BetaAdminAutomationResponse>(countAdminSummarySource("automation-definitions").endpoint),
    enabled: isAdmin,
    ...queryOptions,
  });
  const holder = holderQuery.data?.[0];
  const xpLeader = xpQuery.data?.[0];
  const rewardLeader = rewardQuery.data?.[0];
  const profileSignalName = xpLeader ? displayUserName(xpLeader) : rewardLeader ? displayUserName(rewardLeader) : holder ? displayLeaderboardName(holder) : "WTF Admin";
  const marketListings = collectionFromUnknown<MarketplaceListing>(marketplaceQuery.data, ["listings", "items", "tokens", "offers"]);
  const tradeBoardItems = collectionFromUnknown<BetaTradeBoardItem>(marketTradeBoardQuery.data, ["items", "tokens"]);
  const profileActivity = profileActivityQuery.data?.[0];
  const liveRoom = liveRoomQuery.data?.room;
  const nextCalendarEvent = calendarQuery.data?.[0];
  const tvChannels = collectionFromUnknown<BetaTvChannel>(tvChannelsQuery.data, ["channels", "items"]);
  const arcadePopular = firstShelfItem(arcadeDiscoveryQuery.data);
  const arcadeRecent = arcadeRecentQuery.data?.scores?.[0];
  const consolePopular = firstShelfItem(consoleDiscoveryQuery.data);
  const freshTradeObject = tradeBoardItems[0];
  const freshListing = marketListings[0];
  const hasFreshObject = Boolean(freshTradeObject || freshListing);
  const hasPlayableProject = Boolean(arcadePopular || arcadeRecent);
  const nowSignals: BetaRenderedNowSignal[] = [
    {
      source: findBetaNowSignalSource("wtf-holders"),
      state: signalState(holderQuery.isLoading, holderQuery.isError, Boolean(holder)),
      value: holder ? displayLeaderboardName(holder) : "No holder rows yet",
      detail: holder ? `${holder.balanceFormatted} WTF, ${holder.transfersCount} transfers` : "Leaderboard route is reachable; beta will fill this when public rows return.",
    },
    {
      source: findBetaNowSignalSource("xp-leaders"),
      state: signalState(xpQuery.isLoading, xpQuery.isError, Boolean(xpLeader)),
      value: xpLeader ? displayUserName(xpLeader) : "No EXP rows yet",
      detail: xpLeader ? `${compactNumber(xpLeader.experiencePoints)} EXP, ${xpLeader.xpTierLabel}` : "EXP is still framed as a public progression loop.",
    },
    {
      source: findBetaNowSignalSource("reward-earners"),
      state: signalState(rewardQuery.isLoading, rewardQuery.isError, Boolean(rewardLeader)),
      value: rewardLeader ? displayUserName(rewardLeader) : "No reward rows yet",
      detail: rewardLeader ? `${compactNumber(rewardLeader.totalEarnedWtf)} WTF earned, ${compactNumber(rewardLeader.marketSpentWtf)} spent in market` : "Rewards connect quests, challenges, and market sinks.",
    },
    {
      source: findBetaNowSignalSource("market-listings"),
      state: signalState(marketplaceQuery.isLoading, marketplaceQuery.isError, marketListings.length > 0),
      value: marketListings[0] ? displayListingName(marketListings[0]) : "No public listings yet",
      detail: marketListings.length > 0 ? `${marketListings.length} listing signal${marketListings.length === 1 ? "" : "s"} returned from Marketplace` : "Collector motion stays visible even when the market is quiet.",
    },
    {
      source: findBetaNowSignalSource("market-trade-board"),
      state: signalState(marketTradeBoardQuery.isLoading, marketTradeBoardQuery.isError, tradeBoardItems.length > 0),
      value: tradeBoardItems[0] ? displayTradeBoardItem(tradeBoardItems[0]) : "No public trade-board objects yet",
      detail: tradeBoardItems.length > 0 ? `${tradeBoardItems.length} collector object signal${tradeBoardItems.length === 1 ? "" : "s"}; first owner ${displayTradeBoardOwner(tradeBoardItems[0])}` : "The trade-board bridge stays visible even when on-chain market config is quiet.",
    },
    {
      source: findBetaNowSignalSource("profile-activity"),
      state: signalState(!profileSignalReady || profileActivityQuery.isLoading, profileActivityQuery.isError, Boolean(profileActivity)),
      route: `/user/${encodeURIComponent(profileSignalUsername)}`,
      value: profileActivity ? `${profileSignalName}: ${displayActivityReason(profileActivity.reason)}` : `${profileSignalName} has no public activity rows yet`,
      detail: profileActivity ? `${compactNumber(profileActivity.amount ?? 0)} EXP · ${displayEventDate(profileActivity.createdAt)}` : "Profile activity proves people are progressing without calling the profile-view endpoint.",
    },
    {
      source: findBetaNowSignalSource("live-room"),
      state: signalState(liveRoomQuery.isLoading, liveRoomQuery.isError, Boolean(liveRoom)),
      value: liveRoom?.title ?? "No public room envelope yet",
      detail: liveRoom ? displayLiveRoomPresence(liveRoom.presence) : "The official public room will appear here when WTF LIVE returns it.",
    },
    {
      source: findBetaNowSignalSource("calendar-events"),
      state: signalState(calendarQuery.isLoading, calendarQuery.isError, Boolean(nextCalendarEvent)),
      value: nextCalendarEvent?.title ?? "No public events soon",
      detail: nextCalendarEvent ? displayCalendarEvent(nextCalendarEvent) : "Calendar stays ready as the return-tomorrow surface.",
    },
    {
      source: findBetaNowSignalSource("tv-channels"),
      state: signalState(tvChannelsQuery.isLoading, tvChannelsQuery.isError, tvChannels.length > 0),
      value: tvChannels[0]?.title ?? "No public channels yet",
      detail: tvChannels.length > 0 ? `${tvChannels.length} public channel signal${tvChannels.length === 1 ? "" : "s"}; first owner ${displayChannelOwner(tvChannels[0])}` : "TV channels remain part of creator/media discovery.",
    },
    {
      source: findBetaNowSignalSource("arcade-discovery"),
      state: signalState(arcadeDiscoveryQuery.isLoading, arcadeDiscoveryQuery.isError, Boolean(arcadePopular)),
      value: arcadePopular?.title ?? "No arcade shelf yet",
      detail: arcadePopular ? `${compactNumber(arcadePopular.playCount ?? 0)} plays, ${compactNumber(arcadePopular.playerCount ?? 0)} players` : "Play surfaces remain discoverable from public beta.",
    },
    {
      source: findBetaNowSignalSource("arcade-recent"),
      state: signalState(arcadeRecentQuery.isLoading, arcadeRecentQuery.isError, Boolean(arcadeRecent)),
      value: arcadeRecent ? `${arcadeRecent.displayName || arcadeRecent.username || "A player"} scored ${compactNumber(arcadeRecent.score ?? 0)}` : "No recent scores yet",
      detail: arcadeRecent ? arcadeRecent.gameTitle || arcadeRecent.title || "Recent arcade play" : "Recent play is the daily proof that the arcade is inhabited.",
    },
    {
      source: findBetaNowSignalSource("console-discovery"),
      state: signalState(consoleDiscoveryQuery.isLoading, consoleDiscoveryQuery.isError, Boolean(consolePopular)),
      value: consolePopular?.title ?? "No console shelf yet",
      detail: consolePopular ? `${consolePopular.builderName || "Builder"} shipped or surfaced this project` : "Builder output routes into Console, Arcade, and Game Studio.",
    },
  ];
  const protectedSignals: BetaRenderedNowSignal[] = betaSessionNowSignalSources().map((source) => ({
    source,
    value:
      source.key === "notifications" && user
        ? `${notificationsQuery.data?.unreadCount ?? 0} unread notification${(notificationsQuery.data?.unreadCount ?? 0) === 1 ? "" : "s"}`
        : "Sign in to unlock this signal",
    detail:
      source.key === "notifications" && user && notificationsQuery.data?.items?.[0]?.title
        ? notificationsQuery.data.items[0].title
        : source.betaUse,
    state: source.key === "notifications" && user ? signalState(notificationsQuery.isLoading, notificationsQuery.isError, Boolean(notificationsQuery.data)) : "Protected",
  }));
  const publicProofCards: BetaPublicProofCard[] = [
    {
      source: findBetaPublicProofSource("fresh-object"),
      state: signalState(
        !hasFreshObject && (marketTradeBoardQuery.isLoading || marketplaceQuery.isLoading),
        !hasFreshObject && marketTradeBoardQuery.isError && marketplaceQuery.isError,
        hasFreshObject,
      ),
      value: freshTradeObject ? displayTradeBoardItem(freshTradeObject) : freshListing ? displayListingName(freshListing) : "No fresh public object yet",
      detail: freshTradeObject
        ? `${displayTradeBoardOwner(freshTradeObject)} made this visible through Trade Boards; Gallery is the safe inspection step.`
        : freshListing
          ? `${displayListingName(freshListing)} appears in Marketplace; Gallery and Hoard explain collector context.`
          : "Fresh object proof will appear from public trade-board or marketplace rows when existing data returns.",
    },
    {
      source: findBetaPublicProofSource("creator-channel"),
      state: signalState(tvChannelsQuery.isLoading, tvChannelsQuery.isError, tvChannels.length > 0),
      value: tvChannels[0]?.title ?? "No creator channel yet",
      detail: tvChannels[0]
        ? `${displayChannelOwner(tvChannels[0])} has a public TV channel that can lead into viewing, following, or creator discovery.`
        : "Creator channel proof appears here when WTF TV returns a public channel.",
    },
    {
      source: findBetaPublicProofSource("playable-project"),
      state: signalState(
        !hasPlayableProject && (arcadeDiscoveryQuery.isLoading || arcadeRecentQuery.isLoading),
        !hasPlayableProject && arcadeDiscoveryQuery.isError && arcadeRecentQuery.isError,
        hasPlayableProject,
      ),
      value: arcadePopular?.title ?? arcadeRecent?.gameTitle ?? arcadeRecent?.title ?? "No playable project shelf yet",
      detail: arcadePopular
        ? `${compactNumber(arcadePopular.playCount ?? 0)} plays and ${compactNumber(arcadePopular.playerCount ?? 0)} players make Arcade the next step.`
        : arcadeRecent
          ? `${arcadeRecent.displayName || arcadeRecent.username || "A player"} posted ${compactNumber(arcadeRecent.score ?? 0)} on ${arcadeRecent.gameTitle || arcadeRecent.title || "a game"}.`
          : "Arcade discovery and recent score proof stay ready for the first public play signal.",
    },
    {
      source: findBetaPublicProofSource("builder-output"),
      state: signalState(consoleDiscoveryQuery.isLoading, consoleDiscoveryQuery.isError, Boolean(consolePopular)),
      value: consolePopular?.title ?? "No builder project shelf yet",
      detail: consolePopular
        ? `${consolePopular.builderName || "A builder"} shipped or surfaced this project; Console is the next inspection route.`
        : "Console discovery is available as the project shelf, even when no builder rows are currently returned.",
    },
  ];
  const signalByKey = new Map<BetaNowSignalKey, BetaRenderedNowSignal>();
  for (const signal of nowSignals) signalByKey.set(signal.source.key, signal);
  for (const signal of protectedSignals) signalByKey.set(signal.source.key, signal);
  const peopleDiscoveryCards: BetaPeopleDiscoveryRendered[] = BETA_PEOPLE_DISCOVERY_BOARD.map((card) => {
    const signals = card.sourceKeys.map((sourceKey) => signalByKey.get(sourceKey)).filter((signal): signal is BetaRenderedNowSignal => Boolean(signal));
    const primarySignal = signals.find((signal) => signal.state === "Live") ?? signals.find((signal) => signal.state === "Protected") ?? signals[0];
    return {
      source: card,
      signals,
      state: peopleDiscoveryState(signals),
      value: primarySignal?.state === "Live" ? primarySignal.value : `${signals.length} proof signal${signals.length === 1 ? "" : "s"} mapped`,
      detail: primarySignal?.state === "Live" ? primarySignal.detail : card.visibleProof,
    };
  });
  const trailSignalsByKey = new Map(
    BETA_DISCOVERY_TRAILS.map((trail) => {
      const sourceKeys = [...new Set(trail.steps.flatMap((step) => (step.sourceKey ? [step.sourceKey] : [])))];
      return [
        trail.key,
        sourceKeys.map((sourceKey) => signalByKey.get(sourceKey)).filter((signal): signal is BetaRenderedNowSignal => Boolean(signal)),
      ] as const;
    }),
  );
  const notificationEventsByGroup = new Map(
    BETA_NOTIFICATION_GROUPS.map((group) => [
      group.key,
      BETA_NOTIFICATION_EVENTS.filter((event) => event.groupKey === group.key),
    ] as const),
  );
  const notificationGroupByKey = new Map(BETA_NOTIFICATION_GROUPS.map((group) => [group.key, group] as const));
  const adminSummaryCards: BetaAdminSummaryCard[] = [
    {
      source: countAdminSummarySource("user-needs"),
      state: adminSummaryState(isAdmin, adminUsersQuery.isLoading, adminUsersQuery.isError),
      value: adminSummaryValue(
        adminSummaryState(isAdmin, adminUsersQuery.isLoading, adminUsersQuery.isError),
        compactNumber(adminUsersCount(adminUsersQuery.data, adminStatsQuery.data)),
      ),
      detail: adminSummaryDetail(
        countAdminSummarySource("user-needs"),
        adminSummaryState(isAdmin, adminUsersQuery.isLoading, adminUsersQuery.isError),
        `${compactNumber(adminUsersCount(adminUsersQuery.data, adminStatsQuery.data))} user context row${adminUsersCount(adminUsersQuery.data, adminStatsQuery.data) === 1 ? "" : "s"} available for triage.`,
      ),
    },
    {
      source: countAdminSummarySource("role-gates"),
      state: adminSummaryState(isAdmin, adminRoleAccessQuery.isLoading, adminRoleAccessQuery.isError),
      value: adminSummaryValue(
        adminSummaryState(isAdmin, adminRoleAccessQuery.isLoading, adminRoleAccessQuery.isError),
        compactNumber(arrayCount(adminRoleAccessQuery.data?.surfaces) || arrayCount(adminRoleAccessQuery.data?.roles)),
      ),
      detail: adminSummaryDetail(
        countAdminSummarySource("role-gates"),
        adminSummaryState(isAdmin, adminRoleAccessQuery.isLoading, adminRoleAccessQuery.isError),
        `${compactNumber(arrayCount(adminRoleAccessQuery.data?.roles))} roles and ${compactNumber(arrayCount(adminRoleAccessQuery.data?.surfaces))} admin surfaces in the access matrix.`,
      ),
    },
    {
      source: countAdminSummarySource("quest-challenge-load"),
      state: adminSummaryState(isAdmin, adminStatsQuery.isLoading, adminStatsQuery.isError),
      value: adminSummaryValue(
        adminSummaryState(isAdmin, adminStatsQuery.isLoading, adminStatsQuery.isError),
        compactNumber(numberValue(adminStatsQuery.data?.sideQuests) + numberValue(adminStatsQuery.data?.challenges)),
      ),
      detail: adminSummaryDetail(
        countAdminSummarySource("quest-challenge-load"),
        adminSummaryState(isAdmin, adminStatsQuery.isLoading, adminStatsQuery.isError),
        `${compactNumber(numberValue(adminStatsQuery.data?.sideQuests))} side quests, ${compactNumber(numberValue(adminStatsQuery.data?.challenges))} challenges, ${compactNumber(numberValue(adminStatsQuery.data?.listings))} listings.`,
      ),
    },
    {
      source: countAdminSummarySource("reward-settlement"),
      state: adminSummaryState(isAdmin, adminRewardsQuery.isLoading, adminRewardsQuery.isError),
      value: adminSummaryValue(
        adminSummaryState(isAdmin, adminRewardsQuery.isLoading, adminRewardsQuery.isError),
        compactNumber(arrayCount(adminRewardsQuery.data)),
      ),
      detail: adminSummaryDetail(
        countAdminSummarySource("reward-settlement"),
        adminSummaryState(isAdmin, adminRewardsQuery.isLoading, adminRewardsQuery.isError),
        `${compactNumber(arrayCount(adminRewardsQuery.data))} unpaid reward row${arrayCount(adminRewardsQuery.data) === 1 ? "" : "s"} need settlement review.`,
      ),
    },
    {
      source: countAdminSummarySource("market-operations"),
      state: adminSummaryState(isAdmin, adminMarketQuery.isLoading, adminMarketQuery.isError),
      value: adminSummaryValue(
        adminSummaryState(isAdmin, adminMarketQuery.isLoading, adminMarketQuery.isError),
        compactNumber(arrayCount(adminMarketQuery.data?.items) + arrayCount(adminMarketQuery.data?.sales)),
      ),
      detail: adminSummaryDetail(
        countAdminSummarySource("market-operations"),
        adminSummaryState(isAdmin, adminMarketQuery.isLoading, adminMarketQuery.isError),
        `${compactNumber(arrayCount(adminMarketQuery.data?.items))} items, ${compactNumber(arrayCount(adminMarketQuery.data?.sales))} sale windows, ${compactNumber(arrayCount(adminMarketQuery.data?.pricing?.activeSales))} active sales.`,
      ),
    },
    {
      source: countAdminSummarySource("automation-definitions"),
      state: adminSummaryState(isAdmin, adminAutomationQuery.isLoading, adminAutomationQuery.isError),
      value: adminSummaryValue(
        adminSummaryState(isAdmin, adminAutomationQuery.isLoading, adminAutomationQuery.isError),
        compactNumber(arrayCount(adminAutomationQuery.data?.challenges)),
      ),
      detail: adminSummaryDetail(
        countAdminSummarySource("automation-definitions"),
        adminSummaryState(isAdmin, adminAutomationQuery.isLoading, adminAutomationQuery.isError),
        `${compactNumber(arrayCount(adminAutomationQuery.data?.challenges))} challenge automation definition${arrayCount(adminAutomationQuery.data?.challenges) === 1 ? "" : "s"} can be inspected before scaling rewards.`,
      ),
    },
  ];
  const filteredApps = useMemo(() => {
    const q = query.trim().toLowerCase();
    return BETA_APP_CATALOG.filter((app) =>
      (!q || [app.title, app.route, app.purpose, app.whenToUse, app.userBenefit].join(" ").toLowerCase().includes(q)) &&
      (atlasTier === "all" || app.tier === atlasTier) &&
      (atlasStage === "all" || app.stage === atlasStage) &&
      (atlasPersona === "all" || app.personas.includes(atlasPersona)),
    );
  }, [atlasPersona, atlasStage, atlasTier, query]);
  const resetAtlasFilters = () => {
    setQuery("");
    setAtlasTier("all");
    setAtlasStage("all");
    setAtlasPersona("all");
  };

  const runWayfinderAction = (action: BetaWayfinderAction) => {
    if (action.persona) setPersonaKey(action.persona);
    if (action.atlasPersona !== undefined) setAtlasPersona(action.atlasPersona);
    if (action.atlasStage !== undefined) setAtlasStage(action.atlasStage);
    if (action.atlasTier !== undefined) setAtlasTier(action.atlasTier);
    if (action.atlasQuery !== undefined) setQuery(action.atlasQuery);

    window.requestAnimationFrame(() => {
      document.getElementById(action.sectionId)?.scrollIntoView({ behavior: "auto", block: "start" });
    });
  };

  const applyRouteGroupGuide = (group: BetaRouteGroupGuide) => {
    setAtlasPersona(group.atlasPersona);
    setAtlasStage(group.atlasStage);
    setAtlasTier(group.atlasTier);
    setQuery(group.atlasQuery);

    window.requestAnimationFrame(() => {
      document.getElementById("beta-atlas")?.scrollIntoView({ behavior: "auto", block: "start" });
    });
  };

  const jumpToBetaSection = (sectionId: string) => {
    const targetUrl = `${window.location.pathname}${window.location.search}#${sectionId}`;
    window.history.replaceState(null, "", targetUrl);
    window.requestAnimationFrame(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "auto", block: "start" });
    });
  };
  const jumpToCompassSection = (section: BetaSectionCompassItem) => jumpToBetaSection(section.sectionId);

  const openRoute = (app: Pick<BetaAppCatalogEntry, "route" | "access">) => {
    if (app.access !== "public" && !user) navigate("/login");
    else navigate(app.route);
  };
  const openKnownRoute = (route: string, accessHint?: BetaAppCatalogEntry["access"]) => {
    const app = BETA_APP_CATALOG.find((item) => item.route === route || item.related.includes(route));
    const nowSource = BETA_NOW_SIGNAL_SOURCES.find((source) => source.route === route);
    openRoute({ route, access: app?.access ?? accessHint ?? (nowSource?.access === "public" ? "public" : "session") });
  };

  return (
    <Shell data-beta-wtfos>
      <TopBar>
        <Brand>
          <img src="/cursors/tezos-current-logo.png" alt="" />
          <div>
            <strong>WTFOS Beta</strong>
            <span>beta.wtfos.app</span>
          </div>
        </Brand>
        <Actions>
          <Ghost type="button" onClick={() => navigate("/gallery")}>Public Discovery</Ghost>
          <Primary type="button" onClick={() => navigate(user ? "/side-quests" : "/login")}>Start Questing</Primary>
        </Actions>
      </TopBar>

      <Hero id="beta-start">
        <HeroCopy>
          <Kicker><Compass size={16} /> Beta UX layer over existing WTFOS</Kicker>
          <h1>Discover WTFOS by unlocking it.</h1>
          <p>
            Beta keeps app logic intact and turns navigation into a guided progression loop powered
            by existing EXP, levels, roles, permissions, side quests, challenges, rewards, and admin controls.
          </p>
          <Actions>
            <Primary type="button" onClick={() => navigate("/gallery")}>Start with public discovery</Primary>
            <Ghost type="button" onClick={() => navigate(user ? "/side-quests" : "/login")}>Find my first quest</Ghost>
          </Actions>
        </HeroCopy>
        <AnswerGrid>
          {answers.map(([question, answer]) => (
            <Panel key={question} data-beta-answer>
              <Small>{question}</Small>
              <p>{answer}</p>
            </Panel>
          ))}
        </AnswerGrid>
      </Hero>

      <Band id="beta-wayfinder" data-beta-wayfinder>
        <SectionHead>
          <div>
            <Title><Compass size={18} /> First-Minute Wayfinder</Title>
            <p>Pick the question in your head. Beta jumps to the existing section, route, puppet path, or atlas filter that answers it without changing app logic, rewards, roles, or gates.</p>
          </div>
          <NowSummary>
            <strong>{BETA_WAYFINDER_ACTIONS.length}</strong>
            <span>jump points mapped</span>
          </NowSummary>
        </SectionHead>
        <WayfinderGrid>
          {BETA_WAYFINDER_ACTIONS.map((action) => (
            <WayfinderCard
              key={action.key}
              data-beta-wayfinder-action
              data-beta-wayfinder-action-key={action.key}
              data-beta-wayfinder-section={action.sectionId}
              data-beta-wayfinder-route={action.route}
            >
              <WayfinderLead>
                <WayfinderIcon aria-hidden="true">{wayfinderIcon(action.key)}</WayfinderIcon>
                <span>
                  <Small>{action.label}</Small>
                  <strong>{action.question}</strong>
                </span>
              </WayfinderLead>
              <p>{action.proof}</p>
              <Meta><strong>Next action</strong><span>{action.nextAction}</span></Meta>
              <RouteRow aria-label={`${action.label} route and access`}>
                <code>{action.route}</code>
                <code>{accessLabel(action.access)}</code>
                {action.persona ? <code>{attentionAudienceLabel(action.persona)}</code> : null}
              </RouteRow>
              <WayfinderActions>
                <Primary type="button" onClick={() => runWayfinderAction(action)}>Show path</Primary>
                <Ghost type="button" onClick={() => openKnownRoute(action.route, action.access)}>Open route</Ghost>
              </WayfinderActions>
            </WayfinderCard>
          ))}
        </WayfinderGrid>
      </Band>

      <Band id="beta-compass" data-beta-section-compass>
        <SectionHead>
          <div>
            <Title><Compass size={18} /> Beta Section Compass</Title>
            <p>Use this as the page map after the first-minute choice. Every stop jumps to an existing beta board, preserves the current app gates, and explains when that board should be used before anyone asks for an assistant.</p>
          </div>
          <NowSummary>
            <strong>{BETA_SECTION_COMPASS.length}</strong>
            <span>major beta boards mapped</span>
          </NowSummary>
        </SectionHead>
        <SectionCompassGrid>
          {BETA_SECTION_COMPASS.map((section) => (
            <SectionCompassCard
              key={section.key}
              data-beta-section-compass-card
              data-beta-section-compass-key={section.key}
              data-beta-section-compass-section={section.sectionId}
              data-beta-section-compass-access={section.access}
            >
              <SectionCompassLead>
                <Small>{relationshipActorLabel(section.audience)} / {BETA_STAGE_LABELS[section.stage]} / {compassAccessLabel(section.access)}</Small>
                <h3>{section.label}</h3>
                <strong>{section.question}</strong>
              </SectionCompassLead>
              <Meta><strong>Use when</strong><span>{section.useWhen}</span></Meta>
              <Meta><strong>Proves</strong><span>{section.proves}</span></Meta>
              <Meta><strong>Next move</strong><span>{section.nextMove}</span></Meta>
              <RouteRow aria-label={`${section.label} beta section target`}>
                <code>#{section.sectionId}</code>
                <code>{BETA_STAGE_LABELS[section.stage]}</code>
                <code>{compassAccessLabel(section.access)}</code>
              </RouteRow>
              <Primary type="button" data-beta-section-compass-jump onClick={() => jumpToCompassSection(section)}>Jump to {section.label}</Primary>
            </SectionCompassCard>
          ))}
        </SectionCompassGrid>
      </Band>

      <Band id="beta-now" data-beta-now-signals>
        <SectionHead>
          <div>
            <Title><Activity size={18} /> Read-Only Now Signals</Title>
            <p>Beta pulls existing public WTFOS surfaces into one discovery strip so users can see people, progress, market motion, play, and builder output before choosing an app.</p>
          </div>
          <NowSummary>
            <strong>{nowSignals.filter((signal) => signal.state === "Live").length}/{nowSignals.length}</strong>
            <span>public sources active</span>
          </NowSummary>
        </SectionHead>
        <NowGrid>
          {nowSignals.map((signal) => (
            <NowCard key={signal.source.key} data-beta-now-signal $state={signal.state}>
              <Small>{signal.state}</Small>
              <h3>{signal.source.label}</h3>
              <strong>{signal.value}</strong>
              <p>{signal.detail}</p>
              <Meta><strong>Answers</strong><span>{signal.source.userQuestion}</span></Meta>
              <Ghost type="button" onClick={() => openKnownRoute(signal.route ?? signal.source.route, signal.source.access)}>Open {signal.source.label}</Ghost>
            </NowCard>
          ))}
        </NowGrid>
        <ProtectedStrip aria-label="Signed-in beta return loops">
          {protectedSignals.map((signal) => (
            <ProtectedCard key={signal.source.key} data-beta-protected-signal>
              <Small>{signal.state}</Small>
              <h3>{signal.source.label}</h3>
              <strong>{signal.value}</strong>
              <p>{signal.detail}</p>
              <Ghost type="button" onClick={() => openKnownRoute(signal.source.route, signal.source.access)}>Open {signal.source.label}</Ghost>
            </ProtectedCard>
          ))}
        </ProtectedStrip>
      </Band>

      <Band id="beta-proof" data-beta-public-proof-board>
        <SectionHead>
          <div>
            <Title><Compass size={18} /> Public Proof Board</Title>
            <p>Beta turns existing public object, creator, play, and project signals into clearer snippets before users choose the deeper app. Quiet cards stay visible so absence of data becomes understandable instead of feeling like a dead end.</p>
          </div>
          <NowSummary>
            <strong>{publicProofCards.filter((card) => card.state === "Live").length}/{publicProofCards.length}</strong>
            <span>proof cards live</span>
          </NowSummary>
        </SectionHead>
        <ProofGrid>
          {publicProofCards.map((card) => (
            <ProofCard
              key={card.source.key}
              data-beta-public-proof-card
              data-beta-public-proof-state={card.state}
              $state={card.state}
            >
              <Small>{card.state}</Small>
              <h3>{card.source.label}</h3>
              <strong>{card.value}</strong>
              <p>{card.detail}</p>
              <Meta><strong>Answers</strong><span>{card.source.userQuestion}</span></Meta>
              <Meta><strong>Sources</strong><span>{proofSourceLabels(card.source)}</span></Meta>
              <Meta><strong>Why it matters</strong><span>{card.source.betaUse}</span></Meta>
              <Ghost type="button" onClick={() => openKnownRoute(card.source.route)}>Open {card.source.label}</Ghost>
            </ProofCard>
          ))}
        </ProofGrid>
      </Band>

      <Band id="beta-people" data-beta-people-discovery-board>
        <SectionHead>
          <div>
            <Title><Users size={18} /> People Discovery Board</Title>
            <p>WTFOS should feel inhabited before users commit to a tool. Beta groups existing signals into human roles so newcomers can see active users, creators, collectors, builders, curators, collaborators, new users, and interesting wallets without changing any social app behavior.</p>
          </div>
          <NowSummary>
            <strong>{peopleDiscoveryCards.filter((card) => card.state === "Live").length}/{peopleDiscoveryCards.length}</strong>
            <span>people paths live</span>
          </NowSummary>
        </SectionHead>
        <PeopleDiscoveryGrid>
          {peopleDiscoveryCards.map((card) => (
            <PeopleDiscoveryCard
              key={card.source.key}
              data-beta-people-discovery-card
              data-beta-people-discovery-key={card.source.key}
              data-beta-people-discovery-state={card.state}
              $state={card.state}
            >
              <PeopleDiscoveryLead>
                <Small>{card.source.role} / {card.state}</Small>
                <h3>{card.source.label}</h3>
                <strong>{card.source.userQuestion}</strong>
              </PeopleDiscoveryLead>
              <PeopleSignalStrip aria-label={`${card.source.label} source signals`}>
                {card.signals.map((signal) => (
                  <PeopleSignalPill
                    key={`${card.source.key}-${signal.source.key}`}
                    type="button"
                    data-beta-people-discovery-signal
                    data-beta-people-discovery-signal-state={signal.state}
                    $state={signal.state}
                    onClick={() => openKnownRoute(signal.route ?? signal.source.route, signal.source.access)}
                  >
                    <span>{signal.source.label}</span>
                    <strong>{signal.state}</strong>
                  </PeopleSignalPill>
                ))}
              </PeopleSignalStrip>
              <Metric><strong>{card.value}</strong><span>visible proof</span></Metric>
              <p>{card.detail}</p>
              <Meta><strong>Proof signals</strong><span>{card.source.visibleProof}</span></Meta>
              <Meta><strong>Why care</strong><span>{card.source.whyCare}</span></Meta>
              <Meta><strong>Next action</strong><span>{card.source.nextAction}</span></Meta>
              <Meta><strong>Quiet fallback</strong><span>{card.source.quietFallback}</span></Meta>
              <RouteRow aria-label={`${card.source.label} related people routes`}>
                {[card.source.route, ...card.source.relatedRoutes].map((route) => <code key={route}>{route}</code>)}
              </RouteRow>
              <ControlActions>
                <Primary type="button" onClick={() => openKnownRoute(card.source.route, card.source.access)}>Find {card.source.label}</Primary>
                <Ghost type="button" onClick={() => openKnownRoute(card.source.relatedRoutes[0] ?? card.source.route)}>Related route</Ghost>
              </ControlActions>
            </PeopleDiscoveryCard>
          ))}
        </PeopleDiscoveryGrid>
        <PeopleProofMatrix data-beta-people-proof-gaps>
          <SectionHead>
            <div>
              <Title><Users size={18} /> People Proof Gap Matrix</Title>
              <p>Beta keeps the social visibility pressure explicit. Each row names the proof users can already see, the weakness that still causes hesitation, the next UI move, and the no-write boundary that keeps people discovery separate from app logic.</p>
            </div>
            <NowSummary>
              <strong>{BETA_PEOPLE_PROOF_GAPS.filter((gap) => gap.status !== "weak").length}/{BETA_PEOPLE_PROOF_GAPS.length}</strong>
              <span>people proofs routed</span>
            </NowSummary>
          </SectionHead>
          <PeopleProofGrid>
            {BETA_PEOPLE_PROOF_GAPS.map((gap) => {
              const proofSignals = gap.relatedSignals
                .map((sourceKey) => signalByKey.get(sourceKey))
                .filter((signal): signal is BetaRenderedNowSignal => Boolean(signal));
              return (
                <PeopleProofCard
                  key={gap.key}
                  data-beta-people-proof-gap
                  data-beta-people-proof-gap-key={gap.key}
                  data-beta-people-proof-gap-status={gap.status}
                  $status={gap.status}
                >
                  <PeopleDiscoveryLead>
                    <Small>{peopleProofStatusLabel(gap.status)} / {accessLabel(gap.access)}</Small>
                    <h3>{gap.label}</h3>
                    <strong>{gap.userQuestion}</strong>
                  </PeopleDiscoveryLead>
                  <PeopleSignalStrip aria-label={`${gap.label} proof gap signals`}>
                    {proofSignals.map((signal) => (
                      <PeopleSignalPill
                        key={`${gap.key}-${signal.source.key}`}
                        type="button"
                        data-beta-people-proof-gap-signal
                        data-beta-people-proof-gap-signal-state={signal.state}
                        $state={signal.state}
                        onClick={() => openKnownRoute(signal.route ?? signal.source.route, signal.source.access)}
                      >
                        <span>{signal.source.label}</span>
                        <strong>{signal.state}</strong>
                      </PeopleSignalPill>
                    ))}
                  </PeopleSignalStrip>
                  <Meta><strong>Visible proof</strong><span>{gap.visibleProof}</span></Meta>
                  <Meta><strong>Why it matters</strong><span>{gap.whyItMatters}</span></Meta>
                  <Meta><strong>Current weakness</strong><span>{gap.currentWeakness}</span></Meta>
                  <Meta><strong>Next beta move</strong><span>{gap.nextBetaMove}</span></Meta>
                  <Meta><strong>Quiet fallback</strong><span>{gap.quietFallback}</span></Meta>
                  <Meta><strong>No-write boundary</strong><span>{gap.noWriteRule}</span></Meta>
                  <ControlActions>
                    <Primary type="button" onClick={() => openKnownRoute(gap.route, gap.access)}>Open proof route</Primary>
                    <Ghost type="button" onClick={() => openKnownRoute(gap.route, gap.access)}>Review {gap.label}</Ghost>
                  </ControlActions>
                </PeopleProofCard>
              );
            })}
          </PeopleProofGrid>
        </PeopleProofMatrix>
      </Band>

      <Band id="beta-attention" data-beta-attention-triage-board>
        <SectionHead>
          <div>
            <Title><Search size={18} /> Attention Triage Board</Title>
            <p>Signals need a decision path. Beta turns people, progress, collector, creator, play, digest, and Count/admin attention into route-owned next actions while keeping all notifications, rewards, roles, and permissions in the existing systems.</p>
          </div>
          <NowSummary>
            <strong>{BETA_ATTENTION_QUEUE.length}</strong>
            <span>attention paths mapped</span>
          </NowSummary>
        </SectionHead>
        <AttentionTriageGrid>
          {BETA_ATTENTION_QUEUE.map((item) => {
            const itemSignals = item.signalKeys.map((key) => signalByKey.get(key)).filter((signal): signal is BetaRenderedNowSignal => Boolean(signal));
            const liveSignals = itemSignals.filter((signal) => signal.state === "Live").length;
            return (
              <AttentionCard
                key={item.key}
                data-beta-attention-card
                data-beta-attention-cadence={item.cadence}
                $cadence={item.cadence}
              >
                <Small>{attentionCadenceLabel(item.cadence)} / {attentionAudienceLabel(item.audience)}</Small>
                <h3>{item.label}</h3>
                <strong>{item.question}</strong>
                <p>{item.whyItMatters}</p>
                <AttentionSignalStrip data-beta-attention-signal-strip aria-label={`${item.label} proof signals`}>
                  {itemSignals.map((signal) => (
                    <AttentionSignalPill
                      key={`${item.key}-${signal.source.key}`}
                      type="button"
                      data-beta-attention-signal
                      data-beta-attention-signal-state={signal.state}
                      $state={signal.state}
                      onClick={() => openKnownRoute(signal.route ?? signal.source.route, signal.source.access)}
                    >
                      <span>{signal.source.label}</span>
                      <strong>{signal.state}</strong>
                    </AttentionSignalPill>
                  ))}
                </AttentionSignalStrip>
                <Meta><strong>Current proof</strong><span>{liveSignals}/{itemSignals.length} linked signals are live; protected and quiet signals still explain where to go next.</span></Meta>
                <Meta><strong>Do next</strong><span>{item.action}</span></Meta>
                <Meta><strong>Quiet fallback</strong><span>{item.quietFallback}</span></Meta>
                <Meta><strong>The Count controls</strong><span>{item.countControl}</span></Meta>
                <RouteRow aria-label={`${item.label} triage routes`}>
                  {[item.route, ...item.relatedRoutes].map((route) => <code key={route}>{route}</code>)}
                </RouteRow>
                <Primary type="button" onClick={() => openKnownRoute(item.route, item.access)}>Open triage route</Primary>
              </AttentionCard>
            );
          })}
        </AttentionTriageGrid>
      </Band>

      <Band id="beta-return" data-beta-daily-return-board>
        <SectionHead>
          <div>
            <Title><Bell size={18} /> Daily Return Board</Title>
            <p>Beta makes the daily loop concrete: check what changed, complete one manageable action, see other people, inspect one object, move one project, or review one admin queue. Every card routes to an existing WTFOS surface and keeps its current permissions.</p>
          </div>
          <NowSummary>
            <strong>{BETA_DAILY_RETURN_LOOPS.length}</strong>
            <span>return loops mapped</span>
          </NowSummary>
        </SectionHead>
        <DailyReturnGrid>
          {BETA_DAILY_RETURN_LOOPS.map((loop) => (
            <DailyReturnCard key={loop.key} data-beta-daily-return-card data-beta-daily-return-access={loop.access}>
              <Small>{accessLabel(loop.access)}</Small>
              <h3>{loop.label}</h3>
              <strong>{loop.question}</strong>
              <Meta><strong>Do today</strong><span>{loop.todayAction}</span></Meta>
              <Meta><strong>Return tomorrow</strong><span>{loop.tomorrowReason}</span></Meta>
              <Meta><strong>Progress hook</strong><span>{loop.progressionHook}</span></Meta>
              <Meta><strong>Visible proof</strong><span>{loop.visibleProof}</span></Meta>
              <Meta><strong>The Count controls</strong><span>{loop.countControl}</span></Meta>
              <RouteRow aria-label={`${loop.label} related routes`}>
                {[loop.route, ...loop.relatedRoutes].map((route) => <code key={route}>{route}</code>)}
              </RouteRow>
              <Primary type="button" onClick={() => openKnownRoute(loop.route, loop.access)}>Open daily loop</Primary>
            </DailyReturnCard>
          ))}
        </DailyReturnGrid>
      </Band>

      <Band id="beta-passports" data-beta-unlock-passport-board>
        <SectionHead>
          <div>
            <Title><ShieldCheck size={18} /> Unlock Passport</Title>
            <p>Each puppet gets a compact progression passport: what is visible now, what safe action comes next, what proof matters, what can unlock, and what stays locked. EXP, levels, roles, rewards, and permissions remain owned by existing WTFOS systems.</p>
          </div>
          <NowSummary>
            <strong>{BETA_UNLOCK_PASSPORTS.length}</strong>
            <span>passports mapped</span>
          </NowSummary>
        </SectionHead>
        <PassportGrid>
          {BETA_UNLOCK_PASSPORTS.map((passport) => (
            <PassportCard
              key={passport.key}
              data-beta-unlock-passport-card
              data-beta-unlock-passport-key={passport.key}
              data-beta-unlock-passport-access={passport.access}
            >
              <PassportLead>
                <Small>{accessLabel(passport.access)} / {passport.identity}</Small>
                <h3>{passport.label}</h3>
                <strong>{passport.question}</strong>
              </PassportLead>
              <Meta><strong>Visible now</strong><span>{passport.visibleNow}</span></Meta>
              <Meta><strong>Next safe action</strong><span>{passport.nextSafeAction}</span></Meta>
              <Meta><strong>Proof needed</strong><span>{passport.proofNeeded}</span></Meta>
              <Meta><strong>Unlocks next</strong><span>{passport.unlocksNext}</span></Meta>
              <Meta><strong>Stays locked</strong><span>{passport.staysLocked}</span></Meta>
              <Meta><strong>The Count reviews</strong><span>{passport.countReview}</span></Meta>
              <Meta><strong>Return tomorrow</strong><span>{passport.tomorrowReason}</span></Meta>
              <RouteRow aria-label={`${passport.label} passport routes`}>
                {[passport.primaryRoute, passport.proofRoute, passport.nextRoute, ...passport.relatedRoutes].map((route) => <code key={route}>{route}</code>)}
              </RouteRow>
              <ControlActions>
                <Primary type="button" onClick={() => openKnownRoute(passport.primaryRoute, passport.primaryAccess)}>Start passport</Primary>
                <Ghost type="button" onClick={() => openKnownRoute(passport.proofRoute, passport.proofAccess)}>Open proof route</Ghost>
                <Ghost type="button" onClick={() => openKnownRoute(passport.nextRoute, passport.nextAccess)}>Open next unlock</Ghost>
              </ControlActions>
            </PassportCard>
          ))}
        </PassportGrid>
      </Band>

      <Band id="beta-questlines" data-beta-unlock-questline-board>
        <SectionHead>
          <div>
            <Title><ShieldCheck size={18} /> Unlock Questline Board</Title>
            <p>Beta turns discovery into manageable questlines over existing Side Quests, Challenges, EXP, rewards, roles, permissions, and Count review. The board explains the unlock game without creating new progression logic.</p>
          </div>
          <NowSummary>
            <strong>{BETA_UNLOCK_QUESTLINES.length}</strong>
            <span>questlines mapped</span>
          </NowSummary>
        </SectionHead>
        <QuestlineGrid>
          {BETA_UNLOCK_QUESTLINES.map((questline) => (
            <QuestlineCard key={questline.key} data-beta-unlock-questline-card>
              <Small>{questline.adminSurface}</Small>
              <h3>{questline.label}</h3>
              <p>{questline.promise}</p>
              <Meta><strong>Side quest</strong><span>{questline.sideQuest}</span></Meta>
              <Meta><strong>Challenge</strong><span>{questline.challenge}</span></Meta>
              <Meta><strong>Reward</strong><span>{questline.reward}</span></Meta>
              <Meta><strong>Role or permission</strong><span>{questline.roleOrPermission}</span></Meta>
              <QuestStageList>
                {questline.stages.map((stage) => (
                  <QuestStageButton
                    key={`${questline.key}-${stage.key}-${stage.route}`}
                    type="button"
                    data-beta-unlock-questline-stage
                    onClick={() => openKnownRoute(stage.route, stage.access)}
                  >
                    <span>{stage.label}</span>
                    <strong>{stage.action}</strong>
                    <em>{stage.proof}</em>
                    <code>{stage.route}</code>
                  </QuestStageButton>
                ))}
              </QuestStageList>
              <Meta><strong>The Count review</strong><span>{questline.adminReview}</span></Meta>
              <Meta><strong>Abuse guard</strong><span>{questline.abuseGuard}</span></Meta>
            </QuestlineCard>
          ))}
        </QuestlineGrid>
      </Band>

      <Band id="beta-governance" data-beta-unlock-governance-matrix>
        <SectionHead>
          <div>
            <Title><ShieldCheck size={18} /> Unlock Governance Matrix</Title>
            <p>Questlines need operator policy before they scale. Beta maps each puppet path to the existing proof, EXP signal, reward sink, role boundary, Count decision, and anti-farm guard that keeps discovery playable without turning EXP into authority.</p>
          </div>
          <NowSummary>
            <strong>{BETA_UNLOCK_GOVERNANCE_MATRIX.length}</strong>
            <span>governance rows mapped</span>
          </NowSummary>
        </SectionHead>
        <GovernanceGrid>
          {BETA_UNLOCK_GOVERNANCE_MATRIX.map((item) => (
            <GovernanceCard
              key={item.key}
              data-beta-unlock-governance-card
              data-beta-unlock-governance-key={item.key}
              data-beta-unlock-governance-access={item.userAccess}
            >
              <Small>{accessLabel(item.userAccess)} / {item.adminAccess === "admin" ? "Count review" : "Review"}</Small>
              <h3>{item.label}</h3>
              <strong>{item.playerQuestion}</strong>
              <Meta><strong>Evidence</strong><span>{item.evidence}</span></Meta>
              <Meta><strong>EXP signal</strong><span>{item.expSignal}</span></Meta>
              <Meta><strong>Reward or market sink</strong><span>{item.rewardOrMarketSink}</span></Meta>
              <Meta><strong>Role boundary</strong><span>{item.roleBoundary}</span></Meta>
              <Meta><strong>The Count decides</strong><span>{item.countDecision}</span></Meta>
              <Meta><strong>Anti-farm guard</strong><span>{item.abuseControl}</span></Meta>
              <RouteRow aria-label={`${item.label} governance routes`}>
                {[item.userRoute, item.adminRoute, ...item.relatedRoutes].map((route) => <code key={route}>{route}</code>)}
              </RouteRow>
              <ControlActions>
                <Primary type="button" onClick={() => openKnownRoute(item.userRoute, item.userAccess)}>Open user route</Primary>
                <Ghost type="button" onClick={() => openKnownRoute(item.adminRoute, item.adminAccess)}>Open Count review</Ghost>
                <Ghost type="button" onClick={() => openKnownRoute(item.relatedRoutes[0] ?? item.userRoute)}>Open related route</Ghost>
              </ControlActions>
            </GovernanceCard>
          ))}
        </GovernanceGrid>
      </Band>

      <Band id="beta-relationships" data-beta-relationship-navigator>
        <SectionHead>
          <div>
            <Title><ArrowRight size={18} /> App Relationship Navigator</Title>
            <p>Beta explains what each route consumes, what it feeds, and which tool should come next. These are handoffs over existing WTFOS apps, not new app behavior.</p>
          </div>
          <NowSummary>
            <strong>{BETA_RELATIONSHIP_NAVIGATOR.length}</strong>
            <span>handoff chains mapped</span>
          </NowSummary>
        </SectionHead>
        <RelationshipGrid>
          {BETA_RELATIONSHIP_NAVIGATOR.map((chain) => (
            <RelationshipCard
              key={chain.key}
              data-beta-relationship-chain
              data-beta-relationship-key={chain.key}
              data-beta-relationship-actor={chain.actor}
            >
              <RelationshipLead>
                <Small>{relationshipActorLabel(chain.actor)} / {BETA_STAGE_LABELS[chain.stage]}</Small>
                <h3>{chain.label}</h3>
                <strong>{chain.question}</strong>
                <p>{chain.userBenefit}</p>
              </RelationshipLead>
              <Meta><strong>Starts when</strong><span>{chain.startsWhen}</span></Meta>
              <RelationshipContextGrid>
                <Meta><strong>Comes before</strong><span>{chain.comesBefore}</span></Meta>
                <Meta><strong>Consumes</strong><span>{chain.consumes}</span></Meta>
                <Meta><strong>Feeds into</strong><span>{chain.feedsInto}</span></Meta>
                <Meta><strong>Comes after</strong><span>{chain.comesAfter}</span></Meta>
              </RelationshipContextGrid>
              <RelationshipStepList aria-label={`${chain.label} route handoffs`}>
                {chain.steps.map((step, index) => (
                  <RelationshipStepButton
                    key={`${chain.key}-${step.key}-${step.route}-${index}`}
                    type="button"
                    data-beta-relationship-step
                    data-beta-relationship-route={step.route}
                    onClick={() => openKnownRoute(step.route, step.access)}
                  >
                    <StepIndex>{index + 1}</StepIndex>
                    <StepCopy>
                      <strong>{step.label}</strong>
                      <span>{step.why}</span>
                      <em>{step.handoff}</em>
                      <code>{accessLabel(step.access)} / {step.route}</code>
                    </StepCopy>
                  </RelationshipStepButton>
                ))}
              </RelationshipStepList>
              <Meta><strong>The Count watches</strong><span>{chain.countWatch}</span></Meta>
              <RouteRow aria-label={`${chain.label} related routes`}>
                {chain.relatedRoutes.map((route) => <code key={route}>{route}</code>)}
              </RouteRow>
              <ControlActions>
                <Primary type="button" onClick={() => openKnownRoute(chain.steps[0]?.route ?? chain.relatedRoutes[0], chain.steps[0]?.access)}>Open first route</Primary>
                <Ghost type="button" onClick={() => openKnownRoute(chain.steps.at(-1)?.route ?? chain.relatedRoutes[0], chain.steps.at(-1)?.access)}>Open last route</Ghost>
              </ControlActions>
            </RelationshipCard>
          ))}
        </RelationshipGrid>
      </Band>

      <Band id="beta-route-groups" data-beta-route-group-guide>
        <SectionHead>
          <div>
            <Title><Search size={18} /> Route Group Guide</Title>
            <p>When several app names sound like they might do the same job, beta names the route cluster, explains the first route, the next routes, the proof to look for, and the quiet rule before sending the user into the full atlas.</p>
          </div>
          <NowSummary>
            <strong>{BETA_ROUTE_GROUP_GUIDE.length}</strong>
            <span>route groups clarified</span>
          </NowSummary>
        </SectionHead>
        <RouteGroupGrid>
          {BETA_ROUTE_GROUP_GUIDE.map((group) => (
            <RouteGroupCard
              key={group.key}
              data-beta-route-group-card
              data-beta-route-group-key={group.key}
              data-beta-route-group-actor={group.actor}
            >
              <RelationshipLead>
                <Small>{relationshipActorLabel(group.actor)} / {BETA_STAGE_LABELS[group.stage]}</Small>
                <h3>{group.label}</h3>
                <strong>{group.userQuestion}</strong>
                <p>{group.confusionResolved}</p>
              </RelationshipLead>
              <RouteGroupContextGrid>
                <Meta><strong>Use first</strong><span>{group.useFirst}</span></Meta>
                <Meta><strong>Use next</strong><span>{group.useNext}</span></Meta>
                <Meta><strong>Proof to look for</strong><span>{group.proofToLookFor}</span></Meta>
                <Meta><strong>Quiet rule</strong><span>{group.quietRule}</span></Meta>
                <Meta><strong>The Count watches</strong><span>{group.countWatch}</span></Meta>
              </RouteGroupContextGrid>
              <RouteGroupRouteList aria-label={`${group.label} route group`}>
                {group.routes.map((route, index) => (
                  <RouteGroupRouteButton
                    key={`${group.key}-${route.route}-${index}`}
                    type="button"
                    data-beta-route-group-route
                    data-beta-route-group-route-path={route.route}
                    onClick={() => openKnownRoute(route.route, route.access)}
                  >
                    <StepIndex>{index + 1}</StepIndex>
                    <StepCopy>
                      <strong>{route.label}</strong>
                      <span>{route.purpose}</span>
                      <code>{accessLabel(route.access)} / {route.route}</code>
                    </StepCopy>
                  </RouteGroupRouteButton>
                ))}
              </RouteGroupRouteList>
              <ControlActions>
                <Primary type="button" onClick={() => openKnownRoute(group.routes[0]?.route ?? "/beta", group.routes[0]?.access)}>Open first route</Primary>
                <Ghost type="button" data-beta-route-group-atlas-filter onClick={() => applyRouteGroupGuide(group)}>Filter atlas to group</Ghost>
              </ControlActions>
            </RouteGroupCard>
          ))}
        </RouteGroupGrid>
      </Band>

      <Band id="beta-trails" data-beta-discovery-trails>
        <SectionHead>
          <div>
            <Title><Compass size={18} /> Discovery Trails</Title>
            <p>Signals become useful when they point to a path. Beta groups existing WTFOS apps into role-based trails that explain what comes before, what comes next, and what to check tomorrow.</p>
          </div>
        </SectionHead>
        <TrailGrid>
          {BETA_DISCOVERY_TRAILS.map((trail) => {
            const trailSignals = trailSignalsByKey.get(trail.key) ?? [];
            return (
              <TrailCard key={trail.key} data-beta-discovery-trail>
                <TrailLead>
                  <Small>{trail.persona}</Small>
                  <h3>{trail.label}</h3>
                  <p>{trail.promise}</p>
                </TrailLead>
                <Meta><strong>Start when</strong><span>{trail.trigger}</span></Meta>
                {trailSignals.length > 0 ? (
                  <TrailLiveStrip aria-label={`${trail.label} live proof`} data-beta-trail-live-strip>
                    {trailSignals.map((signal) => (
                      <TrailLiveSnippet key={`${trail.key}-${signal.source.key}`} data-beta-trail-live-snippet $state={signal.state}>
                        <Small>{signal.state}</Small>
                        <strong>{signal.source.label}</strong>
                        <span>{signal.value}</span>
                        <Ghost type="button" onClick={() => openKnownRoute(signal.route ?? signal.source.route, signal.source.access)}>Open proof</Ghost>
                      </TrailLiveSnippet>
                    ))}
                  </TrailLiveStrip>
                ) : null}
                <TrailStatePanel aria-label={`${trail.label} state readout`} data-beta-trail-state-panel>
                  {trailStateRows(trail, trailSignals).map((row) => (
                    <TrailStateRow key={row.key} data-beta-trail-state-row data-beta-trail-state={row.key} $tone={row.tone}>
                      <Small>{row.label}</Small>
                      <strong>{row.count}</strong>
                      <span>{row.copy}</span>
                    </TrailStateRow>
                  ))}
                </TrailStatePanel>
                <TrailStepList>
                  {trail.steps.map((step, index) => (
                    <TrailStepButton
                      key={`${trail.key}-${step.route}-${index}`}
                      type="button"
                      data-beta-discovery-step
                      onClick={() => openRoute({ route: step.route, access: step.access })}
                    >
                      <StepIndex>{index + 1}</StepIndex>
                      <StepCopy>
                        <strong>{step.label}</strong>
                        <span>{step.why}</span>
                        {step.access !== "public" && step.lockedCopy ? (
                          <AccessHint data-beta-protected-step-note>
                            <b>{accessLabel(step.access)}</b>{step.lockedCopy}
                          </AccessHint>
                        ) : null}
                      </StepCopy>
                    </TrailStepButton>
                  ))}
                </TrailStepList>
                <Meta><strong>Success</strong><span>{trail.success}</span></Meta>
                <Meta><strong>Return tomorrow</strong><span>{trail.returnTomorrow}</span></Meta>
              </TrailCard>
            );
          })}
        </TrailGrid>
      </Band>

      <Band data-beta-agent-loop>
        <LoopConsole>
          <Panel>
            <Title><Activity size={18} /> Persistent Agent Loop</Title>
            <Small>{BETA_PROD_SCAN.mode} production scan / {BETA_PROD_SCAN.scannedAt}</Small>
            <p>{BETA_PROD_SCAN.finding}</p>
            <ScanGrid>
              <Metric><strong>{BETA_PROD_SCAN.browserRoutes}</strong><span>browser routes</span></Metric>
              <Metric><strong>{BETA_PROD_SCAN.apiRoutes}</strong><span>API routes</span></Metric>
              <Metric><strong>{BETA_PROD_SCAN.desktopApps}</strong><span>desktop apps</span></Metric>
              <Metric><strong>{BETA_PROD_SCAN.enabledDesktopApps}</strong><span>enabled apps</span></Metric>
            </ScanGrid>
          </Panel>
          <AgentPanel>
            <Small>{selectedAgent.label}</Small>
            <h2>{selectedAgent.firstTask}</h2>
            <p>{selectedAgent.memory}</p>
            <MetricGrid>
              <Metric><strong>{selectedRun.metrics.timeToUnderstandSec}s</strong><span>understand</span></Metric>
              <Metric><strong>{selectedRun.metrics.timeToFirstSuccessSec}s</strong><span>first success</span></Metric>
              <Metric><strong>{selectedRun.metrics.timeToToolDiscoverySec}s</strong><span>tool discovery</span></Metric>
              <Metric><strong>{selectedRun.metrics.timeToPeopleDiscoverySec}s</strong><span>people</span></Metric>
              <Metric><strong>{selectedRun.metrics.timeToActivityDiscoverySec}s</strong><span>activity</span></Metric>
              <Metric><strong>{selectedRun.metrics.timeToNextStepSec}s</strong><span>next step</span></Metric>
            </MetricGrid>
            <Meta><strong>Success</strong><span>{selectedRun.success}</span></Meta>
            <Meta><strong>Dead end check</strong><span>{selectedRun.deadEnd}</span></Meta>
            <Meta><strong>Unexpected discovery</strong><span>{selectedRun.unexpectedDiscovery}</span></Meta>
            <Actions>
              <Primary type="button" onClick={() => openKnownRoute(selectedAgent.nextStepRoute)}>Run next step</Primary>
              <Ghost type="button" onClick={() => openKnownRoute("/notifications")}>Check what changed</Ghost>
            </Actions>
          </AgentPanel>
        </LoopConsole>
      </Band>

      <Band data-beta-puppet-memory-ledger>
        <SectionHead>
          <div>
            <Title><Users size={18} /> Puppet Memory Ledger</Title>
            <p>Each persistent puppet keeps the same memory across scans: task, success condition, six required checks, confusion, hesitation, dead end, abandonment risk, delight, and unexpected discovery. The ledger is evidence for the next beta change, not a new assistant or automation engine.</p>
          </div>
          <NowSummary>
            <strong>{BETA_PUPPET_MEMORY_LEDGER.length}</strong>
            <span>persistent memories</span>
          </NowSummary>
        </SectionHead>
        <PuppetMemoryGrid>
          {BETA_PUPPET_MEMORY_LEDGER.map((item) => (
            <PuppetMemoryCard
              key={item.agent}
              data-beta-puppet-memory-card
              data-beta-puppet-memory-agent={item.agent}
              data-beta-puppet-memory-decision={item.decision}
            >
              <PuppetMemoryLead>
                <Small>{item.label} / {item.decision === "keep" ? "kept" : "iterate"}</Small>
                <h3>{item.firstTask}</h3>
                <p>{item.memory}</p>
              </PuppetMemoryLead>
              <CheckpointGrid aria-label={`${item.label} checkpoint memory`}>
                {item.checkpoints.map((checkpoint) => (
                  <CheckpointPill
                    key={`${item.agent}-${checkpoint.key}`}
                    data-beta-puppet-memory-check
                    data-beta-puppet-memory-check-key={checkpoint.key}
                    data-beta-puppet-memory-check-passed={checkpoint.passed ? "true" : "false"}
                    $passed={checkpoint.passed}
                  >
                    <span>{checkpoint.passed ? "Passed" : "Watch"}</span>
                    <strong>{checkpoint.label}</strong>
                  </CheckpointPill>
                ))}
              </CheckpointGrid>
              <Meta><strong>Success condition</strong><span>{item.successCondition}</span></Meta>
              <Meta><strong>Confusion</strong><span>{item.confusion}</span></Meta>
              <Meta><strong>Hesitation</strong><span>{item.hesitation}</span></Meta>
              <Meta><strong>Dead end</strong><span>{item.deadEnd}</span></Meta>
              <Meta><strong>Abandonment risk</strong><span>{item.abandonment}</span></Meta>
              <Meta><strong>Success</strong><span>{item.success}</span></Meta>
              <Meta><strong>Delight</strong><span>{item.delight}</span></Meta>
              <Meta><strong>Unexpected discovery</strong><span>{item.unexpectedDiscovery}</span></Meta>
              <Meta><strong>Remaining friction</strong><span>{item.remainingFriction}</span></Meta>
              <RouteRow aria-label={`${item.label} memory route`}>
                <code>{item.nextStepRoute}</code>
                <code>{compactNumber(item.totalSavedSec)}s saved</code>
              </RouteRow>
              <ControlActions>
                <Primary type="button" onClick={() => openKnownRoute(item.nextStepRoute)}>Open puppet route</Primary>
                <Ghost type="button" onClick={() => openKnownRoute("/notifications")}>Check return loop</Ghost>
              </ControlActions>
            </PuppetMemoryCard>
          ))}
        </PuppetMemoryGrid>
      </Band>

      <Band data-beta-retest-snapshots>
        <SectionHead>
          <div>
            <Title><Activity size={18} /> Puppet Retest Snapshots</Title>
            <p>Beta compares each persistent puppet against the production app-name scan. A change stays only when the beta shell reduces time-to-understand, first success, tool discovery, people discovery, activity discovery, and next-step discovery without changing app behavior.</p>
          </div>
          <RetestSummary data-beta-retest-summary>
            <strong>{retestSummary.kept}/{retestSummary.agents}</strong>
            <span>puppet paths kept</span>
            <small>{compactNumber(retestSummary.totalSavedSec)}s saved total / {retestSummary.underSixtyCount} checks under 60s</small>
          </RetestSummary>
        </SectionHead>
        <RetestGrid>
          {BETA_AGENT_RETEST_SNAPSHOTS.map((snapshot) => (
            <RetestCard key={snapshot.agent} data-beta-retest-snapshot data-beta-retest-decision={snapshot.decision}>
              <Small>{snapshot.baselineLabel}{" -> "}{snapshot.betaLabel}</Small>
              <h3>{snapshot.label}</h3>
              <RetestDelta>
                <strong>{snapshot.savedSec}s</strong>
                <span>{snapshot.percentImproved}% faster across the six required checks</span>
              </RetestDelta>
              <RetestMetricList>
                {snapshot.metrics.map((metric) => (
                  <RetestMetricRow key={metric.key} data-beta-retest-metric>
                    <span>{metric.label}</span>
                    <strong>{metric.beforeSec}s{" -> "}{metric.afterSec}s</strong>
                    <em>{metric.savedSec}s saved</em>
                  </RetestMetricRow>
                ))}
              </RetestMetricList>
              <Meta><strong>Evidence</strong><span>{snapshot.evidence}</span></Meta>
              <Meta><strong>Remaining watch</strong><span>{snapshot.remainingFriction}</span></Meta>
              <Meta><strong>Decision</strong><span>{snapshot.decision === "keep" ? "Keep this beta organization and keep iterating the next highest-friction path." : "Iterate this path before treating the beta change as superior."}</span></Meta>
            </RetestCard>
          ))}
        </RetestGrid>
      </Band>

      <Band data-beta-friction-queue>
        <SectionHead>
          <div>
            <Title><Compass size={18} /> Beta Friction Queue</Title>
            <p>Use this as the next-iteration board after puppet retests. Each item names the evidence, the remaining friction, the beta board to strengthen, the existing owner route, and the no-write boundary that keeps this shell from becoming app logic.</p>
          </div>
          <NowSummary>
            <strong>{BETA_FRICTION_QUEUE.filter((item) => item.status === "strengthen").length}/{BETA_FRICTION_QUEUE.length}</strong>
            <span>items need UI strengthening</span>
          </NowSummary>
        </SectionHead>
        <FrictionQueueGrid>
          {BETA_FRICTION_QUEUE.map((item) => (
            <FrictionQueueCard
              key={item.key}
              data-beta-friction-queue-card
              data-beta-friction-queue-key={item.key}
              data-beta-friction-queue-status={item.status}
              data-beta-friction-queue-priority={item.priority}
              data-beta-friction-queue-section={item.sectionId}
            >
              <FrictionQueueLead>
                <Small>{item.priority} / {frictionStatusLabel(item.status)} / {relationshipActorLabel(item.audience)}</Small>
                <h3>{item.label}</h3>
                <p>{item.friction}</p>
              </FrictionQueueLead>
              <Meta><strong>Evidence</strong><span>{item.evidence}</span></Meta>
              <Meta><strong>Next beta UI move</strong><span>{item.nextUiMove}</span></Meta>
              <Meta><strong>Success measure</strong><span>{item.successMeasure}</span></Meta>
              <Meta><strong>No-write boundary</strong><span>{item.noWriteRule}</span></Meta>
              <RouteRow aria-label={`${item.label} owner route and beta board`}>
                <code>{item.route}</code>
                <code>{accessLabel(item.access)}</code>
                <code>#{item.sectionId}</code>
              </RouteRow>
              <FrictionRelatedRoutes aria-label={`${item.label} related routes`}>
                {item.relatedRoutes.map((route) => <code key={`${item.key}-${route}`}>{route}</code>)}
              </FrictionRelatedRoutes>
              <ControlActions>
                <Primary type="button" data-beta-friction-queue-jump onClick={() => jumpToBetaSection(item.sectionId)}>Show beta board</Primary>
                <Ghost type="button" data-beta-friction-queue-open onClick={() => openKnownRoute(item.route, item.access)}>Open owner route</Ghost>
              </ControlActions>
            </FrictionQueueCard>
          ))}
        </FrictionQueueGrid>
      </Band>

      <Band data-beta-visibility-radar>
        <SectionHead>
          <div>
            <Title><Users size={18} /> Visibility Radar</Title>
            <p>Beta should prove people, projects, activity, art, markets, events, and collaboration opportunities exist before users hunt through app names.</p>
          </div>
          <VisibilityScore>
            <strong>{visibilityScore.percent}%</strong>
            <span>{visibilityScore.score}/{visibilityScore.max} visibility score</span>
          </VisibilityScore>
        </SectionHead>
        <VisibilityGrid>
          {BETA_VISIBILITY_SIGNALS.map((signal) => (
            <SignalCard key={signal.key} $status={signal.status} data-beta-visibility-signal>
              <Small>{statusLabel(signal.status)}</Small>
              <h3>{signal.label}</h3>
              <p>{signal.evidence}</p>
              <RouteRow><code>{signal.route}</code></RouteRow>
              <Meta><strong>Next improvement</strong><span>{signal.nextImprovement}</span></Meta>
              <Ghost type="button" onClick={() => openKnownRoute(signal.route)}>Open signal route</Ghost>
            </SignalCard>
          ))}
        </VisibilityGrid>
      </Band>

      <Band data-beta-route-bridges>
        <SectionHead>
          <div>
            <Title><Compass size={18} /> Route Bridges</Title>
            <p>Every app keeps its purpose; beta adds clearer routes between the moments that already exist.</p>
          </div>
        </SectionHead>
        <BridgeGrid>
          {BETA_ROUTE_BRIDGES.map((bridge) => (
            <BridgeCard key={`${bridge.from}-${bridge.to}`} data-beta-route-bridge>
              <Small>{bridge.from}</Small>
              <h3>{bridge.to}</h3>
              <p>{bridge.reason}</p>
              <Ghost type="button" onClick={() => openKnownRoute(bridge.route)}>Follow bridge</Ghost>
            </BridgeCard>
          ))}
        </BridgeGrid>
      </Band>

      <TwoCol id="beta-paths">
        <Panel>
          <Title><Users size={18} /> Puppet Paths</Title>
          <Tabs data-beta-puppet-tabs>
            {BETA_PERSONAS.map((item) => (
              <Tab key={item.key} type="button" $active={item.key === personaKey} onClick={() => setPersonaKey(item.key)}>
                {item.label}
              </Tab>
            ))}
          </Tabs>
          <Feature data-beta-persona-card={persona.key}>
            <Small>{persona.label}</Small>
            <h2>{persona.promise}</h2>
            <p>{persona.returnReason}</p>
            <Meta><strong>Likely confusion</strong><span>{persona.confusion}</span></Meta>
            <Meta><strong>Failure mode</strong><span>{persona.failure}</span></Meta>
            <Meta><strong>Hesitation</strong><span>{persona.hesitation}</span></Meta>
            <Meta><strong>Abandonment risk</strong><span>{persona.abandonment}</span></Meta>
            <Meta><strong>Delight signal</strong><span>{persona.delightedBy}</span></Meta>
            <Actions>
              <Primary type="button" onClick={() => openRoute({ route: persona.firstRoute, access: BETA_APP_CATALOG.find((app) => app.route === persona.firstRoute)?.access ?? "session" })}>
                <ArrowRight size={16} /> First useful tool
              </Primary>
              <Ghost type="button" onClick={() => openRoute({ route: persona.nextRoute, access: BETA_APP_CATALOG.find((app) => app.route === persona.nextRoute)?.access ?? "session" })}>
                Next related tool
              </Ghost>
            </Actions>
          </Feature>
          <JourneyCommandPanel data-beta-journey-command-center data-beta-journey-persona={selectedJourneyCommand.key}>
            <Small>Journey command center</Small>
            <h3>{selectedJourneyCommand.question}</h3>
            <p>{selectedJourneyCommand.promise}</p>
            <JourneyStepGrid>
              {selectedJourneyCommand.steps.map((step, index) => (
                <JourneyStepButton
                  key={`${selectedJourneyCommand.key}-${step.key}-${step.route}`}
                  type="button"
                  data-beta-journey-step
                  data-beta-journey-step-key={step.key}
                  data-beta-journey-step-access={step.access}
                  onClick={() => openKnownRoute(step.route, step.access)}
                >
                  <StepIndex>{index + 1}</StepIndex>
                  <span>
                    <strong>{step.label}</strong>
                    <em>{accessLabel(step.access)} / {step.route}</em>
                    <b>{step.action}</b>
                    <small>{step.proof}</small>
                  </span>
                </JourneyStepButton>
              ))}
            </JourneyStepGrid>
            <Meta><strong>The Count watches</strong><span>{selectedJourneyCommand.countReview}</span></Meta>
            <Meta><strong>Success</strong><span>{selectedJourneyCommand.success}</span></Meta>
          </JourneyCommandPanel>
          <CardGrid>
            {personaApps.map((app) => <MiniApp key={app.id} app={app} openRoute={openRoute} />)}
          </CardGrid>
        </Panel>

        <Panel data-beta-social-pulse>
          <Title><Activity size={18} /> Social Pulse</Title>
          <p>Users should feel that other people exist, are active, are earning, are making things, and may need their attention today.</p>
          <NotificationGroupList data-beta-notification-groups>
            {BETA_NOTIFICATION_GROUPS.map((group) => (
              <PulseGroup key={group.key} data-beta-notification-group>
                <Small>{group.userQuestion}</Small>
                <h3>{group.label}</h3>
                <p>{group.purpose}</p>
                {(notificationEventsByGroup.get(group.key) ?? []).map((event) => (
                  <PulseEvent key={event.label} data-beta-notification-event>
                    <Bell size={15} />
                    <span><strong>{event.label}</strong>{event.retentionValue}</span>
                  </PulseEvent>
                ))}
                <Meta><strong>Return loop</strong><span>{group.returnLoop}</span></Meta>
                <Ghost type="button" onClick={() => openRoute({ route: group.route, access: group.access })}>Open {group.label}</Ghost>
              </PulseGroup>
            ))}
          </NotificationGroupList>
        </Panel>
      </TwoCol>

      <Band data-beta-notification-control-map>
        <SectionHead>
          <div>
            <Title><Bell size={18} /> Notification Control Map</Title>
            <p>Notifications should teach where to act, where to tune, and where to catch up. Beta keeps delivery and preference logic in the existing Notification Center, System Settings, Digest, and preferences API contract.</p>
          </div>
          <NowSummary>
            <strong>{BETA_NOTIFICATION_CONTROL_GUIDE.length}</strong>
            <span>preference-backed loops</span>
          </NowSummary>
        </SectionHead>
        <NotificationControlGrid>
          {BETA_NOTIFICATION_CONTROL_GUIDE.map((guide) => {
            const group = notificationGroupByKey.get(guide.key);
            return (
              <NotificationControlCard key={guide.key} data-beta-notification-control-card>
                <Small>{group?.userQuestion ?? "Notification control"}</Small>
                <h3>{guide.label}</h3>
                <p>{guide.signal}</p>
                <Meta><strong>User control</strong><span>{guide.userControl}</span></Meta>
                <Meta><strong>Owns the action</strong><span>{group?.label ?? guide.label}: {guide.actionRoute}</span></Meta>
                <Meta>
                  <strong>Preferences</strong>
                  <span data-beta-notification-preference-route>System Settings {guide.preferenceRoute} reads and saves {guide.sourceContract}</span>
                </Meta>
                <Meta><strong>Catch up</strong><span>Digest {guide.digestRoute} summarizes missed notification context without replacing the owning route.</span></Meta>
                <Meta><strong>Quiet rule</strong><span>{guide.quietRule}</span></Meta>
                <ControlActions>
                  <Primary type="button" onClick={() => openRoute({ route: guide.actionRoute, access: guide.actionAccess })}>Act here</Primary>
                  <Ghost type="button" onClick={() => openRoute({ route: guide.preferenceRoute, access: guide.preferenceAccess })}>Tune Settings</Ghost>
                  <Ghost type="button" onClick={() => openRoute({ route: guide.digestRoute, access: guide.digestAccess })}>Open Digest</Ghost>
                </ControlActions>
                <RouteRow data-beta-notification-source-contract><code>{guide.sourceContract}</code></RouteRow>
              </NotificationControlCard>
            );
          })}
        </NotificationControlGrid>
      </Band>

      <Band data-beta-social-map>
        <SectionHead>
          <div>
            <Title><Users size={18} /> Communication Map</Title>
            <p>WTFOS social surfaces work best as a chain: public proof, shared feed, direct conversation, live gathering, recap, and external broadcast. Beta makes that chain explicit before users wander through app names.</p>
          </div>
        </SectionHead>
        <CardGrid>
          {BETA_COMMUNICATION_MAP.map((surface) => (
            <Info key={surface.key} data-beta-communication-surface>
              <Small>{surface.role}</Small>
              <h3>{surface.label}</h3>
              <p>{surface.useWhen}</p>
              <Meta><strong>Feeds</strong><span>{surface.feeds}</span></Meta>
              <Meta><strong>Before</strong><span>{surface.before}</span></Meta>
              <Meta><strong>After</strong><span>{surface.after}</span></Meta>
              <Meta><strong>Return tomorrow</strong><span>{surface.returnReason}</span></Meta>
              <Primary type="button" onClick={() => openRoute({ route: surface.route, access: surface.access })}>Open {surface.label}</Primary>
            </Info>
          ))}
        </CardGrid>
      </Band>

      <Band data-beta-unlock-loop>
        <SectionHead>
          <div>
            <Title><ShieldCheck size={18} /> Discovery Unlocks</Title>
            <p>WTFOS discovery becomes manageable when existing EXP levels, side quests, challenges, roles, rewards, and market sinks are sequenced.</p>
          </div>
          <LevelGrid>
            {BETA_XP_LEVELS.map((level) => <Level key={level.key}><strong>{level.label}</strong><span>{level.minXp} EXP</span></Level>)}
          </LevelGrid>
        </SectionHead>
        <CardGrid>
          {BETA_UNLOCK_LADDER.map((step, index) => (
            <Unlock key={step.label}>
              <Index>{index + 1}</Index>
              <h3>{step.label}</h3>
              <Small>{step.gate}</Small>
              <p>{step.playerAction}</p>
              <Meta><strong>System backbone</strong><span>{step.systemBackbone}</span></Meta>
              <Meta><strong>The Count controls</strong><span>{step.adminControl}</span></Meta>
            </Unlock>
          ))}
        </CardGrid>
      </Band>

      <Band id="beta-count" data-beta-count-puppet>
        <CountHero>
          <div>
            <Small>{BETA_COUNT_ADMIN_PUPPET.role} puppet</Small>
            <h2>{BETA_COUNT_ADMIN_PUPPET.label}</h2>
            <p>{BETA_COUNT_ADMIN_PUPPET.promise}</p>
          </div>
          <Panel>
            <Meta><strong>Admin confusion</strong><span>{BETA_COUNT_ADMIN_PUPPET.confusion}</span></Meta>
            <Meta><strong>Failure mode</strong><span>{BETA_COUNT_ADMIN_PUPPET.failure}</span></Meta>
            <Meta><strong>Hesitation</strong><span>{BETA_COUNT_ADMIN_PUPPET.hesitation}</span></Meta>
            <Meta><strong>Abandonment risk</strong><span>{BETA_COUNT_ADMIN_PUPPET.abandonment}</span></Meta>
            <Meta><strong>Delight signal</strong><span>{BETA_COUNT_ADMIN_PUPPET.delightedBy}</span></Meta>
            <Primary type="button" onClick={() => openRoute({ route: "/admin", access: "admin" })}>Open admin suite</Primary>
          </Panel>
        </CountHero>
        <AdminSummaryPanel data-beta-count-admin-summary>
          <AdminSummaryHead>
            <Title><ShieldCheck size={18} /> Count Admin Summary</Title>
            <p>Beta only shows live counts to The Count after the current session passes existing admin API gates. Everyone else sees the boundary and the reason that surface matters.</p>
          </AdminSummaryHead>
          <AdminSummaryGrid>
            {adminSummaryCards.map((card) => (
              <AdminSummaryCard
                key={card.source.key}
                data-beta-count-admin-summary-card
                data-beta-count-admin-summary-state={card.state}
                $state={card.state}
              >
                <Small>{card.state}</Small>
                <h3>{card.source.label}</h3>
                <strong>{card.value}</strong>
                <p>{card.detail}</p>
                <Meta><strong>Count watches</strong><span>{card.source.purpose}</span></Meta>
                <Meta><strong>Source</strong><span>{card.source.endpoint}</span></Meta>
                <Primary type="button" onClick={() => openRoute({ route: card.source.route, access: card.source.access })}>Open admin review</Primary>
              </AdminSummaryCard>
            ))}
          </AdminSummaryGrid>
        </AdminSummaryPanel>
        <WorkbenchPanel data-beta-count-admin-workbench>
          <SectionHead>
            <div>
              <Title><ShieldCheck size={18} /> Count Admin Workbench</Title>
              <p>Pick the liveops job before touching a control. Beta maps each management need to the existing admin route, player route, evidence, checklist, decision gate, risk control, and success signal.</p>
            </div>
            <NowSummary>
              <strong>{BETA_COUNT_ADMIN_WORKBENCH.length}</strong>
              <span>admin jobs mapped</span>
            </NowSummary>
          </SectionHead>
          <WorkbenchGrid>
            {BETA_COUNT_ADMIN_WORKBENCH.map((item) => (
              <WorkbenchCard
                key={item.key}
                data-beta-count-admin-workflow
                data-beta-count-admin-workflow-key={item.key}
              >
                <Small>{item.ownerSurface}</Small>
                <h3>{item.label}</h3>
                <strong>{item.question}</strong>
                <Meta><strong>Admin job</strong><span>{item.adminJob}</span></Meta>
                <Meta><strong>Player need</strong><span>{item.playerNeed}</span></Meta>
                <Meta><strong>Source of truth</strong><span>{item.sourceOfTruth}</span></Meta>
                <Checklist data-beta-count-admin-checklist>
                  {item.setupChecklist.map((check) => <li key={check} data-beta-count-admin-check>{check}</li>)}
                </Checklist>
                <Meta><strong>Decision gate</strong><span>{item.decisionGate}</span></Meta>
                <Meta><strong>Proof to inspect</strong><span>{item.proofToInspect}</span></Meta>
                <Meta><strong>Risk control</strong><span>{item.riskControl}</span></Meta>
                <Meta><strong>Success signal</strong><span>{item.successSignal}</span></Meta>
                <RouteRow aria-label={`${item.label} workbench routes`}>
                  {[item.adminRoute, item.playerRoute, ...item.relatedRoutes].map((route) => <code key={route}>{route}</code>)}
                </RouteRow>
                <ControlActions>
                  <Primary type="button" onClick={() => openKnownRoute(item.adminRoute, item.adminAccess)}>Open admin review</Primary>
                  <Ghost type="button" onClick={() => openKnownRoute(item.playerRoute, item.playerAccess)}>Open player route</Ghost>
                  <Ghost type="button" onClick={() => openKnownRoute(item.relatedRoutes[0] ?? item.playerRoute)}>Open evidence route</Ghost>
                </ControlActions>
              </WorkbenchCard>
            ))}
          </WorkbenchGrid>
        </WorkbenchPanel>
        <RecipePanel data-beta-count-liveops-recipes>
          <SectionHead>
            <div>
              <Title><ShieldCheck size={18} /> Count Liveops Recipe Board</Title>
              <p>Recipes translate user need into an admin-safe sequence across existing EXP, side quest, challenge, reward, role, market, notification, and app-gate surfaces. They are blueprints only: beta does not create, grant, settle, or publish anything.</p>
            </div>
            <NowSummary>
              <strong>{BETA_COUNT_LIVEOPS_RECIPES.length}</strong>
              <span>unlock recipes</span>
            </NowSummary>
          </SectionHead>
          <RecipeGrid>
            {BETA_COUNT_LIVEOPS_RECIPES.map((recipe) => (
              <RecipeCard
                key={recipe.key}
                data-beta-count-liveops-recipe
                data-beta-count-liveops-recipe-key={recipe.key}
                data-beta-count-liveops-recipe-actor={recipe.actor}
              >
                <Small>{relationshipActorLabel(recipe.actor)} / {recipe.targetLevel}</Small>
                <h3>{recipe.label}</h3>
                <strong>{recipe.userNeed}</strong>
                <RecipeMetaGrid>
                  <Meta><strong>EXP use</strong><span>{recipe.expUse}</span></Meta>
                  <Meta><strong>Side quest</strong><span>{recipe.sideQuest}</span></Meta>
                  <Meta><strong>Challenge</strong><span>{recipe.challenge}</span></Meta>
                  <Meta><strong>Reward</strong><span>{recipe.reward}</span></Meta>
                  <Meta><strong>Role or permission</strong><span>{recipe.roleOrPermission}</span></Meta>
                  <Meta><strong>Market or notification</strong><span>{recipe.marketOrNotificationEffect}</span></Meta>
                </RecipeMetaGrid>
                <RecipeStageList aria-label={`${recipe.label} route stages`}>
                  {recipe.stages.map((stage) => (
                    <RecipeStageButton
                      type="button"
                      key={`${recipe.key}-${stage.key}`}
                      data-beta-count-liveops-recipe-stage
                      data-beta-count-liveops-recipe-route={stage.route}
                      onClick={() => openKnownRoute(stage.route, stage.access)}
                    >
                      <span>{stage.label}</span>
                      <strong>{stage.ownerSurface}</strong>
                      <small>{accessLabel(stage.access)} / {stage.route}</small>
                      <em>{stage.countAction}</em>
                    </RecipeStageButton>
                  ))}
                </RecipeStageList>
                <Meta><strong>The Count decides</strong><span>{recipe.countDecision}</span></Meta>
                <Meta><strong>Anti-farm rule</strong><span>{recipe.antiFarmRule}</span></Meta>
                <Meta><strong>Player return</strong><span>{recipe.playerReturn}</span></Meta>
                <Meta><strong>No beta write</strong><span>{recipe.noWriteRule}</span></Meta>
              </RecipeCard>
            ))}
          </RecipeGrid>
        </RecipePanel>
        <CardGrid>
          {BETA_COUNT_ADMIN_STORIES.map((story) => (
            <Story key={story.title} data-beta-count-story>
              <Small>{story.adminSurface}</Small>
              <h3>{story.title}</h3>
              <p>{story.story}</p>
              <Meta><strong>User need</strong><span>{story.playerNeed}</span></Meta>
              <Meta><strong>Acceptance</strong><span>{story.acceptance}</span></Meta>
            </Story>
          ))}
        </CardGrid>
        <SectionSubhead>
          <Title><ShieldCheck size={18} /> Count Liveops Command Deck</Title>
          <p>These cards translate the same unlock loop into admin-safe operations: what triggered the need, which existing surface owns it, what proof The Count should inspect, and what risk control keeps rewards fair.</p>
        </SectionSubhead>
        <CardGrid>
          {BETA_COUNT_LIVEOPS_COMMANDS.map((command) => (
            <CommandCard key={command.key} data-beta-count-command>
              <Small>{command.ownerSurface}</Small>
              <h3>{command.label}</h3>
              <Meta><strong>Trigger</strong><span>{command.trigger}</span></Meta>
              <Meta><strong>Admin action</strong><span>{command.adminAction}</span></Meta>
              <Meta><strong>Player outcome</strong><span>{command.playerOutcome}</span></Meta>
              <Meta><strong>Audit proof</strong><span>{command.auditProof}</span></Meta>
              <Meta><strong>Risk control</strong><span>{command.riskControl}</span></Meta>
              <Primary type="button" onClick={() => openRoute({ route: command.route, access: command.access })}>Open owner surface</Primary>
            </CommandCard>
          ))}
        </CardGrid>
      </Band>

      <Band id="beta-atlas" data-beta-app-atlas>
        <SectionHead>
          <div>
            <Title><Search size={18} /> App Visibility Atlas</Title>
            <p>{BETA_RECOMMENDED_MODEL} Use tier, stage, and puppet filters before hiding anything; every card still opens an existing WTFOS route with its current gate.</p>
          </div>
          <SearchBox>
            <Search size={16} />
            <input aria-label="Search beta app atlas" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tools, routes, purposes" />
          </SearchBox>
        </SectionHead>
        <AtlasControls aria-label="App atlas filters">
          <FilterGroup data-beta-app-atlas-tier-filter>
            <Small>Visibility tier</Small>
            <FilterButtons>
              <FilterButton type="button" $active={atlasTier === "all"} aria-pressed={atlasTier === "all"} onClick={() => setAtlasTier("all")}>All tiers</FilterButton>
              {([1, 2, 3, 4, 5] as const).map((tier) => (
                <FilterButton
                  key={tier}
                  type="button"
                  $active={atlasTier === tier}
                  aria-pressed={atlasTier === tier}
                  onClick={() => setAtlasTier(tier)}
                >
                  Tier {tier}
                </FilterButton>
              ))}
            </FilterButtons>
          </FilterGroup>
          <FilterGroup data-beta-app-atlas-stage-filter>
            <Small>User stage</Small>
            <FilterButtons>
              <FilterButton type="button" $active={atlasStage === "all"} aria-pressed={atlasStage === "all"} onClick={() => setAtlasStage("all")}>All stages</FilterButton>
              {(Object.keys(BETA_STAGE_LABELS) as BetaStage[]).map((stage) => (
                <FilterButton
                  key={stage}
                  type="button"
                  $active={atlasStage === stage}
                  aria-pressed={atlasStage === stage}
                  onClick={() => setAtlasStage(stage)}
                >
                  {BETA_STAGE_LABELS[stage]}
                </FilterButton>
              ))}
            </FilterButtons>
          </FilterGroup>
          <FilterGroup data-beta-app-atlas-persona-filter>
            <Small>Puppet path</Small>
            <FilterButtons>
              <FilterButton type="button" $active={atlasPersona === "all"} aria-pressed={atlasPersona === "all"} onClick={() => setAtlasPersona("all")}>All puppets</FilterButton>
              {BETA_PERSONAS.map((item) => (
                <FilterButton
                  key={item.key}
                  type="button"
                  $active={atlasPersona === item.key}
                  aria-pressed={atlasPersona === item.key}
                  onClick={() => setAtlasPersona(item.key)}
                >
                  {item.label}
                </FilterButton>
              ))}
            </FilterButtons>
          </FilterGroup>
        </AtlasControls>
        <AtlasSummary data-beta-app-atlas-summary>
          <strong>{filteredApps.length}/{BETA_APP_CATALOG.length}</strong>
          <span>
            showing {atlasTier === "all" ? "all tiers" : BETA_TIER_LABELS[atlasTier]} · {atlasStage === "all" ? "all stages" : BETA_STAGE_LABELS[atlasStage]} · {attentionAudienceLabel(atlasPersona)}
          </span>
          <Ghost type="button" onClick={resetAtlasFilters}>Reset atlas filters</Ghost>
        </AtlasSummary>
        {filteredApps.length > 0 ? (
          <CardGrid>
            {filteredApps.map((app) => <AppCard key={app.id} app={app} openRoute={openRoute} />)}
          </CardGrid>
        ) : (
          <AtlasEmpty data-beta-app-atlas-empty>
            <h3>No existing route matches those filters.</h3>
            <p>Beta should explain, group, and route before hiding apps. Reset filters or loosen the search to keep discovery reversible.</p>
            <Ghost type="button" onClick={resetAtlasFilters}>Reset atlas filters</Ghost>
          </AtlasEmpty>
        )}
      </Band>

      <Band>
        <Title>Desktop Review</Title>
        <CardGrid>{BETA_DESKTOP_MODEL_REVIEW.map((item) => <Info key={item.model}><h3>{item.model}</h3><p>{item.verdict}</p><Small>{item.risk}</Small></Info>)}</CardGrid>
      </Band>
    </Shell>
  );
}

function statusLabel(status: BetaVisibilityStatus): string {
  if (status === "direct") return "Directly visible";
  if (status === "routed") return "Routed";
  return "Weak signal";
}

function accessLabel(access: BetaAppCatalogEntry["access"]): string {
  if (access === "admin") return "Admin only";
  if (access === "role") return "Role gated";
  if (access === "session") return "Sign-in step";
  return "Public";
}

function compassAccessLabel(access: BetaSectionCompassAccess): string {
  if (access === "mixed") return "Mixed gates";
  return accessLabel(access);
}

function frictionStatusLabel(status: BetaFrictionQueueStatus): string {
  if (status === "strengthen") return "Strengthen next";
  if (status === "watch") return "Watch with proof";
  return "Keep current path";
}

function peopleProofStatusLabel(status: BetaPeopleProofStatus): string {
  if (status === "direct") return "Direct proof";
  if (status === "routed") return "Routed proof";
  return "Weak proof";
}

function relationshipActorLabel(actor: BetaRelationshipActorKey): string {
  if (actor === "the-count") return "The Count";
  if (actor === "all-users") return "All users";
  return BETA_PERSONAS.find((persona) => persona.key === actor)?.label ?? actor;
}

function countAdminSummarySource(key: BetaCountAdminSummaryKey): BetaCountAdminSummarySource {
  const source = BETA_COUNT_ADMIN_SUMMARY_SOURCES.find((item) => item.key === key);
  if (!source) throw new Error(`Missing beta Count admin summary source: ${key}`);
  return source;
}

function adminSummaryState(isAdmin: boolean, isLoading: boolean, isError: boolean): BetaAdminSummaryState {
  if (!isAdmin) return "Locked";
  if (isLoading) return "Loading";
  if (isError) return "Unavailable";
  return "Live";
}

function adminSummaryValue(state: BetaAdminSummaryState, liveValue: string): string {
  if (state === "Locked") return "Admin only";
  if (state === "Loading") return "Checking...";
  if (state === "Unavailable") return "Unavailable";
  return liveValue;
}

function adminSummaryDetail(source: BetaCountAdminSummarySource, state: BetaAdminSummaryState, liveDetail: string): string {
  if (state === "Locked" || state === "Unavailable") return source.failureCopy;
  if (state === "Loading") return `Reading ${source.endpoint} through the existing strict admin gate.`;
  return liveDetail;
}

function arrayCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function numberValue(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function adminUsersCount(users: unknown, stats: BetaAdminStatsResponse | undefined): number {
  const directCount = arrayCount(users);
  return directCount > 0 ? directCount : numberValue(stats?.users);
}

type TrailStateTone = "quiet" | "protected" | "unavailable" | "admin";

function trailStateRows(trail: BetaDiscoveryTrail, signals: BetaRenderedNowSignal[]): Array<{
  key: TrailStateTone;
  label: string;
  count: number;
  copy: string;
  tone: TrailStateTone;
}> {
  const copy = BETA_TRAIL_STATE_COPY[trail.key];
  const quietCount = signals.filter((signal) => signal.state === "Quiet").length;
  const unavailableCount = signals.filter((signal) => signal.state === "Unavailable").length;
  const protectedCount = trail.steps.filter((step) => step.access === "session" || step.access === "role").length;
  const adminOnlyCount = trail.steps.filter((step) => step.access === "admin").length;
  return [
    { key: "quiet", label: "Quiet data", count: quietCount, copy: copy.quiet, tone: "quiet" },
    { key: "protected", label: "Protected data", count: protectedCount, copy: copy.protected, tone: "protected" },
    { key: "unavailable", label: "Unavailable provider", count: unavailableCount, copy: copy.unavailable, tone: "unavailable" },
    { key: "admin", label: "Admin-only data", count: adminOnlyCount, copy: copy.adminOnly, tone: "admin" },
  ];
}

function signalState(isLoading: boolean, isError: boolean, hasRows: boolean): BetaSignalState {
  if (isLoading) return "Loading";
  if (isError) return "Unavailable";
  return hasRows ? "Live" : "Quiet";
}

function peopleDiscoveryState(signals: BetaRenderedNowSignal[]): BetaSignalState {
  if (signals.some((signal) => signal.state === "Live")) return "Live";
  if (signals.some((signal) => signal.state === "Loading")) return "Loading";
  if (signals.length > 0 && signals.every((signal) => signal.state === "Unavailable")) return "Unavailable";
  if (signals.some((signal) => signal.state === "Protected")) return "Protected";
  return "Quiet";
}

async function betaReadOnlyGet<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Beta read-only signal failed: ${response.status}`);
  return response.json() as Promise<T>;
}

function endpointForNowSignal(key: BetaNowSignalKey, options: { username?: string } = {}): string {
  const source = findBetaNowSignalSource(key);
  if (key === "profile-activity") return source.endpoint.replace(":username", encodeURIComponent(options.username || "wtf-admin"));
  if (key !== "calendar-events") return source.endpoint;
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 21);
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
    includeExternal: "1",
  });
  return `${source.endpoint}?${params.toString()}`;
}

function collectionFromUnknown<T>(value: unknown, keys: string[]): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as T[];
  }
  return [];
}

function firstShelfItem(data: BetaGameDiscoveryResponse | undefined): BetaGameShelfItem | undefined {
  return data?.popular?.[0] ?? data?.newest?.[0] ?? data?.creator?.[0] ?? data?.studio?.[0] ?? data?.sourceArcade?.[0];
}

function displayLeaderboardName(entry: LeaderboardEntry): string {
  return entry.displayName || entry.username || entry.tezDomain || entry.alias || `${entry.address.slice(0, 8)}...${entry.address.slice(-5)}`;
}

function displayUserName(entry: { displayName?: string | null; username?: string | null }): string {
  return entry.displayName || entry.username || "WTFOS user";
}

function displayListingName(entry: MarketplaceListing): string {
  return entry.tokenName || entry.title || entry.name || entry.sellerDisplayName || entry.sellerUsername || "Marketplace listing";
}

function displayTradeBoardItem(entry: BetaTradeBoardItem): string {
  return entry.tokenName || entry.collectionName || [entry.tokenContract, entry.tokenId].filter(Boolean).join(" #") || "Trade-board object";
}

function displayTradeBoardOwner(entry: BetaTradeBoardItem): string {
  return entry.ownerDisplayName || entry.ownerUsername || shortenWallet(entry.ownerWallet) || "collector";
}

function displayActivityReason(reason: string | null | undefined): string {
  if (!reason) return "WTFOS activity";
  return reason
    .replace(/^daily_loop:/, "")
    .replace(/[_:]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayEventDate(value: string | null | undefined): string {
  if (!value) return "date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "date unavailable";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function shortenWallet(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length <= 14) return value;
  return `${value.slice(0, 7)}...${value.slice(-5)}`;
}

function displayLiveRoomPresence(presence: NonNullable<NonNullable<BetaWtfLiveRoomResponse["room"]>["presence"]> | undefined): string {
  const count = Number(presence?.participantCount ?? 0);
  const active = Boolean(presence?.active);
  const mediaCount =
    Number(presence?.audioOpenCount ?? 0) +
    Number(presence?.videoShareCount ?? 0) +
    Number(presence?.cameraShareCount ?? 0) +
    Number(presence?.screenShareCount ?? 0);
  if (count > 0) return `${compactNumber(count)} participant${count === 1 ? "" : "s"} now, ${compactNumber(mediaCount)} media signal${mediaCount === 1 ? "" : "s"}`;
  return active ? "Room is active with no counted participants yet" : "Official room is quiet but open for public guest discovery.";
}

function displayCalendarEvent(event: BetaCalendarEvent): string {
  const when = event.startsAt ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(event.startsAt)) : "Date TBD";
  const source = event.sourceProvider ? `${event.sourceProvider.toUpperCase()} event` : "public event";
  return `${when} · ${event.location || source}`;
}

function displayChannelOwner(channel: BetaTvChannel | undefined): string {
  if (!channel) return "unknown";
  return channel.ownerDisplayName || channel.ownerUsername || "WTFOS creator";
}

function proofSourceLabels(source: BetaPublicProofSource): string {
  return source.sourceKeys.map((key) => findBetaNowSignalSource(key).label).join(" + ");
}

function attentionCadenceLabel(cadence: BetaAttentionCadence): string {
  if (cadence === "admin") return "Admin review";
  if (cadence === "tomorrow") return "Return tomorrow";
  return cadence === "now" ? "Act now" : "Next best step";
}

function attentionAudienceLabel(audience: string): string {
  if (audience === "all") return "all puppet paths";
  if (audience === "all-users") return "All users";
  if (audience === "the-count") return "The Count";
  const persona = BETA_PERSONAS.find((item) => item.key === audience);
  return persona?.label ?? audience;
}

function compactNumber(value: number | string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return new Intl.NumberFormat("en", { notation: n >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
}

function wayfinderIcon(key: string) {
  if (key === "people-now") return <Users size={17} />;
  if (key === "object-hunt" || key === "find-tool") return <Search size={17} />;
  if (key === "creator-runway" || key === "builder-output") return <Activity size={17} />;
  if (key === "count-review") return <ShieldCheck size={17} />;
  if (key === "safe-first-win" || key === "choose-path") return <ArrowRight size={17} />;
  return <Compass size={17} />;
}

function MiniApp({ app, openRoute }: { app: BetaAppCatalogEntry; openRoute: (app: Pick<BetaAppCatalogEntry, "route" | "access">) => void }) {
  return <Info><Small>{BETA_TIER_LABELS[app.tier]}</Small><h3>{app.title}</h3><p>{app.userBenefit}</p><IconButton type="button" onClick={() => openRoute(app)} aria-label={`Open ${app.title}`}><ExternalLink size={15} /></IconButton></Info>;
}

function AppCard({ app, openRoute }: { app: BetaAppCatalogEntry; openRoute: (app: Pick<BetaAppCatalogEntry, "route" | "access">) => void }) {
  return <Info data-beta-app-card><Small>{BETA_TIER_LABELS[app.tier]} / {BETA_STAGE_LABELS[app.stage]}</Small><h3>{app.title}</h3><p>{app.purpose}</p><Meta><strong>Use when</strong><span>{app.whenToUse}</span></Meta><RouteRow>{app.related.slice(0, 3).map((route) => <code key={route}>{route}</code>)}</RouteRow><Primary type="button" onClick={() => openRoute(app)}>{app.betaAction}</Primary></Info>;
}

const Shell = styled.main`
  --ink: #172033;
  --muted: #536170;
  --line: #d8e0ea;
  --blue: #2358d6;
  --teal: #007f7a;
  --green: #1b7f43;
  --rose: #b23a5b;
  --amber: #b56a00;
  min-height: 100vh;
  overflow-x: hidden;
  color: var(--ink);
  background: linear-gradient(135deg, rgba(35, 88, 214, 0.08), transparent 36%), linear-gradient(315deg, rgba(0, 127, 122, 0.08), transparent 40%), #f8fafc;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  *, *::before, *::after { box-sizing: border-box; }
`;
const TopBar = styled.header`
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  justify-content: space-between;
  gap: 14px;
  padding: 12px clamp(16px, 4vw, 48px);
  border-bottom: 1px solid rgba(23, 32, 51, 0.12);
  background: rgba(248, 250, 252, 0.93);
  backdrop-filter: blur(14px);
  @media (max-width: 720px) { position: relative; flex-direction: column; }
`;
const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  img { width: 36px; height: 36px; border: 1px solid var(--line); border-radius: 8px; background: #fff; padding: 5px; }
  strong, span { display: block; }
  span { color: var(--muted); font-size: 12px; font-weight: 700; }
`;
const Actions = styled.div`display: flex; gap: 10px; flex-wrap: wrap;`;
const LoopConsole = styled.section`display: grid; grid-template-columns: minmax(280px, 0.75fr) minmax(0, 1.25fr); gap: 16px; align-items: stretch; @media (max-width: 940px) { grid-template-columns: 1fr; }`;
const ScanGrid = styled.div`display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 14px;`;
const MetricGrid = styled.div`display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; @media (max-width: 620px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }`;
const Metric = styled.div`min-height: 78px; border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: #fff; strong, span { display: block; } strong { color: var(--blue); font-size: 24px; line-height: 1; } span { margin-top: 7px; color: var(--muted); font-size: 12px; font-weight: 850; text-transform: uppercase; }`;
const AgentPanel = styled.article`
  display: grid; gap: 12px; border: 1px solid rgba(0, 127, 122, 0.22); border-radius: 8px; padding: 16px; background: linear-gradient(135deg, rgba(0, 127, 122, 0.09), rgba(27, 127, 67, 0.06)), #fff;
  h2 { margin: 0; font-size: clamp(24px, 3vw, 40px); line-height: 1.05; letter-spacing: 0; }
  p { margin: 0; color: var(--muted); line-height: 1.45; }
`;
const RetestSummary = styled.div`
  border: 1px solid rgba(0, 127, 122, 0.28);
  border-radius: 8px;
  padding: 14px;
  background: #f0fbf8;
  strong, span, small { display: block; }
  strong { color: var(--teal); font-size: 42px; line-height: 1; }
  span { margin-top: 7px; color: var(--muted); font-weight: 850; }
  small { margin-top: 8px; color: var(--ink); font-size: 12px; line-height: 1.35; }
`;
const RetestGrid = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(282px, 1fr)); gap: 12px; margin-top: 12px;`;
const RetestCard = styled.article`
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 520px;
  border: 1px solid rgba(0, 127, 122, 0.22);
  border-radius: 8px;
  padding: 14px;
  background: #fff;
  h3 { margin: 0; font-size: 20px; line-height: 1.12; }
`;
const RetestDelta = styled.div`
  border: 1px solid rgba(27, 127, 67, 0.24);
  border-radius: 8px;
  padding: 12px;
  background: #f7fcf8;
  strong, span { display: block; }
  strong { color: var(--green); font-size: 34px; line-height: 1; }
  span { margin-top: 6px; color: var(--muted); font-size: 13px; line-height: 1.35; font-weight: 750; }
`;
const RetestMetricList = styled.div`display: grid; gap: 7px;`;
const RetestMetricRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px 8px;
  align-items: center;
  min-height: 48px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 9px;
  background: #f8fafc;
  span { color: var(--muted); font-size: 12px; line-height: 1.25; font-weight: 850; text-transform: uppercase; }
  strong { color: var(--ink); font-size: 13px; line-height: 1.25; white-space: nowrap; }
  em { grid-column: 1 / -1; color: var(--green); font-size: 12px; line-height: 1.25; font-style: normal; font-weight: 850; }
  @media (max-width: 420px) {
    grid-template-columns: 1fr;
    strong { white-space: normal; }
  }
`;
const FrictionQueueGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(304px, 1fr));
  gap: 12px;
  margin-top: 12px;
`;
const FrictionQueueCard = styled.article`
  display: grid;
  align-content: start;
  gap: 10px;
  min-width: 0;
  min-height: 650px;
  border: 1px solid rgba(181, 106, 0, 0.28);
  border-radius: 8px;
  padding: 14px;
  background: #fff;
  @media (max-width: 440px) { min-height: 0; }
`;
const FrictionQueueLead = styled.div`
  display: grid;
  align-content: start;
  gap: 8px;
  min-height: 154px;
  h3 { margin: 0; font-size: 22px; line-height: 1.12; overflow-wrap: anywhere; }
  p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.42; overflow-wrap: anywhere; }
`;
const FrictionRelatedRoutes = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  code {
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 4px 7px;
    background: #f8fafc;
    color: var(--blue);
    font-size: 11px;
    line-height: 1.2;
    white-space: normal;
    overflow-wrap: anywhere;
  }
`;
const PuppetMemoryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(314px, 1fr));
  gap: 12px;
  margin-top: 12px;
`;
const PuppetMemoryCard = styled.article`
  display: grid;
  align-content: start;
  gap: 10px;
  min-width: 0;
  min-height: 820px;
  border: 1px solid rgba(35, 88, 214, 0.22);
  border-radius: 8px;
  padding: 14px;
  background: #fff;
  @media (max-width: 440px) { min-height: 0; }
`;
const PuppetMemoryLead = styled.div`
  display: grid;
  align-content: start;
  gap: 8px;
  min-height: 138px;
  h3 { margin: 0; font-size: 20px; line-height: 1.15; overflow-wrap: anywhere; }
  p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.42; overflow-wrap: anywhere; }
`;
const CheckpointGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  @media (max-width: 520px) { grid-template-columns: 1fr; }
`;
const CheckpointPill = styled.div<{ $passed: boolean }>`
  display: grid;
  gap: 4px;
  min-width: 0;
  min-height: 62px;
  border: 1px solid ${({ $passed }) => $passed ? "rgba(27, 127, 67, 0.32)" : "rgba(181, 106, 0, 0.34)"};
  border-radius: 8px;
  padding: 9px;
  background: ${({ $passed }) => $passed ? "#f7fcf8" : "#fffaf0"};
  span {
    color: ${({ $passed }) => $passed ? "var(--green)" : "var(--amber)"};
    font-size: 11px;
    line-height: 1.25;
    font-weight: 900;
    text-transform: uppercase;
  }
  strong { color: var(--ink); font-size: 13px; line-height: 1.25; overflow-wrap: anywhere; }
`;
const VisibilityScore = styled.div`border: 1px solid rgba(27, 127, 67, 0.28); border-radius: 8px; padding: 14px; background: #f0fbf4; strong, span { display: block; } strong { color: var(--green); font-size: 42px; line-height: 1; } span { margin-top: 7px; color: var(--muted); font-weight: 850; }`;
const NowSummary = styled(VisibilityScore)`background: #f7f9ff; border-color: rgba(35, 88, 214, 0.24); strong { color: var(--blue); }`;
const NowGrid = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; margin-top: 12px;`;
const NowCard = styled.article<{ $state: BetaSignalState }>`
  display: grid; align-content: start; gap: 10px; min-height: 320px; border: 1px solid ${({ $state }) => $state === "Live" ? "rgba(27, 127, 67, 0.34)" : $state === "Unavailable" ? "rgba(178, 58, 91, 0.34)" : "rgba(35, 88, 214, 0.22)"}; border-radius: 8px; padding: 14px; background: ${({ $state }) => $state === "Live" ? "#f7fcf8" : $state === "Unavailable" ? "#fff5f7" : "#fff"};
  h3 { margin: 0; font-size: 18px; line-height: 1.16; }
  strong { color: var(--ink); font-size: 17px; line-height: 1.25; }
  p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.4; }
`;
const ProtectedStrip = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; margin-top: 12px;`;
const ProtectedCard = styled.article`
  display: grid; align-content: start; gap: 8px; min-height: 210px; border: 1px dashed rgba(181, 106, 0, 0.42); border-radius: 8px; padding: 14px; background: #fffaf0;
  h3 { margin: 0; font-size: 17px; line-height: 1.16; }
  strong { color: var(--ink); font-size: 15px; line-height: 1.25; }
  p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.4; }
`;
const ProofGrid = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; margin-top: 12px;`;
const ProofCard = styled.article<{ $state: BetaSignalState }>`
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 390px;
  border: 1px solid ${({ $state }) => $state === "Live" ? "rgba(27, 127, 67, 0.34)" : $state === "Unavailable" ? "rgba(178, 58, 91, 0.34)" : "rgba(35, 88, 214, 0.22)"};
  border-radius: 8px;
  padding: 14px;
  background: ${({ $state }) => $state === "Live" ? "#f7fcf8" : $state === "Unavailable" ? "#fff5f7" : "#fff"};
  h3 { margin: 0; font-size: 19px; line-height: 1.15; }
  > strong { color: var(--ink); font-size: 18px; line-height: 1.22; }
  p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.4; }
  button { width: 100%; align-self: end; }
`;
const PeopleDiscoveryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(298px, 1fr));
  gap: 12px;
  margin-top: 12px;
`;
const PeopleDiscoveryCard = styled.article<{ $state: BetaSignalState }>`
  display: grid;
  align-content: start;
  gap: 10px;
  min-width: 0;
  min-height: 650px;
  border: 1px solid ${({ $state }) => $state === "Live" ? "rgba(27, 127, 67, 0.34)" : $state === "Protected" ? "rgba(181, 106, 0, 0.38)" : $state === "Unavailable" ? "rgba(178, 58, 91, 0.34)" : "rgba(35, 88, 214, 0.22)"};
  border-radius: 8px;
  padding: 14px;
  background: ${({ $state }) => $state === "Live" ? "#f7fcf8" : $state === "Protected" ? "#fffaf0" : $state === "Unavailable" ? "#fff5f7" : "#fff"};
  p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.42; overflow-wrap: anywhere; }
  @media (max-width: 430px) { min-height: 0; }
`;
const PeopleDiscoveryLead = styled.div`
  display: grid;
  align-content: start;
  gap: 7px;
  min-height: 118px;
  h3 { margin: 0; font-size: 20px; line-height: 1.14; overflow-wrap: anywhere; }
  > strong { color: var(--ink); font-size: 14px; line-height: 1.3; overflow-wrap: anywhere; }
`;
const PeopleSignalStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  @media (max-width: 540px) { grid-template-columns: 1fr; }
`;
const PeopleSignalPill = styled.button<{ $state: BetaSignalState }>`
  display: grid;
  align-content: start;
  gap: 4px;
  min-width: 0;
  min-height: 58px;
  border: 1px solid ${({ $state }) => $state === "Live" ? "rgba(27, 127, 67, 0.36)" : $state === "Protected" ? "rgba(181, 106, 0, 0.42)" : $state === "Unavailable" ? "rgba(178, 58, 91, 0.34)" : "rgba(35, 88, 214, 0.22)"};
  border-radius: 8px;
  padding: 8px;
  color: var(--ink);
  background: ${({ $state }) => $state === "Live" ? "#f7fcf8" : $state === "Protected" ? "#fff8eb" : $state === "Unavailable" ? "#fff5f7" : "#f8fafc"};
  font: inherit;
  text-align: left;
  cursor: pointer;
  span { color: var(--muted); font-size: 11px; line-height: 1.25; font-weight: 900; text-transform: uppercase; overflow-wrap: anywhere; }
  strong { color: var(--ink); font-size: 13px; line-height: 1.2; }
  &:focus-visible { outline: 3px solid rgba(35, 88, 214, 0.28); outline-offset: 2px; }
`;
const PeopleProofMatrix = styled.section`
  display: grid;
  gap: 12px;
  margin-top: 18px;
  border-top: 1px solid var(--line);
  padding-top: 18px;
`;
const PeopleProofGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(304px, 1fr));
  gap: 12px;
`;
const PeopleProofCard = styled.article<{ $status: BetaPeopleProofStatus }>`
  display: grid;
  align-content: start;
  gap: 10px;
  min-width: 0;
  min-height: 790px;
  border: 1px solid ${({ $status }) => $status === "direct" ? "rgba(27, 127, 67, 0.30)" : $status === "routed" ? "rgba(35, 88, 214, 0.26)" : "rgba(181, 106, 0, 0.34)"};
  border-radius: 8px;
  padding: 14px;
  background: ${({ $status }) => $status === "direct" ? "#f7fcf8" : $status === "routed" ? "#f7f9ff" : "#fffaf0"};
  h3 { margin: 0; font-size: 20px; line-height: 1.14; overflow-wrap: anywhere; }
  > strong { color: var(--ink); font-size: 15px; line-height: 1.28; }
  @media (max-width: 440px) {
    min-height: 0;
  }
`;
const AttentionTriageGrid = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(286px, 1fr)); gap: 12px; margin-top: 12px;`;
const AttentionCard = styled.article<{ $cadence: BetaAttentionCadence }>`
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 590px;
  border: 1px solid ${({ $cadence }) => $cadence === "admin" ? "rgba(178, 58, 91, 0.28)" : $cadence === "tomorrow" ? "rgba(181, 106, 0, 0.32)" : "rgba(35, 88, 214, 0.22)"};
  border-radius: 8px;
  padding: 14px;
  background: ${({ $cadence }) => $cadence === "admin" ? "#fff5f7" : $cadence === "tomorrow" ? "#fffaf0" : "#fff"};
  h3 { margin: 0; font-size: 19px; line-height: 1.15; }
  > strong { color: var(--ink); font-size: 15px; line-height: 1.3; }
  p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.42; }
  button:last-child { width: 100%; align-self: end; }
`;
const AttentionSignalStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  @media (max-width: 520px) { grid-template-columns: 1fr; }
`;
const AttentionSignalPill = styled.button<{ $state: BetaSignalState }>`
  display: grid;
  gap: 4px;
  min-width: 0;
  min-height: 58px;
  border: 1px solid ${({ $state }) => $state === "Live" ? "rgba(27, 127, 67, 0.36)" : $state === "Protected" ? "rgba(181, 106, 0, 0.42)" : $state === "Unavailable" ? "rgba(178, 58, 91, 0.34)" : "rgba(35, 88, 214, 0.22)"};
  border-radius: 8px;
  padding: 8px;
  color: var(--ink);
  background: ${({ $state }) => $state === "Live" ? "#f7fcf8" : $state === "Protected" ? "#fff8eb" : $state === "Unavailable" ? "#fff5f7" : "#f8fafc"};
  font: inherit;
  text-align: left;
  cursor: pointer;
  span { color: var(--muted); font-size: 11px; line-height: 1.25; font-weight: 900; text-transform: uppercase; overflow-wrap: anywhere; }
  strong { color: var(--ink); font-size: 13px; line-height: 1.2; }
  &:focus-visible { outline: 3px solid rgba(35, 88, 214, 0.28); outline-offset: 2px; }
`;
const DailyReturnGrid = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(286px, 1fr)); gap: 12px; margin-top: 12px;`;
const DailyReturnCard = styled.article`
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 520px;
  border: 1px solid rgba(35, 88, 214, 0.22);
  border-radius: 8px;
  padding: 14px;
  background: #fff;
  h3 { margin: 0; font-size: 19px; line-height: 1.15; }
  > strong { color: var(--ink); font-size: 15px; line-height: 1.3; }
  button { width: 100%; align-self: end; }
`;
const PassportGrid = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(302px, 1fr)); gap: 12px; margin-top: 12px;`;
const PassportCard = styled.article`
  display: grid;
  align-content: start;
  gap: 10px;
  min-width: 0;
  min-height: 760px;
  border: 1px solid rgba(35, 88, 214, 0.24);
  border-radius: 8px;
  padding: 14px;
  background: #fff;
  @media (max-width: 420px) {
    min-height: 0;
  }
`;
const PassportLead = styled.div`
  display: grid;
  align-content: start;
  gap: 8px;
  min-height: 124px;
  h3 { margin: 0; font-size: 20px; line-height: 1.15; }
  > strong { color: var(--ink); font-size: 15px; line-height: 1.32; overflow-wrap: anywhere; }
`;
const QuestlineGrid = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(310px, 1fr)); gap: 12px; margin-top: 12px;`;
const QuestlineCard = styled.article`
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 720px;
  border: 1px solid rgba(27, 127, 67, 0.24);
  border-radius: 8px;
  padding: 14px;
  background: #fff;
  h3 { margin: 0; font-size: 19px; line-height: 1.15; }
  p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.42; }
`;
const QuestStageList = styled.div`display: grid; gap: 8px; margin: 2px 0;`;
const QuestStageButton = styled.button`
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  gap: 4px 9px;
  align-items: start;
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px;
  color: var(--ink);
  background: #f8fafc;
  font: inherit;
  text-align: left;
  cursor: pointer;
  span { color: var(--green); font-size: 11px; font-weight: 900; line-height: 1.25; text-transform: uppercase; }
  strong { font-size: 13px; line-height: 1.3; overflow-wrap: anywhere; }
  em { grid-column: 2; color: var(--muted); font-size: 12px; line-height: 1.35; font-style: normal; }
  code { grid-column: 2; justify-self: start; border: 1px solid var(--line); border-radius: 6px; padding: 3px 6px; background: #fff; color: var(--blue); font-size: 11px; white-space: normal; word-break: break-word; }
  &:focus-visible { outline: 3px solid rgba(35, 88, 214, 0.28); outline-offset: 2px; }
  @media (max-width: 420px) {
    grid-template-columns: 1fr;
    em, code { grid-column: 1; }
  }
`;
const GovernanceGrid = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(302px, 1fr)); gap: 12px; margin-top: 12px;`;
const GovernanceCard = styled.article`
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 690px;
  border: 1px solid rgba(181, 106, 0, 0.28);
  border-radius: 8px;
  padding: 14px;
  background: #fff;
  h3 { margin: 0; font-size: 19px; line-height: 1.15; }
  > strong { color: var(--ink); font-size: 15px; line-height: 1.32; }
  @media (max-width: 420px) {
    min-height: 0;
  }
`;
const RelationshipGrid = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(314px, 1fr)); gap: 12px; margin-top: 12px;`;
const RelationshipCard = styled.article`
  display: grid;
  align-content: start;
  gap: 10px;
  min-width: 0;
  min-height: 900px;
  border: 1px solid rgba(35, 88, 214, 0.22);
  border-radius: 8px;
  padding: 14px;
  background: #fff;
  @media (max-width: 440px) {
    min-height: 0;
  }
`;
const RelationshipLead = styled.div`
  display: grid;
  align-content: start;
  gap: 8px;
  min-height: 172px;
  h3 { margin: 0; font-size: 20px; line-height: 1.15; }
  > strong { color: var(--ink); font-size: 15px; line-height: 1.32; overflow-wrap: anywhere; }
  p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.42; overflow-wrap: anywhere; }
`;
const RelationshipContextGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  @media (max-width: 560px) { grid-template-columns: 1fr; }
`;
const RelationshipStepList = styled.div`display: grid; gap: 8px;`;
const RelationshipStepButton = styled.button`
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  min-height: 112px;
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px;
  color: var(--ink);
  background: #f8fafc;
  font: inherit;
  text-align: left;
  cursor: pointer;
  em {
    color: var(--muted);
    font-size: 12px;
    font-style: normal;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  code {
    justify-self: start;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 3px 6px;
    background: #fff;
    color: var(--blue);
    font-size: 11px;
    white-space: normal;
    word-break: break-word;
  }
  &:hover { border-color: rgba(35, 88, 214, 0.5); background: #f3f7ff; }
  &:focus-visible { outline: 3px solid rgba(35, 88, 214, 0.28); outline-offset: 2px; }
  @media (max-width: 420px) {
    grid-template-columns: 1fr;
  }
`;
const RouteGroupGrid = styled(RelationshipGrid)`grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));`;
const RouteGroupCard = styled(RelationshipCard)`
  min-height: 980px;
  border-color: rgba(0, 127, 122, 0.24);
  @media (max-width: 440px) { min-height: 0; }
`;
const RouteGroupContextGrid = styled(RelationshipContextGrid)`
  grid-template-columns: 1fr;
`;
const RouteGroupRouteList = styled(RelationshipStepList)``;
const RouteGroupRouteButton = styled(RelationshipStepButton)`
  min-height: 94px;
`;
const TrailGrid = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(292px, 1fr)); gap: 12px; margin-top: 12px;`;
const TrailCard = styled.article`
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 640px;
  border: 1px solid rgba(35, 88, 214, 0.2);
  border-radius: 8px;
  padding: 14px;
  background: #fff;
`;
const TrailLead = styled.div`
  min-height: 132px;
  h3 { margin: 8px 0; font-size: 21px; line-height: 1.12; }
  p { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.42; }
`;
const TrailLiveStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
`;
const TrailLiveSnippet = styled.article<{ $state: BetaSignalState }>`
  display: grid;
  align-content: start;
  gap: 6px;
  min-height: 178px;
  border: 1px solid ${({ $state }) => $state === "Live" ? "rgba(27, 127, 67, 0.32)" : $state === "Protected" ? "rgba(181, 106, 0, 0.38)" : $state === "Unavailable" ? "rgba(178, 58, 91, 0.32)" : "rgba(35, 88, 214, 0.2)"};
  border-radius: 8px;
  padding: 10px;
  background: ${({ $state }) => $state === "Live" ? "#f7fcf8" : $state === "Protected" ? "#fffaf0" : $state === "Unavailable" ? "#fff5f7" : "#f8fafc"};
  strong { color: var(--ink); font-size: 13px; line-height: 1.2; }
  span { color: var(--muted); font-size: 12px; line-height: 1.32; overflow-wrap: anywhere; }
  button { width: 100%; min-height: 34px; padding: 0 8px; font-size: 12px; }
`;
const TrailStatePanel = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  @media (max-width: 520px) { grid-template-columns: 1fr; }
`;
const TrailStateRow = styled.div<{ $tone: TrailStateTone }>`
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  column-gap: 8px;
  align-items: start;
  min-height: 112px;
  border: 1px solid ${({ $tone }) => $tone === "unavailable" ? "rgba(178, 58, 91, 0.28)" : $tone === "admin" || $tone === "protected" ? "rgba(181, 106, 0, 0.34)" : "rgba(35, 88, 214, 0.2)"};
  border-radius: 8px;
  padding: 9px;
  background: ${({ $tone }) => $tone === "unavailable" ? "#fff5f7" : $tone === "admin" || $tone === "protected" ? "#fffaf0" : "#f8fafc"};
  strong {
    grid-row: 1 / span 2;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    color: #fff;
    background: ${({ $tone }) => $tone === "unavailable" ? "var(--rose)" : $tone === "admin" || $tone === "protected" ? "var(--amber)" : "var(--blue)"};
    font-size: 14px;
  }
  > span:first-child { grid-column: 2; }
  > span:last-child {
    grid-column: 2;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
`;
const TrailStepList = styled.div`display: grid; gap: 8px;`;
const TrailStepButton = styled.button`
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  min-height: 78px;
  width: 100%;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px;
  color: var(--ink);
  background: #f8fafc;
  font: inherit;
  text-align: left;
  cursor: pointer;
  &:hover { border-color: rgba(35, 88, 214, 0.5); background: #f3f7ff; }
`;
const StepIndex = styled.span`display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; color: #fff; background: var(--blue); font-size: 12px; font-weight: 900;`;
const StepCopy = styled.span`
  display: grid;
  gap: 4px;
  min-width: 0;
  strong { color: var(--ink); font-size: 14px; line-height: 1.2; }
  span { color: var(--muted); font-size: 12px; line-height: 1.35; overflow-wrap: anywhere; }
`;
const AccessHint = styled.span`
  margin-top: 3px;
  border-left: 3px solid rgba(181, 106, 0, 0.58);
  padding: 6px 8px;
  background: #fffaf0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.35;
  b {
    display: block;
    margin-bottom: 2px;
    color: #4a3211;
    font-size: 11px;
    text-transform: uppercase;
  }
`;
const VisibilityGrid = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; margin-top: 12px;`;
const SignalCard = styled.article<{ $status: BetaVisibilityStatus }>`
  display: grid; align-content: start; gap: 10px; min-height: 300px; border: 1px solid ${({ $status }) => $status === "direct" ? "rgba(27, 127, 67, 0.34)" : $status === "routed" ? "rgba(35, 88, 214, 0.26)" : "rgba(181, 106, 0, 0.34)"}; border-radius: 8px; padding: 14px; background: ${({ $status }) => $status === "direct" ? "#f7fcf8" : $status === "routed" ? "#f7f9ff" : "#fff8eb"};
  h3 { margin: 0; font-size: 18px; line-height: 1.16; }
  p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.4; }
`;
const BridgeGrid = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-top: 12px;`;
const BridgeCard = styled.article`
  display: grid; align-content: start; gap: 10px; min-height: 210px; border: 1px solid var(--line); border-radius: 8px; padding: 14px; background: #fff;
  h3 { margin: 0; font-size: 19px; line-height: 1.15; }
  p { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.42; }
`;
const WayfinderGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(238px, 1fr));
  gap: 12px;
  margin-top: 12px;
`;
const WayfinderCard = styled.article`
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 330px;
  border: 1px solid rgba(35, 88, 214, 0.22);
  border-radius: 8px;
  padding: 14px;
  background: #fff;
  p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.42; }
`;
const WayfinderLead = styled.div`
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 10px;
  align-items: start;
  min-height: 66px;
  > span { display: grid; gap: 5px; min-width: 0; }
  strong { color: var(--ink); font-size: 16px; line-height: 1.2; overflow-wrap: anywhere; }
`;
const WayfinderIcon = styled.span`
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border: 1px solid rgba(35, 88, 214, 0.22);
  border-radius: 8px;
  color: var(--blue);
  background: #f7f9ff;
`;
const WayfinderActions = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  align-self: end;
  button { width: 100%; min-height: 38px; padding: 0 8px; }
  @media (max-width: 420px) { grid-template-columns: 1fr; }
`;
const SectionCompassGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
  margin-top: 12px;
`;
const SectionCompassCard = styled.article`
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 470px;
  border: 1px solid rgba(0, 127, 122, 0.24);
  border-radius: 8px;
  padding: 14px;
  background: #fdfefe;
  h3 { margin: 0; font-size: 19px; line-height: 1.15; overflow-wrap: anywhere; }
  > button { width: 100%; align-self: end; }
  @media (max-width: 420px) {
    min-height: 0;
    padding: 12px;
  }
`;
const SectionCompassLead = styled.div`
  display: grid;
  gap: 6px;
  min-height: 110px;
  strong { color: var(--ink); font-size: 15px; line-height: 1.28; overflow-wrap: anywhere; }
  @media (max-width: 420px) {
    min-height: 0;
  }
`;
const Button = styled.button`
  display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 40px; border-radius: 8px; padding: 0 14px; font: inherit; font-size: 13px; font-weight: 850; cursor: pointer; border: 1px solid transparent;
`;
const Primary = styled(Button)`color: #fff; background: linear-gradient(135deg, var(--blue), var(--teal));`;
const Ghost = styled(Button)`color: var(--ink); background: #fff; border-color: var(--line);`;
const Hero = styled.section`display: grid; grid-template-columns: minmax(0, 0.9fr) minmax(340px, 1.1fr); gap: 24px; padding: clamp(32px, 6vw, 72px) clamp(16px, 4vw, 48px) 24px; scroll-margin-top: 86px; @media (max-width: 940px) { grid-template-columns: 1fr; }`;
const HeroCopy = styled.div`
  display: grid; gap: 16px; align-content: start;
  h1 { margin: 0; font-size: clamp(42px, 6vw, 82px); line-height: 0.98; letter-spacing: 0; }
  p { margin: 0; max-width: 760px; color: var(--muted); font-size: clamp(17px, 2vw, 21px); line-height: 1.5; }
`;
const Kicker = styled.div`display: flex; align-items: center; gap: 8px; color: var(--green); font-size: 13px; font-weight: 900; text-transform: uppercase;`;
const AnswerGrid = styled.div`display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; @media (max-width: 620px) { grid-template-columns: 1fr; }`;
const TwoCol = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(300px, 0.6fr);
  gap: 18px;
  padding: 12px clamp(16px, 4vw, 48px);
  scroll-margin-top: 86px;
  > * { min-width: 0; }
  @media (max-width: 980px) { grid-template-columns: minmax(0, 1fr); }
`;
const Panel = styled.section`min-width: 0; border: 1px solid var(--line); border-radius: 8px; padding: 16px; background: rgba(255, 255, 255, 0.94); box-shadow: 0 18px 48px rgba(15, 23, 42, 0.06);`;
const Title = styled.h2`display: flex; align-items: center; gap: 8px; margin: 0 0 12px; font-size: 18px; line-height: 1.2;`;
const Small = styled.span`display: block; color: var(--rose); font-size: 11px; font-weight: 900; line-height: 1.3; text-transform: uppercase;`;
const Tabs = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)); gap: 8px; padding-bottom: 10px;`;
const Tab = styled.button<{ $active: boolean }>`min-width: 0; min-height: 36px; border: 1px solid ${({ $active }) => $active ? "var(--blue)" : "var(--line)"}; border-radius: 8px; padding: 0 11px; color: ${({ $active }) => $active ? "#fff" : "var(--ink)"}; background: ${({ $active }) => $active ? "var(--blue)" : "#fff"}; font: inherit; font-size: 12px; font-weight: 850; line-height: 1.15; cursor: pointer;`;
const Feature = styled.article`
  display: grid; gap: 12px; border: 1px solid rgba(35, 88, 214, 0.2); border-radius: 8px; padding: 16px; background: linear-gradient(135deg, rgba(35, 88, 214, 0.08), rgba(0, 127, 122, 0.08)), #fff;
  h2 { margin: 0; font-size: clamp(22px, 3vw, 34px); line-height: 1.1; letter-spacing: 0; }
  p { margin: 0; color: var(--muted); line-height: 1.45; }
`;
const JourneyCommandPanel = styled.article`
  display: grid;
  gap: 12px;
  margin-top: 12px;
  border: 1px solid rgba(27, 127, 67, 0.24);
  border-radius: 8px;
  padding: 14px;
  background: #f7fcf8;
  h3 { margin: 0; color: var(--ink); font-size: 20px; line-height: 1.16; }
  p { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.42; }
`;
const JourneyStepGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 8px;
`;
const JourneyStepButton = styled.button`
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  gap: 9px;
  min-width: 0;
  min-height: 150px;
  border: 1px solid rgba(35, 88, 214, 0.22);
  border-radius: 8px;
  padding: 10px;
  color: var(--ink);
  background: #fff;
  font: inherit;
  text-align: left;
  cursor: pointer;
  span { display: grid; gap: 5px; min-width: 0; }
  strong { color: var(--ink); font-size: 14px; line-height: 1.18; }
  em { color: var(--blue); font-size: 11px; line-height: 1.25; font-style: normal; font-weight: 900; text-transform: uppercase; overflow-wrap: anywhere; }
  b { color: var(--ink); font-size: 12px; line-height: 1.35; font-weight: 800; overflow-wrap: anywhere; }
  small { color: var(--muted); font-size: 12px; line-height: 1.35; overflow-wrap: anywhere; }
  &:hover { border-color: rgba(35, 88, 214, 0.5); background: #f3f7ff; }
  &:focus-visible { outline: 3px solid rgba(35, 88, 214, 0.28); outline-offset: 2px; }
`;
const Meta = styled.div`display: grid; gap: 4px; border-left: 4px solid var(--amber); padding: 8px 10px; background: #fff8eb; strong { color: #4a3211; font-size: 12px; text-transform: uppercase; } span { color: var(--ink); font-size: 13px; line-height: 1.35; overflow-wrap: anywhere; }`;
const CardGrid = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(238px, 1fr)); gap: 12px; margin-top: 12px;`;
const Info = styled.article`
  position: relative; min-height: 220px; border: 1px solid var(--line); border-radius: 8px; padding: 14px; background: #fff;
  h3 { margin: 8px 0; font-size: 19px; line-height: 1.15; }
  p { margin: 0 0 10px; color: var(--muted); font-size: 14px; line-height: 1.42; }
`;
const AtlasControls = styled.div`
  display: grid;
  gap: 12px;
  margin-top: 14px;
`;
const FilterGroup = styled.div`
  min-width: 0;
  border: 1px solid rgba(35, 88, 214, 0.18);
  border-radius: 8px;
  padding: 12px;
  background: rgba(255, 255, 255, 0.82);
`;
const FilterButtons = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
`;
const FilterButton = styled.button<{ $active: boolean }>`
  min-height: 36px;
  border: 1px solid ${({ $active }) => $active ? "var(--blue)" : "var(--line)"};
  border-radius: 8px;
  padding: 0 11px;
  color: ${({ $active }) => $active ? "#fff" : "var(--ink)"};
  background: ${({ $active }) => $active ? "var(--blue)" : "#fff"};
  font: inherit;
  font-size: 12px;
  font-weight: 850;
  line-height: 1.15;
  cursor: pointer;
  &:focus-visible { outline: 3px solid rgba(35, 88, 214, 0.28); outline-offset: 2px; }
`;
const AtlasSummary = styled.div`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  margin-top: 12px;
  border: 1px solid rgba(0, 127, 122, 0.24);
  border-radius: 8px;
  padding: 12px;
  background: #f7fcf8;
  strong { color: var(--teal); font-size: 24px; line-height: 1; }
  span { color: var(--muted); font-size: 13px; line-height: 1.35; font-weight: 750; overflow-wrap: anywhere; }
  button { min-height: 36px; }
  @media (max-width: 620px) {
    grid-template-columns: 1fr;
    button { width: 100%; }
  }
`;
const AtlasEmpty = styled.article`
  display: grid;
  gap: 10px;
  margin-top: 12px;
  border: 1px dashed rgba(181, 106, 0, 0.42);
  border-radius: 8px;
  padding: 16px;
  background: #fffaf0;
  h3 { margin: 0; font-size: 20px; line-height: 1.15; }
  p { margin: 0; color: var(--muted); line-height: 1.45; }
  button { justify-self: start; }
  @media (max-width: 620px) { button { width: 100%; } }
`;
const NotificationGroupList = styled.div`display: grid; gap: 14px; margin-top: 12px;`;
const PulseGroup = styled.article`
  display: grid;
  gap: 9px;
  border-top: 1px solid var(--line);
  padding-top: 13px;
  h3 { margin: 0; font-size: 17px; line-height: 1.18; }
  p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.42; }
  button { width: 100%; }
`;
const PulseEvent = styled.div`
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  color: var(--muted);
  span, strong { display: block; }
  span { font-size: 12px; line-height: 1.35; }
  strong { color: var(--ink); }
`;
const NotificationControlGrid = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(276px, 1fr)); gap: 12px; margin-top: 12px;`;
const NotificationControlCard = styled.article`
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 520px;
  border: 1px solid rgba(35, 88, 214, 0.22);
  border-radius: 8px;
  padding: 14px;
  background: #fff;
  h3 { margin: 0; font-size: 19px; line-height: 1.15; }
  p { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.42; }
`;
const ControlActions = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  button { width: 100%; min-height: 38px; padding: 0 8px; font-size: 12px; }
  @media (max-width: 620px) { grid-template-columns: 1fr; }
`;
const Band = styled.section`padding: 34px clamp(16px, 4vw, 48px) 12px; scroll-margin-top: 86px;`;
const SectionHead = styled.div`display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 480px); gap: 16px; align-items: end; p { margin: 0; color: var(--muted); line-height: 1.45; } @media (max-width: 860px) { grid-template-columns: 1fr; }`;
const SectionSubhead = styled.div`margin-top: 24px; max-width: 980px; p { margin: 0; color: var(--muted); line-height: 1.45; }`;
const LevelGrid = styled.div`display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px;`;
const Level = styled.div`border: 1px solid var(--line); border-radius: 8px; padding: 9px 10px; background: #fff; strong, span { display: block; } span { margin-top: 4px; color: var(--muted); font-size: 12px; font-weight: 850; }`;
const Unlock = styled(Info)`min-height: 330px;`;
const Story = styled(Info)`min-height: 300px;`;
const CommandCard = styled(Info)`min-height: 510px; display: grid; align-content: start; gap: 10px;`;
const Index = styled.span`display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; color: #fff; background: var(--teal); font-weight: 900;`;
const CountHero = styled.div`display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 420px); gap: 16px; align-items: start; border: 1px solid rgba(178, 58, 91, 0.24); border-radius: 8px; padding: 18px; background: linear-gradient(135deg, rgba(178, 58, 91, 0.08), rgba(181, 106, 0, 0.08)), #fff; h2 { margin: 6px 0; font-size: clamp(30px, 4vw, 54px); line-height: 1; } p { color: var(--muted); font-size: 17px; line-height: 1.5; } @media (max-width: 860px) { grid-template-columns: 1fr; }`;
const AdminSummaryPanel = styled.section`
  display: grid;
  gap: 12px;
  margin-top: 14px;
  border: 1px solid rgba(35, 88, 214, 0.2);
  border-radius: 8px;
  padding: 16px;
  background: #fff;
`;
const AdminSummaryHead = styled.div`
  max-width: 980px;
  p { margin: 0; color: var(--muted); line-height: 1.45; }
`;
const AdminSummaryGrid = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(248px, 1fr)); gap: 12px;`;
const AdminSummaryCard = styled.article<{ $state: BetaAdminSummaryState }>`
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 390px;
  border: 1px solid ${({ $state }) => $state === "Live" ? "rgba(27, 127, 67, 0.34)" : $state === "Unavailable" ? "rgba(178, 58, 91, 0.34)" : $state === "Loading" ? "rgba(35, 88, 214, 0.28)" : "rgba(181, 106, 0, 0.38)"};
  border-radius: 8px;
  padding: 14px;
  background: ${({ $state }) => $state === "Live" ? "#f7fcf8" : $state === "Unavailable" ? "#fff5f7" : $state === "Loading" ? "#f7f9ff" : "#fffaf0"};
  h3 { margin: 0; font-size: 18px; line-height: 1.16; }
  > strong { color: ${({ $state }) => $state === "Live" ? "var(--green)" : $state === "Unavailable" ? "var(--rose)" : $state === "Loading" ? "var(--blue)" : "var(--amber)"}; font-size: 28px; line-height: 1.05; }
  p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.4; }
  button { width: 100%; align-self: end; }
`;
const WorkbenchPanel = styled.section`
  display: grid;
  gap: 12px;
  margin-top: 14px;
  border: 1px solid rgba(27, 127, 67, 0.22);
  border-radius: 8px;
  padding: 16px;
  background: #fff;
`;
const WorkbenchGrid = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(306px, 1fr)); gap: 12px;`;
const WorkbenchCard = styled.article`
  display: grid;
  align-content: start;
  gap: 10px;
  min-height: 790px;
  border: 1px solid rgba(35, 88, 214, 0.2);
  border-radius: 8px;
  padding: 14px;
  background: #fdfefe;
  h3 { margin: 0; font-size: 19px; line-height: 1.15; }
  > strong { color: var(--ink); font-size: 15px; line-height: 1.32; }
  @media (max-width: 420px) {
    min-height: 0;
  }
`;
const RecipePanel = styled.section`
  display: grid;
  gap: 12px;
  margin-top: 14px;
  border: 1px solid rgba(181, 106, 0, 0.24);
  border-radius: 8px;
  padding: 16px;
  background: #fff;
`;
const RecipeGrid = styled.div`display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap: 12px;`;
const RecipeCard = styled.article`
  display: grid;
  align-content: start;
  gap: 12px;
  border: 1px solid rgba(35, 88, 214, 0.2);
  border-radius: 8px;
  padding: 14px;
  background: #fdfefe;
  h3 { margin: 0; font-size: 20px; line-height: 1.15; }
  > strong { color: var(--ink); font-size: 15px; line-height: 1.35; }
  @media (max-width: 420px) {
    padding: 12px;
  }
`;
const RecipeMetaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;
const RecipeStageList = styled.div`display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; @media (max-width: 760px) { grid-template-columns: 1fr; }`;
const RecipeStageButton = styled.button`
  display: grid;
  gap: 4px;
  min-width: 0;
  min-height: 128px;
  border: 1px solid rgba(35, 88, 214, 0.2);
  border-radius: 8px;
  padding: 10px;
  color: var(--ink);
  background: #fff;
  text-align: left;
  cursor: pointer;
  span { color: var(--blue); font-size: 12px; font-weight: 900; text-transform: uppercase; }
  strong { font-size: 14px; line-height: 1.2; }
  small { color: var(--muted); font-size: 12px; line-height: 1.25; word-break: break-word; }
  em { color: var(--muted); font-size: 12px; font-style: normal; line-height: 1.3; }
  &:hover, &:focus-visible { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(35, 88, 214, 0.12); outline: none; }
  @media (max-width: 420px) {
    min-height: 0;
  }
`;
const Checklist = styled.ul`
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 0;
  list-style: none;
  li {
    border-left: 3px solid var(--green);
    padding: 7px 9px;
    background: #f7fcf8;
    color: var(--ink);
    font-size: 13px;
    line-height: 1.38;
  }
`;
const SearchBox = styled.label`display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: center; gap: 8px; height: 46px; border: 1px solid var(--line); border-radius: 8px; padding: 0 12px; background: #fff; input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--ink); font: inherit; }`;
const RouteRow = styled.div`display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; code { border: 1px solid var(--line); border-radius: 6px; padding: 4px 6px; background: #f4f7fb; font-size: 11px; white-space: normal; word-break: break-word; }`;
const IconButton = styled.button`position: absolute; right: 10px; bottom: 10px; display: grid; place-items: center; width: 34px; height: 34px; border: 1px solid var(--line); border-radius: 8px; color: var(--ink); background: #fff; cursor: pointer;`;
