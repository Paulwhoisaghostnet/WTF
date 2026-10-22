# Dependency and AT runtime remediation receipt

Measured on 2026-10-22. This receipt covers the root dependency graph, gameshow bot dependency graph, DID PLC server, and AT Protocol relay. Main application deployment, native processes, PDS fleet, Caddy, and desktop installers have separate verification records.

## Dependencies and scoped verification

The clean production baseline was retained; the newer Multer 2.4.0, proxy-addr 2.0.8, fast-uri 3.1.8, and qs 6.16.0 resolutions were not replaced with the older development lock.

| Graph | Changed resolution |
| --- | --- |
| Root | `@modelcontextprotocol/sdk` 1.31.0 → 1.32.0 |
| Root | Hono 4.13.7 → 4.13.11 |
| Root ATProto Undici aliases | 6.28.1 → 6.29.1; 7.29.1 → 7.30.1; 8.10.2 → 8.12.2 |
| Root nested `ip-address` | 10.7.1 → 10.7.4 |
| Gameshow bot | Undici 6.24.1 → 6.29.1; ws 8.20.0 → 8.21.0 |

The bot requires an explicit Undici override because its Discord REST dependency pins the older version. Upstream Undici release fixes were checked independently of npm audit metadata: [6.29.1](https://github.com/nodejs/undici/releases/tag/v6.29.1), [7.30.1](https://github.com/nodejs/undici/releases/tag/v7.30.1), and [8.12.2](https://github.com/nodejs/undici/releases/tag/v8.12.2).

Verification used the official Node 22.23.4 binary. Both root and bot `npm ci` completed. Root production audit and bot production audit reported zero known findings. Root supply-chain/dependency policy tests passed 6/6; scoped auth, rate-limit, and outbound checks passed 10/10. The bot typecheck and build passed. Its ordinary test command discovered zero tests; this is not recorded as behavioral coverage. An ephemeral local integration check exercised Discord REST through Undici, a WebSocket echo, and Discord client creation/destruction. Each of the three root Undici aliases completed a local HTTP request, and the ATProto outbound wrapper continued to reject loopback destinations.

These dependency checks do not by themselves prove production deployment or exploit absence. MCP configuration and protocol behavior are covered separately by the owning MCP remediation tests.

## DID PLC

| Evidence | Value |
| --- | --- |
| Running container | `wtf-app-wtfos-plc-1` |
| Application source, unchanged | `1e301e5e29dd419c4dfc7d3100a2a614f9286ebe` |
| Previous runtime | Node 18.20.8 |
| Verified running runtime | Node 22.23.4 |
| Previous image ID | `sha256:249516099d793d5fff6ff5797e77db0b36a9933ec27047bcb1d058573d0dd93a` |
| Candidate and promoted image ID | `sha256:3f9836d53aa00880ba3d251156f26af845a7f0ba34c7998c0efe8e89970a54d3` |
| Candidate tag | `wtfos-plc:security-20261022` |
| Preserved rollback tag | `wtfos-plc:pre-security-20261022` |
| Promoted container start | `2026-10-22T19:57:25.535674356Z` |

`Dockerfile.plc` fetches the exact deployed source revision and retains its application lockfiles, service command, and database configuration contract. An isolated internal Docker network and fresh PostgreSQL instance proved migrations, health, P256-signed DID creation/resolution/update, invalid-signer rejection, and operation-log validation. Restarting the candidate preserved the DID document and operation log and safely reran migrations. The test containers, temporary database volume, and network were removed after the proof.

Before promotion, a custom-format database dump was saved and its table of contents verified with `pg_restore -l`. Only the PLC application container was recreated through the existing `wtfos-atproto` Compose profile. The production database container and `/mnt/wtf-data/plc-db` mount were preserved.

After promotion, the running process reported `v22.23.4`; local and [public health](https://plc.wtfos.me/_health) returned HTTP 200. The existing public DID `did:plc:qduj4dddevot4vtcdjlbuym5` resolved successfully, with its complete document equal before and after replacement. Final container inspection showed `running=true` and `RestartCount=0`.

## AT Protocol relay

| Evidence | Value |
| --- | --- |
| Running container | `wtf-app-wtfos-atproto-relay-1` |
| Application source, unchanged | `5368f55344e0b5e203ab4d9501e1ddebd9983ad7` |
| Verified live binary toolchain | Go 1.26.10 |
| Verified live binary source status | Exact revision above; `vcs.modified=false` |
| Previous image ID | `sha256:4dff37f05affbc94089ab718d5f4a6650dca12bb872d10687cebdc3671d94e54` |
| Candidate and promoted image ID | `sha256:c85010e668ee9323d4b171391d1181ad4e55ffce706b795424c68d756052ba37` |
| Candidate tag | `wtfos-relay:security-20261022` |
| Preserved rollback tag | `wtfos-relay:pre-security-20261022` |
| Promoted container start | `2026-10-22T19:58:28.14040131Z` |

The relay was rebuilt from its deployed Indigo source revision with Go 1.26.10; its admin UI was rebuilt using Node 22.23.4. An isolated internal network and fresh PostgreSQL instance proved startup/migrations, health, the sync `listHosts` endpoint, the built `/dash` UI, and restart against existing test database/persistence state. The test resources were removed afterward.

Production relay ingestion was stopped while its database and persistence directory were backed up together. Only the relay application container was then recreated. The existing database container and `/mnt/wtf-data/relay-persist` bind mount were retained. All nine previously connected upstreams reconnected. The three registered hosts remained active:

| Host | Accounts before/after | Sequence before | Sequence after |
| --- | --- | --- | --- |
| `pds.wtfos.me` | 47 / 47 | 12184 | 12193 |
| `social.wtfos.me` | 47 / 47 | 2428 | 2428 |
| `users.wtfos.me` | 0 / 0 | 17 | 17 |

Local and [public relay health](https://relay.wtfos.me/xrpc/_health) returned HTTP 200 with `status: ok`; public `listHosts` returned the three active hosts, and `/dash` returned its built HTML. The binary was copied from the **running production container** and inspected using `go version -m`: `go1.26.10`, the exact revision above, and `vcs.modified=false`. Final inspection showed `running=true` and `RestartCount=0`.

## Backups and rebuild inputs

Backups are on the AT host under `/opt/platform/security-backups/2026-10-22/`. Database/archive contents and credentials are not included in this receipt.

| Backup | Bytes | Mode | Verification |
| --- | ---: | --- | --- |
| `plc-before-node22.dump` | 9440 | 0600 | Nonempty custom dump; `pg_restore -l` succeeded |
| `relay-before-go126.dump` | 21584 | 0600 | Nonempty custom dump; `pg_restore -l` succeeded |
| `relay-persist-before-go126.tar.gz` | 3213749 | 0600 | Archive listing succeeded |

The AT deployment directory has no Git checkout. Its previous relay Dockerfile was retained as `Dockerfile.relay.before` in the backup directory. The tested Dockerfiles were installed into `/opt/platform/repos/wtf-app/` and verified byte-for-byte against the committed worktree, so subsequent local rebuilds retain the patched runtime and pinned source:

| File | SHA-256 |
| --- | --- |
| `Dockerfile.relay` | `4a7bdb1685e5c1df7c18a55633a8e055c32678e57649f10be5d7ccb489046227` |
| `Dockerfile.plc` | `342e9718945c313ab1580e26de29bacc5624d62bec8367e6603c441a1be02051` |

Compose files and service environment values were not modified during these promotions. No production DID was created or changed for verification.

## Quality-gate follow-up

Main Quality run [39844356216](https://github.com/Paulwhoisaghostnet/WTF/actions/runs/39844356216), at commit `7167ca37e047118f11032da41798d4baad85a885`, reported 2613 passing tests, one failure, and 18 skips. The sole failure was a static installer-audit test still requiring `1.0.1-alpha.1` after the release advanced to `1.0.1-alpha.2`. The corrected policy compares the audit version with all eight standalone desktop package versions and retains the existing app, tag, digest, and authorization assertions. The original failure was reproduced on Node 22.23.4; the corrected policy passed 8/8. This focused result is separate from the subsequent complete CI rerun.
