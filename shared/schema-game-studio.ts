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
import { sql } from "drizzle-orm";
import { users } from "./schema-core";
import { consoleGames } from "./schema-liveops";

export const gameStudioProjects = pgTable(
  "game_studio_projects",
  {
    id: serial("id").primaryKey(),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description").default("").notNull(),
    templateId: varchar("template_id", { length: 120 }).notNull(),
    status: varchar("status", { length: 32 }).default("draft").notNull(),
    selectedAssetIds: jsonb("selected_asset_ids")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    localAssets: jsonb("local_assets")
      .default(sql`'[]'::jsonb`)
      .notNull(),
    files: jsonb("files").default(sql`'{}'::jsonb`).notNull(),
    buildMetadata: jsonb("build_metadata")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    lastSubmittedGameId: integer("last_submitted_game_id").references(
      () => consoleGames.id,
      { onDelete: "set null" }
    ),
    lastBuiltAt: timestamp("last_built_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("game_studio_projects_owner_idx").on(
      table.ownerUserId,
      table.updatedAt
    ),
    index("game_studio_projects_template_idx").on(table.templateId),
    index("game_studio_projects_status_idx").on(table.status, table.updatedAt),
    uniqueIndex("game_studio_projects_owner_slug_idx").on(
      table.ownerUserId,
      table.slug
    ),
  ]
);

export const gameStudioProjectBuilds = pgTable(
  "game_studio_project_builds",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .references(() => gameStudioProjects.id, { onDelete: "cascade" })
      .notNull(),
    buildNumber: integer("build_number").default(1).notNull(),
    filename: text("filename").notNull(),
    mimeType: varchar("mime_type", { length: 120 })
      .default("application/zip")
      .notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksumSha256: varchar("checksum_sha256", { length: 64 }).notNull(),
    manifestJson: jsonb("manifest_json")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    sourceSnapshot: jsonb("source_snapshot")
      .default(sql`'{}'::jsonb`)
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("game_studio_project_builds_project_idx").on(
      table.projectId,
      table.createdAt
    ),
    uniqueIndex("game_studio_project_builds_number_idx").on(
      table.projectId,
      table.buildNumber
    ),
  ]
);
