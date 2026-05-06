import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  varchar,
  pgEnum,
  jsonb,
  index,
  uniqueIndex,
  bigint,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { users } from "./schema-core";
import { dmConversations } from "./schema-dm";

// ─── Studio microapp enums ──────────────────────────────

export const studioMemberRoleEnum = pgEnum("studio_member_role", [
  "owner",
  "editor",
  "commenter",
  "viewer",
]);

export const studioStorageBackendEnum = pgEnum("studio_storage_backend", [
  "local_disk",
  "google_drive",
]);

export const studioAnnotationKindEnum = pgEnum("studio_annotation_kind", [
  "pin",
  "sticky_note",
  "draw",
  "arrow",
  "rect",
  "text",
  "highlight",
]);

// ─── Studio — collaborative asset rooms ─────────────────
//
// Studio is a multimedia workspace where creators share files, drop
// annotations on previews, and chat in a project-scoped DM. File bytes may
// live on the local disk, in the project owner's Google Drive (BYO storage),
// or any future driver. The database stores metadata only; the storage driver
// URI in source_uri points at the actual bytes (e.g. "disk://...",
// "gdrive://fileId").

export const studioProjects = pgTable(
  "studio_projects",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    description: text("description"),
    ownerUserId: integer("owner_user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    coverImageUrl: text("cover_image_url"),
    /** Storage backend used for this project's file bytes. */
    storageBackend: studioStorageBackendEnum("storage_backend")
      .default("local_disk")
      .notNull(),
    /** Driver-specific context — Drive folder id, owner tokens ref, etc. */
    storageContext: jsonb("storage_context")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    /** Per-project storage cap. Default 500MB for local; 10GB for Drive. */
    storageQuotaBytes: bigint("storage_quota_bytes", { mode: "number" })
      .default(524_288_000)
      .notNull(),
    /** Running total of bytes used (kept in sync by upload/delete paths). */
    storageUsedBytes: bigint("storage_used_bytes", { mode: "number" })
      .default(0)
      .notNull(),
    /** Backing DM conversation for project chat (conversationType='studio'). */
    conversationId: integer("conversation_id").references(() => dmConversations.id, {
      onDelete: "set null",
    }),
    archived: boolean("archived").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("studio_projects_owner_idx").on(t.ownerUserId),
    index("studio_projects_archived_idx").on(t.archived),
    index("studio_projects_conversation_idx").on(t.conversationId),
  ]
);

export const studioProjectMembers = pgTable(
  "studio_project_members",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .references(() => studioProjects.id, { onDelete: "cascade" })
      .notNull(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    role: studioMemberRoleEnum("role").default("viewer").notNull(),
    invitedBy: integer("invited_by").references(() => users.id, {
      onDelete: "set null",
    }),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
    lastOpenedAt: timestamp("last_opened_at"),
    lastOpenedFileId: integer("last_opened_file_id"),
  },
  (t) => [
    index("studio_project_members_project_idx").on(t.projectId),
    index("studio_project_members_user_idx").on(t.userId),
    uniqueIndex("studio_project_member_unique_idx").on(t.projectId, t.userId),
  ]
);

export const studioFolders = pgTable(
  "studio_folders",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .references(() => studioProjects.id, { onDelete: "cascade" })
      .notNull(),
    parentFolderId: integer("parent_folder_id"),
    name: varchar("name", { length: 200 }).notNull(),
    position: integer("position").default(0).notNull(),
    createdBy: integer("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("studio_folders_project_idx").on(t.projectId),
    index("studio_folders_parent_idx").on(t.parentFolderId),
  ]
);

