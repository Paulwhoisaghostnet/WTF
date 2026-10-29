'use strict';
const path = require('node:path');
const { listRooms } = require('./room-directory.cjs');
const API_PREFIX = '/api/wtfiap/party';

// Loaded as a runtime module by both the host and its real-domain browser harness.
// The runtime's relative CJS imports stay intact in the production Docker copy.
function createWtfiapAuthority({ dataDir, isEnabled, canAccess = () => true,
  resolveActor = request => {
    const user = request.user;
    return user ? { id: String(user.id), name: String(user.displayName || user.username || `Commander ${user.id}`) } : null;
  }, clock, onRoomChanged, onPreparationOpened, openDuelNetworks = [], runtimePath = path.join(__dirname, 'runtime/game/server/party-server.cjs') } = {}) {
  if (typeof isEnabled !== 'function') throw new Error('WTFIAP requires the host desktop-app gate.');
  const { createServer } = require(runtimePath);
  const authority = createServer({ dataDir, listen: false, apiPrefix: API_PREFIX,
    sharePath: '/wtfiap', staticFiles: false, resolveActor, onRoomChanged, onPreparationOpened, openDuelNetworks, ...(clock ? { clock } : {}) });
  let closing = false;
  const handler = async (request, response, next) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname !== API_PREFIX && !pathname.startsWith(API_PREFIX + '/')) return next?.();
    try {
      if (closing) return response.status(503).json({ ok: false, reason: 'WTFIAP is shutting down.' });
      if (!await isEnabled(request)) return response.status(403).json({ ok: false, reason: 'WTFIAP is disabled by the host.' });
      if (!await canAccess(request)) return response.status(403).json({ ok: false, reason: 'This account cannot open apps.' });
      await authority.ready;
      if (request.method === 'GET' && pathname === API_PREFIX + '/rooms') {
        response.setHeader('Cache-Control', 'no-store');
        return response.json({ ok: true, rooms: listRooms(authority.dataDir) });
      }
      return authority.handler(request, response);
    } catch (error) {
      if (next) return next(error);
      if (!response.headersSent) response.status(500).json({ ok: false, reason: 'WTFIAP could not complete this request.' });
      else response.end();
    }
  };
  return { handler, ready: authority.ready, pump: authority.pump, dataDir: authority.dataDir, funding: authority.funding,
    close: async () => { closing = true; await authority.close(); } };
}
module.exports = { createWtfiapAuthority, API_PREFIX };
