# DMS 15 to DMS 16 security migration

The Dockerfile builds the Dovecot 2.4 configuration supplied by DMS 16.0.1 and
updates all installed binary packages from the Dovecot, Brotli, OpenSSL, and CA
certificate source packages together. The September upstream image still has
the vulnerable Dovecot Debian revision. A DMS tag or the `dovecot --version`
string alone cannot prove this fix; inspect `dpkg-query` in the running container.

| Package | Required tested revision | Authority |
| --- | --- | --- |
| Dovecot | `1:2.4.1+dfsg1-6+deb13u7` | [Debian CVE-2026-27852](https://security-tracker.debian.org/tracker/CVE-2026-27852) |
| Brotli | `1.1.0-2+deb13u1` | [Debian CVE-2026-111497](https://security-tracker.debian.org/tracker/CVE-2026-111497) |
| OpenSSL | `3.5.7-1~deb13u3` | [Debian OpenSSL tracker](https://security-tracker.debian.org/tracker/source-package/openssl) |
| CA certificates | `20250419+deb13u1` | [Debian CA tracker](https://security-tracker.debian.org/tracker/source-package/ca-certificates) |

The fixed Dovecot revision is for Debian 13. Debian 12's `deb12u6` does not fix
CVE-2026-27852. The image uses an immutable upstream digest and exact security
package versions, prohibits package removal, and verifies the installed versions
during build. An unavailable pinned package makes the build fail instead of
silently selecting a different revision. The build context contains only the
Dockerfile, never mailbox data, credentials, or certificates.

The shutdown grace period is the upstream DMS 16
[Compose value of one minute](https://github.com/docker-mailserver/docker-mailserver/blob/v16.0.1/compose.yaml),
allowing its supervised daemons to stop before Docker sends a forced kill.

The Resend relay uses port 587 with STARTTLS, matching DMS's
`smtp_tls_wrappermode=no` and `smtp_tls_security_level=encrypt`. Both the previous
and patched images timed out on the former port 465 from this host; both verified
TLS on 587. [Resend documents both modes](https://resend.com/docs/send-with-smtp).
Verify authentication without sending first, preserve the protected `.env`, and
update only `RELAY_PORT` when correcting an existing installation. The production
receipt records the controlled own-mailbox delivery and cleanup separately.

## Existing installation migration

Follow the [DMS 16 release notes](https://github.com/docker-mailserver/docker-mailserver/releases/tag/v16.0.0),
[16.0.1 corrections](https://github.com/docker-mailserver/docker-mailserver/releases/tag/v16.0.1),
and [Dovecot 2.3 to 2.4 guide](https://doc.dovecot.org/2.4.1/installation/upgrade/2.3-to-2.4.html).
Custom Dovecot configuration requires conversion. The existing wtfOS installation
uses DMS-generated configuration, Maildir, IMAP and LMTP, with no custom Dovecot,
LDAP, FTS, or Sieve configuration. Its existing account hashes and Maildir data can
be copied into a new DMS-generated 2.4 setup; do not upgrade the only copy in place.

1. Inventory the actual running image, packages, mounts, account count, queue,
   and mailbox file hashes privately. Build the candidate and record its image
   ID. Keep the old image. Do not print account names, hashes, relay credentials,
   message contents, or private keys in evidence.
2. Back up the complete mail directory (including `.env`, configuration,
   certificates, Compose and provisioner scripts) and all three data/state/log
   volumes with ownership, ACLs and extended attributes. Copy the actual archive
   off-host with restricted permissions and verify its SHA-256. An online copy
   is only a rehearsal snapshot; a final stopped-service copy is still required.
3. Restore a copy into a protected rehearsal directory. Use an internal Docker
   network with no published ports and no outbound relay credentials. Preserve
   the four original accounts and add a controlled probe account only to this
   copy. Pass only deployment environment overrides, allowing the new image's
   own defaults (including `DMS_RELEASE`) to take effect.
4. Run `tests/protocol_probe.py` from a separate client on that internal network.
   Feed its JSON configuration privately on stdin: `host`, controlled `address`,
   `password`, and unique `marker`. Run the `send` phase, then `read` after LMTP
   delivery. It checks verified TLS on ports 25/587/993, unauthenticated relay
   denial, authenticated submission, SMTP-to-LMTP delivery and exact IMAP bodies.
   Restart the candidate and repeat `read`; compare UIDs, UIDVALIDITY and hashes.
   Compare the original mailbox files against the backup, then stop rehearsal.
5. Coordinate the production cutover. Confirm the live SMTP queue is empty,
   stop only `wtfos-mailserver`, and check the stopped queue again. If queued mail
   arrived during stopping, retain the old service and drain it before proceeding.
   Take a fresh cold archive and verify its off-host copy before replacement.
6. Restore the cold archive to **new** named volumes and a **new** configuration
   directory. Set `MAIL_DATA_VOLUME`, `MAIL_STATE_VOLUME`, `MAIL_LOGS_VOLUME`, and
   `MAIL_CONFIG_PATH` in the protected production `.env` to those copies. Preserve
   every existing relay credential and the read-only certificate mount. Install
   the reviewed Dockerfile/Compose/build ignore files, associate the tested image
   with the Compose build name, and start only the mail service. Never run old and
   new instances against the same data or the same public ports.
7. Verify actual package revisions, all daemon/port health, valid public TLS,
   existing account/configuration preservation, authenticated controlled-mailbox
   delivery/read/persistence and the empty SMTP queue. Remove only the temporary
   probe account and its test mail, then verify the original account records.

## Rollback

Keep the old image, original volumes/configuration and the final cold archive.
Before the new server accepts mail, rollback consists of stopping it, restoring
the previous Compose and protected `.env`, and starting the old image against
the original mounts. If the new server has accepted any mail, first stop it and
back up its current data/state/configuration. Reconcile new Maildir messages and
any queued mail before returning to the old service; do not restore an older
snapshot over newly received mail. Retain both copies until reconciliation is
proved. Never prune the original volumes as part of this security change.

Local policy check: `node --test infra/wtfos-mail/tests/security-policy.test.mjs`.
The protocol receipt is the behavior proof; static policy checks alone do not
prove the migration or production deployment.

## October 28 deployment result

WTF-BB-717's patched image is running with the fixed package revisions above.
The isolated migration passed restart persistence with stable message hashes,
UIDs and UIDVALIDITY. Public SMTP, authenticated submission, LMTP delivery,
verified IMAPS reads and unauthenticated relay denial passed. Both temporary
probe accounts and their messages were removed; the four original account
records and all 13 original Maildir files were preserved. The old image,
original volumes/configuration and verified off-host cold archive are retained.
See [the migration receipt](evidence/security-migration-2026-10-28.json).

WTF-BB-723 is **user-deferred**: the user requested that DNS verification remain
pending. The unchanged Resend account initially had no configured domains and
rejected the existing `wtfos.me` sender domain with SMTP 550. Port 587 now
connects, verifies TLS and authenticates successfully. The authorized sending
domain was created with receiving disabled, but its four exact vendor DNS
records have not been published. Apex MX/SPF remain unchanged. No external test
message was accepted, and no successful outbound roundtrip is claimed. The
domain remains `not_started`; [the DNS receipt](evidence/resend-domain-2026-10-28.json)
retains the exact records and the user's deferral.
