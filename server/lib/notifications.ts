import { eq, inArray, ne } from "drizzle-orm";
import { db } from "../db";
import {
  userNotificationPreferences,
  userNotifications,
  userWallets,
  users,
} from "@shared/schema";

export const NOTIFICATION_PREFERENCE_DEFINITIONS = [
  {
    key: "market_new_listing",
    label: "New Market Listings",
    description:
      "Notify when a new marketplace listing or auction is posted.",
    defaultEnabled: true,
  },
  {
    key: "market_offer_received",
    label: "Offers On My Trade Board",
    description:
      "Notify when someone places an offer on a token you posted on your trade board.",
    defaultEnabled: true,
  },
  {
    key: "market_offer_accepted",
    label: "My Offer Accepted",
    description: "Notify when one of your offers is accepted.",
    defaultEnabled: true,
  },
  {
    key: "market_bid_received",
    label: "Bids On My Auctions",
    description: "Notify when someone bids on your auction.",
    defaultEnabled: true,
  },
  {
    key: "market_auction_outbid",
    label: "Outbid Alerts",
    description: "Notify when your top auction bid gets outbid.",
    defaultEnabled: true,
  },
  {
    key: "market_listing_sold",
    label: "Listing Sold",
    description: "Notify when your listing is purchased.",
    defaultEnabled: true,
  },
  {
    key: "market_auction_settled",
    label: "Auction Settlements",
    description: "Notify when an auction you own or won is settled.",
    defaultEnabled: true,
  },
  {
    key: "contract_action_failed",
    label: "Contract Failures",
    description: "Notify when one of your contract interactions fails.",
    defaultEnabled: true,
  },
  {
    key: "fart_noises",
    label: "FART NOISES",
    description:
      "Notify when a FART NOISES Telegram alert mentions one of your linked wallets.",
    defaultEnabled: true,
  },
] as const;

export type NotificationPreferenceKey =
  (typeof NOTIFICATION_PREFERENCE_DEFINITIONS)[number]["key"];

export const DEFAULT_NOTIFICATION_PREFERENCES: Record<
  NotificationPreferenceKey,
  boolean
> = Object.fromEntries(
  NOTIFICATION_PREFERENCE_DEFINITIONS.map((def) => [def.key, def.defaultEnabled])
) as Record<NotificationPreferenceKey, boolean>;

export interface CreateNotificationInput {
  userId: number;
  eventKey: string;
  title: string;
  body?: string | null;
  metadata?: Record<string, unknown> | null;
  sourceUserId?: number | null;
  preferenceKey?: NotificationPreferenceKey;
}

function asPreferenceMap(
  value: unknown
): Partial<Record<NotificationPreferenceKey, boolean>> {
  const out: Partial<Record<NotificationPreferenceKey, boolean>> = {};
  if (!value || typeof value !== "object") return out;
  const obj = value as Record<string, unknown>;
  for (const def of NOTIFICATION_PREFERENCE_DEFINITIONS) {
    const v = obj[def.key];
    if (typeof v === "boolean") {
      out[def.key] = v;
    }
  }
  return out;
}

export function sanitizeNotificationPreferencePatch(
  value: unknown
): Partial<Record<NotificationPreferenceKey, boolean>> {
  return asPreferenceMap(value);
}

export async function getUserNotificationPreferences(
  userId: number
): Promise<Record<NotificationPreferenceKey, boolean>> {
  const [row] = await db
    .select({ preferences: userNotificationPreferences.preferences })
    .from(userNotificationPreferences)
    .where(eq(userNotificationPreferences.userId, userId))
    .limit(1);

  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...asPreferenceMap(row?.preferences),
  };
}

export async function setUserNotificationPreferences(
  userId: number,
  patch: Partial<Record<NotificationPreferenceKey, boolean>>
): Promise<Record<NotificationPreferenceKey, boolean>> {
  const current = await getUserNotificationPreferences(userId);
  const merged = {
    ...current,
    ...patch,
  };

  await db
    .insert(userNotificationPreferences)
    .values({
      userId,
      preferences: merged,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userNotificationPreferences.userId,
      set: {
        preferences: merged,
        updatedAt: new Date(),
      },
    });

  return merged;
}

async function filterUsersByPreference(
  userIds: number[],
  preferenceKey?: NotificationPreferenceKey
): Promise<number[]> {
  const unique = Array.from(
    new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))
  );
  if (!preferenceKey || unique.length === 0) return unique;

  const rows = await db
    .select({
      userId: userNotificationPreferences.userId,
      preferences: userNotificationPreferences.preferences,
    })
    .from(userNotificationPreferences)
    .where(inArray(userNotificationPreferences.userId, unique));

  const map = new Map<number, Partial<Record<NotificationPreferenceKey, boolean>>>();
  for (const row of rows) {
    map.set(row.userId, asPreferenceMap(row.preferences));
  }

  return unique.filter((userId) => {
    const userPrefs = map.get(userId);
    if (userPrefs && typeof userPrefs[preferenceKey] === "boolean") {
      return Boolean(userPrefs[preferenceKey]);
    }
    return DEFAULT_NOTIFICATION_PREFERENCES[preferenceKey];
  });
}

export async function createNotification(
  input: CreateNotificationInput
): Promise<void> {
  const recipients = await filterUsersByPreference(
    [input.userId],
    input.preferenceKey
  );
  if (recipients.length === 0) return;

  await db.insert(userNotifications).values({
    userId: input.userId,
    sourceUserId: input.sourceUserId ?? null,
    eventKey: input.eventKey,
    title: input.title,
    body: input.body ?? null,
    metadata: input.metadata ?? {},
    read: false,
  });
}

export async function createNotificationsForUsers(
  userIds: number[],
  input: Omit<CreateNotificationInput, "userId">
): Promise<number> {
  const recipients = await filterUsersByPreference(userIds, input.preferenceKey);
  if (recipients.length === 0) return 0;

  await db.insert(userNotifications).values(
    recipients.map((userId) => ({
      userId,
      sourceUserId: input.sourceUserId ?? null,
      eventKey: input.eventKey,
      title: input.title,
      body: input.body ?? null,
      metadata: input.metadata ?? {},
      read: false,
    }))
  );

  return recipients.length;
}

export async function getUserIdByWalletAddress(
  walletAddress: string | null | undefined
): Promise<number | null> {
  if (!walletAddress || typeof walletAddress !== "string") return null;
  const [row] = await db
    .select({ userId: userWallets.userId })
    .from(userWallets)
    .where(eq(userWallets.walletAddress, walletAddress.trim()))
    .limit(1);

  return row?.userId ?? null;
}

export async function getAllUserIdsExcept(
  excludedUserId: number | null | undefined
): Promise<number[]> {
  if (!excludedUserId || !Number.isInteger(excludedUserId)) {
    const rows = await db.select({ id: users.id }).from(users);
    return rows.map((r) => r.id);
  }

  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(ne(users.id, excludedUserId));
  return rows.map((r) => r.id);
}

export function actorDisplayName(user: {
  displayName?: string | null;
  username?: string | null;
} | null): string {
  return user?.displayName || user?.username || "A user";
}
