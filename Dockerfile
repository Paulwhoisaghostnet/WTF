FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

ARG COMMIT_SHA=dev
COPY . .
RUN npm run build

FROM node:20-slim

# Runtime deps:
#   • ffmpeg            — TV cache transcoding
#   • curl              — Docker healthcheck
#   • postgresql-client — backup/restore + drizzle migrations on boot
#   • tini              — proper PID 1 signal forwarding
#   • gosu              — drop privileges from root to `node` after we
#                         chown bind-volumes that may be root-owned
#                         from earlier deploys
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ffmpeg curl postgresql-client tini gosu && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install --no-save drizzle-kit@0.31.10

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/scripts ./scripts

# Pre-create writable mount points so empty named volumes inherit
# correct ownership when Docker mounts them on first boot.
RUN mkdir -p /app/cache /app/cache/tv /app/uploads /app/uploads/studio /app/backups && \
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
  CMD curl -sf http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.cjs"]
