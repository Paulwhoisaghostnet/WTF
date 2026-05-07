type MemoryStore = Map<string, string>;

class LocalStorageMock {
  private store: MemoryStore = new Map();

  clear() {
    this.store.clear();
  }

  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number) {
    return [...this.store.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }

  get length() {
    return this.store.size;
  }
}

const localStorage = new LocalStorageMock();

const windowMock = {
  localStorage,
  location: { origin: "http://localhost:3000" },
  dispatchEvent: (_event: Event) => true,
};

Object.assign(globalThis, {
  window: windowMock,
  localStorage,
  CustomEvent: class CustomEvent<T = unknown> extends Event {
    detail: T;

    constructor(type: string, init?: CustomEventInit<T>) {
      super(type);
      this.detail = init?.detail as T;
    }
  },
});

const {
  mockApiRequest,
  mockMarketplaceAction,
} = await import("../client/src/features/ux-lab/mock-wtf-lab.ts");

const STATE_KEY = "wtf:ux-lab-state";

type PersonaName =
  | "teztactician"
  | "minamints"
  | "vaultmoss"
  | "signalglow";

interface PersonaSnapshot {
  username: PersonaName;
  displayName: string;
  dashboard: any;
  portfolio: any;
  created: any;
  collected: any;
  collections: any;
  boardMessages: any;
  notifications: any;
  marketplace: any;
}

function parseState() {
  const raw = localStorage.getItem(STATE_KEY);
  if (!raw) throw new Error("UX lab state not found");
  return JSON.parse(raw);
}

async function login(username: PersonaName) {
  return mockApiRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password: "uxlab" }),
  });
}

async function logout() {
  return mockApiRequest("/api/auth/logout", { method: "POST" });
}

async function postBoardMessage(channelId: number, content: string) {
  return mockApiRequest(`/api/board/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

async function sendDm(dmId: number, content: string) {
  return mockApiRequest(`/api/messages/dms/${dmId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

async function ensureDm(targetUserId: number) {
  return mockApiRequest<{ id: number }>("/api/messages/dms", {
    method: "POST",
    body: JSON.stringify({ targetUserId }),
  });
}

async function snapshotPersona(username: PersonaName): Promise<PersonaSnapshot> {
  const user = await login(username);
  const [dashboard, portfolio, created, collected, collections, boardMessages, notifications, marketplace] =
    await Promise.all([
      mockApiRequest("/api/cockpit/overview"),
      mockApiRequest("/api/portfolio/summary"),
      mockApiRequest("/api/profile/tokens?createdByMe=true"),
      mockApiRequest("/api/profile/tokens?createdByMe=false"),
      mockApiRequest("/api/cockpit/collections"),
      mockApiRequest("/api/board/channels/2/messages"),
      mockApiRequest("/api/notifications"),
      mockApiRequest("/api/marketplace/onchain"),
    ]);

  await logout();

  return {
    username,
    displayName: user.displayName,
    dashboard,
    portfolio,
    created,
    collected,
    collections,
    boardMessages,
    notifications,
    marketplace,
  };
}

async function runScenario() {
  localStorage.clear();

  await login("teztactician");
  await postBoardMessage(
    1,
    "Power-user pass: wallet dossier is strong, but collection browsing still feels split across profile, gallery, and cockpit."
  );
  await mockMarketplaceAction("approve_marketplace_for_token", { tokenContract: "KT1ARTMINTAAAA1111111111111111111111", tokenId: "1" });
  await mockMarketplaceAction("create_listing", {
    tokenContract: "KT1ARTMINTAAAA1111111111111111111111",
    tokenId: "1",
    amount: "1",
    priceWtf: "23000000",
    royaltyBps: "1000",
  });
  const dmToInfluencer = await ensureDm(4);
  await sendDm(dmToInfluencer.id, "Need a collector-facing share panel that carries provenance, wallet source, and collection context.");
  await logout();

  await login("minamints");
  await postBoardMessage(
    1,
    "Artist pass: work needs breathing room. The platform should separate portfolio control from exhibition framing."
  );
  await mockMarketplaceAction("create_auction", {
    tokenContract: "KT1ARTMINTAAAA1111111111111111111111",
    tokenId: "7",
    reserveWtf: "18000000",
    priceIncrementWtf: "1000000",
    extensionTimeSeconds: "600",
  });
  const dmToCollector = await ensureDm(3);
  await sendDm(dmToCollector.id, "If you browse my work, I want the sequence and collection story to survive the card grid.");
  await logout();

  await login("vaultmoss");
  await postBoardMessage(
    1,
    "Collector pass: I want one clean place to browse created, collected, and curated sets without losing wallet-level provenance."
  );
  await mockMarketplaceAction("bid_auction", {
    auctionId: 2,
    amountWtf: "21000000",
  });
  await mockMarketplaceAction("place_offer", {
    tokenContract: "KT1ARTMINTAAAA1111111111111111111111",
    tokenId: "7",
    amountWtf: "22000000",
  });
  await logout();

  await login("signalglow");
  await postBoardMessage(
    1,
    "Influencer pass: social surfaces need instant context cards. Right now the platform has the lore, but not enough portable narrative framing."
  );
  await mockMarketplaceAction("approve_marketplace_for_wtf", {});
  await mockMarketplaceAction("buy_listing", { listingId: 3 });
  await mockMarketplaceAction("accept_offer", {
    tokenContract: "KT1ARTMINTAAAA1111111111111111111111",
    tokenId: "7",
  });
  await logout();

  const snapshots = await Promise.all([
    snapshotPersona("teztactician"),
    snapshotPersona("minamints"),
    snapshotPersona("vaultmoss"),
    snapshotPersona("signalglow"),
  ]);

  const state = parseState();
  const report = {
    generatedAt: new Date().toISOString(),
    scenario: {
      actions: [
        "Tez Tactician posted a platform-level wallet/collection complaint, approved marketplace operator access, created a listing, and DM'd Signal Glow.",
        "Mina Mints posted an artist-framing complaint, opened an auction, and DM'd Vault Moss about sequencing and story.",
        "Vault Moss posted a collector provenance complaint, bid on the auction, and placed an offer.",
        "Signal Glow posted a social/distribution complaint, approved WTF spending, bought the listing, and accepted the offer flow.",
      ],
    },
    board: state.boardMessages,
    dms: state.dms,
    listings: state.listings,
    auctions: state.auctions,
    offers: state.offers,
    notifications: state.notifications,
    contractLogs: state.contractLogs,
    snapshots,
  };

  console.log(JSON.stringify(report, null, 2));
}

await runScenario();
