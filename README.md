# wtfOS

wtfOS is a Tezos-connected community platform presented as a desktop OS at [wtfos.app](https://wtfos.app). It brings the WTF Gameshow, arcade, creator tools, media, marketplace, social surfaces, and wallet-aware profile system into one browser app.

## What Is In The App

- wtfOS desktop shell with draggable windows, app icons, settings, and role-gated admin surfaces.
- WTF Gameshow seasons, rounds, challenges, side quests, XP, and reward automation.
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
npm run import-game-studio:open-assets
npm run db:push
npm run contract:test
npm run contract:test:in-app-market
npm run operator-signer:check
```

Tune the importer with optional environment caps:

```bash
OBJKT_MAX_MODELS_TO_IMPORT=5 OBJKT_MAX_MODEL_QUERIES=2 \
POLYHAVEN_MAX_MODELS_TO_IMPORT=4 POLYHAVEN_MAX_FILES_PER_CANDIDATE=6 \
IMPORT_FETCH_TIMEOUT_MS=12000 \
npm run import-game-studio:open-assets
```

## Chain Boundary

Browser-originated Tezos writes go through the connected user wallet. Platform-originated operations go through the isolated operator signer service over a local socket; wallet keys and keyrings must stay outside the Git repo and outside the web process.

The default mainnet RPC in `.env.example` uses `https://tezos-mainnet.octez.io/`. Keep Octez-hosted RPCs as app defaults, with TzKT serving as the indexer/API fallback instead of the primary RPC.

## Deployment

Production is a Docker Compose stack on Hetzner: Postgres, the Node app, and Caddy for TLS/proxying. Pushing to `main` triggers the normal GitHub Actions deploy workflow, which builds the app, updates the server checkout, starts the stack, and checks `/api/health`.

Secrets, signer keyrings, custody exports, backup archives, and deployment-only runbooks are intentionally not part of the public docs surface.
