# WTF Gameshow Architecture

WTF Gameshow is a single product made of several small domains. The browser presents them as apps inside WTF OS; the backend keeps each domain in its own route/service area; Tezos activity is split between user-wallet flows and backend signer flows.

## Runtime Shape

```text
Browser
  React 19 + Vite + React95 desktop shell
  Wallet adapters: octez.connect, Beacon, Taquito
  Data: TanStack Query + WebSocket events

Node server
  Express 5 API, Passport sessions, WebSockets
  Domain routes in server/features and server/routes
  Drizzle ORM over PostgreSQL

Tezos
  User wallet writes for user purchases, listings, approvals, and account proofs
  TzKT reads for balances, transfers, metadata, and public chain state
  Operator signer service for platform-controlled backend operations

Deployment
  Docker Compose on Hetzner
  Caddy terminates TLS and proxies to the Node app
  GitHub Actions deploys main and verifies /api/health
```

## Code Layout

| Path | Purpose |
| --- | --- |
| `client/src/components` | Shared UI and WTF OS layout components. |
| `client/src/features` | Frontend domain modules such as desktop, arcade, board, TV, Studio, Tezos Intel, W, and WTF IAM. |
| `client/src/pages` | Route-level page shells wired into the OS window system. |
| `server/features` | Backend domain services and feature routes for arcade, console, game studio, in-app market, operator signer, TV, W, subdomains, and admin. |
| `server/routes` | General API route groups and compatibility surfaces. |
| `server/lib` | Shared backend infrastructure: storage, Tezos/TzKT helpers, backup, auth-adjacent helpers, and job support. |
| `shared` | Cross-client/server schemas, constants, permission definitions, and protocol types. |
| `contracts` | SmartPy Tezos contracts and contract tests. |
| `extensions` | Separately deployable helpers such as signer, bot, domain tooling, and browser extensions. |
| `apps` | Separately deployable app modules such as colleKT. |
| `docs` | Public product and architecture documentation. |
| `.agents/docs` | Internal live boards, lessons, archives, old audits, plans, and run logs. |

## Domain Map

The public domain guides stay intentionally light:

- [WTF OS](docs/domains/wtf-os.md)
- [Identity And Social](docs/domains/identity-and-social.md)
- [Arcade, Console, And Game Studio](docs/domains/arcade-console-game-studio.md)
- [Commerce And Wallets](docs/domains/commerce-and-wallets.md)
- [Media, TV, And Studio](docs/domains/media-tv-studio.md)
- [Tezos Platform](docs/domains/tezos-platform.md)
- [Operations](docs/domains/operations.md)

## Wallet And Contract Rules

User-initiated purchases or contract writes must use the user's connected wallet provider. UI code should prove a live wallet account, attach the provider to Taquito, and confirm the expected chain before sending.

Backend-originated platform actions must use the operator signer boundary. The web app may request an allowed operation; it must not read raw private keys, create wallets through the UI, or expose custody controls to users.

## Documentation Policy

Public docs should explain the product, domain ownership, and safe development paths. Internal boards, debugging lessons, deployment scratch notes, audit reports, bounty queues, and historical plans belong in `.agents/docs` so the public GitHub surface stays readable.
