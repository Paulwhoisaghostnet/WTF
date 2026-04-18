/**
 * Studio — annotations + threaded comments.
 *
 * Annotations are lightweight overlays anchored in normalized (0-1)
 * coordinates against the preview asset so they survive any display
 * size.  Threaded comments hang off each annotation so feedback stays
 * with the mark.
 */

import { Router } from "express";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import {
  dmConversations,
  dmMessages,
  studioAnnotationComments,
  studioAnnotations,
  studioFiles,
  users,
} from "@shared/schema";
import {
  STUDIO_ANNOTATION_KINDS,
  type StudioAnnotationKind,
} from "@shared/types";
import { isAuthenticated, requirePermission } from "../auth/passport";
import {
  StudioAccess,
  StudioAccessError,
  canAnnotate,
  canChat,
  requireStudioAccess,
} from "../lib/studio/access";
import { broadcastStudioEvent } from "../websocket";

const router = Router();

const annotationDataSchema = z.record(z.string(), z.any());

const createAnnotationSchema = z
  .object({
    kind: z.enum(STUDIO_ANNOTATION_KINDS),
    pageOrFrame: z.number().int().optional().nullable(),
    data: annotationDataSchema.default({}),
    fileVersion: z.number().int().min(1).optional(),
  })
  .strict();

