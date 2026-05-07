import { WTF_TOKEN } from "@shared/types";

const WALLET_SESSION_KEY = "wtf:wallet-session";
const WALLET_SESSION_EVENT = "wtf:wallet-session-changed";

const STATE_KEY = "wtf:ux-lab-state";

type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

interface MockUser {
  id: number;
  username: string;
  displayName: string;
  role: string;
  bio: string;
  avatarUrl: string;
  pfpImageUrl: string;
  twitterHandle?: string;
  twitterVerified?: boolean;
  discordHandle?: string;
  discordVerified?: boolean;
  createdAt: string;
  email?: string;
  walletAddresses: string[];
  experiencePoints: number;
}

interface MockWallet {
  id: number;
  userId: number;
  walletAddress: string;
  isPrimary: boolean;
  tokenCount: number;
  tezDomain?: string;
  wtfBalance: string;
}

interface MockToken {
  id: number;
  contract: string;
  tokenId: string;
  name: string;
  thumbnail: string;
  mimeType: string;
  balance: string;
  walletAddress: string;
  ownerUserId: number;
  creatorUserId: number;
  description: string;
  collectionName?: string;
  tradeBoardQuantity?: number;
  tags?: string[];
}

interface MockCollection {
  id: number;
  userId: number;
  type: string;
  title: string;
  description: string;
  slug: string;
  isPublic: boolean;
  coverUri: string | null;
  metadata: Record<string, Json>;
  externalRef: string | null;
  createdAt: string;
  updatedAt: string;
  itemIds: number[];
}

interface MockBoardCategory {
  id: number;
  name: string;
  position: number;
  collapsed: boolean;
}

interface MockBoardChannel {
  id: number;
  title: string;
  body: string;
  categoryId: number | null;
  channelType: string;
  topic: string | null;
  position: number;
  slowModeSeconds: number;
  viewRoles: string[];
  replyRoles: string[];
  active: boolean;
  pinned: boolean;
  locked: boolean;
}

interface MockBoardMessage {
  id: number;
  threadId: number;
  userId: number;
  content: string;
  attachments: Array<{ url: string; name: string; type: string }>;
  pinned: boolean;
  parentReplyId: number | null;
  webhookId: number | null;
  createdAt: string;
  editedAt: string | null;
  reactions: Record<string, number[]>;
}

interface MockDm {
  id: number;
  participants: number[];
  messages: Array<{
    id: number;
    senderId: number;
    content: string;
    createdAt: string;
    pinned?: boolean;
  }>;
}

interface MockMarketplaceListing {
  id: number;
  seller: string;
  sellerUserId: number;
  sellerUsername: string;
  sellerDisplayName: string;
  tokenContract: string;
  tokenId: string;
  tokenAmount: string;
  tokenName: string;
  tokenThumbnail: string;
  priceWtf: string;
  royaltyRecipient: string | null;
  royaltyBps: string;
  active: boolean;
}

interface MockMarketplaceAuction {
  id: number;
  creator: string;
  creatorUserId: number;
  creatorUsername: string;
  creatorDisplayName: string;
  tokenContract: string;
  tokenId: string;
  tokenName: string;
  tokenThumbnail: string;
  reserve: string;
  startTime: string;
  endTime: string;
  extensionTime: string;
  priceIncrement: string;
  currentPrice: string;
  highestBidder: string;
  highestBidderUsername: string | null;
  highestBidderDisplayName: string | null;
  hasBid: boolean;
  shares: Array<{ amount: string; recipient: string }>;
  active: boolean;
}

interface MockMarketplaceOffer {
  tokenContract: string;
  tokenId: string;
  tokenName: string;
  tokenThumbnail: string;
  offerer: string;
  offererUserId: number;
  offererUsername: string;
  offererDisplayName: string;
  targetOwner: string;
  targetOwnerUserId: number;
  targetOwnerUsername: string;
  targetOwnerDisplayName: string;
  tokenAmount: string;
  amountWtf: string;
}

