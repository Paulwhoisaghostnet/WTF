import type { Router } from "express";
import { requirePermission } from "../../auth/passport";
import {
  buildAdminHelpIndex,
  type AdminHelpTopicKind,
} from "../../../client/src/features/admin/help/admin-help-index";
import { logSystemEvent } from "../../lib/system-log";

const HELP_TOPIC_KINDS = new Set<AdminHelpTopicKind>([
  "section",
  "surface",
  "permission",
  "curse",
]);

function queryValue(value: unknown, maxLength = 240) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function registerAdminHelpIndexRoutes(router: Router) {
  router.get(
    "/api/admin/help-index",
    requirePermission("access_admin_panel"),
    async (req, res) => {
      const query = queryValue(req.query.q);
      const id = queryValue(req.query.id);
      const rawKind = queryValue(req.query.kind, 32);
      const kind = HELP_TOPIC_KINDS.has(rawKind as AdminHelpTopicKind)
        ? (rawKind as AdminHelpTopicKind)
        : null;
      const index = buildAdminHelpIndex(query);
      const topics = index.topics.filter((topic) => {
        if (id && topic.id !== id) return false;
        if (kind && topic.kind !== kind) return false;
        return true;
      });

      res.setHeader("Cache-Control", "private, no-store");
      res.json({
        ...index,
        filters: { id: id || null, kind },
        topics,
        resultCount: topics.length,
      });

      if (query || id || kind) {
        logSystemEvent({
          source: "admin",
          eventType: "admin.help.searched",
          severity: "info",
          userId: Number((req.user as any)?.id) || null,
          message: "Admin help index queried",
          metadata: {
            query: query || null,
            id: id || null,
            kind,
            resultCount: topics.length,
          },
        });
      }
    }
  );
}
