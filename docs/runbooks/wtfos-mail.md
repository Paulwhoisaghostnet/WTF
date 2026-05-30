# wtfOS compartment mail (`@wtfos.me`)

Self-hosted mail on the **AT / `.me` box** for compartmentalized addresses (bots now, user opt-in later). Inbound arrives directly; outbound uses a **Resend smarthost** for deliverability.

## Topology

| Piece | Host | Notes |
|---|---|---|
| MX / mail host | `mail.wtfos.me` → `5.78.214.209` | AT box, ports 25/587/993 |
| Stack | `docker-mailserver` at `/opt/platform/mail` | IMAP 993, submission 587 |
| Outbound | `smtp.resend.com:465` | Requires `RESEND_API_KEY` in `/opt/platform/mail/.env` |
| PDS password email | same smarthost | `PDS_EMAIL_SMTP_URL=smtps://resend:${RESEND_API_KEY}@smtp.resend.com:465` |

## Provision an address

On the AT box:

```bash
sudo /opt/platform/mail/scripts/provision-address.sh bot-my-service
# → JSON with address, password, IMAP/SMTP endpoints
```

Each address is an isolated mailbox — use for bot signups without linking to a user's primary email.

## Resend setup (required for outbound)

1. Create a free account at [resend.com](https://resend.com).
2. Add domain **`wtfos.me`** in the Resend dashboard and publish **Resend's** DKIM/SPF/MX records at GoDaddy (in **addition** to the self-hosted mail records below — both coexist: Resend for outbound relay signing, self-hosted MX for inbound compartment addresses).
3. Create an API key → set on the AT box in `/opt/platform/mail/.env` (and mirrored in `/opt/platform/repos/wtf-app/.env` as `PDS_EMAIL_SMTP_URL` for PDS password resets):

   ```
   RESEND_API_KEY=re_...
   RELAY_HOST=smtp.resend.com
   RELAY_PORT=465
   RELAY_USER=resend
   ```

4. Restart mail: `cd /opt/platform/mail && docker compose up -d`
5. Wire PDS containers (all 10) with `PDS_EMAIL_SMTP_URL` and `PDS_EMAIL_FROM_ADDRESS=noreply@wtfos.me`, then recreate PDS services.

## Provisioner API (gated)

The wtfOS app exposes gated provisioning endpoints. Mailboxes are created on the `.me` box via a private API (`MAIL_PROVISION_URL`, default `http://10.0.0.3:9120`).

### User compartment mail

Prerequisites (all required):

1. **Linked Tezos wallet** on the wtfOS account
2. **Active identity**: wtfOS handle + DID (`wtfosAtprotoIdentities.status = active`) **or** connected Bluesky/AT account (handle + DID)

Endpoints:

- `GET /api/mail/eligibility` — shows gate status + required steps for guests
- `POST /api/mail/provision` — claims `@wtfos.me` after gates pass; returns IMAP/SMTP credentials once

Guests without wallet + identity receive `403` with `requiredSteps` explaining what to complete first.

### Bot / endstream mail

Prerequisites:

1. Valid **app key** (`Authorization: Bearer wtfapp_…`)
2. App registered in app registry, **enabled**, lifecycle `alpha` or `published`
3. Admin flagged **`manifest.integrations.email.enabled = true`**

Admin toggle:

```http
POST /api/admin/app-registry/registrations/:appId/email-integration
{ "enabled": true }
```

Bot endpoint:

```http
POST /api/mail/bot/provision
Authorization: Bearer wtfapp_…
{ "localPart": "optional-prefix", "botLabel": "my-service" }
```

Returns `{ address, password, imap_host, smtp_host, … }` for the bot to use directly (IMAP read for verification codes).

### Env (app box)

```
MAIL_DOMAIN=wtfos.me
MAIL_PROVISIONING_ENABLED=true
MAIL_PROVISION_URL=http://10.0.0.3:9120
MAIL_PROVISION_SECRET=…
RESEND_API_KEY=…
```

### Env (.me box mail-admin)

```
MAIL_PROVISION_SECRET=…   # must match app box
```

Service: `wtfos-mail-admin` (systemd), binds `10.0.0.3:9120` only.

## Rollback

```bash
cd /opt/platform/mail && docker compose down
# Remove MX/A mail records at GoDaddy (backup in /opt/platform/atproto-dns-backup/)
```