interface MockNotification {
  id: number;
  userId: number;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

interface MockContractLog {
  id: number;
  userId: number;
  walletAddress: string;
  module: string;
  action: string;
  status: string;
  contractAddress: string;
  entrypoint: string;
  opHash: string;
  params: Record<string, Json>;
  createdAt: string;
}

interface MockState {
  currentUserId: number | null;
  nextIds: Record<string, number>;
  users: MockUser[];
  wallets: MockWallet[];
  tokens: MockToken[];
  collections: MockCollection[];
  boardCategories: MockBoardCategory[];
  boardChannels: MockBoardChannel[];
  boardMessages: MockBoardMessage[];
  dms: MockDm[];
  listings: MockMarketplaceListing[];
  auctions: MockMarketplaceAuction[];
  offers: MockMarketplaceOffer[];
  notifications: MockNotification[];
  contractLogs: MockContractLog[];
}

function svgData(label: string, a: string, b: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320"><defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="320" height="320" fill="url(#g)"/><circle cx="84" cy="84" r="42" fill="rgba(255,255,255,.18)"/><circle cx="258" cy="246" r="58" fill="rgba(0,0,0,.16)"/><text x="22" y="272" font-family="Courier New, monospace" font-size="24" fill="white">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function nowMinus(hours: number) {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

function seedState(): MockState {
  const users: MockUser[] = [
    {
      id: 1,
      username: "teztactician",
      displayName: "Tez Tactician",
      role: "resident_wizard",
      bio: "Power user. Lives inside Objkt tabs, contract diffs, and wallet dossier edge cases.",
      avatarUrl: svgData("TT", "#0b3d91", "#0f8bd7"),
      pfpImageUrl: svgData("TACTICIAN", "#0b3d91", "#0f8bd7"),
      twitterHandle: "teztactician",
      twitterVerified: true,
      discordHandle: "teztactician#2049",
      discordVerified: true,
      createdAt: nowMinus(24 * 30),
      walletAddresses: ["tz1TACTICIAN1111111111111111111111111", "tz1TACTICIANALT2222222222222222222222"],
      experiencePoints: 12840,
      email: "tez@wtf.local",
    },
    {
      id: 2,
      username: "minamints",
      displayName: "Mina Mints",
      role: "contestant",
      bio: "Artist. Cares about sequencing, framing, legibility, and whether the work still breathes after platform chrome hits it.",
      avatarUrl: svgData("MM", "#8c1c13", "#bf4342"),
      pfpImageUrl: svgData("MINA", "#8c1c13", "#bf4342"),
      twitterHandle: "minamints",
      twitterVerified: true,
      createdAt: nowMinus(24 * 18),
      walletAddresses: ["tz1MINAMINTS3333333333333333333333333"],
      experiencePoints: 8220,
    },
    {
      id: 3,
      username: "vaultmoss",
      displayName: "Vault Moss",
      role: "witness",
      bio: "Collector. Wants calm browsing, trustworthy provenance, and a collection view that feels like a home rather than a spreadsheet.",
      avatarUrl: svgData("VM", "#305252", "#498467"),
      pfpImageUrl: svgData("VAULT", "#305252", "#498467"),
      discordHandle: "vaultmoss#4432",
      discordVerified: true,
      createdAt: nowMinus(24 * 40),
      walletAddresses: ["tz1VAULTMOSS4444444444444444444444444"],
      experiencePoints: 6430,
    },
    {
      id: 4,
      username: "signalglow",
      displayName: "Signal Glow",
      role: "cohost",
      bio: "Influencer / scene signaler. Cares about shareability, public profile theater, and whether discovery feels alive.",
      avatarUrl: svgData("SG", "#6d2e8c", "#e573c0"),
      pfpImageUrl: svgData("SIGNAL", "#6d2e8c", "#e573c0"),
      twitterHandle: "signalglow",
      twitterVerified: true,
      createdAt: nowMinus(24 * 22),
      walletAddresses: ["tz1SIGNALGLOW555555555555555555555555"],
      experiencePoints: 9740,
    },
  ];

  const wallets: MockWallet[] = [
    { id: 1, userId: 1, walletAddress: users[0].walletAddresses[0]!, isPrimary: true, tokenCount: 6, tezDomain: "teztactician.tez", wtfBalance: "182500000" },
    { id: 2, userId: 1, walletAddress: users[0].walletAddresses[1]!, isPrimary: false, tokenCount: 2, tezDomain: "tactician-alt.tez", wtfBalance: "54000000" },
    { id: 3, userId: 2, walletAddress: users[1].walletAddresses[0]!, isPrimary: true, tokenCount: 5, tezDomain: "minamints.tez", wtfBalance: "79000000" },
    { id: 4, userId: 3, walletAddress: users[2].walletAddresses[0]!, isPrimary: true, tokenCount: 7, tezDomain: "vaultmoss.tez", wtfBalance: "131000000" },
    { id: 5, userId: 4, walletAddress: users[3].walletAddresses[0]!, isPrimary: true, tokenCount: 4, tezDomain: "signalglow.tez", wtfBalance: "99000000" },
  ];

  const tokens: MockToken[] = [
    { id: 1, contract: "KT1ARTPORTAL111111111111111111111111", tokenId: "1", name: "After the Scroll", thumbnail: svgData("After the Scroll", "#12355b", "#420039"), mimeType: "image/jpeg", balance: "1", walletAddress: wallets[2].walletAddress, ownerUserId: 2, creatorUserId: 2, description: "Painterly glitch field about what platforms do to chronology.", collectionName: "Slow Burn", tradeBoardQuantity: 1, tags: ["painting", "glitch"] },
    { id: 2, contract: "KT1ARTPORTAL111111111111111111111111", tokenId: "2", name: "Gallery Breath", thumbnail: svgData("Gallery Breath", "#264653", "#2a9d8f"), mimeType: "image/jpeg", balance: "1", walletAddress: wallets[3].walletAddress, ownerUserId: 3, creatorUserId: 2, description: "A collector-held edition emphasizing space and framing.", collectionName: "Slow Burn", tradeBoardQuantity: 1, tags: ["edition", "breath"] },
    { id: 3, contract: "KT1ARTPORTAL111111111111111111111111", tokenId: "3", name: "Context Leak", thumbnail: svgData("Context Leak", "#8338ec", "#3a86ff"), mimeType: "image/png", balance: "1", walletAddress: wallets[0].walletAddress, ownerUserId: 1, creatorUserId: 2, description: "Metadata leaking into composition on purpose.", collectionName: "Slow Burn", tradeBoardQuantity: 1, tags: ["metadata", "ui"] },
    { id: 4, contract: "KT1COLLECTORGRID22222222222222222222", tokenId: "11", name: "Owner Study A", thumbnail: svgData("Owner Study A", "#588157", "#a3b18a"), mimeType: "image/jpeg", balance: "2", walletAddress: wallets[3].walletAddress, ownerUserId: 3, creatorUserId: 1, description: "Power-user made collector display token.", collectionName: "Owner Studies", tradeBoardQuantity: 1, tags: ["collector", "study"] },
    { id: 5, contract: "KT1INFLUX333333333333333333333333333", tokenId: "7", name: "Signal Spill", thumbnail: svgData("Signal Spill", "#ff006e", "#fb5607"), mimeType: "image/jpeg", balance: "1", walletAddress: wallets[4].walletAddress, ownerUserId: 4, creatorUserId: 4, description: "Promo-friendly visual with strong public profile presence.", collectionName: "Signal Spill", tradeBoardQuantity: 1, tags: ["viral", "profile"] },
    { id: 6, contract: "KT1INFLUX333333333333333333333333333", tokenId: "8", name: "Clip Bait for Good", thumbnail: svgData("Clip Bait for Good", "#4361ee", "#4cc9f0"), mimeType: "image/jpeg", balance: "1", walletAddress: wallets[0].walletAddress, ownerUserId: 1, creatorUserId: 4, description: "Short-form attention trap that still respects the work.", collectionName: "Signal Spill", tradeBoardQuantity: 1, tags: ["shareable"] },
    { id: 7, contract: "KT1CURATE444444444444444444444444444", tokenId: "21", name: "Midnight Receipt", thumbnail: svgData("Midnight Receipt", "#22223b", "#9a8c98"), mimeType: "image/jpeg", balance: "1", walletAddress: wallets[1].walletAddress, ownerUserId: 1, creatorUserId: 1, description: "A chain-native receipt turned into a keepsake.", collectionName: "Receipts", tradeBoardQuantity: 1, tags: ["chain"] },
    { id: 8, contract: "KT1CURATE444444444444444444444444444", tokenId: "22", name: "Soft Floor Warning", thumbnail: svgData("Soft Floor Warning", "#3d405b", "#f2cc8f"), mimeType: "image/jpeg", balance: "1", walletAddress: wallets[2].walletAddress, ownerUserId: 2, creatorUserId: 1, description: "Artist reaction to floor-price-first interfaces.", collectionName: "Receipts", tradeBoardQuantity: 1, tags: ["market"] },
  ];

  const collections: MockCollection[] = [
    { id: 1, userId: 1, type: "curation", title: "UX Receipts", description: "Examples Tez Tactician uses when arguing for better platform behavior.", slug: "ux-receipts", isPublic: true, coverUri: tokens[2].thumbnail, metadata: { mood: "forensic" }, externalRef: null, createdAt: nowMinus(40), updatedAt: nowMinus(2), itemIds: [3, 6, 7] },
    { id: 2, userId: 2, type: "wtf_gallery", title: "Slow Burn", description: "How Mina wants her work to breathe inside the platform.", slug: "slow-burn", isPublic: true, coverUri: tokens[0].thumbnail, metadata: { hang: "quiet wall" }, externalRef: null, createdAt: nowMinus(70), updatedAt: nowMinus(4), itemIds: [1, 2, 8] },
    { id: 3, userId: 3, type: "curation", title: "Blue Room Picks", description: "Vault Moss collection grouping for late-night browsing.", slug: "blue-room-picks", isPublic: false, coverUri: tokens[1].thumbnail, metadata: { lighting: "blue room" }, externalRef: null, createdAt: nowMinus(55), updatedAt: nowMinus(6), itemIds: [2, 4, 6] },
    { id: 4, userId: 4, type: "curation", title: "Signal Stack", description: "Works most likely to travel in public.", slug: "signal-stack", isPublic: true, coverUri: tokens[4].thumbnail, metadata: { publicness: "high" }, externalRef: null, createdAt: nowMinus(48), updatedAt: nowMinus(5), itemIds: [5, 6] },
  ];

  const boardCategories: MockBoardCategory[] = [
    { id: 1, name: "Salons", position: 1, collapsed: false },
    { id: 2, name: "Contracts", position: 2, collapsed: false },
  ];

  const boardChannels: MockBoardChannel[] = [
    { id: 1, title: "crit-lounge", body: "Persona critique room for platform feel, sequencing, and browsing comfort.", categoryId: 1, channelType: "forum", topic: "How does WTF feel to live in?", position: 1, slowModeSeconds: 0, viewRoles: ["witness", "contestant", "resident_wizard", "cohost"], replyRoles: ["witness", "contestant", "resident_wizard", "cohost"], active: true, pinned: true, locked: false },
    { id: 2, title: "market-floor", body: "Mock marketplace and contract interactions auto-post here.", categoryId: 2, channelType: "announcements", topic: "Listings, bids, offers, acceptances.", position: 1, slowModeSeconds: 0, viewRoles: ["witness", "contestant", "resident_wizard", "cohost"], replyRoles: ["witness", "contestant", "resident_wizard", "cohost"], active: true, pinned: false, locked: false },
  ];

  const boardMessages: MockBoardMessage[] = [
    { id: 1, threadId: 1, userId: 1, content: "I need one source of truth for wallets, ownership, and market state, but I never want the interface to feel like a ledger leaked onto the wall.", attachments: [], pinned: true, parentReplyId: null, webhookId: null, createdAt: nowMinus(7), editedAt: null, reactions: { "🐹": [2, 3], "🔥": [4] } },
    { id: 2, threadId: 1, userId: 2, content: "The work needs air. Give me a clean created/collected split and a room mode where price chrome fades back.", attachments: [], pinned: false, parentReplyId: null, webhookId: null, createdAt: nowMinus(6.5), editedAt: null, reactions: { "❤️": [1, 3, 4] } },
    { id: 3, threadId: 1, userId: 3, content: "My collection should feel arranged, not merely owned. Folder logic matters, but so do scale, silence, and the path between works.", attachments: [], pinned: false, parentReplyId: null, webhookId: null, createdAt: nowMinus(6), editedAt: null, reactions: { "👀": [1, 2] } },
    { id: 4, threadId: 1, userId: 4, content: "Public profile and share surfaces need drama without turning every token into an ad. Give me story, not forced hype.", attachments: [], pinned: false, parentReplyId: null, webhookId: null, createdAt: nowMinus(5.5), editedAt: null, reactions: { "💯": [1] } },
    { id: 5, threadId: 2, userId: 1, content: "UX lab online. Post your impressions here after you browse, collect, or list.", attachments: [], pinned: false, parentReplyId: null, webhookId: null, createdAt: nowMinus(5), editedAt: null, reactions: {} },
  ];

  const dms: MockDm[] = [
    { id: 1, participants: [2, 3], messages: [{ id: 1, senderId: 3, content: "Your room-mode mock finally makes me want to browse without thinking about floor first.", createdAt: nowMinus(3) }] },
    { id: 2, participants: [1, 4], messages: [{ id: 2, senderId: 4, content: "Need a share panel that exports context cards, not just thumbnails.", createdAt: nowMinus(2.5) }] },
  ];

  const listings: MockMarketplaceListing[] = [
    { id: 1, seller: wallets[2].walletAddress, sellerUserId: 2, sellerUsername: users[1].username, sellerDisplayName: users[1].displayName, tokenContract: tokens[0].contract, tokenId: tokens[0].tokenId, tokenAmount: "1", tokenName: tokens[0].name, tokenThumbnail: tokens[0].thumbnail, priceWtf: "18000000", royaltyRecipient: wallets[2].walletAddress, royaltyBps: "800", active: true },
    { id: 2, seller: wallets[3].walletAddress, sellerUserId: 3, sellerUsername: users[2].username, sellerDisplayName: users[2].displayName, tokenContract: tokens[1].contract, tokenId: tokens[1].tokenId, tokenAmount: "1", tokenName: tokens[1].name, tokenThumbnail: tokens[1].thumbnail, priceWtf: "24000000", royaltyRecipient: wallets[2].walletAddress, royaltyBps: "800", active: true },
  ];

  const auctions: MockMarketplaceAuction[] = [
    { id: 1, creator: wallets[4].walletAddress, creatorUserId: 4, creatorUsername: users[3].username, creatorDisplayName: users[3].displayName, tokenContract: tokens[4].contract, tokenId: tokens[4].tokenId, tokenName: tokens[4].name, tokenThumbnail: tokens[4].thumbnail, reserve: "22000000", startTime: nowMinus(1), endTime: nowMinus(-24), extensionTime: "300", priceIncrement: "1000000", currentPrice: "26000000", highestBidder: wallets[0].walletAddress, highestBidderUsername: users[0].username, highestBidderDisplayName: users[0].displayName, hasBid: true, shares: [{ amount: "22000000", recipient: wallets[4].walletAddress }], active: true },
  ];

  const offers: MockMarketplaceOffer[] = [
    { tokenContract: tokens[2].contract, tokenId: tokens[2].tokenId, tokenName: tokens[2].name, tokenThumbnail: tokens[2].thumbnail, offerer: wallets[3].walletAddress, offererUserId: 3, offererUsername: users[2].username, offererDisplayName: users[2].displayName, targetOwner: wallets[0].walletAddress, targetOwnerUserId: 1, targetOwnerUsername: users[0].username, targetOwnerDisplayName: users[0].displayName, tokenAmount: "1", amountWtf: "21000000" },
  ];

  const notifications: MockNotification[] = [
    { id: 1, userId: 2, title: "Collector interest", body: "Vault Moss bookmarked Slow Burn and asked for a roomier gallery view.", read: false, createdAt: nowMinus(2) },
    { id: 2, userId: 1, title: "You were outbid", body: "Signal Glow's auction extended after a new bid.", read: false, createdAt: nowMinus(1.25) },
    { id: 3, userId: 4, title: "Board momentum", body: "The critique thread is active. Jump back in before the signal cools.", read: true, createdAt: nowMinus(1.5) },
  ];

  const contractLogs: MockContractLog[] = [
    { id: 1, userId: 1, walletAddress: wallets[0].walletAddress, module: "marketplace", action: "bid_auction", status: "success", contractAddress: "KT1WTFMARKETPLACE000000000000000000", entrypoint: "bid_auction", opHash: "ooMockBid0001", params: { auctionId: 1, amountWtf: "26000000" }, createdAt: nowMinus(1.2) },
    { id: 2, userId: 3, walletAddress: wallets[3].walletAddress, module: "marketplace", action: "place_offer", status: "success", contractAddress: "KT1WTFMARKETPLACE000000000000000000", entrypoint: "place_offer", opHash: "ooMockOffer0002", params: { tokenContract: tokens[2].contract, tokenId: tokens[2].tokenId, amountWtf: "21000000" }, createdAt: nowMinus(0.9) },
  ];

  return {
    currentUserId: 1,
    nextIds: { message: 100, dm: 10, dmMessage: 50, listing: 20, auction: 20, notification: 20, contractLog: 20, collection: 20, token: 50 },
    users,
    wallets,
    tokens,
    collections,
    boardCategories,
    boardChannels,
    boardMessages,
    dms,
    listings,
    auctions,
    offers,
    notifications,
    contractLogs,
  };
}

function loadState(): MockState {
  if (typeof window === "undefined") return seedState();
  try {
    const raw = window.localStorage.getItem(STATE_KEY);
    if (!raw) {
      const seeded = seedState();
      window.localStorage.setItem(STATE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    return JSON.parse(raw) as MockState;
  } catch {
    return seedState();
  }
}

function saveState(state: MockState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function currentUser(state: MockState) {
  return state.users.find((u) => u.id === state.currentUserId) ?? null;
}

function currentWallet(state: MockState) {
  const user = currentUser(state);
  if (!user) return null;
  return (
    state.wallets.find((w) => w.userId === user.id && w.isPrimary) ??
    state.wallets.find((w) => w.userId === user.id) ??
    null
  );
}

function setWalletSession(walletAddress: string | null) {
  if (typeof window === "undefined") return;
  if (!walletAddress) {
    window.localStorage.removeItem(WALLET_SESSION_KEY);
  } else {
    window.localStorage.setItem(
      WALLET_SESSION_KEY,
      JSON.stringify({ address: walletAddress, providerName: "beacon" })
    );
  }
  window.dispatchEvent(new CustomEvent(WALLET_SESSION_EVENT));
}

function nextId(state: MockState, key: keyof MockState["nextIds"]) {
  const value = state.nextIds[key];
  state.nextIds[key] += 1;
  return value;
}

function urlParts(path: string) {
  const url = new URL(path, window.location.origin);
  return { url, parts: url.pathname.split("/").filter(Boolean) };
}

function ok<T>(value: T): Promise<T> {
  return Promise.resolve(structuredClone(value));
}

function fail(message: string): never {
  throw new Error(message);
}

function userByUsername(state: MockState, username: string) {
  return state.users.find((u) => u.username.toLowerCase() === username.toLowerCase()) ?? null;
}

function tokensForUser(state: MockState, userId: number, created?: boolean) {
  return state.tokens.filter((t) => {
    if (created === true) return t.creatorUserId === userId;
    if (created === false) return t.ownerUserId === userId && t.creatorUserId !== userId;
    return t.ownerUserId === userId || t.creatorUserId === userId;
  });
}

function walletRows(state: MockState, userId: number) {
  return state.wallets.filter((w) => w.userId === userId);
}

function portfolioForUser(state: MockState, userId: number) {
  const owned = state.tokens.filter((t) => t.ownerUserId === userId);
  const wallets = walletRows(state, userId);
  const user = state.users.find((u) => u.id === userId)!;
  const holdings = owned.length;
  const contracts = new Set(owned.map((t) => t.contract)).size;
  const base = {
    1: { cost: "148000000", value: "189000000", realized: "32000000", realizedGross: "87000000" },
    2: { cost: "63000000", value: "102000000", realized: "9000000", realizedGross: "31000000" },
    3: { cost: "111000000", value: "147000000", realized: "14000000", realizedGross: "46000000" },
    4: { cost: "72000000", value: "118000000", realized: "18000000", realizedGross: "54000000" },
  }[userId as 1 | 2 | 3 | 4]!;
  const perWallet = wallets.map((w, idx) => {
    const userTokens = owned.filter((t) => t.walletAddress === w.walletAddress);
    const weight = idx === 0 ? 0.74 : 0.26;
    const cost = Math.round(Number(base.cost) * weight).toString();
    const value = Math.round(Number(base.value) * weight).toString();
    const realizedPnl = Math.round(Number(base.realized) * weight).toString();
    const realizedGross = Math.round(Number(base.realizedGross) * weight).toString();
    return {
      walletAddress: w.walletAddress,
      tokensHeld: userTokens.length,
      contractsHeld: new Set(userTokens.map((t) => t.contract)).size,
      firstAcquiredAt: nowMinus(24 * 8),
      lastActivityAt: nowMinus(2 + idx),
      costBasisMutez: cost,
      costBasisUsd: (Number(cost) / 1e6 * 0.92).toFixed(2),
      estimatedValueMutez: value,
      estimatedValueUsd: (Number(value) / 1e6 * 0.92).toFixed(2),
      realizedProceedsMutez: realizedGross,
      realizedProceedsUsd: (Number(realizedGross) / 1e6 * 0.92).toFixed(2),
      realizedPnlMutez: realizedPnl,
      realizedPnlUsd: (Number(realizedPnl) / 1e6 * 0.92).toFixed(2),
      tokensWithUnknownCost: idx === 0 && user.id === 1 ? 1 : 0,
      tokensWithUnknownValue: idx === 0 && user.id === 2 ? 1 : 0,
    };
  });
  return {
    totals: {
      wallets: wallets.length,
      tokensHeld: holdings,
      contractsHeld: contracts,
      costBasisMutez: base.cost,
      costBasisUsd: (Number(base.cost) / 1e6 * 0.92).toFixed(2),
      estimatedValueMutez: base.value,
      estimatedValueUsd: (Number(base.value) / 1e6 * 0.92).toFixed(2),
      realizedProceedsMutez: base.realizedGross,
      realizedProceedsUsd: (Number(base.realizedGross) / 1e6 * 0.92).toFixed(2),
      realizedPnlMutez: base.realized,
      realizedPnlUsd: (Number(base.realized) / 1e6 * 0.92).toFixed(2),
      unrealizedPnlMutez: null,
      unrealizedPnlUsd: null,
      tokensWithUnknownCost: userId === 1 ? 1 : 0,
      tokensWithUnknownValue: userId === 2 ? 1 : 0,
    },
    methodology: {
      pricingDay: new Date().toISOString().slice(0, 10),
      costBasis: { purchaseBacked: 2, mintBacked: 1, eventBacked: 0, mixedBacked: 1, unknown: userId === 1 ? 1 : 0 },
      valuation: { blendedMarket: 2, listingBook: 1, salesHistory: 1, costFallback: 0, unknown: userId === 2 ? 1 : 0, highConfidence: 2, mediumConfidence: 2, lowConfidence: 1 },
      realized: { matchedSales: 3, unmatchedSales: 1 },
      notes: {
        costBasis: "This UX lab uses a weighted acquisition basis to simulate actual spend tied to currently held editions. That spend is real cost context, not realized gain or loss.",
        marketRead: "Held market read is interpretive context only. It blends listing-book tone with recent sale memory, but it never counts as realized value or P&L.",
        realizedPnl: "Realized P&L excludes unmatched basis from profit and reports gross proceeds separately so the interface can distinguish actual sale results from interpretive market tone.",
      },
    },
    perWallet,
    fetchedAt: new Date().toISOString(),
  };
}

function cockpitCollections(state: MockState, userId: number) {
  return state.collections
    .filter((c) => c.userId === userId)
    .map((c) => ({
      ...c,
      itemCount: c.itemIds.length,
    }));
}

function boardMessagesForChannel(state: MockState, channelId: number) {
  const channel = state.boardChannels.find((c) => c.id === channelId);
  if (!channel) fail("Channel not found");
  const messages = state.boardMessages
    .filter((m) => m.threadId === channelId)
    .map((m) => {
      const author = state.users.find((u) => u.id === m.userId)!;
      return {
        ...m,
        username: author.username,
        displayName: author.displayName,
        avatarUrl: author.avatarUrl,
        role: author.role,
        attachments: m.attachments,
        reactions: Object.entries(m.reactions).map(([emoji, userIds]) => ({
          emoji,
          users: userIds.map((id) => {
            const user = state.users.find((u) => u.id === id)!;
            return { id: user.id, username: user.username };
          }),
        })),
      };
    });
  return {
    channel: {
      ...channel,
      canPost: true,
      canManage: true,
      messageCount: messages.length,
      createdAt: nowMinus(240),
      updatedAt: nowMinus(1),
    },
    messages,
  };
}

function addBoardMessage(state: MockState, channelId: number, userId: number, content: string) {
  const message = {
    id: nextId(state, "message"),
    threadId: channelId,
    userId,
    content,
    attachments: [],
    pinned: false,
    parentReplyId: null,
    webhookId: null,
    createdAt: new Date().toISOString(),
    editedAt: null,
    reactions: {},
  } satisfies MockBoardMessage;
  state.boardMessages.push(message);
  return message;
}

function addNotification(state: MockState, userId: number, title: string, body: string) {
  state.notifications.unshift({
    id: nextId(state, "notification"),
    userId,
    title,
    body,
    read: false,
    createdAt: new Date().toISOString(),
  });
}

function addContractLog(
  state: MockState,
  userId: number,
  walletAddress: string,
  action: string,
  entrypoint: string,
  params: Record<string, Json>
) {
  const log = {
    id: nextId(state, "contractLog"),
    userId,
    walletAddress,
    module: "marketplace",
    action,
    status: "success",
    contractAddress: "KT1WTFMARKETPLACE000000000000000000",
    entrypoint,
    opHash: `ooMock${action}${Date.now()}`,
    params,
    createdAt: new Date().toISOString(),
  } satisfies MockContractLog;
  state.contractLogs.unshift(log);
  return log;
}

function addDmMessage(state: MockState, dmId: number, senderId: number, content: string) {
  const dm = state.dms.find((d) => d.id === dmId);
  if (!dm) fail("Conversation not found");
  dm.messages.push({
    id: nextId(state, "dmMessage"),
    senderId,
    content,
    createdAt: new Date().toISOString(),
  });
}

function profileTokenRows(state: MockState, userId: number, createdByMe: boolean) {
  return tokensForUser(state, userId, createdByMe).map((t) => ({
    contract: t.contract,
    tokenId: t.tokenId,
    balance: t.balance,
    walletAddress: t.walletAddress,
    name: t.name,
    thumbnail: t.thumbnail,
    metadata: {
      name: t.name,
      description: t.description,
      thumbnailUri: t.thumbnail,
      displayUri: t.thumbnail,
      mimeType: t.mimeType,
      collectionName: t.collectionName,
      tags: t.tags ?? [],
    },
    mimeType: t.mimeType,
    tradeBoardQuantity: t.tradeBoardQuantity ?? 0,
    onTradeBoard: Boolean(t.tradeBoardQuantity),
    isCreator: t.creatorUserId === userId,
    lastSeenAt: nowMinus(3),
  }));
}

export async function mockApiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const state = loadState();
  const body = options.body ? JSON.parse(String(options.body)) : undefined;
  const method = (options.method || "GET").toUpperCase();
  const { url, parts } = urlParts(path);
  const me = currentUser(state);

  if (parts[0] === "api" && parts[1] === "auth" && parts[2] === "user") {
    if (me) {
      const wallet = currentWallet(state);
      if (wallet) setWalletSession(wallet.walletAddress);
    }
    return ok((me ?? null) as T);
  }

  if (parts[0] === "api" && parts[1] === "auth" && parts[2] === "login" && method === "POST") {
    const username = String(body?.username || "");
    const user = userByUsername(state, username);
    if (!user) fail("Unknown UX lab persona");
    state.currentUserId = user.id;
    saveState(state);
    setWalletSession(walletRows(state, user.id)[0]?.walletAddress ?? null);
    return ok(user as T);
  }

  if (parts[0] === "api" && parts[1] === "auth" && parts[2] === "logout") {
    state.currentUserId = null;
    saveState(state);
    setWalletSession(null);
    return ok({ ok: true } as T);
  }

  if (parts[0] === "api" && parts[1] === "auth" && parts[2] === "social" && parts[3] === "config") {
    return ok({ twitterEnabled: true, discordEnabled: true } as T);
  }

  if (!me) fail("Not authenticated");

  if (parts[0] === "api" && parts[1] === "wallets" && parts.length === 2) {
    if (method === "GET") return ok(walletRows(state, me.id) as T);
    if (method === "POST") {
      const wallet = {
        id: nextId(state, "token"),
        userId: me.id,
        walletAddress: String(body?.walletAddress || `tz1MOCK${Date.now()}`),
        isPrimary: false,
        tokenCount: 0,
        tezDomain: "",
        wtfBalance: "25000000",
      } satisfies MockWallet;
      state.wallets.push(wallet);
      saveState(state);
      return ok(wallet as T);
    }
  }

  if (parts[0] === "api" && parts[1] === "wallets" && parts[3] === "primary" && method === "PUT") {
    const id = Number(parts[2]);
    for (const wallet of walletRows(state, me.id)) wallet.isPrimary = wallet.id === id;
    saveState(state);
    setWalletSession(currentWallet(state)?.walletAddress ?? null);
    return ok({ ok: true } as T);
  }

  if (parts[0] === "api" && parts[1] === "wallets" && parts.length === 3 && method === "DELETE") {
    const id = Number(parts[2]);
    state.wallets = state.wallets.filter((w) => !(w.id === id && w.userId === me.id));
    saveState(state);
    return ok({ ok: true } as T);
  }

  if (parts[0] === "api" && parts[1] === "wallets" && parts[3] === "sync") {
    addNotification(state, me.id, "Wallet sync queued", `Mock sync for ${parts[2]} completed instantly.`);
    saveState(state);
    return ok({ ok: true } as T);
  }

  if (parts[0] === "api" && parts[1] === "wallets" && parts[3] === "balance") {
    const wallet = state.wallets.find((w) => w.walletAddress === decodeURIComponent(parts[2] || ""));
    return ok({ balance: wallet?.wtfBalance ?? "0" } as T);
  }

  if (parts[0] === "api" && parts[1] === "wallets" && parts[3] === "tokens") {
    const wallet = decodeURIComponent(parts[2] || "");
    const items = state.tokens.filter((t) => t.walletAddress === wallet && t.ownerUserId === me.id);
    return ok({ items, pagination: { total: items.length } } as T);
  }

  if (parts[0] === "api" && parts[1] === "profile" && parts[2] === "social") {
    if (method === "GET") {
      return ok({
        twitterHandle: me.twitterHandle ?? null,
        twitterVerified: Boolean(me.twitterVerified),
        twitterPublic: true,
        discordHandle: me.discordHandle ?? null,
        discordVerified: Boolean(me.discordVerified),
        discordPublic: true,
        emailPublic: false,
        pfpImageUrl: me.pfpImageUrl,
        pfpTokenContract: null,
        pfpTokenId: null,
      } as T);
    }
    Object.assign(me, body || {});
    saveState(state);
    return ok(me as T);
  }

  if (parts[0] === "api" && parts[1] === "profile" && parts[2] === "account" && method === "PUT") {
    me.displayName = String(body?.displayName || me.displayName);
    saveState(state);
    return ok(me as T);
  }

  if (parts[0] === "api" && parts[1] === "profile" && parts[2] === "pfp-candidates") {
    const rows = tokensForUser(state, me.id).map((t) => ({
      contract: t.contract,
      tokenId: t.tokenId,
      name: t.name,
      thumbnail: t.thumbnail,
      mimeType: t.mimeType,
      walletAddress: t.walletAddress,
    }));
    return ok({ items: rows, total: rows.length, limit: rows.length, offset: 0 } as T);
  }

  if (parts[0] === "api" && parts[1] === "profile" && parts[2] === "pfp" && method === "PUT") {
    me.pfpImageUrl = String(body?.thumbnail || body?.imageUrl || me.pfpImageUrl);
    saveState(state);
    return ok({ ok: true } as T);
  }

  if (parts[0] === "api" && parts[1] === "profile" && parts[2] === "pfp" && method === "DELETE") {
    me.pfpImageUrl = me.avatarUrl;
    saveState(state);
    return ok({ ok: true } as T);
  }

  if (parts[0] === "api" && parts[1] === "profile" && parts[2] === "tokens") {
    if (parts[3] === "trade-board" && method === "POST") {
      const token = state.tokens.find(
        (t) =>
          t.contract === (body?.contract || body?.tokenContract) &&
          t.tokenId === String(body?.tokenId)
      );
      if (token) token.tradeBoardQuantity = Number(body?.quantity || 1);
      saveState(state);
      return ok({ ok: true } as T);
    }
    const createdByMe = url.searchParams.get("createdByMe") === "true";
    const items = profileTokenRows(state, me.id, createdByMe);
    return ok({ items, total: items.length, limit: items.length, offset: 0 } as T);
  }

  if (parts[0] === "api" && parts[1] === "cockpit" && parts[2] === "overview") {
    const owned = state.tokens.filter((t) => t.ownerUserId === me.id);
    return ok({ holdings: { totalTokens: owned.length, totalContracts: new Set(owned.map((t) => t.contract)).size } } as T);
  }

  if (parts[0] === "api" && parts[1] === "cockpit" && parts[2] === "sync" && parts[3] === "status") {
    return ok({
      jobs: [
        { name: "wallet-events-global", intervalMs: 300000, latest: { status: "success", finishedAt: nowMinus(0.1) } },
        { name: "token-market", intervalMs: 900000, latest: { status: "success", finishedAt: nowMinus(0.2) } },
        { name: "metadata-normalize", intervalMs: 600000, latest: { status: "success", finishedAt: nowMinus(0.4) } },
      ],
    } as T);
  }

  if (parts[0] === "api" && parts[1] === "cockpit" && parts[2] === "sync") {
    addNotification(state, me.id, "Manual sync complete", `Mock refresh finished for ${decodeURIComponent(parts[3] || "")}.`);
    saveState(state);
    return ok({ ok: true } as T);
  }

  if (parts[0] === "api" && parts[1] === "cockpit" && parts[2] === "activity") {
    const items = state.contractLogs.slice(0, 12).map((log) => ({
      id: log.id,
      walletAddress: log.walletAddress,
      eventType: log.action,
      tokenContract: String(log.params.tokenContract || log.params.contract || ""),
      tokenId: String(log.params.tokenId || ""),
      tokenName: null,
      timestamp: log.createdAt,
    }));
    return ok({ items } as T);
  }

  if (parts[0] === "api" && parts[1] === "cockpit" && parts[2] === "collections" && parts.length === 3) {
    return ok({ collections: cockpitCollections(state, me.id) } as T);
  }

  if (parts[0] === "api" && parts[1] === "cockpit" && parts[2] === "collections" && parts[3]) {
    const id = Number(parts[3]);
    const collection = state.collections.find((c) => c.id === id && c.userId === me.id);
    if (!collection) fail("Collection not found");
    const items = collection.itemIds
      .map((tokenId) => state.tokens.find((t) => t.id === tokenId))
      .filter(Boolean)
      .map((token) => ({
        id: token!.id,
        tokenContract: token!.contract,
        tokenId: token!.tokenId,
        quantity: Number(token!.balance),
        position: 0,
        note: null,
        addedAt: collection.createdAt,
        tokenName: token!.name,
        tokenThumbnail: token!.thumbnail,
        tokenDisplayUri: token!.thumbnail,
        tokenMimeType: token!.mimeType,
      }));
    return ok({ collection: { ...collection, itemCount: items.length }, items } as T);
  }

  if (parts[0] === "api" && parts[1] === "portfolio" && parts[2] === "summary") {
    return ok(portfolioForUser(state, me.id) as T);
  }

  if (parts[0] === "api" && parts[1] === "portfolio" && parts[2] === "activity" && parts[3] === "acquisitions") {
    const rows = state.tokens
      .filter((t) => t.ownerUserId === me.id)
      .slice(0, 6)
      .map((t, idx) => ({
        walletAddress: t.walletAddress,
        tokenContract: t.contract,
        tokenId: t.tokenId,
        tokenName: t.name,
        thumbnailUri: t.thumbnail,
        acquisitionType: idx % 3 === 0 ? "mint" : idx % 3 === 1 ? "purchase" : "transfer",
        priceMutez: idx % 3 === 2 ? null : String(8000000 + idx * 1000000),
        priceUsd: null,
        marketplace: idx % 3 === 1 ? "objkt" : null,
        acquiredAt: nowMinus(24 + idx * 5),
        opHash: `ooAcq${idx}`,
        currentFloorMutez: "14000000",
        lastSaleMutez: "13000000",
      }));
    return ok({ rows, fetchedAt: new Date().toISOString() } as T);
  }

  if (parts[0] === "api" && parts[1] === "portfolio" && parts[2] === "activity" && parts[3] === "sales") {
    const rows = state.contractLogs
      .filter((l) => l.userId === me.id)
      .slice(0, 4)
      .map((l, idx) => ({
        walletAddress: l.walletAddress,
        tokenContract: String(l.params.tokenContract || tokensForUser(state, me.id)[0]?.contract || ""),
        tokenId: String(l.params.tokenId || tokensForUser(state, me.id)[0]?.tokenId || "0"),
        tokenName: tokensForUser(state, me.id)[idx]?.name ?? "Mock sale",
        thumbnailUri: tokensForUser(state, me.id)[idx]?.thumbnail ?? null,
        priceMutez: String(17000000 + idx * 2000000),
        priceUsd: (17 + idx * 2).toFixed(2),
        marketplace: "wtf",
        soldAt: l.createdAt,
        opHash: l.opHash,
        costBasisMutez: idx === 0 ? null : String(12000000 + idx * 1000000),
        costBasisUsd: idx === 0 ? null : (12 + idx).toFixed(2),
        realizedPnlMutez: idx === 0 ? null : String(5000000 + idx * 1000000),
        realizedPnlUsd: idx === 0 ? null : (5 + idx).toFixed(2),
      }));
    return ok({ rows, fetchedAt: new Date().toISOString() } as T);
  }

  if (parts[0] === "api" && parts[1] === "seasons") {
    return ok([{ id: 1, name: "UX Lab Season", number: 11, status: "active" }] as T);
  }

  if (parts[0] === "api" && parts[1] === "challenges") {
    return ok([
      { id: 1, title: "Make the collection view feel like a room", status: "active" },
      { id: 2, title: "Prototype a calmer bid flow", status: "active" },
      { id: 3, title: "Design an artist-first token card", status: "active" },
    ] as T);
  }

  if (parts[0] === "api" && parts[1] === "marketplace" && parts[2] === "onchain") {
    return ok({
      contractAddress: "KT1WTFMARKETPLACE000000000000000000",
      admin: state.wallets[0]?.walletAddress ?? "",
      paused: false,
      listings: state.listings,
      auctions: state.auctions,
      offers: state.offers,
      counts: {
        listings: state.listings.filter((l) => l.active).length,
        auctions: state.auctions.filter((a) => a.active).length,
        offers: state.offers.length,
      },
    } as T);
  }

  if (parts[0] === "api" && parts[1] === "marketplace" && parts[2] === "trade-board") {
    const q = (url.searchParams.get("q") || "").toLowerCase();
    const items = state.tokens
      .filter((t) => (t.tradeBoardQuantity ?? 0) > 0)
      .filter((t) => !q || t.name.toLowerCase().includes(q))
      .map((t) => {
        const owner = state.users.find((u) => u.id === t.ownerUserId)!;
        const ownerWallet = state.wallets.find((w) => w.walletAddress === t.walletAddress)!;
        const offer = state.offers.find((o) => o.tokenContract === t.contract && o.tokenId === t.tokenId) || null;
        return {
          ownerWallet: t.walletAddress,
          ownerUserId: owner.id,
          ownerUsername: owner.username,
          ownerDisplayName: owner.displayName,
          tokenContract: t.contract,
          tokenId: t.tokenId,
          tokenAmount: t.balance,
          tradeBoardQuantity: t.tradeBoardQuantity ?? 1,
          walletBalance: t.balance,
          tokenName: t.name,
          tokenThumbnail: t.thumbnail,
          metadata: { name: t.name, thumbnailUri: t.thumbnail, displayUri: t.thumbnail, mimeType: t.mimeType },
          activeOffer: offer,
        };
      });
    return ok({ items, pagination: { limit: items.length, offset: 0, count: items.length, hasMore: false, nextOffset: 0 } } as T);
  }

  if (parts[0] === "api" && parts[1] === "marketplace" && parts.length === 2 && method === "POST") {
    return ok({ ok: true, note: "Mock marketplace metadata persisted." } as T);
  }

  if (parts[0] === "api" && parts[1] === "board" && parts[2] === "categories") {
    if (method === "GET") return ok(state.boardCategories as T);
    if (method === "POST") {
      const cat = { id: nextId(state, "collection"), name: String(body?.name || "New Category"), position: state.boardCategories.length + 1, collapsed: false };
      state.boardCategories.push(cat);
      saveState(state);
      return ok(cat as T);
    }
  }

  if (parts[0] === "api" && parts[1] === "board" && parts[2] === "channels" && parts.length === 3) {
    if (method === "GET") {
      return ok(
        state.boardChannels.map((c) => ({
          ...c,
          messageCount: state.boardMessages.filter((m) => m.threadId === c.id).length,
          createdAt: nowMinus(200),
          updatedAt: nowMinus(1),
        })) as T
      );
    }
    if (method === "POST") {
      const channel = {
        id: nextId(state, "collection"),
        title: String(body?.title || "new-channel"),
        body: String(body?.body || ""),
        categoryId: body?.categoryId ? Number(body.categoryId) : null,
        channelType: "forum",
        topic: null,
        position: state.boardChannels.length + 1,
        slowModeSeconds: 0,
        viewRoles: ["witness", "contestant", "resident_wizard", "cohost"],
        replyRoles: ["witness", "contestant", "resident_wizard", "cohost"],
        active: true,
        pinned: false,
        locked: false,
      } satisfies MockBoardChannel;
      state.boardChannels.push(channel);
      saveState(state);
      return ok(channel as T);
    }
  }

  if (parts[0] === "api" && parts[1] === "board" && parts[2] === "channels" && parts[4] === "messages") {
    if (method === "GET") return ok(boardMessagesForChannel(state, Number(parts[3])) as T);
    if (method === "POST") {
      const message = addBoardMessage(state, Number(parts[3]), me.id, String(body?.content || ""));
      saveState(state);
      return ok(message as T);
    }
  }

  if (parts[0] === "api" && parts[1] === "board" && parts[2] === "channels" && parts[4] === "permissions") return ok([] as T);
  if (parts[0] === "api" && parts[1] === "board" && parts[2] === "channels" && parts[4] === "webhooks") return ok([] as T);

  if (parts[0] === "api" && parts[1] === "board" && parts[2] === "messages" && parts[4] === "reactions" && method === "POST") {
    const message = state.boardMessages.find((m) => m.id === Number(parts[3]));
    if (!message) fail("Message not found");
    const emoji = String(body?.emoji || "👍");
    const set = new Set(message.reactions[emoji] || []);
    set.has(me.id) ? set.delete(me.id) : set.add(me.id);
    message.reactions[emoji] = [...set];
    saveState(state);
    return ok({ ok: true } as T);
  }

  if (parts[0] === "api" && parts[1] === "board" && parts[2] === "messages" && method === "PUT") {
    const message = state.boardMessages.find((m) => m.id === Number(parts[3]));
    if (!message) fail("Message not found");
    if (parts[4] === "pin") {
      message.pinned = Boolean(body?.pinned);
    } else {
      message.content = String(body?.content || message.content);
      message.editedAt = new Date().toISOString();
    }
    saveState(state);
    return ok({ ok: true } as T);
  }

  if (parts[0] === "api" && parts[1] === "board" && parts[2] === "messages" && method === "DELETE") {
    state.boardMessages = state.boardMessages.filter((m) => m.id !== Number(parts[3]));
    saveState(state);
    return ok({ ok: true } as T);
  }

  if (parts[0] === "api" && parts[1] === "messages" && parts[2] === "users") {
    return ok(
      state.users
        .filter((u) => u.id !== me.id)
        .map((u) => ({ id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl, role: u.role })) as T
    );
  }

  if (parts[0] === "api" && parts[1] === "messages" && parts[2] === "dms" && parts.length === 3) {
    if (method === "GET") {
      return ok(
        state.dms
          .filter((d) => d.participants.includes(me.id))
          .map((d) => {
            const peer = state.users.find((u) => u.id === d.participants.find((id) => id !== me.id))!;
            const last = d.messages[d.messages.length - 1];
            return {
              id: d.id,
              peerUserId: peer.id,
              peerUsername: peer.username,
              peerDisplayName: peer.displayName,
              peerAvatarUrl: peer.avatarUrl,
              lastMessage: last?.content ?? "",
              lastMessageAt: last?.createdAt ?? null,
              unreadCount: 1,
            };
          }) as T
      );
    }
    if (method === "POST") {
      const targetUserId = Number(body?.targetUserId);
      const existing = state.dms.find((d) => d.participants.includes(me.id) && d.participants.includes(targetUserId));
      if (existing) return ok({ id: existing.id } as T);
      const dm = { id: nextId(state, "dm"), participants: [me.id, targetUserId], messages: [] } satisfies MockDm;
      state.dms.push(dm);
      saveState(state);
      return ok({ id: dm.id } as T);
    }
  }

  if (parts[0] === "api" && parts[1] === "messages" && parts[2] === "dms" && parts[4] === "messages") {
    const dmId = Number(parts[3]);
    const dm = state.dms.find((d) => d.id === dmId);
    if (!dm) fail("DM not found");
    if (method === "GET") {
      return ok(
        dm.messages.map((m) => {
          const author = state.users.find((u) => u.id === m.senderId)!;
          return { ...m, username: author.username, displayName: author.displayName };
        }) as T
      );
    }
    if (method === "POST") {
      addDmMessage(state, dmId, me.id, String(body?.content || ""));
      const peerId = dm.participants.find((id) => id !== me.id)!;
      addNotification(state, peerId, `${me.displayName} sent a DM`, String(body?.content || ""));
      saveState(state);
      return ok({ ok: true } as T);
    }
  }

  if (parts[0] === "api" && parts[1] === "notifications" && parts.length === 2) {
    return ok({ items: state.notifications.filter((n) => n.userId === me.id) } as T);
  }

  if (parts[0] === "api" && parts[1] === "notifications" && parts[2] === "preferences") {
    return ok({ email: true, push: true, marketplace: true, messageBoard: true } as T);
  }

  if (parts[0] === "api" && parts[1] === "notifications" && parts[2] === "read-all") {
    state.notifications.forEach((n) => {
      if (n.userId === me.id) n.read = true;
    });
    saveState(state);
    return ok({ ok: true } as T);
  }

  if (parts[0] === "api" && parts[1] === "notifications" && parts[3] === "read") {
    const notification = state.notifications.find((n) => n.id === Number(parts[2]) && n.userId === me.id);
    if (notification) notification.read = Boolean(body?.read);
    saveState(state);
    return ok({ ok: true } as T);
  }

  if (parts[0] === "api" && parts[1] === "users" && parts[2]) {
    const profile = userByUsername(state, decodeURIComponent(parts[2]));
    if (!profile) fail("User not found");
    if (parts.length === 3) {
      return ok({
        id: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        role: profile.role,
        experiencePoints: profile.experiencePoints,
        bio: profile.bio,
        pfpImageUrl: profile.pfpImageUrl,
        email: profile.email,
        twitterHandle: profile.twitterHandle,
        twitterVerified: profile.twitterVerified,
        discordHandle: profile.discordHandle,
        discordVerified: profile.discordVerified,
        wallets: profile.walletAddresses,
        createdAt: profile.createdAt,
      } as T);
    }
    if (parts[3] === "trade-board") {
      return ok(
        state.tokens
          .filter((t) => t.ownerUserId === profile.id && (t.tradeBoardQuantity ?? 0) > 0)
          .map((t) => ({
            id: t.id,
            tokenContract: t.contract,
            tokenId: t.tokenId,
            tokenName: t.name,
            thumbnail: t.thumbnail,
            balance: t.balance,
            tradeBoardQuantity: t.tradeBoardQuantity ?? 1,
          })) as T
      );
    }
    if (parts[3] === "listings") {
      return ok(
        state.listings
          .filter((l) => l.sellerUserId === profile.id)
          .map((l) => ({
            id: l.id,
            tokenContract: l.tokenContract,
            tokenId: l.tokenId,
            tokenName: l.tokenName,
            thumbnail: l.tokenThumbnail,
            amount: Number(l.tokenAmount),
            priceFormatted: `${(Number(l.priceWtf) / 1e6).toFixed(1)} WTF`,
            listingType: "buy_now",
            createdAt: nowMinus(16),
          })) as T
      );
    }
    if (parts[3] === "activity") {
      return ok([
        { id: 1, amount: 200, reason: "Hosted salon critique", createdAt: nowMinus(8) },
        { id: 2, amount: 150, reason: "Collected Slow Burn work", createdAt: nowMinus(16) },
      ] as T);
    }
    if (parts[3] === "dm") {
      const dm = state.dms.find((d) => d.participants.includes(me.id) && d.participants.includes(profile.id));
      return ok({
        conversationId: dm?.id ?? null,
        messages: (dm?.messages || []).map((m) => {
          const author = state.users.find((u) => u.id === m.senderId)!;
          return { ...m, username: author.username, displayName: author.displayName };
        }),
      } as T);
    }
  }

  fail(`No UX lab mock for ${method} ${path}`);
}

export async function mockMarketplaceAction(
  action: string,
  payload: Record<string, Json>
): Promise<any> {
  const state = loadState();
  const me = currentUser(state);
  const wallet = currentWallet(state);
  if (!me || !wallet) fail("No active persona");

  if (action === "approve_marketplace_for_token" || action === "approve_marketplace_for_wtf") {
    const log = addContractLog(state, me.id, wallet.walletAddress, action, "update_operators", payload);
    addBoardMessage(state, 2, me.id, `${me.displayName} approved ${action === "approve_marketplace_for_wtf" ? "WTF spending" : "token operator access"} for marketplace flow.`);
    saveState(state);
    return { opHash: log.opHash };
  }

  if (action === "create_listing") {
    const token = state.tokens.find((t) => t.contract === payload.tokenContract && t.tokenId === String(payload.tokenId));
    if (token) {
      state.listings.unshift({
        id: nextId(state, "listing"),
        seller: wallet.walletAddress,
        sellerUserId: me.id,
        sellerUsername: me.username,
        sellerDisplayName: me.displayName,
        tokenContract: token.contract,
        tokenId: token.tokenId,
        tokenAmount: String(payload.amount || 1),
        tokenName: token.name,
        tokenThumbnail: token.thumbnail,
        priceWtf: String(payload.priceWtf || "0"),
        royaltyRecipient: wallet.walletAddress,
        royaltyBps: String(payload.royaltyBps || 0),
        active: true,
      });
    }
    const log = addContractLog(state, me.id, wallet.walletAddress, action, "create_listing", payload);
    addBoardMessage(state, 2, me.id, `${me.displayName} listed ${token?.name || "a token"} for ${(Number(payload.priceWtf || 0) / 1e6).toFixed(1)} WTF.`);
    addNotification(state, me.id, "Listing created", "Mock contract accepted the listing instantly.");
    saveState(state);
    return { opHash: log.opHash, listingId: state.listings[0]?.id ?? null };
  }

  if (action === "create_auction") {
    const token = state.tokens.find((t) => t.contract === payload.tokenContract && t.tokenId === String(payload.tokenId));
    state.auctions.unshift({
      id: nextId(state, "auction"),
      creator: wallet.walletAddress,
      creatorUserId: me.id,
      creatorUsername: me.username,
      creatorDisplayName: me.displayName,
      tokenContract: String(payload.tokenContract),
      tokenId: String(payload.tokenId),
      tokenName: token?.name || "Mock auction",
      tokenThumbnail: token?.thumbnail || svgData("Auction", "#1d3557", "#457b9d"),
      reserve: String(payload.reserveWtf || 0),
      startTime: String(payload.startTimeIso || new Date().toISOString()),
      endTime: String(payload.endTimeIso || nowMinus(-12)),
      extensionTime: String(payload.extensionTimeSeconds || 300),
      priceIncrement: String(payload.priceIncrementWtf || 0),
      currentPrice: String(payload.reserveWtf || 0),
      highestBidder: "",
      highestBidderUsername: null,
      highestBidderDisplayName: null,
      hasBid: false,
      shares: [],
      active: true,
    });
    const log = addContractLog(state, me.id, wallet.walletAddress, action, "create_auction", payload);
    addBoardMessage(state, 2, me.id, `${me.displayName} opened an auction for ${token?.name || "a token"}.`);
    saveState(state);
    return { opHash: log.opHash, auctionId: state.auctions[0]?.id ?? null };
  }

  if (action === "buy_listing") {
    const listing = state.listings.find((l) => l.id === Number(payload.listingId));
    if (listing) listing.active = false;
    const log = addContractLog(state, me.id, wallet.walletAddress, action, "buy_listing", payload);
    if (listing) {
      addBoardMessage(state, 2, me.id, `${me.displayName} bought ${listing.tokenName} from ${listing.sellerDisplayName}.`);
      addNotification(state, listing.sellerUserId, "Listing sold", `${me.displayName} bought ${listing.tokenName}.`);
    }
    saveState(state);
    return log.opHash;
  }

  if (action === "cancel_listing") {
    const listing = state.listings.find((l) => l.id === Number(payload.listingId));
    if (listing) listing.active = false;
    const log = addContractLog(state, me.id, wallet.walletAddress, action, "cancel_listing", payload);
    addBoardMessage(state, 2, me.id, `${me.displayName} cancelled listing #${payload.listingId}.`);
    saveState(state);
    return log.opHash;
  }

  if (action === "bid_auction") {
    const auction = state.auctions.find((a) => a.id === Number(payload.auctionId));
    if (auction) {
      auction.currentPrice = String(payload.amountWtf || auction.currentPrice);
      auction.highestBidder = wallet.walletAddress;
      auction.highestBidderUsername = me.username;
      auction.highestBidderDisplayName = me.displayName;
      auction.hasBid = true;
    }
    const log = addContractLog(state, me.id, wallet.walletAddress, action, "bid_auction", payload);
    addBoardMessage(state, 2, me.id, `${me.displayName} bid ${(Number(payload.amountWtf || 0) / 1e6).toFixed(1)} WTF on auction #${payload.auctionId}.`);
    saveState(state);
    return log.opHash;
  }

  if (action === "cancel_auction" || action === "settle_auction") {
    const auction = state.auctions.find((a) => a.id === Number(payload.auctionId));
    if (auction) auction.active = false;
    const log = addContractLog(state, me.id, wallet.walletAddress, action, action, payload);
    addBoardMessage(state, 2, me.id, `${me.displayName} ${action === "settle_auction" ? "settled" : "cancelled"} auction #${payload.auctionId}.`);
    saveState(state);
    return log.opHash;
  }

  if (action === "place_offer") {
    const token = state.tokens.find((t) => t.contract === payload.tokenContract && t.tokenId === String(payload.tokenId));
    const owner = token ? state.users.find((u) => u.id === token.ownerUserId) : null;
    state.offers.unshift({
      tokenContract: String(payload.tokenContract),
      tokenId: String(payload.tokenId),
      tokenName: token?.name || "Mock offer target",
      tokenThumbnail: token?.thumbnail || svgData("Offer", "#283618", "#606c38"),
      offerer: wallet.walletAddress,
      offererUserId: me.id,
      offererUsername: me.username,
      offererDisplayName: me.displayName,
      targetOwner: token?.walletAddress || "",
      targetOwnerUserId: owner?.id || 0,
      targetOwnerUsername: owner?.username || "",
      targetOwnerDisplayName: owner?.displayName || "",
      tokenAmount: "1",
      amountWtf: String(payload.amountWtf || 0),
    });
    const log = addContractLog(state, me.id, wallet.walletAddress, action, "place_offer", payload);
    addBoardMessage(state, 2, me.id, `${me.displayName} placed a ${(Number(payload.amountWtf || 0) / 1e6).toFixed(1)} WTF offer on ${token?.name || "a token"}.`);
    if (owner) addNotification(state, owner.id, "New offer", `${me.displayName} placed an offer on ${token?.name}.`);
    saveState(state);
    return log.opHash;
  }

  if (action === "cancel_offer") {
    state.offers = state.offers.filter(
      (o) => !(o.tokenContract === payload.tokenContract && o.tokenId === String(payload.tokenId) && o.offererUserId === me.id)
    );
    const log = addContractLog(state, me.id, wallet.walletAddress, action, "cancel_offer", payload);
    addBoardMessage(state, 2, me.id, `${me.displayName} cancelled an offer on ${payload.tokenId}.`);
    saveState(state);
    return log.opHash;
  }

  if (action === "accept_offer") {
    const offer = state.offers.find((o) => o.tokenContract === payload.tokenContract && o.tokenId === String(payload.tokenId));
    state.offers = state.offers.filter((o) => o !== offer);
    const log = addContractLog(state, me.id, wallet.walletAddress, action, "accept_offer", payload);
    if (offer) {
      addBoardMessage(state, 2, me.id, `${me.displayName} accepted ${offer.offererDisplayName}'s offer on ${offer.tokenName}.`);
      addNotification(state, offer.offererUserId, "Offer accepted", `${me.displayName} accepted your offer on ${offer.tokenName}.`);
    }
    saveState(state);
    return log.opHash;
  }

  fail(`Unhandled mock marketplace action: ${action}`);
}
