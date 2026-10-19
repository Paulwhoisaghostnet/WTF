import { Router } from "express";
import { z } from "zod";
import { GAMESHOW_TOOL_APP_KEYS } from "@shared/gameshow-provisioning";
import { isAuthenticated, requirePermission } from "../../auth/passport";
import { db } from "../../db";
import { getDesktopAppConfig } from "../../lib/desktop-apps";
import { ingestSystemEvent } from "../../challenges/events/ingest";
import { createGameshowProvisioning } from "./provisioning";
import { GameshowError } from "./policy";

const router = Router();
const id = z.coerce.number().int().positive();
const payload = z.object({ appKeys: z.array(z.enum(GAMESHOW_TOOL_APP_KEYS)) }).strict();
const provision = createGameshowProvisioning(db, async (event) => {
  await ingestSystemEvent({ eventId: `gameshow-operator-${event.id}`, eventType: "app.interaction.tracked", userId: event.actorUserId,
    source: "gameshow", sourceModule: "gameshow", rawRefType: "operator_action", rawRefId: event.id,
    metadata: { handle: "gameshow.contestant.provisioned", seasonId: event.seasonId, targetId: event.userId, trustLevel: "server" } });
});

router.post("/api/gameshow/seasons/:id/contestants/:userId/provision", isAuthenticated, requirePermission("manage_gameshow"), async (req, res) => {
  try {
    const input = payload.parse(req.body);
    const result = await provision({ ...input, seasonId: id.parse(req.params.id), userId: id.parse(req.params.userId), actorUserId: (req.user as { id: number }).id, ip: req.ip }, await getDesktopAppConfig());
    res.set("Cache-Control", "private, no-store").json(result);
  } catch (error) {
    if (error instanceof GameshowError) return res.status(error.status).json({ error: error.message });
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Choose supported contestant tools and a valid roster member." });
    console.error("[gameshow] contestant setup failed", error);
    res.status(500).json({ error: "Contestant setup failed. Refresh and try again." });
  }
});

export default router;