const updateAnnotationSchema = z
  .object({
    data: annotationDataSchema.optional(),
    resolved: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, {
    message: "No fields provided",
  });

const commentSchema = z
  .object({
    body: z.string().trim().min(1).max(5000),
  })
  .strict();

function parseId(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function mapAccessError(
  err: unknown
): { status: number; body: { error: string } } {
  if (err instanceof StudioAccessError) {
    return { status: err.status, body: { error: err.message } };
  }
  return { status: 500, body: { error: "Studio annotation operation failed" } };
}

async function loadFileAndRequireAccess(
  user: { id: number; role: string },
  fileId: number,
  capability: (access: StudioAccess) => boolean,
  capabilityLabel: string
) {
  const [file] = await db
    .select()
    .from(studioFiles)
    .where(eq(studioFiles.id, fileId))
    .limit(1);
  if (!file || file.deletedAt) {
    throw new StudioAccessError(404, "File not found");
  }
  const access = await requireStudioAccess(
    file.projectId,
    { id: user.id, role: user.role as any },
    capability,
    capabilityLabel
  );
  return { file, access };
}

/* ── List annotations for a file ───────────────────────── */

router.get(
  "/api/studio/files/:id/annotations",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    const fileId = parseId(req.params.id);
    if (!fileId) return res.status(400).json({ error: "Invalid file id" });
    const user = req.user as { id: number; role: string };
    try {
      const { file } = await loadFileAndRequireAccess(
        user,
        fileId,
        () => true,
        "view annotations"
      );

      const annotations = await db
        .select({
          id: studioAnnotations.id,
          fileId: studioAnnotations.fileId,
          fileVersion: studioAnnotations.fileVersion,
          authorId: studioAnnotations.authorId,
          authorDisplayName: users.displayName,
          kind: studioAnnotations.kind,
          pageOrFrame: studioAnnotations.pageOrFrame,
          data: studioAnnotations.data,
          resolved: studioAnnotations.resolved,
          resolvedBy: studioAnnotations.resolvedBy,
          resolvedAt: studioAnnotations.resolvedAt,
          createdAt: studioAnnotations.createdAt,
          updatedAt: studioAnnotations.updatedAt,
        })
        .from(studioAnnotations)
        .leftJoin(users, eq(studioAnnotations.authorId, users.id))
        .where(eq(studioAnnotations.fileId, fileId))
        .orderBy(asc(studioAnnotations.createdAt));

      const annotationIds = annotations.map((a) => a.id);
      const comments = annotationIds.length
        ? await db
            .select({
              id: studioAnnotationComments.id,
              annotationId: studioAnnotationComments.annotationId,
              authorId: studioAnnotationComments.authorId,
              authorDisplayName: users.displayName,
              body: studioAnnotationComments.body,
              createdAt: studioAnnotationComments.createdAt,
              editedAt: studioAnnotationComments.editedAt,
            })
            .from(studioAnnotationComments)
            .leftJoin(users, eq(studioAnnotationComments.authorId, users.id))
            .where(inArray(studioAnnotationComments.annotationId, annotationIds))
            .orderBy(asc(studioAnnotationComments.createdAt))
        : [];

      const commentMap = new Map<number, typeof comments>();
      for (const c of comments) {
        const arr = commentMap.get(c.annotationId) ?? [];
        arr.push(c);
        commentMap.set(c.annotationId, arr);
      }

      res.json({
        fileId: file.id,
        annotations: annotations.map((a) => ({
          id: a.id,
          fileVersion: a.fileVersion,
          authorId: a.authorId,
          authorDisplayName: a.authorDisplayName,
          kind: a.kind,
          pageOrFrame: a.pageOrFrame,
          data: a.data,
          resolved: a.resolved,
          resolvedBy: a.resolvedBy,
          resolvedAt: a.resolvedAt?.toISOString() ?? null,
          createdAt: a.createdAt.toISOString(),
          updatedAt: a.updatedAt.toISOString(),
          comments: (commentMap.get(a.id) ?? []).map((c) => ({
            id: c.id,
            authorId: c.authorId,
            authorDisplayName: c.authorDisplayName,
            body: c.body,
            createdAt: c.createdAt.toISOString(),
            editedAt: c.editedAt?.toISOString() ?? null,
          })),
        })),
      });
    } catch (err) {
      const { status, body } = mapAccessError(err);
      if (status === 500) console.error("[studio] list annotations failed:", err);
      res.status(status).json(body);
    }
  }
);

/* ── Create annotation ─────────────────────────────────── */

router.post(
  "/api/studio/files/:id/annotations",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    const fileId = parseId(req.params.id);
    if (!fileId) return res.status(400).json({ error: "Invalid file id" });
    const parsed = createAnnotationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid annotation payload" });
    }
    const user = req.user as { id: number; role: string };

    try {
      const { file, access } = await loadFileAndRequireAccess(
        user,
        fileId,
        canAnnotate,
        "annotate files"
      );

      const [created] = await db
        .insert(studioAnnotations)
        .values({
          fileId,
          fileVersion: parsed.data.fileVersion ?? file.currentVersion,
          authorId: user.id,
          kind: parsed.data.kind as StudioAnnotationKind,
          pageOrFrame: parsed.data.pageOrFrame ?? null,
          data: parsed.data.data,
          resolved: false,
        })
        .returning();

      if (access.project.conversationId != null) {
        await db.insert(dmMessages).values({
          conversationId: access.project.conversationId,
          senderId: user.id,
          content: `Note added to "${file.name}".`,
          messageType: "studio_system",
          metadata: {
            eventKey: "studio.annotation_added",
            studioProjectId: file.projectId,
            studioFileId: fileId,
            studioAnnotationId: created.id,
            kind: created.kind,
          },
        });
        await db
          .update(dmConversations)
          .set({ lastMessageAt: new Date(), updatedAt: new Date() })
          .where(eq(dmConversations.id, access.project.conversationId));
      }

      broadcastStudioEvent(file.projectId, "studio_annotation_added", {
        fileId,
        annotationId: created.id,
        kind: created.kind,
        pageOrFrame: created.pageOrFrame,
        data: created.data,
        authorId: user.id,
        createdAt: created.createdAt.toISOString(),
      });

      res.status(201).json({
        id: created.id,
        fileId: created.fileId,
        fileVersion: created.fileVersion,
        authorId: created.authorId,
        kind: created.kind,
        pageOrFrame: created.pageOrFrame,
        data: created.data,
        resolved: created.resolved,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
        comments: [],
      });
    } catch (err) {
      const { status, body } = mapAccessError(err);
      if (status === 500) console.error("[studio] create annotation failed:", err);
      res.status(status).json(body);
    }
  }
);

/* ── Update / resolve annotation ───────────────────────── */

