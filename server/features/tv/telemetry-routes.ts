import type { Router } from "express";
import { isAuthenticated } from "../../auth/passport";
import {
  tvTelemetryRateLimit,
  tvTelemetryStore,
  type TelemetryReason,
} from "./telemetry";
import {
  isStaffRole,
  type TvAuthUser as AuthUser,
} from "./channel-service";

export function registerTvTelemetryRoutes(router: Router): void {
  router.post("/api/tv/telemetry/item-end", tvTelemetryRateLimit, async (req, res) => {
    try {
      const body = req.body ?? {};
      const videoId = Number.isFinite(Number(body.videoId))
        ? Number(body.videoId)
        : null;
      const bumperId = Number.isFinite(Number(body.bumperId))
        ? Number(body.bumperId)
        : null;
      const sessionId = String(body.sessionId || "").slice(0, 64);
      const rawReason = String(body.reason || "ended").toLowerCase();
      const reason: TelemetryReason =
        rawReason === "ended" ||
        rawReason === "skipped" ||
        rawReason === "error" ||
        rawReason === "stall"
          ? (rawReason as TelemetryReason)
          : "ended";

      if (videoId === null && bumperId === null) {
        return res.status(400).json({ error: "videoId or bumperId required" });
      }
      if (!sessionId) {
        return res.status(400).json({ error: "sessionId required" });
      }
      tvTelemetryStore.record({ videoId, bumperId, sessionId, reason });
      res.json({ ok: true });
    } catch (err) {
      console.error("[tv] telemetry record failed:", err);
      res.status(500).json({ error: "Failed to record telemetry" });
    }
  });

  router.get("/api/tv/telemetry/aggregate", isAuthenticated, async (req, res) => {
    try {
      const user = req.user as AuthUser;
      if (!(await isStaffRole(user.role))) {
        return res.status(403).json({ error: "Staff only" });
      }
      res.json(tvTelemetryStore.aggregate());
    } catch (err) {
      console.error("[tv] telemetry aggregate failed:", err);
      res.status(500).json({ error: "Failed to read telemetry" });
    }
  });

  router.post("/api/tv/playback/events", tvTelemetryRateLimit, async (req, res) => {
    try {
      const body = req.body;
      const raw = Array.isArray(body?.events) ? body.events : [];
      if (raw.length === 0) {
        res.status(204).end();
        return;
      }
      const userId =
        typeof (req as any).user?.id === "number"
          ? (req as any).user.id
          : null;
      let kept = 0;
      for (const ev of raw.slice(0, 30)) {
        if (!ev || typeof ev !== "object") continue;
        if (typeof (ev as any).event !== "string") continue;
        const safe: Record<string, unknown> = {};
        let written = 0;
        for (const [k, v] of Object.entries(ev as Record<string, unknown>)) {
          if (written >= 20) break;
          if (
            v === null ||
            typeof v === "string" ||
            typeof v === "number" ||
            typeof v === "boolean"
          ) {
            const key = String(k).slice(0, 32);
            const value =
              typeof v === "string" && v.length > 200 ? v.slice(0, 200) : v;
            safe[key] = value;
            written += 1;
          }
        }
        if (userId !== null) safe.userId = userId;
        console.info("[tv-playback]", JSON.stringify(safe));
        kept += 1;
      }
      res.status(202).json({ kept });
    } catch (err) {
      res.status(400).json({ error: "Invalid events payload" });
    }
  });
}
