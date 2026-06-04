import { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import {
  Button,
  GroupBox,
  Hourglass,
  TabBody,
  TextField,
} from "react95";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { AppWindow } from "../components/layout/AppWindow";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";
import { purchaseRatRaceListing } from "../lib/tezos";
import { assertWalletLinkedToCurrentUser } from "../lib/tezos/wallet-ownership";
import { useWallet } from "../lib/wallet-context";
import {
  SkywireCapabilityGate,
  SkywireConnectWelcome,
  SkywireContextBar,
  SkywireHomeCompose,
  SkywireMainLayout,
  SkywirePermissionOverview,
  SkywireSettingsSection,
  SkywireSidebar,
  SkywireAdminSettingsHint,
} from "../features/skywire/SkywireShell";
import { isSkywireTab, type SkywireTab } from "../features/skywire/skywire-nav";
import {
  SKYWIRE_CHAT_PERMISSION_DESCRIPTION,
  SKYWIRE_CHAT_PERMISSION_WARNING,
  SKYWIRE_DEFAULT_PERMISSION_TIER,
  SKYWIRE_PERMISSION_TIER_OPTIONS,
  buildSkywireAtprotoScope,
  grantedSkywireCapabilities,
  normalizeSkywirePermissionTier,
  skywirePermissionTierLabel,
  type SkywirePermissionCapability,
  type SkywirePermissionTier,
} from "@shared/atproto-permissions";
import {
  extractSkywireTokenUrlsFromValues,
  isSkywireTokenUrl,
} from "@shared/skywire-token-links";
import type { RatRacePurchaseIntent } from "@shared/tezos-intel";

interface AtprotoMe {
  enabled: boolean;
  rollout?: {
    rolloutMode: string;
    eligible: boolean;
    wtfLiveEligible: boolean;
    wtfLiveEnabled: boolean;
    atprotoEnabled: boolean;
  };
  account: null | {
    id: number;
    did: string;
    handle: string;
    pdsUrl: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    description: string | null;
    hasEncryptedTokens: boolean;
    hasDpopKey: boolean;
    lastSyncedAt: string | null;
    oauthScopes: string | null;
    oauthRequestedScopes: string | null;
    oauthPermissionTier: SkywirePermissionTier;
    oauthChatEnabled: boolean;
    oauthCapabilities: SkywirePermissionCapability[];
    oauthHasBroadScope: boolean;
    session?: {
      status: "none" | "oauth_ready" | "credential_ready" | "reconnect_required";
      reconnectRequired: boolean;
      reason: string | null;
    };
  };
  handleClaims: Array<{
    id: number;
    desiredHandle: string;
    tezosAlias: string | null;
    verificationMethod: string;
    verificationStatus: string;
    failureReason: string | null;
  }>;
  tezosAlias: string | null;
  walletAddress: string | null;
  tezosIdentity?: {
    primaryWalletAddress: string | null;
    preferredTezosDomain: string | null;
    preferredSource: "selected" | "reverse" | "owned" | "none";
    ownedTezosDomains: string[];
    wallets: Array<{
      id: number;
      walletAddress: string;
      isPrimary: boolean;
      selectedTezosDomain: string | null;
      reverseTezosDomain: string | null;
      ownedTezosDomains: string[];
      preferredTezosDomain: string | null;
      preferredSource: "selected" | "reverse" | "owned" | "none";
    }>;
  };
  oauth: { clientIdUrl: string; redirectUri: string; scope: string; maxScope: string };
}

interface FeedResponse {
  feedType: string;
  source?: string;
  q?: string;
  actor?: string;
  cursor: string | null;
  feed: SkywireFeedItem[];
}

interface SkywireActor {
  did: string;
  handle: string;
  displayName: string | null;
  avatar: string | null;
  description: string | null;
}

interface SkywirePost {
  uri: string;
  cid: string;
  sourceUrl: string | null;
  author: SkywireActor | null;
  text: string;
  createdAt: string | null;
  indexedAt: string | null;
  replyRoot: { uri: string; cid: string } | null;
  replyParent: { uri: string; cid: string } | null;
  counts: {
    reply: number;
    repost: number;
    like: number;
    quote: number;
  };
  viewer: {
    like: string | null;
    repost: string | null;
    threadMuted: boolean;
    embeddingDisabled: boolean;
  };
  embed: {
    images: Array<{ thumb: string | null; fullsize: string | null; alt: string }>;
    external: { uri: string; title: string; description: string | null; thumb: string | null } | null;
  };
  links?: string[];
  quote: SkywireQuotePost | null;
}

interface SkywireQuotePost {
  uri: string;
  cid: string;
  sourceUrl: string | null;
  author: SkywireActor | null;
  text: string;
  createdAt: string | null;
  indexedAt: string | null;
  embed: {
    images: Array<{ thumb: string | null; fullsize: string | null; alt: string }>;
    external: { uri: string; title: string; description: string | null; thumb: string | null } | null;
  };
  state: "visible" | "blocked" | "detached" | "not_found";
}

interface SkywireFeedItem {
  post: SkywirePost;
  reason: null | {
    type: string;
    by: SkywireActor | null;
    indexedAt: string | null;
  };
}

interface SkywireTokenSummary {
  faContract: string;
  tokenId: string;
  title: string;
  imageUrl: string | null;
  creatorAddress: string | null;
  creatorName: string | null;
  collectionName: string | null;
  marketUrl: string;
}

interface SkywireTokenListing {
  kind: "fixed_listing" | "open_edition";
  marketplaceContract: string | null;
  marketplaceName: string | null;
  listingId: string | null;
  priceMutez: string | null;
  priceTez: string | null;
  sellerAddress: string | null;
  amountLeft: number | null;
}

interface SkywireTokenMarketResponse {
  reference: {
    source: "objkt" | "teia";
    sourceUrl: string;
    faContract: string | null;
    faSlug: string | null;
    tokenId: string;
    marketUrl: string;
  };
  token: SkywireTokenSummary | null;
  listing: SkywireTokenListing | null;
  purchaseIntent: RatRacePurchaseIntent;
  source: "objkt";
}

interface SkywireVaultOwnedToken extends SkywireTokenSummary {
  walletAddress: string;
  balance: string;
  lastSeenAt: string | null;
  source: "wallet_holdings";
}

interface SkywireTezosVaultResponse {
  generatedAt: string;
  wallets: Array<{
    id: number;
    walletAddress: string;
    tezDomain: string | null;
    isPrimary: boolean;
    linkedAt: string | null;
    lastSyncedAt: string | null;
  }>;
  owned: {
    source: "wallet_holdings";
    items: SkywireVaultOwnedToken[];
    total: number;
  };
  created: {
    source: "objkt";
    items: SkywireTokenSummary[];
    total: number;
    error: string | null;
  };
}

interface ActorSearchResponse {
  actors: Array<{
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
    description?: string;
    followersCount?: number;
    followsCount?: number;
    postsCount?: number;
    wtfUserId?: number;
    wtfUsername?: string;
    suggestedByHandles?: string[];
    suggestionScore?: number;
  }>;
  cursor: string | null;
}

interface SignalsResponse {
  collection: string;
  records: Array<{
    uri: string;
    cid: string;
    value: {
      text?: string;
      signalType?: string;
      tags?: string[];
      relatedUri?: string | null;
      createdAt?: string;
    };
  }>;
}

interface SkywireRoom {
  id: string;
  title: string;
  kind: "room" | "stage";
  description: string;
}

interface SkywireRoomMessage {
  uri: string;
  cid: string;
  roomId: string;
  text: string;
  createdAt: string | null;
  author: SkywireActor | null;
  audienceDids: string[];
  quotedPost: SkywireQuotePost | null;
}

interface SkywireRoomsResponse {
  rooms: SkywireRoom[];
  collection: string;
  storage: string;
}

interface SkywireRoomMessagesResponse {
  roomId: string;
  collection: string;
  messages: SkywireRoomMessage[];
  cursor: string | null;
}

interface SkywireStage {
  id: string;
  title: string;
  kind: "stage";
  description: string;
  liveUrl: string | null;
}

interface SkywireStageBroadcast {
  uri: string;
  cid: string;
  stageId: string;
  text: string;
  mode: "text" | "voice" | "video" | "link";
  liveUrl: string | null;
  createdAt: string | null;
  broadcaster: SkywireActor | null;
  quotedPost: SkywireQuotePost | null;
}

interface SkywireStagesResponse {
  stages: SkywireStage[];
  collection: string;
  storage: string;
  mode: string;
}

interface SkywireStageBroadcastsResponse {
  stageId: string;
  collection: string;
  broadcasts: SkywireStageBroadcast[];
  cursor: string | null;
}

interface SkywireChatConvo {
  id: string;
  rev: string;
  status: string | null;
  muted: boolean;
  unreadCount: number;
  kind: "direct" | "group";
  groupName: string | null;
  memberCount: number;
  members: SkywireActor[];
  lastMessage: SkywireChatMessage | null;
}

interface SkywireChatMessage {
  id: string;
  rev: string;
  text: string;
  senderDid: string | null;
  sender?: SkywireActor | null;
  sentAt: string | null;
  deleted: boolean;
  system: boolean;
  quote: SkywireQuotePost | null;
}

interface SkywireChatsResponse {
  convos: SkywireChatConvo[];
  cursor: string | null;
  source: string;
  service: string;
}

interface SkywireChatMessagesResponse {
  convoId: string;
  messages: SkywireChatMessage[];
  cursor: string | null;
  source: string;
}

interface SkywireThreadNode {
  state: "visible" | "blocked" | "not_found" | "unknown";
  uri: string;
  post: SkywirePost | null;
  parent: SkywireThreadNode | null;
  replies: SkywireThreadNode[];
}

interface SkywireThreadResponse {
  uri: string;
  source: string;
  thread: SkywireThreadNode | null;
}

interface SkywirePipeline {
  id: "reward-spine" | "tv" | "studio" | "rat-race" | "wtf-live";
  title: string;
  app: string;
  appRoute: string;
  eventType: string;
  description: string;
}

interface SkywirePipelinesResponse {
  pipelines: SkywirePipeline[];
  source: string;
  storage: string;
  writesCanonicalPdsState: boolean;
}

interface SkywirePipelineHistoryEvent {
  id: number;
  eventId: string;
  eventType: string;
  occurredAt: string | null;
  rawRefType: string | null;
  rawRefId: string | null;
  metadata: Record<string, any>;
}

interface SkywirePipelineHistoryResponse {
  events: SkywirePipelineHistoryEvent[];
  source: string;
  sourceModule: string;
  storage: string;
}

const Shell = styled.div`
  min-height: 100%;
  padding: 10px;
  --sky-bg: #061116;
  --sky-panel: #0d1c25;
  --sky-panel-2: #102733;
  --sky-card: #122b36;
  --sky-card-soft: #183643;
  --sky-border: #285465;
  --sky-border-strong: #3a8797;
  --sky-text: #f2fbff;
  --sky-muted: #abc1ca;
  --sky-dim: #7f9aa5;
  --sky-cyan: #67e8f9;
  --sky-teal: #22c7bd;
  --sky-rose: #fb7185;
  --sky-amber: #f2c94c;
  background:
    radial-gradient(circle at 14% 8%, rgba(34, 199, 189, 0.18), transparent 28%),
    linear-gradient(90deg, rgba(103, 232, 249, 0.08) 1px, transparent 1px),
    linear-gradient(0deg, rgba(251, 113, 133, 0.06) 1px, transparent 1px),
    var(--sky-bg);
  background-size: 14px 14px, 14px 14px, auto;
  display: grid;
  gap: 8px;
  color: var(--sky-text);

  a {
    color: var(--sky-cyan);
  }

  input,
  textarea,
  select {
    color-scheme: dark;
  }

  input:not([type="checkbox"]):not([type="radio"]),
  textarea,
  select {
    background-color: #07141c !important;
    color: var(--sky-text) !important;
    border-color: var(--sky-border-strong) !important;
  }

  div:has(> input:not([type="checkbox"]):not([type="radio"])) {
    background-color: #07141c !important;
    border-color: var(--sky-border-strong) !important;
  }

  button {
    color: var(--sky-text) !important;
  }

  button:not(:disabled) {
    border-color: var(--sky-border-strong) !important;
    background-color: var(--sky-card-soft) !important;
    background-image:
      linear-gradient(180deg, rgba(24, 54, 67, 0.98), rgba(13, 28, 37, 0.98)) !important;
    color: var(--sky-text) !important;
  }

  button:disabled {
    border-color: var(--sky-border) !important;
    background-color: #111f27 !important;
    background-image: none !important;
    color: var(--sky-dim) !important;
  }

  fieldset {
    border-color: var(--sky-border) !important;
    background: rgba(9, 25, 34, 0.32);
    color: var(--sky-text);
  }

  legend {
    color: var(--sky-text);
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(282px, 360px);
  gap: 10px;
  align-items: start;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const Stack = styled.div`
  display: grid;
  gap: 8px;
`;

const Row = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

const SkywireHeader = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: stretch;
  padding: 8px;
  border: 1px solid var(--sky-border-strong);
  border-radius: 8px;
  background:
    linear-gradient(135deg, #071a44 0%, #003a66 48%, #008080 100%);
  color: #fff;
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.32);

  @media (max-width: 780px) {
    grid-template-columns: 1fr;
  }
`;

const HeaderTitle = styled.div`
  display: grid;
  gap: 4px;
  min-width: 0;

  h2 {
    margin: 0;
    font-size: 22px;
    line-height: 1;
    letter-spacing: 0;
  }

  p {
    margin: 0;
    max-width: 760px;
    color: #dffcff;
    line-height: 1.35;
  }
`;

const HeaderBadgeGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(118px, 1fr));
  gap: 6px;
  min-width: min(330px, 100%);

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const StatusBadge = styled.div<{ $tone?: "ready" | "warn" | "quiet" }>`
  border: 1px solid ${({ $tone }) => ($tone === "ready" ? "#41d99c" : $tone === "warn" ? "#f2c94c" : "#466575")};
  border-radius: 8px;
  background: ${({ $tone }) =>
    $tone === "ready"
      ? "linear-gradient(180deg, rgba(18, 86, 64, 0.9), rgba(11, 44, 45, 0.95))"
      : $tone === "warn"
        ? "linear-gradient(180deg, rgba(82, 62, 19, 0.9), rgba(45, 35, 19, 0.95))"
        : "linear-gradient(180deg, rgba(20, 42, 54, 0.9), rgba(11, 30, 41, 0.95))"};
  color: var(--sky-text);
  padding: 6px;
  display: grid;
  gap: 2px;
  min-height: 48px;

  span {
    font-size: 11px;
    text-transform: uppercase;
    color: var(--sky-muted);
  }

  strong {
    overflow-wrap: anywhere;
  }
`;

const NoticeBar = styled.div`
  border: 1px solid rgba(242, 201, 76, 0.72);
  border-radius: 8px;
  background: rgba(87, 64, 18, 0.58);
  color: #ffe9a6;
  padding: 6px 8px;
`;

const ContentBody = styled(TabBody)`
  padding: 10px;
  background:
    linear-gradient(180deg, var(--sky-panel) 0%, #091821 100%);
  border-color: #050c10 #315362 #315362 #050c10;
  color: var(--sky-text);
`;

