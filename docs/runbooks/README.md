# Runbooks

These runbooks are operator procedures for the live wtfOS platform. They stay outside the in-app WTF OS UI because they describe host, CI, deployment, and upstream ownership work.

| Runbook | Purpose |
| --- | --- |
| [Production Deployment](production-deployment.md) | Verified local-to-main deployment, GitHub Actions monitoring, live health checks, and rollback posture. |
| [TzKT Upstream](tzkt-upstream.md) | TzKT API/RPC ownership, retry/cache boundaries, health verification, and failure response. |
| [Pasta WTF.ME Publish](pasta-wtfme-live-publish.md) | Guarded Shadownet proof-host publication, pin discovery, and public verification. |
| [Wallet Connect Boundary](../domains/wallet-connect-boundary.md) | Octez Connect, Beacon fallback, CSP wallet frame rules, and production recovery checks. |
