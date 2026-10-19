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
    if (req.path !== API_PREFIX && !req.path.startsWith(API_PREFIX + '/')) return next();
    if (req.method === 'POST' && getUser() && req.get('x-csrf-token') !== 'test-csrf-token') {
      return res.status(403).json({ error: 'Invalid or missing CSRF token' });
    }
    return authority.handler(req, res, next);
  });
  return { close: async () => { await authority.close(); rmSync(dataDir, { recursive: true, force: true }); } };
}
