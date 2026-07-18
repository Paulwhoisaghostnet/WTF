/**
 * Studio — projects, members, folders, and tree.
 *
 * Mounts at no prefix; all paths start with `/api/studio/...`.
 * File upload + annotation routes live in sibling route modules so
 * this file stays focused on project-level resources.
 */

import { Router } from "express";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  dmConversationParticipants,
  dmConversations,
  dmMessages,
  studioAnnotations,
  studioFiles,
  studioFolders,
  studioProjectMembers,
  studioProjects,
  studioUserState,
  users,
} from "@shared/schema";
import {
  DESKTOP_APPS,
  STUDIO_MEMBER_ROLES,
  STUDIO_STORAGE_BACKENDS,
  STUDIO_MEMBER_ROLE_LABELS,
  STUDIO_PROJECT_NETWORKS,
  STUDIO_PROJECT_PHASES,
  STUDIO_PROJECT_USE_CASES,
  studioRoleCanEditFiles,
  studioRoleCanInvite,
  studioRoleCanManageProject,
  type StudioMemberRole,
  type StudioStorageBackend,
  type StudioProjectWorkflow,
} from "@shared/types";
import { isAuthenticated, requirePermission } from "../auth/passport";
import {
  StudioAccessError,
  canInvite,
  canManageProject,
  requireStudioAccess,
  resolveStudioAccess,
} from "../lib/studio/access";
import {
  defaultQuotaBytes,
} from "../lib/studio/quota";
import { createNotificationsForUsers } from "../lib/notifications";
import {
  chooseDefaultBackend,
  getDriver,
} from "../lib/studio/driver-registry";
import { broadcastStudioEvent } from "../websocket";

// Suppress 'unused' warning — DESKTOP_APPS re-exported for type-guard symmetry.
void DESKTOP_APPS;

const router = Router();

/* ── Validation schemas ─────────────────────────────────── */