router.patch(
  "/api/studio/annotations/:id",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    const annotationId = parseId(req.params.id);
    if (!annotationId) {
      return res.status(400).json({ error: "Invalid annotation id" });
    }
    const parsed = updateAnnotationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid update payload" });
    }
    const user = req.user as { id: number; role: string };

    try {
      const [annotation] = await db
        .select({
          id: studioAnnotations.id,
          fileId: studioAnnotations.fileId,
          authorId: studioAnnotations.authorId,
          projectId: studioFiles.projectId,
        })
        .from(studioAnnotations)
        .innerJoin(studioFiles, eq(studioAnnotations.fileId, studioFiles.id))
        .where(eq(studioAnnotations.id, annotationId))
        .limit(1);
      if (!annotation) {
        return res.status(404).json({ error: "Annotation not found" });
      }

      const access = await requireStudioAccess(
        annotation.projectId,
        { id: user.id, role: user.role as any },
        canAnnotate,
        "update annotations"
      );

      // Only the author may change data; anyone with annotate can resolve.
      const isAuthor = annotation.authorId === user.id;
      const patch: Partial<typeof studioAnnotations.$inferInsert> = {
        updatedAt: new Date(),
      };

      if (parsed.data.data !== undefined) {
        if (!isAuthor && !access.isPlatformModerator) {
          return res
            .status(403)
            .json({ error: "Only the author can edit this annotation" });
        }
        patch.data = parsed.data.data;
      }

      if (parsed.data.resolved !== undefined) {
        patch.resolved = parsed.data.resolved;
        patch.resolvedAt = parsed.data.resolved ? new Date() : null;
        patch.resolvedBy = parsed.data.resolved ? user.id : null;
      }

      const [updated] = await db
        .update(studioAnnotations)
        .set(patch)
        .where(eq(studioAnnotations.id, annotationId))
        .returning();

      if (
        parsed.data.resolved !== undefined &&
        access.project.conversationId != null
      ) {
        await db.insert(dmMessages).values({
          conversationId: access.project.conversationId,
          senderId: user.id,
          content: parsed.data.resolved
            ? "A note was resolved."
            : "A note was reopened.",
          messageType: "studio_system",
          metadata: {
            eventKey: "studio.annotation_resolved",
            studioProjectId: annotation.projectId,
            studioFileId: annotation.fileId,
            studioAnnotationId: annotationId,
            resolved: parsed.data.resolved,
          },
        });
        await db
          .update(dmConversations)
          .set({ lastMessageAt: new Date(), updatedAt: new Date() })
          .where(eq(dmConversations.id, access.project.conversationId));
      }

      broadcastStudioEvent(annotation.projectId, "studio_annotation_updated", {
        fileId: annotation.fileId,
        annotationId,
        data: updated.data,
        resolved: updated.resolved,
        resolvedBy: updated.resolvedBy,
        resolvedAt: updated.resolvedAt?.toISOString() ?? null,
      });

      res.json({
        id: updated.id,
        data: updated.data,
        resolved: updated.resolved,
        resolvedBy: updated.resolvedBy,
        resolvedAt: updated.resolvedAt?.toISOString() ?? null,
        updatedAt: updated.updatedAt.toISOString(),
      });
    } catch (err) {
      const { status, body } = mapAccessError(err);
      if (status === 500) console.error("[studio] update annotation failed:", err);
      res.status(status).json(body);
    }
  }
);

/* ── Delete annotation ─────────────────────────────────── */

router.delete(
  "/api/studio/annotations/:id",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    const annotationId = parseId(req.params.id);
    if (!annotationId) {
      return res.status(400).json({ error: "Invalid annotation id" });
    }
    const user = req.user as { id: number; role: string };

    try {
      const [annotation] = await db
        .select({
          id: studioAnnotations.id,
          authorId: studioAnnotations.authorId,
          fileId: studioAnnotations.fileId,
          projectId: studioFiles.projectId,
        })
        .from(studioAnnotations)
        .innerJoin(studioFiles, eq(studioAnnotations.fileId, studioFiles.id))
        .where(eq(studioAnnotations.id, annotationId))
        .limit(1);
      if (!annotation) {
        return res.status(404).json({ error: "Annotation not found" });
      }

      const access = await requireStudioAccess(
        annotation.projectId,
        { id: user.id, role: user.role as any },
        canAnnotate,
        "delete annotations"
      );

      // Authors can delete their own; owners/moderators can delete any.
      const isAuthor = annotation.authorId === user.id;
      if (!isAuthor && access.role !== "owner" && !access.isPlatformModerator) {
        return res
          .status(403)
          .json({ error: "Only the author or an owner can delete this annotation" });
      }

      await db
        .delete(studioAnnotations)
        .where(eq(studioAnnotations.id, annotationId));

      broadcastStudioEvent(annotation.projectId, "studio_annotation_deleted", {
        fileId: annotation.fileId,
        annotationId,
      });

      res.status(204).end();
    } catch (err) {
      const { status, body } = mapAccessError(err);
      if (status === 500) console.error("[studio] delete annotation failed:", err);
      res.status(status).json(body);
    }
  }
);

