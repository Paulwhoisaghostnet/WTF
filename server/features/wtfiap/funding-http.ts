import type { Request, RequestHandler } from "express";
import { demand, createFundingService } from "./funding";

export function createFundingHandler({ getService, canAccess }: { getService: () => ReturnType<typeof createFundingService>; canAccess: (request: Request) => boolean | Promise<boolean> }): RequestHandler {
return async (req, res, next) => {
  const prefix = "/api/wtfiap/funding";
  if (req.path !== prefix && !req.path.startsWith(prefix + "/")) return next();
  try {
    demand(await canAccess(req), "WTFIAP is unavailable for this account.", 403);
    const service = getService(), endpoint = req.path.slice(prefix.length);
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "GET" && endpoint === "/config") {
      const code = req.query.room;
      demand(code === undefined || (typeof code === "string" && /^[A-Za-z0-9-]+$/.test(code)), "Invalid room code.", 400);
      return res.json({ ok: true, config: code ? await service.publicConfigForRoom(code) : service.publicConfig(),
        lanes: service.publicConfigs() });
    }
    if (req.method === "GET" && endpoint === "/health") {
      const lanes = service.publicConfigs();
      return res.json({ ok: true, enabled: lanes.XTZ.enabled || lanes.WTF.enabled || lanes.XTZ_MAINNET.enabled, lanes: {
        XTZ_SHADOWNET: { enabled: lanes.XTZ.enabled, network: lanes.XTZ.network },
        XTZ_MAINNET: { enabled: lanes.XTZ_MAINNET.enabled, network: lanes.XTZ_MAINNET.network },
        WTF_MAINNET: { enabled: lanes.WTF.enabled, network: lanes.WTF.network },
        XTZ: { enabled: lanes.XTZ.enabled, network: lanes.XTZ.network },
        WTF: { enabled: lanes.WTF.enabled, network: lanes.WTF.network } }, health: service.health });
    }
    const route = endpoint.match(/^\/rooms\/([^/]+)(?:\/(bind-wallet|stake-intent|open|start|observe|reconcile))?$/);
    demand(route, "Unknown funded-room endpoint.", 404);
    const code = route[1], action = route[2], userId = req.user ? String((req.user as any).id) : null;
    if (req.method === "GET" && !action) return res.json({ ok: true, room: await service.view(code, userId) });
    demand(req.method === "POST" && action, "Method not supported.", 405);
    demand(userId, "Sign in before funding a tournament.", 401);
    const body = req.body;
    const keys = action === "bind-wallet" ? ["walletAddress"] : action === "observe" ? ["operationHash", "action"] : [];
    demand(body && typeof body === "object" && !Array.isArray(body) && Object.keys(body).length === keys.length && keys.every(key => Object.hasOwn(body, key)), "Unexpected funding request fields.", 400);
    let room;
    if (action === "bind-wallet") room = await service.bind(code, userId, body.walletAddress);
    else if (action === "stake-intent") room = await service.stakeIntent(code, userId);
    else if (action === "open") room = await service.open(code, userId);
    else if (action === "start") room = await service.start(code, userId);
    else if (action === "observe") room = await service.observe(code, userId, body);
    else { await service.inspectSeat(code, userId); await service.drain(); room = await service.view(code, userId); }
    return res.json({ ok: true, room });
  } catch (error: any) {
    const reason = error.status ? error.message : "Funding reconciliation is temporarily unavailable.";
    return res.status(error.status || 503).json({ ok: false, reason, error: reason });
  }
};
}
