import type { Request, RequestHandler } from "express";
import { demand } from "./funding";
import type { createSponsorFundingService } from "./sponsor-funding";

export function createSponsorFundingHandler({ getService, canAccess }: {
  getService: () => ReturnType<typeof createSponsorFundingService>;
  canAccess: (request: Request) => boolean | Promise<boolean>;
}): RequestHandler {
  return async (req, res, next) => {
    const prefix = "/api/wtfiap/sponsor-funding";
    if (req.path !== prefix && !req.path.startsWith(prefix + "/")) return next();
    try {
      demand(await canAccess(req), "coLILseum is unavailable for this account.", 403);
      res.setHeader("Cache-Control", "no-store");
      const service = getService(), endpoint = req.path.slice(prefix.length);
      if (endpoint === "/health" && req.method === "GET")
        return res.json({ ok: true, health: service.health });
      const match = endpoint.match(/^\/rooms\/([A-Za-z0-9-]+)(?:\/(bind-wallet|open|start|pick-lot|observe|reconcile))?$/);
      demand(match, "Unknown sponsored-room funding endpoint.", 404);
      const [, code, command] = match;
      const userId = req.user ? String((req.user as any).id) : null;
      if (!command && req.method === "GET")
        return res.json({ ok: true, room: await service.view(code, userId) });
      demand(req.method === "POST" && command, "Method not supported.", 405);
      demand(userId, "Sign in to manage sponsored-room funding.", 401);
      const body = req.body;
      const required = command === "bind-wallet" ? ["walletAddress"] :
        command === "pick-lot" ? ["index"] :
        command === "observe" ? ["action", "operationHash"] : [];
      demand(body && typeof body === "object" && !Array.isArray(body) &&
        Object.keys(body).length === required.length &&
        required.every(key => Object.hasOwn(body, key)),
      "Unexpected funding request fields.", 400);
      let room;
      if (command === "bind-wallet") {
        demand(typeof body.walletAddress === "string", "Wallet address is required.", 400);
        room = await service.bind(code, userId, body.walletAddress);
      } else if (command === "open") room = await service.open(code, userId);
      else if (command === "start") room = await service.start(code, userId);
      else if (command === "pick-lot") room = await service.pickLot(code, userId, body.index);
      else if (command === "observe") {
        demand(typeof body.action === "string" && typeof body.operationHash === "string",
          "Submitted wallet operation is required.", 400);
        room = await service.observe(code, userId, body);
      } else {
        await service.drain();
        room = await service.view(code, userId);
      }
      return res.json({ ok: true, room });
    } catch (error: any) {
      const reason = error.status ? error.message : "Sponsor funding is temporarily unavailable.";
      return res.status(error.status || 503).json({ ok: false, reason, error: reason });
    }
  };
}
