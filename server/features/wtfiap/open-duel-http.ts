import type { Request, RequestHandler } from 'express';
import { demand } from './funding';
import type { createOpenDuelService } from './open-duel';

export function createOpenDuelHandler({ getService, canAccess }: {
  getService: () => ReturnType<typeof createOpenDuelService>;
  canAccess(request: Request): boolean | Promise<boolean>;
}): RequestHandler {
  return async (req, res, next) => {
    const prefix = '/api/wtfiap/open-duel';
    if (req.path !== prefix && !req.path.startsWith(prefix + '/')) return next();
    try {
      demand(await canAccess(req), 'coLILseum is unavailable for this account.', 403);
      const match = req.path.slice(prefix.length).match(/^\/rooms\/([A-Za-z0-9-]+)(?:\/(prepare-host|prepare-guest|reconcile|claim-seat))?$/);
      demand(match, 'Unknown open-duel endpoint.', 404);
      const code = match[1], action = match[2], userId = req.user ? String((req.user as any).id) : null;
      const service = getService();
      res.setHeader('Cache-Control', 'no-store');
      if (req.method === 'GET' && !action) return res.json({ ok: true, room: await service.view(code, userId) });
      demand(req.method === 'POST' && action && userId, 'Sign in before staking this wager.', 401);
      const body = req.body;
      const expected = action === 'prepare-host' ? ['walletAddress'] : action === 'prepare-guest' ? ['walletAddress', 'name'] : [];
      demand(body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === expected.length &&
        expected.every(key => Object.hasOwn(body, key)), 'Unexpected wager request fields.', 400);
      if (action === 'prepare-host') await service.prepareHost(code, userId, body.walletAddress);
      if (action === 'prepare-guest') await service.prepareGuest(code, userId, body.walletAddress, body.name);
      if (action === 'claim-seat') return res.json({ ok: true, seat: await service.claimSeat(code, userId),
        room: await service.view(code, userId) });
      if (action === 'reconcile') await service.reconcile(code);
      return res.json({ ok: true, room: await service.view(code, userId) });
    } catch (error: any) {
      const reason = error.status ? error.message : 'Wager verification is temporarily unavailable.';
      return res.status(error.status || 503).json({ ok: false, reason, error: reason });
    }
  };
}
