import { relations } from "drizzle-orm";
import {
  contractActivityLogs,
  systemEventLogs,
  userNotificationPreferences,
  userNotifications,
  userCurses,
  userWallets,
  xpEvents,
} from "./schema-admin";
import { users } from "./schema-core";
import {
  desktopPetEvents,
  desktopPetStates,
  userDesktopSettings,
} from "./schema-desktop";
import {
  dmConversationParticipants,
  dmMessages,
} from "./schema-dm";
import { diaryEntries } from "./schema-diary";
import {
  boardReactions,
  boardThreadReplies,
  boardThreads,
  messages,
} from "./schema-board";
import {
  challengeRewardFlags,
  challengeSubmissions,
} from "./schema-gameshow";
import {
  challengeAutomationActionLogs,
  challengeAutomationAuditLogs,
  challengeAutomationCompletions,
  challengeAutomationDefinitions,
  challengeAutomationProgress,
  challengeSystemEvents,
} from "./schema-challenge-automation";
import {
  casinoMembershipIntents,
  casinoMemberships,
  casinoPracticeGames,
  casinoPracticePlays,
  casinoWagerSessions,
} from "./schema-casino";
import {
  clubDuesContracts,
  clubDuesDeploymentRuns,
  clubDuesMemberLedger,
  clubDuesPaymentIntents,
} from "./schema-club-dues";
import {
  studioAnnotations,
  studioFiles,
  studioProjectMembers,
  studioProjects,
} from "./schema-studio";
import {
  greenRoomAdminAudits,
  greenRoomAllianceMembers,
  greenRoomEvents,
  greenRoomInventoryItems,
  greenRoomPlayers,
  greenRoomRelationships,
} from "./schema-green-room";
import { macaroniPackages } from "./schema-macaroni";
import { tvChannels } from "./schema-tv";
import {
  telegramDigestAnnouncements,
  telegramDigestSources,
  telegramFartTracks,
} from "./schema-telegram";

export * from "./schema-core";
export * from "./schema-social";
export * from "./schema-ops";
export * from "./schema-admin";
export * from "./schema-analytics";
export * from "./schema-board";
export * from "./schema-desktop";
export * from "./schema-dm";
export * from "./schema-diary";
export * from "./schema-gameshow";
export * from "./schema-challenge-automation";
export * from "./schema-casino";
export * from "./schema-club-dues";
export * from "./schema-game-studio";
export * from "./schema-green-room";
export * from "./schema-liveops";
export * from "./schema-wtf-live";
export * from "./schema-console";
export * from "./schema-market";
export * from "./schema-recapture";
export * from "./schema-session";
export * from "./schema-wallet";
export * from "./schema-etherlink";
export * from "./schema-discord";
export * from "./schema-studio";
export * from "./schema-tv";
export * from "./schema-telegram";
export * from "./schema-comms";
export * from "./schema-mail";
export * from "./schema-music";
export * from "./schema-mastodon";
export * from "./schema-porcupin";
export * from "./schema-ipfs-pinning";
export * from "./schema-macaroni";
export * from "./schema-atproto-appview";
export * from "./schema-app-registry";
export * from "./schema-wtf-sites";
export * from "./schema-objkt-operator";
export * from "./schema-admin-inbox";

// TODO(schema modularization): keep the cross-domain user relation fan-out
// in the compatibility barrel until the relation graph has domain-owned edges.
export const usersRelations = relations(users, ({ many, one }) => ({
  wallets: many(userWallets),
  submissions: many(challengeSubmissions),
  dmParticipants: many(dmConversationParticipants),
  dmSentMessages: many(dmMessages),
  diaryEntries: many(diaryEntries),
  boardThreads: many(boardThreads),
  boardThreadReplies: many(boardThreadReplies),
  boardReactions: many(boardReactions),
  xpEvents: many(xpEvents),
  rewardFlags: many(challengeRewardFlags),
  tvChannels: many(tvChannels),
  messages: many(messages),
  notifications: many(userNotifications),
  curses: many(userCurses),
  notificationPreferences: one(userNotificationPreferences, {
    fields: [users.id],
    references: [userNotificationPreferences.userId],
  }),
  contractActivityLogs: many(contractActivityLogs),
  studioProjectsOwned: many(studioProjects),
  studioMemberships: many(studioProjectMembers),
  studioFilesUploaded: many(studioFiles),
  studioAnnotations: many(studioAnnotations),
  greenRoomPlayer: one(greenRoomPlayers, {
    fields: [users.id],
    references: [greenRoomPlayers.userId],
  }),
  greenRoomInventoryItems: many(greenRoomInventoryItems),
  greenRoomRelationships: many(greenRoomRelationships),
  greenRoomAllianceMemberships: many(greenRoomAllianceMembers),
  greenRoomEvents: many(greenRoomEvents),
  greenRoomAdminAudits: many(greenRoomAdminAudits),
  macaroniPackages: many(macaroniPackages),
  desktopSettings: one(userDesktopSettings, {
    fields: [users.id],
    references: [userDesktopSettings.userId],
  }),
  desktopPetState: one(desktopPetStates, {
    fields: [users.id],
    references: [desktopPetStates.userId],
  }),
  desktopPetEvents: many(desktopPetEvents),
  systemEventLogs: many(systemEventLogs),
  challengeSystemEvents: many(challengeSystemEvents),
  challengeAutomationDefinitions: many(challengeAutomationDefinitions),
  challengeAutomationProgress: many(challengeAutomationProgress),
  challengeAutomationCompletions: many(challengeAutomationCompletions),
  challengeAutomationActionLogs: many(challengeAutomationActionLogs),
  challengeAutomationAuditLogs: many(challengeAutomationAuditLogs),
  casinoMembershipIntents: many(casinoMembershipIntents),
  casinoMemberships: many(casinoMemberships),
  casinoPracticeGames: many(casinoPracticeGames),
  casinoPracticePlays: many(casinoPracticePlays),
  casinoWagerSessions: many(casinoWagerSessions),
  clubDuesContractsDeployed: many(clubDuesContracts),
  clubDuesDeploymentRuns: many(clubDuesDeploymentRuns),
  clubDuesPaymentIntents: many(clubDuesPaymentIntents),
  clubDuesMemberships: many(clubDuesMemberLedger),
  telegramDigestSourcesCreated: many(telegramDigestSources),
  telegramDigestAnnouncementsCreated: many(telegramDigestAnnouncements),
  telegramFartTracks: many(telegramFartTracks),
}));
