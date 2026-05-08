# WTF Gameshow

WTF Gameshow is a Tezos-connected community platform presented as a desktop OS. It brings the gameshow, arcade, creator tools, media, marketplace, social surfaces, and wallet-aware profile system into one browser app.

## What Is In The App

- WTF OS desktop shell with draggable windows, app icons, settings, and role-gated admin surfaces.
- Gameshow seasons, rounds, challenges, side quests, XP, and reward automation.
- WTF Arcade, Console, and Game Studio SDK surfaces for playable games and creator submissions.
- WTF TV, media libraries, profile galleries, and the colleKT gallery module.
- Message board, direct messages, W social feed, public profiles, leaderboards, and Discord-linked identity.
- On-chain Tezos wallet login, WTF FA2 balance reads, marketplace flows, subdomain grants, and server-side platform signer support.

## Public Docs

- [Architecture](ARCHITECTURE.md)
- [Docs Index](docs/README.md)
- [Domain Guides](docs/domains/README.md)
- [Public Access Surface](docs/public-access.md)

## Local Development

```bash
npm install
cp .env.example .env
npm run db:setup:local
npm run db:push
npm run dev
```

The app runs at `http://localhost:3000` by default. The Docker path mirrors production more closely:

```bash
cp .env.example .env
docker compose up -d --build
```

## Core Scripts

```bash
npm run check
npm run build
npm run db:push
npm run contract:test
npm run contract:test:in-app-market
npm run operator-signer:check
```

## Chain Boundary

Browser-originated Tezos writes go through the connected user wallet. Platform-originated operations go through the isolated operator signer service over a local socket; wallet keys and keyrings must stay outside the Git repo and outside the web process.

The default mainnet RPC in `.env.example` uses `https://rpc.tzkt.io/mainnet`. Do not add ECAD RPC endpoints back into app defaults.

## Deployment

Production is a Docker Compose stack on Hetzner: Postgres, the Node app, and Caddy for TLS/proxying. Pushing to `main` triggers the normal GitHub Actions deploy workflow, which builds the app, updates the server checkout, starts the stack, and checks `/api/health`.

Secrets, signer keyrings, custody exports, backup archives, and deployment-only runbooks are intentionally not part of the public docs surface.
