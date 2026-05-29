# WTFOS AT Protocol Spine — DNS & TLS Topology (S0.2)

Concrete DNS records and TLS plan for the AT network. Apply the records at the registrar/DNS
provider; the Caddy/service config that consumes them lands in S1.3 / S1.4.

## Hosts → services

| Hostname | Service | Notes |
| --- | --- | --- |
| `wtfos.app` | wtfOS client/desktop shell | Primary/advertised system surface |
| `api.wtfos.app` | AppView XRPC + REST read API | Cross-app + external/federated reads |
| `www.wtfos.app` | redirect → `wtfos.app` | |
| `_lexicon.wtfos.app` (TXT) | Lexicon NSID authority | Added in S1.2 once publishing DID exists |
| `wtfos.me` | apex: did:web + handle resolver landing | `https://wtfos.me/.well-known/did.json` |
| `pds.wtfos.me` | Master PDS (promoted `wtfos-pds`) | canonical records + tracking repos |
| `social/commerce/media/arcade/tezos/ops/os.wtfos.me` | 7 domain PDSes | subdomain repos + echoes |
| `users.wtfos.me` | Users PDS | WTF-hosted `did:plc` repos |
| `private.wtfos.me` | Private PDS | encrypted DMs/rooms; NOT federated |
| `relay.wtfos.me` | Indigo relay | `com.atproto.sync.subscribeRepos` + JSON firehose |
| `plc.wtfos.me` | Self-hosted PLC mirror | dual with public plc.directory |
| `mod.wtfos.me` | Labeler | `com.atproto.label` bans/labels |
| `*.wtfos.me` | user handles (`alice.wtfos.me`) | wildcard → handle resolver / master PDS |

## DNS records to create

`SERVER_IP` = the Hetzner **origin** public IPv4 (from the Hetzner Cloud console — NOT a DNS lookup
of `wtfgameshow.app`, which resolves to Cloudflare proxy IPs). IPv6 (`AAAA`) optional; add later if
IPv6 is enabled on the host.

### `wtfos.me`
```
A    @   SERVER_IP                 TTL 600
A    *   SERVER_IP                 TTL 600
CAA  @   0 issue "letsencrypt.org" TTL 600
```
The `*` wildcard makes every handle (`alice.wtfos.me`) and every infra subdomain resolve to the
host; Caddy issues a per-hostname cert on demand and routes by name. No per-handle records needed
(handles resolve via HTTPS `/.well-known/atproto-did`).

### `wtfos.app`
```
A    @    SERVER_IP                 TTL 600
A    api  SERVER_IP                 TTL 600
A    www  SERVER_IP                 TTL 600
CAA  @    0 issue "letsencrypt.org" TTL 600
```

## Provider notes

- **New domains are on GoDaddy (direct, unproxied)** → records point straight at the Hetzner
  origin. `wtfgameshow.app` is currently behind **Cloudflare proxy** (orange cloud); its public DNS
  shows Cloudflare IPs, which is why the origin IP must come from Hetzner.
- **Do NOT proxy the AT hosts through Cloudflare.** The relay firehose is a long-lived WebSocket and
  the PDS/Caddy do their own on-demand TLS; a proxy that terminates TLS / times out WebSockets
  breaks them. If `wtfos.me` is ever moved to Cloudflare, set all records to **DNS-only (grey
  cloud)**.
- **`.app` is HSTS-preloaded** (Google TLD) → must be served over HTTPS. Caddy handles this.
- **GoDaddy quirks**: replace the pre-created parked `A @` record; remove/overwrite any default
  `CNAME www → @`; CAA is entered as Flags=`0`, Tag=`issue`, Value=`letsencrypt.org`.

## Reserved handle words (cannot be registered as user handles on `wtfos.me`)

```
relay pds plc mod api social commerce media arcade tezos ops os users private www admin
```
Enforced at handle registration (S2.3) and by Caddy known-host-first routing (S1.4).

## TLS plan

- **Automatic certs** for apex, `api`, `www`, and explicit infra subdomains immediately on first
  request (Let's Encrypt via Caddy).
- **On-demand TLS** for the `*.wtfos.me` wildcard, gated by Caddy `on_demand_tls { ask … }` pointing
  at an internal `/internal/tls/allow` endpoint (ported from TZAT `src/routes/semantic.ts`) that
  only permits registered handles + known infra hosts. The wildcard host block must not serve until
  this gate exists (S1.4) to avoid cert-issuance abuse.

## Resolution mechanisms

- **Handle → DID**: HTTP `https://<handle>/.well-known/atproto-did` (primary) + DNS `_atproto`
  TXT (secondary). Wildcard A + Caddy routing covers the HTTP path.
- **did:web**: `https://<host>/.well-known/did.json` served by the app/PDS (S2.2).
- **did:plc**: resolved via public `plc.directory` (authoritative) + `plc.wtfos.me` mirror.
- **Lexicon NSID authority**: `_lexicon.wtfos.app` TXT → publishing DID (added S1.2).

## Apply / verify checklist

1. Get `SERVER_IP` from Hetzner console.
2. Add the `wtfos.me` and `wtfos.app` records above.
3. After propagation, verify:
   - `dig +short wtfos.me` and `dig +short pds.wtfos.me` → `SERVER_IP`
   - `dig +short alice.wtfos.me` → `SERVER_IP` (wildcard)
   - `dig +short api.wtfos.app` → `SERVER_IP`
   - `dig CAA wtfos.me` and `dig CAA wtfos.app` → letsencrypt.org
4. Do not enable the `*.wtfos.me` Caddy host block until the on-demand TLS ask-gate ships (S1.4).
