import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  varchar,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./schema-core";

export type ChallengeAutomationStatus =
  | "draft"
  | "active"
  | "paused"
  | "completed"
  | "archived";

export type ChallengeProgressState =
  | "not_started"
  | "in_progress"
  | "completed"
  | "expired"
  | "blocked";

export type ChallengeRewardStatus =
  | "pending"
  | "queued"
  | "completed"
  | "failed"
  | "skipped";

export const challengeSystemEvents = pgTable(
  "challenge_system_events",
  {
    id: serial("id").primaryKey(),
    eventId: varchar("event_id", { length: 140 }).notNull(),
    eventType: varchar("event_type", { length: 140 }).notNull(),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    walletAddress: varchar("wallet_address", { length: 64 }),
    source: varchar("source", { length: 80 }).notNull(),
    sourceModule: varchar("source_module", { length: 80 }),
    rawRefType: varchar("raw_ref_type", { length: 80 }),
    rawRefId: varchar("raw_ref_id", { length: 160 }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("challenge_system_events_event_id_idx").on(table.eventId),
    index("challenge_system_events_type_time_idx").on(
      table.eventType,
      table.occurredAt
    ),
    index("challenge_system_events_user_type_time_idx").on(
      table.userId,
      table.eventType,
      table.occurredAt
    ),
    index("challenge_system_events_wallet_time_idx").on(
      table.walletAddress,
      table.occurredAt
    ),
    index("challenge_system_events_raw_ref_idx").on(
      table.rawRefType,
      table.rawRefId
    ),
  ]
);

export const challengeAutomationDefinitions = pgTable(
  "challenge_automation_definitions",
  {
    id: serial("id").primaryKey(),
    title: varchar("title", { length: 260 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 24 })
      .$type<ChallengeAutomationStatus>()
      .default("draft")
      .notNull(),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    startTime: timestamp("start_time", { withTimezone: true }),
    endTime: timestamp("end_time", { withTimezone: true }),
    eligibilityRules: jsonb("eligibility_rules")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    conditionTree: jsonb("condition_tree")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    rewardActions: jsonb("reward_actions")
      .$type<Array<Record<string, unknown>>>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    repeatability: jsonb("repeatability")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    perUserCompletionLimit: integer("per_user_completion_limit")
      .default(1)
      .notNull(),
    globalCompletionLimit: integer("global_completion_limit"),
    summary: text("summary"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("challenge_automation_status_time_idx").on(
      table.status,
      table.startTime,
      table.endTime
    ),
    index("challenge_automation_created_by_idx").on(table.createdBy),
  ]
);

export const challengeAutomationProgress = pgTable(
  "challenge_automation_progress",
  {
    id: serial("id").primaryKey(),
    challengeId: integer("challenge_id")
      .references(() => challengeAutomationDefinitions.id, {
        onDelete: "cascade",
      })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    walletAddress: varchar("wallet_address", { length: 64 }),
    state: varchar("state", { length: 24 })
      .$type<ChallengeProgressState>()
      .default("in_progress")
      .notNull(),
    countedEvents: jsonb("counted_events")
      .$type<Record<string, number>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    satisfiedConditionIds: jsonb("satisfied_condition_ids")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    firstEventAt: timestamp("first_event_at", { withTimezone: true }),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    rewardStatus: varchar("reward_status", { length: 24 })
      .$type<ChallengeRewardStatus>()
      .default("pending")
      .notNull(),
    auditEventIds: jsonb("audit_event_ids")
      .$type<number[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("challenge_automation_progress_user_idx").on(
      table.challengeId,
      table.userId
    ),
    index("challenge_automation_progress_state_idx").on(
      table.challengeId,
      table.state
    ),
    index("challenge_automation_progress_user_time_idx").on(
      table.userId,
      table.updatedAt
    ),
  ]
);

export const challengeAutomationCompletions = pgTable(
  "challenge_automation_completions",
  {
    id: serial("id").primaryKey(),
    challengeId: integer("challenge_id")
      .references(() => challengeAutomationDefinitions.id, {
        onDelete: "cascade",
      })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    progressId: integer("progress_id").references(
      () => challengeAutomationProgress.id,
      { onDelete: "set null" }
    ),
    completionKey: varchar("completion_key", { length: 160 })
      .default("default")
      .notNull(),
    rewardStatus: varchar("reward_status", { length: 24 })
      .$type<ChallengeRewardStatus>()
      .default("pending")
      .notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    rewardedAt: timestamp("rewarded_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("challenge_automation_completion_unique_idx").on(
      table.challengeId,
      table.userId,
      table.completionKey
    ),
    index("challenge_automation_completion_user_time_idx").on(
      table.userId,
      table.completedAt
    ),
  ]
);

export const challengeAutomationActionLogs = pgTable(
  "challenge_automation_action_logs",
  {
    id: serial("id").primaryKey(),
    challengeId: integer("challenge_id")
      .references(() => challengeAutomationDefinitions.id, {
        onDelete: "cascade",
      })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    completionId: integer("completion_id").references(
      () => challengeAutomationCompletions.id,
      { onDelete: "cascade" }
    ),
    actionKey: varchar("action_key", { length: 80 }).notNull(),
    actionIndex: integer("action_index").default(0).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 220 }).notNull(),
    status: varchar("status", { length: 24 }).default("pending").notNull(),
    resultJson: jsonb("result_json")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("challenge_automation_action_idempotency_idx").on(
      table.idempotencyKey
    ),
    index("challenge_automation_action_completion_idx").on(table.completionId),
    index("challenge_automation_action_status_idx").on(table.status),
  ]
);

export const challengeAutomationAuditLogs = pgTable(
  "challenge_automation_audit_logs",
  {
    id: serial("id").primaryKey(),
    challengeId: integer("challenge_id").references(
      () => challengeAutomationDefinitions.id,
      { onDelete: "set null" }
    ),
    userId: integer("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    systemEventId: integer("system_event_id").references(
      () => challengeSystemEvents.id,
      { onDelete: "set null" }
    ),
    progressId: integer("progress_id").references(
      () => challengeAutomationProgress.id,
      { onDelete: "set null" }
    ),
    action: varchar("action", { length: 80 }).notNull(),
    status: varchar("status", { length: 24 }).default("info").notNull(),
    message: text("message"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("challenge_automation_audit_challenge_time_idx").on(
      table.challengeId,
      table.createdAt
    ),
    index("challenge_automation_audit_user_time_idx").on(
      table.userId,
      table.createdAt
    ),
    index("challenge_automation_audit_event_idx").on(table.systemEventId),
  ]
);

export const challengeSystemEventsRelations = relations(
  challengeSystemEvents,
  ({ one }) => ({
    user: one(users, {
      fields: [challengeSystemEvents.userId],
      references: [users.id],
    }),
  })
);

export const challengeAutomationDefinitionsRelations = relations(
  challengeAutomationDefinitions,
  ({ one, many }) => ({
    creator: one(users, {
      fields: [challengeAutomationDefinitions.createdBy],
      references: [users.id],
    }),
    progress: many(challengeAutomationProgress),
    completions: many(challengeAutomationCompletions),
    auditLogs: many(challengeAutomationAuditLogs),
  })
);

export const challengeAutomationProgressRelations = relations(
  challengeAutomationProgress,
  ({ one }) => ({
    challenge: one(challengeAutomationDefinitions, {
      fields: [challengeAutomationProgress.challengeId],
      references: [challengeAutomationDefinitions.id],
    }),
    user: one(users, {
      fields: [challengeAutomationProgress.userId],
      references: [users.id],
    }),
  })
);

export const challengeAutomationCompletionsRelations = relations(
  challengeAutomationCompletions,
  ({ one, many }) => ({
    challenge: one(challengeAutomationDefinitions, {
      fields: [challengeAutomationCompletions.challengeId],
      references: [challengeAutomationDefinitions.id],
    }),
    progress: one(challengeAutomationProgress, {
      fields: [challengeAutomationCompletions.progressId],
      references: [challengeAutomationProgress.id],
    }),
    user: one(users, {
      fields: [challengeAutomationCompletions.userId],
      references: [users.id],
    }),
    actionLogs: many(challengeAutomationActionLogs),
  })
);

export const challengeAutomationActionLogsRelations = relations(
  challengeAutomationActionLogs,
  ({ one }) => ({
    challenge: one(challengeAutomationDefinitions, {
      fields: [challengeAutomationActionLogs.challengeId],
      references: [challengeAutomationDefinitions.id],
    }),
    completion: one(challengeAutomationCompletions, {
      fields: [challengeAutomationActionLogs.completionId],
      references: [challengeAutomationCompletions.id],
    }),
    user: one(users, {
      fields: [challengeAutomationActionLogs.userId],
      references: [users.id],
    }),
  })
);

export const challengeAutomationAuditLogsRelations = relations(
  challengeAutomationAuditLogs,
  ({ one }) => ({
    challenge: one(challengeAutomationDefinitions, {
      fields: [challengeAutomationAuditLogs.challengeId],
      references: [challengeAutomationDefinitions.id],
    }),
    user: one(users, {
      fields: [challengeAutomationAuditLogs.userId],
      references: [users.id],
    }),
    systemEvent: one(challengeSystemEvents, {
      fields: [challengeAutomationAuditLogs.systemEventId],
      references: [challengeSystemEvents.id],
    }),
    progress: one(challengeAutomationProgress, {
      fields: [challengeAutomationAuditLogs.progressId],
      references: [challengeAutomationProgress.id],
    }),
  })
);