const nameSchema = z.string().trim().min(1).max(200);
const descriptionSchema = z
  .string()
  .trim()
  .max(5000)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const createProjectSchema = z
  .object({
    name: nameSchema,
    description: descriptionSchema,
    /**
     * Explicit backend selection is allowed but optional — we default at
     * runtime via `chooseDefaultBackend()` (Google Drive if the platform
     * account is connected, local disk otherwise).
     */
    storageBackend: z.enum(STUDIO_STORAGE_BACKENDS).optional(),
    invites: z
      .array(
        z.object({
          userId: z.number().int().positive(),
          role: z
            .enum(STUDIO_MEMBER_ROLES)
            .optional()
            .default("editor"),
        })
      )
      .max(30)
      .optional()
      .default([]),
    workflow: z
      .object({
        useCase: z.enum(STUDIO_PROJECT_USE_CASES).optional(),
        targetNetwork: z.enum(STUDIO_PROJECT_NETWORKS).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

const workflowPatchSchema = z
  .object({
    phase: z.enum(STUDIO_PROJECT_PHASES).optional(),
    useCase: z.enum(STUDIO_PROJECT_USE_CASES).optional(),
    targetNetwork: z.enum(STUDIO_PROJECT_NETWORKS).optional(),
    checklist: z.record(z.string().min(1).max(80), z.boolean()).optional(),
    references: z
      .object({
        pinCid: z.string().trim().max(200).optional(),
        contractAddress: z.string().trim().max(100).optional(),
        liveRoomId: z.string().trim().max(200).optional(),
        releaseUrl: z.string().trim().url().max(1000).or(z.literal("")).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: "No workflow fields provided" });

const DEFAULT_STUDIO_WORKFLOW: StudioProjectWorkflow = {
  phase: "concept",
  useCase: "artwork",
  targetNetwork: "shadownet",
  checklist: {},
  references: {},
};

function normalizeStudioWorkflow(value: unknown): StudioProjectWorkflow {
  if (!value || typeof value !== "object") return { ...DEFAULT_STUDIO_WORKFLOW };
  const raw = value as Partial<StudioProjectWorkflow>;
  return {
    phase: STUDIO_PROJECT_PHASES.includes(raw.phase as any) ? raw.phase! : "concept",
    useCase: STUDIO_PROJECT_USE_CASES.includes(raw.useCase as any) ? raw.useCase! : "artwork",
    targetNetwork: STUDIO_PROJECT_NETWORKS.includes(raw.targetNetwork as any)
      ? raw.targetNetwork!
      : "shadownet",
    checklist: raw.checklist && typeof raw.checklist === "object" ? raw.checklist : {},
    references: raw.references && typeof raw.references === "object" ? raw.references : {},
    updatedAt: raw.updatedAt,
    updatedBy: raw.updatedBy,
  };
}

const updateProjectSchema = z
  .object({
    name: nameSchema.optional(),
    description: descriptionSchema.optional(),
    coverImageUrl: z
      .string()
      .trim()
      .url()
      .max(1000)
      .optional()
      .nullable(),
    archived: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "No fields provided",
  });

const inviteMemberSchema = z
  .object({
    userId: z.number().int().positive(),
    role: z.enum(STUDIO_MEMBER_ROLES).optional().default("editor"),
  })
  .strict();

const updateMemberSchema = z
  .object({
    role: z.enum(STUDIO_MEMBER_ROLES),
  })
  .strict();

const createFolderSchema = z
  .object({
    name: nameSchema,
    parentFolderId: z.number().int().positive().optional().nullable(),
    position: z.number().int().min(0).max(100_000).optional(),
  })
  .strict();

const updateFolderSchema = z
  .object({
    name: nameSchema.optional(),
    parentFolderId: z.number().int().positive().optional().nullable(),
    position: z.number().int().min(0).max(100_000).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "No fields provided",
  });

const userStatePatchSchema = z
  .object({
    lastOpenProjectId: z.number().int().positive().optional().nullable(),
    state: z.record(z.string(), z.any()).optional(),
  })
  .strict();

/* ── Helpers ────────────────────────────────────────────── */

function parseId(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function mapAccessError(
  err: unknown
): { status: number; body: { error: string } } {
  if (err instanceof StudioAccessError) {
    return { status: err.status, body: { error: err.message } };
  }
  return { status: 500, body: { error: "Studio operation failed" } };
}

async function loadProjectMembers(projectId: number) {
  return db
    .select({
      userId: studioProjectMembers.userId,
      role: studioProjectMembers.role,
      joinedAt: studioProjectMembers.joinedAt,
      lastOpenedAt: studioProjectMembers.lastOpenedAt,
      displayName: users.displayName,
      username: users.username,
      avatarUrl: users.avatarUrl,
    })
    .from(studioProjectMembers)
    .innerJoin(users, eq(studioProjectMembers.userId, users.id))
    .where(eq(studioProjectMembers.projectId, projectId))
    .orderBy(studioProjectMembers.joinedAt);
}

async function getUserNotifyableMemberIds(
  projectId: number,
  excludeUserId: number | null
): Promise<number[]> {
  const rows = await db
    .select({ userId: studioProjectMembers.userId })
    .from(studioProjectMembers)
    .where(eq(studioProjectMembers.projectId, projectId));
  return rows
    .map((r) => r.userId)
    .filter((id) => id !== excludeUserId);
}

async function writeStudioSystemMessage(
  conversationId: number,
  senderId: number,
  eventKey: string,
  body: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const now = new Date();
  await db.insert(dmMessages).values({
    conversationId,
    senderId,
    content: body,
    messageType: "studio_system",
    metadata: { eventKey, ...metadata },
  });
  await db
    .update(dmConversations)
    .set({ lastMessageAt: now, updatedAt: now })
    .where(eq(dmConversations.id, conversationId));
}

async function ensureConversationParticipant(
  conversationId: number,
  userId: number
): Promise<void> {
  const [existing] = await db
    .select({ id: dmConversationParticipants.id })
    .from(dmConversationParticipants)
    .where(
      and(
        eq(dmConversationParticipants.conversationId, conversationId),
        eq(dmConversationParticipants.userId, userId)
      )
    )
    .limit(1);
  if (existing) return;
  await db.insert(dmConversationParticipants).values({
    conversationId,
    userId,
    lastReadAt: null,
  });
}

async function removeConversationParticipant(
  conversationId: number,
  userId: number
): Promise<void> {
  await db
    .delete(dmConversationParticipants)
    .where(
      and(
        eq(dmConversationParticipants.conversationId, conversationId),
        eq(dmConversationParticipants.userId, userId)
      )
    );
}

/* ── Projects ───────────────────────────────────────────── */

router.get(
  "/api/studio/projects",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    try {
      const user = req.user as { id: number };

      const memberships = await db
        .select({
          projectId: studioProjectMembers.projectId,
          role: studioProjectMembers.role,
          joinedAt: studioProjectMembers.joinedAt,
          lastOpenedAt: studioProjectMembers.lastOpenedAt,
        })
        .from(studioProjectMembers)
        .where(eq(studioProjectMembers.userId, user.id));

      if (memberships.length === 0) {
        return res.json({ projects: [] });
      }

      const projectIds = memberships.map((m) => m.projectId);

      const projectRows = await db
        .select({
          id: studioProjects.id,
          name: studioProjects.name,
          description: studioProjects.description,
          ownerUserId: studioProjects.ownerUserId,
          coverImageUrl: studioProjects.coverImageUrl,
          storageBackend: studioProjects.storageBackend,
          storageQuotaBytes: studioProjects.storageQuotaBytes,
          storageUsedBytes: studioProjects.storageUsedBytes,
          archived: studioProjects.archived,
          conversationId: studioProjects.conversationId,
          workflow: studioProjects.workflow,
          updatedAt: studioProjects.updatedAt,
          ownerDisplayName: users.displayName,
        })
        .from(studioProjects)
        .leftJoin(users, eq(studioProjects.ownerUserId, users.id))
        .where(inArray(studioProjects.id, projectIds))
        .orderBy(desc(studioProjects.updatedAt));

      const [memberCounts, fileCounts, unresolvedCounts] = await Promise.all([
        db
          .select({
            projectId: studioProjectMembers.projectId,
            count: sql<number>`count(*)::int`,
          })
          .from(studioProjectMembers)
          .where(inArray(studioProjectMembers.projectId, projectIds))
          .groupBy(studioProjectMembers.projectId),
        db
          .select({
            projectId: studioFiles.projectId,
            count: sql<number>`count(*)::int`,
          })
          .from(studioFiles)
          .where(
            and(
              inArray(studioFiles.projectId, projectIds),
              isNull(studioFiles.deletedAt)
            )
          )
          .groupBy(studioFiles.projectId),
        db
          .select({
            projectId: studioFiles.projectId,
            count: sql<number>`count(*)::int`,
          })
          .from(studioAnnotations)
          .innerJoin(studioFiles, eq(studioAnnotations.fileId, studioFiles.id))
          .where(
            and(
              inArray(studioFiles.projectId, projectIds),
              eq(studioAnnotations.resolved, false),
              isNull(studioFiles.deletedAt)
            )
          )
          .groupBy(studioFiles.projectId),
      ]);

      const memberCountMap = new Map(
        memberCounts.map((r) => [r.projectId, r.count])
      );
      const fileCountMap = new Map(
        fileCounts.map((r) => [r.projectId, r.count])
      );
      const unresolvedMap = new Map(
        unresolvedCounts.map((r) => [r.projectId, r.count])
      );
      const membershipMap = new Map(memberships.map((m) => [m.projectId, m]));

      const projects = projectRows.map((p) => {
        const m = membershipMap.get(p.id);
        return {
          id: p.id,
          name: p.name,
          description: p.description,
          ownerUserId: p.ownerUserId,
          ownerDisplayName: p.ownerDisplayName ?? "Unknown",
          coverImageUrl: p.coverImageUrl,
          storageBackend: p.storageBackend as StudioStorageBackend,
          storageQuotaBytes: p.storageQuotaBytes,
          storageUsedBytes: p.storageUsedBytes,
          archived: p.archived,
          conversationId: p.conversationId,
          workflow: normalizeStudioWorkflow(p.workflow),
          memberCount: memberCountMap.get(p.id) ?? 0,
          fileCount: fileCountMap.get(p.id) ?? 0,
          unreadMessages: 0,
          unresolvedAnnotations: unresolvedMap.get(p.id) ?? 0,
          updatedAt: p.updatedAt.toISOString(),
          role: (m?.role as StudioMemberRole) ?? "viewer",
          lastOpenedAt: m?.lastOpenedAt?.toISOString() ?? null,
        };
      });

      res.json({ projects });
    } catch (err) {
      console.error("[studio] list projects failed:", err);
      res.status(500).json({ error: "Failed to list Studio projects" });
    }
  }
);

router.post(
  "/api/studio/projects",
  isAuthenticated,
  requirePermission("create_studio_projects"),
  async (req, res) => {
    const parsed = createProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid project payload" });
    }
    const user = req.user as { id: number; role: string };
    const {
      name,
      description,
      storageBackend: requestedBackend,
      invites,
      workflow: requestedWorkflow,
    } = parsed.data;

    // Resolve the backend + any sticky storage_context bits (the main
    // one being `gdriveOwner` for Shape-C hybrid: if the creator has a
    // personal Drive connected we pin the project to their account; if
    // not, we fall back to the platform pool, then local disk).  An
    // explicit `storageBackend` in the request overrides auto-pick but
    // loses the hybrid routing — useful for tests / admin tooling.
    let storageBackend: StudioStorageBackend;
    let storageContext: Record<string, unknown>;
    if (requestedBackend) {
      storageBackend = requestedBackend;
      storageContext = {};
    } else {
      const choice = await chooseDefaultBackend(user.id);
      storageBackend = choice.backend;
      storageContext = choice.storageContext;
    }

    if (storageBackend === "google_drive") {
      const drv = getDriver("google_drive");
      const ready = await drv.isReady({
        projectId: 0,
        ownerUserId: user.id,
        backend: "google_drive",
        config: storageContext,
      });
      if (!ready) {
        const hint =
          typeof storageContext.gdriveOwner === "number"
            ? "Reconnect your Google Drive from Studio → Your Drive."
            : "An admin must complete the platform Drive OAuth setup first (Admin panel → Studio tab).";
        return res.status(400).json({
          error: `Google Drive backend is not yet available — ${hint}`,
        });
      }
    }

    try {
      const { project } = await db.transaction(async (tx) => {
        const [conversation] = await tx
          .insert(dmConversations)
          .values({
            createdBy: user.id,
            active: true,
            conversationType: "studio",
            title: name,
            lastMessageAt: new Date(),
          })
          .returning({
            id: dmConversations.id,
          });

        const quota = defaultQuotaBytes(storageBackend);

        const [inserted] = await tx
          .insert(studioProjects)
          .values({
            name,
            description,
            ownerUserId: user.id,
            storageBackend,
            storageContext,
            storageQuotaBytes: quota,
            storageUsedBytes: 0,
            conversationId: conversation.id,
            workflow: {
              ...DEFAULT_STUDIO_WORKFLOW,
              useCase: requestedWorkflow?.useCase ?? DEFAULT_STUDIO_WORKFLOW.useCase,
              targetNetwork:
                requestedWorkflow?.targetNetwork ?? DEFAULT_STUDIO_WORKFLOW.targetNetwork,
              updatedAt: new Date().toISOString(),
              updatedBy: user.id,
            },
          })
          .returning();

        await tx
          .update(dmConversations)
          .set({ studioProjectId: inserted.id })
          .where(eq(dmConversations.id, conversation.id));

        await tx.insert(studioProjectMembers).values({
          projectId: inserted.id,
          userId: user.id,
          role: "owner",
          invitedBy: user.id,
        });

        await tx.insert(dmConversationParticipants).values({
          conversationId: conversation.id,
          userId: user.id,
          lastReadAt: new Date(),
        });

        const inviteUserIds = invites.map((i) => i.userId).filter((id) => id !== user.id);
        if (inviteUserIds.length > 0) {
          const existing = await tx
            .select({ id: users.id })
            .from(users)
            .where(inArray(users.id, inviteUserIds));
          const validIds = new Set(existing.map((r) => r.id));
          const validInvites = invites.filter(
            (i) => validIds.has(i.userId) && i.userId !== user.id
          );

          if (validInvites.length > 0) {
            await tx.insert(studioProjectMembers).values(
              validInvites.map((i) => ({
                projectId: inserted.id,
                userId: i.userId,
                role: (i.role === "owner" ? "editor" : i.role) as StudioMemberRole,
                invitedBy: user.id,
              }))
            );

            await tx.insert(dmConversationParticipants).values(
              validInvites.map((i) => ({
                conversationId: conversation.id,
                userId: i.userId,
                lastReadAt: null,
              }))
            );
          }
        }

        await tx.insert(dmMessages).values({
          conversationId: conversation.id,
          senderId: user.id,
          content: `Project "${name}" created.`,
          messageType: "studio_system",
          metadata: {
            eventKey: "studio.project_created",
            studioProjectId: inserted.id,
          },
        });

        return { project: inserted };
      });

      // Notify invitees outside the transaction so notification prefs
      // lookups don't lengthen the write lock.
      const inviteUserIds = invites
        .map((i) => i.userId)
        .filter((id) => id !== user.id);
      if (inviteUserIds.length > 0) {
        await createNotificationsForUsers(inviteUserIds, {
          sourceUserId: user.id,
          eventKey: "studio.member_joined",
          title: "Added to a Studio project",
          body: `You were added to "${name}" on Studio.`,
          metadata: {
            studioProjectId: project.id,
            conversationId: project.conversationId,
          },
        });
      }

      res.status(201).json({
        id: project.id,
        name: project.name,
        description: project.description,
        ownerUserId: project.ownerUserId,
        storageBackend: project.storageBackend,
        storageQuotaBytes: project.storageQuotaBytes,
        storageUsedBytes: project.storageUsedBytes,
        conversationId: project.conversationId,
        archived: project.archived,
        workflow: normalizeStudioWorkflow(project.workflow),
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
        role: "owner" as StudioMemberRole,
      });
    } catch (err) {
      console.error("[studio] create project failed:", err);
      res.status(500).json({ error: "Failed to create Studio project" });
    }
  }
);

router.get(
  "/api/studio/projects/:id",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    const projectId = parseId(req.params.id);
    if (!projectId) return res.status(400).json({ error: "Invalid project id" });
    const user = req.user as { id: number; role: string };

    try {
      const access = await resolveStudioAccess(projectId, {
        id: user.id,
        role: user.role as any,
      });
      if (!access) {
        return res.status(404).json({ error: "Project not found" });
      }

      const [members, folders, files, state] = await Promise.all([
        loadProjectMembers(projectId),
        db
          .select()
          .from(studioFolders)
          .where(eq(studioFolders.projectId, projectId))
          .orderBy(studioFolders.position, studioFolders.id),
        db
          .select({
            id: studioFiles.id,
            folderId: studioFiles.folderId,
            name: studioFiles.name,
            mimeType: studioFiles.mimeType,
            sizeBytes: studioFiles.sizeBytes,
            thumbnailUri: studioFiles.thumbnailUri,
            previewUri: studioFiles.previewUri,
            currentVersion: studioFiles.currentVersion,
            uploaderId: studioFiles.uploaderId,
            metadata: studioFiles.metadata,
            position: studioFiles.position,
            updatedAt: studioFiles.updatedAt,
            uploaderName: users.displayName,
          })
          .from(studioFiles)
          .leftJoin(users, eq(studioFiles.uploaderId, users.id))
          .where(
            and(
              eq(studioFiles.projectId, projectId),
              isNull(studioFiles.deletedAt)
            )
          )
          .orderBy(studioFiles.position, studioFiles.id),
        db
          .select()
          .from(studioUserState)
          .where(eq(studioUserState.userId, user.id))
          .limit(1),
      ]);

      // Touch last-opened tracker.
      await db
        .update(studioProjectMembers)
        .set({ lastOpenedAt: new Date() })
        .where(
          and(
            eq(studioProjectMembers.projectId, projectId),
            eq(studioProjectMembers.userId, user.id)
          )
        );

      res.json({
        project: {
          id: access.project.id,
          name: access.project.name,
          description: access.project.description,
          ownerUserId: access.project.ownerUserId,
          coverImageUrl: access.project.coverImageUrl,
          storageBackend: access.project.storageBackend,
          storageContext: access.project.storageContext,
          storageQuotaBytes: access.project.storageQuotaBytes,
          storageUsedBytes: access.project.storageUsedBytes,
          conversationId: access.project.conversationId,
          workflow: normalizeStudioWorkflow(access.project.workflow),
          archived: access.project.archived,
          createdAt: access.project.createdAt.toISOString(),
          updatedAt: access.project.updatedAt.toISOString(),
        },
        role: access.role,
        isPlatformModerator: access.isPlatformModerator,
        members: members.map((m) => ({
          userId: m.userId,
          role: m.role,
          displayName: m.displayName,
          username: m.username,
          avatarUrl: m.avatarUrl,
          joinedAt: m.joinedAt.toISOString(),
          lastOpenedAt: m.lastOpenedAt?.toISOString() ?? null,
        })),
        folders: folders.map((f) => ({
          id: f.id,
          name: f.name,
          parentFolderId: f.parentFolderId,
          position: f.position,
        })),
        files: files.map((f) => ({
          id: f.id,
          folderId: f.folderId,
          name: f.name,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
          previewUrl: f.previewUri ? `/api/studio/files/${f.id}/preview` : null,
          thumbnailUrl: f.thumbnailUri ? `/api/studio/files/${f.id}/thumbnail` : null,
          currentVersion: f.currentVersion,
          uploaderId: f.uploaderId,
          uploaderDisplayName: f.uploaderName ?? null,
          metadata: f.metadata,
          position: f.position,
          updatedAt: f.updatedAt.toISOString(),
        })),
        userState: state[0]
          ? {
              lastOpenProjectId: state[0].lastOpenProjectId,
              state: state[0].state,
              updatedAt: state[0].updatedAt.toISOString(),
            }
          : null,
      });
    } catch (err) {
      console.error("[studio] load project failed:", err);
      res.status(500).json({ error: "Failed to load Studio project" });
    }
  }
);

router.patch(
  "/api/studio/projects/:id/workflow",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    const projectId = parseId(req.params.id);
    if (!projectId) return res.status(400).json({ error: "Invalid project id" });
    const parsed = workflowPatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid workflow payload" });
    const user = req.user as { id: number; role: string };

    try {
      const access = await requireStudioAccess(
        projectId,
        { id: user.id, role: user.role as any },
        (resolved) => studioRoleCanEditFiles(resolved.role),
        "update project workflow"
      );
      const current = normalizeStudioWorkflow(access.project.workflow);
      const next: StudioProjectWorkflow = {
        ...current,
        ...parsed.data,
        checklist: { ...current.checklist, ...(parsed.data.checklist ?? {}) },
        references: { ...current.references, ...(parsed.data.references ?? {}) },
        updatedAt: new Date().toISOString(),
        updatedBy: user.id,
      };
      const [updated] = await db
        .update(studioProjects)
        .set({ workflow: next, updatedAt: new Date() })
        .where(eq(studioProjects.id, projectId))
        .returning({ workflow: studioProjects.workflow, updatedAt: studioProjects.updatedAt });

      if (access.project.conversationId != null) {
        await writeStudioSystemMessage(
          access.project.conversationId,
          user.id,
          "studio.workflow_updated",
          `Project runway updated: ${next.phase} on ${next.targetNetwork}.`,
          { studioProjectId: projectId, phase: next.phase, targetNetwork: next.targetNetwork }
        );
      }
      broadcastStudioEvent(projectId, "studio_workflow_updated", {
        workflow: next,
        updatedAt: updated.updatedAt.toISOString(),
      });
      res.json({ workflow: normalizeStudioWorkflow(updated.workflow) });
    } catch (err) {
      const { status, body } = mapAccessError(err);
      if (status === 500) console.error("[studio] workflow update failed:", err);
      res.status(status).json(body);
    }
  }
);

router.patch(
  "/api/studio/projects/:id",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    const projectId = parseId(req.params.id);
    if (!projectId) return res.status(400).json({ error: "Invalid project id" });
    const parsed = updateProjectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid update payload" });
    }
    const user = req.user as { id: number; role: string };

    try {
      const access = await requireStudioAccess(
        projectId,
        { id: user.id, role: user.role as any },
        canManageProject,
        "manage project"
      );

      const patch: Partial<typeof studioProjects.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (parsed.data.name !== undefined) patch.name = parsed.data.name;
      if (parsed.data.description !== undefined)
        patch.description = parsed.data.description;
      if (parsed.data.coverImageUrl !== undefined)
        patch.coverImageUrl = parsed.data.coverImageUrl;
      if (parsed.data.archived !== undefined)
        patch.archived = parsed.data.archived;

      const [updated] = await db
        .update(studioProjects)
        .set(patch)
        .where(eq(studioProjects.id, projectId))
        .returning();

      if (
        parsed.data.name !== undefined &&
        access.project.conversationId != null
      ) {
        await db
          .update(dmConversations)
          .set({ title: parsed.data.name, updatedAt: new Date() })
          .where(eq(dmConversations.id, access.project.conversationId));
      }

      if (
        parsed.data.archived === true &&
        access.project.conversationId != null
      ) {
        await writeStudioSystemMessage(
          access.project.conversationId,
          user.id,
          "studio.project_archived",
          `Project "${updated.name}" archived.`,
          { studioProjectId: projectId }
        );
      }

      broadcastStudioEvent(projectId, "studio_project_updated", {
        id: updated.id,
        name: updated.name,
        description: updated.description,
        coverImageUrl: updated.coverImageUrl,
        archived: updated.archived,
        updatedAt: updated.updatedAt.toISOString(),
      });

      res.json({
        id: updated.id,
        name: updated.name,
        description: updated.description,
        coverImageUrl: updated.coverImageUrl,
        archived: updated.archived,
        updatedAt: updated.updatedAt.toISOString(),
      });
    } catch (err) {
      const { status, body } = mapAccessError(err);
      if (status === 500) {
        console.error("[studio] update project failed:", err);
      }
      res.status(status).json(body);
    }
  }
);

router.delete(
  "/api/studio/projects/:id",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    const projectId = parseId(req.params.id);
    if (!projectId) return res.status(400).json({ error: "Invalid project id" });
    const user = req.user as { id: number; role: string };

    try {
      await requireStudioAccess(
        projectId,
        { id: user.id, role: user.role as any },
        canManageProject,
        "delete project"
      );

      // Hard delete via cascade — files, folders, members, annotations all
      // drop with the project.  Drive-hosted blobs remain orphaned until
      // the user removes them; disk blobs stay on disk until cleanup.
      // A scheduled reconciliation job can purge them later.
      broadcastStudioEvent(projectId, "studio_project_deleted", {
        id: projectId,
      });
      await db.delete(studioProjects).where(eq(studioProjects.id, projectId));
      res.status(204).end();
    } catch (err) {
      const { status, body } = mapAccessError(err);
      if (status === 500) {
        console.error("[studio] delete project failed:", err);
      }
      res.status(status).json(body);
    }
  }
);

