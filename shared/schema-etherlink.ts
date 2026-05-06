import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  varchar,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./schema-core";

export const userEtherlinkWallets = pgTable(
  "user_etherlink_wallets",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    walletAddress: varchar("wallet_address", { length: 42 }).notNull(),
    chainId: integer("chain_id").notNull(),
    network: varchar("network", { length: 32 }).notNull(),
    providerKey: varchar("provider_key", { length: 32 }),
    providerName: varchar("provider_name", { length: 80 }),
    nativeBalanceWei: text("native_balance_wei").default("0").notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    linkedAt: timestamp("linked_at").defaultNow().notNull(),
    lastSyncedAt: timestamp("last_synced_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uqWalletChain: uniqueIndex("uq_user_etherlink_wallet_chain").on(
      table.chainId,
      table.walletAddress,
    ),
    idxUser: index("idx_user_etherlink_wallet_user").on(table.userId),
    idxNetwork: index("idx_user_etherlink_wallet_network").on(
      table.chainId,
      table.network,
    ),
  }),
);

export const userEtherlinkWalletsRelations = relations(
  userEtherlinkWallets,
  ({ one }) => ({
    user: one(users, {
      fields: [userEtherlinkWallets.userId],
      references: [users.id],
    }),
  }),
);

export const etherlinkWalletAuthNonces = pgTable(
  "etherlink_wallet_auth_nonces",
  {
    id: serial("id").primaryKey(),
    walletAddress: varchar("wallet_address", { length: 42 }).notNull(),
    chainId: integer("chain_id").notNull(),
    nonce: varchar("nonce", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    consumed: boolean("consumed").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    idxWalletNonce: index("idx_etherlink_nonce_wallet").on(
      table.chainId,
      table.walletAddress,
      table.nonce,
    ),
    idxExpiry: index("idx_etherlink_nonce_expiry").on(table.expiresAt),
  }),
);

export const etherlinkTokenMetadata = pgTable(
  "etherlink_token_metadata",
  {
    id: serial("id").primaryKey(),
    chainId: integer("chain_id").notNull(),
    network: varchar("network", { length: 32 }).notNull(),
    tokenContract: varchar("token_contract", { length: 42 }).notNull(),
    tokenId: text("token_id").notNull(),
    tokenStandard: varchar("token_standard", { length: 16 }).notNull(),
    name: text("name"),
    symbol: text("symbol"),
    decimals: integer("decimals"),
    description: text("description"),
    thumbnail: text("thumbnail"),
    artifactUri: text("artifact_uri"),
    displayUri: text("display_uri"),
    externalUrl: text("external_url"),
    raw: jsonb("raw"),
    fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uqToken: uniqueIndex("uq_etherlink_token_metadata").on(
      table.chainId,
      table.tokenContract,
      table.tokenId,
    ),
    idxContract: index("idx_etherlink_token_contract").on(
      table.chainId,
      table.tokenContract,
    ),
  }),
);

export const etherlinkWalletHoldings = pgTable(
  "etherlink_wallet_holdings",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    walletAddress: varchar("wallet_address", { length: 42 }).notNull(),
    chainId: integer("chain_id").notNull(),
    network: varchar("network", { length: 32 }).notNull(),
    tokenContract: varchar("token_contract", { length: 42 }).notNull(),
    tokenId: text("token_id").notNull(),
    tokenStandard: varchar("token_standard", { length: 16 }).notNull(),
    balance: text("balance").notNull(),
    derivedAt: timestamp("derived_at").defaultNow().notNull(),
    lastActivityAt: timestamp("last_activity_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uqWalletToken: uniqueIndex("uq_etherlink_holdings_wallet_token").on(
      table.chainId,
      table.walletAddress,
      table.tokenContract,
      table.tokenId,
    ),
    idxUserActivity: index("idx_etherlink_holdings_user_activity").on(
      table.userId,
      table.derivedAt,
    ),
    idxContractToken: index("idx_etherlink_holdings_contract_token").on(
      table.chainId,
      table.tokenContract,
      table.tokenId,
    ),
  }),
);