/* ── Annotation comments ────────────────────────────────── */

router.post(
  "/api/studio/annotations/:id/comments",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    const annotationId = parseId(req.params.id);
    if (!annotationId) {
      return res.status(400).json({ error: "Invalid annotation id" });
    }
    const parsed = commentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid comment payload" });
    }
    const user = req.user as { id: number; role: string };

    try {
      const [annotation] = await db
        .select({
          id: studioAnnotations.id,
          projectId: studioFiles.projectId,
        })
        .from(studioAnnotations)
        .innerJoin(studioFiles, eq(studioAnnotations.fileId, studioFiles.id))
        .where(eq(studioAnnotations.id, annotationId))
        .limit(1);
      if (!annotation) {
        return res.status(404).json({ error: "Annotation not found" });
      }

      await requireStudioAccess(
        annotation.projectId,
        { id: user.id, role: user.role as any },
        canChat,
        "comment on annotations"
      );

      const [created] = await db
        .insert(studioAnnotationComments)
        .values({
          annotationId,
          authorId: user.id,
          body: parsed.data.body,
        })
        .returning();

      const [author] = await db
        .select({ displayName: users.displayName })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);

      broadcastStudioEvent(annotation.projectId, "studio_annotation_comment_added", {
        annotationId,
        commentId: created.id,
        authorId: user.id,
        authorDisplayName: author?.displayName ?? null,
        body: created.body,
        createdAt: created.createdAt.toISOString(),
      });

      res.status(201).json({
        id: created.id,
        annotationId: created.annotationId,
        authorId: created.authorId,
        authorDisplayName: author?.displayName ?? null,
        body: created.body,
        createdAt: created.createdAt.toISOString(),
        editedAt: null,
      });
    } catch (err) {
      const { status, body } = mapAccessError(err);
      if (status === 500) console.error("[studio] comment create failed:", err);
      res.status(status).json(body);
    }
  }
);

router.delete(
  "/api/studio/annotation-comments/:id",
  isAuthenticated,
  requirePermission("access_studio"),
  async (req, res) => {
    const commentId = parseId(req.params.id);
    if (!commentId) return res.status(400).json({ error: "Invalid comment id" });
    const user = req.user as { id: number; role: string };

    try {
      const [comment] = await db
        .select({
          id: studioAnnotationComments.id,
          authorId: studioAnnotationComments.authorId,
          annotationId: studioAnnotationComments.annotationId,
          projectId: studioFiles.projectId,
        })
        .from(studioAnnotationComments)
        .innerJoin(
          studioAnnotations,
          eq(studioAnnotationComments.annotationId, studioAnnotations.id)
        )
        .innerJoin(studioFiles, eq(studioAnnotations.fileId, studioFiles.id))
        .where(eq(studioAnnotationComments.id, commentId))
        .limit(1);
      if (!comment) {
        return res.status(404).json({ error: "Comment not found" });
      }

      const access = await requireStudioAccess(
        comment.projectId,
        { id: user.id, role: user.role as any },
        canChat,
        "delete comments"
      );

      const isAuthor = comment.authorId === user.id;
      if (!isAuthor && access.role !== "owner" && !access.isPlatformModerator) {
        return res
          .status(403)
          .json({ error: "Only the author or an owner can delete this comment" });
      }

      await db
        .delete(studioAnnotationComments)
        .where(eq(studioAnnotationComments.id, commentId));

      res.status(204).end();
    } catch (err) {
      const { status, body } = mapAccessError(err);
      if (status === 500) console.error("[studio] delete comment failed:", err);
      res.status(status).json(body);
    }
  }
);

export default router;