/* ── Members ────────────────────────────────────────────── */

router.post(
  "/api/studio/projects/:id/members",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    const projectId = parseId(req.params.id);
    if (!projectId) return res.status(400).json({ error: "Invalid project id" });
    const parsed = inviteMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid invite payload" });
    }
    const user = req.user as { id: number; role: string };

    try {
      const access = await requireStudioAccess(
        projectId,
        { id: user.id, role: user.role as any },
        canInvite,
        "invite members"
      );

      // Only owners may add new owners / demote others — regular editors
      // can invite editor/commenter/viewer roles.
      const targetRole = parsed.data.role;
      if (
        !studioRoleCanManageProject(access.role) &&
        (targetRole === "owner")
      ) {
        return res
          .status(403)
          .json({ error: "Only owners can assign the Owner role" });
      }

      if (parsed.data.userId === user.id) {
        return res.status(400).json({ error: "Cannot invite yourself" });
      }

      const [targetUser] = await db
        .select({
          id: users.id,
          displayName: users.displayName,
          role: users.role,
        })
        .from(users)
        .where(eq(users.id, parsed.data.userId))
        .limit(1);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const [existing] = await db
        .select({ id: studioProjectMembers.id })
        .from(studioProjectMembers)
        .where(
          and(
            eq(studioProjectMembers.projectId, projectId),
            eq(studioProjectMembers.userId, parsed.data.userId)
          )
        )
        .limit(1);
      if (existing) {
        return res
          .status(409)
          .json({ error: "User is already a member of this project" });
      }

      await db.insert(studioProjectMembers).values({
        projectId,
        userId: parsed.data.userId,
        role: targetRole,
        invitedBy: user.id,
      });

      if (access.project.conversationId != null) {
        await ensureConversationParticipant(
          access.project.conversationId,
          parsed.data.userId
        );
        await writeStudioSystemMessage(
          access.project.conversationId,
          user.id,
          "studio.member_joined",
          `${targetUser.displayName ?? "A collaborator"} joined the project as ${STUDIO_MEMBER_ROLE_LABELS[targetRole]}.`,
          { studioProjectId: projectId, memberUserId: parsed.data.userId }
        );
      }

      await createNotificationsForUsers([parsed.data.userId], {
        sourceUserId: user.id,
        eventKey: "studio.member_joined",
        title: "Added to a Studio project",
        body: `You were added to "${access.project.name}" on Studio.`,
        metadata: {
          studioProjectId: projectId,
          conversationId: access.project.conversationId,
        },
      });

      broadcastStudioEvent(projectId, "studio_member_joined", {
        userId: parsed.data.userId,
        role: targetRole,
        displayName: targetUser.displayName ?? null,
      });

      res.status(201).json({
        userId: parsed.data.userId,
        role: targetRole,
      });
    } catch (err) {
      const { status, body } = mapAccessError(err);
      if (status === 500) console.error("[studio] invite failed:", err);
      res.status(status).json(body);
    }
  }
);

