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
