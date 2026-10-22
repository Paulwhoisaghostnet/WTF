import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createWtfiapAuthority, API_PREFIX } = require('../../../server/features/wtfiap/authority.cjs');

// Domain-owned real room authority. Other harness apps keep their independent
// mocks; no fake success response can satisfy a WTFIAP room mutation.
export function mountWtfiapDomain(app, { getState, getUser }) {
  const dataDir = mkdtempSync(path.join(os.tmpdir(), 'wtfiap-browser-'));
  const authority = createWtfiapAuthority({ dataDir,
    isEnabled: () => getState().desktopApps.wtfiap === true,
    canAccess: () => getState().userRole !== 'time_out',
    resolveActor: () => {
      const user = getUser();
      return user ? { id: String(user.id), name: user.displayName || user.username } : null;
    },
  });
  app.use((req, res, next) => {
    // This harness has no signer or deployed escrow. Readiness must report
    // that truth rather than falling through to a generic success response.
    if (req.path === '/api/wtfiap/funding' || req.path.startsWith('/api/wtfiap/funding/')) {
      if (!getState().desktopApps.wtfiap || getState().userRole === 'time_out') return res.status(403).json({ ok: false, error: 'WTFIAP is unavailable for this account.' });
      if (req.method === 'GET' && req.path === '/api/wtfiap/funding/config') return res.json({ ok: true, config: {
        enabled: false, reason: 'Funded tournaments are unavailable in the inventory harness; no escrow or signer is configured.',
        network: 'shadownet', chainId: 'NetXsqzbfFenSTS', rpcUrl: 'https://tezos-shadownet.octez.io/', escrowContract: '',
        wtfToken: { contract: '', tokenId: '0', decimals: 8 }, currencyDecimals: { XTZ: 6, WTF: 8 }, currencyQuantaAtomic: { XTZ: '10000', WTF: '1000000' }, feeQuantumAtomic: null, refundPolicy: 'prestart-withdrawal;technical-void-full-refund-v1', treasuryAddress: '', prizeRoundingPolicy: 'floor-each-prize-to-quantum;remainder-to-wtf.tez-v1',
      } });
      if (req.method === 'GET' && req.path === '/api/wtfiap/funding/health') return res.json({ ok: true, enabled: false, health: { lastAttemptAt: null, lastSuccessAt: null, error: null, headStreamConnected: false } });
      return res.status(503).json({ ok: false, error: 'The inventory harness has no funded-room authority. Use the authenticated admission rehearsal for real account admission.' });
    }
    if (req.path !== API_PREFIX && !req.path.startsWith(API_PREFIX + '/')) return next();
    if (req.method === 'POST' && getUser() && req.get('x-csrf-token') !== 'test-csrf-token') {
      return res.status(403).json({ error: 'Invalid or missing CSRF token' });
    }
    return authority.handler(req, res, next);
  });
  return { close: async () => { await authority.close(); rmSync(dataDir, { recursive: true, force: true }); } };
}