router.patch(
  "/api/studio/projects/:id/members/:userId",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    const projectId = parseId(req.params.id);
    const targetUserId = parseId(req.params.userId);
    if (!projectId || !targetUserId) {
      return res.status(400).json({ error: "Invalid ids" });
    }
    const parsed = updateMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid role payload" });
    }
    const user = req.user as { id: number; role: string };

    try {
      const access = await requireStudioAccess(
        projectId,
        { id: user.id, role: user.role as any },
        canManageProject,
        "change member roles"
      );

      if (targetUserId === access.project.ownerUserId) {
        return res.status(400).json({ error: "Cannot change the owner's role" });
      }

      const [updated] = await db
        .update(studioProjectMembers)
        .set({ role: parsed.data.role })
        .where(
          and(
            eq(studioProjectMembers.projectId, projectId),
            eq(studioProjectMembers.userId, targetUserId)
          )
        )
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Member not found" });
      }

      if (access.project.conversationId != null) {
        await writeStudioSystemMessage(
          access.project.conversationId,
          user.id,
          "studio.member_role_changed",
          `Role updated to ${STUDIO_MEMBER_ROLE_LABELS[parsed.data.role]}.`,
          {
            studioProjectId: projectId,
            memberUserId: targetUserId,
            role: parsed.data.role,
          }
        );
      }

      await createNotificationsForUsers([targetUserId], {
        sourceUserId: user.id,
        eventKey: "studio.member_role_changed",
        title: "Your Studio role changed",
        body: `You are now ${STUDIO_MEMBER_ROLE_LABELS[parsed.data.role]} in "${access.project.name}".`,
        metadata: {
          studioProjectId: projectId,
          conversationId: access.project.conversationId,
          role: parsed.data.role,
        },
      });

      broadcastStudioEvent(projectId, "studio_member_role_changed", {
        userId: targetUserId,
        role: parsed.data.role,
      });

      res.json({
        userId: targetUserId,
        role: parsed.data.role,
      });
    } catch (err) {
      const { status, body } = mapAccessError(err);
      if (status === 500) console.error("[studio] update member failed:", err);
      res.status(status).json(body);
    }
  }
);

