# colleKT for WTF port

This directory is a WTF-focused adaptation of
[`skullzarmy/colleKT`](https://github.com/skullzarmy/colleKT). It keeps the
upstream Next.js + React Three Fiber gallery, then adds a profile-backed route:

- `/wtf` renders the signed-in WTF user's linked-wallet collection.
- `wtf:me` is the internal gallery id used by the port.
- `NEXT_PUBLIC_WTF_API_ORIGIN` points browser calls at `wtfgameshow.app`.
- `WTF_API_ORIGIN` is the server-side fallback for reverse-proxy deployments.
- Deploy the module on the same site as WTF, for example
  `collekt.wtfgameshow.app`, when relying on WTF session cookies.

The WTF app exposes the bridge API:

- `GET /api/collekt/session` returns the current user, linked wallets, and the
  configured module URL.
- `GET /api/collekt/tokens?limit=20&offset=0` returns profile-wallet holdings
  from `wallet_holdings` + `token_metadata`.

Local pairing:

```bash
# terminal 1
cd ../WTF
npm run db:setup:local
npm run db:push
npm run dev

# terminal 2
cd ../collekt-wtf
cp .env.example .env.local
npm install
npm run dev -- --port 3001
```

Then open `http://localhost:3000/collekt` in WTF or `http://localhost:3001/wtf`
directly after signing into WTF.