export const studioFiles = pgTable(
  "studio_files",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .references(() => studioProjects.id, { onDelete: "cascade" })
      .notNull(),
    folderId: integer("folder_id").references(() => studioFolders.id, {
      onDelete: "set null",
    }),
    uploaderId: integer("uploader_id").references(() => users.id, {
      onDelete: "set null",
    }),
    name: varchar("name", { length: 300 }).notNull(),
    mimeType: varchar("mime_type", { length: 150 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    /** Storage-driver-scoped URI for the archived original. */
    sourceUri: text("source_uri").notNull(),
    /** Optional preview asset URI (generated at upload for images/video/pdf). */
    previewUri: text("preview_uri"),
    /** Small thumbnail URI for tree/list views. */
    thumbnailUri: text("thumbnail_uri"),
    /** Short sha256 hex of original bytes for dedupe / integrity. */
    fileHash: varchar("file_hash", { length: 64 }),
    /**
     * Media-type-specific metadata — width, height, durationSeconds,
     * pageCount, waveformPeaks, posterTime, etc.
     */
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    currentVersion: integer("current_version").default(1).notNull(),
    position: integer("position").default(0).notNull(),
    archived: boolean("archived").default(false).notNull(),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("studio_files_project_idx").on(t.projectId),
    index("studio_files_folder_idx").on(t.folderId),
    index("studio_files_uploader_idx").on(t.uploaderId),
    index("studio_files_deleted_idx").on(t.deletedAt),
    index("studio_files_archived_idx").on(t.archived),
  ]
);

export const studioFileVersions = pgTable(
  "studio_file_versions",
  {
    id: serial("id").primaryKey(),
    fileId: integer("file_id")
      .references(() => studioFiles.id, { onDelete: "cascade" })
      .notNull(),
    version: integer("version").notNull(),
    uploaderId: integer("uploader_id").references(() => users.id, {
      onDelete: "set null",
    }),
    sourceUri: text("source_uri").notNull(),
    previewUri: text("preview_uri"),
    thumbnailUri: text("thumbnail_uri"),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    fileHash: varchar("file_hash", { length: 64 }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("studio_file_versions_file_idx").on(t.fileId),
    uniqueIndex("studio_file_version_unique_idx").on(t.fileId, t.version),
  ]
);

export const studioAnnotations = pgTable(
  "studio_annotations",
  {
    id: serial("id").primaryKey(),
    fileId: integer("file_id")
      .references(() => studioFiles.id, { onDelete: "cascade" })
      .notNull(),
    fileVersion: integer("file_version").default(1).notNull(),
    authorId: integer("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    kind: studioAnnotationKindEnum("kind").notNull(),
    /**
     * For video: time in seconds * 1000. For PDFs: 1-indexed page number.
     * For multi-page / multi-frame media generally. Null for single-asset
     * previews (plain images, audio).
     */
    pageOrFrame: integer("page_or_frame"),
    /**
     * All positional + presentation data lives here. Coordinates are
     * normalized 0-1 relative to the preview's natural dimensions so
     * annotations stay anchored at any display size.
     *   { x, y, w, h, color, text, strokePoints: [[x,y], ...] }
     */
    data: jsonb("data")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    resolved: boolean("resolved").default(false).notNull(),
    resolvedBy: integer("resolved_by").references(() => users.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("studio_annotations_file_idx").on(t.fileId),
    index("studio_annotations_author_idx").on(t.authorId),
    index("studio_annotations_kind_idx").on(t.kind),
    index("studio_annotations_resolved_idx").on(t.resolved),
  ]
);

export const studioAnnotationComments = pgTable(
  "studio_annotation_comments",
  {
    id: serial("id").primaryKey(),
    annotationId: integer("annotation_id")
      .references(() => studioAnnotations.id, { onDelete: "cascade" })
      .notNull(),
    authorId: integer("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    editedAt: timestamp("edited_at"),
  },
  (t) => [
    index("studio_annotation_comments_annotation_idx").on(t.annotationId),
    index("studio_annotation_comments_author_idx").on(t.authorId),
  ]
);

export const studioUserState = pgTable("studio_user_state", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  lastOpenProjectId: integer("last_open_project_id").references(
    () => studioProjects.id,
    { onDelete: "set null" }
  ),
  /**
   * Persisted UI state per user — panel widths, scroll positions, etc.
   *   { leftPanelWidth, rightPanelWidth, lastOpenFileByProject: {...} }
   */
  state: jsonb("state")
    .$type<Record<string, unknown>>()
    .default(sql`'{}'::jsonb`)
    .notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/**
 * Per-user, per-project OAuth tokens for storage drivers that require
 * delegated auth (Google Drive). Encrypted at rest via KMS key in env.
 * This table is shared across all projects the user owns that use the
 * same backend, keyed by (userId, backend).
 */
export const studioStorageAccounts = pgTable(
  "studio_storage_accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    backend: studioStorageBackendEnum("backend").notNull(),
    accountEmail: varchar("account_email", { length: 320 }),
    /** Scope the OAuth token was granted at (comma-joined). */
    scopes: text("scopes"),
    /** Encrypted serialized credential envelope (JSON). */
    credentialCipher: text("credential_cipher").notNull(),
    /** IV / nonce for the credentialCipher. */
    credentialNonce: varchar("credential_nonce", { length: 64 }).notNull(),
    /** When the stored access token expires (if known). */
    expiresAt: timestamp("expires_at"),
    lastRefreshedAt: timestamp("last_refreshed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("studio_storage_accounts_user_idx").on(t.userId),
    uniqueIndex("studio_storage_accounts_user_backend_unique_idx").on(
      t.userId,
      t.backend
    ),
  ]
);

/**
 * Platform-owned storage connections. One row per backend (unique on
 * `backend`). Today only Google Drive is supported — a single Google account
 * (e.g. wtfgameshowemail@gmail.com) backs every project using the
 * `google_drive` backend, so the 2 TB pool is shared across the platform.
 *
 * `credentialCipher` + `credentialNonce` encrypt the OAuth refresh/access
 * tokens with `STUDIO_CRYPTO_KEY` (AES-256-GCM).
 */
export const studioPlatformStorage = pgTable(
  "studio_platform_storage",
  {
    id: serial("id").primaryKey(),
    backend: studioStorageBackendEnum("backend").notNull(),
    accountEmail: varchar("account_email", { length: 320 }),
    scopes: text("scopes"),
    credentialCipher: text("credential_cipher").notNull(),
    credentialNonce: varchar("credential_nonce", { length: 64 }).notNull(),
    /** Root folder id inside the provider where Studio creates project folders. */
    rootFolderId: varchar("root_folder_id", { length: 128 }),
    /** Cached provider-reported total+used quota (bytes); refreshed periodically. */
    quotaBytesLimit: bigint("quota_bytes_limit", { mode: "number" }),
    quotaBytesUsage: bigint("quota_bytes_usage", { mode: "number" }),
    quotaRefreshedAt: timestamp("quota_refreshed_at"),
    /** Admin user who kicked off the connection; informational only. */
    connectedByUserId: integer("connected_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    lastRefreshedAt: timestamp("last_refreshed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("studio_platform_storage_backend_unique_idx").on(t.backend),
  ]
);

// ─── Studio relations ───────────────────────────────────

export const studioProjectsRelations = relations(studioProjects, ({ one, many }) => ({
  owner: one(users, {
    fields: [studioProjects.ownerUserId],
    references: [users.id],
  }),
  conversation: one(dmConversations, {
    fields: [studioProjects.conversationId],
    references: [dmConversations.id],
  }),
  members: many(studioProjectMembers),
  folders: many(studioFolders),
  files: many(studioFiles),
}));

export const studioProjectMembersRelations = relations(
  studioProjectMembers,
  ({ one }) => ({
    project: one(studioProjects, {
      fields: [studioProjectMembers.projectId],
      references: [studioProjects.id],
    }),
    user: one(users, {
      fields: [studioProjectMembers.userId],
      references: [users.id],
    }),
    inviter: one(users, {
      fields: [studioProjectMembers.invitedBy],
      references: [users.id],
    }),
  })
);

export const studioFoldersRelations = relations(studioFolders, ({ one, many }) => ({
  project: one(studioProjects, {
    fields: [studioFolders.projectId],
    references: [studioProjects.id],
  }),
  parent: one(studioFolders, {
    fields: [studioFolders.parentFolderId],
    references: [studioFolders.id],
    relationName: "studioFolderParent",
  }),
  children: many(studioFolders, { relationName: "studioFolderParent" }),
  creator: one(users, {
    fields: [studioFolders.createdBy],
    references: [users.id],
  }),
  files: many(studioFiles),
}));

export const studioFilesRelations = relations(studioFiles, ({ one, many }) => ({
  project: one(studioProjects, {
    fields: [studioFiles.projectId],
    references: [studioProjects.id],
  }),
  folder: one(studioFolders, {
    fields: [studioFiles.folderId],
    references: [studioFolders.id],
  }),
  uploader: one(users, {
    fields: [studioFiles.uploaderId],
    references: [users.id],
  }),
  versions: many(studioFileVersions),
  annotations: many(studioAnnotations),
}));

export const studioFileVersionsRelations = relations(
  studioFileVersions,
  ({ one }) => ({
    file: one(studioFiles, {
      fields: [studioFileVersions.fileId],
      references: [studioFiles.id],
    }),
    uploader: one(users, {
      fields: [studioFileVersions.uploaderId],
      references: [users.id],
    }),
  })
);

export const studioAnnotationsRelations = relations(
  studioAnnotations,
  ({ one, many }) => ({
    file: one(studioFiles, {
      fields: [studioAnnotations.fileId],
      references: [studioFiles.id],
    }),
    author: one(users, {
      fields: [studioAnnotations.authorId],
      references: [users.id],
    }),
    resolver: one(users, {
      fields: [studioAnnotations.resolvedBy],
      references: [users.id],
    }),
    comments: many(studioAnnotationComments),
  })
);

export const studioAnnotationCommentsRelations = relations(
  studioAnnotationComments,
  ({ one }) => ({
    annotation: one(studioAnnotations, {
      fields: [studioAnnotationComments.annotationId],
      references: [studioAnnotations.id],
    }),
    author: one(users, {
      fields: [studioAnnotationComments.authorId],
      references: [users.id],
    }),
  })
);

export const studioStorageAccountsRelations = relations(
  studioStorageAccounts,
  ({ one }) => ({
    user: one(users, {
      fields: [studioStorageAccounts.userId],
      references: [users.id],
    }),
  })
);