router.delete(
  "/api/studio/projects/:id/members/:userId",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    const projectId = parseId(req.params.id);
    const targetUserId = parseId(req.params.userId);
    if (!projectId || !targetUserId) {
      return res.status(400).json({ error: "Invalid ids" });
    }
    const user = req.user as { id: number; role: string };

    try {
      const access = await resolveStudioAccess(projectId, {
        id: user.id,
        role: user.role as any,
      });
      if (!access) {
        return res.status(404).json({ error: "Project not found" });
      }

      const selfLeave = targetUserId === user.id;
      if (!selfLeave && !canManageProject(access)) {
        return res
          .status(403)
          .json({ error: "Only owners can remove members" });
      }
      if (targetUserId === access.project.ownerUserId) {
        return res.status(400).json({ error: "Cannot remove the owner" });
      }

      const deleted = await db
        .delete(studioProjectMembers)
        .where(
          and(
            eq(studioProjectMembers.projectId, projectId),
            eq(studioProjectMembers.userId, targetUserId)
          )
        )
        .returning({ id: studioProjectMembers.id });

      if (deleted.length === 0) {
        return res.status(404).json({ error: "Member not found" });
      }

      if (access.project.conversationId != null) {
        await removeConversationParticipant(
          access.project.conversationId,
          targetUserId
        );
        await writeStudioSystemMessage(
          access.project.conversationId,
          user.id,
          "studio.member_left",
          selfLeave
            ? "A collaborator left the project."
            : "A collaborator was removed from the project.",
          {
            studioProjectId: projectId,
            memberUserId: targetUserId,
            selfLeave,
          }
        );
      }

      broadcastStudioEvent(projectId, "studio_member_removed", {
        userId: targetUserId,
        selfLeave,
      });

      res.status(204).end();
    } catch (err) {
      console.error("[studio] remove member failed:", err);
      res.status(500).json({ error: "Failed to remove member" });
    }
  }
);

