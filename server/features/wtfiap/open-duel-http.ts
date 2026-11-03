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
      const userId = req.user ? String((req.user as any).id) : null;
      if (req.path === prefix + '/prepaid-credit' && req.method === 'GET') {
        demand(userId, 'Sign in before viewing prepaid duel credit.', 401);
        demand(typeof req.query.walletAddress === 'string', 'Choose your linked Mainnet wallet.', 400);
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ ok: true, credit: await getService().creditView(userId, req.query.walletAddress) });
      }
      if (req.path === prefix + '/prepaid-credit/quote' && req.method === 'POST') {
        demand(userId, 'Sign in before buying prepaid duel credit.', 401);
        const body = req.body;
        demand(body && typeof body === 'object' && !Array.isArray(body) &&
          Object.keys(body).length === 2 && typeof body.walletAddress === 'string' &&
          typeof body.amountMutez === 'string', 'Choose a linked wallet and XTZ credit amount.', 400);
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ ok: true, action: await getService().quoteCredit(userId, body.walletAddress, body.amountMutez) });
      }
      const creditOperation = req.path.slice(prefix.length).match(/^\/prepaid-credit\/operations\/(o[1-9A-HJ-NP-Za-km-z]+)$/);
      if (creditOperation && req.method === 'GET') {
        demand(userId, 'Sign in before verifying prepaid duel credit.', 401);
        demand(typeof req.query.walletAddress === 'string' && typeof req.query.amountMutez === 'string',
          'Supply the linked wallet and exact quoted XTZ amount.', 400);
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ ok: true, operation: await getService().creditOperation(userId,
          req.query.walletAddress, req.query.amountMutez, creditOperation[1]) });
      }
      const roomOperation = req.path.slice(prefix.length).match(/^\/rooms\/([A-Za-z0-9-]+)\/operations\/(o[1-9A-HJ-NP-Za-km-z]+)$/);
      if (roomOperation && req.method === 'GET') {
        demand(userId, 'Sign in before verifying your wager action.', 401);
        demand(typeof req.query.walletAddress === 'string' && typeof req.query.entrypoint === 'string' &&
          ['create_offer', 'accept_offer', 'accept_prepaid', 'cancel_offer', 'withdraw_guest', 'refund', 'claim']
            .includes(req.query.entrypoint),
        'Supply the linked wallet and exact wager action.', 400);
        res.setHeader('Cache-Control', 'no-store');
        return res.json({ ok: true, operation: await getService().roomOperation(userId,
          roomOperation[1], req.query.walletAddress, req.query.entrypoint as
          'create_offer' | 'accept_offer' | 'accept_prepaid' | 'cancel_offer' | 'withdraw_guest' | 'refund' | 'claim', roomOperation[2]) });
      }
      const match = req.path.slice(prefix.length).match(/^\/rooms\/([A-Za-z0-9-]+)(?:\/(prepare-host|prepare-guest|reconcile|claim-seat))?$/);
      demand(match, 'Unknown open-duel endpoint.', 404);
      const code = match[1], action = match[2];
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
