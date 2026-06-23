import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth/passport";
import {
  getGreenRoomHistory,
  getGreenRoomState,
  listGreenRoomAdminContent,
  runGreenRoomCommand,
  saveGreenRoomAdminContent,
  updateGreenRoomCampaignAdmin,
  type GreenRoomAuthUser,
} from "../features/green-room/service";
import { broadcastDedRoomsEvent } from "../websocket";

const router = Router();

const commandSchema = z.object({
  input: z.string().min(1).max(400),
});

const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(80),
});

const contentSchema = z.object({
  kind: z.string().min(2).max(40),
  key: z.string().min(2).max(140),
  title: z.string().min(1).max(200),
  body: z.string().max(20_000).optional(),
  dataJson: z.unknown().optional(),
  status: z.string().min(2).max(24).optional(),
});

const campaignSchema = z.object({
  mode: z.enum(["active", "myth", "paused"]).optional(),
  targetDepartures: z.number().int().min(1).max(10_000).optional(),
  sharedUnlockProgress: z.unknown().optional(),
});

function routeUser(req: any): GreenRoomAuthUser {
  const user = req.user || {};
  return {
    id: Number(user.id),
    username: String(user.username || `user-${user.id}`),
    displayName: user.displayName ?? null,
    avatarUrl: user.avatarUrl || null,
    pfpImageUrl: user.pfpImageUrl || null,
    role: user.role || "witness",
  };
}

function sendDedRoomsError(res: any, err: unknown, fallback: string) {
  const message = err instanceof Error ? err.message : fallback;
  const status =
    /admin access|required|invalid|unsupported|unknown|missing|must/i.test(message)
      ? 400
      : /not found/i.test(message)
        ? 404
        : 500;
  if (status >= 500) console.error("[dedrooms] route failed:", err);
  res.status(status).json({ error: message || fallback });
}

router.get("/api/dedrooms/state", isAuthenticated, async (req, res) => {
  try {
    res.json(await getGreenRoomState(routeUser(req)));
  } catch (err) {
    sendDedRoomsError(res, err, "Failed to load DedRooms state");
  }
});

router.get("/api/dedrooms/history", isAuthenticated, async (req, res) => {
  const parsed = historyQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid DedRooms history query", details: parsed.error.flatten() });
  }
  try {
    res.json(await getGreenRoomHistory(routeUser(req), parsed.data.limit));
  } catch (err) {
    sendDedRoomsError(res, err, "Failed to load DedRooms history");
  }
});

router.post("/api/dedrooms/command", isAuthenticated, async (req, res) => {
  const parsed = commandSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid DedRooms command", details: parsed.error.flatten() });
  }
  try {
    const result = await runGreenRoomCommand(routeUser(req), parsed.data.input);
    const eventLocation = result.event?.locationId || (result.state as any)?.player?.locationId || null;
    if (eventLocation && result.event) {
      broadcastDedRoomsEvent(eventLocation, {
        type: "ded_rooms_event",
        locationId: eventLocation,
        event: {
          id: result.event.id,
          eventType: result.event.eventType,
          message: result.event.message,
          visibility: result.event.visibility,
          createdAt: result.event.createdAt.toISOString(),
          actorUserId: result.event.actorUserId,
        },
      });
    }
    res.json(result);
  } catch (err) {
    sendDedRoomsError(res, err, "Failed to run DedRooms command");
  }
});

router.get("/api/dedrooms/admin/content", isAuthenticated, async (req, res) => {
  try {
    res.json(await listGreenRoomAdminContent(routeUser(req)));
  } catch (err) {
    sendDedRoomsError(res, err, "Failed to load DedRooms admin content");
  }
});

router.post("/api/dedrooms/admin/content", isAuthenticated, async (req, res) => {
  const parsed = contentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid DedRooms content", details: parsed.error.flatten() });
  }
  try {
    res.json(await saveGreenRoomAdminContent(routeUser(req), parsed.data));
  } catch (err) {
    sendDedRoomsError(res, err, "Failed to save DedRooms content");
  }
});

router.patch("/api/dedrooms/admin/campaign", isAuthenticated, async (req, res) => {
  const parsed = campaignSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid DedRooms campaign update", details: parsed.error.flatten() });
  }
  try {
    res.json(await updateGreenRoomCampaignAdmin(routeUser(req), parsed.data));
  } catch (err) {
    sendDedRoomsError(res, err, "Failed to update DedRooms campaign");
  }
});

export default router;