/* ── Folders ────────────────────────────────────────────── */

router.post(
  "/api/studio/projects/:id/folders",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    const projectId = parseId(req.params.id);
    if (!projectId) return res.status(400).json({ error: "Invalid project id" });
    const parsed = createFolderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid folder payload" });
    }
    const user = req.user as { id: number; role: string };

    try {
      const access = await requireStudioAccess(
        projectId,
        { id: user.id, role: user.role as any },
        (a) => studioRoleCanEditFiles(a.role),
        "create folders"
      );

      let parentFolderId: number | null = parsed.data.parentFolderId ?? null;
      if (parentFolderId != null) {
        const [parent] = await db
          .select({ id: studioFolders.id, projectId: studioFolders.projectId })
          .from(studioFolders)
          .where(eq(studioFolders.id, parentFolderId))
          .limit(1);
        if (!parent || parent.projectId !== projectId) {
          return res.status(400).json({ error: "Invalid parent folder" });
        }
      }

      const [folder] = await db
        .insert(studioFolders)
        .values({
          projectId,
          parentFolderId,
          name: parsed.data.name,
          position: parsed.data.position ?? 0,
          createdBy: user.id,
        })
        .returning();

      if (access.project.conversationId != null) {
        await writeStudioSystemMessage(
          access.project.conversationId,
          user.id,
          "studio.folder_created",
          `Folder "${folder.name}" created.`,
          { studioProjectId: projectId, folderId: folder.id }
        );
      }

      broadcastStudioEvent(projectId, "studio_folder_created", {
        id: folder.id,
        name: folder.name,
        parentFolderId: folder.parentFolderId,
        position: folder.position,
      });

      res.status(201).json({
        id: folder.id,
        name: folder.name,
        parentFolderId: folder.parentFolderId,
        position: folder.position,
      });
    } catch (err) {
      const { status, body } = mapAccessError(err);
      if (status === 500) console.error("[studio] create folder failed:", err);
      res.status(status).json(body);
    }
  }
);