const Mono = styled.code`
  font-family: "MS Sans Serif", monospace;
  font-size: 11px;
  overflow-wrap: anywhere;
`;

const FeedColumn = styled.div`
  display: grid;
  gap: 18px;
  width: min(100%, 920px);
  margin: 0 auto;
`;

const FeedList = styled.div<{ $social?: boolean }>`
  display: grid;
  gap: ${({ $social }) => ($social ? "26px" : "14px")};
  max-height: ${({ $social }) => ($social ? "none" : "min(66vh, 680px)")};
  overflow: ${({ $social }) => ($social ? "visible" : "auto")};
  padding: ${({ $social }) => ($social ? "4px 2px 22px" : "2px 6px 6px 2px")};
  align-content: start;
`;

const FeedItem = styled.article<{ $social?: boolean }>`
  position: relative;
  background:
    linear-gradient(180deg, rgba(20, 46, 58, 0.98) 0%, rgba(10, 26, 36, 0.98) 100%);
  border: 1px solid var(--sky-border);
  border-radius: 8px;
  padding: ${({ $social }) => ($social ? "18px 20px 20px 24px" : "12px 12px 12px 16px")};
  display: grid;
  gap: ${({ $social }) => ($social ? "14px" : "10px")};
  min-height: ${({ $social }) => ($social ? "156px" : "auto")};
  box-shadow:
    0 2px 0 rgba(103, 232, 249, 0.18),
    0 18px 34px rgba(0, 0, 0, ${({ $social }) => ($social ? "0.36" : "0.3")});
  overflow: visible;
  scroll-margin-block: 18px;

  &::before {
    content: "";
    position: absolute;
    inset: 0 auto 0 0;
    width: 5px;
    border-radius: 8px 0 0 8px;
    background: linear-gradient(180deg, var(--sky-teal) 0%, #5b7cfa 42%, var(--sky-rose) 100%);
  }
`;

const PostHeader = styled.div<{ $social?: boolean }>`
  display: grid;
  grid-template-columns: ${({ $social }) => ($social ? "54px minmax(0, 1fr)" : "48px minmax(0, 1fr)")};
  gap: ${({ $social }) => ($social ? "12px" : "10px")};
  align-items: start;
  min-width: 0;

  strong {
    color: #f4fcff;
    font-size: 14px;
  }

  div,
  span {
    color: var(--sky-muted);
  }
`;

const Avatar = styled.img`
  width: 48px;
  height: 48px;
  object-fit: cover;
  border: 1px solid #7fa8b1;
  border-radius: 6px;
  background: #d7eef3;
`;

const AvatarFallback = styled.div`
  width: 48px;
  height: 48px;
  border: 1px solid #7fa8b1;
  border-radius: 6px;
  background:
    linear-gradient(135deg, #fff8d6 0 20%, #d7eef3 20% 44%, #0f8a96 44% 62%, #fb7185 62%);
`;

const ActorButton = styled.button`
  &&&,
  &&&:disabled {
    border: 0 !important;
    background: transparent !important;
    background-color: transparent !important;
    background-image: none !important;
    color: inherit !important;
    box-shadow: none !important;
  }

  appearance: none;
  border: 0 !important;
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
  color: inherit !important;
  box-shadow: none !important;
  font: inherit;
  padding: 0;
  margin: 0;
  text-align: left;
  display: block;
  cursor: pointer;

  &:hover strong,
  &:hover div {
    text-decoration: underline;
  }

  &:disabled {
    cursor: default;
  }
`;

const PostText = styled.p`
  margin: 0;
  color: var(--sky-text);
  font-size: 15px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
`;

const MetaRow = styled.div`
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
`;

const StatChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-height: 20px;
  padding: 2px 6px;
  border: 1px solid rgba(242, 201, 76, 0.76);
  border-radius: 999px;
  background: rgba(90, 66, 18, 0.8);
  color: #ffe9a6;
  font-size: 12px;
`;

const ImageGrid = styled.div<{ $count?: number }>`
  display: grid;
  grid-template-columns: ${({ $count = 1 }) =>
    $count <= 1 ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))"};
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--sky-border);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(7, 19, 26, 0.98), rgba(11, 31, 43, 0.98));
  justify-items: center;
  align-items: center;
  width: 100%;

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const FeedImage = styled.img<{ $solo?: boolean }>`
  width: ${({ $solo }) => ($solo ? "100%" : "100%")};
  height: auto;
  max-width: 100%;
  max-height: min(72vh, 760px);
  object-fit: contain;
  border: 1px solid #29495a;
  border-radius: 6px;
  background: #0a1218;
  display: block;
  margin: 0 auto;
`;

const ExternalCard = styled.a`
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
  padding: 10px;
  border: 1px solid rgba(103, 232, 249, 0.42);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(13, 45, 58, 0.96) 0%, rgba(11, 31, 43, 0.96) 100%);
  color: var(--sky-text);
  text-decoration: none;

  &:hover {
    border-color: var(--sky-cyan);
    box-shadow: 0 0 0 2px rgba(103, 232, 249, 0.14);
  }
`;

const TokenMarketStack = styled.div`
  display: grid;
  gap: 8px;
`;

const TokenMarketCard = styled.div`
  display: grid;
  grid-template-columns: minmax(104px, 132px) minmax(0, 1fr);
  gap: 12px;
  padding: 10px;
  border: 1px solid rgba(65, 217, 156, 0.55);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(11, 47, 43, 0.98) 0%, rgba(17, 34, 41, 0.98) 58%, rgba(52, 22, 34, 0.98) 100%);
  color: var(--sky-text);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);

  @media (max-width: 560px) {
    grid-template-columns: 84px minmax(0, 1fr);
  }
`;

const TokenThumb = styled.div`
  aspect-ratio: 1;
  border: 1px solid var(--sky-border-strong);
  border-radius: 6px;
  background: linear-gradient(135deg, #0a1820 0 18%, #164a58 18% 52%, #22c7bd 52% 70%, #fb7185 70%);
  overflow: hidden;
`;

const TokenThumbImage = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  background: #08131a;
`;

const TokenMarketBody = styled.div`
  min-width: 0;
  display: grid;
  gap: 5px;

  strong,
  span {
    overflow-wrap: anywhere;
  }
`;

const TokenMarketActions = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
`;

const InlineState = styled.div`
  border: 1px solid rgba(242, 201, 76, 0.72);
  border-radius: 8px;
  background: rgba(87, 64, 18, 0.58);
  color: #ffe9a6;
  padding: 8px 10px;
  font-size: 12px;
  overflow-wrap: anywhere;
`;

const VaultToolbar = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
`;

const VaultWalletGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
`;

const VaultWalletCard = styled.div`
  border: 1px solid var(--sky-border);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(18, 47, 58, 0.96), rgba(9, 25, 34, 0.96));
  color: var(--sky-text);
  padding: 8px;
  display: grid;
  gap: 4px;
  min-width: 0;
`;

const VaultGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(152px, 1fr));
  gap: 8px;
`;

const VaultTokenCard = styled.div`
  border: 1px solid var(--sky-border);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(20, 46, 58, 0.96), rgba(10, 26, 36, 0.96));
  color: var(--sky-text);
  padding: 8px;
  display: grid;
  gap: 6px;
  min-width: 0;
`;

const VaultTokenThumb = styled.a`
  display: block;
  aspect-ratio: 1;
  border: 1px solid var(--sky-border-strong);
  border-radius: 6px;
  background: linear-gradient(135deg, #0a1820 0 22%, #164a58 22% 48%, #22c7bd 48% 70%, #fb7185 70%);
  overflow: hidden;
`;

const VaultTokenText = styled.div`
  display: grid;
  gap: 3px;
  min-width: 0;

  strong,
  span {
    overflow-wrap: anywhere;
  }

  span {
    color: var(--sky-muted);
  }
`;

const QuoteCard = styled.button`
  appearance: none;
  display: grid;
  gap: 6px;
  width: 100%;
  padding: 10px;
  border: 1px solid rgba(242, 201, 76, 0.48);
  border-radius: 8px;
  background:
    linear-gradient(180deg, rgba(30, 43, 45, 0.98) 0%, rgba(12, 28, 38, 0.98) 100%);
  color: var(--sky-text);
  font: inherit;
  text-align: left;
  cursor: pointer;

  &:hover {
    border-color: var(--sky-rose);
    background:
      linear-gradient(180deg, rgba(52, 22, 34, 0.98) 0%, rgba(17, 31, 40, 0.98) 100%);
  }

  &:disabled {
    cursor: default;
    color: var(--sky-dim);
  }
`;

const ActionDeck = styled.div`
  display: grid;
  gap: 8px;
  padding-top: 4px;
`;

const ActionRail = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  padding: 8px;
  border: 1px solid var(--sky-border);
  border-radius: 8px;
  background: rgba(11, 31, 43, 0.9);
  color: var(--sky-text);
`;

const ComposerRail = styled.div`
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto;
  gap: 6px;
  align-items: center;

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const TextArea = styled.textarea`
  min-height: 120px;
  resize: vertical;
  font: inherit;
  padding: 8px;
  border: 1px solid var(--sky-border-strong);
  border-radius: 6px;
  background: #07141c;
  color: var(--sky-text);
  line-height: 1.35;

  &::placeholder {
    color: var(--sky-dim);
  }
`;

const NativeSelect = styled.select`
  font: inherit;
  min-height: 28px;
  border: 1px solid var(--sky-border-strong);
  border-radius: 6px;
  background: #07141c;
  color: var(--sky-text);
`;

const EmptyState = styled.div`
  border: 1px solid var(--sky-border);
  border-radius: 8px;
  background: var(--sky-card);
  padding: 14px;
  display: grid;
  gap: 4px;
  color: var(--sky-muted);
`;

const ThreadLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(240px, 320px);
  gap: 10px;
  align-items: start;

  @media (max-width: 820px) {
    grid-template-columns: 1fr;
  }
`;

const ThreadTree = styled.div`
  display: grid;
  gap: 10px;
`;

const ThreadBranch = styled.div`
  display: grid;
  gap: 8px;
  padding-left: 18px;
  border-left: 2px solid var(--sky-teal);

  @media (max-width: 560px) {
    padding-left: 10px;
  }
`;

const ThreadMarker = styled.div<{ $focus?: boolean }>`
  display: inline-flex;
  width: fit-content;
  padding: 2px 7px;
  border: 1px solid ${({ $focus }) => ($focus ? "var(--sky-cyan)" : "var(--sky-border)")};
  border-radius: 999px;
  background: ${({ $focus }) => ($focus ? "rgba(103, 232, 249, 0.18)" : "rgba(16, 39, 51, 0.95)")};
  color: var(--sky-text);
  font-size: 12px;
`;

const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.38);
`;

const ModalPanel = styled.div`
  width: min(760px, 100%);
  max-height: min(86vh, 760px);
  overflow: auto;
  background: var(--sky-panel);
  border: 1px solid var(--sky-border-strong);
  border-radius: 8px;
  color: var(--sky-text);
  padding: 10px;
  display: grid;
  gap: 10px;
`;

const TierList = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 680px) {
    grid-template-columns: 1fr;
  }
`;

const TierOption = styled.label<{ $selected: boolean }>`
  display: grid;
  gap: 6px;
  align-content: start;
  min-height: 168px;
  padding: 8px;
  border: 1px solid ${({ $selected }) => ($selected ? "var(--sky-cyan)" : "var(--sky-border)")};
  border-radius: 8px;
  background: ${({ $selected }) =>
    $selected ? "rgba(20, 82, 86, 0.72)" : "rgba(18, 43, 54, 0.95)"};
  color: var(--sky-text);
  cursor: pointer;
`;

const RadioRow = styled.label`
  display: flex;
  gap: 8px;
  align-items: flex-start;
  padding: 6px;
  border: 1px solid var(--sky-border);
  border-radius: 6px;
  background: rgba(11, 31, 43, 0.92);
  color: var(--sky-text);
  cursor: pointer;
`;

const FinePrint = styled.p`
  margin: 0;
  font-size: 12px;
  line-height: 1.35;
`;

