# October 28 security remediation

**Contract:** correct findings WTF-BB-717 through721, starting with mail and Electron; preserve newer dependency fixes without downgrades; prove mail/database migrations and rebuilt installers; verify the actual installed runtimes; promote through the normal main deployment and verify public production.

**Release status:** candidate source is on `codex/october-security-remediation`; final main deployment and public runtime verification are pending. This document records completed evidence without treating preparation as deployment.

| Finding | Correction | Evidence and activation |
| --- | --- | --- |
| **717: public mail** | DockerMailserver16.0.1 immutable base plus exact Debian Dovecot `1:2.4.1+dfsg1-6+deb13u7`, Brotli `1.1.0-2+deb13u1`, OpenSSL `3.5.7-1~deb13u3` and CA security updates. Retain vendor graceful shutdown and migrate copied volumes/configuration. | Isolated migration, SMTP/LMTP/IMAP body hashes, TLS, submission, relay denial and restart persistence passed. Public migration preserved four accounts and all13 existing message files. [Migration and operational details](../../../infra/wtfos-mail/SECURITY-UPGRADE.md), [machine receipt](../../../infra/wtfos-mail/evidence/security-migration-2026-10-28.json). Final outbound-relay verification is being reconciled below. |
| **720: Electron/Node** | All nine products move to Electron43.8.4 / Node24.22.1 as new `1.0.1-alpha.3` releases. Chromium is150.0.7871.250. | All27 native platform jobs and36 installed-format proofs passed at immutable source `3a8439fb71ee2bd3a3219931eced1011c746cd28`. All nine releases published; an independently downloaded published ZIP passed checksum, clean provenance, assets, runtime and storage-relaunch checks. Production installer activation awaits the main app reload. |
| **718: PostgreSQL** | All three deployed16.14 clusters move to16.15, retaining each host's PostgreSQL major, Alpine line, data mounts and established topology. | Verified physical backups, actual old→new upgrade and new→old rollback on copied clusters, identical table/catalog/sequence summaries, and `pg_amcheck` passed. Main235 tables/10,766,953 rows; PLC5/15; relay5/242 in the rehearsal snapshots. [Activation/rollback plan](evidence/postgres-upgrade/activation-plan.md), [rehearsal](evidence/postgres-upgrade/rehearsal.json). Actual production activation remains pending. |
| **719: separate operator signer** | Source Zod4.3.6→4.6.7; deployed graph receives the same narrow leaf patch. | Live Node22.23.4, Zod4.6.7, unchanged signer bundle and all other dependency versions. Seven-wallet digest, configured keyring, authenticated health and invalid-token rejection remain unchanged; socket0660. Source tests20/20, typecheck/build, isolated actual-bundle protocol checks and old-fails/new-passes constrained-array regression passed. [Live receipt](evidence/dependency-remediation/signer-activation.json). No chain writes. |
| **721: compatible leaves** | Root qs6.16.0→6.16.1; all nine desktop fast-uri3.1.8→3.1.9. | Root and signer production audits and all18 desktop full/production audits return zero findings. Actual Express form parsing/prototype handling and the qs advisory's non-callable conversion case passed. Desktop packaging proof is shared with720. Main qs activation awaits deployment. |

## Preservation and migration boundaries

Root retains body-parser2.4.0, Multer2.5.0, Zod4.6.7, MCP SDK1.32.0, Hono4.13.11, Undici6.29.1/7.30.1/8.12.3 and Vite8.0.8. Desktop retains electron-builder26.15.3, scoped global-agent4.1.3, and the removal of roarr/sprintf-js. The nine desktop dependency graphs change only Electron and fast-uri. No package was downgraded.

The source signer already used Taquito25.0.0, while its deployed graph used24.3.0. Source retains25.0.0. Production retains its existing24.3.0 and the exact existing bundle; this security patch changes only deployed Zod. Rebuilding the entire signer from current source would have silently promoted unrelated unpublished changes. The old installation remains available for rollback, with keys, environment and journals outside the swapped installation directories. [Dependency verification](evidence/dependency-remediation/verification.json).

The PostgreSQL vendor's conditional extension/reindex/logical-plugin steps do not apply: all three inspected clusters contain only plpgsql, no relevant extensions, logical slots/subscriptions, custom preloads/tablespaces or invalid indexes. Main upgrades through the normal deploy script. The AT host receives only the two database image edits in its existing legacy compose topology. Backups are protected on the hosts; database contents and secrets are excluded from repository evidence.

Mail's newer upstream image still needed a full Debian package revision check: Dovecot upstream-version text or the DockerMailserver tag alone did not prove the backport. The cold backup was independently copied off-host and checksum verified before changing production. Original image, configuration and volumes remain available; rollback must preserve any subsequently accepted mail.

## Release-validation repairs

WTF-BB-722 records blockers reproduced while validating this release. Funding fixtures now open the existing game menu before asserting its links, funding controls or their absence. The canonical game shell's landscape action rail starts overflow on its reachable side, and the obsolete sixth resource-grid column is removed. The owning regression retains the real Move to bench click and resulting game state, with geometry assertions that expose overlaps. Only two canonical CSS declarations changed; the generator and vendor manifest were rebuilt from the verified source. [Reproduction and16 passing funding/mobile/iPad stories](evidence/mobile-action-overlay-repair.json).

The updated GitHub runner is Ubuntu26.04, which Playwright1.59.1 could not install browsers for. Playwright's three packages now use1.64.1, which supports that OS; no runner or package downgrade was used. Its obsolete nested fsevents entry is removed by the upstream graph. The matching Chromium156 browser was installed before the successful16-story run. [Official support history](https://github.com/microsoft/playwright/issues/40117), [current supported image](https://playwright.dev/docs/docker).

## Verification still to close

- Final outbound relay proof and temporary-mailbox cleanup after the narrow587 configuration correction.
- Actual main/PLC/relay PostgreSQL16.15, main qs6.16.1 and preserved Node/Go runtimes.
- All nine authenticated production installer manifests and their public asset identities after app reload.
- Green release Quality and normal Hetzner deployment, main pushed, matching public health commit and post-deploy app smoke.

These corrections do not assert a completed compromise investigation, every newly announced Chrome fix, or an automatic update to customer-installed desktops. The [original review](report.md) retains advisory prerequisites and unmatched announcements. Desktop users must install the new alpha.3 release to receive its runtime.