router.patch(
  "/api/studio/folders/:id",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    const folderId = parseId(req.params.id);
    if (!folderId) return res.status(400).json({ error: "Invalid folder id" });
    const parsed = updateFolderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid update payload" });
    }
    const user = req.user as { id: number; role: string };

    try {
      const [folder] = await db
        .select()
        .from(studioFolders)
        .where(eq(studioFolders.id, folderId))
        .limit(1);
      if (!folder) {
        return res.status(404).json({ error: "Folder not found" });
      }

      const access = await requireStudioAccess(
        folder.projectId,
        { id: user.id, role: user.role as any },
        (a) => studioRoleCanEditFiles(a.role),
        "rename folders"
      );

      if (
        parsed.data.parentFolderId !== undefined &&
        parsed.data.parentFolderId !== null
      ) {
        if (parsed.data.parentFolderId === folderId) {
          return res
            .status(400)
            .json({ error: "Folder cannot be its own parent" });
        }
        const [parent] = await db
          .select({ id: studioFolders.id, projectId: studioFolders.projectId })
          .from(studioFolders)
          .where(eq(studioFolders.id, parsed.data.parentFolderId))
          .limit(1);
        if (!parent || parent.projectId !== folder.projectId) {
          return res
            .status(400)
            .json({ error: "Invalid parent folder" });
        }
      }

      const patch: Partial<typeof studioFolders.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (parsed.data.name !== undefined) patch.name = parsed.data.name;
      if (parsed.data.parentFolderId !== undefined)
        patch.parentFolderId = parsed.data.parentFolderId;
      if (parsed.data.position !== undefined)
        patch.position = parsed.data.position;

      const [updated] = await db
        .update(studioFolders)
        .set(patch)
        .where(eq(studioFolders.id, folderId))
        .returning();

      if (parsed.data.name !== undefined && access.project.conversationId != null) {
        await writeStudioSystemMessage(
          access.project.conversationId,
          user.id,
          "studio.folder_renamed",
          `Folder renamed to "${updated.name}".`,
          { studioProjectId: folder.projectId, folderId }
        );
      }

      broadcastStudioEvent(folder.projectId, "studio_folder_updated", {
        id: updated.id,
        name: updated.name,
        parentFolderId: updated.parentFolderId,
        position: updated.position,
      });

      res.json({
        id: updated.id,
        name: updated.name,
        parentFolderId: updated.parentFolderId,
        position: updated.position,
      });
    } catch (err) {
      const { status, body } = mapAccessError(err);
      if (status === 500) console.error("[studio] update folder failed:", err);
      res.status(status).json(body);
    }
  }
);

