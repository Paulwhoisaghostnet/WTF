FROM node:22-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

ARG COMMIT_SHA=dev

# Vite bakes `import.meta.env.VITE_*` values into the SPA bundle at
# `vite build` time.  `.dockerignore` excludes the host `.env` from
# the build context, so without these ARG/ENV lines the production
# bundle is built with empty contract addresses and the marketplace
# appears "disconnected" from its deployed contracts even though the
# runtime container has the addresses in its environment.  See
# See .agents/docs/archive/root-reports/WTF_APP_STRUCTURE_MAP.md sections 2 and 10 (Plan D).
#
# These addresses are public KT1 contract identifiers, not secrets —
# they are immutable on-chain and visible to anyone who calls the
# marketplace.  Baking them into the bundle is safe.  The values are
# sourced from the host `.env` by `.github/workflows/deploy.yml`
# before `docker compose build` and passed in via `--build-arg`.
ARG VITE_MARKETPLACE_CONTRACT_ADDRESS=
ARG VITE_BARTER_CONTRACT_ADDRESS=
ENV VITE_MARKETPLACE_CONTRACT_ADDRESS=$VITE_MARKETPLACE_CONTRACT_ADDRESS
ENV VITE_BARTER_CONTRACT_ADDRESS=$VITE_BARTER_CONTRACT_ADDRESS

COPY . .
RUN npm run build

FROM node:22-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3

# Runtime deps:
#   • ffmpeg               — TV cache transcoding
#   • curl, gnupg, ca-…    — healthcheck + PGDG repo signing
#   • postgresql-client-16 — MUST match the postgres container major
#                            version so pg_dump works for the
#                            nightly off-site backup.  Debian bookworm
#                            ships client-15 by default; PGDG ships
#                            client-16 for bookworm.  If you bump the
#                            postgres service, bump this package too.
#   • python3 + venv       — SmartPy compiler runtime for Club Dues
#                            template compilation and deployment proofs
#   • tini                 — proper PID 1 signal forwarding
#   • gosu                 — drop privileges from root to `node` after
#                            we chown bind-volumes that may be
#                            root-owned from earlier deploys
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates curl gnupg && \
    install -d /usr/share/postgresql-common/pgdg && \
    curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
      https://www.postgresql.org/media/keys/ACCC4CF8.asc && \
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
      ffmpeg postgresql-client-16 python3 python3-venv tini gosu && \
    rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/smartpy && \
    /opt/smartpy/bin/pip install --no-cache-dir smartpy-tezos

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install --no-save tsx@4.21.0 playwright@1.59.1 && \
    npx playwright install --with-deps chromium

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/contracts ./contracts
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/scripts ./scripts

RUN ln -sf /app/scripts/smartpy-cli-wrapper.sh /usr/local/bin/smartpy && \
    chmod +x /app/scripts/smartpy-cli-wrapper.sh

# Pre-create writable mount points so empty named volumes inherit
# correct ownership when Docker mounts them on first boot.
RUN mkdir -p \
      /app/cache \
      /app/cache/gm-nfts \
      /app/cache/tv \
      /app/uploads \
      /app/uploads/studio \
      /app/uploads-staging \
      /app/tmp-processing \
      /app/backups && \
    chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Entrypoint script:
#   1. Container starts as root so we can chown root-owned legacy
#      volume contents (cache, uploads, backups) one-shot.
#   2. tini becomes PID 1 for clean signal forwarding.
#   3. gosu drops to UID 1000 (`node`) before exec'ing the actual app
#      so the long-lived process has zero root capabilities.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -sf http://localhost:3000/api/health/ready || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.cjs"]
