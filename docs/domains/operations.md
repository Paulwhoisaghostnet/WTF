# Operations

## Purpose

Operations covers local development, deployment, health checks, backups, and production safety boundaries.

## WTF OS Connection

Operational controls appear only where they are safe for the app: health visibility, feature gates, admin settings, and status surfaces. Server-only actions such as signer custody, keyring creation, backup archives, and deployment runbooks stay outside WTF OS UI.

## Main Code

- `Dockerfile`
- `docker-compose.yml`
- `.github/workflows`
- `scripts`
- `server/lib/backup`
- `extensions/wtf-operator-signer/deploy`

## Notes

Production runs through Docker Compose on Hetzner. Secrets and server-local signer material should be provisioned on the host, ignored by git, ignored by Docker build context, and excluded from public documentation.

Production deploys apply reviewed SQL through `scripts/apply-production-migrations.sh` before the app starts. `scripts/server-deploy.sh` also verifies that the public Kiln mutation surface rejects unauthenticated requests before continuing, so `KILN_API_TOKEN` must stay in parity with the host Kiln `API_AUTH_TOKEN`.

Browser session writes use a session-bound CSRF token from `/api/auth/csrf-token`. Public diagnostic event ingestion remains available for client crash trails, but it has its own bounded limiter and metadata caps instead of the media streaming bypass.

Backups treat the Docker Postgres volume as the primary database source and Supabase as an off-site target. `pg_dump` invocation paths must pass the database URL as an isolated process argument, not through shell command text.