router.delete(
  "/api/studio/folders/:id",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    const folderId = parseId(req.params.id);
    if (!folderId) return res.status(400).json({ error: "Invalid folder id" });
    const user = req.user as { id: number; role: string };

    try {
      const [folder] = await db
        .select()
        .from(studioFolders)
        .where(eq(studioFolders.id, folderId))
        .limit(1);
      if (!folder) {
        return res.status(404).json({ error: "Folder not found" });
      }

      await requireStudioAccess(
        folder.projectId,
        { id: user.id, role: user.role as any },
        (a) => studioRoleCanEditFiles(a.role),
        "delete folders"
      );

      // Soft-unmoor files in this folder (set folderId to null) before
      // deleting so nothing is dropped unintentionally.  A future route
      // supports "delete folder + all files inside" as a distinct action.
      await db
        .update(studioFiles)
        .set({ folderId: null, updatedAt: new Date() })
        .where(eq(studioFiles.folderId, folderId));

      await db
        .update(studioFolders)
        .set({ parentFolderId: null, updatedAt: new Date() })
        .where(eq(studioFolders.parentFolderId, folderId));

      await db.delete(studioFolders).where(eq(studioFolders.id, folderId));

      broadcastStudioEvent(folder.projectId, "studio_folder_deleted", {
        id: folderId,
      });

      res.status(204).end();
    } catch (err) {
      const { status, body } = mapAccessError(err);
      if (status === 500) console.error("[studio] delete folder failed:", err);
      res.status(status).json(body);
    }
  }
);

/* ── User state (sticky panel widths, last file, etc.) ─── */

router.get(
  "/api/studio/user-state",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    const user = req.user as { id: number };
    try {
      const [row] = await db
        .select()
        .from(studioUserState)
        .where(eq(studioUserState.userId, user.id))
        .limit(1);
      if (!row) {
        return res.json({
          lastOpenProjectId: null,
          state: {},
          updatedAt: null,
        });
      }
      res.json({
        lastOpenProjectId: row.lastOpenProjectId,
        state: row.state,
        updatedAt: row.updatedAt.toISOString(),
      });
    } catch (err) {
      console.error("[studio] load user state failed:", err);
      res.status(500).json({ error: "Failed to load user state" });
    }
  }
);

router.patch(
  "/api/studio/user-state",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    const parsed = userStatePatchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid user-state payload" });
    }
    const user = req.user as { id: number };

    try {
      // Upsert; keep other fields untouched on partial update.
      await db
        .insert(studioUserState)
        .values({
          userId: user.id,
          lastOpenProjectId: parsed.data.lastOpenProjectId ?? null,
          state: parsed.data.state ?? {},
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: studioUserState.userId,
          set: {
            ...(parsed.data.lastOpenProjectId !== undefined
              ? { lastOpenProjectId: parsed.data.lastOpenProjectId }
              : {}),
            ...(parsed.data.state !== undefined
              ? { state: parsed.data.state }
              : {}),
            updatedAt: new Date(),
          },
        });

      res.status(204).end();
    } catch (err) {
      console.error("[studio] update user state failed:", err);
      res.status(500).json({ error: "Failed to update user state" });
    }
  }
);

/* ── Export ─────────────────────────────────────────────── */

export default router;

// Suppress unused symbol warnings if the builder decides not to use them.
void studioRoleCanInvite;