function shortAddress(value: string | null | undefined): string {
  if (!value) return "none linked";
  return value.length > 16 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function formatCount(value: number | null | undefined): string {
  const count = Number(value || 0);
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatTez(value: string | null | undefined): string {
  if (!value) return "tez";
  const numeric = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return `${value} tez`;
  if (numeric === 0) return "free";
  return `${numeric.toLocaleString(undefined, { maximumFractionDigits: 6 })} tez`;
}

function extractSkywireTokenUrls(post: SkywirePost): string[] {
  return extractSkywireTokenUrlsFromValues([
    post.text,
    post.embed.external?.uri,
    post.embed.external?.title,
    post.embed.external?.description,
    ...(post.links ?? []),
  ]);
}

function rootForReply(post: SkywirePost): { uri: string; cid: string } {
  return post.replyRoot?.uri && post.replyRoot?.cid ? post.replyRoot : { uri: post.uri, cid: post.cid };
}

function actorFromRecord(actor: ActorSearchResponse["actors"][number]): SkywireActor {
  return {
    did: actor.did,
    handle: actor.handle,
    displayName: actor.displayName || null,
    avatar: actor.avatar || null,
    description: actor.description || null,
  };
}

function quoteFromPost(post: SkywirePost): SkywireQuotePost {
  return {
    uri: post.uri,
    cid: post.cid,
    sourceUrl: post.sourceUrl,
    author: post.author,
    text: post.text,
    createdAt: post.createdAt,
    indexedAt: post.indexedAt,
    embed: post.embed,
    state: "visible",
  };
}

function pipelinePostFromPost(post: SkywirePost) {
  return {
    uri: post.uri,
    cid: post.cid || null,
    sourceUrl: post.sourceUrl || null,
    text: post.text || "",
    authorHandle: post.author?.handle || null,
    authorDid: post.author?.did || null,
    createdAt: post.createdAt || post.indexedAt || null,
    tags: ["skywire", post.author?.handle ? `from:${post.author.handle}` : "from:unknown"],
  };
}

function chatMemberForActor(actor: SkywireActor | null): string | null {
  if (!actor) return null;
  return actor.handle || actor.did || null;
}

function accountCapabilities(account: AtprotoMe["account"]): Set<SkywirePermissionCapability> {
  return new Set(account?.oauthCapabilities?.length ? account.oauthCapabilities : Array.from(grantedSkywireCapabilities(account?.oauthScopes)));
}

function accountHasCapability(account: AtprotoMe["account"], capability: SkywirePermissionCapability): boolean {
  return accountCapabilities(account).has(capability);
}

function SkywireTokenMarketCard({ url }: { url: string }) {
  const wallet = useWallet();
  const qc = useQueryClient();
  const [status, setStatus] = useState<string | null>(null);
  const marketQuery = useQuery<SkywireTokenMarketResponse>({
    queryKey: ["skywire", "token-link", url],
    queryFn: () => api.get<SkywireTokenMarketResponse>(`/api/skywire/token-link?url=${encodeURIComponent(url)}`),
    staleTime: 60_000,
    retry: 1,
  });
  const buy = useMutation({
    mutationFn: async () => {
      const market = marketQuery.data;
      if (!market?.reference.faContract || !market.purchaseIntent.supported) {
        throw new Error(market?.purchaseIntent.reason || "This listing cannot be bought in Skywire.");
      }
      const connected = wallet.address ? { address: wallet.address } : await wallet.connect();
      const purchaseWalletAddress = await assertWalletLinkedToCurrentUser(connected.address);
      await api.post("/api/skywire/events", {
        eventType: "skywire.token_listing.buy_requested",
        tokenRef: `${market.reference.faContract}:${market.reference.tokenId}`,
        metadata: {
          sourceUrl: market.reference.sourceUrl,
          walletAddress: purchaseWalletAddress,
          marketplaceContract: market.purchaseIntent.marketplaceContract,
          marketplaceName: market.purchaseIntent.marketplaceName,
          entrypoint: market.purchaseIntent.entrypoint,
          listingId: market.purchaseIntent.listingId,
          amount: market.purchaseIntent.amount,
          totalMutez: market.purchaseIntent.totalMutez,
        },
      }).catch(() => undefined);
      return purchaseRatRaceListing({
        walletAddress: purchaseWalletAddress,
        tokenContract: market.reference.faContract,
        tokenId: market.reference.tokenId,
        intent: market.purchaseIntent,
      });
    },
    onSuccess: (opHash) => {
      setStatus(`Bought on Tezos: ${opHash.slice(0, 12)}...`);
      qc.invalidateQueries({ queryKey: ["skywire", "tezos-vault"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
    },
    onError: (err: any) => {
      setStatus(err?.message || "Purchase failed.");
    },
  });

  if (marketQuery.isLoading) {
    return <InlineState>Checking Tezos market...</InlineState>;
  }
  if (marketQuery.isError) {
    return <InlineState>Tezos market lookup failed.</InlineState>;
  }

  const market = marketQuery.data;
  if (!market) return null;
  const token = market.token;
  const listing = market.listing;
  const priceLabel = listing?.priceTez ? formatTez(listing.priceTez) : "Open";
  const canDirectBuy = Boolean(market.purchaseIntent.supported && market.reference.faContract);
  const primaryLabel =
    listing?.kind === "open_edition"
      ? canDirectBuy
        ? `Mint ${priceLabel}`
        : "Mint on Objkt"
      : canDirectBuy
        ? `Buy ${priceLabel}`
        : "Open listing";
  const primaryAction = () => {
    if (canDirectBuy) {
      setStatus(null);
      buy.mutate();
      return;
    }
    window.open(token?.marketUrl || market.reference.marketUrl || url, "_blank", "noopener,noreferrer");
  };

  return (
    <TokenMarketCard data-skywire-token-preview="true">
      <TokenThumb>
        {token?.imageUrl ? <TokenThumbImage src={token.imageUrl} alt="" loading="lazy" /> : null}
      </TokenThumb>
      <TokenMarketBody>
        <strong>{token?.title || "Tezos token"}</strong>
        <span>{token?.collectionName || token?.creatorName || shortAddress(token?.creatorAddress)}</span>
        <MetaRow>
          {listing ? <StatChip>{listing.kind === "open_edition" ? "Mint" : "Listing"}</StatChip> : <StatChip>No listing</StatChip>}
          {listing?.priceTez ? <StatChip>{formatTez(listing.priceTez)}</StatChip> : null}
          {listing?.marketplaceName ? <StatChip>{listing.marketplaceName}</StatChip> : null}
        </MetaRow>
        <TokenMarketActions>
          <Button size="sm" disabled={buy.isPending || wallet.isConnecting} onClick={primaryAction}>
            {buy.isPending || wallet.isConnecting ? "Working..." : primaryLabel}
          </Button>
          <Button size="sm" onClick={() => window.open(token?.marketUrl || market.reference.marketUrl || url, "_blank", "noopener,noreferrer")}>
            Open
          </Button>
        </TokenMarketActions>
        {!canDirectBuy && market.purchaseIntent.reason ? <FinePrint>{market.purchaseIntent.reason}</FinePrint> : null}
        {status ? <FinePrint>{status}</FinePrint> : null}
      </TokenMarketBody>
    </TokenMarketCard>
  );
}

function SkywireTokenLinks({ urls }: { urls: string[] }) {
  if (!urls.length) return null;
  return (
    <TokenMarketStack>
      {urls.map((url) => (
        <SkywireTokenMarketCard key={url} url={url} />
      ))}
    </TokenMarketStack>
  );
}

function QuotePreview({ quote }: { quote: SkywireQuotePost }) {
  const author = quote.author;
  const open = () => {
    if (quote.sourceUrl) window.open(quote.sourceUrl, "_blank", "noopener,noreferrer");
  };
  if (quote.state !== "visible") {
    return (
      <QuoteCard type="button" disabled>
        <strong>Quoted post unavailable</strong>
        <Mono>{quote.uri}</Mono>
      </QuoteCard>
    );
  }
  return (
    <QuoteCard type="button" disabled={!quote.sourceUrl} onClick={open} title={quote.sourceUrl ? "Open quoted post" : quote.uri}>
      <Row>
        {author?.avatar ? <Avatar src={author.avatar} alt="" /> : <AvatarFallback />}
        <div>
          <strong>{author?.displayName || author?.handle || "unknown"}</strong>
          <div>@{author?.handle || "unknown"}</div>
          {formatDate(quote.createdAt || quote.indexedAt) ? <span>{formatDate(quote.createdAt || quote.indexedAt)}</span> : null}
        </div>
      </Row>
      <PostText>{quote.text || "(no text)"}</PostText>
      {quote.embed.external ? (
        <ExternalCard as="div">
          <strong>{quote.embed.external.title}</strong>
          {quote.embed.external.description ? <span>{quote.embed.external.description}</span> : null}
        </ExternalCard>
      ) : null}
      <Mono>{quote.uri}</Mono>
    </QuoteCard>
  );
}

function FeedActions({
  post,
  canUseSocialActions,
  canCompose,
  onThreadOpen,
  onPipelineOpen,
  onRoomQuote,
  onStageQuote,
  onChatQuote,
}: {
  post: SkywirePost;
  canUseSocialActions: boolean;
  canCompose: boolean;
  onThreadOpen?: (post: SkywirePost) => void;
  onPipelineOpen?: (post: SkywirePost) => void;
  onRoomQuote?: (quote: SkywireQuotePost) => void;
  onStageQuote?: (quote: SkywireQuotePost) => void;
  onChatQuote?: (quote: SkywireQuotePost, members?: string[]) => void;
}) {
  const uri = post.uri;
  const cid = post.cid;
  const [replyText, setReplyText] = useState("");
  const [quoteText, setQuoteText] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const [isQuoting, setIsQuoting] = useState(false);
  const qc = useQueryClient();
  const invalidateFeeds = () => qc.invalidateQueries({ queryKey: ["skywire"] });
  const like = useMutation({
    mutationFn: () => api.post("/api/skywire/like", { uri, cid }),
    onSuccess: invalidateFeeds,
  });
  const repost = useMutation({
    mutationFn: () => api.post("/api/skywire/repost", { uri, cid }),
    onSuccess: invalidateFeeds,
  });
  const reply = useMutation({
    mutationFn: () => {
      const root = rootForReply(post);
      return api.post("/api/skywire/reply", {
        uri,
        cid,
        rootUri: root.uri,
        rootCid: root.cid,
        text: replyText,
      });
    },
    onSuccess: () => {
      setReplyText("");
      setIsReplying(false);
      invalidateFeeds();
    },
  });
  const quote = useMutation({
    mutationFn: () =>
      api.post("/api/skywire/quote", {
        uri,
        cid,
        text: quoteText,
      }),
    onSuccess: () => {
      setQuoteText("");
      setIsQuoting(false);
      invalidateFeeds();
    },
  });
  if (!uri || !cid) return null;
  return (
    <ActionDeck>
      <ActionRail>
        <Button size="sm" disabled={!canUseSocialActions || Boolean(post.viewer.like) || like.isPending} onClick={() => like.mutate()}>
          {post.viewer.like ? "Liked" : "Like"}
        </Button>
        <Button size="sm" disabled={!canUseSocialActions || Boolean(post.viewer.repost) || repost.isPending} onClick={() => repost.mutate()}>
          {post.viewer.repost ? "Reposted" : "Repost"}
        </Button>
        <Button size="sm" disabled={!canCompose} onClick={() => setIsReplying((value) => !value)}>
          Reply
        </Button>
        <Button size="sm" disabled={!canCompose} onClick={() => setIsQuoting((value) => !value)}>
          Quote
        </Button>
        {onThreadOpen ? (
          <Button size="sm" onClick={() => onThreadOpen(post)}>
            Thread
          </Button>
        ) : null}
        {onPipelineOpen ? (
          <Button size="sm" onClick={() => onPipelineOpen(post)}>
            Pipelines
          </Button>
        ) : null}
        {onRoomQuote ? (
          <Button size="sm" onClick={() => onRoomQuote(quoteFromPost(post))}>
            Room
          </Button>
        ) : null}
        {onStageQuote ? (
          <Button size="sm" onClick={() => onStageQuote(quoteFromPost(post))}>
            Stage
          </Button>
        ) : null}
        {onChatQuote ? (
          <Button
            size="sm"
            onClick={() => {
              const member = chatMemberForActor(post.author);
              onChatQuote(quoteFromPost(post), member ? [member] : []);
            }}
          >
            Reply In Chat
          </Button>
        ) : null}
        {post.sourceUrl ? (
          <Button size="sm" onClick={() => window.open(post.sourceUrl || "", "_blank", "noopener,noreferrer")}>
            Open
          </Button>
        ) : null}
      </ActionRail>
      {isReplying ? (
        <ComposerRail>
          <TextField
            value={replyText}
            onChange={(e: any) => setReplyText(e.target.value)}
            placeholder="reply"
            disabled={!canCompose}
            fullWidth
          />
          <Button size="sm" disabled={!canCompose || !replyText.trim() || reply.isPending} onClick={() => reply.mutate()}>
            Send Reply
          </Button>
        </ComposerRail>
      ) : null}
      {isQuoting ? (
        <Stack>
          <QuotePreview quote={quoteFromPost(post)} />
          <ComposerRail>
            <TextField
              value={quoteText}
              onChange={(e: any) => setQuoteText(e.target.value)}
              placeholder="add your quote"
              disabled={!canCompose}
              fullWidth
            />
            <Button size="sm" disabled={!canCompose || !quoteText.trim() || quote.isPending} onClick={() => quote.mutate()}>
              Post Quote
            </Button>
          </ComposerRail>
        </Stack>
      ) : null}
      {!canUseSocialActions || !canCompose ? (
        <FinePrint>
          {canUseSocialActions ? "" : "Choose Be Social or higher for likes/reposts. "}
          {canCompose ? "" : "Choose Be Heard or higher for replies and quotes."}
        </FinePrint>
      ) : null}
      {like.isError || repost.isError || reply.isError || quote.isError ? <span>Skywire action failed.</span> : null}
    </ActionDeck>
  );
}

function FeedCard({
  item,
  canUseSocialActions,
  canCompose,
  onActorSelect,
  onThreadOpen,
  onPipelineOpen,
  onRoomQuote,
  onStageQuote,
  onChatQuote,
}: {
  item: SkywireFeedItem;
  canUseSocialActions: boolean;
  canCompose: boolean;
  onActorSelect?: (actor: SkywireActor) => void;
  onThreadOpen?: (post: SkywirePost) => void;
  onPipelineOpen?: (post: SkywirePost) => void;
  onRoomQuote?: (quote: SkywireQuotePost) => void;
  onStageQuote?: (quote: SkywireQuotePost) => void;
  onChatQuote?: (quote: SkywireQuotePost, members?: string[]) => void;
}) {
  const { post, reason } = item;
  const author = post.author;
  const tokenUrls = useMemo(() => extractSkywireTokenUrls(post), [post]);
  const externalIsToken = Boolean(post.embed.external?.uri && isSkywireTokenUrl(post.embed.external.uri));
  const showEmptyText =
    !post.text &&
    !post.embed.images.length &&
    !post.embed.external &&
    !post.quote &&
    !tokenUrls.length;
  const authorDetails = (
    <div>
      <strong>{author?.displayName || author?.handle || "unknown"}</strong>
      <div>@{author?.handle || "unknown"}</div>
      {formatDate(post.createdAt || post.indexedAt) ? <span>{formatDate(post.createdAt || post.indexedAt)}</span> : null}
    </div>
  );
  return (
    <FeedItem $social data-skywire-feed-card="true">
      {reason?.by ? <StatChip>Reposted by @{reason.by.handle}</StatChip> : null}
      <PostHeader $social>
        {author?.avatar ? (
          <ActorButton
            type="button"
            disabled={!author || !onActorSelect}
            onClick={() => author && onActorSelect?.(author)}
            title={author?.handle ? `View @${author.handle}` : "View actor"}
          >
            <Avatar src={author.avatar} alt="" />
          </ActorButton>
        ) : (
          <AvatarFallback />
        )}
        {author && onActorSelect ? (
          <ActorButton type="button" onClick={() => onActorSelect(author)} title={`View @${author.handle}`}>
            {authorDetails}
          </ActorButton>
        ) : (
          authorDetails
        )}
      </PostHeader>
      {post.replyParent ? <StatChip>Replying in thread</StatChip> : null}
      {post.embed.images.length ? (
        <ImageGrid $count={post.embed.images.length} data-skywire-feed-media="true">
          {post.embed.images.map((image, index) => (
            <FeedImage
              key={`${image.fullsize || image.thumb || index}`}
              $solo={post.embed.images.length === 1}
              src={image.fullsize || image.thumb || ""}
              alt={image.alt}
              loading="lazy"
            />
          ))}
        </ImageGrid>
      ) : null}
      {post.text || showEmptyText ? <PostText>{post.text || "(no text)"}</PostText> : null}
      <SkywireTokenLinks urls={tokenUrls} />
      {post.embed.external && !externalIsToken ? (
        <ExternalCard href={post.embed.external.uri} target="_blank" rel="noopener noreferrer">
          <strong>{post.embed.external.title}</strong>
          {post.embed.external.description ? <span>{post.embed.external.description}</span> : null}
          <Mono>{post.embed.external.uri}</Mono>
        </ExternalCard>
      ) : null}
      {post.quote ? <QuotePreview quote={post.quote} /> : null}
      <MetaRow>
        <StatChip>{formatCount(post.counts.reply)} replies</StatChip>
        <StatChip>{formatCount(post.counts.repost)} reposts</StatChip>
        <StatChip>{formatCount(post.counts.like)} likes</StatChip>
        {post.counts.quote ? <StatChip>{formatCount(post.counts.quote)} quotes</StatChip> : null}
      </MetaRow>
      <FeedActions
        post={post}
        canUseSocialActions={canUseSocialActions}
        canCompose={canCompose}
        onThreadOpen={onThreadOpen}
        onPipelineOpen={onPipelineOpen}
        onRoomQuote={onRoomQuote}
        onStageQuote={onStageQuote}
        onChatQuote={onChatQuote}
      />
    </FeedItem>
  );
}

function FeedPanel({
  feedType,
  canUseSocialActions,
  canCompose,
  queryText,
  header,
  onActorSelect,
  onThreadOpen,
  onPipelineOpen,
  onRoomQuote,
  onStageQuote,
  onChatQuote,
}: {
  feedType: "home" | "discover" | "wtf" | "tezos" | "market" | "search";
  canUseSocialActions: boolean;
  canCompose: boolean;
  queryText?: string;
  header?: React.ReactNode;
  onActorSelect?: (actor: SkywireActor) => void;
  onThreadOpen?: (post: SkywirePost) => void;
  onPipelineOpen?: (post: SkywirePost) => void;
  onRoomQuote?: (quote: SkywireQuotePost) => void;
  onStageQuote?: (quote: SkywireQuotePost) => void;
  onChatQuote?: (quote: SkywireQuotePost, members?: string[]) => void;
}) {
  const query = useInfiniteQuery<FeedResponse>({
    queryKey: ["skywire", "feed", feedType, queryText || ""],
    initialPageParam: "",
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ feedType });
      if (queryText?.trim()) params.set("q", queryText.trim());
      if (pageParam) params.set("cursor", String(pageParam));
      return api.get(`/api/skywire/feed?${params.toString()}`);
    },
    getNextPageParam: (lastPage) => lastPage.cursor || undefined,
  });
  if (query.isLoading) return <Hourglass size={24} />;
  if (query.isError) return <p>{(query.error as Error).message}</p>;
  const feed = query.data?.pages.flatMap((page) => page.feed) ?? [];
  return (
    <FeedColumn>
      {header}
      <FeedList $social data-skywire-feed-list="true">
        {feed.length === 0 ? (
          <EmptyState>
            <strong>No posts found.</strong>
            <span>This lane is quiet right now.</span>
          </EmptyState>
        ) : null}
        {feed.map((item, index) => (
          <FeedCard
            item={item}
            canUseSocialActions={canUseSocialActions}
            canCompose={canCompose}
            onActorSelect={onActorSelect}
            onThreadOpen={onThreadOpen}
            onPipelineOpen={onPipelineOpen}
            onRoomQuote={onRoomQuote}
            onStageQuote={onStageQuote}
            onChatQuote={onChatQuote}
            key={item.post.uri || index}
          />
        ))}
      </FeedList>
      {query.hasNextPage ? (
        <Button disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
          {query.isFetchingNextPage ? "Loading..." : "Load More"}
        </Button>
      ) : null}
    </FeedColumn>
  );
}

function SkywireVaultTokenTile({
  token,
  badge,
}: {
  token: SkywireTokenSummary | SkywireVaultOwnedToken;
  badge?: string;
}) {
  const owned = token as SkywireVaultOwnedToken;
  return (
    <VaultTokenCard>
      <VaultTokenThumb href={token.marketUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${token.title}`}>
        {token.imageUrl ? <TokenThumbImage src={token.imageUrl} alt="" loading="lazy" /> : null}
      </VaultTokenThumb>
      <VaultTokenText>
        <strong>{token.title}</strong>
        {token.collectionName ? <span>{token.collectionName}</span> : null}
        <span>{token.creatorName || shortAddress(token.creatorAddress)}</span>
      </VaultTokenText>
      <MetaRow>
        {badge ? <StatChip>{badge}</StatChip> : null}
        {"balance" in token ? <StatChip>x{owned.balance}</StatChip> : null}
      </MetaRow>
      <Button size="sm" onClick={() => window.open(token.marketUrl, "_blank", "noopener,noreferrer")}>
        Open Objkt
      </Button>
    </VaultTokenCard>
  );
}

function SkywireTezosVaultPanel({ me }: { me: AtprotoMe }) {
  const wallet = useWallet();
  const qc = useQueryClient();
  const vaultQuery = useQuery<SkywireTezosVaultResponse>({
    queryKey: ["skywire", "tezos-vault"],
    queryFn: () => api.get<SkywireTezosVaultResponse>("/api/skywire/tezos-vault?limit=24"),
    staleTime: 30_000,
  });
  const connect = useMutation({
    mutationFn: () => wallet.connect(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skywire", "tezos-vault"] });
      qc.invalidateQueries({ queryKey: ["wallets"] });
    },
  });
  const fallbackWallets =
    me.tezosIdentity?.wallets.map((linked) => ({
      id: linked.id,
      walletAddress: linked.walletAddress,
      tezDomain: linked.preferredTezosDomain,
      isPrimary: linked.isPrimary,
      linkedAt: null,
      lastSyncedAt: null,
    })) ?? [];
  const wallets = vaultQuery.data?.wallets ?? fallbackWallets;
  const owned = vaultQuery.data?.owned?.items ?? [];
  const created = vaultQuery.data?.created?.items ?? [];

  return (
    <Stack>
      <GroupBox label="Tezos Vault">
        <Stack>
          <VaultToolbar>
            <MetaRow>
              <StatChip>{wallets.length} wallets</StatChip>
              <StatChip>{vaultQuery.data?.owned?.total ?? owned.length} owned</StatChip>
              <StatChip>{vaultQuery.data?.created?.total ?? created.length} created</StatChip>
            </MetaRow>
            <TokenMarketActions>
              <Button size="sm" disabled={connect.isPending || wallet.isConnecting} onClick={() => connect.mutate()}>
                {connect.isPending || wallet.isConnecting ? "Connecting..." : wallet.address ? "Reconnect Wallet" : "Connect Wallet"}
              </Button>
              <Button size="sm" disabled={vaultQuery.isFetching} onClick={() => vaultQuery.refetch()}>
                {vaultQuery.isFetching ? "Refreshing..." : "Refresh"}
              </Button>
            </TokenMarketActions>
          </VaultToolbar>
          {vaultQuery.isLoading ? <Hourglass size={24} /> : null}
          {vaultQuery.isError ? <InlineState>{(vaultQuery.error as Error).message}</InlineState> : null}
          {wallets.length ? (
            <VaultWalletGrid>
              {wallets.map((linked) => (
                <VaultWalletCard key={linked.walletAddress}>
                  <strong>{linked.tezDomain || shortAddress(linked.walletAddress)}</strong>
                  <Mono>{linked.walletAddress}</Mono>
                  <MetaRow>
                    {linked.isPrimary ? <StatChip>Primary</StatChip> : <StatChip>Linked</StatChip>}
                    {linked.lastSyncedAt ? <StatChip>Synced {formatDate(linked.lastSyncedAt)}</StatChip> : null}
                  </MetaRow>
                </VaultWalletCard>
              ))}
            </VaultWalletGrid>
          ) : (
            <EmptyState>
              <strong>No linked Tezos wallets.</strong>
              <span>Connect a wallet to populate this vault.</span>
            </EmptyState>
          )}
        </Stack>
      </GroupBox>

      <GroupBox label="Owned Tokens">
        <Stack>
          {owned.length ? (
            <VaultGrid>
              {owned.map((token) => (
                <SkywireVaultTokenTile
                  key={`${token.walletAddress}:${token.faContract}:${token.tokenId}`}
                  token={token}
                  badge={token.lastSeenAt ? formatDate(token.lastSeenAt) : "Owned"}
                />
              ))}
            </VaultGrid>
          ) : (
            <EmptyState>
              <strong>No owned tokens indexed yet.</strong>
              <span>Refresh after a wallet sync.</span>
            </EmptyState>
          )}
        </Stack>
      </GroupBox>

      <GroupBox label="Created Tokens">
        <Stack>
          {vaultQuery.data?.created?.error ? <InlineState>{vaultQuery.data.created.error}</InlineState> : null}
          {created.length ? (
            <VaultGrid>
              {created.map((token) => (
                <SkywireVaultTokenTile
                  key={`${token.faContract}:${token.tokenId}`}
                  token={token}
                  badge="Created"
                />
              ))}
            </VaultGrid>
          ) : (
            <EmptyState>
              <strong>No created tokens found.</strong>
              <span>Objkt has no creator matches for the linked wallets.</span>
            </EmptyState>
          )}
        </Stack>
      </GroupBox>
    </Stack>
  );
}

function ActorFeedPanel({
  actor,
  canUseSocialActions,
  canCompose,
  onActorSelect,
  onThreadOpen,
  onPipelineOpen,
  onRoomQuote,
  onStageQuote,
  onChatQuote,
}: {
  actor: SkywireActor | null;
  canUseSocialActions: boolean;
  canCompose: boolean;
  onActorSelect?: (actor: SkywireActor) => void;
  onThreadOpen?: (post: SkywirePost) => void;
  onPipelineOpen?: (post: SkywirePost) => void;
  onRoomQuote?: (quote: SkywireQuotePost) => void;
  onStageQuote?: (quote: SkywireQuotePost) => void;
  onChatQuote?: (quote: SkywireQuotePost, members?: string[]) => void;
}) {
  const actorId = actor?.did || actor?.handle || "";
  const query = useInfiniteQuery<FeedResponse>({
    queryKey: ["skywire", "actor-feed", actorId],
    enabled: Boolean(actorId),
    initialPageParam: "",
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set("cursor", String(pageParam));
      return api.get(`/api/skywire/actor/${encodeURIComponent(actorId)}/feed?${params.toString()}`);
    },
    getNextPageParam: (lastPage) => lastPage.cursor || undefined,
  });
  if (!actorId) {
    return (
      <EmptyState>
        <strong>Select an actor.</strong>
        <span>Open any handle from Home, Discover, WTF Feed, or Tezos Feed to inspect their posts here.</span>
      </EmptyState>
    );
  }
  if (query.isLoading) return <Hourglass size={24} />;
  if (query.isError) return <p>{(query.error as Error).message}</p>;
  const feed = query.data?.pages.flatMap((page) => page.feed) ?? [];
  return (
    <FeedColumn>
      <GroupBox label="Author">
        <Row>
          {actor?.avatar ? <img src={actor.avatar} width={40} height={40} alt="" /> : null}
          <div>
            <strong>{actor?.displayName || actor?.handle || actorId}</strong>
            <div>@{actor?.handle || actorId}</div>
          </div>
        </Row>
        {actor?.description ? <p>{actor.description}</p> : null}
        <Mono>{actorId}</Mono>
      </GroupBox>
      <FeedList $social data-skywire-feed-list="true">
        {feed.length === 0 ? (
          <EmptyState>
            <strong>No posts found for this actor.</strong>
            <span>The AppView returned an empty author feed.</span>
          </EmptyState>
        ) : null}
        {feed.map((item, index) => (
          <FeedCard
            item={item}
            canUseSocialActions={canUseSocialActions}
            canCompose={canCompose}
            onActorSelect={onActorSelect}
            onThreadOpen={onThreadOpen}
            onPipelineOpen={onPipelineOpen}
            onRoomQuote={onRoomQuote}
            onStageQuote={onStageQuote}
            onChatQuote={onChatQuote}
            key={item.post.uri || index}
          />
        ))}
      </FeedList>
      {query.hasNextPage ? (
        <Button disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
          {query.isFetchingNextPage ? "Loading..." : "Load More"}
        </Button>
      ) : null}
    </FeedColumn>
  );
}

function flattenThreadParents(node: SkywireThreadNode | null): SkywireThreadNode[] {
  const parents: SkywireThreadNode[] = [];
  let current = node?.parent ?? null;
  while (current) {
    parents.unshift(current);
    current = current.parent;
  }
  return parents;
}

function ThreadNodeView({
  node,
  focusUri,
  canUseSocialActions,
  canCompose,
  onActorSelect,
  onThreadOpen,
  onPipelineOpen,
  onRoomQuote,
  onStageQuote,
  onChatQuote,
}: {
  node: SkywireThreadNode;
  focusUri: string;
  canUseSocialActions: boolean;
  canCompose: boolean;
  onActorSelect?: (actor: SkywireActor) => void;
  onThreadOpen?: (post: SkywirePost) => void;
  onPipelineOpen?: (post: SkywirePost) => void;
  onRoomQuote?: (quote: SkywireQuotePost) => void;
  onStageQuote?: (quote: SkywireQuotePost) => void;
  onChatQuote?: (quote: SkywireQuotePost, members?: string[]) => void;
}) {
  const isFocus = node.post?.uri === focusUri || node.uri === focusUri;
  if (!node.post) {
    return (
      <EmptyState>
        <strong>{node.state === "blocked" ? "Blocked post" : node.state === "not_found" ? "Post not found" : "Thread item unavailable"}</strong>
        {node.uri ? <Mono>{node.uri}</Mono> : null}
      </EmptyState>
    );
  }
  return (
    <Stack>
      <ThreadMarker $focus={isFocus}>{isFocus ? "Selected post" : "Reply"}</ThreadMarker>
      <FeedCard
        item={{ post: node.post, reason: null }}
        canUseSocialActions={canUseSocialActions}
        canCompose={canCompose}
        onActorSelect={onActorSelect}
        onThreadOpen={onThreadOpen}
        onPipelineOpen={onPipelineOpen}
        onRoomQuote={onRoomQuote}
        onStageQuote={onStageQuote}
        onChatQuote={onChatQuote}
      />
      {node.replies.length ? (
        <ThreadBranch>
          {node.replies.map((reply) => (
            <ThreadNodeView
              key={reply.uri || reply.post?.uri}
              node={reply}
              focusUri={focusUri}
              canUseSocialActions={canUseSocialActions}
              canCompose={canCompose}
              onActorSelect={onActorSelect}
              onThreadOpen={onThreadOpen}
              onPipelineOpen={onPipelineOpen}
              onRoomQuote={onRoomQuote}
              onStageQuote={onStageQuote}
              onChatQuote={onChatQuote}
            />
          ))}
        </ThreadBranch>
      ) : null}
    </Stack>
  );
}

function ThreadPanel({
  post,
  canUseSocialActions,
  canCompose,
  onActorSelect,
  onThreadOpen,
  onPipelineOpen,
  onRoomQuote,
  onStageQuote,
  onChatQuote,
}: {
  post: SkywirePost | null;
  canUseSocialActions: boolean;
  canCompose: boolean;
  onActorSelect?: (actor: SkywireActor) => void;
  onThreadOpen?: (post: SkywirePost) => void;
  onPipelineOpen?: (post: SkywirePost) => void;
  onRoomQuote?: (quote: SkywireQuotePost) => void;
  onStageQuote?: (quote: SkywireQuotePost) => void;
  onChatQuote?: (quote: SkywireQuotePost, members?: string[]) => void;
}) {
  const query = useQuery<SkywireThreadResponse>({
    queryKey: ["skywire", "thread", post?.uri || ""],
    enabled: Boolean(post?.uri),
    queryFn: () => api.get(`/api/skywire/post/thread?uri=${encodeURIComponent(post?.uri || "")}`),
  });
  if (!post?.uri) {
    return (
      <EmptyState>
        <strong>Select a post thread.</strong>
        <span>Use the Thread action on any feed card to open its conversation context inside Skywire.</span>
      </EmptyState>
    );
  }
  if (query.isLoading) return <Hourglass size={24} />;
  if (query.isError) return <p>{(query.error as Error).message}</p>;
  const thread = query.data?.thread ?? null;
  const parents = flattenThreadParents(thread);
  return (
    <ThreadLayout>
      <GroupBox label="Conversation">
        <ThreadTree>
          {parents.map((parent) => (
            <ThreadNodeView
              key={parent.uri || parent.post?.uri}
              node={parent}
              focusUri={post.uri}
              canUseSocialActions={canUseSocialActions}
              canCompose={canCompose}
              onActorSelect={onActorSelect}
              onThreadOpen={onThreadOpen}
              onPipelineOpen={onPipelineOpen}
              onRoomQuote={onRoomQuote}
              onStageQuote={onStageQuote}
              onChatQuote={onChatQuote}
            />
          ))}
          {thread ? (
            <ThreadNodeView
              node={thread}
              focusUri={post.uri}
              canUseSocialActions={canUseSocialActions}
              canCompose={canCompose}
              onActorSelect={onActorSelect}
              onThreadOpen={onThreadOpen}
              onPipelineOpen={onPipelineOpen}
              onRoomQuote={onRoomQuote}
              onStageQuote={onStageQuote}
              onChatQuote={onChatQuote}
            />
          ) : (
            <EmptyState>
              <strong>Thread unavailable.</strong>
              <span>The AppView did not return a visible thread for this post.</span>
            </EmptyState>
          )}
        </ThreadTree>
      </GroupBox>
      <GroupBox label="Thread Contract">
        <Stack>
          <FeedItem>
            <strong>Source</strong>
            <span>{query.data?.source || "app.bsky.feed.getPostThread"}</span>
          </FeedItem>
          <FeedItem>
            <strong>Selected</strong>
            <Mono>{post.uri}</Mono>
          </FeedItem>
          <FeedItem>
            <strong>Context</strong>
            <span>{parents.length} parent posts, {thread?.replies.length ?? 0} direct replies</span>
          </FeedItem>
          {post.sourceUrl ? (
            <Button size="sm" onClick={() => window.open(post.sourceUrl || "", "_blank", "noopener,noreferrer")}>
              Open on Bluesky
            </Button>
          ) : null}
        </Stack>
      </GroupBox>
    </ThreadLayout>
  );
}

function PipelinePanel({ post }: { post: SkywirePost | null }) {
  const [note, setNote] = useState("");
  const [pendingPipelineId, setPendingPipelineId] = useState("");
  const [lastDispatch, setLastDispatch] = useState("");
  const qc = useQueryClient();
  const query = useQuery<SkywirePipelinesResponse>({
    queryKey: ["skywire", "pipelines"],
    queryFn: () => api.get("/api/skywire/pipelines"),
  });
  const historyQuery = useQuery<SkywirePipelineHistoryResponse>({
    queryKey: ["skywire", "pipelines", "history"],
    queryFn: () => api.get("/api/skywire/pipelines/history?limit=20"),
  });
  const dispatch = useMutation({
    mutationFn: (pipeline: SkywirePipeline) => {
      if (!post) throw new Error("Select a post before dispatching.");
      return api.post("/api/skywire/pipelines/dispatch", {
        pipelineId: pipeline.id,
        post: pipelinePostFromPost(post),
        note,
      });
    },
    onSuccess: (data: any, pipeline) => {
      setLastDispatch(`${pipeline.title} queued ${data?.event?.deduped ? "again" : "now"}.`);
      setNote("");
      qc.invalidateQueries({ queryKey: ["skywire", "pipelines", "history"] });
    },
    onSettled: () => setPendingPipelineId(""),
  });
  const dispatchAll = useMutation({
    mutationFn: (pipelines: SkywirePipeline[]) => {
      if (!post) throw new Error("Select a post before dispatching.");
      return api.post("/api/skywire/pipelines/dispatch-batch", {
        pipelineIds: pipelines.map((pipeline) => pipeline.id),
        post: pipelinePostFromPost(post),
        note,
      });
    },
    onSuccess: (data: any) => {
      setLastDispatch(`${Number(data?.count ?? 0)} pipelines queued.`);
      setNote("");
      qc.invalidateQueries({ queryKey: ["skywire", "pipelines", "history"] });
    },
  });
  if (query.isLoading) return <Hourglass size={24} />;
  if (query.isError) return <p>{(query.error as Error).message}</p>;
  const pipelines = query.data?.pipelines ?? [];
  const history = historyQuery.data?.events ?? [];
  return (
    <Grid>
      <Stack>
        <GroupBox label="Selected Post">
          <Stack>
            {post?.uri ? (
              <>
                <QuotePreview quote={quoteFromPost(post)} />
                <TextArea
                  value={note}
                  onChange={(event) => setNote(event.currentTarget.value)}
                  maxLength={280}
                  placeholder="optional operator note"
                />
                <Button disabled={!pipelines.length || dispatchAll.isPending || dispatch.isPending} onClick={() => dispatchAll.mutate(pipelines)}>
                  {dispatchAll.isPending ? "Queueing All..." : "Send to All Pipelines"}
                </Button>
              </>
            ) : (
              <EmptyState>
                <strong>Select a post for pipelines.</strong>
                <span>Use the Pipelines action on any feed or thread card to send Bluesky context into WTFOS apps.</span>
              </EmptyState>
            )}
          </Stack>
        </GroupBox>
        <GroupBox label="Pipeline Contract">
          <Stack>
            <span>Source: {query.data?.source || "skywire.systemEventPipelines"}</span>
            <span>Storage: {query.data?.storage || "wtfos_system_events"}</span>
            <span>Canonical PDS write: {query.data?.writesCanonicalPdsState ? "yes" : "no"}</span>
            {post?.uri ? <Mono>{post.uri}</Mono> : null}
          </Stack>
        </GroupBox>
      </Stack>
      <Stack>
        <GroupBox label="Dispatch">
          <Stack>
            {pipelines.map((pipeline) => (
              <FeedItem key={pipeline.id}>
                <strong>{pipeline.title}</strong>
                <span>{pipeline.description}</span>
                <MetaRow>
                  <StatChip>{pipeline.app}</StatChip>
                  <StatChip>{pipeline.eventType}</StatChip>
                  <StatChip>{pipeline.appRoute}</StatChip>
                </MetaRow>
                <Row>
                  <Button
                    size="sm"
                    disabled={!post?.uri || dispatch.isPending || dispatchAll.isPending}
                    onClick={() => {
                      setPendingPipelineId(pipeline.id);
                      dispatch.mutate(pipeline);
                    }}
                  >
                    {pendingPipelineId === pipeline.id ? "Queueing..." : `Send to ${pipeline.app}`}
                  </Button>
                  <Button size="sm" onClick={() => window.open(pipeline.appRoute, "_self")}>
                    Open App
                  </Button>
                </Row>
              </FeedItem>
            ))}
            {lastDispatch ? <NoticeBar>{lastDispatch}</NoticeBar> : null}
            {dispatch.isError ? <p>{(dispatch.error as Error).message}</p> : null}
            {dispatchAll.isError ? <p>{(dispatchAll.error as Error).message}</p> : null}
          </Stack>
        </GroupBox>
        <GroupBox label="Recent Pipeline Events">
          <Stack>
            {historyQuery.isLoading ? <Hourglass size={18} /> : null}
            {historyQuery.isError ? <p>{(historyQuery.error as Error).message}</p> : null}
            {!historyQuery.isLoading && history.length === 0 ? (
              <EmptyState>
                <strong>No pipeline events yet.</strong>
                <span>Queued posts will appear here after Skywire writes them into the WTFOS event spine.</span>
              </EmptyState>
            ) : null}
            {history.map((event) => (
              <FeedItem key={event.eventId}>
                <strong>{String(event.metadata?.pipelineTitle || event.eventType)}</strong>
                <span>{String(event.metadata?.postText || "No post text captured.")}</span>
                <MetaRow>
                  <StatChip>{String(event.metadata?.targetApp || "WTFOS")}</StatChip>
                  <StatChip>{formatDate(event.occurredAt)}</StatChip>
                  <StatChip>{event.eventType}</StatChip>
                </MetaRow>
                <Mono>{String(event.metadata?.postUri || event.rawRefId || event.eventId)}</Mono>
              </FeedItem>
            ))}
          </Stack>
        </GroupBox>
      </Stack>
    </Grid>
  );
}

function PermissionPickerDialog({
  handle,
  initialTier,
  initialChatEnabled,
  onCancel,
  onConfirm,
}: {
  handle: string;
  initialTier: SkywirePermissionTier;
  initialChatEnabled: boolean;
  onCancel: () => void;
  onConfirm: (tier: SkywirePermissionTier, chatEnabled: boolean) => void;
}) {
  const [tier, setTier] = useState<SkywirePermissionTier>(initialTier);
  const [chatEnabled, setChatEnabled] = useState(initialChatEnabled);
  const selected = SKYWIRE_PERMISSION_TIER_OPTIONS.find((option) => option.key === tier) ?? SKYWIRE_PERMISSION_TIER_OPTIONS[1];
  const requestedScope = useMemo(() => buildSkywireAtprotoScope(tier, chatEnabled), [tier, chatEnabled]);
  return (
    <ModalBackdrop role="presentation">
      <ModalPanel role="dialog" aria-modal="true" aria-label="Choose Skywire permissions">
        <GroupBox label={`Connect @${handle}`}>
          <FinePrint>Step 1 of 2 · Confirm the handle, then choose permissions.</FinePrint>
        </GroupBox>
        <GroupBox label="Step 2 · Choose permissions before OAuth">
          <Stack>
            <p>
              Skywire asks Bluesky for only what you pick below. You can change this later from Settings.
            </p>
            <TierList>
              {SKYWIRE_PERMISSION_TIER_OPTIONS.map((option) => (
                <TierOption key={option.key} $selected={tier === option.key}>
                  <Row>
                    <input
                      type="radio"
                      name="skywire-permission-tier"
                      checked={tier === option.key}
                      onChange={() => setTier(option.key)}
                    />
                    <div>
                      <strong>{option.title}</strong>
                      <div>{option.shortLabel}</div>
                    </div>
                  </Row>
                  <FinePrint>{option.summary}</FinePrint>
                  <FinePrint>{option.description}</FinePrint>
                </TierOption>
              ))}
            </TierList>
          </Stack>
        </GroupBox>

        <GroupBox label="Bluesky Chat / DMs">
          <Stack>
            <FinePrint>{SKYWIRE_CHAT_PERMISSION_DESCRIPTION}</FinePrint>
            <RadioRow>
              <input
                type="radio"
                name="skywire-chat-permission"
                checked={!chatEnabled}
                onChange={() => setChatEnabled(false)}
              />
              <span>DM access off. Skywire will not ask for Bluesky chat permissions.</span>
            </RadioRow>
            <RadioRow>
              <input
                type="radio"
                name="skywire-chat-permission"
                checked={chatEnabled}
                onChange={() => setChatEnabled(true)}
              />
              <span>DM access on. Ask Bluesky for the separate chat permission.</span>
            </RadioRow>
            <FinePrint>{SKYWIRE_CHAT_PERMISSION_WARNING}</FinePrint>
            {chatEnabled && tier !== "be-bold" ? (
              <FinePrint>
                Bluesky DM access currently uses a transitional chat permission that may also require the broad
                compatibility scope. Skywire will show that broader request in OAuth instead of hiding it.
              </FinePrint>
            ) : null}
          </Stack>
        </GroupBox>

        <GroupBox label={`${selected.title} Agreement`}>
          <Stack>
            <strong>{selected.summary}</strong>
            {selected.grants.map((grant) => (
              <FinePrint key={grant}>- {grant}</FinePrint>
            ))}
            {selected.warnings.map((warning) => (
              <FinePrint key={warning}>Warning: {warning}</FinePrint>
            ))}
            <FinePrint>
              OAuth scope request: <Mono>{requestedScope}</Mono>
            </FinePrint>
          </Stack>
        </GroupBox>

        <Row>
          <Button onClick={() => onConfirm(tier, chatEnabled)}>
            Continue to Bluesky OAuth
          </Button>
          <Button onClick={onCancel}>Cancel</Button>
        </Row>
      </ModalPanel>
    </ModalBackdrop>
  );
}

function AccountPanel({
  me,
  isAdmin,
  seedHandle = "",
}: {
  me: AtprotoMe;
  isAdmin: boolean;
  seedHandle?: string;
}) {
  const handleClaims = me.handleClaims ?? [];
  const tezosIdentity = me.tezosIdentity ?? null;
  const [handle, setHandle] = useState(seedHandle);
  const [pendingConnectHandle, setPendingConnectHandle] = useState("");
  const [displayName, setDisplayName] = useState(me.account?.displayName || "");
  const [description, setDescription] = useState(me.account?.description || "");
  const [desiredHandle, setDesiredHandle] = useState("");
  const [tezosAlias, setTezosAlias] = useState(me.tezosAlias || "");
  const qc = useQueryClient();
  const canWriteProfile = accountHasCapability(me.account, "profileWrite");
  useEffect(() => {
    if (seedHandle.trim()) setHandle(seedHandle);
  }, [seedHandle]);
  useEffect(() => {
    setDisplayName(me.account?.displayName || "");
    setDescription(me.account?.description || "");
  }, [me.account?.displayName, me.account?.description]);
  useEffect(() => {
    setTezosAlias(tezosIdentity?.preferredTezosDomain || me.tezosAlias || "");
  }, [me.tezosAlias, tezosIdentity?.preferredTezosDomain]);
  const registrationOptions = useQuery<{
    enabled: boolean;
    allowedPds: string[];
    defaultPds: string;
    handleSuffix: string | null;
    inviteCodeRequired: boolean;
    phoneVerificationMode: "skywire" | "external";
    externalSignupUrl: string | null;
  }>({
    queryKey: ["skywire", "registration-options"],
    queryFn: () => api.get("/api/atproto/registration/options"),
  });
  const externalSignupUrl = registrationOptions.data?.externalSignupUrl || "https://bsky.app";
  const normalizedConnectHandle = (rawHandle: string): string => {
    const suffix = registrationOptions.data?.handleSuffix || "bsky.social";
    const trimmed = rawHandle.trim();
    return trimmed.includes(".") ? trimmed : `${trimmed}.${suffix}`;
  };
  const openPermissionPicker = (rawHandle: string) => {
    const trimmed = rawHandle.trim();
    if (!trimmed) return;
    setPendingConnectHandle(normalizedConnectHandle(trimmed));
  };
  const startOAuthConnect = (rawHandle: string, tier: SkywirePermissionTier, chatEnabled: boolean) => {
    const connectHandle = normalizedConnectHandle(rawHandle);
    const params = new URLSearchParams({
      handle: connectHandle,
      returnTo: "/skywire",
      popup: "1",
      tier,
      chat: chatEnabled ? "1" : "0",
    });
    const url = `/api/atproto/oauth/start?${params.toString()}`;
    const popup = window.open("about:blank", "skywire-atproto-oauth", "width=520,height=760");
    if (popup) {
      popup.opener = null;
      popup.location.href = url;
    } else {
      params.delete("popup");
      window.location.href = `/api/atproto/oauth/start?${params.toString()}`;
    }
  };
  const updateProfile = useMutation({
    mutationFn: () => api.post("/api/skywire/profile", { displayName, description }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skywire", "me"] }),
  });
  const claim = useMutation({
    mutationFn: () =>
      api.post("/api/atproto/handle/claim", {
        desiredHandle,
        tezosAlias: tezosAlias || undefined,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skywire", "me"] }),
  });

  return (
    <Stack>
      {pendingConnectHandle ? (
        <PermissionPickerDialog
          handle={pendingConnectHandle}
          initialTier={normalizeSkywirePermissionTier(me.account?.oauthPermissionTier || SKYWIRE_DEFAULT_PERMISSION_TIER)}
          initialChatEnabled={Boolean(me.account?.oauthChatEnabled)}
          onCancel={() => setPendingConnectHandle("")}
          onConfirm={(tier, chatEnabled) => {
            const connectHandle = pendingConnectHandle;
            setPendingConnectHandle("");
            startOAuthConnect(connectHandle, tier, chatEnabled);
          }}
        />
      ) : null}

      <SkywireSettingsSection
        step={1}
        title="Connection & permissions"
        description="Connect your Bluesky handle, pick what Skywire may do, and reconnect when sessions expire."
      >
        <Grid>
          <GroupBox label="Bluesky account">
            <Stack>
              {me.account ? (
                <>
                  <Row>
                    {me.account.avatarUrl ? (
                      <img src={me.account.avatarUrl} width={48} height={48} alt="" />
                    ) : null}
                    <div>
                      <strong>{me.account.displayName || me.account.handle}</strong>
                      <div>@{me.account.handle}</div>
                    </div>
                  </Row>
                  <Mono>{me.account.did}</Mono>
                  <span>PDS: {me.account.pdsUrl || "reported by OAuth issuer"}</span>
                  {me.account.session?.reconnectRequired ? (
                    <GroupBox label="Session needs attention">
                      <Stack>
                        <span>Skywire needs a fresh AT Protocol session for this account.</span>
                        {me.account.session.reason ? <span>Reason: {me.account.session.reason}</span> : null}
                        <Button onClick={() => openPermissionPicker(me.account?.handle || "")}>
                          Reconnect Bluesky
                        </Button>
                      </Stack>
                    </GroupBox>
                  ) : (
                    <Stack>
                      <span>Session: connected</span>
                      <span>
                        Permission tier: {skywirePermissionTierLabel(me.account.oauthPermissionTier)}
                        {me.account.oauthChatEnabled ? " + DMs" : ""}
                      </span>
                      <FinePrint>
                        Capabilities: {(me.account.oauthCapabilities ?? []).join(", ") || "identity"}
                      </FinePrint>
                      <Button onClick={() => openPermissionPicker(me.account?.handle || "")}>
                        Change permissions & reconnect
                      </Button>
                    </Stack>
                  )}
                </>
              ) : (
                <>
                  <TextField
                    value={handle}
                    onChange={(e: any) => setHandle(e.target.value)}
                    placeholder="your-handle.bsky.social"
                    fullWidth
                  />
                  <Button disabled={!handle.trim()} onClick={() => openPermissionPicker(handle)}>
                    Continue to permission picker
                  </Button>
                  <GroupBox label="New to Bluesky?">
                    <Stack>
                      <span>
                        Create a Bluesky account in the official app, then return here and connect the new handle.
                      </span>
                      {registrationOptions.isLoading ? <Hourglass size={24} /> : null}
                      {registrationOptions.isError ? <span>{(registrationOptions.error as Error).message}</span> : null}
                      <Row>
                        <Button
                          onClick={() => {
                            window.open(externalSignupUrl, "_blank", "noopener,noreferrer");
                          }}
                        >
                          Open Bluesky signup
                        </Button>
                      </Row>
                    </Stack>
                  </GroupBox>
                </>
              )}
            </Stack>
          </GroupBox>
          <SkywirePermissionOverview />
        </Grid>
      </SkywireSettingsSection>

      {me.account ? (
        <SkywireSettingsSection
          step={2}
          title="Profile"
          description="Push display name and bio to your AT repo. Requires Be Heard or Be Bold."
        >
          <GroupBox label="Skywire profile">
            <Stack>
              <TextField
                value={displayName}
                onChange={(e: any) => setDisplayName(e.target.value)}
                placeholder="display name"
                fullWidth
              />
              <TextArea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="profile description"
                maxLength={256}
              />
              <Button disabled={!canWriteProfile || updateProfile.isPending} onClick={() => updateProfile.mutate()}>
                Update profile
              </Button>
              {!canWriteProfile ? (
                <SkywireCapabilityGate
                  title="Profile edits need Be Heard or Be Bold"
                  body="Reconnect with a higher permission tier to write profile records from Skywire."
                  requiredTier="be-heard"
                  onOpenSettings={() => openPermissionPicker(me.account?.handle || "")}
                />
              ) : null}
              {updateProfile.isError ? <span>{(updateProfile.error as Error).message}</span> : null}
              {updateProfile.isSuccess ? <span>Profile pushed to your AT repo.</span> : null}
            </Stack>
          </GroupBox>
        </SkywireSettingsSection>
      ) : null}

      <SkywireSettingsSection
        step={3}
        title="Identity bridge"
        description="Link WTF Tezos identity to Skywire handle claims for cross-app discovery."
      >
        <Grid>
          <GroupBox label="Bridge status">
            <Stack>
              <span>AT handle: {me.account?.handle || "not connected"}</span>
              <span>
                Preferred Tezos identity: {tezosIdentity?.preferredTezosDomain || "none detected"}
                {tezosIdentity?.preferredSource && tezosIdentity.preferredSource !== "none"
                  ? ` (${tezosIdentity.preferredSource})`
                  : ""}
              </span>
              <span>Primary wallet: {shortAddress(tezosIdentity?.primaryWalletAddress || me.walletAddress)}</span>
              {tezosIdentity?.ownedTezosDomains?.length ? (
                <span>Detected .tez domains: {tezosIdentity.ownedTezosDomains.join(", ")}</span>
              ) : null}
              <TextField
                value={desiredHandle}
                onChange={(e: any) => setDesiredHandle(e.target.value)}
                placeholder="name.skywire.wtfgameshow.app or name.tez"
                fullWidth
              />
              <TextField
                value={tezosAlias}
                onChange={(e: any) => setTezosAlias(e.target.value)}
                placeholder="optional .tez alias"
                fullWidth
              />
              {tezosIdentity?.preferredTezosDomain ? (
                <Button
                  disabled={!me.account}
                  onClick={() => {
                    const preferred = tezosIdentity.preferredTezosDomain || "";
                    setDesiredHandle(preferred);
                    setTezosAlias(preferred);
                  }}
                >
                  Use preferred .tez
                </Button>
              ) : null}
              <Button disabled={!me.account || !desiredHandle.trim() || claim.isPending} onClick={() => claim.mutate()}>
                Claim / record bridge
              </Button>
              {claim.isError ? <span>{(claim.error as Error).message}</span> : null}
            </Stack>
          </GroupBox>
          <GroupBox label="Claim history">
            <Stack>
              {handleClaims.length === 0 ? <p>No handle claims yet.</p> : null}
              {handleClaims.map((claim) => (
                <FeedItem key={claim.id}>
                  <strong>{claim.desiredHandle}</strong>
                  <span>
                    {claim.verificationStatus} via {claim.verificationMethod}
                  </span>
                  {claim.tezosAlias ? <span>Tezos alias: {claim.tezosAlias}</span> : null}
                  {claim.failureReason ? <span>{claim.failureReason}</span> : null}
                </FeedItem>
              ))}
            </Stack>
          </GroupBox>
        </Grid>
      </SkywireSettingsSection>

      {isAdmin ? (
        <SkywireSettingsSection
          step={4}
          title="Admin"
          description="Rollout flags, desktop toggles, and OAuth diagnostics for this surface."
        >
          <SkywireAdminSettingsHint rolloutMode={me.rollout?.rolloutMode} />
        </SkywireSettingsSection>
      ) : null}
    </Stack>
  );
}

function ComposerPanel({ me, canCompose }: { me: AtprotoMe; canCompose: boolean }) {
  const canUseAtprotoSession = Boolean(me.account && !me.account.session?.reconnectRequired);
  const [text, setText] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [postedUri, setPostedUri] = useState("");
  const post = useMutation({
    mutationFn: () =>
      api.post<{ uri: string; cid: string; sourceUrl: string | null }>("/api/skywire/post", {
        text,
        challengeId: challengeId ? Number(challengeId) : undefined,
      }),
    onSuccess: (data) => setPostedUri(data.uri),
  });
  const remaining = 300 - Array.from(text).length;
  const intentUrl = useMemo(() => `/api/skywire/share-intent?text=${encodeURIComponent(text)}`, [text]);

  return (
    <GroupBox label="Composer">
      <Stack>
        <TextArea value={text} onChange={(e) => setText(e.target.value)} maxLength={600} />
        <Row>
          <span>{remaining} characters</span>
          <TextField
            value={challengeId}
            onChange={(e: any) => setChallengeId(e.target.value)}
            placeholder="challenge id"
            style={{ width: 150 }}
          />
          <Button
            disabled={!canUseAtprotoSession || !canCompose || remaining < 0 || text.trim().length === 0 || post.isPending}
            onClick={() => post.mutate()}
          >
            Post
          </Button>
          <Button
            disabled={!text.trim()}
            onClick={async () => {
              const { url } = await api.get<{ url: string }>(intentUrl);
              window.open(url, "_blank", "noopener,noreferrer");
            }}
          >
            Share on Bluesky
          </Button>
        </Row>
        {!me.account ? <span>Connect an AT account to post from inside WTF.</span> : null}
        {me.account && !canUseAtprotoSession ? <span>Reconnect Bluesky from Settings to post from inside WTF.</span> : null}
        {me.account && canUseAtprotoSession && !canCompose ? <span>Choose Be Heard or Be Bold from Settings to post from inside WTF.</span> : null}
        {post.isError ? <span>{(post.error as Error).message}</span> : null}
        {postedUri ? <Mono>{postedUri}</Mono> : null}
      </Stack>
    </GroupBox>
  );
}

function ChallengesPanel() {
  const [postUrlOrUri, setPostUrlOrUri] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const claim = useMutation({
    mutationFn: () =>
      api.post("/api/skywire/post/claim", {
        postUrlOrUri,
        challengeId: challengeId ? Number(challengeId) : undefined,
      }),
  });
  return (
    <GroupBox label="Challenge Claims">
      <Stack>
        <TextField
          value={postUrlOrUri}
          onChange={(e: any) => setPostUrlOrUri(e.target.value)}
          placeholder="https://bsky.app/profile/.../post/... or at://..."
          fullWidth
        />
        <TextField
          value={challengeId}
          onChange={(e: any) => setChallengeId(e.target.value)}
          placeholder="optional challenge id"
          fullWidth
        />
        <Button disabled={!postUrlOrUri.trim() || claim.isPending} onClick={() => claim.mutate()}>
          Claim Existing Post
        </Button>
        {claim.isError ? <span>{(claim.error as Error).message}</span> : null}
        {claim.isSuccess ? <span>Claim submitted to WTF challenge automation.</span> : null}
      </Stack>
    </GroupBox>
  );
}

function NotificationsPanel() {
  const query = useQuery<{
    notifications: Array<{
      uri: string;
      reason: string;
      indexedAt: string | null;
      author: SkywireActor | null;
      post: SkywirePost;
    }>;
  }>({
    queryKey: ["skywire", "notifications"],
    queryFn: () => api.get("/api/skywire/notifications"),
  });
  if (query.isLoading) return <Hourglass size={24} />;
  if (query.isError) return <p>{(query.error as Error).message}</p>;
  return (
    <FeedList>
      {(query.data?.notifications || []).map((item: any, index: number) => (
        <FeedItem key={item.uri || index}>
          <strong>{item.reason}</strong>
          <span>@{item.author?.handle || "unknown"} {formatDate(item.indexedAt)}</span>
          <PostText>{item.post.text || "(no text)"}</PostText>
          <MetaRow>
            <span>{formatCount(item.post.counts.reply)} replies</span>
            <span>{formatCount(item.post.counts.repost)} reposts</span>
            <span>{formatCount(item.post.counts.like)} likes</span>
          </MetaRow>
          {item.post.sourceUrl ? (
            <Button size="sm" onClick={() => window.open(item.post.sourceUrl || "", "_blank", "noopener,noreferrer")}>
              Open
            </Button>
          ) : null}
        </FeedItem>
      ))}
    </FeedList>
  );
}

function DiscoverPanel({
  me,
  onActorOpen,
}: {
  me: AtprotoMe;
  onActorOpen: (actor: SkywireActor) => void;
}) {
  const canUseAtprotoSession = Boolean(me.account && !me.account.session?.reconnectRequired);
  const canFollow = accountHasCapability(me.account, "socialActions");
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const recommendedActors = useQuery<ActorSearchResponse>({
    queryKey: ["skywire", "actors", "recommended"],
    queryFn: () => api.get("/api/skywire/actors/recommended"),
  });
  const suggestedActors = useQuery<ActorSearchResponse>({
    queryKey: ["skywire", "actors", "suggestions"],
    enabled: Boolean(me.account),
    queryFn: () => api.get("/api/skywire/actors/suggestions"),
  });
  const followedActors = useInfiniteQuery<ActorSearchResponse>({
    queryKey: ["skywire", "actors", "follows"],
    enabled: Boolean(me.account),
    initialPageParam: "",
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: "30" });
      if (pageParam) params.set("cursor", String(pageParam));
      return api.get(`/api/skywire/actors/follows?${params.toString()}`);
    },
    getNextPageParam: (lastPage) => lastPage.cursor || undefined,
  });
  const actorSearch = useQuery<ActorSearchResponse>({
    queryKey: ["skywire", "actors", submitted],
    enabled: Boolean(submitted.trim()),
    queryFn: () => api.get(`/api/skywire/actors/search?q=${encodeURIComponent(submitted.trim())}`),
  });
  const follow = useMutation({
    mutationFn: (did: string) => api.post("/api/skywire/follow", { did }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skywire", "actors"] });
    },
  });
  const following = followedActors.data?.pages.flatMap((page) => page.actors) ?? [];
  const followedDidSet = new Set(following.map((actor) => actor.did));
  const renderActor = (actor: ActorSearchResponse["actors"][number], context: "following" | "suggested" | "recommended" | "search") => {
    const isSelf = Boolean(me.account?.did && actor.did === me.account.did);
    const alreadyFollowing = context === "following" || followedDidSet.has(actor.did);
    return (
      <FeedItem key={actor.did}>
        <Row>
          {actor.avatar ? <img src={actor.avatar} width={40} height={40} alt="" /> : null}
          <div>
            <strong>{actor.displayName || actor.handle}</strong>
            <div>@{actor.handle}</div>
            {actor.wtfUsername ? <span>WTF: {actor.wtfUsername}</span> : null}
            {actor.suggestedByHandles?.length ? (
              <span>Followed by {actor.suggestedByHandles.map((handle) => `@${handle}`).join(", ")}</span>
            ) : null}
          </div>
        </Row>
        {actor.description ? <span>{actor.description}</span> : null}
        <Mono>{actor.did}</Mono>
        <Row>
          <Button size="sm" onClick={() => onActorOpen(actorFromRecord(actor))}>
            View Feed
          </Button>
          <Button
            size="sm"
            disabled={!canUseAtprotoSession || !canFollow || isSelf || alreadyFollowing || follow.isPending}
            onClick={() => follow.mutate(actor.did)}
          >
            {isSelf ? "You" : alreadyFollowing ? "Following" : "Follow"}
          </Button>
          {canUseAtprotoSession && !canFollow && !alreadyFollowing && !isSelf ? (
            <FinePrint>Choose Be Social or higher to follow from Skywire.</FinePrint>
          ) : null}
        </Row>
      </FeedItem>
    );
  };

  return (
    <Grid>
      <GroupBox label="Actor Discovery">
        <Stack>
          <GroupBox label="Following on Bluesky">
            <Stack>
              {!me.account ? <p>Connect Bluesky to inspect the actors you follow.</p> : null}
              {followedActors.isLoading ? <Hourglass size={24} /> : null}
              {followedActors.isError ? <span>{(followedActors.error as Error).message}</span> : null}
              <FeedList>
                {following.length === 0 && me.account && !followedActors.isLoading ? (
                  <p>No follows returned for this account yet.</p>
                ) : null}
                {following.map((actor) => renderActor(actor, "following"))}
              </FeedList>
              {followedActors.hasNextPage ? (
                <Button disabled={followedActors.isFetchingNextPage} onClick={() => followedActors.fetchNextPage()}>
                  {followedActors.isFetchingNextPage ? "Loading..." : "Load More Follows"}
                </Button>
              ) : null}
            </Stack>
          </GroupBox>
          <GroupBox label="Suggested by Skywire">
            <Stack>
              {!me.account ? <p>Connect Bluesky to compare your follows with other Skywire users.</p> : null}
              {suggestedActors.isLoading ? <Hourglass size={24} /> : null}
              {suggestedActors.isError ? <span>{(suggestedActors.error as Error).message}</span> : null}
              <FeedList>
                {(suggestedActors.data?.actors ?? []).length === 0 && me.account && !suggestedActors.isLoading ? (
                  <p>No peer follow suggestions yet.</p>
                ) : null}
                {(suggestedActors.data?.actors ?? []).map((actor) => renderActor(actor, "suggested"))}
              </FeedList>
            </Stack>
          </GroupBox>
        </Stack>
      </GroupBox>
      <GroupBox label="Search & Skywire Users">
        <Stack>
          <GroupBox label="Skywire Users">
            <Stack>
              {recommendedActors.isLoading ? <Hourglass size={24} /> : null}
              {recommendedActors.isError ? <span>{(recommendedActors.error as Error).message}</span> : null}
              <FeedList>
                {(recommendedActors.data?.actors ?? []).length === 0 && !recommendedActors.isLoading ? (
                  <p>No other Skywire users have connected Bluesky yet.</p>
                ) : null}
                {(recommendedActors.data?.actors ?? []).map((actor) => renderActor(actor, "recommended"))}
              </FeedList>
            </Stack>
          </GroupBox>
          <Row>
            <TextField
              value={query}
              onChange={(e: any) => setQuery(e.target.value)}
              placeholder="search AT Protocol actors"
              style={{ minWidth: 220, flex: 1 }}
            />
            <Button disabled={!query.trim()} onClick={() => setSubmitted(query)}>
              Search
            </Button>
          </Row>
          {actorSearch.isLoading ? <Hourglass size={24} /> : null}
          {actorSearch.isError ? <span>{(actorSearch.error as Error).message}</span> : null}
          <FeedList>
            {(actorSearch.data?.actors ?? []).map((actor) => renderActor(actor, "search"))}
          </FeedList>
        </Stack>
      </GroupBox>
    </Grid>
  );
}

function SignalsPanel({ me, canPublishSignals }: { me: AtprotoMe; canPublishSignals: boolean }) {
  const canUseAtprotoSession = Boolean(me.account && !me.account.session?.reconnectRequired);
  const [text, setText] = useState("");
  const [signalType, setSignalType] = useState("status");
  const [tags, setTags] = useState("");
  const [relatedUri, setRelatedUri] = useState("");
  const qc = useQueryClient();
  const signals = useQuery<SignalsResponse>({
    queryKey: ["skywire", "signals"],
    enabled: canUseAtprotoSession && canPublishSignals,
    queryFn: () => api.get("/api/skywire/signals"),
  });
  const publish = useMutation({
    mutationFn: () =>
      api.post("/api/skywire/signals", {
        text,
        signalType,
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        relatedUri: relatedUri || undefined,
      }),
    onSuccess: () => {
      setText("");
      setRelatedUri("");
      qc.invalidateQueries({ queryKey: ["skywire", "signals"] });
    },
  });
  if (!me.account) return <p>Connect or register an AT account to publish WTF-native Skywire Signals.</p>;
  if (!canUseAtprotoSession) return <p>Reconnect Bluesky from Settings to publish and inspect Skywire Signals.</p>;
  if (!canPublishSignals) return <p>Choose Be Heard or Be Bold from Settings to publish WTF-native Skywire Signals.</p>;
  return (
    <Grid>
      <GroupBox label="Publish Skywire Signal">
        <Stack>
          <NativeSelect value={signalType} onChange={(event) => setSignalType(event.target.value)}>
            <option value="status">Status</option>
            <option value="quest">Quest</option>
            <option value="drop">Drop</option>
            <option value="proof">Proof</option>
            <option value="broadcast">Broadcast</option>
          </NativeSelect>
          <TextArea value={text} onChange={(event) => setText(event.target.value)} maxLength={300} />
          <TextField
            value={tags}
            onChange={(e: any) => setTags(e.target.value)}
            placeholder="tags, comma separated"
            fullWidth
          />
          <TextField
            value={relatedUri}
            onChange={(e: any) => setRelatedUri(e.target.value)}
            placeholder="optional related at:// uri"
            fullWidth
          />
          <Button disabled={!canPublishSignals || !text.trim() || publish.isPending} onClick={() => publish.mutate()}>
            Publish Signal
          </Button>
          {publish.isError ? <span>{(publish.error as Error).message}</span> : null}
        </Stack>
      </GroupBox>
      <GroupBox label="Your AT Repo Signals">
        <Stack>
          <Mono>{signals.data?.collection || "app.wtfgameshow.skywire.signal"}</Mono>
          {signals.isLoading ? <Hourglass size={24} /> : null}
          {signals.isError ? <span>{(signals.error as Error).message}</span> : null}
          <FeedList>
            {(signals.data?.records ?? []).map((record) => (
              <FeedItem key={record.uri}>
                <strong>{record.value.signalType || "signal"}</strong>
                <span>{record.value.text || "(no text)"}</span>
                {record.value.tags?.length ? <span>{record.value.tags.join(", ")}</span> : null}
                <Mono>{record.uri}</Mono>
              </FeedItem>
            ))}
          </FeedList>
        </Stack>
      </GroupBox>
    </Grid>
  );
}

function ChatPanel({
  me,
  canUseChat,
  pendingQuote,
  initialMembers,
  onQuoteClear,
}: {
  me: AtprotoMe;
  canUseChat: boolean;
  pendingQuote: SkywireQuotePost | null;
  initialMembers: string[];
  onQuoteClear: () => void;
}) {
  const canUseAtprotoSession = Boolean(me.account && !me.account.session?.reconnectRequired);
  const [selectedConvoId, setSelectedConvoId] = useState("");
  const [membersText, setMembersText] = useState("");
  const [messageText, setMessageText] = useState("");
  const initialMembersKey = initialMembers.join("|");
  const qc = useQueryClient();
  useEffect(() => {
    if (initialMembers.length) {
      setMembersText(initialMembers.join(", "));
    }
  }, [initialMembersKey, initialMembers]);
  const chats = useQuery<SkywireChatsResponse>({
    queryKey: ["skywire", "chats"],
    enabled: canUseAtprotoSession && canUseChat,
    queryFn: () => api.get("/api/skywire/chats"),
  });
  const messages = useQuery<SkywireChatMessagesResponse>({
    queryKey: ["skywire", "chats", selectedConvoId, "messages"],
    enabled: canUseAtprotoSession && canUseChat && Boolean(selectedConvoId),
    queryFn: () => api.get(`/api/skywire/chats/${encodeURIComponent(selectedConvoId)}/messages`),
  });
  const selectedConvo = chats.data?.convos.find((convo) => convo.id === selectedConvoId) ?? null;
  const members = membersText
    .split(/[,\s]+/)
    .map((member) => member.trim().replace(/^@/, ""))
    .filter(Boolean);
  const quotePayload = pendingQuote
    ? {
        uri: pendingQuote.uri,
        cid: pendingQuote.cid || undefined,
        sourceUrl: pendingQuote.sourceUrl || undefined,
        text: pendingQuote.text,
        authorHandle: pendingQuote.author?.handle || undefined,
        authorDid: pendingQuote.author?.did || undefined,
        createdAt: pendingQuote.createdAt || undefined,
      }
    : undefined;
  const resolveConvo = useMutation({
    mutationFn: async () =>
      (await api.post("/api/skywire/chats/resolve", { members })) as { convo: SkywireChatConvo },
    onSuccess: (data: { convo: SkywireChatConvo }) => {
      setSelectedConvoId(data.convo.id);
      qc.invalidateQueries({ queryKey: ["skywire", "chats"] });
    },
  });
  const sendToConvo = useMutation({
    mutationFn: () =>
      api.post(`/api/skywire/chats/${encodeURIComponent(selectedConvoId)}/messages`, {
        text: messageText,
        quotedPost: quotePayload,
      }),
    onSuccess: () => {
      setMessageText("");
      onQuoteClear();
      qc.invalidateQueries({ queryKey: ["skywire", "chats"] });
      qc.invalidateQueries({ queryKey: ["skywire", "chats", selectedConvoId, "messages"] });
    },
  });
  const sendToMembers = useMutation({
    mutationFn: async () =>
      (await api.post("/api/skywire/chats/send", {
        members,
        text: messageText,
        quotedPost: quotePayload,
      })) as { convo: SkywireChatConvo },
    onSuccess: (data: { convo: SkywireChatConvo }) => {
      setSelectedConvoId(data.convo.id);
      setMessageText("");
      onQuoteClear();
      qc.invalidateQueries({ queryKey: ["skywire", "chats"] });
      qc.invalidateQueries({ queryKey: ["skywire", "chats", data.convo.id, "messages"] });
    },
  });
  const visibleMessages = [...(messages.data?.messages ?? [])].reverse();
  if (!me.account) {
    return (
      <EmptyState>
        <strong>Connect Bluesky to use Skywire Chat.</strong>
        <span>Chat stays on the Bluesky private chat service, separate from public room and stage records.</span>
      </EmptyState>
    );
  }
  if (!canUseAtprotoSession) {
    return (
      <EmptyState>
        <strong>Reconnect Bluesky from Settings.</strong>
        <span>Your AT session needs a fresh OAuth restore before chat can load.</span>
      </EmptyState>
    );
  }
  if (!canUseChat) {
    return (
      <EmptyState>
        <strong>Enable the DM add-on.</strong>
        <span>Skywire asks for Bluesky chat permission separately so private chat does not hide inside public repo writes.</span>
      </EmptyState>
    );
  }
  return (
    <Grid>
      <GroupBox label="Chats">
        <Stack>
          {chats.isLoading ? <Hourglass size={24} /> : null}
          {chats.isError ? <span>{(chats.error as Error).message}</span> : null}
          <NativeSelect value={selectedConvoId} onChange={(event) => setSelectedConvoId(event.target.value)}>
            <option value="">Choose chat</option>
            {(chats.data?.convos ?? []).map((convo) => (
              <option key={convo.id} value={convo.id}>
                {convo.groupName || convo.members.map((member) => member.handle).join(", ") || convo.id}
              </option>
            ))}
          </NativeSelect>
          <FeedList>
            {visibleMessages.length === 0 && selectedConvoId && !messages.isLoading ? (
              <EmptyState>
                <strong>No messages loaded.</strong>
                <span>This conversation is ready, but the selected history is empty.</span>
              </EmptyState>
            ) : null}
            {!selectedConvoId && !messages.isLoading ? (
              <EmptyState>
                <strong>Choose or resolve a chat.</strong>
                <span>Pick an existing conversation, or paste handles to create a direct or group lane.</span>
              </EmptyState>
            ) : null}
            {messages.isLoading ? <Hourglass size={24} /> : null}
            {messages.isError ? <span>{(messages.error as Error).message}</span> : null}
            {visibleMessages.map((message) => {
              const sender =
                message.sender ||
                selectedConvo?.members.find((member) => member.did === message.senderDid) ||
                null;
              return (
                <FeedItem key={message.id}>
                  <PostHeader>
                    {sender?.avatar ? <Avatar src={sender.avatar} alt="" /> : <AvatarFallback />}
                    <div>
                      <strong>{sender?.displayName || sender?.handle || message.senderDid || "system"}</strong>
                      {sender?.handle ? <div>@{sender.handle}</div> : null}
                      {formatDate(message.sentAt) ? <span>{formatDate(message.sentAt)}</span> : null}
                    </div>
                  </PostHeader>
                  <PostText>{message.text}</PostText>
                  {message.quote ? <QuotePreview quote={message.quote} /> : null}
                </FeedItem>
              );
            })}
          </FeedList>
        </Stack>
      </GroupBox>
      <GroupBox label="Reply In Chat">
        <Stack>
          {initialMembers.length ? <FinePrint>Targeting @{initialMembers.join(", @")}. Add more handles for a group chat.</FinePrint> : null}
          <TextField
            value={membersText}
            onChange={(event: any) => setMembersText(event.target.value)}
            placeholder="handle.bsky.social, did:plc:..."
            fullWidth
          />
          <Row>
            <Button size="sm" disabled={members.length === 0 || resolveConvo.isPending} onClick={() => resolveConvo.mutate()}>
              Open Members
            </Button>
            <span>{members.length >= 2 ? "Group ready" : "Add 2+ for group"}</span>
          </Row>
          {pendingQuote ? (
            <Stack>
              <QuotePreview quote={pendingQuote} />
              <Button size="sm" onClick={onQuoteClear}>Remove Quote</Button>
            </Stack>
          ) : null}
          <TextArea
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
            maxLength={10000}
            placeholder="write the message"
          />
          <Button
            disabled={!selectedConvoId || !messageText.trim() || sendToConvo.isPending}
            onClick={() => sendToConvo.mutate()}
          >
            Send To Selected Chat
          </Button>
          <Button
            disabled={members.length === 0 || !messageText.trim() || sendToMembers.isPending}
            onClick={() => sendToMembers.mutate()}
          >
            Send To Members
          </Button>
          {resolveConvo.isError || sendToConvo.isError || sendToMembers.isError ? (
            <span>
              {((resolveConvo.error || sendToConvo.error || sendToMembers.error) as Error)?.message || "Skywire chat failed."}
            </span>
          ) : null}
        </Stack>
      </GroupBox>
      <GroupBox label="AT Contract">
        <Stack>
          <FeedItem>
            <strong>Service</strong>
            <Mono>{chats.data?.service || "did:web:api.bsky.chat#bsky_chat"}</Mono>
          </FeedItem>
          <FeedItem>
            <strong>Mode</strong>
            <span>Bluesky private chat service with explicit DM add-on consent.</span>
          </FeedItem>
        </Stack>
      </GroupBox>
    </Grid>
  );
}


export function Skywire({ initialTab }: { initialTab?: SkywireTab } = {}) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<SkywireTab>(initialTab ?? "home");
  const [selectedActor, setSelectedActor] = useState<SkywireActor | null>(null);
  const [selectedThreadPost, setSelectedThreadPost] = useState<SkywirePost | null>(null);
  const [selectedPipelinePost, setSelectedPipelinePost] = useState<SkywirePost | null>(null);
  const [pendingChatQuote, setPendingChatQuote] = useState<SkywireQuotePost | null>(null);
  const [pendingChatMembers, setPendingChatMembers] = useState<string[]>([]);
  const [welcomeHandle, setWelcomeHandle] = useState("");
  const [didChooseInitialTab, setDidChooseInitialTab] = useState(false);
  const [notice, setNotice] = useState("");
  const meQuery = useQuery<AtprotoMe>({
    queryKey: ["skywire", "me"],
    queryFn: () => api.get("/api/atproto/me"),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const verifiedHandle = params.get("handle");
    const isPopup = params.get("popup") === "1";
    const tabParam = params.get("tab");
    if (
      tabParam &&
      isSkywireTab(tabParam)
    ) {
      setTab(tabParam as SkywireTab);
      setDidChooseInitialTab(true);
    }
    if (params.get("verified") === "atproto") {
      setTab("home");
      setNotice(verifiedHandle ? `Bluesky identity connected: @${verifiedHandle}` : "Bluesky identity connected.");
      qc.invalidateQueries({ queryKey: ["skywire", "me"] });
      try {
        window.localStorage.setItem(
          "skywire:atproto-linked",
          JSON.stringify({ handle: verifiedHandle, at: Date.now() })
        );
      } catch {
        // Storage sync is best-effort for popup completion.
      }
      if (isPopup) {
        window.close();
      }
    }
    const error = params.get("error");
    if (error === "atproto_handle") setNotice("Enter a Bluesky handle like name.bsky.social, or just the username.");
    if (error === "atproto_oauth_start") setNotice("Bluesky connection could not start. Check the handle and try again.");
    if (error === "atproto_oauth") setNotice("Bluesky connection did not complete. Try connecting again.");
    if (error === "atproto_session") setNotice("Sign in to WTF OS before connecting Bluesky.");
    if (error === "atproto_state") setNotice("Bluesky connection state expired. Try connecting again.");
    if (params.has("verified") || params.has("error")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [qc]);

  useEffect(() => {
    const me = meQuery.data;
    if (!me || didChooseInitialTab || initialTab) return;
    setTab(me.account ? "home" : "account");
    setDidChooseInitialTab(true);
  }, [didChooseInitialTab, initialTab, meQuery.data]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "skywire:atproto-linked" && event.key !== "skywire:atproto-error") return;
      let payload: { handle?: string; error?: string } = {};
      try {
        payload = JSON.parse(event.newValue || "{}") || {};
      } catch {
        payload = {};
      }
      if (event.key === "skywire:atproto-error") {
        setTab("account");
        setNotice(
          payload.error === "atproto_handle"
            ? "Enter a Bluesky handle like name.bsky.social, or just the username."
            : "Bluesky connection did not complete. Try connecting again."
        );
        return;
      }
      const handle = payload.handle || "";
      setTab("home");
      setNotice(handle ? `Bluesky identity connected: @${handle}` : "Bluesky identity connected.");
      qc.invalidateQueries({ queryKey: ["skywire", "me"] });
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [qc]);

  const me = meQuery.data;
  const canUseAtprotoSession = Boolean(me?.account && !me.account.session?.reconnectRequired);
  const canUseSocialActions = Boolean(me?.account && accountHasCapability(me.account, "socialActions"));
  const canCompose = Boolean(me?.account && accountHasCapability(me.account, "compose"));
  const canUseSignals = Boolean(me?.account && accountHasCapability(me.account, "signals"));
  const canUseChat = Boolean(me?.account && accountHasCapability(me.account, "chat"));
  const canUseNotifications = Boolean(me?.account && accountHasCapability(me.account, "notifications"));
  const openActorFeed = (actor: SkywireActor) => {
    if (!actor.did && !actor.handle) return;
    setSelectedActor(actor);
    setTab("actor");
  };
  const openThread = (post: SkywirePost) => {
    if (!post.uri) return;
    setSelectedThreadPost(post);
    setTab("thread");
  };
  const openPipelinePost = (post: SkywirePost) => {
    if (!post.uri) return;
    setSelectedPipelinePost(post);
    setTab("pipelines");
  };
  const handoffToWtfLive = (targetTab: "rooms" | "stages", quote?: SkywireQuotePost | null, id?: string) => {
    if (quote) {
      try {
        sessionStorage.setItem("wtf-live:pending-quote", JSON.stringify(quote));
      } catch {
        // Best-effort quote handoff into the WTF LIVE app.
      }
    }
    const params = new URLSearchParams({ tab: targetTab });
    if (targetTab === "rooms" && id) params.set("room", id);
    if (targetTab === "stages" && id) params.set("stage", id);
    window.location.href = `/live?${params.toString()}`;
  };
  const openRoomQuote = (quote: SkywireQuotePost) => handoffToWtfLive("rooms", quote);
  const openStageQuote = (quote: SkywireQuotePost) => handoffToWtfLive("stages", quote);
  const openChatQuote = (quote: SkywireQuotePost, members: string[] = []) => {
    setPendingChatQuote(quote);
    setPendingChatMembers(Array.from(new Set(members.filter(Boolean))));
    setTab("chat");
  };
  const openSettings = () => setTab("account");
  const leaveContextView = () => {
    setSelectedThreadPost(null);
    setSelectedActor(null);
    setSelectedPipelinePost(null);
    setTab("home");
  };
  const capabilityCount = me?.account ? accountCapabilities(me.account).size : 0;
  const connectionTone = me?.account && canUseAtprotoSession ? "ready" : me?.account ? "warn" : "quiet";
  const chatTone = me?.account && canUseChat ? "ready" : me?.account ? "warn" : "quiet";

  return (
    <AppWindow title="Skywire">
      <Shell>
        <SkywireHeader>
          <HeaderTitle>
            <h2>Skywire</h2>
            <p>
              Bluesky-style home, search, notifications, and messages — plus WTF feeds, Tezos vault, signals, and app pipelines.
              Use the separate <strong>WTF LIVE</strong> app for public rooms and stage broadcasts.
            </p>
          </HeaderTitle>
          <HeaderBadgeGrid>
            <StatusBadge $tone={connectionTone} role="button" style={{ cursor: "pointer" }} onClick={openSettings}>
              <span>Identity</span>
              <strong>{me?.account ? `@${me.account.handle}` : "Connect AT"}</strong>
            </StatusBadge>
            <StatusBadge $tone={connectionTone}>
              <span>Session</span>
              <strong>{canUseAtprotoSession ? "Ready" : me?.account ? "Reconnect" : "Offline"}</strong>
            </StatusBadge>
            <StatusBadge $tone={chatTone}>
              <span>Chat</span>
              <strong>{canUseChat ? "DM add-on on" : "DM add-on off"}</strong>
            </StatusBadge>
            <StatusBadge $tone={capabilityCount > 4 ? "ready" : me?.account ? "warn" : "quiet"}>
              <span>Scope</span>
              <strong>{me?.account ? `${capabilityCount} grants` : "none"}</strong>
            </StatusBadge>
          </HeaderBadgeGrid>
        </SkywireHeader>
        {notice ? <NoticeBar>{notice}</NoticeBar> : null}
        {me && !me.enabled ? (
          <NoticeBar>
            Skywire is in {me.rollout?.rolloutMode || "staff_alpha"} rollout. Your account cannot open Skywire yet.
            Ask an admin to confirm your role or set SKYWIRE_ROLLOUT_MODE=all_users for a public launch.
          </NoticeBar>
        ) : null}
        <SkywireMainLayout
          sidebar={
            <SkywireSidebar
              isAdmin={isAdmin}
              activeTab={tab}
              onSelect={setTab}
              onOpenWtfLive={() => {
                window.location.href = "/live";
              }}
            />
          }
          contextBar={
            ["thread", "actor", "pipelines"].includes(tab) ? (
              <SkywireContextBar
                tab={tab}
                selectedActor={selectedActor}
                selectedThreadPost={selectedThreadPost}
                selectedPipelinePost={selectedPipelinePost}
                onBack={leaveContextView}
              />
            ) : null
          }
        >
        <ContentBody>
          {meQuery.isLoading ? <Hourglass size={32} /> : null}
          {meQuery.isError ? <p>{(meQuery.error as Error).message}</p> : null}
          {me ? (
            <>
              {tab === "account" ? (
                <AccountPanel
                  me={me}
                  isAdmin={isAdmin}
                  seedHandle={welcomeHandle}
                />
              ) : null}
              {tab === "home" ? (
                me.account ? (
                  canUseAtprotoSession ? (
                    <FeedPanel
                      feedType="home"
                      canUseSocialActions={canUseSocialActions}
                      canCompose={canCompose}
                      header={
                        <SkywireHomeCompose
                          canCompose={canCompose}
                          canUseSession={canUseAtprotoSession}
                          onPosted={() => qc.invalidateQueries({ queryKey: ["skywire", "feed", "home"] })}
                          onNeedSettings={openSettings}
                        />
                      }
                      onActorSelect={openActorFeed}
                      onThreadOpen={openThread}
                      onPipelineOpen={openPipelinePost}
                      onRoomQuote={openRoomQuote}
                      onStageQuote={openStageQuote}
                      onChatQuote={openChatQuote}
                    />
                  ) : (
                    <SkywireCapabilityGate
                      title="Reconnect to load Home"
                      body="Your Bluesky session expired. Reconnect from Settings to read your timeline."
                      onOpenSettings={openSettings}
                    />
                  )
                ) : (
                  <SkywireConnectWelcome
                    handle={welcomeHandle}
                    onHandleChange={setWelcomeHandle}
                    onOpenSettings={openSettings}
                    onConnect={() => {
                      setTab("account");
                      setNotice(
                        welcomeHandle.trim()
                          ? `Next: confirm permissions for @${welcomeHandle.trim()} in Settings.`
                          : "Open Settings, enter your handle, then choose permissions before OAuth opens.",
                      );
                    }}
                  />
                )
              ) : null}
              {tab === "actor" ? (
                <ActorFeedPanel
                  actor={selectedActor}
                  canUseSocialActions={canUseSocialActions}
                  canCompose={canCompose}
                  onActorSelect={openActorFeed}
                  onThreadOpen={openThread}
                  onPipelineOpen={openPipelinePost}
                  onRoomQuote={openRoomQuote}
                  onStageQuote={openStageQuote}
                  onChatQuote={openChatQuote}
                />
              ) : null}
              {tab === "thread" ? (
                <ThreadPanel
                  post={selectedThreadPost}
                  canUseSocialActions={canUseSocialActions}
                  canCompose={canCompose}
                  onActorSelect={openActorFeed}
                  onThreadOpen={openThread}
                  onPipelineOpen={openPipelinePost}
                  onRoomQuote={openRoomQuote}
                  onStageQuote={openStageQuote}
                  onChatQuote={openChatQuote}
                />
              ) : null}
              {tab === "pipelines" ? <PipelinePanel post={selectedPipelinePost} /> : null}
              {tab === "discover" ? <DiscoverPanel me={me} onActorOpen={openActorFeed} /> : null}
              {tab === "wtf" ? (
                <FeedPanel
                  feedType="wtf"
                  canUseSocialActions={canUseSocialActions}
                  canCompose={canCompose}
                  onActorSelect={openActorFeed}
                  onThreadOpen={openThread}
                  onPipelineOpen={openPipelinePost}
                  onRoomQuote={openRoomQuote}
                  onStageQuote={openStageQuote}
                  onChatQuote={openChatQuote}
                />
              ) : null}
              {tab === "tezos" ? (
                <FeedPanel
                  feedType="tezos"
                  canUseSocialActions={canUseSocialActions}
                  canCompose={canCompose}
                  onActorSelect={openActorFeed}
                  onThreadOpen={openThread}
                  onPipelineOpen={openPipelinePost}
                  onRoomQuote={openRoomQuote}
                  onStageQuote={openStageQuote}
                  onChatQuote={openChatQuote}
                />
              ) : null}
              {tab === "market" ? (
                <FeedPanel
                  feedType="market"
                  canUseSocialActions={canUseSocialActions}
                  canCompose={canCompose}
                  onActorSelect={openActorFeed}
                  onThreadOpen={openThread}
                  onPipelineOpen={openPipelinePost}
                  onRoomQuote={openRoomQuote}
                  onStageQuote={openStageQuote}
                  onChatQuote={openChatQuote}
                />
              ) : null}
              {tab === "vault" ? <SkywireTezosVaultPanel me={me} /> : null}
              {tab === "mentions" ? (
                me.account ? (
                  canUseAtprotoSession && canUseNotifications ? (
                    <NotificationsPanel />
                  ) : (
                    <SkywireCapabilityGate
                      title="Notifications need Be Safe or higher"
                      body="Choose a permission tier that includes Bluesky notifications, then reconnect."
                      requiredTier="be-safe"
                      onOpenSettings={openSettings}
                    />
                  )
                ) : (
                  <SkywireConnectWelcome
                    handle={welcomeHandle}
                    onHandleChange={setWelcomeHandle}
                    onOpenSettings={openSettings}
                    onConnect={() => {
                      setTab("account");
                      setNotice("Connect Bluesky in Settings to load notifications.");
                    }}
                  />
                )
              ) : null}
              {tab === "chat" ? (
                <ChatPanel
                  me={me}
                  canUseChat={canUseChat}
                  pendingQuote={pendingChatQuote}
                  initialMembers={pendingChatMembers}
                  onQuoteClear={() => {
                    setPendingChatQuote(null);
                    setPendingChatMembers([]);
                  }}
                />
              ) : null}
              {tab === "signals" ? <SignalsPanel me={me} canPublishSignals={canUseSignals} /> : null}
              {tab === "challenges" ? <ChallengesPanel /> : null}
              {tab === "composer" ? <ComposerPanel me={me} canCompose={canCompose} /> : null}
              {tab === "debug" && isAdmin ? (
                <GroupBox label="Debug">
                  <Stack>
                    <span>Client ID: <Mono>{me.oauth.clientIdUrl}</Mono></span>
                    <span>Redirect: <Mono>{me.oauth.redirectUri}</Mono></span>
                    <span>Token storage: {me.account?.hasEncryptedTokens ? "encrypted" : "not connected"}</span>
                    <span>DPoP key: {me.account?.hasDpopKey ? "stored encrypted" : "not stored"}</span>
                    <span>Last sync: {me.account?.lastSyncedAt || "never"}</span>
                  </Stack>
                </GroupBox>
              ) : null}
            </>
          ) : null}
        </ContentBody>
        </SkywireMainLayout>
      </Shell>
    </AppWindow>
  );
}
